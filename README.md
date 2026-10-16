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

`VITE_SERVER_URL` points the client at a deployed server; `WS_PORT` changes the server's port.

## Deploy

- **Campus site → Vercel.** The Vercel project `life-at-alu` builds this repo (`vercel.json`: Vite, `npm run build`, `dist/`).
  Set `VITE_SERVER_URL` to the realtime server's `wss://` address in the Vercel project's environment variables.
- **Realtime server → Render** (Vercel can't keep a WebSocket server running). In Render: New → Blueprint → this repo
  (`render.yaml`). Set `ALLOWED_ORIGINS` to the Vercel site's URL(s), comma-separated, so only the campus can connect.
  On the free plan it sleeps after 15 idle minutes; the client keeps retrying while it wakes (up to about a minute).
- The test bot sends no Origin header, so it can only join a server without `ALLOWED_ORIGINS` (e.g. locally).
