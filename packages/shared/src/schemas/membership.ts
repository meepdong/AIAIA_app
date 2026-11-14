// Payloads and results of the P1-00b membership RPCs (supabase/migrations/*_p1_00b_*.sql).
// Plain TS types: packages/shared has no zod dependency. The database validates every field.
// Errors: 42501 permission, 22023 bad argument, 23514 rule violation (e.g. not pending).

import type { Database } from '../db.types';

type Tables = Database['public']['Tables'];

/** Directory visibility keys in members.privacy. show_phone/show_email are opt-in; the rest opt-out. */
export interface PrivacyFlags {
  show_phone?: boolean;
  show_email?: boolean;
  show_city?: boolean;
  show_occupation?: boolean;
  show_photo?: boolean;
}

/**
 * submit_application(payload). The phone comes from the caller's confirmed login, never the payload.
 * Only a caller with no member row, or a pending one, may submit; under-14s are refused (23514).
 */
export interface SubmitApplicationPayload {
  full_name: string;
  /** ISO date (YYYY-MM-DD). */
  dob: string;
  branch_id: string;
  gender?: string | null;
  city?: string | null;
  occupation?: string | null;
  education?: string | null;
  email?: string | null;
  emergency_contact_name?: string | null;
  /** +<country><number>, e.g. +919000000001. */
  emergency_contact_phone?: string | null;
  /** Default false. */
  whatsapp_opt_in?: boolean;
  /** Default false. */
  email_updates_opt_in?: boolean;
  /** Unknown keys and non-boolean values are dropped. */
  privacy?: PrivacyFlags;
}

export interface SubmitApplicationResult {
  member_id: string;
  status: 'pending';
  wing: 'youth' | 'aiaia';
  /** An unclaimed roster entry has the caller's phone. Approval still stays human. */
  fast_track: boolean;
}

/**
 * approve_member(member_id, consent). Required for ages 14-17 with their own login; for a dependent
 * (no login, active guardian link) it is optional and only guardian_alerts is read (default false).
 */
export interface ApprovalConsent {
  method: 'paper_form' | 'phone_call' | 'in_person';
  guardian_name: string;
  guardian_phone: string;
  /** Guardian wants a WhatsApp alert when their child arrives at events. */
  guardian_alerts: boolean;
  document_path?: string | null;
}

export interface ApproveMemberArgs {
  member_id: string;
  consent?: ApprovalConsent | Pick<ApprovalConsent, 'guardian_alerts'> | null;
}

export interface ApproveMemberResult {
  member_id: string;
  status: 'active';
  /** AIAIA-Y-000123 (youth) or AIAIA-A-000123 (aiaia). */
  member_no: string;
  consent_record_id: string | null;
}

/** reject_member(member_id, reason): reason 1-500 characters. */
export interface RejectMemberArgs {
  member_id: string;
  reason: string;
}

export interface RejectMemberResult {
  member_id: string;
  status: 'rejected';
}

/** request_info(member_id, message): message 1-1000 characters; the member stays pending. */
export interface RequestInfoArgs {
  member_id: string;
  message: string;
}

export interface RequestInfoResult {
  member_id: string;
  status: 'pending';
  /** Notifications written: 1 for a member with a login, else one per active guardian. */
  notified: number;
}

export interface ProfileDependent {
  id: string;
  full_name: string;
  status: Database['public']['Enums']['member_status'];
  wing: 'youth' | 'aiaia';
  member_no: string | null;
  has_login: boolean;
  dob: string | null;
  relationship: string;
}

/** my_profile(): null when the caller has no member row. Works in any status (own rows only). */
export interface MyProfileResult {
  member: Tables['members']['Row'];
  private: Tables['member_private']['Row'] | null;
  dependents: ProfileDependent[];
}

// ---------------------------------------------------------------------------
// Blocking and roles (supabase/migrations/20261114000300_p1_00b_blocking_roles.sql)
// ---------------------------------------------------------------------------

/**
 * block_member(member_id, reason): members.block (super admins with a step-up, Enforcement
 * Committee). Only an active or pending member; never yourself; never the last super admin (23514).
 * Closes the member's open block requests.
 */
export interface BlockMemberArgs {
  member_id: string;
  /** 1-500 characters, stored in members.status_reason. */
  reason: string;
}

export interface BlockMemberResult {
  member_id: string;
  status: 'suspended';
  closed_block_requests: number;
}

/** unblock_member(member_id): members.block. Back to active if ever approved, else pending. */
export interface UnblockMemberArgs {
  member_id: string;
}

export interface UnblockMemberResult {
  member_id: string;
  status: 'active' | 'pending';
}

/**
 * request_block(member_id, reason): members.request_block (the Mentor). Files a high-priority
 * 'block_request' report and alerts every members.block holder. The status does not change.
 * One open request per member (23514).
 */
export interface RequestBlockArgs {
  member_id: string;
  /** 1-2000 characters, stored in reports.details. */
  reason: string;
}

export interface RequestBlockResult {
  report_id: string;
  member_id: string;
  /** Notifications written. */
  notified: number;
}

/**
 * assign_role(member_id, role_key, branch_id?, starts_on?, ends_on?): roles.assign; global-scope
 * roles (super_admin, mentor, enforcement_committee) also need system.config. The member must be
 * active; a branch role needs branch_id equal to the member's branch; national and global roles
 * take none. starts_on defaults to today (IST) and cannot be in the past. Overlapping terms of the
 * same role are refused (23514).
 */
