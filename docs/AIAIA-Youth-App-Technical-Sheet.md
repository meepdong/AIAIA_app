# AIAIA Youth App: Technical Sheet

**All India Anglo-Indian Association: Youth Wing**

*For the build team and technical reviewers · 12 November 2026*

> This sheet summarises how the app is built, secured and run. Every point is specified in full, with test gates, in the build pack (`docs/build/` in the code repository):
>
> - architecture
> - owner setup
> - roadmap
> - agent playbook
> - 43 feature briefs
>
> The plain-language overview is in the separate **pitch** and **proposal** documents.

---

## 1. Architecture at a glance

```
+----------------------------------------------------------------------+
|  CLIENTS - one Expo (React Native + Expo Router) codebase            |
|  Android app (Play Store) | Web app + PWA | Admin console (/admin)   |
+-------------------+------------------------------+-------------------+
                    | HTTPS + JWT (supabase-js)    | static files
                    v                              v
+--------------------------------------------+  +----------------------+
|  SUPABASE  (Mumbai, ap-south-1)            |  | Cloudflare Pages     |
|  - Auth: phone OTP via Send-SMS hook       |  | web build, PWA,      |
|  - Postgres + Row-Level Security + RPCs    |  | version.json         |
|  - Edge Functions (Deno), pg_cron, pg_net  |  +----------------------+
+----+---------+---------+---------+---------+
     |         |         |         |         |
     v         v         v         v         v
 DO Spaces  AIAIA     Razorpay  WhatsApp   Expo Push -> FCM (Android)
 Bangalore  email     payments  Cloud API  Web Push (VAPID) for PWA
 files,     official            OTP, alerts,
 backups    address             updates
```

- **No separate API server.** Clients talk to Supabase directly, through one typed data layer (`packages/api`).
- **Permissions are enforced in the database,** by row-level security policies and `security definer` functions. That is why open-sourcing the client code exposes nothing useful.
- **Edge Functions** do anything that needs a secret or an outside service: login codes, payments, PDFs, files, messaging, push and guardian alerts. They are triggered by the app, by webhooks, or by scheduled jobs (`pg_cron`).
- **Where data lives:**
  - All member data, files and backups are stored in India (Mumbai and Bangalore).
  - A few services handle limited data abroad, and these are listed in the privacy policy:
    - WhatsApp
    - push services
    - Sentry (crash traces, no personal data)
    - the email provider, if AIAIA's email is on Google Workspace or Microsoft 365

## 2. Technology stack

| Component | Choice | Why | Cost |
|---|---|---|---|
| App framework | Expo SDK (latest stable), Expo Router, TypeScript strict | One codebase for Android, web and later iOS | Free |
| UI | NativeWind + in-house components (`packages/ui`) | Shared design tokens; accessible (44 pt targets, font scaling) | Free |
| Data access | `supabase-js` behind `packages/api`, React Query, zod | One place to swap providers; the same validation on client and server | Free |
| On-device storage | `expo-secure-store` (session, device secret), `expo-sqlite` (offline queues, event packs) | Encrypted; survives restarts | Free |
| Signatures | Ed25519: WebCrypto (server), `@noble/curves` (device) | Passes and IDs verifiable offline | Free |
| Database | Supabase Postgres 15+ | Relational; plain Postgres means no lock-in | Free tier |
| Auth | Supabase phone OTP; Send-SMS hook → WhatsApp authentication template, with MSG91 SMS fallback | No passwords; no DLT needed for WhatsApp | ~₹0.115 per code |
| Server code | Edge Functions (Deno), `pg_cron`, `pg_net` | Runs next to the DB; web-standard and portable | Free tier |
| Files | DigitalOcean Spaces, Bangalore (S3 API, presigned URLs) | In India; 250 GB + 1 TB downloads included | ~₹6.2k/yr |
| Email | AIAIA's own business email (Google Workspace / Microsoft 365 / Zoho) via its HTTPS API, from `updates@<aiaia-domain>`; Amazon SES (Mumbai) as fallback | Official sender at no extra cost; no SMTP (blocked from Edge Functions) | ₹0 |
| Payments | Razorpay Orders + hosted Standard Checkout; webhook | UPI, cards, netbanking; one flow for Android and web | ~2% per payment |
| Messaging | WhatsApp Business Platform (Meta Cloud API) | Where members and parents already are | Per message |
| Push | Expo Push (FCM; APNs later) + Web Push (VAPID) | Free; one API | Free |
| PDFs | `pdf-lib` + fontkit + `qrcode` | Fills PDF form fields without decoding the artwork | Free |
| Hosting / CI | Cloudflare Pages; GitHub Actions (public repo); Android built with `expo prebuild` + Gradle | Free; no paid build service | Free |
| Monitoring | Sentry (no personal data, no user context) | Crash reports | Free tier |
| Tests | Jest + Testing Library, pgTAP, Deno test, Playwright, Maestro | Every layer, including database security | Free |

