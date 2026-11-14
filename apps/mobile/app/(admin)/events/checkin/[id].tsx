import { useLocalSearchParams } from 'expo-router';
import { ScanScreen } from '@/features/checkin';

export default function CheckinRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ScanScreen eventId={String(id)} />;
}
