import { Button } from '@aiaia/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useApi } from '@/features/auth/useApi';

/** The way into the scanner from an event: shown only to people who may check in for it. */
export function CheckinEntry({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { checkin } = useApi();
  const allowed = useQuery({
    queryKey: ['checkin', 'can', eventId],
    queryFn: () => checkin.canCheckIn(eventId),
    retry: false,
  });
  if (allowed.data !== true) return null;
  return (
    <Button
      title="Open check-in"
      onPress={() => router.push(`/events/checkin/${eventId}` as Href)}
    />
  );
}
