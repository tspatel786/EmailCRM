-- 0027_payments.sql
-- Payment Management: payments recorded against approved quotations.
--   Customer -> Approved quotation -> Payment entry -> Receipt -> Outstanding balance.
--
-- Rules enforced in the database (not only in the UI):
--   * A payment can only be recorded against a quotation in status approved / sent / accepted.
--   * Contact, company and owner are copied from the quotation (cannot be spoofed).
--   * Outstanding = quotation.total_amount - sum(valid payments). Valid payments may not exceed
--     the quotation amount unless an Owner/Admin records an explicit excess-adjustment reason.
--   * Duplicate transaction references (same org, case-insensitive) are rejected.
--   * Payments are never deleted: they are voided with a reason, and every insert/update is
--     written to payment_audit (edit history).
--   * Visibility follows quotations: the quotation owner, and Owner/Admin/Sales Manager
--     (has_view_all_role). Writes: quotation owner (non-viewer) or Owner/Admin.
-- Rollback: supabase/rollback/0027_rollback.sql

-- 1. Enums --------------------------------------------------------------------------------
do $$ begin
  create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_kind as enum ('advance', 'partial', 'full');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_record_status as enum ('valid', 'void');
exception when duplicate_object then null; end $$;

-- 2. Receipt counters ---------------------------------------------------------------------
create table if not exists public.org_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  counter_key text not null,
  value bigint not null default 0,
  primary key (organization_id, counter_key)
);
alter table public.org_counters enable row level security;
-- No policies: only security-definer functions touch it.
revoke all on public.org_counters from anon, authenticated;

-- 3. Payments -----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quotation_id uuid not null references public.quotations (id) on delete restrict,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  owner_user_id uuid references public.profiles (id) on delete set null,
  receipt_number text not null,
  amount numeric(14, 2) not null check (amount > 0 and amount <= 1000000000),
  currency text not null default 'INR',
  payment_kind public.payment_kind not null default 'partial',
  payment_mode public.payment_mode not null,
  reference text check (reference is null or length(reference) between 1 and 120),
  payment_date date not null default current_date,
  notes text check (notes is null or length(notes) <= 2000),
  status public.payment_record_status not null default 'valid',
  excess_reason text check (excess_reason is null or length(excess_reason) between 5 and 500),
  excess_approved_by uuid references public.profiles (id) on delete set null,
  void_reason text check (void_reason is null or length(void_reason) between 3 and 500),
  voided_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payments_receipt_unique on public.payments (organization_id, receipt_number);
create unique index if not exists payments_reference_unique on public.payments (organization_id, lower(btrim(reference)))
  where status = 'valid' and reference is not null;
create index if not exists payments_quotation_idx on public.payments (quotation_id, payment_date);
create index if not exists payments_org_date_idx on public.payments (organization_id, payment_date desc);
create index if not exists payments_contact_idx on public.payments (organization_id, contact_id);

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- 4. Audit history ------------------------------------------------------------------------
create table if not exists public.payment_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payment_id uuid not null references public.payments (id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'voided')),
  actor_user_id uuid references public.profiles (id) on delete set null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payment_audit_payment_idx on public.payment_audit (payment_id, created_at);

-- 5. Validation trigger (security definer: needs every valid payment of the quotation to
--    compute the balance, regardless of who recorded them; it never returns data).
create or replace function public.payments_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
  others numeric(14, 2);
  -- NOTE: inside a SECURITY DEFINER function current_user is the function owner, so the
  -- caller is identified from the request JWT instead. No JWT = direct DB/service access.
  uid uuid := auth.uid();
  is_service boolean := auth.uid() is null or coalesce(auth.role(), '') = 'service_role';
  yr text;
  seq bigint;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.quotation_id is distinct from old.quotation_id
       or new.receipt_number is distinct from old.receipt_number
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Organization, quotation and receipt number of a payment cannot be changed';
    end if;
    if old.status = 'void' then
      raise exception 'A voided payment cannot be edited';
    end if;
  end if;

  select id, organization_id, owner_user_id, contact_id, company_id, status, total_amount, currency
    into q
    from public.quotations
   where id = new.quotation_id
   for update;  -- serialises concurrent payments on the same quotation

  if q.id is null or q.organization_id <> new.organization_id then
    raise exception 'Quotation not found in this organization';
  end if;
  if q.status::text not in ('approved', 'sent', 'accepted') then
    raise exception 'Payments can only be recorded against an approved quotation (current status: %)', q.status;
  end if;
  if coalesce(q.total_amount, 0) <= 0 then
    raise exception 'The quotation has no amount';
  end if;

  -- Derived fields: always from the quotation.
  new.contact_id := q.contact_id;
  new.company_id := q.company_id;
  new.owner_user_id := q.owner_user_id;
  new.currency := coalesce(q.currency, 'INR');
  new.reference := nullif(btrim(coalesce(new.reference, '')), '');
  new.updated_by := coalesce(uid, new.updated_by);

  if tg_op = 'INSERT' then
    new.created_by := coalesce(uid, new.created_by);
    new.status := 'valid';
    new.voided_at := null; new.voided_by := null; new.void_reason := null;
    yr := to_char(coalesce(new.payment_date, current_date), 'YYYY');
    insert into public.org_counters (organization_id, counter_key, value)
      values (new.organization_id, 'receipt-' || yr, 1)
      on conflict (organization_id, counter_key) do update set value = public.org_counters.value + 1
      returning value into seq;
    new.receipt_number := 'RCPT-' || yr || '-' || lpad(seq::text, 4, '0');
  end if;

  -- Voiding
  if tg_op = 'UPDATE' and new.status = 'void' and old.status = 'valid' then
    if coalesce(btrim(new.void_reason), '') = '' then
      raise exception 'A reason is required to void a payment';
    end if;
    new.voided_at := now();
    new.voided_by := uid;
    return new;
  end if;

  -- Balance check (only valid payments count). Lowering an amount or editing other fields of
  -- an existing payment is always allowed; only new money is checked against the balance.
  if tg_op = 'UPDATE' and new.amount <= old.amount then
    if new.excess_reason is distinct from old.excess_reason and not is_service and not public.has_admin_role(new.organization_id) then
      raise exception 'Only an Owner or Admin can change an excess adjustment';
    end if;
    return new;
  end if;

  select coalesce(sum(amount), 0) into others
    from public.payments
   where quotation_id = new.quotation_id and status = 'valid'
     and id <> new.id;

  if others + new.amount > q.total_amount then
    if new.excess_reason is null then
      raise exception 'Payment exceeds the outstanding balance (outstanding: %). An Owner/Admin must record an excess adjustment reason.',
        greatest(q.total_amount - others, 0);
    end if;
    if not is_service and not public.has_admin_role(new.organization_id) then
      raise exception 'Only an Owner or Admin can approve a payment above the quotation amount';
    end if;
    new.excess_approved_by := uid;
  elsif tg_op = 'INSERT' or new.excess_reason is distinct from old.excess_reason then
    -- No excess: clear any adjustment fields a client may have sent.
    new.excess_reason := null;
    new.excess_approved_by := null;
  end if;

  -- Kind: a single payment covering the whole amount is "full"; advance stays when chosen;
  -- otherwise "partial".
  if others = 0 and new.amount >= q.total_amount then
    new.payment_kind := 'full';
  elsif new.payment_kind = 'full' then
    new.payment_kind := 'partial';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_before_write on public.payments;
