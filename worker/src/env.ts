import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../.env") });
config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required("SUPABASE_URL", process.env.VITE_SUPABASE_URL),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  smtpHost: process.env.SMTP_HOST ?? "smtp.zoho.in",
  smtpPort: Number(process.env.SMTP_PORT ?? "465"),
  smtpSecure: (process.env.SMTP_SECURE ?? "true") === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFromName: process.env.SMTP_FROM_NAME ?? "S.M.PATEL IT HUB",
  smtpFromEmail: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? "",
  smtpMock: (process.env.SMTP_MOCK ?? "true") === "true",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? "",
  workerId: process.env.WORKER_ID ?? `worker-${process.pid}`,
  pollMs: Number(process.env.WORKER_POLL_MS ?? "2000"),
  batchSize: Number(process.env.WORKER_BATCH_SIZE ?? "10"),
  // Part of the daily organization limit that bulk campaigns may not use, so replies and
  // one-to-one mail from the Mails page are never blocked by a running campaign.
  webmailReserve: Math.max(0, Number(process.env.WEBMAIL_DAILY_RESERVE ?? "10")),
  leaseSeconds: Number(process.env.WORKER_LEASE_SECONDS ?? "120"),
  healthPort: Number(process.env.PORT ?? process.env.WORKER_HEALTH_PORT ?? "8787"),
  appPublicUrl: (process.env.APP_PUBLIC_URL ?? "http://localhost:5173").replace(/\/+$/, ""),
  // Public URL of this worker. Render sets RENDER_EXTERNAL_URL automatically; pinging it keeps
  // a free-tier web service from spinning down after 15 idle minutes (which stops all sending).
  keepAliveUrl: (process.env.KEEPALIVE_URL ?? process.env.RENDER_EXTERNAL_URL ?? "").replace(/\/+$/, ""),
  keepAliveMs: Number(process.env.KEEPALIVE_INTERVAL_MS ?? String(10 * 60_000)),
  nodeEnv: process.env.NODE_ENV ?? "development",
};

export function assertWorkerSecrets(): void {
  if (env.nodeEnv === "production" && env.smtpMock) {
    throw new Error("SMTP_MOCK must be false in production");
  }
  if (!env.smtpMock && !env.resendApiKey && (!env.smtpUser || !env.smtpPass)) {
    throw new Error("RESEND_API_KEY or SMTP_USER/SMTP_PASS are required when SMTP_MOCK=false");
  }
  if (!env.smtpMock && env.resendApiKey && !env.resendFromEmail) {
    throw new Error("RESEND_FROM_EMAIL or SMTP_FROM_EMAIL is required when using RESEND_API_KEY");
  }
  if (env.nodeEnv === "production" && /localhost|127\.0\.0\.1/.test(env.appPublicUrl)) {
    // Not fatal (sending must keep working), but every unsubscribe link would point at localhost.
    console.error(JSON.stringify({
      msg: "worker-config-error",
      detail: "APP_PUBLIC_URL is not set to the public web app URL; campaign unsubscribe links will be broken.",
    }));
  }
  if (env.serviceRoleKey.startsWith("replace-with")) {
    throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY before starting the worker");
  }
}
