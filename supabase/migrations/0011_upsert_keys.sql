alter table public.suppressions
  add column if not exists email_normalized text generated always as (lower(email)) stored;

drop index if exists public.suppressions_org_email_unique;
create unique index suppressions_org_email_unique
  on public.suppressions (organization_id, email_normalized);

alter table public.contacts
  add column if not exists primary_email_normalized text generated always as (lower(primary_email)) stored;

drop index if exists public.contacts_org_email_unique;
create unique index contacts_org_email_unique
  on public.contacts (organization_id, primary_email_normalized)
  where primary_email is not null and archived_at is null;
