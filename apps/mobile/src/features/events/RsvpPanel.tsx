import type { EventDependent, EventRow, RsvpRow } from '@aiaia/api';
import { Badge, Button, Card, Text, toast } from '@aiaia/ui';
import { View } from 'react-native';
import { asRsvpStatus, registrationState, RSVP_LABEL, RSVP_TONE } from './helpers';
import { useRsvpMutation } from './hooks';

export type RsvpPerson = { memberId: string; name: string; isSelf: boolean };

/** The caller plus every active dependent. Only active members can RSVP (the RPC enforces it too). */
export function rsvpPeople(
  me: { id: string; name?: string },
  dependents: EventDependent[],
): RsvpPerson[] {
  return [
    { memberId: me.id, name: me.name ?? 'Me', isSelf: true },
    ...dependents
      .filter((d) => d.status === 'active')
      .map((d) => ({ memberId: d.member_id, name: d.full_name, isSelf: false })),
  ];
}

export function RsvpPanel({
  event,
  people,
  rsvps,
}: {
  event: EventRow;
  people: RsvpPerson[];
  rsvps: RsvpRow[];
}) {
  const mutation = useRsvpMutation(event.id);
  const reg = registrationState(event);

  function act(person: RsvpPerson, status: 'going' | 'cancelled') {
    mutation.mutate(
      { memberId: person.memberId, status },
      {
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update the RSVP'),
      },
    );
  }

  return (
    <Card>
      <Text variant="heading">RSVP</Text>
      {reg === 'not_yet' ? <Text tone="textMuted">Registration has not opened yet.</Text> : null}
      {reg === 'closed' ? <Text tone="textMuted">Registration is closed.</Text> : null}
      {reg === 'cancelled' ? <Text tone="danger">This event was cancelled.</Text> : null}
      <View style={{ gap: 12, marginTop: 8 }}>
        {people.map((p) => {
          const row = rsvps.find((r) => r.member_id === p.memberId);
          const status = asRsvpStatus(row?.status);
          const active = status === 'going' || status === 'waitlisted';
          return (
            <View key={p.memberId} style={{ gap: 6 }}>
              <Text bold>{p.isSelf ? `${p.name} (you)` : p.name}</Text>
              {status ? <Badge label={RSVP_LABEL[status]} tone={RSVP_TONE[status]} /> : null}
              {active ? (
                <Button
                  variant="secondary"
                  title="Cancel RSVP"
                  accessibilityLabel={`Cancel RSVP for ${p.name}`}
                  loading={mutation.isPending && mutation.variables?.memberId === p.memberId}
                  onPress={() => act(p, 'cancelled')}
                />
              ) : (
                <Button
                  title={status === 'cancelled' ? 'RSVP again' : 'RSVP'}
                  accessibilityLabel={`RSVP for ${p.name}`}
                  disabled={reg !== 'open'}
                  loading={mutation.isPending && mutation.variables?.memberId === p.memberId}
                  onPress={() => act(p, 'going')}
                />
              )}
            </View>
          );
        })}
      </View>
    </Card>
  );
}
