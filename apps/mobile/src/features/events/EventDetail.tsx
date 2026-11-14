import { formatDateTime } from '@aiaia/shared';
import { Badge, Button, Card, Header, QueryState, Screen, Text, toast } from '@aiaia/ui';
import { useRouter } from 'expo-router';
import { Linking, View } from 'react-native';
import { addToCalendar } from './calendar';
import { registrationState, safeMapUrl, spotsText, whenText } from './helpers';
import { useDependents, useEvent, useMyMember, useRsvps, useSpots } from './hooks';
import { RsvpPanel, rsvpPeople } from './RsvpPanel';

export function EventDetail({ eventId }: { eventId: string }) {
  const router = useRouter();
  const event = useEvent(eventId);
  const me = useMyMember();
  const deps = useDependents();
  const spots = useSpots([eventId]);

  const people = me.data
    ? rsvpPeople({ id: me.data.id, name: me.data.full_name }, deps.data ?? [])
    : [];
  const rsvps = useRsvps(
    people.map((p) => p.memberId),
    [eventId],
  );

  return (
    <Screen padded={false}>
      <Header title="Event" onBack={() => router.back()} />
      <View style={{ padding: 16, gap: 16 }}>
        <QueryState
          query={event}
          isEmpty={(e) => e == null}
          emptyTitle="Event not found"
          emptyMessage="It may have been removed, or it is not open to you."
        >
          {(e) => {
            if (!e) return null;
            const mapUrl = safeMapUrl(e);
            const reg = registrationState(e);
            return (
              <>
                <View style={{ gap: 4 }}>
                  <Text variant="title">{e.title}</Text>
                  <Text tone="textMuted">{whenText(e)}</Text>
                  {e.venue_name ? <Text>{e.venue_name}</Text> : null}
                  {e.venue_address ? <Text tone="textMuted">{e.venue_address}</Text> : null}
                  {e.status === 'cancelled' ? <Badge label="Cancelled" tone="danger" /> : null}
                </View>

                <Card>
                  <Text bold>Spots</Text>
                  <Text accessibilityLabel="Spots left">
                    {spotsText(
                      e.capacity,
                      spots.data?.find((s) => s.event_id === e.id),
                    )}
                  </Text>
                  {e.registration_closes_at && reg === 'open' ? (
                    <Text variant="label" tone="textMuted">
                      Registration closes {formatDateTime(e.registration_closes_at)}
                    </Text>
                  ) : null}
                </Card>

                {e.description ? <Text>{e.description}</Text> : null}

                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {mapUrl ? (
                    <Button
                      variant="secondary"
                      title="Open map"
                      onPress={() => void Linking.openURL(mapUrl)}
                    />
                  ) : null}
                  <Button
                    variant="secondary"
                    title="Add to calendar"
                    onPress={() =>
                      addToCalendar(e).catch(() => toast.error('Could not open your calendar'))
                    }
                  />
                </View>

                {me.data ? <RsvpPanel event={e} people={people} rsvps={rsvps.data ?? []} /> : null}
              </>
            );
          }}
        </QueryState>
      </View>
    </Screen>
  );
}
