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
      live/[sessionId]/page.tsx   ← renders CoachLiveSession (in-person logging)
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
  pr-recompute.ts recomputeOrPurgePr(clientId, exerciseId) — shared by every
                  delete path that removes LoggedSets, so ExercisePr never
                  points at a row that no longer exists (deletes the PR row
                  outright if nothing is left to hold one)
  goalCalc.ts     pure progression math for Strength + Endurance Goals —
                  see "Progression Goals" below

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
    List is sorted by this coach's usage count (desc) then name — computed
    live in `builder/page.tsx` via `sessionExercise.groupBy`, nothing
    stored. Same sorted array feeds PasteImportModal and ExerciseDrawer.
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
      Reps can be a range: the Details popup's reps field is a plain text
      input — "10" stays a single number, "8-12" parses into
      `reps`/`repsMax` (helpers `parseReps`/`formatReps`/`repsStr` at top
      of `SessionEditor.tsx`, mirrored in `TodayWorkout.tsx`). No UI
      toggle — same field, same tab order either way. Paste-import
      (`PasteImportModal.tsx`) parses "8-12" and "3x8-12" too.
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
         Current client is included too (pinned top, "this client"), not
         just other clients. Click a session chip → read-only
         `SessionPreviewPanel` below the calendar (name, sets×reps,
         weight, group colour) via GET `api/coach/sessions/[sessionId]`;
         click again or ✕ to close.
       - Templates: list of saved templates, "Add to [client]" button.
```

### Known gotcha — floating menus/popups clipped by group cards

Circuit/Interval/EMOM/Superset group cards use `overflow: hidden` (for
the rounded-corner border). Any dropdown or popup rendered with
`position: absolute` inside a row in one of those cards gets clipped by
that overflow — worst case, a popup opens off-screen with no way to see
it (e.g. the last exercise in a superset). Fixed for `RowMenuButton`
(the ⋯ menu) and `NotePopup` (the ! note popup) in `SessionEditor.tsx`:
both now use `position: fixed`, computing screen coordinates from the
trigger button's `getBoundingClientRect()` at click time, so they
render above everything regardless of which container they're inside.
**Any new floating menu/popup added inside a group card must follow the
same pattern** — `position: absolute` will silently break again.

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

## Coach Live Logging — page → component → API chain

For a coach training a client in person and logging sets live on their
own phone/tablet, separate from the builder (different device, different
setting — the coach is on the gym floor, not planning).

```
app/coach/clients/[clientId]/live/[sessionId]/page.tsx
  → Server Component. Loads the one session (with sessionExercises +
    loggedSets + exercise) plus this coach's full exercise library.
  → renders <CoachLiveSession session={...} allExercises={...} />

