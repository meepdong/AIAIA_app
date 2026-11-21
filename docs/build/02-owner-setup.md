# 02 — Owner Setup: Everything Needed From Your End

Agents can't do certain things for you: create accounts in your name, accept terms, verify a business, or hold keys. This list covers those things, in the order you'll need them. Tick each item as you go. If an agent hits an item its brief depends on that isn't ticked yet, it must stop and ask.

**Markers:**
- ⏱ takes days or weeks, so start early
- 💰 costs money
- 🔑 creates a secret

**Where secrets go.** Every 🔑 goes into **your encrypted vault first** (password manager or encrypted drive). Copy it into GitHub/Supabase secrets from there. Never paste a secret into chat, a file or an issue.

**Phases 1–2 are testers only.** Real members join at the **public launch (v1.0)**, at the start of Phase 3. Everything in Stage C must be done by then.

---

## Stage A — Before any code (Phase 0)

### A1. Your computer (Windows)
| ✓ | Install | Why | Check |
|---|---|---|---|
| ☐ | Git for Windows | version control | `git --version` |
| ☐ | Node.js LTS (22+) | tooling | `node -v` |
| ☐ | pnpm (`corepack enable`) | package manager | `pnpm -v` |
| ☐ | Docker Desktop (WSL 2) | runs Supabase locally | `docker info` |
| ☐ | Supabase CLI (`scoop install supabase`) | local DB, migrations, tests | `supabase --version` |
| ☐ | **Deno** (`winget install DenoLand.Deno`) | runs and tests the server functions (see note below) | `deno --version` |
| ☐ | GitHub CLI (`winget install GitHub.cli`), then `gh auth login` | repo, PRs, secrets | `gh auth status` |
| ☐ | **age** (`winget install FiloSottile.age`) | creates the backup encryption key (A5) | `age --version` |
| ☐ | Android Studio (SDK + an API 34+ emulator; JDK 17 bundled) | local testing; optional local builds | `adb devices` |
| ☐ | An Android phone with USB debugging on (needed only for the very first install). A Xiaomi/Vivo/Oppo/Realme handset is ideal for push testing. When the app first asks, allow **Install unknown apps** for AIAIA Youth: after that it updates itself from GitHub Releases | real-device tests | shows in `adb devices` |

**What Deno is.** Deno is a program that runs JavaScript and TypeScript, much like Node.js; it comes from the same original creator. Supabase runs our server-side code ("Edge Functions": the login-code sender, the payment webhook, the certificate renderer) on Deno. You install it so these functions can be tested on your PC before they go live. You never use it directly: `pnpm fn:test` calls it for you.

### A2. Keep member data out of the code
☑ The code is in **its own git repo**: `C:\path\to\AIAIA_app`. Git tracks only that folder. The delegate data in the parent `NYM5` folder stays outside it. Never copy member files into `AIAIA_app`. The repo never holds member data, exports or backups. CI enforces this with `pnpm check:seed`, and GitHub push protection blocks secrets.

### A3. Accounts
| ✓ | Account | What to create | Produces |
|---|---|---|---|
| ☐ | **GitHub** (free) | Org `aiaia-youth`. A **public** repo. Turn on secret scanning, push protection and Dependabot. Create Environments `staging` and `production` (production requires your approval). Under Actions settings, require approval for workflows from outside contributors | — |
| ☐ | **Supabase** (free) | 2 projects in **Mumbai**: `aiaia-youth-staging`, `aiaia-youth-prod` | 🔑 access token, 🔑 DB passwords, project refs, URL + publishable key |
| ☐ | **DigitalOcean** 💰 (Spaces $5/mo, about ₹6.2k/yr incl. GST; start it in Phase 2) | Spaces in **BLR1 (Bangalore)**: buckets `aiaia-youth-staging`, `aiaia-youth-prod` (file listing off). CORS: allow `GET, PUT` from `https://<domain>`, the Pages preview domain and `http://localhost:8081`. Leave the Spaces CDN **off** | 🔑 Spaces access key + secret |
| ☐ | **Cloudflare** (free) | A Pages project `aiaia-youth-web`, set to **production branch = `production`**. DNS for the domain (B4) | 🔑 API token (Pages:Edit), account id |
| ☐ | **AIAIA's official email** (free if AIAIA already has business email on its domain) | Tell the agents **which provider AIAIA uses**: Google Workspace, Microsoft 365 or Zoho Mail. Create a sending address `updates@<aiaia-domain>`, either as a mailbox or as an alias of an existing mailbox, so no new licence is needed. Then give the app permission to send **only as that address**:<br>• **Workspace:** a Google Cloud service account with domain-wide delegation, scope `gmail.send`, impersonating `updates@` only<br>• **Microsoft 365:** an Entra app registration with `Mail.Send` (application), restricted to the `updates@` mailbox by an Application Access Policy<br>• **Zoho:** an OAuth client with `ZohoMail.messages.CREATE` for `updates@`<br>Make sure the domain's **SPF, DKIM and DMARC** records are set, so mail doesn't land in spam | 🔑 the provider credentials (service-account JSON / client id + secret / refresh token) |
| ☐ | **AWS SES, Mumbai** (optional fallback) 💰 (about ₹0.01 per email) | Needed only if AIAIA has no business email, or if volume outgrows the mailbox limit. SES in **ap-south-1**: verify the domain, request production access ⏱, and create an IAM user with only `ses:SendEmail` | 🔑 access key id + secret |
| ☐ | **Expo** (free) | Account + project `aiaia-youth` (run `npx eas init` once to get the `projectId`; used for push only) | 🔑 `EXPO_ACCESS_TOKEN` |
| ☐ | **Firebase** (free) | Project with Android apps `org.aiaia.youth`, `.staging` and `.dev`. Download each `google-services.json`. Upload the FCM v1 service-account key to Expo → Credentials | `google-services.json` ×3 |
| ☐ | **Sentry** (free, optional) | React Native project | `SENTRY_DSN`, 🔑 auth token |

