import type { Client } from '../index';

export const MEMBER_STATUSES = ['pending', 'active', 'suspended', 'rejected', 'deleted'] as const;
export const WINGS = ['youth', 'aiaia'] as const;

export interface DashboardBranchCount {
  branchId: string;
  code: string;
  name: string;
  active: number;
}

export interface DashboardEvent {
  id: string;
  title: string;
  starts_at: string;
  venue_name: string | null;
  branch_id: string | null;
}

export interface DashboardData {
  /** Head counts per status; RLS limits them to the members the caller may see. */
  byStatus: Record<(typeof MEMBER_STATUSES)[number], number>;
  /** Active members per wing. */
  byWing: Record<(typeof WINGS)[number], number>;
  /** Active members per branch (branches with at least one visible active member). */
  byBranch: DashboardBranchCount[];
  pending: number;
  /** Null when the caller does not hold `reports.review`: the query is not even sent. */
  openReports: number | null;
  upcomingEvents: DashboardEvent[];
}

async function headCount(
  run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const res = await run();
  if (res.error) throw res.error;
  return res.count ?? 0;
}

export function createDashboardApi(client: Client) {
  const members = () => client.from('members').select('id', { count: 'exact', head: true });

  return {
    async getDashboard(opts: { canReviewReports: boolean; now?: Date }): Promise<DashboardData> {
      const nowIso = (opts.now ?? new Date()).toISOString();

      const branches = await client.from('branches').select('id, code, name').order('code');
      if (branches.error) throw branches.error;
      const branchRows = branches.data ?? [];

      const [statusCounts, wingCounts, branchCounts, openReports, events] = await Promise.all([
        Promise.all(MEMBER_STATUSES.map((s) => headCount(() => members().eq('status', s)))),
        Promise.all(
          WINGS.map((w) => headCount(() => members().eq('status', 'active').eq('wing', w))),
        ),
        Promise.all(
          branchRows.map((b) =>
            headCount(() => members().eq('status', 'active').eq('branch_id', b.id)),
          ),
        ),
        opts.canReviewReports
          ? headCount(() =>
              client
                .from('reports')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'open'),
            )
          : Promise.resolve(null),
        client
          .from('events')
          .select('id, title, starts_at, venue_name, branch_id')
          .eq('status', 'published')
          .gt('starts_at', nowIso)
          .order('starts_at', { ascending: true })
          .limit(5),
      ]);
      if (events.error) throw events.error;

      const byStatus = Object.fromEntries(
        MEMBER_STATUSES.map((s, i) => [s, statusCounts[i] ?? 0]),
      ) as DashboardData['byStatus'];
      const byWing = Object.fromEntries(
        WINGS.map((w, i) => [w, wingCounts[i] ?? 0]),
      ) as DashboardData['byWing'];
      const byBranch = branchRows
        .map((b, i) => ({
          branchId: b.id,
          code: b.code,
          name: b.name,
          active: branchCounts[i] ?? 0,
        }))
        .filter((b) => b.active > 0);

      return {
        byStatus,
        byWing,
        byBranch,
        pending: byStatus.pending,
        openReports,
        upcomingEvents: events.data ?? [],
      };
    },
  };
}
