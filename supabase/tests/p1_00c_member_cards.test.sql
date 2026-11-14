-- P1-00c member column masking (orchestrator decision 8): members read each other only through
-- member_cards, which drops status, approval and privacy columns and applies the opt-out profile
-- flags. Also member_status_events_select, which no longer depends on seeing the members row.
-- People: seeds/p0-02.sql (member_a and bp_a in branch A; member_b, bp_b and pending_36 in B).
begin;
select plan(41);

update public.members
set city = 'Pune', occupation = 'Engineer', photo_path = 'members/' || id::text || '/face.jpg',
    status_reason = 'Dev fixture: approval note'
where id = tests.member_id('member_b');

-- ---------------------------------------------------------------------------
-- Shape and grants
-- ---------------------------------------------------------------------------
select columns_are('public', 'member_cards',
  array['id', 'full_name', 'branch_id', 'wing', 'member_no', 'city', 'occupation', 'photo_path'],
  'member_cards has only the card columns');
select hasnt_column('public', 'member_cards', 'status_reason', 'member_cards has no status_reason');
select hasnt_column('public', 'member_cards', 'approved_by', 'member_cards has no approved_by');
select hasnt_column('public', 'member_cards', 'privacy', 'member_cards has no privacy');
select ok((select 'security_barrier=true' = any (c.reloptions) from pg_class c where c.oid = 'public.member_cards'::regclass),
  'member_cards is a security_barrier view');

select tests.as_anon();
select throws_ok($$ select id from public.member_cards $$, '42501', null, 'anon cannot read member_cards');

-- ---------------------------------------------------------------------------
-- Waiting room: non-active callers see zero cards
-- ---------------------------------------------------------------------------
select tests.authenticate_as('pending');
select is_empty($$ select id from public.member_cards $$, 'a pending applicant sees zero cards');
select tests.authenticate_as('suspended');
select is_empty($$ select id from public.member_cards $$, 'a suspended member sees zero cards');

-- ---------------------------------------------------------------------------
-- Active members: cards of active members only; no other members row
-- ---------------------------------------------------------------------------
select tests.authenticate_as('member_a');
select isnt_empty($$ select id from public.member_cards where id = tests.member_id('member_b') $$,
  'member A sees active member B''s card');
select is((select row(branch_id, wing, city, occupation, photo_path)::text
           from public.member_cards where id = tests.member_id('member_b')),
  row(tests.branch_id('B'), 'youth', 'Pune', 'Engineer', 'members/' || tests.member_id('member_b')::text || '/face.jpg')::text,
  'with default privacy the card shows city, occupation and photo');
select is_empty($$ select id from public.member_cards
                   where id in (tests.member_id('pending'), tests.member_id('suspended'), tests.member_id('pending_36')) $$,
  'member A sees no cards of pending or suspended members');
select is_empty($$ select id from public.members where id = tests.member_id('member_b') $$,
  'member A can no longer read member B''s members row');
select results_eq($$ select id from public.members $$, $$ select tests.member_id('member_a') $$,
  'member A reads only their own members row');
select is((select status_reason from public.members where id = tests.member_id('member_b')), null,
  'member A cannot read member B''s status_reason');
select throws_ok($$ update public.member_cards set full_name = 'Rohan Mockford' where id = tests.member_id('member_b') $$,
  '42501', null, 'member A cannot update through member_cards');
select throws_ok($$ insert into public.member_cards (id, full_name, branch_id, wing) values
    (gen_random_uuid(), 'Rohan Mockford', tests.branch_id('A'), 'youth') $$,
  '42501', null, 'member A cannot insert through member_cards');
select throws_ok($$ delete from public.member_cards where id = tests.member_id('member_b') $$,
  '42501', null, 'member A cannot delete through member_cards');

-- A guardian (active links) is just an active member here
select tests.authenticate_as('guardian');
select isnt_empty($$ select id from public.member_cards where id = tests.member_id('member_b') $$,
  'the guardian sees member B''s card');
select is_empty($$ select id from public.members where id = tests.member_id('member_b') $$,
  'the guardian cannot read member B''s members row');

-- A guardian reads their ward's members row (through is_guardian_of: active links only)
select isnt_empty($$ select id from public.members where id = tests.member_id('dependent_9') $$,
  'the guardian reads their ward''s members row');
select is((select status::text from public.members where id = tests.member_id('dependent_9')), 'active',
  'the guardian sees the ward''s status');
select is_empty($$ select id from public.members where id = tests.member_id('member_a') $$,
  'the guardian still cannot read an unrelated member''s row');
select tests.clear_auth();
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
  where member_id = tests.member_id('dependent_9') and guardian_member_id = tests.member_id('guardian');
select tests.authenticate_as('guardian');
select is_empty($$ select id from public.members where id = tests.member_id('dependent_9') $$,
  'after the link ends the guardian reads zero rows of the ex-ward');
select isnt_empty($$ select id from public.members where id = tests.member_id('guardian') $$,
  'the guardian still reads their own row');

