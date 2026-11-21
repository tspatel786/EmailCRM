-- 0025_manager_view_all_and_private_campaigns.sql
-- Visibility model (requested by the business owner):
--   * Employees (sales_executive, viewer) see only records they own.
--   * owner, admin AND sales_manager can VIEW every record in their organization.
--     Writes on other people's records stay owner/admin only (unchanged).
--   * Campaigns and their per-recipient jobs/events are visible only to
--     owner/admin/sales_manager (they expose recipient addresses of everyone's contacts).
-- Only SELECT policies are altered; audit_logs stays admin-only. Rollback: rollback/0025_rollback.sql

create or replace function public.has_view_all_role(p_org uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.my_org_role(p_org) in ('owner', 'admin', 'sales_manager');
$$;

revoke all on function public.has_view_all_role(uuid) from public, anon;
grant execute on function public.has_view_all_role(uuid) to authenticated, service_role;

alter policy "activities_select" on public.activities using (is_org_member(organization_id) AND ((actor_user_id = auth.uid()) OR has_view_all_role(organization_id) OR (EXISTS ( SELECT 1 FROM contacts c WHERE ((c.id = activities.contact_id) AND (c.owner_user_id = auth.uid()))))));

alter policy "calls_select" on public.calls using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "campaigns_select" on public.campaigns using (is_org_member(organization_id) AND has_manage_role(organization_id));

alter policy "companies_select" on public.companies using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "contact_emails_select" on public.contact_emails using (EXISTS ( SELECT 1 FROM contacts c WHERE ((c.id = contact_emails.contact_id) AND ((c.owner_user_id = auth.uid()) OR has_view_all_role(c.organization_id)))));

alter policy "contact_phones_select" on public.contact_phones using (EXISTS ( SELECT 1 FROM contacts c WHERE ((c.id = contact_phones.contact_id) AND ((c.owner_user_id = auth.uid()) OR has_view_all_role(c.organization_id)))));

alter policy "contact_tag_map_select" on public.contact_tag_map using (EXISTS ( SELECT 1 FROM contacts c WHERE ((c.id = contact_tag_map.contact_id) AND ((c.owner_user_id = auth.uid()) OR has_view_all_role(c.organization_id)))));

alter policy "contacts_select" on public.contacts using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "deals_select" on public.deals using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "demo_email_requests_select" on public.demo_email_requests using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "documents_select" on public.documents using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "email_events_select" on public.email_events using (is_org_member(organization_id) AND has_manage_role(organization_id));

alter policy "email_jobs_select" on public.email_jobs using (is_org_member(organization_id) AND has_manage_role(organization_id));

alter policy "import_batches_select" on public.import_batches using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "import_errors_select" on public.import_errors using (EXISTS ( SELECT 1 FROM import_batches b WHERE ((b.id = import_errors.batch_id) AND ((b.owner_user_id = auth.uid()) OR has_view_all_role(b.organization_id)))));

alter policy "meeting_attendees_select" on public.meeting_attendees using (((user_id = auth.uid()) OR is_meeting_owner_or_admin(meeting_id)) OR EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_attendees.meeting_id AND has_view_all_role(m.organization_id)));

alter policy "meetings_select" on public.meetings using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id) OR is_meeting_attendee(id)));

alter policy "members_read_org_messages" on public.messages using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "project_members_select" on public.project_members using (((user_id = auth.uid()) OR is_project_owner_or_admin(project_id)) OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_members.project_id AND has_view_all_role(p.organization_id)));

alter policy "project_milestones_select" on public.project_milestones using ((is_project_owner_or_admin(project_id) OR is_project_member(project_id)) OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_milestones.project_id AND has_view_all_role(p.organization_id)));

alter policy "projects_select" on public.projects using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id) OR is_project_member(id)));

alter policy "quotation_versions_select" on public.quotation_versions using (EXISTS ( SELECT 1 FROM quotations q WHERE ((q.id = quotation_versions.quotation_id) AND ((q.owner_user_id = auth.uid()) OR has_view_all_role(q.organization_id)))));

alter policy "quotations_select" on public.quotations using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));

alter policy "tasks_select" on public.tasks using (is_org_member(organization_id) AND ((owner_user_id = auth.uid()) OR has_view_all_role(organization_id)));
