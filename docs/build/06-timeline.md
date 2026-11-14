# AIAIA Youth App: Build Timeline & Plan

*From setup to public launch and Phase 3 · Plan date 12 November 2026*

**What the dates assume**
- Start on **Monday 16 November 2026**.
- The owner gives about **8–12 hours a week**: approvals, phone tests and paperwork.
- Up to **4 agents** run in parallel (Opus orchestrates, Sonnet builds).
- The **Christmas–New Year** stretch runs at about half speed.
- **Building isn't the bottleneck; paperwork is.** The launch date depends mostly on AIAIA's documents, the D-U-N-S number, Meta (WhatsApp) verification, Razorpay KYC and the lawyer's review. Start all of them in Week 0.

---

## Headline dates

| Milestone | Target date | What it means |
|---|---|---|
| **M0 Foundation** (`v0.1.0`) | **Fri 4 Dec 2026** | App skeleton, database foundation, CI/CD and the first signed APK are done. |
| **Self-updating test app** | **Fri 11 Dec 2026** | Your phone installs new builds from GitHub with one tap; no cable needed. |
| **M1 Tester build** (`v0.5.0`) | **Fri 22 Jan 2027** | Joining, approvals, directory, events, passes and check-in, member ID, parent alerts, admin, security. |
| **M2 Tester build 2** (`v0.9.0`) | **Fri 12 Feb 2027** | Payments (test mode) and receipts, certificates, gallery and the *Review* archive, WhatsApp updates. |
| **Tester pilot** | **15 Feb – 7 Mar 2027** | One branch plus NYM committee volunteers use it for real; fixes ship as in-app updates. |
| **M3 Public launch** (`v1.0.0`) | **Mon 8 Mar 2027** | On the Play Store and the web, under AIAIA's name; branches onboard over about 2 weeks. |
| **M4 Community** (`v2.0.0`) | **Fri 2 Apr 2027** | Jobs board, quizzes, polls, mentorship, documents, birthday wishes. |
| DPDP Rules fully in force | ~13 May 2027 | Already designed for; there is a final compliance check that week. |

**In short:** about **16 weeks to public launch** and **20 weeks to the full feature set**.
- **Fast case:** if paperwork arrives early and you can give 15–20 h a week, launch could be around **mid-February**.
- **Slow case:** if verification or KYC drags, expect around **early April**.

## Week by week: the build lane

| Week | Dates | Wave and briefs (maker model) | Result |
|---|---|---|---|
| **W0** | 16–22 Nov | **Setup:** tools, repo, settings, connectors (`05-workflow-setup.md`). The committee reviews the pitch and proposal | Ready to type `/orchestrate` |
| **W1** | 23–29 Nov | **0a:** P0-01 scaffold (S) ∥ P0-02 DB foundation (O) | App and database skeletons |
| **W2** | 30 Nov–6 Dec | **0b:** P0-03 CI/CD (S) ∥ P0-04 design system (S) ∥ P1-09 policy pages (S) | **M0 `v0.1.0`** · first signed APK |
| **W3** | 7–13 Dec | **1a:** P1-00a tables + RLS (O) ∥ P0-05 in-app updates (S), then **1b** starts: P1-00b ∥ P1-00c (O) | **Self-updating test app** |
| **W4** | 14–20 Dec | **1b** finishes. **1c:** P1-01 login (S) ∥ P1-04 admin shell (S) ∥ P1-05 directory (S) ∥ P1-07a events (S) | Login, admin, directory, events |
| **W5** | 21–27 Dec | **1c** finishes (holiday week) | — |
| **W6** | 28 Dec–3 Jan | **1d:** P1-02 profile and guardians (S) ∥ P1-06 notifications (S) ∥ P1-07b passes and check-in (S) ∥ P1-08 roster import (S), at half speed | Passes, push, profiles |
| **W7** | 4–10 Jan | **1e:** P1-12a email (S) ∥ P1-12b phone change (S) ∥ P1-13b retention (S) ∥ P1-03 approvals (S) | Approvals, email, support tools |
| **W8** | 11–17 Jan | **1f:** P1-11 reporting (S) ∥ P1-13a settings and deletion (S) ∥ P1-12c admin device check (S) ∥ P1-14 member ID and transfers (S) | Safety and account features |
| **W9** | 18–24 Jan | **1g:** P1-15 parent alerts (S) · **1h:** P1-10 E2E and release (S) · Phase 1 security audit (O) | **M1 `v0.5.0`** testers |
| **W10** | 25–31 Jan | **2a:** P2-00a payments ∥ P2-00b certificates/media ∥ P2-00c WhatsApp schemas (all O) | Phase 2 database |
| **W11** | 1–7 Feb | **2b:** P2-01 online payments (S) ∥ P2-04 media pipeline (S) ∥ P2-06 WhatsApp (S) | Payments, uploads, campaigns |
| **W12** | 8–14 Feb | **2c:** P2-02 cash and receipts (S) ∥ P2-03 certificates (S) ∥ P2-05 gallery (S) · Phase 2 audit (O) | **M2 `v0.9.0`** |
| **W13–14** | 15–28 Feb | **Tester pilot:** fix waves from feedback (S fixers), and a real event dry run with check-in and parent alerts | Pilot sign-off |
| **W15** | 1–7 Mar | **Launch gate** (`phase-2 #p2-99`): legal sign-off, Play production review, Razorpay live, restore test | **M3 `v1.0.0`, Mon 8 Mar** |
| **W16–17** | 8–21 Mar | Branch-by-branch onboarding and roster imports. Support on hand while branches settle in. **3a:** P3-00 (O) | All branches live |
| **W17–19** | 15 Mar–2 Apr | **3b:** P3-01 jobs ∥ P3-02 quizzes ∥ P3-03 polls ∥ P3-04 mentorship (all S), then P3-05 documents ∥ P3-06 birthdays (S) · Phase 3 audit (O) | **M4 `v2.0.0`** |

