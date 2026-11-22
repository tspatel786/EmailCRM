create temp table t_result(test text, expected text, got text);

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;

create or replace function pg_temp.check(p_name text, p_expect text, p_sql text) returns void language plpgsql as $f$
declare n int; outcome text;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    outcome := 'ok:' || n;
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
  draft uuid := gen_random_uuid();
  base text;
begin
  base := format($$insert into messages (id, organization_id, owner_user_id, direction, folder, status, from_email, to_email, subject, cc, attachments)
                   values (%L, %L, %L, 'outbound', 'draft', 'draft', 'sales@updates.smpatelithub.in', 'client@example.com', 'T', array['a@example.com'],
                   jsonb_build_array(jsonb_build_object('path', %L, 'name', 'q.pdf', 'size', 1000)))$$,
                 draft, org, exec, org || '/' || exec || '/x/q.pdf');

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: create draft with cc + attachment', 'ok:1', base);

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: edit own draft', 'ok:1', format($$update messages set subject = 'T2' where id = %L$$, draft));

  perform pg_temp.as_user(mgr);
  perform pg_temp.check('manager: sees exec draft (view-all role)', 'ok:1', format($$select 1 from messages where id = %L$$, draft));

  perform pg_temp.as_user(mgr);
  perform pg_temp.check('manager: cannot edit exec draft', 'ok:0', format($$update messages set subject = 'hack' where id = %L$$, draft));

  perform pg_temp.as_user(viewer);
  perform pg_temp.check('viewer: cannot see exec draft', 'ok:0', format($$select 1 from messages where id = %L$$, draft));

  perform pg_temp.as_user(viewer);
  perform pg_temp.check('viewer: cannot compose', 'error', format($$insert into messages (organization_id, owner_user_id, direction, folder, status, from_email, to_email)
     values (%L, %L, 'outbound', 'queued', 'queued', 'x@y.com', 'c@example.com')$$, org, viewer));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: cannot compose as someone else', 'error', format($$insert into messages (organization_id, owner_user_id, direction, folder, status, from_email, to_email)
     values (%L, %L, 'outbound', 'queued', 'queued', 'x@y.com', 'c@example.com')$$, org, mgr));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: cannot insert already-sent mail', 'error', format($$insert into messages (organization_id, owner_user_id, direction, folder, status, from_email, to_email)
     values (%L, %L, 'outbound', 'sent', 'sent', 'x@y.com', 'c@example.com')$$, org, exec));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: cannot fake inbound mail', 'error', format($$insert into messages (organization_id, owner_user_id, direction, folder, status, from_email, to_email)
     values (%L, %L, 'inbound', 'draft', 'draft', 'x@y.com', 'c@example.com')$$, org, exec));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: cannot attach a file from another user folder', 'error', format($$insert into messages (organization_id, owner_user_id, direction, folder, status, from_email, to_email, attachments)
     values (%L, %L, 'outbound', 'draft', 'draft', 'x@y.com', 'c@example.com', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'a', 'size', 5))))$$,
     org, exec, org || '/' || mgr || '/x/a.pdf'));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: cannot attach > 10 MB file', 'error', format($$insert into messages (organization_id, owner_user_id, direction, folder, status, from_email, to_email, attachments)
     values (%L, %L, 'outbound', 'draft', 'draft', 'x@y.com', 'c@example.com', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'a', 'size', 20000000))))$$,
     org, exec, org || '/' || exec || '/x/a.pdf'));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: cannot write into another org', 'error', format($$insert into messages (organization_id, owner_user_id, direction, folder, status, from_email, to_email)
     values (%L, %L, 'outbound', 'draft', 'draft', 'x@y.com', 'c@example.com')$$, other_org, exec));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: send draft (draft -> queued)', 'ok:1', format($$update messages set folder = 'queued', status = 'queued' where id = %L$$, draft));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: cannot edit mail once queued', 'error', format($$update messages set body_html = '<b>changed</b>' where id = %L$$, draft));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: can still star queued mail', 'ok:1', format($$update messages set is_starred = true where id = %L$$, draft));

  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: cannot delete queued mail', 'ok:0', format($$delete from messages where id = %L$$, draft));

  -- Delete own draft
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: create second draft', 'ok:1', format($$insert into messages (id, organization_id, owner_user_id, direction, folder, status, from_email, to_email)
     values (%L, %L, %L, 'outbound', 'draft', 'draft', 'x@y.com', '')$$, gen_random_uuid(), org, exec));
  perform pg_temp.as_user(mgr);
  perform pg_temp.check('manager: cannot delete exec draft', 'ok:0', format($$delete from messages where owner_user_id = %L and folder = 'draft'$$, exec));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: discard own draft', 'ok:1', format($$delete from messages where owner_user_id = %L and folder = 'draft'$$, exec));

  -- Worker (service role) is unaffected by the guard
  perform pg_temp.check('service: worker marks queued mail sent', 'ok:1', format($$update messages set folder = 'sent', status = 'sent', provider_message_id = 'x' where id = %L$$, draft));

  -- Signature
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: save own signature', 'ok:1', format($$update profiles set email_signature_html = '<b>Exec</b>' where id = %L$$, exec));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec: cannot change manager signature', 'ok:0', format($$update profiles set email_signature_html = 'x' where id = %L$$, mgr));
end $t$;

select test, expected, got, case when expected = got then 'PASS' else 'FAIL' end as result from t_result;
