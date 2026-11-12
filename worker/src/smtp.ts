import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "./env.js";

export type SendPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

export type SendResult =
  | { ok: true; messageId: string; mock: boolean }
  | { ok: false; error: Error };

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    logger: false,
    debug: false,
  });
  return transporter;
}

async function sendViaResend(payload: SendPayload): Promise<SendResult> {
  const fromEmail = env.resendFromEmail || env.smtpFromEmail;
  const from = env.smtpFromName
    ? `${env.smtpFromName} <${fromEmail}>`
    : fromEmail;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      headers: payload.headers,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };
  if (!response.ok) {
    const err = new Error(`Resend HTTP ${response.status}: ${body.message || body.name || response.statusText}`);
    return { ok: false, error: err };
  }
  return { ok: true, messageId: body.id || `resend-${Date.now()}`, mock: false };
}

export async function sendMail(payload: SendPayload): Promise<SendResult> {
  if (env.smtpMock) {
    return { ok: true, messageId: `mock-${crypto.randomUUID()}`, mock: true };
  }
  try {
    if (env.resendApiKey) {
      return await sendViaResend(payload);
    }
    const info = await getTransport().sendMail({
      from: `"${env.smtpFromName}" <${env.smtpFromEmail}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      headers: payload.headers,
    });
    return { ok: true, messageId: info.messageId || `smtp-${Date.now()}`, mock: false };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
