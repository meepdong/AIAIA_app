import type { Client } from '../index';

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

export type PassErrorCode = 'offline' | 'not_configured' | 'failed';

export class PassError extends Error {
  constructor(public code: PassErrorCode) {
    super(code);
    this.name = 'PassError';
  }
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

    /** The signed-in user's id from the local session (no network), to key the offline cache. */
    async cacheOwner(): Promise<string | null> {
      const { data } = await client.auth.getSession();
      return data.session?.user.id ?? null;
    },

    /** Officer action: invalidates a lost pass. Returns the new pass_version. */
    async reissuePass(memberId: string): Promise<number> {
      const { data, error } = await client.rpc('reissue_pass', { member_id: memberId });
      if (error) throw new Error(error.message);
      return data as number;
    },
  };
}
