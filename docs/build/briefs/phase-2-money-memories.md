# Phase 2 — Money & memories (still testers only)

Same block structure as Phase 0.

- All amounts are **integer paise**.
- Files live in **DigitalOcean Spaces BLR1**, accessed via `_shared/storage.ts`. Locally, MinIO stands in for Spaces.
- The three schema briefs (`P2-00a/b/c`) touch separate table groups and separate seed files, so they **run in parallel**. The orchestrator regenerates `db.types.ts` after merging them.

---

<a id="p2-00a"></a>
## P2-00a Payments schema + helpers

**Meta**
- **Size:** M
- **Maker:** Opus (`schema-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-10
- **Parallel with:** P2-00b, P2-00c

**Owns:** `supabase/migrations/*_p2_00a_*.sql`, `supabase/tests/p2_00a_*.test.sql`, `supabase/seeds/p2-00a.sql`, `supabase/functions/_shared/{razorpay,money}.ts` (+ tests), `packages/shared/src/schemas/payments.ts`

**Must**
1. **Tables**
   - `dues_plans`
   - `payments` (columns as below)
   - `receipt_counters(fy, last_no)`
   - `events.fee_paise` and `events.fee_required`

   `payments` columns:
   - **Who and what:** `payer_member_id`, `beneficiary_member_id`, `branch_id`, `purpose` (dues/event_fee/donation), `dues_plan_id`, `event_id`, `period_label`
   - **Money:** `amount_paise`, `fee_paise`, `method` (razorpay/cash/bank_transfer/upi_offline), `status` (created/pending/paid/failed/refunded/void)
   - **References:** `razorpay_order_id`, `razorpay_payment_id`, `receipt_no`, `receipt_path`, `proof_path`
   - **Admin fields:** `recorded_by`, `reconciled_at`, `notes`, `flagged_reason`, `paid_at`

   Every payment carries `branch_id`, so the money-routing decision (one central account or branch accounts) can stay open.
2. **RLS**
   - The payer, the beneficiary and the beneficiary's guardian can select their own payments.
   - `payments.view_branch` can select its branch's payments; `payments.view_all` can select all.
   - **No direct writes.**
3. **RPCs**
   - `create_payment_intent(...)`
   - `mark_payment_paid(payment_id, razorpay_payment_id, amount_paise)`
     - Service role only, idempotent.
     - Allocates the receipt number with a row lock, using the format `AIAIA-Y-<FY>-<000123>`.
     - Flags the payment on an amount mismatch.
   - `record_offline_payment(...)` is allowed in two ways:
     - with `payments.record_offline` for the branch (branch treasurers, national treasurer)
     - **or** for `event_fee` payments of one event only, with `is_event_staff(event, 'collect_payments')` (e.g. the NYM organising committee collecting at the venue)

     It takes a `client_ref` uuid and is idempotent by it, for offline sync. It records `recorded_by` (the collector).
   - `void_payment(id, reason)` requires `payments.reconcile`.
   - `dues_status(branch_id, period_label)`
4. **Helpers**
   - `razorpay.ts`: `createOrder`, `verifyWebhookSignature`, `verifyPaymentSignature`, and `createPaymentLink` (fallback, see P2-01).
   - `money.ts`: paise helpers and amount in words.
5. **pgTAP**
   - A member cannot read another member's payments.
   - Treasurer A cannot record a payment for branch B.
   - **Event collectors:** event staff with `collect_payments` can record an event fee for **that** event, but not dues and not another event's fee.
   - The same `client_ref` recorded twice produces one payment.
   - `mark_payment_paid` is idempotent: one receipt number even when called twice.

**Gates**
- G1 — CHECK: `pnpm db:reset && pnpm db:test` — EXPECT: `All tests successful.`
- G2 — CHECK: allow all active members to select `payments`, then reset and test — EXPECT: `p2_00a_payments` fails (restore afterwards)
- G3 — CHECK: `pnpm fn:test -- razorpay money` — EXPECT: the Razorpay signature known-vector test passes

---

<a id="p2-00b"></a>
## P2-00b Certificates + media schema, storage & PDF helpers

**Meta**
- **Size:** M
- **Maker:** Opus (`schema-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-10
- **Parallel with:** P2-00a, P2-00c

**Owns:** `supabase/migrations/*_p2_00b_*.sql`, `supabase/tests/p2_00b_*.test.sql`, `supabase/seeds/p2-00b.sql`, `supabase/functions/_shared/{storage,pdf}.ts` (+ tests), `docker-compose.minio.yml`, `packages/shared/src/schemas/{certificates,media}.ts`

**Must**
1. **Tables**
   - **Certificates**
     - `certificate_templates(id, name, kind, pdf_path, fields jsonb, signatories jsonb, is_active)`
       - `fields` lists the validated placeholder names and their boxes.
       - `pdf_path` points to the template **with its AcroForm fields already written in**.
     - `awards(id, event_id, member_id, kind, title, rank, template_id, created_by, unique(event_id, member_id, title))`
     - `certificates(id, award_id unique, serial unique, pdf_path null, rendered_at null, verify_hash, issued_at, revoked_at, revoked_reason)`
       - `pdf_path` stays null until the first render. It is a **cache**, not the source of truth.
     - `events.event_code`
   - **Media**
     - `albums(…, visibility default 'members', published_at)`
     - `media(id, album_id, kind image|video|youtube|pdf, path, thumb_path, youtube_id, width, height, bytes, caption, sort)`
     - `magazine_issues(...)`
2. **RLS**
   - Members and their guardians can select their own awards and certificates.
   - `certificates.issue` (for the event's scope) can manage them.
   - Active members can select published albums and media; `gallery.manage` can write them.
3. **RPCs**
   - `issue_awards(event_id, rows)`: creates `awards` and `certificates` rows (serial + `verify_hash`) **immediately**. No PDF is rendered at this point.
   - `revoke_certificate(id, reason)`
   - `verify_certificate(serial)`
     - Callable by **anon**.
     - Returns `{valid, holder_display_name, event_title, award_title, issued_at, revoked}`.
     - Minors are shown as first name + last initial. A purged member shows "name withheld".
4. **Helpers**
   - **`storage.ts`**
     - `presignGet(key, ttl)`, `presignPut(key, contentType, maxBytes, ttl)`, `putObject`, `deleteObject`, using `aws4fetch` against `S3_ENDPOINT` (Spaces BLR1 in staging/prod, MinIO locally).
     - Key layout:
       - `media/<album>/<uuid>.<ext>` and `thumbs/…`
       - `certificates/<serial>.pdf`
       - `receipts/<receipt_no>.pdf`
       - `consent/<member>/<uuid>.<ext>`
       - `avatars/<member>/<uuid>.webp`
       - `templates/<id>.pdf`
       - `proofs/<payment>/<uuid>.<ext>`
   - **`pdf.ts`**
     - **`addPlaceholderFields(templatePdf, boxes) → Uint8Array`** writes named AcroForm text fields into an uploaded flat PDF with `pdf-lib` (`form.createTextField(name).addToPage(page, rect)`).
     - **`validateTemplate(pdf) → {ok, missing[]}`**. Required fields: `holder_name`, `event_title`, `award_title`, `event_date`, `serial`, `qr`.
     - **`renderCertificate(templatePdf, data, qrPng) → Uint8Array`**:
       1. Fill the fields, using embedded Noto Sans (`subset: true`, via fontkit) and auto-fit font size to the box.
       2. Draw the QR PNG into the `qr` field's rectangle.
       3. `form.flatten()`.

       The background artwork is never decoded.
     - **`renderReceipt(data) → Uint8Array`**: a simple generated layout.
5. **Tests**
   - **pgTAP**
     - `verify_certificate` as anon exposes no phone or DOB and masks minors.
     - A member cannot read another member's awards.
   - **Deno**
     - `addPlaceholderFields` followed by `validateTemplate` returns ok.
     - A template missing `serial` fails validation.
     - **A render using a 2 MB sample template completes with < 300 ms of measured CPU time**, and the output has no remaining form fields (flattened).
     - The storage presign matches an AWS SigV4 test vector.

**Gates**
- G1 — CHECK: `pnpm db:reset && pnpm db:test` — EXPECT: `All tests successful.`
- G2 — CHECK: `pnpm fn:test -- storage pdf` — EXPECT: `ok`, 0 failed, including the CPU-budget test
- G3 Flattening is pinned — CHECK: skip `form.flatten()`, then run G2 — EXPECT: the "no remaining fields" test fails (restore afterwards)

---

<a id="p2-00c"></a>
## P2-00c WhatsApp messaging schema + RPCs

**Meta**
- **Size:** S
- **Maker:** Opus (`schema-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P1-10
- **Parallel with:** P2-00a, P2-00b

**Owns:** `supabase/migrations/*_p2_00c_*.sql`, `supabase/tests/p2_00c_*.test.sql`, `supabase/seeds/p2-00c.sql`, `packages/shared/src/schemas/whatsapp.ts`

**Must**
1. **Tables**
   - `whatsapp_templates`
   - `whatsapp_campaigns` (with `approved_by`, `estimated_cost_paise` and a schedule time)
   - `whatsapp_messages`
2. **RLS:** every table requires `whatsapp.send`.
3. **RPCs**
   - `whatsapp_audience_preview(audience)`: returns the recipient count and estimated cost.
   - `approve_campaign(id)`: must be a **different** person from the creator. A super admin may bypass this rule, and the bypass is audited.
   - `queue_campaign(id)`
     - Only opted-in, active members with a phone are included.
     - Dependents are reached through their guardians' phones.
     - Phone numbers are deduplicated.
4. **pgTAP**
   - Members who have not opted in are skipped.
   - A guardian's phone is used for a dependent.
   - The creator cannot approve their own campaign.
   - A caller without `whatsapp.send` is denied.

**Gates**
- G1 — CHECK: `pnpm db:reset && pnpm db:test` — EXPECT: `All tests successful.`
- G2 — CHECK: drop the opt-in filter, then reset and test — EXPECT: `p2_00c_whatsapp` fails (restore afterwards)

---

<a id="p2-01"></a>
## P2-01 Online payments (Razorpay)

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P2-00a, P2-00b
- **Parallel with:** P2-03, P2-04, P2-06
- **Owner gates:** C3 (test keys are enough to build)

**Owns:**
- `app/pay/[paymentId].tsx`, `app/(app)/payments/`
- `src/features/payments/`, `packages/api/src/payments/`
- `supabase/functions/{payments-create-order,payments-webhook,receipt-render}/`

**Must**
1. **Entry points**
   - My dues: current-period status for the member and each dependent.
   - Paid event registration: the RSVP becomes `going` once payment completes.
   - Donate: suggested amounts or a custom amount, minimum ₹10.
2. **`payments-create-order`**
   - Creates a Razorpay order with `notes {payment_id, branch_id, purpose}`.
   - Returns the checkout parameters, including **prefill `{name, contact, email (if verified)}`**.
   - Adds an optional convenience fee when `pass_fee_to_payer` is set.
3. **Payment confirmation emails come from Razorpay.**
   - When an email is prefilled, Razorpay sends its own payment confirmation to the payer. We send **no** payment email for online payments.
   - **Verify in Razorpay test mode** that this email arrives with Standard Checkout. If it does not, switch the hosted flow to **Payment Links** with `notify: {email: true, sms: false}` and `callback_url`, using `createPaymentLink`. Same webhook, event `payment_link.paid`. Record which path you chose under Decisions.
4. **Hosted checkout `/pay/[paymentId]`**
   - Opens Razorpay Checkout JS.
   - The success handler only gives fast optimistic UI; the webhook confirms the payment.
   - Then redirects to `aiaiayouth://payments/return` on Android or `/payments/<id>` on web.
   - Android opens the page in `expo-web-browser` and polls the payment status for up to 2 minutes.
5. **`payments-webhook`** (the source of truth)
   - Verifies the signature against the raw request body.
   - `payment.captured`, `order.paid` or `payment_link.paid` → `mark_payment_paid`, which checks the amount.
   - `payment.failed` → status `failed`.
   - Idempotent; returns 200 fast.
6. **Official AIAIA receipt**
   - `receipt-render` renders the receipt on demand and caches it in Spaces.
   - Contents: receipt number, payer, beneficiary, purpose, amount in figures and words, method, date, and an 80G line if configured.
   - It is downloadable in the app (Payments → Receipt), so members without email still get it.
7. **History:** My payments, including dependents, with receipt download.
8. **Tests (Deno)**
   - A bad signature returns 401 and makes no DB call.
   - A duplicate webhook produces one receipt.
   - An amount mismatch is flagged.
   - Both webhook event shapes (order and payment link) are handled.

**Gates**
- G1 — CHECK: `pnpm fn:test -- payments receipt` — EXPECT: `ok`, 0 failed
- G2 — CHECK: skip signature verification, then run G1 — EXPECT: the bad-signature test fails (restore afterwards)
- G3 — CHECK: skip the amount check, then run G1 — EXPECT: the mismatch test fails (restore afterwards)
- G4 — CHECK: `pnpm test -- payments && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

**Manual gates**
- In Razorpay test mode on staging, a **UPI** payment and a card payment each complete on Android (in-app browser) and on web.
- Razorpay's confirmation email arrives.
- The receipt PDF opens.
- Replaying the webhook changes nothing.
- *Do the UPI test first. It is the riskiest path, because UPI app hand-off from an in-app browser has to work.*

---

<a id="p2-02"></a>
## P2-02 Offline payments & treasurer tools

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P2-00a, P2-01 (receipt renderer), P2-04 (proof upload), P1-07b (scanner for venue collection)
- **Parallel with:** P2-05
- **Owner gates:** C3 (dues plans and treasurers)

**Owns:** `app/(admin)/payments/`, `src/features/treasury/`, `packages/api/src/treasury/`

**Must**
1. **Dues plans admin.**
2. **Record a payment** (branch treasurers, national treasurer, or an **event's collection team** such as the NYM committee)
   - Choose the member or dependent, then enter purpose, amount, method, date, reference and notes.
   - Attach proof (photo or screenshot).
   - **Venue quick-collect:**
     - In the event scanner, a staff member with `collect_payments` scans a pass and taps **Collect fee**.
     - The amount is prefilled with the event fee; they pick cash or UPI to the AIAIA account and save.
     - It works **offline**: entries queue with a `client_ref` and sync automatically.
   - **Receipts are sent automatically** as soon as the payment is recorded or synced. The receipt goes to the member, or to the guardian for a dependent:
     - **in-app + push:** "Your AIAIA receipt <number> is ready"
     - **WhatsApp** utility template `payment_receipt`, if opted in. It carries the receipt number and a link, never the amount.
     - **email** with the PDF from AIAIA's official address, if the member has a verified email. `email_receipts` defaults to on.
   - The receipt is always downloadable in the app as well.
2b. **Collector summary:** for each event and collector, show cash and UPI totals and counts. This supports the cash handover to the treasurer and reconciliation, and exports to CSV.
3. **Dues board:** paid / unpaid per branch and period, with totals, CSV export, and a bulk reminder (a WhatsApp draft once P2-06 exists, otherwise an in-app notification).
4. **Ledger:** filters, totals by branch and purpose, reconcile, void with reason, and an auditor CSV that includes Razorpay ids and fees.
5. **Tests**
   - Unit:
     - totals and the CSV columns
     - collector summary totals
     - the venue quick-collect queue survives a restart and syncs once
   - Deno: on record, the receipt notification, WhatsApp and email fan-out respect opt-ins, and the WhatsApp text has no amount.

**Gates**
- G1 — CHECK: `pnpm test -- treasury` — EXPECT: the totals test passes (void rows excluded)
- G2 — CHECK: include void rows in totals, then run G1 — EXPECT: a failure (restore afterwards)
- G3 — CHECK: `pnpm db:test && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: pass / exit 0

---

<a id="p2-03"></a>
## P2-03 Certificates (PDF templates with placeholders, on-demand rendering)

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P2-00b, P2-04
- **Parallel with:** P2-01, P2-06
- **Owner gates:** C4 (a placeholder template is fine)

**Owns:**
- `app/(app)/certificates/`, `app/(admin)/certificates/`, `app/(public)/verify/[serial].tsx`
- `src/features/certificates/`, `packages/api/src/certificates/`
- `supabase/functions/{certificate-template,certificates-render}/`

**Must**
1. **Template setup (web admin)**
   - Upload the designer's flat PDF and show page 1 as an image preview (`pdf.js`).
   - The admin **draws a box** for each placeholder and picks its name from the fixed list (`01-architecture.md §9`), plus font size, alignment and colour.
   - `certificate-template` calls `addPlaceholderFields` and then `validateTemplate`, and stores the result.
   - A PDF that **already has correctly named form fields** is accepted after validation, with no drawing needed.
   - "Preview" renders a sample certificate.
2. **Issuing (separate from rendering)**
   - From an event, "Participation for everyone checked in" is one click. It reads `check_ins`.
   - Add winners: pick a member, title, rank and template. Bulk paste is supported.
   - "Issue" calls `issue_awards`. This is **instant**: database rows only.
   - Members and guardians get a notification: "Your certificate is ready".
3. **Rendering (`certificates-render`)**
   - **On demand**, the first time a certificate is viewed or downloaded:
     1. Load the template.
     2. Generate the QR for `https://<domain>/verify/<serial>`.
     3. Call `renderCertificate` and save to `certificates/<serial>.pdf`.
     4. Set `pdf_path`.
     5. Return a presigned URL.
   - Later requests hit the cache.
   - **"Pre-render all" (optional):** an admin button that queues the event's certificates and processes them in batches of 20 per invocation through pg_cron, so certificates are ready before a ceremony.
   - **Revoking** deletes the cached PDF.
4. **My Certificates tab**
   - Shows the member's own certificates plus their dependents'.
   - View, download or share.
   - "Share verification link".
5. **Admin winners view:** who won what per event, CSV export, revoke.
6. **Public `/verify/[serial]`:** shows Valid, Revoked or Not found, plus the display name, event, award and date. Nothing else.
7. **Tests**
   - Deno:
     - Rendering twice reuses the cache, so only one storage put happens.
     - A revoked certificate returns 410.
     - A template without `qr` is rejected.
   - Unit: bulk-paste matching.

**Gates**
- G1 — CHECK: `pnpm fn:test -- certificate` — EXPECT: `ok`, 0 failed
- G2 Cache is pinned — CHECK: always re-render, then run G1 — EXPECT: the single-put test fails (restore afterwards)
- G3 — CHECK: `pnpm test -- certificates && pnpm db:test && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: pass / exit 0

**Manual gates**
- A Canva-exported PDF gets placeholders drawn on it in the app.
- Issue 30 participation certificates and 3 winner certificates.
- Download one on Android; scanning its QR shows "Valid".
- Revoke it; the page shows "Revoked".

---

<a id="p2-04"></a>
## P2-04 Media pipeline (Spaces uploads and downloads)

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P2-00b
- **Parallel with:** P2-01, P2-06
- **Owner gates:** A3 (Spaces buckets + CORS, keys stored as Supabase secrets)

**Owns:** `supabase/functions/media-sign/`, `packages/api/src/media/`, `src/features/media/`, `docs/storage-cors.json`

**Must**
1. **`media-sign`**
   - **`get`**: requires `is_active()`, plus a per-object check:
     - the album is published
     - it is the member's own receipt or certificate
     - consent documents only for approvers and the guardian
     - avatars of active members
     - event-pack thumbnails only for scope officers

     Issues presigned GET URLs valid for 15 minutes, batched up to 50 keys.
   - **`put`**: permission by purpose (gallery, avatar, consent, proof, template), a content-type whitelist and size limits (images ≤ 15 MB, video ≤ 150 MB, PDF ≤ 50 MB).
2. **`docs/storage-cors.json`**: the CORS rules for the owner to apply to each bucket. Allow `GET`, `PUT` and `HEAD` from the production domain, the Pages preview domain and `http://localhost:8081`; allowed headers `content-type`; max age 3600.
3. **`useUpload(purpose)`**
   - Compresses to 2048 px at quality 0.8 (`expo-image-manipulator` on native, canvas on web) and creates a 400 px thumbnail.
   - PUTs with progress reporting and 3 retries.
4. **Display**
   - `<PrivateImage path>` batches URL requests and **always passes `cacheKey = path` to `expo-image`**, so a new signed URL never triggers a re-download.
   - `<PrivateVideo>` uses `expo-video`. `<YouTubeEmbed>` is allowed only for albums marked "no minors shown".
5. **Wire up the deferred uploads:** the avatar in P1-02, the consent document in P1-03, and event-pack thumbnails in P1-07b.
6. **Tests**
   - Deno:
     - An inactive caller gets 403.
     - The wrong purpose permission gets 403.
     - An oversize file gets 400.
     - A bad content type gets 400.
   - Unit: `PrivateImage` passes a stable `cacheKey` when the URL changes.

**Gates**
- G1 — CHECK: `pnpm fn:test -- media-sign` — EXPECT: `ok`, 0 failed
- G2 — CHECK: remove the `is_active` check, then run G1 — EXPECT: the inactive-caller test fails (restore afterwards)
- G3 Cache key is pinned — CHECK: pass the URL as `cacheKey`, then run `pnpm test -- media` — EXPECT: a failure (restore afterwards)
- G4 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

**Manual gates**
- With the emulator throttled to 3G, an avatar upload completes and the stored file is < 600 KB.
- A web bulk upload works against the staging bucket, so CORS is correct.

---

<a id="p2-05"></a>
## P2-05 Gallery + *Review* magazine archive

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Sonnet (`brief-reviewer`)
- **Depends on:** P2-00b, P2-04
- **Parallel with:** P2-02
- **Owner gates:** C5 (sample images until then)

**Owns:** `app/(app)/gallery/`, `app/(admin)/gallery/`, `src/features/gallery/`, `packages/api/src/gallery/`

**Must**
1. **Member gallery**
   - Album grid with year and event filters.
   - Inside an album: a thumbnail grid, then a full-screen viewer with swipe and zoom, video playback, and single-photo download.
   - A "Report" action on any item (P1-11).
2. ***Review* archive:** list of issues → PDF viewer → link to the matching album.
3. **Admin**
   - Create albums and link them to an event or an issue.
   - Web bulk upload of up to 200 files: 4 in parallel, retry and resume.
   - YouTube links (only for albums with no minors), reordering, cover image, captions, publish/unpublish.
   - Issue PDFs.
4. **Tests:** upload-queue unit tests: never more than 4 in flight, retries, resume.

**Gates**
- G1 — CHECK: `pnpm test -- gallery` — EXPECT: the queue tests pass
- G2 — CHECK: set unlimited concurrency, then run G1 — EXPECT: a failure (restore afterwards)
- G3 — CHECK: `pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: exit 0

---

<a id="p2-06"></a>
## P2-06 Official AIAIA WhatsApp messaging

**Meta**
- **Size:** M
- **Maker:** Sonnet (`brief-builder`) · **Review:** Opus (`security-reviewer`)
- **Depends on:** P2-00c
- **Parallel with:** P2-01, P2-03, P2-04
- **Owner gates:** B1 and C6 (approved templates; mock the Graph API until then)

**Owns:**
- `app/(admin)/whatsapp/`, `src/features/whatsapp/`, `packages/api/src/whatsapp/`
- `supabase/functions/{whatsapp-sync-templates,whatsapp-send-worker,whatsapp-webhook}/`
- `docs/whatsapp-templates.md`

**Must**
1. **Template sync:** manual + daily.
2. **Compose a campaign**
   - Pick a template and fill its variables (member fields allowed).
   - Pick the audience: all, branches, roles, wing, event RSVPs, unpaid dues, or a hand-picked list.
   - Preview the recipient count, estimated cost and a sample message.
   - Save as a draft.
3. **Approve and send**
   - A **second person** approves (`approve_campaign`).
   - Then send now or schedule.
4. **`whatsapp-send-worker`** (pg_cron, every minute)
   - At most 20 messages per second, with backoff on 429.
   - Stores `wa_message_id`.
   - Permanent errors are marked failed.
5. **`whatsapp-webhook`**
   - Verify handshake and `X-Hub-Signature-256`.
   - Status updates.
   - "STOP" opts the member out and sends a confirmation.
   - Other replies become an admin notification. There is no chatbot.
6. **Reports:** status counts, a list of failures with reasons, and CSV export.
7. **`docs/whatsapp-templates.md`:** draft texts for the owner to submit: `membership_approved`, `event_update`, `dues_reminder`, `general_notice`, `certificate_ready`, `phone_changed`, `payment_receipt`, `guardian_attendance_alert`.
8. **Message text rule:** no phone numbers, DOBs or amounts in any message text.
9. **Tests (Deno):** signature verification, status mapping, STOP handling, worker rate limit and backoff.

**Gates**
- G1 — CHECK: `pnpm fn:test -- whatsapp` — EXPECT: `ok`, 0 failed
- G2 — CHECK: skip signature verification, then run G1 — EXPECT: a failure (restore afterwards)
- G3 — CHECK: remove the STOP handling, then run G1 — EXPECT: the opt-out test fails (restore afterwards)
- G4 — CHECK: `pnpm db:test && pnpm test -- whatsapp && pnpm lint && pnpm typecheck && pnpm web:build` — EXPECT: pass / exit 0

**Manual gates**
- Using Meta's test number, send a `general_notice` to 3 team phones after a second person approves it.
- Delivered and read statuses update.
- Replying STOP opts that number out.

---

<a id="p2-99"></a>
## Public launch gate (end of Phase 2 → v1.0)

This is not a brief. It is the checklist the orchestrator and owner confirm before real members join:

- Owner Stage C is complete: D-U-N-S, Play listing, KYC pages approved, Razorpay live, lawyer check.
- Real OTP works for test numbers on prod; test numbers are removed from prod.
- The Supabase SMS rate limit has been raised to suit the onboarding plan.
- A restore test from an encrypted backup has passed.
- The P1-10 E2E suites are green on the release commit.
- A Play internal-testing build has been smoke-tested on a Xiaomi-family phone and a Pixel/Samsung.
- `version.json` points at the Play Store.
- Tag `v1.0.0`.
