import type { Json } from '@aiaia/shared';
import type { Client } from '../index';
import { storedSessionUserId } from '../auth';

export * from './format';
export * from './verify';

/** One signed pass, as member-pass returns it. `qr` is the static QR text. */
export type MemberPass = {
  member_id: string;
  full_name: string;
  branch_name: string;
  pass_version: number;
  is_self: boolean;
  qr: string;
};

export type PassErrorCode = 'offline' | 'not_configured' | 'not_allowed' | 'too_many' | 'failed';

/** One pass on a bulk print sheet (member-pass with a scope). */
export type BulkPass = Omit<MemberPass, 'is_self'>;

/** What a bulk sheet covers: a branch's active members or an event's active registrants. */
export type BulkScope = { branch_id: string } | { event_id: string };

export class PassError extends Error {
  constructor(public code: PassErrorCode) {
    super(code);
    this.name = 'PassError';
  }
}

/** One row of event_pack: what a scanner device needs to recognise a registrant offline. */
export type PackMember = {
  member_id: string;
  full_name: string;
  member_no: string;
  branch_name: string;
  age_group: string;
  pass_version: number;
  photo_path: string | null;
  guardian_names: string[];
};

/** One queued scan, in the shape sync_check_ins takes. */
export type ScanUpload = {
  client_ref: string;
  member_id: string;
  pass_version: number;
  scanned_at: string;
  walk_in: boolean;
};

export type SyncResult = {
  accepted: string[];
  rejected: { client_ref: string; reason: string }[];
};

export type ScanErrorCode = 'offline' | 'not_allowed' | 'closed' | 'failed';

/** event_pack / sync_check_ins failed. `offline` means retry later; the others will not fix themselves. */
export class ScanError extends Error {
  constructor(public code: ScanErrorCode) {
    super(code);
    this.name = 'ScanError';
  }
}

function scanError(error: { code?: string; message?: string }): ScanError {
  // 42501: not (or no longer) allowed. 22023: the event is not open for check-in.
  if (error.code === '42501') return new ScanError('not_allowed');
  if (error.code === '22023') return new ScanError('closed');
  // A network failure has no Postgres code.
  if (!error.code && /fetch|network|timeout|abort/i.test(error.message ?? '')) {
    return new ScanError('offline');
  }
  return new ScanError('failed');
}

function isPackMember(x: unknown): x is PackMember {
  const p = x as PackMember;
  return (
    !!p &&
    typeof p.member_id === 'string' &&
    typeof p.full_name === 'string' &&
    typeof p.branch_name === 'string' &&
    typeof p.pass_version === 'number' &&
    Array.isArray(p.guardian_names)
  );
}

function isSyncResult(x: unknown): x is SyncResult {
  const r = x as SyncResult;
  return (
    !!r &&
    Array.isArray(r.accepted) &&
    r.accepted.every((a) => typeof a === 'string') &&
    Array.isArray(r.rejected) &&
    r.rejected.every((j) => !!j && typeof j.client_ref === 'string' && typeof j.reason === 'string')
  );
}

function isPass(x: unknown): x is MemberPass {
  const p = x as MemberPass;
  return (
    !!p &&
    typeof p.member_id === 'string' &&
    typeof p.full_name === 'string' &&
    typeof p.branch_name === 'string' &&
    typeof p.pass_version === 'number' &&
    typeof p.is_self === 'boolean' &&
    typeof p.qr === 'string'
  );
}

export function createCheckinApi(client: Client) {
  return {
    /** The caller's pass and their active wards' passes, signed by member-pass. */
    async myPasses(): Promise<MemberPass[]> {
      const { data, error } = await client.functions.invoke('member-pass', { method: 'POST' });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        if (error.name === 'FunctionsFetchError') throw new PassError('offline');
        throw new PassError(status === 503 ? 'not_configured' : 'failed');
      }
      const passes = (data as { passes?: unknown } | null)?.passes;
      if (!Array.isArray(passes) || !passes.every(isPass)) throw new PassError('failed');
      return passes;
    },

    /**
     * Officer action: the signed passes for a print sheet. The server builds the list from the
     * scope (at most 500) and audits the batch. not_allowed: no right to this scope.
     */
    async bulkPasses(scope: BulkScope): Promise<BulkPass[]> {
      const { data, error } = await client.functions.invoke('member-pass', {
        method: 'POST',
        body: { scope },
      });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        if (error.name === 'FunctionsFetchError') throw new PassError('offline');
        if (status === 403) throw new PassError('not_allowed');
        if (status === 413) throw new PassError('too_many');
        throw new PassError(status === 503 ? 'not_configured' : 'failed');
      }
      const passes = (data as { passes?: unknown } | null)?.passes;
      if (!Array.isArray(passes) || !passes.every((p) => isPass({ ...p, is_self: false }))) {
        throw new PassError('failed');
      }
      return passes as BulkPass[];
    },

    /** The signed-in user's id from the local session (no network), to key the offline cache. */
    async cacheOwner(): Promise<string | null> {
      const { data } = await client.auth.getSession();
      // Offline with an expired access token, getSession() is null but the saved session stays.
      return data.session?.user.id ?? (await storedSessionUserId(client));
    },

    /** Whether the caller may scan for this event (listed check_in staff, or an event officer). */
    async canCheckIn(eventId: string): Promise<boolean> {
      const { data, error } = await client.rpc('is_event_staff', {
        event: eventId,
        capability: 'check_in',
      });
      return !error && data === true;
    },

    /** The registrants of an event, for the offline scanner. Staff only, until a day after the event. */
    async eventPack(eventId: string): Promise<PackMember[]> {
      const { data, error } = await client.rpc('event_pack', { event_id: eventId });
      if (error) throw scanError(error);
      if (!Array.isArray(data) || !data.every(isPackMember)) throw new ScanError('failed');
      return data.map((r) => ({
        member_id: r.member_id,
        full_name: r.full_name,
        member_no: r.member_no ?? '',
        branch_name: r.branch_name,
        age_group: r.age_group ?? '',
        pass_version: r.pass_version,
        photo_path: r.photo_path ?? null,
        guardian_names: r.guardian_names,
      }));
    },

    /** Uploads queued scans (at most 500 per call). Idempotent by client_ref. */
    async syncCheckIns(eventId: string, rows: ScanUpload[]): Promise<SyncResult> {
      const { data, error } = await client.rpc('sync_check_ins', {
        event_id: eventId,
        rows: rows as unknown as Json,
      });
      if (error) throw scanError(error);
      if (!isSyncResult(data)) throw new ScanError('failed');
      return data;
    },

    /** Officer action: invalidates a lost pass. Returns the new pass_version. */
    async reissuePass(memberId: string): Promise<number> {
      const { data, error } = await client.rpc('reissue_pass', { member_id: memberId });
      if (error) throw new Error(error.message);
      return data as number;
    },
  };
}
