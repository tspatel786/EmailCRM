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

async function verifySignature(secret: string, payload: string, headers: Headers): Promise<boolean> {
  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const secretBytes = secret.startsWith("whsec_")
    ? Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(secret);

  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  return svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .some((sig) => sig === expected);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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

  const rawBody = await req.text();

  // Signature verification is mandatory -- fail closed if the secret isn't configured
  // or the signature doesn't match, rather than silently accepting unsigned requests.
  if (!webhookSecret) {
    return new Response(JSON.stringify({ error: "webhook_not_configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const signatureValid = await verifySignature(webhookSecret, rawBody, req.headers);
  if (!signatureValid) {
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

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

    // Match contact & org by fromEmail. Try the multi-email contact_emails table first
    // (contacts.email does not exist -- primary_email does), then fall back to primary_email.
    const { data: emailMatches } = await admin
      .from("contact_emails")
      .select("contact_id, organization_id")
      .ilike("email", fromEmail)
      .limit(1);

    let contactId = emailMatches?.[0]?.contact_id ?? null;
    let orgId = emailMatches?.[0]?.organization_id ?? null;

    if (!contactId) {
      const { data: primaryMatches } = await admin
        .from("contacts")
        .select("id, organization_id")
        .ilike("primary_email", fromEmail)
        .limit(1);
      contactId = primaryMatches?.[0]?.id ?? null;
      orgId = primaryMatches?.[0]?.organization_id ?? null;
    }

    let contact: { id: string; full_name: string; owner_user_id: string | null } | null = null;
    if (contactId && orgId) {
      const { data: contactRow } = await admin
        .from("contacts")
        .select("id, full_name, owner_user_id")
        .eq("id", contactId)
        .eq("organization_id", orgId)
        .maybeSingle();
      contact = contactRow ?? null;
    }

    // No org can be safely resolved -- do NOT guess (that previously misrouted inbound
    // mail into whichever org happened to be first in the table). Drop and log instead.
    if (!orgId) {
      console.warn(JSON.stringify({ msg: "resend-webhook-unrouted-inbound", fromEmail, toEmail }));
      return new Response(JSON.stringify({ ok: true, action: "unrouted_dropped" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    await admin.from("messages").insert({
      organization_id: orgId,
      contact_id: contact?.id ?? null,
      owner_user_id: contact?.owner_user_id ?? null,
      direction: "inbound",
      folder: "inbox",
      status: "received",
      from_name: fromName || contact?.full_name || fromEmail,
      from_email: fromEmail,
      to_email: toEmail,
      subject: data.subject || "(No Subject)",
      body_text: data.text || "",
      body_html: data.html || (data.text ? `<p>${escapeHtml(data.text).replace(/\n/g, "<br/>")}</p>` : ""),
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
        actor_user_id: contact.owner_user_id,
        activity_type: "email",
        summary: `Email reply received: ${data.subject || "(No Subject)"}`,
        outcome: (data.text || "").slice(0, 500),
        occurred_at: event.created_at || new Date().toISOString(),
      });
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

