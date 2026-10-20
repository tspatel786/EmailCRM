export type FailureClass = "transient" | "permanent" | "ambiguous";

const PERMANENT = /^(5\d\d)|mailbox unavailable|user unknown|does not exist|rejected|blocked|unsubscribed/i;
const TRANSIENT = /^(4\d\d)|timeout|temporar|rate limit|try again|connection|econn|etimedout|socket/i;

export function classifySmtpError(error: unknown): FailureClass {
  const message = error instanceof Error ? `${error.message} ${"code" in error ? String((error as { code?: string }).code) : ""}` : String(error);
  if (PERMANENT.test(message)) return "permanent";
  if (TRANSIENT.test(message)) return "transient";
  return "ambiguous";
}

export function backoffMs(attempt: number): number {
  const base = Math.min(30_000 * 2 ** Math.max(attempt - 1, 0), 30 * 60_000);
  const jitter = Math.floor(Math.random() * 1000);
  return base + jitter;
}
