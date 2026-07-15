// Supabase Edge Function: send-form101-email
// Sends Form 101 submission details to the office manager(s) via Resend.
// Called by the employee after submitting their form (best-effort from the client).
//
// Deploy:
//   supabase functions deploy send-form101-email
//   supabase secrets set RESEND_API_KEY=<resend-api-key>
//   (or insert into private.runtime_secrets — service_role only)
//   supabase secrets set FORM101_EMAIL_FROM="Business Manager <onboarding@resend.dev>"
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are provided automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FIELD_LABELS: Record<string, string> = {
  id_number: "תעודת זהות",
  address: "כתובת",
  city: "עיר",
  phone: "טלפון",
  marital_status: "מצב משפחתי",
  children: "מספר ילדים",
  bank_account: "חשבון בנק",
  notes: "הערות",
};

const MARITAL_LABELS: Record<string, string> = {
  single: "רווק/ה",
  married: "נשוי/אה",
  divorced: "גרוש/ה",
  widowed: "אלמן/ה",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser(token);
    const caller = userData?.user;
    if (!caller) return json({ error: "unauthorized" }, 401);

    const { employee_id, tax_year } = await req.json();
    if (!employee_id || !tax_year) return json({ error: "missing employee_id or tax_year" }, 400);

    // Only the employee may trigger notification for their own form
    if (caller.id !== employee_id) return json({ error: "forbidden" }, 403);

    const admin = createClient(url, serviceKey);
    const resendKey = await resolveResendKey(admin);
    const from =
      Deno.env.get("FORM101_EMAIL_FROM") ??
      Deno.env.get("TASK_EMAIL_FROM") ??
      "onboarding@resend.dev";

    const { data: form } = await admin
      .from("form_101")
      .select("id, business_id, employee_id, tax_year, data, submitted, submitted_at, email_notified_at")
      .eq("employee_id", employee_id)
      .eq("tax_year", tax_year)
      .maybeSingle();

    if (!form) return json({ error: "form not found" }, 404);
    if (!form.submitted) return json({ skipped: "not_submitted" });
    if (form.email_notified_at) return json({ skipped: "already_notified" });

    const { data: employee } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", employee_id)
      .single();

    const { data: officeManagers } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("business_id", form.business_id)
      .eq("role", "office_manager")
      .eq("active", true)
      .not("email", "is", null);

    let recipients = (officeManagers ?? []).filter((p) => p.email?.trim());
    if (recipients.length === 0) {
      const { data: managers } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("business_id", form.business_id)
        .eq("role", "manager")
        .eq("active", true)
        .not("email", "is", null);
      recipients = (managers ?? []).filter((p) => p.email?.trim());
    }

    if (recipients.length === 0) return json({ skipped: "no_recipient" });

    const { data: business } = await admin
      .from("businesses")
      .select("name")
      .eq("id", form.business_id)
      .single();

    if (!resendKey) return json({ error: "email not configured (RESEND_API_KEY missing)" }, 500);

    const employeeName = employee?.full_name ?? "עובד/ת";
    const businessName = business?.name ?? "";
    const subject = `טופס 101 הוגש — ${employeeName} · ${tax_year}`;
    const html = renderEmail({
      managerName: recipients[0].full_name ?? "",
      employeeName,
      businessName,
      taxYear: tax_year,
      submittedAt: form.submitted_at,
      data: (form.data ?? {}) as Record<string, unknown>,
    });

    const to = recipients.map((r) => r.email!);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "resend failed", detail }, 502);
    }

    await admin
      .from("form_101")
      .update({ email_notified_at: new Date().toISOString() })
      .eq("id", form.id);

    return json({ sent: true, to });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function resolveResendKey(admin: ReturnType<typeof createClient>): Promise<string | undefined> {
  const fromEnv = Deno.env.get("RESEND_API_KEY");
  if (fromEnv) return fromEnv;
  const { data } = await admin
    .schema("private")
    .from("runtime_secrets")
    .select("value")
    .eq("key", "RESEND_API_KEY")
    .maybeSingle();
  return data?.value ?? undefined;
}

function formatFieldValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (key === "marital_status" && typeof value === "string") {
    return MARITAL_LABELS[value] ?? value;
  }
  return String(value);
}

function renderEmail(p: {
  managerName: string;
  employeeName: string;
  businessName: string;
  taxYear: number;
  submittedAt: string | null;
  data: Record<string, unknown>;
}) {
  const submitted = p.submittedAt
    ? new Date(p.submittedAt).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  const rows = Object.entries(FIELD_LABELS)
    .map(([key, label]) => {
      const val = formatFieldValue(key, p.data[key]);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:#555;white-space:nowrap">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#1a1a1a">${escapeHtml(val)}</td>
      </tr>`;
    })
    .join("");

  return `
  <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="margin:0 0 4px">שלום${p.managerName ? ` ${escapeHtml(p.managerName)}` : ""},</h2>
    <p style="margin:0 0 16px;color:#555">
      ${escapeHtml(p.employeeName)} הגיש/ה טופס 101 לשנת המס ${p.taxYear}${p.businessName ? ` ב${escapeHtml(p.businessName)}` : ""}.
    </p>
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;background:#fafafa;margin-bottom:16px">
      <div style="font-size:14px;color:#777;margin-bottom:8px">תאריך הגשה: ${submitted}</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="margin:0;color:#999;font-size:12px">הודעה אוטומטית ממערכת ניהול העסק · ניתן לצפות בטופס בעמוד מסמכי עובדים.</p>
  </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
