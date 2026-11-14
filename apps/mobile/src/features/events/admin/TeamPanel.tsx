import type { EventCapability } from '@aiaia/api';
import { Button, Card, QueryState, Tag, Text, TextField, toast } from '@aiaia/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { CAPABILITY_LABEL } from '../helpers';
import { useMemberSearch, useRemoveStaff, useSetStaff, useTeam } from './hooks';

const CAPABILITIES: EventCapability[] = ['check_in', 'collect_payments', 'safety_lead'];

type Picked = { id: string; name: string };

/** Event team: members from any branch with check-in, collect-payments and/or safety-lead duties. */
export function TeamPanel({ eventId }: { eventId: string }) {
  const team = useTeam(eventId);
  const setStaff = useSetStaff(eventId);
  const removeStaff = useRemoveStaff(eventId);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caps, setCaps] = useState<EventCapability[]>([]);
  const search = useMemberSearch(q);

  const toggle = (c: EventCapability) =>
    setCaps((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  function save() {
    if (!picked || caps.length === 0) return;
    setStaff.mutate(
      { memberId: picked.id, capabilities: caps },
      {
        onSuccess: () => {
          toast.success('Team updated');
          setPicked(null);
          setCaps([]);
          setQ('');
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update the team'),
      },
    );
  }

  return (
    <Card>
      <Text variant="heading">Event team</Text>
      <QueryState query={team} emptyTitle="No staff yet">
        {(rows) => (
          <View style={{ gap: 10, marginTop: 8 }}>
            {rows.map((m) => (
              <View key={m.member_id} style={{ gap: 4 }}>
                <Text bold>{m.full_name}</Text>
                <Text variant="label" tone="textMuted">
                  {m.branch_name} · {m.capabilities.map((c) => CAPABILITY_LABEL[c] ?? c).join(', ')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    variant="secondary"
                    title="Edit duties"
                    accessibilityLabel={`Edit duties for ${m.full_name}`}
                    onPress={() => {
                      setPicked({ id: m.member_id, name: m.full_name });
                      setCaps(
                        m.capabilities.filter((c): c is EventCapability =>
                          CAPABILITIES.includes(c as EventCapability),
                        ),
                      );
                    }}
                  />
                  <Button
                    variant="secondary"
                    title="Remove"
                    accessibilityLabel={`Remove ${m.full_name} from the team`}
                    loading={removeStaff.isPending && removeStaff.variables === m.member_id}
                    onPress={() =>
                      removeStaff.mutate(m.member_id, {
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : 'Could not remove'),
                      })
                    }
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </QueryState>

      <View style={{ gap: 10, marginTop: 16 }}>
        <Text variant="label" bold>
          Add or change a team member
        </Text>
        {picked ? (
          <Text>Selected: {picked.name}</Text>
        ) : (
          <>
            <TextField
              label="Find a member"
              hint="Type at least 2 letters of the name"
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
            />
            {(search.data ?? []).map((m) => (
              <Button
                key={m.id}
                variant="secondary"
                title={`${m.full_name} (${m.branch_name})`}
                accessibilityLabel={`Pick ${m.full_name}`}
                onPress={() => setPicked({ id: m.id, name: m.full_name })}
              />
            ))}
          </>
        )}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {CAPABILITIES.map((c) => (
            <Tag
              key={c}
              label={CAPABILITY_LABEL[c] ?? c}
              selected={caps.includes(c)}
              onPress={() => toggle(c)}
            />
          ))}
        </View>
        <Button
          title="Save team member"
          disabled={!picked || caps.length === 0}
          loading={setStaff.isPending}
          onPress={save}
        />
        {picked ? (
          <Button
            variant="secondary"
            title="Clear selection"
            onPress={() => {
              setPicked(null);
              setCaps([]);
            }}
          />
        ) : null}
      </View>
    </Card>
  );
}
