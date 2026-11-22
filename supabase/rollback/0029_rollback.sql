-- Rollback for 0029.
drop view if exists public.lead_finder_breakdown;
alter table public.discovered_companies drop column if exists hunter_checked_at;
