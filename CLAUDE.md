@AGENTS.md

# Compact instructions
When compacting, keep: the current `main` commit and every branch/worktree in flight with its last verified commit; which gates were re-run and their results; owner decisions and approvals given in this session (each merge needs its own); open owner questions; the exact next step. Drop: tool output, test logs, file contents and diffs (they can be re-read), and agent reports once their result is recorded above. The durable state lives in `docs/build/README.md` and the memory notes; a fresh session started with `/resume-build` is usually cheaper than a long compacted one.
