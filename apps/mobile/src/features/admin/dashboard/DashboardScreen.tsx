import { Badge, Button, Card, QueryState, Text } from '@aiaia/ui';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { useAdminApi } from '../AdminApiContext';
import { holdsAnywhere } from '../permissions';
import { useAdminGrants } from '../useAdminGrants';

const STATUS_LABEL = {
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
  rejected: 'Rejected',
  deleted: 'Deleted',
} as const;

const WING_LABEL = { youth: 'Youth', aiaia: 'AIAIA' } as const;

const IST = 'Asia/Kolkata';
function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: IST,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function Stat({ label, value, testID }: { label: string; value: number; testID?: string }) {
  return (
    <View style={{ minWidth: 110, gap: 2 }}>
      <Text variant="heading" testID={testID}>
        {String(value)}
      </Text>
      <Text tone="textMuted" variant="caption">
        {label}
      </Text>
    </View>
  );
}

export function DashboardScreen({ onOpenPending }: { onOpenPending?: () => void }) {
  const api = useAdminApi();
  const { grants, ready } = useAdminGrants();
  const canReviewReports = holdsAnywhere(grants, 'reports.review');
  const query = useQuery({
    queryKey: ['admin', 'dashboard', canReviewReports],
    queryFn: () => api.getDashboard({ canReviewReports }),
    enabled: ready,
  });

  return (
    <QueryState query={query}>
      {(d) => (
        <View style={{ gap: 16 }}>
          <Text variant="heading">Dashboard</Text>

          <Card>
            <View style={{ gap: 8 }}>
              <Text bold>Members by status</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => (
                  <Stat key={s} label={STATUS_LABEL[s]} value={d.byStatus[s]} />
                ))}
              </View>
            </View>
          </Card>

          <Card>
            <View style={{ gap: 8 }}>
              <Text bold>Active members by wing</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                {(Object.keys(WING_LABEL) as (keyof typeof WING_LABEL)[]).map((w) => (
                  <Stat key={w} label={WING_LABEL[w]} value={d.byWing[w]} />
                ))}
              </View>
            </View>
          </Card>

          <Card>
            <View style={{ gap: 8 }}>
              <Text bold>Active members by branch</Text>
              {d.byBranch.length === 0 ? (
                <Text tone="textMuted">No active members yet.</Text>
              ) : (
                d.byBranch.map((b) => (
                  <View
                    key={b.branchId}
                    style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                  >
                    <Text>{b.name}</Text>
                    <Text bold>{String(b.active)}</Text>
                  </View>
                ))
              )}
            </View>
          </Card>

          <Card>
            <View style={{ gap: 8 }}>
              <Text bold>Pending approvals</Text>
              <Stat label="waiting for review" value={d.pending} testID="pending-count" />
              {onOpenPending && d.pending > 0 ? (
                <Button title="View pending members" variant="secondary" onPress={onOpenPending} />
              ) : null}
            </View>
          </Card>

          {d.openReports !== null ? (
            <Card>
              <View style={{ gap: 8 }}>
                <Text bold>Open reports</Text>
                <Stat label="awaiting review" value={d.openReports} testID="open-reports-count" />
              </View>
            </Card>
          ) : null}

          <Card>
            <View style={{ gap: 8 }}>
              <Text bold>Upcoming events</Text>
              {d.upcomingEvents.length === 0 ? (
                <Text tone="textMuted">No upcoming events.</Text>
              ) : (
                d.upcomingEvents.map((e) => (
                  <View key={e.id} style={{ gap: 2 }}>
                    <Text>{e.title}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Badge label={when(e.starts_at)} />
                      {e.venue_name ? (
                        <Text tone="textMuted" variant="caption">
                          {e.venue_name}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </View>
          </Card>
        </View>
      )}
    </QueryState>
  );
}
