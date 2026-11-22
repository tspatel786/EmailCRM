import { assertWorkerSecrets, env } from "./env.js";
import { startHealthServer, type HealthState } from "./health.js";
import { claimJobs, heartbeat, processJob, reclaimExpiredLeases } from "./process-jobs.js";
import { activateScheduledCampaigns, processDueReminders } from "./reminders.js";
import { processDemoEmails } from "./demo-emails.js";
import { processOutboundMessages, reclaimExpiredOutboundLeases } from "./outbound-messages.js";
import { processDataGovImport, processHunter, processLeadDiscovery } from "./lead-discovery.js";

assertWorkerSecrets();

// Make the active email transport obvious in deploy logs. Hosts like Render's free tier
// block outbound SMTP ports, so an SMTP fallback there fails with "Connection timeout".
const emailTransport = env.smtpMock ? "mock" : env.resendApiKey ? "resend" : "smtp";
console.log(JSON.stringify({ msg: "worker-email-transport", transport: emailTransport }));
if (emailTransport === "smtp" && env.nodeEnv === "production") {
  console.warn(JSON.stringify({
    msg: "worker-email-transport-warning",
    detail: "RESEND_API_KEY is not set; falling back to SMTP. If the host blocks SMTP ports, all sends will time out.",
  }));
}

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

// Keep-alive: Render free web services sleep after 15 minutes without inbound HTTP traffic,
// and a sleeping worker sends nothing (production heartbeats showed ~15-minute lifetimes).
// A periodic request to our own public URL counts as inbound traffic.
if (env.keepAliveUrl) {
  const ping = async () => {
    try {
      const res = await fetch(`${env.keepAliveUrl}/healthz`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) console.warn(JSON.stringify({ msg: "worker-keepalive-bad-status", status: res.status }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(JSON.stringify({ msg: "worker-keepalive-failed", error: message.slice(0, 200) }));
    }
  };
  const timer = setInterval(() => void ping(), Math.max(60_000, env.keepAliveMs));
  timer.unref();
  console.info(JSON.stringify({ msg: "worker-keepalive-enabled", intervalMs: Math.max(60_000, env.keepAliveMs) }));
} else if (env.nodeEnv === "production") {
  console.warn(JSON.stringify({
    msg: "worker-keepalive-disabled",
    detail: "Set KEEPALIVE_URL (or run on Render, which sets RENDER_EXTERNAL_URL) if the host sleeps idle services.",
  }));
}

async function runStep(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ msg: "crm-worker-step-error", step: name, error: message.slice(0, 500) }));
  }
}

async function loop(): Promise<void> {
  while (running) {
    try {
      state.lastLoopAt = new Date().toISOString();
      await runStep("reclaimExpiredLeases", reclaimExpiredLeases);
      await runStep("reclaimExpiredOutboundLeases", reclaimExpiredOutboundLeases);
      await runStep("activateScheduledCampaigns", activateScheduledCampaigns);
      await runStep("processDueReminders", processDueReminders);
      await runStep("processDemoEmails", processDemoEmails);
      await runStep("processOutboundMessages", processOutboundMessages);
      await runStep("processLeadDiscovery", processLeadDiscovery);
      await runStep("processDataGovImport", processDataGovImport);
      await runStep("processHunter", processHunter);
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
