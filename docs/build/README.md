# AIAIA Youth App — Build Pack (start here)

> **History:** the public history starts at a single fresh root commit (2026-11-14). Commit hashes in this README written before that date (for example "merged 046e0e4") refer to the pre-GitHub history, which is kept only locally on the branch `archive/pre-github`.

This folder lets **you, or any coding agent**, pick the build up at any point. Read the files in this order:

| # | File | What it is | Who reads it |
|---|---|---|---|
| 1 | this README | Where we are, what's next, decisions | Everyone, every time |
| 2 | [`../../AGENTS.md`](../../AGENTS.md) | Rules every coding agent follows | Every agent (read automatically) |
| 3 | [`01-architecture.md`](01-architecture.md) | Stack, layout, scripts, security & privacy rules, data model | Makers and reviewers |
| 4 | [`02-owner-setup.md`](02-owner-setup.md) | Everything only **you** can do, plus costs and secrets | You |
| 5 | [`03-roadmap.md`](03-roadmap.md) | Phases, dependency map, parallel waves, milestones, brief index | You / the orchestrator |
| 6 | [`04-agent-playbook.md`](04-agent-playbook.md) | The agent team (Opus orchestrates, Sonnet builds), the model per brief, the loop, merge procedure | You / the orchestrator |
| 7 | [`05-workflow-setup.md`](05-workflow-setup.md) | What to install and configure: plan, tools, repo, settings, connectors (Context7, Expo, Supabase), first run | You |
| 8 | [`06-timeline.md`](06-timeline.md) | Dated plan from setup to launch and v2.0, the owner's paperwork lane, critical path, risks | You |
| 9 | [`briefs/`](briefs/) | One detailed brief per feature, with gates and the model that builds and reviews it | One maker per brief |

The plain-language proposal for the committee is [`../AIAIA-Youth-App-Proposal.pdf`](../AIAIA-Youth-App-Proposal.pdf).

## In one paragraph

**The code.** There is one Expo (React Native) codebase. It produces:
- an **Android app**: testers get it via Play internal testing or an APK; from v1.0 the public gets it from the **Play Store**, published under AIAIA's D-U-N-S
- a **web app** (also a PWA with web push) on Cloudflare Pages
- an **admin console** at `/admin`

**Where things live and run.**
- **Supabase (Mumbai):** member data, phone-OTP login, server functions. Permissions are enforced in the database.
- **DigitalOcean Spaces (Bangalore):** files and encrypted backups.

**Messaging and payments.**
- **WhatsApp:** login codes and official updates.
- **AIAIA's official email account:** optional email from `updates@<aiaia-domain>`, plus super-admin codes, at ₹0. Amazon SES (Mumbai) is the fallback.
- **Razorpay:** payments, including its own confirmation emails.

**Cost.** About ₹11–12k a year, plus ₹2,100 once for Play.

**Phases 1–2 are testers only.** Real members arrive at v1.0.

## How to pick this up

1. Follow [`05-workflow-setup.md`](05-workflow-setup.md):
   1. The repo is at `NYM5\AIAIA_app` (already a git repo). Push it to GitHub with `gh repo create`.
   2. Copy `docs/build/claude-settings.example.json` to `.claude/settings.json`.
   3. Add the connectors (Context7, Expo).
2. Work through **Stage A** of [`02-owner-setup.md`](02-owner-setup.md).
3. Open the repo in Claude Code (Opus) and type **`/orchestrate`**.

To pick up after a break, type **`/resume-build`**. The dated plan is in [`06-timeline.md`](06-timeline.md).

**Branch protection on `main`** (apply after P0-03): require a PR, the `ci` check and 1 approval; block force-push.

## Status

Allowed values: `todo`, `in-progress`, `review`, `done`. The Owner gate column lists what must be ticked in `02-owner-setup.md`.

