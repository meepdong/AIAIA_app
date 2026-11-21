import { AdminLayout, Button, EmptyState, QueryState } from '@aiaia/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdminApi } from './AdminApiContext';
import { adminNav, isAdmin, visibleNav, type AdminNavEntry } from './adminNav';
import { StepUpSlot } from './stepUpSlot';

export const ADMIN_ACCESS_KEY = ['admin', 'access'] as const;

type Props = {
  activeKey: string;
  onNavigate: (entry: AdminNavEntry) => void;
  onSwitchToMemberView: () => void;
  entries?: readonly AdminNavEntry[];
  /** Width at which the sidebar replaces the drawer (tests pass 0 to render the sidebar). */
  breakpoint?: number;
  children: ReactNode;
};

/**
 * The admin guard and frame. A pending step-up shows the step-up flow and nothing else; a caller
 * with no admin permission sees no admin chrome at all.
 */
export function AdminShell({
  activeKey,
  onNavigate,
  onSwitchToMemberView,
  entries = adminNav,
  breakpoint,
  children,
}: Props) {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ADMIN_ACCESS_KEY, queryFn: () => api.getAccess() });

  return (
    <QueryState query={query}>
      {(access) => {
        if (access.needsStepUp) {
          return (
            <StepUpSlot
              onVerified={() => void queryClient.invalidateQueries({ queryKey: ADMIN_ACCESS_KEY })}
            />
          );
        }
        if (!isAdmin(access.permissions, entries)) {
          return (
            <EmptyState
              title="No admin access"
              message="Your account does not have any admin permissions."
              action={{ label: 'Go to member view', onPress: onSwitchToMemberView }}
            />
          );
        }
        const visible = visibleNav(access.permissions, entries);
        return (
          <AdminLayout
            title="AIAIA admin"
            nav={visible.map((e) => ({ key: e.key, label: e.label }))}
            activeKey={activeKey}
            breakpoint={breakpoint}
            onNavigate={(key) => {
              const entry = visible.find((e) => e.key === key);
              if (entry) onNavigate(entry);
            }}
            headerRight={
              <Button title="Member view" variant="ghost" onPress={onSwitchToMemberView} />
            }
          >
            {children}
          </AdminLayout>
        );
      }}
    </QueryState>
  );
}
