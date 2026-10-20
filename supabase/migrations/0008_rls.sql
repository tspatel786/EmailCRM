alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_logs enable row level security;
alter table public.worker_heartbeats enable row level security;
alter table public.org_email_daily_stats enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_emails enable row level security;
alter table public.contact_phones enable row level security;
alter table public.contact_tags enable row level security;
alter table public.contact_tag_map enable row level security;
alter table public.contact_lists enable row level security;
alter table public.contact_list_members enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_errors enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.email_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.email_jobs enable row level security;
alter table public.email_events enable row level security;
alter table public.suppressions enable row level security;
alter table public.calls enable row level security;
alter table public.tasks enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.deals enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_versions enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_milestones enable row level security;
alter table public.activities enable row level security;

-- Profiles: a user sees self; org members see teammate profiles.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id
        and m.status = 'active'
        and public.is_org_member(m.organization_id)
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (public.has_admin_role(id))
  with check (public.has_admin_role(id));

create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));

create policy memberships_insert_admin on public.memberships
  for insert to authenticated
  with check (public.has_admin_role(organization_id));

create policy memberships_update_admin on public.memberships
  for update to authenticated
  using (public.has_admin_role(organization_id))
  with check (public.has_admin_role(organization_id));

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (public.is_org_member(organization_id) and actor_user_id = auth.uid());

create policy worker_heartbeats_none on public.worker_heartbeats
  for all to authenticated
  using (false)
  with check (false);

create policy org_email_stats_select on public.org_email_daily_stats
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Generic tenant policies
create policy companies_select on public.companies for select to authenticated using (public.is_org_member(organization_id));
create policy companies_insert on public.companies for insert to authenticated with check (public.has_write_role(organization_id));
create policy companies_update on public.companies for update to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));
create policy companies_delete on public.companies for delete to authenticated using (public.has_admin_role(organization_id));

create policy contacts_select on public.contacts for select to authenticated using (public.is_org_member(organization_id));
create policy contacts_insert on public.contacts for insert to authenticated with check (public.has_write_role(organization_id));
create policy contacts_update on public.contacts for update to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));
create policy contacts_delete on public.contacts for delete to authenticated using (public.has_admin_role(organization_id));

create policy contact_emails_select on public.contact_emails for select to authenticated using (public.is_org_member(organization_id));
create policy contact_emails_write on public.contact_emails for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_phones_select on public.contact_phones for select to authenticated using (public.is_org_member(organization_id));
create policy contact_phones_write on public.contact_phones for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_tags_select on public.contact_tags for select to authenticated using (public.is_org_member(organization_id));
create policy contact_tags_write on public.contact_tags for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_tag_map_select on public.contact_tag_map for select to authenticated using (public.is_org_member(organization_id));
create policy contact_tag_map_write on public.contact_tag_map for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_lists_select on public.contact_lists for select to authenticated using (public.is_org_member(organization_id));
create policy contact_lists_write on public.contact_lists for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy contact_list_members_select on public.contact_list_members for select to authenticated using (public.is_org_member(organization_id));
create policy contact_list_members_write on public.contact_list_members for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy import_batches_select on public.import_batches for select to authenticated using (public.is_org_member(organization_id));
create policy import_batches_write on public.import_batches for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy import_errors_select on public.import_errors for select to authenticated using (public.is_org_member(organization_id));
create policy import_errors_insert on public.import_errors for insert to authenticated with check (public.has_write_role(organization_id));

create policy documents_select on public.documents for select to authenticated using (public.is_org_member(organization_id));
create policy documents_write on public.documents for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy email_templates_select on public.email_templates for select to authenticated using (public.is_org_member(organization_id));
create policy email_templates_write on public.email_templates for all to authenticated using (public.has_manage_role(organization_id)) with check (public.has_manage_role(organization_id));

create policy campaigns_select on public.campaigns for select to authenticated using (public.is_org_member(organization_id));
create policy campaigns_insert on public.campaigns for insert to authenticated with check (public.has_manage_role(organization_id));
create policy campaigns_update on public.campaigns for update to authenticated using (public.has_manage_role(organization_id)) with check (public.has_manage_role(organization_id));

create policy email_jobs_select on public.email_jobs for select to authenticated using (public.is_org_member(organization_id));
-- Jobs are inserted by Edge Function (service role). Authenticated users cannot insert jobs directly.
create policy email_jobs_no_client_write on public.email_jobs for insert to authenticated with check (false);
create policy email_jobs_update_manage on public.email_jobs for update to authenticated using (public.has_manage_role(organization_id)) with check (public.has_manage_role(organization_id));

create policy email_events_select on public.email_events for select to authenticated using (public.is_org_member(organization_id));
create policy email_events_insert on public.email_events for insert to authenticated with check (public.has_manage_role(organization_id));

create policy suppressions_select on public.suppressions for select to authenticated using (public.is_org_member(organization_id));
create policy suppressions_write on public.suppressions for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy calls_select on public.calls for select to authenticated using (public.is_org_member(organization_id));
create policy calls_write on public.calls for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy tasks_select on public.tasks for select to authenticated using (public.is_org_member(organization_id));
create policy tasks_write on public.tasks for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy meetings_select on public.meetings for select to authenticated using (public.is_org_member(organization_id));
create policy meetings_write on public.meetings for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy meeting_attendees_select on public.meeting_attendees for select to authenticated using (public.is_org_member(organization_id));
create policy meeting_attendees_write on public.meeting_attendees for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy deals_select on public.deals for select to authenticated using (public.is_org_member(organization_id));
create policy deals_write on public.deals for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy quotations_select on public.quotations for select to authenticated using (public.is_org_member(organization_id));
create policy quotations_write on public.quotations for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy quotation_versions_select on public.quotation_versions for select to authenticated using (public.is_org_member(organization_id));
create policy quotation_versions_write on public.quotation_versions for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy projects_select on public.projects for select to authenticated using (public.is_org_member(organization_id));
create policy projects_write on public.projects for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy project_members_select on public.project_members for select to authenticated using (public.is_org_member(organization_id));
create policy project_members_write on public.project_members for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy project_milestones_select on public.project_milestones for select to authenticated using (public.is_org_member(organization_id));
create policy project_milestones_write on public.project_milestones for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

create policy activities_select on public.activities for select to authenticated using (public.is_org_member(organization_id));
create policy activities_insert on public.activities for insert to authenticated with check (public.has_write_role(organization_id));
-- Timeline rows are append-only for non-admins
create policy activities_update_admin on public.activities for update to authenticated using (public.has_admin_role(organization_id)) with check (public.has_admin_role(organization_id));
