# Phase 1 — Getting everyone in (testers only)

These briefs use the same block structure as Phase 0. Rules live in `AGENTS.md` and `01-architecture.md`. All users in Phases 1–2 are testers, so fixtures and test numbers are fine everywhere.

**Order:**
1. `P1-00a`, with `P1-09` running alongside.
2. `P1-00b` ∥ `P1-00c`.
3. Feature briefs, in the waves listed in `03-roadmap.md`.
4. `P1-10`, last.

Every brief that touches the DB runs `pnpm db:reset && pnpm db:test`. Each brief adds seed data only in `supabase/seeds/<brief-id>.sql`.

---

<a id="p1-00a"></a>
## P1-00a Phase-1 tables + RLS

- **Size:** M
- **Maker:** Opus (`schema-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P0-01, P0-02
- **Parallel with:** P1-09 only
- **Owner gates:** none

**Owns:** `supabase/migrations/*_p1_00a_*.sql`, `supabase/tests/p1_00a_*.test.sql`, `supabase/seeds/p1-00a.sql`, `packages/shared/src/db.types.ts`

**Must**
1. **Tables.** Create these, with columns as in `01-architecture.md §6` unless given here:
   - `consent_records`, `dependent_claims`, `roster_entries`
   - `push_tokens` (platform `android | ios | web`; web tokens store the Web Push subscription JSON)
   - `notifications`, `notification_deliveries`
   - `announcements(…, scope, branch_id, audience, title, body, image_path, pinned, published_at, hidden_at, author_member_id)`
   - `events(…, scope, branch_id, audience, title, description, starts_at, ends_at, venue_name, venue_address, map_url, cover_path, capacity, registration_opens_at, registration_closes_at, status, hidden_at, created_by)`
   - `rsvps`
   - `event_staff`, `check_ins` (with `source`, `walk_in`, `client_ref`; one per member per event)
   - `branch_transfers`
   - `member_no_seq` (sequence for `members.member_no`)
   - `reports`, `admin_step_ups` (with `source`), `admin_trusted_devices`, `email_verifications`
   - `otp_throttle(phone_hash text, sent_at timestamptz)` (written only by the service role)
   - `app_settings`, with defaults in the seed:
     - grievance officer placeholder
     - `step_up_roles = ['super_admin']`
     - `trusted_device_days = null` (null means devices never expire; owner decision: verify once per device)
     - `email_daily_cap = 2000`
     - `adult_handover_grace_days = 90`
     - `min_app_version`
     - `retention_months = 6`
2. **`has_permission` update.**
   - If the granting assignment's role is listed in `app_settings.step_up_roles`, it counts only when `public.has_step_up()` is true.
   - `has_step_up()` is true when an `admin_step_ups` row exists for `auth.jwt()->>'session_id'` with `expires_at IS NULL OR expires_at > now()`. Rows are written with NULL, meaning valid for the life of the session.
3. **RLS policies.**
   - `announcements` / `events`:
     - Active members select published, non-hidden rows that are national or in their own branch, whose `audience` matches their wing (or is `all`).
     - Officers also see drafts and hidden rows in their scope.
     - Writes need `announcements.*` / `events.*` for the scope.
   - `rsvps`:
     - Members select their own, their dependents', and the scope officer's.
     - No direct writes.
   - `notifications`: select own (plus own dependents'). Update only `read_at`.
   - `push_tokens`: own.
   - `consent_records`: approvers of that member, plus the guardian.
   - `reports`:
     - The reporter can see their own reports' **status only**.
     - `reports.review` sees all.
     - Insert via RPC only.
   - `admin_step_ups`, `admin_trusted_devices`, `email_verifications`, `otp_throttle`: no client access (service role only).
   - `check_ins`: select for the event's scope officers, its staff (`check_in` or `safety_lead`), the member, and their **active** guardians. Writes go through RPCs only.
   - `event_staff`: select for the event's scope officers and the staff member. Writes go through RPCs only.
   - `branch_transfers`: select for the member, their active guardians, and officers with `members.approve` for the from- or to-branch. Writes go through RPCs only.
4. **Seed** (`seeds/p1-00a.sql`). Roles were already seeded in P0-02, so this file adds only:
   - The app settings.
   - Fake events and announcements: national, branch A, branch B, and one with audience `aiaia`.
   - An `admin_step_ups` row helper for tests.
5. **pgTAP** (`p1_00a_*.test.sql`):
   - Pending users see no announcements, events or rsvps.
   - Branch-A members don't see branch-B content; national content is visible to all.
   - A youth member doesn't see `audience = 'aiaia'` content.
   - Hidden rows are invisible to members but visible to scope officers.
   - A super admin **without** a step-up row fails `has_permission('roles.assign')`.
   - A super admin passes with a row whose `expires_at` is NULL.
   - A row belonging to a **different** session id fails.
   - Reporters can't read others' reports.
   - Staff of event X see check-ins for X only.
   - A guardian whose link has ended sees none of the former ward's check-ins.
   - Nobody can read `otp_throttle`.

**Gates**
- G1 — CHECK: `pnpm db:reset && pnpm db:test` — EXPECT: `All tests successful.`
- G2 Step-up enforcement is pinned — CHECK: make `has_step_up()` return true, then reset and test — EXPECT: the `p1_00a_step_up` test fails (restore afterwards)
- G3 Audience filter is pinned — CHECK: drop the audience condition from the events policy, then reset and test — EXPECT: `p1_00a_content` fails (restore afterwards)
- G4 — CHECK: `pnpm db:types && pnpm typecheck && pnpm check:seed` — EXPECT: exit 0 and `seed OK`

---

<a id="p1-00b"></a>
## P1-00b Membership & roles RPCs

- **Size:** M
- **Maker:** Opus (`schema-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-00a
- **Parallel with:** P1-00c
- **Owner gates:** none

**Owns:** `supabase/migrations/*_p1_00b_*.sql`, `supabase/tests/p1_00b_*.test.sql`, `supabase/seeds/p1-00b.sql`, `packages/shared/src/schemas/membership.ts`

**Must**

All functions below are `security definer`, with `search_path = ''`, a `has_permission` check and `write_audit`.

1. **Applications and dependents**
   - **`submit_application(payload)`**
     - Creates or updates the caller's `members` + `member_private` rows as `pending`.
     - Sets `wing` from the DOB.
     - Marks a roster match with `{fast_track: true}`. Approval itself always stays human.
   - **`add_dependent(payload)`**
     - The caller must be **active and 18+**.
     - Creates the dependent plus a guardian link.
   - **`create_claim_code(dependent_id)`**
     - The caller must be the dependent's guardian.
     - Returns a 6-character code (only the hash is stored) that expires in 7 days.
   - **`graduate_dependent(code)`**
     - Attaches the caller's `user_id` and phone to the dependent.
     - The dependent must be 14 or older.
     - If they are 18 or older: the guardian link ends (`claimed`) and `adult_consent_required` is set.
2. **Approval decisions**
   - **`approve_member(member_id, consent jsonb null)`**
     - Requires `members.approve` for the member's branch.
     - **Wing `aiaia`** applicants need a national, mentor or super-admin approver.
     - **Ages 14–17 with their own account** need a `consent` object, which is written to `consent_records`.
     - **Dependents** have consent recorded as `guardian_account`.
     - Assigns `member_no` from `member_no_seq` (format `AIAIA-Y-000123`; never reused).
     - The `consent` object includes `guardian_alerts` (whether the guardian wants WhatsApp check-in alerts).
     - Writes `member_status_events` and a high-priority notification (to the guardian for a dependent).
   - **`reject_member(member_id, reason)`** and **`request_info(member_id, message)`**.
3. **Blocking**
   - **`block_member(member_id, reason)`** and **`unblock_member(member_id)`**.
   - Both require `members.block`, which only super admins and the Enforcement Committee hold.
   - Blocking sets status `suspended` and `status_reason`. The session revoke happens in P1-11's function.
   - Blocking a member who has an open block request closes that request.
   - **`request_block(member_id, reason)`** requires `members.request_block` (the Mentor). It does not change the member's status. It:
     - creates a `reports` row with reason `block_request`, top priority, and the requester recorded
     - sends high-priority notifications to every Enforcement Committee member and every super admin
     - writes `audit_log`
4. **Roles**
   - **`assign_role(...)`** and **`end_role(...)`**.
   - Both require `roles.assign`.
   - Removing the last `super_admin` is blocked.
5. **Self-service**
   - **`my_profile()`**: returns the caller's `members` + `member_private`, plus their dependents.
   - **`my_dependents()`**.
   - **`delete_my_account()`**:
     - Sets status `deleted` and `status_changed_at`.
     - The caller must have no active dependents without another guardian.
6. **Daily age transitions**
   - **`daily_age_transitions()`**, called by a nightly pg_cron job at 01:00 IST:
     - **Turned 35:** moves the member to wing `aiaia`, with reason `wing_change`.
     - **Turned 18, with their own login:**
       - Ends every active guardian link (`ended_reason 'turned_18'`).
       - Sets `adult_consent_required = true`.
       - Notifies the member: "You're 18. Your account is now yours. Please review and give your consent."
       - Notifies the former guardians.
     - **Turned 18, dependent without a login:** notifies the guardian and branch officers to set up the member's own login.
     - **Dependents past the grace period:** on later nights, ends the links of any dependent still without a login once their 18th birthday + `adult_handover_grace_days` has passed.
     - Writes `member_status_events` for each change. It is idempotent if it is run twice in a day.
   - **`give_adult_consent(payload)`**
     - The caller must be the member, with the flag set.
     - `payload` holds privacy flags, WhatsApp and email opt-ins.
     - Writes `consent_records` (method `self_adult`), clears the flag and sets `adult_consent_at`.
7. **Branch transfers**
   - **`request_branch_transfer(member_id, to_branch_id, reason, note)`**
     - The caller must be the member, or an active guardian of the member.
     - One pending request at a time.
     - Notifies the to-branch officers (high priority).
   - **`decide_branch_transfer(id, approve, note)`**
     - Requires `members.approve` for the **to**-branch.
     - On approval:
       - updates `branch_id`
       - writes `member_status_events` (reason `branch_transfer`)
       - notifies the member and the from-branch officers
   - **`cancel_branch_transfer(id)`**: requester only.
8. **pgTAP** must cover:
   - **Approval scope**
     - Branch president A approving A ✓; approving B ✗.
     - National approving anyone ✓; a member approving anyone ✗.
   - **Consent**
     - A 16-year-old can't be approved without consent ✗, and can with it ✓ (the consent row exists).
   - **Wing and blocking**
     - A 36-year-old applicant can't be approved by a branch president ✗; a national approver can ✓.
     - `block_member` by a national president ✗; by the **mentor** ✗; by `enforcement_committee` ✓; by a super admin with step-up ✓.
     - `request_block` by the mentor ✓. It creates a top-priority `block_request` report, and the target's status stays `active`.
     - `request_block` by a branch president ✗.
   - **Dependents**
     - `add_dependent` by a pending caller ✗; by an active 17-year-old ✗; by an active adult ✓.
   - **Roles and wing upkeep**
     - Removing the last super admin ✗.
     - `daily_age_transitions` moves a seed member whose 35th birthday is today.
   - **18th birthday**
     - **The seed member who turns 18 today:**
       - the guardian link has ended
       - `adult_consent_required` is true
       - the former guardian now reads **zero** `member_private` rows for them
     - Running the job twice changes nothing more.
     - `give_adult_consent` clears the flag and writes a `self_adult` consent record.
     - **The dependent past the grace period:** the link has ended.
   - **Branch transfers**
     - Approval by a to-branch officer ✓.
     - Approval by a from-branch officer ✗; by the member ✗.
     - Approval changes the branch.
   - **Member numbers**
     - Two approvals produce two distinct `member_no`s.
   - **Audit**
     - Every decision writes an `audit_log` row.

**Gates**
- G1 — CHECK: `pnpm db:reset && pnpm db:test` — EXPECT: `All tests successful.`
- G2 Branch scope pinned — CHECK: drop the branch argument in `approve_member`'s permission check, then reset and test — EXPECT: `p1_00b_approvals` fails (restore afterwards)
- G3 Minor consent pinned — CHECK: remove the consent requirement, then reset and test — EXPECT: `p1_00b_approvals` fails (restore afterwards)
- G4 Adult guardian pinned — CHECK: remove the 18+ check in `add_dependent`, then reset and test — EXPECT: `p1_00b_dependents` fails (restore afterwards)
- G4b Mentor can't enforce a block — CHECK: grant `members.block` to `mentor` in a scratch seed, then reset and test — EXPECT: `p1_00b_blocking` fails (remove the scratch seed afterwards)
- G5 — CHECK: `pnpm db:types && pnpm typecheck` — EXPECT: exit 0
- G6 Guardian access ends at 18, pinned — CHECK: skip ending links in `daily_age_transitions`, then reset and test — EXPECT: `p1_00b_age` fails (restore afterwards)

---

<a id="p1-00c"></a>
## P1-00c Content & operations RPCs

- **Size:** M
- **Maker:** Opus (`schema-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-00a
- **Parallel with:** P1-00b
- **Owner gates:** none

**Owns:** `supabase/migrations/*_p1_00c_*.sql`, `supabase/tests/p1_00c_*.test.sql`, `supabase/seeds/p1-00c.sql`, `packages/shared/src/schemas/content.ts`

**Must**

1. **`search_directory(q, branch_id, page)`**
   - Returns `id, full_name, branch_name, city, occupation, photo_path`.
   - Adds `phone` and `email` only when the member's privacy flags allow it **and** they are not a minor.
   - Returns only active, non-deleted members.
   - Results are ordered by trigram similarity, 25 per page.
2. **`publish_announcement(id, notify bool)`**
   - Requires the scope permission.
   - When `notify` is true, inserts one `notifications` row per audience member in a **single statement**.
3. **Notification delivery**
   - A **statement-level** `AFTER INSERT` trigger on `notifications`:
     - Creates `notification_deliveries` rows for each channel the member's `notify_prefs` allow. Dependents' notifications route to their guardians.
     - Then makes **one** `pg_net` call to wake `notify-dispatch`. The function URL and secret header come from `app_settings`. A failure never blocks the insert.
   - A pg_cron job every minute calls the same function, which sweeps for retries.
4. **`rsvp(event_id, member_id, status)`**
   - The caller must be the member, or the member's guardian.
   - The event must be published and open for registration.
   - When capacity is full, the RSVP goes to the waitlist.
5. **Event team, attendance and member ID**
   - **`set_event_staff(event_id, member_id, capabilities)`** and **`remove_event_staff(event_id, member_id)`**
     - Require the event's scope permission.
     - Capabilities: `check_in`, `collect_payments`, `safety_lead`. These can be given to members of any branch, for example the NYM organising committee.
     - `public.is_event_staff(event_id, capability)` returns true for listed staff and for the event's scope officers.
   - **`event_pack(event_id)`**
     - Requires `is_event_staff(event, 'check_in')`.
     - Returns, for each registrant: `member_id`, `full_name`, `member_no`, branch, age group (`adult | 14-17 | under-14`), `pass_version`, `photo_path`, guardian names.
   - **`sync_check_ins(event_id, rows jsonb)`**
     - Requires `is_event_staff(event, 'check_in')`.
     - Each row is `{client_ref, member_id, pass_version, scanned_at, walk_in}`.
     - **Idempotent by `client_ref`**, with one check-in per member per event; the earliest scan wins.
     - Rejects stale `pass_version`s and inactive members.
     - Returns `{accepted[], rejected[{client_ref, reason}]}`.
     - P1-15 adds the guardian-alert trigger on `check_ins`.
   - **`verify_member_id(member_id, pass_version)`**
     - Requires `members.verify_id`, from **any** branch.
     - Returns `{valid, current_pass, full_name, photo_path, member_no, home_branch, wing, status, member_since, is_minor}`. Never a phone, DOB or email.
     - Each call writes `audit_log`.
6. **`import_roster(rows)`**: requires `roster.import` for each row's branch; dedupes by phone.
7. **`register_push_token(token, platform)`**.
8. **Reports**
   - **`submit_report(target_type, target_id, reason, details)`**
     - Open to any active member.
     - Rate-limited to 20 a day per reporter.
     - Rejects reason `block_request`. That reason can only be created by `request_block` (P1-00b).
     - Reason `safety_minor` creates **high-priority** notifications for every `enforcement_committee` member.
   - **`review_report(id, action, note)`**
     - Requires `reports.review`.
     - Actions: `dismiss | warn | remove_content | block`.
     - `remove_content` sets `hidden_at` on the target; `block` calls `block_member`.
     - Notifies the reporter with a generic outcome.
9. **pgTAP**
   - **Directory**
     - Never returns phone or email for a minor, even when their privacy settings allow it.
     - Returns an adult's phone only when allowed.
     - Never returns pending, suspended or deleted members.
   - **RSVP:** a guardian can RSVP for their dependent ✓; another member can't ✗; capacity overflow goes to the waitlist.
   - **Check-in sync**
     - Rejects a stale `pass_version`.
     - Syncing the same `client_ref`s twice is idempotent.
     - Staff of event X can't sync check-ins for event Y.
   - **Member ID**
     - A branch-B officer can verify a branch-A member ✓; a plain member can't ✗.
     - The result never contains a phone or DOB.
   - **Notifications**
     - A dependent's notification gets deliveries for the guardian.
     - A 600-row bulk insert creates exactly **one** `pg_net` request. Assert on `net.http_request_queue` count.
   - **Reports:** a member can't call `review_report`.

**Gates**
- G1 — CHECK: `pnpm db:reset && pnpm db:test` — EXPECT: `All tests successful.`
- G2 Directory masking pinned — CHECK: return `phone` unconditionally, then reset and test — EXPECT: `p1_00c_directory` fails (restore afterwards)
- G3 Batching pinned — CHECK: change the trigger to `FOR EACH ROW`, then reset and test — EXPECT: `p1_00c_notify` fails (restore afterwards)
- G4 — CHECK: `pnpm db:types && pnpm typecheck && pnpm check:seed` — EXPECT: exit 0 / `seed OK`

---

<a id="p1-01"></a>
## P1-01 Phone OTP auth (client + Send SMS hook)

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-00b
- **Parallel with:** P1-04, P1-05, P1-07a
- **Owner gates:** build with test numbers; real OTP needs B1/B2 + B3

**Owns:** `app/(auth)/{phone,otp}.tsx`, `src/features/auth/`, `packages/api/src/auth/`, `supabase/functions/auth-send-otp/`, `supabase/functions/_shared/{whatsapp,msg91,standard-webhooks}.ts`

**Shared touch points:** `app/_layout.tsx` (the real auth gate)

**Must**
1. **Phone screen**
   - Uses `PhoneField` with +91 as the default.
   - Calls `signInWithOtp({ phone })`.
   - **No CAPTCHA.**
2. **OTP screen**
   - 6-digit `verifyOtp({ phone, token, type: 'sms' })`.
   - Resend with a 30 s countdown, and a "Change number" option.
   - Clear error messages for: wrong code, expired code, too many attempts, offline, and "too many codes, try again in N minutes".
3. **Session**
   - Persists via LargeSecureStore and refreshes when the app returns to the foreground.
   - Sign-out deletes the device's push token and clears the cache.
4. **Auth gate:** per `01-architecture.md §7`, including the `deleted` status.
5. **`auth-send-otp` (Send SMS hook)**
   1. Verify the Standard Webhooks signature.
   2. **Per-number throttle:** max 5 sends an hour and 10 a day per number, using `otp_throttle` with a SHA-256 phone hash. Over the limit → return an `http_code: 429` error with a friendly message.
   3. Reject non-+91 numbers unless `ALLOW_INTERNATIONAL_OTP=true`.
   4. Send the WhatsApp authentication template `aiaia_login_code`.
   5. On failure, fall back to MSG91 if it's configured.
   6. Never log the OTP or the full phone number.
   7. Delete `otp_throttle` rows older than 2 days opportunistically.
6. **Isolation for a future provider switch:** all auth calls go through `packages/api/src/auth` (`requestCode`, `verifyCode`, `signOut`, `onSession`). No screen imports `supabase.auth` directly. An ESLint `no-restricted-imports` rule enforces this.
7. **Deno tests**
   - A bad signature → 401.
   - The 6th send within an hour → 429.
   - WhatsApp OK → 200.
   - A WhatsApp failure falls back to MSG91.
   - The OTP never appears in console output.

**Gates**
- G1 — CHECK: `pnpm fn:test -- auth-send-otp` — EXPECT: `ok`, 0 failed
- G2 Signature pinned — CHECK: bypass signature verification, then run G1 — EXPECT: the bad-signature test fails (restore afterwards)
- G3 Throttle pinned — CHECK: raise the hourly limit to 1000, then run G1 — EXPECT: the 6th-send test fails (restore afterwards)
- G4 — CHECK: `pnpm test -- auth && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0 (auth-gate routing covered for all 6 states; the lint rule flags a direct `supabase.auth` import in a fixture)

**Manual gates**
- Test number `+91 90000 00001` / `123456` logs in on the emulator and on the web.
- Restarting the app keeps the session.

---

<a id="p1-02"></a>
## P1-02 Profile setup, minors, guardians, waiting room

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P1-00b, P1-01
- **Parallel with:** P1-06, P1-08, P1-12a
- **Owner gates:** none

**Owns:** `app/(auth)/{profile-setup,waiting-room,blocked,claim,adult-consent}.tsx`, `app/(app)/profile/`, `src/features/profile/`, `packages/api/src/profile/`

**Must**
1. **Profile setup.** A multi-step form, with the draft saved in `expo-sqlite`.
   - **About you:** name, branch, DOB, gender.
   - **Contact & work:** city, occupation/education, emergency contact, and **email (optional)**. The email helper text reads "for receipts and updates; you can add it later". Verification comes from P1-12a.
   - **Photo:** optional. Uploads become available in P2-04; until then show "coming soon".
   - **Consents:** the privacy notice link, a WhatsApp opt-in (default off), an email-updates opt-in (default off), and directory visibility toggles.
   - **Age-aware copy:**
     - 14–17: "your branch will confirm a parent or guardian agrees".
     - Under 14: self-signup is blocked with "ask a parent or guardian to add you".
     - 35+: "you'll join as an AIAIA member (parent organisation)".
2. **Waiting room**
   - Shows the status, what was submitted (editable) and the next steps.
   - Shows "request info" messages from approvers.
   - Polls every 60 s in the foreground.
   - Moves into the app automatically on approval.
3. **Blocked screen:** for rejected, suspended or deleted accounts. Shows the reason and the grievance contact. For deleted accounts, adds "Changed your mind? Contact support within 6 months".
4. **My profile:** edit the allowed fields, privacy settings and opt-ins.
5. **My family** (adult guardians only)
   - Add a dependent and see their status.
   - "Give [name] their own login" (dependents 14+) issues a claim code.
6. **Claim screen:** after OTP, offers "Have a family code?", which calls `graduate_dependent`.
6b. **Adult consent screen (18th-birthday handover)**
   - Shown by the auth gate when `adult_consent_required` is set: "You're 18, so your AIAIA account is now fully yours."
   - Shows the privacy notice, plus the member's **current** privacy settings and opt-ins (still the restrictive minor settings) for review.
   - Actions:
     - **Accept**: calls `give_adult_consent`
     - **Download my data**
     - **Delete my account**: P1-13a's flow
   - Until they accept, the rest of the app stays behind this screen.
7. **Unit tests**
   - Age boundaries: 13y364d → blocked; 14y0d → teen; 18y0d → adult; 35y0d → aiaia.
   - The family screen is hidden for users under 18.
   - The auth gate routes an active member with `adult_consent_required` to the adult consent screen.

**Gates**
- G1 — CHECK: `pnpm test -- profile` — EXPECT: the boundary tests pass
- G2 Boundaries pinned — CHECK: change the teen threshold from 14 to 13, then run G1 — EXPECT: a failure (restore afterwards)
- G3 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

**Manual gates**
- A new test number completes setup and lands in the waiting room.
- An officer approves via SQL, and the app moves into the main area within 60 s.

---

<a id="p1-03"></a>
## P1-03 Approvals (admin)

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P1-00b, P1-02, P1-04
- **Parallel with:** P1-11, P1-13a
- **Owner gates:** B4 (consent form; a placeholder is fine)

**Owns:** `app/(admin)/approvals/`, `src/features/approvals/`, `packages/api/src/approvals/`

**Shared touch points:** an `adminNav` "Approvals" entry with a count badge

**Must**
1. **Queue**
   - Lists pending applicants the caller may approve, oldest first.
   - Filters: branch, age group, wing, fast-track.
   - On desktop: a `DataTable` with bulk approve **for adults only**.
   - On mobile: cards.
2. **Detail**
   - Shows all fields, guardians, the roster-match indicator and history.
   - Actions: approve, reject (reason required), request info (message required).
   - **For 14–17 applicants:** a consent modal asking for:
     - the method, guardian name and guardian phone
     - **"Guardian wants a WhatsApp alert when their child arrives at events"** (default on)

     Document upload is available from P2-04; until then show "attach later".
   - **For dependents:** the guardian is pre-filled as the consenting party.
3. **Behaviour**
   - Optimistic updates, with rollback on failure.
   - Realtime: if another officer acts on the same applicant, show "Already handled by X".

**Gates**
- G1 — CHECK: `pnpm test -- approvals` — EXPECT: "minor needs consent" and "bulk approve excludes minors and dependents" both pass
- G2 — CHECK: remove the minor filter from bulk approve, then run G1 — EXPECT: a failure (restore afterwards)
- G3 — CHECK: `pnpm db:test && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: pass / exit 0

**Manual gates**
- As branch president A on the web: approve an applicant, reject one, and attest consent for the 16-year-old.
- Branch B's applicants are not visible.

---

<a id="p1-04"></a>
## P1-04 Admin shell, members, roles, audit

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P1-00b
- **Parallel with:** P1-01, P1-05, P1-07a
- **Owner gates:** B4 (who's who; use fakes until then)

**Owns:** `app/(admin)/_layout.tsx`, `app/(admin)/{index,members,roles,audit,settings}/`, `src/features/admin/`, `packages/api/src/admin/`

**Must**
1. **Admin layout**
   - The guard uses `my_permissions()`.
   - An `adminNav` registry that other briefs append to. Items render only when the caller has the permission.
   - A **step-up slot**: if `my_permissions()` reports `needs_step_up`, render the step-up flow that P1-12c registers (a trusted-device check first, then the email code). Until P1-12c merges, show a placeholder "Email verification required".
   - A "Switch to member view" control.
2. **Dashboard:** counts by status, branch and wing; pending approvals; open reports (if `reports.review`); upcoming events.
3. **Members**
   - Search and filters.
   - Detail view showing consent records.
   - Actions, each shown per permission: edit branch, view history.
   - Block, unblock and phone change belong to P1-11 and P1-12b. They plug in as row actions through a `memberActions` registry.
   - CSV export (`data.export`), audited. Minors' contact details are excluded unless the exporter is a national role.
4. **Roles:** office-bearers by branch and national; assign and end roles; term history.
5. **Audit:** a log filtered by actor, action and date.
6. **Settings** (`system.config`): edit `app_settings`.

**Gates**
- G1 — CHECK: `pnpm test -- admin` — EXPECT: nav visibility tests pass (a member sees no admin; branch president sees Approvals, Members, Events, Announcements and Import, but not Roles, Audit or Settings; a super admin with step-up sees everything; a super admin without step-up sees the step-up screen)
- G2 — CHECK: make the nav ignore permissions, then run G1 — EXPECT: a failure (restore afterwards)
- G3 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p1-05"></a>
## P1-05 Member directory

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P1-00c
- **Parallel with:** P1-01, P1-04, P1-07a

**Owns:** `app/(app)/directory/`, `src/features/directory/`, `packages/api/src/directory/`

**Shared touch points:** add the Directory tab

**Must**
- **Search and list:** debounced search, a branch filter, and an infinite FlashList backed by `search_directory`.
- **Member card:** name, branch, city, occupation and avatar.
- **Contact buttons:** call, or WhatsApp `https://wa.me/<n>`, shown **only** when the RPC returns a phone.
- **Report:** a "Report" action that uses P1-11's `<ReportButton>` when present.
- **States:** empty, error and offline.

**Gates**
- G1 — CHECK: `pnpm test -- directory` — EXPECT: "no contact buttons when phone is null" passes
- G2 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p1-06"></a>
## P1-06 Announcements, notifications, push (Android + web push + PWA)

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P1-00c
- **Parallel with:** P1-02, P1-08, P1-12a
- **Owner gates:** A3 (Expo + Firebase)

**Owns:**
- `app/(app)/{home,notifications}/`, `app/(admin)/announcements/`
- `src/features/{announcements,notifications,pwa}/`, `packages/api/src/{announcements,notifications}/`
- `supabase/functions/notify-dispatch/`, `supabase/functions/_shared/{push,webpush}.ts`
- `apps/mobile/public/{manifest.json,sw.js,icons/}`

**Shared touch points:** Home tab; header bell; `adminNav`; `app/+html.tsx` (manifest + service worker registration)

**Must**
1. **Home feed**
   - Pinned announcements first, then national + own-branch items for the member's wing.
   - A strip of upcoming events (if P1-07a has landed).
2. **Admin announcements**
   - Create, edit, pin and publish within the admin's scope; audience selector (youth, aiaia, all); markdown-lite body.
   - "Notify members" calls `publish_announcement(id, true)`.
3. **Notification centre**
   - List, mark read, mark all read.
   - Deep links via `data.route`.
   - An unread badge.
4. **Android push**
   - Explain why before asking for permission.
   - `getExpoPushTokenAsync({ projectId })` → `register_push_token`.
   - An Android notification channel `important` (max importance) and `general`.
5. **Web push + PWA**
   - **Manifest:** name, icons, `display: standalone`, theme colour.
   - **Service worker:** Workbox, **caching static assets only**, never API responses.
   - **Opt-in:** a web-push toggle in Settings → `PushManager.subscribe` with `VAPID_PUBLIC_KEY` → stored as a `web` token.
   - **iPhone:** an "Add to Home Screen to get notifications" hint for iPhone Safari users.
6. **`notify-dispatch`**
   - Woken by the trigger and swept every minute by cron.
   - Claims pending `notification_deliveries` (`FOR UPDATE SKIP LOCKED`, 500 at a time).
   - Sends per channel:
     - **Expo:** chunks of **100**, with `priority: 'high'` and channel `important` for high-priority kinds.
     - **Web push:** via `_shared/webpush.ts` (VAPID, RFC 8291 encryption).
     - **Email:** a channel stub that P1-12a fills in.
   - Deletes dead tokens: Expo `DeviceNotRegistered`, web push 404/410.
   - Retries with backoff, up to 5 attempts.
   - **Push text rule:** no phone numbers, DOBs, amounts or other members' details. A unit test enforces this with a lint over the message templates.
7. **Help page** "Not getting notifications?":
   - Brand-specific battery-optimisation steps for Xiaomi/MIUI, Vivo, Oppo/ColorOS and Realme (allow autostart, no battery restriction).
   - Shown when a test push isn't acknowledged.
8. **Deno tests**
   - Chunking (250 messages → 3 requests).
   - Guardian routing.
   - High-priority mapping.
   - Dead-token cleanup for both channels.
   - Skip-locked claim, so two concurrent runs never double-send.

**Gates**
- G1 — CHECK: `pnpm fn:test -- notify-dispatch webpush` — EXPECT: `ok`, 0 failed
- G2 Chunking pinned — CHECK: set the chunk size to 1000, then run G1 — EXPECT: the chunking test fails (restore afterwards)
- G3 — CHECK: `pnpm test -- announcements notifications pwa && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0, with `apps/mobile/dist/sw.js` and `manifest.json` present

**Manual gates**
- On staging APKs on a **Xiaomi/Vivo/Oppo/Realme** phone and a Pixel/Samsung, a high-priority push arrives within 1 minute with the app closed.
- Web push arrives in desktop Chrome.
- Web push arrives on an iPhone with the PWA installed.

---

<a id="p1-07a"></a>
## P1-07a Events, RSVP, reminders

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P1-00c
- **Parallel with:** P1-01, P1-04, P1-05

**Owns:** `app/(app)/events/`, `app/(admin)/events/` (except `checkin/` and `safety/`), `src/features/events/`, `packages/api/src/events/`, `supabase/functions/event-reminders/`, `supabase/migrations/*_p1_07a_cron.sql`

**Shared touch points:** Events tab; `adminNav`

**Must**
1. **Member side**
   - List: upcoming and past events, with national, my-branch and wing filters. Cards show the RSVP status.
   - Detail: description, map, add to calendar (`.ics`), capacity and spots left.
   - RSVP for the member **and each dependent**.
2. **Admin side**
   - Create and edit events: scope, audience, capacity, registration window.
   - Publish, cancel (high-priority notification to registrants), and complete.
   - Attendee list with counts, and CSV export.
   - **Event team:**
     - Add members from any branch as staff with **check-in**, **collect payments** and/or **safety lead**, for example the NYM organising committee.
     - Uses `set_event_staff`.
     - Staff see the event in a "My event duties" list.
3. **Reminders:** `event-reminders` runs hourly via cron and sends reminders 24 h and 2 h before the start (the 2 h one is high priority). It is idempotent.
4. **Tests:** unit tests for RSVP states with dependents; Deno tests for reminder idempotency.

**Gates**
- G1 — CHECK: `pnpm fn:test -- event-reminders` — EXPECT: the idempotency test passes
- G2 — CHECK: `pnpm test -- events && pnpm db:test && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: pass / exit 0

---

<a id="p1-07b"></a>
## P1-07b Delegate passes & offline check-in

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-00c, P1-07a
- **Parallel with:** P1-02, P1-06, P1-08
- **Owner gates:** none (the agent generates an Ed25519 key pair; the owner stores the private key)

**Owns:** `app/(app)/pass/`, `app/(admin)/events/checkin/`, `src/features/checkin/`, `packages/api/src/checkin/`, `supabase/functions/member-pass/`, `scripts/gen-pass-keys.mjs`

**Shared touch points:** a "My pass" entry on Home and in Profile; `app.config.ts` `extra.passPublicKey`

**Must**
1. **Static delegate pass** (one per member, for every event)
   - `member-pass` signs the payload `v1|<member_id>|<pass_version>` with `PASS_SIGNING_PRIVATE_KEY` (Ed25519, WebCrypto).
   - The QR text is `AIAIA1.<base64url(member_id)>.<pass_version>.<base64url(sig)>`.
   - **Static:** the same QR every time, so it can be **printed**.
   - **Revocation:** an admin can **reissue** a lost pass by bumping `pass_version`, which invalidates the old one.
2. **Pass screen**
   - Shows a large QR, name and branch, plus the passes of any dependents.
   - Actions: "Save as image" (view-shot) and "Print" (`expo-print`).
   - Works offline once fetched; the pass is cached in secure storage.
3. **Printing passes in bulk (web admin):** a printable A4 sheet with 8 passes per page, for a branch or for an event's registrants. It uses the browser's print, with no server rendering.
4. **Offline check-in mode** (event staff with `check_in`; Android + web). Passes are scanned **once, on arrival**. There is no leave scan.
   - **Before the event,** "Download event pack" calls `event_pack` and stores the rows in `expo-sqlite`, with photo thumbnails cached once P2-04 exists.
   - **Scanning** works with **no network**:
     1. Verify the signature with the public key embedded in the app config.
     2. Look the member up in the pack and check `pass_version`.
     3. Show the name, branch, age group and photo **for the admin to compare with the person**.
     4. Tap "Confirm", which queues a local row.
   - **Duplicates** are flagged locally, e.g. "Already checked in at 10:42".
   - **Not in the pack but the signature is valid:** offer "Walk-in?", queued with `walk_in = true`.
   - **Sync:** when the device comes online (`NetInfo`), or when the admin taps "Upload", call `sync_check_ins` (each row carries a `client_ref` uuid) and show the accepted and rejected rows. The queue survives app restarts. It auto-syncs the moment connectivity returns, so guardian alerts (P1-15) are not delayed longer than necessary.
5. **Tests**
   - Signature verification: a valid pass, a tampered member id, and a stale `pass_version`.
   - The queue survives a restart (sqlite).
   - Sync is idempotent (mocked API).

**Gates**
- G1 — CHECK: `pnpm test -- checkin` — EXPECT: pass, including "tampered QR rejected" and "queue persists"
- G2 Signature check pinned — CHECK: skip `verify()` in the scanner, then run G1 — EXPECT: the tampered-QR test fails (restore afterwards)
- G3 — CHECK: `pnpm fn:test -- member-pass && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0
- G4 No private key in the repo — CHECK: `git grep -n "PRIVATE KEY\|pass_signing_private" -- . ':!docs'` — EXPECT: no output

**Manual gates**
- Put the admin phone in airplane mode and scan 5 printed passes plus 1 duplicate.
- Turn airplane mode off: 5 accepted, the duplicate is not double-counted.

---

<a id="p1-08"></a>
## P1-08 Paper-roster import / export

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P1-00c, P1-04
- **Parallel with:** P1-02, P1-06, P1-12a
- **Owner gates:** real rosters at launch (never commit them)

**Owns:** `app/(admin)/import/`, `src/features/import/`, `packages/api/src/import/`, `docs/templates/roster-template.csv`

**Must**
- **Template:** a downloadable CSV with these columns: `full_name, phone, branch, dob, gender, city, occupation, email, guardian_name, guardian_phone`.
- **Parsing and validation:**
  - The file is parsed in the browser with `papaparse` and **never uploaded or stored**.
  - Phones are normalised to E.164.
  - Each row is validated with zod.
  - A preview shows per-row errors and duplicates.
- **Import:** only valid rows go through `import_roster`. The admin sees a summary and an error report.

**Gates**
- G1 — CHECK: `pnpm test -- import` — EXPECT: these inputs all normalise to `+919876543210`: `9876543210`, `+91 98765 43210`, `098765 43210`. A bad-DOB row is rejected and a duplicate is flagged
- G2 — CHECK: break the leading-0 handling, then run G1 — EXPECT: a failure (restore afterwards)
- G3 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p1-09"></a>
## P1-09 Public website & policy pages (KYC and store set)

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P0-01, P0-04
- **Parallel with:** anything (static; can run during Phase 0)
- **Owner gates:** C2 facts and approval (ship with DRAFT text)

**Owns:** `app/(public)/` (except `download.tsx` and `verify/`), `docs/legal/*.md`, `src/features/public/`

**Must**
1. **Pages.** These render without login, from markdown in `docs/legal/` bundled at build time:
   - `/about`
   - `/contact`: registered address, phone, email, support hours
   - `/privacy`
   - `/terms`
   - `/refunds`: Cancellation & Refund Policy
   - `/delivery`: Service Delivery Policy
   - `/pricing`: dues, concessions, event fees, donations
   - `/delete-account`
   - Every page shows a **"DRAFT – pending approval"** banner until `app_settings.legal_approved = true`.
2. **Privacy policy draft.** Cover the following:
   - The data collected, and the purposes for collecting it.
   - **Where data is stored:**
     - Member data is in India (Supabase Mumbai), and files are in India (DigitalOcean Bangalore).
     - The services that process limited data abroad, from `01-architecture.md §5.13`.
   - **Retention:** 6 months for rejected and deleted accounts, and backups of at most 6 months.
   - Data rights.
   - The Grievance Officer.
   - Children's data and guardian consent.
   - WhatsApp and email messaging.
   - Payments by Razorpay.
3. **`/delete-account` page.** It satisfies Google Play's web deletion requirement and covers:
   - What gets deleted, and the 6-month retention period.
   - A "Sign in to delete" button, which goes through web login to Settings → Delete.
   - A contact fallback.
4. **Shared footer.** A footer component on every public page and on the login screen, linking all of these pages.
5. **Test.** A snapshot test confirms every route renders and contains its required heading.

**Gates**
- G1 — CHECK: `pnpm test -- public` — EXPECT: all 8 routes render with their headings ("Cancellation & Refund Policy", "Contact Us", …)
- G2 — CHECK: `pnpm web:build` and grep `apps/mobile/dist` for `/refunds` — EXPECT: the route is present
- G3 — CHECK: `pnpm lint && pnpm typecheck` — EXPECT: exit 0

---

<a id="p1-11"></a>
## P1-11 Reporting & enforcement

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-00b, P1-00c, P1-04
- **Parallel with:** P1-03, P1-13a
- **Owner gates:** B4 (enforcement committee members)

**Owns:** `app/(admin)/enforcement/`, `src/features/reports/`, `packages/api/src/reports/`, `supabase/functions/enforcement-block/`

**Shared touch points:** export `<ReportButton targetType targetId>`, used by Directory, announcements and events; `adminNav`; the `memberActions` registry. That registry shows **Block / Unblock** to `members.block` holders and **Request block** to `members.request_block` holders.

**Must**
1. **Report form**
   - Fields: reason (harassment, inappropriate, spam, impersonation, **safety concern involving a minor**, other) and details.
   - Calls `submit_report`.
   - Confirms with: "Thanks. The enforcement committee will review this."
2. **My reports:** the status of each report the member has filed.
3. **Enforcement queue** (`reports.review`)
   - Sorted by priority: **Mentor block requests**, then `safety_minor`, then everything else, oldest first.
   - Detail view shows the target preview and the reporter. Reporter identity is visible only to the committee.
   - Actions: dismiss, warn (sends a notification to the target), remove content, block.
   - **Block requests** show the Mentor's reason and the target's recent report history. Only **Approve & block** or **Decline** (reason required) are offered. The Mentor is notified of the outcome either way.
4. **Request block** (`members.request_block`, the Mentor): a dialog on the member detail screen with a required reason, calling `request_block`. It shows "Sent to the Enforcement Committee". The Mentor never sees a Block button.
5. **Blocking** (`members.block`: super admins and the Enforcement Committee only)
   - **`enforcement-block`** calls `block_member`, then **revokes all sessions** (auth admin `signOut(user, 'global')` plus a ban flag), then calls `revoke_all_trusted_devices` (from P1-12c, when merged). **Unblocking** reverses the ban, but trusted devices stay revoked.
   - Each action needs a reason and is audited.
6. **Tests**
   - Deno:
     - a non-committee caller gets 403
     - **the mentor calling `enforcement-block` gets 403**
     - a block revokes the session; an unblock restores it
   - Unit: the mentor sees "Request block" and not "Block".

**Gates**
- G1 — CHECK: `pnpm fn:test -- enforcement-block` — EXPECT: `ok`, 0 failed
- G2 Permission check pinned — CHECK: skip the permission check, then run G1 — EXPECT: the 403 test fails (restore afterwards)
- G3 — CHECK: `pnpm test -- reports && pnpm db:test && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: pass / exit 0
- G4 Mentor sees no Block button — CHECK: make `memberActions` show Block to `members.request_block` holders, then run `pnpm test -- reports` — EXPECT: the mentor-actions test fails (restore afterwards)

---

<a id="p1-12a"></a>
## P1-12a Email: official-address sender, verification, notification channel

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P1-00b, P1-06
- **Parallel with:** P1-02, P1-08, P1-12b
- **Owner gates:** A3 (AIAIA's email provider named, `updates@` address and API credentials; SES only if there is no business email)

**Owns:** `supabase/functions/email-verify/`, `supabase/functions/_shared/email/` (`index.ts` + one driver file per provider), `src/features/email/`, `packages/api/src/email/`

**Shared touch points:** the email channel in `notify-dispatch`; the email row on the Profile screen

**Must**
1. **`_shared/email/` (provider-agnostic, HTTPS only, no SMTP)**
   - Interface: `send({to, subject, text, html, replyTo?}) → {id}` and `limits() → {perDay}`.
   - Drivers, chosen by `EMAIL_PROVIDER`:
     - **Implement now:** the one AIAIA uses, plus `ses`.
       - `gmail`: Gmail API `users.messages.send`, using a service-account JWT with domain-wide delegation impersonating `EMAIL_FROM`
       - `graph`: Microsoft Graph `POST /users/{EMAIL_FROM}/sendMail`, client-credentials flow
       - `zoho`: Zoho Mail API, with refresh-token flow
       - `ses`: SES v2 `SendEmail`, SigV4 via `aws4fetch`, `ap-south-1`
     - **Leave as stubs:** the other two. Each throws "not configured".
   - Every email comes **from `EMAIL_FROM`** (the official AIAIA address) and has a plain-text body plus simple HTML.
   - Every non-transactional email carries a footer with **one-click unsubscribe** (a signed link that sets `email_updates = false`) and the `List-Unsubscribe` header.
   - No tracking pixels.
2. **Email verification (`email-verify`)**
   - `send` emails a 6-digit code. Limits: valid for 15 minutes, max 5 attempts, max 3 sends an hour.
   - `confirm` sets `member_private.email_verified_at`.
   - The Profile screen shows a "Verify" button.
3. **Email channel in `notify-dispatch`**
   - Sends to members with a verified email and `email_updates = true`. Members who chose "digest" get a weekly or monthly digest instead.
   - **The app holds the mailing list.** Recipients come from each member's own opt-in in `member_private`. There is no external Google Group or list to keep in sync. Unsubscribes and DPDP consent therefore stay per member, with the data in India.
   - **Daily limit guard**
     - Counts the day's sends against `limits().perDay` (Workspace ≈ 2,000, configurable in `app_settings.email_daily_cap`).
     - Near the cap (90%), it defers non-urgent emails to the next day and converts updates into the next digest.
     - If `EMAIL_OVERFLOW_PROVIDER=ses` is set, it sends the overflow through SES instead.
     - Transactional emails (codes, receipts) always go first.
4. **Deno tests**
   - Each implemented driver builds the correct request, checked against recorded fixtures (the SES SigV4 test vector; Gmail/Graph request shape).
   - Unsubscribe links are signed, and a tampered link is rejected.
   - The cap guard defers updates but never codes.
   - Verification codes expire and the attempt limit holds.

**Gates**
- G1 — CHECK: `pnpm fn:test -- email` — EXPECT: `ok`, 0 failed
- G2 Cap guard pinned — CHECK: let updates bypass the cap, then run G1 — EXPECT: the "defers updates at 90%" test fails (restore afterwards)
- G3 — CHECK: `pnpm test -- email && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

**Manual gates**
- On staging, a verification code arrives from `updates@<aiaia-domain>` in Gmail and Outlook inboxes, not spam, with SPF, DKIM and DMARC all passing in the headers.

---

<a id="p1-12c"></a>
## P1-12c Super-admin device verification (once per device)

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-00a, P1-04, P1-12a
- **Parallel with:** P1-03, P1-11, P1-13a
- **Owner gates:** B4 (super admins' emails)

**Owns:**
- `supabase/functions/admin-step-up/`
- `supabase/migrations/*_p1_12c_*.sql` (the `revoke_all_trusted_devices` RPC)
- `supabase/tests/p1_12c_*.test.sql`
- `src/features/security/`, `packages/api/src/security/`
- `app/(admin)/step-up.tsx`, `app/(admin)/security/` (trusted devices list)

**Shared touch points:** the admin layout step-up slot; the `memberActions` registry ("Revoke trusted devices", super admins only)

**Goal:** a super admin verifies each device **once**, with their phone OTP plus one email code, and is never asked again on that device. Access ends only on revoke, block, phone change or role removal.

**Must**
1. **`admin-step-up` operations.** Callable only by active members who hold a role in `step_up_roles` and have a **verified email**. A super admin without a verified email is sent to verify one first.
   - **`send`:** emails a 6-digit code to the verified email.
   - **`confirm(code, label)`:**
     1. Inserts `admin_step_ups(session_id from the JWT, source 'email_otp', expires_at NULL)`.
     2. **Always registers the device as trusted.** There is no checkbox. It generates a 256-bit random secret and stores its SHA-256 hash in `admin_trusted_devices`, with `expires_at` = `now() + trusted_device_days`, or NULL when that setting is null (the default).
     3. Returns the secret **once**.
     4. Evicts the oldest device beyond 5.
     5. Emails "A new device was verified for your AIAIA admin account: <label>, <time>. Not you? Sign out all devices."
   - **`trusted(secret)`:** called when a session has no step-up yet, i.e. after a fresh login on an already-verified device.
     1. Hashes the secret and looks for a non-revoked, non-expired device belonging to the **caller's own** member id.
     2. Re-checks that the member is active and still holds a step-up role.
     3. **On success:** inserts `admin_step_ups(source 'trusted_device', expires_at NULL)` and updates `last_used_at`.
     4. **On failure:** returns `{needs_email: true}`.
   - **`list`**, **`revoke(device_id)`**, **`revoke_all()`**.
   - **`lock()`:** optional and manual. It deletes the current session's step-up, so the next admin action re-checks the device silently.
2. **Client**
   - **Secret storage:** `expo-secure-store` on native, a namespaced `localStorage` key on web.
     - Signing out keeps the secret, so signing back in on that device needs only the phone OTP.
     - "Forget this device" deletes it.
   - **Admin layout:**
     - If a stored secret exists, call `trusted(secret)` silently.
     - Otherwise, show the one-time screen: "Verify this device. We've emailed a code to <masked email>. You only need to do this once on this device."
     - **Never prompt again** while the session or the device stays valid.
   - **Security page:**
     - Lists trusted devices: label, first verified, last used.
     - Actions: revoke a device, "Sign out all devices", "Forget this device".
3. **Revocation from other briefs**
   - P1-12b (phone change) and P1-11 (block) call `revoke_all_trusted_devices(member_id)`. That `security definer` RPC is added here. It also deletes the member's `admin_step_ups` rows, so access ends **immediately** on every device, not just at the next login.
   - Removing a member's last step-up role makes their devices fail the role re-check. P1-13b deletes those rows on its next run.
4. **Deno tests**
   - **Persistence:**
     - After `confirm`, a session keeps admin powers indefinitely; there is no time-based expiry.
     - A fresh session on the same device gets a step-up through `trusted` without any email being sent.
   - **Rejection:**
     - A secret from another member's device fails.
     - A revoked device fails.
     - A blocked member fails, even with a valid secret.
     - A member stripped of the role fails, even with a valid secret.
   - **Revoke-all:** `revoke_all_trusted_devices` removes existing step-ups, so the current session loses admin powers at once.
   - **Housekeeping:**
     - A 6th device evicts the oldest.
     - The new-device email is sent.
     - Only the hash is stored, never the raw secret.

**Gates**
- G1 — CHECK: `pnpm fn:test -- admin-step-up` — EXPECT: `ok`, 0 failed
- G2 Session binding pinned — CHECK: insert the step-up without `session_id`, then run G1 — EXPECT: the session-binding test fails (restore afterwards)
- G3 Revocation pinned — CHECK: make `trusted` ignore `revoked_at`, then run G1 — EXPECT: the "revoked device fails" test fails (restore afterwards)
- G4 Role re-check pinned — CHECK: skip the active/role re-check in `trusted`, then run G1 — EXPECT: the "stripped of role" test fails (restore afterwards)
- G5 Immediate cut-off pinned — CHECK: make `revoke_all_trusted_devices` leave `admin_step_ups` in place, then run G1 — EXPECT: the revoke-all test fails (restore afterwards)
- G6 — CHECK: `pnpm db:test && pnpm test -- security && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: pass / exit 0

**Manual gates**
1. A seed super admin logs in on a phone: phone OTP, then the one-time email code, then Roles.
2. They close the app for a day, reopen it and go straight to Roles, with no prompts.
3. After they sign out and sign in again on the same phone, the phone OTP alone reaches Roles.
4. A laptop asks for the email code once.
5. "Sign out all devices" on the laptop removes the phone's admin access immediately.

---

<a id="p1-12b"></a>
## P1-12b Support: phone-number change

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-00b, P1-04
- **Parallel with:** P1-02, P1-06, P1-08
- **Owner gates:** B4 (support staff, and an optional personal-agent support account)

**Owns:** `supabase/functions/support-change-phone/`, `app/(admin)/support/`, `src/features/support/`, `packages/api/src/support/`, `docs/support-runbook.md`

**Shared touch points:** the `memberActions` registry ("Change phone number"); `adminNav` "Support"

**Must**
1. **Support search** (`members.support_view`)
   - Search by name or branch.
   - Show only the name, branch, the last 4 digits of the phone, guardian names and the account status. This is enough to identify someone without exposing full details.
2. **Change phone form**
   - Fields:
     - the new number
     - **how identity was verified** (required): video call, known to the branch officer, or ID shown to an officer
     - a note
   - Calls `support-change-phone` (`members.change_phone`).
3. **What the function does**
   1. Validate E.164.
   2. If the new number belongs to another account:
      - If that account is **pending with no data**, remove it and continue.
      - Otherwise refuse with "needs super admin".
   3. Update the auth user's phone through the admin API (`phone_confirm: true`) and `member_private.phone`.
   4. **Revoke all sessions** of that user, and all their admin trusted devices (`revoke_all_trusted_devices`, from P1-12c, when merged).
   5. Bump `pass_version`, because the old printed pass is invalidated.
   6. Write an audit entry, including the actor and the verification method.
   7. Notify the **new** number (WhatsApp template `phone_changed`), the **old** number if it can be reached, and the verified email if there is one.
4. **Personal agent use.** `docs/support-runbook.md` explains how a personal AI agent can perform changes. It uses a dedicated support account with only `support_staff`: it signs in with that account's phone OTP and calls the same function. Every change it makes is audited like a human's.
5. **Deno tests**
   - A caller without the permission gets 403.
   - A conflicting active number is refused.
   - A stray pending account is merged away.
   - Sessions are revoked.
   - `pass_version` is bumped.

**Gates**
- G1 — CHECK: `pnpm fn:test -- support-change-phone` — EXPECT: `ok`, 0 failed
- G2 Session revocation pinned — CHECK: skip session revocation, then run G1 — EXPECT: the session test fails (restore afterwards)
- G3 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p1-13a"></a>
## P1-13a Settings, data export, account deletion

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-00b, P1-02
- **Parallel with:** P1-03, P1-11

**Owns:** `app/(app)/settings/`, `src/features/settings/`, `packages/api/src/settings/`, `supabase/functions/{data-export,account-delete}/`

**Must**
1. **Settings screen**
   - Notification preferences: push, web push, email updates/digest, WhatsApp.
   - Links to the privacy settings and to email verification.
   - App version.
   - The grievance contact.
2. **"Download my data"** (`data-export`)
   - Returns JSON containing the caller's own `members` and `member_private` rows, their dependents, RSVPs, notifications and reports filed.
   - Limited to one export a day.
3. **"Delete my account"** (`account-delete`)
   - Requires confirmation by typing.
   - Calls `delete_my_account`, bans and signs out the auth user, and hides the member everywhere.
   - Explains: "Your data is kept for 6 months in case you change your mind, then permanently removed."
   - A member with dependents must reassign or delete them first.
4. **Deno tests**
   - The export excludes other members' data.
   - Deletion bans and signs out the user and sets the status to `deleted`.
   - Deletion is blocked while the member has sole-guardian dependents.

**Gates**
- G1 — CHECK: `pnpm fn:test -- data-export account-delete` — EXPECT: `ok`, 0 failed
- G2 — CHECK: `pnpm test -- settings && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p1-13b"></a>
## P1-13b Retention purge

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-00b
- **Parallel with:** any P1 feature brief

**Owns:** `supabase/functions/retention-purge/`, `supabase/migrations/*_p1_13b_cron.sql`

App updates moved to **P0-05**.

**Must**
1. **`retention-purge`** (runs daily at 02:00 IST)
   - **Who is purged:** members with status `rejected` or `deleted` and `status_changed_at < now() - retention_months`.
   - **What happens to them:**
     - Delete `member_private`.
     - Anonymise `members`: name becomes "Former member"; photo, bio, city and occupation are cleared.
     - Delete their consent documents and avatar from storage.
     - Delete the auth user.
   - **What is kept:** payment rows, keeping amounts and ids only.
   - **Housekeeping:** these are removed too:
     - expired `email_verifications`, `admin_step_ups` and `otp_throttle` rows
     - `admin_trusted_devices` that are revoked (or expired, if an expiry is ever configured), or that belong to members with no remaining step-up role. Their `admin_step_ups` rows go too.
   - Each run writes one audit entry with its counts. It is idempotent.
2. **Tests**
   - Deno:
     - A member 6 months and 1 day after the status change is purged.
     - A member at 5 months and 29 days is not.
     - Payments survive the purge.
     - The purge is idempotent.

**Gates**
- G1 — CHECK: `pnpm fn:test -- retention-purge` — EXPECT: `ok`, 0 failed
- G2 Boundary pinned — CHECK: change the cut-off to `retention_months - 1`, then run G1 — EXPECT: the 5-months-29-days test fails (restore afterwards)

---

<a id="p1-14"></a>
## P1-14 Digital member ID & branch transfers

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P1-00b, P1-00c, P1-07b
- **Parallel with:** P1-11, P1-12c, P1-13a
- **Owner gates:** none

**Owns:** `app/(app)/id/`, `app/(app)/transfer/`, `app/(admin)/verify/`, `app/(admin)/transfers/`, `src/features/{member-id,transfers}/`, `packages/api/src/{member-id,transfers}/`

**Shared touch points:** a "My ID" card on Home; `adminNav` entries "Verify member" and "Transfers"; the `memberActions` registry ("Reissue pass/ID", which bumps `pass_version`)

**Goal:** a member who moves to another state for studies or work can prove membership to **any** branch, and move their membership there.

**Must**
1. **Digital member ID card** (member side)
   - Shows:
     - photo (from P2-04; initials until then)
     - full name and **member number** (`member_no`)
     - home branch and wing (Youth / AIAIA)
     - "Member since" and a status badge
   - Carries **the same signed QR as the delegate pass** (P1-07b). One code serves as both ID and event pass.
   - Never shows the phone number or DOB.
   - Works offline once fetched. Save as image, print, or share as an image.
   - Guardians see and print their dependents' ID cards.
2. **Verify a member** (any branch officer, national role or support staff with `members.verify_id`)
   - Scan the QR, or type a member number as a fallback.
   - **Offline:** checks the signature with the embedded public key and shows "Genuine AIAIA pass. Status not checked (offline)", plus the name from the code payload if it's in a downloaded event pack.
   - **Online:** calls `verify_member_id`, then shows the photo, name, member number, home branch, wing, member since and a status:

     | Status | Meaning |
     |---|---|
     | **Active** | Current member |
     | **Suspended** | Membership suspended |
     | **Old pass** | The pass was reissued; this code is superseded |
     | **Not found** | No matching member |

   - Every online verification is audited (verifier, member, time). The member can see "Your ID was verified by <branch> on <date>" in their activity.
3. **Branch transfer** ("I've moved")
   - **Request.** A member, or the active guardian for a dependent, picks the new branch, adds a reason (studies, work, family, other) and an optional note. Only one request can be pending at a time, and it can be cancelled.
   - **Decision.** The **new branch's** officers get a high-priority notification and an "Incoming transfers" queue. They approve or reject with a note. The old branch sees an outgoing list (view only) and is notified of the outcome.
   - **On approval:**
     - `branch_id` changes
     - the history is kept (`member_status_events`, reason `branch_transfer`)
     - the ID card shows the new branch
     - the member is notified
4. **Tests (unit)**
   - All the verify screen states: valid, old pass, suspended, not found, offline-genuine, bad signature.
   - The transfer form only allows a branch other than the current one.
   - The ID card never renders a phone or DOB.

**Gates**
- G1 — CHECK: `pnpm test -- member-id transfers` — EXPECT: pass, including "offline shows status not checked"
- G2 Offline honesty pinned — CHECK: make the offline path show "Active", then run G1 — EXPECT: the offline-status test fails (restore afterwards)
- G3 — CHECK: `pnpm db:test && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: pass / exit 0

**Manual gates**
1. A branch-B officer verifies a branch-A member's ID twice:
   - in airplane mode: Genuine, status not checked
   - online: Active, with details
2. The member requests a transfer from A to B. B approves, and the member's ID card now shows branch B.

---

<a id="p1-15"></a>
## P1-15 Minor safety: guardian check-in alerts

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-01 (`_shared/whatsapp`), P1-03 (consent captures `guardian_alerts`), P1-06 (notifications), P1-07b (check-ins)
- **Parallel with:** — (wave 1g, alone)
- **Owner gates:**
  - B1: WhatsApp template `guardian_attendance_alert` approved. Mock the Graph API until then.
  - B4: each event's safety lead, assigned in the app.

**Owns:** `supabase/functions/guardian-alerts/`, `supabase/migrations/*_p1_15_*.sql` (alert queue table, trigger), `supabase/tests/p1_15_*.test.sql`, `app/(admin)/events/safety/`, `src/features/safety/`, `packages/api/src/safety/`

**Shared touch points:** the scanner status bar in P1-07b ("N guardian alerts waiting for signal")

**Goal:** a parent or guardian always knows when their child (under 18) **arrives** at an event venue. Passes are scanned once, on arrival only; there is no leave scan.

**Must**
1. **`guardian_alerts` queue**
   - Columns: `id`, `check_in_event_id`, `member_id`, `target` (`guardian_member` | `guardian_phone`), `guardian_member_id`, `phone`, `channel` (`push | whatsapp`), `status`, `attempts`, `sent_at`, `error`.
   - Service role only.
2. **Trigger: `AFTER INSERT` on `check_ins`**
   - Only for members **under 18 at the scan time**.
   - It queues two kinds of alert:
     - **Push:** one per **active** guardian link, sent as a high-priority push plus an in-app notification to the guardian's account.
     - **WhatsApp:** one for the guardian named on the latest `consent_records` entry, if `guardian_alerts = true` and a phone is on file. It is skipped when a guardian account with the same phone already gets a push.
   - Then it makes one `pg_net` wake-up per statement.
3. **`guardian-alerts` function**
   - **WhatsApp:** sends the utility template `guardian_attendance_alert`. The variables are the child's first name, "arrived at", the event title and venue, and the **scan time** in IST (never the sync time).
   - **Push:** goes through the notifications pipeline as kind `guardian_alert`, high priority.
   - **Reliability:** retries with backoff, is idempotent per alert row, and records the delivery status.
4. **Offline scans**
   - Alerts send as soon as the scanner phone syncs.
   - The scanner auto-syncs the moment connectivity returns and shows the pending count.
5. **"Minors at this event" list** (the event's `safety_lead` staff and scope officers)
   - Shows the minors registered for the event: checked in yes/no and the check-in time.
   - Shows their guardian contact, with a "Call guardian" action.
   - It is read-only, and every view is audited.
6. **Stopping alerts**
   - Alerts stop automatically at 18, because the member is no longer a minor and their guardian links have ended.
   - Officers can switch off `guardian_alerts` on a consent record when a guardian asks.
   - Once P2-06 ships, a guardian replying STOP also turns them off.
7. **Tests**
   - **pgTAP**
     - A minor's check-in queues alerts.
     - An adult's check-in queues none.
     - An **ended** guardian link gets none.
     - WhatsApp goes out only when `guardian_alerts` is true.
     - Duplicate phones are deduped.
     - A duplicate scan of the same member creates no second alert.
     - Only officers and safety leads can read the minors list.
   - **Deno**
     - The template variables are correct and use the scan time.
     - Retry and idempotency hold.

**Gates**
- G1 — CHECK: `pnpm db:reset && pnpm db:test` — EXPECT: `All tests successful.`
- G2 — CHECK: `pnpm fn:test -- guardian-alerts` — EXPECT: `ok`, 0 failed
- G3 Minors only, pinned — CHECK: drop the under-18 condition from the trigger, then reset and test — EXPECT: the "adult check-in queues none" test fails (restore afterwards)
- G4 Ended links pinned — CHECK: ignore `ended_at` in the trigger, then reset and test — EXPECT: the "ended link gets none" test fails (restore afterwards)
- G5 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

**Manual gates**
- **Arrival alert:** check in a seed 16-year-old, with a Meta test number as the guardian's phone. A WhatsApp alert arrives showing the correct time, and the guardian account gets a push.
- **Offline:** repeat in airplane mode. The alert arrives after reconnecting, still showing the original scan time.
- **Duplicate scan:** scanning the same pass again sends no second alert.

---

<a id="p1-10"></a>
## P1-10 End-to-end suites + tester release (runs last in Phase 1)

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** every other P1 brief
- **Owner gates:** B1/B2 for real-number testing; Play internal testing needs C1 (otherwise APK)

**Owns:** `e2e/`, `.github/workflows/e2e.yml`, `docs/release-checklist.md`, `app/(public)/download.tsx`

**Must**
1. **Playwright (web), against local Supabase**
   - Signup → waiting room → officer approves → member sees home.
   - RSVP.
   - The directory masks a minor.
   - A cross-branch admin can't see an applicant.
   - Report → enforcement block → the blocked user is logged out.
   - A super admin needs the step-up before reaching Roles.
   - A seed member who turns 18 today sees the adult consent screen, accepts, then reaches home.
   - A branch-B officer verifies a branch-A member's ID number.
   - A transfer from A to B is approved by B.
   - Checking a 16-year-old in queues a guardian alert (mocked WhatsApp).
   - After the one-time email code, the next login in the same browser context skips the email code, and a reload keeps admin access with no prompt. A fresh browser context asks once.
2. **Maestro (Android emulator in Actions; nightly + manual)**
   - Login → profile setup → waiting room.
   - A seeded member opens their pass.
   - An admin downloads the event pack, then scans in airplane mode (QR fed through the camera mock) and syncs.
3. **`/download` page**
   - The latest tester APK (from GitHub Releases), with its SHA-256 and the steps from `docs/tester-install.md`.
   - After this first install, testers update **inside the app** (P0-05).
   - Once a Play listing exists, the page links to Play instead.
4. **`docs/release-checklist.md`**
   1. Bump the version.
   2. Tag.
   3. Confirm the release workflows have run (APK/AAB, web, DB deploy with prod approval).
   4. Upload the AAB to Play internal testing, when Play is available.
   5. Smoke-test on a Xiaomi-family phone and a Pixel/Samsung.
5. **Cut `v0.5.0` for testers.**

**Gates**
- G1 — CHECK: `pnpm e2e:web` — EXPECT: 0 failed
- G2 — CHECK: make `approve_member` a no-op in a local patch, then run G1 — EXPECT: the approval spec fails (restore afterwards)
- G3 — CHECK: `gh workflow run e2e.yml` then `gh run watch` — EXPECT: Maestro succeeds
- G4 — CHECK: tag `v0.5.0-rc.1` — EXPECT: a signed APK + AAB on a pre-release
