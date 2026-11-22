-- deploy_all.sql: every migration in supabase/migrations concatenated in order, for a FRESH
-- database only. Generated file - do not edit; regenerate after adding a migration.
-- For an existing database apply only the new migration files instead.

-- ===================== 0001_extensions.sql =====================
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

-- ===================== 0002_enums.sql =====================
do $$ begin
  create type public.app_role as enum (
    'owner', 'admin', 'sales_manager', 'sales_executive', 'viewer'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.membership_status as enum ('invited', 'active', 'suspended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lifecycle_stage as enum ('lead', 'customer', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lead_status as enum (
    'new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.priority_level as enum ('low', 'medium', 'high', 'urgent');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.consent_status as enum ('unknown', 'granted', 'withdrawn');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.call_direction as enum ('incoming', 'outgoing');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.call_outcome as enum (
    'answered', 'not_answered', 'busy', 'callback', 'interested', 'not_interested'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum ('pending', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_kind as enum ('task', 'follow_up', 'reminder');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.campaign_status as enum (
    'draft', 'scheduled', 'queued', 'sending', 'paused', 'completed', 'cancelled', 'failed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.email_job_status as enum (
    'queued', 'claimed', 'processing', 'sent', 'bounced', 'failed', 'cancelled', 'dead_letter'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.email_event_type as enum (
    'queued', 'processing', 'smtp_accepted', 'bounced', 'failed', 'delivered',
    'unsubscribed', 'suppressed', 'cancelled', 'retried'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.suppression_reason as enum (
    'unsubscribe', 'bounce', 'complaint', 'manual', 'unknown_consent'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.deal_stage as enum (
    'new_lead', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.quotation_status as enum (
    'draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'superseded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_status as enum (
    'planning', 'active', 'on_hold', 'completed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.meeting_status as enum (
    'scheduled', 'completed', 'cancelled', 'no_show'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.import_status as enum (
    'pending', 'validating', 'previewed', 'importing', 'completed', 'failed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_type as enum (
    'note', 'call', 'email', 'task', 'meeting', 'deal', 'quotation', 'project',
    'document', 'import', 'status_change', 'assignment', 'system'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_kind as enum (
    'follow_up_due', 'task_due', 'task_overdue', 'email_failed', 'mention', 'system'
  );
exception when duplicate_object then null;
end $$;

-- ===================== 0003_core.sql =====================
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  timezone text not null default 'Asia/Kolkata',
  daily_email_limit integer not null default 100 check (daily_email_limit > 0 and daily_email_limit <= 10000),
  retention_days integer check (retention_days is null or retention_days >= 30),
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  timezone text not null default 'Asia/Kolkata',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  status public.membership_status not null default 'invited',
  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create index memberships_org_idx on public.memberships (organization_id, status);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create table public.worker_heartbeats (
  worker_id text primary key,
  started_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  jobs_claimed bigint not null default 0,
  jobs_sent bigint not null default 0,
  jobs_failed bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table public.org_email_daily_stats (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  send_date date not null,
  accepted_count integer not null default 0 check (accepted_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  primary key (organization_id, send_date)
);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================== 0004_crm.sql =====================
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300),
  website text,
  city text,
  state text,
  country text,
  notes text,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_org_name_idx on public.companies (organization_id, lower(name));

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  full_name text not null check (char_length(full_name) between 1 and 300),
  company_name text,
  primary_email text,
  primary_phone text,
  website text,
  city text,
  state text,
  country text,
  service_interest text,
  lead_source text,
  lead_status public.lead_status not null default 'new',
  lifecycle public.lifecycle_stage not null default 'lead',
  priority public.priority_level not null default 'medium',
  assigned_to uuid references public.profiles (id) on delete set null,
  consent_status public.consent_status not null default 'unknown',
  consent_captured_at timestamptz,
  email_opt_in boolean not null default false,
  notes text,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_email_format check (
    primary_email is null or primary_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

create unique index contacts_org_email_unique
  on public.contacts (organization_id, lower(primary_email))
  where primary_email is not null and archived_at is null;

create index contacts_org_status_idx on public.contacts (organization_id, lead_status);
create index contacts_org_assigned_idx on public.contacts (organization_id, assigned_to);
create index contacts_org_created_idx on public.contacts (organization_id, created_at desc);
create index contacts_search_idx on public.contacts using gin (
  to_tsvector('simple', coalesce(full_name,'') || ' ' || coalesce(company_name,'') || ' ' || coalesce(primary_email,''))
);

create table public.contact_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  email text not null,
  is_primary boolean not null default false
);

create unique index contact_emails_unique
  on public.contact_emails (contact_id, lower(email));

create table public.contact_phones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  phone text not null,
  is_primary boolean not null default false
);

create table public.contact_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null
);

create unique index contact_tags_org_name_unique
  on public.contact_tags (organization_id, lower(name));

create table public.contact_tag_map (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  tag_id uuid not null references public.contact_tags (id) on delete cascade,
  primary key (contact_id, tag_id)
);

create table public.contact_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_list_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  list_id uuid not null references public.contact_lists (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, contact_id)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  file_name text not null,
  source_kind text not null check (source_kind in ('xlsx', 'csv')),
  status public.import_status not null default 'pending',
  column_map jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  error_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  row_number integer not null,
  raw jsonb not null default '{}'::jsonb,
  message text not null,
  created_at timestamptz not null default now()
);

create index import_errors_batch_idx on public.import_errors (batch_id, row_number);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  deal_id uuid,
  project_id uuid,
  quotation_id uuid,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 20971520),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  source_table text,
  source_id uuid,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();
create trigger contact_lists_updated_at before update on public.contact_lists
  for each row execute function public.set_updated_at();
create trigger import_batches_updated_at before update on public.import_batches
  for each row execute function public.set_updated_at();

-- ===================== 0005_email.sql =====================
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  subject text not null,
  body_text text not null default '',
  body_html text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid references public.email_templates (id) on delete set null,
  list_id uuid references public.contact_lists (id) on delete set null,
  name text not null,
  subject text not null,
  body_text text not null default '',
  body_html text not null default '',
  status public.campaign_status not null default 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  requires_consent boolean not null default true,
  recipient_count integer not null default 0,
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  cancelled_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_org_status_idx on public.campaigns (organization_id, status);

create table public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  to_email text not null,
  subject text not null,
  body_text text not null,
  body_html text not null default '',
  status public.email_job_status not null default 'queued',
  scheduled_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  claimed_at timestamptz,
  smtp_message_id text,
  last_error text,
  idempotency_key text not null,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  unique (campaign_id, contact_id)
);

create index email_jobs_claim_idx
  on public.email_jobs (status, next_attempt_at)
  where status in ('queued', 'failed');

create index email_jobs_org_status_idx on public.email_jobs (organization_id, status);

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  job_id uuid references public.email_jobs (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  event_type public.email_event_type not null,
  detail text,
  created_at timestamptz not null default now()
);

create index email_events_job_idx on public.email_events (job_id, created_at);

create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  contact_id uuid references public.contacts (id) on delete set null,
  reason public.suppression_reason not null,
  source text,
  created_at timestamptz not null default now()
);

create unique index suppressions_org_email_unique
  on public.suppressions (organization_id, lower(email));

create trigger email_templates_updated_at before update on public.email_templates
  for each row execute function public.set_updated_at();
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger email_jobs_updated_at before update on public.email_jobs
  for each row execute function public.set_updated_at();

-- ===================== 0006_ops.sql =====================
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  company_id uuid references public.companies (id) on delete set null,
  employee_id uuid not null references public.profiles (id) on delete restrict,
  called_at timestamptz not null default now(),
  direction public.call_direction not null default 'outgoing',
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  outcome public.call_outcome not null,
  notes text,
  requirements text,
  next_action text,
  follow_up_at timestamptz,
  priority public.priority_level not null default 'medium',
  related_task_id uuid,
  related_quotation_id uuid,
  external_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calls_org_called_idx on public.calls (organization_id, called_at desc);
create index calls_org_employee_idx on public.calls (organization_id, employee_id, called_at desc);
create index calls_follow_up_idx on public.calls (organization_id, follow_up_at)
  where follow_up_at is not null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  kind public.task_kind not null default 'task',
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  due_at timestamptz,
  priority public.priority_level not null default 'medium',
  status public.task_status not null default 'pending',
  completed_at timestamptz,
  completion_notes text,
  related_call_id uuid references public.calls (id) on delete set null,
  related_campaign_id uuid references public.campaigns (id) on delete set null,
  related_meeting_id uuid,
  related_quotation_id uuid,
  related_project_id uuid,
  reminder_email boolean not null default false,
  recurrence_rule text,
  recurrence_parent_id uuid references public.tasks (id) on delete set null,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_org_due_idx on public.tasks (organization_id, due_at)
  where status in ('pending', 'in_progress');
create index tasks_org_assignee_idx on public.tasks (organization_id, assigned_to, status);

create unique index tasks_no_duplicate_followup
  on public.tasks (organization_id, contact_id, due_at, title)
  where kind = 'follow_up' and status in ('pending', 'in_progress') and contact_id is not null and due_at is not null;

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  title text not null,
  agenda text,
  notes text,
  outcome text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status public.meeting_status not null default 'scheduled',
  location text,
  calendar_sync_status text not null default 'not_configured',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  email text
);

create unique index meeting_attendees_user_unique
  on public.meeting_attendees (meeting_id, user_id)
  where user_id is not null;
create unique index meeting_attendees_contact_unique
  on public.meeting_attendees (meeting_id, contact_id)
  where contact_id is not null;

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  title text not null,
  stage public.deal_stage not null default 'new_lead',
  owner_id uuid references public.profiles (id) on delete set null,
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  currency text not null default 'INR',
  expected_close_date date,
  probability integer not null default 10 check (probability between 0 and 100),
  loss_reason text,
  next_action text,
  converted_project_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deals_org_stage_idx on public.deals (organization_id, stage);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  title text not null,
  status public.quotation_status not null default 'draft',
  currency text not null default 'INR',
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  requires_approval boolean not null default false,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  current_version integer not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotation_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  version_number integer not null,
  body_html text not null default '',
  line_items jsonb not null default '[]'::jsonb,
  total_amount numeric(14,2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quotation_id, version_number)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  name text not null,
  status public.project_status not null default 'planning',
  deadline date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (project_id, user_id)
);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  activity_type public.activity_type not null,
  summary text not null,
  outcome text,
  source_table text,
  source_id uuid,
  next_follow_up_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index activities_contact_time_idx on public.activities (contact_id, occurred_at desc);
create index activities_org_time_idx on public.activities (organization_id, occurred_at desc);

alter table public.calls
  add constraint calls_related_task_fk foreign key (related_task_id) references public.tasks (id) on delete set null;
alter table public.calls
  add constraint calls_related_quotation_fk foreign key (related_quotation_id) references public.quotations (id) on delete set null;
alter table public.tasks
  add constraint tasks_related_meeting_fk foreign key (related_meeting_id) references public.meetings (id) on delete set null;
alter table public.tasks
  add constraint tasks_related_quotation_fk foreign key (related_quotation_id) references public.quotations (id) on delete set null;
alter table public.tasks
  add constraint tasks_related_project_fk foreign key (related_project_id) references public.projects (id) on delete set null;
alter table public.documents
  add constraint documents_deal_fk foreign key (deal_id) references public.deals (id) on delete set null;
alter table public.documents
  add constraint documents_project_fk foreign key (project_id) references public.projects (id) on delete set null;
alter table public.documents
  add constraint documents_quotation_fk foreign key (quotation_id) references public.quotations (id) on delete set null;
alter table public.deals
  add constraint deals_converted_project_fk foreign key (converted_project_id) references public.projects (id) on delete set null;

create trigger calls_updated_at before update on public.calls
  for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger meetings_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();
create trigger quotations_updated_at before update on public.quotations
  for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ===================== 0007_functions.sql =====================
-- Membership helpers are SECURITY DEFINER so RLS on memberships does not recurse.
-- They only inspect auth.uid() and never accept a target user id.

create or replace function public.my_active_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.memberships
  where user_id = auth.uid()
    and status = 'active';
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where organization_id = p_org
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.my_org_role(p_org uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.memberships
  where organization_id = p_org
    and user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.has_write_role(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.my_org_role(p_org) in ('owner', 'admin', 'sales_manager', 'sales_executive');
$$;

create or replace function public.has_manage_role(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.my_org_role(p_org) in ('owner', 'admin', 'sales_manager');
$$;

create or replace function public.has_admin_role(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.my_org_role(p_org) in ('owner', 'admin');
$$;

create or replace function public.record_activity(
  p_org uuid,
  p_contact uuid,
  p_company uuid,
  p_type public.activity_type,
  p_summary text,
  p_outcome text default null,
  p_source_table text default null,
  p_source_id uuid default null,
  p_next_follow_up timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_org_member(p_org) then
    raise exception 'not a member of organization';
  end if;

  insert into public.activities (
    organization_id, contact_id, company_id, actor_user_id, activity_type,
    summary, outcome, source_table, source_id, next_follow_up_at
  ) values (
    p_org, p_contact, p_company, auth.uid(), p_type,
    p_summary, p_outcome, p_source_table, p_source_id, p_next_follow_up
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Worker-only: atomic claim. EXECUTE granted only to service_role.
create or replace function public.claim_email_jobs(
  p_limit integer,
  p_worker_id text,
  p_lease_seconds integer
)
returns setof public.email_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role', true) is distinct from 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'claim_email_jobs is restricted to service_role';
  end if;

  return query
  with picked as (
    select j.id
    from public.email_jobs j
    join public.campaigns c on c.id = j.campaign_id
    where j.status in ('queued', 'failed')
      and j.next_attempt_at <= now()
      and j.attempt_count < j.max_attempts
      and (j.locked_until is null or j.locked_until < now())
      and c.status in ('queued', 'sending', 'scheduled')
    order by j.next_attempt_at, j.created_at
    for update of j skip locked
    limit greatest(p_limit, 0)
  )
  update public.email_jobs j
  set
    status = 'claimed',
    locked_by = p_worker_id,
    locked_until = now() + make_interval(secs => greatest(p_lease_seconds, 30)),
    claimed_at = now(),
    attempt_count = j.attempt_count + 1
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

create or replace function public.increment_org_email_stat(
  p_org uuid,
  p_accepted integer,
  p_failed integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'restricted';
  end if;

  insert into public.org_email_daily_stats (organization_id, send_date, accepted_count, failed_count)
  values (p_org, (timezone('utc', now()))::date, greatest(p_accepted, 0), greatest(p_failed, 0))
  on conflict (organization_id, send_date)
  do update set
    accepted_count = org_email_daily_stats.accepted_count + excluded.accepted_count,
    failed_count = org_email_daily_stats.failed_count + excluded.failed_count;
end;
$$;

create or replace function public.org_email_remaining(p_org uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select greatest(
    o.daily_email_limit - coalesce(s.accepted_count, 0),
    0
  )
  from public.organizations o
  left join public.org_email_daily_stats s
    on s.organization_id = o.id
   and s.send_date = (timezone('utc', now()))::date
  where o.id = p_org;
$$;

revoke all on function public.claim_email_jobs(integer, text, integer) from public;
revoke all on function public.increment_org_email_stat(uuid, integer, integer) from public;
grant execute on function public.claim_email_jobs(integer, text, integer) to postgres;
grant execute on function public.increment_org_email_stat(uuid, integer, integer) to postgres;

grant execute on function public.my_active_org_ids() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.my_org_role(uuid) to authenticated;
grant execute on function public.has_write_role(uuid) to authenticated;
grant execute on function public.has_manage_role(uuid) to authenticated;
grant execute on function public.has_admin_role(uuid) to authenticated;
grant execute on function public.record_activity(uuid, uuid, uuid, public.activity_type, text, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.org_email_remaining(uuid) to authenticated;

-- ===================== 0008_rls.sql =====================
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_logs enable row level security;
alter table public.worker_heartbeats enable row level security;
alter table public.org_email_daily_stats enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_emails enable row level security;
alter table public.contact_phones enable row level security;
alter table public.contact_tags enable row level security;
alter table public.contact_tag_map enable row level security;
alter table public.contact_lists enable row level security;
alter table public.contact_list_members enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_errors enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.email_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.email_jobs enable row level security;
alter table public.email_events enable row level security;
alter table public.suppressions enable row level security;
alter table public.calls enable row level security;
alter table public.tasks enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.deals enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_versions enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_milestones enable row level security;
alter table public.activities enable row level security;

-- Profiles: a user sees self; org members see teammate profiles.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id
        and m.status = 'active'
        and public.is_org_member(m.organization_id)
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (public.has_admin_role(id))
  with check (public.has_admin_role(id));

create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));

create policy memberships_insert_admin on public.memberships
  for insert to authenticated
  with check (public.has_admin_role(organization_id));

create policy memberships_update_admin on public.memberships
  for update to authenticated
  using (public.has_admin_role(organization_id))
  with check (public.has_admin_role(organization_id));

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (public.is_org_member(organization_id) and actor_user_id = auth.uid());

create policy worker_heartbeats_none on public.worker_heartbeats
  for all to authenticated
  using (false)
  with check (false);

create policy org_email_stats_select on public.org_email_daily_stats
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Generic tenant policies
create policy companies_select on public.companies for select to authenticated using (public.is_org_member(organization_id));
create policy companies_insert on public.companies for insert to authenticated with check (public.has_write_role(organization_id));
create policy companies_update on public.companies for update to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));
create policy companies_delete on public.companies for delete to authenticated using (public.has_admin_role(organization_id));

create policy contacts_select on public.contacts for select to authenticated using (public.is_org_member(organization_id));
create policy contacts_insert on public.contacts for insert to authenticated with check (public.has_write_role(organization_id));
create policy contacts_update on public.contacts for update to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));
create policy contacts_delete on public.contacts for delete to authenticated using (public.has_admin_role(organization_id));

create policy contact_emails_select on public.contact_emails for select to authenticated using (public.is_org_member(organization_id));
create policy contact_emails_write on public.contact_emails for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_phones_select on public.contact_phones for select to authenticated using (public.is_org_member(organization_id));
create policy contact_phones_write on public.contact_phones for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_tags_select on public.contact_tags for select to authenticated using (public.is_org_member(organization_id));
create policy contact_tags_write on public.contact_tags for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_tag_map_select on public.contact_tag_map for select to authenticated using (public.is_org_member(organization_id));
create policy contact_tag_map_write on public.contact_tag_map for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_lists_select on public.contact_lists for select to authenticated using (public.is_org_member(organization_id));
create policy contact_lists_write on public.contact_lists for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_list_members_select on public.contact_list_members for select to authenticated using (public.is_org_member(organization_id));
create policy contact_list_members_write on public.contact_list_members for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy import_batches_select on public.import_batches for select to authenticated using (public.is_org_member(organization_id));
create policy import_batches_write on public.import_batches for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy import_errors_select on public.import_errors for select to authenticated using (public.is_org_member(organization_id));
create policy import_errors_insert on public.import_errors for insert to authenticated with check (public.has_write_role(organization_id));

create policy documents_select on public.documents for select to authenticated using (public.is_org_member(organization_id));
create policy documents_write on public.documents for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy email_templates_select on public.email_templates for select to authenticated using (public.is_org_member(organization_id));
create policy email_templates_write on public.email_templates for all to authenticated using (public.has_manage_role(organization_id)) with check (public.has_manage_role(organization_id));

create policy campaigns_select on public.campaigns for select to authenticated using (public.is_org_member(organization_id));
create policy campaigns_insert on public.campaigns for insert to authenticated with check (public.has_manage_role(organization_id));
create policy campaigns_update on public.campaigns for update to authenticated using (public.has_manage_role(organization_id)) with check (public.has_manage_role(organization_id));

create policy email_jobs_select on public.email_jobs for select to authenticated using (public.is_org_member(organization_id));
-- Jobs are inserted by Edge Function (service role). Authenticated users cannot insert jobs directly.
create policy email_jobs_no_client_write on public.email_jobs for insert to authenticated with check (false);
create policy email_jobs_update_manage on public.email_jobs for update to authenticated using (public.has_manage_role(organization_id)) with check (public.has_manage_role(organization_id));

create policy email_events_select on public.email_events for select to authenticated using (public.is_org_member(organization_id));
create policy email_events_insert on public.email_events for insert to authenticated with check (public.has_manage_role(organization_id));

create policy suppressions_select on public.suppressions for select to authenticated using (public.is_org_member(organization_id));
create policy suppressions_write on public.suppressions for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy calls_select on public.calls for select to authenticated using (public.is_org_member(organization_id));
create policy calls_write on public.calls for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy tasks_select on public.tasks for select to authenticated using (public.is_org_member(organization_id));
create policy tasks_write on public.tasks for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy meetings_select on public.meetings for select to authenticated using (public.is_org_member(organization_id));
create policy meetings_write on public.meetings for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy meeting_attendees_select on public.meeting_attendees for select to authenticated using (public.is_org_member(organization_id));
create policy meeting_attendees_write on public.meeting_attendees for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy deals_select on public.deals for select to authenticated using (public.is_org_member(organization_id));
create policy deals_write on public.deals for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy quotations_select on public.quotations for select to authenticated using (public.is_org_member(organization_id));
create policy quotations_write on public.quotations for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy quotation_versions_select on public.quotation_versions for select to authenticated using (public.is_org_member(organization_id));
create policy quotation_versions_write on public.quotation_versions for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy projects_select on public.projects for select to authenticated using (public.is_org_member(organization_id));
create policy projects_write on public.projects for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy project_members_select on public.project_members for select to authenticated using (public.is_org_member(organization_id));
create policy project_members_write on public.project_members for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy project_milestones_select on public.project_milestones for select to authenticated using (public.is_org_member(organization_id));
create policy project_milestones_write on public.project_milestones for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy activities_select on public.activities for select to authenticated using (public.is_org_member(organization_id));
create policy activities_insert on public.activities for insert to authenticated with check (public.has_write_role(organization_id));
-- Timeline rows are append-only for non-admins
create policy activities_update_admin on public.activities for update to authenticated using (public.has_admin_role(organization_id)) with check (public.has_admin_role(organization_id));

-- ===================== 0009_storage.sql =====================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-documents',
  'org-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Path convention: {organization_id}/{document_id}/{filename}

create policy storage_org_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'org-documents'
    and public.is_org_member((split_part(name, '/', 1))::uuid)
  );

create policy storage_org_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-documents'
    and public.has_write_role((split_part(name, '/', 1))::uuid)
  );

create policy storage_org_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'org-documents'
    and public.has_admin_role((split_part(name, '/', 1))::uuid)
  );

-- ===================== 0010_grants.sql =====================
grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated;

-- Tighten worker-only objects: authenticated cannot mutate heartbeats/stats.
revoke insert, update, delete on public.worker_heartbeats from authenticated;
revoke insert, update, delete on public.org_email_daily_stats from authenticated;
revoke insert, update, delete on public.email_jobs from authenticated;
revoke update, delete on public.audit_logs from authenticated;
grant update (status, last_error) on public.email_jobs to authenticated;

grant execute on function public.claim_email_jobs(integer, text, integer) to service_role;
grant execute on function public.increment_org_email_stat(uuid, integer, integer) to service_role;
revoke execute on function public.claim_email_jobs(integer, text, integer) from authenticated, anon;
revoke execute on function public.increment_org_email_stat(uuid, integer, integer) from authenticated, anon;

-- ===================== 0011_upsert_keys.sql =====================
alter table public.suppressions
  add column if not exists email_normalized text generated always as (lower(email)) stored;

drop index if exists public.suppressions_org_email_unique;
create unique index suppressions_org_email_unique
  on public.suppressions (organization_id, email_normalized);

alter table public.contacts
  add column if not exists primary_email_normalized text generated always as (lower(primary_email)) stored;

drop index if exists public.contacts_org_email_unique;
create unique index contacts_org_email_unique
  on public.contacts (organization_id, primary_email_normalized)
  where primary_email is not null and archived_at is null;

-- ===================== 0012_rate_limits.sql =====================
create table public.edge_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0)
);

alter table public.edge_rate_limits enable row level security;

create policy edge_rate_limits_deny_authenticated on public.edge_rate_limits
  for all to authenticated
  using (false)
  with check (false);

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.edge_rate_limits%rowtype;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'consume_rate_limit is restricted to service_role';
  end if;
  if p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;
  if p_bucket is null or length(p_bucket) < 3 or length(p_bucket) > 200 then
    raise exception 'invalid rate limit bucket';
  end if;

  insert into public.edge_rate_limits (bucket, window_started_at, hits)
  values (p_bucket, now(), 0)
  on conflict (bucket) do nothing;

  select * into rec from public.edge_rate_limits where bucket = p_bucket for update;

  if rec.window_started_at < now() - make_interval(secs => p_window_seconds) then
    update public.edge_rate_limits
    set window_started_at = now(), hits = 1
    where bucket = p_bucket;
    return true;
  end if;

  if rec.hits >= p_max then
    return false;
  end if;

  update public.edge_rate_limits set hits = hits + 1 where bucket = p_bucket;
  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, integer, integer) from authenticated, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