## 3. Code organisation

```
AIAIA_app/  (public GitHub repo - never holds member data)
  apps/mobile/            Expo app: (auth) (app) (admin) (public) route groups
  packages/shared/        zod schemas, generated DB types, permission keys
  packages/api/           typed data access, one folder per feature
  packages/ui/            design tokens and components
  supabase/migrations/    timestamped SQL, never edited after merge
  supabase/functions/     Edge Functions + _shared helpers (email, storage, pdf, push...)
  supabase/tests/         pgTAP security tests
  supabase/seeds/         one seed file per brief (fake people only)
  e2e/                    Playwright (web) and Maestro (Android) flows
  docs/build/             architecture, roadmap, playbook, briefs
```

Each feature owns its own folders: routes, feature code, API module, functions, tests and seed file. That separation is what lets several AI agents build in parallel safely.

## 4. Data model

| Area | Main tables |
|---|---|
| Members | `members`: non-sensitive profile, status, wing, `member_no`, pass version, adult-consent flag<br>**`member_private`**: phone, DOB, email, emergency contact, notification preferences |
| Families | `member_guardians` (with `ended_at` / `ended_reason`), `dependent_claims` |
| Consent and history | `consent_records` (incl. `guardian_alerts` and method `self_adult`), `member_status_events`, `audit_log` (insert-only) |
| Access | `roles`, `permissions`, `role_permissions`, `role_assignments` (term dates), `admin_step_ups`, `admin_trusted_devices` |
| Branches | `branches`, `branch_transfers` |
| Events | `events`, `rsvps`, **`event_staff`** (check-in / collect payments / safety lead), **`check_ins`** (arrival only, one per member per event), `guardian_alerts` |
| Messaging | `notifications`, `notification_deliveries`, `push_tokens`, `email_verifications`, `whatsapp_templates` / `campaigns` / `messages` |
| Money | `dues_plans`, `payments` (with collector and `client_ref`), `receipt_counters` |
| Certificates and media | `certificate_templates`, `awards`, `certificates`, `albums`, `media`, `magazine_issues` |
| Safety and operations | `reports`, `roster_entries`, `otp_throttle`, `app_settings` |
| Phase 3 | jobs, quizzes and question bank, badges, streaks, polls, mentor profiles and requests, documents |

**Enums**
- Member status: `pending · active · rejected · suspended · deleted`
- Wing: `youth` (under 35) · `aiaia` (35+, recomputed nightly)
- Audience: `youth · aiaia · all`

**Conventions**
- Money is stored as integer **paise**.
- Times are stored as `timestamptz` and shown in Asia/Kolkata.

## 5. Identity and access control

**Login**
1. The member enters their phone number.
2. Supabase Auth calls our `auth-send-otp` hook. The hook:
   1. verifies the signature
   2. limits each number to 5 codes an hour and 10 a day
   3. sends the code by WhatsApp (SMS as fallback)
   4. never logs the code
3. Sessions are stored encrypted on the device and never time out.

There is no CAPTCHA. All login calls sit in one module, so the provider can be swapped if needed.

