// supabase/functions/resend-webhook/index.ts
// Handles Resend webhook events:
// 1. Email delivery tracking: email.delivered, email.opened, email.clicked, email.bounced
// 2. Inbound replies / incoming messages: email.received / inbound events

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
// Organization that receives inbound mail from senders who are not (yet) a contact, e.g. a
// brand-new enquiry. Without it such mail is dropped, because guessing an org is unsafe.
const inboundDefaultOrgSlug = Deno.env.get("INBOUND_DEFAULT_ORG_SLUG") ?? "";

// ilike treats % and _ as wildcards; escape them so a crafted sender address cannot
// match (and be routed to) some other organization's contact.
function likeExact(value: string): string {
  return value.replace(/[\%_]/g, (c) => `\${c}`);
}

// Resend's email.received webhook carries only metadata (from/to/subject/ids); the body
// must be fetched from the Received Emails API.
async function fetchReceivedEmail(emailId: string): Promise<{ text?: string; html?: string; headers?: Record<string, string> } | null> {
  if (!resendApiKey) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${resendApiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(JSON.stringify({ msg: "resend-webhook-fetch-body-failed", status: res.status }));
      return null;
    }
    return await res.json();
  } catch (error) {
    console.warn(JSON.stringify({ msg: "resend-webhook-fetch-body-error", error: String(error).slice(0, 200) }));
    return null;
  }
}

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

