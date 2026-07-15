// Supabase Edge Function: send-form101-email
// Sends a signed Form 101 PDF notification to office manager(s) via Resend.
// Called by the employee after signing their Form 101 agreement (best-effort from client).
//
// Deploy:
//   supabase functions deploy send-form101-email
//   supabase secrets set RESEND_API_KEY=<resend-api-key>
//   (or insert into private.runtime_secrets — service_role only)
//   supabase secrets set FORM101_EMAIL_FROM="Business Manager <onboarding@resend.dev>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    const { agreement_id, employee_id } = await req.json();
    if (!agreement_id || !employee_id) {
      return json({ error: "missing agreement_id or employee_id" }, 400);
    }

    if (caller.id !== employee_id) return json({ error: "forbidden" }, 403);

    const admin = createClient(url, serviceKey);
    const resendKey = await resolveResendKey(admin);
    const from =
      Deno.env.get("FORM101_EMAIL_FROM") ??
      Deno.env.get("TASK_EMAIL_FROM") ??
      "onboarding@resend.dev";

    const { data: agreement } = await admin
      .from("agreement_templates")
      .select("id, business_id, title, type, employee_id")
      .eq("id", agreement_id)
      .single();

    if (!agreement) return json({ error: "agreement not found" }, 404);
    if (agreement.type !== "form_101") return json({ error: "not_form_101" }, 400);
    if (agreement.employee_id !== employee_id) return json({ error: "forbidden" }, 403);

    const { data: sig } = await admin
      .from("agreement_signatures")
      .select("id, agreed, signed_at, signed_file_url, email_notified_at")
      .eq("agreement_id", agreement_id)
      .eq("employee_id", employee_id)
      .maybeSingle();

    if (!sig) return json({ error: "signature not found" }, 404);
    if (!sig.agreed) return json({ skipped: "not_signed" });
    if (sig.email_notified_at) return json({ skipped: "already_notified" });

    const { data: employee } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", employee_id)
      .single();

    const { data: officeManagers } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("business_id", agreement.business_id)
      .eq("role", "office_manager")
      .eq("active", true)
      .not("email", "is", null);

    let recipients = (officeManagers ?? []).filter((p) => p.email?.trim());
    if (recipients.length === 0) {
      const { data: managers } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("business_id", agreement.business_id)
        .eq("role", "manager")
        .eq("active", true)
        .not("email", "is", null);
      recipients = (managers ?? []).filter((p) => p.email?.trim());
    }

    if (recipients.length === 0) return json({ skipped: "no_recipient" });

    const { data: business } = await admin
      .from("businesses")
      .select("name")
      .eq("id", agreement.business_id)
      .single();

    if (!resendKey) return json({ error: "email not configured (RESEND_API_KEY missing)" }, 500);

    const employeeName = employee?.full_name ?? "עובד/ת";
    const businessName = business?.name ?? "";
    const subject = `טופס 101 נחתם — ${employeeName}`;
    const html = renderEmail({
      managerName: recipients[0].full_name ?? "",
      employeeName,
      businessName,
      formTitle: agreement.title,
      signedAt: sig.signed_at,
      signedFileUrl: sig.signed_file_url,
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
      .from("agreement_signatures")
      .update({ email_notified_at: new Date().toISOString() })
      .eq("id", sig.id);

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

function renderEmail(p: {
  managerName: string;
  employeeName: string;
  businessName: string;
  formTitle: string;
  signedAt: string | null;
  signedFileUrl: string | null;
}) {
  const signed = p.signedAt
    ? new Date(p.signedAt).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  const download = p.signedFileUrl
    ? `<p style="margin:16px 0 0"><a href="${escapeHtml(p.signedFileUrl)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">צפייה בטופס החתום (PDF)</a></p>`
    : "";

  return `
  <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="margin:0 0 4px">שלום${p.managerName ? ` ${escapeHtml(p.managerName)}` : ""},</h2>
    <p style="margin:0 0 16px;color:#555">
      ${escapeHtml(p.employeeName)} חתם/ה על ${escapeHtml(p.formTitle)}${p.businessName ? ` ב${escapeHtml(p.businessName)}` : ""}.
    </p>
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;background:#fafafa">
      <div style="font-size:14px;color:#777">תאריך חתימה: ${signed}</div>
      ${download}
    </div>
    <p style="margin:16px 0 0;color:#999;font-size:12px">הודעה אוטומטית ממערכת ניהול העסק · ניתן לצפות בטופס גם בעמוד מסמכי עובדים.</p>
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