components/coach/CoachLiveSession.tsx
  - Header: client name, session label, exercise count, and the ✎ Edit
    toggle (see below). CoachBottomMenu (bottom-left ···, same component
    as every other coach page) carries a "← Builder" link back.
  - `blocks = buildBlocks(exercises)` — same single/superset grouping
    logic as the builder's SessionEditor, kept separate on purpose (this
    view has its own drag mechanics — see gotcha below).
  - ExerciseCard: DrumPicker weight/reps, a 40×40 GIF/webm thumbnail
    (tap → full-screen GifOverlay — same ExerciseMedia/GifOverlay
    components as client TodayWorkout, copied in rather than imported
    since this file has no shared import path with components/client/),
    "+ Set" for an extra set beyond prescribed.

  Edit mode (✎ toggle in header) — everything below is hidden until on:
  - Per-exercise ✕ → deleteSessionExercises (today's row only).
  - Per-set ✕ → deleteSetForSession (today's slot only).
  - Drag handle (⋮⋮) next to each block's label (or alone, for a single
    exercise with no label) → reorders that whole block among the
    others. Persists via reorderSessionExercises, same action the
    builder uses.
  - Drag handle (⋮⋮) on each exercise INSIDE a superset → reorders
    within that superset only. Separate drag state from the block-level
    one — see gotcha below.

  ExerciseDrawer (components/coach/ExerciseDrawer.tsx) — the "+ exercise
  on the spot" flow, built specifically for touch (the builder's
  add-exercise flow assumes a mouse):
  - Collapsed = small edge tab, right-middle of screen. Tap → half-
    screen drawer slides in with search.
  - Press and hold a result (~350ms, generous jitter tolerance) → GIF/
    webm + muscle-group preview appears. Keep holding, move past a small
    threshold → preview closes, a drag ghost + insertion indicator take
    over. Drop over a gap between exercises → new single block there.
    Drop ONTO a superset card → joins that superset (green outline
    instead of a line). Drop back over the drawer, or release before
    dragging → cancelled, nothing happens.
  - `resolveDropTarget(x, y)` (in CoachLiveSession) does the geometry —
    checks each block's `getBoundingClientRect()` first for a superset
    hit, then falls back to nearest gap. `handleDrawerDrop` calls
    `addExerciseToSession` (appends, same action the builder uses) then
    either `reorderSessionExercises` alone (gap case) or that plus
    `joinExistingGroup` (group case, to persist the groupId/groupColor
    the append call couldn't have set).

  All deletes here — and now the builder's multi-select/⋮ delete too
  (`deleteSessionExercises` in `lib/actions/delete-actions.ts`) — fully
  purge: LoggedSets belonging to a deleted SessionExercise are deleted
  outright (not left with a null FK), and `recomputeOrPurgePr` fixes up
  or removes the ExercisePr row afterward. `deleteSetForSession` (new,
  `lib/actions/live-edit-actions.ts`) does the same for one set: deletes
  the LoggedSet if one existed, shifts later setIndexes down by one so
  they stay contiguous, decrements that day's `SessionExercise.sets` by
  one, then recomputes/purges the PR. None of this touches a template or
  next week's session — every row here belongs to this one date only.
```

### Known gotcha — two separate drag systems, on purpose

The builder's SessionEditor drag (whole-row select, group drag) uses
native HTML5 `draggable` — fine on desktop with a mouse, unreliable on
touch. CoachLiveSession is used on a phone in a gym, so its three drag
interactions (block reorder, intra-group reorder, drawer insert) are
all hand-rolled with Pointer Events instead: `setPointerCapture` once a
movement threshold is crossed, manual nearest-drop-target math via
`getBoundingClientRect()`, no `dataTransfer`. **Do not copy the
builder's drag pattern into this file** — it won't work on touch. The
movement thresholds themselves matter more than they look: too small
and a hold-to-preview gesture flips into a drag on finger tremor alone
(hit this twice while building the drawer — the fix both times was a
minimum-movement threshold on the POST-hold transition, not the
pre-hold one, since the pre-hold check only guards against scrolling).

## Progression Goals — Strength & Endurance autoregulation

Attached to one exercise's recurring slot in a Program (e.g. "Chest Press
on Push day" across every week of a template, or a client's live copy of
that once applied). Lets a coach define a progression cycle once and have
weight/pace suggestions calculate themselves from what the client
actually logs — never from the plan, since a plan the client didn't hit
shouldn't compound its own miss.

### The chain

`lib/actions/goal-actions.ts` → `detectGoalChain(sessionExerciseId, dayLabels)`:
finds every occurrence of the SAME exercise, at the SAME rank within its
own session (so two occurrences of Chest Press in one day — main lift +
finisher — are automatically two independent chains, never merged), across
the given day label(s), ordered chronologically. Restricted to
occurrences ON OR AFTER the row the coach opened "🎯 Goal" from — a past
session never gets pulled into a chain that starts today. Ordered by real
`date` when the program has one (a live client program); templates have
no dates, so `weekNumber` + day order stands in for chronology there.
Also flags any OTHER day label containing the same exercise, so the
builder can prompt "also include Pull day?" rather than assume.

Editing an EXISTING goal always re-anchors to its saved occurrence-0 row,
never to whichever row the coach happened to reopen it from — otherwise
reopening a goal from week 3 and re-saving would truncate weeks 1–2 off
the front of the chain.

### The model — `ExerciseGoal` (prisma/schema.prisma)

One row per chain: `programId`, `exerciseId`, `dayLabels[]`,
`type` (STRENGTH | ENDURANCE), `blocks` (Json — see below),
`baselineAnchor` (starting e1RM or starting rate), `constantWeight`
(Endurance only, optional — see below). `SessionExercise.goalId` +
`goalOccurrence` (0-indexed position in the chain) link each row in.
Deleting a `SessionExercise` never touches the goal (no FK the other
way); deleting the goal (`removeExerciseGoal`) nulls those two fields on
every linked row via `updateMany` first, then deletes the goal row.

`blocks` is a small JSON array describing ONE cycle — it repeats
(`occurrenceIndex % blocks.length`) if the chain runs longer than one
cycle length. Three block types, same for both goal types:
- **working** — the normal progressing week.
- **deload** — reduced effort, NEVER updates the anchor (recovery, not a
  data point).
- **retest** — one all-out effort that REPLACES the anchor outright,
  restarting the next cycle from wherever the client's capability
  actually is now (not a stored "base" that never moves).

### Strength

`blocks: WorkingBlock | DeloadBlock | RetestBlock` (types in
`lib/goalCalc.ts`). A working block is EITHER a rep-range target (weight
gets solved for) OR a fixed-weight target (reps are left open) — coach
picks per block via a Reps/Weight toggle. Either way, whatever gets
logged runs through Epley (`epley(weight, reps)`) to produce an e1RM,
which is the single "capacity" number carried forward — exactly the
existing `ExercisePr` e1RM math, just walked per-occurrence instead of
all-time-best.

`computeAnchorForOccurrence` walks occurrences 0..target-1: working
block → anchor = the BEST (highest e1RM) logged set of that occurrence,
never just the last one logged (a strong opening set must not be erased
by a weaker finishing set); deload → no update; retest → replaces
outright. An occurrence with zero logged sets leaves the anchor
unchanged; a PARTIALLY logged one still counts, using whatever sets
exist — never blocks on a fully-completed prior occurrence.

`staticPrescription(block, anchor)` is the same math run with no live
logs — used once, at goal-SAVE time, to write an initial `sets` / `reps`
/ `loadValue` onto every occurrence in the chain (so a freshly-attached
goal never leaves a row blank while waiting for data to accumulate).

### Endurance

Reframed, mid-build, from "a separate Distance/Calories unit on the
goal" to "the row's own `metric` field decides the unit; the goal just
drives it" — see the Metric section below for why. `blocks:
EnduranceWorkingBlock | EnduranceDeloadBlock | EnduranceRetestBlock` —
same three-way shape, but each block also carries `fixed: "time" |
"output"`: which side the COACH dictates. The other side is what the
client logs. `rate = output ÷ time(minutes)` is the capacity number here
— always higher-is-better, no sign-flip the way `lowerIsBetter`
exercises sometimes need for e1RM.

**Storage convention — reuses `LoggedSet.weight`/`reps` rather than new
columns**: `weight` = output (distance or calories, whichever the row's
`metric` is), `reps` = time in whole seconds. This holds regardless of
which side a block fixes — the FIXED side just gets auto-written by
`saveExerciseGoal`/`staticPrescription` rather than typed by the client,
so both fields are always populated and `computeRateForOccurrence` never
has to guess which one was the real input. Same convention on
`SessionExercise.reps`/`loadValue` for the STATIC prescription shown
before anything's logged.

**Constant weight** (`ExerciseGoal.constantWeight`, optional): for
farmer's-carry-style work where the coach needs to tell the client what
weight to hold WHILE they log time or distance for the fixed side. Pure
display — never logged, never progresses, doesn't touch the rate math at
all. Hidden by default in the Goal editor (a "+ Add a fixed weight" link
reveals it) since most endurance goals don't need it.

### `SessionExercise.metric` — Reps | Distance | Calories

Lives on the row, independent of whether a Goal is attached at all: a
coach can mark "this exercise logs Calories" and just manually log
calories every set, same as Reps today — a Goal, when attached, only
automates what this already makes possible by hand. Set via a 3-way
toggle in the builder's Details popup (`SessionEditor.tsx` →
`DetailsModal`, wired through `lib/actions/exercise-metric-actions.ts` →
`setExerciseMetric`).

**`CoachExercisePreference`** (coachId + exerciseId → last metric used):
updated every time a coach explicitly changes a row's metric, read by
`addExerciseToSession` so adding "Ski Erg" to a new session defaults to
whatever that coach actually tracks it as, not always Reps. Only this
one add path currently reads the preference — paste-import, template
apply, and session-copy weren't audited for it and likely just carry
over whatever the source row already had.

**In the logging screens** (`CoachLiveSession.tsx` `ExerciseCard`,
`TodayWorkout.tsx` `ExerciseCard` — kept in parallel, same pattern as the
DrumPicker/SetRow duplication noted above): the weight-pill and reps-pill
positions are RELABELED, not restructured, based on `metric` + (if
goal-linked) `fixed`:
- No goal, metric=Reps → unchanged: weight pill, reps pill.
- No goal, metric=Distance/Calories → reps-pill position shows a plain
  distance/calorie count instead; weight pill stays real weight.
- Goal-linked (Endurance) → weight-pill position ALWAYS means output,
  reps-pill position ALWAYS means time — which one is editable flips
  with `fixed`, but which box means what never does. The locked
  (non-editable) side renders as static text, no picker opens for it.

Time entry reuses the SAME tap-a-pill-roll-a-value interaction as
weight, not a new control: `DrumPicker` gained an optional `format`
prop, and time-mode passes `makeTimeValues` (5-second steps) +
`formatTime` (mm:ss) instead of the plain-number generator/display.

**Known gap**: `PerformancePage` and the exercise-history charts still
read raw `weight`/`reps` for graphing — for an endurance-goal exercise
those are now output/time-seconds, so a history chart for one will plot
nonsense numbers until that's updated. Not touched yet.

### Files

`lib/goalCalc.ts` — pure, no DB: all the math above (`epley`, `rate`,
`staticPrescription`, `enduranceStaticPrescription`,
`computeAnchorForOccurrence`, `computeRateForOccurrence`). Shared by
`goal-actions.ts` (save-time + live-read) so save-time and read-time math
can never drift apart into two versions of the same formula.
`lib/actions/goal-actions.ts` — `detectGoalChain`, `saveExerciseGoal`,
`getExerciseGoal`, `removeExerciseGoal`, `getGoalPrescription` (the live
read — walks the chain, returns what a logging screen needs to render:
`occurrenceIndex`, `cycleLength`, `blockType`, `sets`/`reps`/`weight`,
and for Endurance also `fixed`/`output`/`time`/`constantWeight`/`metric`).
`components/coach/GoalEditor.tsx` — the coach-facing editor: chain
detection preview, day-label include/exclude, Strength/Endurance tabs,
per-block editing, save/remove.

## Client-side flow

```
app/client/today/page.tsx → components/client/TodayWorkout.tsx
  Today's session. ExerciseCard per exercise, DrumPicker for weight/reps.
  Confirming reps = the log trigger → POST /api/client/log-set
  Coach note renders as an amber card (was low-contrast grey text) with
  a small amber dot on the collapsed card when a note exists. "Watch
  demo" is an outlined grey button (was solid blue) below the note.
  Check-in overlay (sleep/mood/hydration/stress) → POST /api/client/checkin
  `···` menu (top-right): Exercise History overlay | Programs | Rest Timer
    ON/OFF | Sign Out.
  - Exercise media: `ExerciseMedia` component (shared helper, also used by
    `GifOverlay`) renders `<video>` when `exercise.gifUrl` ends in
    `.webm`/`.mp4`, otherwise `<img>`. The field is still called `gifUrl`
    in the schema even though it can hold a video URL now — don't assume
    `gifUrl` means "always an image" when touching this code.

app/client/dashboard/page.tsx → components/client/ClientDashboard.tsx
  ⚠ NOT part of the active client experience. This was an earlier
  three-panel layout (month calendar + session preview + Templates tab)
  that doesn't work well on phone. Clients land on TodayWorkout only —
  don't assume ClientDashboard is what a client currently sees.

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
| `api/coach/live/log-set/route.ts` | POST/DELETE — same log-set logic as the client route, role-gated to coach, takes `clientId` in the body. Used by CoachLiveSession. |
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
  │             │                                                    │
  │             └───────────────────< CheckIn (1-per-session)        │
  │                                                                    │
  │                                    Exercise ───────────────────┘
  │
  └──< Program (isTemplate: true) ──< TemplatePurchase >── Client
  └──< Bundle ──< BundleItem >── Program (isTemplate: true)
              └──< BundlePurchase >── Client
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
- **SessionExercise**: one exercise placed in a session — the PRESCRIBED sets/reps/load, set by the coach. `reps` is the number (or the low end of a range); `repsMax` (nullable) is the high end when the coach prescribed a range — null means fixed reps, unchanged behavior. `metric` (REPS/DISTANCE/CALORIES) decides what the reps field counts; `goalId`+`goalOccurrence` link it into an ExerciseGoal chain if one's attached — see "Progression Goals". Every place that duplicates a row (`copy-session-action.ts`, `apply-template-action.ts`, `apply-single`/`apply` client routes, paste-import's `add-exercise` route) must carry `repsMax` along or it silently drops on copy.
- **LoggedSet**: what the CLIENT actually did. One row per set. `sessionExerciseId + setIndex` is unique, so logging the same set again overwrites (upsert), it doesn't duplicate. `sessionId` and `sessionExerciseId` are BOTH nullable — a set can technically exist without a live link back to a session row (guard against this in any new query, like the exercise-history route does). For an Endurance-goal row, `weight`/`reps` here mean output/time-seconds, not weight/reps — see "Progression Goals".
- **CheckIn**: one optional row per Session — sleep/mood/hydration/stress, 1-5 scale.
- **Exercise**: shared catalog across all coaches. `muscleGroups`/`equipment` are string arrays used by the taxonomy filter.
- **ExerciseGoal**: a coach-defined progression cycle attached to one exercise's chain of occurrences within a Program — see "Progression Goals" for the full model.
- **CoachExercisePreference**: coachId+exerciseId → last `metric` used, one row per pair, read when adding that exercise to a new session.
- **ClientInvite**, **TemplatePurchase**: exactly what they sound like.

