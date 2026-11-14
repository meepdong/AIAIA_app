import type { Client } from '../index';

export interface PermissionGrant {
  permission_key: string;
  /** Null for global and national grants. */
  branch_id: string | null;
}

export interface AdminAccess {
  permissions: PermissionGrant[];
  /** True when the caller holds a step-up role today but the session has no step-up yet. */
  needsStepUp: boolean;
}

/** `super_admin` is the one step-up role the database always keeps (app_settings constraint). */
export const STEP_UP_ROLE = 'super_admin';

function todayIst(now: Date): string {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function createAdminApi(client: Client) {
  return {
    /**
     * What the admin area needs to decide access. my_permissions() already drops step-up role
     * permissions while the session has no step-up, so "needs a step-up" is derived: the caller
     * holds a current super_admin assignment (own rows are readable) and has_step_up() is false.
     */
    async getAccess(now: Date = new Date()): Promise<AdminAccess> {
      const perms = await client.rpc('my_permissions');
      if (perms.error) throw perms.error;
      const permissions = (perms.data ?? []) as PermissionGrant[];

      const [stepUp, me] = await Promise.all([
        client.rpc('has_step_up'),
        client.rpc('current_member_id'),
      ]);
      if (stepUp.error) throw stepUp.error;
      if (me.error) throw me.error;
      if (stepUp.data || !me.data) return { permissions, needsStepUp: false };

      const today = todayIst(now);
      const mine = await client
        .from('role_assignments')
        .select('starts_on, ends_on')
        .eq('member_id', me.data)
        .eq('role_key', STEP_UP_ROLE);
      if (mine.error) throw mine.error;
      const needsStepUp = (mine.data ?? []).some(
        (r) => r.starts_on <= today && (r.ends_on === null || r.ends_on >= today),
      );
      return { permissions, needsStepUp };
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
