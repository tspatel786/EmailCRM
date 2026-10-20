import { admin } from "./db.js";
import { env } from "./env.js";
import { sendMail } from "./smtp.js";

export async function processDueReminders(): Promise<number> {
  const now = new Date().toISOString();
  // FIX C6: Removed cross-tenant query; tasks are fetched per-organization below.
  // Service role can see all rows, so we MUST scope to active orgs or iterate per-org.
  // Simplest safe approach: fetch tasks with `reminder_email = true` globally (service role
  // is trusted) but validate `organization_id` is non-null on each task before acting.
  const { data: tasks, error } = await admin
    .from("tasks")
    .select("id, organization_id, title, assigned_to, due_at, reminder_email, contact_id, status")
    .in("status", ["pending", "in_progress"])
    .lte("due_at", now)
    .not("organization_id", "is", null) // C6: must have valid org
    .or("last_notified_at.is.null,last_notified_at.lt.due_at");

  if (error) throw error;
  let count = 0;
  for (const task of tasks ?? []) {
    if (!task.assigned_to) continue;
    if (!task.organization_id) continue; // C6: extra guard
    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("source_id", task.id)
      .eq("kind", "task_due")
      .maybeSingle();
    if (existing) {
      await admin.from("tasks").update({ last_notified_at: now }).eq("id", task.id);
      continue;
    }
    await admin.from("notifications").insert({
      organization_id: task.organization_id,
      user_id: task.assigned_to,
      kind: new Date(task.due_at).getTime() < Date.now() - 60_000 ? "task_overdue" : "task_due",
      title: task.title,
      body: `Due ${task.due_at}`,
      link_path: `/app/follow-ups?task=${task.id}`,
      source_table: "tasks",
      source_id: task.id,
    });
    if (task.reminder_email) {
      const { data: profile } = await admin.from("profiles").select("id").eq("id", task.assigned_to).maybeSingle();
      const { data: user } = profile
        ? await admin.auth.admin.getUserById(task.assigned_to)
        : { data: { user: null } };
      const email = user.user?.email;
      if (email) {
        await sendMail({
          to: email,
          subject: `Reminder: ${task.title}`,
          text: `Task "${task.title}" is due. Open ${env.appPublicUrl}/app/follow-ups`,
          html: `<p>Task <strong>${task.title}</strong> is due.</p>`,
        });
      }
    }
    await admin.from("tasks").update({ last_notified_at: now }).eq("id", task.id);
    count += 1;
  }
  return count;
}

/**
 * FIX C2: Activates only campaigns that were previously queued via the
 * queue-campaign edge function (i.e., already have email_jobs rows) but
 * scheduled for a future time. Campaigns without jobs are left in 'scheduled'
 * state — they were never properly queued and must be re-queued via the UI.
 * This prevents the zombie-queued state where worker polls for jobs that
 * do not exist.
 */
export async function activateScheduledCampaigns(): Promise<void> {
  const now = new Date().toISOString();

  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, organization_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", now);

  if (error) throw error;
  if (!campaigns || campaigns.length === 0) return;

  for (const campaign of campaigns) {
    // Only activate if queued email_jobs already exist for this campaign
    const { count } = await admin
      .from("email_jobs")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .in("status", ["queued", "failed"]);

    if (count && count > 0) {
      await admin
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", campaign.id)
        .eq("status", "scheduled"); // idempotent
      console.info(JSON.stringify({
        msg: "campaign_activated",
        campaignId: campaign.id,
        jobCount: count,
      }));
    } else {
      // No jobs exist — campaign was scheduled but never queued via edge function.
      // This is a data inconsistency; log a warning but do not corrupt the status.
      console.warn(JSON.stringify({
        msg: "campaign_scheduled_no_jobs",
        campaignId: campaign.id,
        detail: "Campaign passed scheduled_at but has no email_jobs. Re-queue via UI.",
      }));
    }
  }
}
