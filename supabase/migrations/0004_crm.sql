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
