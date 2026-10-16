# Life at ALU

A shared, walkable ALU Kigali campus: everyone who opens the link walks the same terraces,
sees who's around (names over heads, dots on the map) and can talk in campus-wide chat.
Phase 0 of the plan in [PLAN.md](PLAN.md).

## Run it

```bash
npm install
npm run dev
```

Opens the client on http://localhost:5180 and the realtime server on ws://localhost:2567.
Open it in two browser windows (or on your phone on the same Wi-Fi, via the "Network" URL Vite
prints) and you'll see each other.

A scripted visitor for testing: `npx tsx scripts/bot.ts Amara 120`.

## Controls

WASD / arrows to walk · Shift to run · drag or Q / E to look · V for the aerial view ·
Enter (or T) to chat, Esc to stop typing. On phones: left thumb on the joystick, drag to look.

## Layout

- `server/index.ts` — WebSocket server: one campus room, presence at 12 Hz, chat with rate limits.
- `shared/protocol.ts` — message types used by both sides.
- `src/net.ts` — client connection.
- `src/campus/` — the campus model (from the portfolio) plus `Live.tsx`: other players, labels, chat.
- `src/campus/indoors.ts` + `Interiors.tsx` — every building is enterable: brick shells with see-through
  ribbon windows, an internal stair to the first floor, rooms on the 8.8 m grid (classrooms, studios, the
  library, the commons, dining) with ~1,100 seats. Doors are placed wherever a wall faces open ground at
  that floor's level. Also the floor-aware `surfaceAt` / `blockedAt` used for all movement.
- `src/campus/students.ts` + `Crowd.tsx` — 1,200 simulated students. A navigation graph built from the
  same collision rules; each student has their own seat and a looping day (class, terraces, grand stairs,
  lawn). Positions come from the student's number and the wall clock, so every browser sees the same crowd
  without any server traffic. Drawn as eight instanced meshes.

- `server/progress.ts` + `shared/levels.ts` — progression: XP and levels (status titles from New Arrival to
  ALU Legend), Elo chess ratings and head-to-head rivalries, exploring XP, and the leaderboards (Campus Legends,
  Academic Titans, Gaming Champions, Chess Masters, Wealth), weekly from Monday 00:00 Kigali and all time.
  XP comes from playing, not coins: wealth has its own board and never counts towards a level. Solo games,
  quizzes and polls have daily or hourly caps so nothing can be farmed.
- `server/store.ts` — where accounts, XP events and rivalries are kept: Postgres when `DATABASE_URL` is set
  (tables are created on first start), otherwise `data/store.json` locally.

`VITE_SERVER_URL` points the client at a deployed server; `WS_PORT` changes the server's port.

## Deploy

- **Campus site → Vercel.** The Vercel project `life-at-alu` builds this repo (`vercel.json`: Vite, `npm run build`, `dist/`).
  Set `VITE_SERVER_URL` to the realtime server's `wss://` address in the Vercel project's environment variables.
- **Realtime server → Render** (Vercel can't keep a WebSocket server running). In Render: New → Blueprint → this repo
  (`render.yaml`). Set `ALLOWED_ORIGINS` to the Vercel site's URL(s), comma-separated, so only the campus can connect.
  On the free plan it sleeps after 15 idle minutes; the client keeps retrying while it wakes (up to about a minute).
- **Saved progress → Postgres** (Supabase's free plan works). Set `DATABASE_URL` in the Render service's
  Environment tab to the Session pooler connection string. Without it, the free server forgets XP and boards
  whenever it sleeps.
- The test bot sends no Origin header, so it can only join a server without `ALLOWED_ORIGINS` (e.g. locally).
