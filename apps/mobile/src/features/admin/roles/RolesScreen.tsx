import { isEnded, todayIst, type RoleAssignmentRow } from '@aiaia/api';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ListItem,
  QueryState,
  Select,
  Text,
  toast,
} from '@aiaia/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useAdminApi } from '../AdminApiContext';
import { friendlyAdminError } from '../errors';
import { MemberPicker, type PickedMember } from '../MemberPicker';
import { holdsAnywhere } from '../permissions';
import { useAdminGrants } from '../useAdminGrants';

const SCOPE_LABEL = { global: 'global', national: 'national', branch: 'branch' } as const;
const NATIONAL_GROUP = 'National and global roles';

type Group = { title: string; rows: RoleAssignmentRow[] };

/** Branch groups first (by name), the national group last. */
export function groupByBranch(rows: readonly RoleAssignmentRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const title = r.branch_id ? (r.branches?.name ?? 'Branch') : NATIONAL_GROUP;
    const g = map.get(title) ?? { title, rows: [] };
    g.rows.push(r);
    map.set(title, g);
  }
  return [...map.values()].sort((a, b) => {
    if (a.title === NATIONAL_GROUP) return 1;
    if (b.title === NATIONAL_GROUP) return -1;
    return a.title.localeCompare(b.title);
  });
}

function term(a: RoleAssignmentRow): string {
  return `${a.starts_on} to ${a.ends_on ?? 'present'}`;
}

export function RolesScreen() {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  const { grants, ready } = useAdminGrants();
  const allowed = holdsAnywhere(grants, 'roles.assign');

  const [includeEnded, setIncludeEnded] = useState(false);
  const [member, setMember] = useState<PickedMember | null>(null);
  const [roleKey, setRoleKey] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [ending, setEnding] = useState<RoleAssignmentRow | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  const roles = useQuery({
    queryKey: ['admin', 'roles', 'list'],
    queryFn: () => api.listRoles(),
    enabled: allowed,
  });
  const branches = useQuery({
    queryKey: ['admin', 'branches'],
    queryFn: () => api.listBranches(),
    enabled: allowed,
  });
  const assignments = useQuery({
    queryKey: ['admin', 'roles', 'assignments', includeEnded],
    queryFn: () => api.listRoleAssignments({ includeEnded }),
    enabled: allowed,
  });

  const selectedRole = roles.data?.find((r) => r.key === roleKey) ?? null;
  const needsBranch = selectedRole?.scope === 'branch';
  const canSubmit = !!member && !!selectedRole && (!needsBranch || !!branchId);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });

  const assign = useMutation({
    mutationFn: () => {
      if (!member || !roleKey) throw new Error('incomplete form');
      return api.assignRole({
        memberId: member.id,
        roleKey,
        branchId: needsBranch ? branchId : null,
      });
    },
    onSuccess: async () => {
      toast.success('Role assigned.');
      setMember(null);
      setRoleKey(null);
      setBranchId(null);
      setFormError(null);
      await refresh();
    },
    onError: (e) => setFormError(friendlyAdminError(e)),
  });

  const end = useMutation({
    mutationFn: (id: string) => api.endRole(id),
    onSuccess: async () => {
      toast.success('Role ended.');
      setEnding(null);
      setEndError(null);
      await refresh();
    },
    onError: (e) => setEndError(friendlyAdminError(e)),
  });

  if (!ready) return <Text tone="textMuted">Loading…</Text>;
  if (!allowed) {
    return (
      <View style={{ gap: 12 }}>
        <Text variant="heading">Roles</Text>
        <Text tone="textMuted">You do not have permission to manage roles.</Text>
      </View>
    );
  }

  const today = todayIst();

  return (
    <View style={{ gap: 16 }}>
      <Text variant="heading">Roles</Text>

      <Card>
        <View style={{ gap: 12 }}>
          <Text bold>Assign a role</Text>
          <MemberPicker label="Member" selected={member} onSelect={setMember} />
          <Select
            label="Role"
            options={(roles.data ?? []).map((r) => ({
              label: `${r.name} (${SCOPE_LABEL[r.scope]})`,
              value: r.key,
            }))}
            value={roleKey}
            onChange={(v) => {
              setRoleKey(v);
              setBranchId(null);
              setFormError(null);
            }}
            placeholder="Choose a role"
          />
          {needsBranch ? (
            <Select
              label="Branch"
              options={(branches.data ?? []).map((b) => ({ label: b.name, value: b.id }))}
              value={branchId}
              onChange={setBranchId}
              placeholder="Choose a branch"
            />
          ) : null}
          {formError ? (
            <Text tone="danger" accessibilityRole="alert">
              {formError}
            </Text>
          ) : null}
          <Button
            title="Assign role"
            disabled={!canSubmit}
            loading={assign.isPending}
            onPress={() => {
              setFormError(null);
              assign.mutate();
            }}
          />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text bold>{includeEnded ? 'All terms' : 'Current roles'}</Text>
        <Button
          title={includeEnded ? 'Hide term history' : 'Show term history'}
          variant="secondary"
          onPress={() => setIncludeEnded((v) => !v)}
        />
      </View>

      <QueryState
        query={assignments}
        isEmpty={(d) => d.length === 0}
        emptyTitle="No role assignments"
        emptyMessage="Nobody holds a role yet."
      >
        {(rows) => (
          <View style={{ gap: 16 }}>
            {groupByBranch(rows).map((g) => (
              <View key={g.title}>
                <Text bold>{g.title}</Text>
                {g.rows.map((a) => {
                  const over = isEnded(a, today);
                  const who = a.members?.full_name ?? 'Member';
                  return (
                    <ListItem
                      key={a.id}
                      title={`${who}: ${a.roles?.name ?? a.role_key}`}
                      subtitle={term(a)}
                      right={
                        over ? (
                          <Badge label="Ended" />
                        ) : (
                          <Button
                            title="End role"
                            variant="danger"
                            accessibilityLabel={`End role ${a.roles?.name ?? a.role_key} for ${who}`}
                            onPress={() => {
                              setEndError(null);
                              setEnding(a);
                            }}
                          />
                        )
                      }
                      divider
                    />
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </QueryState>

      <ConfirmDialog
        visible={ending !== null}
        title="End this role?"
        message={
          ending
            ? `${ending.members?.full_name ?? 'This member'} will stop holding ${
                ending.roles?.name ?? ending.role_key
              } straight away.${endError ? ` ${endError}` : ''}`
            : undefined
        }
        confirmLabel="End role"
        destructive
        loading={end.isPending}
        onConfirm={() => ending && end.mutate(ending.id)}
        onCancel={() => setEnding(null)}
      />
    </View>
  );
}