grant all on table public.edge_rate_limits to service_role;
revoke insert, update, delete on public.edge_rate_limits from authenticated;

-- ===================== 0013_demo_email.sql =====================
-- 0013_demo_email.sql
-- Table for queuing and tracking demo / test emails sent for email templates

create table if not exists public.demo_email_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid references public.email_templates (id) on delete set null,
  requested_by uuid references public.profiles (id) on delete set null,
  recipient_email text not null,
  subject text not null,
  body_text text not null default '',
  body_html text not null default '',
  status text not null default 'pending', -- 'pending', 'processing', 'sent', 'failed'
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists demo_email_requests_status_idx
  on public.demo_email_requests (status, created_at)
  where status = 'pending';

create index if not exists demo_email_requests_org_idx
  on public.demo_email_requests (organization_id);

alter table public.demo_email_requests enable row level security;

create policy demo_email_requests_select on public.demo_email_requests
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy demo_email_requests_insert on public.demo_email_requests
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy demo_email_requests_update on public.demo_email_requests
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update on public.demo_email_requests to authenticated;
grant all on public.demo_email_requests to service_role;

-- ===================== 0014_queue_campaign_rpc.sql =====================
-- 0014_queue_campaign_rpc.sql
-- Provides a reliable database-level fallback for queueing campaigns
-- in environments where Edge Functions are not deployed or reach rate limits.

