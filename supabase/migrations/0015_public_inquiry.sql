-- 0015_public_inquiry.sql
-- Additive schema for public lead inquiry form (/inquiry/:orgSlug) and abuse protection.
-- Safe to run on an existing database with existing data.

-- 1. Note: public.organizations already has a unique `slug` column (0003_core.sql)
--    and public.contacts already has `consent_captured_at` (0004_crm.sql).
--    Add nullable `consent_text` on contacts to record the consent wording accepted on submission.
alter table public.contacts
  add column if not exists consent_text text;

-- 2. Partial index to speed up mobile duplicate lookup per organization for non-archived contacts.
create index if not exists contacts_org_phone_idx
  on public.contacts (organization_id, primary_phone)
  where primary_phone is not null and archived_at is null;

-- 3. Dedicated rate-limit bucket table for public inquiry submissions (service_role only).
create table if not exists public.inquiry_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0)
);

alter table public.inquiry_rate_limits enable row level security;

drop policy if exists inquiry_rate_limits_deny_anon on public.inquiry_rate_limits;
create policy inquiry_rate_limits_deny_anon on public.inquiry_rate_limits
  for all to anon
  using (false)
  with check (false);

drop policy if exists inquiry_rate_limits_deny_authenticated on public.inquiry_rate_limits;
create policy inquiry_rate_limits_deny_authenticated on public.inquiry_rate_limits
  for all to authenticated
  using (false)
  with check (false);

create or replace function public.consume_inquiry_rate_limit(
  p_bucket text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.inquiry_rate_limits%rowtype;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'consume_inquiry_rate_limit is restricted to service_role';
  end if;
  if p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;
  if p_bucket is null or length(p_bucket) < 3 or length(p_bucket) > 200 then
    raise exception 'invalid rate limit bucket';
  end if;

  insert into public.inquiry_rate_limits (bucket, window_started_at, hits)
  values (p_bucket, now(), 0)
  on conflict (bucket) do nothing;

  select * into rec from public.inquiry_rate_limits where bucket = p_bucket for update;

  if rec.window_started_at < now() - make_interval(secs => p_window_seconds) then
    update public.inquiry_rate_limits
    set window_started_at = now(), hits = 1
    where bucket = p_bucket;
    return true;
  end if;

  if rec.hits >= p_max then
    return false;
  end if;

  update public.inquiry_rate_limits set hits = hits + 1 where bucket = p_bucket;
  return true;
end;
$$;

revoke all on function public.consume_inquiry_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_inquiry_rate_limit(text, integer, integer) from authenticated, anon;
grant execute on function public.consume_inquiry_rate_limit(text, integer, integer) to service_role;

revoke all on table public.inquiry_rate_limits from public, anon, authenticated;
grant all on table public.inquiry_rate_limits to service_role;

-- Rollback notes (run manually only if reverting this feature completely):
-- drop function if exists public.consume_inquiry_rate_limit(text, integer, integer);
-- drop table if exists public.inquiry_rate_limits;
-- drop index if exists public.contacts_org_phone_idx;
-- alter table public.contacts drop column if exists consent_text;

