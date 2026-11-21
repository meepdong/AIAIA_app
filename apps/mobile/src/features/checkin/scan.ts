import { parsePassQr, verifyPass, type PackMember } from '@aiaia/api';
import type { QueuedScan, ScanStore } from './scan-types';

export type RejectReason = 'no_key' | 'malformed' | 'bad_signature' | 'stale';

/** What the scanner decided about one scanned code, before the admin confirms anything. */
export type ScanOutcome =
  | { kind: 'reject'; reason: RejectReason }
  | { kind: 'duplicate'; scan: QueuedScan }
  | { kind: 'member'; member: PackMember; passVersion: number }
  | { kind: 'walk_in'; memberId: string; passVersion: number };

export const REJECT_TEXT: Record<RejectReason, string> = {
  no_key: 'This device has no pass key, so it cannot check passes. Update the app.',
  malformed: "That isn't an AIAIA pass.",
  bad_signature: 'This pass is not genuine. Do not let this person in on this code.',
  stale:
    'This pass is out of date: it was reissued or the list is older. Ask for their current pass.',
};

/**
 * Decides what a scanned code means, with no network: the Ed25519 signature first (so a forged
 * code is never looked up, and never reported as "already checked in"), then the event pack for
 * the member's current pass_version, then the queue for a duplicate.
 */
export async function evaluateScan(
  qr: string,
  publicKey: string | null | undefined,
  store: ScanStore,
  eventId: string,
): Promise<ScanOutcome> {
  // The member id in the text is untrusted until the signature below covers it; it is only used
  // to find which pass_version to hold the signature to.
  const claimed = parsePassQr(qr.trim());
  const member = claimed ? await store.findMember(eventId, claimed.memberId) : null;

  const verdict = verifyPass(qr.trim(), publicKey, member?.pass_version);
  if (!verdict.ok) return { kind: 'reject', reason: verdict.reason };

  const prior = await store.findScan(eventId, verdict.memberId);
  if (prior) return { kind: 'duplicate', scan: prior };

  return member
    ? { kind: 'member', member, passVersion: verdict.passVersion }
    : { kind: 'walk_in', memberId: verdict.memberId, passVersion: verdict.passVersion };
}

/** Queues one confirmed scan. Returns it. `newRef` and `now` are injectable for tests. */
export async function confirmScan(
  store: ScanStore,
  eventId: string,
  outcome: Extract<ScanOutcome, { kind: 'member' | 'walk_in' }>,
  newRef: () => string,
  now: Date = new Date(),
): Promise<QueuedScan> {
  const base = {
    client_ref: newRef(),
    event_id: eventId,
    scanned_at: now.toISOString(),
    status: 'pending' as const,
    reason: null,
  };
  const scan: QueuedScan =
    outcome.kind === 'member'
      ? {
          ...base,
          member_id: outcome.member.member_id,
          pass_version: outcome.passVersion,
          walk_in: false,
          full_name: outcome.member.full_name,
          branch_name: outcome.member.branch_name,
        }
      : {
          ...base,
          member_id: outcome.memberId,
          pass_version: outcome.passVersion,
          walk_in: true,
          full_name: null,
          branch_name: null,
        };
  await store.addScan(scan);
  return scan;
}
