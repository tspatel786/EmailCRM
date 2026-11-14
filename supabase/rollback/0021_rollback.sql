-- Rollback for 0021_private_rls_tier_b.sql -- restores original org-wide policies verbatim from 0008_rls.sql.

drop policy if exists contact_emails_select on public.contact_emails;
drop policy if exists contact_emails_write on public.contact_emails;
create policy contact_emails_select on public.contact_emails for select to authenticated using (public.is_org_member(organization_id));
create policy contact_emails_write on public.contact_emails for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists contact_phones_select on public.contact_phones;
drop policy if exists contact_phones_write on public.contact_phones;
create policy contact_phones_select on public.contact_phones for select to authenticated using (public.is_org_member(organization_id));
create policy contact_phones_write on public.contact_phones for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists contact_tag_map_select on public.contact_tag_map;
drop policy if exists contact_tag_map_write on public.contact_tag_map;
create policy contact_tag_map_select on public.contact_tag_map for select to authenticated using (public.is_org_member(organization_id));
create policy contact_tag_map_write on public.contact_tag_map for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists quotation_versions_select on public.quotation_versions;
drop policy if exists quotation_versions_write on public.quotation_versions;
create policy quotation_versions_select on public.quotation_versions for select to authenticated using (public.is_org_member(organization_id));
create policy quotation_versions_write on public.quotation_versions for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists project_milestones_select on public.project_milestones;
drop policy if exists project_milestones_write on public.project_milestones;
create policy project_milestones_select on public.project_milestones for select to authenticated using (public.is_org_member(organization_id));
create policy project_milestones_write on public.project_milestones for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists project_members_select on public.project_members;
drop policy if exists project_members_write on public.project_members;
create policy project_members_select on public.project_members for select to authenticated using (public.is_org_member(organization_id));
create policy project_members_write on public.project_members for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists meeting_attendees_select on public.meeting_attendees;
drop policy if exists meeting_attendees_write on public.meeting_attendees;
create policy meeting_attendees_select on public.meeting_attendees for select to authenticated using (public.is_org_member(organization_id));
create policy meeting_attendees_write on public.meeting_attendees for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists import_errors_select on public.import_errors;
drop policy if exists import_errors_insert on public.import_errors;
create policy import_errors_select on public.import_errors for select to authenticated using (public.is_org_member(organization_id));
create policy import_errors_insert on public.import_errors for insert to authenticated with check (public.has_write_role(organization_id));
