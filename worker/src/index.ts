import { assertWorkerSecrets, env } from "./env.js";
import { startHealthServer, type HealthState } from "./health.js";
import { claimJobs, heartbeat, processJob, reclaimExpiredLeases } from "./process-jobs.js";
import { activateScheduledCampaigns, processDueReminders } from "./reminders.js";
import { processDemoEmails } from "./demo-emails.js";

assertWorkerSecrets();

const state: HealthState = {
  startedAt: new Date().toISOString(),
  lastLoopAt: null,
  jobsClaimed: 0,
  jobsSent: 0,
  jobsFailed: 0,
};

const server = startHealthServer(state);
let running = true;

process.on("SIGTERM", () => {
  running = false;
  server.close();
});
process.on("SIGINT", () => {
  running = false;
  server.close();
});

console.info(
  JSON.stringify({
    msg: "crm-worker-started",
    workerId: env.workerId,
    smtpMock: env.smtpMock,
    healthPort: env.healthPort,
  }),
);

async function loop(): Promise<void> {
  while (running) {
    try {
      state.lastLoopAt = new Date().toISOString();
      await reclaimExpiredLeases();
      await activateScheduledCampaigns();
      await processDueReminders();
      await processDemoEmails();
      const jobs = await claimJobs();
      state.jobsClaimed += jobs.length;
      for (const job of jobs) {
        const result = await processJob(job);
        if (result === "sent") state.jobsSent += 1;
        if (result === "failed") state.jobsFailed += 1;
      }
      await heartbeat({
        jobs_claimed: state.jobsClaimed,
        jobs_sent: state.jobsSent,
        jobs_failed: state.jobsFailed,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ msg: "crm-worker-loop-error", error: message.slice(0, 500) }));
    }
    await new Promise((r) => setTimeout(r, env.pollMs));
  }
}

loop().catch((error) => {
  console.error(error);
  process.exit(1);
});
