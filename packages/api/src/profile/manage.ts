import type {
  AddDependentPayload,
  AddDependentResult,
  CreateClaimCodeResult,
  GiveAdultConsentPayload,
  GiveAdultConsentResult,
  MyDependentRow,
  MyProfileResult,
  PrivacyFlags,
} from '@aiaia/shared/src/schemas/membership';
import type { Client } from '../index';

/** Friendly failure; `message` is safe to show as is. */
export type ManageFailure = {
  ok: false;
  kind:
    | 'offline'
    | 'not_due'
    | 'signed_out'
    | 'not_saved'
    | 'not_allowed'
    | 'invalid_input'
    | 'unknown';
  message: string;
};

export type InfoRequest = { id: string; message: string; createdAt: string };

/** What the My profile screen may change. Email, DOB and branch change elsewhere. */
export interface UpdateProfileInput {
  memberId: string;
  fullName: string;
  gender: string | null;
  city: string | null;
  occupation: string | null;
  education: string | null;
  emergencyContactName: string | null;
  /** E.164 (+91...), or null to clear. */
  emergencyContactPhone: string | null;
  whatsappOptIn: boolean;
  emailUpdatesOptIn: boolean;
  privacy: Required<PrivacyFlags>;
}

export type DependentCode = { code: string; expiresAt: string };

type ErrorLike = { message?: unknown; code?: unknown; status?: unknown };

const asErrorLike = (error: unknown): ErrorLike =>
  typeof error === 'object' && error !== null ? (error as ErrorLike) : {};

function mapManageError(error: unknown): ManageFailure {
  const e = asErrorLike(error);
  const text = typeof e.message === 'string' ? e.message : '';
  if (
    error instanceof TypeError ||
    e.status === 0 ||
    /network request failed|failed to fetch|network error|offline/i.test(text)
  ) {
    return {
      ok: false,
      kind: 'offline',
      message: 'No internet connection. Check your connection and try again.',
    };
  }
  if (e.code === '42501') {
    return { ok: false, kind: 'signed_out', message: 'Please sign in again to continue.' };
  }
  if (e.code === '23514') {
    return {
      ok: false,
      kind: 'not_due',
      message: 'Nothing is waiting for your consent. Reopen the app to continue.',
    };
  }
  return { ok: false, kind: 'unknown', message: 'Something went wrong. Please try again.' };
}

const NOT_SAVED: ManageFailure = {
  ok: false,
  kind: 'not_saved',
  message: 'Your changes could not be saved. Please sign in again and retry.',
};

const INVALID_INPUT: ManageFailure = {
  ok: false,
  kind: 'invalid_input',
  message: 'Some details look wrong. Please check them and try again.',
};

/** Error mapping for the writes of My profile and My family. Messages never carry personal data. */
function mapWriteError(error: unknown): ManageFailure {
  const base = mapManageError(error);
  if (base.kind === 'offline' || base.kind === 'signed_out') return base;
  const e = asErrorLike(error);
  if (e.code === '22023' || e.code === '23514') return INVALID_INPUT;
  return base;
}

const notAllowed = (message: string): ManageFailure => ({
  ok: false,
  kind: 'not_allowed',
  message,
});

function mapAddDependentError(error: unknown): ManageFailure {
  const e = asErrorLike(error);
  const text = typeof e.message === 'string' ? e.message : '';
  if (e.code === '42501' && /only an adult|only an active/i.test(text)) {
    return notAllowed('Only an active member aged 18 or over can add a family member.');
  }
  if (e.code === '22023' && /under 18/i.test(text)) {
    return {
      ok: false,
      kind: 'invalid_input',
      message: 'A family member added here must be under 18. Others can join on their own.',
    };
  }
  if (e.code === '22023' && /dob/i.test(text)) {
    return { ok: false, kind: 'invalid_input', message: 'Enter a valid date of birth.' };
  }
  if (e.code === '22023' && /full_name/i.test(text)) {
    return { ok: false, kind: 'invalid_input', message: 'Enter a name (up to 120 characters).' };
  }
  return mapWriteError(error);
}

function mapClaimCodeError(error: unknown): ManageFailure {
  const e = asErrorLike(error);
  const text = typeof e.message === 'string' ? e.message : '';
  if (e.code === '23514' && /already has a login/i.test(text)) {
    return notAllowed('This family member already has their own login.');
  }
  if (e.code === '23514' && /from age 14/i.test(text)) {
    return notAllowed('A family member can have their own login from age 14.');
  }
  if (e.code === '23514')
    return notAllowed('A code cannot be made until their membership is open.');
  if (e.code === '42501' && /guardian/i.test(text)) {
    return notAllowed('Only a guardian of this family member can make a code.');
  }
  return mapWriteError(error);
}

