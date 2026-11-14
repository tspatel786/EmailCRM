-- 0021_private_rls_tier_b.sql
-- Child/detail tables have no owner_user_id of their own -- they inherit visibility
-- from their parent Tier A record (0020). contact_tags, contact_lists and
-- contact_list_members remain org-shared (Tier C, unchanged): they're campaign
-- targeting config, not personal pipeline data.

-- contact_emails (inherits contacts.owner_user_id) --------------------------------
drop policy if exists contact_emails_select on public.contact_emails;
drop policy if exists contact_emails_write on public.contact_emails;

create policy contact_emails_select on public.contact_emails for select to authenticated using (
  exists (
    select 1 from public.contacts c
    where c.id = contact_emails.contact_id
      and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
  )
);
create policy contact_emails_write on public.contact_emails for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_emails.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_emails.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  );

-- contact_phones (inherits contacts.owner_user_id) --------------------------------
drop policy if exists contact_phones_select on public.contact_phones;
drop policy if exists contact_phones_write on public.contact_phones;

create policy contact_phones_select on public.contact_phones for select to authenticated using (
  exists (
    select 1 from public.contacts c
    where c.id = contact_phones.contact_id
      and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
  )
);
create policy contact_phones_write on public.contact_phones for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_phones.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_phones.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  );

-- contact_tag_map (inherits contacts.owner_user_id) -------------------------------
drop policy if exists contact_tag_map_select on public.contact_tag_map;
drop policy if exists contact_tag_map_write on public.contact_tag_map;

create policy contact_tag_map_select on public.contact_tag_map for select to authenticated using (
  exists (
    select 1 from public.contacts c
    where c.id = contact_tag_map.contact_id
      and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
  )
);
create policy contact_tag_map_write on public.contact_tag_map for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tag_map.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tag_map.contact_id
        and (c.owner_user_id = auth.uid() or public.has_admin_role(c.organization_id))
    )
  );

-- quotation_versions (inherits quotations.owner_user_id) --------------------------
drop policy if exists quotation_versions_select on public.quotation_versions;
drop policy if exists quotation_versions_write on public.quotation_versions;

create policy quotation_versions_select on public.quotation_versions for select to authenticated using (
  exists (
    select 1 from public.quotations q
    where q.id = quotation_versions.quotation_id
      and (q.owner_user_id = auth.uid() or public.has_admin_role(q.organization_id))
  )
);
create policy quotation_versions_write on public.quotation_versions for all to authenticated
  using (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_versions.quotation_id
        and (q.owner_user_id = auth.uid() or public.has_admin_role(q.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_versions.quotation_id
        and (q.owner_user_id = auth.uid() or public.has_admin_role(q.organization_id))
    )
  );

-- project_milestones (inherits projects.owner_user_id, OR listed project member) ---
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

-- project_members (visible to the project owner, admins, and fellow members) ------
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

-- meeting_attendees (visible to the meeting owner, admins, and fellow attendees) ---
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

-- import_errors (inherits import_batches.owner_user_id) ---------------------------
drop policy if exists import_errors_select on public.import_errors;
drop policy if exists import_errors_insert on public.import_errors;

create policy import_errors_select on public.import_errors for select to authenticated using (
  exists (
    select 1 from public.import_batches b
    where b.id = import_errors.batch_id
      and (b.owner_user_id = auth.uid() or public.has_admin_role(b.organization_id))
  )
);
create policy import_errors_insert on public.import_errors for insert to authenticated with check (
  exists (
    select 1 from public.import_batches b
    where b.id = import_errors.batch_id
      and (b.owner_user_id = auth.uid() or public.has_admin_role(b.organization_id))
  )
);
