# ARCHITECTURE.md — how the app is actually built (debugging map)

This file exists so anyone (human or AI) who has never opened this repo
before can find the one file responsible for a bug without reading the
whole codebase. `SPEC.md` explains *why* — this file explains *where*.

## What this app is, in one paragraph

A coaching platform. Two kinds of people use the same deployed app at
different URLs: **coaches** build workout programs for clients and watch
their logged data; **clients** open today's workout, log sets, and see
their own progress. One Postgres database, one Next.js app, role decided
per-request (see Auth section) — there is no separate coach app / client
app codebase.

## The two roles and where each one lives

| Role | Entry point | What they see |
|---|---|---|
| Coach | `/coach/clients` → pick a client → `/coach/clients/[clientId]/builder` | Program Builder (3-panel), Performance page, Admin (George only) |
| Client | `/client/today` | Today's workout, `/client/dashboard`, `/client/performance` |

A single account is **either** a Coach or a Client, never both. Role is
looked up fresh on every request — see Auth section.

## Directory map

```
app/
  coach/                    coach-only pages (role-gated by middleware)
    clients/page.tsx           client list
    clients/new/page.tsx       add-client form
    clients/[clientId]/
      builder/page.tsx           ← loads Client+Program+Sessions, renders ProgramBuilder
      edit/page.tsx               edit client details
      performance/page.tsx        renders PerformancePage
    layout.tsx                 coach shell (nav etc.)
  client/                   client-only pages
    today/page.tsx              renders TodayWorkout
    dashboard/page.tsx           renders ClientDashboard
    performance/page.tsx         renders ClientPerformancePage
    session/[sessionId]/page.tsx one specific workout session
  admin/page.tsx            Admin-only (`ADMIN_EMAILS` array, currently George + Milica):
                              manage coaches + clients. Coach creation has NO password
                              field — see "Admin-created coaches" gotcha in Auth section.
  invite/[token]/page.tsx   client accepts coach's invite link here
  sign-in/, sign-up/        Neon Auth pages
  api/                      see "API routes" table below

components/
  coach/    all coach-facing React components (see table below)
  client/   all client-facing React components (ClientDashboard, TodayWorkout, ClientPerformancePage)

lib/
  actions/       Next.js Server Actions — mutations called directly from
                  components (add exercise, reorder, delete, group, etc.)
                  without going through an API route.
  auth/           auth.ts (server) + client.ts (client-side hooks) — thin
                  wrappers around Neon's hosted Better Auth.
  role.ts         getCurrentRole() — THE single source of truth for "is
                  this person a coach or a client" (see Auth section)
  db.ts           Prisma client singleton
  taxonomy.ts     muscle group / equipment filter trees used by exercise picker
  timerNotation.ts parses/builds the "3x10", "40/20" etc. strings used by
                  circuit/interval/EMOM timers — the ONLY place that logic lives

prisma/
  schema.prisma           the data model — see "Data model" below
  migrations/             one folder per migration, run in order

legacy-patches/           the OLD Google-Sheets-based app (pre-rebuild).
                          Only touch this if a bug is in the app clients
                          are using RIGHT NOW, not the new one.
```

## Coach Program Builder — page → component → API chain

This is the biggest, most-edited part of the app. If a coach-side bug
doesn't obviously belong elsewhere, it's probably here.

