# 05 — Workflow Setup: getting the multi-agent build running

This page covers everything you need to install and configure so that **Opus orchestrates and Sonnet builds**, with as little friction as possible. How the loop itself works is in [`04-agent-playbook.md`](04-agent-playbook.md).

```
 You (owner)
   │  /orchestrate · approve merges · phone tests · owner items
   ▼
 Main session ── Opus (orchestrator) ───────────────────────────────┐
   │ creates .worktrees/<ID>, dispatches up to 4 agents in parallel  │
   ├─▶ brief-builder   (Sonnet)  ×N   builds a brief                 │
   ├─▶ schema-builder  (Opus)         schema/RLS briefs, escalations  │
   ├─▶ brief-fixer     (Sonnet)       applies review findings         │
   ├─▶ brief-reviewer  (Sonnet)       routine reviews                 │
   ├─▶ security-reviewer (Opus)       security reviews, phase audits  │
   └─▶ suite-runner    (Haiku)        full suites, E2E                │
   ▼                                                                  │
 GitHub: PR → CI (lint · types · tests · pgTAP · Deno · web build) ───┘
   ▼
 You merge → release tag → APK + update manifest → testers' phones update themselves
```

---

## 1. What you need

| ✓ | Item | Why | Notes |
|---|---|---|---|
| ☐ | **A Claude plan with Claude Code that includes Opus and Sonnet** | One Opus session plus up to 4 Sonnet agents in parallel is heavy usage | Use a Max-tier plan (the higher tier if you run 4 agents at once). Watch `/usage`. If you hit limits, run 2–3 agents per wave instead of 4 |
| ☐ | **Claude Code, up to date** | The agent files use the `model`, `effort`, `tools` and `permissionMode` fields | The desktop app's Code tab updates itself. From the CLI, run `claude update` |
| ☐ | **The build tools** from `02-owner-setup.md` A1 | The agents run these commands | Git, Node 22+, pnpm (`corepack enable`), Docker Desktop, Deno, GitHub CLI, age, JDK 17, Android Studio. Your PC already has Git, Node, `gh` and adb |
| ☐ | **The code repo** in its own folder, on GitHub (step 2) | Worktrees, PRs and CI need git and GitHub | The repo must be **public** for free CI |
| ☐ | **The accounts** in `02-owner-setup.md` A3 | Deploys, push and storage | GitHub and Supabase are enough to start Phase 0 |

**You don't need to clone any git repos.** P0-01 scaffolds the app (`create-expo-app`) and P0-02 initialises Supabase (`supabase init`). Every library arrives through `pnpm`. The only repo is your own.

## 2. The repo: `C:\path\to\AIAIA_app`

**Already done:** the build pack lives in `NYM5\AIAIA_app`. It is a git repository on branch `main`, with a first commit.

**What git sees:** only files **inside `AIAIA_app`**. The delegate spreadsheets in the parent `NYM5` folder are outside the repo, so they can never be committed or pushed.
- **Keep it that way:** never copy member files into `AIAIA_app`.
- **For agents:** `AGENTS.md` forbids them from reading the parent folder.

**What's left is putting it on GitHub.** Run in **PowerShell**:

```powershell
cd "C:\path\to\AIAIA_app"
gh repo create aiaia-youth/aiaia-youth-app --public --source . --push
```

- Create the GitHub organisation `aiaia-youth` first (github.com → New organisation, free), or replace it with your own username.
- `.gitignore` already excludes `.worktrees/`, `.env*`, keystores and the backup key.

## 3. Turn on the project settings (once)

The permission allowlist and "Opus by default" are in `docs/build/claude-settings.example.json`. Copy it into place yourself; agents can't change their own permissions:

```powershell
Copy-Item docs\build\claude-settings.example.json .claude\settings.json
git add .claude/settings.json
git commit -m "Claude Code project settings"
git push
```

**What it does:**
- **Allows without asking:**
  - `pnpm`, `npx expo` and `npx supabase`
  - `deno test`, `deno fmt`, `deno lint` and `deno check`
  - local git work: status, diff, log, add, commit, rebase, worktree and similar
  - pushing **`feat/*`** branches
  - `gh pr create`, `view` and `checks`, plus `gh run` and `gh workflow run`
- **Always blocks:**
  - force-pushes, pushes to `main`, `git reset --hard`, `git clean` and `git stash`
  - `supabase db push`, `supabase link` and `supabase secrets` (production changes go through CI)
  - `gh secret`, `gh pr merge`, `gh release delete` and `rm -rf`
  - reading `.env` files, keystores or the backup key
- **Asks you** for anything else.
- **Merging is yours:** you merge PRs in GitHub, or approve the orchestrator's request.

Agents use the **Bash** tool (Git Bash on Windows) for project commands, so the allowlist applies. The rules are written in `Bash(...)` form.

## 4. Connectors (MCP servers) and plugins

### Essential (install before the first wave)

