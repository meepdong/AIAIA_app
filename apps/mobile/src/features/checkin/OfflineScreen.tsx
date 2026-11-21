import { Button, Text } from '@aiaia/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { openScanStore } from './scan-store';
import type { SavedPack } from './scan-types';

const savedText = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

/**
 * The offline_active home (no signal, confirmed active within 7 days): the pass, every event pack
 * saved on this device for this person (so staff can open any of them, not only the one they last
 * had open), and sign-out. Nothing here needs the network.
 */
export function OfflineScreen() {
  const router = useRouter();
  const { checkin } = useApi();
  const [packs, setPacks] = useState<SavedPack[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const owner = await checkin.cacheOwner();
        if (!owner) return;
        const list = await (await openScanStore(owner)).listPacks();
        if (live) setPacks(list);
      } catch {
        // No store on this device: no packs to offer.
      }
    })();
    return () => {
      live = false;
    };
  }, [checkin]);

  return (
    <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center' }}>
      <Text accessibilityRole="header">{"You're offline"}</Text>
      <Text>
        Your pass and saved event check-in work without signal. Everything else returns when you are
        back online.
      </Text>
      <Button title="My pass" onPress={() => router.push('/pass')} />
      {packs.length > 0 ? <Text>Saved event packs</Text> : null}
      {packs.map((p) => (
        <Button
          key={p.eventId}
          variant="secondary"
          title={`Check in: ${p.title ?? `pack saved ${savedText(p.downloadedAt)}`}`}
          onPress={() => router.push(`/checkin/${p.eventId}`)}
        />
      ))}
      <SignOutButton />
    </View>
  );
}
