import type { Permission } from '@aiaia/shared';
import type { PermissionGrant } from '@aiaia/api';

/**
 * The admin navigation registry (shared touch point). Other briefs append ONE entry to
 * `adminNav` below. An entry shows only when the caller holds at least one of `anyOf`
 * (in any branch, or nationally); RLS and the RPCs still decide what the pages may read.
 * An entry with no `anyOf` (the dashboard) shows to every admin.
 */
export type AdminNavEntry = {
  key: string;
  label: string;
  /** Route under the (admin) group. */
  href: string;
  anyOf?: readonly Permission[];
};

export const adminNav: AdminNavEntry[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin' },
  {
    key: 'members',
    label: 'Members',
    href: '/members',
    anyOf: ['members.manage', 'members.approve'],
  },
  { key: 'roles', label: 'Roles', href: '/roles', anyOf: ['roles.assign'] },
  { key: 'audit', label: 'Audit log', href: '/audit', anyOf: ['audit.view'] },
  { key: 'settings', label: 'Settings', href: '/settings', anyOf: ['system.config'] },
  {
    key: 'events',
    label: 'Events',
    href: '/events/manage',
    anyOf: ['events.national', 'events.branch'],
  },
  // Other briefs: add one entry each above this line.
];

export function holdsAny(
  grants: readonly PermissionGrant[],
  anyOf: readonly Permission[] | undefined,
): boolean {
  if (!anyOf) return true;
  return grants.some((g) => (anyOf as readonly string[]).includes(g.permission_key));
}

/** Entries the caller may see. */
export function visibleNav(
  grants: readonly PermissionGrant[],
  entries: readonly AdminNavEntry[] = adminNav,
): AdminNavEntry[] {
  return entries.filter((e) => holdsAny(grants, e.anyOf));
}

/** A caller is an admin when at least one permission-gated entry is visible to them. */
export function isAdmin(
  grants: readonly PermissionGrant[],
  entries: readonly AdminNavEntry[] = adminNav,
): boolean {
  return visibleNav(grants, entries).some((e) => e.anyOf !== undefined);
}
