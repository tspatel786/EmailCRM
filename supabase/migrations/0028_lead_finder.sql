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