If a bug involves "the data doesn't match what I expect", check the
Prisma schema first for `?` (nullable) on the field in question — several
fields here are nullable in ways that aren't obvious from the UI
(`sessionId` on LoggedSet, `authUserId` on Client, `date` on Session).

## Programs / Template Store & pricing

A `Program` with `isTemplate: true` can also be sold or granted to
clients, independent of being assigned to a live calendar.

- **Pricing editor**: `/coach/templates` (Templates tab + Bundles tab).
  A template with `price` set is public in the client-facing store; no
  price = private. `discountFlat`/`discountPercent` are mutually
  exclusive, with an optional `discountEndsAt`.
- **Bundles**: `Bundle` groups ≥2 templates via `BundleItem`
  (`@@unique` on `templateId` — a template can only be in one bundle at
  a time), with its own price/discount fields, auto-computed pricing.
- **Client-side store**: `components/client/ProgramsOverlay.tsx` shows
  "Your programs" (owned via `TemplatePurchase`/`BundlePurchase`) and
  "Available" (priced, not yet owned). `api/client/templates/route.ts`
  returns both with an `unlocked: boolean` flag per template.
- **⚠ There is no payment processor integrated.** Clients pay the coach
  directly outside the app (cash/transfer) — this is a deliberate
  choice, not a missing feature. The paid-access step is
  `api/coach/templates/[id]/grant/route.ts`: the coach manually grants
  a `TemplatePurchase` (with `grantedBy: coachId`, `pricePaid: null`)
  after being paid. `TemplatePurchase.grantedBy` distinguishes a free
  coach-grant from an eventual real paid purchase — if a payment
  processor is added later, it would create `TemplatePurchase` rows the
  same way but with `grantedBy: null` and `pricePaid` set.
- Applying a purchased/granted template to a live calendar goes through
  `api/client/templates/[id]/apply/route.ts` (whole program) or
  `.../apply-single/route.ts` (one session) — see "Client-side flow"
  above. Neither of those routes checks payment status again; ownership
  is already established by the `TemplatePurchase`/`BundlePurchase` row
  existing.

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

## Planned, not built

Business direction and discussed-but-unbuilt features (in-app messaging,
nutrition tracking, wearable sync, push notifications) live in the
project's memory file (chat continuity, kept by George's AI assistant),
not duplicated here. Don't assume any of those exist just because
they've been discussed — check current code, not intentions.

## Also read

- `SPEC.md` — the *design* decisions (why the stack, why no fuzzy exercise matching, pricing model, etc.)
- `AI_CONTEXT.md` — a shorter request-phrase → file lookup table, meant for quick AI-session orientation. This file (ARCHITECTURE.md) is the deeper version for actual debugging.


