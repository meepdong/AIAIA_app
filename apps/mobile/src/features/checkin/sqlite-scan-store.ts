import type { PackMember } from '@aiaia/api';
import type { PackInfo, QueuedScan, ScanStore } from './scan-types';

/** The part of expo-sqlite's SQLiteDatabase this store uses, so tests can supply another engine. */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: (string | number | null)[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: (string | number | null)[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const SCHEMA = `
create table if not exists packs (
  owner text not null, event_id text not null, downloaded_at text not null,
  primary key (owner, event_id)
);
create table if not exists pack_members (
  owner text not null, event_id text not null, member_id text not null,
  full_name text not null, member_no text not null, branch_name text not null,
  age_group text not null, pass_version integer not null, photo_path text,
  guardian_names text not null,
  primary key (owner, event_id, member_id)
);
create table if not exists scans (
  client_ref text primary key, owner text not null, event_id text not null,
  member_id text not null, pass_version integer not null, scanned_at text not null,
  walk_in integer not null, status text not null, reason text,
  full_name text, branch_name text
);
create index if not exists scans_by_member on scans (owner, event_id, member_id);
`;

type MemberRow = Omit<PackMember, 'guardian_names'> & { guardian_names: string };

function parseNames(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

type ScanRow = Omit<QueuedScan, 'walk_in'> & { walk_in: number };
const toScan = (r: ScanRow): QueuedScan => ({ ...r, walk_in: r.walk_in === 1 });

/** The scan store on SQLite. Creates the tables if needed; every query is scoped to `owner`. */
export async function createSqliteScanStore(db: SqlDb, owner: string): Promise<ScanStore> {
  await db.execAsync(SCHEMA);

  return {
    async savePack(eventId, rows, downloadedAt) {
      await db.withTransactionAsync(async () => {
        await db.runAsync('delete from pack_members where owner = ? and event_id = ?', [
          owner,
          eventId,
        ]);
        for (const m of rows) {
          await db.runAsync(
            'insert or replace into pack_members (owner, event_id, member_id, full_name, member_no, branch_name, age_group, pass_version, photo_path, guardian_names) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              owner,
              eventId,
              m.member_id,
              m.full_name,
              m.member_no,
              m.branch_name,
              m.age_group,
              m.pass_version,
              m.photo_path,
              JSON.stringify(m.guardian_names),
            ],
          );
        }
        await db.runAsync(
          'insert or replace into packs (owner, event_id, downloaded_at) values (?, ?, ?)',
          [owner, eventId, downloadedAt],
        );
      });
    },

    async packInfo(eventId): Promise<PackInfo | null> {
      const head = await db.getFirstAsync<{ downloaded_at: string }>(
        'select downloaded_at from packs where owner = ? and event_id = ?',
        [owner, eventId],
      );
      if (!head) return null;
      const n = await db.getFirstAsync<{ n: number }>(
        'select count(*) as n from pack_members where owner = ? and event_id = ?',
        [owner, eventId],
      );
      return { downloadedAt: head.downloaded_at, count: n?.n ?? 0 };
    },

    async findMember(eventId, memberId) {
      const r = await db.getFirstAsync<MemberRow>(
        'select member_id, full_name, member_no, branch_name, age_group, pass_version, photo_path, guardian_names from pack_members where owner = ? and event_id = ? and member_id = ?',
        [owner, eventId, memberId],
      );
      return r ? { ...r, guardian_names: parseNames(r.guardian_names) } : null;
    },

    async addScan(s) {
      await db.runAsync(
        'insert or ignore into scans (client_ref, owner, event_id, member_id, pass_version, scanned_at, walk_in, status, reason, full_name, branch_name) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          s.client_ref,
          owner,
          s.event_id,
          s.member_id,
          s.pass_version,
          s.scanned_at,
          s.walk_in ? 1 : 0,
          s.status,
          s.reason,
          s.full_name,
          s.branch_name,
        ],
      );
    },

    async findScan(eventId, memberId) {
      const r = await db.getFirstAsync<ScanRow>(
        "select * from scans where owner = ? and event_id = ? and member_id = ? and status <> 'rejected' order by scanned_at limit 1",
        [owner, eventId, memberId],
      );
      return r ? toScan(r) : null;
    },

    async listScans(eventId, limit = 50) {
      const rows = await db.getAllAsync<ScanRow>(
        'select * from scans where owner = ? and event_id = ? order by scanned_at desc, rowid desc limit ?',
        [owner, eventId, limit],
      );
      return rows.map(toScan);
    },

    async pendingScans(eventId) {
      const rows = await db.getAllAsync<ScanRow>(
        "select * from scans where owner = ? and event_id = ? and status = 'pending' order by scanned_at, rowid",
        [owner, eventId],
      );
      return rows.map(toScan);
    },

    async applyResults(accepted, rejected) {
      await db.withTransactionAsync(async () => {
        for (const ref of accepted) {
          await db.runAsync(
            "update scans set status = 'accepted', reason = null where owner = ? and client_ref = ?",
            [owner, ref],
          );
        }
        for (const r of rejected) {
          await db.runAsync(
            "update scans set status = 'rejected', reason = ? where owner = ? and client_ref = ?",
            [r.reason, owner, r.client_ref],
          );
        }
      });
    },

    async clearForSignOut() {
      await db.withTransactionAsync(async () => {
        await db.runAsync('delete from pack_members where owner = ?', [owner]);
        await db.runAsync('delete from packs where owner = ?', [owner]);
        await db.runAsync("delete from scans where owner = ? and status <> 'pending'", [owner]);
        // What stays is only waiting to be uploaded: ids and times, no names.
        await db.runAsync('update scans set full_name = null, branch_name = null where owner = ?', [
          owner,
        ]);
      });
    },
  };
}
