import type { ComponentType } from 'react';
import type { Permission } from '@aiaia/shared';
import type { PermissionGrant } from '@aiaia/api';

/**
 * Row actions on a member (shared touch point). P1-11, P1-12b, P1-12c and P1-13b append one
 * entry each. Each action renders its own button (and dialog) when the caller holds one of `anyOf`.
 */
export type MemberActionProps = {
  memberId: string;
  grants: readonly PermissionGrant[];
  onDone: () => void;
};

export type MemberAction = {
  key: string;
  anyOf: readonly Permission[];
  Component: ComponentType<MemberActionProps>;
};

export const memberActions: MemberAction[] = [
  // Entries are added here by the briefs that own them.
];

export function visibleMemberActions(
  grants: readonly PermissionGrant[],
  actions: readonly MemberAction[] = memberActions,
): MemberAction[] {
  return actions.filter((a) =>
    grants.some((g) => (a.anyOf as readonly string[]).includes(g.permission_key)),
  );
}
