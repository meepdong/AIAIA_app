# 01 — Architecture & Conventions

This document is the single source of truth for **how** the app is built, and every brief assumes it. When a brief and this document disagree, this document wins, unless the brief explicitly says it overrides a point.

---

## 1. What we are building

| Deliverable | What it is | How users get it |
|---|---|---|
| **Android app** | Expo / React Native app. GitHub Actions builds a signed AAB + APK | **Testers** (Phases 1–2): install the APK from GitHub Releases **once**, then the app **updates itself** from new GitHub Releases (P0-05). Play internal testing is an alternative. **Public** (from v1.0, Phase 3): Google Play Store listing under AIAIA's verified organisation account (D-U-N-S) |
| **Web app** | The **same Expo codebase**, exported for web as a single-page app | `https://<domain>`. Installable as a PWA. Web push on Android Chrome and on iPhones (iOS 16.4+, once added to the home screen) |
| **Admin console** | Routes under `/admin` in the same app, with desktop layouts | Officers on a laptop via the web app. Simplified layouts on Android |
| **iOS app** (later) | The same codebase, built on a macOS runner or EAS | App Store, once funded |
| **Backend** | Supabase: Postgres + Auth + Edge Functions, **Mumbai (ap-south-1)** | Two projects: `staging` and `prod` |
| **File store** | **DigitalOcean Spaces, Bangalore (BLR1)**, S3-compatible, private, accessed via presigned URLs | Gallery, certificates, receipts, consent forms, avatars, encrypted backups |

## 2. Stack and pinned choices

