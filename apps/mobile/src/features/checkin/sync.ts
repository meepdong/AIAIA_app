import type { ScanUpload, SyncResult } from '@aiaia/api';
import type { ScanStore } from './scan-types';

/** sync_check_ins takes at most 500 rows per call. */
export const SYNC_BATCH = 500;

export type SyncSummary = {
  accepted: number;
  rejected: { client_ref: string; reason: string }[];
};

export const REJECT_REASON_TEXT: Record<string, string> = {
  out_of_scope: 'Walk-in from another branch',
  stale_pass: 'Pass out of date',
  member_not_active: 'Member not active',
  client_ref_conflict: 'Scan id already used',
  invalid_row: 'Invalid scan',
  invalid_scanned_at: 'Scan time not valid',
};
export const reasonText = (reason: string) => REJECT_REASON_TEXT[reason] ?? 'Rejected';

/**
 * Uploads every pending scan of an event in batches and records the server's answer on each row.
 * Safe to repeat: a row stays pending until the server answers for it, and the server accepts a
 * client_ref it already stored. If a call fails (offline), rows from earlier batches keep their
 * results and the rest stay pending; the error is rethrown for the caller to show.
 */
export async function syncPending(
  store: ScanStore,
  eventId: string,
  upload: (eventId: string, rows: ScanUpload[]) => Promise<SyncResult>,
): Promise<SyncSummary> {
  const summary: SyncSummary = { accepted: 0, rejected: [] };
  const pending = await store.pendingScans(eventId);
  for (let i = 0; i < pending.length; i += SYNC_BATCH) {
    const batch = pending.slice(i, i + SYNC_BATCH);
    const result = await upload(
      eventId,
      batch.map((s) => ({
        client_ref: s.client_ref,
        member_id: s.member_id,
        pass_version: s.pass_version,
        scanned_at: s.scanned_at,
        walk_in: s.walk_in,
      })),
    );
    // Only rows of this batch can be answered; anything else in the reply is ignored.
    const refs = new Set(batch.map((s) => s.client_ref));
    const accepted = result.accepted.filter((r) => refs.has(r));
    const rejected = result.rejected.filter((r) => refs.has(r.client_ref));
    await store.applyResults(accepted, rejected);
    summary.accepted += accepted.length;
    summary.rejected.push(...rejected);
  }
  return summary;
}
