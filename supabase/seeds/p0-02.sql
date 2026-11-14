-- P0-02 fake dev members. Names come from scripts/fake-names.json; phones are +91 90000 000xx.
-- Member ids are a0000000-0000-4000-8000-0000000000NN and auth user ids b0000000-...-0000000000NN,
-- where NN is the last two digits of the test phone (see supabase/tests/00_helpers.sql).
-- Ages are relative to today in Asia/Kolkata, so the boundary fixtures stay exact.
-- Boundary fixtures are seeded in their state before tonight's daily job runs.

create temp table p0_02_fx (
  nn int primary key,
  full_name text not null,
  branch text not null,
  status public.member_status not null,
  dob date not null,
  wing text not null,
  phone text
);

insert into p0_02_fx (nn, full_name, branch, status, dob, wing, phone) values
  -- one per role
  (1, 'Aarav Testwala', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '30 years')::date, 'youth', '+919000000001'),
  (2, 'Meera Sampleton', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '45 years')::date, 'aiaia', '+919000000002'),
  (3, 'Rohan Demokar', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '30 years')::date, 'youth', '+919000000003'),
  (4, 'Ananya Mockford', 'b', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '28 years')::date, 'youth', '+919000000004'),
  (5, 'Kabir Fixture', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '27 years')::date, 'youth', '+919000000005'),
  (6, 'Isha Placeholder', 'b', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '26 years')::date, 'youth', '+919000000006'),
  (7, 'Dev Dummyson', 'b', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '33 years')::date, 'youth', '+919000000007'),
  (8, 'Tara Examplar', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '25 years')::date, 'youth', '+919000000008'),
  -- members
  (9, 'Arjun Testwala', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '22 years')::date, 'youth', '+919000000009'),
  (10, 'Zoya Sampleton', 'b', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '21 years')::date, 'youth', '+919000000010'),
  (11, 'Neil Demokar', 'a', 'pending', ((now() at time zone 'Asia/Kolkata')::date - interval '20 years')::date, 'youth', '+919000000011'),
  (12, 'Diya Mockford', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '16 years 30 days')::date, 'youth', '+919000000012'),
  (13, 'Vikram Fixture', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '42 years')::date, 'aiaia', '+919000000013'),
  (14, 'Leela Placeholder', 'a', 'suspended', ((now() at time zone 'Asia/Kolkata')::date - interval '24 years')::date, 'youth', '+919000000014'),
  (15, 'Samir Dummyson', 'b', 'pending', ((now() at time zone 'Asia/Kolkata')::date - interval '36 years')::date, 'aiaia', '+919000000015'),
  (16, 'Nina Examplar', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '35 years')::date, 'youth', '+919000000016'),
  (17, 'Ravi Fixture', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '18 years')::date, 'youth', '+919000000017'),
  -- dependents without a login
  (21, 'Asha Fixture', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '9 years')::date, 'youth', null),
  (22, 'Karan Fixture', 'a', 'active', ((now() at time zone 'Asia/Kolkata')::date - interval '18 years 120 days')::date, 'youth', null);

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000',
  ('b0000000-0000-4000-8000-' || lpad(f.nn::text, 12, '0'))::uuid,
  'authenticated', 'authenticated',
  ltrim(f.phone, '+'),
  now(), '{"provider": "phone", "providers": ["phone"]}'::jsonb, '{}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
from p0_02_fx f where f.phone is not null;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'phone', u.phone), 'phone', now(), now(), now()
from auth.users u
join p0_02_fx f on u.id = ('b0000000-0000-4000-8000-' || lpad(f.nn::text, 12, '0'))::uuid;

insert into public.members (
  id, user_id, full_name, branch_id, wing, status, status_changed_at, approved_by, approved_at, member_no
)
select
  ('a0000000-0000-4000-8000-' || lpad(f.nn::text, 12, '0'))::uuid,
  case when f.phone is not null then ('b0000000-0000-4000-8000-' || lpad(f.nn::text, 12, '0'))::uuid end,
  f.full_name,
  ('c0000000-0000-4000-8000-00000000000' || f.branch)::uuid,
  f.wing,
  f.status,
  now() - interval '30 days',
  case when f.status in ('active', 'suspended') then 'a0000000-0000-4000-8000-000000000003'::uuid end,
  case when f.status in ('active', 'suspended') then now() - interval '300 days' end,
  case when f.status in ('active', 'suspended')
    then 'AIAIA-' || case f.wing when 'youth' then 'Y' else 'A' end || '-' || lpad(f.nn::text, 6, '0') end
from p0_02_fx f;

insert into public.member_private (member_id, phone, dob)
select
  ('a0000000-0000-4000-8000-' || lpad(f.nn::text, 12, '0'))::uuid,
  f.phone,
  f.dob
from p0_02_fx f;

drop table p0_02_fx;

update public.member_private
set emergency_contact_name = 'Priya Testwala', emergency_contact_phone = '+919000000050'
where member_id = 'a0000000-0000-4000-8000-000000000009';

-- Guardian (13) of the 9-year-old dependent (21), of the member who turns 18 today (17, own login)
-- and of the dependent who turned 18 more than 90 days ago (22). All links still active.
insert into public.member_guardians (member_id, guardian_member_id, relationship, created_at) values
  ('a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000013', 'parent', now() - interval '2 years'),
  ('a0000000-0000-4000-8000-000000000017', 'a0000000-0000-4000-8000-000000000013', 'parent', now() - interval '2 years'),
  ('a0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000013', 'parent', now() - interval '2 years');

insert into public.role_assignments (member_id, role_key, branch_id, starts_on) values
  ('a0000000-0000-4000-8000-000000000001', 'super_admin', null, (now() at time zone 'Asia/Kolkata')::date - 365),
  ('a0000000-0000-4000-8000-000000000002', 'mentor', null, (now() at time zone 'Asia/Kolkata')::date - 365),
  ('a0000000-0000-4000-8000-000000000003', 'national_president', null, (now() at time zone 'Asia/Kolkata')::date - 365),
  ('a0000000-0000-4000-8000-000000000004', 'national_treasurer', null, (now() at time zone 'Asia/Kolkata')::date - 365),
  ('a0000000-0000-4000-8000-000000000005', 'branch_president', 'c0000000-0000-4000-8000-00000000000a', (now() at time zone 'Asia/Kolkata')::date - 365),
  ('a0000000-0000-4000-8000-000000000006', 'branch_president', 'c0000000-0000-4000-8000-00000000000b', (now() at time zone 'Asia/Kolkata')::date - 365),
  ('a0000000-0000-4000-8000-000000000007', 'enforcement_committee', null, (now() at time zone 'Asia/Kolkata')::date - 365),
  ('a0000000-0000-4000-8000-000000000008', 'support_staff', null, (now() at time zone 'Asia/Kolkata')::date - 365);

insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by, created_at) values
  ('a0000000-0000-4000-8000-000000000009', 'pending', 'active', null, 'a0000000-0000-4000-8000-000000000003', now() - interval '300 days'),
  ('a0000000-0000-4000-8000-000000000014', 'active', 'suspended', 'Dev fixture: suspended member', 'a0000000-0000-4000-8000-000000000007', now() - interval '30 days');