Use the **latest stable** versions at scaffold time. P0-01 records exact versions. Never upgrade a major version inside a feature brief.

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | |
| App framework | **Expo SDK (latest stable)**, Expo Router | File-based routes for Android, web and later iOS |
| Package manager | **pnpm** workspaces, `node-linker=hoisted` | The layout Expo documents for pnpm monorepos |
| Styling | NativeWind + in-house components in `packages/ui` | |
| Data fetching | `@supabase/supabase-js` v2 behind `packages/api`, plus `@tanstack/react-query` | All server access goes through `packages/api`. This also keeps a future auth-provider switch to one package |
| Forms / validation | `react-hook-form` + `zod`, with schemas in `packages/shared` | |
| Local device DB | `expo-sqlite` | Offline check-in queue and event packs; drafts |
| Images / video | `expo-image` (always pass a stable `cacheKey` = object path), `expo-image-picker`, `expo-image-manipulator`, `expo-video` | |
| QR | `expo-camera` (scanning), `react-native-qrcode-svg` (display), `react-native-view-shot` (save the pass as an image) | |
| Signatures on device | `@noble/curves` (Ed25519 verify, pure JS, audited) | Lets officers verify delegate passes offline |
| Files | `expo-file-system`, `expo-sharing`, `expo-print` (printing passes) | |
| Session storage | `expo-secure-store` + the "LargeSecureStore" pattern on native; `localStorage` on web | |
| Push | `expo-notifications` + Expo Push Service (FCM underneath; APNs later for iOS) + **Web Push (VAPID)** for the PWA | Free. All push code sits behind `supabase/functions/_shared/push.ts` |
| Email | **AIAIA's own business email account** (Google Workspace, Microsoft 365 or Zoho Mail), sending from an official address such as `updates@<aiaia-domain>` through the provider's **HTTPS API** (Gmail API, Microsoft Graph `sendMail` or the Zoho Mail API). **Amazon SES (Mumbai)** is the fallback driver. Both sit behind `_shared/email.ts` (`EMAIL_PROVIDER` env) | **₹0** on AIAIA's existing account. **No SMTP:** Supabase Edge Functions can't reliably open SMTP ports (25/587 blocked, 465 unreliable). Mailbox limits apply (Google Workspace: ~2,000 recipients/day/user), so the dispatcher switches to digests or the SES driver when the queue nears the limit. Used for optional receipts and updates and for super-admin codes |
| Admin tables (web) | `@tanstack/react-table` in `*.web.tsx` | |
| Backend | **Supabase**: Postgres 15+, Auth (phone OTP), Edge Functions (Deno), `pg_cron`, `pg_net` | Open source and self-hostable |
| Login codes | Supabase **Send SMS Hook** → `auth-send-otp` → WhatsApp authentication template, with MSG91 SMS fallback | Per-number throttling lives in the hook. **No CAPTCHA** (owner decision) |
| Object storage | **DigitalOcean Spaces BLR1** via the S3 API. Presigned with `aws4fetch` in `_shared/storage.ts`; provider set only by env (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`) | $5/month includes 250 GiB storage + 1 TiB egress. Any S3-compatible store is a drop-in swap |
| PDFs | `pdf-lib` + `@pdf-lib/fontkit` + `qrcode`. Certificates use **PDF templates with named form fields** (see §9) | Fill + flatten is cheap and stays well under the Edge Function 2 s CPU limit |
| Payments | **Razorpay** Orders API + Standard Checkout on hosted route `/pay/[paymentId]`. Android opens it in `expo-web-browser` | The webhook is the source of truth |
| Messaging | WhatsApp Business Platform (Meta Cloud API) | |
| Web hosting | **Cloudflare Pages** (static `expo export -p web` output + `version.json`) | Holds no member data |
| CI/CD | **GitHub Actions** in a public repo (free). Android built with `expo prebuild` + Gradle | |
| Errors | Sentry (`@sentry/react-native`), with **`sendDefaultPii: false`, no user context, and breadcrumbs scrubbed** | No personal data leaves through crash reports |
| Tests | Jest (`jest-expo`) + Testing Library; **pgTAP via `supabase test db`**; **Deno test** for Edge Functions; Playwright (web); Maestro (Android E2E) | |

**Deliberately not used:**
- Firestore or proprietary document databases
- Required EAS cloud builds
- tRPC
- Cloudflare R2 (it has no India region)
- CAPTCHA

## 3. Repository layout

```
AIAIA_app/                       ← its own git repo (public), at NYM5\AIAIA_app. Holds NO member data, ever.
├─ AGENTS.md / CLAUDE.md
├─ apps/mobile/
│  ├─ app/
│  │  ├─ (auth)/                 ← phone, otp, profile-setup, waiting-room, blocked, claim
│  │  ├─ (app)/<feature>/        ← member area
│  │  ├─ (admin)/<feature>/      ← admin area (permission-guarded; super-admin step-up)
│  │  ├─ (public)/               ← about, contact, privacy, terms, refunds, delivery, pricing,
│  │  │                             delete-account, download, verify/[serial]
│  │  └─ pay/[paymentId].tsx
│  ├─ public/                    ← manifest.json, sw.js, icons; version.json is generated at build time
│  ├─ src/features/<feature>/
│  ├─ src/lib/
│  └─ app.config.ts
├─ packages/{shared,api,ui}/
├─ supabase/
│  ├─ config.toml               ← [db.seed] sql_paths = ['./seed.sql', './seeds/*.sql']
│  ├─ migrations/
│  ├─ seeds/<brief-id>.sql      ← one seed file per brief, so parallel briefs never collide
│  ├─ functions/_shared/  functions/<name>/
│  └─ tests/
├─ e2e/{maestro,playwright}/
├─ scripts/                      ← cross-platform Node scripts
├─ .github/workflows/
└─ docs/
```

### File ownership (lets agents work in parallel)

A feature brief owns only these paths:

- `app/(app)/<feature>/`
- `app/(admin)/<feature>/`
- `src/features/<feature>/`
- `packages/api/src/<feature>/`
- `supabase/functions/<feature>-*/`
- `supabase/tests/<feature>_*.test.sql`
- `supabase/seeds/<brief-id>.sql`
- `e2e/*/<feature>*`

Four places are **shared touch points**. Changes to them must be small and additive:

- tab layout
- `packages/shared/src/permissions.ts`
- `packages/api/src/index.ts`
- `adminNav`

## 4. Standard scripts (stable gate commands)

| Script | Does | Pass signal |
|---|---|---|
| `pnpm lint` | ESLint + Prettier check | exit 0 |
| `pnpm typecheck` | `tsc --noEmit` in every workspace | exit 0 |
| `pnpm test [-- <pattern>]` | Jest | `Tests:` line shows 0 failed |
| `pnpm db:start` / `db:stop` | `supabase start` / `stop` (needs Docker) | |
| `pnpm db:reset` | Re-applies migrations + all seed files | `Finished supabase db reset` |
| `pnpm db:test` | `supabase test db` (pgTAP) | `All tests successful.` |
| `pnpm db:types` | Regenerates `packages/shared/src/db.types.ts` | only intended diffs |
| `pnpm fn:serve` | `supabase functions serve` | |
| `pnpm fn:test [-- <pattern>]` | `deno test` over `supabase/functions/**/*.test.ts` (needs **Deno**) | `ok`, 0 failed |
| `pnpm check:seed` | `node scripts/check-seed-fake.mjs` | `seed OK` |
| `pnpm web:build` | `expo export -p web` + writes `dist/version.json` | exit 0 |
| `pnpm e2e:web` | Playwright | 0 failed |
| `pnpm android:apk` | prebuild + Gradle release (Windows-aware) | APK produced |

## 5. Data, security & privacy rules (non-negotiable)

1. **RLS on every table**, deny by default. Every policy has pgTAP tests covering both allowed and blocked cases.
2. **Sensitive personal fields live in `member_private`**: phone, DOB, email, emergency contact, guardian contact. Its RLS:
   - the member, and their guardians, can read and update their own row;
   - officers (active holders of `members.approve` in any branch or nationally) get read-only access to every member's row, in every branch, minors included. This is by design (owner ruling 2026-11-13): officers are AIAIA officials;
   - everyone else is denied.

   The `members` row holds only non-sensitive fields, and active members may read active members' `members` rows. Contact details are exposed only through `security definer` RPCs (`search_directory`) that apply privacy flags and minor masking.
3. **The waiting room is enforced in SQL.** Every member-content policy includes `public.is_active()`. Pending users read only their own rows and the branch list.
4. Permission checks go through **one function**, `public.has_permission(perm, branch default null)`. Never check role names directly.
5. Privileged writes go through **`security definer` RPCs**. Each RPC:
   - sets `search_path = ''`
   - checks `has_permission`
   - validates its input
   - calls `write_audit`
6. **Super-admin device verification: once per device, then never again.**
   - **The rule:** permissions granted by roles in `app_settings.step_up_roles` (default `['super_admin']`) only count when the current session holds a **step-up**. That is an `admin_step_ups` row for `auth.jwt()->>'session_id'`, and it has **no expiry**: it lasts as long as the login session does.
   - **First login on a new device:**
     1. The normal phone OTP.
     2. **One email code**, which registers the device as **trusted**. The device stores a random 256-bit secret in `expo-secure-store` (native) or `localStorage` (web). The server stores only its SHA-256 hash in `admin_trusted_devices`.
   - **After that, nothing repeats:**
     - The super admin **stays signed in** like any member. Supabase refresh tokens keep the session alive indefinitely, and there are no time-boxed sessions or inactivity timeouts.
     - If they ever do sign in again on that device (after a sign-out or a token loss), only the phone OTP is needed. The stored secret re-issues the step-up silently.
     - **No 12-hour re-checks, no 30-day expiry.** `app_settings.trusted_device_days` defaults to `null` (never expires). It can be set later if the policy changes.
   - **Access still ends immediately when:**
     - the device is revoked from the Security page, or "Sign out all devices" is used from any device
     - the member is blocked or their phone number is changed (automatic revoke)
     - the member no longer holds a step-up role (re-checked on every use)
   - **Other limits:**
     - **5** trusted devices per super admin; adding a 6th evicts the oldest.
     - An email alert is sent whenever a new device is trusted.
     - The audit log records every admin action as usual.
7. **`audit_log` is insert-only.** A trigger blocks update and delete.
8. **No data and no secrets in the repo, the CI logs or the CI artifacts.**
   - Clients see only the Supabase URL + publishable key.
   - Everything else lives in Supabase function secrets or GitHub encrypted secrets.
   - The master copy of every key is in the owner's encrypted vault.
   - Workflows that use secrets **never run on pull requests from forks**. Use `pull_request` (no secrets) for fork checks. Never use `pull_request_target`. Deploy and release jobs run only on `main`, on tags, or on manual dispatch, behind GitHub Environments.
9. **Fake people only** in seeds and tests. `pnpm check:seed` enforces this in CI.
10. **Minors** are under 18, computed from the DOB in `member_private`.
    - Their phone and DOB are never shown to other members, except officers (see 2 above).
    - Public pages show first name + last initial.
    - No analytics.
    - **Safety alerts:** every check-in of a minor at an event notifies their guardian(s) (P1-15). Passes are scanned on arrival only.
    - **The 18th birthday hands the account to the member** (daily job `daily_age_transitions`):
      - Active guardian links end (`member_guardians.ended_at`), so guardians lose access to the member's data and stop receiving alerts.
      - Nothing becomes more visible: privacy settings stay as they were.
      - The member must give **their own consent** on their next app open (`members.adult_consent_required = true`). Their choices are: accept, review privacy, download their data, or delete their account.
      - **Dependents without their own login:** the guardian and branch are notified to set up the member's own login. The guardian can keep managing for a grace period (`app_settings.adult_handover_grace_days`, default 90). After that, guardian actions are blocked until the member claims the profile.
11. **Guardians** must be active and **18+** to add or manage dependents. Guardian access always goes through **active** links (`ended_at IS NULL`), and a link ends automatically at the ward's 18th birthday.
12. **Media is private.** It is served only through short-lived presigned URLs from `media-sign`, after checks for `is_active()` and the relevant permission. Bucket CORS allows `PUT`/`GET` from the app's web origins only.
13. **Data location.**
    - **Member data and files are stored in India:** Supabase Mumbai, plus Spaces Bangalore for files and backups.
    - **Services that process limited data abroad must stay in this list**, which is shown on the privacy page:
      - Meta/WhatsApp: phone numbers, message text
      - Expo/Google push: device tokens and notification text
      - Sentry: crash traces with no personal data
      - GitHub Actions: the backup job streams an *encrypted* dump through its runner
      - The email provider: recipient address and message text. Google Workspace and Microsoft 365 may process mail outside India; Zoho Mail's India data centre or the SES (Mumbai) fallback keep it in India
    - **Push and WhatsApp text must not contain** phone numbers, DOBs, payment amounts or other members' details. There are two narrow exceptions:
      - **Guardian alerts** carry the minor's first name, event, venue and time, sent to that minor's own guardian.
      - **Receipt emails** to the payer carry the amount, inside the receipt.

      Receipt push and WhatsApp messages carry only the receipt number.
    - Adding any new service that touches personal data requires an update to this list and to the privacy policy.
14. **Retention.**
    - Rejected applicants and deleted members are kept for **6 months** after the status change, then purged by `retention-purge`. Purging deletes `member_private`, anonymises `members`, deletes the auth user and deletes their files.
    - Financial records (payments, receipts) are kept for the period AIAIA's accountant specifies, without contact details.
    - Backups are kept for **≤ 6 months** (30 daily + 5 monthly).
15. **Backups** are encrypted on the runner with `age`, using the owner's **public** key, before upload to Spaces. The private key exists only in the owner's vault. The job never echoes data, never uploads artifacts, and is restore-tested quarterly.

## 6. Core data model

### Members

**`members`** — non-sensitive. Columns:

- `id`, `user_id` (→ `auth.users`, UNIQUE NULL), `full_name`, `branch_id`, `gender`, `photo_path`, `city`, `occupation`, `education`, `bio`
- `wing` (`youth | aiaia`), `status` (`member_status`), `status_reason`, `status_changed_at`
- `approved_by`, `approved_at`, `pass_version` (int, default 1), `privacy` (jsonb), `created_at`, `updated_at`
- `member_no` (UNIQUE, assigned at approval, e.g. `AIAIA-Y-000123`; never reused), `adult_consent_required` (bool), `adult_consent_at`

Rules:

- **Dependents** have `user_id NULL`, plus a row in `member_guardians`.
- `wing` is set from DOB:
  - under 35 → `youth`;
  - 35+ → `aiaia` (the parent organisation).
  - It is recomputed nightly, so members move to `aiaia` on their 35th birthday.
- **The same nightly job handles 18th birthdays** (see §5.10).

**`member_private`** — sensitive, one row per member. Columns:

- `member_id` (PK)
- `phone` (E.164, UNIQUE NULL), `dob`, `email` (citext, NULL), `email_verified_at`
- `emergency_contact_name`, `emergency_contact_phone`
- `notify_prefs` (jsonb: `{push, email_updates, email_receipts, whatsapp}`). `email_receipts` defaults to **true** once an email is verified, so receipts arrive automatically

### Membership lifecycle and access

- **`member_guardians`**: `member_id`, `guardian_member_id`, `relationship`, `created_at`, `ended_at`, `ended_reason` (`turned_18 | claimed | removed`)
- **`consent_records`**: `id`, `member_id`, `guardian_name`, `guardian_phone`, `guardian_alerts` (bool: the guardian wants WhatsApp check-in alerts), `method`, `document_path`, `attested_by`, `attested_at`
- **`branch_transfers`**: `id`, `member_id`, `from_branch_id`, `to_branch_id`, `reason`, `status` (`pending | approved | rejected | cancelled`), `requested_by`, `requested_at`, `decided_by`, `decided_at`, `decision_note`
- **`dependent_claims`**: `dependent_id`, `code_hash`, `expires_at`, `used_at`
- **`roles`**, **`permissions`**, **`role_permissions`**, **`role_assignments`**: as in the table below; assignments have term dates
- **`member_status_events`**, **`audit_log`**
- **`admin_step_ups`**: `session_id`, `member_id`, `verified_at`, `expires_at` (NULL = for the life of the session), `source` (`email_otp | trusted_device`)
- **`admin_trusted_devices`**: `id`, `member_id`, `secret_hash`, `label` (e.g. "Chrome on Windows"), `created_at`, `last_used_at`, `expires_at` (NULL = never), `revoked_at`
- **`email_verifications`**: `member_id`, `email`, `code_hash`, `expires_at`, `attempts`
- **`roster_entries`**, **`push_tokens`**
- **`notifications`**: `id`, `member_id`, `kind`, `priority` (`high | normal`), `title`, `body`, `data`, `read_at`, `created_at`
- **`notification_deliveries`**: `notification_id`, `channel` (`push | webpush | email`), `status`, `attempts`, `last_error`
- **`reports`**: `id`, `reporter_member_id`, `target_type`, `target_id`, `reason`, `details`, `status`, `assigned_to`, `resolution_note`, `created_at`, `resolved_at`
- **`event_staff`**: `event_id`, `member_id`, `capabilities` (text[] ⊆ `check_in`, `collect_payments`, `safety_lead`), `added_by`, `created_at`. This is the event's team (e.g. the NYM organising committee and volunteers). Granted per event by the event's scope officers; it confers nothing outside that event.
- **`check_ins`**: `event_id`, `member_id`, `checked_in_at` (scan time), `checked_in_by`, `source` (`online | offline_sync`), `walk_in` (bool), `client_ref` (uuid UNIQUE, for idempotent offline sync). PRIMARY KEY (`event_id`, `member_id`): one check-in per member per event, and the earliest scan wins. **Arrival only; there is no leave scan.**

### Enums

- `member_status`: `pending | active | rejected | suspended | deleted`
- `role_scope`: `global | national | branch`
- `consent_method`: `paper_form | phone_call | guardian_account | in_person | self_adult`
- `audience`: `youth | aiaia | all` (on announcements and events; default `youth`)

### Roles (seeded) → permissions

| Role | Scope | Permissions |
|---|---|---|
| `super_admin` | global | all *(step-up required)* |
| `mentor` | global | all except `system.config` and `members.block`; has `members.request_block` instead |
| `enforcement_committee` | global | `reports.review`, `members.block`, `content.remove` |
| `support_staff` | national | `members.change_phone`, `members.support_view`, `members.verify_id` |
| `national_president`, `national_vp`, `national_secretary` | national | `members.approve`, `members.manage`, `roles.assign`, `announcements.national`, `events.national`, `payments.view_all`, `certificates.issue`, `gallery.manage`, `whatsapp.send`, `audit.view`, `data.export`, `roster.import` |
| `national_treasurer` | national | the national set + `payments.manage_plans`, `payments.record_offline`, `payments.reconcile` |
| `national_member` | national | `members.approve`, `announcements.national`, `events.national`, `members.verify_id` |
| `branch_president`, `branch_secretary` | branch | `members.approve`, `members.manage`, `announcements.branch`, `events.branch`, `payments.view_branch`, `certificates.issue`, `roster.import`, `members.verify_id` |
| `branch_treasurer` | branch | `members.approve`, `payments.view_branch`, `payments.record_offline`, `members.verify_id` |
| `editor` | national | `gallery.manage`, `documents.manage`, `announcements.national` |

Notes on the table:

- **Blocking** (`members.block`: suspending someone platform-wide) is **enforced only by super admins and the Enforcement Committee**.
- **The Mentor can request a block** (`members.request_block`). The request lands at the top of the enforcement queue with the Mentor's reason, and a super admin or committee member decides.
- **Anyone active can report.**
- **Approving applicants aged 35+** is limited to national roles, mentor or super admin until the parent organisation has its own officers.
- **`members.verify_id` works across branches.** An officer of *any* branch can verify any member's digital ID. National roles have it through the national set.
- **Event staff capabilities** (`event_staff`) are checked by `public.is_event_staff(event_id, capability)`, alongside `has_permission`. An event's scope officers always count as staff for it.
- Phases 2–3 add permissions through their own seed files.

## 7. App structure conventions

- **Auth gate** (`app/_layout.tsx`), routing on session and `my_profile()`:
  - no session → phone screen
  - no member row → profile setup
  - `pending` → waiting room
  - `rejected`, `suspended` or `deleted` → blocked screen
  - `active` with `adult_consent_required` → **adult consent** screen (18th-birthday handover)
  - `active` → member app
- **`(admin)`** requires an admin permission. If the caller's only admin rights come from a step-up role:
  - The app first tries the stored **trusted-device** secret.
  - If there isn't one (a new device), or it's rejected (revoked), the admin area shows the **one-time email code** screen.
- **State:** server state lives in React Query; device-only state (check-in queue, event packs) in `expo-sqlite`.
- **Every screen** handles loading, empty, error and offline states.
- **Accessibility:** 44 pt targets, font scaling, labels, AA contrast.
- **Uploads:** compressed client-side (2048 px long edge, quality 0.8).
- **Lists** are paginated.
- **Images** always pass a stable `cacheKey`.
- **Formats:** INR stored as **integer paise**; dates as `timestamptz`, shown in Asia/Kolkata.
- **Push priority:** high for approvals, event changes on the day, payment results and safety; normal for everything else.

## 8. Environments

| Env | Supabase | Files | Web | Android | Auth |
|---|---|---|---|---|---|
| local | `supabase start` | MinIO (docker compose) | `expo start --web` | dev build / emulator | test numbers, fixed OTP |
| staging | `aiaia-youth-staging` (Mumbai) | Spaces bucket `aiaia-youth-staging` (BLR1) | Pages preview | `org.aiaia.youth.staging`: internal testing track or APK | test numbers + real OTP for testers |
| prod | `aiaia-youth-prod` (Mumbai) | Spaces bucket `aiaia-youth-prod` (BLR1) | `https://<domain>` | `org.aiaia.youth`: Play Store from v1.0 | real OTP |

**Free-plan caveats:**

- The Supabase free plan allows 2 projects. A project pauses after 7 idle days; resume staging from the dashboard.
- Before any group sign-up event, raise **Auth → Rate limits → SMS sent per hour** (the project-wide default is about 30).
- If login volume outgrows Supabase, the auth calls are isolated in `packages/api/src/auth`, so another provider can be swapped in.

## 9. Certificates: PDF templates with placeholders

1. **The designer exports a flat PDF** (A4 landscape) from Canva or any other tool.
2. **The admin uploads it** in **Certificates → Templates** and draws boxes over the blank areas, naming each one from a fixed list:
   - `holder_name`, `event_title`, `award_title`, `event_date`, `serial`
   - optional: `branch`, `signatory_1`, `signatory_2`
   - `qr`: the box where the verification QR goes

   The app writes these as **real PDF form fields** (AcroForm) into the template with `pdf-lib`.
   Templates that already contain correctly named form fields, for example made in Acrobat or LibreOffice, are accepted as-is after validation.
3. **Issuing** an award only creates database rows, so it is instant.
4. **Rendering** happens **separately and on demand** in `certificates-render`, on first view or download, or in a background "pre-render all" sweep:
   1. load the template
   2. fill the fields with an embedded, subset Noto Sans font
   3. draw a small QR PNG into the `qr` box
   4. **flatten** the form
   5. save to Spaces and cache

   The background artwork is never decoded or re-encoded, so a render takes milliseconds of CPU.

## 10. Vetted references

- Supabase:
  - Send SMS Hook: https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
  - Phone login: https://supabase.com/docs/guides/auth/phone-login
  - Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
  - Testing RLS with pgTAP: https://supabase.com/docs/guides/database/postgres/testing-row-level-security
  - pgTAP helpers: https://supabase.com/docs/guides/local-development/testing/pgtap-extended
  - Edge Function limits (2 s CPU, 256 MB): https://supabase.com/docs/guides/functions/limits
- Expo:
  - PWA guide: https://docs.expo.dev/guides/progressive-web-apps/
  - Publishing websites: https://docs.expo.dev/distribution/publishing-websites/
  - SDK changelog: https://expo.dev/changelog
- Storage:
  - DigitalOcean Spaces in Bangalore: https://digitalocean.com/blog/spaces-blr
  - Spaces pricing: https://docs.digitalocean.com/products/spaces/details/pricing/
- Email:
  - Gmail sending limits (Workspace): https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace
- Messaging and payments:
  - WhatsApp pricing: https://developers.facebook.com/docs/whatsapp/pricing
  - Razorpay React Native notes (why we use hosted checkout): https://razorpay.com/docs/payments/payment-gateway/react-native-integration/standard/troubleshooting-faqs/
- Android developer verification (applies to sideloaded apps; global rollout 2027): https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/
- APK builds on GitHub Actions without EAS: https://dev.to/astraedus/eas-free-build-quota-ran-out-i-shipped-a-signed-play-aab-on-github-actions-instead-3fn
- DPDP Rules 2025: the main obligations, including Rule 10 (parental consent), apply from around May 2027. Confirm with counsel.
- AGENTS.md: https://agents.md
