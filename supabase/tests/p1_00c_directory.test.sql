-- P1-00c search_directory: privacy flags, minor masking and the active-only rule.
-- People (seeds/p0-02.sql): member_b and bp_b are adults in B; minor_16 is 16 in A; pending,
-- suspended are not active; turns_35 is set to deleted below.
begin;
select plan(18);

-- Fixture state, as owner
update public.members set privacy = '{"show_phone": true, "show_email": true}'::jsonb
  where id in (tests.member_id('member_b'), tests.member_id('minor_16'));
update public.member_private set email = 'zoya.sampleton@example.test', email_verified_at = now()
  where member_id = tests.member_id('member_b');
update public.member_private set email = 'diya.mockford@example.test', email_verified_at = now()
  where member_id = tests.member_id('minor_16');
update public.member_private set email = 'isha.placeholder@example.test', email_verified_at = now()
  where member_id = tests.member_id('bp_b');
update public.members set privacy = '{"show_phone": true, "show_city": false}'::jsonb, city = 'Testpur'
  where id = tests.member_id('turns_35');
update public.members set status = 'deleted' where id = tests.member_id('turns_35');
update public.members set privacy = '{"show_city": false}'::jsonb, city = 'Hiddenpur', occupation = 'Tester'
  where id = tests.member_id('bp_b');

-- anon and the waiting room
select tests.as_anon();
select throws_ok($$ select * from public.search_directory('Zoya') $$, '42501', null, 'anon cannot search the directory');
select tests.authenticate_as('pending');
select throws_ok($$ select * from public.search_directory('Zoya') $$, '42501', null, 'pending user cannot search the directory');
select tests.authenticate_as('suspended');
select throws_ok($$ select * from public.search_directory('Zoya') $$, '42501', null, 'suspended user cannot search the directory');

select tests.authenticate_as('member_a');

-- Minor: never phone or email, even with both flags on
select is((select count(*)::int from public.search_directory('Diya') d where d.id = tests.member_id('minor_16')), 1,
  'the minor is listed');
select is((select d.phone from public.search_directory('Diya') d where d.id = tests.member_id('minor_16')), null,
  'a minor''s phone is never returned, even when show_phone is true');
select is((select d.email from public.search_directory('Diya') d where d.id = tests.member_id('minor_16')), null,
  'a minor''s email is never returned, even when show_email is true');

-- Adults: contact only when allowed
select is((select d.phone from public.search_directory('Zoya') d where d.id = tests.member_id('member_b')), '+919000000010',
  'an adult''s phone is returned when show_phone is true');
select is((select d.email from public.search_directory('Zoya') d where d.id = tests.member_id('member_b')), 'zoya.sampleton@example.test',
  'an adult''s email is returned when show_email is true');
select is((select d.phone from public.search_directory('Isha') d where d.id = tests.member_id('bp_b')), null,
  'an adult''s phone is hidden by default');
select is((select d.email from public.search_directory('Isha') d where d.id = tests.member_id('bp_b')), null,
  'an adult''s email is hidden by default');

-- Profile flags
select is((select d.city from public.search_directory('Isha') d where d.id = tests.member_id('bp_b')), null,
  'city is hidden when show_city is false');
select is((select d.occupation from public.search_directory('Isha') d where d.id = tests.member_id('bp_b')), 'Tester',
  'occupation is shown by default');

-- Only active members
select is_empty($$ select id from public.search_directory('Neil') where id = tests.member_id('pending') $$,
  'pending members are never returned');
select is_empty($$ select id from public.search_directory('Leela') where id = tests.member_id('suspended') $$,
  'suspended members are never returned');
select is_empty($$ select id from public.search_directory('Nina') where id = tests.member_id('turns_35') $$,
  'deleted members are never returned');
select is_empty($$ select id from public.search_directory(null, null, 1) d join public.members m using (id) where m.status <> 'active' $$,
  'an unfiltered listing holds only active members');

-- Branch filter and paging
select is_empty($$ select id from public.search_directory(null, tests.branch_id('B')) d
  where d.branch_name <> 'Placeholder Branch B' $$, 'the branch filter returns only that branch');
select ok((select count(*) from public.search_directory(null, null, 1)) <= 25, 'a page holds at most 25 rows');

select * from finish();
rollback;
