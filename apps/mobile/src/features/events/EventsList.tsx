import type { EventRow, ListEventsOptions } from '@aiaia/api';
import { Badge, Card, Header, QueryState, Screen, Tag, Text } from '@aiaia/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { asRsvpStatus, RSVP_LABEL, RSVP_TONE, spotsText, whenText } from './helpers';
import { useDependents, useEventList, useMyMember, useRsvps, useSpots } from './hooks';

type Scope = NonNullable<ListEventsOptions['scope']>;
type Wing = NonNullable<ListEventsOptions['wing']>;

const WHEN: { value: ListEventsOptions['when']; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'national', label: 'National' },
  { value: 'branch', label: 'My branch' },
];
const WINGS: { value: Wing; label: string }[] = [
  { value: 'all', label: 'All wings' },
  { value: 'youth', label: 'Youth' },
  { value: 'aiaia', label: 'AIAIA' },
];

function firstName(full: string) {
  return full.split(' ')[0] ?? full;
}

export function EventsList() {
  const router = useRouter();
  const [when, setWhen] = useState<ListEventsOptions['when']>('upcoming');
  const [scope, setScope] = useState<Scope>('all');
  const [wing, setWing] = useState<Wing>('all');

  const events = useEventList({ when, scope, wing });
  const me = useMyMember();
  const deps = useDependents();
  const ids = (events.data ?? []).map((e) => e.id);
  const spots = useSpots(ids);
  const people = [
    ...(me.data ? [{ id: me.data.id, name: 'You' }] : []),
    ...(deps.data ?? [])
      .filter((d) => d.status === 'active')
      .map((d) => ({ id: d.member_id, name: firstName(d.full_name) })),
  ];
  const rsvps = useRsvps(
    people.map((p) => p.id),
    ids,
  );

  function badgesFor(e: EventRow) {
    return people.flatMap((p) => {
      const s = asRsvpStatus(
        rsvps.data?.find((r) => r.event_id === e.id && r.member_id === p.id)?.status,
      );
      if (!s || s === 'cancelled') return [];
      return [
        <Badge
          key={p.id}
          label={p.name === 'You' ? RSVP_LABEL[s] : `${p.name}: ${RSVP_LABEL[s]}`}
          tone={RSVP_TONE[s]}
        />,
      ];
    });
  }

  return (
    <Screen padded={false}>
      <Header title="Events" />
      <View style={{ padding: 16, gap: 12 }}>
        <Row>
          {WHEN.map((o) => (
            <Tag
              key={o.value}
              label={o.label}
              selected={when === o.value}
              onPress={() => setWhen(o.value)}
            />
          ))}
        </Row>
        <Row>
          {SCOPES.map((o) => (
            <Tag
              key={o.value}
              label={o.label}
              selected={scope === o.value}
              onPress={() => setScope(o.value)}
            />
          ))}
        </Row>
        <Row>
          {WINGS.map((o) => (
            <Tag
              key={o.value}
              label={o.label}
              selected={wing === o.value}
              onPress={() => setWing(o.value)}
            />
          ))}
        </Row>
        <QueryState
          query={events}
          emptyTitle={when === 'upcoming' ? 'No upcoming events' : 'No past events'}
        >
          {(list) => (
            <View style={{ gap: 12 }}>
              {list.map((e) => (
                <Pressable
                  key={e.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.title}, ${whenText(e)}`}
                  onPress={() => router.push(`/events/${e.id}` as never)}
                >
                  <Card>
                    <Text variant="heading">{e.title}</Text>
                    <Text tone="textMuted">{whenText(e)}</Text>
                    {e.venue_name ? <Text variant="label">{e.venue_name}</Text> : null}
                    <Text variant="label" tone="textMuted">
                      {e.scope === 'national' ? 'National' : 'Branch'} event
                    </Text>
                    {e.status === 'cancelled' ? (
                      <Badge label="Cancelled" tone="danger" />
                    ) : (
                      <Text variant="label">
                        {spotsText(
                          e.capacity,
                          spots.data?.find((s) => s.event_id === e.id),
                        )}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {badgesFor(e)}
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </QueryState>
      </View>
    </Screen>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{children}</View>;
}
