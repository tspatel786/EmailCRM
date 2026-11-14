-- 0022_activities_and_audit_rls.sql
-- activities: visible to the person who performed it, the owner of the linked
-- contact, or an org admin. audit_logs: tightened to admin-only (Super Admin),
-- matching the UI gate's original intent (previously any org member could read it).

drop policy if exists activities_select on public.activities;

create policy activities_select on public.activities for select to authenticated using (
  public.is_org_member(organization_id)
  and (
    actor_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or exists (
      select 1 from public.contacts c
      where c.id = activities.contact_id
        and c.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists audit_logs_select on public.audit_logs;

create policy audit_logs_select on public.audit_logs for select to authenticated using (
  public.has_admin_role(organization_id)
);
