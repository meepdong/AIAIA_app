import { PassError, type BulkScope } from '@aiaia/api';
import { Button, Card, EmptyState, Header, QueryState, Screen, Text } from '@aiaia/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { chunkPages, printSheet } from './print-sheet';

const REFUSED: Partial<Record<string, string>> = {
  not_allowed: 'You do not have the right to print passes for this list.',
  too_many: 'This list has more than 500 passes. Print it in smaller groups.',
  not_configured: 'Pass signing is not set up yet. Ask the app administrator.',
};

/**
 * Bulk pass printing (web admin console): an A4 sheet with 8 signed passes per page, for a branch's
 * active members or an event's active registrants, printed with the browser's own print dialog.
 * With no scope it first asks for a branch.
 */
export function PrintSheetScreen({ scope }: { scope: BulkScope | null }) {
  const router = useRouter();
  if (Platform.OS !== 'web') {
    return (
      <Screen>
        <Header title="Print passes" onBack={() => router.back()} />
        <EmptyState title="Web only" message="Printing is available on the web admin console." />
      </Screen>
    );
  }
  return (
    <Screen padded={false}>
      <Header title="Print passes" onBack={() => router.back()} />
      <View style={{ padding: 16, gap: 12 }}>
        {scope ? <Sheet scope={scope} /> : <BranchPicker />}
      </View>
    </Screen>
  );
}

function BranchPicker() {
  const { directory } = useApi();
  const [branch, setBranch] = useState<string | null>(null);
  const branches = useQuery({
    queryKey: ['checkin', 'print-branches'],
    queryFn: () => directory.branches(),
  });
  if (branch) return <Sheet scope={{ branch_id: branch }} />;
  return (
    <QueryState query={branches} emptyTitle="No branches">
      {(list) => (
        <>
          <Text variant="heading">Choose a branch</Text>
          {list.map((b) => (
            <Button key={b.id} variant="secondary" title={b.name} onPress={() => setBranch(b.id)} />
          ))}
        </>
      )}
    </QueryState>
  );
}

function Sheet({ scope }: { scope: BulkScope }) {
  const { checkin } = useApi();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const passes = useQuery({
    queryKey: ['checkin', 'bulk', scope],
    queryFn: () => checkin.bulkPasses(scope),
    retry: false,
    // Signed passes are not kept around longer than the screen needs them.
    gcTime: 0,
  });

  const refused = passes.error instanceof PassError ? REFUSED[passes.error.code] : undefined;
  if (refused) return <EmptyState title="Cannot print" message={refused} />;

  return (
    <QueryState
      query={passes}
      emptyTitle="No passes to print"
      emptyMessage="There are no active members in this list."
    >
      {(list) => {
        const title = list[0]?.branch_name && 'branch_id' in scope ? list[0].branch_name : 'Event';
        return (
          <Card>
            <Text variant="heading">{`${list.length} passes`}</Text>
            <Text tone="textMuted">{`${chunkPages(list).length} A4 pages, 8 passes per page`}</Text>
            {notice ? <Text tone="textMuted">{notice}</Text> : null}
            <View style={{ marginTop: 8 }}>
              <Button
                title={busy ? 'Preparing…' : 'Print'}
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  setNotice(null);
                  try {
                    await printSheet(`AIAIA passes – ${title}`, list);
                  } catch {
                    setNotice('Could not open the print dialog. Try again.');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          </Card>
        );
      }}
    </QueryState>
  );
}
