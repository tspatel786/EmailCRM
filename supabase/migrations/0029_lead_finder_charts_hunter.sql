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
