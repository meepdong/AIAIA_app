import { Button, Card, Header, QueryState, Screen, Text } from '@aiaia/ui';
import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';
import { CAPABILITY_LABEL, whenText } from './helpers';
import { useMyDuties } from './hooks';

/** Events the caller works as staff (check-in, collect payments, safety lead). */
export function MyDuties() {
  const router = useRouter();
  const duties = useMyDuties();
  return (
    <Screen padded={false}>
      <Header title="My event duties" onBack={() => router.back()} />
      <View style={{ paddingVertical: 8 }}>
        <QueryState
          query={duties}
          emptyTitle="No event duties"
          emptyMessage="Events where you are on the team will show up here."
        >
          {(list) => (
            <>
              {list.map((d) => (
                <View key={d.event_id} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <Card>
                    <Text variant="heading">{d.title}</Text>
                    <Text tone="textMuted">{whenText(d)}</Text>
                    {d.venue_name ? <Text tone="textMuted">{d.venue_name}</Text> : null}
                    <Text variant="label" bold>
                      {d.capabilities.map((c) => CAPABILITY_LABEL[c] ?? c).join(', ')}
                    </Text>
                    {d.capabilities.includes('check_in') ? (
                      <View style={{ marginTop: 8 }}>
                        <Button
                          variant="secondary"
                          title="Open check-in"
                          onPress={() => router.push(`/events/checkin/${d.event_id}` as Href)}
                        />
                      </View>
                    ) : null}
                  </Card>
                </View>
              ))}
            </>
          )}
        </QueryState>
      </View>
    </Screen>
  );
}
