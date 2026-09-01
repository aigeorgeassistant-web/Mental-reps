# mental-reps — Full Spec

This is the single reference doc for everything decided about the rebuild.
If context is ever lost, start here.

---

## 1. Why this exists

Current app (`index.html` + Google Apps Script) works, but doesn't scale:
- One Google Sheet **per client**, each with its own copy of the same Apps Script attached
- Any logic change (search, timers, calendar) means editing N scripts, one per client file
- No real auth (PIN-based), no real database, no multi-coach support
- Exercise data lives in a shared Sheet, matched into client sheets via fuzzy string matching — fragile

mental-reps replaces this with **one app, one database, one deployment** —
coach and client are the same Next.js app, role-based views, shared by every
coach and every client.

---

## 2. Stack (finalized)

| Layer | Choice | Notes |
|---|---|---|
| Frontend + API | Next.js on Vercel | Free tier at launch |
| Database | Railway Postgres | $5/mo Hobby tier |
| Auth | Neon Auth (Managed Better Auth) | Same database as the app — users/sessions live in Postgres's `neon_auth` schema, no separate service. Free. Includes Google OAuth, invite emails. Switched from Clerk before anything was built on it — see §3 for why. |
| Exercise GIFs | Cloudflare R2 | Free up to 10GB (~1,000 GIFs) |
| Exercise demo video fallback | YouTube, embedded inline (iframe) | Free content, ads acceptable here |
| Course video (paid) | Bunny.net | $0.01/GB/mo storage, ~$2.40/yr for 20GB |
| Payments | Tap Payments (Kuwait) | 2.75% flat, no monthly fee |
| Domain | User-owned | ~$12/yr |
| Automation | n8n (self-hosted, George's home VM) | Sheet → Postgres sync only |

**Cost model**: ~$74/year flat at launch (Railway $60 + Bunny $2.40 + domain $12).
Stays flat until ~150-200 clients. Railway upgrades to Pro (~$20/mo) only if
concurrent load causes lag.

---

## 3. Architecture decisions

- **Single URL, role-based views.** Same domain, same codebase — coach sees
  the builder, client sees their program, based on their Clerk account role.
- **PWA.** Installs on phone like a native app, no App Store.
- **Local-first editing.** Builder edits happen in browser memory, sync to
  Postgres silently every 30s + on tab close/navigation.
- **Multi-coach from day one.** `coachId` on every relevant table. George and
  his wife use the same deployment, each sees only their own clients.
- **Multiple active programs per client** (needed for the courses model).
- **Offline logging.** Client's set logging saves locally first, syncs when
  connection returns.
- **Deploy flow**: push to GitHub → Vercel auto-redeploys → every user
  (coach, wife, every client) is on the new version within ~1 minute. No
  per-client anything, ever again.
- **Auth lives in the same database as everything else.** Originally
  planned with Clerk (a separate external auth service); switched to Neon
  Auth (Managed Better Auth) before any real code was built on Clerk.
  **Important architecture note**: Managed Better Auth is a HOSTED service
  Neon runs on your behalf — not a self-configured `betterAuth()` instance
  you run inside your own app. Your app connects to it via
  `NEON_AUTH_BASE_URL` (from the Neon Console: project → Auth →
  Configuration). Google OAuth is configured directly in that same Neon
  Console page, NOT via environment variables in this app's code — a
  mistake made once already during setup, worth not repeating. Role
  ("coach" vs "client") is NOT a custom field on the auth user record
  either — the hosted service doesn't expose that kind of schema control.
  Instead, role is determined by which of this app's own tables (`Coach`
  or `Client`) has a row whose `authUserId` matches the logged-in user's
  id — see `lib/role.ts`.

---

## 4. Exercise catalog — source of truth

- **Google Sheet stays the primary authoring surface** for exercises (name,
  GIF link, cues, category, equipment) — George doesn't want to give this up,
  and it works well for bulk curation.