**App gate**

| Account state | Where the app sends them |
|---|---|
| No session | Login |
| No profile | Profile setup |
| `pending` | Waiting room |
| `rejected` / `suspended` / `deleted` | Blocked screen |
| Active with `adult_consent_required` | **Adult consent screen** |
| `active` | The app |

The database enforces the same rules independently.

**Permissions**
- One SQL function, `has_permission(permission, branch)`, decides every check.
- Roles are assignments with a scope (global, national or branch) and a term.
- Event-only powers come from `is_event_staff(event, capability)`. They are granted per event to anyone from any branch (for example the NYM committee), and confer nothing elsewhere.
- **Super admins verify each device once:** a phone code plus one email code. After that the device stays signed in, with no repeat prompts. A random device secret (stored on the server only as a hash) re-verifies silently after any re-login.
- **When super-admin access ends:** access ends immediately on revoke, "sign out all devices", a block, a phone change or role removal. The limit is 5 devices, and each new one triggers an email alert.

| Role | Can do |
|---|---|
| Super admin | Everything, on a device verified once |
| Mentor | Oversee everything; **request** blocks (cannot enforce them) |
| Enforcement Committee | Review reports, remove content, **enforce** blocks |
| Support staff | Change a member's phone number after an identity check; verify IDs |
| National Youth Committee | Approve anyone, national content and events, roles, payments view, certificates, WhatsApp updates |
| Branch officers | Approve their branch's applicants, branch content and events, record cash, **verify any member's ID** |
| Event staff | For one event: scan passes, collect fees, act as safety lead |
| Editor | Gallery, documents, national announcements |
| Member / Guardian | Use the app; guardians manage their dependents while they are minors |

**Privacy by design**
- Other members never read `member_private` directly. Contact details reach them only through `search_directory`, which applies each member's privacy settings.
- A minor's phone number and DOB are **always** hidden.

## 6. Membership lifecycle