| ID | Brief | Status | Owner gate | Branch / PR | Notes |
|---|---|---|---|---|---|
| P0-01 | Monorepo scaffold | done | A1 A2 A6 | merged 8bb9e12 (local) | Review PASS WITH MINORS, fixed. Remove `minimumReleaseAgeExclude: expo@58.0.25` once aged |
| P0-02 | DB foundation + RLS harness | done | A1 A6 | merged ae376eb (local) | 2 security rounds; all findings fixed or listed under Follow-ups. 173 pgTAP tests |
| P0-03 | CI/CD, APK/AAB, web, backups | todo | A3 A4 A5 | | |
| P0-04 | Design system | done | A6 | merged 60b0cf1 (local) | Review PASS WITH MINORS; 5 fixed. Manual gate (emulator + Chrome, light/dark, largest font) owed by owner |
| P0-05 | In-app updates (tester self-update) | todo | A4 | | |
| P1-00a | Phase-1 tables + RLS | done | — | merged 046e0e4 (local) | 2 security rounds + minor round; 322 tests. Pulled forward into wave 0b |
| P1-00b | Membership & roles RPCs | done | — | merged e05b60c (local) | Security review: changes required, then 3 fix rounds (claim-code rate limit and 8-character codes, helper privilege pins, no self-assigned roles, generic info-request body, DOB lock for dependents, active-guardian filters). 626 tests on the branch |
| P1-00c | Content & operations RPCs | done | — | merged 8c4b6cd (local) | Security review: pass with minors, all 7 fixed in 1 round. At merge, `p1_00c_reports` switched from a stub to the real `block_member` (pinned). Main: 941 DB tests |
| P1-01 | Phone OTP auth | done | (real OTP: B1/B2 B3) | merged 0f7b986 (local) | 2 security rounds (hook JSON replies, atomic throttle RPC, verify_jwt, lock pinned); E2E with the hook on: GoTrue surfaced 502/429; web login with test number verified |
| P1-02 | Profile, minors, guardians, waiting room | done | — | merged 78995bd (local) | Review CHANGES REQUIRED (waiting-room poll untested) + 2 fix rounds; adds refreshMembership and /adult-consent routing in session.tsx; draft cleared on sign-out; no contact toggles for minors |
| P1-03 | Approvals | todo | B4 | | |
| P1-04 | Admin shell, members, roles, audit | done | B4 | merged 494f63d (local) | Opus security review (upgraded: export RPC) + re-review; adds migration p1_04_admin_rpcs (branch move, audited export, settings allowlist). Export is web-only |
| P1-05 | Directory | done | — | merged 7cb9bf6 (local) | Review PASS WITH MINORS; 1 fix round (report-limit message, load-more error, filter test). Turns `app/(app)/_layout.tsx` into Tabs. Main: 94 app tests |
| P1-06 | Notifications, push, web push, PWA | todo | A3 | | |
| P1-07a | Events, RSVP, reminders | done | — | merged 0815a6d (local) | Review CHANGES REQUIRED (duties dead end) then 2 fix rounds; reminders cron, reschedule reset, waitlist/cancel notices. Main: db 1184, deno 23, jest 296 |
| P1-07b | Delegate passes & offline check-in | in-progress | — | feat/P1-07b | Own stack aiaia-app-b (544xx) |
| P1-08 | Roster import/export | done | — | merged 7859364 (local) | Review PASS WITH MINORS + 1 fix round (no raw-cell echo, true row numbers, parse errors, partial batches). Web-only. Main: db 1184, deno 23, jest 460 |
| P1-09 | Public website & policy pages | done | (approval: C2) | merged 710841e (local) | Review PASS WITH MINORS, fixed. `[TO BE PROVIDED BY AIAIA]` placeholders in docs/legal/ await C2; flip `app_settings.legal_approved` to true when approved |
| P1-10 | E2E + tester release | todo | B1/B2 | | Runs last in Phase 1 |
| P1-11 | Reporting & enforcement | todo | B4 | | |
| P1-12a | Email: official sender, verification, channel | todo | A3 (AIAIA email account) | | |
| P1-12c | Super-admin device verification (once per device) | todo | B4 | | |
| P1-12b | Support: phone-number change | todo | B4 | | |
| P1-13a | Settings, export, account deletion | todo | — | | |
| P1-13b | Retention purge | todo | B4 (retention approved) | | |
| P1-14 | Digital member ID & branch transfers | todo | — | | |
| P1-15 | Minor safety: guardian check-in alerts | todo | B1 (template), B4 (safety leads) | | |
| P2-00a | Payments schema + helpers | todo | — | | |
| P2-00b | Certificates + media schema, storage & PDF | todo | — | | |
| P2-00c | WhatsApp schema + RPCs | todo | — | | |
| P2-01 | Online payments | todo | C3 (test keys) | | |
| P2-02 | Offline payments & treasurer | todo | C3 | | |
| P2-03 | Certificates | todo | C4 | | |
| P2-04 | Media pipeline (Spaces) | todo | A3 (Spaces) | | |
| P2-05 | Gallery + Review archive | todo | C5 | | |
| P2-06 | Official WhatsApp messaging | todo | B1 C6 | | |
| — | **Public launch gate → v1.0** | todo | **all of Stage C** | | |
| P3-00 | Phase-3 schema | todo | — | | |
| P3-01 | Jobs board | todo | — | | |
| P3-02 | Quizzes & badges | todo | D | | |
| P3-03 | Polls | todo | — | | |
| P3-04 | Mentorship | todo | D | | |
| P3-05 | Document library | todo | D | | |
| P3-06 | Birthday shout-outs | todo | — | | |

