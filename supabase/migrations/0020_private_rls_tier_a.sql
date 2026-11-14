-- 0020_private_rls_tier_a.sql
-- Private-by-default RLS for primary record tables: an employee sees/writes only
-- records they own; owner/admin role ("Super Admin", org-scoped) sees/manages all
-- records in their own organization. Cross-org access is unaffected (is_org_member/
-- has_admin_role already enforce the organization boundary).
--
-- A BEFORE UPDATE trigger additionally blocks any non-admin from changing
-- owner_user_id or organization_id on their own records, regardless of role overlap
-- across multiple org memberships.

create or replace function public.prevent_ownership_tamper()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     and not public.has_admin_role(old.organization_id) then
    raise exception 'organization_id cannot be changed';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id
     and not public.has_admin_role(old.organization_id) then
    raise exception 'owner_user_id can only be changed by an organization admin';
  end if;

  return new;
end;
$$;

-- companies ------------------------------------------------------------
drop policy if exists companies_select on public.companies;
drop policy if exists companies_insert on public.companies;
drop policy if exists companies_update on public.companies;

create policy companies_select on public.companies for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy companies_insert on public.companies for insert to authenticated with check (
  public.has_write_role(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy companies_update on public.companies for update to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists companies_prevent_tamper on public.companies;
create trigger companies_prevent_tamper before update on public.companies
  for each row execute function public.prevent_ownership_tamper();

-- contacts -------------------------------------------------------------
drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;

create policy contacts_select on public.contacts for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy contacts_insert on public.contacts for insert to authenticated with check (
  public.has_write_role(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy contacts_update on public.contacts for update to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists contacts_prevent_tamper on public.contacts;
create trigger contacts_prevent_tamper before update on public.contacts
  for each row execute function public.prevent_ownership_tamper();

-- calls ------------------------------------------------------------------
drop policy if exists calls_write on public.calls;
drop policy if exists calls_select on public.calls;

create policy calls_select on public.calls for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy calls_write on public.calls for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists calls_prevent_tamper on public.calls;
create trigger calls_prevent_tamper before update on public.calls
  for each row execute function public.prevent_ownership_tamper();

-- tasks --------------------------------------------------------------------
drop policy if exists tasks_write on public.tasks;
drop policy if exists tasks_select on public.tasks;

create policy tasks_select on public.tasks for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy tasks_write on public.tasks for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists tasks_prevent_tamper on public.tasks;
create trigger tasks_prevent_tamper before update on public.tasks
  for each row execute function public.prevent_ownership_tamper();

-- meetings (owner OR listed attendee may view/collaborate) -----------------
drop policy if exists meetings_write on public.meetings;
drop policy if exists meetings_select on public.meetings;

create policy meetings_select on public.meetings for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or exists (select 1 from public.meeting_attendees ma where ma.meeting_id = meetings.id and ma.user_id = auth.uid())
  )
);
create policy meetings_write on public.meetings for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists meetings_prevent_tamper on public.meetings;
create trigger meetings_prevent_tamper before update on public.meetings
  for each row execute function public.prevent_ownership_tamper();

-- deals ----------------------------------------------------------------------
drop policy if exists deals_write on public.deals;
drop policy if exists deals_select on public.deals;

create policy deals_select on public.deals for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy deals_write on public.deals for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists deals_prevent_tamper on public.deals;
create trigger deals_prevent_tamper before update on public.deals
  for each row execute function public.prevent_ownership_tamper();

-- quotations -------------------------------------------------------------------
drop policy if exists quotations_write on public.quotations;
drop policy if exists quotations_select on public.quotations;

create policy quotations_select on public.quotations for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy quotations_write on public.quotations for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists quotations_prevent_tamper on public.quotations;
create trigger quotations_prevent_tamper before update on public.quotations
  for each row execute function public.prevent_ownership_tamper();

-- projects (owner OR listed project member may view/collaborate) -----------------
drop policy if exists projects_write on public.projects;
drop policy if exists projects_select on public.projects;

create policy projects_select on public.projects for select to authenticated using (
  public.is_org_member(organization_id) and (
    owner_user_id = auth.uid()
    or public.has_admin_role(organization_id)
    or exists (select 1 from public.project_members pm where pm.project_id = projects.id and pm.user_id = auth.uid())
  )
);
create policy projects_write on public.projects for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists projects_prevent_tamper on public.projects;
create trigger projects_prevent_tamper before update on public.projects
  for each row execute function public.prevent_ownership_tamper();

-- documents -------------------------------------------------------------------
drop policy if exists documents_write on public.documents;
drop policy if exists documents_select on public.documents;

create policy documents_select on public.documents for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy documents_write on public.documents for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists documents_prevent_tamper on public.documents;
create trigger documents_prevent_tamper before update on public.documents
  for each row execute function public.prevent_ownership_tamper();

-- messages (Webmail) -----------------------------------------------------------
drop policy if exists members_read_org_messages on public.messages;
drop policy if exists members_insert_org_messages on public.messages;
drop policy if exists members_update_org_messages on public.messages;

create policy members_read_org_messages on public.messages for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy members_insert_org_messages on public.messages for insert to authenticated with check (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy members_update_org_messages on public.messages for update to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists messages_prevent_tamper on public.messages;
create trigger messages_prevent_tamper before update on public.messages
  for each row execute function public.prevent_ownership_tamper();

-- demo_email_requests -----------------------------------------------------------
drop policy if exists demo_email_requests_select on public.demo_email_requests;
drop policy if exists demo_email_requests_insert on public.demo_email_requests;
drop policy if exists demo_email_requests_update on public.demo_email_requests;

create policy demo_email_requests_select on public.demo_email_requests for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy demo_email_requests_insert on public.demo_email_requests for insert to authenticated with check (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy demo_email_requests_update on public.demo_email_requests for update to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists demo_email_requests_prevent_tamper on public.demo_email_requests;
create trigger demo_email_requests_prevent_tamper before update on public.demo_email_requests
  for each row execute function public.prevent_ownership_tamper();

-- import_batches -----------------------------------------------------------------
drop policy if exists import_batches_write on public.import_batches;
drop policy if exists import_batches_select on public.import_batches;

create policy import_batches_select on public.import_batches for select to authenticated using (
  public.is_org_member(organization_id) and (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
);
create policy import_batches_write on public.import_batches for all to authenticated
  using (owner_user_id = auth.uid() or public.has_admin_role(organization_id))
  with check (owner_user_id = auth.uid() or public.has_admin_role(organization_id));

drop trigger if exists import_batches_prevent_tamper on public.import_batches;
create trigger import_batches_prevent_tamper before update on public.import_batches
  for each row execute function public.prevent_ownership_tamper();
