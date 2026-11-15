-- 0023_fix_recursive_rls.sql
-- meetings<->meeting_attendees and projects<->project_members each query each
-- other directly inside their RLS policies, which causes Postgres to recurse
-- into the other table's policy and back ("infinite recursion detected in
-- policy for relation ..."). Fix: route the cross-table checks through
-- SECURITY DEFINER helpers (same pattern as is_org_member/my_org_role in
-- 0007_functions.sql) so the inner lookup bypasses RLS instead of
-- re-evaluating it.

create or replace function public.is_meeting_owner_or_admin(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting_id
      and (m.owner_user_id = auth.uid() or public.has_admin_role(m.organization_id))
  );
$$;

create or replace function public.is_meeting_attendee(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meeting_attendees ma
    where ma.meeting_id = p_meeting_id
      and ma.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner_or_admin(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (p.owner_user_id = auth.uid() or public.has_admin_role(p.organization_id))
  );
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

-- meetings ---------------------------------------------------------------
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or public.is_meeting_attendee(id)
  )
);

-- meeting_attendees --------------------------------------------------------
drop policy if exists meeting_attendees_select on public.meeting_attendees;
drop policy if exists meeting_attendees_write on public.meeting_attendees;

create policy meeting_attendees_select on public.meeting_attendees for select to authenticated using (
  user_id = auth.uid() or public.is_meeting_owner_or_admin(meeting_id)
);
create policy meeting_attendees_write on public.meeting_attendees for all to authenticated
  using (public.is_meeting_owner_or_admin(meeting_id))
  with check (public.is_meeting_owner_or_admin(meeting_id));

-- projects -----------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or public.is_project_member(id)
  )
);

-- project_members ------------------------------------------------------------
drop policy if exists project_members_select on public.project_members;
drop policy if exists project_members_write on public.project_members;

create policy project_members_select on public.project_members for select to authenticated using (
  user_id = auth.uid() or public.is_project_owner_or_admin(project_id)
);
create policy project_members_write on public.project_members for all to authenticated
  using (public.is_project_owner_or_admin(project_id))
  with check (public.is_project_owner_or_admin(project_id));

-- project_milestones (was also indirectly recursive via the raw `projects` join) --
drop policy if exists project_milestones_select on public.project_milestones;
drop policy if exists project_milestones_write on public.project_milestones;

create policy project_milestones_select on public.project_milestones for select to authenticated using (
  public.is_project_owner_or_admin(project_id) or public.is_project_member(project_id)
);
create policy project_milestones_write on public.project_milestones for all to authenticated
  using (public.is_project_owner_or_admin(project_id))
  with check (public.is_project_owner_or_admin(project_id));