create or replace function public.queue_campaign(
  p_campaign_id uuid,
  p_confirmed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_queued_count integer := 0;
  v_is_scheduled boolean;
begin
  if not coalesce(p_confirmed, false) then
    raise exception 'confirmation_required';
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;

  if not found then
    raise exception 'campaign_not_found';
  end if;

  if not public.has_manage_role(v_campaign.organization_id) then
    raise exception 'forbidden';
  end if;

  if v_campaign.status not in ('draft', 'scheduled', 'paused') then
    raise exception 'invalid_status: %', v_campaign.status;
  end if;

  v_is_scheduled := v_campaign.scheduled_at is not null and v_campaign.scheduled_at > now();

  -- Fan out jobs into email_jobs with variable substitution and deduplication
  with eligible_contacts as (
    select c.id, c.primary_email, c.full_name, c.company_name, c.service_interest, c.primary_phone, c.city
    from public.contacts c
    where c.organization_id = v_campaign.organization_id
      and c.archived_at is null
      and c.primary_email is not null
      and c.primary_email <> ''
      and (v_campaign.list_id is null or c.id in (
        select clm.contact_id from public.contact_list_members clm where clm.list_id = v_campaign.list_id
      ))
      and lower(c.primary_email) not in (
        select lower(s.email) from public.suppressions s where s.organization_id = v_campaign.organization_id
      )
      and (not v_campaign.requires_consent or c.consent_status = 'granted')
  ),
  inserted_jobs as (
    insert into public.email_jobs (
      organization_id,
      campaign_id,
      contact_id,
      to_email,
      subject,
      body_text,
      body_html,
      status,
      scheduled_at,
      next_attempt_at,
      idempotency_key
    )
    select
      v_campaign.organization_id,
      v_campaign.id,
      ec.id,
      ec.primary_email,
      replace(replace(replace(replace(replace(replace(v_campaign.subject, '{{name}}', coalesce(ec.full_name, '')), '{{company}}', coalesce(ec.company_name, '')), '{{service}}', coalesce(ec.service_interest, '')), '{{email}}', coalesce(ec.primary_email, '')), '{{phone}}', coalesce(ec.primary_phone, '')), '{{city}}', coalesce(ec.city, '')),
      replace(replace(replace(replace(replace(replace(v_campaign.body_text, '{{name}}', coalesce(ec.full_name, '')), '{{company}}', coalesce(ec.company_name, '')), '{{service}}', coalesce(ec.service_interest, '')), '{{email}}', coalesce(ec.primary_email, '')), '{{phone}}', coalesce(ec.primary_phone, '')), '{{city}}', coalesce(ec.city, '')),
      case when v_campaign.body_html is not null and length(trim(v_campaign.body_html)) > 0
        then replace(replace(replace(replace(replace(replace(v_campaign.body_html, '{{name}}', coalesce(ec.full_name, '')), '{{company}}', coalesce(ec.company_name, '')), '{{service}}', coalesce(ec.service_interest, '')), '{{email}}', coalesce(ec.primary_email, '')), '{{phone}}', coalesce(ec.primary_phone, '')), '{{city}}', coalesce(ec.city, ''))
        else null
      end,
      'queued',
      coalesce(v_campaign.scheduled_at, now()),
      coalesce(v_campaign.scheduled_at, now()),
      v_campaign.id::text || ':' || ec.id::text
    from eligible_contacts ec
    on conflict (idempotency_key) do nothing
    returning id
  )
  select count(*) into v_queued_count from inserted_jobs;

  update public.campaigns
  set
    status = case when v_is_scheduled then 'scheduled' else 'queued' end,
    recipient_count = v_queued_count,
    queued_count = v_queued_count,
    updated_at = now()
  where id = v_campaign.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_table,
    entity_id,
    metadata
  ) values (
    v_campaign.organization_id,
    auth.uid(),
    'campaign.queued',
    'campaigns',
    v_campaign.id,
    jsonb_build_object('jobs', v_queued_count, 'scheduled', v_is_scheduled)
  );

  return jsonb_build_object(
    'ok', true,
    'queued', v_queued_count,
    'scheduled', v_is_scheduled
  );
end;
$$;

revoke all on function public.queue_campaign(uuid, boolean) from public;
grant execute on function public.queue_campaign(uuid, boolean) to authenticated;

-- ===================== 0015_public_inquiry.sql =====================
-- 0015_public_inquiry.sql
-- Additive schema for public lead inquiry form (/inquiry/:orgSlug) and abuse protection.
-- Safe to run on an existing database with existing data.

-- 1. Note: public.organizations already has a unique `slug` column (0003_core.sql)
--    and public.contacts already has `consent_captured_at` (0004_crm.sql).
--    Add nullable `consent_text` on contacts to record the consent wording accepted on submission.
alter table public.contacts
  add column if not exists consent_text text;

-- 2. Partial index to speed up mobile duplicate lookup per organization for non-archived contacts.
create index if not exists contacts_org_phone_idx
  on public.contacts (organization_id, primary_phone)
  where primary_phone is not null and archived_at is null;

-- 3. Dedicated rate-limit bucket table for public inquiry submissions (service_role only).
create table if not exists public.inquiry_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0)
);

alter table public.inquiry_rate_limits enable row level security;

drop policy if exists inquiry_rate_limits_deny_anon on public.inquiry_rate_limits;
create policy inquiry_rate_limits_deny_anon on public.inquiry_rate_limits
  for all to anon
  using (false)
  with check (false);

drop policy if exists inquiry_rate_limits_deny_authenticated on public.inquiry_rate_limits;
create policy inquiry_rate_limits_deny_authenticated on public.inquiry_rate_limits
  for all to authenticated
  using (false)
  with check (false);

