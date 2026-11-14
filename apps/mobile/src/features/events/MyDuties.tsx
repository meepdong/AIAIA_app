import { Header, ListItem, QueryState, Screen } from '@aiaia/ui';
import { useRouter } from 'expo-router';
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
                <ListItem
                  key={d.event_id}
                  divider
                  title={d.title}
                  subtitle={`${whenText(d)} · ${d.capabilities
                    .map((c) => CAPABILITY_LABEL[c] ?? c)
                    .join(', ')}`}
                  onPress={() => router.push(`/events/${d.event_id}` as never)}
                />
              ))}
            </>
          )}
        </QueryState>
      </View>
    </Screen>
  );
}
