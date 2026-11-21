import { Button } from '@aiaia/ui';
import { useRouter, type Href } from 'expo-router';
import { Platform } from 'react-native';

/**
 * "Print passes" for an event's registrants. Web admin only; the sheet screen and the server
 * (bulk_passes: event officers only) decide whether the caller may print.
 */
export function PrintPassesEntry({ eventId }: { eventId: string }) {
  const router = useRouter();
  if (Platform.OS !== 'web') return null;
  return (
    <Button
      variant="secondary"
      title="Print passes"
      onPress={() => router.push(`/events/checkin/print?event=${eventId}` as Href)}
    />
  );
}