-- Self and approvers keep full rows
select tests.authenticate_as('bp_b');
select is((select status_reason from public.members where id = tests.member_id('member_b')), 'Dev fixture: approval note',
  'branch president B still reads member B''s full row');
select tests.authenticate_as('member_b');
select is((select status_reason from public.members where id = tests.member_id('member_b')), 'Dev fixture: approval note',
  'member B still reads their own full row');

-- ---------------------------------------------------------------------------
-- Opt-out flags, one key at a time
-- ---------------------------------------------------------------------------
select tests.clear_auth();
update public.members set privacy = '{"show_city": false}' where id = tests.member_id('member_b');
select tests.authenticate_as('member_a');
select is((select row(city, occupation, photo_path is not null)::text from public.member_cards where id = tests.member_id('member_b')),
  row(null::text, 'Engineer', true)::text, 'show_city = false hides only the city');

select tests.clear_auth();
update public.members set privacy = '{"show_occupation": false}' where id = tests.member_id('member_b');
select tests.authenticate_as('member_a');
select is((select row(city, occupation, photo_path is not null)::text from public.member_cards where id = tests.member_id('member_b')),
  row('Pune', null::text, true)::text, 'show_occupation = false hides only the occupation');

select tests.clear_auth();
update public.members set privacy = '{"show_photo": false}' where id = tests.member_id('member_b');
select tests.authenticate_as('member_a');
select is((select row(city, occupation, photo_path)::text from public.member_cards where id = tests.member_id('member_b')),
  row('Pune', 'Engineer', null::text)::text, 'show_photo = false hides only the photo');

select tests.clear_auth();
update public.members set privacy = '{"show_city": true, "show_occupation": "yes", "show_photo": null}'
where id = tests.member_id('member_b');
select tests.authenticate_as('member_a');
select is((select row(city, occupation, photo_path is not null)::text from public.member_cards where id = tests.member_id('member_b')),
  row('Pune', 'Engineer', true)::text, 'anything but false leaves profile fields shown');

-- The masking applies whatever the reader filters on
select tests.clear_auth();
update public.members set privacy = '{"show_city": false}' where id = tests.member_id('member_b');
select tests.authenticate_as('member_a');
select is_empty($$ select id from public.member_cards where city = 'Pune' $$, 'filtering on a hidden city finds nothing');

-- A card disappears when the member stops being active
select tests.clear_auth();
update public.members set status = 'suspended' where id = tests.member_id('member_b');
select tests.authenticate_as('member_a');
select is_empty($$ select id from public.member_cards where id = tests.member_id('member_b') $$,
  'a suspended member''s card is gone');
select tests.clear_auth();
update public.members set status = 'active' where id = tests.member_id('member_b');

-- A caller who stops being active loses every card
update public.members set status = 'suspended' where id = tests.member_id('member_a');
select tests.authenticate_as('member_a');
select is_empty($$ select id from public.member_cards $$, 'member A, once suspended, sees zero cards');
select tests.clear_auth();
update public.members set status = 'active' where id = tests.member_id('member_a');

-- ---------------------------------------------------------------------------
-- member_status_events: members.manage holders see their branch's history without needing the
-- members row. A role with members.manage only (no members.approve) for branch A, held by member_b.
-- ---------------------------------------------------------------------------
insert into public.roles (key, name, scope) values ('p1c_manager', 'Manage-only fixture role', 'branch');
insert into public.role_permissions (role_key, permission_key) values ('p1c_manager', 'members.manage');
insert into public.role_assignments (member_id, role_key, branch_id, starts_on)
values (tests.member_id('member_b'), 'p1c_manager', tests.branch_id('A'), (now() at time zone 'Asia/Kolkata')::date - 1);
insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
values (tests.member_id('pending_36'), null, 'pending', 'Dev fixture: applied', null);

select tests.authenticate_as('member_b');
select is_empty($$ select id from public.members where id = tests.member_id('member_a') $$,
  'the manage-only holder cannot read member A''s members row');
select is((select count(*)::int from public.member_status_events where member_id = tests.member_id('member_a')), 1,
  'the manage-only holder sees active member A''s status history');
select is((select count(*)::int from public.member_status_events where member_id = tests.member_id('suspended')), 1,
  'the manage-only holder sees the suspended branch A member''s status history');
select is((select count(*)::int from public.member_status_events where member_id = tests.member_id('pending_36')), 0,
  'the manage-only holder (branch A) does not see branch B status history');

select tests.authenticate_as('bp_b');
select is((select count(*)::int from public.member_status_events where member_id = tests.member_id('pending_36')), 1,
  'branch president B sees branch B status history');
select is((select count(*)::int from public.member_status_events where member_id = tests.member_id('member_a')), 0,
  'branch president B does not see branch A status history');

select tests.authenticate_as('member_a');
select is((select count(*)::int from public.member_status_events), 1, 'member A sees only their own status history');

select tests.as_anon();
select throws_ok($$ select public.can_manage_member('a0000000-0000-4000-8000-000000000009') $$, '42501', null,
  'anon cannot call can_manage_member');
select tests.clear_auth();

select * from finish();
rollback;