create or replace function public.consume_inquiry_rate_limit(
  p_bucket text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.inquiry_rate_limits%rowtype;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'consume_inquiry_rate_limit is restricted to service_role';
  end if;
  if p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;
  if p_bucket is null or length(p_bucket) < 3 or length(p_bucket) > 200 then
    raise exception 'invalid rate limit bucket';
  end if;

  insert into public.inquiry_rate_limits (bucket, window_started_at, hits)
  values (p_bucket, now(), 0)
  on conflict (bucket) do nothing;

  select * into rec from public.inquiry_rate_limits where bucket = p_bucket for update;

  if rec.window_started_at < now() - make_interval(secs => p_window_seconds) then
    update public.inquiry_rate_limits
    set window_started_at = now(), hits = 1
    where bucket = p_bucket;
    return true;
  end if;

  if rec.hits >= p_max then
    return false;
  end if;

  update public.inquiry_rate_limits set hits = hits + 1 where bucket = p_bucket;
  return true;
end;
$$;

revoke all on function public.consume_inquiry_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_inquiry_rate_limit(text, integer, integer) from authenticated, anon;
grant execute on function public.consume_inquiry_rate_limit(text, integer, integer) to service_role;

revoke all on table public.inquiry_rate_limits from public, anon, authenticated;
grant all on table public.inquiry_rate_limits to service_role;

-- Rollback notes (run manually only if reverting this feature completely):
-- drop function if exists public.consume_inquiry_rate_limit(text, integer, integer);
-- drop table if exists public.inquiry_rate_limits;
-- drop index if exists public.contacts_org_phone_idx;
-- alter table public.contacts drop column if exists consent_text;

-- ===================== 0016_messages_and_webmail.sql =====================
-- 0016_messages_and_webmail.sql
-- Unified Webmail message store for Inbox (inbound emails/replies), Sent (outbound dispatches),
-- Drafts, Queued, and Failed messages. Supports multi-tenant RLS, Resend message tracking,
-- and contact association.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  folder text not null default 'inbox' check (folder in ('inbox', 'sent', 'queued', 'failed', 'trash', 'draft')),
  status text not null default 'delivered' check (status in ('received', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  from_name text not null default '',
  from_email text not null,
  to_name text not null default '',
  to_email text not null,
  reply_to text,
  subject text not null default '(No Subject)',
  body_text text not null default '',
  body_html text not null default '',
  provider text not null default 'resend',
  provider_message_id text,
  thread_id text,
  in_reply_to text,
  is_read boolean not null default false,
  is_starred boolean not null default false,
  read_at timestamptz,
  headers jsonb not null default '{}'::jsonb,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_org_folder_idx
  on public.messages (organization_id, folder, created_at desc);

create index if not exists messages_org_contact_idx
  on public.messages (organization_id, contact_id, created_at desc);

create index if not exists messages_provider_id_idx
  on public.messages (provider_message_id)
  where provider_message_id is not null;

create index if not exists messages_org_unread_idx
  on public.messages (organization_id, folder, is_read)
  where is_read = false;

create trigger messages_updated_at before update on public.messages
  for each row execute function public.set_updated_at();

-- RLS
alter table public.messages enable row level security;

-- Members can select messages of their organization
create policy "members_read_org_messages" on public.messages
  for select
  using (public.is_org_member(organization_id));

-- Members can insert outbound messages for their organization
create policy "members_insert_org_messages" on public.messages
  for insert
  with check (public.is_org_member(organization_id));

-- Members can update folder / is_read / is_starred of their organization's messages
create policy "members_update_org_messages" on public.messages
  for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Service role bypasses RLS automatically (used by worker and webhook edge functions)
grant select, insert, update on public.messages to authenticated;

-- ===================== 0017_ownership_columns.sql =====================
-- 0017_ownership_columns.sql
-- Adds a single-owner attribution column to every primary CRM/record table so RLS
-- can enforce "private by default" visibility in a later migration. Purely additive:
-- columns are nullable and no policy behavior changes in this migration.

alter table public.companies add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.contacts add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.calls add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.tasks add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.meetings add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.deals add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.quotations add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.projects add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.documents add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.messages add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.demo_email_requests add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.import_batches add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;

create index if not exists companies_org_owner_idx on public.companies (organization_id, owner_user_id);
create index if not exists contacts_org_owner_idx on public.contacts (organization_id, owner_user_id);
create index if not exists calls_org_owner_idx on public.calls (organization_id, owner_user_id);
create index if not exists tasks_org_owner_idx on public.tasks (organization_id, owner_user_id);
create index if not exists meetings_org_owner_idx on public.meetings (organization_id, owner_user_id);
create index if not exists deals_org_owner_idx on public.deals (organization_id, owner_user_id);
create index if not exists quotations_org_owner_idx on public.quotations (organization_id, owner_user_id);
create index if not exists projects_org_owner_idx on public.projects (organization_id, owner_user_id);
create index if not exists documents_org_owner_idx on public.documents (organization_id, owner_user_id);
create index if not exists messages_org_owner_idx on public.messages (organization_id, owner_user_id);
create index if not exists demo_email_requests_org_owner_idx on public.demo_email_requests (organization_id, owner_user_id);
create index if not exists import_batches_org_owner_idx on public.import_batches (organization_id, owner_user_id);

-- ===================== 0018_ownership_backfill.sql =====================
-- 0018_ownership_backfill.sql
-- Data-only migration: populate owner_user_id from the best existing attribution
-- column, falling back to the organization's owner-role member. owner_user_id is
-- intentionally left nullable forever -- a null owner stays admin-only visible
-- (see 0020/0021) rather than forcing a risky NOT NULL cutover on legacy rows.

update public.companies t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.contacts t
set owner_user_id = coalesce(
  t.assigned_to,
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.calls t
set owner_user_id = t.employee_id
where t.owner_user_id is null;

update public.tasks t
set owner_user_id = coalesce(
  t.assigned_to,
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.meetings t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.deals t
set owner_user_id = coalesce(
  t.owner_id,
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.quotations t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.projects t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.documents t
set owner_user_id = coalesce(
  t.uploaded_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.messages t
set owner_user_id = (
  select m.user_id from public.memberships m
  where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
  order by m.created_at limit 1
)
where t.owner_user_id is null;

update public.demo_email_requests t
set owner_user_id = coalesce(
  t.requested_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.import_batches t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

-- ===================== 0019_accept_invite_rpc.sql =====================
-- 0019_accept_invite_rpc.sql
-- Fixes the invite-acceptance gap: invite-member sets memberships.status = 'invited'
-- but nothing ever flipped it to 'active' except organization-bootstrap (first owner
-- only). This RPC lets the invited user self-activate their own membership.

create or replace function public.accept_invite(p_organization_id uuid)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.memberships;
begin
  update public.memberships
  set status = 'active', accepted_at = now()
  where organization_id = p_organization_id
    and user_id = auth.uid()
    and status = 'invited'
  returning * into v_row;

  if v_row.user_id is null then
    raise exception 'no pending invite found for this organization';
  end if;

  return v_row;
end;
$$;

revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.accept_invite(uuid) to authenticated;

-- ===================== 0020_private_rls_tier_a.sql =====================
-- 0020_private_rls_tier_a.sql
-- Private-by-default RLS for primary record tables: an employee sees/writes only
-- records they own; owner/admin role ("Super Admin", org-scoped) sees/manages all
-- records in their own organization. Cross-org access is unaffected (is_org_member/
-- has_admin_role already enforce the organization boundary).
--
-- A BEFORE UPDATE trigger additionally blocks any non-admin from changing
-- owner_user_id or organization_id on their own records, regardless of role overlap
-- across multiple org memberships.

create or replace function public.prevent_ownership_tamper()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     and not public.has_admin_role(old.organization_id) then
    raise exception 'organization_id cannot be changed';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id
     and not public.has_admin_role(old.organization_id) then
    raise exception 'owner_user_id can only be changed by an organization admin';
  end if;

  return new;
end;
$$;

-- companies ------------------------------------------------------------
drop policy if exists companies_select on public.companies;
drop policy if exists companies_insert on public.companies;
drop policy if exists companies_update on public.companies;

create policy companies_select on public.companies for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy companies_insert on public.companies for insert to authenticated with check (
  public.has_write_role(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy companies_update on public.companies for update to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists companies_prevent_tamper on public.companies;
create trigger companies_prevent_tamper before update on public.companies
  for each row execute function public.prevent_ownership_tamper();

-- contacts -------------------------------------------------------------
drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;

create policy contacts_select on public.contacts for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy contacts_insert on public.contacts for insert to authenticated with check (
  public.has_write_role(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy contacts_update on public.contacts for update to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists contacts_prevent_tamper on public.contacts;
create trigger contacts_prevent_tamper before update on public.contacts
  for each row execute function public.prevent_ownership_tamper();

-- calls ------------------------------------------------------------------
drop policy if exists calls_write on public.calls;
drop policy if exists calls_select on public.calls;

create policy calls_select on public.calls for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy calls_write on public.calls for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists calls_prevent_tamper on public.calls;
create trigger calls_prevent_tamper before update on public.calls
  for each row execute function public.prevent_ownership_tamper();

-- tasks --------------------------------------------------------------------
drop policy if exists tasks_write on public.tasks;
drop policy if exists tasks_select on public.tasks;

create policy tasks_select on public.tasks for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy tasks_write on public.tasks for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists tasks_prevent_tamper on public.tasks;
create trigger tasks_prevent_tamper before update on public.tasks
  for each row execute function public.prevent_ownership_tamper();

-- meetings (owner OR listed attendee may view/collaborate) -----------------
drop policy if exists meetings_write on public.meetings;
drop policy if exists meetings_select on public.meetings;

create policy meetings_select on public.meetings for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or exists (select 1 from public.meeting_attendees ma where ma.meeting_id = meetings.id and ma.user_id = auth.uid())
  )
);
create policy meetings_write on public.meetings for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists meetings_prevent_tamper on public.meetings;
create trigger meetings_prevent_tamper before update on public.meetings
  for each row execute function public.prevent_ownership_tamper();

-- deals ----------------------------------------------------------------------
drop policy if exists deals_write on public.deals;
drop policy if exists deals_select on public.deals;

create policy deals_select on public.deals for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy deals_write on public.deals for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists deals_prevent_tamper on public.deals;
create trigger deals_prevent_tamper before update on public.deals
  for each row execute function public.prevent_ownership_tamper();

-- quotations -------------------------------------------------------------------
drop policy if exists quotations_write on public.quotations;
drop policy if exists quotations_select on public.quotations;

create policy quotations_select on public.quotations for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy quotations_write on public.quotations for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists quotations_prevent_tamper on public.quotations;
create trigger quotations_prevent_tamper before update on public.quotations
  for each row execute function public.prevent_ownership_tamper();

-- projects (owner OR listed project member may view/collaborate) -----------------
drop policy if exists projects_write on public.projects;
drop policy if exists projects_select on public.projects;

create policy projects_select on public.projects for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or exists (select 1 from public.project_members pm where pm.project_id = projects.id and pm.user_id = auth.uid())
  )
);
create policy projects_write on public.projects for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists projects_prevent_tamper on public.projects;
create trigger projects_prevent_tamper before update on public.projects
  for each row execute function public.prevent_ownership_tamper();

-- documents -------------------------------------------------------------------
drop policy if exists documents_write on public.documents;
drop policy if exists documents_select on public.documents;

create policy documents_select on public.documents for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy documents_write on public.documents for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists documents_prevent_tamper on public.documents;
create trigger documents_prevent_tamper before update on public.documents
  for each row execute function public.prevent_ownership_tamper();

-- messages (Webmail) -----------------------------------------------------------
drop policy if exists members_read_org_messages on public.messages;
drop policy if exists members_insert_org_messages on public.messages;
drop policy if exists members_update_org_messages on public.messages;

create policy members_read_org_messages on public.messages for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy members_insert_org_messages on public.messages for insert to authenticated with check (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy members_update_org_messages on public.messages for update to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists messages_prevent_tamper on public.messages;
create trigger messages_prevent_tamper before update on public.messages
  for each row execute function public.prevent_ownership_tamper();

-- demo_email_requests -----------------------------------------------------------
drop policy if exists demo_email_requests_select on public.demo_email_requests;
drop policy if exists demo_email_requests_insert on public.demo_email_requests;
drop policy if exists demo_email_requests_update on public.demo_email_requests;

create policy demo_email_requests_select on public.demo_email_requests for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy demo_email_requests_insert on public.demo_email_requests for insert to authenticated with check (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy demo_email_requests_update on public.demo_email_requests for update to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists demo_email_requests_prevent_tamper on public.demo_email_requests;
create trigger demo_email_requests_prevent_tamper before update on public.demo_email_requests
  for each row execute function public.prevent_ownership_tamper();

-- import_batches -----------------------------------------------------------------
drop policy if exists import_batches_write on public.import_batches;
drop policy if exists import_batches_select on public.import_batches;

create policy import_batches_select on public.import_batches for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy import_batches_write on public.import_batches for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists import_batches_prevent_tamper on public.import_batches;
create trigger import_batches_prevent_tamper before update on public.import_batches
  for each row execute function public.prevent_ownership_tamper();

-- ===================== 0021_private_rls_tier_b.sql =====================
-- 0021_private_rls_tier_b.sql
-- Child/detail tables have no owner_user_id of their own -- they inherit visibility
-- from their parent Tier A record (0020). contact_tags, contact_lists and
-- contact_list_members remain org-shared (Tier C, unchanged): they're campaign
-- targeting config, not personal pipeline data.

-- contact_emails (inherits contacts.owner_user_id) --------------------------------
drop policy if exists contact_emails_select on public.contact_emails;
drop policy if exists contact_emails_write on public.contact_emails;

create policy contact_emails_select on public.contact_emails for select to authenticated using (
  exists (
    select 1 from public.contacts c
    where c.id = contact_emails.contact_id
      and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
  )
);
create policy contact_emails_write on public.contact_emails for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_emails.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_emails.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  );

-- contact_phones (inherits contacts.owner_user_id) --------------------------------
drop policy if exists contact_phones_select on public.contact_phones;
drop policy if exists contact_phones_write on public.contact_phones;

create policy contact_phones_select on public.contact_phones for select to authenticated using (
  exists (
    select 1 from public.contacts c
    where c.id = contact_phones.contact_id
      and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
  )
);
create policy contact_phones_write on public.contact_phones for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_phones.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_phones.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  );

-- contact_tag_map (inherits contacts.owner_user_id) -------------------------------
drop policy if exists contact_tag_map_select on public.contact_tag_map;
drop policy if exists contact_tag_map_write on public.contact_tag_map;

create policy contact_tag_map_select on public.contact_tag_map for select to authenticated using (
  exists (
    select 1 from public.contacts c
    where c.id = contact_tag_map.contact_id
      and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
  )
);
create policy contact_tag_map_write on public.contact_tag_map for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tag_map.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tag_map.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  );

-- quotation_versions (inherits quotations.owner_user_id) --------------------------
drop policy if exists quotation_versions_select on public.quotation_versions;
drop policy if exists quotation_versions_write on public.quotation_versions;

create policy quotation_versions_select on public.quotation_versions for select to authenticated using (
  exists (
    select 1 from public.quotations q
    where q.id = quotation_versions.quotation_id
      and (q.owner_user_id = auth.uid() or public.has_admin_role(q.organization_id))
  )
);
create policy quotation_versions_write on public.quotation_versions for all to authenticated
  using (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_versions.quotation_id
        and (q.owner_user_id = auth.uid() or public.has_admin_role(q.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_versions.quotation_id
        and (q.owner_user_id = auth.uid() or public.has_admin_role(q.organization_id))
    )
  );

-- project_milestones (inherits projects.owner_user_id, OR listed project member) ---
drop policy if exists project_milestones_select on public.project_milestones;
drop policy if exists project_milestones_write on public.project_milestones;

create policy project_milestones_select on public.project_milestones for select to authenticated using (
  exists (
    select 1 from public.projects p
    where p.id = project_milestones.project_id
      and (
        p.owner_user_id = auth.uid()
        or public.has_admin_role(p.organization_id)
        or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
      )
  )
);
create policy project_milestones_write on public.project_milestones for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_milestones.project_id
        and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_milestones.project_id
        and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
    )
  );

-- project_members (visible to the project owner, admins, and fellow members) ------
drop policy if exists project_members_select on public.project_members;
drop policy if exists project_members_write on public.project_members;

create policy project_members_select on public.project_members for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.projects p
    where p.id = project_members.project_id
      and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
  )
);
create policy project_members_write on public.project_members for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
    )
  );

-- meeting_attendees (visible to the meeting owner, admins, and fellow attendees) ---
drop policy if exists meeting_attendees_select on public.meeting_attendees;
drop policy if exists meeting_attendees_write on public.meeting_attendees;

create policy meeting_attendees_select on public.meeting_attendees for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.meetings m
    where m.id = meeting_attendees.meeting_id
      and (m.owner_user_id = auth.uid() or public.has_admin_role(m.organization_id))
  )
);
create policy meeting_attendees_write on public.meeting_attendees for all to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendees.meeting_id
        and (m.owner_user_id = auth.uid() or public.has_admin_role(m.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendees.meeting_id
        and (m.owner_user_id = auth.uid() or public.has_admin_role(m.organization_id))
    )
  );

