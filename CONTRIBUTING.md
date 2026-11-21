# Contributing

Thanks for helping build the AIAIA Youth App. The code is open source, but the app holds private
member data, and many members are under 18. These rules keep that data safe. The full rules are in
[`AGENTS.md`](AGENTS.md); this page is the short version.

## Getting started

1. Read [`README.md`](README.md) for the layout and how to run the project on Windows.
2. Read [`docs/build/README.md`](docs/build/README.md) for what is built and what comes next.
3. Read [`docs/build/01-architecture.md`](docs/build/01-architecture.md) §3–7 for the layout,
   scripts, security rules and data model.
4. Pick up a piece of work from its brief in [`docs/build/briefs/`](docs/build/briefs/), and ask in
   the group before you start, so two people don't build the same thing.

## Good practices

1. **Branch and PR.** Branch from `main` as `feat/<name>` and open a pull request. Never push to
   `main` directly.
2. **One thing per PR.** Keep a PR to one feature or fix, and edit only the files it needs. Don't
   reformat or reorder code you aren't changing.
3. **Schema changes.** Add a _new_ migration named `<timestamp>_<brief-id>_<what>.sql`; never edit
   one already on `main`. Run `pnpm db:types` in the same commit.
4. **Security.** Every new table gets row-level security, deny by default. Check permissions with
   `has_permission()`, never by role name. Privileged writes go through `security definer` functions
   with `search_path = ''` that call `write_audit`.
5. **Private details.** Phone, date of birth, email and emergency contacts live only in
   `member_private`. Never show a minor's phone or date of birth to other members. Guardians reach a
   child's data only through active `member_guardians` links.
6. **No real data or secrets.** Never commit real names, phone numbers, keys or spreadsheets. Use
   the fake names in `scripts/fake-names.json` and phone numbers like `+91 90000 000xx`.
7. **Money and dates.** Store money as whole paise (integers). Store dates as `timestamptz` and show
   them in Asia/Kolkata time.
8. **Tests.** A bug fix comes with a test that fails without the fix. Never skip, weaken or delete a
   test, bypass a git hook or turn off a lint rule to get to green.
9. **Before you open a PR**, run:

   ```
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

   If you changed anything under `supabase/`, also run `pnpm db:reset` and `pnpm db:test` (these need
   Docker and the Supabase CLI). Every PR gets a review before it is merged.

10. **New outside services.** Ask the owner before adding any service that touches personal data.
    It must store data in India and be added to the architecture doc and the privacy page.

## CI in a public repo

Workflows must never use `pull_request_target`, print secrets or data, or upload member data as an
artifact.

## Questions

Ask in the developers' group. If a spec is unclear, pick the safest reading, say so in your PR, and
keep it easy to change.
