import { Badge, Button, ListItem, QueryState, Select, Text, TextField, toast } from '@aiaia/ui';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useAdminApi } from '../AdminApiContext';
import { exportScope, holdsAnywhere } from '../permissions';
import { useAdminGrants } from '../useAdminGrants';
import { buildMembersCsv } from './csv';
import { deliverCsv } from './deliverCsv';

const ALL = 'all';
const STATUS_OPTIONS = [
  { label: 'All statuses', value: ALL },
  { label: 'Pending', value: 'pending' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Deleted', value: 'deleted' },
];
const WING_OPTIONS = [
  { label: 'All wings', value: ALL },
  { label: 'Youth', value: 'youth' },
  { label: 'AIAIA', value: 'aiaia' },
];

type Status = 'pending' | 'active' | 'suspended' | 'rejected' | 'deleted';

type Props = {
  onOpenMember: (id: string) => void;
  initialStatus?: string;
  pageSize?: number;
};

function friendlyExportError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  if (code === '42501') return 'You do not have permission to export this scope.';
  return 'The export failed. Please try again.';
}

export function MembersListScreen({ onOpenMember, initialStatus, pageSize }: Props) {
  const api = useAdminApi();
  const { grants } = useAdminGrants();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(
    STATUS_OPTIONS.some((o) => o.value === initialStatus) ? (initialStatus as string) : ALL,
  );
  const [branchId, setBranchId] = useState<string>(ALL);
  const [wing, setWing] = useState<string>(ALL);
  const [page, setPage] = useState(0);

  const branches = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => api.listBranches() });
  const filters = {
    search,
    status: status === ALL ? null : (status as Status),
    branchId: branchId === ALL ? null : branchId,
    wing: wing === ALL ? null : wing,
    page,
    pageSize,
  };
  const list = useQuery({
    queryKey: ['admin', 'members', filters],
    queryFn: () => api.listMembers(filters),
    placeholderData: keepPreviousData,
  });

  const canExport = holdsAnywhere(grants, 'data.export');
  const scope = exportScope(grants, filters.branchId);
  const exporter = useMutation({
    mutationFn: async () => {
      if (scope.kind !== 'ok') throw new Error('no export scope');
      const rows = await api.exportMembers({ branchId: scope.branchId });
      await deliverCsv('aiaia-members.csv', buildMembersCsv(rows));
      return rows.length;
    },
    onSuccess: (n) => toast.success(`Exported ${n} member${n === 1 ? '' : 's'}.`),
    onError: (e) => toast.error(friendlyExportError(e)),
  });

  const apply = (fn: () => void) => {
    fn();
    setPage(0);
  };
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <View style={{ gap: 12 }}>
      <Text variant="heading">Members</Text>

      <TextField
        label="Find a member"
        placeholder="Name or member number"
        value={draft}
        onChangeText={setDraft}
        returnKeyType="search"
        onSubmitEditing={() => apply(() => setSearch(draft))}
        accessibilityLabel="Search members"
      />
      <Button title="Search" variant="secondary" onPress={() => apply(() => setSearch(draft))} />

      <Select
        label="Status"
        options={STATUS_OPTIONS}
        value={status}
        onChange={(v) => apply(() => setStatus(v))}
      />
      <Select
        label="Branch"
        options={[
          { label: 'All branches', value: ALL },
          ...(branches.data ?? []).map((b) => ({ label: b.name, value: b.id })),
        ]}
        value={branchId}
        onChange={(v) => apply(() => setBranchId(v))}
      />
      <Select
        label="Wing"
        options={WING_OPTIONS}
        value={wing}
        onChange={(v) => apply(() => setWing(v))}
      />

      {canExport ? (
        <View style={{ gap: 4 }}>
          <Button
            title="Export CSV"
            variant="secondary"
            loading={exporter.isPending}
            disabled={scope.kind !== 'ok'}
            onPress={() => exporter.mutate()}
          />
          {scope.kind === 'pick_branch' ? (
            <Text tone="textMuted" variant="caption">
              Choose a branch to export.
            </Text>
          ) : null}
        </View>
      ) : null}

      <QueryState
        query={list}
        isEmpty={(d) => d.rows.length === 0}
        emptyTitle="No members found"
        emptyMessage="Try a different search or filter."
      >
        {(d) => (
          <View>
            {d.rows.map((m) => (
              <ListItem
                key={m.id}
                title={m.full_name}
                subtitle={[m.member_no, m.branches?.name, m.city].filter(Boolean).join(' · ')}
                right={
                  <Badge label={m.status} tone={m.status === 'active' ? 'success' : 'neutral'} />
                }
                onPress={() => onOpenMember(m.id)}
                accessibilityLabel={`Open ${m.full_name}`}
                divider
              />
            ))}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 12,
              }}
            >
              <Button
                title="Previous"
                variant="ghost"
                disabled={page === 0}
                onPress={() => setPage((p) => Math.max(0, p - 1))}
              />
              <Text tone="textMuted">{`Page ${page + 1} of ${totalPages}`}</Text>
              <Button
                title="Next"
                variant="ghost"
                disabled={page + 1 >= totalPages}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          </View>
        )}
      </QueryState>
    </View>
  );
}
