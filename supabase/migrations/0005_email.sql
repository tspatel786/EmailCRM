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
