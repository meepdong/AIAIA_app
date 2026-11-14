import type { PermissionGrant } from '@aiaia/api';
import type { Permission } from '@aiaia/shared';

/** True when the caller holds `key` nationally (no branch) or, if `branchId` is given, there. */
export function holds(
  grants: readonly PermissionGrant[],
  key: Permission,
  branchId?: string | null,
): boolean {
  return grants.some(
    (g) =>
      g.permission_key === key &&
      (g.branch_id === null || (!!branchId && g.branch_id === branchId)),
  );
}

export function holdsAnywhere(grants: readonly PermissionGrant[], key: Permission): boolean {
  return grants.some((g) => g.permission_key === key);
}

/**
 * Edit branch needs members.manage on the member's current branch and members.approve on the
 * new one. The new branch is chosen afterwards, so the button shows when approve is held anywhere.
 * The RPC re-checks both (and refuses a self-move).
 */
export function canEditBranch(grants: readonly PermissionGrant[], memberBranchId: string): boolean {
  return (
    holds(grants, 'members.manage', memberBranchId) && holdsAnywhere(grants, 'members.approve')
  );
}

/** Branches the caller may pick as a destination: where they hold members.approve. */
export function approveBranchIds(grants: readonly PermissionGrant[]): 'all' | string[] {
  if (grants.some((g) => g.permission_key === 'members.approve' && g.branch_id === null)) {
    return 'all';
  }
  return grants
    .filter((g) => g.permission_key === 'members.approve' && g.branch_id !== null)
    .map((g) => g.branch_id as string);
}

export type ExportScope =
  { kind: 'none' } | { kind: 'pick_branch' } | { kind: 'ok'; branchId: string | null };

/**
 * Which `branch_id` to export with. `null` (everything) needs a national data.export; a branch
 * holder exports their branch, or must pick one when they hold several.
 */
export function exportScope(
  grants: readonly PermissionGrant[],
  branchFilter: string | null,
): ExportScope {
  const exports = grants.filter((g) => g.permission_key === 'data.export');
  if (exports.length === 0) return { kind: 'none' };
  const national = exports.some((g) => g.branch_id === null);
  if (branchFilter) return { kind: 'ok', branchId: branchFilter };
  if (national) return { kind: 'ok', branchId: null };
  const branches = [...new Set(exports.map((g) => g.branch_id as string))];
  return branches.length === 1
    ? { kind: 'ok', branchId: branches[0] ?? null }
    : { kind: 'pick_branch' };
}
