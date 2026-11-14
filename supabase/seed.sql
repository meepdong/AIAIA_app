-- Reference data for local dev (P0-02): permissions, roles, role_permissions and branches.
-- Fake people live in seeds/p0-02.sql. Later briefs add their own seeds/<brief-id>.sql.
-- Source: docs/build/01-architecture.md section 6, "Roles (seeded) -> permissions".

insert into public.permissions (key, description) values
  ('system.config', 'Change platform configuration'),
  ('members.block', 'Suspend a member platform-wide'),
  ('members.request_block', 'Ask the enforcement queue to block a member'),
  ('reports.review', 'Review reports'),
  ('content.remove', 'Remove reported content'),
  ('members.change_phone', 'Change a member''s phone number'),
  ('members.support_view', 'Support view of a member'),
  ('members.verify_id', 'Verify any member''s digital ID'),
  ('members.approve', 'Approve or reject applicants'),
  ('members.manage', 'Manage members'),
  ('roles.assign', 'Assign roles'),
  ('announcements.national', 'Post national announcements'),
  ('announcements.branch', 'Post branch announcements'),
  ('events.national', 'Manage national events'),
  ('events.branch', 'Manage branch events'),
  ('payments.view_all', 'View all payments'),
  ('payments.view_branch', 'View branch payments'),
  ('payments.manage_plans', 'Manage payment plans'),
  ('payments.record_offline', 'Record offline payments'),
  ('payments.reconcile', 'Reconcile payments'),
  ('certificates.issue', 'Issue certificates'),
  ('gallery.manage', 'Manage the gallery'),
  ('documents.manage', 'Manage the document library'),
  ('whatsapp.send', 'Send official WhatsApp messages'),
  ('audit.view', 'Read the audit log'),
  ('data.export', 'Export data'),
  ('roster.import', 'Import rosters');

insert into public.roles (key, name, scope) values
  ('super_admin', 'Super admin', 'global'),
  ('mentor', 'Mentor', 'global'),
  ('enforcement_committee', 'Enforcement committee', 'global'),
  ('support_staff', 'Support staff', 'national'),
  ('national_president', 'National president', 'national'),
  ('national_vp', 'National vice-president', 'national'),
  ('national_secretary', 'National secretary', 'national'),
  ('national_treasurer', 'National treasurer', 'national'),
  ('national_member', 'National member', 'national'),
  ('branch_president', 'Branch president', 'branch'),
  ('branch_secretary', 'Branch secretary', 'branch'),
  ('branch_treasurer', 'Branch treasurer', 'branch'),
  ('editor', 'Editor', 'national');

with national_set(p) as (
  select unnest(array[
    'members.approve', 'members.manage', 'roles.assign', 'announcements.national', 'events.national',
    'payments.view_all', 'certificates.issue', 'gallery.manage', 'whatsapp.send', 'audit.view',
    'data.export', 'roster.import', 'members.verify_id'])
),
grants(role_key, permission_key) as (
  select 'super_admin', key from public.permissions
  union all
  select 'mentor', key from public.permissions where key not in ('system.config', 'members.block')
  union all
  select 'enforcement_committee', unnest(array['reports.review', 'members.block', 'content.remove'])
  union all
  select 'support_staff', unnest(array['members.change_phone', 'members.support_view', 'members.verify_id'])
  union all
  select r, p from unnest(array['national_president', 'national_vp', 'national_secretary', 'national_treasurer']) r, national_set
  union all
  select 'national_treasurer', unnest(array['payments.manage_plans', 'payments.record_offline', 'payments.reconcile'])
  union all
  select 'national_member', unnest(array['members.approve', 'announcements.national', 'events.national', 'members.verify_id'])
  union all
  select r, unnest(array['members.approve', 'members.manage', 'announcements.branch', 'events.branch',
    'payments.view_branch', 'certificates.issue', 'roster.import', 'members.verify_id'])
  from unnest(array['branch_president', 'branch_secretary']) r
  union all
  select 'branch_treasurer', unnest(array['members.approve', 'payments.view_branch', 'payments.record_offline', 'members.verify_id'])
  union all
  select 'editor', unnest(array['gallery.manage', 'documents.manage', 'announcements.national'])
)
insert into public.role_permissions (role_key, permission_key)
select distinct role_key, permission_key from grants;

-- Placeholder branches until the official branch register arrives (owner item A6).
insert into public.branches (id, code, name) values
  ('c0000000-0000-4000-8000-00000000000a', 'BR-A', 'Placeholder Branch A'),
  ('c0000000-0000-4000-8000-00000000000b', 'BR-B', 'Placeholder Branch B');