export interface AssignRoleArgs {
  member_id: string;
  role_key: string;
  branch_id?: string | null;
  /** ISO date (YYYY-MM-DD). */
  starts_on?: string | null;
  /** ISO date (YYYY-MM-DD), inclusive. */
  ends_on?: string | null;
}

export interface AssignRoleResult {
  assignment_id: string;
  member_id: string;
  role_key: string;
  branch_id: string | null;
  starts_on: string;
  ends_on: string | null;
}

/**
 * end_role(assignment_id, ends_on?): same permission rule as assign_role. ends_on defaults to
 * yesterday (IST), so the role stops counting today, and cannot be earlier. An assignment that
 * would end before it starts is withdrawn (deleted, audited). The last super admin cannot be
 * removed (23514).
 */
export interface EndRoleArgs {
  assignment_id: string;
  /** ISO date (YYYY-MM-DD), inclusive. */
  ends_on?: string | null;
}

export interface EndRoleResult {
  assignment_id: string;
  /** Null when the assignment was withdrawn. */
  ends_on: string | null;
  withdrawn: boolean;
}

/**
 * add_dependent(payload): the caller must be active and 18+ (42501). The dependent is under 18,
 * has no login or phone, starts pending and joins the caller's branch unless branch_id is given.
 */
export interface AddDependentPayload {
  full_name: string;
  /** ISO date (YYYY-MM-DD); under 18 today. */
  dob: string;
  /** Default 'parent'; at most 40 characters. */
  relationship?: string | null;
  branch_id?: string | null;
  gender?: string | null;
  city?: string | null;
  education?: string | null;
}

export interface AddDependentResult {
  member_id: string;
  status: 'pending';
}

/**
 * create_claim_code(dependent_id): the dependent's guardian; the dependent is 14+, has no login and
 * is active or pending. Replaces any unused earlier code. Only the sha256 is stored.
 */
export interface CreateClaimCodeArgs {
  dependent_id: string;
}

export interface CreateClaimCodeResult {
  /** 8 characters from A-Z and 2-9 (no 0, O, 1 or I); case-insensitive when redeemed. */
  code: string;
  /** Seven days from creation. */
  expires_at: string;
}

/**
 * graduate_dependent(code): a signed-in caller with a confirmed phone and no member row. At 18+ the
 * guardian links end ('claimed') and give_adult_consent is due; at 14-17 the links stay.
 */
export interface GraduateDependentArgs {
  code: string;
}

/**
 * A wrong or expired code returns `{ ok: false, error: 'invalid_code' }` and counts as a miss. After
 * 5 misses in an hour, or 20 in 24 hours, the call raises SQLSTATE PT429 (HTTP 429) before the code
 * is checked.
 */
export type GraduateDependentResult =
  | {
      ok: true;
      member_id: string;
      status: Tables['members']['Row']['status'];
      adult_consent_required: boolean;
      guardian_links_ended: boolean;
    }
  | { ok: false; error: 'invalid_code' };

/** my_dependents(): one row per current ward (active link and is_guardian_of). */
export interface MyDependentRow {
  member_id: string;
  full_name: string;
  status: Tables['members']['Row']['status'];
  wing: 'youth' | 'aiaia';
  member_no: string | null;
  branch_id: string;
  dob: string | null;
  relationship: string;
  has_login: boolean;
  /** Expiry of the newest unused, unexpired claim code, if any. */
  claim_code_expires_at: string | null;
}

/**
 * delete_my_account(): refused (23514) while a current dependent has no other active guardian, or
 * when the caller is the last super admin. Ends the caller's guardian links and cancels pending
 * transfers they asked for or that concern them.
 */
export interface DeleteMyAccountResult {
  member_id: string;
  status: 'deleted';
}

/**
 * give_adult_consent(payload): the caller, while members.adult_consent_required is set.
 * show_phone and show_email reset to false unless given as true.
 */
export interface GiveAdultConsentPayload {
  whatsapp_opt_in: boolean;
  email_updates_opt_in: boolean;
  privacy?: PrivacyFlags;
}

export interface GiveAdultConsentResult {
  member_id: string;
  consent_record_id: string;
  privacy: PrivacyFlags;
}

/** daily_age_transitions(): pg_cron only (01:00 IST). Counts of members changed in this run. */
export interface DailyAgeTransitionsResult {
  wing_changes: number;
  grace_expired: number;
  turned_18_with_login: number;
  turned_18_without_login: number;
}

/**
 * request_branch_transfer(member_id, to_branch_id, reason?, note?): the active member or an active
 * guardian; one pending request per member. reason and note are at most 1000 characters.
 */
export interface RequestBranchTransferArgs {
  member_id: string;
  to_branch_id: string;
  reason?: string | null;
  note?: string | null;
}

export interface RequestBranchTransferResult {
  transfer_id: string;
  status: 'pending';
  /** To-branch officers notified. */
  notified: number;
}

/**
 * decide_branch_transfer(id, approve, note?): members.approve for the to-branch; nobody decides
 * their own transfer. Approval moves the member and ends their branch roles in the old branch.
 */
export interface DecideBranchTransferArgs {
  id: string;
  approve: boolean;
  note?: string | null;
}

export interface DecideBranchTransferResult {
  transfer_id: string;
  status: 'approved' | 'rejected';
  roles_ended: number;
}

/** cancel_branch_transfer(id): the requester, while pending. */
export interface CancelBranchTransferArgs {
  id: string;
}

export interface CancelBranchTransferResult {
  transfer_id: string;
  status: 'cancelled';
}