### A4. Android signing key (once; guard it forever)
1. `keytool -genkeypair -v -keystore aiaia-youth-upload.keystore -alias aiaia-youth -keyalg RSA -keysize 2048 -validity 10000`
2. Store the file and its passwords in your vault, **plus one offline encrypted copy**. If you lose it before the Play listing, testers must reinstall. After the listing, Play App Signing protects the real signing key, and this one becomes the "upload key", which can be reset.
3. Copy it to the clipboard as base64: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("aiaia-youth-upload.keystore")) | Set-Clipboard`
4. Run `gh secret set ANDROID_KEYSTORE_BASE64` and paste when prompted. Do the same for `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.

### A5. Backup encryption key
1. `age-keygen -o aiaia-backup.key`. This prints a **public key** (`age1…`).
2. Move `aiaia-backup.key` (the **private** key) into your vault. It must never go into GitHub or Supabase.
3. Save the public key as the GitHub **variable** `BACKUP_AGE_RECIPIENT`. It isn't secret: it can only lock data, not unlock it.
4. Every quarter, restore the latest backup to a scratch Supabase project, using the private key, to prove backups work.

### A6. Decisions agents need in Phase 0
- ☐ App name (e.g. "AIAIA Youth") and Android app id (`org.aiaia.youth`; this can't change once published)
- ☐ Logo (SVG or 1024×1024 PNG) and 2–3 brand colours
- ☐ Licence (AGPL-3.0 recommended)
- ☐ The **official AIAIA branch register**, not the NYM5 delegate sheet, which only lists branches that sent delegates

---

## Stage B — During Phases 1–2 (testers)

### B1. WhatsApp (Meta) ⏱
| ✓ | Step |
|---|---|
| ☐ | Meta Business account in **AIAIA's name**, then **Business Verification** ⏱ |
| ☐ | Developer app → WhatsApp product → link the business |
| ☐ | **A dedicated SIM** for the sender number (not already on WhatsApp). Keep it on the cheapest validity plan 💰 (about ₹2k/yr) so the number is never recycled. Display name: "AIAIA" |
| ☐ | System User permanent token, giving 🔑 `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, 🔑 `WHATSAPP_APP_SECRET`, 🔑 `WHATSAPP_VERIFY_TOKEN` |
| ☐ | Authentication template `aiaia_login_code` (copy-code button) ⏱ |
| ☐ | Payment method in WhatsApp Manager 💰 (about ₹0.115 + GST per OTP or utility message) |

### B2. SMS fallback (optional) ⏱💰
☐ MSG91 + DLT registration (AIAIA as the entity, a header and an OTP template), giving 🔑 `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`.

### B3. Supabase Auth settings (staging, then prod)
- ☐ Phone provider on. **Send SMS hook** pointed at `auth-send-otp`, with 🔑 hook secret `SEND_SMS_HOOK_SECRET`.
- ☐ **Auth → Rate limits:** raise "SMS sent per hour" to cover your biggest sign-up session (e.g. 300) **before any group sign-up**. Per-number limits are enforced in our hook.
- ☐ Test phone numbers on **staging only**. Remove all test numbers from prod.
- ☐ CAPTCHA: off (owner decision).
- ☐ Sessions: leave **time-boxed sessions** and **inactivity timeout** off, so members and super admins stay signed in.

### B4. People, roles, policies
- ☐ **Who's who.** Collect name, phone, role, branch and term for each of:
  - the National Youth Committee
  - the Mentor
  - branch officers
  - super admins (plus each super admin's **email**, which they must verify for step-up; they enter an email code once per new device and are never asked again on it)
  - **support staff** (who handle phone-number changes)
  - the **Voluntary Enforcement Committee** (who review reports and block)
- ☐ **Personal-agent support account.** If your own AI agent will do phone changes, create a dedicated member account for it with only the `support_staff` role. Its actions are audited, like any person's.
- ☐ **Retention policy** approved: rejected applicants and deleted members kept 6 months; backups at most 6 months; financial-record period **confirmed by AIAIA's accountant**.
- ☐ Parent/guardian consent form (1-page PDF). It must include:
  - the guardian's **WhatsApp number**
  - a tick-box: **"Send me a WhatsApp alert when my child arrives at an AIAIA event"**
- ☐ For each event, the **event team**: who scans passes, who collects cash (e.g. the NYM organising committee), and a **safety lead** for minors. These are assigned in the app per event.

---

## Stage C — Before the public launch (v1.0, start of Phase 3)

### C1. Publishing on Google Play ⏱
- ☐ **D-U-N-S number** for AIAIA ⏱ (free, about 2–4 weeks). Apply via Google Play Console's D-U-N-S lookup or directly with Dun & Bradstreet.
- ☐ Google Play Console **organisation** account 💰 (US$25 once). This includes Android developer verification, which becomes mandatory even for sideloaded APKs from 2027.
- ☐ Enable **Play App Signing**. Use the A4 keystore as the upload key.
- ☐ Store listing: icon, screenshots, short and full description, category, content rating, target audience (13+, with a teen policy), **Data safety form**, privacy policy URL, and the **account deletion URL** (`/delete-account`).
- ☐ Move testers to an internal/closed track. Then go to production.

### C2. Website pages needed for KYC and the stores
Agents build these pages (P1-09). You supply the facts and approve the text:

| Page | Needed by | You provide |
|---|---|---|
| `/about` | Razorpay | Who AIAIA and the youth wing are |
| `/contact` | Razorpay, Play | **Registered address, phone, email**, support hours |
| `/terms` | Razorpay, Play | Approval (lawyer review recommended) |
| `/privacy` | Razorpay, Play, DPDP | Grievance Officer name + email; approval |
| `/refunds` (Cancellation & Refund Policy) | Razorpay | Rules for dues, event fees and donations (e.g. event fee refundable until X days before; dues and donations non-refundable except for errors) |
| `/delivery` (Service Delivery Policy) | Razorpay | Confirmation that services are delivered digitally (membership is active on approval; receipts are instant) |
| `/pricing` | Razorpay | Dues amounts, concessions, typical event fees |
| `/delete-account` | Google Play | Approval of the deletion and retention wording |

### C3. Payments (Razorpay) ⏱
- ☐ **Money-flow decision**: one central account, or branch accounts.
- ☐ Razorpay account in AIAIA's name, then KYC ⏱. They will check the C2 pages.
- ☐ Test keys first: 🔑 `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`. Then live keys.
- ☐ Webhook (agents give you the URL), with events `payment.captured`, `payment.failed`, `order.paid` and 🔑 `RAZORPAY_WEBHOOK_SECRET`.
- ☐ 80G number, if AIAIA holds 80G. Dues plans and treasurers.

### C4. Certificates
- ☐ Certificate designs exported as **PDF (A4 landscape)**, with blank space for the name, event, award, date, serial and QR. Admins then mark these spaces in the app; no special software is needed.
- ☐ Signatory names, titles and transparent-PNG signatures. Serial format (default `AIAIA-<EVENTCODE>-<YEAR>-<0001>`).

### C5. Gallery & *Review* archive
- ☐ Curated media per event; the organising committee confirms consent for images of minors.
- ☐ Videos as MP4 H.264, 720p, ≤ 150 MB each (HandBrake "Fast 720p30"). Long public videos can go on YouTube **only if they show no minors**, since unlisted YouTube links are viewable by anyone who has the link.
- ☐ Past *Review* issues as PDFs.

### C6. Other launch items
- ☐ Domain 💰 (about ₹1,000/yr, or a free subdomain of AIAIA's domain) with DNS on Cloudflare, connected to Pages. The email domain has SPF, DKIM and DMARC set.
- ☐ WhatsApp utility templates approved ⏱ (`membership_approved`, `event_update`, `dues_reminder`, `general_notice`, `certificate_ready`, `phone_changed`, `payment_receipt`, `guardian_attendance_alert`). Submit `guardian_attendance_alert` early. Testers need it in Phase 1 for the minor-safety alerts.
- ☐ Lawyer check: the consent approach for 14–17 year olds, the privacy policy and the terms.

## Stage D — Phase 3 content
- ☐ Heritage quiz question bank (100+ questions, checked)
- ☐ Mentors willing to be listed
- ☐ Library documents
- ☐ iOS: sponsor, Apple's non-profit waiver, or about ₹8.3k/yr budget

---

## Yearly running cost (excluding AI coding agents, which you cover)

| Item | Per year |
|---|---|
| Supabase, Cloudflare Pages/DNS, GitHub Actions, Expo Push, Firebase, Sentry | ₹0 |
| DigitalOcean Spaces, Bangalore (250 GB + 1 TB downloads) | about ₹6,200 |
| WhatsApp login codes | about ₹500–1,000 |
| WhatsApp official updates (2 a month to 600 members) | about ₹2,000 |
| WhatsApp sender SIM | about ₹2,000 |
| Domain | about ₹1,000 (₹0 if we use a subdomain of AIAIA's existing domain, e.g. `youth.aiaia.org`) |
| Email from AIAIA's official address (existing business account) | ₹0 (the SES fallback, if ever needed, costs about ₹0.01 per email) |
| **Total** | **about ₹11,000–12,000** |
| Google Play (once) | ₹2,100 |
| Razorpay | about 2% per payment (can be passed to the payer) |
| **Later:** iOS (about ₹8,300/yr); Supabase Pro at 5k+ users (about ₹31k/yr) | |

## All secrets in one place

All secrets live in your vault first, then in GitHub Actions secrets/variables or Supabase Edge Function secrets.

| Name | Where | Stage |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD_STAGING`, `SUPABASE_DB_PASSWORD_PROD` | GitHub (Environments) | A |
| `SUPABASE_PROJECT_REF_*`, `SUPABASE_POOLER_HOST_*` | GitHub variables | A |
| `EXPO_PUBLIC_SUPABASE_URL_*`, `EXPO_PUBLIC_SUPABASE_ANON_KEY_*` | GitHub variables (public by design) | A |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | GitHub (Environment `production`) | A |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub | A |
| `S3_ENDPOINT` (`https://blr1.digitaloceanspaces.com`), `S3_REGION` (`blr1`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase functions + GitHub (backups) | A/B |
| `BACKUP_AGE_RECIPIENT` (public key) | GitHub variable | A |
| `EMAIL_PROVIDER` (`gmail` / `graph` / `zoho` / `ses`), `EMAIL_FROM` (`updates@<aiaia-domain>`), plus that provider's credentials (`GMAIL_SERVICE_ACCOUNT_JSON`, or `GRAPH_TENANT_ID` + `GRAPH_CLIENT_ID` + `GRAPH_CLIENT_SECRET`, or `ZOHO_CLIENT_ID` + `ZOHO_CLIENT_SECRET` + `ZOHO_REFRESH_TOKEN`) | Supabase functions | A |
| `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` | Supabase functions (fallback only) | A (optional) |
| `EXPO_ACCESS_TOKEN` | Supabase functions | A |
| `VAPID_PUBLIC_KEY` (variable), `VAPID_PRIVATE_KEY` | Supabase functions / GitHub variable | B (agents generate these; you store them) |
| `PASS_SIGNING_PRIVATE_KEY` (Ed25519) | Supabase functions; the public half goes in the app config | B (agents generate; you store) |
| `SEND_SMS_HOOK_SECRET` | Supabase functions | B |
| `OTP_THROTTLE_KEY` (random, 32+ bytes; agents generate, you store) | Supabase functions | B |
| `WHATSAPP_*` | Supabase functions | B |
| `MSG91_*` | Supabase functions | B (optional) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Supabase functions | C |
| `SENTRY_DSN` (variable), `SENTRY_AUTH_TOKEN` | GitHub | A (optional) |

You set each secret yourself. `gh secret set NAME --env production` and `supabase secrets set --project-ref <ref> NAME=value` both prompt for or accept the value in your own terminal.