- **Sync**: n8n job, scheduled every 15–30 min (not instant — new exercises
  are added infrequently, a few minutes' delay is fine). Reads the Sheet,
  **upserts into Postgres matched by exact exercise name** (case-normalized).
- **Quick-add from inside the app**: coach can add an exercise directly in
  the builder (name + YouTube link, no GIF yet) → writes straight to
  Postgres, instantly usable. Simultaneously creates the matching row in the
  Google Sheet with an empty/highlighted GIF-link cell as a visual flag for
  George to fill in later. Because both the Postgres row and the Sheet row
  are created with the **identical name** at the same moment, later
  reconciliation is an **exact match**, not fuzzy — avoids the fuzzy-matching
  reliability problems seen in the legacy app.
- **AI auto-tagging**: adding a row in the Sheet (name + GIF only) triggers a
  local Ollama call to fill in Category, Equipment, and Cues automatically.
  AI-written cells get highlighted/painted; George clears the paint once
  reviewed and approved.
- **Equipment taxonomy** (fixed list): Barbell, Dumbbell, Machine, Cable,
  Bodyweight, Bands, Kettlebell, Bench. Selection is a **per-item checklist**,
  not fixed presets — presets (e.g. "Full gym") just pre-check the relevant
  boxes as a shortcut, but underlying data is always the granular checklist.
- **Exercise names used in programs must exactly match the Exercise entity**
  (selected via search/picker, not typed freely) — this eliminates the fuzzy
  GIF-matching problem entirely for the new app; exact matching only becomes
  a concern for the *legacy* app's remaining lifetime.
- **Exercise versioning**: never overwrite/delete an exercise with logged
  history — mutable updates allowed, but the system warns first. Always add
  new exercises rather than repurposing old ones.

---

## 5. Client record

Fields: name, email (Clerk invite/login), phone, **Health/mobility notes**
(free text — the only field the AI warning system reads), **General notes**
(scheduling/preferences — visible to coach, never scanned by AI), equipment
profile (checklist, set once at onboarding, editable later), units
preference (kg/lb), `coachId`.

**Onboarding flow**: coach clicks "Add client" in the client list screen →
form (name, email, phone, notes, equipment) → submitting creates the record
and sends a Clerk invite email. Client clicks the invite, signs up
(Google or password, Clerk handles both) → lands on their dashboard showing
only their own program.

---

## 6. Coach Builder — layout

Three-column layout, collapsible right panel:

### Left panel (~25%) — program tree
Tabs depend on context:
- **Editing a template** (no real dates): Week / Exercises tabs
- **Editing a live client's program** (real dates): Month / Exercises tabs
  - Month view shows all days of the month (grid, 4 columns, scrollable —
    naturally swipeable on touch, scrollable on desktop)
  - Tapping a filled day zooms in inline, showing an editable day name and
    an "Open" target that jumps center panel to that day and switches left
    panel to Exercises mode
  - Exercises mode: search box + large tappable exercise rows. Tap = preview
    in right panel. Tap-and-hold-drag = insert into center session.

### Center panel (~50%) — active session
- Colored bars group supersets/timed groups (shared color per group)
- **Reordering**: drag handle (grip icon) on each row, drag up/down freely
- **Superset/group creation**: click-drag-select across multiple rows
  (mousedown + drag over, like text selection) → release shows a small
  floating color-palette popup right there ("Group?") → tap a color → done.
  No separate "select mode" toggle — this replaced an earlier, clunkier
  select-then-group flow.
- **Straight sets vs. timed groups**: after picking a color, a second choice
  — "Straight sets" or "Timed". If timed: Interval / EMOM / Circuit, with
  number inputs (work/rest/rounds or EMOM duration+reps) in the same
  scroll-picker style as sets/reps.
- **Per-exercise timer overrides**: a timed group shares a color, but each
  exercise's own work/rest/rounds can be individually overridden by tapping
  that row — matches how the legacy app's circuit logic already reads
  per-exercise `target` values, falling back to the first exercise's only if
  a row has none.
- **Sets/reps entry**: tap opens a scroll-wheel picker (matches client-side
  logging UX) with a "Enter manually" fallback button (typed input, e.g.
  `3x12`).
- **Load progression autocomplete**: grey suggested weight/reps appears
  based on the client's last logged PR for that exercise; Tab accepts,
  typing overrides. Suggestion logic: +2.5kg if all reps hit last time, same
  weight if failed, -5% if missed badly.
- **Keyboard-first**: Tab through fields, Enter to select exercise. Never
  requires a mouse. Ctrl+C/V for copy/paste of rows/columns/blocks, Ctrl+D
  duplicate, Ctrl+Z/Y undo/redo — all local, no round-trip needed.
- **Duplicate session with load increment** (+5%, +2.5kg, etc.) for
  progressing a client week-to-week fast.
- Three zoom levels: Overview (full week), Medium (condensed), Full edit
  (single session).

### Right panel (~25%) — dual-purpose, tab switcher
- **Exercise detail mode** (default): GIF/YouTube demo player, "View demo"
  button (or inline embedded player — see §8), a **progression sparkline**
  chart (weight over time), and **full log history** (every past date/
  weight/reps for that client+exercise — not just the current PR; this
  matches the legacy Progress tab's "see all previous results" behavior).
- **Browse clients mode**: pick another client from a list → see their
  month view (mini grid) → **drag a day from there into the left panel's
  Month grid** to copy that workout into the currently-open client's day —
  this loads it into the center panel for editing immediately.
  - Dragging the other direction (current client's day → another client's
    month, within this same right-panel view) only **stages** it there,
    does not auto-open it — viewing/editing it requires separately opening
    that other client.
  - Dropping onto an already-occupied day (either direction) displaces the
    existing training: it becomes an "Unscheduled" entry (see §9), shown as
    a floating chip with a trash-bin icon to delete it outright instead of
    placing it.

### Mobile
- PWA-installed on Android can soft-lock landscape orientation for the
  builder view. iOS Safari cannot force orientation — shows a "rotate to
  landscape" prompt overlay instead.

---

## 7. Timer notation (ported from legacy app, unchanged on the wire)

The `target` string on a `SessionExercise` row IS the timer config — no
separate schema needed, and the client-side player already parses this:

| Notation | Meaning |
|---|---|
| `40/20x3` | Interval: 40s work / 20s rest / 3 rounds |
| `40/20` | Interval, rounds inherited from the first exercise in the group (how circuits share a round count) |
| `EMOM60` | EMOM, 60s per round |
| `EMOM60x20` | **New**: EMOM, 60s per round, 20 reps, remaining time is rest — legacy app currently only supports duration; parser + display need extending |

Circuit = a group of exercises sharing a `groupColor`; the circuit runtime
reads each exercise's own `target` (per-exercise override), falling back to
the first exercise's if a row has none.

---

## 8. Video / demo content

- **Exercise demo fallback (free, no GIF yet)**: coach pastes a YouTube
  link when quick-adding an exercise. Plays **embedded inline** (iframe) in
  the app rather than opening externally — acceptable to show YouTube ads
  here since it's free content, unlike paid course videos.
- **Paid course video**: Bunny.net, not YouTube — the ad-injection concern
  that ruled out YouTube for courses does not apply to free exercise demos.

---

## 9. Calendar / date-change (client + coach, shared interaction pattern)

Already implemented as real code against the **legacy** app + Apps Script
backend (see `/legacy-patches/index.html` and `/legacy-patches/backend.gs`
in this repo for the working reference implementation) — same interaction
pattern carries over to mental-reps's real calendar/drag-drop once built on
Postgres instead of sheet cells:

- Tap a training day → modal: **Open Workout** / **Change Date**
- Long-press + drag a training day → drop on an empty day moves it; drop on
  an occupied day displaces the existing one into an **"Unscheduled"** list
  (shown below the calendar), tap it anytime to assign a new day
- No training is ever silently deleted by a drag — displaced trainings
  always land in Unscheduled, never overwritten, until a coach explicitly
  hits the trash-bin icon (only available in the coach's cross-client copy
  flow, never in the client's own personal calendar)

---

## 10. Client self-programming

- **Templates**: coach-built (reusable, assignable to any client) **and**
  auto-generated (client answers quick multiple-choice questions — goal,
  days/week, **equipment access** — app assembles a draft from the tagged
  exercise pool).
- **Slot concept**: a session slot = muscle group + coach-fixed sets/reps +
  a pool of 4-6 interchangeable exercises (built from Category + Equipment
  tags).
- **Randomizer ("spin the bottle")**: client-side animation (literal bottle
  spin, not a wheel/roulette) picks one exercise from the slot's pool. Only
  the exercise choice is randomized — sets/reps stay fixed by the coach. If
  a slot repeats within the same session, the client re-spins fresh each
  time (no caching/locking).
- Requires exercise **Category** and **Equipment** tagging on the master
  Sheet (already in progress).

---

## 11. AI features

### Client-notes warning system (new, not yet built)
- Coach writes free-text **Health/mobility notes** per client.
- When adding an exercise to a program, a local Ollama call checks the
  client's health notes against that exercise and shows an inline
  warning/suggestion if relevant — e.g. adding squats for a client noted
  with "low ankle mobility" suggests heel-elevated squats instead.
- Coach can dismiss the warning or swap the exercise with one tap.
- **General notes are never scanned by this system** — only Health/mobility
  notes are read, keeping the AI's signal clean and avoiding false
  positives from scheduling/preference text.

### Exercise auto-tagging (Sheet-side, already speced in §4)
- Ollama fills Category/Equipment/Cues on new Sheet rows automatically.

---

## 12. Data model summary (see `prisma/schema.prisma` for the real thing)

- `Coach` — one per human coach (George, his wife), linked to Clerk user
- `Client` — belongs to a Coach, has notes/equipment/units fields from §5
- `Exercise` — the shared catalog (synced from Sheet + quick-added)
- `Program` — either a reusable template (`isTemplate = true`, no client) or
  a live client program (`isTemplate = false`, has `clientId`)
- `Session` — one "day" within a Program; template sessions have no real
  date, live sessions do
- `SessionExercise` — one exercise placed within a Session: order, sets,
  reps, `target` (timer notation, nullable), `groupId`/`groupColor`
  (superset/timed grouping), randomizer slot pool reference
- `LoggedSet` — actual client-entered history: weight, reps, date, PR flag

---

## 13. Open / not yet decided

- What exactly counts as a "course" — a bundle of programs, sequential with
  unlock gates, or programs + video lessons + PDFs bundled together?
- Offline sync UX — silent background banner, or an explicit
  "syncing…"/"synced" notification to the client?
- Cross-month day moves (calendar interaction currently only works within
  a single month tab in the legacy app; mental-reps's real Postgres-backed
  calendar won't have this limitation once built, since dates are just
  timestamps, not sheet tab boundaries).

---

## 14. What's already built (reference prototypes, not production code)

Everything below was built and tested as interactive prototypes during
design — they are the source of truth for exact interaction behavior when
building the real components:

1. Client list + Add Client form (with Health/General notes split)
2. Coach builder three-column layout (static mockup)
3. Program builder: drag exercises from picker into session, drag-reorder,
   manual sets/reps entry, exercise detail panel with sparkline
4. Full flow: client list → open client → Month grid (31 days) → open a day
   → Exercises tab → Browse clients → cross-client drag-and-drop with
   displaced/floating chip + trash bin
5. Drag-select-to-paint superset grouping (mousedown-drag-release → color
   popup)
6. Timer assignment: color-group → Straight/Timed choice → Interval/EMOM/
   Circuit number inputs → writes legacy-compatible notation string

And two **real, working code changes** already shipped against the legacy
app (see `/legacy-patches/`):
- `index.html` — tap-to-choice modal, long-press-drag day move, Unscheduled
  list UI
- `backend.gs` — `moveDayAction`, `assignDayAction`, `locateAllBlocks`,
  updated `getMonthCalendar`, and a fixed exact-token-set exercise-name
  matcher (replacing the old Jaccard/Levenshtein fuzzy scorer that was
  confusing "BB bench press" with "DB bench press")
