create temp table t_result(test text, expected text, got text);

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;

create or replace function pg_temp.check(p_name text, p_expect text, p_sql text) returns void language plpgsql as $f$
declare n int; outcome text; v text;
begin
  begin
    if p_sql ilike 'select%' and p_sql ilike '%as v%' then
      execute p_sql into v;
      outcome := 'val:' || coalesce(v, 'null');
    else
      execute p_sql;
      get diagnostics n = row_count;
      outcome := 'ok:' || n;
    end if;
  exception when others then
    outcome := 'error';
  end;
  execute 'reset role';
  insert into t_result values (p_name, p_expect, outcome);
end $f$;

do $t$
declare
  org uuid := (select id from organizations where slug = 'smpatel-it-hub');
  other_org uuid := (select id from organizations where slug <> 'smpatel-it-hub' limit 1);
  exec uuid := (select user_id from memberships where organization_id = org and role = 'sales_executive' and status = 'active' limit 1);
  mgr uuid := (select user_id from memberships where organization_id = org and role = 'sales_manager' and status = 'active' limit 1);
  viewer uuid := (select user_id from memberships where organization_id = org and role = 'viewer' and status = 'active' limit 1);
  own uuid := (select user_id from memberships where organization_id = org and role = 'owner' and status = 'active' limit 1);
  contact uuid := (select id from contacts where organization_id = org limit 1);
  q1 uuid := gen_random_uuid(); q2 uuid := gen_random_uuid(); q3 uuid := gen_random_uuid();
  pay uuid;
  ins text := $$insert into payments (organization_id, quotation_id, amount, payment_mode, payment_kind, reference, excess_reason, contact_id)
                values (%L, %L, %s, %L, %L, %L, %L, %L)$$;
