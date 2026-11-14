# AIAIA Youth App

One Expo (React Native) codebase that builds an Android app, a web app/PWA and the admin web console, backed by Supabase. It is open source; its users' data is private and many users are minors, so this repository holds **no member data and no secrets**.

Start with [`AGENTS.md`](AGENTS.md) (rules for every contributor) and [`docs/build/README.md`](docs/build/README.md) (build status and plan).

## Layout

```
apps/mobile/       Expo app (Expo Router, NativeWind). Routes in app/, code in src/
packages/shared/   permission keys, money (paise) and date helpers, DB types
packages/api/      createApi(supabase): the only place server calls live
packages/ui/       design system shell (filled by P0-04)
scripts/           cross-platform Node scripts
docs/              architecture, briefs, setup guides
```

## Run locally on Windows

Prerequisites: Node 22+, pnpm 12 (`corepack enable` or `npm i -g pnpm`), and for Android an emulator or device with Android Studio's platform tools.

```powershell
pnpm install
copy .env.example apps\mobile\.env.local    # then fill in the two EXPO_PUBLIC_SUPABASE_* values
pnpm --filter mobile start                  # press "a" for Android, "w" for web
```

The sign-in gate is a stub for now. To see other screens, set `EXPO_PUBLIC_MOCK_SESSION` in `apps/mobile/.env.local` to one of `signed_out`, `no_profile`, `pending`, `blocked`, `active`.

## Commands

| Command                                                     | Does                                           |
| ----------------------------------------------------------- | ---------------------------------------------- |
| `pnpm lint`                                                 | ESLint + Prettier check                        |
| `pnpm typecheck`                                            | `tsc --noEmit` in every workspace              |
| `pnpm test [-- <pattern>]`                                  | Jest (`jest-expo`)                             |
| `pnpm web:build`                                            | Static web export to `apps/mobile/dist`        |
| `pnpm db:*`, `fn:*`, `check:seed`, `e2e:web`, `android:apk` | Print "not set up yet" until their brief lands |

Android project check (generated, never committed):
`pnpm --filter mobile exec expo prebuild -p android --no-install --clean`.
Set `APP_VARIANT` to `development` (default, `org.aiaia.youth.dev`), `staging` or `production`.

## Notes

- pnpm uses `node-linker=hoisted` (set in `.npmrc` and `pnpm-workspace.yaml`), the layout Expo documents for monorepos.
- Licence: AGPL-3.0 is a working placeholder until the committee decides.
