-- Rollback for 0028_lead_finder.sql. WARNING: deletes all Lead Finder data. CRM records already
-- saved from Lead Finder (companies/contacts/deals) are kept.
drop view if exists public.lead_finder_stats;
drop trigger if exists organizations_seed_lead_sources on public.organizations;
drop function if exists public.organizations_seed_lead_sources();
drop function if exists public.seed_lead_sources(uuid);
drop table if exists public.lead_field_history;
drop table if exists public.lead_contacts;
drop table if exists public.decision_makers;
drop table if exists public.discovered_companies;
drop table if exists public.lead_import_jobs;
drop table if exists public.lead_sources;
drop function if exists public.lead_history_trigger();
drop trigger if exists memberships_guard_lead_flag on public.memberships;
drop function if exists public.memberships_guard_lead_flag();
drop function if exists public.has_lead_finder_access(uuid);
alter table public.memberships drop column if exists lead_finder_access;
