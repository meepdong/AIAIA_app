# 04 — Agent Playbook: Opus orchestrates, Sonnet builds

This is how the 43 briefs get built by several agents at once:

- **Opus** runs the main session as **orchestrator**.
- **Sonnet** does most of the building and routine reviews.
- **Opus** steps in for the database schema, security reviews and escalations.
- **Haiku** runs the long test suites.

Everything here is wired into the repo:

| Where | What it holds |
|---|---|
| `.claude/agents/*.md` | The six agent definitions (model, effort, tools, rules) |
| `.claude/skills/orchestrate/` | The `/orchestrate` command: the orchestrator's loop |
| `.claude/skills/resume-build/` | The `/resume-build` command: picking up after a break |
| `.claude/settings.json` | The permission allowlist, and Opus as the main model. Copy it from `docs/build/claude-settings.example.json`; see `05-workflow-setup.md` |
| `AGENTS.md` | The rules every agent follows (also read by Codex, Cursor and others) |

---

## 1. The team

| Agent | Model | Effort | Does | Never does |
|---|---|---|---|---|
| **Orchestrator** (main session, `/orchestrate`) | **Opus** | high | Picks waves, creates worktrees, dispatches agents, re-runs gates, prepares PRs, updates status, reports to you | Writes feature code (beyond fixes of a few lines); merges without your approval |
| `brief-builder` | **Sonnet** | high | Builds one brief end to end in its worktree; runs all gates; commits | Touches files outside its brief; pushes or merges; weakens tests |
| `schema-builder` | **Opus** | high | Builds the schema/RLS briefs; takes over any brief a Sonnet maker failed twice | Same as above |
| `brief-fixer` | **Sonnet** | medium | Applies a reviewer's findings to an existing branch | Adds features or makes design decisions |
| `brief-reviewer` | **Sonnet** | high | Fresh read-only review of routine briefs | Edits anything; sees the maker's reasoning |
| `security-reviewer` | **Opus** | high | Fresh read-only review of security briefs, plus the end-of-phase audits | Same as above |
| `suite-runner` | **Haiku** | — | Runs full suites and E2E, then reports pass or fail | Decides or edits anything |

### Who builds and reviews each brief

Every brief carries a routing line, for example:

`- **Maker:** Sonnet (brief-builder) · **Review:** Opus (security-reviewer)`

| | Briefs | Count |
|---|---|---|
| **Opus maker + Opus review** (schema/RLS) | P0-02, P1-00a, P1-00b, P1-00c, P2-00a, P2-00b, P2-00c, P3-00 | 8 |
| **Sonnet maker + Opus review** (security-sensitive) | P0-03, P1-01, P1-07b, P1-11, P1-12b, P1-12c, P1-13a, P1-13b, P1-15, P2-01, P2-04, P2-06 | 12 |
| **Sonnet maker + Sonnet review** | everything else | 23 |

So Sonnet makes **35 of the 43 briefs (81%)**. Opus is used where a mistake costs the most: database security, money, minors' safety and sign-in. To push even more work to Sonnet, change a schema brief's maker to `brief-builder`; it keeps its Opus review.

**Escalation:** a Sonnet maker that fails its gates twice hands the brief to `schema-builder` (Opus), which starts in a fresh context with both reports.

## 2. The loop (one wave at a time)

You type **`/orchestrate`**. It runs this loop:

1. **Pick.** From the README status table, choose up to **4** briefs whose dependencies are `done` and whose owner gates are ticked. It never picks two briefs that own the same paths. Schema briefs run alone, or together only where the roadmap says so.
2. **Worktree.** For each brief it runs `git worktree add .worktrees/<ID> -b feat/<ID> main`. The `.worktrees/` folder is git-ignored and sits inside the repo, so each agent's shell stays inside it. It then marks the brief `in-progress`.
3. **Dispatch.** It starts the maker the routing line names, all at once, with a one-line message: brief ID, worktree path and branch. The agent definition already holds the rules.
4. **Accept.** It re-runs every gate itself, or through `suite-runner`, and at least one negative gate. It also checks that `main` is untouched.
   - If a gate fails, a fresh maker gets the failure output.
   - After two failures, `schema-builder` takes over.
5. **Review.** For diffs over about 50 lines, it starts the fresh reviewer the routing line names.
   - **CHANGES REQUIRED** sends the findings to a fresh `brief-fixer`.
   - There are at most **2** rounds. Minor leftovers become GitHub issues.
6. **Merge prep.** One PR at a time, in the order the wave finishes:
   1. **Rebase** onto the latest `main`.
   2. **Re-timestamp** any migration older than the newest one on `main` (`git mv`, keeping the `<id>_<what>` suffix). CI's `check-migration-order` gate catches any missed.
   3. **Regenerate types** with `pnpm db:reset && pnpm db:types`, and commit them. Generated files are never hand-merged.
   4. **Resolve shared-touch-point conflicts** (tabs, `adminNav`, `memberActions`, permissions, the api index) by keeping both sides' additions.
   5. **Push** `feat/<ID>`, open the PR and wait for green CI.
   6. **You approve the merge.** Agents are not allowed to run `gh pr merge`; you merge in GitHub, or tell the orchestrator to proceed.
   7. **Clean up:** remove the worktree and branch, and mark the brief `done` with the PR link.
7. **Full run.** After the wave, `suite-runner` runs the full suite on `main`. At the end of each phase, `security-reviewer` audits the phase's whole commit range.
8. **Report.** You get the merged PRs, gate results, decisions, anything needed from you (owner items, approvals, phone tests) and the next wave.

After a break, or if a session crashed, type **`/resume-build`** first.

## 3. Using other tools

The rules live in `AGENTS.md` and the briefs, so Codex, Cursor or Aider can also build briefs. Give the tool the same one-line handoff (brief ID, worktree path, branch), plus "follow AGENTS.md and your brief's section only". Keep the same split: a strong model for schema work and security review, a cheaper one for the rest.

## 4. Gate format used in every brief

```
G<n> <outcome> — CHECK: <command> — EXPECT: <token or condition>
```

- Commands are the standard scripts in `01-architecture.md §4`.
- **Negative gates** prove that a test really protects something. From inside the worktree:
  1. `git diff main -- <fix files> > ../<ID>.patch`
  2. `git apply -R ../<ID>.patch`
  3. Run the test and expect a **failure**.
  4. `git apply ../<ID>.patch`
- **Manual gates** need a person or a real phone. The orchestrator lists them for you in its report.

## 5. Rules that keep parallel work from colliding

- **Schema first.** Feature briefs don't create tables. If something is missing, the maker adds a **new** migration (`<timestamp>_<id>_<what>.sql`) for its own objects only, and flags it.
- **Types and seeds.** `pnpm db:types` runs in the same commit as any migration. Seeds go in one file per brief: `supabase/seeds/<id>.sql`.
- **Migration order.** A branch's migrations sort after everything already on `main`; this is enforced at merge and in CI.
- **Compatibility from v1.0.** Real members are live, so migrations must keep working with the released app. Add freely; rename or drop only in a later release.
- **Shared touch points.** Additive only, never reordered.
- **One agent per worktree.** No two makers share a checkout, and nobody edits the main checkout.
- **Small handoffs.** One brief per agent. A brief that grows past about 3 deliverables is split before it starts.
- **Fresh agents per round.** Makers are never resumed across review rounds.

## 6. Picking up after a break

Type `/resume-build`. It:
1. reconciles the status table with the worktrees, branches and PRs
2. re-runs gates on unfinished branches
3. tells you what's in flight
4. hands back to `/orchestrate`