| Stage | What happens |
|---|---|
| Application | Phone code → profile → `pending`. A match against the paper roster marks the application "fast-track", but a human still approves |
| Approval | A branch officer approves their own branch's applicants; a national approver can approve anyone's. **For 14–17s:** the officer records guardian consent (method, guardian name and WhatsApp number, whether the guardian wants check-in alerts, optional signed form). **For 35+:** a national approver. Approval assigns a permanent **member number** (`AIAIA-Y-000123`) |
| Dependents | Only an **active adult** can add a child (under 14, or without a phone). The guardian handles RSVPs, payments, passes, IDs and certificates. At 14+, a claim code moves the child to their own login |
| **18th birthday** | A nightly job ends the guardian links (the guardian loses access and alerts stop) and flags the member. On their next app open they see "You're 18, your account is now yours". From there they can accept with their **own consent** (recorded as `self_adult`), review their privacy settings, download their data, or delete the account. Nothing becomes more visible automatically. Dependents without a login: the guardian and branch are told to set one up, and the guardian keeps access for a 90-day grace period |
| 35th birthday | The member moves to the `aiaia` wing (parent organisation) automatically |
| **Branch transfer** | The member (or guardian) requests a new branch with a reason. The **new** branch's officers approve. The branch changes, history is kept, both branches are notified, and the ID card updates |
| Blocking | Anyone can report. The Mentor can request a block. Only the Enforcement Committee or a super admin can block, which revokes all sessions and trusted devices at once |
| Phone change | Support staff (or the owner's agent through a support account) record how they verified identity. The account then moves to the new number: old sessions and devices are revoked, the pass/ID is reissued, and both numbers are notified |
| Deletion and retention | Self-deletion bans the account at once. Rejected and deleted accounts are **purged after 6 months**: private data deleted, profile anonymised, files and login removed. Payment records are kept for the accountant's period |

## 7. How the key features work

**Delegate pass = digital member ID**
- **The code.** Each member has one **static QR** signed with Ed25519: `AIAIA1.<member>.<version>.<sig>`. It can be **printed**, which covers children and anyone without a phone.
- **The ID card.** It shows the photo, name, member number, home branch, wing, member-since date and status. It never shows a phone number or date of birth.
- **Who can verify it.** Any branch officer, from any branch:
  - **Offline:** the app checks the signature only, and the screen says plainly "status not checked".
  - **Online:** `verify_member_id` returns live status (Active / Suspended / Old pass / Not found). Each check is audited.
- **Lost passes.** Reissuing a lost pass bumps its version, which invalidates the old copy.

**Event check-in (arrival only), offline**
1. **Before the event,** the event's staff download the event pack (registrants, pass versions, photos, age groups).
2. **At the door,** each pass is scanned **once, on arrival**; there is no leave scan. For each scan, the app:
   - verifies the signature with no internet
   - shows the photo and name, so staff can match the person
   - stores the scan in a local SQLite queue with a `client_ref`
3. **Unusual scans are flagged, not blocked:** duplicates and walk-ins.
4. **When signal returns,** the queue syncs automatically through `sync_check_ins`. Sync is idempotent, outdated passes are rejected, and any rejections are reported back.

**Minor safety alerts**
1. **The alert.** When a member under 18 is checked in, their guardian is alerted:
   - by **push** to a guardian with an account
   - by **WhatsApp** (template `guardian_attendance_alert`) to the guardian named on the consent record, if they opted in
2. **The message.** It carries the child's first name, that they arrived, the event, the venue and the **actual scan time**.
3. **Offline scans** alert the moment the scanner syncs.
4. **Minors list.** The event's **safety lead** and officers see the minors registered for the event, whether each has checked in, and their guardian contact, with "Call guardian".
5. **At 18,** alerts stop automatically.

**Online payments**
1. The app creates a Razorpay order, and the member pays on our hosted checkout page (an in-app browser on Android).
2. The signed **webhook** is the only thing that marks the payment paid: its signature is verified, the amount is checked, and receiving it twice is safe. The receipt number is allocated atomically.
3. Razorpay emails its own confirmation, and our **official AIAIA receipt** is downloadable in the app.

**Cash and offline payments, with receipts sent automatically**
- **Who can record them:**
  - branch treasurers and the national treasurer
  - an **event's collection team**, for example the NYM organising committee, for that event's fees only
- **At the venue:**
  1. Scan the pass and tap **Collect fee**.
  2. The amount is prefilled; choose cash or UPI to AIAIA's account.
  3. Save. This works **offline** and syncs once, idempotently, by `client_ref`.
- **Receipts are sent automatically** on record or sync, to the member or the guardian of a dependent:
  - in-app + push: "Your receipt <number> is ready"
  - WhatsApp `payment_receipt` with the receipt number and link, never the amount
  - an email with the PDF from AIAIA's official address, if the member has an email
- **Collector summary:** cash and UPI totals per collector and per event, for handover and reconciliation.

**Certificates**
1. A designer exports a flat PDF.
2. An admin draws placeholder boxes on it (name, event, award, date, serial, QR), and the app writes them in as PDF form fields.
3. **Issuing** an award is instant: it only creates database records.
4. **Rendering happens on first open:**
   - the fields are filled
   - the QR is drawn
   - the form is flattened
   - the PDF is cached

   This takes milliseconds of CPU.
5. A public `/verify/<serial>` page confirms whether a certificate is real or has been revoked.

**Files and gallery**
- **Uploads** are compressed on the device (2048 px) and get thumbnails.
- **Storage** is Spaces, through short-lived signed links checked against permissions. Images are cached by path, so they never re-download.
- **YouTube** is used only for videos that show no minors.

**Notifications, email and WhatsApp updates**
- **Push:**
  - **Batching:** bulk notifications are inserted in one statement, then a single dispatcher sends to Expo in batches of 100. Important messages go at high priority.
  - **Web push:** for the PWA. iPhones get it once the app is added to the home screen.
- **Email** comes from AIAIA's official address, through the provider's API:
  - The **app holds the opt-in list**, with per-member unsubscribe.
  - A daily-cap guard turns updates into digests near the mailbox limit.
- **WhatsApp campaigns:**
  1. An admin picks an approved template, fills its variables and chooses the audience.
  2. A preview shows the recipient count and cost.
  3. **A second person approves.**
  4. The send is rate-limited.
  5. Delivery statuses come back via a signed webhook. STOP opts the member out.

## 8. Security and privacy controls

- **Database**
  - RLS on every table, deny by default. Each policy is tested both ways with pgTAP.
  - Privileged writes go only through audited `security definer` functions with a fixed `search_path`.
- **Guardians** reach a ward's data only through **active** links, and those links end automatically at 18.
- **Audit log:** insert-only, enforced by a trigger.
- **Webhooks:** every signature is verified (Supabase, Razorpay, Meta).
- **Secrets:**
  - Master copies are in the owner's encrypted vault.
  - Working copies are in GitHub and Supabase encrypted secrets.
  - None are in the repository, logs or build artifacts.
- **Public-repo CI:**
  - Fork PRs run without secrets, and `pull_request_target` is never used.
  - Production deploys need the owner's approval.
- **Backups:**
  - Nightly, through Supabase's IPv4 pooler.
  - Encrypted with `age` on the runner before upload to Bangalore. Only the owner holds the private key.
  - Kept for ≤ 6 months; restore-tested every quarter.
- **Minors:**
  - Contact details and DOB are hidden.
  - Public pages show first name + last initial.
  - No analytics.
  - Guardian alerts when a minor checks in at an event.
  - Safety reports go to the Enforcement Committee immediately.
- **Message text:** never carries phone numbers, DOBs or amounts. The two exceptions are guardian alerts (sent to that child's guardian) and receipt emails (sent to the payer).
- **Test data:** fake people only, enforced by a CI check.

## 9. Environments, CI/CD and releases

| Environment | Backend | Files | Android | Web |
|---|---|---|---|---|
| Local | Supabase in Docker | MinIO | emulator / dev build | `expo start --web` |
| Staging | Supabase staging (Mumbai) | Spaces staging | `org.aiaia.youth.staging` (testers) | Pages preview |
| Production | Supabase prod (Mumbai) | Spaces prod | `org.aiaia.youth` (Play Store) | own domain |

**GitHub workflows**
- **`ci`:** runs on every PR: lint, types, unit tests, fake-data check, migration-order check, database security tests, function tests, web build.
- **`android-release`:** runs on a version tag and builds a signed APK (testers) and AAB (Play).
- **`web-deploy`:** `main` goes to staging; tags go to production.
- **`db-deploy`:** migrations and functions go to staging; production is approval-gated.
- **`backup`:** runs nightly.
- **`e2e`:** runs nightly on an Android emulator.

**App updates**
- **Testers** install the APK once. After that, every tagged build is published to **GitHub Releases** with an `update-staging.json` manifest. The app checks it (launch, foreground, Settings), downloads the APK, verifies its checksum and opens Android's installer: one tap, no cable. Android itself rejects any update not signed with our key.
- **Production** builds never include the install-packages permission; they read `version.json` from our site and send users to the Play Store.
- **Web** shows "New version, tap to refresh".

## 10. Testing and quality gates

| Layer | Tool | Example checks |
|---|---|---|
| Database security | pgTAP | A branch officer can't approve another branch's applicant. A minor's phone never appears in the directory. The Mentor can't enforce a block. **A former guardian reads nothing after the ward turns 18.** Event staff see only their event |
| Server functions | Deno test | Bad signatures are rejected. Duplicate webhooks give one receipt. OTP throttle. **Guardian alerts use the scan time.** Receipt WhatsApps carry no amount |
| App logic | Jest + Testing Library | Age boundaries (13 / 14 / 18 / 35). A tampered QR is rejected. Offline queues survive a restart. **ID verify shows "status not checked" offline** |
| Web flows | Playwright | Signup → approval → home. Report → block → logged out. Adult consent at 18. Cross-branch ID verification. Branch transfer |
| Android flows | Maestro (emulator in CI) | Login, pass and ID, offline check-in and sync |
| Real devices | Manual | Push on Xiaomi, Vivo, Oppo and Realme phones. UPI payment from the in-app browser. Guardian alerts after an airplane-mode scan |

Every brief includes **negative gates**: the fix is temporarily removed to prove its test then fails.

## 11. How it gets built

The build is split into **43 briefs** across four phases.

| Phase | Briefs | Users |
|---|---|---|
| 0 Foundation | 5 | Team |
| 1 Getting everyone in | 22 | Testers |
| 2 Money & memories | 9 | Testers |
| Public launch (v1.0) | gate | Everyone |
| 3 Growing together | 7 | Everyone |

**How the agents work together**
- An **orchestrator** agent dispatches up to four **maker** agents at a time, each on its own branch.
- The orchestrator **re-runs every gate** itself.
- A **fresh reviewer** checks every change.
- Before merging, the orchestrator rebases and fixes the migration order.
- Schema briefs land first in each phase, so features can be built in parallel.

## 12. Limits, scaling and exit paths

| Service | Limit that matters | Response |
|---|---|---|
| Supabase | Free plan: 500 MB DB; 50k MAU; 2 projects; idle projects pause; no automatic backups | Move to Pro (~₹31k/yr) at ~5k active users or when point-in-time backups are wanted |
| Supabase Auth | Project-wide SMS limit (default ~30/hour) | Raise it before every group sign-up |
| Edge Functions | 2 s CPU and 256 MB per request | Designed around: form-fill PDFs, batched sends |
| DigitalOcean Spaces | 250 GB storage and 1 TB downloads per month in the base plan | ~$0.02/GB beyond that |
| WhatsApp | Charged per message | Keep routine updates on free push. Guardian alerts and receipts cost a few hundred rupees a year |
| Email (AIAIA account) | Mailbox cap (~2,000 recipients/day on Workspace) | Digests near the cap; SES overflow at ~₹0.01/email |

**Exit paths**
- **Database:** `pg_dump` to any Postgres, or self-host Supabase.
- **Files:** any S3-compatible store.
- **Login, push and email:** each lives in a single module.

## 13. Costs (per year, excluding AI coding agents)

| Item | Per year |
|---|---|
| Supabase, Cloudflare, GitHub, Expo, Firebase, Sentry | ₹0 |
| DigitalOcean Spaces (Bangalore) | ~₹6,200 |
| WhatsApp: login codes, updates, guardian alerts, receipts | ~₹3,000–3,500 |
| WhatsApp sender SIM | ~₹2,000 |
| Domain (₹0 if a subdomain of AIAIA's existing domain) | ~₹0–1,000 |
| Email from AIAIA's official account | ₹0 |
| **Total** | **~₹11,000–12,500** (+ ₹2,100 once for Google Play) |
| Later | iOS ~₹8,300/yr; Supabase Pro ~₹31,000/yr at scale |

## 14. Risks and open items

| Item | Status / mitigation |
|---|---|
| UPI hand-off from the in-app browser | The first manual test in the payments brief |
| Razorpay confirmation email with Standard Checkout | Verified in test mode; Payment Links as the fallback |
| DPDP Rules (consent, children) fully apply ~May 2027 | Lawyer review of the consent flow, the 18th-birthday handover, the privacy policy and the terms before launch |
| Guardian alerts depend on WhatsApp template approval | Submit `guardian_attendance_alert` early; push alerts work in the meantime |
| Offline scans delay guardian alerts until sync | Scanners auto-sync and show pending-alert counts; alerts carry the real scan time |
| Android developer verification (2027) | Publish on Play under AIAIA's D-U-N-S; APKs are for testers only |
| Battery optimisation on popular Indian phones | High-priority push, in-app help, real-device tests |
| Committee decisions pending | Money routing, refund rules, licence, retention period for financial records, iPhone funding |
