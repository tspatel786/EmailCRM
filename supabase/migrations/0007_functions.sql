-- Membership helpers are SECURITY DEFINER so RLS on memberships does not recurse.
-- They only inspect auth.uid() and never accept a target user id.

create or replace function public.my_active_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.memberships
  where user_id = auth.uid()
    and status = 'active';
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where organization_id = p_org
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.my_org_role(p_org uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.memberships
  where organization_id = p_org
    and user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.has_write_role(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.my_org_role(p_org) in ('owner', 'admin', 'sales_manager', 'sales_executive');
$$;

create or replace function public.has_manage_role(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.my_org_role(p_org) in ('owner', 'admin', 'sales_manager');
$$;

create or replace function public.has_admin_role(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.my_org_role(p_org) in ('owner', 'admin');
$$;

create or replace function public.record_activity(
  p_org uuid,
  p_contact uuid,
  p_company uuid,
  p_type public.activity_type,
  p_summary text,
  p_outcome text default null,
  p_source_table text default null,
  p_source_id uuid default null,
  p_next_follow_up timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_org_member(p_org) then
    raise exception 'not a member of organization';
  end if;

  insert into public.activities (
    organization_id, contact_id, company_id, actor_user_id, activity_type,
    summary, outcome, source_table, source_id, next_follow_up_at
  ) values (
    p_org, p_contact, p_company, auth.uid(), p_type,
    p_summary, p_outcome, p_source_table, p_source_id, p_next_follow_up
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Worker-only: atomic claim. EXECUTE granted only to service_role.
create or replace function public.claim_email_jobs(
  p_limit integer,
  p_worker_id text,
  p_lease_seconds integer
)
returns setof public.email_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role', true) is distinct from 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'claim_email_jobs is restricted to service_role';
  end if;

  return query
  with picked as (
    select j.id
    from public.email_jobs j
    join public.campaigns c on c.id = j.campaign_id
    where j.status in ('queued', 'failed')
      and j.next_attempt_at <= now()
      and j.attempt_count < j.max_attempts
      and (j.locked_until is null or j.locked_until < now())
      and c.status in ('queued', 'sending', 'scheduled')
    order by j.next_attempt_at, j.created_at
    for update of j skip locked
    limit greatest(p_limit, 0)
  )
  update public.email_jobs j
  set
    status = 'claimed',
    locked_by = p_worker_id,
    locked_until = now() + make_interval(secs => greatest(p_lease_seconds, 30)),
    claimed_at = now(),
    attempt_count = j.attempt_count + 1
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

create or replace function public.increment_org_email_stat(
  p_org uuid,
  p_accepted integer,
  p_failed integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'restricted';
  end if;

  insert into public.org_email_daily_stats (organization_id, send_date, accepted_count, failed_count)
  values (p_org, (timezone('utc', now()))::date, greatest(p_accepted, 0), greatest(p_failed, 0))
  on conflict (organization_id, send_date)
  do update set
    accepted_count = org_email_daily_stats.accepted_count + excluded.accepted_count,
    failed_count = org_email_daily_stats.failed_count + excluded.failed_count;
end;
$$;

create or replace function public.org_email_remaining(p_org uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select greatest(
    o.daily_email_limit - coalesce(s.accepted_count, 0),
    0
  )
  from public.organizations o
  left join public.org_email_daily_stats s
    on s.organization_id = o.id
   and s.send_date = (timezone('utc', now()))::date
  where o.id = p_org;
$$;

revoke all on function public.claim_email_jobs(integer, text, integer) from public;
revoke all on function public.increment_org_email_stat(uuid, integer, integer) from public;
grant execute on function public.claim_email_jobs(integer, text, integer) to postgres;
grant execute on function public.increment_org_email_stat(uuid, integer, integer) to postgres;

grant execute on function public.my_active_org_ids() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.my_org_role(uuid) to authenticated;
grant execute on function public.has_write_role(uuid) to authenticated;
grant execute on function public.has_manage_role(uuid) to authenticated;
grant execute on function public.has_admin_role(uuid) to authenticated;
grant execute on function public.record_activity(uuid, uuid, uuid, public.activity_type, text, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.org_email_remaining(uuid) to authenticated;
