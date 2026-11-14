# AGENTS.md: rules for every coding agent

This is the AIAIA Youth App: one Expo (React Native) codebase that builds an Android app (Play Store; APK for testers), a web app/PWA and an admin web console. It is backed by Supabase (Mumbai), DigitalOcean Spaces (Bangalore), AIAIA's own business email (with Amazon SES as fallback), Razorpay and the WhatsApp Cloud API. It is open source, but its users' data is private, and many users are minors.

## Claude Code sessions in this repo
- **The main session** runs on Opus as the **orchestrator**. It starts with `/orchestrate`, or `/resume-build` after a break.
- **The workers** are this project's own agents in `.claude/agents/`: `brief-builder` (Sonnet), `schema-builder` (Opus), `brief-fixer` (Sonnet), `brief-reviewer` (Sonnet), `security-reviewer` (Opus) and `suite-runner` (Haiku). **Prefer them over generic plugin agents such as `delegate:*`.** Each brief's **Maker** / **Review** line says which agent builds and which reviews.
- **Worktrees.** Every maker works only inside `.worktrees/<ID>` on branch `feat/<ID>`. The main checkout is never edited by an agent.
- **Shell.** Use the **Bash** tool for project commands, so the permission allowlist in `.claude/settings.json` applies.
- **Never read, open or copy anything outside this repo.** The parent `NYM5` folder holds real member spreadsheets.

## Before you start
1. Read `docs/build/README.md`, which holds the status and the next wave.
2. Read `docs/build/01-architecture.md` §3–7: the layout, scripts, security rules and data model.
3. Read **only your brief's section** in `docs/build/briefs/`. Do not read other briefs unless yours points to them.

## Hard rules
- **Stay in your lane.**
  - Edit only the paths your brief lists under **Owns**.
  - "Shared touch points" get small, additive edits only.
  - Never reformat or reorder other people's code.
- **Schema.**
  - Never edit a migration that is already on `main`. Add a new migration named `<timestamp>_<brief-id>_<what>.sql`.
  - Run `pnpm db:types` in the same commit.
  - Seed data goes only in your own `supabase/seeds/<brief-id>.sql`.
  - From v1.0, migrations must stay compatible with the released app: add freely; rename or drop only in a later release.
- **Sensitive fields.** Phone, DOB, email and emergency contacts live in `member_private`, never in `members`. Ordinary members see contact details only through masked RPCs such as `search_directory`. Officers (active holders of `members.approve`) may read every `member_private` row, nationwide and minors included, by design (owner ruling 2026-11-13).
- **Security** (details in `01-architecture.md` §5).
  - RLS on every table, deny by default.
  - Permission checks go through `has_permission()` only; never check role names.
  - Privileged writes go through `security definer` RPCs with `search_path = ''` and `write_audit`.
  - Every webhook verifies its signature.
- **Guardians** reach a ward's data only through **active** `member_guardians` links. Links end at the ward's 18th birthday. Never add a guardian path that skips `ended_at IS NULL`.
- **Message text.** Push and WhatsApp text never carries phone numbers, DOBs or amounts, with two exceptions:
  - **guardian alerts**, which carry the child's first name, event, venue and time, sent to that child's guardian
  - **receipt emails**, which carry the amount, sent to the payer

  Receipt push and WhatsApp messages carry only the receipt number.
- **Waiting room.** Pending, rejected, suspended and deleted users must see no member content. This is enforced in SQL, not just hidden in the UI.
- **Super admins.** Their powers count only when the session holds a step-up. A step-up comes from a one-time email code on a new device, or from that device's stored trusted-device secret (stored as a hash only, no expiry, and re-checked against the member's status and role on every use). Never add prompts beyond the first verification, and never add any other bypass.
- **Email** is sent only through `_shared/email` (provider HTTPS APIs; SMTP doesn't work from Edge Functions), always from the official AIAIA address.
- **Data location.**
  - Store personal data and files only in Supabase (Mumbai) or Spaces (Bangalore).
  - Push, WhatsApp and email text must not contain phone numbers, DOBs, amounts or other members' details.
  - A new external service that touches personal data needs the owner's approval and an update to `01-architecture.md §5.13` and to the privacy page.
- **CI in a public repo.** Never use `pull_request_target`. Never print secrets or data. Never upload member data as an artifact.
- **Minors** (under 18, computed from `dob`).
  - Never expose a minor's phone or DOB to other members. Officers are the one exception (see Sensitive fields).
  - On public pages, show first name + last initial.
  - No analytics or Sentry user context for minors.
- **No secrets and no real people in the repo.** Fixtures use fake names from `scripts/fake-names.json` and phones `+91 90000 000xx`. Never copy data from member spreadsheets.
- **Money** is integer paise. Dates are `timestamptz`, shown in Asia/Kolkata.
- **Tests are not negotiable.**
  - Never weaken, skip or delete a test to get to green.
  - Never bypass hooks or disable lint rules.
  - A fix for a real bug ships with a test that fails without the fix.
  - **Blocked writes are tested on rows the caller can see.** When a table's select policy is wider than its write policies, the test first asserts the caller can see the row, then attempts the write and checks as owner that nothing changed. A write against an invisible row pins nothing.
  - **One protection, one test.** Where two mechanisms guard the same thing (a policy and a foreign key, say), each needs a test that fails when only that one is removed.
  - **Negative gates must still apply.** Check that `db reset` printed `Finished` before trusting a failure. Never chain `git diff` or `grep` with `&&` in front of the reset, because they exit non-zero on no match and silently skip it. A crash ("Bad plan", "Dubious") is not a pinned assertion.
  - **Testing Library v14 is async:** `await render(...)`, `await fireEvent...`. Keep one React version across the workspace, including `react-test-renderer`.
  - **pgTAP fixture ids:** `grep -rn` an id under `supabase/` before using it in a new test.
- **Commands.** Use the root scripts (`pnpm lint`, `typecheck`, `test`, `check:seed`, `db:reset`, `db:test`, `db:types`, `fn:test`, `web:build`, `e2e:web`, `android:apk`). Package scripts are cross-platform Node; the owner develops on Windows. Edge Function tests need Deno.

## Definition of done (for one brief)
1. Every gate in the brief has run, and you report each one as `G<n> PASS|FAIL — <evidence>`. Where a brief has a negative gate, you showed that it fails with the change set aside, then restored the change.
2. `pnpm lint && pnpm typecheck` pass, along with the narrow tests for your area. If the brief touches SQL, `pnpm db:reset && pnpm db:test` pass too.
3. The work is committed on your own branch `feat/<brief-id>`. You did not merge or push to `main`.
4. Your report has four short parts: commits, gate results, decisions needing review, and what is left.

## When something is unclear
- **Ambiguous spec:** choose the most defensible reading, keep it easy to reverse, and list it under "Decisions".
- **Missing secret or missing owner item** (see `docs/build/02-owner-setup.md`): stop and say exactly which item is missing.
- **A useful rule you learned:** propose it in your report. The orchestrator decides whether it goes into this file.
