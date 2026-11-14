-- P1-09: the public legal pages show a "DRAFT – pending approval" banner until AIAIA approves them.
-- The setting must be public: signed-out visitors read it to decide whether to show the banner.
insert into public.app_settings (key, value, is_public, description)
values ('legal_approved', 'false'::jsonb, true, 'Legal pages approved by AIAIA (hides the DRAFT banner when true)')
on conflict (key) do nothing;
