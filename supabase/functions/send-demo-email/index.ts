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

  const allowed = await limit(admin, `demo-mail:${userData.user.id}`, 30, 3600);
  if (!allowed) return json({ error: "rate_limited" }, 429);

  const body = await req.json().catch(() => null);
  const organizationId = body?.organization_id as string | undefined;
  const recipientEmail = String(body?.recipient_email ?? "").trim().toLowerCase();
  const subject = String(body?.subject ?? "").trim();
  const bodyText = String(body?.body_text ?? "").trim();
  const bodyHtml = String(body?.body_html ?? "").trim();
  const templateId = body?.template_id as string | undefined;

  if (!organizationId || !recipientEmail || !subject) {
    return json({ error: "missing_required_fields" }, 400);
  }

  const { data, error } = await admin
    .from("demo_email_requests")
    .insert({
      organization_id: organizationId,
      template_id: templateId || null,
      requested_by: userData.user.id,
      recipient_email: recipientEmail,
      subject,
      body_text: bodyText,
      body_html: bodyHtml,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ success: true, request_id: data.id });
});
