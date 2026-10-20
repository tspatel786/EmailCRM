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
