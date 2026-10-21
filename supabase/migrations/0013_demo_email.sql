-- 0013_demo_email.sql
-- Table for queuing and tracking demo / test emails sent for email templates

create table if not exists public.demo_email_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid references public.email_templates (id) on delete set null,
  requested_by uuid references public.profiles (id) on delete set null,
  recipient_email text not null,
  subject text not null,
  body_text text not null default '',
  body_html text not null default '',
  status text not null default 'pending', -- 'pending', 'processing', 'sent', 'failed'
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists demo_email_requests_status_idx
  on public.demo_email_requests (status, created_at)
  where status = 'pending';

create index if not exists demo_email_requests_org_idx
  on public.demo_email_requests (organization_id);

alter table public.demo_email_requests enable row level security;

create policy demo_email_requests_select on public.demo_email_requests
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy demo_email_requests_insert on public.demo_email_requests
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy demo_email_requests_update on public.demo_email_requests
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update on public.demo_email_requests to authenticated;
grant all on public.demo_email_requests to service_role;
