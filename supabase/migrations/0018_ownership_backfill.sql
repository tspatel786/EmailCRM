-- 0018_ownership_backfill.sql
-- Data-only migration: populate owner_user_id from the best existing attribution
-- column, falling back to the organization's owner-role member. owner_user_id is
-- intentionally left nullable forever -- a null owner stays admin-only visible
-- (see 0020/0021) rather than forcing a risky NOT NULL cutover on legacy rows.

update public.companies t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.contacts t
set owner_user_id = coalesce(
  t.assigned_to,
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.calls t
set owner_user_id = t.employee_id
where t.owner_user_id is null;

update public.tasks t
set owner_user_id = coalesce(
  t.assigned_to,
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.meetings t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.deals t
set owner_user_id = coalesce(
  t.owner_id,
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.quotations t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.projects t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.documents t
set owner_user_id = coalesce(
  t.uploaded_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.messages t
set owner_user_id = (
  select m.user_id from public.memberships m
  where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
  order by m.created_at limit 1
)
where t.owner_user_id is null;

update public.demo_email_requests t
set owner_user_id = coalesce(
  t.requested_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;

update public.import_batches t
set owner_user_id = coalesce(
  t.created_by,
  (select m.user_id from public.memberships m
   where m.organization_id = t.organization_id and m.role = 'owner' and m.status = 'active'
   order by m.created_at limit 1)
)
where t.owner_user_id is null;
