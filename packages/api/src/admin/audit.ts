import type { Client } from '../index';
import { cleanSearchTerm } from './members';

export interface AuditFilters {
  /** actor_member_id */
  actorId?: string | null;
  /** Substring of the action, e.g. "role" or "settings.updated". */
  action?: string;
  /** Inclusive, YYYY-MM-DD in Asia/Kolkata. */
  from?: string | null;
  /** Inclusive, YYYY-MM-DD in Asia/Kolkata. */
  to?: string | null;
  /** Zero-based. */
  page?: number;
  pageSize?: number;
}

export interface AuditRow {
  id: number;
  created_at: string;
  actor_member_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: unknown;
}

export interface AuditPage {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const AUDIT_PAGE_SIZE = 25;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string | null | undefined): s is string {
  if (!s || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function nextDay(s: string): string {
  return new Date(new Date(`${s}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

export function createAuditApi(client: Client) {
  return {
    /** Newest first. Date bounds are whole IST days; a malformed date is ignored. */
    async listAuditLog(filters: AuditFilters = {}): Promise<AuditPage> {
      const page = Math.max(0, filters.page ?? 0);
      const pageSize = filters.pageSize ?? AUDIT_PAGE_SIZE;
      let q = client
        .from('audit_log')
        .select('id, created_at, actor_member_id, action, entity, entity_id, details', {
          count: 'exact',
        });
      if (filters.actorId) q = q.eq('actor_member_id', filters.actorId);
      const action = cleanSearchTerm(filters.action ?? '');
      if (action) q = q.ilike('action', `%${action}%`);
      if (isIsoDate(filters.from)) q = q.gte('created_at', `${filters.from}T00:00:00+05:30`);
      if (isIsoDate(filters.to)) q = q.lt('created_at', `${nextDay(filters.to)}T00:00:00+05:30`);
      const res = await q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (res.error) throw res.error;
      return { rows: (res.data ?? []) as AuditRow[], total: res.count ?? 0, page, pageSize };
    },

    /** Best effort: RLS may hide some members, whose ids simply stay unresolved. */
    async getMemberNames(ids: readonly string[]): Promise<Record<string, string>> {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return {};
      const res = await client.from('members').select('id, full_name').in('id', unique);
      if (res.error) throw res.error;
      return Object.fromEntries((res.data ?? []).map((m) => [m.id, m.full_name]));
    },
  };
}
