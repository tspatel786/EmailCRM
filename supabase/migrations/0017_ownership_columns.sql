-- 0017_ownership_columns.sql
-- Adds a single-owner attribution column to every primary CRM/record table so RLS
-- can enforce "private by default" visibility in a later migration. Purely additive:
-- columns are nullable and no policy behavior changes in this migration.

alter table public.companies add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.contacts add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.calls add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.tasks add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.meetings add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.deals add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.quotations add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.projects add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.documents add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.messages add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.demo_email_requests add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.import_batches add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;

create index if not exists companies_org_owner_idx on public.companies (organization_id, owner_user_id);
create index if not exists contacts_org_owner_idx on public.contacts (organization_id, owner_user_id);
create index if not exists calls_org_owner_idx on public.calls (organization_id, owner_user_id);
create index if not exists tasks_org_owner_idx on public.tasks (organization_id, owner_user_id);
create index if not exists meetings_org_owner_idx on public.meetings (organization_id, owner_user_id);
create index if not exists deals_org_owner_idx on public.deals (organization_id, owner_user_id);
create index if not exists quotations_org_owner_idx on public.quotations (organization_id, owner_user_id);
create index if not exists projects_org_owner_idx on public.projects (organization_id, owner_user_id);
create index if not exists documents_org_owner_idx on public.documents (organization_id, owner_user_id);
create index if not exists messages_org_owner_idx on public.messages (organization_id, owner_user_id);
create index if not exists demo_email_requests_org_owner_idx on public.demo_email_requests (organization_id, owner_user_id);
create index if not exists import_batches_org_owner_idx on public.import_batches (organization_id, owner_user_id);
