// Supabase Edge Function: delete-user
// Deletes an Auth user and all related employee data.
// Authorization:
//   - super_admin: may delete any user (except self)
//   - manager / office_manager: may delete users only in their own business (except self)
//
// Deploy:
//   supabase functions deploy delete-user

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

    const admin = createClient(url, serviceKey);
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role, business_id")
      .eq("id", caller.id)
      .single();

    if (!callerProfile) return json({ error: "no profile" }, 403);

    const body = await req.json();
    const userId = body.user_id as string | undefined;
    if (!userId) return json({ error: "missing user_id" }, 400);
    if (userId === caller.id) return json({ error: "cannot delete self" }, 400);

    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id, role, business_id, full_name")
      .eq("id", userId)
      .single();

    if (!targetProfile) return json({ error: "user not found" }, 404);

    if (callerProfile.role === "super_admin") {
      // allowed
    } else if (callerProfile.role === "manager" || callerProfile.role === "office_manager") {
      if (targetProfile.business_id !== callerProfile.business_id) {
        return json({ error: "forbidden" }, 403);
      }
      if (targetProfile.role === "super_admin") {
        return json({ error: "forbidden role" }, 403);
      }
    } else {
      return json({ error: "forbidden" }, 403);
    }

    const { error: prepError } = await admin.rpc("prep_delete_profile", { p_user_id: userId });
    if (prepError) return json({ error: prepError.message }, 400);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) return json({ error: deleteError.message }, 400);

    return json({ ok: true, deleted: userId });
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
