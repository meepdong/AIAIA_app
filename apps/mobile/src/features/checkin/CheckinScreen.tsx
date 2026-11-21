import { Header, Screen, Text } from '@aiaia/ui';
import NetInfo from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { ScanScreen } from './ScanScreen';

/**
 * The scanner route's guard. Check-in staff are often ordinary members, so this lives in the member
 * area and checks the event staff list itself. The pack is only downloaded by ScanScreen, which is
 * not mounted for anyone else. The server refuses event_pack and sync_check_ins to non-staff too.
 */
export function CheckinScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { checkin } = useApi();
  const gate = useQuery({
    queryKey: ['checkin', 'can', eventId],
    queryFn: async () => {
      if (await checkin.canCheckIn(eventId)) return true;
      // canCheckIn cannot tell "not staff" from "no signal". A venue with no signal must still open the
      // scanner (the server refuses everything for non-staff anyway), so offline is let through.
      const net = await NetInfo.fetch();
      return net.isConnected === false;
    },
    retry: false,
  });

  if (gate.isPending) {
    return (
      <Screen>
        <Header title="Check-in" onBack={() => router.back()} />
        <ActivityIndicator accessibilityLabel="Checking access" />
      </Screen>
    );
  }
  if (gate.data !== true) {
    return (
      <Screen>
        <Header title="Check-in" onBack={() => router.back()} />
        <Text tone="textMuted">You are not on the check-in team for this event.</Text>
      </Screen>
    );
  }
  return <ScanScreen eventId={eventId} />;
}