S = Sonnet maker, O = Opus maker. Every brief also gets its review: Sonnet, or Opus for the 20 security-sensitive ones.

## The owner lane: paperwork and inputs, with deadlines

| Item | Start | Needed by | Unblocks |
|---|---|---|---|
| AIAIA written permission + registration documents, PAN, bank | **W0** | W2 | Everything external |
| Licence decision (AGPL recommended); app name, app ID, logo, colours | **W0** | W1 | P0-01 |
| Official branch list | W0 | W3 | P1-00a seeds (placeholders until then) |
| Supabase, Cloudflare, Expo, Firebase, GitHub org; signing key; backup key | W0–W1 | W2 | P0-03 |
| **D-U-N-S number** (2–4 weeks) | **W0–W1** | W5 | Play Console organisation account |
| Google Play Console organisation account + verification | W5 | W8 | Internal testing; **production at launch** |
| **Meta Business verification**, sender SIM, login template | **W0** | **W8** | Real login codes for testers (test numbers work before that) |
| Domain decision + AIAIA email (`updates@`) access | W1 | W6 | P1-12a email |
| WhatsApp templates: parent alert, receipt, updates | W6 | W9 / W11 | P1-15, P2-02, P2-06 |
| Policy facts: address, refund rules, dues amounts | W1 | W3 (drafts) / W12 (final) | Policy pages, Razorpay KYC |
| Names: Enforcement Committee, support staff, treasurers, event teams, safety leads | W5 | W8 | Phase 1 manual tests |
| DigitalOcean Spaces (Bangalore) | W9 | W10 | Phase 2 |
| **Razorpay account + KYC** | W6 | live keys by W14 | Real payments at launch |
| Money-flow decision (central vs branch accounts) | — | W10 | P2-00a |
| Certificate designs, *Review* photos and videos, paper rosters | W6 | W12 | Phase 2 content; launch onboarding |
| Accountant: how long financial records are kept | W6 | W14 | Retention policy |
| **Lawyer review:** 14–17 consent, 18th-birthday handover, privacy policy, terms | **W9** | **W14** | Launch |
| iOS funding (sponsor, waiver or budget) | any time | — | Later iOS release |

## Critical path to launch

```
AIAIA permission ─▶ D-U-N-S ─▶ Play Console org ─▶ Play production review ─┐
AIAIA permission ─▶ Meta verification ─▶ WhatsApp templates ───────────────┼─▶ Launch gate ─▶ v1.0 (8 Mar)
Policy facts ─▶ policy pages ─▶ Razorpay KYC ─▶ live keys ─────────────────┤
Draft legal pages (W2) ─▶ lawyer review (W9–W14) ──────────────────────────┘
Build lane (W1–W12) and tester pilot (W13–14) run alongside, and usually finish first.
```

## Risks and buffers

| Risk | Effect | Buffer or mitigation |
|---|---|---|
| D-U-N-S or Play verification is slow | Launch slips | Apply in W0. Testers use the self-updating APK meanwhile |
| Meta verification is slow | Testers stay on test login numbers longer | Test numbers work. Push alerts cover parents until WhatsApp is approved |
| Razorpay KYC is delayed | No live payments at launch | Launch with cash recording plus online payments in test mode, and switch on later |
| Holiday slowdown (W5–W6) | About 1 week lost | Already built into the dates |
| Usage limits on your Claude plan | Slower waves | Run 2–3 agents instead of 4. Sonnet remains the default |
| A brief fails review twice | That wave slips by a few days | Automatic escalation to Opus. Split the brief if it recurs |
| Phone tests pile up | Merges wait | Keep 30–60 minutes at the end of each wave for the manual tests the orchestrator lists |

## After v2.0
- **iOS app:** once it's funded. The same code base needs about 2–3 weeks for builds, the App Store listing and review.
- **Before the next NYM:** a full event dry run at a branch event, plus training for event teams.
- **Later:** branch chat, elections and features for the wider AIAIA. These need new briefs.
