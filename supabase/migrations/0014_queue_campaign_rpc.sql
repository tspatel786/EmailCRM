-- 0014_queue_campaign_rpc.sql
-- Provides a reliable database-level fallback for queueing campaigns
-- in environments where Edge Functions are not deployed or reach rate limits.

create or replace function public.queue_campaign(
  p_campaign_id uuid,
  p_confirmed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_queued_count integer := 0;
  v_is_scheduled boolean;
begin
  if not coalesce(p_confirmed, false) then
    raise exception 'confirmation_required';
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;

  if not found then
    raise exception 'campaign_not_found';
  end if;

  if not public.has_manage_role(v_campaign.organization_id) then
    raise exception 'forbidden';
  end if;

  if v_campaign.status not in ('draft', 'scheduled', 'paused') then
    raise exception 'invalid_status: %', v_campaign.status;
  end if;

  v_is_scheduled := v_campaign.scheduled_at is not null and v_campaign.scheduled_at > now();

  -- Fan out jobs into email_jobs with variable substitution and deduplication
  with eligible_contacts as (
    select c.id, c.primary_email, c.full_name, c.company_name, c.service_interest, c.primary_phone, c.city
    from public.contacts c
    where c.organization_id = v_campaign.organization_id
      and c.archived_at is null
      and c.primary_email is not null
      and c.primary_email <> ''
      and (v_campaign.list_id is null or c.id in (
        select clm.contact_id from public.contact_list_members clm where clm.list_id = v_campaign.list_id
      ))
      and lower(c.primary_email) not in (
        select lower(s.email) from public.suppressions s where s.organization_id = v_campaign.organization_id
      )
      and (not v_campaign.requires_consent or c.consent_status = 'granted')
  ),
  inserted_jobs as (
    insert into public.email_jobs (
      organization_id,
      campaign_id,
      contact_id,
      to_email,
      subject,
      body_text,
      body_html,
      status,
      scheduled_at,
      next_attempt_at,
      idempotency_key
    )
    select
      v_campaign.organization_id,
      v_campaign.id,
      ec.id,
      ec.primary_email,
      replace(replace(replace(replace(replace(replace(v_campaign.subject, '{{name}}', coalesce(ec.full_name, '')), '{{company}}', coalesce(ec.company_name, '')), '{{service}}', coalesce(ec.service_interest, '')), '{{email}}', coalesce(ec.primary_email, '')), '{{phone}}', coalesce(ec.primary_phone, '')), '{{city}}', coalesce(ec.city, '')),
      replace(replace(replace(replace(replace(replace(v_campaign.body_text, '{{name}}', coalesce(ec.full_name, '')), '{{company}}', coalesce(ec.company_name, '')), '{{service}}', coalesce(ec.service_interest, '')), '{{email}}', coalesce(ec.primary_email, '')), '{{phone}}', coalesce(ec.primary_phone, '')), '{{city}}', coalesce(ec.city, '')),
      case when v_campaign.body_html is not null and length(trim(v_campaign.body_html)) > 0
        then replace(replace(replace(replace(replace(replace(v_campaign.body_html, '{{name}}', coalesce(ec.full_name, '')), '{{company}}', coalesce(ec.company_name, '')), '{{service}}', coalesce(ec.service_interest, '')), '{{email}}', coalesce(ec.primary_email, '')), '{{phone}}', coalesce(ec.primary_phone, '')), '{{city}}', coalesce(ec.city, ''))
        else null
      end,
      'queued',
      coalesce(v_campaign.scheduled_at, now()),
      coalesce(v_campaign.scheduled_at, now()),
      v_campaign.id::text || ':' || ec.id::text
    from eligible_contacts ec
    on conflict (idempotency_key) do nothing
    returning id
  )
  select count(*) into v_queued_count from inserted_jobs;

  update public.campaigns
  set
    status = case when v_is_scheduled then 'scheduled' else 'queued' end,
    recipient_count = v_queued_count,
    queued_count = v_queued_count,
    updated_at = now()
  where id = v_campaign.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_table,
    entity_id,
    metadata
  ) values (
    v_campaign.organization_id,
    auth.uid(),
    'campaign.queued',
    'campaigns',
    v_campaign.id,
    jsonb_build_object('jobs', v_queued_count, 'scheduled', v_is_scheduled)
  );

  return jsonb_build_object(
    'ok', true,
    'queued', v_queued_count,
    'scheduled', v_is_scheduled
  );
end;
$$;

revoke all on function public.queue_campaign(uuid, boolean) from public;
grant execute on function public.queue_campaign(uuid, boolean) to authenticated;