```
app/coach/clients/[clientId]/builder/page.tsx
  → Server Component. Loads Client + Program + Sessions + SessionExercises
    ONE TIME on page load, via Prisma directly (no API call).
    ⚠ This initial load does NOT include LoggedSet data — see "Known gotcha" below.
  → renders <ProgramBuilder client={...} exercises={...} />

components/coach/ProgramBuilder.tsx        (the orchestrator — no visible UI itself)
  - Holds ALL shared state: which session/exercise is selected, calendar
    month cursor, optimistic "just added" exercise rows, loggedDateKeys
    (which calendar days have logged data — for green painting).
  - Fetches a session fresh via GET /api/coach/sessions/[sessionId] the
    moment it's clicked — this is what makes LoggedSet data show up.
  - Renders all three panels below and passes them state + callbacks.

  ├─ components/coach/BuilderLeftPanel.tsx     (left third of screen)
  │    Tabs: Month | Week | Exercises
  │    - Month: calendar grid. Session chips are BLACK normally, GREEN
  │      when that date is in `loggedDateKeys`. Click empty day → creates
  │      a session (Server Action). Click chip → tells ProgramBuilder
  │      which session to load. Drag chip to another day → moves/copies.
  │      "🗑 Select" mode → multi-select → bulk delete.
  │      Drag chip to another day, SAME client → Move/Copy confirmation
  │      popup (Copy never carries LoggedSet/client notes — see
  │      `copySessionToClient` action). Different client → still copies
  │      immediately, no popup.
  │    - Week: same sessions grouped by weekNumber. Also hosts the
  │      Template Builder (a separate mode, toggled by "+ Build Template").
  │    - Exercises: search + taxonomy filter (muscle/equipment) + add-new.
  │    - Header: ⓘ button → `ClientProfileModal` (email/phone/health-
  │      mobility notes/general notes/equipment/birthday, editable via
  │      PATCH `api/coach/clients/[clientId]`). Pink banner appears next
  │      to ▲ Performance when `client.birthday` is within 7 days
  │      (month/day only — year on the stored date is ignored).
  │
  ├─ components/coach/SessionEditor.tsx        (center third — the actual day)
  │    One row per exercise in the session. Row layout, left to right:
  │      [drag handle] [exercise name] [logged-set chips, if any]
  │        [sets×reps pill] [weight pill] [⋯ menu]
  │    - Logged-set chips: green pills showing what the CLIENT actually
  │      logged (e.g. "80kg×8"). Only appear if the session object passed
  │      in has `loggedSets` populated on its sessionExercises — this is
  │      why the ProgramBuilder fetch-on-click step above matters.
  │    - Drag-select multiple rows → color popup → group into
  │      Circuit / Interval / EMOM / Superset.
  │    - Pills are individually draggable (copy sets×reps or weight to
  │      another row by dropping on it).
  │    - Session banner shows check-in emoji scores (😴🧠💧⚡) if the
  │      client submitted one for this session.
  │
  └─ components/coach/BuilderRightPanel.tsx    (right third — context panel)
       Tabs: Detail | Clients | Templates
       - Detail: shows the selected exercise's GIF/cues/YouTube, edit
         button, AND "Recent logs" — last 8 sessions this client logged
         this exercise in, fetched from
         GET /api/coach/clients/[clientId]/exercise-history/[exerciseId]
       - Clients: browse another client's calendar, drag sessions across.
       - Templates: list of saved templates, "Add to [client]" button.
```

### Known gotcha — the exact bug class this file exists to prevent

`builder/page.tsx` loads the client's programs/sessions ONE TIME via
Prisma, and that query does **not** include `loggedSets`. If you add a
new feature that reads `session.sessionExercises[].loggedSets` and it
shows nothing, check: is this data coming from the page's initial load
(`client.programs[0].sessions`), or from `fetchedClientSession` in
ProgramBuilder (which goes through the API route and DOES include logs)?
Same trap applies to the Month-view calendar: session chips for
"does this day have logs" come from a SEPARATE fetch
(`GET /api/coach/clients/[clientId]/sessions?month=...`, which returns
`_hasLogs` per session) — not from the page's initial Prisma query either.

## Client-side flow

```
app/client/today/page.tsx → components/client/TodayWorkout.tsx
  Today's session. ExerciseCard per exercise, DrumPicker for weight/reps.
  Confirming reps = the log trigger → POST /api/client/log-set
  Check-in overlay (sleep/mood/hydration/stress) → POST /api/client/checkin

app/client/dashboard/page.tsx → components/client/ClientDashboard.tsx
  Month calendar (own sessions) + session preview + Templates tab.

components/client/ProgramsOverlay.tsx (opened from `···` menu on BOTH
  TodayWorkout and ClientDashboard, not tied to one page)
  - "Add full program to calendar" → POST api/client/templates/[id]/apply
    (start date + weekday picker, creates every session).
  - Tapping one session inside an expanded program → date-picker popup →
    POST api/client/templates/[id]/apply-single (copies just that one
    session to the chosen date). Neither route ever copies LoggedSet or
    client notes — both build fresh SessionExercise rows only.

app/client/performance/page.tsx → components/client/ClientPerformancePage.tsx
  Same layout/logic as the coach's PerformancePage, scoped to "my own data".
```

## Performance pages (coach + client — same design, two entry points)

```
app/coach/clients/[clientId]/performance/page.tsx  → components/coach/PerformancePage.tsx
app/client/performance/page.tsx                    → components/client/ClientPerformancePage.tsx
```
Both read from a `/performance` API route that returns ALL logged sets +
check-ins for that client, grouped for charting (progress line, PR stats,
correlation scatter plots vs sleep/mood/stress/hydration).

