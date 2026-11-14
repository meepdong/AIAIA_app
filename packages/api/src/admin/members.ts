import type { Database } from '@aiaia/shared';
import type { Client } from '../index';

type MemberStatus = Database['public']['Enums']['member_status'];
export type ExportRow = Database['public']['Functions']['admin_export_members']['Returns'][number];

export interface MemberListFilters {
  search?: string;
  status?: MemberStatus | null;
  branchId?: string | null;
  wing?: string | null;
  /** Zero-based. */
  page?: number;
  pageSize?: number;
}

export interface MemberListRow {
  id: string;
  member_no: string | null;
  full_name: string;
  wing: string;
  status: MemberStatus;
  city: string | null;
  branch_id: string;
  branches: { code: string; name: string } | null;
}

export interface MemberListPage {
  rows: MemberListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const MEMBERS_PAGE_SIZE = 25;
export const EXPORT_PAGE_SIZE = 500;

/** Drops the characters that mean something inside a PostgREST `or()` filter or an ILIKE pattern. */
export function cleanSearchTerm(raw: string): string {
  return raw
    .replace(/[%_*,()\\"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DETAIL_COLUMNS =
  'id, member_no, full_name, wing, status, city, gender, branch_id, approved_at, status_reason, status_changed_at, created_at, branches(code, name)';

export function createMembersApi(client: Client) {
  return {
    async listBranches(): Promise<{ id: string; code: string; name: string }[]> {
      const res = await client.from('branches').select('id, code, name').order('name');
      if (res.error) throw res.error;
      return res.data ?? [];
    },

    async listMembers(filters: MemberListFilters = {}): Promise<MemberListPage> {
      const page = Math.max(0, filters.page ?? 0);
      const pageSize = filters.pageSize ?? MEMBERS_PAGE_SIZE;
      let q = client
        .from('members')
        .select('id, member_no, full_name, wing, status, city, branch_id, branches(code, name)', {
          count: 'exact',
        });
      const term = cleanSearchTerm(filters.search ?? '');
      if (term) q = q.or(`full_name.ilike.%${term}%,member_no.ilike.%${term}%`);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.branchId) q = q.eq('branch_id', filters.branchId);
      if (filters.wing) q = q.eq('wing', filters.wing);
      const res = await q
        .order('full_name', { ascending: true })
        .order('id', { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (res.error) throw res.error;
      return { rows: (res.data ?? []) as MemberListRow[], total: res.count ?? 0, page, pageSize };
    },

    /** Profile fields only. Phone, DOB and email live in member_private and are not read here. */
    async getMember(id: string) {
      const res = await client.from('members').select(DETAIL_COLUMNS).eq('id', id).maybeSingle();
      if (res.error) throw res.error;
      return res.data;
    },

    /** Guardian phone numbers are deliberately not selected: the page does not need them. */
    async listConsentRecords(memberId: string) {
      const res = await client
        .from('consent_records')
        .select('id, method, attested_at, guardian_name, guardian_alerts, document_path')
        .eq('member_id', memberId)
        .order('attested_at', { ascending: false });
      if (res.error) throw res.error;
      return res.data ?? [];
    },

    async listStatusEvents(memberId: string) {
      const res = await client
        .from('member_status_events')
        .select('id, from_status, to_status, reason, created_at')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      return res.data ?? [];
    },

    async setMemberBranch(memberId: string, toBranchId: string): Promise<void> {
      const res = await client.rpc('admin_set_member_branch', {
        member_id: memberId,
        to_branch_id: toBranchId,
      });
      if (res.error) throw res.error;
    },

    /**
     * Pages through `admin_export_members` until a page comes back shorter than `pageSize`,
     * using the last `member_id` as the cursor. `branchId: null` is the national export.
     * Rows are never logged; the server audits each page.
     */
    async exportMembers(opts: {
      branchId: string | null;
      pageSize?: number;
      onPage?: (rowsSoFar: number) => void;
    }): Promise<ExportRow[]> {
      const pageSize = opts.pageSize ?? EXPORT_PAGE_SIZE;
      const all: ExportRow[] = [];
      let after: string | undefined;
      for (;;) {
        const res = await client.rpc('admin_export_members', {
          page_size: pageSize,
          ...(opts.branchId ? { branch_id: opts.branchId } : {}),
          ...(after ? { after } : {}),
        });
        if (res.error) throw res.error;
        const page = res.data ?? [];
        all.push(...page);
        opts.onPage?.(all.length);
        if (page.length < pageSize) break;
        after = page[page.length - 1]?.member_id;
      }
      return all;
    },
  };
}
