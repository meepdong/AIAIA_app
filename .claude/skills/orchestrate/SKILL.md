---
description: Run the AIAIA Youth App build as orchestrator. Picks the next wave of briefs, dispatches Sonnet/Opus maker agents into git worktrees, verifies gates, sends work to fresh reviewers, prepares merges, and reports to the owner. Use when the owner says "orchestrate", "next wave", "continue the build" or "start building".
---

# Orchestrate the AIAIA Youth App build

You are the **orchestrator**, running on Opus in the main session. You plan, dispatch, verify and merge. **You do not write feature code yourself**, except fixes of a few lines. Keep your own context small: rely on agents' reports and on commands you run yourself. Never read whole briefs; the makers do that.

## 0. Load the state (every time)
- Read `docs/build/README.md`: the status table and the decision log.
- Read `docs/build/03-roadmap.md`: the waves.
- Read `docs/build/04-agent-playbook.md` §2 and §5–6.
- Check git: `git status --porcelain` must be empty on `main`. Then `git worktree list` and `gh pr list`.
- If a brief is `in-progress` with no live agent, follow `/resume-build` first.

## 1. Pick the wave
Choose up to **4** briefs whose dependencies are `done` and whose owner gates are ticked in `docs/build/02-owner-setup.md`. Follow the waves in the roadmap. Never pick two briefs that own the same paths.

**If an owner gate isn't met, stop and ask the owner.** Say exactly which item is missing.

## 2. Dispatch (one agent per brief, all in the same message so they run in parallel)
For each brief:

1. **Create its worktree:**
   `git worktree add .worktrees/<ID> -b feat/<ID> main`
   If the branch already exists, attach it instead: `git worktree add .worktrees/<ID> feat/<ID>`.
2. **Mark it `in-progress`** in the README status table, with the branch name.
3. **Read the brief's routing line:**
   `- **Maker:** Sonnet (brief-builder) · **Review:** Opus (security-reviewer)`
4. **Start the maker** that line names: `subagent_type: "brief-builder"` (Sonnet) or `"schema-builder"` (Opus). Send this short message and nothing more:

   ```
   Brief <ID>. Worktree: <absolute repo path>/.worktrees/<ID>. Branch: feat/<ID>.
   Phase file: docs/build/briefs/<phase file>.md. Report when done.
   ```

   The agent definition already holds all the rules.

## 3. Accept (never trust a report alone)
When a maker reports:
1. **Commits:** run `git -C .worktrees/<ID> log --oneline main..HEAD`. There must be commits.
2. **Main checkout:** `git status --porcelain` on main must still be empty. A maker that edited main has broken the rules: revert its changes and re-dispatch.
3. **Gates:** re-run every runnable gate yourself. For long suites, use a `suite-runner` agent (Haiku) with the exact commands.
4. **Negative gates:** re-run at least one.
5. **If a gate fails:** send a **fresh** maker of the same model the failure output.
6. **Two failures on a Sonnet brief:** re-dispatch to `schema-builder` (Opus) with both reports.

## 4. Review (fresh context; spec + diff only)
- If the diff is over about 50 lines, start the reviewer named in the routing line: `brief-reviewer` (Sonnet) or `security-reviewer` (Opus). Send only:
  `Review brief <ID>. Branch feat/<ID>. Worktree <path>.`
- On **CHANGES REQUIRED**, send the findings to a **fresh** `brief-fixer` (Sonnet). Use `brief-builder` instead if a finding needs design work.
- Allow at most **2** review rounds.
- After that, file low-severity leftovers as GitHub issues (`gh issue create`) rather than running another round.

## 5. Prepare the merge (per playbook §2 step 6)
1. Rebase on `main`.
2. Re-timestamp any late migrations.
3. `pnpm db:reset && pnpm db:types`, and commit the regenerated types.
4. Resolve shared-touch-point conflicts additively.
5. Push the branch: `git push -u origin feat/<ID>`.
6. Open the PR (`gh pr create`). Fill the body from the brief's goal, the gate results and the review verdict, and end it with:
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
7. Wait for CI to go green (`gh pr checks`).
8. **Ask the owner to approve the merge.** Merging is denied to agents by the project settings. The owner merges the PR in GitHub, or tells you to proceed.
9. After the merge: `git worktree remove .worktrees/<ID>`, delete the branch, and mark the brief `done` with the PR link.

## 6. After the wave
1. Have a `suite-runner` run the full suite on `main`:
   `pnpm lint && pnpm typecheck && pnpm test && pnpm db:reset && pnpm db:test && pnpm fn:test && pnpm web:build`
   If it's red, a fresh maker gets the failures.
2. **At the end of each phase:** start one `security-reviewer` phase audit over the phase's commit range.
3. Add any rule you learned to `AGENTS.md`, as a lint rule or test where possible.

## 7. Report to the owner (short)
- Merged PRs, with links.
- Gate and review results, one line each.
- Decisions taken that need their eye.
- **What you need from them:** owner items, approvals, phone tests listed under "Manual gates".
- The next wave.

## Budget rules
- **Model routing:** Sonnet does all the building it's routed to. Opus is used only for:
  - this orchestration
  - the `schema-builder` and `security-reviewer` briefs named in the routing lines
  - escalations
- **Concurrency:** at most 4 agents at a time.
- **Rate limits:** if usage limits bite, drop to 2–3 parallel agents rather than switching makers to Opus.
- **Agent size:** one brief per agent. If an agent reports it is past ~150k context, take its groundwork and start a fresh agent.
