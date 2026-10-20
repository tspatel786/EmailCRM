import { z } from "zod";
import { ROLES } from "./permissions.js";

export const uuid = z.string().uuid();
const emptyToNull = (value: unknown) => (value === "" ? null : value);
const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().optional().nullable());

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(120),
  role: z.enum(ROLES),
});

export const contactFormSchema = z.object({
  full_name: z.string().trim().min(1).max(300),
  company_name: z.string().trim().max(300).optional().nullable(),
  company_id: optionalUuid,
  primary_email: z.string().email().optional().or(z.literal("")).nullable(),
  primary_phone: z.string().max(40).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  service_interest: z.string().max(200).optional().nullable(),
  lead_source: z.string().max(120).optional().nullable(),
  lead_status: z.enum(["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"]),
  lifecycle: z.enum(["lead", "customer", "archived"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assigned_to: optionalUuid,
  consent_status: z.enum(["unknown", "granted", "withdrawn"]),
  notes: z.string().max(8000).optional().nullable(),
});

export const callFormSchema = z.object({
  contact_id: z.string().uuid(),
  called_at: z.string().min(1),
  direction: z.enum(["incoming", "outgoing"]),
  duration_seconds: z.coerce.number().int().min(0).optional().nullable(),
  outcome: z.enum(["answered", "not_answered", "busy", "callback", "interested", "not_interested"]),
  notes: z.string().max(8000).optional().nullable(),
  requirements: z.string().max(4000).optional().nullable(),
  next_action: z.string().max(500).optional().nullable(),
  follow_up_at: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
});

export const taskFormSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  contact_id: optionalUuid,
  assigned_to: optionalUuid,
  due_at: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  kind: z.enum(["task", "follow_up", "reminder"]),
  reminder_email: z.boolean().optional(),
  completion_notes: z.string().max(4000).optional().nullable(),
  recurrence_rule: z.enum(["none", "daily", "weekly"]).optional(),
});

export const templateFormSchema = z.object({
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(300),
  body_text: z.string().min(1),
  body_html: z.string().optional().default(""),
});

export const campaignFormSchema = z.object({
  name: z.string().trim().min(1).max(200),
  template_id: optionalUuid,
  list_id: optionalUuid,
  subject: z.string().trim().min(1).max(300),
  body_text: z.string().min(1),
  body_html: z.string().optional().default(""),
  scheduled_at: z.string().optional().nullable(),
  requires_consent: z.boolean().default(true),
});

export const dealFormSchema = z.object({
  title: z.string().trim().min(1).max(300),
  contact_id: optionalUuid,
  company_id: optionalUuid,
  stage: z.enum(["new_lead", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"]),
  owner_id: optionalUuid,
  estimated_value: z.coerce.number().min(0),
  currency: z.string().min(1).max(8).default("INR"),
  expected_close_date: z.string().optional().nullable(),
  probability: z.coerce.number().int().min(0).max(100),
  loss_reason: z.string().max(500).optional().nullable(),
  next_action: z.string().max(500).optional().nullable(),
});

export const quotationFormSchema = z.object({
  title: z.string().trim().min(1).max(300),
  deal_id: optionalUuid,
  contact_id: optionalUuid,
  company_id: optionalUuid,
  currency: z.string().min(1).max(8).default("INR"),
  total_amount: z.coerce.number().min(0),
  requires_approval: z.boolean().optional(),
  body_html: z.string().optional().default(""),
});

export const meetingFormSchema = z.object({
  title: z.string().trim().min(1).max(300),
  contact_id: optionalUuid,
  company_id: optionalUuid,
  agenda: z.string().max(8000).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  outcome: z.string().max(2000).optional().nullable(),
  starts_at: z.string().min(1),
  ends_at: z.string().optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  status: z.enum(["scheduled", "completed", "cancelled", "no_show"]),
});

export const projectFormSchema = z.object({
  name: z.string().trim().min(1).max(300),
  contact_id: optionalUuid,
  company_id: optionalUuid,
  deal_id: optionalUuid,
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]),
  deadline: z.string().optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
});

export const companyFormSchema = z.object({
  name: z.string().trim().min(1).max(300),
  website: z.string().max(300).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
});
