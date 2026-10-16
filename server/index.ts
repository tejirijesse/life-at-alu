// Life at ALU — realtime server (prototype).
//
// One shared room: the campus. Clients join with a display name, stream their position,
// and receive everyone else's at TICK_HZ. Campus-wide chat with basic rate limiting.
// No accounts yet: Phase 1 adds ALU sign-in (see PLAN.md) and moves this to Colyseus.

import { WebSocketServer, type WebSocket } from "ws";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { SERVER_PORT, TICK_HZ, type ChatLine, type ClientMsg, type PlayerState, type ServerMsg } from "../shared/protocol";

const PALETTE = ["#d1495b", "#2e86ab", "#f18f01", "#3b8b5a", "#7b5ea7", "#c2185b", "#00897b", "#5d6d7e", "#e07a5f", "#3d405b"];
const MAX_NAME = 20;
const MAX_CHAT = 200;
const CHAT_HISTORY = 30;
const CHAT_GAP_MS = 600;

type Client = { ws: WebSocket; state: PlayerState | null; lastChat: number; lastSeen: number };

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
  res.end(`Life at ALU realtime server: ${clients.size} connected\n`);
});
const wss = new WebSocketServer({
  server: http,
  maxPayload: 4096,
  verifyClient: ({ origin }: { origin: string }) => !allowed.length || allowed.includes(origin),
});
http.listen(port);

const send = (ws: WebSocket, msg: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const broadcast = (msg: ServerMsg, except?: string) => {
  const data = JSON.stringify(msg);
  for (const [id, c] of clients) if (id !== except && c.state && c.ws.readyState === c.ws.OPEN) c.ws.send(data);
};

const clean = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .slice(0, max);
const finite = (n: unknown, lo: number, hi: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0);

wss.on("connection", (ws) => {
  const id = randomUUID().slice(0, 8);
  const client: Client = { ws, state: null, lastChat: 0, lastSeen: Date.now() };
  clients.set(id, client);

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    client.lastSeen = Date.now();

    if (msg.t === "join" && !client.state) {
      const name = clean(msg.name, MAX_NAME) || "Guest";
      const color = PALETTE[colorIndex++ % PALETTE.length];
      client.state = { id, name, color, x: -14, y: 0, z: 24, f: Math.PI, m: 0, r: 0 };
      send(ws, {
        t: "welcome",
        id,
        color,
        players: [...clients.values()].filter((c) => c.state && c !== client).map((c) => c.state!),
        chat,
      });
      broadcast({ t: "joined", player: client.state }, id);
      console.log(`+ ${name} (${id}) — ${clients.size} online`);
      return;
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
      return;
    }

    if (msg.t === "chat") {
      const text = clean(msg.text, MAX_CHAT);
      const now = Date.now();
      if (!text || now - client.lastChat < CHAT_GAP_MS) return;
      client.lastChat = now;
      const line: ChatLine = { id, name: client.state.name, color: client.state.color, text, ts: now };
      chat.push(line);
      if (chat.length > CHAT_HISTORY) chat.shift();
      broadcast({ t: "chat", line });
    }
  });

  ws.on("close", () => {
    const had = client.state;
    clients.delete(id);
    if (had) {
      broadcast({ t: "left", id });
      console.log(`- ${had.name} (${id}) — ${clients.size} online`);
    }
  });
});

// Everyone's positions, TICK_HZ times a second.
setInterval(() => {
  const players = [...clients.values()].filter((c) => c.state).map((c) => c.state!);
  if (players.length) broadcast({ t: "state", players });
}, 1000 / TICK_HZ);

// Drop connections that went silent without closing.
setInterval(() => {
  const cutoff = Date.now() - 30_000;
  for (const c of clients.values()) if (c.lastSeen < cutoff) c.ws.terminate();
}, 10_000);

console.log(`Life at ALU server on ws://localhost:${port}${allowed.length ? ` (origins: ${allowed.join(", ")})` : ""}`);
