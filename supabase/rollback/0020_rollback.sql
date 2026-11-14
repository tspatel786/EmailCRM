-- Rollback for 0020_private_rls_tier_a.sql
-- Restores the original org-wide (non-private) policies verbatim from 0008_rls.sql
-- and 0016_messages_and_webmail.sql / 0013_demo_email.sql. Does NOT drop the
-- owner_user_id columns or data -- only reverts RLS behavior.

drop trigger if exists companies_prevent_tamper on public.companies;
drop trigger if exists contacts_prevent_tamper on public.contacts;
drop trigger if exists calls_prevent_tamper on public.calls;
drop trigger if exists tasks_prevent_tamper on public.tasks;
drop trigger if exists meetings_prevent_tamper on public.meetings;
drop trigger if exists deals_prevent_tamper on public.deals;
drop trigger if exists quotations_prevent_tamper on public.quotations;
drop trigger if exists projects_prevent_tamper on public.projects;
drop trigger if exists documents_prevent_tamper on public.documents;
drop trigger if exists messages_prevent_tamper on public.messages;
drop trigger if exists demo_email_requests_prevent_tamper on public.demo_email_requests;
drop trigger if exists import_batches_prevent_tamper on public.import_batches;
drop function if exists public.prevent_ownership_tamper();

drop policy if exists companies_select on public.companies;
drop policy if exists companies_insert on public.companies;
drop policy if exists companies_update on public.companies;
create policy companies_select on public.companies for select to authenticated using (public.is_org_member(organization_id));
create policy companies_insert on public.companies for insert to authenticated with check (public.has_write_role(organization_id));
create policy companies_update on public.companies for update to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
create policy contacts_select on public.contacts for select to authenticated using (public.is_org_member(organization_id));
create policy contacts_insert on public.contacts for insert to authenticated with check (public.has_write_role(organization_id));
create policy contacts_update on public.contacts for update to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists calls_select on public.calls;
drop policy if exists calls_write on public.calls;
create policy calls_select on public.calls for select to authenticated using (public.is_org_member(organization_id));
create policy calls_write on public.calls for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_write on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (public.is_org_member(organization_id));
create policy tasks_write on public.tasks for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists meetings_select on public.meetings;
drop policy if exists meetings_write on public.meetings;
create policy meetings_select on public.meetings for select to authenticated using (public.is_org_member(organization_id));
create policy meetings_write on public.meetings for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists deals_select on public.deals;
drop policy if exists deals_write on public.deals;
create policy deals_select on public.deals for select to authenticated using (public.is_org_member(organization_id));
create policy deals_write on public.deals for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists quotations_select on public.quotations;
drop policy if exists quotations_write on public.quotations;
create policy quotations_select on public.quotations for select to authenticated using (public.is_org_member(organization_id));
create policy quotations_write on public.quotations for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists projects_select on public.projects;
drop policy if exists projects_write on public.projects;
create policy projects_select on public.projects for select to authenticated using (public.is_org_member(organization_id));
create policy projects_write on public.projects for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists documents_select on public.documents;
drop policy if exists documents_write on public.documents;
create policy documents_select on public.documents for select to authenticated using (public.is_org_member(organization_id));
create policy documents_write on public.documents for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));

drop policy if exists members_read_org_messages on public.messages;
drop policy if exists members_insert_org_messages on public.messages;
drop policy if exists members_update_org_messages on public.messages;
create policy "members_read_org_messages" on public.messages for select using (public.is_org_member(organization_id));
create policy "members_insert_org_messages" on public.messages for insert with check (public.is_org_member(organization_id));
create policy "members_update_org_messages" on public.messages for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

drop policy if exists demo_email_requests_select on public.demo_email_requests;
drop policy if exists demo_email_requests_insert on public.demo_email_requests;
drop policy if exists demo_email_requests_update on public.demo_email_requests;
create policy demo_email_requests_select on public.demo_email_requests for select to authenticated using (public.is_org_member(organization_id));
create policy demo_email_requests_insert on public.demo_email_requests for insert to authenticated with check (public.is_org_member(organization_id));
create policy demo_email_requests_update on public.demo_email_requests for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

drop policy if exists import_batches_select on public.import_batches;
drop policy if exists import_batches_write on public.import_batches;
create policy import_batches_select on public.import_batches for select to authenticated using (public.is_org_member(organization_id));
create policy import_batches_write on public.import_batches for all to authenticated using (public.has_write_role(organization_id)) with check (public.has_write_role(organization_id));
