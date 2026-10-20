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
    logger: false,
    debug: false,
  });
  return transporter;
}

export async function sendMail(payload: SendPayload): Promise<SendResult> {
  if (env.smtpMock) {
    return { ok: true, messageId: `mock-${crypto.randomUUID()}`, mock: true };
  }
  try {
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
