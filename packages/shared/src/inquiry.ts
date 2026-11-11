import { z } from "zod";

export const INQUIRY_SERVICES = [
  "Website",
  "Mobile App",
  "Software/CRM",
  "WhatsApp Bot",
  "Hosting/Domain",
  "Other",
] as const;

export type InquiryService = (typeof INQUIRY_SERVICES)[number];

export const INQUIRY_CONSENT_TEXT = "I agree to be contacted by S.M.Patel IT Hub.";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INDIAN_MOBILE_10_RE = /^[6-9]\d{9}$/;

/**
 * Strip HTML tags and angle brackets from user-supplied text.
 */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize an Indian mobile number to its 10-digit form (starting with 6-9), or return null if invalid.
 */
export function normalizeIndianMobile(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  let digits = cleaned;
  if (digits.startsWith("+91")) {
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return INDIAN_MOBILE_10_RE.test(digits) ? digits : null;
}

/**
 * Generate common formatting variants for an already-normalized 10-digit Indian mobile number.
 */
export function indianMobileVariants(mobile10: string): string[] {
  const normalized = normalizeIndianMobile(mobile10);
  if (!normalized) return [];
  const first5 = normalized.slice(0, 5);
  const last5 = normalized.slice(5);
  return [
    normalized,
    `+91${normalized}`,
    `+91 ${normalized}`,
    `+91 ${first5} ${last5}`,
    `91${normalized}`,
    `0${normalized}`,
    `${first5} ${last5}`,
  ];
}

const optionalCleanText = (maxLen: number, code: string) =>
  z.preprocess(
    (val) => {
      if (typeof val !== "string") return "";
      return stripHtml(val);
    },
    z.string().max(maxLen, code).optional().default(""),
  );

export const publicInquirySchema = z.object({
  name: z.preprocess(
    (val) => (typeof val === "string" ? stripHtml(val) : ""),
    z.string().min(1, "name_required").max(120, "name_too_long"),
  ),
  mobile: z.preprocess(
    (val) => (typeof val === "string" ? val.trim() : ""),
    z
      .string()
      .min(1, "mobile_required")
      .max(20, "mobile_invalid")
      .transform((val, ctx) => {
        const normalized = normalizeIndianMobile(val);
        if (!normalized) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "mobile_invalid" });
          return z.NEVER;
        }
        return normalized;
      }),
  ),
  email: z.preprocess(
    (val) => (typeof val === "string" ? stripHtml(val).toLowerCase() : ""),
    z
      .string()
      .max(200, "email_too_long")
      .refine((val) => val === "" || EMAIL_RE.test(val), "email_invalid")
      .optional()
      .default(""),
  ),
  company: optionalCleanText(200, "company_too_long"),
  service: z.enum(INQUIRY_SERVICES, {
    errorMap: () => ({ message: "service_required" }),
  }),
  message: optionalCleanText(2000, "message_too_long"),
  consent: z.boolean().refine((v) => v === true, { message: "consent_required" }),
  website_url: z.string().max(200).optional().default(""),
  turnstile_token: z.string().max(2048).optional().default(""),
});

export type PublicInquiryInput = z.input<typeof publicInquirySchema>;
export type PublicInquiryParsed = z.output<typeof publicInquirySchema>;

export interface InquiryContactCandidate {
  id: string;
  company_id: string | null;
  full_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  archived_at?: string | null;
}

/**
 * Find an existing active contact in the organization matching either normalized email or normalized 10-digit Indian mobile.
 */
export function findDuplicateContact(
  candidates: readonly InquiryContactCandidate[],
  normalizedEmail: string,
  normalizedMobile10: string,
): InquiryContactCandidate | null {
  const emailTarget = normalizedEmail.trim().toLowerCase();
  const mobileTarget = normalizeIndianMobile(normalizedMobile10);

  for (const c of candidates) {
    if (c.archived_at) continue;
    if (emailTarget && c.primary_email && c.primary_email.trim().toLowerCase() === emailTarget) {
      return c;
    }
    if (mobileTarget && c.primary_phone && normalizeIndianMobile(c.primary_phone) === mobileTarget) {
      return c;
    }
  }
  return null;
}

