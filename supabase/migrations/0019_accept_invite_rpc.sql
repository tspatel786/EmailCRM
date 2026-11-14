-- 0019_accept_invite_rpc.sql
-- Fixes the invite-acceptance gap: invite-member sets memberships.status = 'invited'
-- but nothing ever flipped it to 'active' except organization-bootstrap (first owner
-- only). This RPC lets the invited user self-activate their own membership.

create or replace function public.accept_invite(p_organization_id uuid)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.memberships;
begin
  update public.memberships
  set status = 'active', accepted_at = now()
  where organization_id = p_organization_id
    and user_id = auth.uid()
    and status = 'invited'
  returning * into v_row;

  if v_row.user_id is null then
    raise exception 'no pending invite found for this organization';
  end if;

  return v_row;
end;
$$;

revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.accept_invite(uuid) to authenticated;
