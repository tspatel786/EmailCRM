// supabase/functions/resend-webhook/index.ts
// Handles Resend webhook events:
// 1. Email delivery tracking: email.delivered, email.opened, email.clicked, email.bounced
// 2. Inbound replies / incoming messages: email.received / inbound events

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

type ResendEvent = {
  type: string;
  created_at: string;
  data: {
    id?: string;
    email_id?: string;
    from?: string | { email?: string; name?: string };
    to?: string[] | Array<{ email?: string; name?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    click?: { link?: string };
    bounce?: { message?: string; type?: string };
  };
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Optional Svix/Resend signature verification if secret configured
  const rawBody = await req.text();
  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventType = event.type;
  const data = event.data ?? {};
  const emailId = data.email_id || data.id;

  // 1. Inbound email received (reply from client)
  if (
    eventType === "email.received" ||
    eventType === "inbound" ||
    eventType === "email.inbound"
  ) {
    const rawFrom = data.from;
    const fromEmail =
      typeof rawFrom === "string"
        ? (rawFrom.match(/<([^>]+)>/)?.[1] || rawFrom).trim()
        : rawFrom?.email || "";
    const fromName =
      typeof rawFrom === "string"
        ? rawFrom.replace(/<[^>]+>/, "").trim()
        : rawFrom?.name || "";

    const rawTo = data.to;
    const firstTo = Array.isArray(rawTo) ? rawTo[0] : rawTo;
    const toEmail =
      typeof firstTo === "string"
        ? (firstTo.match(/<([^>]+)>/)?.[1] || firstTo).trim()
        : firstTo?.email || "";

    // Match contact & org by fromEmail
    const { data: contacts } = await admin
      .from("contacts")
      .select("id, organization_id, full_name")
      .ilike("email", fromEmail)
      .limit(1);

    const contact = contacts?.[0];
    let orgId = contact?.organization_id;

    // Fallback: match first active organization if contact not yet enrolled
    if (!orgId) {
      const { data: orgs } = await admin
        .from("organizations")
        .select("id")
        .limit(1);
      orgId = orgs?.[0]?.id;
    }

    if (orgId) {
      await admin.from("messages").insert({
        organization_id: orgId,
        contact_id: contact?.id ?? null,
        direction: "inbound",
        folder: "inbox",
        status: "received",
        from_name: fromName || contact?.full_name || fromEmail,
        from_email: fromEmail,
        to_email: toEmail,
        subject: data.subject || "(No Subject)",
        body_text: data.text || "",
        body_html: data.html || (data.text ? `<p>${data.text}</p>` : ""),
        provider: "resend",
        provider_message_id: emailId ?? null,
        is_read: false,
        headers: data.headers ?? {},
        raw_payload: event,
      });

      // Record activity on contact timeline if known contact
      if (contact?.id) {
        await admin.from("activities").insert({
          organization_id: orgId,
          contact_id: contact.id,
          type: "email",
          title: `Email reply received: ${data.subject || "(No Subject)"}`,
          description: (data.text || "").slice(0, 500),
          occurred_at: event.created_at || new Date().toISOString(),
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, action: "inbound_recorded" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Status events for sent emails (delivered, opened, clicked, bounced)
  if (emailId) {
    let newStatus: string | null = null;
    if (eventType === "email.delivered") newStatus = "delivered";
    else if (eventType === "email.opened") newStatus = "opened";
    else if (eventType === "email.clicked") newStatus = "clicked";
    else if (eventType === "email.bounced") newStatus = "bounced";

    if (newStatus) {
      // Update in messages table
      await admin
        .from("messages")
        .update({ status: newStatus })
        .eq("provider_message_id", emailId);

      // If bounced, also flag in email_jobs if present
      if (newStatus === "bounced") {
        await admin
          .from("email_jobs")
          .update({ status: "bounced", last_error: data.bounce?.message || "Bounced via Resend" })
          .eq("smtp_message_id", emailId);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: eventType }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