**Next wave:** waves 0a, 0b, 1b and 1c are complete, apart from P0-03. Main is green at 494f63d: lint, typecheck, `test` (296), `check:seed`, `db:reset`, `db:test` (1184), deno function tests (23) and `web:build` pass, and a test-number web login was checked in the browser. Wave 1d is in progress: **P1-02 ∥ P1-07b ∥ P1-08**. **P1-06 waits on owner item A3 (Expo + Firebase).** P0-03 still needs owner items A4/A5. The target dates are in [`06-timeline.md`](06-timeline.md).

### TODO: team onboarding (2026-11-14)

The team is three people: a UI dev, a backend dev and the owner (project lead, coordinating). The goal is that whatever the devs pull from GitHub is workable, and they build on these rules and foundations instead of starting from scratch. Do these in order:

1. ☑ **Finish wave 1b first** (done 2026-11-14, merged e05b60c and 8c4b6cd). Merge P1-00b and P1-00c. Their RPC signatures and `packages/shared` types are the contract both devs build on.
2. ◐ **Fresh history, then GitHub.** The secret scan, the fresh root commit (`712e9bc`) and the first push to `github.com/meepdong/AIAIA_app` were done on 2026-11-14. Still open: A4, A5 and P0-03.
   - Scan for secrets.
   - Make a single fresh root commit, and keep the old history as a local `archive/pre-github` branch.
   - Rebase any open branches onto it, and update the commit references in this README.
   - Owner items A3 (repo and org), then A4 and A5. **The repo is live (2026-11-14):** `github.com/meepdong/AIAIA_app` is public, and `main` was pushed as the single root commit `712e9bc`. Until P0-03 adds branch protection, the owner pushes `main` (agents may not run `git push`).
   - **Secret scan, done 2026-11-14:** all branches and the full history (58 commits on main). No keys, tokens, JWTs, private keys or env files were found, and no data files are tracked. Every phone number is a `+91 90000 000xx` fixture, apart from one placeholder example in the P1-14 import gate. Every email is a fake (`example.test`/`example.com`) or a tooling default. **Author email (owner, 2026-11-14):** use the GitHub noreply address. It's set as the repo-local `user.email`, so every worktree uses it. The fresh root commit replaces the older commits, which carry the owner's personal email.
   - Then P0-03: CI and branch protection (PR + `ci` check + 1 approval, no force-push).
   - From then on, everything lands through PRs with green CI. No more local merges, by agents or anyone else.
