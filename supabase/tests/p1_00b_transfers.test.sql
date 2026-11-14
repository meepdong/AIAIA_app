-- P1-00b chunk 3: request_branch_transfer, decide_branch_transfer, cancel_branch_transfer.
-- Fixtures: supabase/seeds/p0-02.sql (member_b in B; bp_a presides A, bp_b presides B; member_a in
-- A; guardian 13 with minor ward dependent_9 in A). member_b moves B -> A, so bp_a is the to-branch
-- officer and bp_b the from-branch officer. No extra members are created.
begin;
select plan(33);

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated;

-- member_b holds two branch roles in B: one running since 30 days ago, one starting today.
insert into public.role_assignments (member_id, role_key, branch_id, starts_on) values
  (tests.member_id('member_b'), 'branch_secretary', tests.branch_id('B'), (now() at time zone 'Asia/Kolkata')::date - 30),
  (tests.member_id('member_b'), 'branch_treasurer', tests.branch_id('B'), (now() at time zone 'Asia/Kolkata')::date);

-- ===== request_branch_transfer =============================================
select tests.authenticate_as('member_a');
select throws_ok($$ select public.request_branch_transfer(tests.member_id('member_b'), tests.branch_id('A')) $$, '42501', null,
  'request_branch_transfer: another member cannot ask');
