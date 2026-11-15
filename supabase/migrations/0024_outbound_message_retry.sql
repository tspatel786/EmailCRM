-- 0024_outbound_message_retry.sql
-- Outbound Webmail replies (messages.direction = 'outbound') were claimed by immediately
-- writing folder='sent' before the send was attempted, so a worker crash mid-send left the
-- row permanently mislabeled as sent with no retry/backoff/daily-quota path. Add the same
-- claim/retry bookkeeping already used by the campaign queue (email_jobs) so outbound
-- messages get correct status transitions and crash recovery. Additive only; no existing
-- column, row, or constraint is altered destructively.

alter table public.messages
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists locked_until timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists last_error text;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('received', 'queued', 'processing', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'));

create index if not exists messages_outbound_claim_idx
  on public.messages (organization_id, next_attempt_at)
  where direction = 'outbound' and folder = 'queued' and status = 'queued';
