-- Rollback for 0022_activities_and_audit_rls.sql -- restores original org-wide policies verbatim from 0008_rls.sql.

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_org_member(organization_id));
