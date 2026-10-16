// A test visitor: signs up (demo codes only), makes an avatar, joins, walks a loop on the front
// plaza, says hello, and logs who else it sees.
// Usage: npx tsx scripts/bot.ts [name] [seconds]
//   SERVER_URL=wss://…  to test a deployed server; ORIGIN=https://…  if that server checks origins.
import WebSocket from "ws";
import { COLOURS, HAIRS, OUTFITS, SKINS, type Avatar } from "../shared/avatar";
import { SERVER_PORT, type ServerMsg } from "../shared/protocol";

const name = process.argv[2] || "Bot";
const seconds = Number(process.argv[3] || 60);
const email = `${name.toLowerCase().replace(/\W/g, "")}.bot@alustudent.com`;
const ws = new WebSocket(process.env.SERVER_URL || `ws://localhost:${SERVER_PORT}`, process.env.ORIGIN ? { origin: process.env.ORIGIN } : {});
const seen = new Map<string, string>();
const any = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const avatar: Avatar = { body: Math.random() < 0.5 ? "masc" : "fem", skin: any(SKINS), hair: any(HAIRS), hairColour: "#141010", outfit: any(OUTFITS), colour: any(COLOURS), accent: any(COLOURS), glasses: false };

let walk: NodeJS.Timeout | undefined;
const send = (m: unknown) => ws.send(JSON.stringify(m));

ws.on("open", () => send({ t: "auth.start", email, name }));

ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw)) as ServerMsg;
  if (msg.t === "auth.code") {
    if (!msg.demoCode) {
      console.log("server isn't in demo mode; the bot can't read emailed codes");
      process.exit(1);
    }
    send({ t: "auth.verify", email, code: msg.demoCode });
  }
  if (msg.t === "auth.error") console.log("auth:", msg.message);
  if (msg.t === "auth.ok") send({ t: "profile.save", avatar, start: "kigali" });
  if (msg.t === "profile.ok") send({ t: "join" });
  if (msg.t === "welcome") {
    console.log(`joined as ${msg.id}, ${msg.players.length} already here`);
    const t0 = Date.now();
    walk = setInterval(() => {
      const a = (Date.now() - t0) / 4000;
      send({ t: "move", x: -14 + Math.cos(a) * 5, y: 0, z: 18 + Math.sin(a) * 4, f: a + Math.PI, m: 1, r: 0 });
    }, 80);
    setTimeout(() => send({ t: "chat", text: `Hi, I'm ${name} 👋` }), 1500);
    setTimeout(() => {
      clearInterval(walk);
      ws.close();
    }, seconds * 1000);
  }
  if (msg.t === "joined") console.log(`+ ${msg.player.name}`);
  if (msg.t === "left") console.log(`- ${seen.get(msg.id) ?? msg.id}`);
  if (msg.t === "chat") console.log(`[chat] ${msg.line.name}: ${msg.line.text}`);
  if (msg.t === "state")
    for (const p of msg.players)
      if (p.name !== name) {
        const pos = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
        if (seen.get(p.id + "pos") !== pos) console.log(`  ${p.name} at ${pos}`);
        seen.set(p.id, p.name);
        seen.set(p.id + "pos", pos);
      }
});

ws.on("close", () => process.exit(0));
