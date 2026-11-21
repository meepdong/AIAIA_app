import * as SQLite from 'expo-sqlite';
import { parseDraft, type ProfileDraft } from './form';

/**
 * The half-finished profile form, kept on this device in `expo-sqlite` so a closed app or a lost
 * connection does not cost the applicant their typing. One row, tagged with the user it belongs
 * to: a different login on the same device never sees it. Cleared on submit. Device-only: it is
 * never uploaded. Every call is best effort and never throws (a draft is a convenience).
 */

const DB_NAME = 'aiaia-drafts.db';

let opening: Promise<SQLite.SQLiteDatabase> | undefined;

function open(): Promise<SQLite.SQLiteDatabase> {
  opening ??= SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
    await db.execAsync(
      'CREATE TABLE IF NOT EXISTS profile_draft (id INTEGER PRIMARY KEY CHECK (id = 1), owner TEXT NOT NULL, body TEXT NOT NULL)',
    );
    return db;
  });
  opening.catch(() => {
    opening = undefined; // try again on the next call
  });
  return opening;
}

export async function loadDraft(owner: string): Promise<ProfileDraft | null> {
  try {
    const db = await open();
    const row = await db.getFirstAsync<{ owner: string; body: string }>(
      'SELECT owner, body FROM profile_draft WHERE id = 1',
    );
    return row && row.owner === owner ? parseDraft(row.body) : null;
  } catch {
    return null;
  }
}

export async function saveDraft(owner: string, draft: ProfileDraft): Promise<void> {
  try {
    const db = await open();
    await db.runAsync(
      'INSERT OR REPLACE INTO profile_draft (id, owner, body) VALUES (1, ?, ?)',
      owner,
      JSON.stringify(draft),
    );
  } catch {
    // Best effort.
  }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await open();
    await db.runAsync('DELETE FROM profile_draft WHERE id = 1');
  } catch {
    // Best effort.
  }
}
