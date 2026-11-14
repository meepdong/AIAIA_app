import type { PackMember } from '@aiaia/api';
import {
  clearAllScanData,
  clearScanData,
  openScanStore,
  purgeExpiredScanData,
} from './scan-store.web';
import type { QueuedScan } from './scan-types';

const EVENT = 'e0000000-0000-4000-8000-000000000001';
const OWNER = 'a0000000-0000-4000-8000-0000000000f1';
const ASHA = 'a0000000-0000-4000-8000-000000000011';

const member: PackMember = {
  member_id: ASHA,
  full_name: 'Asha Fake',
  member_no: 'AIA-001',
  branch_name: 'Test Branch',
  age_group: '14-17',
  pass_version: 1,
  photo_path: null,
  guardian_names: [],
};
const scan = (ref: string, at: string): QueuedScan => ({
  client_ref: ref,
  event_id: EVENT,
  member_id: ASHA,
  pass_version: 1,
  scanned_at: at,
  walk_in: false,
  status: 'pending',
  reason: null,
  full_name: 'Asha Fake',
  branch_name: 'Test Branch',
});

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
      get length() {
        return memory.size;
      },
      key: (i: number) => [...memory.keys()][i] ?? null,
    },
  };
});

describe('web scan store (localStorage), same contract as the SQLite one', () => {
  it('queue persists: a new store object still sees the scan', async () => {
    const a = await openScanStore(OWNER);
    await a.savePack(EVENT, [member], '2026-11-16T04:00:00.000Z');
    await a.addScan(scan('r1', '2026-11-16T05:00:00.000Z'));

    const b = await openScanStore(OWNER);
    expect((await b.pendingScans(EVENT)).map((s) => s.client_ref)).toEqual(['r1']);
    expect(await b.packInfo(EVENT)).toEqual({ downloadedAt: '2026-11-16T04:00:00.000Z', count: 1 });
    expect((await b.findMember(EVENT, ASHA))?.full_name).toBe('Asha Fake');
    expect((await b.findScan(EVENT, ASHA))?.client_ref).toBe('r1');
    expect(await (await openScanStore('someone-else')).pendingScans(EVENT)).toEqual([]);
  });

  it('records server results, ignores rejected scans for duplicates, and clears on sign-out', async () => {
    const s = await openScanStore(OWNER);
    await s.addScan(scan('r1', '2026-11-16T05:00:00.000Z'));
    await s.addScan(scan('r2', '2026-11-16T05:05:00.000Z'));
    await s.applyResults(['r1'], [{ client_ref: 'r2', reason: 'stale_pass' }]);
    expect((await s.listScans(EVENT)).map((x) => [x.client_ref, x.status, x.reason])).toEqual([
      ['r2', 'rejected', 'stale_pass'],
      ['r1', 'accepted', null],
    ]);
    expect((await s.findScan(EVENT, ASHA))?.client_ref).toBe('r1');

    await s.addScan(scan('r3', '2026-11-16T05:10:00.000Z'));
    await clearScanData(OWNER);
    const left = await s.listScans(EVENT);
    expect(left.map((x) => x.client_ref)).toEqual(['r3']);
    expect(left[0]?.full_name).toBeNull();
  });
});

describe('packs do not outlive their event', () => {
  const EVENT2 = 'e0000000-0000-4000-8000-000000000002';
  const day = 24 * 60 * 60 * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const onEvent2 = (ref: string, status: QueuedScan['status']): QueuedScan => ({
    ...scan(ref, '2026-11-16T05:00:00.000Z'),
    event_id: EVENT2,
    status,
  });

  it('expiry: a pack and its names go a day after the event ends, on the next open', async () => {
    const now = Date.now();
    const a = await openScanStore(OWNER);
    await a.savePack(EVENT2, [member], iso(now), iso(now - 2 * day));
    await a.savePack(EVENT, [member], iso(now), iso(now - day / 2));
    await a.addScan(onEvent2('old-done', 'accepted'));
    await a.addScan(onEvent2('old-wait', 'pending'));

    const b = await openScanStore(OWNER);
    expect(await b.packInfo(EVENT2)).toBeNull();
    expect((await b.listScans(EVENT2)).map((x) => [x.client_ref, x.full_name])).toEqual([
      ['old-wait', null],
    ]);
    expect(await b.packInfo(EVENT)).not.toBeNull();
  });

  it('expiry: app start purges every user', async () => {
    const now = Date.now();
    const a = await openScanStore(OWNER);
    await a.savePack(EVENT2, [member], iso(now), iso(now - 3 * day));
    await purgeExpiredScanData();
    expect(await a.packInfo(EVENT2)).toBeNull();
  });

  it('a refused event (42501): dropEvent removes that pack and the names, keeps unsent scans', async () => {
    const a = await openScanStore(OWNER);
    await a.savePack(EVENT, [member], iso(Date.now()));
    await a.savePack(EVENT2, [member], iso(Date.now()));
    await a.addScan(onEvent2('done', 'accepted'));
    await a.addScan(onEvent2('wait', 'pending'));
    await a.dropEvent(EVENT2);
    expect(await a.packInfo(EVENT2)).toBeNull();
    expect(await a.packInfo(EVENT)).not.toBeNull();
    expect((await a.listScans(EVENT2)).map((x) => [x.client_ref, x.full_name])).toEqual([
      ['wait', null],
    ]);
  });

  it('session loss: all packs and finished scans are cleared, unsent scans lose their names', async () => {
    const a = await openScanStore(OWNER);
    const b = await openScanStore('someone-else');
    await a.savePack(EVENT, [member], iso(Date.now()));
    await b.savePack(EVENT, [member], iso(Date.now()));
    await a.addScan({ ...scan('done', '2026-11-16T05:00:00.000Z'), status: 'accepted' });
    await a.addScan(scan('wait', '2026-11-16T05:01:00.000Z'));
    await clearAllScanData();
    expect(await a.packInfo(EVENT)).toBeNull();
    expect(await b.packInfo(EVENT)).toBeNull();
    expect((await a.listScans(EVENT)).map((x) => [x.client_ref, x.full_name])).toEqual([
      ['wait', null],
    ]);
  });
});