## API routes — what each one is for

| Route | Purpose |
|---|---|
| `api/coach/clients/route.ts` | GET all of this coach's clients |
| `api/coach/clients/[clientId]/sessions/route.ts` | GET sessions for a month + `_hasLogs` flag per session (drives calendar green painting) |
| `api/coach/clients/[clientId]/performance/route.ts` | GET all logged data for the performance page |
| `api/coach/clients/[clientId]/exercise-history/[exerciseId]/route.ts` | GET one exercise's recent logged sessions (right panel "Recent logs") |
| `api/coach/clients/[clientId]/route.ts` | PATCH — coach edits their own client's profile fields (email, phone, healthNotes, generalNotes, equipment, birthday, favourite, status). Used by `ClientProfileModal` and `ClientRoster`. |
| `api/coach/sessions/[sessionId]/route.ts` | GET one full session incl. `loggedSets` — used every time a session is opened in the builder |
| `api/coach/sessions/[sessionId]/add-exercise/route.ts`, `.../group/route.ts` | mutate a session (most mutations are Server Actions instead — see `lib/actions/`) |
| `api/coach/templates/route.ts` | GET all saved templates |
| `api/coach/invite/route.ts`, `api/coach/unlink-client/route.ts` | client invite lifecycle |
| `api/client/sessions/route.ts` | GET client's own sessions (supports `?month=`) |
| `api/client/log-set/route.ts` | POST — upsert one logged set (unique on sessionExerciseId+setIndex, so re-logging overwrites) |
| `api/client/checkin/route.ts` | POST — upsert check-in for a session |
| `api/client/exercises/[exerciseId]/history/route.ts` | GET client's own history for one exercise (used for pre-fill + PR badge) |
| `api/client/performance/route.ts` | same shape as coach performance route, scoped to self |
| `api/client/templates/[id]/apply-single/route.ts` | POST — copies ONE template session into the client's live calendar on a chosen date (vs `.../apply/route.ts`, which applies the whole program). Never copies LoggedSet/client notes. |
| `api/admin/clients/*`, `api/admin/coaches/*` | George-only CRUD, cascade-deletes on client removal |
| `api/ai/chat/route.ts`, `api/ai/generate/route.ts` | live chat + batch calls to home-hosted Ollama through the Cloudflare tunnel |
| `api/auth/[...path]/route.ts` | Neon Auth's own catch-all handler |
| `api/exercises/*` | exercise catalog CRUD + image upload URL signing |

## Data model (prisma/schema.prisma) — the shape of the database

```
Coach ──< Client ──< Program ──< Session ──< SessionExercise ──< LoggedSet
                │                                                    │
                └────────────────────< CheckIn (1-per-session)       │
                                                                       │
                                        Exercise ───────────────────┘
```

- **Coach**: one row per human coach (George, wife). `authUserId` links to Neon Auth.
- **Client**: belongs to a Coach. `authUserId` AND `email` are both
  nullable — a coach can create a client with just name+phone and invite
  them later; `email` gets written in when they accept the invite via
  Google OAuth (see `ClientInvite` flow). Also has `birthday` (DateTime,
  only month/day matter — used for the 7-day-out birthday banner in
  `BuilderLeftPanel`), `favourite` (Boolean) and `status` (`ClientStatus`
  enum: ACTIVE/INACTIVE) — both are just roster-grouping tags with no
  other logic attached to them anywhere else in the app.
- **Program**: either `isTemplate: true` (reusable) or a live program tied to one `clientId`.
- **Session**: one training day inside a Program. Has `date`, `weekNumber`, `dayLabel`.
- **SessionExercise**: one exercise placed in a session — the PRESCRIBED sets/reps/load, set by the coach.
- **LoggedSet**: what the CLIENT actually did. One row per set. `sessionExerciseId + setIndex` is unique, so logging the same set again overwrites (upsert), it doesn't duplicate. `sessionId` and `sessionExerciseId` are BOTH nullable — a set can technically exist without a live link back to a session row (guard against this in any new query, like the exercise-history route does).
- **CheckIn**: one optional row per Session — sleep/mood/hydration/stress, 1-5 scale.
- **Exercise**: shared catalog across all coaches. `muscleGroups`/`equipment` are string arrays used by the taxonomy filter.
- **ClientInvite**, **TemplatePurchase**: exactly what they sound like.