-- import_errors (inherits import_batches.owner_user_id) ---------------------------
drop policy if exists import_errors_select on public.import_errors;
drop policy if exists import_errors_insert on public.import_errors;

create policy import_errors_select on public.import_errors for select to authenticated using (
  exists (
    select 1 from public.import_batches b
    where b.id = import_errors.batch_id
      and (b.owner_user_id = auth.uid() or public.has_admin_role(b.organization_id))
  )
);
create policy import_errors_insert on public.import_errors for insert to authenticated with check (
  exists (
    select 1 from public.import_batches b
    where b.id = import_errors.batch_id
      and (b.owner_user_id = auth.uid() or public.has_admin_role(b.organization_id))
  )
);

-- ===================== 0022_activities_and_audit_rls.sql =====================
-- 0022_activities_and_audit_rls.sql
-- activities: visible to the person who performed it, the owner of the linked
-- contact, or an org admin. audit_logs: tightened to admin-only (Super Admin),
-- matching the UI gate's original intent (previously any org member could read it).

drop policy if exists activities_select on public.activities;

create policy activities_select on public.activities for select to authenticated using (
  public.is_org_member(organization_id)
  and (
    actor_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or exists (
      select 1 from public.contacts c
      where c.id = activities.contact_id
        and c.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists audit_logs_select on public.audit_logs;

create policy audit_logs_select on public.audit_logs for select to authenticated using (
  public.has_admin_role(organization_id)
);

-- ===================== 0023_fix_recursive_rls.sql =====================
-- 0023_fix_recursive_rls.sql
-- meetings<->meeting_attendees and projects<->project_members each query each
-- other directly inside their RLS policies, which causes Postgres to recurse
-- into the other table's policy and back ("infinite recursion detected in
-- policy for relation ..."). Fix: route the cross-table checks through
-- SECURITY DEFINER helpers (same pattern as is_org_member/my_org_role in
-- 0007_functions.sql) so the inner lookup bypasses RLS instead of
-- re-evaluating it.

create or replace function public.is_meeting_owner_or_admin(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting_id
      and (m.owner_user_id = auth.uid() or public.has_admin_role(m.organization_id))
  );
$$;

create or replace function public.is_meeting_attendee(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meeting_attendees ma
    where ma.meeting_id = p_meeting_id
      and ma.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner_or_admin(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
  );
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

-- meetings ---------------------------------------------------------------
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or public.is_meeting_attendee(id)
  )
);

-- meeting_attendees --------------------------------------------------------
drop policy if exists meeting_attendees_select on public.meeting_attendees;
drop policy if exists meeting_attendees_write on public.meeting_attendees;

create policy meeting_attendees_select on public.meeting_attendees for select to authenticated using (
  user_id = auth.uid() or public.is_meeting_owner_or_admin(meeting_id)
);
create policy meeting_attendees_write on public.meeting_attendees for all to authenticated
  using (public.is_meeting_owner_or_admin(meeting_id))
  with check (public.is_meeting_owner_or_admin(meeting_id));

-- projects -----------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or public.is_project_member(id)
  )
);

-- project_members ------------------------------------------------------------
drop policy if exists project_members_select on public.project_members;
drop policy if exists project_members_write on public.project_members;

create policy project_members_select on public.project_members for select to authenticated using (
  user_id = auth.uid() or public.is_project_owner_or_admin(project_id)
);
create policy project_members_write on public.project_members for all to authenticated
  using (public.is_project_owner_or_admin(project_id))
  with check (public.is_project_owner_or_admin(project_id));

-- project_milestones (was also indirectly recursive via the raw `projects` join) --
drop policy if exists project_milestones_select on public.project_milestones;
drop policy if exists project_milestones_write on public.project_milestones;

create policy project_milestones_select on public.project_milestones for select to authenticated using (
  public.is_project_owner_or_admin(project_id) or public.is_project_member(project_id)
);
create policy project_milestones_write on public.project_milestones for all to authenticated
  using (public.is_project_owner_or_admin(project_id))
  with check (public.is_project_owner_or_admin(project_id));

-- ===================== 0024_outbound_message_retry.sql =====================
-- 0024_outbound_message_retry.sql
-- Outbound Webmail replies (messages.direction = 'outbound') were claimed by immediately
-- writing folder='sent' before the send was attempted, so a worker crash mid-send left the
-- row permanently mislabeled as sent with no retry/backoff/daily-quota path. Add the same
-- claim/retry bookkeeping already used by the campaign queue (email_jobs) so outbound
-- messages get correct status transitions and crash recovery. Additive only; no existing
-- column, row, or constraint is altered destructively.

alter table public.messages
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists locked_until timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists last_error text;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('received', 'queued', 'processing', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'));

create index if not exists messages_outbound_claim_idx
  on public.messages (organization_id, next_attempt_at)
  where direction = 'outbound' and folder = 'queued' and status = 'queued';

-- ===================== 0025_manager_view_all_and_private_campaigns.sql =====================
-- 0025_manager_view_all_and_private_campaigns.sql
-- Visibility model (requested by the business owner):
--   * Employees (sales_executive, viewer) see only records they own.
--   * owner, admin AND sales_manager can VIEW every record in their organization.
--     Writes on other people's records stay owner/admin only (unchanged).
--   * Campaigns and their per-recipient jobs/events are visible only to
--     owner/admin/sales_manager (they expose recipient addresses of everyone's contacts).
-- Only SELECT policies are altered; audit_logs stays admin-only. Rollback: rollback/0025_rollback.sql

create or replace function public.has_view_all_role(p_org uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.my_org_role(p_org) in ('owner', 'admin', 'sales_manager');
$$;

revoke all on function public.has_view_all_role(uuid) from public, anon;
grant execute on function public.has_view_all_role(uuid) to authenticated, service_role;

alter policy "activities_select" on public.activities using (is_org_member(organization_id) AND ((actor_user_id = auth.uid()) OR has_view_all_role(organization_id) OR (EXISTS ( SELECT 1 FROM contacts c WHERE ((c.id = activities.contact_id) AND (c.owner_user_id = auth.uid()))))));

alter policy "calls_select" on public.calls using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "campaigns_select" on public.campaigns using (is_org_member(organization_id) AND has_manage_role(organization_id));

alter policy "companies_select" on public.companies using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "contact_emails_select" on public.contact_emails using (EXISTS ( SELECT 1 FROM contacts c WHERE ((c.id = contact_emails.contact_id) AND ((c.owner_user_id = auth.uid()) OR has_view_all_role(c.organization_id)))));

alter policy "contact_phones_select" on public.contact_phones using (EXISTS ( SELECT 1 FROM contacts c WHERE ((c.id = contact_phones.contact_id) AND ((c.owner_user_id = auth.uid()) OR has_view_all_role(c.organization_id)))));

alter policy "contact_tag_map_select" on public.contact_tag_map using (EXISTS ( SELECT 1 FROM contacts c WHERE ((c.id = contact_tag_map.contact_id) AND ((c.owner_user_id = auth.uid()) OR has_view_all_role(c.organization_id)))));

alter policy "contacts_select" on public.contacts using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "deals_select" on public.deals using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "demo_email_requests_select" on public.demo_email_requests using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "documents_select" on public.documents using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "email_events_select" on public.email_events using (is_org_member(organization_id) AND has_manage_role(organization_id));

alter policy "email_jobs_select" on public.email_jobs using (is_org_member(organization_id) AND has_manage_role(organization_id));

alter policy "import_batches_select" on public.import_batches using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "import_errors_select" on public.import_errors using (EXISTS ( SELECT 1 FROM import_batches b WHERE ((b.id = import_errors.batch_id) AND ((b.owner_user_id = auth.uid()) OR has_view_all_role(b.organization_id)))));

alter policy "meeting_attendees_select" on public.meeting_attendees using (((user_id = auth.uid()) OR is_meeting_owner_or_admin(meeting_id)) OR EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_attendees.meeting_id AND has_view_all_role(m.organization_id)));

alter policy "meetings_select" on public.meetings using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id) OR is_meeting_attendee(id)));

alter policy "members_read_org_messages" on public.messages using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "project_members_select" on public.project_members using (((user_id = auth.uid()) OR is_project_owner_or_admin(project_id)) OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_members.project_id AND has_view_all_role(p.organization_id)));

alter policy "project_milestones_select" on public.project_milestones using ((is_project_owner_or_admin(project_id) OR is_project_member(project_id)) OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_milestones.project_id AND has_view_all_role(p.organization_id)));

alter policy "projects_select" on public.projects using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id) OR is_project_member(id)));

alter policy "quotation_versions_select" on public.quotation_versions using (EXISTS ( SELECT 1 FROM quotations q WHERE ((q.id = quotation_versions.quotation_id) AND ((q.owner_user_id = auth.uid()) OR has_view_all_role(q.organization_id)))));