3. ☐ **Freeze the UI↔backend contract.** RPC signatures and `packages/shared/src/schemas/*` are versioned. A change needs the sign-off of both devs and the owner. The UI dev builds against mocks while the backend dev implements.
4. ☐ **Assign briefs to people as well as agents.**
   - Add an **Assignee** column to the status table: a person or an agent.
   - No agent works in paths a human currently owns.
   - Default split:
     - **UI dev:** `packages/ui`, and the screens in P1-02, P1-04 and P1-05.
     - **Backend dev:** `supabase/`, the Edge Functions, and later payments and WhatsApp.
     - **Owner:** contracts, owner items, this status table and the decision log, and deciding agent vs human per brief.
5. ☐ **`CODEOWNERS`.** `supabase/`, auth, payments and anything touching minors' data need the backend dev plus the owner. `packages/ui` needs the UI dev. This takes the place of the agents' security-reviewer for human PRs.
6. ☐ **`CONTRIBUTING.md` for humans.** Cover:
   - Windows setup: Node, pnpm, Docker, the Supabase CLI.
   - `pnpm db:start`, and running the web app.
   - How to pick up a brief.
   - The PR checklist: gates, negative gates, no real data.
   - Say explicitly that the `AGENTS.md` hard rules apply to humans too.
7. ☐ **One schema change in flight at a time.** Either the backend dev owns all migrations, or a migration slot rule applies: rebase and re-timestamp before merging, with CI's `check-migration-order` enforcing it.
8. ☐ **Delegate approvals.** Each dev approves PRs in their own area. The owner approves only contract and security PRs, so the owner doesn't become the bottleneck.
9. ☐ **Walkthrough (30 min) with both devs.** Cover the architecture, `AGENTS.md`, how a brief works, and the build dashboard (`node scripts/build-status.mjs`).
10. ☐ **First briefs are small.** (2026-11-14: the owner chose to have agents build wave 1c, P1-05 and P1-07a included, so the devs’ first briefs come from a later wave.) P1-05 (Directory) goes to the UI dev and P1-07a (Events) to the backend dev, to shake out the workflow before the big briefs.

**Risk to watch:** humans and agents editing the same area. Keep the Assignee column strictly current.

### Hand-off notes (2026-11-13)

**Main is green after wave 0a** (ae376eb): lint, typecheck, `test` (21), `check:seed`, `db:reset`, `db:test` (173) and `web:build` pass. `fn:test` is still the placeholder; it now belongs to **P0-03**. Local `db:start` warns "no SMS provider is enabled. Disabling phone login"; P1-01 must enable test-number OTP locally.

**Phase 0 security audit** (skill §6.2): run it over the whole Phase 0 range once P0-03 to P0-05 are merged.

**Follow-ups.** These were listed here before the repo existed. Move them to GitHub issues once P0-03 sets up labels. Hand each to the brief named:
- **P1-00c:** `members_select_active` lets every active member read `status_reason`/`approved_by`, and the `members.privacy` flags aren't enforced on profile columns. Use column masking or a view.
- **The brief that adds `daily_age_transitions` / `app_settings`:**
  - `is_guardian_of` has no age check; it relies on the nightly job.
  - Guardian writes past the 90-day grace period must be blocked.
  - This changes `foundation_members.test.sql` ~45-48; that is a spec-driven test change.
  - `step_up_roles()` should read `app_settings`.
- **P1-01:** Supabase Auth `updateUser({ phone })` lets a member change their own login phone. That bypasses `members.change_phone` and the §5.6 revocation of trusted devices and step-ups. Block or catch it, for example with an `auth.users` trigger.
- **P1-14:** `has_permission(perm, null)` is satisfied only by global/national assignments, so the cross-branch `members.verify_id` must use `my_permissions()`.
- **P1-00c (from the P1-00a review):** `hidden_at` is on the officers' column whitelist, so a branch officer can un-hide content the Enforcement Committee removed. The content-remove RPC should write a separate `removed_at`/`removed_by` that officers can't change, and the member select policies should filter `removed_at is null`.
- **P1-06 (from the P1-00a review):**
  - `push_tokens.token` is unique across users, so whoever registers a device's token first holds it. Register through a `security definer` upsert RPC that moves an existing token to the caller.
  - Notification fan-out must target `status = 'active'` members only, since non-active members can read their own notifications.
