import { PassError, type MemberPass } from '@aiaia/api';
import { Button } from '@aiaia/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { useApi } from '@/features/auth/useApi';
import { passQrSvg, printPass, savePassImage } from './pass-actions';
import { loadPassCache, savePassCache } from './pass-cache';

type View_ = { kind: 'loading' } | ({ kind: 'ready' } & Loaded) | { kind: 'message'; text: string };

const OFFLINE_EMPTY = "You're offline and no pass has been saved on this device yet.";
const NOT_CONFIGURED = "Passes aren't set up yet.";
const FAILED = "We couldn't load your pass. Please try again.";
const messageFor = (code: PassError['code']) =>
  code === 'not_configured' ? NOT_CONFIGURED : code === 'offline' ? OFFLINE_EMPTY : FAILED;

function formatUpdated(iso: string): string {
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
}

/** One pass: a large QR with the name and branch, and the save and print actions. */
function PassCard({ pass }: { pass: MemberPass }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cardRef = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    let live = true;
    void passQrSvg(pass.qr).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [pass.qr]);

  const run = async (action: () => Promise<boolean | void>, failure: string) => {
    setNote(null);
    try {
      if ((await action()) === false) setNote(failure);
    } catch {
      setNote(failure);
    }
  };

  return (
    <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      {/* collapsable={false}: view-shot needs a real native view to capture. */}
      <View ref={cardRef} collapsable={false} className="items-center gap-2 bg-white p-4">
        <Text className="text-xl font-semibold text-slate-900">{pass.full_name}</Text>
        <Text className="text-base text-slate-600">{pass.branch_name}</Text>
        <View
          testID={`pass-qr-${pass.member_id}`}
          accessibilityLabel={`QR pass for ${pass.full_name}`}
        >
          {svg ? <SvgXml xml={svg} width={280} height={280} /> : <ActivityIndicator />}
        </View>
        <Text className="text-sm text-slate-500">AIAIA delegate pass</Text>
      </View>
      <View className="flex-row justify-center gap-3">
        <Button
          title="Save as image"
          variant="secondary"
          disabled={!svg}
          onPress={() =>
            run(
              () => savePassImage(pass, svg ?? '', cardRef),
              'Saving is not available on this device.',
            )
          }
        />
        <Button
          title="Print"
          variant="secondary"
          disabled={!svg}
          onPress={() => run(() => printPass(pass, svg ?? ''), 'Could not open the print dialog.')}
        />
      </View>
      {note ? <Text className="text-center text-sm text-red-700">{note}</Text> : null}
    </View>
  );
}

type Loaded = { passes: MemberPass[]; cachedAt?: string };

export function PassScreen() {
  const { checkin } = useApi();

  // Fresh passes when the server answers; the saved copy only when the device is offline.
  // networkMode 'always': the offline fallback must run, not wait for connectivity.
  const query = useQuery<Loaded, PassError>({
    queryKey: ['checkin', 'my-passes'],
    retry: false,
    networkMode: 'always',
    queryFn: async () => {
      const userId = await checkin.cacheOwner().catch(() => null);
      try {
        const passes = await checkin.myPasses();
        if (userId) await savePassCache(userId, passes);
        return { passes };
      } catch (e) {
        const code = e instanceof PassError ? e.code : 'failed';
        if (code === 'offline') {
          const cached = userId ? await loadPassCache(userId) : null;
          if (cached && cached.passes.length > 0) {
            return { passes: cached.passes, cachedAt: cached.savedAt };
          }
        }
        throw e instanceof PassError ? e : new PassError('failed');
      }
    },
  });

  const state: View_ = query.isPending
    ? { kind: 'loading' }
    : query.isError
      ? { kind: 'message', text: messageFor(query.error.code) }
      : { kind: 'ready', ...query.data };
  const retry = () => void query.refetch();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Text accessibilityRole="header" className="text-2xl font-semibold text-slate-900">
          My pass
        </Text>
        {state.kind === 'loading' ? <ActivityIndicator accessibilityLabel="Loading pass" /> : null}
        {state.kind === 'message' ? (
          <View className="gap-3">
            <Text className="text-base text-slate-700">{state.text}</Text>
            {state.text !== NOT_CONFIGURED ? (
              <Button title="Try again" variant="secondary" onPress={retry} />
            ) : null}
          </View>
        ) : null}
        {state.kind === 'ready' ? (
          <>
            {state.cachedAt ? (
              <Text className="text-sm text-amber-800">
                You&apos;re offline. Showing your saved pass, last updated{' '}
                {formatUpdated(state.cachedAt)}.
              </Text>
            ) : null}
            {state.passes.map((p) => (
              <PassCard key={p.member_id} pass={p} />
            ))}
            <Text className="text-sm text-slate-500">
              Show this code at the event. It is the same every time, so a printed copy works too.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
