# Phase 0: Foundation briefs

Every brief uses the same block structure:
- **Meta:** size, agent, depends on, parallel with, owner gates
- **Owns:** the paths this brief may create or edit
- **Shared touch points:** small additive edits allowed outside Owns
- **Must:** the requirements
- **Out of scope**
- **Gates:** `G<n> outcome — CHECK — EXPECT`
- **Manual gates**

Rules come from `AGENTS.md` and `01-architecture.md`.

---

<a id="p0-01"></a>
## P0-01 Monorepo scaffold

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** nothing
- **Parallel with:** P0-02
- **Owner gates:** A1, A2, A6 (app name and app id; placeholders are fine until branding arrives)

**Owns:** the repo root files, `apps/mobile/` (scaffold only), `packages/shared/`, `packages/api/`, `packages/ui/` (empty shell; P0-04 fills it), `scripts/`

**Must**
1. **Workspace setup.**
   - pnpm workspace with `apps/*` and `packages/*`.
   - `.npmrc` with `node-linker=hoisted`.
   - The root `package.json` defines **every script** in `01-architecture.md §4`. For scripts whose backing files don't exist yet (`db:*`, `fn:*`, `e2e:*`, `android:apk`), point at `scripts/*.mjs` that print a clear "not set up yet (P0-02/P0-03/P1-10)" message and exit 0, until the owning brief replaces them.
2. **The app.**
   - Expo app in `apps/mobile`, created from the latest stable SDK with Expo Router and TypeScript strict.
   - `app.config.ts`:
     - reads `APP_VARIANT` (`development | staging | production`) and sets name / Android package (`org.aiaia.youth`, `.staging`, `.dev`) and scheme (`aiaiayouth`)
     - sets `web.output: "single"`
     - sets the `android.permissions` minimum
3. **Route groups and auth gate.**
   - Route groups `(auth)`, `(app)`, `(admin)` with placeholder screens.
   - `app/_layout.tsx` contains an **auth-gate stub** that reads a mocked session state, so later briefs only swap the data source.
4. **Supabase client and providers.**
   - `apps/mobile/src/lib/supabase.ts` creates the client from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   - Native session storage uses the **LargeSecureStore** pattern: AES key in `expo-secure-store`, encrypted payload in AsyncStorage. Web uses localStorage.
   - `detectSessionInUrl: false` on native.
   - React Query provider, safe-area provider and a NativeWind setup that works on both Android and web.
5. **Shared packages.**
   - `packages/shared`: `permissions.ts` (the permission-key union from `01-architecture.md §6`), `money.ts` (paise helpers: `formatINR(paise)`), `dates.ts` (Asia/Kolkata formatting, `isMinor(dob, today)`), and a placeholder `db.types.ts`.
   - `packages/api`: exports a `createApi(supabase)` factory, so feature folders register into one object.
6. **Lint and tests.**
   - ESLint (`eslint-config-expo`) + Prettier, and `tsc --noEmit` per workspace.
   - Jest with `jest-expo` and Testing Library, including one example test each for `isMinor` and `formatINR`.
7. **Repo files.**
   - `.gitignore`: `node_modules`, `.expo`, `dist`, `android/`, `ios/` (prebuild output is generated, not committed), `.env*`, `*.keystore`, `supabase/.temp`.
   - `.env.example` lists variable names only.
   - `README.md` covers how to run locally on Windows.
   - Keep the existing root `AGENTS.md` and `CLAUDE.md` as they are; do not overwrite them.

**Out of scope:** real auth, any DB schema, CI, design components.

**Gates**
- G1 Install works — CHECK: `pnpm install --frozen-lockfile` — EXPECT: exit 0
- G2 Lint clean — CHECK: `pnpm lint` — EXPECT: exit 0
- G3 Types clean — CHECK: `pnpm typecheck` — EXPECT: exit 0
- G4 Unit tests run and pass — CHECK: `pnpm test` — EXPECT: `Tests:` line shows ≥ 4 passed, 0 failed
- G5 `isMinor` is pinned — CHECK: temporarily change `isMinor` to return `false`, then run `pnpm test -- dates` — EXPECT: a failure (then restore)
- G6 Web builds — CHECK: `pnpm web:build` — EXPECT: exit 0 and `apps/mobile/dist/index.html` exists
- G7 Android project generates — CHECK: `pnpm --filter mobile exec expo prebuild -p android --no-install --clean` — EXPECT: exit 0, `apps/mobile/android/app/build.gradle` exists, package `org.aiaia.youth.dev` when `APP_VARIANT=development`

