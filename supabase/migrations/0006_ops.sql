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
