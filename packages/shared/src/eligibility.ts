export type MarketingContact = {
  primary_email?: string | null;
  archived_at?: string | null;
  consent_status?: string | null;
};

export function isEligibleForMarketing(
  contact: MarketingContact,
  options: { requiresConsent: boolean; suppressedEmails: Set<string> },
): boolean {
  const email = contact.primary_email?.trim().toLowerCase();
  if (!email) return false;
  if (contact.archived_at) return false;
  if (options.suppressedEmails.has(email)) return false;
  if (options.requiresConsent && contact.consent_status !== "granted") return false;
  return true;
}

export function campaignIdempotencyKey(campaignId: string, contactId: string): string {
  return `${campaignId}:${contactId}`;
}

export function shouldResendAfterWorkerCrash(jobStatus: string): "requeue" | "ambiguous" | "ignore" {
  if (jobStatus === "claimed") return "requeue";
  if (jobStatus === "processing") return "ambiguous";
  return "ignore";
}

export function jobIsDue(nextAttemptAt: Date, now: Date): boolean {
  return nextAttemptAt.getTime() <= now.getTime();
}
