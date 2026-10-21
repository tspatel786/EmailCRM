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

-- 0013: demo_email_requests table and policies
create table if not exists public.demo_email_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid references public.email_templates (id) on delete set null,
  requested_by uuid references public.profiles (id) on delete set null,
  recipient_email text not null,
  subject text not null,
  body_text text not null default '',
  body_html text not null default '',
  status text not null default 'pending',
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

