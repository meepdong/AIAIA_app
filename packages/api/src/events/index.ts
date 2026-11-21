import type { Database } from '@aiaia/shared';
import type { Client } from '../index';

type Tables = Database['public']['Tables'];
type Fns = Database['public']['Functions'];

export type EventRow = Tables['events']['Row'];
export type RsvpRow = Tables['rsvps']['Row'];

/** What `rsvps.status` and the `rsvp` RPC return. The RPC accepts only `going` or `cancelled`. */
export type RsvpStatus = 'going' | 'waitlisted' | 'cancelled';
export type EventSpots = Fns['event_spots']['Returns'][number];
export type EventDuty = Fns['my_event_duties']['Returns'][number];
export type EventDependent = Fns['my_dependents']['Returns'][number];
export type EventAttendee = Fns['event_attendees']['Returns'][number];
export type EventTeamMember = Fns['event_team']['Returns'][number];

export type EventAudience = Database['public']['Enums']['audience'];

/** The fields an officer sets on an event. `created_by` is added by `createEvent`. */
export type EventInput = {
  scope: 'national' | 'branch';
  /** Required for `branch`, must be null for `national` (a table check). */
  branch_id: string | null;
  audience: EventAudience;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  venue_name: string | null;
  venue_address: string | null;
  /** The table allows only https links. */
  map_url: string | null;
  capacity: number | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
};

/** What an update may carry: any input field plus the lifecycle status. */
export type EventPatch = Partial<EventInput> & { status?: 'draft' | 'published' | 'cancelled' };

/** A member found by `searchMembers`. Contact details are dropped on purpose. */
export type MemberHit = { id: string; full_name: string; branch_name: string };
export type BranchOption = { id: string; name: string };

export type EventCapability = 'check_in' | 'collect_payments' | 'safety_lead';

export type ListEventsOptions = {
  /** `upcoming` = not yet ended, soonest first. `past` = ended, latest first. */
  when: 'upcoming' | 'past';
  /** `national` = scope national. `branch` = the caller's branch events. */
  scope?: 'all' | 'national' | 'branch';
  /** A wing shows events for that wing and events for everyone. */
  wing?: 'all' | 'youth' | 'aiaia';
  limit?: number;
};

export type EventsMember = { id: string; branch_id: string; wing: string; full_name: string };

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/**
 * Events for members (list, detail, spots, RSVP, duties) plus the officer reads
 * and event-team writes the admin screens use. RLS decides what each caller may see;
 * the filters here only narrow it.
 */
export function createEventsApi(client: Client) {
  return {
    /** The caller's own member row (id, branch and wing). Null when signed out or no profile. */
    async myMember(): Promise<EventsMember | null> {
      const id = unwrap(await client.rpc('current_member_id'));
      if (!id) return null;
      const row = unwrap(
        await client
          .from('members')
          .select('id, branch_id, wing, full_name')
          .eq('id', id)
          .maybeSingle(),
      );
      return row;
    },

    async listEvents(opts: ListEventsOptions): Promise<EventRow[]> {
      const now = new Date().toISOString();
      let q = client.from('events').select('*').in('status', ['published', 'cancelled']);
      q = opts.when === 'upcoming' ? q.gte('ends_at', now) : q.lt('ends_at', now);
      if (opts.scope === 'national') q = q.eq('scope', 'national');
      if (opts.scope === 'branch') q = q.eq('scope', 'branch');
      if (opts.wing && opts.wing !== 'all') q = q.in('audience', [opts.wing, 'all']);
      return unwrap(
        await q.order('starts_at', { ascending: opts.when === 'upcoming' }).limit(opts.limit ?? 50),
      );
    },

    async getEvent(id: string): Promise<EventRow | null> {
      return unwrap(await client.from('events').select('*').eq('id', id).maybeSingle());
    },

    /** Going and waitlisted counts per event. Capacity left is `capacity - going`. */
    async spots(eventIds: string[]): Promise<EventSpots[]> {
      if (eventIds.length === 0) return [];
      return unwrap(await client.rpc('event_spots', { event_ids: eventIds }));
    },

    /** RSVP rows for the caller and the wards the caller can see (`is_guardian_of`). */
    async rsvpsFor(memberIds: string[], eventIds?: string[]): Promise<RsvpRow[]> {
      if (memberIds.length === 0) return [];
      let q = client.from('rsvps').select('*').in('member_id', memberIds);
      if (eventIds) q = q.in('event_id', eventIds);
      return unwrap(await q);
    },

    /** RSVP `memberId` (the caller or one of their wards). Returns the resulting status. */
    async rsvp(
      eventId: string,
      memberId: string,
      status: 'going' | 'cancelled' = 'going',
    ): Promise<RsvpStatus> {
      const result = unwrap(
        await client.rpc('rsvp', { event_id: eventId, member_id: memberId, status }),
      );
      return result as RsvpStatus;
    },

    async myDuties(): Promise<EventDuty[]> {
      return unwrap(await client.rpc('my_event_duties'));
    },

    async myDependents(): Promise<EventDependent[]> {
      return unwrap(await client.rpc('my_dependents'));
    },

    // Officer reads and event-team writes (used by the admin screens).

    /** Officers only. Audited by the RPC. */
    async attendees(eventId: string): Promise<EventAttendee[]> {
      return unwrap(await client.rpc('event_attendees', { event_id: eventId }));
    },

    async team(eventId: string): Promise<EventTeamMember[]> {
      return unwrap(await client.rpc('event_team', { event_id: eventId }));
    },

    async setStaff(eventId: string, memberId: string, capabilities: EventCapability[]) {
      unwrap(
        await client.rpc('set_event_staff', {
          event_id: eventId,
          member_id: memberId,
          capabilities,
        }),
      );
    },

    /** Officers: every event their role can see, drafts included (RLS narrows it), newest first. */
    async listAdminEvents(limit = 100): Promise<EventRow[]> {
      return unwrap(
        await client
          .from('events')
          .select('*')
          .order('starts_at', { ascending: false })
          .limit(limit),
      );
    },

    /** `created_by` is set to the caller, as the insert policy requires. Starts as a draft. */
    async createEvent(input: EventInput): Promise<EventRow> {
      const me = unwrap(await client.rpc('current_member_id'));
      if (!me) throw new Error('Sign in to create an event');
      return unwrap(
        await client
          .from('events')
          .insert({ ...input, status: 'draft', created_by: me })
          .select('*')
          .single(),
      );
    },

    /**
     * Edits and lifecycle changes (`published`, `cancelled`). A row the caller cannot update comes
     * back empty, which `single()` reports as an error.
     */
    async updateEvent(id: string, patch: EventPatch): Promise<EventRow> {
      return unwrap(await client.from('events').update(patch).eq('id', id).select('*').single());
    },

    async listBranches(): Promise<BranchOption[]> {
      return unwrap(await client.from('branches').select('id, name').order('name'));
    },

    /** Member picker: `search_directory`, reduced to id, name and branch. */
    async searchMembers(q: string, branchId?: string | null, page = 1): Promise<MemberHit[]> {
      const rows = unwrap(
        await client.rpc('search_directory', {
          q,
          ...(branchId ? { branch_id: branchId } : {}),
          page,
        }),
      );
      return rows.map((r) => ({ id: r.id, full_name: r.full_name, branch_name: r.branch_name }));
    },

    async removeStaff(eventId: string, memberId: string): Promise<boolean> {
      return unwrap(
        await client.rpc('remove_event_staff', { event_id: eventId, member_id: memberId }),
      );
    },
  };
}

export type EventsApi = ReturnType<typeof createEventsApi>;
