import { z } from "zod";

export const CONTACT_FIELDS = [
  "full_name",
  "company_name",
  "primary_email",
  "primary_phone",
  "website",
  "city",
  "state",
  "country",
  "service_interest",
  "lead_source",
  "lead_status",
  "priority",
  "consent_status",
  "notes",
] as const;

export type ContactField = (typeof CONTACT_FIELDS)[number];

export const columnMapSchema = z.record(z.string(), z.enum(CONTACT_FIELDS).or(z.literal("skip")));

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const leadStatuses = ["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
const consents = ["unknown", "granted", "withdrawn"] as const;

export const importedContactSchema = z.object({
  full_name: z.string().trim().min(1).max(300),
  company_name: z.string().trim().max(300).optional().nullable(),
  primary_email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v.length === 0 || emailRe.test(v), "Invalid email")
    .optional()
    .nullable(),
  primary_phone: z.string().trim().max(40).optional().nullable(),
  website: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  service_interest: z.string().trim().max(200).optional().nullable(),
  lead_source: z.string().trim().max(120).optional().nullable(),
  lead_status: z.enum(leadStatuses).optional(),
  priority: z.enum(priorities).optional(),
  consent_status: z.enum(consents).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export type ImportedContact = z.infer<typeof importedContactSchema>;

export function guessColumnMap(headers: string[]): Record<string, ContactField | "skip"> {
  const map: Record<string, ContactField | "skip"> = {};
  for (const header of headers) {
    const n = header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const match: Record<string, ContactField> = {
      name: "full_name",
      full_name: "full_name",
      fullname: "full_name",
      contact: "full_name",
      company: "company_name",
      company_name: "company_name",
      email: "primary_email",
      email_address: "primary_email",
      primary_email: "primary_email",
      phone: "primary_phone",
      mobile: "primary_phone",
      telephone: "primary_phone",
      website: "website",
      city: "city",
      state: "state",
      country: "country",
      service: "service_interest",
      service_interest: "service_interest",
      source: "lead_source",
      lead_source: "lead_source",
      status: "lead_status",
      lead_status: "lead_status",
      priority: "priority",
      consent: "consent_status",
      consent_status: "consent_status",
      notes: "notes",
    };
    map[header] = match[n] ?? "skip";
  }
  return map;
}

export function rowToContact(
  row: Record<string, unknown>,
  columnMap: Record<string, ContactField | "skip">,
): { ok: true; data: ImportedContact } | { ok: false; error: string } {
  const raw: Record<string, string> = {};
  for (const [header, field] of Object.entries(columnMap)) {
    if (field === "skip") continue;
    const value = row[header];
    raw[field] = value == null ? "" : String(value).trim();
  }
  const parsed = importedContactSchema.safeParse({
    ...raw,
    primary_email: raw.primary_email || null,
    consent_status: raw.consent_status || "unknown",
    lead_status: raw.lead_status || "new",
    priority: raw.priority || "medium",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true, data: parsed.data };
}