alter policy "quotations_select" on public.quotations using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "tasks_select" on public.tasks using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

-- ===================== 0026_mail_composer.sql =====================
-- 0026_mail_composer.sql
-- Gmail-style composer for the Webmail module (public.messages):
--   * CC / BCC recipients, company link, attachments, RFC Message-ID for threading
--   * Drafts (folder = 'draft', status = 'draft'), editable and deletable by their owner
--   * Per-user email signature (profiles.email_signature_html)
--   * Storage: private "mail-attachments" bucket, public "mail-images" bucket (inline images
--     must be reachable by the recipient's mail client)
--   * A guard trigger so browser clients can only create drafts/queued outbound mail as
--     themselves and can never rewrite mail that is already queued, sent or received.
-- Additive: existing rows, campaign tables and the inbound/tracking pipeline are untouched.
-- Rollback: supabase/rollback/0026_rollback.sql

-- 1. Columns ------------------------------------------------------------------------------
alter table public.messages
  add column if not exists cc text[] not null default '{}',
  add column if not exists bcc text[] not null default '{}',
  add column if not exists company_id uuid references public.companies (id) on delete set null,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists rfc_message_id text;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('draft', 'received', 'queued', 'processing', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'));

alter table public.messages drop constraint if exists messages_attachments_is_array;
alter table public.messages add constraint messages_attachments_is_array
  check (jsonb_typeof(attachments) = 'array');

create index if not exists messages_thread_idx on public.messages (organization_id, thread_id, created_at)
  where thread_id is not null;
create index if not exists messages_rfc_id_idx on public.messages (rfc_message_id)
  where rfc_message_id is not null;

alter table public.profiles
  add column if not exists email_signature_html text not null default '';

alter table public.profiles drop constraint if exists profiles_signature_len;
alter table public.profiles add constraint profiles_signature_len
  check (length(email_signature_html) <= 20000);

-- 2. Attachment validation ---------------------------------------------------------------
-- Every attachment must live in the sender's own folder: {org}/{owner}/... and the set is
-- capped (10 files, 10 MB each, 20 MB total; Resend's hard limit is 40 MB per email).
create or replace function public.messages_attachments_valid(p_org uuid, p_owner uuid, p_att jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  a jsonb;
  total bigint := 0;
  prefix text := p_org::text || '/' || coalesce(p_owner::text, '-') || '/';
begin
  if p_att is null or jsonb_typeof(p_att) <> 'array' then return false; end if;
  if jsonb_array_length(p_att) > 10 then return false; end if;
  for a in select * from jsonb_array_elements(p_att) loop
    if jsonb_typeof(a) <> 'object'
       or coalesce(a->>'path', '') = ''
       or left(a->>'path', length(prefix)) <> prefix
       or position('..' in a->>'path') > 0
       or coalesce(a->>'name', '') = ''
       or length(a->>'name') > 255
       or coalesce((a->>'size')::bigint, 0) <= 0
       or (a->>'size')::bigint > 10485760 then
      return false;
    end if;
    total := total + (a->>'size')::bigint;
  end loop;
  return total <= 20971520;
end;
$$;

-- 3. Client guard ------------------------------------------------------------------------
create or replace function public.messages_client_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  n_recipients int;
begin
  -- Worker, webhooks and migrations run as service_role/postgres and are not restricted.
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.folder <> 'draft' then
    -- Queued / sent / received mail is immutable from the browser except read/star flags.
    if (to_jsonb(new) - array['is_read', 'is_starred', 'read_at', 'updated_at'])
       is distinct from (to_jsonb(old) - array['is_read', 'is_starred', 'read_at', 'updated_at']) then
      raise exception 'Only read/star flags can be changed on this message';
    end if;
    return new;
  end if;

  -- INSERT, or UPDATE of a draft (editing it, or sending it).
  if new.owner_user_id is distinct from auth.uid() then
    raise exception 'Messages can only be composed as yourself';
  end if;
  if tg_op = 'UPDATE' and old.owner_user_id is distinct from auth.uid() then
    raise exception 'Only the author can edit a draft';
  end if;
  if not public.has_write_role(new.organization_id) then
    raise exception 'Your role cannot send email';
  end if;
  if new.direction <> 'outbound' then
    raise exception 'Only outbound messages can be composed';
  end if;
  if not ((new.folder = 'draft' and new.status = 'draft') or (new.folder = 'queued' and new.status = 'queued')) then
    raise exception 'New messages must be a draft or queued';
  end if;

  n_recipients := coalesce(array_length(new.cc, 1), 0) + coalesce(array_length(new.bcc, 1), 0)
                  + case when coalesce(new.to_email, '') = '' then 0 else 1 end;
  if n_recipients > 50 then
    raise exception 'Too many recipients (max 50)';
  end if;
  if new.folder = 'queued' and coalesce(new.to_email, '') = '' then
    raise exception 'A recipient is required';
  end if;
  if length(new.body_html) > 1000000 or length(new.body_text) > 500000 then
    raise exception 'Message body is too large';
  end if;
  if not public.messages_attachments_valid(new.organization_id, new.owner_user_id, new.attachments) then
    raise exception 'Invalid attachments';
  end if;

  -- Provider bookkeeping is owned by the worker.
  new.provider_message_id := null;
  new.attempt_count := 0;
  new.locked_until := null;
  new.last_error := null;
  new.is_read := true;
  if new.folder = 'queued' then
    new.next_attempt_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists messages_client_guard on public.messages;
create trigger messages_client_guard
  before insert or update on public.messages
  for each row execute function public.messages_client_guard();

-- Drafts may be discarded by their author (sent/received mail is never deleted by clients).
drop policy if exists messages_delete_own_draft on public.messages;
create policy messages_delete_own_draft on public.messages
  for delete to authenticated
  using (owner_user_id = auth.uid() and folder = 'draft');

grant delete on public.messages to authenticated;

-- 4. Storage -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mail-attachments', 'mail-attachments', false, 10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv', 'text/plain',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/zip'
  ]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mail-images', 'mail-images', true, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Safe uuid parse so a malformed object path never raises inside a policy.
create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- Path convention for both buckets: {organization_id}/{user_id}/{random}/{filename}
drop policy if exists mail_attachments_select on storage.objects;
create policy mail_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mail-attachments'
    and public.is_org_member(public.try_uuid(split_part(name, '/', 1)))
    and (split_part(name, '/', 2) = auth.uid()::text
         or public.has_view_all_role(public.try_uuid(split_part(name, '/', 1))))
  );

drop policy if exists mail_attachments_insert on storage.objects;
create policy mail_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('mail-attachments', 'mail-images')
    and split_part(name, '/', 2) = auth.uid()::text
    and public.has_write_role(public.try_uuid(split_part(name, '/', 1)))
  );

drop policy if exists mail_attachments_delete on storage.objects;
create policy mail_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('mail-attachments', 'mail-images')
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- ===================== 0027_payments.sql =====================
-- 0027_payments.sql
-- Payment Management: payments recorded against approved quotations.
--   Customer -> Approved quotation -> Payment entry -> Receipt -> Outstanding balance.
--
-- Rules enforced in the database (not only in the UI):
--   * A payment can only be recorded against a quotation in status approved / sent / accepted.
--   * Contact, company and owner are copied from the quotation (cannot be spoofed).
--   * Outstanding = quotation.total_amount - sum(valid payments). Valid payments may not exceed
--     the quotation amount unless an Owner/Admin records an explicit excess-adjustment reason.
--   * Duplicate transaction references (same org, case-insensitive) are rejected.
--   * Payments are never deleted: they are voided with a reason, and every insert/update is
--     written to payment_audit (edit history).
--   * Visibility follows quotations: the quotation owner, and Owner/Admin/Sales Manager
--     (has_view_all_role). Writes: quotation owner (non-viewer) or Owner/Admin.
-- Rollback: supabase/rollback/0027_rollback.sql

-- 1. Enums --------------------------------------------------------------------------------
do $$ begin
  create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_kind as enum ('advance', 'partial', 'full');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_record_status as enum ('valid', 'void');
exception when duplicate_object then null; end $$;

-- 2. Receipt counters ---------------------------------------------------------------------
create table if not exists public.org_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  counter_key text not null,
  value bigint not null default 0,
  primary key (organization_id, counter_key)
);
alter table public.org_counters enable row level security;
-- No policies: only security-definer functions touch it.
revoke all on public.org_counters from anon, authenticated;

-- 3. Payments -----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quotation_id uuid not null references public.quotations (id) on delete restrict,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  owner_user_id uuid references public.profiles (id) on delete set null,
  receipt_number text not null,
  amount numeric(14, 2) not null check (amount > 0 and amount <= 1000000000),
  currency text not null default 'INR',
  payment_kind public.payment_kind not null default 'partial',
  payment_mode public.payment_mode not null,
  reference text check (reference is null or length(reference) between 1 and 120),
  payment_date date not null default current_date,
  notes text check (notes is null or length(notes) <= 2000),
  status public.payment_record_status not null default 'valid',
  excess_reason text check (excess_reason is null or length(excess_reason) between 5 and 500),
  excess_approved_by uuid references public.profiles (id) on delete set null,
  void_reason text check (void_reason is null or length(void_reason) between 3 and 500),
  voided_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payments_receipt_unique on public.payments (organization_id, receipt_number);
create unique index if not exists payments_reference_unique on public.payments (organization_id, lower(btrim(reference)))
  where status = 'valid' and reference is not null;
create index if not exists payments_quotation_idx on public.payments (quotation_id, payment_date);
create index if not exists payments_org_date_idx on public.payments (organization_id, payment_date desc);
create index if not exists payments_contact_idx on public.payments (organization_id, contact_id);

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- 4. Audit history ------------------------------------------------------------------------
create table if not exists public.payment_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payment_id uuid not null references public.payments (id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'voided')),
  actor_user_id uuid references public.profiles (id) on delete set null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payment_audit_payment_idx on public.payment_audit (payment_id, created_at);

