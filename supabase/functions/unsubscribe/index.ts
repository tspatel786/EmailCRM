/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? (await req.json().catch(() => ({}))).token;
  if (!token) return json({ error: "missing_token" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: job } = await admin
    .from("email_jobs")
    .select("id, organization_id, contact_id, to_email, campaign_id")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (!job) return json({ error: "invalid_token" }, 404);

  const { error: supErr } = await admin.from("suppressions").insert({
    organization_id: job.organization_id,
    email: job.to_email.toLowerCase(),
    contact_id: job.contact_id,
    reason: "unsubscribe",
    source: "link",
  });
  if (supErr && !supErr.message.toLowerCase().includes("duplicate")) {
    return json({ error: supErr.message }, 400);
  }

  await admin
    .from("contacts")
    .update({ consent_status: "withdrawn", email_opt_in: false })
    .eq("id", job.contact_id);

  await admin.from("email_events").insert({
    organization_id: job.organization_id,
    campaign_id: job.campaign_id,
    job_id: job.id,
    contact_id: job.contact_id,
    event_type: "unsubscribed",
  });

  return json({ ok: true, message: "You have been unsubscribed from marketing emails." });
});