// Find who a provider message id was sent to (campaign job or Webmail message) and add
// that address to the organization's suppression list. Duplicates are ignored.
async function suppressRecipient(emailId: string, reason: "bounce" | "complaint", source: string): Promise<void> {
  const { data: job } = await admin
    .from("email_jobs")
    .select("organization_id, contact_id, to_email")
    .eq("smtp_message_id", emailId)
    .limit(1)
    .maybeSingle();
  let target = job as { organization_id: string; contact_id: string | null; to_email: string } | null;
  if (!target) {
    const { data: msg } = await admin
      .from("messages")
      .select("organization_id, contact_id, to_email")
      .eq("provider_message_id", emailId)
      .eq("direction", "outbound")
      .limit(1)
      .maybeSingle();
    target = msg as typeof target;
  }
  if (!target?.organization_id || !target.to_email) return;

  const { error } = await admin.from("suppressions").insert({
    organization_id: target.organization_id,
    email: target.to_email.trim().toLowerCase(),
    contact_id: target.contact_id,
    reason,
    source: `resend:${source}`,
  });
  // 23505 = already suppressed (unique on organization_id + lower(email)).
  if (error && error.code !== "23505") {
    console.error(JSON.stringify({ msg: "resend-webhook-suppress-failed", error: error.message }));
  }
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
      .ilike("email", likeExact(fromEmail))
      .limit(1);

    let contactId = emailMatches?.[0]?.contact_id ?? null;
    let orgId = emailMatches?.[0]?.organization_id ?? null;

    if (!contactId) {
      const { data: primaryMatches } = await admin
        .from("contacts")
        .select("id, organization_id")
        .ilike("primary_email", likeExact(fromEmail))
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
    let bodyText = data.text || "";
    let bodyHtml = data.html || "";
    let headers = data.headers ?? {};
    if (!bodyText && !bodyHtml && emailId) {
      const full = await fetchReceivedEmail(emailId);
      bodyText = full?.text || "";
      bodyHtml = full?.html || "";
      headers = full?.headers ?? headers;
    }

    // Threading: a reply carries In-Reply-To / References with the Message-ID we set on the
    // outbound mail. Match it to put the reply in the same thread and give it to the same owner
    // (this also routes replies from addresses that are not saved as contacts).
    const headerVal = (name: string): string => {
      const h = headers as Record<string, unknown>;
      const key = Object.keys(h).find((k) => k.toLowerCase() === name);
      const v = key ? h[key] : (data as Record<string, unknown>)[name.replace(/-/g, "_")];
      return Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : "";
    };
    const refIds = [...`${headerVal("in-reply-to")} ${headerVal("references")}`.matchAll(/<[^<>\s]{3,300}>/g)].map((m) => m[0]).slice(-20);
    let parent: { id: string; organization_id: string; owner_user_id: string | null; contact_id: string | null; company_id: string | null; thread_id: string | null } | null = null;
    if (refIds.length) {
      const { data: parents } = await admin
        .from("messages")
        .select("id, organization_id, owner_user_id, contact_id, company_id, thread_id")
        .in("rfc_message_id", refIds)
        .order("created_at", { ascending: false })
        .limit(1);
      parent = parents?.[0] ?? null;
    }
    if (!parent && fromEmail && data.subject && /^\s*(re|fwd?)\s*:/i.test(data.subject)) {
      // Fallback when the provider rewrote Message-ID: same subject, sent to this address recently.
      const baseSubject = data.subject.replace(/^\s*((re|fwd?)\s*:\s*)+/i, "").trim();
      const { data: parents } = await admin
        .from("messages")
        .select("id, organization_id, owner_user_id, contact_id, company_id, thread_id")
        .eq("direction", "outbound")
        .ilike("to_email", likeExact(fromEmail))
        .ilike("subject", `%${likeExact(baseSubject)}%`)
        .gte("created_at", new Date(Date.now() - 60 * 86400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      parent = parents?.[0] ?? null;
    }
    if (parent) {
      orgId = parent.organization_id;
      if (!contact || contactId !== parent.contact_id) {
        contact = parent.contact_id ? { id: parent.contact_id, full_name: "", owner_user_id: parent.owner_user_id } : contact;
      }
    }

    // Unknown sender: use the explicitly configured default org (never "first org in the
    // table"). Without that setting, drop and log as before.
    if (!orgId && inboundDefaultOrgSlug) {
      const { data: defaultOrg } = await admin
        .from("organizations")
        .select("id")
        .eq("slug", inboundDefaultOrgSlug)
        .maybeSingle();
      orgId = defaultOrg?.id ?? null;
    }
    if (!orgId) {
      console.warn(JSON.stringify({ msg: "resend-webhook-unrouted-inbound", fromEmail, toEmail }));
      return new Response(JSON.stringify({ ok: true, action: "unrouted_dropped" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Resend retries deliveries; skip one we already stored.
    if (emailId) {
      const { data: existing } = await admin
        .from("messages")
        .select("id")
        .eq("provider_message_id", emailId)
        .eq("direction", "inbound")
        .limit(1)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ ok: true, action: "duplicate_ignored" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    const { error: insertError } = await admin.from("messages").insert({
      organization_id: orgId,
      contact_id: contact?.id ?? null,
      owner_user_id: parent?.owner_user_id ?? contact?.owner_user_id ?? null,
      company_id: parent?.company_id ?? null,
      thread_id: parent ? (parent.thread_id ?? parent.id) : null,
      in_reply_to: refIds[refIds.length - 1] ?? null,
      rfc_message_id: headerVal("message-id").match(/<[^<>\s]{3,300}>/)?.[0] ?? null,
      direction: "inbound",
      folder: "inbox",
      status: "received",
      from_name: fromName || contact?.full_name || fromEmail,
      from_email: fromEmail,
      to_email: toEmail,
      subject: data.subject || "(No Subject)",
      body_text: bodyText,
      body_html: bodyHtml || (bodyText ? `<p>${escapeHtml(bodyText).replace(/\n/g, "<br/>")}</p>` : ""),
      provider: "resend",
      provider_message_id: emailId ?? null,
      is_read: false,
      headers,
      raw_payload: event,
    });
    if (insertError) {
      // Non-2xx makes Resend retry instead of the reply being lost silently.
      console.error(JSON.stringify({ msg: "resend-webhook-inbound-insert-failed", error: insertError.message }));
      return new Response(JSON.stringify({ error: "insert_failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Record activity on contact timeline if known contact
    if (contact?.id) {
      await admin.from("activities").insert({
        organization_id: orgId,
        contact_id: contact.id,
        actor_user_id: contact.owner_user_id,
        activity_type: "email",
        summary: `Email reply received: ${data.subject || "(No Subject)"}`,
        outcome: bodyText.slice(0, 500),
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
      // Update in messages table. Events can arrive out of order (e.g. "delivered" after
      // "opened"); never move a message back to an earlier status.
      const later: Record<string, string[]> = {
        delivered: ["opened", "clicked", "bounced"],
        opened: ["clicked", "bounced"],
        clicked: ["bounced"],
        bounced: [],
      };
      let update = admin.from("messages").update({ status: newStatus }).eq("provider_message_id", emailId);
      if (later[newStatus].length) update = update.not("status", "in", `(${later[newStatus].join(",")})`);
      await update;

      // If bounced, also flag in email_jobs if present
      if (newStatus === "bounced") {
        await admin
          .from("email_jobs")
          .update({ status: "bounced", last_error: data.bounce?.message || "Bounced via Resend" })
          .eq("smtp_message_id", emailId);
      }
    }

    // Hard bounces and spam complaints: suppress the address for its organization so
    // future campaigns skip it (queue_campaign excludes suppressed emails). Soft
    // (transient) bounces are not suppressed -- the mailbox may accept mail later.
    const isHardBounce = eventType === "email.bounced" && !/transient|soft|temporary/i.test(data.bounce?.type ?? "");
    const isComplaint = eventType === "email.complained";
    if (isHardBounce || isComplaint) {
      await suppressRecipient(emailId, isComplaint ? "complaint" : "bounce", eventType);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: eventType }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

