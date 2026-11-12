-- 0016_messages_and_webmail.sql
-- Unified Webmail message store for Inbox (inbound emails/replies), Sent (outbound dispatches),
-- Drafts, Queued, and Failed messages. Supports multi-tenant RLS, Resend message tracking,
-- and contact association.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  folder text not null default 'inbox' check (folder in ('inbox', 'sent', 'queued', 'failed', 'trash', 'draft')),
  status text not null default 'delivered' check (status in ('received', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  from_name text not null default '',
  from_email text not null,
  to_name text not null default '',
  to_email text not null,
  reply_to text,
  subject text not null default '(No Subject)',
  body_text text not null default '',
  body_html text not null default '',
  provider text not null default 'resend',
  provider_message_id text,
  thread_id text,
  in_reply_to text,
  is_read boolean not null default false,
  is_starred boolean not null default false,
  read_at timestamptz,
  headers jsonb not null default '{}'::jsonb,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_org_folder_idx
  on public.messages (organization_id, folder, created_at desc);

create index if not exists messages_org_contact_idx
  on public.messages (organization_id, contact_id, created_at desc);

create index if not exists messages_provider_id_idx
  on public.messages (provider_message_id)
  where provider_message_id is not null;

create index if not exists messages_org_unread_idx
  on public.messages (organization_id, folder, is_read)
  where is_read = false;

create trigger messages_updated_at before update on public.messages
  for each row execute function public.set_updated_at();

-- RLS
alter table public.messages enable row level security;

-- Members can select messages of their organization
create policy "members_read_org_messages" on public.messages
  for select
  using (public.is_org_member(organization_id));

-- Members can insert outbound messages for their organization
create policy "members_insert_org_messages" on public.messages
  for insert
  with check (public.is_org_member(organization_id));

-- Members can update folder / is_read / is_starred of their organization's messages
create policy "members_update_org_messages" on public.messages
  for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Service role bypasses RLS automatically (used by worker and webhook edge functions)
grant select, insert, update on public.messages to authenticated;