- **P1-06 (test gap from P1-00a):** the push-token update/delete and notification `read_at` tests use rows the caller can't see, so they don't pin those write policies. Add tests on visible rows once P1-06 adds the writers.
- **P1-13a:** the `/delete-account` button goes to `/`. Point it at the Settings delete route; there's a TODO in `delete-account.tsx`.
- **P1-11 (from the P1-05 review):** `apps/mobile/src/features/directory/ReportMember.tsx` stands in for `<ReportButton>`. Swap its body for `<ReportButton targetType="member" targetId={memberId} />` and delete `REPORT_REASONS`.
- **P2-04 (from the P1-05 review):** directory cards show initials because `photo_path` is private. Use signed photo URLs once media signing exists.
- **UI polish (from the P1-05 review, low):** the app tabs have no icons yet.
- ~~**P1-01 follow-up (bug):** opening a member page directly landed on `/home`.~~ **Fixed 2026-11-14** in `apps/mobile/src/lib/AuthGate.tsx`: the navigator mounts only once the session state is known, so the requested route survives. Pinned by `src/lib/auth-gate.test.tsx`; checked in the browser (reload on `/events` and `/directory` stays; signed-out `/events` goes to `/phone`; `/privacy` still public).
- **P1-01 (security review):** `updateUser({phone})` can still trigger one SMS to a new number before the DB trigger refuses it. Have the hook reject `phone_change` sends.
- **P0-03 (deploy):** never `supabase config push` (local Twilio placeholder and `test_otp`). Set function secrets `SEND_SMS_HOOK_SECRET`, `OTP_THROTTLE_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `MSG91_*`, `EVENT_REMINDERS_SECRET`, plus `app_settings.event_reminders_secret`. Deploy `auth-send-otp` and `event-reminders` with `--no-verify-jwt`. Add `deno lint` for `supabase/functions`.
- **P1-04 (security re-review, low):** an officer holding `members.manage` can still tell unknown member ids (22023) from real ones in other branches (42501). `errors.ts` has a dead "expects a json" branch, and rule texts not starting with "expects" fall back to a generic message.
- **Later briefs (from the P1-04 review):** `email_daily_cap` is a ceiling (Workspace allows about 2,000/day), not a target. A future `min_app_version` gate must exempt the web admin console. `grievance_officer` email/phone are not format-checked: build `mailto:`/`tel:` links safely.
- **P1-07a (review, low):** native "add to calendar" opens a Google Calendar URL (title, venue and description go to Google); web downloads `.ics`. A real native `.ics` needs `expo-file-system` + `expo-sharing`. The `event_attendees` 5000-row cap raises 54000 but is untested (too heavy for pgTAP). Deleting draft events is not built.
- **P1-02 (review, low):** the `/privacy` and delete-account links on the adult-consent screen are under 44 pt. `updateProfile` writes `members` then `member_private` non-atomically (no RPC).
- **P1-08 (contract):** the roster template has gender, city, occupation, email and guardian columns that are validated but not stored, because `import_roster` takes only name, phone, branch and DOB. Extend the RPC if AIAIA wants them kept.
- **P1-09 test gap (optional):** no test renders the real root layout signed-out at `/privacy`. Signed-out access depends on `(public)` staying outside `Stack.Protected`.
- **P0-03 deploy checks:**
  - Confirm hosted `postgres` can SELECT `auth.sessions`; `has_step_up()` needs it.
  - The `app_settings` defaults (`step_up_roles`, `legal_approved`, …) live only in seeds, like the roles. Move them to a migration before the first remote deploy.
- **P0-04 polish:** done in `fix/ui-polish` (merged 5299965). Leftovers, low severity:
  - Nothing guards the dev gallery staying out of the production web build (today only a 364 B redirect ships). Add a `web:build` grep check in P0-03's CI.
  - `Header`'s 2-line title uses `fontScale`, which is always 1 on web, so browser text-size settings don't trigger it.
  - Gallery toasts follow the app theme, not the gallery's forced theme (dev only).
- **Owner decision:** lock `members.full_name` after approval, or bump `pass_version` when it changes, since the name is printed on the ID and certificates.
- **Owner question:** today, *officer* means any holder of `members.approve`: branch president and treasurer, national president, treasurer and members, mentor, and super admin with step-up. Enforcement committee and support staff are not officers. Confirm.
- **Owner question:** can a member under 18 hold an officer role, such as branch secretary? Today `assign_role` (P1-00b) allows it, and under the officer ruling that minor would then read every member's phone and DOB nationwide. Options: block officer roles for under-18s, or allow it.
- **Owner question:** may event check-in staff be under 18? Staff see the check-in pack, which lists other minors' age groups and guardians' names.
- **Owner question:** today a single Enforcement Committee member can suspend any super admin (except the last one) without a step-up. Should blocking a holder of a global role need `system.config` (super admin with step-up)?
- **Owner question:** a suspended (blocked) member can delete their own account. After the 6-month purge they could re-register with the same phone. Should deletion be refused while suspended, or should blocked phones be kept on a hashed blocklist?
- **Owner question (before P1-15):** check-in staff can record a "walk-in" arrival for any active member without scanning their signed QR. Once guardian alerts exist, that could send a false "arrived" alert. Should the server verify the QR signature, or should alerts skip unverified walk-ins? A partial guard (branch events reject out-of-branch walk-ins) is going in now.
- **Owner question:** the guardian grace period after a dependent turns 18 can be set from 0 to 365 days (default 90) in admin Settings. Is a 365-day maximum OK?
- **P1-14:** `verify_member_id` has no rate limit (callers are officers and support staff only, and every call is audited). Add a per-caller cap, for example 300 an hour.
- **P1-07a:** a member promoted from the waitlist isn't notified.
- **P1-08 or support:** dependents past the 18th-birthday grace period with no login have no way to get one; their guardian no longer has access. They need an officer or support path.
- **Open:**
  - The `net.*` grants to anon/authenticated are owned by `supabase_admin` and can't be revoked from a migration; `net` is not an exposed API schema.
  - `scripts/db-lib.mjs` uses `shell: true` (local only).
  - Roles, permissions and branches live only in `seed.sql`, so `db push` won't create them on remote projects; move them to a migration before P0-03 deploys.
  - Remove `minimumReleaseAgeExclude: expo@58.0.25` from `pnpm-workspace.yaml` once the release is old enough.

**Candidate conventions to add to AGENTS.md** (from agents' reports, not yet adopted):
- When a table's select policy is wider than its write policies, pgTAP must test a blocked write by a caller who **can see** the row, and assert visibility first. A write against an invisible row pins nothing.
- Negative gates must produce SQL that still applies. Check that `db reset` printed `Finished` before trusting a failure.

## Decisions log

| Date | Decision | By |
|---|---|---|
| 2026-11-10 | Android + web first; iOS later (sponsor / Apple waiver / ~₹12k/yr) | Owner |
| 2026-11-10 | Ages 14–17 join with their own phone; the branch officer attests guardian consent; under-14s join via a guardian account | Owner (lawyer check pending) |
| 2026-11-10 | Money routing (central vs branch accounts) deferred; every payment carries its branch | Owner |
| 2026-11-10 | Open source on GitHub; free CI/CD; portable stack | Owner |
| 2026-11-11 | One Expo codebase for Android + web + admin; Supabase stays as the backend | Owner |
| 2026-11-11 | APK sideloading is for testers only; publishing goes through the Play Store under AIAIA's D-U-N-S | Owner |
| 2026-11-11 | No CAPTCHA; per-number OTP throttling in our hook; the auth provider may change later (isolated in `packages/api/src/auth`) | Owner |
| 2026-11-11 | Sensitive fields move to `member_private`; contact details only via masked RPCs | Owner |
| 2026-11-11 | Backups encrypted with `age` (owner holds the private key), stored in Bangalore, kept ≤ 6 months; no data ever in the repo, logs or artifacts | Owner |
| 2026-11-11 | **User data and files stored in India:** Supabase Mumbai + DigitalOcean Spaces Bangalore (replaces Cloudflare R2, which has no India region) | Owner |
| 2026-11-11 | Certificates: designer PDF + in-app placeholder boxes (AcroForm fields), issued instantly, rendered on demand and cached | Owner |
| 2026-11-11 | Email optional per member. Razorpay sends online-payment confirmations. AIAIA's own business email account sends offline receipts, optional updates and super-admin codes from the official address, via the provider's HTTPS API (no SMTP), at ₹0. The app holds the opt-in list. SES (Mumbai) is the fallback/overflow | Owner |
| 2026-11-11 | Check-in: a static, signed delegate QR (printable). An admin scans it offline; the queue is stored on the admin's phone and synced later | Owner |
| 2026-11-11 | Super admins verify each device **once** (phone OTP + one email code), then stay signed in with no repeat prompts and no expiry. Up to 5 devices. Access ends on revoke, "sign out all devices", block, phone change or role removal. The owner keeps devices secure | Owner |
| 2026-11-11 | Phone changes are handled by admin, super admin, support staff or the owner's personal agent (a dedicated support account), always audited | Owner |
| 2026-11-11 | Anyone can report. Only super admins and the Voluntary Enforcement Committee can enforce a block. The Mentor can **request** a block, and that request goes to the top of the enforcement queue | Owner |
| 2026-11-11 | Rejected and deleted accounts kept 6 months, then purged; financial-record retention per AIAIA's accountant | Owner |
| 2026-11-11 | Members aged 35+ belong to the parent organisation (`wing = aiaia`); the app will later serve all of AIAIA | Owner |
| 2026-11-11 | The update check uses `version.json` on our site and points to the Play Store once listed | Owner |
| 2026-11-11 | Web push + PWA moved to Phase 1; pushes are batched; high priority for important ones | Owner |
| 2026-11-11 | AI coding-agent costs are borne by the owner and excluded from the project budget | Owner |
| 2026-11-12 | **Members' group suggestions added:**<br>(1) At 18 the account is handed to the member, who must give their own adult consent; guardian links end.<br>(2) Cash/offline payments can be recorded by branch treasurers or an event's collection team (e.g. the NYM committee), including offline at the venue; receipts are sent automatically.<br>(3) A digital member ID (same signed QR as the pass) that any branch can verify, plus branch transfers.<br>(4) Guardian WhatsApp/push alerts when a minor checks in at an event | Owner |
| 2026-11-12 | **No leave scan.** Passes are scanned once, on arrival. Parents get an "arrived" alert only, and there is no "still checked in after the event" warning. Safety leads see a minors list with guardian contacts | Owner |
| 2026-11-12 | **Tester self-update:** testers install the APK once; after that the app downloads new builds from GitHub Releases and opens Android's installer (one tap). Production builds update via the Play Store. Brief P0-05 | Owner |
| 2026-11-12 | **Multi-agent workflow:** Opus orchestrates; Sonnet makes 35 of 43 briefs; Opus makes the 8 schema briefs, reviews the 20 security-sensitive ones and handles escalations; Haiku runs suites | Owner |
| 2026-11-13 | **Phase 0 placeholders:** app name "AIAIA Youth", Android id `org.aiaia.youth` (`.staging`, `.dev`), neutral colours and placeholder branch names until the logo, colours and official branch register arrive. The app id is effectively permanent once published | Owner |
| 2026-11-13 | Build locally first; the GitHub remote (and so CI/PRs for P0-03) comes later | Owner |
| 2026-11-13 | NativeWind web fix: Tailwind `darkMode: 'class'` (the default `media` mode crashes NativeWind 4 on web; the app still follows the system scheme). `apps/mobile/tsconfig.json` keeps the include list Expo SDK 58 writes. `.claude/launch.json` runs the web app (`web`) | Orchestrator (owner approved merge) |
| 2026-11-13 | **Officers see all private data, by design:** every officer (active holder of `members.approve`) can read every member's phone, DOB, email and emergency contact, in every branch, minors included. Officers are AIAIA officials and trusted. Ordinary members still see contact details only through masked RPCs | Owner |
| | Open-source licence: AGPL-3.0 used as the working placeholder | *pending committee* |