begin
  insert into quotations (id, organization_id, contact_id, title, status, total_amount, owner_user_id) values
    (q1, org, contact, 'TEST full', 'approved', 10000, exec),
    (q2, org, contact, 'TEST partial', 'approved', 10000, exec),
    (q3, org, contact, 'TEST pending', 'pending_approval', 10000, exec);

  perform pg_temp.as_user(exec);
  perform pg_temp.check('single full payment', 'ok:1', format(ins, org, q1, 10000, 'bank_transfer', 'partial', 'NEFT-001', null, null));
  perform pg_temp.check('full payment auto-marked "full"', 'val:full', format($$select payment_kind::text as v from payments where quotation_id = %L$$, q1));
  perform pg_temp.check('receipt number generated', 'val:t', format($$select (receipt_number ~ '^RCPT-\d{4}-\d{4}$')::text::char as v from payments where quotation_id = %L$$, q1));
  perform pg_temp.check('fully paid quotation status = paid', 'val:paid', format($$select payment_status as v from quotation_payment_summary where quotation_id = %L$$, q1));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('cannot pay more than outstanding', 'error', format(ins, org, q1, 1, 'cash', 'partial', null, null, null));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('advance payment', 'ok:1', format(ins, org, q2, 3000, 'upi', 'advance', 'UTR123', null, null));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('second partial payment', 'ok:1', format(ins, org, q2, 2000, 'cash', 'partial', null, null, null));
  perform pg_temp.check('advance kind kept', 'val:advance', format($$select payment_kind::text as v from payments where quotation_id = %L and amount = 3000$$, q2));
  perform pg_temp.check('outstanding = 10000 - 5000', 'val:5000.00', format($$select outstanding_amount::text as v from quotation_payment_summary where quotation_id = %L$$, q2));
  perform pg_temp.check('status partial', 'val:partial', format($$select payment_status as v from quotation_payment_summary where quotation_id = %L$$, q2));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('duplicate transaction reference rejected', 'error', format(ins, org, q2, 100, 'upi', 'partial', 'UTR123', null, null));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('duplicate reference (different case/spaces) rejected', 'error', format(ins, org, q2, 100, 'upi', 'partial', '  utr123 ', null, null));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('cannot pay an unapproved quotation', 'error', format(ins, org, q3, 100, 'cash', 'partial', null, null, null));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('contact copied from quotation (spoof ignored)', 'ok:1', format(ins, org, q2, 100, 'cash', 'partial', 'SPOOF-1', null, gen_random_uuid()));
  perform pg_temp.check('contact id = quotation contact', 'val:t', format($$select (contact_id = %L)::text::char as v from payments where reference = 'SPOOF-1'$$, contact));

  perform pg_temp.as_user(mgr);
  perform pg_temp.check('manager sees exec payments', 'val:4', format($$select count(*)::text as v from payments where quotation_id in (%L, %L)$$, q1, q2));
  perform pg_temp.as_user(mgr);
  perform pg_temp.check('manager cannot add payment to exec quotation', 'error', format(ins, org, q2, 100, 'cash', 'partial', null, null, null));

  perform pg_temp.as_user(viewer);
  perform pg_temp.check('viewer cannot see exec payments', 'val:0', format($$select count(*)::text as v from payments where quotation_id in (%L, %L)$$, q1, q2));
  perform pg_temp.as_user(viewer);
  perform pg_temp.check('viewer cannot add payments', 'error', format(ins, org, q2, 100, 'cash', 'partial', null, null, null));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec cannot approve excess payment', 'error', format(ins, org, q2, 9000, 'cash', 'partial', null, 'Extra work billed', null));
  perform pg_temp.as_user(own);
  perform pg_temp.check('owner: excess without reason rejected', 'error', format(ins, org, q2, 9000, 'cash', 'partial', null, null, null));
  perform pg_temp.as_user(own);
  perform pg_temp.check('owner: excess with reason allowed', 'ok:1', format(ins, org, q2, 9000, 'bank_transfer', 'partial', 'EXCESS-1', 'Extra work billed separately', null));
  perform pg_temp.check('excess approver recorded', 'val:t', format($$select (excess_approved_by = %L)::text::char as v from payments where reference = 'EXCESS-1'$$, own));
  perform pg_temp.check('overpaid quotation shows outstanding 0', 'val:0.00', format($$select outstanding_amount::text as v from quotation_payment_summary where quotation_id = %L$$, q2));

  select id into pay from payments where quotation_id = q2 and amount = 2000;
  perform pg_temp.as_user(exec);
  perform pg_temp.check('edit payment amount', 'ok:1', format($$update payments set amount = 1500 where id = %L$$, pay));
  perform pg_temp.check('edit written to audit history', 'val:1', format($$select count(*)::text as v from payment_audit where payment_id = %L and action = 'updated' and changes ? 'amount'$$, pay));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('cannot move payment to another quotation', 'error', format($$update payments set quotation_id = %L where id = %L$$, q1, pay));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('void requires a reason', 'error', format($$update payments set status = 'void' where id = %L$$, pay));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('void with reason', 'ok:1', format($$update payments set status = 'void', void_reason = 'Entered twice' where id = %L$$, pay));
  perform pg_temp.check('void logged in history', 'val:1', format($$select count(*)::text as v from payment_audit where payment_id = %L and action = 'voided'$$, pay));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('voided payment cannot be edited', 'error', format($$update payments set amount = 10 where id = %L$$, pay));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('payments cannot be deleted', 'error', format($$delete from payments where id = %L$$, pay));
  perform pg_temp.check('voided payment excluded from received', 'val:12100.00', format($$select received_amount::text as v from quotation_payment_summary where quotation_id = %L$$, q2));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('edit reference on a valid payment', 'ok:1', format($$update payments set reference = 'REUSE-OK' where quotation_id = %L and reference = 'SPOOF-1'$$, q2));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('edit cannot raise amount above balance', 'error', format($$update payments set amount = 99999 where quotation_id = %L and reference = 'REUSE-OK'$$, q2));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec sees audit of own payments', 'val:t', format($$select (count(*) > 0)::text::char as v from payment_audit where payment_id = %L$$, pay));
  perform pg_temp.as_user(viewer);
  perform pg_temp.check('viewer cannot see audit', 'val:0', format($$select count(*)::text as v from payment_audit where payment_id = %L$$, pay));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('tenant isolation: cannot write into another org', 'error', format(ins, other_org, q2, 100, 'cash', 'partial', null, null, null));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('cannot read org counters', 'error', $$select count(*)::text as v from org_counters$$);
end $t$;

select test, expected, got, case when expected = got then 'PASS' else 'FAIL' end as result from t_result;
