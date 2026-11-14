import { Header, Screen } from '@aiaia/ui';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { MANAGE_BASE } from './AdminEventsList';
import { EventForm } from './EventForm';

export function NewEvent() {
  const router = useRouter();
  return (
    <Screen padded={false}>
      <Header title="New event" onBack={() => router.back()} />
      <View style={{ padding: 16 }}>
        <EventForm
          onSaved={(saved) => router.replace(`${MANAGE_BASE}/${saved.id}` as never)}
          onCancel={() => router.back()}
        />
      </View>
    </Screen>
  );
}
