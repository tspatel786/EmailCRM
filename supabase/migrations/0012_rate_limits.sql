create table public.edge_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0)
);

alter table public.edge_rate_limits enable row level security;

create policy edge_rate_limits_deny_authenticated on public.edge_rate_limits
  for all to authenticated
  using (false)
  with check (false);

create or replace function public.consume_rate_limit(
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
  rec public.edge_rate_limits%rowtype;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'consume_rate_limit is restricted to service_role';
  end if;
  if p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;
  if p_bucket is null or length(p_bucket) < 3 or length(p_bucket) > 200 then
    raise exception 'invalid rate limit bucket';
  end if;

  insert into public.edge_rate_limits (bucket, window_started_at, hits)
  values (p_bucket, now(), 0)
  on conflict (bucket) do nothing;

  select * into rec from public.edge_rate_limits where bucket = p_bucket for update;

  if rec.window_started_at < now() - make_interval(secs => p_window_seconds) then
    update public.edge_rate_limits
    set window_started_at = now(), hits = 1
    where bucket = p_bucket;
    return true;
  end if;

  if rec.hits >= p_max then
    return false;
  end if;

  update public.edge_rate_limits set hits = hits + 1 where bucket = p_bucket;
  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, integer, integer) from authenticated, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
grant all on table public.edge_rate_limits to service_role;
revoke insert, update, delete on public.edge_rate_limits from authenticated;
