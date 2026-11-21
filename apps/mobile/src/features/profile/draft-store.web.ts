import { parseDraft, type ProfileDraft } from './form';

/**
 * Web build of the draft store. `expo-sqlite` on the web needs a WebAssembly build and special
 * response headers, so the web app keeps the same single draft in `localStorage` instead. Same
 * contract as `draft-store.ts`: tagged with the user, cleared on submit, never throws.
 */

const KEY = 'aiaia.profile-draft';

export async function loadDraft(owner: string): Promise<ProfileDraft | null> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { owner?: unknown; body?: unknown };
    if (stored.owner !== owner || typeof stored.body !== 'string') return null;
    return parseDraft(stored.body);
  } catch {
    return null;
  }
}

export async function saveDraft(owner: string, draft: ProfileDraft): Promise<void> {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ owner, body: JSON.stringify(draft) }));
  } catch {
    // Best effort (private window, storage blocked).
  }
}

export async function clearDraft(): Promise<void> {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Best effort.
  }
}
