import { admin } from "./db.js";
import { sendMail } from "./smtp.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function processOutboundMessages(): Promise<number> {
  try {
    const { data: messages, error } = await admin
      .from("messages")
      .select("id, to_email, subject, body_text, body_html, organization_id, contact_id")
      .eq("folder", "queued")
      .eq("direction", "outbound")
      .order("created_at", { ascending: true })
      .limit(10);

    if (error || !messages || messages.length === 0) return 0;

    let processed = 0;
    for (const msg of messages) {
      // Atomic claim: move the row out of the "queued" folder only if it is still there.
      // If another worker instance already claimed it, zero rows come back and we skip,
      // so a message is never sent twice. Status stays "queued" until the send resolves.
      const { data: claimed, error: claimError } = await admin
        .from("messages")
        .update({ folder: "sent" })
        .eq("id", msg.id)
        .eq("folder", "queued")
        .select("id");
      if (claimError || !claimed || claimed.length === 0) continue;

      const result = await sendMail({
        to: msg.to_email,
        subject: msg.subject,
        text: msg.body_text,
        html: msg.body_html || `<p>${escapeHtml(msg.body_text ?? "").replace(/\n/g, "<br/>")}</p>`,
      });

      if (result.ok) {
        await admin
          .from("messages")
          .update({ folder: "sent", status: "sent", provider_message_id: result.messageId })
          .eq("id", msg.id);
      } else {
        console.error(JSON.stringify({ msg: "outbound-message-send-failed", id: msg.id, error: result.error.message.slice(0, 500) }));
        await admin.from("messages").update({ folder: "failed", status: "failed" }).eq("id", msg.id);
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
