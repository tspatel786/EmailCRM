import { admin } from "./db.js";
import { sendMail } from "./smtp.js";

export async function processDemoEmails(): Promise<number> {
  try {
    const { data: requests, error } = await admin
      .from("demo_email_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5);

    if (error || !requests || requests.length === 0) return 0;

    for (const req of requests) {
      await admin.from("demo_email_requests").update({ status: "processing" }).eq("id", req.id);

      const subject = req.subject.startsWith("[DEMO]") ? req.subject : `[DEMO] ${req.subject}`;
      const text = req.body_text || "Demo Email Preview";
      const html = req.body_html || `<div style="font-family:sans-serif;line-height:1.5;">${req.body_text || "Demo Email Preview"}</div>`;

      const result = await sendMail({
        to: req.recipient_email,
        subject,
        text,
        html,
      });

      if (result.ok) {
        await admin
          .from("demo_email_requests")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error_message: result.mock ? "mock_smtp_accepted" : null,
          })
          .eq("id", req.id);
      } else {
        await admin
          .from("demo_email_requests")
          .update({
            status: "failed",
            error_message: result.error.message || "Failed to deliver email",
          })
          .eq("id", req.id);
      }
    }
    return requests.length;
  } catch (_err) {
    // If table doesn't exist or transient network issue, return 0 without throwing
    return 0;
  }
}