-- 5. Validation trigger (security definer: needs every valid payment of the quotation to
--    compute the balance, regardless of who recorded them; it never returns data).
create or replace function public.payments_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
  others numeric(14, 2);
  -- NOTE: inside a SECURITY DEFINER function current_user is the function owner, so the
  -- caller is identified from the request JWT instead. No JWT = direct DB/service access.
  uid uuid := auth.uid();
  is_service boolean := auth.uid() is null or coalesce(auth.role(), '') = 'service_role';
  yr text;
  seq bigint;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.quotation_id is distinct from old.quotation_id
       or new.receipt_number is distinct from old.receipt_number
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Organization, quotation and receipt number of a payment cannot be changed';
    end if;
    if old.status = 'void' then
      raise exception 'A voided payment cannot be edited';
    end if;
  end if;

  select id, organization_id, owner_user_id, contact_id, company_id, status, total_amount, currency
    into q
    from public.quotations
   where id = new.quotation_id
   for update;  -- serialises concurrent payments on the same quotation

  if q.id is null or q.organization_id <> new.organization_id then
    raise exception 'Quotation not found in this organization';
  end if;
  if q.status::text not in ('approved', 'sent', 'accepted') then
    raise exception 'Payments can only be recorded against an approved quotation (current status: %)', q.status;
  end if;
  if coalesce(q.total_amount, 0) <= 0 then
    raise exception 'The quotation has no amount';
  end if;

  -- Derived fields: always from the quotation.
  new.contact_id := q.contact_id;
  new.company_id := q.company_id;
  new.owner_user_id := q.owner_user_id;
  new.currency := coalesce(q.currency, 'INR');
  new.reference := nullif(btrim(coalesce(new.reference, '')), '');
  new.updated_by := coalesce(uid, new.updated_by);

  if tg_op = 'INSERT' then
    new.created_by := coalesce(uid, new.created_by);
    new.status := 'valid';
    new.voided_at := null; new.voided_by := null; new.void_reason := null;
    yr := to_char(coalesce(new.payment_date, current_date), 'YYYY');
    insert into public.org_counters (organization_id, counter_key, value)
      values (new.organization_id, 'receipt-' || yr, 1)
      on conflict (organization_id, counter_key) do update set value = public.org_counters.value + 1
      returning value into seq;
    new.receipt_number := 'RCPT-' || yr || '-' || lpad(seq::text, 4, '0');
  end if;

  -- Voiding
  if tg_op = 'UPDATE' and new.status = 'void' and old.status = 'valid' then
    if coalesce(btrim(new.void_reason), '') = '' then
      raise exception 'A reason is required to void a payment';
    end if;
    new.voided_at := now();
    new.voided_by := uid;
    return new;
  end if;

  -- Balance check (only valid payments count). Lowering an amount or editing other fields of
  -- an existing payment is always allowed; only new money is checked against the balance.
  if tg_op = 'UPDATE' and new.amount <= old.amount then
    if new.excess_reason is distinct from old.excess_reason and not is_service and not public.has_admin_role(new.organization_id) then
      raise exception 'Only an Owner or Admin can change an excess adjustment';
    end if;
    return new;
  end if;

  select coalesce(sum(amount), 0) into others
    from public.payments
   where quotation_id = new.quotation_id and status = 'valid'
     and id <> new.id;

  if others + new.amount > q.total_amount then
    if new.excess_reason is null then
      raise exception 'Payment exceeds the outstanding balance (outstanding: %). An Owner/Admin must record an excess adjustment reason.',
        greatest(q.total_amount - others, 0);
    end if;
    if not is_service and not public.has_admin_role(new.organization_id) then
      raise exception 'Only an Owner or Admin can approve a payment above the quotation amount';
    end if;
    new.excess_approved_by := uid;
  elsif tg_op = 'INSERT' or new.excess_reason is distinct from old.excess_reason then
    -- No excess: clear any adjustment fields a client may have sent.
    new.excess_reason := null;
    new.excess_approved_by := null;
  end if;

  -- Kind: a single payment covering the whole amount is "full"; advance stays when chosen;
  -- otherwise "partial".
  if others = 0 and new.amount >= q.total_amount then
    new.payment_kind := 'full';
  elsif new.payment_kind = 'full' then
    new.payment_kind := 'partial';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_before_write on public.payments;
create trigger payments_before_write
  before insert or update on public.payments
  for each row execute function public.payments_before_write();

create or replace function public.payments_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diff jsonb := '{}'::jsonb;
  k text;
  watched text[] := array['amount', 'payment_mode', 'payment_kind', 'reference', 'payment_date', 'notes', 'status', 'excess_reason', 'void_reason'];
begin
  if tg_op = 'INSERT' then
    insert into public.payment_audit (organization_id, payment_id, action, actor_user_id, changes)
    values (new.organization_id, new.id, 'created', coalesce(auth.uid(), new.created_by),
            jsonb_build_object('amount', new.amount, 'payment_mode', new.payment_mode, 'payment_kind', new.payment_kind,
                               'reference', new.reference, 'payment_date', new.payment_date, 'receipt_number', new.receipt_number));
    return new;
  end if;
  foreach k in array watched loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      diff := diff || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.payment_audit (organization_id, payment_id, action, actor_user_id, changes)
    values (new.organization_id, new.id, case when new.status = 'void' and old.status = 'valid' then 'voided' else 'updated' end,
            auth.uid(), diff);
  end if;
  return new;
end;
$$;

drop trigger if exists payments_after_write on public.payments;
create trigger payments_after_write
  after insert or update on public.payments
  for each row execute function public.payments_after_write();

revoke all on function public.payments_before_write() from public, anon, authenticated;
revoke all on function public.payments_after_write() from public, anon, authenticated;

-- 6. RLS ----------------------------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.payment_audit enable row level security;

create or replace function public.can_write_quotation_payments(p_quotation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.quotations q
     where q.id = p_quotation
       and public.has_write_role(q.organization_id)
       and (q.owner_user_id = auth.uid() or public.has_admin_role(q.organization_id))
  );
$$;
revoke all on function public.can_write_quotation_payments(uuid) from public, anon;
grant execute on function public.can_write_quotation_payments(uuid) to authenticated, service_role;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_user_id = auth.uid() or created_by = auth.uid() or public.has_view_all_role(organization_id))
  );

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated
  with check (public.is_org_member(organization_id) and public.can_write_quotation_payments(quotation_id));

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated
  using (public.is_org_member(organization_id) and public.can_write_quotation_payments(quotation_id))
  with check (public.is_org_member(organization_id) and public.can_write_quotation_payments(quotation_id));

-- No delete policy: payments are voided, never deleted.
grant select, insert, update on public.payments to authenticated;
revoke delete on public.payments from authenticated;

drop policy if exists payment_audit_select on public.payment_audit;
create policy payment_audit_select on public.payment_audit
  for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_audit.payment_id));  -- inherits payments RLS
grant select on public.payment_audit to authenticated;
revoke insert, update, delete on public.payment_audit from authenticated;

-- 7. Summary view (security_invoker: callers only see quotations/payments RLS allows) ----
create or replace view public.quotation_payment_summary
with (security_invoker = true) as
select
  q.id as quotation_id,
  q.organization_id,
  q.owner_user_id,
  q.contact_id,
  q.company_id,
  q.title,
  q.status as quotation_status,
  q.currency,
  q.total_amount,
  q.created_at,
  q.approved_at,
  coalesce(p.received, 0)::numeric(14, 2) as received_amount,
  greatest(q.total_amount - coalesce(p.received, 0), 0)::numeric(14, 2) as outstanding_amount,
  coalesce(p.payment_count, 0) as payment_count,
  p.last_payment_date,
  case
    when coalesce(p.received, 0) <= 0 then 'pending'
    when coalesce(p.received, 0) < q.total_amount then 'partial'
    else 'paid'
  end as payment_status
from public.quotations q
left join (
  select quotation_id, sum(amount) as received, count(*) as payment_count, max(payment_date) as last_payment_date
    from public.payments
   where status = 'valid'
   group by quotation_id
) p on p.quotation_id = q.id
where q.status::text in ('approved', 'sent', 'accepted');

grant select on public.quotation_payment_summary to authenticated;

-- ===================== 0028_lead_finder.sql =====================
-- 0028_lead_finder.sql
-- Lead Finder (newly registered companies) + Decision Maker Finder, inside the existing CRM.
--
-- Access: owner/admin always; any other member only when memberships.lead_finder_access = true
-- (toggled on the Team page by an owner/admin). Enforced by RLS on every table below, not only
-- in the UI.
-- Data policy: only public data. Every contact stores its source URL and verification status.
-- Nothing here is ever auto-emailed; "Save to CRM" copies into the existing companies/contacts/
-- deals tables, where the existing consent and suppression rules apply.
-- Rollback: supabase/rollback/0028_rollback.sql

-- 1. Permission --------------------------------------------------------------------------
alter table public.memberships
  add column if not exists lead_finder_access boolean not null default false;

create or replace function public.has_lead_finder_access(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.organization_id = p_org
       and m.user_id = auth.uid()
       and m.status = 'active'
       and (m.role in ('owner', 'admin') or m.lead_finder_access)
  );
$$;
revoke all on function public.has_lead_finder_access(uuid) from public, anon;
grant execute on function public.has_lead_finder_access(uuid) to authenticated, service_role;

-- Only owner/admin may grant the flag (memberships_update_admin already limits who can update
-- memberships; this trigger stops anyone else from flipping just this column).
create or replace function public.memberships_guard_lead_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_finder_access is distinct from old.lead_finder_access
     and auth.uid() is not null
     and not public.has_admin_role(new.organization_id) then
    raise exception 'Only an owner or admin can change Lead Finder access';
  end if;
  return new;
end;
$$;
drop trigger if exists memberships_guard_lead_flag on public.memberships;
create trigger memberships_guard_lead_flag before update on public.memberships
  for each row execute function public.memberships_guard_lead_flag();

-- 2. Sources (connector registry) --------------------------------------------------------
create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_key text not null check (source_key ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  access_mode text not null check (access_mode in ('automatic', 'optional_credential', 'manual_upload', 'manual_only')),
  enabled boolean not null default true,
  -- Credentials are NEVER stored here; connectors read them from server-side env vars.
  credential_env_var text,
  status text not null default 'not_run' check (status in ('ok', 'error', 'not_configured', 'not_run', 'manual')),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  source_updated_at timestamptz,
  usage_month text,
  usage_count integer not null default 0,
  usage_limit integer,
  daily_limit integer not null default 50 check (daily_limit between 0 and 5000),
  refresh_days integer not null default 30 check (refresh_days between 1 and 365),
  limitations text not null default '',
  docs_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_key)
);

-- 3. Import jobs (data.gov.in runs, MCA Excel uploads, discovery runs) --------------------
create table if not exists public.lead_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_key text not null,
  kind text not null check (kind in ('company_import', 'contact_discovery')),
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  file_name text,
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  duplicate_count integer not null default 0,
  failed_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  message text,
  created_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists lead_import_jobs_org_idx on public.lead_import_jobs (organization_id, started_at desc);

-- 4. Discovered companies ----------------------------------------------------------------
create table if not exists public.discovered_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  cin text not null check (cin ~ '^[LUF][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$' or cin ~ '^[A-Z]{3}-[0-9]{4}$'),
  company_name text not null check (char_length(company_name) between 1 and 400),
  normalized_name text not null,
  registration_date date,
  company_status text,
  company_class text,
  company_category text,
  state text,
  city text,
  registered_address text,
  nic_code text,
  business_activity text,
  industry text not null default 'Other',
  authorized_capital numeric(18, 2),
  paid_up_capital numeric(18, 2),
  website text check (website is null or website ~* '^https?://'),
  website_status text not null default 'none' check (website_status in ('none', 'suggested', 'confirmed', 'rejected')),
  opportunities text[] not null default '{}',
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  score_reasons jsonb not null default '[]'::jsonb,
  source_key text not null,
  source_url text,
  source_updated_at timestamptz,
  first_imported_at timestamptz not null default now(),
  last_imported_at timestamptz not null default now(),
  import_job_id uuid references public.lead_import_jobs (id) on delete set null,
  discovery_status text not null default 'pending' check (discovery_status in ('pending', 'queued', 'running', 'done', 'no_website', 'failed')),
  discovery_requested_at timestamptz,
  discovered_at timestamptz,
  discovery_error text,
  crm_company_id uuid references public.companies (id) on delete set null,
  crm_contact_id uuid references public.contacts (id) on delete set null,
  crm_deal_id uuid references public.deals (id) on delete set null,
  crm_status text not null default 'new' check (crm_status in ('new', 'saved', 'in_pipeline')),
  saved_by uuid references public.profiles (id) on delete set null,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, cin)
);
create index if not exists discovered_companies_reg_idx on public.discovered_companies (organization_id, registration_date desc);
create index if not exists discovered_companies_state_idx on public.discovered_companies (organization_id, state);
create index if not exists discovered_companies_industry_idx on public.discovered_companies (organization_id, industry);
create index if not exists discovered_companies_score_idx on public.discovered_companies (organization_id, lead_score desc);
create index if not exists discovered_companies_queue_idx on public.discovered_companies (discovery_requested_at)
  where discovery_status = 'queued';
create index if not exists discovered_companies_name_idx on public.discovered_companies (organization_id, normalized_name);

