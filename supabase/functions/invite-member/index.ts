/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, json } from "../_shared/cors.ts";
import { limit } from "../_shared/rate.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(supabaseUrl, service);

  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: "unauthorized" }, 401);

  const allowed = await limit(admin, `invite:${userData.user.id}`, 20, 3600);
  if (!allowed) return json({ error: "rate_limited" }, 429);

  const body = await req.json().catch(() => null);
  const organizationId = body?.organizationId as string | undefined;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const fullName = String(body?.full_name ?? "").trim();
  const role = body?.role as string | undefined;

  if (!organizationId || !email || !fullName || !role) {
    return json({ error: "invalid_body" }, 400);
  }
  if (role === "owner") return json({ error: "cannot_invite_owner" }, 403);

  const { data: membership } = await admin
    .from("memberships")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return json({ error: "forbidden" }, 403);
  }
  if (membership.role === "admin" && role === "owner") {
    return json({ error: "forbidden" }, 403);
  }

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });
  if (inviteErr && !inviteErr.message.toLowerCase().includes("already")) {
    return json({ error: "invite_failed", detail: inviteErr.message }, 400);
  }

  let userId = invited?.user?.id;
  if (!userId) {
    // If user already registered, retrieve user without scanning entire auth table
    const linkRes = await admin.auth.admin.generateLink({ type: "magiclink", email });
    userId = linkRes.data?.user?.id;
    if (!userId) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
      userId = list?.users?.find((u: { id?: string; email?: string }) => u.email?.toLowerCase() === email)?.id;
    }
  }
  if (!userId) return json({ error: "user_not_found" }, 400);

  const { error: memErr } = await admin.from("memberships").upsert({
    organization_id: organizationId,
    user_id: userId,
    role,
    status: "invited",
    invited_by: userData.user.id,
  }, { onConflict: "organization_id,user_id" });
  if (memErr) return json({ error: memErr.message }, 400);

  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: userData.user.id,
    action: "member.invited",
    entity_table: "memberships",
    entity_id: userId,
    metadata: { email, role },
  });

  return json({ ok: true, userId });
});