**Manual gates**
- `pnpm --filter mobile start` opens on the Android emulator and in a browser, showing the placeholder phone screen.

---

<a id="p0-02"></a>
## P0-02 DB foundation + RLS test harness

**Meta**
- **Size:** M
- **Maker:** Opus (`schema-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** nothing
- **Parallel with:** P0-01
- **Owner gates:** A1 (Docker, Deno), A6 (the official branch register; use placeholder branch names until it arrives)

**Owns:** `supabase/` (config, first migrations, `seed.sql`, `seeds/p0-02.sql`, `tests/`), `scripts/db-*.mjs`, `scripts/check-seed-fake.mjs`, `scripts/fake-names.json`

**Must**
1. `supabase init`, region-agnostic `config.toml`:
   - Phone auth enabled, auto-confirm off.
   - **Test OTP numbers** for local dev: `919000000001`–`919000000020` → code `123456`.
   - Send SMS hook disabled locally (test numbers bypass it).
   - Extensions: `pgtap`, `pg_trgm`, `pg_cron`, `pg_net`, `citext`.
   - `[db.seed] sql_paths = ['./seed.sql', './seeds/*.sql']`, so every later brief adds its own seed file without editing a shared one.
2. Migration `..._p0_foundation.sql`:
   - **Enums:** `member_status` (including `deleted`), `role_scope`, `consent_method`, `audience`.
   - **Tables** (columns exactly as in `01-architecture.md §6`): `branches`, `members`, **`member_private`**, `member_guardians`, `roles`, `permissions`, `role_permissions`, `role_assignments`, `member_status_events`, `audit_log`.
   - **RLS enabled on all of them**; no permissive defaults.
   - **Helper functions** (`stable`, `security definer`, `set search_path = ''`):
     - `public.current_member_id()`: the member row for `auth.uid()`.
     - `public.is_active()`
     - `public.has_permission(perm text, branch uuid default null)`
     - `public.my_permissions()`: returns `(permission_key, branch_id)` rows.
     - `public.is_minor(member_id uuid)`: reads the DOB from `member_private`
     - `public.has_step_up()`: returns `false` until P1-00a adds `admin_step_ups`. `has_permission` already applies the step-up rule from `01-architecture.md §5.6`. With no step-up table yet, super-admin-only permissions are unusable in Phase 0, which is intended.
   - **Audit:**
     - `public.write_audit(action, entity, entity_id, details)`, callable only from other security-definer functions (revoke from `anon` and `authenticated`).
     - A trigger that raises an exception on UPDATE/DELETE of `audit_log`.
   - **Baseline policies:**
     - `branches`: select for `authenticated` (including pending, who need the list); write requires `system.config`.
     - `members`:
       - A user selects their own row.
       - **Active users select active members' rows.** The table holds no sensitive fields, so this is safe.
       - A user updates their own row only for whitelisted columns. Use a trigger that rejects changes to `status`, `approved_*`, `user_id`, `wing` and `pass_version`.
     - `member_private`:
       - Select and update for the member themselves and their guardians, via **active** `member_guardians` links only (`ended_at IS NULL`).
       - Select only for callers with `members.approve` for the member's branch.
       - **Everyone else is denied.** Other members only ever see contact details through `search_directory` (P1-00c).
     - `roles` / `permissions` / `role_permissions`: select for active users.
     - `role_assignments`: select own, plus all for `roles.assign`; writes only via the RPC added in P1-04.
     - `audit_log`: select requires `audit.view`; no insert/update/delete policies (writes go through `write_audit`).
3. `seed.sql` + `seeds/p0-02.sql`:
   - All roles, permissions and role_permissions from `01-architecture.md §6`, including `support_staff` and `enforcement_committee`. Later phases add only their own new permissions, in their own seed files.
   - The branches.
   - **Fake** dev members, each with `members` + `member_private` rows, fake names and the test phone numbers:
     - one per role: super admin, mentor, national president, national treasurer, branch president of branch A, branch president of branch B, enforcement committee member, support staff
     - active members A and B
     - a pending applicant
     - a 16-year-old member
     - a dependent aged 9, with a guardian
     - a suspended member
     - a pending 36-year-old applicant
     - a member whose DOB is computed as exactly 35 years ago today (`current_date - interval '35 years'`)
     - a member whose DOB is exactly 18 years ago today, with their own login and an active guardian link
     - a dependent (no login) who turned 18 more than 90 days ago, with an active guardian link
4. pgTAP harness:
   - `supabase/tests/00_helpers.sql` provides `tests.authenticate_as(member_key text)`, which sets `request.jwt.claims` and `role authenticated`, plus `tests.as_anon()` and `tests.clear_auth()`. You can install `basejump-supabase_test_helpers` via dbdev, or write equivalent helpers.
   - Tests:
     - `foundation_rls.test.sql`: every table has RLS on (`select tests.rls_enabled('public')` or an equivalent check over `pg_tables`).
     - `foundation_has_permission.test.sql`: branch president A has `members.approve` for A but **not** B; national roles have it for any branch; an expired assignment (`ends_on` yesterday) grants nothing; pending users get nothing.
     - `foundation_members.test.sql`:
       - A pending user sees only their own `members` row.
       - An active member sees other active members' `members` rows, but **zero rows** of others' `member_private`.
       - A guardian sees their dependent's `member_private`. A guardian whose link has `ended_at` set sees **zero rows**.
       - Branch president A sees `member_private` for branch A applicants only.
       - Nobody can change their own `status`.
     - `foundation_audit.test.sql`: updating or deleting `audit_log` raises an error.
5. Scripts: `db:start`, `db:stop`, `db:reset`, `db:test`, `db:types` wired in root `package.json` (replacing the P0-01 stubs).

**Out of scope:** onboarding RPCs (P1-00a/b/c), Edge Functions.

**Gates**
- G1 Migrations apply on a clean DB — CHECK: `pnpm db:start && pnpm db:reset` — EXPECT: `Finished supabase db reset`
- G2 pgTAP passes — CHECK: `pnpm db:test` — EXPECT: `All tests successful.`
- G3 Branch scoping is pinned — CHECK: patch `has_permission` to ignore `branch_id`, run `pnpm db:reset && pnpm db:test` — EXPECT: `foundation_has_permission` fails (restore after)
- G4 The waiting room is pinned — CHECK: patch the `members` select policy to drop `is_active()`, reset, test — EXPECT: `foundation_members` fails (restore)
- G5 Types generate — CHECK: `pnpm db:types` — EXPECT: `packages/shared/src/db.types.ts` contains `members:` and `has_permission:`
- G6 Only fake people in the seed — CHECK: `pnpm check:seed`. The script (`scripts/check-seed-fake.mjs`) fails if any phone in `supabase/seed.sql`, `supabase/seeds/` or `supabase/tests/` is outside `+91 90000 000xx`, or if any name is not in `scripts/fake-names.json`. CI runs it too. — EXPECT: `seed OK`
- G7 Private data is isolated — CHECK: add a policy letting active users select `member_private`, then `pnpm db:reset && pnpm db:test` — EXPECT: `foundation_members` fails (restore afterwards)

---

<a id="p0-03"></a>
## P0-03 CI/CD: checks, Android APK, web deploy, DB deploy, backups

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P0-01 (P0-02 for the DB jobs)
- **Parallel with:** P0-04
- **Owner gates:** A3, A4 (secrets present; jobs needing missing secrets must skip with a clear notice, not fail)

**Owns:** `.github/`, `scripts/android-*.mjs`, `scripts/backup-*.mjs`, `scripts/check-migration-order.mjs`, `apps/mobile/plugins/with-release-signing.js` (Expo config plugin)

**Must**
0. **Public-repo safety. This applies to every workflow.**
   - Fork PRs run only `ci.yml`, via the `pull_request` event, which exposes no secrets. **Never use `pull_request_target`.**
   - Release, deploy and backup jobs run only on `main`, on tags, on schedule or on manual dispatch. Each uses GitHub Environments (`staging` / `production`; production needs owner approval).
   - Every job sets `permissions:` to the minimum it needs.
   - Pin third-party actions to a commit SHA.
   - No step prints environment variables or data. Use `::add-mask::` for derived values.
   - **No member data is ever uploaded as an artifact.**
1. **`ci.yml`** runs on PRs and pushes to main, on ubuntu-latest.
   - Steps:
     1. pnpm cache, then `pnpm install --frozen-lockfile`
     2. lint, typecheck, test
     3. `pnpm check:seed`
     4. `node scripts/check-migration-order.mjs`, which fails if a PR adds a migration whose timestamp is not newer than the newest one on `main`. The orchestrator re-timestamps it; see the playbook.
     5. `supabase start` (CLI setup action), then `pnpm db:reset`, `pnpm db:test`
     6. **`denoland/setup-deno`**, then `pnpm fn:test`
     7. `pnpm web:build`
   - The "required" status check name is `ci`.
2. **`android-release.yml`** runs on tag `v*` and on manual dispatch with input `variant` (staging | production).
   - Setup: Node + pnpm + **Java 17 (temurin)** + Gradle cache.
   - Build:
     1. `APP_VARIANT=<variant> npx expo prebuild -p android --no-install --clean`
     2. Decode `ANDROID_KEYSTORE_BASE64` to a temp file outside the repo.
     3. The config plugin `with-release-signing.js` injects a `release` signingConfig that reads keystore path and passwords from env vars (never written to committed files).
     4. `./gradlew assembleRelease` (APK, for tester sideloading) and `bundleRelease` (AAB, for upload to Play internal testing now and the Play Store from v1.0).
   - Output:
     - Rename the files to `aiaia-youth-<variant>-<version>.apk/.aab`.
     - Compute `sha256`.
     - Attach to a GitHub Release (for tags) or a workflow artifact (for dispatch).
   - Version:
     - `versionCode` comes from `github.run_number`.
     - `versionName` comes from the tag.
     - Both are passed into `app.config.ts` via env.
   - Delete the keystore temp file in an `always()` step.
   - **Tester releases** (`variant=staging` on a `v*` tag) are published as normal releases. The `update-staging.json` manifest is attached by the step P0-05 adds (`node scripts/write-update-manifest.mjs`), so testers' phones can update themselves.
3. **`web-deploy.yml`.**
   - Trigger: push to main → staging Pages preview; tag `v*` → production.
   - Steps:
     1. `pnpm web:build` with the right `EXPO_PUBLIC_*` vars. This also writes `version.json`.
     2. Write `dist/_redirects` with `/* /index.html 200`.
     3. `wrangler pages deploy apps/mobile/dist --project-name aiaia-youth-web --branch <main|production>`.
   - The Pages project's production branch must be `production` (owner setup A3). Otherwise a push to `main` would go live.
4. **`db-deploy.yml`.**
   - On push to main, with changes under `supabase/`: `supabase db push` and `supabase functions deploy` to **staging**.
   - On tag: the same to **prod**, behind a GitHub **Environment** `production` that requires manual approval.
5. **`backup.yml`**: nightly cron, Environment `production`.
   1. Dump the database with `supabase db dump --db-url <session-pooler URL>`. The **session pooler** (IPv4) is required, because Supabase's direct connection is IPv6-only and GitHub runners have no IPv6. Run it with `--data-only` plus a separate schema dump, or as a single dump, whichever restores cleanly in the restore test.
   2. **Stream it through `gzip | age -r "$BACKUP_AGE_RECIPIENT"`**. The plaintext never touches disk.
   3. Upload to **DigitalOcean Spaces BLR1** at `backups/YYYY/MM/DD.sql.gz.age`, with `aws s3 cp --endpoint-url https://blr1.digitaloceanspaces.com`.
   4. **Retention: 30 dailies + 5 monthlies (≤ 6 months)**, enforced by a prune script.
   - The job never echoes data and never uploads artifacts.
   - It skips cleanly if the secrets are absent.
   - `scripts/backup-restore.md` documents the quarterly restore test: download, `age -d -i <private key>`, then restore into a scratch project.
6. **Hygiene.**
   - `dependabot.yml` (npm weekly, github-actions monthly).
   - `CODEOWNERS` (the 3 maintainers on `supabase/` and `.github/`).
   - PR template with a gate checklist.
   - Branch-protection instructions in `docs/build/README.md` (the owner applies them).
7. **`scripts/android-local.mjs`** for `pnpm android:apk`, so a local Windows build works: it uses `gradlew.bat` on Windows and a debug signing fallback when no keystore env is set.

**Out of scope:** iOS, EAS, Play Store upload.

**Gates**
- G1 Workflows are valid YAML and pass actionlint — CHECK: `npx --yes @action-validator/cli .github/workflows/*.yml` (or `actionlint` if installed) — EXPECT: no errors
- G2 CI is green on the PR — CHECK: `gh pr checks <pr>` — EXPECT: `ci` pass
- G3 A signed APK is produced — CHECK: manual dispatch `android-release` with `variant=staging`, then `gh run download <run-id>` — EXPECT: an `.apk` artifact; `apksigner verify --print-certs <apk>` shows the release cert (not `Android Debug`)
- G4 No secrets in the repo — CHECK: `git grep -n -E "BEGIN (RSA|PRIVATE)|storePassword\s*=\s*['\"][^$]" -- .` — EXPECT: no output
- G5 Web deploys — CHECK: the `web-deploy` run on main — EXPECT: success and a preview URL in the logs
- G6 No dangerous triggers — CHECK: `git grep -n "pull_request_target" -- .github` — EXPECT: no output
- G7 Migration-order check works — CHECK: in a scratch branch, add a migration dated earlier than the newest one on main, then run `node scripts/check-migration-order.mjs` — EXPECT: a non-zero exit naming the file (delete the scratch migration afterwards)
- G8 Backups are encrypted — CHECK: manually dispatch `backup.yml` on staging, then download the object and run `head -c 21 <file>` — EXPECT: `age-encryption.org/v1`

**Manual gates**
- The APK installs on a real phone over an older build without "App not installed" (same signature, higher versionCode).

---

<a id="p0-04"></a>
## P0-04 Design system

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P0-01
- **Parallel with:** P0-03
- **Owner gates:** A6 (logo and colours; use neutral placeholders until they arrive)

**Owns:** `packages/ui/`, `apps/mobile/app/(app)/_dev/ui-gallery.tsx` (dev-only route)

**Must**
1. **Tokens:** colour roles (primary, onPrimary, surface, surfaceAlt, text, textMuted, border, success, warning, danger), each with light and dark values; spacing scale; radius; typography scale (supports system font scaling); elevation. Exposed both to NativeWind's `tailwind.config` and as a TS object.
2. **Components** (each with an `accessibilityLabel` prop where relevant, a min 44pt hit area, and a web hover/focus ring):
   - `Screen` (safe area + scroll + keyboard avoiding), `Header`, `Button` (primary / secondary / ghost / danger; loading state), `IconButton`
   - Form controls: `TextField` (label, hint, error), `PhoneField` (+91 default), `OtpField` (6 boxes, paste support, SMS autofill hint on Android), `Select`, `DateField`
   - Display: `Avatar` (image + initials fallback), `Card`, `ListItem`, `Badge`, `Tag`, `EmptyState`, `QueryState` (loading / error / empty / offline wrapper for React Query results), `Toast` helper, `ConfirmDialog`, `Sheet`
   - Web-only: `DataTable.web.tsx` (TanStack Table: sort, filter, pagination, row selection), with a native fallback `DataTable.tsx` rendering a simple list.
   - Layout: `AdminLayout` (desktop: sidebar + content; narrow: drawer).
3. **Dev gallery:** a dev-only gallery route showing every component in both themes (hidden in production builds).
4. **Tests:** Testing Library tests for Button (press, disabled, loading), OtpField (paste of 6 digits fills all boxes), and QueryState (all 4 states).

**Out of scope:** feature screens.

**Gates**
- G1 — CHECK: `pnpm lint && pnpm typecheck` — EXPECT: exit 0
- G2 — CHECK: `pnpm test -- ui` — EXPECT: ≥ 8 tests passed, 0 failed
- G3 OTP paste is pinned — CHECK: break the paste handler, run `pnpm test -- OtpField` — EXPECT: a failure (restore)
- G4 — CHECK: `pnpm web:build` — EXPECT: exit 0

**Manual gates**
- The gallery looks right on the Android emulator and in desktop Chrome, in light and dark mode, at the largest system font size.

---

<a id="p0-05"></a>
## P0-05 In-app updates: tester self-update from GitHub Releases + store redirect

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P0-01, P0-03 (release workflow), P0-04 (UI components)
- **Parallel with:** P1-00a
- **Owner gates:** A4 (signing key). Every update must be signed with the **same** key, or Android refuses to install it over the old version.

**Owns:** `src/features/updates/`, `packages/api/src/updates/`, `apps/mobile/plugins/with-tester-updates.js`, `scripts/write-update-manifest.mjs`, `scripts/write-version-json.mjs`, `docs/tester-install.md`

**Shared touch points:**
- `app/_layout.tsx`: the update banner and blocking screen
- `app.config.ts`: the config plugin is added for non-production variants only
- `.github/workflows/android-release.yml`: an upload step for the manifest
- the `web:build` script: writes `version.json`

**Goal:** testers (including the owner) install the app **once**. After that, every new build tags a GitHub Release, and the app on the phone offers **"Update available → Install"** with no cable and no computer.

**Must**
1. **Release manifest** (`scripts/write-update-manifest.mjs`, called by `android-release`)
   - For every tester (`staging`) release, the workflow uploads two assets to the GitHub Release:
     - `aiaia-youth-staging-<version>.apk`
     - **`update-staging.json`**: `{versionCode, versionName, apkUrl, md5, sha256, minVersionCode, notes, publishedAt}`
   - `apkUrl` is the asset's `browser_download_url`. `notes` comes from the release body.
   - The app reads the stable URL `https://github.com/<org>/<repo>/releases/latest/download/update-staging.json`, set by `EXPO_PUBLIC_UPDATE_MANIFEST_URL`. This is a plain file download, not the GitHub API, so the 60/hour API rate limit doesn't apply.
   - Tester builds are published as **normal (non-pre-release) releases**, so `releases/latest` points at them.
2. **Checking for updates** (all Android variants)
   - Checks on launch, on returning to the foreground (at most once every 6 hours), and from **Settings → Check for updates**.
   - The installed build comes from `expo-application` (`nativeBuildVersion`, i.e. versionCode).
   - The manifest is validated with zod. A malformed manifest is ignored silently and logged to Sentry.
   - If `versionCode` is greater than installed: a dismissible banner, "Update v<versionName> available", with **What's new** and **Install**.
   - If installed is below `minVersionCode`: a blocking "Please update to continue" screen, with an Install button.
3. **Tester self-install** (only in `staging` and `development` variants)
   - Download the APK with `expo-file-system`, resumable, with a progress bar, into the cache directory. Delete it after install or on failure.
   - **Integrity:** `getInfoAsync(uri, { md5: true })` must equal the manifest's `md5`, or the file is deleted and the install refused.
   - **Authenticity:** Android itself refuses an update that isn't signed with the same key as the installed app.
   - **Install:** `FileSystem.getContentUriAsync` → `expo-intent-launcher` `ACTION_VIEW` with type `application/vnd.android.package-archive` and the read-URI grant flag. Android then shows its own **"Do you want to install this update?"** screen: one tap. Silent installs aren't possible for sideloaded apps; Android requires that tap.
   - **First time only:** if Android blocks the install, show a short guide screen ("Allow AIAIA Youth to install updates") with a button that opens `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` for our package.
   - **The config plugin** `with-tester-updates.js` adds `android.permission.REQUEST_INSTALL_PACKAGES` for `staging` and `development` **only**.
   - **Production must never contain it.** Google Play restricts that permission, and Play-distributed builds update through Play.
4. **Store redirect** (production variant, once listed)
   - Reads `https://<domain>/version.json` (`scripts/write-version-json.mjs`, written by `web:build`).
   - A newer version shows a banner that opens `market://details?id=org.aiaia.youth`; a version below the minimum shows the blocking screen.
5. **Web / PWA:** when the service worker finds a new build, show a "New version, tap to refresh" toast. Never auto-reload while a form is open.
6. **`docs/tester-install.md`:** plain-language steps covering:
   - the first install from the `/download` page or a GitHub Release
   - allowing "Install unknown apps" once
   - what the update banner looks like
7. **Tests**
   - Unit:
     - versionCode comparison and the banner/blocking decision
     - zod manifest parsing, including a malformed manifest
     - an md5 mismatch deletes the file and refuses install
     - the install flow calls the intent launcher with the right type and flags (mocked)
   - Config: run prebuild for **production** and check the generated `AndroidManifest.xml` has **no** `REQUEST_INSTALL_PACKAGES`; for **staging**, check it **does**.

**Gates**
- G1 — CHECK: `pnpm test -- updates` — EXPECT: pass, including "md5 mismatch refuses install" and "below minimum blocks"
- G2 Integrity pinned — CHECK: skip the md5 comparison, then run G1 — EXPECT: the md5-mismatch test fails (restore afterwards)
- G3 Production stays clean — CHECK: `APP_VARIANT=production npx expo prebuild -p android --no-install --clean`, then `grep -c REQUEST_INSTALL_PACKAGES apps/mobile/android/app/src/main/AndroidManifest.xml` — EXPECT: `0`
- G4 Tester build can self-install — CHECK: the same with `APP_VARIANT=staging` — EXPECT: `1` or more
- G5 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0, and `apps/mobile/dist/version.json` exists

**Manual gates**
1. Install the `v0.1.0` staging APK once on a phone.
2. Tag `v0.1.1`. Within a minute of the release, opening the app shows "Update v0.1.1 available".
3. Tap **Install**, then Android's **Install**. The app reopens on v0.1.1, still logged in.
4. Repeat on a Xiaomi-family phone.
