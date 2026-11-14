# Phase 3 — Growing together

These briefs use the same block structure as Phase 0. Every brief assumes P3-00 has been merged.

---

<a id="p3-00"></a>
## P3-00 Phase-3 schema

- **Size:** M
- **Maker:** Opus (`schema-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** Phase 2 merged and the public launch gate passed (v1.0). From this phase on, **real members** are using the app, so every migration must be backwards-compatible with the live app version.
- **Parallel with:** — (runs alone)
- **Owner gates:** none

**Owns:** `supabase/migrations/*_p3_*.sql`, `supabase/tests/p3_*.test.sql`, `packages/shared` types and schemas, `supabase/seeds/p3-00.sql`. Also adds the `members.privacy.show_birthday` flag, which defaults to false for minors.

**Must**

1. **Tables**
   - **Jobs:** `jobs(id, kind text check in ('job','internship','scholarship','volunteer'), title, organisation, location, remote bool, description, apply_url null, apply_contact null, deadline, posted_by, status text check in ('pending','published','rejected','expired'), moderated_by, created_at)`
   - **Quizzes:**
     - `quizzes(id, title, description, kind text check in ('daily','event','practice'), opens_at, closes_at, time_limit_seconds, created_by, status)`
     - `quiz_questions(id, quiz_id, prompt, options jsonb, correct_index int, explanation, sort)`
     - `quiz_attempts(id, quiz_id, member_id, answers jsonb, score int, duration_ms, submitted_at, unique(quiz_id, member_id))`
     - `question_bank(id, prompt, options, correct_index, explanation, tags text[], difficulty)` (the daily trivia draws from this)
   - **Badges:** `badges(key pk, name, description, icon)`, `member_badges(member_id, badge_key, awarded_at, primary key(member_id, badge_key))`, `streaks(member_id pk, current int, best int, last_day date)`
   - **Polls:** `polls(id, scope, branch_id null, question, options jsonb, multi bool, anonymous bool, closes_at, created_by, status)`, `poll_votes(poll_id, member_id, choices int[], created_at, primary key(poll_id, member_id))`
   - **Mentorship:** `mentor_profiles(member_id pk, fields text[], bio, availability text, max_mentees int, is_listed bool)`, `mentorship_requests(id, mentee_id, mentor_id, message, status text check in ('pending','accepted','declined','closed'), created_at)`
   - **Documents:** `documents(id, title, category, file_path, scope, branch_id null, uploaded_by, created_at)`
2. **New permissions** added to the `role_permissions` seed: `jobs.moderate`, `quizzes.manage`, `polls.national`, `polls.branch`, `documents.manage`, `mentors.manage`.
3. **RPCs**
   - **Jobs:** `post_job(payload)` (any active member; national roles publish immediately, otherwise the job enters `pending`), `moderate_job(id, decision)`
   - **Quizzes:**
     - `start_quiz(quiz_id)` returns the questions **without** `correct_index`
     - `submit_quiz(quiz_id, answers)` scores the attempt server-side, sets `duration_ms` from the start time recorded by `start_quiz`, rejects a second attempt, and updates streaks and badges
     - `leaderboard(quiz_id | period, branch_id null)` shows first name + last initial for minors
   - **Polls:** `vote(poll_id, choices)` (one vote per member; may be changed until the poll closes), `poll_results(poll_id)` (only aggregates when `anonymous`)
   - **Mentorship:** `request_mentor(mentor_id, message)` (respects `max_mentees`), `respond_mentorship(id, decision)`
   - **Daily trivia:** `create_daily_quiz()` is service-only and called by pg_cron at 00:05 IST. It picks 5 unused questions from `question_bank`.
4. **RLS**
   - `quiz_questions.correct_index` is never readable by members. Members read through a view that excludes it; managers read the table.
   - Poll votes on anonymous polls cannot be read by anyone except the voter.
   - Mentorship requests are readable only by the two parties and `mentors.manage`.
   - Jobs: published jobs are visible to active members; pending jobs are visible only to the poster and moderators.
5. **pgTAP tests**
   - A member cannot read `correct_index`.
   - A second `submit_quiz` attempt is rejected.
   - Scoring happens server-side: a client-sent score is ignored.
   - Anonymous poll votes are unreadable by others.
   - A mentor at capacity rejects a new request.
   - The leaderboard masks minors.

**Gates**
- G1 — CHECK: `pnpm db:reset && pnpm db:test` — EXPECT: `All tests successful.`
- G2 Answer hiding is pinned — CHECK: expose `correct_index` in the member view, then reset and test — EXPECT: `p3_quizzes` fails (restore afterwards)
- G3 Poll anonymity is pinned — CHECK: allow select on `poll_votes` for all active members, then reset and test — EXPECT: `p3_polls` fails (restore afterwards)
- G4 — CHECK: `pnpm typecheck` — EXPECT: exit 0

---

<a id="p3-01"></a>
## P3-01 Jobs & opportunities board

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P3-00
- **Parallel with:** P3-02, P3-03, P3-04

**Owns:** `apps/mobile/app/(app)/jobs/`, `apps/mobile/app/(admin)/jobs/`, `apps/mobile/src/features/jobs/`, `packages/api/src/jobs/`, `supabase/migrations/*_p3_01_cron.sql` (auto-expiry job)

**Must**
- **Member side:** a list with filters (kind, location, remote) and search. The detail view has an Apply action that opens the URL or shows the contact. Members can post an opportunity through a form, and the form's copy explains moderation.
- **Admin side:** a moderation queue (approve/reject with a reason, which notifies the poster).
- **Auto-expiry:** a daily pg_cron job sets `status = 'expired'` once the deadline has passed.

**Gates**
- G1 — CHECK: `pnpm test -- jobs && pnpm db:test` — EXPECT: pass / `All tests successful.`, with a test proving expired jobs are hidden from the list
- G2 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p3-02"></a>
## P3-02 Quizzes, daily trivia, leaderboards, badges

- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P3-00
- **Parallel with:** P3-01, P3-03, P3-04
- **Owner gates:** D (the question bank; build with 20 fake questions)

**Owns:** `apps/mobile/app/(app)/play/`, `apps/mobile/app/(admin)/quizzes/`, `apps/mobile/src/features/play/`, `packages/api/src/play/`, the `question_bank` CSV importer under `apps/mobile/src/features/play/admin/`

**Must**
- **Play tab:**
  - a "Today's trivia" card (5 questions, 20 seconds each, with a countdown)
  - event quizzes
  - practice mode (unscored)
  - your streak and badges
- **Quiz flow:**
  - one question at a time
  - the answer is locked on tap
  - results are shown after submission, with explanations
  - attempts can't be retaken
  - the timer is enforced on the server (`duration_ms` with tolerance) as well as in the client
- **Leaderboards:** today, this month, and all-time, each national or per branch.
- **Badges:** first quiz, 7-day streak, 30-day streak, perfect score, top 10 of the month. Badges are awarded in `submit_quiz` and announced with a toast and a notification.
- **Admin:**
  - create event quizzes
  - manage the question bank, including CSV import with zod validation
  - preview quizzes
- **Tests:** unit tests for the timer and answer-lock state machine.

**Gates**
- G1 — CHECK: `pnpm test -- play` — EXPECT: the state-machine tests pass (no answer change after lock; the question auto-advances on timeout)
- G2 Answer lock is pinned — CHECK: allow changing the answer after lock, then run G1 — EXPECT: a failure (restore afterwards)
- G3 — CHECK: `pnpm db:test && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: pass / exit 0

---

<a id="p3-03"></a>
## P3-03 Polls

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P3-00
- **Parallel with:** P3-01, P3-02, P3-04

**Owns:** `apps/mobile/app/(app)/polls/`, `apps/mobile/app/(admin)/polls/`, `apps/mobile/src/features/polls/`, `packages/api/src/polls/`

**Must**
- **Poll cards:** shown on Home and in a Polls list. A member votes, can change their vote until the poll closes, and sees results after voting or after close (an admin setting controls which).
- **Admin:** create polls (scope per permission; single or multi choice; anonymous; close date), close a poll early, export results.
- **Tests:** unit tests for the result percentages and rounding (they must sum to 100).

**Gates**
- G1 — CHECK: `pnpm test -- polls` — EXPECT: pass, including the "sums to 100" test
- G2 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p3-04"></a>
## P3-04 Mentorship matching

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P3-00
- **Parallel with:** P3-01, P3-02, P3-03
- **Owner gates:** D (a list of mentors)

**Owns:** `apps/mobile/app/(app)/mentors/`, `apps/mobile/app/(admin)/mentors/`, `apps/mobile/src/features/mentors/`, `packages/api/src/mentors/`

**Must**
- **Mentor directory:** filter by field, open a profile, and send a request (with a message). A minor's request also notifies their guardian, if one is linked.
- **Become a mentor:** a profile form (fields, bio, availability, capacity). It requires `mentors.manage` approval before the profile is listed.
- **My mentorships:** pending, accepted, and closed. Accepting a request reveals each party's contact to the other.
- **Admin:** approve mentors, and an overview of matches.

**Gates**
- G1 — CHECK: `pnpm test -- mentors && pnpm db:test` — EXPECT: pass / `All tests successful.`
- G2 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p3-05"></a>
## P3-05 Document library

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P3-00, P2-04
- **Parallel with:** P3-06

**Owns:** `apps/mobile/app/(app)/documents/`, `apps/mobile/app/(admin)/documents/`, `apps/mobile/src/features/documents/`, `packages/api/src/documents/`

**Must**
- **Member side:** browse by category (Constitution, Minutes, Forms, Guides); national and own-branch documents are visible. Documents open or download through presigned URLs.
- **Admin side:** upload (`documents.manage`), recategorise, delete.

**Gates**
- G1 — CHECK: `pnpm test -- documents && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p3-06"></a>
## P3-06 Birthday shout-outs

Web push and the PWA moved to P1-06.

- **Size:** S
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P3-00, P1-06
- **Parallel with:** P3-05

**Owns:** `apps/mobile/src/features/celebrations/`, `supabase/functions/birthdays-daily/`

**Must**
- **Daily list:**
  - A job runs at 08:00 IST and builds today's birthday list per branch.
  - It includes only members whose privacy setting `show_birthday` is on. P3-00 adds this setting; it defaults to off for minors. The DOB is read from `member_private` inside the function, and only names are output.
- **"Wish them":** a Home card with a one-tap preset message, sent as an in-app notification. Nobody's age or DOB is shown.

**Gates**
- G1 — CHECK: `pnpm fn:test -- birthdays` — EXPECT: `ok`, including a test proving that members with `show_birthday = false` are excluded and that no DOB appears in the output
- G2 — CHECK: `pnpm lint && pnpm typecheck` — EXPECT: exit 0

---

## Later (not briefed yet; write briefs when they are prioritised)
- **iOS app:** needs an Apple Developer account. Use EAS Build (free tier) or a macOS GitHub runner (macOS minutes are free for public repos, subject to limits). The code base is already iOS-compatible; check push (APNs) and the payment return URL scheme.
- **Branch chat:** Supabase Realtime channels per branch, with moderation and reporting. It needs its own safety design for minors.
- **Elections / formal voting:** needs a separate threat model (secret ballot, eligibility, audit). Don't build it on top of Polls.
- **Volunteer sign-ups and surveys:** extend Polls and Events.
