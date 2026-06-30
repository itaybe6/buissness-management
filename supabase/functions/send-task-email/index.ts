// Supabase Edge Function: send-task-email
// Sends a "new task assigned" email to a task's assignee, via Resend.
// The recipient is resolved server-side from task_id (caller cannot spoof it).
// A mail is sent only when the task has an assignee with an email and the task
// is not waiting for manager approval (approval_status <> 'pending').
//
// Deploy:
//   supabase functions deploy send-task-email
//   supabase secrets set RESEND_API_KEY=<resend-api-key>
//   supabase secrets set TASK_EMAIL_FROM="Business Manager <tasks@your-verified-domain.com>"
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are provided automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MANAGER_ROLES = ["manager", "shift_manager"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("TASK_EMAIL_FROM") ?? "onboarding@resend.dev";

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);

    // Identify the caller from their JWT
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser(token);
    const caller = userData?.user;
    if (!caller) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role, business_id")
      .eq("id", caller.id)
      .single();
    if (!callerProfile || !MANAGER_ROLES.includes(callerProfile.role)) {
      return json({ error: "forbidden" }, 403);
    }

    const { task_id } = await req.json();
    if (!task_id) return json({ error: "missing task_id" }, 400);

    const { data: task } = await admin
      .from("tasks")
      .select("id, business_id, title, description, type, due_date, assigned_to, approval_status")
      .eq("id", task_id)
      .single();
    if (!task) return json({ error: "task not found" }, 404);

    // Tenant guard: caller may only notify within their own business
    if (callerProfile.role !== "super_admin" && task.business_id !== callerProfile.business_id) {
      return json({ error: "forbidden" }, 403);
    }

    // Tasks waiting for manager approval have not "reached" the worker yet
    if (task.approval_status === "pending") return json({ skipped: "pending_approval" });
    if (!task.assigned_to) return json({ skipped: "no_assignee" });

    const { data: assignee } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", task.assigned_to)
      .single();
    if (!assignee?.email) return json({ skipped: "no_email" });

    const { data: business } = await admin
      .from("businesses")
      .select("name")
      .eq("id", task.business_id)
      .single();

    if (!resendKey) return json({ error: "email not configured (RESEND_API_KEY missing)" }, 500);

    const subject = `משימה חדשה: ${task.title}`;
    const html = renderEmail({
      name: assignee.full_name ?? "",
      businessName: business?.name ?? "",
      title: task.title,
      description: task.description,
      dueDate: task.due_date,
      recurring: task.type === "recurring",
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [assignee.email], subject, html }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "resend failed", detail }, 502);
    }
    return json({ sent: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function renderEmail(p: {
  name: string;
  businessName: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  recurring: boolean;
}) {
  const due = p.dueDate ? new Date(p.dueDate).toLocaleDateString("he-IL") : null;
  return `
  <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="margin:0 0 4px">שלום ${escapeHtml(p.name)},</h2>
    <p style="margin:0 0 16px;color:#555">שויכה אליך משימה חדשה${p.businessName ? ` ב${escapeHtml(p.businessName)}` : ""}.</p>
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;background:#fafafa">
      <div style="font-size:16px;font-weight:700">${escapeHtml(p.title)}</div>
      ${p.description ? `<div style="margin-top:6px;color:#444">${escapeHtml(p.description)}</div>` : ""}
      <div style="margin-top:10px;font-size:13px;color:#777">
        ${p.recurring ? "משימה קבועה" : "משימה חד-פעמית"}${due ? ` · תאריך יעד: ${due}` : ""}
      </div>
    </div>
    <p style="margin:16px 0 0;color:#999;font-size:12px">הודעה אוטומטית ממערכת ניהול העסק.</p>
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
