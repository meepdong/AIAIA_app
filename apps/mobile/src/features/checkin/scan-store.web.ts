import type { PackMember } from '@aiaia/api';
import type { PackInfo, QueuedScan, ScanStore } from './scan-types';

/**
 * Web build of the scan store. `expo-sqlite` on the web needs a WebAssembly build and
 * cross-origin-isolation headers, so the web scanner keeps the same pack and queue in
 * `localStorage` under one key per signed-in user. Same contract as `scan-store.ts`.
 * Unlike SQLite, a blocked or full localStorage cannot hold the queue; writes then throw, so the
 * scanner shows the failure instead of pretending a scan was saved.
 */

type Doc = {
  packs: Record<string, { downloadedAt: string; endsAt?: string | null; rows: PackMember[] }>;
  scans: QueuedScan[];
};

const PREFIX = 'aiaia.checkin.v1.';
const keyOf = (owner: string) => `${PREFIX}${owner}`;
/** A pack and the names on finished scans go a day after the event ends, as the server stops serving the pack. */
const PACK_GRACE_MS = 24 * 60 * 60 * 1000;

function wipeEvent(d: Doc, eventId: string | null): void {
  const gone = (id: string) => eventId === null || id === eventId;
  for (const id of Object.keys(d.packs)) if (gone(id)) delete d.packs[id];
  d.scans = d.scans
    .filter((s) => !gone(s.event_id) || s.status === 'pending')
    // Unsent scans stay without names.
    .map((s) => (gone(s.event_id) ? { ...s, full_name: null, branch_name: null } : s));
}

function purgeDoc(d: Doc, now: Date): void {
  for (const [id, p] of Object.entries(d.packs)) {
    const base = Date.parse(p.endsAt ?? p.downloadedAt);
    if (Number.isNaN(base) || now.getTime() > base + PACK_GRACE_MS) wipeEvent(d, id);
  }
}

function owners(): string[] {
  const out: string[] = [];
  const ls = window.localStorage;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
  }
  return out;
}

/** The session ended without a sign-out press: forgets every user's packs and names on this device. */
export async function clearAllScanData(): Promise<void> {
  try {
    for (const o of owners()) {
      const d = read(o);
      wipeEvent(d, null);
      write(o, d);
    }
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/** App start: drops packs of events that ended more than a day ago. */
export async function purgeExpiredScanData(): Promise<void> {
  try {
    for (const o of owners()) {
      const d = read(o);
      purgeDoc(d, new Date());
      write(o, d);
    }
  } catch {
    // Storage blocked: nothing to purge.
  }
}

function read(owner: string): Doc {
  try {
    const raw = window.localStorage.getItem(keyOf(owner));
    const doc = raw ? (JSON.parse(raw) as Partial<Doc>) : null;
    return {
      packs: doc && typeof doc.packs === 'object' && doc.packs ? doc.packs : {},
      scans: doc && Array.isArray(doc.scans) ? doc.scans : [],
    };
  } catch {
    return { packs: {}, scans: [] };
  }
}

function write(owner: string, doc: Doc): void {
  window.localStorage.setItem(keyOf(owner), JSON.stringify(doc));
}

export async function openScanStore(owner: string): Promise<ScanStore> {
  const update = (change: (d: Doc) => void) => {
    const d = read(owner);
    change(d);
    write(owner, d);
  };
  try {
    update((d) => purgeDoc(d, new Date()));
  } catch {
    // Storage blocked: writes will report it.
  }
  return {
    async savePack(eventId, rows, downloadedAt, endsAt = null) {
      update((d) => {
        d.packs[eventId] = { downloadedAt, endsAt, rows };
      });
    },
    async dropEvent(eventId) {
      update((d) => wipeEvent(d, eventId));
    },
    async purgeExpired(now = new Date()) {
      update((d) => purgeDoc(d, now));
    },
    async packInfo(eventId): Promise<PackInfo | null> {
      const p = read(owner).packs[eventId];
      return p ? { downloadedAt: p.downloadedAt, count: p.rows.length } : null;
    },
    async findMember(eventId, memberId) {
      return read(owner).packs[eventId]?.rows.find((m) => m.member_id === memberId) ?? null;
    },
    async addScan(scan) {
      update((d) => {
        if (!d.scans.some((s) => s.client_ref === scan.client_ref)) d.scans.push(scan);
      });
    },
    async findScan(eventId, memberId) {
      const hits = read(owner)
        .scans.filter(
          (s) => s.event_id === eventId && s.member_id === memberId && s.status !== 'rejected',
        )
        .sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
      return hits[0] ?? null;
    },
    async listScans(eventId, limit = 50) {
      return read(owner)
        .scans.filter((s) => s.event_id === eventId)
        .reverse()
        .sort((a, b) => b.scanned_at.localeCompare(a.scanned_at))
        .slice(0, limit);
    },
    async pendingScans(eventId) {
      return read(owner)
        .scans.filter((s) => s.event_id === eventId && s.status === 'pending')
        .sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
    },
    async applyResults(accepted, rejected) {
      update((d) => {
        for (const s of d.scans) {
          if (accepted.includes(s.client_ref)) {
            s.status = 'accepted';
            s.reason = null;
          }
          const r = rejected.find((x) => x.client_ref === s.client_ref);
          if (r) {
            s.status = 'rejected';
            s.reason = r.reason;
          }
        }
      });
    },
    async clearForSignOut() {
      update((d) => wipeEvent(d, null));
    },
  };
}

/** Sign-out: forgets the packs and finished scans of this user; unsent scans wait for next sign-in. */
export async function clearScanData(owner: string): Promise<void> {
  try {
    await (await openScanStore(owner)).clearForSignOut();
  } catch {
    // Storage blocked: nothing to clear.
  }
}
