import { Badge, Button, Card, Header, QueryState, Screen, Text } from '@aiaia/ui';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { whenText } from '../helpers';
import { useAdminEvents } from './hooks';

export const MANAGE_BASE = '/events/manage';

const STATUS_TONE = { draft: 'neutral', published: 'success', cancelled: 'danger' } as const;
const STATUS_LABEL = { draft: 'Draft', published: 'Published', cancelled: 'Cancelled' } as const;

export function AdminEventsList() {
  const router = useRouter();
  const events = useAdminEvents();
  return (
    <Screen padded={false}>
      <Header title="Manage events" />
      <View style={{ padding: 16, gap: 12 }}>
        <Button title="New event" onPress={() => router.push(`${MANAGE_BASE}/new` as never)} />
        <QueryState
          query={events}
          emptyTitle="No events yet"
          emptyMessage="Create one to get started."
        >
          {(list) => (
            <View style={{ gap: 12 }}>
              {list.map((e) => {
                const status = e.status as keyof typeof STATUS_TONE;
                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Manage ${e.title}`}
                    onPress={() => router.push(`${MANAGE_BASE}/${e.id}` as never)}
                  >
                    <Card>
                      <Text variant="heading">{e.title}</Text>
                      <Text tone="textMuted">{whenText(e)}</Text>
                      <Text variant="label" tone="textMuted">
                        {e.scope === 'national' ? 'National' : 'Branch'} event
                      </Text>
                      <View style={{ flexDirection: 'row', marginTop: 6 }}>
                        <Badge
                          label={STATUS_LABEL[status] ?? e.status}
                          tone={STATUS_TONE[status] ?? 'neutral'}
                        />
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          )}
        </QueryState>
      </View>
    </Screen>
  );
}
