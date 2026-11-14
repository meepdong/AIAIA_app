import { Badge, Button, Card, QueryState, Text } from '@aiaia/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useAdminApi } from '../AdminApiContext';
import { visibleMemberActions } from '../memberActions';
import { useAdminGrants } from '../useAdminGrants';
import { EditBranchAction } from './EditBranchAction';

const IST = 'Asia/Kolkata';
const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        timeZone: IST,
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'n/a';

const METHOD_LABEL: Record<string, string> = {
  paper_form: 'Paper form',
  phone_call: 'Phone call',
  guardian_account: 'Guardian account',
  in_person: 'In person',
  self_adult: 'Self (adult)',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text tone="textMuted">{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

export function MemberDetailScreen({ memberId }: { memberId: string }) {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  const { grants } = useAdminGrants();
  const [showHistory, setShowHistory] = useState(false);

  const member = useQuery({
    queryKey: ['admin', 'member', memberId],
    queryFn: () => api.getMember(memberId),
  });
  const consent = useQuery({
    queryKey: ['admin', 'member', memberId, 'consent'],
    queryFn: () => api.listConsentRecords(memberId),
  });
  const history = useQuery({
    queryKey: ['admin', 'member', memberId, 'history'],
    queryFn: () => api.listStatusEvents(memberId),
    enabled: showHistory,
  });

  const actions = visibleMemberActions(grants);
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'member', memberId] });

  return (
    <QueryState
      query={member}
      isEmpty={(m) => m === null}
      emptyTitle="Member not found"
      emptyMessage="This member does not exist or you cannot see them."
    >
      {(m) =>
        m && (
          <View style={{ gap: 16 }}>
            <Text variant="heading">{m.full_name}</Text>

            <Card>
              <View style={{ gap: 8 }}>
                <Text bold>Profile</Text>
                <Row label="Member no" value={m.member_no ?? 'n/a'} />
                <Row label="Status" value={m.status} />
                <Row label="Wing" value={m.wing} />
                <Row label="Branch" value={m.branches?.name ?? 'n/a'} />
                <Row label="City" value={m.city ?? 'n/a'} />
                <Row label="Approved" value={fmt(m.approved_at)} />
                {m.status_reason ? <Row label="Status reason" value={m.status_reason} /> : null}
              </View>
            </Card>

            <Card>
              <View style={{ gap: 8 }}>
                <Text bold>Consent records</Text>
                <QueryState
                  query={consent}
                  emptyTitle="No consent records"
                  emptyMessage="No consent has been recorded for this member."
                >
                  {(records) => (
                    <View style={{ gap: 8 }}>
                      {records.map((c) => (
                        <View key={c.id} style={{ gap: 2 }}>
                          <Text>{METHOD_LABEL[c.method] ?? c.method}</Text>
                          <Text tone="textMuted" variant="caption">
                            {`Recorded ${fmt(c.attested_at)}`}
                            {c.guardian_name ? ` · Guardian: ${c.guardian_name}` : ''}
                          </Text>
                          {c.guardian_alerts ? <Badge label="Guardian alerts on" /> : null}
                        </View>
                      ))}
                    </View>
                  )}
                </QueryState>
              </View>
            </Card>

            <Card>
              <View style={{ gap: 8 }}>
                <Text bold>Actions</Text>
                <EditBranchAction
                  memberId={m.id}
                  currentBranchId={m.branch_id}
                  grants={grants}
                  onDone={refresh}
                />
                <Button
                  title={showHistory ? 'Hide history' : 'View history'}
                  variant="secondary"
                  onPress={() => setShowHistory((s) => !s)}
                />
                {actions.map(({ key, Component }) => (
                  <Component key={key} memberId={m.id} grants={grants} onDone={refresh} />
                ))}
              </View>
            </Card>

            {showHistory ? (
              <Card>
                <View style={{ gap: 8 }}>
                  <Text bold>Status history</Text>
                  <QueryState
                    query={history}
                    emptyTitle="No history"
                    emptyMessage="No status changes have been recorded."
                  >
                    {(events) => (
                      <View style={{ gap: 8 }}>
                        {events.map((e) => (
                          <View key={e.id} style={{ gap: 2 }}>
                            <Text>{`${e.from_status ?? 'new'} to ${e.to_status}`}</Text>
                            <Text tone="textMuted" variant="caption">
                              {fmt(e.created_at)}
                              {e.reason ? ` · ${e.reason}` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </QueryState>
                </View>
              </Card>
            ) : null}
          </View>
        )
      }
    </QueryState>
  );
}
