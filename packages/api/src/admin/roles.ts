import type { Database } from '@aiaia/shared';
import type { Client } from '../index';

export type RoleScope = Database['public']['Enums']['role_scope'];

export interface RoleRow {
  key: string;
  name: string;
  scope: RoleScope;
  description: string | null;
}

export interface RoleAssignmentRow {
  id: string;
  member_id: string;
  role_key: string;
  branch_id: string | null;
  starts_on: string;
  ends_on: string | null;
  /** Null when RLS hides the member row from the caller. */
  members: { full_name: string; member_no: string | null } | null;
  roles: { name: string; scope: RoleScope } | null;
  branches: { code: string; name: string } | null;
}

export interface AssignRoleInput {
  memberId: string;
  roleKey: string;
  /** Only for branch-scoped roles. */
  branchId?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}

/** Today in Asia/Kolkata as YYYY-MM-DD. Term dates are inclusive and evaluated in IST. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** An assignment is current (or upcoming) until its last day has passed. */
export function isEnded(a: Pick<RoleAssignmentRow, 'ends_on'>, today: string): boolean {
  return a.ends_on !== null && a.ends_on < today;
}

const ASSIGNMENT_COLUMNS =
  'id, member_id, role_key, branch_id, starts_on, ends_on, members!role_assignments_member_id_fkey(full_name, member_no), roles(name, scope), branches(code, name)';

export function createRolesApi(client: Client) {
  return {
    async listRoles(): Promise<RoleRow[]> {
      const res = await client.from('roles').select('key, name, scope, description').order('name');
      if (res.error) throw res.error;
      return (res.data ?? []) as RoleRow[];
    },

    /**
     * Role assignments with member, role and branch names. Without `includeEnded` only
     * assignments that have not finished (current and upcoming) are returned; with it, term
     * history comes too.
     */
    async listRoleAssignments(
      opts: { includeEnded?: boolean; now?: Date } = {},
    ): Promise<RoleAssignmentRow[]> {
      let q = client.from('role_assignments').select(ASSIGNMENT_COLUMNS);
      if (!opts.includeEnded) {
        q = q.or(`ends_on.is.null,ends_on.gte.${todayIst(opts.now)}`);
      }
      const res = await q
        .order('role_key', { ascending: true })
        .order('starts_on', { ascending: false })
        .order('id', { ascending: true })
        .range(0, 999);
      if (res.error) throw res.error;
      return (res.data ?? []) as unknown as RoleAssignmentRow[];
    },

    /** The server refuses self-assignment, global roles without system.config, and overlaps. */
    async assignRole(input: AssignRoleInput): Promise<void> {
      const res = await client.rpc('assign_role', {
        member_id: input.memberId,
        role_key: input.roleKey,
        ...(input.branchId ? { branch_id: input.branchId } : {}),
        ...(input.startsOn ? { starts_on: input.startsOn } : {}),
        ...(input.endsOn ? { ends_on: input.endsOn } : {}),
      });
      if (res.error) throw res.error;
    },

    /** Without `endsOn` the term ends yesterday, so the role stops at once. */
    async endRole(assignmentId: string, endsOn?: string | null): Promise<void> {
      const res = await client.rpc('end_role', {
        assignment_id: assignmentId,
        ...(endsOn ? { ends_on: endsOn } : {}),
      });
      if (res.error) throw res.error;
    },
  };
}
