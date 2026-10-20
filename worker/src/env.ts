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
  smtpFromName: process.env.SMTP_FROM_NAME ?? "IT Services",
  smtpFromEmail: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? "",
  smtpMock: (process.env.SMTP_MOCK ?? "true") === "true",
  workerId: process.env.WORKER_ID ?? `worker-${process.pid}`,
  pollMs: Number(process.env.WORKER_POLL_MS ?? "2000"),
  batchSize: Number(process.env.WORKER_BATCH_SIZE ?? "10"),
  leaseSeconds: Number(process.env.WORKER_LEASE_SECONDS ?? "120"),
  healthPort: Number(process.env.PORT ?? process.env.WORKER_HEALTH_PORT ?? "8787"),
  appPublicUrl: process.env.APP_PUBLIC_URL ?? "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV ?? "development",
};

export function assertWorkerSecrets(): void {
  if (env.nodeEnv === "production" && env.smtpMock) {
    throw new Error("SMTP_MOCK must be false in production");
  }
  if (!env.smtpMock && (!env.smtpUser || !env.smtpPass)) {
    throw new Error("SMTP_USER and SMTP_PASS are required when SMTP_MOCK=false");
  }
  if (env.serviceRoleKey.startsWith("replace-with")) {
    throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY before starting the worker");
  }
}
