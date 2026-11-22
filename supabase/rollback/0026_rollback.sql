-- Rollback for 0026_mail_composer.sql.
-- Drafts are deleted first because the old status constraint does not allow 'draft'.
-- New columns are kept (dropping them would lose CC/BCC/attachment history); drop them
-- manually if a full revert is required.
drop trigger if exists messages_client_guard on public.messages;
drop function if exists public.messages_client_guard();
drop policy if exists messages_delete_own_draft on public.messages;
revoke delete on public.messages from authenticated;
delete from public.messages where folder = 'draft' or status = 'draft';
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('received', 'queued', 'processing', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'));
drop policy if exists mail_attachments_select on storage.objects;
drop policy if exists mail_attachments_insert on storage.objects;
drop policy if exists mail_attachments_delete on storage.objects;
-- Buckets are left in place so already-sent attachments stay readable by the worker history.
