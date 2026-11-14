-- P1-00c import_roster: roster.import for every row's branch, phone dedupe, validation, audit.
-- People: seeds/p0-02.sql. bp_a / bp_b hold roster.import for branch A / B only; national_president
-- and mentor hold it nationally; super_admin only with a step-up; enforcement, member_a and the
-- guardian hold none. Branch A = ...0a, branch B = ...0b.
begin;
select plan(39);

-- ---------------------------------------------------------------------------
-- Who may import
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Testwala"}]') $$,
  '42501', null, 'anon cannot call import_roster');

select tests.authenticate_as('pending');
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Testwala"}]') $$,
  '42501', null, 'a pending applicant cannot import');

select tests.authenticate_as('suspended');
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Testwala"}]') $$,
  '42501', null, 'a suspended member cannot import');

select tests.authenticate_as('member_a');
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Testwala","phone":"+91 90000 00071"}]') $$,
  '42501', null, 'a plain member cannot import into their own branch');

select tests.authenticate_as('enforcement');
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000b","full_name":"Asha Testwala"}]') $$,
  '42501', null, 'the enforcement committee cannot import');

select tests.authenticate_as('guardian');
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Testwala"}]') $$,
  '42501', null, 'a guardian with active links cannot import');
select tests.clear_auth();
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
where guardian_member_id = tests.member_id('guardian');
select tests.authenticate_as('guardian');
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Testwala"}]') $$,
  '42501', null, 'a guardian with ended links cannot import');

select tests.authenticate_as('super_admin');
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Testwala"}]') $$,
  '42501', null, 'a super admin without a step-up cannot import');

select tests.authenticate_as('bp_a');
select throws_ok($$ select public.import_roster('[
    {"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Testwala","phone":"+91 90000 00072"},
    {"branch_id":"c0000000-0000-4000-8000-00000000000b","full_name":"Kabir Mockford","phone":"+91 90000 00073"}]') $$,
  '42501', null, 'branch president A cannot import a batch holding a branch B row');

select tests.clear_auth();
select is((select count(*)::int from public.roster_entries), 0, 'the refused calls wrote no roster rows');
select is((select count(*)::int from public.audit_log where action = 'roster.import'), 0, 'the refused calls wrote no audit rows');

-- Allowed: branch officers for their own branch, national officers, mentor, stepped-up super admin
select tests.authenticate_as('bp_a');
select is(public.import_roster('[
    {"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Testwala","phone":"+91 90000 00071","dob":"2001-04-05","member_no":"P-71"},
    {"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Dev Sampleton","notes":"no phone on the sheet"}]'),
  '{"inserted": 2, "updated": 0, "skipped": 0}'::jsonb, 'branch president A imports two branch A rows');

select tests.authenticate_as('bp_b');
select is(public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000b","full_name":"Kabir Mockford","phone":"+91 90000 00073"}]'),
  '{"inserted": 1, "updated": 0, "skipped": 0}'::jsonb, 'branch president B imports a branch B row');

select tests.authenticate_as('national_president');
select is(public.import_roster('[
    {"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Leela Examplar","phone":"+91 90000 00074"},
    {"branch_id":"c0000000-0000-4000-8000-00000000000b","full_name":"Rohan Demokar","phone":"+91 90000 00075"}]'),
  '{"inserted": 2, "updated": 0, "skipped": 0}'::jsonb, 'the national president imports into both branches');

select tests.authenticate_as('mentor');
select is(public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000b","full_name":"Tara Placeholder","phone":"+91 90000 00076"}]'),
  '{"inserted": 1, "updated": 0, "skipped": 0}'::jsonb, 'a mentor imports');

select tests.clear_auth();
select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
select is(public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Zoya Dummyson","phone":"+91 90000 00077"}]'),
  '{"inserted": 1, "updated": 0, "skipped": 0}'::jsonb, 'a stepped-up super admin imports');

select tests.clear_auth();
select is((select row(branch_id, full_name, dob, member_no, imported_by)::text from public.roster_entries where phone = '+919000000071'),
  row(tests.branch_id('A'), 'Asha Testwala', date '2001-04-05', 'P-71', tests.member_id('bp_a'))::text,
  'the imported row is stored with its fields and importer');
select is((select count(*)::int from public.roster_entries where phone like '+91 %'), 0, 'phones are stored without spaces');
select is((select count(*)::int from public.roster_entries where phone is null and full_name = 'Dev Sampleton'), 1,
  'a row without a phone is inserted');

