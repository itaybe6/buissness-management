// Supabase Edge Function: send-fault-email
// Sends a "new fault reported" email to active maintenance users in the business, via Resend.
// Recipients are resolved server-side from fault_id (caller cannot spoof them).
//
// Deploy:
//   supabase functions deploy send-fault-email
//   supabase secrets set RESEND_API_KEY=<resend-api-key>
//   supabase secrets set FAULT_EMAIL_FROM="Business Manager <faults@your-verified-domain.com>"
// (falls back to FORM101_EMAIL_FROM / TASK_EMAIL_FROM, then onboarding@resend.dev)

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
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "unauthorized", detail: userErr?.message }, 401);

    let body: { fault_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const fault_id = body.fault_id;
    if (!fault_id) return json({ error: "missing fault_id" }, 400);

    const admin = createClient(url, serviceKey);
    const resendKey = await resolveResendKey(admin);
    const from =
      Deno.env.get("FAULT_EMAIL_FROM") ??
      Deno.env.get("FORM101_EMAIL_FROM") ??
      Deno.env.get("TASK_EMAIL_FROM") ??
      "onboarding@resend.dev";

    const { data: callerProfile, error: callerErr } = await admin
      .from("profiles")
      .select("role, business_id")
      .eq("id", caller.id)
      .single();
    if (callerErr || !callerProfile) {
      return json({ error: "forbidden", detail: callerErr?.message ?? "no profile" }, 403);
    }
    if (!callerProfile.business_id && callerProfile.role !== "super_admin") {
      return json({ error: "forbidden" }, 403);
    }

    const { data: fault, error: faultErr } = await admin
      .from("faults")
      .select("id, business_id, description, photo_urls, reported_by, created_at, status")
      .eq("id", fault_id)
      .single();
    if (faultErr || !fault) {
      return json({ error: "fault not found", detail: faultErr?.message }, 404);
    }

    if (callerProfile.role !== "super_admin" && fault.business_id !== callerProfile.business_id) {
      return json({ error: "forbidden" }, 403);
    }

    const { data: maintenanceUsers, error: maintErr } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("business_id", fault.business_id)
      .eq("role", "maintenance")
      .eq("active", true)
      .not("email", "is", null);
    if (maintErr) return json({ error: "recipient_lookup_failed", detail: maintErr.message }, 500);

    const recipients = (maintenanceUsers ?? []).filter((p) => p.email?.trim());
    if (recipients.length === 0) return json({ skipped: "no_recipient" });

    let reporterName = "עובד/ת";
    if (fault.reported_by) {
      const { data: reporter } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", fault.reported_by)
        .maybeSingle();
      if (reporter?.full_name) reporterName = reporter.full_name;
    }

    const { data: business } = await admin
      .from("businesses")
      .select("name")
      .eq("id", fault.business_id)
      .single();

    if (!resendKey) {
      return json({ error: "email not configured (RESEND_API_KEY missing)" }, 500);
    }

    const businessName = business?.name ?? "";
    const subject = `תקלה חדשה${businessName ? ` — ${businessName}` : ""}`;
    const html = renderEmail({
      name: recipients[0].full_name ?? "",
      businessName,
      description: String(fault.description ?? ""),
      reporterName,
      createdAt: fault.created_at ? String(fault.created_at) : "",
      photoCount: Array.isArray(fault.photo_urls) ? fault.photo_urls.length : 0,
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
      console.error("resend failed", res.status, detail);
      return json({ error: "resend failed", status: res.status, detail, from, to }, 502);
    }

    return json({ sent: true, to });
  } catch (e) {
    console.error("send-fault-email error", e);
    return json({ error: String(e) }, 500);
  }
});

async function resolveResendKey(admin: ReturnType<typeof createClient>): Promise<string | undefined> {
  const fromEnv = Deno.env.get("RESEND_API_KEY");
  if (fromEnv) return fromEnv;

  // Preferred: security-definer RPC (works even when private schema is not exposed to PostgREST)
  const { data: viaRpc, error: rpcErr } = await admin.rpc("read_runtime_secret", {
    p_key: "RESEND_API_KEY",
  });
  if (!rpcErr && typeof viaRpc === "string" && viaRpc.trim()) return viaRpc;

  const { data, error } = await admin
    .schema("private")
    .from("runtime_secrets")
    .select("value")
    .eq("key", "RESEND_API_KEY")
    .maybeSingle();
  if (error) console.error("runtime_secrets lookup failed", error.message, rpcErr?.message);
  return data?.value ?? undefined;
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    try {
      return new Date(iso).toISOString();
    } catch {
      return iso;
    }
  }
}

function renderEmail(p: {
  name: string;
  businessName: string;
  description: string;
  reporterName: string;
  createdAt: string;
  photoCount: number;
}) {
  const when = formatWhen(p.createdAt);
  const mediaNote =
    p.photoCount > 0
      ? `<div style="margin-top:10px;font-size:13px;color:#777">צורפו ${p.photoCount} קבצי מדיה — ניתן לצפות בהם באפליקציה.</div>`
      : "";

  return `
  <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="margin:0 0 4px">שלום${p.name ? ` ${escapeHtml(p.name)}` : ""},</h2>
    <p style="margin:0 0 16px;color:#555">
      דווחה תקלה חדשה${p.businessName ? ` ב${escapeHtml(p.businessName)}` : ""} שדורשת טיפול.
    </p>
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;background:#fafafa">
      <div style="font-size:16px;font-weight:700;white-space:pre-wrap">${escapeHtml(p.description)}</div>
      <div style="margin-top:10px;font-size:13px;color:#777">
        דווח ע״י: ${escapeHtml(p.reporterName)} · ${when}
      </div>
      ${mediaNote}
    </div>
    <p style="margin:16px 0 0;color:#999;font-size:12px">הודעה אוטומטית ממערכת ניהול העסק · היכנסו לעמוד התקלות לטיפול.</p>
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
