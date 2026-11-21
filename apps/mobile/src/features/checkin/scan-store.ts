import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { clearAllOwners, createSqliteScanStore, purgeExpiredAllOwners } from './sqlite-scan-store';
import type { ScanStore } from './scan-types';

// Native build: the pack and the scan queue live in a SQLite file in the app's private storage, so
// they survive restarts. The web build uses scan-store.web.ts (same contract).

let db: Promise<SQLiteDatabase> | undefined;

export async function openScanStore(owner: string): Promise<ScanStore> {
  db ??= openDatabaseAsync('aiaia-checkin.db').catch((e: unknown) => {
    db = undefined;
    throw e;
  });
  return createSqliteScanStore(await db, owner);
}

/** Sign-out: forgets the packs and finished scans of this user; unsent scans wait for next sign-in. */
export async function clearScanData(owner: string): Promise<void> {
  try {
    await (await openScanStore(owner)).clearForSignOut();
  } catch {
    // No store on this device, or it cannot be opened: nothing to clear.
  }
}

/** The session ended without a sign-out press: forgets every user's packs and names on this device. */
export async function clearAllScanData(): Promise<void> {
  try {
    await clearAllOwners(await (db ??= openDatabaseAsync('aiaia-checkin.db')));
  } catch {
    db = undefined;
  }
}

/** App start: drops packs of events that ended more than a day ago. */
export async function purgeExpiredScanData(): Promise<void> {
  try {
    await purgeExpiredAllOwners(await (db ??= openDatabaseAsync('aiaia-checkin.db')));
  } catch {
    db = undefined;
  }
}