If a bug involves "the data doesn't match what I expect", check the
Prisma schema first for `?` (nullable) on the field in question — several
fields here are nullable in ways that aren't obvious from the UI
(`sessionId` on LoggedSet, `authUserId` on Client, `date` on Session).

## Auth & roles — how "coach vs client" is decided

- Auth itself is Neon's **hosted** Better Auth service (Google OAuth
  configured in the Neon Console, not in this repo).
- `lib/role.ts` → `getCurrentRole()` is the ONLY place role is decided.
  It does NOT read a "role" field off the auth user (the hosted service
  doesn't expose custom fields) — it checks whether a `Coach` row or a
  `Client` row in OUR OWN database has that `authUserId`. Whichever table
  has a match, that's the role. If neither matches, role is `"unlinked"`
  (happens right after a client clicks their invite link, before their
  Client row is created).
- `middleware.ts` gates every route except `/sign-in`, `/sign-up`,
  `/api/auth/*`, `/api/ai/*`, and static assets — redirects unauthenticated
  users to `/sign-in`. It does NOT itself check coach-vs-client; that's
  left to each page/route calling `getCurrentRole()`.
- **Admin-created coaches — a real gotcha**: `app/admin/page.tsx` creates
  new coaches with NO password field. Under the hood it calls
  `auth.admin.createUser` with a random throwaway password and
  `emailVerified: true` — that `emailVerified: true` is required; if it's
  ever false, the coach's first Google OAuth sign-in silently fails and
  just bounces back to `/sign-in` with no visible error. That admin-created
  auth user also gets a DIFFERENT `authUserId` than the one Google OAuth
  creates when the coach actually signs in for the first time — so
  `lib/role.ts` has a fallback: if the `authUserId` lookup finds no Coach
  row, it re-checks by EMAIL against the `Coach` table and re-links
  `authUserId` to the new Google-OAuth id (one-time, self-healing on
  first login). If a newly-created coach can't log in, check
  `neon_auth.user.emailVerified` for their email directly in Neon's SQL
  editor (`SELECT * FROM neon_auth.user WHERE email = '...'`) before
  assuming it's a role/linking bug.
- **If a login/role bug shows up**: check `lib/role.ts` first (is the
  lookup finding the right row?), then `middleware.ts` (is the route even
  reaching the page?), then `lib/auth/server.ts` (session/cookie issue).

## External services this app talks to

| Service | What for | Where configured |
|---|---|---|
| Neon Postgres | the only database | `DATABASE_URL` env var |
| Neon Managed Auth | login, Google OAuth | Neon Console (not in repo) |
| Vercel | hosting + auto-deploy on push to `main` | vercel.com project settings |
| Cloudflare R2 | exercise GIF/image storage | `media.mentalreps.work` custom domain |
| Cloudflare Tunnel | exposes George's home PC's Ollama to the internet | `ai.mentalreps.work` → `localhost:11434`, tunnel runs as a Windows Scheduled Task on George's PC |
| Ollama (qwen3:8b) | AI chat + insights, runs on George's home RTX 3090 | must be running with `OLLAMA_HOST=0.0.0.0:11434` or the tunnel finds nothing |

If AI chat/insights are broken, the bug is almost never in this repo —
it's usually the tunnel or Ollama not running on the home PC.

## How to actually debug something here, step by step

1. **Which role is the bug in** — coach or client? Narrows you to `app/coach/` or `app/client/` immediately.
2. **Which page** — match what's on screen to the page list above.
3. **Which component** — the page tells you which component it renders; that component's comment block (top of file) usually lists its own sub-parts.
4. **Is the data even reaching the component?** — most bugs in this app so far have been a data-fetching gap (a query missing an `include`), not a rendering bug. Check: does the Prisma query / API route this component depends on actually select the field you're looking for? Cross-reference against `prisma/schema.prisma`.
5. **If it's a mutation** (add/edit/delete something) — check `lib/actions/` first; most mutations are Server Actions, not API routes.
6. **If it's cross-cutting** (auth, role, layout) — see the Auth section above.

## Also read

- `SPEC.md` — the *design* decisions (why the stack, why no fuzzy exercise matching, pricing model, etc.)
- `AI_CONTEXT.md` — a shorter request-phrase → file lookup table, meant for quick AI-session orientation. This file (ARCHITECTURE.md) is the deeper version for actual debugging.

