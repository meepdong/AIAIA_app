import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Auth-gate STUB. The states mirror docs/build/01-architecture.md §7.
 * Later briefs replace `useMockedSessionState` with the real session + my_profile() data;
 * the gate in app/_layout.tsx and `homeRouteFor` stay as they are.
 */
export const SESSION_STATES = [
  'loading',
  'signed_out', // no session -> phone screen
  'no_profile', // session but no member row -> profile setup
  'pending', // waiting room
  'blocked', // rejected, suspended or deleted
  'adult_consent', // active, 18th-birthday handover
  'active', // member app
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
      return '/waiting-room'; // placeholder until the adult-consent screen exists
    case 'active':
      return '/home';
  }
}

// Dev convenience only: EXPO_PUBLIC_MOCK_SESSION=active pnpm --filter mobile start
export function useMockedSessionState(): SessionState {
  const raw = process.env.EXPO_PUBLIC_MOCK_SESSION;
  return __DEV__ && isSessionState(raw) ? raw : 'signed_out';
}

const SessionContext = createContext<SessionState>('loading');

export function SessionProvider({ children }: { children: ReactNode }) {
  const state = useMockedSessionState();
  const value = useMemo(() => state, [state]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionState(): SessionState {
  return useContext(SessionContext);
}
