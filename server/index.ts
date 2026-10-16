// Life at ALU — realtime server.
//
// One shared room: the campus. People sign in with an ALU email and a code (accounts.ts), make an
// avatar, pick a starting point, then join: they stream their position and receive everyone else's
// at TICK_HZ. Campus-wide chat with basic rate limiting. Games run through server/games.

import { WebSocketServer, type WebSocket } from "ws";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { SERVER_PORT, TICK_HZ, type Account, type ChatLine, type ClientMsg, type PlayerState, type ServerMsg } from "../shared/protocol";
import { startById, type GameId } from "../shared/world";
import { indoorName } from "../src/campus/indoors";
import { placeName } from "../src/campus/layout";
import { levelFor, titleFor } from "../shared/levels";
import * as accounts from "./accounts";
import * as progress from "./progress";
import { store } from "./store";
import { HANDLERS, type GameContext, type GamePlayer, type SystemContext } from "./games";

const PALETTE = ["#d1495b", "#2e86ab", "#f18f01", "#3b8b5a", "#7b5ea7", "#c2185b", "#00897b", "#5d6d7e", "#e07a5f", "#3d405b"];
const MAX_CHAT = 200;
const CHAT_HISTORY = 30;
const CHAT_GAP_MS = 600;
const AUTH_STARTS_PER_10_MIN = 6;

type Client = {
  ws: WebSocket;
  /** Signed in as this email (null until a code or a saved sign-in checks out). */
  email: string | null;
  state: PlayerState | null;
  lastChat: number;
  lastSeen: number;
  authStarts: number[];
  /** When we last checked which named place they're in (for exploring XP). */
  lastPlace: number;
};

const clients = new Map<string, Client>();
const chat: ChatLine[] = [];
let colorIndex = 0;

// WS_PORT only: a PORT meant for the web page (dev tools often set one) must not move us.
// Hosts that hand out PORT map it in the start command (see render.yaml).
const port = Number(process.env.WS_PORT) || SERVER_PORT;
// In production, only the campus site may connect: ALLOWED_ORIGINS="https://life-at-alu.vercel.app,…".
const allowed = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Plain HTTP answers health checks; WebSocket upgrades go to the campus room.
const http = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`Life at ALU realtime server: ${[...clients.values()].filter((c) => c.state).length} on campus\n`);
});
const wss = new WebSocketServer({
  server: http,
  maxPayload: 8192,
  verifyClient: ({ origin }: { origin: string }) => !allowed.length || allowed.includes(origin),
});
// Saved accounts, progress and rivalries first, then open the doors.
const saved = await store.load();
accounts.seed(saved.accounts);
progress.seed(saved.events, saved.rivalries);
console.log(`store: ${store.name}, ${saved.accounts.length} accounts, ${saved.events.length} recent events`);
http.listen(port);