-- ---------------------------------------------------------------------------
-- Dedupe by phone
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bp_a');
select is(public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Asha Fixture","phone":"+919000000071"}]'),
  '{"inserted": 0, "updated": 1, "skipped": 0}'::jsonb, 're-importing a known unclaimed phone updates it');
select tests.clear_auth();
select is((select count(*)::int from public.roster_entries where phone = '+919000000071'), 1, 'the phone still has one roster row');
select is((select full_name from public.roster_entries where phone = '+919000000071'), 'Asha Fixture', 'the row took the new name');
select is((select row(dob, member_no)::text from public.roster_entries where phone = '+919000000071'),
  row(date '2001-04-05', 'P-71')::text, 're-importing without a DOB or member number keeps the stored ones');

-- A claimed row is never touched
update public.roster_entries set claimed_member_id = tests.member_id('member_a'), claimed_at = now()
where phone = '+919000000071';
select tests.authenticate_as('bp_a');
select is(public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Meera Testwala","phone":"+91 90000 00071"}]'),
  '{"inserted": 0, "updated": 0, "skipped": 1}'::jsonb, 'a claimed phone is skipped');
select tests.clear_auth();
select is((select full_name from public.roster_entries where phone = '+919000000071'), 'Asha Fixture', 'the claimed row is unchanged');

-- A branch A officer cannot overwrite (or move) a branch B row by importing its phone
select tests.authenticate_as('bp_a');
select is(public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Neil Testwala","phone":"+91 90000 00073"}]'),
  '{"inserted": 0, "updated": 0, "skipped": 1}'::jsonb, 'a phone already on branch B''s roster is skipped for branch president A');
select tests.clear_auth();
select is((select row(branch_id, full_name)::text from public.roster_entries where phone = '+919000000073'),
  row(tests.branch_id('B'), 'Kabir Mockford')::text, 'the branch B row is unchanged');

-- Duplicates inside one batch: the first inserts, the second updates that row
select tests.authenticate_as('bp_b');
select is(public.import_roster('[
    {"branch_id":"c0000000-0000-4000-8000-00000000000b","full_name":"Ravi Sampleton","phone":"+91 90000 00078"},
    {"branch_id":"c0000000-0000-4000-8000-00000000000b","full_name":"Ravi Mockford","phone":"+91-90000-00078"}]'),
  '{"inserted": 1, "updated": 1, "skipped": 0}'::jsonb, 'a phone repeated within one batch inserts once, then updates');
select tests.clear_auth();
select is((select count(*)::int from public.roster_entries where phone = '+919000000078'), 1, 'the repeated phone has one roster row');

-- ---------------------------------------------------------------------------
-- Validation: nothing is written when any row is bad
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.import_roster('{"branch_id":"c0000000-0000-4000-8000-00000000000a"}') $$,
  '22023', null, 'rows must be an array');
select throws_ok($$ select public.import_roster('[]') $$, '22023', null, 'an empty batch is refused');
select throws_ok($$ select public.import_roster('[
    {"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Samir Examplar","phone":"+91 90000 00079"},
    {"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"   "}]') $$,
  '22023', null, 'a blank full_name is refused');
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Samir Examplar","phone":"call the office"}]') $$,
  '22023', null, 'a phone that is not a number is refused');
select throws_ok($$ select public.import_roster('[{"branch_id":"c0000000-0000-4000-8000-00000000000a","full_name":"Samir Examplar","dob":"not a date"}]') $$,
  '22023', null, 'an invalid dob is refused');
select throws_ok($$ select public.import_roster('[{"branch_id":"nope","full_name":"Samir Examplar"}]') $$,
  '22023', null, 'an invalid branch_id is refused');
select tests.clear_auth();
select is((select count(*)::int from public.roster_entries where full_name like 'Samir%'), 0, 'refused batches wrote nothing');

-- ---------------------------------------------------------------------------
-- Audit and client access
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.audit_log where action = 'roster.import'), 9, 'every successful import is audited');
select is((select count(*)::int from public.audit_log where action = 'roster.import' and details::text ~ '90000|Testwala|2001'), 0,
  'audit details never carry phones, names or DOBs');
select tests.authenticate_as('bp_a');
select throws_ok($$ select * from public.roster_entries $$, '42501', null, 'importers still cannot read roster_entries directly');
select tests.clear_auth();

select * from finish();
rollback;
