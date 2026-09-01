# mental-reps

Coach + client fitness platform. One app, one database, one deployment —
see `SPEC.md` for the full design (read that first if anything here is
unclear or seems to contradict what you remember deciding).

## What's actually built vs. still a placeholder

**Real and working:**
- Prisma schema (`prisma/schema.prisma`) — every table from the design
- Clerk auth wiring (sign-in/sign-up pages, middleware, role detection)
- Client list page (`app/coach/clients/page.tsx`) — real Prisma query
- Timer notation parser (`lib/timerNotation.ts`) — ported from the legacy
  app, byte-compatible with the existing `40/20x3` / `EMOM60` notation

**Placeholder, needs building** (see inline `TODO` comments in each file):
- `components/coach/ProgramBuilder.tsx` — the three-column builder itself.
  This is the biggest remaining piece. Port it from the tested chat
  prototypes listed in `SPEC.md` §14, not from scratch.
- `app/client/today/page.tsx` — client session player (timers, GIF/YouTube
  demo, logging UI)
- Add-client form, calendar/month view with drag-and-drop, cross-client
  browse, AI notes-warning system, randomizer slots

## One-time setup

### 1. GitHub
```
cd mental-reps
git init
git add .
git commit -m "Initial scaffold"
```
Create a new repo on GitHub, then:
```
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

### 2. Neon (Postgres + Auth, same place)
1. [neon.tech](https://neon.tech) → New Project → region `aws-eu-central-1`
   (Frankfurt — closest to Kuwait, no Middle East region exists yet)
2. Copy the connection string it gives you → this is `DATABASE_URL`
3. In the project dashboard, open **Auth** → **Enable Auth** → copy the
   **Auth URL** from the Configuration tab → this is `NEON_AUTH_BASE_URL`
   (a different URL from `DATABASE_URL` — don't mix them up)
4. Still in Auth → Configuration, enable **Google** as a sign-in provider
   and paste your Google OAuth Client ID/Secret **there, in the Neon
   Console** — not as env vars in this app. Managed Better Auth is a
   hosted service; it needs the OAuth credentials on Neon's side, not
   yours.
5. Generate `NEON_AUTH_COOKIE_SECRET` with `openssl rand -base64 32`

### 4. Vercel (hosting)
1. [vercel.com](https://vercel.com) → New Project → import your GitHub repo
2. Add all variables from `.env.example` in Project Settings → Environment
   Variables (with your real Neon values)
3. Deploy

### 5. Database schema
Locally, with `DATABASE_URL` set in a `.env` file:
```
npm install
npm run prisma:migrate
```
This creates every table in `prisma/schema.prisma` on your Neon Postgres — including the `neon_auth` schema Better Auth manages automatically.

## Ongoing updates (the whole point of this rebuild)

Once the above is done one time, every future change is:
```
git add .
git commit -m "whatever you changed"
git push
```
Vercel auto-redeploys within about a minute. Every user — you, your wife,
every client — is on the new version immediately. No per-client anything,
no reinstalling a script, no touching Apps Script at all for anything
except the exercise-Sheet sync job (see below).

## What still uses Google Sheets

Only the exercise catalog authoring (`SPEC.md` §4). Your Sheet stays the
place you type in GIF links, cues, categories. An n8n job (needs
reinstalling — see your `george-ai-stack` setup) syncs it into Postgres on
a schedule. Nothing else in this app touches Sheets.

## Local development
```
npm install
npm run dev
```
Needs a `.env` file (copy `.env.example`) pointing at your Neon
Postgres and Clerk dev keys.
