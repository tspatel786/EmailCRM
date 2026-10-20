/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, json } from "../_shared/cors.ts";
import { limit } from "../_shared/rate.ts";

function personalize(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(name|company|service|email|phone|city)\s*\}\}/gi, (_m, k) => vars[k.toLowerCase()] ?? "");
}

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

  const allowed = await limit(admin, `queue:${userData.user.id}`, 15, 3600);
  if (!allowed) return json({ error: "rate_limited" }, 429);

  const body = await req.json().catch(() => null);
  const campaignId = body?.campaignId as string | undefined;
  const confirmed = Boolean(body?.confirmed);
  if (!campaignId || !confirmed) return json({ error: "confirmation_required" }, 400);

  const { data: campaign, error: cErr } = await admin.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (cErr || !campaign) return json({ error: "campaign_not_found" }, 404);

  const { data: membership } = await admin
    .from("memberships")
    .select("role, status")
    .eq("organization_id", campaign.organization_id)
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership || !["owner", "admin", "sales_manager"].includes(membership.role)) {
    return json({ error: "forbidden" }, 403);
  }

  if (!["draft", "scheduled", "paused"].includes(campaign.status)) {
    return json({ error: "invalid_status", status: campaign.status }, 400);
  }

  let contactQuery = admin
    .from("contacts")
    .select("id, full_name, company_name, primary_email, service_interest, primary_phone, city, consent_status, archived_at")
    .eq("organization_id", campaign.organization_id)
    .is("archived_at", null)
    .not("primary_email", "is", null);

  if (campaign.list_id) {
    const { data: members } = await admin
      .from("contact_list_members")
      .select("contact_id")
      .eq("list_id", campaign.list_id);
    const ids = (members ?? []).map((m) => m.contact_id);
    if (ids.length === 0) return json({ error: "empty_list" }, 400);
    contactQuery = contactQuery.in("id", ids);
  }

  const { data: contacts } = await contactQuery;
  const { data: suppressions } = await admin
    .from("suppressions")
    .select("email")
    .eq("organization_id", campaign.organization_id);
  const suppressed = new Set((suppressions ?? []).map((s) => s.email.toLowerCase()));

  const eligible = (contacts ?? []).filter((c) => {
    const email = c.primary_email?.trim().toLowerCase();
    if (!email) return false;
    if (c.archived_at) return false;
    if (suppressed.has(email)) return false;
    if (campaign.requires_consent && c.consent_status !== "granted") return false;
    return true;
  });

  const skippedUnknown = (contacts ?? []).length - eligible.length;

  const jobs = eligible.map((c) => {
    const vars = {
      name: c.full_name ?? "",
      company: c.company_name ?? "",
      service: c.service_interest ?? "",
      email: c.primary_email ?? "",
      phone: c.primary_phone ?? "",
      city: c.city ?? "",
    };
    return {
      organization_id: campaign.organization_id,
      campaign_id: campaign.id,
      contact_id: c.id,
      to_email: c.primary_email,
      subject: personalize(campaign.subject, vars),
      body_text: personalize(campaign.body_text, vars),
      body_html: personalize(campaign.body_html ?? "", vars),
      status: "queued",
      scheduled_at: campaign.scheduled_at ?? new Date().toISOString(),
      next_attempt_at: campaign.scheduled_at ?? new Date().toISOString(),
      idempotency_key: `${campaign.id}:${c.id}`,
    };
  });

  if (jobs.length) {
    const { error: jobErr } = await admin.from("email_jobs").upsert(jobs, {
      onConflict: "idempotency_key",
      ignoreDuplicates: true,
    });
    if (jobErr) return json({ error: jobErr.message }, 400);
  }

  const scheduled = campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date();
  await admin
    .from("campaigns")
    .update({
      status: scheduled ? "scheduled" : "queued",
      recipient_count: jobs.length,
      queued_count: jobs.length,
    })
    .eq("id", campaignId);

  await admin.from("email_events").insert({
    organization_id: campaign.organization_id,
    campaign_id: campaign.id,
    event_type: "queued",
    detail: `${jobs.length} jobs queued, ${skippedUnknown} skipped (consent/suppression/duplicates)`,
  });

  await admin.from("audit_logs").insert({
    organization_id: campaign.organization_id,
    actor_user_id: userData.user.id,
    action: "campaign.queued",
    entity_table: "campaigns",
    entity_id: campaign.id,
    metadata: { jobs: jobs.length, skipped: skippedUnknown },
  });

  return json({ ok: true, queued: jobs.length, skipped: skippedUnknown, scheduled });
});
