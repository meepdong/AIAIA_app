import type { Api, Membership } from '@aiaia/api';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useApiGetter } from '@/features/auth/useApi';
import { useAutoRefreshOnForeground } from '@/features/auth/useAutoRefresh';
import { clearAllScanData, purgeExpiredScanData } from '@/features/checkin/scan-store';
import {
  clearOfflineActive,
  hasOfflineActive,
  revokeOfflineActive,
  saveOfflineActive,
} from './offline-access';

/**
 * The auth-gate states, mirroring docs/build/01-architecture.md §7. `SessionProvider` derives the
 * current one from the Supabase session plus `my_profile()`; the gate in app/_layout.tsx and
 * `homeRouteFor` consume it.
 */
export const SESSION_STATES = [
  'loading',
  'signed_out', // no session -> phone screen
  'no_profile', // session but no member row -> profile setup
  'pending', // waiting room
  'blocked', // rejected, suspended or deleted
  'adult_consent', // active, 18th-birthday handover
  'active', // member app
  'offline_active', // no signal, confirmed active within 7 days: pass and scanner only
] as const;

export type SessionState = (typeof SESSION_STATES)[number];

export function isSessionState(value: unknown): value is SessionState {
  return typeof value === 'string' && (SESSION_STATES as readonly string[]).includes(value);
}

/** Where each state lands. `active` goes to the member area. */
export function homeRouteFor(state: SessionState): string {
  switch (state) {
    case 'loading':
    case 'signed_out':
      return '/phone';
    case 'no_profile':
      return '/profile-setup';
    case 'pending':
      return '/waiting-room';
    case 'blocked':
      return '/blocked';
    case 'adult_consent':
      return '/adult-consent';
    case 'active':
      return '/home';
    case 'offline_active':
      return '/offline';
  }
}

/**
 * Maps a membership (from `my_profile()`) to a gate state. Only an active member without a pending
 * 18th-birthday handover gets `active`; anything unrecognised is `blocked`, never access.
 */
export function stateForMembership(member: Membership | null): SessionState {
  if (!member) return 'no_profile';
  switch (member.status) {
    case 'pending':
      return 'pending';
    case 'active':
      return member.adultConsentRequired ? 'adult_consent' : 'active';
    case 'rejected':
    case 'suspended':
    case 'deleted':
      return 'blocked';
    default:
      return 'blocked';
  }
}

/** Dev convenience only: EXPO_PUBLIC_MOCK_SESSION=active pnpm --filter mobile start */
export function mockSessionOverride(): SessionState | null {
  const raw = process.env.EXPO_PUBLIC_MOCK_SESSION;
  return __DEV__ && isSessionState(raw) ? raw : null;
}

export function useMockedSessionState(): SessionState {
  return mockSessionOverride() ?? 'signed_out';
}

/** How long to wait before asking `my_profile()` again after it failed. */
export const PROFILE_RETRY_MS = 5000;

/**
 * The real source: `auth.onSession` (which also fires for the stored session at start-up), then
 * `my_profile()` for who the session belongs to. Fails closed: while the lookup has not
 * succeeded the state stays `loading` (first load) or unchanged, and never becomes `active`.
 */
