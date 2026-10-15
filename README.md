# ALU Campus Live

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

`VITE_SERVER_URL` points the client at a deployed server; `WS_PORT` changes the server's port.
