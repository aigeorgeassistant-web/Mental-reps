# AI_CONTEXT.md — read this file first, every time

This repo is worked on across many separate chat sessions. Token budget
matters. **Do not read the whole codebase to answer a request.** This file's
job is to tell you which 1-3 files actually matter for a given ask, so you
open those and nothing else.

Read `SPEC.md` once per session for the *design* (why things work the way
they do). Use the table below to find the *file* for a specific change.
Only open `SPEC.md`'s full text if the request touches architecture,
pricing, or a decision you can't find reflected in code yet.

## Request → File map

| If the person says something like... | Open this |
|---|---|
| "change the timer size/look/animation" | `components/coach/*Timer*` (once built) + `lib/timerNotation.ts` for the notation itself. Do NOT touch the notation format without checking SPEC.md §7 — the legacy app's client player depends on it being unchanged. |
| "EMOM/interval/circuit isn't calculating right" | `lib/timerNotation.ts` — this is the only place that parses/builds `target` strings. |
| "change the builder layout / columns / panels" | `components/coach/ProgramBuilder.tsx` + SPEC.md §6 for exact interaction spec. |
| "add a field to client/exercise/program" | `prisma/schema.prisma` — then run `npm run prisma:migrate`. |
| "client login isn't working" / "add a role" | `lib/role.ts` (role lookup — queries our own Coach/Client tables, does NOT read a field off the auth user), `lib/auth/server.ts` + `lib/auth/client.ts` (Neon Managed Better Auth wiring), `middleware.ts`. Auth is a HOSTED service (Neon Auth) — Google OAuth is configured in the Neon Console, not in this app's code. Don't reintroduce Clerk or a self-hosted `betterAuth()` instance without checking SPEC.md §3 first — both were tried and replaced. |
| "the client list page" / "add client form" | `app/coach/clients/page.tsx` (list is real; add-client form is not yet built — see SPEC.md §5). |
| "exercise GIF/sync/matching is wrong" | `legacy-patches/backend.gs` (fuzzyScore function) for the CURRENT live app. The new app avoids this problem entirely per SPEC.md §4 — exercises are picked from a list, never typed, so no fuzzy matching exists there. |
| "calendar / change workout date" | `legacy-patches/index.html` + `legacy-patches/backend.gs` for the CURRENT live app (already working). SPEC.md §9 for how this carries into the new app once its calendar is built (not yet). |
| "randomizer / spin the bottle / client self-programming" | SPEC.md §10 + `prisma/schema.prisma` (`isRandomizerSlot`, `slotPoolExerciseIds` on `SessionExercise`) — no UI built yet. |
| "AI warning about client injuries" | SPEC.md §11 — not built yet, no file exists. |
| "deploy isn't working" / "env vars" | `README.md`, `.env.example`. |
| "why did we choose X stack/price" | `SPEC.md` §2 (stack) or §2 (cost model) — don't re-derive, it's already decided. |
| "what's actually built vs placeholder" | `README.md` top section — kept up to date, check here before assuming something works. |

## Rules for keeping this file useful

- **Every time a placeholder becomes real code**, update the README's
  "what's built" section AND this table if the file path changes.
- **Every time a new decision is made**, it goes in `SPEC.md`, not here.
  This file only ever points at files — it should never grow decisions or
  explanations of its own.
- If a request doesn't match any row above, say so, ask which file/area
  it relates to, and add a new row once you find out — don't silently
  read the whole repo to guess.
