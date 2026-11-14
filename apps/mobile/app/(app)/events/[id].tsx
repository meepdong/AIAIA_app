import { useLocalSearchParams } from 'expo-router';
import { EventDetail } from '@/features/events';

export default function EventDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventDetail eventId={String(id)} />;
}
