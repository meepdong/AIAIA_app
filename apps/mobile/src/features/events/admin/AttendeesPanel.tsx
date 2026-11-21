import { Badge, Button, Card, QueryState, Text, toast } from '@aiaia/ui';
import { View } from 'react-native';
import { attendeeCounts, attendeesCsv, exportCsv } from './csv';
import { useAttendees } from './hooks';

/** Counts, the list, and a CSV export. Officers only: the RPC refuses everyone else and audits each read. */
export function AttendeesPanel({ eventId }: { eventId: string }) {
  const attendees = useAttendees(eventId);

  async function download(rows: Parameters<typeof attendeesCsv>[0]) {
    try {
      await exportCsv(attendeesCsv(rows), `event-${eventId}-attendees.csv`);
    } catch {
      toast.error('Could not export the attendee list');
    }
  }

  return (
    <Card>
      <Text variant="heading">Attendees</Text>
      <QueryState query={attendees} emptyTitle="No RSVPs yet">
        {(rows) => {
          const counts = attendeeCounts(rows);
          return (
            <View style={{ gap: 8, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <Badge label={`Going: ${counts.going}`} tone="success" />
                <Badge label={`Waitlisted: ${counts.waitlisted}`} tone="warning" />
                <Badge label={`Cancelled: ${counts.cancelled}`} tone="neutral" />
              </View>
              <Button
                variant="secondary"
                title="Export CSV"
                accessibilityLabel="Export attendees as CSV"
                onPress={() => void download(rows)}
              />
              {rows.map((r) => (
                <View key={r.member_id} style={{ gap: 2 }}>
                  <Text bold>{r.full_name}</Text>
                  <Text variant="label" tone="textMuted">
                    {r.member_no} · {r.branch_name} · {r.status}
                    {r.registered_by_guardian ? ' · registered by guardian' : ''}
                  </Text>
                </View>
              ))}
            </View>
          );
        }}
      </QueryState>
    </Card>
  );
}
