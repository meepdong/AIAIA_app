import { useLocalSearchParams } from 'expo-router';
import { CheckinScreen } from '@/features/checkin';

/** Member area (not (admin)): check-in staff are often ordinary members listed on the event. */
export default function CheckinRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CheckinScreen eventId={String(id)} />;
}
