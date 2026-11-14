// Keys are generated here at test time; nothing secret is committed.
import {
  base64UrlEncode,
  encodePassQr,
  passMessage,
  type Api,
  type PackMember,
  type SyncResult,
} from '@aiaia/api';
import { ed25519 } from '@noble/curves/ed25519';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiProvider } from '@/features/auth/useApi';
import { confirmScan, evaluateScan } from './scan';
import { createSqliteScanStore, type SqlDb } from './sqlite-scan-store';
import { ScanScreen } from './ScanScreen';
import { CheckinScreen } from './CheckinScreen';
import type { ScanStore } from './scan-types';
import { syncPending } from './sync';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('features must go through useApi, not the Supabase client');
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}`,
}));
jest.mock('expo-camera', () => {
  const { Pressable } = jest.requireActual('react-native');
  return {
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned?: (r: { data: string }) => void }) => (
      <Pressable
        testID="camera"
        onPress={() => onBarcodeScanned?.({ data: (globalThis as { __qr?: string }).__qr ?? '' })}
      />
    ),
  };
});
let mockNet = { isConnected: true, isInternetReachable: true as boolean | null };
let mockNetListener: ((s: typeof mockNet) => void) | undefined;
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: async () => mockNet,
    addEventListener: (cb: (s: typeof mockNet) => void) => {
      mockNetListener = cb;
      cb(mockNet);
      return () => undefined;
    },
  },
}));

// The real SQL runs on Node's built-in SQLite behind expo-sqlite's async interface.
let mockDb: SqlDb;
jest.mock('./scan-store', () => ({
  openScanStore: (owner: string) =>
    jest.requireActual('./sqlite-scan-store').createSqliteScanStore(mockDb, owner),
}));

type Param = string | number | null;
function nodeSqlDb(file: string): { db: SqlDb; close: () => void } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- node:sqlite has no ESM stub here
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const raw = new DatabaseSync(file);
  return {
    close: () => raw.close(),
    db: {
      execAsync: async (sql) => void raw.exec(sql),
      runAsync: async (sql, p: Param[]) => raw.prepare(sql).run(...p),
      getAllAsync: async <T,>(sql: string, p: Param[]) => raw.prepare(sql).all(...p) as T[],
      getFirstAsync: async <T,>(sql: string, p: Param[]) =>
        (raw.prepare(sql).get(...p) as T | undefined) ?? null,
      withTransactionAsync: async (task) => {
        raw.exec('begin');
        try {
          await task();
          raw.exec('commit');
        } catch (e) {
          raw.exec('rollback');
          throw e;
        }
      },
    },
  };
}

const EVENT = 'e0000000-0000-4000-8000-000000000001';
const OWNER = 'a0000000-0000-4000-8000-0000000000f1';
const ASHA = 'a0000000-0000-4000-8000-000000000011';
const RAVI = 'a0000000-0000-4000-8000-000000000012';
const WALKIN = 'a0000000-0000-4000-8000-000000000013';

const priv = ed25519.utils.randomPrivateKey();
const PUBLIC = base64UrlEncode(ed25519.getPublicKey(priv));
const qrFor = (id: string, v: number) =>
  encodePassQr(id, v, ed25519.sign(passMessage(id, v), priv));
const pack = (id: string, name: string, v = 1): PackMember => ({
  member_id: id,
  full_name: name,
  member_no: 'AIA-001',
  branch_name: 'Test Branch',
  age_group: '14-17',
  pass_version: v,
  photo_path: null,
  guardian_names: ['Guardian Fake'],
});

let dir: string;
let closeDb: () => void;
let store: ScanStore;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aiaia-scan-'));
  const opened = nodeSqlDb(join(dir, 'c.db'));
  mockDb = opened.db;
  closeDb = opened.close;
  store = await createSqliteScanStore(mockDb, OWNER);
  await store.savePack(
    EVENT,
    [pack(ASHA, 'Asha Fake'), pack(RAVI, 'Ravi Fake', 2)],
    new Date().toISOString(),
  );
  mockNet = { isConnected: true, isInternetReachable: true };
  (globalThis as { __qr?: string }).__qr = undefined;
});
afterEach(() => {
  try {
    closeDb();
  } catch {
    // already closed by the test
  }
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
const ref = () => `00000000-0000-4000-8000-9${String(++n).padStart(11, '0')}`;

describe('evaluateScan', () => {
  it('tampered QR rejected: another member id under a real signature', async () => {
    const [a, , v, sig] = qrFor(ASHA, 1).split('.') as [string, string, string, string];
    const forgedId = qrFor(RAVI, 1).split('.')[1];
    const tampered = [a, forgedId, v, sig].join('.');
    expect(await evaluateScan(tampered, PUBLIC, store, EVENT)).toEqual({
      kind: 'reject',
      reason: 'bad_signature',
    });
  });

  it('a forged code is never reported as a duplicate', async () => {
    const out = await evaluateScan(qrFor(ASHA, 1), PUBLIC, store, EVENT);
    if (out.kind !== 'member') throw new Error('expected a member');
    await confirmScan(store, EVENT, out, ref);
    const [a, id, , sig] = qrFor(ASHA, 1).split('.') as [string, string, string, string];
    // Flip the FIRST signature character (all 6 bits significant) to one that is guaranteed different.
    // Editing the tail is flaky: the last base64url char carries 4 unused bits, so a change there can
    // decode to the same signature (and the key is random per run), leaving a genuine code.
    const forgedSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(forgedSig).not.toEqual(sig);
    expect(await evaluateScan([a, id, '1', forgedSig].join('.'), PUBLIC, store, EVENT)).toEqual({
      kind: 'reject',
      reason: 'bad_signature',
    });
  });

  it('no_key fails closed, malformed and stale are rejected', async () => {
    expect(await evaluateScan(qrFor(ASHA, 1), '', store, EVENT)).toEqual({
      kind: 'reject',
      reason: 'no_key',
    });
    expect(await evaluateScan('hello', PUBLIC, store, EVENT)).toEqual({
      kind: 'reject',
      reason: 'malformed',
    });
    // The pack says Ravi is on version 2; a genuine version-1 pass was reissued.
    expect(await evaluateScan(qrFor(RAVI, 1), PUBLIC, store, EVENT)).toEqual({
      kind: 'reject',
      reason: 'stale',
    });
  });

  it('a genuine pass from outside the pack is a walk-in; a second scan is a duplicate', async () => {
    const out = await evaluateScan(qrFor(WALKIN, 1), PUBLIC, store, EVENT);
    expect(out).toEqual({ kind: 'walk_in', memberId: WALKIN, passVersion: 1 });
    if (out.kind !== 'walk_in') return;
    const scan = await confirmScan(store, EVENT, out, ref);
    expect(scan.walk_in).toBe(true);
    const again = await evaluateScan(qrFor(WALKIN, 1), PUBLIC, store, EVENT);
    expect(again.kind).toBe('duplicate');
  });
});

describe('scan queue', () => {
  it('queue persists: a scan written before a restart is still there afterwards', async () => {
    const out = await evaluateScan(qrFor(ASHA, 1), PUBLIC, store, EVENT);
    if (out.kind !== 'member') throw new Error('expected a member');
    const scan = await confirmScan(store, EVENT, out, ref);
    closeDb();

    // "Restart": a new connection to the same file and a brand-new store object.
    const reopened = nodeSqlDb(join(dir, 'c.db'));
    closeDb = reopened.close;
    const fresh = await createSqliteScanStore(reopened.db, OWNER);
    expect((await fresh.pendingScans(EVENT)).map((s) => s.client_ref)).toEqual([scan.client_ref]);
    expect((await fresh.findMember(EVENT, ASHA))?.full_name).toBe('Asha Fake');
    expect((await evaluateScan(qrFor(ASHA, 1), PUBLIC, fresh, EVENT)).kind).toBe('duplicate');
    // Another signed-in user on the device sees none of it.
    const other = await createSqliteScanStore(reopened.db, 'someone-else');
    expect(await other.pendingScans(EVENT)).toEqual([]);
    expect(await other.packInfo(EVENT)).toBeNull();
  });

  it('sign-out drops the pack and finished scans but keeps unsent ones, without names', async () => {
    const a = await evaluateScan(qrFor(ASHA, 1), PUBLIC, store, EVENT);
    const b = await evaluateScan(qrFor(WALKIN, 1), PUBLIC, store, EVENT);
    if (a.kind !== 'member' || b.kind !== 'walk_in') throw new Error('setup');
    const done = await confirmScan(store, EVENT, a, ref);
    const waiting = await confirmScan(store, EVENT, b, ref);
    await store.applyResults([done.client_ref], []);
    await store.clearForSignOut();
    expect(await store.packInfo(EVENT)).toBeNull();
    const left = await store.listScans(EVENT);
    expect(left.map((s) => s.client_ref)).toEqual([waiting.client_ref]);
    expect(left[0]?.full_name).toBeNull();
  });

  it('sync maps accepted and rejected rows, and repeating it is harmless', async () => {
    const a = await evaluateScan(qrFor(ASHA, 1), PUBLIC, store, EVENT);
    const w = await evaluateScan(qrFor(WALKIN, 1), PUBLIC, store, EVENT);
    if (a.kind !== 'member' || w.kind !== 'walk_in') throw new Error('setup');
    const s1 = await confirmScan(store, EVENT, a, ref);
    const s2 = await confirmScan(store, EVENT, w, ref);

    const sent: string[][] = [];
    const upload = jest.fn(
      async (_e: string, rows: { client_ref: string }[]): Promise<SyncResult> => {
        sent.push(rows.map((r) => r.client_ref));
        return {
          accepted: rows.filter((r) => r.client_ref === s1.client_ref).map((r) => r.client_ref),
          rejected: [{ client_ref: s2.client_ref, reason: 'out_of_scope' }],
        };
      },
    );
    const first = await syncPending(store, EVENT, upload);
    expect(first).toEqual({
      accepted: 1,
      rejected: [{ client_ref: s2.client_ref, reason: 'out_of_scope' }],
    });
    expect(sent[0]).toEqual([s1.client_ref, s2.client_ref]);

    const list = await store.listScans(EVENT);
    expect(list.find((s) => s.client_ref === s1.client_ref)?.status).toBe('accepted');
    const rejected = list.find((s) => s.client_ref === s2.client_ref);
    expect([rejected?.status, rejected?.reason]).toEqual(['rejected', 'out_of_scope']);
    // Nothing is pending now, so a second sync sends nothing.
    expect(await syncPending(store, EVENT, upload)).toEqual({ accepted: 0, rejected: [] });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('a failed upload keeps every scan pending and re-sends the same client_refs later', async () => {
    const a = await evaluateScan(qrFor(ASHA, 1), PUBLIC, store, EVENT);
    if (a.kind !== 'member') throw new Error('setup');
    const s = await confirmScan(store, EVENT, a, ref);
    await expect(
      syncPending(store, EVENT, async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow();
    expect((await store.pendingScans(EVENT)).map((x) => x.client_ref)).toEqual([s.client_ref]);
    const seen: string[] = [];
    await syncPending(store, EVENT, async (_e, rows) => {
      seen.push(...rows.map((r) => r.client_ref));
      return { accepted: seen, rejected: [] };
    });
    expect(seen).toEqual([s.client_ref]);
    expect(await store.pendingScans(EVENT)).toEqual([]);
  });
});

describe('scanner screen', () => {
  const syncCheckIns = jest.fn();
  const eventPack = jest.fn();
  const api = {
    checkin: { cacheOwner: async () => OWNER, syncCheckIns, eventPack },
    _client: {},
  } as unknown as Api;
  const renderScreen = (publicKey: string = PUBLIC) =>
    render(
      <ApiProvider api={api}>
        <QueryClientProvider client={new QueryClient()}>
          <ScanScreen eventId={EVENT} publicKey={publicKey} />
        </QueryClientProvider>
      </ApiProvider>,
    );
  const check = async (code: string) => {
    await fireEvent.changeText(
      await screen.findByLabelText('Or type or paste the pass code'),
      code,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Check pass' }));
  };
  beforeEach(() => {
    syncCheckIns.mockReset();
    eventPack.mockReset();
    mockNet = { isConnected: false, isInternetReachable: false };
  });

  it('tampered QR rejected on screen: shown as not genuine, nothing queued', async () => {
    await renderScreen();
    const parts = qrFor(ASHA, 1).split('.');
    await check([parts[0], parts[1], '2', parts[3]].join('.'));
    expect(await screen.findByText(/not genuine/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(await store.listScans(EVENT)).toEqual([]);
  });

  it('no key in the app fails closed', async () => {
    await renderScreen('');
    await check(qrFor(ASHA, 1));
    expect(await screen.findByText(/no pass key/)).toBeTruthy();
    expect(await store.listScans(EVENT)).toEqual([]);
  });

  it('offline: scan by camera, confirm, queue; online: uploads by itself; duplicate is flagged', async () => {
    syncCheckIns.mockImplementation(async (_e: string, rows: { client_ref: string }[]) => ({
      accepted: rows.map((r) => r.client_ref),
      rejected: [],
    }));
    await renderScreen();
    (globalThis as { __qr?: string }).__qr = qrFor(ASHA, 1);
    await fireEvent.press(await screen.findByTestId('camera'));
    expect(await screen.findByText('Check this is the person')).toBeTruthy();
    expect(screen.getByText('Asha Fake')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('1 waiting to upload')).toBeTruthy();
    expect(await screen.findByText('Waiting')).toBeTruthy();
    expect(syncCheckIns).not.toHaveBeenCalled();

    // Signal returns: no tap needed.
    await act(async () => mockNetListener?.({ isConnected: true, isInternetReachable: true }));
    await waitFor(() => expect(syncCheckIns).toHaveBeenCalledTimes(1));
    expect(syncCheckIns.mock.calls[0][1]).toEqual([
      expect.objectContaining({ member_id: ASHA, pass_version: 1, walk_in: false }),
    ]);
    expect(await screen.findByText('Checked in')).toBeTruthy();
    expect(await screen.findByText('All scans uploaded')).toBeTruthy();

    await fireEvent.press(await screen.findByTestId('camera'));
    expect(await screen.findByText('Already checked in')).toBeTruthy();
    expect(screen.getByText(/Asha Fake was already checked in at/)).toBeTruthy();
    expect(await store.listScans(EVENT)).toHaveLength(1);
  });

  it('walk-in is queued as a walk-in and a server rejection is shown', async () => {
    syncCheckIns.mockImplementation(async (_e: string, rows: { client_ref: string }[]) => ({
      accepted: [],
      rejected: rows.map((r) => ({ client_ref: r.client_ref, reason: 'out_of_scope' })),
    }));
    await renderScreen();
    await check(qrFor(WALKIN, 1));
    expect(await screen.findByText('Walk-in?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm walk-in' }));
    expect(await screen.findByText('Waiting')).toBeTruthy();

    // The admin taps Upload (the device reports no signal, but the tap still tries).
    await fireEvent.press(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(syncCheckIns).toHaveBeenCalled());
    expect(syncCheckIns.mock.calls[0][1]).toEqual([
      expect.objectContaining({ member_id: WALKIN, walk_in: true }),
    ]);
    expect(await screen.findByText('Rejected')).toBeTruthy();
    expect(screen.getByText(/Walk-in from another branch/)).toBeTruthy();
    expect(screen.getByText(/1 rejected/)).toBeTruthy();
  });

  it('downloads the event pack and stores it', async () => {
    eventPack.mockResolvedValue([pack(WALKIN, 'Mia Fake')]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Refresh event pack' }));
    expect(await screen.findByText('Event pack downloaded: 1 registered.')).toBeTruthy();
    expect((await store.findMember(EVENT, WALKIN))?.full_name).toBe('Mia Fake');
    expect(await store.findMember(EVENT, ASHA)).toBeNull();
  });
});

describe('check-in route guard', () => {
  const canCheckIn = jest.fn();
  const eventPack = jest.fn();
  const api = {
    checkin: { cacheOwner: async () => OWNER, syncCheckIns: jest.fn(), eventPack, canCheckIn },
    _client: {},
  } as unknown as Api;
  const renderGuard = () =>
    render(
      <ApiProvider api={api}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <CheckinScreen eventId={EVENT} />
        </QueryClientProvider>
      </ApiProvider>,
    );
  beforeEach(() => {
    canCheckIn.mockReset();
    eventPack.mockReset();
  });

  it('a member who is not on the team sees the friendly message and no pack is downloaded', async () => {
    canCheckIn.mockResolvedValue(false);
    await renderGuard();
    expect(
      await screen.findByText('You are not on the check-in team for this event.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh event pack' })).toBeNull();
    expect(eventPack).not.toHaveBeenCalled();
    expect(canCheckIn).toHaveBeenCalledWith(EVENT);
  });

  it('shows a spinner while the staff check is pending', async () => {
    canCheckIn.mockReturnValue(new Promise(() => undefined));
    await renderGuard();
    expect(screen.getByLabelText('Checking access')).toBeTruthy();
  });

  it('event staff see the scanner', async () => {
    canCheckIn.mockResolvedValue(true);
    await renderGuard();
    expect(await screen.findByLabelText('Or type or paste the pass code')).toBeTruthy();
  });

  it('offline, the scanner still opens (the server refuses non-staff anyway)', async () => {
    canCheckIn.mockResolvedValue(false);
    mockNet = { isConnected: false, isInternetReachable: false };
    await renderGuard();
    expect(await screen.findByLabelText('Or type or paste the pass code')).toBeTruthy();
  });
});
