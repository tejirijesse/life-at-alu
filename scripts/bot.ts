// A test visitor: joins, walks a loop on the front plaza, says hello, and logs who else it sees.
// Usage: npx tsx scripts/bot.ts [name] [seconds]
import WebSocket from "ws";
import { SERVER_PORT, type ServerMsg } from "../shared/protocol";

const name = process.argv[2] || "Bot";
const seconds = Number(process.argv[3] || 60);
const ws = new WebSocket(process.env.SERVER_URL || `ws://localhost:${SERVER_PORT}`);
const seen = new Map<string, string>();

ws.on("open", () => {
  ws.send(JSON.stringify({ t: "join", name }));
  const t0 = Date.now();
  const walk = setInterval(() => {
    const a = (Date.now() - t0) / 4000;
    const x = -14 + Math.cos(a) * 5;
    const z = 18 + Math.sin(a) * 4;
    ws.send(JSON.stringify({ t: "move", x, y: 0, z, f: a + Math.PI, m: 1, r: 0 }));
  }, 80);
  setTimeout(() => ws.send(JSON.stringify({ t: "chat", text: `Hi, I'm ${name} 👋` })), 1500);
  setTimeout(() => {
    clearInterval(walk);
    ws.close();
  }, seconds * 1000);
});

ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw)) as ServerMsg;
  if (msg.t === "welcome") console.log(`joined as ${msg.id}, ${msg.players.length} already here`);
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
