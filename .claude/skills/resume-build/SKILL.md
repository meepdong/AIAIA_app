---
description: Pick the AIAIA Youth App build back up after a break or a crashed session. Reconciles the README status table with git worktrees, branches and PRs, then hands over to /orchestrate. Use when the owner says "resume", "where were we" or "pick up the build".
---

# Resume the build

1. **Read the state.**
   - Read `docs/build/README.md`: the status table and the decision log.
   - Run `git worktree list`, `git branch --list "feat/*"` and `gh pr list --state all --limit 20`.
2. **Check every brief marked `in-progress` or `review`:**
   1. Look at its branch: `git -C .worktrees/<ID> log --oneline main..HEAD`. A missing worktree means the branch may still exist without one.
   2. If it has commits, re-run its brief's gates. Use a `suite-runner` (Haiku) for long suites.
   3. Then, depending on what you find:

   | Gates | Has a PR | Next step |
   |---|---|---|
   | Green | Yes | Continue from `/orchestrate` step 5 (merge prep) |
   | Green | No | Go to review (`/orchestrate` step 4) |
   | Partly done | — | Start a **fresh** maker with "continue: here is what's committed and what's failing" |
   | No commits | — | Remove the worktree and branch, and reset the brief to `todo` |

3. **Check for drift.** Compare the table with what's actually on `main` (`git log --oneline -30`). A merged PR whose brief isn't marked `done` should be marked done.
4. **Report to the owner:**
   - what you found
   - what you fixed in the table
   - what's in flight
5. **Hand over:** continue with `/orchestrate`.
