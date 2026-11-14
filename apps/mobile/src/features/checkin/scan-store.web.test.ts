import type { PackMember } from '@aiaia/api';
import { clearScanData, openScanStore } from './scan-store.web';
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