const send = (ws: WebSocket, msg: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const broadcast = (msg: ServerMsg, except?: string) => {
  const data = JSON.stringify(msg);
  for (const [id, c] of clients) if (id !== except && c.state && c.ws.readyState === c.ws.OPEN) c.ws.send(data);
};
/** Everyone signed in as this email (they may have two tabs open). */
const connectionsOf = (email: string) => [...clients.values()].filter((c) => c.email === email);

const finite = (n: unknown, lo: number, hi: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0);

/** Coins changed: tell every tab of that person, with a fresh signed copy to keep. */
function walletChanged(a: Account, delta: number, reason: string) {
  const token = accounts.tokenFor(a);
  for (const c of connectionsOf(a.email)) send(c.ws, { t: "wallet", coins: a.coins, delta, reason, token });
}

/** Progress changed: tell that person (XP toast, level bar) and, if their name tag changed, everyone. */
progress.onProgress((a, gained, reason, levelUp, tagChanged) => {
  const p = progress.progressOf(a);
  const level = levelFor(p.xp);
  const token = accounts.tokenFor(a);
  for (const c of connectionsOf(a.email)) send(c.ws, { t: "progress", progress: p, level, title: titleFor(level), gained, reason, levelUp, token });
  if (!tagChanged) return;
  const tag = progress.tagOf(a);
  for (const [id, c] of clients)
    if (c.email === a.email && c.state) {
      c.state.tag = tag;
      broadcast({ t: "tag", id, tag });
    }
});

const gamePlayer = (id: string, c: Client): GamePlayer => ({ id, name: c.state?.name ?? "", email: c.email ?? "" });
const onCampus = () => [...clients.entries()].filter(([, c]) => c.state && c.email).map(([id, c]) => gamePlayer(id, c));

/** Send, broadcast and pay on behalf of a game, with no particular sender. */
function systemContext(game: string): SystemContext {
  const payTo = (delta: number, reason: string, toId?: string) => {
    const target = toId ? clients.get(toId) : undefined;
    if (!target?.email) return false;
    const a = accounts.pay(target.email, delta, reason);
    if (!a) return false;
    walletChanged(a, delta, reason);
    return true;
  };
  return {
    players: onCampus,
    send: (data, toId) => {
      const target = toId ? clients.get(toId) : undefined;
      if (target) send(target.ws, { t: "game", game, data });
    },
    broadcast: (data, only) => {
      for (const p of onCampus()) if (!only || only(p)) send(clients.get(p.id)!.ws, { t: "game", game, data });
    },
    pay: payTo,
  };
}

/** The same, for a message from one player: send() and pay() default to them. */
function gameContext(game: string, id: string, c: Client): GameContext {
  const sys = systemContext(game);
  return {
    ...sys,
    player: gamePlayer(id, c),
    send: (data, toId) => sys.send(data, toId ?? id),
    pay: (delta, reason, toId) => sys.pay(delta, reason, toId ?? id),
    soloPayout: (requested, reason) => {
      if (!c.email) return 0;
      const amount = accounts.soloPayout(c.email, requested);
      if (amount > 0) sys.pay(amount, reason, id);
      return amount;
    },
  };
}

wss.on("connection", (ws) => {
  const id = randomUUID().slice(0, 8);
  const client: Client = { ws, email: null, state: null, lastChat: 0, lastSeen: Date.now(), authStarts: [], lastPlace: 0 };
  clients.set(id, client);

  const signedIn = (account: Account, isNew: boolean) => {
    client.email = account.email;
    send(ws, { t: "auth.ok", token: accounts.tokenFor(account), account, isNew });
  };

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    client.lastSeen = Date.now();

    switch (msg.t) {
      case "auth.start": {
        const now = Date.now();
        client.authStarts = client.authStarts.filter((t) => now - t < 600_000);
        if (client.authStarts.length >= AUTH_STARTS_PER_10_MIN) {
          send(ws, { t: "auth.error", message: "Too many codes requested. Try again in a few minutes." });
          return;
        }
        client.authStarts.push(now);
        const r = accounts.startCode(msg.email, msg.name);
        if (!r.ok) {
          send(ws, { t: "auth.error", message: r.message });
          return;
        }
        // Demo mode shows the code on screen; with email set up, it would be sent here instead.
        send(ws, { t: "auth.code", email: r.value.email, expiresIn: 600, isNew: r.value.isNew, demoCode: accounts.DEMO_CODES ? r.value.code : undefined });
        return;
      }
      case "auth.verify": {
        const r = accounts.verifyCode(msg.email, msg.code);
        if (!r.ok) send(ws, { t: "auth.error", message: r.message });
        else signedIn(r.value.account, r.value.isNew);
        return;
      }
      case "auth.resume": {
        const account = accounts.resume(msg.token);
        if (!account) send(ws, { t: "auth.error", message: "Your saved sign-in has expired. Log in again." });
        else signedIn(account, false);
        return;
      }
      case "auth.logout":
        client.email = null;
        return;
      case "profile.save": {
        if (!client.email) return;
        const a = accounts.saveProfile(client.email, msg.avatar, msg.start);
        if (a) send(ws, { t: "profile.ok", token: accounts.tokenFor(a), account: a });
        return;
      }
      case "join": {
        if (client.state || !client.email) return;
        const account = accounts.get(client.email);
        if (!account?.avatar) {
          send(ws, { t: "error", message: "Make your avatar first." });
          return;
        }
        const start = startById(account.start ?? "");
        const color = PALETTE[colorIndex++ % PALETTE.length];
        client.state = { id, name: account.name, color, x: start.x, y: 0, z: start.z, f: start.facing, m: 0, r: 0, look: account.avatar, tag: progress.tagOf(account) };
        send(ws, {
          t: "welcome",
          id,
          color,
          players: [...clients.values()].filter((c) => c.state && c !== client).map((c) => c.state!),
          chat,
        });
        broadcast({ t: "joined", player: client.state }, id);
        console.log(`+ ${account.name} (${id}) — ${onCampus().length} on campus`);
        return;
      }
    }

    if (!client.state) return;

    if (msg.t === "move") {
      const s = client.state;
      s.x = finite(msg.x, -400, 400);
      s.y = finite(msg.y, -60, 80);
      s.z = finite(msg.z, -400, 400);
      s.f = finite(msg.f, -100, 100);
      s.m = finite(msg.m, 0, 1);
      s.r = finite(msg.r, 0, 1);
      // Exploring: the first visit to each named place earns XP (checked at most once a second).
      const now = Date.now();
      if (client.email && now - client.lastPlace > 1000) {
        client.lastPlace = now;
        progress.visit(client.email, indoorName(s.x, s.z, s.y) ?? placeName(s.x, s.z));
      }
      return;
    }

    if (msg.t === "chat") {
      const text = String(msg.text ?? "")
        .replace(/[\u0000-\u001f\u007f<>]/g, "")
        .trim()
        .slice(0, MAX_CHAT);
      const now = Date.now();
      if (!text || now - client.lastChat < CHAT_GAP_MS) return;
      client.lastChat = now;
      const line: ChatLine = { id, name: client.state.name, color: client.state.color, text, ts: now };
      chat.push(line);
      if (chat.length > CHAT_HISTORY) chat.shift();
      broadcast({ t: "chat", line });
      return;
    }

    if (msg.t === "ranks") {
      if (client.email) send(ws, { t: "ranks", ...progress.ranks(client.email) });
      return;
    }

    if (msg.t === "game") {
      const handler = HANDLERS[msg.game as GameId];
      if (handler) handler.message(gameContext(msg.game, id, client), msg.data);
    }
  });

  ws.on("close", () => {
    const had = client.state;
    clients.delete(id);
    if (had) {
      for (const [game, handler] of Object.entries(HANDLERS)) handler?.leave?.(systemContext(game), id);
      broadcast({ t: "left", id });
      console.log(`- ${had.name} (${id}) — ${onCampus().length} on campus`);
    }
  });
});

// Everyone's positions, TICK_HZ times a second (looks and name tags are sent on join and on change).
setInterval(() => {
  const players = [...clients.values()].filter((c) => c.state).map(({ state }) => ({ ...state!, look: undefined, tag: undefined }));
  if (players.length) broadcast({ t: "state", players });
}, 1000 / TICK_HZ);

// Game clocks and timeouts.
setInterval(() => {
  for (const [game, handler] of Object.entries(HANDLERS)) handler?.tick?.(systemContext(game));
}, 1000);

// Drop connections that went silent without closing.
setInterval(() => {
  const cutoff = Date.now() - 30_000;
  for (const c of clients.values()) if (c.lastSeen < cutoff) c.ws.terminate();
}, 10_000);

console.log(
  `Life at ALU server on ws://localhost:${port}${allowed.length ? ` (origins: ${allowed.join(", ")})` : ""}${accounts.DEMO_CODES ? " [demo codes on screen]" : ""}`,
);
