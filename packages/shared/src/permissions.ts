// Permission keys from docs/build/01-architecture.md §6 (roles table).
// Shared touch point: later phases add keys here, additively.
// Server checks go through public.has_permission(); never check role names.
export const PERMISSIONS = [
  'system.config',
  'members.approve',
  'members.manage',
  'members.block',
  'members.request_block',
  'members.change_phone',
  'members.support_view',
  'members.verify_id',
  'roles.assign',
  'reports.review',
  'content.remove',
  'announcements.national',
  'announcements.branch',
  'events.national',
  'events.branch',
  'payments.view_all',
  'payments.view_branch',
  'payments.manage_plans',
  'payments.record_offline',
  'payments.reconcile',
  'certificates.issue',
  'gallery.manage',
  'documents.manage',
  'whatsapp.send',
  'audit.view',
  'data.export',
  'roster.import',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