create trigger payments_before_write
  before insert or update on public.payments
  for each row execute function public.payments_before_write();

create or replace function public.payments_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diff jsonb := '{}'::jsonb;
  k text;
  watched text[] := array['amount', 'payment_mode', 'payment_kind', 'reference', 'payment_date', 'notes', 'status', 'excess_reason', 'void_reason'];
begin
  if tg_op = 'INSERT' then
    insert into public.payment_audit (organization_id, payment_id, action, actor_user_id, changes)
    values (new.organization_id, new.id, 'created', coalesce(auth.uid(), new.created_by),
            jsonb_build_object('amount', new.amount, 'payment_mode', new.payment_mode, 'payment_kind', new.payment_kind,
                               'reference', new.reference, 'payment_date', new.payment_date, 'receipt_number', new.receipt_number));
    return new;
  end if;
  foreach k in array watched loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      diff := diff || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.payment_audit (organization_id, payment_id, action, actor_user_id, changes)
    values (new.organization_id, new.id, case when new.status = 'void' and old.status = 'valid' then 'voided' else 'updated' end,
            auth.uid(), diff);
  end if;
  return new;
end;
$$;

drop trigger if exists payments_after_write on public.payments;
create trigger payments_after_write
  after insert or update on public.payments
  for each row execute function public.payments_after_write();

revoke all on function public.payments_before_write() from public, anon, authenticated;
revoke all on function public.payments_after_write() from public, anon, authenticated;

-- 6. RLS ----------------------------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.payment_audit enable row level security;

create or replace function public.can_write_quotation_payments(p_quotation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.quotations q
     where q.id = p_quotation
       and public.has_write_role(q.organization_id)
       and (q.owner_user_id = auth.uid() or public.has_admin_role(q.organization_id))
  );
$$;
revoke all on function public.can_write_quotation_payments(uuid) from public, anon;
grant execute on function public.can_write_quotation_payments(uuid) to authenticated, service_role;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_user_id = auth.uid() or created_by = auth.uid() or public.has_view_all_role(organization_id))
  );

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated
  with check (public.is_org_member(organization_id) and public.can_write_quotation_payments(quotation_id));

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated
  using (public.is_org_member(organization_id) and public.can_write_quotation_payments(quotation_id))
  with check (public.is_org_member(organization_id) and public.can_write_quotation_payments(quotation_id));

-- No delete policy: payments are voided, never deleted.
grant select, insert, update on public.payments to authenticated;
revoke delete on public.payments from authenticated;

drop policy if exists payment_audit_select on public.payment_audit;
create policy payment_audit_select on public.payment_audit
  for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_audit.payment_id));  -- inherits payments RLS
grant select on public.payment_audit to authenticated;
revoke insert, update, delete on public.payment_audit from authenticated;

-- 7. Summary view (security_invoker: callers only see quotations/payments RLS allows) ----
create or replace view public.quotation_payment_summary
with (security_invoker = true) as
select
  q.id as quotation_id,
  q.organization_id,
  q.owner_user_id,
  q.contact_id,
  q.company_id,
  q.title,
  q.status as quotation_status,
  q.currency,
  q.total_amount,
  q.created_at,
  q.approved_at,
  coalesce(p.received, 0)::numeric(14, 2) as received_amount,
  greatest(q.total_amount - coalesce(p.received, 0), 0)::numeric(14, 2) as outstanding_amount,
  coalesce(p.payment_count, 0) as payment_count,
  p.last_payment_date,
  case
    when coalesce(p.received, 0) <= 0 then 'pending'
    when coalesce(p.received, 0) < q.total_amount then 'partial'
    else 'paid'
  end as payment_status
from public.quotations q
left join (
  select quotation_id, sum(amount) as received, count(*) as payment_count, max(payment_date) as last_payment_date
    from public.payments
   where status = 'valid'
   group by quotation_id
) p on p.quotation_id = q.id
where q.status::text in ('approved', 'sent', 'accepted');

grant select on public.quotation_payment_summary to authenticated;
