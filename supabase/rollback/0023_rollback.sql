-- Rollback for 0023_fix_recursive_rls.sql -- restores the prior (recursive) policy
-- text verbatim from 0020/0021_private_rls_tier_a/b.sql and drops the new helpers.
-- Note: the restored policies are the ones that caused "infinite recursion detected
-- in policy" on meetings/projects reads -- only roll back if 0023 itself is the
-- regression, not to fix an unrelated issue.

drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or exists (select 1 from public.meeting_attendees ma where ma.meeting_id = meetings.id and ma.user_id = auth.uid())
  )
);

drop policy if exists meeting_attendees_select on public.meeting_attendees;
drop policy if exists meeting_attendees_write on public.meeting_attendees;

create policy meeting_attendees_select on public.meeting_attendees for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.meetings m
    where m.id = meeting_attendees.meeting_id
      and (m.owner_user_id = auth.uid() or public.has_admin_role(m.organization_id))
  )
);
create policy meeting_attendees_write on public.meeting_attendees for all to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendees.meeting_id
        and (m.owner_user_id = auth.uid() or public.has_admin_role(m.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendees.meeting_id
        and (m.owner_user_id = auth.uid() or public.has_admin_role(m.organization_id))
    )
  );

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or exists (select 1 from public.project_members pm where pm.project_id = projects.id and pm.user_id = auth.uid())
  )
);

drop policy if exists project_members_select on public.project_members;
drop policy if exists project_members_write on public.project_members;

create policy project_members_select on public.project_members for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.projects p
    where p.id = project_members.project_id
      and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
  )
);
create policy project_members_write on public.project_members for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
    )
  );

drop policy if exists project_milestones_select on public.project_milestones;
drop policy if exists project_milestones_write on public.project_milestones;

create policy project_milestones_select on public.project_milestones for select to authenticated using (
  exists (
    select 1 from public.projects p
    where p.id = project_milestones.project_id
      and (
        p.owner_user_id = auth.uid()
        or public.has_admin_role(p.organization_id)
        or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
      )
  )
);
create policy project_milestones_write on public.project_milestones for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_milestones.project_id
        and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_milestones.project_id
        and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
    )
  );

drop function if exists public.is_meeting_owner_or_admin(uuid);
drop function if exists public.is_meeting_attendee(uuid);
drop function if exists public.is_project_owner_or_admin(uuid);
drop function if exists public.is_project_member(uuid);
