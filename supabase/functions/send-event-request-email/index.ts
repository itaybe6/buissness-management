// Supabase Edge Function: send-event-request-email
// Emails the business managers when the event manager opens a request
// (staffing / supplies) for an event, via Resend.
// Recipients are resolved server-side from request_id (caller cannot spoof them).
//
// Deploy:
//   supabase functions deploy send-event-request-email
//   supabase secrets set RESEND_API_KEY=<resend-api-key>
//   supabase secrets set EVENT_EMAIL_FROM="Business Manager <events@your-verified-domain.com>"
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are provided automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Who may trigger the mail. */
const CALLER_ROLES = ["manager", "event_manager", "super_admin"];
/** Who receives it. */
const RECIPIENT_ROLES = ["manager"];

type StaffingLine = { department_id: string | null; label: string; count: number };
type SupplyLine = { item_id: string | null; name: string; quantity: number; unit: string | null };

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

    let body: { request_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const request_id = body.request_id;
    if (!request_id) return json({ error: "missing request_id" }, 400);

    const admin = createClient(url, serviceKey);
    const resendKey = await resolveResendKey(admin);
    const from =
      Deno.env.get("EVENT_EMAIL_FROM") ??
      Deno.env.get("TASK_EMAIL_FROM") ??
      Deno.env.get("FAULT_EMAIL_FROM") ??
      "onboarding@resend.dev";

    const { data: callerProfile, error: callerErr } = await admin
      .from("profiles")
      .select("role, business_id")
      .eq("id", caller.id)
      .single();
    if (callerErr || !callerProfile || !CALLER_ROLES.includes(callerProfile.role)) {
      return json({ error: "forbidden" }, 403);
    }

    const { data: request, error: reqErr } = await admin
      .from("event_requests")
      .select("id, business_id, event_id, requested_by, kind, shift_label, note, lines, created_at")
      .eq("id", request_id)
      .single();
    if (reqErr || !request) return json({ error: "request not found", detail: reqErr?.message }, 404);

    // Tenant guard: caller may only notify within their own business
    if (callerProfile.role !== "super_admin" && request.business_id !== callerProfile.business_id) {
      return json({ error: "forbidden" }, 403);
    }

    const { data: managers, error: mgrErr } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("business_id", request.business_id)
      .in("role", RECIPIENT_ROLES)
      .eq("active", true)
      .not("email", "is", null);
    if (mgrErr) return json({ error: "recipient_lookup_failed", detail: mgrErr.message }, 500);

    const recipients = (managers ?? []).filter((p) => p.email?.trim());
    if (recipients.length === 0) return json({ skipped: "no_recipient" });

    const [{ data: event }, { data: requester }, { data: business }] = await Promise.all([
      admin.from("events").select("title, event_date").eq("id", request.event_id).maybeSingle(),
      request.requested_by
        ? admin.from("profiles").select("full_name").eq("id", request.requested_by).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("businesses").select("name").eq("id", request.business_id).single(),
    ]);

    if (!resendKey) return json({ error: "email not configured (RESEND_API_KEY missing)" }, 500);

    const kindLabel = request.kind === "staffing" ? "בקשת שיבוץ עובדים" : "רשימת מצרכים";
    const eventTitle = event?.title ?? "אירוע";
    const subject = `${kindLabel} — ${eventTitle}`;
    const html = renderEmail({
      businessName: business?.name ?? "",
      kind: request.kind,
      kindLabel,
      eventTitle,
      eventDate: event?.event_date ?? null,
      requesterName: requester?.full_name ?? "מנהלת האירועים",
      shiftLabel: request.shift_label,
      note: request.note,
      lines: Array.isArray(request.lines) ? request.lines : [],
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
      return json({ error: "resend failed", status: res.status, detail }, 502);
    }

    return json({ sent: true, to });
  } catch (e) {
    console.error("send-event-request-email error", e);
    return json({ error: String(e) }, 500);
  }
});

async function resolveResendKey(admin: ReturnType<typeof createClient>): Promise<string | undefined> {
  const fromEnv = Deno.env.get("RESEND_API_KEY");
  if (fromEnv) return fromEnv;

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

function formatEventDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

function renderEmail(p: {
  businessName: string;
  kind: string;
  kindLabel: string;
  eventTitle: string;
  eventDate: string | null;
  requesterName: string;
  shiftLabel: string | null;
  note: string | null;
  lines: unknown[];
}) {
  const when = formatEventDate(p.eventDate);
  const rows =
    p.kind === "staffing"
      ? (p.lines as StaffingLine[]).map(
          (l) => `<li><b>${l.count}</b> × ${escapeHtml(l.label ?? "")}</li>`,
        )
      : (p.lines as SupplyLine[]).map(
          (l) =>
            `<li><b>${l.quantity}</b> × ${escapeHtml(l.name ?? "")}${
              l.unit ? ` <span style="color:#777">(${escapeHtml(l.unit)})</span>` : ""
            }</li>`,
        );

  return `
  <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="margin:0 0 4px">${escapeHtml(p.kindLabel)}</h2>
    <p style="margin:0 0 16px;color:#555">
      ${escapeHtml(p.requesterName)} שלחה בקשה לאירוע${p.businessName ? ` ב${escapeHtml(p.businessName)}` : ""}.
    </p>
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;background:#fafafa">
      <div style="font-size:16px;font-weight:700">${escapeHtml(p.eventTitle)}</div>
      ${when ? `<div style="margin-top:4px;font-size:13px;color:#777">${escapeHtml(when)}</div>` : ""}
      ${
        p.shiftLabel
          ? `<div style="margin-top:10px;font-size:14px"><b>משמרת:</b> ${escapeHtml(p.shiftLabel)}</div>`
          : ""
      }
      <ul style="margin:12px 0 0;padding-inline-start:18px;font-size:15px;line-height:1.7">${rows.join("")}</ul>
      ${
        p.note
          ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee;color:#444;white-space:pre-wrap">${escapeHtml(p.note)}</div>`
          : ""
      }
    </div>
    <p style="margin:16px 0 0;color:#999;font-size:12px">הודעה אוטומטית ממערכת ניהול העסק · היכנסו לאירועים ← בקשות לטיפול.</p>
  </div>`;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
