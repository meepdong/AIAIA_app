// P1-00c content and operations RPC shapes shared by the app and the admin console.

/**
 * Flags in `members.privacy`. Contact flags are off unless explicitly true, and never apply to a
 * minor. Profile flags are on unless explicitly false.
 */
export type MemberPrivacy = {
  show_phone?: boolean;
  show_email?: boolean;
  show_city?: boolean;
  show_occupation?: boolean;
  show_photo?: boolean;
};

export const DIRECTORY_PAGE_SIZE = 25;

/** Arguments of `search_directory(q, branch_id, page)`; `page` starts at 1. */
export type SearchDirectoryArgs = {
  q?: string | null;
  branch_id?: string | null;
  page?: number;
};

/** One row of `search_directory`. Masked fields come back as null. */
export type DirectoryEntry = {
  id: string;
  full_name: string;
  branch_name: string;
  city: string | null;
  occupation: string | null;
  photo_path: string | null;
  phone: string | null;
  email: string | null;
};

/** Arguments of `publish_announcement(id, notify)`; it returns the number of notifications created. */
export type PublishAnnouncementArgs = {
  id: string;
  notify?: boolean;
};

export type PushPlatform = 'android' | 'ios' | 'web';

/** Web Push subscription as the browser's `PushSubscription.toJSON()` returns it. */
export type WebPushSubscription = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  expirationTime?: number | null;
};

/**
 * Arguments of `register_push_token(token, platform, subscription)`. Native platforms send a
 * `token`; `web` sends a `subscription` and no token. Returns the push_tokens row id.
 */
export type RegisterPushTokenArgs =
  | { token: string; platform: 'android' | 'ios'; subscription?: null }
  | { token: null; platform: 'web'; subscription: WebPushSubscription };

/** `submit_report` refuses `block_request` (made only by `request_block`). */
export const RESERVED_REPORT_REASONS = ['block_request'] as const;
export const REPORTS_PER_DAY = 20;
/** SQLSTATE of the report rate limit; PostgREST answers it with HTTP 429. */
export const REPORT_RATE_LIMIT_CODE = 'PT429';

/** Arguments of `submit_report(target_type, target_id, reason, details)`; returns the report id. */
export type SubmitReportArgs = {
  target_type: string;
  target_id: string;
  /** Free text, 1-100 characters. `safety_minor` alerts the enforcement committee at high priority. */
  reason: string;
  details?: string | null;
};

export type ReportAction = 'dismiss' | 'warn' | 'remove_content' | 'block';

/** Arguments of `review_report(id, action, note)`. */
export type ReviewReportArgs = {
  id: string;
  action: ReportAction;
  note?: string | null;
};

export type RsvpStatus = 'going' | 'waitlisted' | 'cancelled';

/**
 * Arguments of `rsvp(event_id, member_id, status)`: the caller's own id, or a ward's on an active
 * guardian link. Clients send `going` or `cancelled`; it returns the resulting status, which is
 * `waitlisted` when the event is full.
 */
export type RsvpArgs = {
  event_id: string;
  member_id: string;
  status: 'going' | 'cancelled';
};

export const EVENT_STAFF_CAPABILITIES = ['check_in', 'collect_payments', 'safety_lead'] as const;
export type EventStaffCapability = (typeof EVENT_STAFF_CAPABILITIES)[number];

/** Arguments of `set_event_staff(event_id, member_id, capabilities)`. */
export type SetEventStaffArgs = {
  event_id: string;
  member_id: string;
  capabilities: EventStaffCapability[];
};

export type AgeGroup = 'adult' | '14-17' | 'under-14';

/** One row of `event_pack(event_id)`: a going registrant, as a check-in device stores it offline. */
export type EventPackEntry = {
  member_id: string;
  full_name: string;
  member_no: string | null;
  branch_name: string;
  age_group: AgeGroup;
  pass_version: number;
  photo_path: string | null;
  guardian_names: string[];
};

export const CHECK_IN_SYNC_MAX_ROWS = 500;

/** One offline scan sent to `sync_check_ins(event_id, rows)`. */
export type CheckInScan = {
  client_ref: string;
  member_id: string;
  pass_version: number;
  /** ISO timestamp; the server's time is used when absent. */
  scanned_at?: string;
  walk_in?: boolean;
};

export type CheckInRejectReason =
  'invalid_row' | 'invalid_scanned_at' | 'client_ref_conflict' | 'member_not_active' | 'stale_pass';

/** Result of `sync_check_ins`. Accepted refs may be re-sent safely. */
export type CheckInSyncResult = {
  accepted: string[];
  rejected: { client_ref: unknown; reason: CheckInRejectReason }[];
};

/** Result of `verify_member_id(member_id, pass_version)`. Never carries a phone, DOB or email. */
export type MemberIdVerification = {
  valid: boolean;
  current_pass: boolean;
  full_name: string | null;
  photo_path: string | null;
  member_no: string | null;
  home_branch: string | null;
  wing: 'youth' | 'aiaia' | null;
  status: 'pending' | 'active' | 'rejected' | 'suspended' | 'deleted' | null;
  member_since: string | null;
  is_minor: boolean | null;
};

/**
 * One row of the `member_cards` view: how active members see each other (the `members` table
 * shows only the caller's own row, or full rows to approvers). Masked fields come back as null;
 * non-active callers see no rows.
 */
export type MemberCard = {
  id: string;
  full_name: string;
  branch_id: string;
  wing: 'youth' | 'aiaia';
  member_no: string | null;
  city: string | null;
  occupation: string | null;
  photo_path: string | null;
};

export const ROSTER_IMPORT_MAX_ROWS = 1000;

/**
 * One paper-roster row sent to `import_roster(rows)`. The caller needs `roster.import` for every
 * row's branch. Phones may contain spaces, dashes or brackets; they are stored as E.164 and are the
 * dedupe key.
 */
export type RosterImportRow = {
  branch_id: string;
  full_name: string;
  phone?: string | null;
  /** `YYYY-MM-DD`. */
  dob?: string | null;
  member_no?: string | null;
  notes?: string | null;
};

/**
 * Result of `import_roster`. A known phone updates its unclaimed row when the caller may import
 * into that row's branch; a claimed row, or one in another branch, is skipped.
 */
export type RosterImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
};
