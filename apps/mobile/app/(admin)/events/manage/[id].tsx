import { useLocalSearchParams } from 'expo-router';
import { AdminEventDetail } from '@/features/events';

export default function ManageEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AdminEventDetail eventId={String(id)} />;
}