| Connector | Why it matters for a Sonnet-heavy build | Install (run once, in any terminal) |
|---|---|---|
| **Context7** | Up-to-date docs for Expo, Supabase, React Native, pdf-lib and more, so agents don't code against stale APIs. This is the biggest single quality boost for Sonnet makers | `claude mcp add --scope user --transport http context7 https://mcp.context7.com/mcp` (optional: a free API key from context7.com for higher limits, added as `--header "CONTEXT7_API_KEY: <key>"`) |
| **Expo** (official) | Expo Skills, SDK-matched package installs and build logs | `claude plugin install expo@claude-plugins-official`, then run `/mcp` in a session and sign in with your Expo account |
| **GitHub CLI** | PRs, CI status and releases | Already installed. Run `gh auth login` once. The desktop app's PR panel shows CI and offers Auto-fix; no GitHub MCP is needed |

### Recommended (after P0-03, once the staging project exists)

| Connector | Why | Install |
|---|---|---|
| **Supabase MCP** (staging only, read-only) | Lets the orchestrator and security reviewer inspect the **staging** schema, run Supabase's security advisors (e.g. missing RLS) and read function logs | `claude mcp add --scope local --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<STAGING_PROJECT_REF>&read_only=true"`, then `/mcp` to sign in. **Never point it at production.** `--scope local` keeps the project ref out of the public repo |

### Optional (later)
- **Sentry MCP:** crash triage after launch.

**Already covered without extra installs:**
- the desktop app's **built-in browser**, for web previews
- **Playwright**, which runs from the CLI for E2E tests

**Keep the `delegate` plugin you already have.** Its conventions (verification, budgets, fresh reviewers) match this workflow. `AGENTS.md` tells every session to use the project's own agents in `.claude/agents` rather than the generic `delegate:*` ones.

To check everything is connected, run `claude mcp list` in a terminal, or `/mcp` inside a session.

## 5. First run

1. Open the folder `C:\path\to\AIAIA_app` in Claude Code (desktop: **Code** tab → choose folder). Open **this** folder, not `NYM5`, so the session's working directory is the repo.
2. Check the model picker shows **Opus**. `.claude/settings.json` sets it.
3. Type **`/orchestrate`**. The orchestrator:
   1. reads the status table
   2. checks your Stage A items
   3. starts **wave 0a**: P0-01 (Sonnet) and P0-02 (Opus), in parallel, in `.worktrees/`
4. It reports back with gate results and review verdicts, then asks you to approve each merge.
5. **After P0-03 merges:** turn on branch protection for `main` (require a PR, the `ci` check and 1 approval; block force-push). Then add the Supabase MCP.
6. **After P0-05 merges:** install the tester APK on your phone **once**. From then on, every tagged build arrives as an in-app "Update available → Install".

## 6. Your rhythm

| When | You do | Time |
|---|---|---|
| Start of a wave (every 2–4 days) | Type `/orchestrate`; answer any owner-gate questions | 10 min |
| During the wave | Approve permission prompts it can't skip; reply to questions | as needed |
| End of the wave | Read the report; merge the PRs in GitHub; run the listed **manual gates** on your phone (usually 15–30 min) | 30–60 min |
| Weekly | Push one owner item forward (paperwork, accounts, content); run `/usage` | 1–3 h |
| After any break | Type `/resume-build` | 5 min |

**Expect about 8–12 hours a week from you**, more during the tester and launch weeks.

## 7. Keeping cost and quality in balance

- **Sonnet is the default maker.** Opus is reserved for:
  - orchestration
  - the 8 schema briefs
  - 20 security reviews
  - escalations
  - one security audit per phase
- **Let Haiku run the suites.** It's cheap, and long waits don't cost the orchestrator its context.
- **Hitting usage limits?** Drop to 2–3 parallel agents. Don't switch makers to Opus.
- **A Sonnet maker failing the same brief twice** escalates automatically to `schema-builder`; don't coach it. Two escalations in one area signal the brief needs splitting. Ask the orchestrator to split it.
- **Long sessions:** the orchestrator keeps its context small (reports, not file dumps). If the main session gets long, end it after a wave and start a fresh one with `/resume-build`.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| An agent edited the main checkout | The orchestrator checks `git status` on `main` after every agent and reverts. Re-dispatch with the worktree path |
| A worktree can't be created ("already checked out") | `git worktree list`, then `git worktree remove .worktrees/<ID>` (or `git worktree prune`), then retry |
| `supabase start` fails | Docker Desktop isn't running, or WSL 2 isn't enabled |
| Agents use an outdated API | Context7 isn't connected (`claude mcp list`). The agent prompts tell them to look things up |
| CI red after a merge | `suite-runner` reports the first failure; a fresh `brief-fixer` (or `brief-builder`) gets it |
| Phone says "App not installed" when updating | The APK wasn't signed with the release key, or the versionCode isn't higher. Check `android-release` used the `ANDROID_KEYSTORE_*` secrets |
