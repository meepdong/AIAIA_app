import type { PackMember } from '@aiaia/api';

/**
 * One scan on this device. `pending` rows wait for sync_check_ins; the server's answer turns them
 * into `accepted` or `rejected` (with its reason, for example `out_of_scope`).
 */
export type QueuedScan = {
  client_ref: string;
  event_id: string;
  member_id: string;
  pass_version: number;
  /** ISO timestamp of the scan. */
  scanned_at: string;
  walk_in: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  reason: string | null;
  /** For the scan list only; null for a walk-in the pack does not know. */
  full_name: string | null;
  branch_name: string | null;
};

export type PackInfo = { downloadedAt: string; count: number };

/**
 * Where the event pack and the scan queue live on this device. Native: SQLite (`scan-store.ts`).
 * Web: localStorage (`scan-store.web.ts`), because expo-sqlite on the web needs a WebAssembly build
 * and cross-origin-isolation headers. Both keep the same contract. Everything is scoped to the
 * signed-in staff member (`owner`), so a second person on the device never sees or uploads it.
 */
export interface ScanStore {
  /** Replaces the pack of one event. Scans already queued are untouched. */
  savePack(
    eventId: string,
    rows: PackMember[],
    downloadedAt: string,
    /** The event's ends_at; the pack is purged a day after it. */
    endsAt?: string | null,
  ): Promise<void>;
  packInfo(eventId: string): Promise<PackInfo | null>;
  findMember(eventId: string, memberId: string): Promise<PackMember | null>;
  addScan(scan: QueuedScan): Promise<void>;
  /** The scan that counts for this member at this event (pending or accepted), if any. */
  findScan(eventId: string, memberId: string): Promise<QueuedScan | null>;
  /** Newest first. */
  listScans(eventId: string, limit?: number): Promise<QueuedScan[]>;
  /** Oldest first. */
  pendingScans(eventId: string): Promise<QueuedScan[]>;
  applyResults(
    accepted: string[],
    rejected: { client_ref: string; reason: string }[],
  ): Promise<void>;
  /** Sign-out: drops the packs (personal data) and finished scans; unsent scans stay for next sign-in. */
  clearForSignOut(): Promise<void>;
  /** The server refused this event (42501): drops its pack and the names on its scans. */
  dropEvent(eventId: string): Promise<void>;
  /** Drops packs (and names on scans) of events that ended more than a day before `now`. */
  purgeExpired(now?: Date): Promise<void>;
}
