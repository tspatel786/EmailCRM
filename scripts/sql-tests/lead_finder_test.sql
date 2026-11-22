-- Lead Finder permission and data-rule tests. Run inside BEGIN ... ROLLBACK.
-- Needs an org 'smpatel-it-hub' with an active owner. Temporary test users are created.
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
    if p_sql ilike 'select%as v%' then
      execute p_sql into v; outcome := 'val:' || coalesce(v, 'null');
    else
      execute p_sql; get diagnostics n = row_count; outcome := 'ok:' || n;
    end if;
  exception when others then outcome := 'error';
  end;
  execute 'reset role';
  insert into t_result values (p_name, p_expect, outcome);
end $f$;

do $t$
declare
  org uuid := (select id from organizations where slug = 'smpatel-it-hub');
  own uuid := (select user_id from memberships where organization_id = org and role = 'owner' and status = 'active' limit 1);
  exec uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  other_org uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  co uuid := gen_random_uuid();
  dm uuid := gen_random_uuid();
begin
  -- temporary users
  insert into auth.users (id, email, aud, role) values
    (exec, 'lf-exec@test.invalid', 'authenticated', 'authenticated'),
    (viewer, 'lf-viewer@test.invalid', 'authenticated', 'authenticated'),
    (outsider, 'lf-outsider@test.invalid', 'authenticated', 'authenticated');
  insert into profiles (id, full_name) values (exec, 'LF Exec'), (viewer, 'LF Viewer'), (outsider, 'LF Outsider') on conflict (id) do nothing;
  insert into organizations (id, name, slug) values (other_org, 'LF Other', 'lf-other-test');
  insert into memberships (organization_id, user_id, role, status) values
    (org, exec, 'sales_executive', 'active'), (org, viewer, 'viewer', 'active'), (other_org, outsider, 'owner', 'active');

  perform pg_temp.check('sources seeded for new org', 'val:6', format($$select count(*)::text as v from lead_sources where organization_id = %L$$, other_org));

  perform pg_temp.as_user(own);
  perform pg_temp.check('owner: insert company', 'ok:1', format($$insert into discovered_companies (id, organization_id, cin, company_name, normalized_name, source_key, registration_date, state)
     values (%L, %L, 'U62099MH2026PTC123456', 'Test Soft Private Limited', 'test soft', 'mca_excel', '2026-10-01', 'Maharashtra')$$, co, org));
  perform pg_temp.as_user(own);
  perform pg_temp.check('duplicate CIN rejected', 'error', format($$insert into discovered_companies (organization_id, cin, company_name, normalized_name, source_key)
     values (%L, 'U62099MH2026PTC123456', 'Dup', 'dup', 'mca_excel')$$, org));
  perform pg_temp.as_user(own);
  perform pg_temp.check('invalid CIN rejected', 'error', format($$insert into discovered_companies (organization_id, cin, company_name, normalized_name, source_key)
     values (%L, 'NOT-A-CIN', 'Bad', 'bad', 'mca_excel')$$, org));
  perform pg_temp.as_user(own);
  perform pg_temp.check('owner: add decision maker', 'ok:1', format($$insert into decision_makers (id, organization_id, company_id, full_name, original_designation, roles, source_type, source_url)
     values (%L, %L, %L, 'Asha Rao', 'Managing Director', '{managing_director}', 'manual', 'https://example.org/team')$$, dm, org, co));
  perform pg_temp.as_user(own);
  perform pg_temp.check('same person+designation is a duplicate', 'error', format($$insert into decision_makers (organization_id, company_id, full_name, original_designation, source_type)
     values (%L, %L, ' asha rao ', 'managing director', 'manual')$$, org, co));
  perform pg_temp.as_user(own);
  perform pg_temp.check('same name, other designation kept separate', 'ok:1', format($$insert into decision_makers (organization_id, company_id, full_name, original_designation, source_type)
     values (%L, %L, 'Asha Rao', 'Purchase Manager', 'manual')$$, org, co));
  perform pg_temp.as_user(own);
  perform pg_temp.check('owner: add contact', 'ok:1', format($$insert into lead_contacts (organization_id, company_id, decision_maker_id, contact_type, contact_value, contact_kind, source_url)
     values (%L, %L, %L, 'email', 'asha@testsoft.in', 'person_professional', 'https://testsoft.in/team')$$, org, co, dm));
  perform pg_temp.as_user(own);
  perform pg_temp.check('duplicate contact rejected (case)', 'error', format($$insert into lead_contacts (organization_id, company_id, contact_type, contact_value, contact_kind)
     values (%L, %L, 'email', 'ASHA@testsoft.in', 'company_general')$$, org, co));
  perform pg_temp.as_user(own);
  perform pg_temp.check('bad LinkedIn URL rejected', 'error', format($$update decision_makers set linkedin_url = 'https://evil.com/in/x' where id = %L$$, dm));
  perform pg_temp.as_user(own);
  perform pg_temp.check('owner: correction updates', 'ok:1', format($$update decision_makers set original_designation = 'MD & CEO' where id = %L$$, dm));
  perform pg_temp.check('correction logged in history', 'val:1', format($$select count(*)::text as v from lead_field_history where record_id = %L and action = 'update'$$, dm));

  -- executive without access
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec without access: sees no companies', 'val:0', format($$select count(*)::text as v from discovered_companies where organization_id = %L$$, org));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec without access: no decision makers', 'val:0', $$select count(*)::text as v from decision_makers$$);
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec without access: cannot insert', 'error', format($$insert into discovered_companies (organization_id, cin, company_name, normalized_name, source_key)
     values (%L, 'U12345MH2026PTC000001', 'X', 'x', 'manual')$$, org));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec cannot grant self access (0 rows)', 'ok:0', format($$update memberships set lead_finder_access = true where user_id = %L and organization_id = %L$$, exec, org));
  perform pg_temp.check('exec access flag still off', 'val:false', format($$select lead_finder_access::text as v from memberships where user_id = %L and organization_id = %L$$, exec, org));
  perform pg_temp.as_user(own);
  perform pg_temp.check('owner grants access', 'ok:1', format($$update memberships set lead_finder_access = true where user_id = %L and organization_id = %L$$, exec, org));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec with access: sees companies', 'val:1', format($$select count(*)::text as v from discovered_companies where organization_id = %L$$, org));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec with access: can add person', 'ok:1', format($$insert into decision_makers (organization_id, company_id, full_name, source_type) values (%L, %L, 'Ravi K', 'manual')$$, org, co));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec cannot delete a company', 'ok:0', format($$delete from discovered_companies where id = %L$$, co));
  perform pg_temp.as_user(exec);
  perform pg_temp.check('exec cannot change source settings', 'ok:0', format($$update lead_sources set enabled = false where organization_id = %L$$, org));

  -- viewer with access is read-only
  perform pg_temp.as_user(own);
  perform pg_temp.check('owner grants viewer access', 'ok:1', format($$update memberships set lead_finder_access = true where user_id = %L and organization_id = %L$$, viewer, org));
  perform pg_temp.as_user(viewer);
  perform pg_temp.check('viewer with access: can read', 'val:1', format($$select count(*)::text as v from discovered_companies where organization_id = %L$$, org));
  perform pg_temp.as_user(viewer);
  perform pg_temp.check('viewer with access: cannot write', 'error', format($$insert into decision_makers (organization_id, company_id, full_name, source_type) values (%L, %L, 'V', 'manual')$$, org, co));

  -- other organization
  perform pg_temp.as_user(outsider);
  perform pg_temp.check('other org owner: sees nothing of ours', 'val:0', format($$select count(*)::text as v from discovered_companies where organization_id = %L$$, org));
  perform pg_temp.as_user(outsider);
  perform pg_temp.check('other org owner: cannot write into ours', 'error', format($$insert into decision_makers (organization_id, company_id, full_name, source_type) values (%L, %L, 'Z', 'manual')$$, org, co));

  perform pg_temp.as_user(own);
  perform pg_temp.check('owner: stats view works', 'val:1', format($$select total_companies::text as v from lead_finder_stats where organization_id = %L$$, org));
  perform pg_temp.as_user(own);
  perform pg_temp.check('owner can delete company', 'ok:1', format($$delete from discovered_companies where id = %L$$, co));
end $t$;

select test, expected, got, case when expected = got then 'PASS' else 'FAIL' end as result from t_result;
