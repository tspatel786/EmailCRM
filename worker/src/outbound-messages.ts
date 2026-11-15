import { backoffMs, classifySmtpError } from "@crm/shared";
import { admin } from "./db.js";
import { env } from "./env.js";
import { sendMail } from "./smtp.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function redact(message: string): string {
  return message.replace(env.smtpPass, "[redacted]").slice(0, 500);
}

const LEASE_MS = 2 * 60_000;

async function remainingToday(orgId: string): Promise<number> {
  const { data, error } = await admin.rpc("org_email_remaining", { p_org: orgId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function processOutboundMessages(): Promise<number> {
  try {
    const { data: messages, error } = await admin
      .from("messages")
      .select("id, to_email, subject, body_text, body_html, organization_id, contact_id, attempt_count, max_attempts")
      .eq("folder", "queued")
      .eq("direction", "outbound")
      .eq("status", "queued")
      .lte("next_attempt_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(10);

    if (error || !messages || messages.length === 0) return 0;

    let processed = 0;
    for (const msg of messages) {
      // Atomic claim: mark as "processing" only if still queued/unclaimed. If another worker
      // instance already claimed it, zero rows come back and we skip, so a message is never
      // sent twice. folder stays "queued" until the real outcome (sent/failed) is known.
      const { data: claimed, error: claimError } = await admin
        .from("messages")
        .update({ status: "processing", locked_until: new Date(Date.now() + LEASE_MS).toISOString() })
        .eq("id", msg.id)
        .eq("folder", "queued")
        .eq("status", "queued")
        .select("id");
      if (claimError || !claimed || claimed.length === 0) continue;

      const remaining = await remainingToday(msg.organization_id);
      if (remaining <= 0) {
        const next = new Date();
        next.setUTCHours(24, 0, 5, 0);
        await admin
          .from("messages")
          .update({
            status: "queued",
            locked_until: null,
            next_attempt_at: next.toISOString(),
            last_error: "Daily organization send limit reached",
          })
          .eq("id", msg.id);
        continue;
      }

      const result = await sendMail({
        to: msg.to_email,
        subject: msg.subject,
        text: msg.body_text,
        html: msg.body_html || `<p>${escapeHtml(msg.body_text ?? "").replace(/\n/g, "<br/>")}</p>`,
      });

      if (result.ok) {
        await admin
          .from("messages")
          .update({
            folder: "sent",
            status: "sent",
            provider_message_id: result.messageId,
            locked_until: null,
            last_error: null,
          })
          .eq("id", msg.id);
      } else {
        const klass = classifySmtpError(result.error);
        const attemptCount = msg.attempt_count + 1;
        const exhausted = attemptCount >= msg.max_attempts;
        const terminal = klass === "permanent" || exhausted;
        console.error(JSON.stringify({ msg: "outbound-message-send-failed", id: msg.id, attempt: attemptCount, terminal, error: redact(result.error.message) }));
        if (terminal) {
          await admin
            .from("messages")
            .update({
              folder: "failed",
              status: "failed",
              attempt_count: attemptCount,
              locked_until: null,
              last_error: redact(result.error.message),
            })
            .eq("id", msg.id);
        } else {
          await admin
            .from("messages")
            .update({
              status: "queued",
              attempt_count: attemptCount,
              locked_until: null,
              next_attempt_at: new Date(Date.now() + backoffMs(attemptCount)).toISOString(),
              last_error: redact(result.error.message),
            })
            .eq("id", msg.id);
        }
      }
      processed += 1;
    }
    return processed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ msg: "process-outbound-messages-error", error: message.slice(0, 500) }));
    return 0;
  }
}

export async function reclaimExpiredOutboundLeases(): Promise<void> {
  // Claimed ("processing") but the lease expired: the worker may have crashed after the
  // provider accepted the send but before the outcome was saved. Do not auto-resend
  // (duplicate risk) - mark it failed so it surfaces in the Mails "Failed" folder for review.
  await admin
    .from("messages")
    .update({
      folder: "failed",
      status: "failed",
      locked_until: null,
      last_error: "ambiguous_delivery_outcome_after_worker_crash",
    })
    .eq("direction", "outbound")
    .eq("status", "processing")
    .lt("locked_until", new Date().toISOString());
}
