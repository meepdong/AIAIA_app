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
  packs: Record<string, { downloadedAt: string; rows: PackMember[] }>;
  scans: QueuedScan[];
};

const keyOf = (owner: string) => `aiaia.checkin.v1.${owner}`;

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
  return {
    async savePack(eventId, rows, downloadedAt) {
      update((d) => {
        d.packs[eventId] = { downloadedAt, rows };
      });
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
      update((d) => {
        d.packs = {};
        d.scans = d.scans
          .filter((s) => s.status === 'pending')
          .map((s) => ({ ...s, full_name: null, branch_name: null }));
      });
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
