/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, json } from "../_shared/cors.ts";

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

  const { data: existing } = await admin
    .from("memberships")
    .select("id")
    .eq("user_id", userData.user.id)
    .limit(1);
  if (existing && existing.length > 0) {
    return json({ error: "already_member" }, 400);
  }

  const bootstrapSecret = Deno.env.get("BOOTSTRAP_SECRET");
  const body = await req.json().catch(() => ({}));
  if (!bootstrapSecret || body.secret !== bootstrapSecret) {
    return json({ error: "bootstrap_disabled" }, 403);
  }

  const name = String(body.name ?? "Organization").slice(0, 200);
  const slug = String(body.slug ?? "org")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 60);

  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name, slug })
    .select()
    .single();
  if (error) return json({ error: error.message }, 400);

  await admin.from("memberships").insert({
    organization_id: org.id,
    user_id: userData.user.id,
    role: "owner",
    status: "active",
    accepted_at: new Date().toISOString(),
  });

  await admin.from("audit_logs").insert({
    organization_id: org.id,
    actor_user_id: userData.user.id,
    action: "organization.bootstrapped",
    entity_table: "organizations",
    entity_id: org.id,
    metadata: { slug },
  });

  return json({ ok: true, organization: org });
});
