import sanitizeHtml from "sanitize-html";
import { backoffMs, classifySmtpError } from "@crm/shared";
import { admin } from "./db.js";
import { env } from "./env.js";
import { sendMail } from "./smtp.js";

type Job = {
  id: string;
  organization_id: string;
  campaign_id: string;
  contact_id: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  attempt_count: number;
  max_attempts: number;
  unsubscribe_token: string;
};

function redact(message: string): string {
  return message.replace(env.smtpPass, "[redacted]").slice(0, 500);
}

// M7 fix: preserve original started_at on subsequent heartbeats
const _workerStartedAt = new Date().toISOString();

export async function heartbeat(extra?: Record<string, number>): Promise<void> {
  await admin.from("worker_heartbeats").upsert(
    {
      worker_id: env.workerId,
      started_at: _workerStartedAt, // only changes when process restarts
      last_seen_at: new Date().toISOString(),
      ...extra,
    },
    { onConflict: "worker_id" },
  );
}

export async function claimJobs(): Promise<Job[]> {
  const { data, error } = await admin.rpc("claim_email_jobs", {
    p_limit: env.batchSize,
    p_worker_id: env.workerId,
    p_lease_seconds: env.leaseSeconds,
  });
  if (error) throw error;
  return (data ?? []) as Job[];
}

async function remainingToday(orgId: string): Promise<number> {
  const { data, error } = await admin.rpc("org_email_remaining", { p_org: orgId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function processJob(job: Job): Promise<"sent" | "failed" | "deferred" | "cancelled"> {
  const { data: campaign } = await admin
    .from("campaigns")
    .select("status")
    .eq("id", job.campaign_id)
    .maybeSingle();

  if (!campaign || ["paused", "cancelled"].includes(campaign.status)) {
    await admin.from("email_jobs").update({ status: "cancelled", locked_by: null, locked_until: null }).eq("id", job.id);
    return "cancelled";
  }

  const remaining = await remainingToday(job.organization_id);
  if (remaining <= 0) {
    const next = new Date();
    next.setUTCHours(24, 0, 5, 0);
    await admin
      .from("email_jobs")
      .update({
        status: "queued",
        next_attempt_at: next.toISOString(),
        last_error: "Daily organization send limit reached",
        locked_by: null,
        locked_until: null,
      })
      .eq("id", job.id);
    return "deferred";
  }

  await admin.from("email_jobs").update({ status: "processing" }).eq("id", job.id);
  await admin.from("email_events").insert({
    organization_id: job.organization_id,
    campaign_id: job.campaign_id,
    job_id: job.id,
    contact_id: job.contact_id,
    event_type: "processing",
  });

  const unsubUrl = `${env.appPublicUrl}/unsubscribe/${job.unsubscribe_token}`;
  const html = sanitizeHtml(job.body_html || "", {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt"] },
  });
  const htmlWithUnsub = `${html}<p style="font-size:12px;color:#64748b">Unsubscribe: <a href="${unsubUrl}">${unsubUrl}</a></p>`;
  const textWithUnsub = `${job.body_text}\n\nUnsubscribe: ${unsubUrl}`;

  const result = await sendMail({
    to: job.to_email,
    subject: job.subject,
    text: textWithUnsub,
    html: htmlWithUnsub,
    headers: { "List-Unsubscribe": `<${unsubUrl}>` },
  });

  if (result.ok) {
    // SMTP accepted (or mock). This is not proof of inbox delivery.
    await admin
      .from("email_jobs")
      .update({
        status: "sent",
        smtp_message_id: result.messageId,
        last_error: result.mock ? "mock_smtp_accepted" : null,
        locked_by: null,
        locked_until: null,
      })
      .eq("id", job.id);
    await admin.from("email_events").insert({
      organization_id: job.organization_id,
      campaign_id: job.campaign_id,
      job_id: job.id,
      contact_id: job.contact_id,
      event_type: "smtp_accepted",
      detail: result.mock ? "mock" : result.messageId,
    });
    await admin.rpc("increment_org_email_stat", { p_org: job.organization_id, p_accepted: 1, p_failed: 0 });
    const { data: counts } = await admin.from("email_jobs").select("status").eq("campaign_id", job.campaign_id);
    if (counts) {
      const sent = counts.filter((r) => r.status === "sent").length;
      const failed = counts.filter((r) => ["failed", "dead_letter", "bounced"].includes(r.status)).length;
      const cancelled = counts.filter((r) => r.status === "cancelled").length;
      const pending = counts.filter((r) => ["queued", "claimed", "processing"].includes(r.status)).length;
      await admin
        .from("campaigns")
        .update({
          sent_count: sent,
          failed_count: failed,
          cancelled_count: cancelled,
          status: pending === 0 ? "completed" : "sending",
          started_at: new Date().toISOString(),
          completed_at: pending === 0 ? new Date().toISOString() : null,
        })
        .eq("id", job.campaign_id);
    }
    return "sent";
  }

  const klass = classifySmtpError(result.error);
  // C3 fix: permanent SMTP errors -> 'failed' (do not retry)
  //         max-retry-exhausted   -> 'dead_letter' (retried too many times)
  //         transient, still retrying -> 'failed' (will be retried)
  const exhausted = job.attempt_count >= job.max_attempts;
  const terminal = klass === "permanent" || exhausted;
  let terminalStatus: "failed" | "dead_letter";
  if (klass === "permanent") {
    terminalStatus = "failed";
  } else if (exhausted) {
    terminalStatus = "dead_letter";
  } else {
    terminalStatus = "failed"; // transient, will be retried
  }
  const delay = backoffMs(job.attempt_count);
  await admin
    .from("email_jobs")
    .update({
      status: terminal ? terminalStatus : "failed",
      last_error: redact(result.error.message),
      next_attempt_at: new Date(Date.now() + delay).toISOString(),
      locked_by: null,
      locked_until: terminal ? null : new Date(Date.now() + delay).toISOString(),
    })
    .eq("id", job.id);
  await admin.from("email_events").insert({
    organization_id: job.organization_id,
    campaign_id: job.campaign_id,
    job_id: job.id,
    contact_id: job.contact_id,
    event_type: "failed",
    detail: redact(result.error.message),
  });
  await admin.rpc("increment_org_email_stat", { p_org: job.organization_id, p_accepted: 0, p_failed: 1 });
  return "failed";
}

export async function reclaimExpiredLeases(): Promise<void> {
  // Claimed but never entered SMTP: safe to requeue.
  await admin
    .from("email_jobs")
    .update({ status: "queued", locked_by: null, locked_until: null })
    .eq("status", "claimed")
    .lt("locked_until", new Date().toISOString());

  // Processing + expired lease: SMTP may have accepted the message before the
  // worker saved smtp_accepted. Do not automatically resend (duplicate risk).
  await admin
    .from("email_jobs")
    .update({
      status: "failed",
      last_error: "ambiguous_smtp_outcome_after_worker_crash",
      locked_by: null,
      locked_until: null,
    })
    .eq("status", "processing")
    .lt("locked_until", new Date().toISOString());
}
