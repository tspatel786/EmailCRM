-- 0026_mail_composer.sql
-- Gmail-style composer for the Webmail module (public.messages):
--   * CC / BCC recipients, company link, attachments, RFC Message-ID for threading
--   * Drafts (folder = 'draft', status = 'draft'), editable and deletable by their owner
--   * Per-user email signature (profiles.email_signature_html)
--   * Storage: private "mail-attachments" bucket, public "mail-images" bucket (inline images
--     must be reachable by the recipient's mail client)
--   * A guard trigger so browser clients can only create drafts/queued outbound mail as
--     themselves and can never rewrite mail that is already queued, sent or received.
-- Additive: existing rows, campaign tables and the inbound/tracking pipeline are untouched.
-- Rollback: supabase/rollback/0026_rollback.sql

-- 1. Columns ------------------------------------------------------------------------------
alter table public.messages
  add column if not exists cc text[] not null default '{}',
  add column if not exists bcc text[] not null default '{}',
  add column if not exists company_id uuid references public.companies (id) on delete set null,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists rfc_message_id text;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('draft', 'received', 'queued', 'processing', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'));

alter table public.messages drop constraint if exists messages_attachments_is_array;
alter table public.messages add constraint messages_attachments_is_array
  check (jsonb_typeof(attachments) = 'array');

create index if not exists messages_thread_idx on public.messages (organization_id, thread_id, created_at)
  where thread_id is not null;
create index if not exists messages_rfc_id_idx on public.messages (rfc_message_id)
  where rfc_message_id is not null;

alter table public.profiles
  add column if not exists email_signature_html text not null default '';

alter table public.profiles drop constraint if exists profiles_signature_len;
alter table public.profiles add constraint profiles_signature_len
  check (length(email_signature_html) <= 20000);

-- 2. Attachment validation ---------------------------------------------------------------
-- Every attachment must live in the sender's own folder: {org}/{owner}/... and the set is
-- capped (10 files, 10 MB each, 20 MB total; Resend's hard limit is 40 MB per email).
create or replace function public.messages_attachments_valid(p_org uuid, p_owner uuid, p_att jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  a jsonb;
  total bigint := 0;
  prefix text := p_org::text || '/' || coalesce(p_owner::text, '-') || '/';
begin
  if p_att is null or jsonb_typeof(p_att) <> 'array' then return false; end if;
  if jsonb_array_length(p_att) > 10 then return false; end if;
  for a in select * from jsonb_array_elements(p_att) loop
    if jsonb_typeof(a) <> 'object'
       or coalesce(a->>'path', '') = ''
       or left(a->>'path', length(prefix)) <> prefix
       or position('..' in a->>'path') > 0
       or coalesce(a->>'name', '') = ''
       or length(a->>'name') > 255
       or coalesce((a->>'size')::bigint, 0) <= 0
       or (a->>'size')::bigint > 10485760 then
      return false;
    end if;
    total := total + (a->>'size')::bigint;
  end loop;
  return total <= 20971520;
end;
$$;

-- 3. Client guard ------------------------------------------------------------------------
create or replace function public.messages_client_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  n_recipients int;
begin
  -- Worker, webhooks and migrations run as service_role/postgres and are not restricted.
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.folder <> 'draft' then
    -- Queued / sent / received mail is immutable from the browser except read/star flags.
    if (to_jsonb(new) - array['is_read', 'is_starred', 'read_at', 'updated_at'])
       is distinct from (to_jsonb(old) - array['is_read', 'is_starred', 'read_at', 'updated_at']) then
      raise exception 'Only read/star flags can be changed on this message';
    end if;
    return new;
  end if;

  -- INSERT, or UPDATE of a draft (editing it, or sending it).
  if new.owner_user_id is distinct from auth.uid() then
    raise exception 'Messages can only be composed as yourself';
  end if;
  if tg_op = 'UPDATE' and old.owner_user_id is distinct from auth.uid() then
    raise exception 'Only the author can edit a draft';
  end if;
  if not public.has_write_role(new.organization_id) then
    raise exception 'Your role cannot send email';
  end if;
  if new.direction <> 'outbound' then
    raise exception 'Only outbound messages can be composed';
  end if;
  if not ((new.folder = 'draft' and new.status = 'draft') or (new.folder = 'queued' and new.status = 'queued')) then
    raise exception 'New messages must be a draft or queued';
  end if;

  n_recipients := coalesce(array_length(new.cc, 1), 0) + coalesce(array_length(new.bcc, 1), 0)
                  + case when coalesce(new.to_email, '') = '' then 0 else 1 end;
  if n_recipients > 50 then
    raise exception 'Too many recipients (max 50)';
  end if;
  if new.folder = 'queued' and coalesce(new.to_email, '') = '' then
    raise exception 'A recipient is required';
  end if;
  if length(new.body_html) > 1000000 or length(new.body_text) > 500000 then
    raise exception 'Message body is too large';
  end if;
  if not public.messages_attachments_valid(new.organization_id, new.owner_user_id, new.attachments) then
    raise exception 'Invalid attachments';
  end if;

  -- Provider bookkeeping is owned by the worker.
  new.provider_message_id := null;
  new.attempt_count := 0;
  new.locked_until := null;
  new.last_error := null;
  new.is_read := true;
  if new.folder = 'queued' then
    new.next_attempt_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists messages_client_guard on public.messages;
create trigger messages_client_guard
  before insert or update on public.messages
  for each row execute function public.messages_client_guard();

-- Drafts may be discarded by their author (sent/received mail is never deleted by clients).
drop policy if exists messages_delete_own_draft on public.messages;
create policy messages_delete_own_draft on public.messages
  for delete to authenticated
  using (owner_user_id = auth.uid() and folder = 'draft');

grant delete on public.messages to authenticated;

-- 4. Storage -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mail-attachments', 'mail-attachments', false, 10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv', 'text/plain',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/zip'
  ]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mail-images', 'mail-images', true, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Safe uuid parse so a malformed object path never raises inside a policy.
create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- Path convention for both buckets: {organization_id}/{user_id}/{random}/{filename}
drop policy if exists mail_attachments_select on storage.objects;
create policy mail_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mail-attachments'
    and public.is_org_member(public.try_uuid(split_part(name, '/', 1)))
    and (split_part(name, '/', 2) = auth.uid()::text
         or public.has_view_all_role(public.try_uuid(split_part(name, '/', 1))))
  );

drop policy if exists mail_attachments_insert on storage.objects;
create policy mail_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('mail-attachments', 'mail-images')
    and split_part(name, '/', 2) = auth.uid()::text
    and public.has_write_role(public.try_uuid(split_part(name, '/', 1)))
  );

drop policy if exists mail_attachments_delete on storage.objects;
create policy mail_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('mail-attachments', 'mail-images')
    and split_part(name, '/', 2) = auth.uid()::text
  );
