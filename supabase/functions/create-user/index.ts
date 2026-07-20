// Supabase Edge Function: create-user
// Securely creates an Auth user (the DB trigger creates the matching profile).
// Authorization:
//   - super_admin: may create users in any business, any role
//   - manager / office_manager: may create users only in their own business, and not super_admin
//
// Deploy:
//   supabase functions deploy create-user
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
// (SUPABASE_URL is provided automatically.)

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

    if (!callerProfile) return json({ error: "no profile" }, 403);

    const DEFAULT_HOURLY_RATE = 35.4;

    const body = await req.json();
    const { email, password, full_name, role, department_id, phone, wage_type, pension_active } = body;
    const hourly_rate =
      body.hourly_rate != null && body.hourly_rate !== "" ? Number(body.hourly_rate) : DEFAULT_HOURLY_RATE;
    let business_id = body.business_id as string | null;

    if (!email || !password || !role) return json({ error: "missing fields" }, 400);

    if (callerProfile.role === "super_admin") {
      // can target any business
    } else if (callerProfile.role === "manager" || callerProfile.role === "office_manager") {
      business_id = callerProfile.business_id; // force own business
      if (role === "super_admin") return json({ error: "forbidden role" }, 403);
    } else {
      return json({ error: "forbidden" }, 403);
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role, business_id, department_id, phone, hourly_rate, wage_type, pension_active: pension_active ?? false },
    });

    if (error) return json({ error: error.message }, 400);
    return json({ user: created.user });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