-- 5. Decision makers -----------------------------------------------------------------------
create table if not exists public.decision_makers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null references public.discovered_companies (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 200),
  original_designation text check (original_designation is null or char_length(original_designation) <= 200),
  roles text[] not null default '{}',
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/'),
  source_type text not null check (source_type in ('company_website', 'manual', 'api')),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  verification_status text not null default 'unverified'
    check (verification_status in ('source_confirmed', 'manually_verified', 'unverified')),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  score_reasons jsonb not null default '[]'::jsonb,
  last_verified_at timestamptz,
  crm_contact_id uuid references public.contacts (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decision_makers_company_idx on public.decision_makers (company_id);
create index if not exists decision_makers_org_idx on public.decision_makers (organization_id, created_at desc);
-- Same name at the same company with the same designation is one person; different
-- designations are kept apart (never merged on name alone).
create unique index if not exists decision_makers_identity_uidx
  on public.decision_makers (company_id, lower(btrim(full_name)), lower(coalesce(original_designation, '')));

-- 6. Contacts (company general contacts and person contacts) -------------------------------
create table if not exists public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null references public.discovered_companies (id) on delete cascade,
  decision_maker_id uuid references public.decision_makers (id) on delete cascade,
  contact_type text not null check (contact_type in ('email', 'phone')),
  contact_value text not null check (char_length(contact_value) between 5 and 254),
  contact_kind text not null check (contact_kind in ('person_professional', 'company_general', 'company_switchboard', 'department')),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  verification_status text not null default 'unverified'
    check (verification_status in ('website_confirmed', 'publicly_listed', 'manually_verified', 'unverified')),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  discovered_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lead_contacts_unique_uidx
  on public.lead_contacts (company_id, contact_type, lower(contact_value));
create index if not exists lead_contacts_dm_idx on public.lead_contacts (decision_maker_id);

-- 7. Field history (manual corrections and discovery updates) ------------------------------
create table if not exists public.lead_field_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_field_history_record_idx on public.lead_field_history (record_id, created_at);

create or replace function public.lead_history_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diff jsonb := '{}'::jsonb;
  k text;
  ignore_cols text[] := array['updated_at', 'created_at', 'last_imported_at', 'discovery_requested_at', 'discovery_status'];
begin
  if tg_op = 'DELETE' then
    insert into public.lead_field_history (organization_id, table_name, record_id, action, changes, actor_user_id)
    values (old.organization_id, tg_table_name, old.id, 'delete', to_jsonb(old), auth.uid());
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into public.lead_field_history (organization_id, table_name, record_id, action, changes, actor_user_id)
    values (new.organization_id, tg_table_name, new.id, 'insert', '{}'::jsonb, auth.uid());
    return new;
  end if;
  for k in select jsonb_object_keys(to_jsonb(new)) loop
    if k <> all (ignore_cols) and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      diff := diff || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.lead_field_history (organization_id, table_name, record_id, action, changes, actor_user_id)
    values (new.organization_id, tg_table_name, new.id, 'update', diff, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.lead_history_trigger() from public, anon, authenticated;

drop trigger if exists decision_makers_history on public.decision_makers;
create trigger decision_makers_history after insert or update or delete on public.decision_makers
  for each row execute function public.lead_history_trigger();
drop trigger if exists lead_contacts_history on public.lead_contacts;
create trigger lead_contacts_history after insert or update or delete on public.lead_contacts
  for each row execute function public.lead_history_trigger();
-- Companies: only track manual edits (imports would flood history).
drop trigger if exists discovered_companies_history on public.discovered_companies;
create trigger discovered_companies_history after update on public.discovered_companies
  for each row when (auth.uid() is not null) execute function public.lead_history_trigger();

do $$ begin
  create trigger lead_sources_updated_at before update on public.lead_sources for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger discovered_companies_updated_at before update on public.discovered_companies for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger decision_makers_updated_at before update on public.decision_makers for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger lead_contacts_updated_at before update on public.lead_contacts for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- 8. RLS ----------------------------------------------------------------------------------
alter table public.lead_sources enable row level security;
alter table public.lead_import_jobs enable row level security;
alter table public.discovered_companies enable row level security;
alter table public.decision_makers enable row level security;
alter table public.lead_contacts enable row level security;
alter table public.lead_field_history enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lead_import_jobs', 'discovered_companies', 'decision_makers', 'lead_contacts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_lead_finder_access(organization_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_lead_finder_access(organization_id) and public.has_write_role(organization_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_lead_finder_access(organization_id) and public.has_write_role(organization_id)) with check (public.has_lead_finder_access(organization_id) and public.has_write_role(organization_id))', t || '_update', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- Deleting (correction/deletion workflow): people and contacts by any writer with access;
-- whole companies only by owner/admin.
drop policy if exists decision_makers_delete on public.decision_makers;
create policy decision_makers_delete on public.decision_makers for delete to authenticated
  using (public.has_lead_finder_access(organization_id) and public.has_write_role(organization_id));
drop policy if exists lead_contacts_delete on public.lead_contacts;
create policy lead_contacts_delete on public.lead_contacts for delete to authenticated
  using (public.has_lead_finder_access(organization_id) and public.has_write_role(organization_id));
drop policy if exists discovered_companies_delete on public.discovered_companies;
create policy discovered_companies_delete on public.discovered_companies for delete to authenticated
  using (public.has_admin_role(organization_id));
grant delete on public.decision_makers, public.lead_contacts, public.discovered_companies to authenticated;

drop policy if exists lead_sources_select on public.lead_sources;
create policy lead_sources_select on public.lead_sources for select to authenticated
  using (public.has_lead_finder_access(organization_id));
drop policy if exists lead_sources_update on public.lead_sources;
create policy lead_sources_update on public.lead_sources for update to authenticated
  using (public.has_admin_role(organization_id)) with check (public.has_admin_role(organization_id));
grant select, update (enabled, daily_limit, refresh_days) on public.lead_sources to authenticated;

drop policy if exists lead_field_history_select on public.lead_field_history;
create policy lead_field_history_select on public.lead_field_history for select to authenticated
  using (public.has_lead_finder_access(organization_id));
grant select on public.lead_field_history to authenticated;

-- 9. Default sources for every organization ------------------------------------------------
create or replace function public.seed_lead_sources(p_org uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.lead_sources (organization_id, source_key, name, access_mode, enabled, credential_env_var, status, usage_limit, daily_limit, limitations, docs_url)
  values
    (p_org, 'mca_excel', 'MCA monthly company list (Excel/CSV upload)', 'manual_upload', true, null, 'manual', null, 0,
     'MCA blocks automated downloads. Download "Companies registered during the month" from mca.gov.in in your browser and upload it here. Published monthly, usually 1-2 months after incorporation. No email/phone in this data.',
     'https://www.mca.gov.in/content/mca/global/en/data-and-reports/company-llp-info/incorporated-closed-month.html'),
    (p_org, 'website_discovery', 'Company website contact discovery', 'automatic', true, null, 'not_run', null, 40,
     'Reads only public Contact/About/Team pages of a company''s own website, respecting robots.txt, at most a few pages per company. Most newly registered companies have no website yet.',
     null),
    (p_org, 'data_gov_in', 'data.gov.in Company Master Data API', 'optional_credential', true, 'DATA_GOV_IN_API_KEY', 'not_configured', null, 0,
     'Optional. Needs a free API key set on the worker (DATA_GOV_IN_API_KEY). Skipped when not configured. Updated by MCA every few weeks, not daily.',
     'https://www.data.gov.in/catalog/company-master-data'),
    (p_org, 'hunter', 'Hunter.io domain search', 'optional_credential', false, 'HUNTER_API_KEY', 'not_configured', 50, 0,
     'Optional. Free plan: 50 credits per month. Disabled and skipped without HUNTER_API_KEY; stops automatically when credits run out.',
     'https://hunter.io/api-documentation'),
    (p_org, 'mca_portal', 'MCA director / signatory lookup', 'manual_only', true, null, 'manual', null, 0,
     'Manual only: protected by CAPTCHA and anti-bot controls. Use the "Search on MCA" link and enter directors by hand with the source.',
     'https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html'),
    (p_org, 'linkedin', 'LinkedIn', 'manual_only', true, null, 'manual', null, 0,
     'Manual only: automated extraction is not permitted. Use the "Search on LinkedIn" link and paste profile URLs.',
     'https://www.linkedin.com/')
  on conflict (organization_id, source_key) do nothing;
$$;
revoke all on function public.seed_lead_sources(uuid) from public, anon, authenticated;

select public.seed_lead_sources(id) from public.organizations;

create or replace function public.organizations_seed_lead_sources()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_lead_sources(new.id);
  return new;
end;
$$;
drop trigger if exists organizations_seed_lead_sources on public.organizations;
create trigger organizations_seed_lead_sources after insert on public.organizations
  for each row execute function public.organizations_seed_lead_sources();

-- 10. Dashboard summary (security_invoker: callers see only what RLS allows) ---------------
create or replace view public.lead_finder_stats
with (security_invoker = true) as
select
  c.organization_id,
  count(*) as total_companies,
  count(*) filter (where c.first_imported_at >= date_trunc('day', now())) as added_today,
  count(*) filter (where c.first_imported_at >= date_trunc('month', now())) as added_this_month,
  count(*) filter (where c.website is not null and c.website_status <> 'rejected') as with_website,
  count(*) filter (where exists (select 1 from public.lead_contacts lc where lc.company_id = c.id and lc.contact_type = 'email')) as with_email,
  count(*) filter (where exists (select 1 from public.lead_contacts lc where lc.company_id = c.id and lc.contact_type = 'phone')) as with_phone,
  count(*) filter (where c.crm_status <> 'new') as saved_to_crm,
  count(*) filter (where c.lead_score >= 75) as hot,
  count(*) filter (where c.lead_score between 45 and 74) as warm,
  count(*) filter (where c.lead_score < 45) as cold,
  (select count(*) from public.decision_makers d where d.organization_id = c.organization_id) as decision_makers
from public.discovered_companies c
group by c.organization_id;
grant select on public.lead_finder_stats to authenticated;

-- ===================== 0029_lead_finder_charts_hunter.sql =====================
-- 0029_lead_finder_charts_hunter.sql
-- Small additions to Lead Finder (0028):
--   * discovered_companies.hunter_checked_at: a company's domain is looked up in Hunter.io at most
--     once per refresh interval, so free credits are never spent twice on the same company.
--   * lead_finder_breakdown: aggregated counts for dashboard charts (security_invoker, so callers
--     only count rows that RLS lets them see).
-- Rollback: supabase/rollback/0029_rollback.sql

alter table public.discovered_companies
  add column if not exists hunter_checked_at timestamptz;

create or replace view public.lead_finder_breakdown
with (security_invoker = true) as
select organization_id, 'state'::text as dimension, coalesce(state, 'Unknown') as label, count(*)::int as companies
  from public.discovered_companies group by organization_id, coalesce(state, 'Unknown')
union all
select organization_id, 'industry', industry, count(*)::int
  from public.discovered_companies group by organization_id, industry
union all
select organization_id, 'registered_month', to_char(date_trunc('month', registration_date), 'YYYY-MM'), count(*)::int
  from public.discovered_companies where registration_date is not null
 group by organization_id, date_trunc('month', registration_date)
union all
select organization_id, 'imported_day', to_char(date_trunc('day', first_imported_at), 'YYYY-MM-DD'), count(*)::int
  from public.discovered_companies where first_imported_at > now() - interval '30 days'
 group by organization_id, date_trunc('day', first_imported_at)
union all
select organization_id, 'crm_status', crm_status, count(*)::int
  from public.discovered_companies group by organization_id, crm_status;

grant select on public.lead_finder_breakdown to authenticated;

