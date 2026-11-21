import { ScanError } from '@aiaia/api';
import { Avatar, Badge, Button, Card, Header, Screen, Text, TextField } from '@aiaia/ui';
import NetInfo from '@react-native-community/netinfo';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { confirmScan, evaluateScan, REJECT_TEXT, type ScanOutcome } from './scan';
import { openScanStore } from './scan-store';
import type { PackInfo, QueuedScan, ScanStore } from './scan-types';
import { reasonText, syncPending } from './sync';

/** The pass public key from app.config.ts. Empty means the scanner refuses every pass. */
export const passPublicKey = (): string | undefined => {
  const k = (Constants.expoConfig?.extra as { passPublicKey?: unknown } | undefined)?.passPublicKey;
  return typeof k === 'string' ? k : undefined;
};

const timeText = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const ERROR_TEXT: Record<string, string> = {
  offline: "You're offline.",
  not_allowed: "You can't check people in for this event.",
  closed: 'This event is not open for check-in.',
  failed: 'Something went wrong. Try again.',
};
const errorText = (e: unknown) => ERROR_TEXT[e instanceof ScanError ? e.code : 'failed'];

export function ScanScreen({
  eventId,
  publicKey = passPublicKey(),
}: {
  eventId: string;
  publicKey?: string;
}) {
  const router = useRouter();
  const { checkin, events } = useApi();
  const [permission, requestPermission] = useCameraPermissions();
  const store = useRef<ScanStore | null>(null);
  const syncing = useRef(false);
  const [ready, setReady] = useState<'loading' | 'ok' | 'error'>('loading');
  const [pack, setPack] = useState<PackInfo | null>(null);
  const [scans, setScans] = useState<QueuedScan[]>([]);
  const [pending, setPending] = useState(0);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState<'pack' | 'sync' | null>(null);
  const [typed, setTyped] = useState('');
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = store.current;
    if (!s) return;
    setPack(await s.packInfo(eventId));
    setScans(await s.listScans(eventId));
    setPending((await s.pendingScans(eventId)).length);
  }, [eventId]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const owner = await checkin.cacheOwner();
        if (!owner) throw new Error('no session');
        store.current = await openScanStore(owner);
        await refresh();
        if (live) setReady('ok');
      } catch {
        if (live) setReady('error');
      }
    })();
    return () => {
      live = false;
    };
  }, [checkin, refresh]);

  useEffect(
    () =>
      NetInfo.addEventListener((s) =>
        setOnline(s.isConnected === true && s.isInternetReachable !== false),
      ),
    [],
  );

  const sync = useCallback(async () => {
    const s = store.current;
    if (!s || syncing.current) return;
    syncing.current = true;
    setBusy('sync');
    setSyncNote(null);
    try {
      const r = await syncPending(s, eventId, (id, rows) => checkin.syncCheckIns(id, rows));
      const bad = r.rejected.length;
      setSyncNote(
        r.accepted + bad === 0
          ? 'Nothing to upload.'
          : `Uploaded: ${r.accepted} accepted${bad ? `, ${bad} rejected` : ''}.`,
      );
    } catch (e) {
      // The server no longer lets this person check in here: nothing about the event stays.
      if (e instanceof ScanError && e.code === 'not_allowed') {
        await s.dropEvent(eventId).catch(() => undefined);
      }
      setSyncNote(`Could not upload. ${errorText(e)} Scans are kept on this device.`);
    } finally {
      syncing.current = false;
      setBusy(null);
      await refresh();
    }
  }, [checkin, eventId, refresh]);

  // Uploads by itself as soon as there is signal and something waiting, so guardian alerts are not held up.
  useEffect(() => {
    if (ready === 'ok' && online && pending > 0) void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when connectivity or the queue changes
  }, [ready, online, pending]);

  const downloadPack = async () => {
    const s = store.current;
    if (!s) return;
    setBusy('pack');
    setNotice(null);
    try {
      const rows = await checkin.eventPack(eventId);
      // The pack is purged a day after the event ends; without the end time it counts from now.
      // The title lets the offline screen list the pack by name.
      const ev = await events?.getEvent(eventId).catch(() => null);
      await s.savePack(
        eventId,
        rows,
        new Date().toISOString(),
        ev?.ends_at ?? null,
        ev?.title ?? null,
      );
      setNotice(`Event pack downloaded: ${rows.length} registered.`);
    } catch (e) {
      if (e instanceof ScanError && e.code === 'not_allowed') {
        await s.dropEvent(eventId).catch(() => undefined);
      }
      setNotice(`Could not download the pack. ${errorText(e)}`);
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const handleCode = useCallback(
    async (code: string) => {
      const s = store.current;
      if (!s || !code.trim()) return;
      setNotice(null);
      setOutcome(await evaluateScan(code, publicKey, s, eventId));
    },
    [eventId, publicKey],
  );

  const confirm = async () => {
    const s = store.current;
    if (!s || !outcome || (outcome.kind !== 'member' && outcome.kind !== 'walk_in')) return;
    try {
      const scan = await confirmScan(s, eventId, outcome, () => Crypto.randomUUID());
      setNotice(scan.walk_in ? 'Walk-in recorded.' : `Checked in: ${scan.full_name}.`);
      setOutcome(null);
      setTyped('');
      await refresh();
    } catch {
      setNotice('Could not save this scan on the device. Try again.');
    }
  };

  const dismiss = () => {
    setOutcome(null);
    setTyped('');
  };

  if (ready !== 'ok') {
    return (
      <Screen>
        <Header title="Check-in" onBack={() => router.back()} />
        <Text tone={ready === 'error' ? 'danger' : 'textMuted'}>
          {ready === 'error' ? 'Check-in is not available. Sign in again and retry.' : 'Loading…'}
        </Text>
      </Screen>
    );
  }

  const cameraOn = permission?.granted === true && outcome === null;
  return (
    <Screen padded={false}>
      <Header title="Check-in" onBack={() => router.back()} />
      <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, gap: 16 }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Badge label={online ? 'Online' : 'Offline'} tone={online ? 'success' : 'warning'} />
            <Text tone="textMuted">
              {pending > 0 ? `${pending} waiting to upload` : 'All scans uploaded'}
            </Text>
          </View>
          <Text tone="textMuted">
            {pack
              ? `Event pack: ${pack.count} registered, downloaded ${timeText(pack.downloadedAt)}.`
              : 'No event pack on this device. Download it while you have signal.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              title={pack ? 'Refresh event pack' : 'Download event pack'}
              variant="secondary"
              loading={busy === 'pack'}
              onPress={downloadPack}
            />
            <Button
              title="Upload"
              variant="secondary"
              disabled={pending === 0}
              loading={busy === 'sync'}
              onPress={() => void sync()}
            />
          </View>
          {syncNote ? <Text>{syncNote}</Text> : null}
          {notice ? <Text bold>{notice}</Text> : null}
        </Card>

        {outcome ? (
          <OutcomePanel outcome={outcome} onConfirm={confirm} onDismiss={dismiss} />
        ) : (
          <Card>
            <Text variant="heading">Scan a pass</Text>
            {cameraOn ? (
              <View style={{ height: 260, overflow: 'hidden', borderRadius: 12 }}>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={(r) => void handleCode(r.data)}
                />
              </View>
            ) : permission?.granted ? null : (
              <Button
                title="Allow camera"
                variant="secondary"
                onPress={() => void requestPermission()}
              />
            )}
            <TextField
              label="Or type or paste the pass code"
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => void handleCode(typed)}
            />
            <Button title="Check pass" onPress={() => void handleCode(typed)} />
          </Card>
        )}

        <Card>
          <Text variant="heading">Scans on this device</Text>
          {scans.length === 0 ? <Text tone="textMuted">No scans yet.</Text> : null}
          {scans.map((s) => (
            <View key={s.client_ref} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text bold>{s.full_name ?? `Walk-in ${s.member_id.slice(0, 8)}`}</Text>
                <Text tone="textMuted" variant="caption">
                  {timeText(s.scanned_at)}
                  {s.walk_in ? ' · walk-in' : ''}
                  {s.status === 'rejected' && s.reason ? ` · ${reasonText(s.reason)}` : ''}
                </Text>
              </View>
              <Badge
                label={
                  s.status === 'pending'
                    ? 'Waiting'
                    : s.status === 'accepted'
                      ? 'Checked in'
                      : 'Rejected'
                }
                tone={
                  s.status === 'rejected'
                    ? 'danger'
                    : s.status === 'pending'
                      ? 'warning'
                      : 'success'
                }
              />
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

function OutcomePanel({
  outcome,
  onConfirm,
  onDismiss,
}: {
  outcome: ScanOutcome;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (outcome.kind === 'reject') {
    return (
      <Card>
        <Text variant="heading" tone="danger">
          Pass not accepted
        </Text>
        <Text>{REJECT_TEXT[outcome.reason]}</Text>
        <Button title="Scan next" onPress={onDismiss} />
      </Card>
    );
  }
  if (outcome.kind === 'duplicate') {
    const s = outcome.scan;
    return (
      <Card>
        <Text variant="heading" tone="warning">
          Already checked in
        </Text>
        <Text>
          {s.full_name ?? 'This person'} was already checked in at {timeText(s.scanned_at)}.
        </Text>
        <Button title="Scan next" onPress={onDismiss} />
      </Card>
    );
  }
  if (outcome.kind === 'walk_in') {
    return (
      <Card>
        <Text variant="heading">Walk-in?</Text>
        <Text>
          This is a genuine pass, but the person is not on this event&apos;s list. Check them in as
          a walk-in? The server decides whether they may attend.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Confirm walk-in" onPress={onConfirm} />
          <Button title="Cancel" variant="secondary" onPress={onDismiss} />
        </View>
      </Card>
    );
  }
  const m = outcome.member;
  return (
    <Card>
      <Text variant="heading">Check this is the person</Text>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={m.full_name} size={64} />
        <View style={{ flex: 1 }}>
          <Text variant="heading">{m.full_name}</Text>
          <Text tone="textMuted">
            {m.branch_name} · {m.age_group} · {m.member_no}
          </Text>
          {m.guardian_names.length > 0 ? (
            <Text tone="textMuted">Guardian: {m.guardian_names.join(', ')}</Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Confirm" onPress={onConfirm} />
        <Button title="Cancel" variant="secondary" onPress={onDismiss} />
      </View>
    </Card>
  );
}
