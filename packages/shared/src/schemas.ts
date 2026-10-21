import { z } from "zod";
import { ROLES } from "./permissions.js";

export const uuid = z.string().uuid();
const emptyStringToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value === undefined ? null : value);
const optionalUuid = z.preprocess(emptyStringToNull, z.string().uuid().optional().nullable());
const optionalDate = z.preprocess(emptyStringToNull, z.string().optional().nullable());

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1, "Full name is required").max(120),
  role: z.enum(ROLES),
});

export const contactFormSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(300),
  company_name: z.preprocess(emptyStringToNull, z.string().trim().max(300).optional().nullable()),
  company_id: optionalUuid,
  primary_email: z.preprocess(emptyStringToNull, z.string().email("Invalid email address").optional().nullable()),
  primary_phone: z.preprocess(emptyStringToNull, z.string().max(40).optional().nullable()),
  website: z.preprocess(emptyStringToNull, z.string().max(300).optional().nullable()),
  city: z.preprocess(emptyStringToNull, z.string().max(120).optional().nullable()),
  state: z.preprocess(emptyStringToNull, z.string().max(120).optional().nullable()),
  country: z.preprocess(emptyStringToNull, z.string().max(120).optional().nullable()),
  service_interest: z.preprocess(emptyStringToNull, z.string().max(200).optional().nullable()),
  lead_source: z.preprocess(emptyStringToNull, z.string().max(120).optional().nullable()),
  lead_status: z.enum(["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"]),
  lifecycle: z.enum(["lead", "customer", "archived"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assigned_to: optionalUuid,
  consent_status: z.enum(["unknown", "granted", "withdrawn"]),
  notes: z.preprocess(emptyStringToNull, z.string().max(8000).optional().nullable()),
});

export const callFormSchema = z.object({
  contact_id: z.string().uuid("Please select a contact"),
  called_at: z.string().min(1, "Call time is required"),
  direction: z.enum(["incoming", "outgoing"]),
  duration_seconds: z.preprocess(emptyStringToNull, z.coerce.number().int().min(0).optional().nullable()),
  outcome: z.enum(["answered", "not_answered", "busy", "callback", "interested", "not_interested"]),
  notes: z.preprocess(emptyStringToNull, z.string().max(8000).optional().nullable()),
  requirements: z.preprocess(emptyStringToNull, z.string().max(4000).optional().nullable()),
  next_action: z.preprocess(emptyStringToNull, z.string().max(500).optional().nullable()),
  follow_up_at: optionalDate,
  priority: z.enum(["low", "medium", "high", "urgent"]),
});

export const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.preprocess(emptyStringToNull, z.string().max(8000).optional().nullable()),
  contact_id: optionalUuid,
  assigned_to: optionalUuid,
  due_at: optionalDate,
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  kind: z.enum(["task", "follow_up", "reminder"]),
  reminder_email: z.boolean().optional(),
  completion_notes: z.preprocess(emptyStringToNull, z.string().max(4000).optional().nullable()),
  recurrence_rule: z.enum(["none", "daily", "weekly"]).optional(),
});

export const templateFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    subject: z.string().trim().min(1, "Subject is required").max(300),
    body_text: z.string().optional().default(""),
    body_html: z.string().optional().default(""),
  })
  .refine(
    (data) => (data.body_text && data.body_text.trim().length > 0) || (data.body_html && data.body_html.trim().length > 0),
    {
      message: "Body text or HTML template content is required",
      path: ["body_text"],
    }
  );

export const campaignFormSchema = z
  .object({
    name: z.string().trim().min(1, "Campaign name is required").max(200),
    template_id: optionalUuid,
    list_id: optionalUuid,
    subject: z.string().trim().min(1, "Subject is required").max(300),
    body_text: z.string().optional().default(""),
    body_html: z.string().optional().default(""),
    scheduled_at: optionalDate,
    requires_consent: z.boolean().default(true),
  })
  .refine(
    (data) => (data.body_text && data.body_text.trim().length > 0) || (data.body_html && data.body_html.trim().length > 0),
    {
      message: "Campaign email body message is required",
      path: ["body_text"],
    }
  );

export const dealFormSchema = z.object({
  title: z.string().trim().min(1, "Deal title is required").max(300),
  contact_id: optionalUuid,
  company_id: optionalUuid,
  stage: z.enum(["new_lead", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"]),
  owner_id: optionalUuid,
  estimated_value: z.coerce.number().min(0),
  currency: z.string().min(1).max(8).default("INR"),
  expected_close_date: optionalDate,
  probability: z.coerce.number().int().min(0).max(100),
  loss_reason: z.preprocess(emptyStringToNull, z.string().max(500).optional().nullable()),
  next_action: z.preprocess(emptyStringToNull, z.string().max(500).optional().nullable()),
});

export const quotationFormSchema = z.object({
  title: z.string().trim().min(1, "Quotation title is required").max(300),
  deal_id: optionalUuid,
  contact_id: optionalUuid,
  company_id: optionalUuid,
  currency: z.string().min(1).max(8).default("INR"),
  total_amount: z.coerce.number().min(0),
  requires_approval: z.boolean().optional(),
  body_html: z.string().optional().default(""),
});

export const meetingFormSchema = z.object({
  title: z.string().trim().min(1, "Meeting title is required").max(300),
  contact_id: optionalUuid,
  company_id: optionalUuid,
  agenda: z.preprocess(emptyStringToNull, z.string().max(8000).optional().nullable()),
  notes: z.preprocess(emptyStringToNull, z.string().max(8000).optional().nullable()),
  outcome: z.preprocess(emptyStringToNull, z.string().max(2000).optional().nullable()),
  starts_at: z.string().min(1, "Start time is required"),
  ends_at: optionalDate,
  location: z.preprocess(emptyStringToNull, z.string().max(300).optional().nullable()),
  status: z.enum(["scheduled", "completed", "cancelled", "no_show"]),
});

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(300),
  contact_id: optionalUuid,
  company_id: optionalUuid,
  deal_id: optionalUuid,
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]),
  deadline: optionalDate,
  notes: z.preprocess(emptyStringToNull, z.string().max(8000).optional().nullable()),
});

export const companyFormSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(300),
  website: z.preprocess(emptyStringToNull, z.string().max(300).optional().nullable()),
  city: z.preprocess(emptyStringToNull, z.string().max(120).optional().nullable()),
  state: z.preprocess(emptyStringToNull, z.string().max(120).optional().nullable()),
  country: z.preprocess(emptyStringToNull, z.string().max(120).optional().nullable()),
  notes: z.preprocess(emptyStringToNull, z.string().max(8000).optional().nullable()),
});