select tests.as_anon();
select throws_ok($$ select public.request_branch_transfer('a0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'request_branch_transfer: anon cannot ask');
select tests.authenticate_as('member_b');
select throws_ok($$ select public.request_branch_transfer(tests.member_id('member_b'), tests.branch_id('B')) $$, '23514', null,
  'request_branch_transfer: the current branch is refused');
select throws_ok($$ select public.request_branch_transfer(tests.member_id('member_b'), 'c0000000-0000-4000-8000-0000000000ff') $$, '22023', null,
  'request_branch_transfer: an unknown branch is refused');
select lives_ok($$ insert into t_ids select 'tr', (public.request_branch_transfer(tests.member_id('member_b'), tests.branch_id('A'),
                   'Moved for college', 'Can start next month') ->> 'transfer_id')::uuid $$,
  'request_branch_transfer: the member asks');
select throws_ok($$ select public.request_branch_transfer(tests.member_id('member_b'), tests.branch_id('A')) $$, '23514', null,
  'request_branch_transfer: one pending request at a time');
select tests.clear_auth();
select ok((select status = 'pending' and from_branch_id = tests.branch_id('B') and to_branch_id = tests.branch_id('A')
                  and reason = 'Moved for college' and request_note = 'Can start next month' and requested_by = tests.member_id('member_b')
           from public.branch_transfers where id = (select v from t_ids where k = 'tr')),
  'the pending request stores the reason and the note');
select results_eq($$ select member_id from public.notifications where kind = 'membership.transfer_requested' and priority = 'high' $$,
  $$ values (tests.member_id('bp_a')) $$, 'the to-branch officer gets a high-priority notification');
select throws_ok($$ insert into public.branch_transfers (member_id, from_branch_id, to_branch_id, request_note)
                    values (tests.member_id('member_a'), tests.branch_id('A'), tests.branch_id('B'), repeat('x', 1001)) $$,
  '23514', null, 'branch_transfers.request_note is limited to 1000 characters');

-- ===== decide_branch_transfer: refused =====================================
select tests.authenticate_as('bp_b');
select isnt_empty($$ select 1 from public.branch_transfers where id = (select v from t_ids where k = 'tr') $$,
  'precondition: the from-branch officer can see the request');
select throws_ok($$ select public.decide_branch_transfer((select v from t_ids where k = 'tr'), true) $$, '42501', null,
  'decide_branch_transfer: a from-branch officer is refused');
select tests.authenticate_as('member_b');
select throws_ok($$ select public.decide_branch_transfer((select v from t_ids where k = 'tr'), true) $$, '42501', null,
  'decide_branch_transfer: the member is refused');
select tests.authenticate_as('member_a');
select throws_ok($$ select public.decide_branch_transfer((select v from t_ids where k = 'tr'), true) $$, '42501', null,
  'decide_branch_transfer: an ordinary member is refused');
select tests.clear_auth();
select ok((select status = 'pending' from public.branch_transfers where id = (select v from t_ids where k = 'tr'))
          and (select branch_id = tests.branch_id('B') from public.members where id = tests.member_id('member_b')),
  'the refused decisions changed nothing');

-- ===== decide_branch_transfer: to-branch officer approves =================
select tests.authenticate_as('bp_a');
select lives_ok($$ select public.decide_branch_transfer((select v from t_ids where k = 'tr'), true, 'Welcome') $$,
  'decide_branch_transfer: the to-branch officer approves');
select throws_ok($$ select public.decide_branch_transfer((select v from t_ids where k = 'tr'), false) $$, '23514', null,
  'decide_branch_transfer: a decided transfer cannot be decided again');
select tests.clear_auth();
select is((select branch_id from public.members where id = tests.member_id('member_b')), tests.branch_id('A'),
  'approval changes the branch');
select ok((select status = 'approved' and decided_by = tests.member_id('bp_a') and decided_at is not null and decision_note = 'Welcome'
           from public.branch_transfers where id = (select v from t_ids where k = 'tr')),
  'the transfer is approved with the decider recorded');
select isnt_empty($$ select 1 from public.member_status_events where member_id = tests.member_id('member_b') and reason = 'branch_transfer' $$,
  'approval writes a branch_transfer status event');
select isnt_empty($$ select 1 from public.notifications where member_id = tests.member_id('member_b') and kind = 'membership.transfer_approved' $$,
  'the member is notified');
select results_eq($$ select member_id from public.notifications where kind = 'membership.transfer_out' $$,
  $$ values (tests.member_id('bp_b')) $$, 'the from-branch officer is notified');
select is((select ends_on from public.role_assignments where member_id = tests.member_id('member_b') and role_key = 'branch_secretary'),
  (now() at time zone 'Asia/Kolkata')::date - 1, 'the old branch role ends yesterday');
select is_empty($$ select 1 from public.role_assignments where member_id = tests.member_id('member_b') and role_key = 'branch_treasurer' $$,
  'an old branch role that started today is withdrawn');
select is((select count(*)::int from public.audit_log where action = 'role.ended' and details ->> 'reason' = 'branch_transfer'), 2,
  'each ended role is audited');
select isnt_empty($$ select 1 from public.audit_log where action = 'member.transfer_approved'
                     and entity_id = (select v::text from t_ids where k = 'tr') and actor_member_id = tests.member_id('bp_a') $$,
  'the approval is audited');

-- ===== decide_branch_transfer: nobody decides their own transfer ===========
select tests.authenticate_as('national_president');
select lives_ok($$ insert into t_ids select 'trs', (public.request_branch_transfer(tests.member_id('national_president'),
                   (select case when branch_id = tests.branch_id('A') then tests.branch_id('B') else tests.branch_id('A') end
                    from public.members where id = tests.member_id('national_president'))) ->> 'transfer_id')::uuid $$,
  'request_branch_transfer: the national president asks for their own move');
select throws_ok($$ select public.decide_branch_transfer((select v from t_ids where k = 'trs'), true) $$, '42501', null,
  'decide_branch_transfer: nobody decides their own transfer, whatever they hold');
select tests.clear_auth();
select ok((select status = 'pending' and decided_by is null from public.branch_transfers where id = (select v from t_ids where k = 'trs'))
          and (select m.branch_id = bt.from_branch_id from public.branch_transfers bt
               join public.members m on m.id = bt.member_id where bt.id = (select v from t_ids where k = 'trs')),
  'the self-decision left the transfer pending and the member in place');

-- ===== guardian request and cancel_branch_transfer =========================
select tests.authenticate_as('guardian');
select lives_ok($$ insert into t_ids select 'tr2', (public.request_branch_transfer(tests.member_id('dependent_9'), tests.branch_id('B'))
                   ->> 'transfer_id')::uuid $$,
  'request_branch_transfer: an active guardian asks for a minor ward');
select tests.authenticate_as('bp_b');
select throws_ok($$ select public.cancel_branch_transfer((select v from t_ids where k = 'tr2')) $$, '42501', null,
  'cancel_branch_transfer: an officer who did not ask cannot cancel');
select tests.authenticate_as('guardian');
select lives_ok($$ select public.cancel_branch_transfer((select v from t_ids where k = 'tr2')) $$,
  'cancel_branch_transfer: the requester cancels');
select throws_ok($$ select public.cancel_branch_transfer((select v from t_ids where k = 'tr2')) $$, '23514', null,
  'cancel_branch_transfer: a cancelled transfer cannot be cancelled again');
select tests.clear_auth();
select ok((select status = 'cancelled' and requested_by = tests.member_id('guardian') from public.branch_transfers
           where id = (select v from t_ids where k = 'tr2')),
  'the guardian''s request is cancelled');

select * from finish();
rollback;