function useRealSessionState(): { state: SessionState; refresh: RefreshMembership } {
  const getApi = useApiGetter();
  const refreshRef = useRef<RefreshMembership>(async () => null);
  const [state, setState] = useState<SessionState>('loading');
  useAutoRefreshOnForeground();
  // No Supabase config (a build mistake) means nobody can sign in: show the phone screen.
  const auth = useMemo<Api['auth'] | null>(() => {
    try {
      return getApi().auth;
    } catch {
      return null;
    }
  }, [getApi]);

  useEffect(() => {
    if (!auth) return;
    let disposed = false;
    let signedIn = false; // set by onSession; a refresh with nobody signed in does nothing
    let currentUser: string | null = null; // the signed-in user, for the offline-access cache
    let run = 0; // a newer session event supersedes an older lookup
    let retry: ReturnType<typeof setTimeout> | undefined;

    // Cold start with no signal: only a fresh server-confirmed `active` for this same user lets the
    // restricted (pass and scanner) navigator in. Anything else keeps the spinner (fails closed).
    const tryOffline = async (attempt: number, userId: string) => {
      const fresh = await hasOfflineActive(userId);
      if (disposed || attempt !== run || !fresh) return;
      setState((current) => (current === 'loading' ? 'offline_active' : current));
    };

    const resolve = async (attempt: number, userId: string): Promise<SessionState | null> => {
      const result = await auth.loadMembership();
      if (disposed || attempt !== run) return null;
      if (result.ok) {
        const next = stateForMembership(result.member);
        if (next === 'active') await saveOfflineActive(userId);
        else await revokeOfflineActive(userId);
        if (disposed || attempt !== run) {
          // A sign-out may have cleared while the save was in flight: nothing may stay.
          if (next === 'active') await clearOfflineActive();
          return null;
        }
        setState(next);
        return next;
      }
      if (result.kind === 'offline') await tryOffline(attempt, userId);
      if (disposed || attempt !== run) return null;
      retry = setTimeout(() => void resolve(attempt, userId), PROFILE_RETRY_MS);
      return null;
    };

    // An explicit re-read after the app changed the membership itself (submit, claim, approval
    // polling). A failed read changes nothing: the state stays as it was, never `active`.
    refreshRef.current = async () => {
      if (!signedIn || !currentUser) return null;
      run += 1;
      clearTimeout(retry);
      return resolve(run, currentUser);
    };

    // A real end of the session (sign-out, revoked or expired refresh token): nothing stays.
    const endSession = () => {
      void clearAllScanData();
      void clearOfflineActive();
      setState('signed_out');
    };

    // App start: event packs of events that ended more than a day ago are not kept.
    void purgeExpiredScanData();
    const off = auth.onSession((session, event) => {
      signedIn = Boolean(session);
      currentUser = session?.user.id ?? null;
      run += 1;
      const attempt = run;
      clearTimeout(retry);
      if (!session) {
        // supabase-js removes the saved session (and emits SIGNED_OUT) on a sign-out or a rejected
        // refresh token. A refresh that failed for a network reason keeps it, but the start-up
        // event (INITIAL_SESSION) still says null: that is "offline", and must not wipe the packs.
        if (event === 'SIGNED_OUT') return endSession();
        void (async () => {
          const savedUser = await auth.storedUserId();
          if (disposed || attempt !== run) return;
          if (!savedUser) return endSession();
          await tryOffline(attempt, savedUser);
        })();
        return;
      }
      // Just signed in: hold on the loading state until we know who this is.
      setState((current) => (current === 'signed_out' ? 'loading' : current));
      void resolve(attempt, session.user.id);
    });
    return () => {
      disposed = true;
      clearTimeout(retry);
      off();
    };
  }, [auth]);

  const refresh = useCallback<RefreshMembership>(() => refreshRef.current(), []);
  return { state: auth ? state : 'signed_out', refresh };
}

/** Re-reads `my_profile()`; resolves to the new gate state, or null when the read failed. */
export type RefreshMembership = () => Promise<SessionState | null>;

const SessionContext = createContext<SessionState>('loading');
const RefreshContext = createContext<RefreshMembership>(async () => null);

function MockSessionProvider({ state, children }: { state: SessionState; children: ReactNode }) {
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

function RealSessionProvider({ children }: { children: ReactNode }) {
  const { state, refresh } = useRealSessionState();
  return (
    <SessionContext.Provider value={state}>
      <RefreshContext.Provider value={refresh}>{children}</RefreshContext.Provider>
    </SessionContext.Provider>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const mock = mockSessionOverride();
  return mock ? (
    <MockSessionProvider state={mock}>{children}</MockSessionProvider>
  ) : (
    <RealSessionProvider>{children}</RealSessionProvider>
  );
}

export function useSessionState(): SessionState {
  return useContext(SessionContext);
}

/** For screens that change the membership themselves (submit, claim, polling for approval). */
export function useRefreshMembership(): RefreshMembership {
  return useContext(RefreshContext);
}
