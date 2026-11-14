-- P1-09: signed-out visitors must be able to read legal_approved, or the DRAFT banner can never clear.
begin;
select plan(3);

select tests.as_anon();
select is((select value from public.app_settings where key = 'legal_approved'), 'false'::jsonb,
  'a signed-out visitor reads legal_approved (seeded false)');

select tests.authenticate_as('member_a');
select is((select value from public.app_settings where key = 'legal_approved'), 'false'::jsonb,
  'a signed-in member reads legal_approved');

select tests.clear_auth();
select ok((select is_public from public.app_settings where key = 'legal_approved'),
  'legal_approved is a public setting');

select * from finish();
rollback;