/** Reads of the caller's own profile, its edits, the family screen and the 18th-birthday consent. Methods never throw. */
export function createManageMethods(client: Client) {
  return {
    /** `my_profile()`; `profile: null` when the caller has no member row. */
    async myProfile(): Promise<{ ok: true; profile: MyProfileResult | null } | ManageFailure> {
      try {
        const { data, error } = await client.rpc('my_profile');
        if (error) return mapManageError(error);
        const profile = data as unknown as MyProfileResult | null;
        return { ok: true, profile: profile && profile.member ? profile : null };
      } catch (error) {
        return mapManageError(error);
      }
    },

    /** "Request info" messages from approvers (own notifications), newest first. */
    async infoRequests(): Promise<{ ok: true; items: InfoRequest[] } | ManageFailure> {
      try {
        const { data, error } = await client
          .from('notifications')
          .select('id, data, created_at')
          .eq('kind', 'membership.info_requested')
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) return mapManageError(error);
        const items: InfoRequest[] = [];
        for (const row of data ?? []) {
          const d = row.data as { message?: unknown } | null;
          if (d && typeof d.message === 'string') {
            items.push({ id: row.id, message: d.message, createdAt: row.created_at });
          }
        }
        return { ok: true, items };
      } catch (error) {
        return mapManageError(error);
      }
    },

    /** `give_adult_consent`: accepts the account as the member's own. */
    async giveAdultConsent(
      payload: GiveAdultConsentPayload,
    ): Promise<({ ok: true } & GiveAdultConsentResult) | ManageFailure> {
      try {
        const { data, error } = await client.rpc('give_adult_consent', {
          payload: payload as unknown as Record<string, never>,
        });
        if (error) return mapManageError(error);
        return { ok: true, ...(data as unknown as GiveAdultConsentResult) };
      } catch (error) {
        return mapManageError(error);
      }
    },

    /**
     * Saves the caller's own profile by direct update (there is no RPC). An RLS refusal does not
     * raise, so each update asks for its row back and any count other than one is a failure.
     * `notify_prefs` is read first and merged, so keys this screen does not own (such as `push`)
     * survive.
     */
    async updateProfile(input: UpdateProfileInput): Promise<{ ok: true } | ManageFailure> {
      try {
        const own = await client
          .from('member_private')
          .select('notify_prefs')
          .eq('member_id', input.memberId)
          .maybeSingle();
        if (own.error) return mapWriteError(own.error);
        if (!own.data) return NOT_SAVED;
        const prefs = (own.data.notify_prefs ?? {}) as Record<string, unknown>;

        const member = await client
          .from('members')
          .update({
            full_name: input.fullName,
            gender: input.gender,
            city: input.city,
            occupation: input.occupation,
            education: input.education,
            privacy: input.privacy,
          })
          .eq('id', input.memberId)
          .select('id');
        if (member.error) return mapWriteError(member.error);
        if ((member.data ?? []).length !== 1) return NOT_SAVED;

        const priv = await client
          .from('member_private')
          .update({
            emergency_contact_name: input.emergencyContactName,
            emergency_contact_phone: input.emergencyContactPhone,
            notify_prefs: {
              ...prefs,
              whatsapp: input.whatsappOptIn,
              email_updates: input.emailUpdatesOptIn,
            },
          })
          .eq('member_id', input.memberId)
          .select('member_id');
        if (priv.error) return mapWriteError(priv.error);
        if ((priv.data ?? []).length !== 1) return NOT_SAVED;
        return { ok: true };
      } catch (error) {
        return mapWriteError(error);
      }
    },

    /** `my_dependents()`: the caller's wards. Only an active adult guardian gets rows. */
    async myDependents(): Promise<{ ok: true; items: MyDependentRow[] } | ManageFailure> {
      try {
        const { data, error } = await client.rpc('my_dependents');
        if (error) return mapWriteError(error);
        return { ok: true, items: (data ?? []) as unknown as MyDependentRow[] };
      } catch (error) {
        return mapWriteError(error);
      }
    },

    /** `add_dependent`: a pending child member under the caller's guardianship. */
    async addDependent(
      payload: AddDependentPayload,
    ): Promise<({ ok: true } & AddDependentResult) | ManageFailure> {
      try {
        const { data, error } = await client.rpc('add_dependent', {
          payload: payload as unknown as Record<string, never>,
        });
        if (error) return mapAddDependentError(error);
        return { ok: true, ...(data as unknown as AddDependentResult) };
      } catch (error) {
        return mapAddDependentError(error);
      }
    },

    /** `create_claim_code`: a family code (valid 7 days) so a dependent aged 14+ can log in. */
    async createClaimCode(
      dependentId: string,
    ): Promise<({ ok: true } & DependentCode) | ManageFailure> {
      try {
        const { data, error } = await client.rpc('create_claim_code', {
          dependent_id: dependentId,
        });
        if (error) return mapClaimCodeError(error);
        const result = data as unknown as CreateClaimCodeResult;
        return { ok: true, code: result.code, expiresAt: result.expires_at };
      } catch (error) {
        return mapClaimCodeError(error);
      }
    },
  };
}
