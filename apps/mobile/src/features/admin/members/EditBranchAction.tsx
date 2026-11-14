import type { PermissionGrant } from '@aiaia/api';
import { Button, Select, Text, toast } from '@aiaia/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useAdminApi } from '../AdminApiContext';
import { friendlyAdminError } from '../errors';
import { approveBranchIds, canEditBranch } from '../permissions';

type Props = {
  memberId: string;
  currentBranchId: string;
  grants: readonly PermissionGrant[];
  onDone: () => void;
};

/** Renders nothing unless the caller may move this member (manage here, approve somewhere). */
export function EditBranchAction({ memberId, currentBranchId, grants, onDone }: Props) {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  const allowed = canEditBranch(grants, currentBranchId);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branches = useQuery({
    queryKey: ['admin', 'branches'],
    queryFn: () => api.listBranches(),
    enabled: allowed && open,
  });
  const move = useMutation({
    mutationFn: (to: string) => api.setMemberBranch(memberId, to),
    onSuccess: async () => {
      toast.success('Branch updated.');
      setOpen(false);
      setTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'members'] });
      onDone();
    },
    onError: (e) => setError(friendlyAdminError(e)),
  });

  if (!allowed) return null;

  const reachable = approveBranchIds(grants);
  const options = (branches.data ?? [])
    .filter((b) => b.id !== currentBranchId && (reachable === 'all' || reachable.includes(b.id)))
    .map((b) => ({ label: b.name, value: b.id }));

  return (
    <View style={{ gap: 8 }}>
      <Button
        title="Edit branch"
        variant="secondary"
        onPress={() => {
          setOpen((o) => !o);
          setError(null);
        }}
      />
      {open ? (
        <View style={{ gap: 8 }}>
          <Select
            label="New branch"
            options={options}
            value={target}
            onChange={setTarget}
            placeholder="Choose a branch"
          />
          {error ? (
            <Text tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            title="Move member"
            disabled={!target}
            loading={move.isPending}
            onPress={() => {
              if (!target) return;
              setError(null);
              move.mutate(target);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
