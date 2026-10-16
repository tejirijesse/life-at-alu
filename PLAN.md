# Life at ALU — plan

A shared, walkable ALU Kigali campus where students meet friends, chat, check in at
places and play live games together. ALU first; the rest of Kigali later.

## Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 · Prototype** (this repo, now) | Campus world, realtime presence, names over heads, campus-wide chat. Runs locally with one command. | Two browser tabs see each other walk in real time and can chat. |
| **1 · ALU pilot** | ALU-only sign-in, friends, private messages, location check-ins, one live quiz game, events in the amphitheatre-style atrium, basic moderation. Deployed. | 50–200 students use it during a real event without incident. |
| **2 · Kigali Innovation City** | The streets around ALU generated from open map data; second "zone" with its own server room. | Zones load on demand; walking between them works. |
| **3 · Kigali** | City-wide tiles, landmarks built by hand, public sign-up. | Safety, privacy and cost reviewed for public scale. |

## Demo (now): accounts, avatars, wallet, games

The first thing to show people, built on free tiers only. No paid services until the demo has been seen.

**Joining.** Sign up with your name and ALU email (`@alustudent.com` or `@alueducation.com`), get a 6-digit
code, enter it. Log in later with the same email and a new code. *Demo mode:* the code is shown on screen
instead of emailed, and accounts live in a server-signed token kept in your browser (no database yet), so
the same device keeps your avatar and coins across server restarts; a new device starts fresh. Real email
codes and a database (Supabase free tier) come after the demo.

**Avatar.** Starts blank. Choose body, skin tone, hair (afro, short, locs, braids, bun, headwrap, bald) and
colour, and an outfit: casual tee, ALU hoodie, smart blazer, sportswear, kitenge shirt, Rwandan umushanana,
Nigerian agbada, iro & buba. A live 3D preview turns as you choose.

**Starting point.** Where your story begins, not how much you have: arriving from Lagos on Ikaze day, a
Kigali local, living on campus, an international student, or staff. Everyone gets the same wallet.

**Wallet.** 1,000 ALU Coins each, held by the server (clients can't edit balances). Earn by winning games
and taking part; spend on entry fees. Solo-game payouts are capped so they can't be farmed.

**Games.** Walk up to a spot, press E (or tap Play) and the game opens over the campus. Ideas come from
@lifeatalu (One ALU staff-vs-students day, Ikaze, Love Week, ArtsFest, Clubs fair, Wellness):

| Game | Where | Players |
|---|---|---|
| Basketball shootout | Court on the lawn | Solo, leaderboard |
| Football penalties | Pitch on the lawn | Solo or 2 |
| Archery | Range by the outbuilding | Solo, leaderboard |
| 8-ball pool | Commons | 2 |
| Chess | The open-air pods | 2 |
| ALU Quiz Night (Kahoot-style) | Library | Host + everyone |
| Poll voting | Notice board, front plaza | Everyone |
| Startup competition | Enterprise terrace | Pitch, then everyone votes |

Later ideas: tug of war (staff vs students), elevator-pitch and debate stages, share & paint wall,
gratitude wall, Ikaze scavenger hunt, Clubs-fair stamps, Love Week compliment notes, daily crossword.

## Stack

**Client:** Vite + React + React Three Fiber (the campus code from the portfolio, moved here). Web
first: a link opens it on any phone or laptop, no install.

**Realtime: recommended Colyseus** for the pilot.

| Option | Why / why not |
|---|---|
| **Colyseus** (Node, rooms, state sync) | Built for multiplayer games: authoritative rooms, delta-compressed state, reconnection, matchmaking. Self-host on one small VM (~$10–20/month for a pilot). Best fit once we have games with rules (quizzes, scores). |
| PartyKit / Cloudflare Durable Objects | Very easy to deploy and scales per room at the edge. Less game tooling; fine for presence and chat. Good choice if we want zero servers to manage. |
| Supabase Realtime | Great for chat, friends and data (Postgres + auth in one place), weaker for 15 Hz movement of many players. Use it **alongside** for accounts and persistent data. |

The prototype uses a tiny plain-WebSocket server (`server/`) with the same message shapes a
Colyseus room would have, so moving to Colyseus in Phase 1 is a contained change.

**Accounts & data (Phase 1):** Supabase — Postgres for profiles, friends, check-ins, quiz results;
Supabase Auth with **Google sign-in restricted to the ALU email domain**, so only students and staff
can join the pilot.

**Live quiz ("Kahoot-style"):** built in-house. Kahoot has no API for embedding its gameplay. A host
starts a quiz in a room; questions broadcast to everyone present; answers are timed server-side;
a leaderboard shows on a big in-world screen. Server-authoritative scoring so it can't be cheated
from the browser.

**World beyond ALU (Phase 2–3):** OpenStreetMap / Overture Maps building footprints and roads +
a 30 m elevation model (SRTM/Copernicus), extruded in the campus style and streamed in tiles.
Not Google Photorealistic 3D Tiles: per-use cost, attribution and caching restrictions, and the
mesh has no walls/floors a game can use. Credit OpenStreetMap contributors (ODbL).

## Privacy & safety (from day one)

- **Consent:** location and presence are shared only after an explicit opt-in; "invisible" mode;
  check-ins are always deliberate, never automatic from real GPS.
- **Data minimisation:** store display name, ALU email, avatar choices, friends, check-ins, quiz
  scores. No real-world location tracking. Chat retained 30 days for moderation, then deleted.
- **Moderation:** block, mute, report on every player; reports go to a moderator queue; rate limits
  on chat; profanity filter; ability to remove a user from a room.
- **Rules:** code of conduct shown on first join; ALU student affairs as the escalation contact.
- **Before going public (Phase 3):** age gating, terms and privacy policy reviewed, data-protection
  compliance for Rwanda's personal data law, abuse handling at scale.

## What needs the owner's accounts or keys

- A server host for the realtime service (a small VM, Fly.io/Render, or Colyseus Cloud).
- A Supabase project (free tier is enough for the pilot) and the ALU Google Workspace domain for sign-in.
- A domain or sub-domain (e.g. `campus.tejirijesse.com`).
- Permission from ALU to run the pilot with students, and from ALU/MASS for using the campus design.
