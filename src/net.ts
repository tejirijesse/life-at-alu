// Client side of the realtime connection: join, stream my position, receive everyone else's.

import { SERVER_PORT, type ChatLine, type ClientMsg, type PlayerState, type ServerMsg } from "../shared/protocol";

type Listener = () => void;

export class Net {
  ws: WebSocket | null = null;
  id = "";
  color = "#111";
  /** Latest known state of other players, updated in place (read every frame). */
  players = new Map<string, PlayerState>();
  chat: ChatLine[] = [];
  status: "idle" | "connecting" | "online" | "offline" = "idle";
  private rosterListeners = new Set<Listener>();
  private chatListeners = new Set<Listener>();
  private statusListeners = new Set<Listener>();
  private lastSent = 0;

  connect(name: string) {
    const url = import.meta.env.VITE_SERVER_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${SERVER_PORT}`;
    this.setStatus("connecting");
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => this.send({ t: "join", name });
    ws.onclose = () => this.setStatus("offline");
    ws.onerror = () => this.setStatus("offline");
    ws.onmessage = (e) => this.handle(JSON.parse(e.data) as ServerMsg);
  }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case "welcome":
        this.id = msg.id;
        this.color = msg.color;
        msg.players.forEach((p) => this.players.set(p.id, p));
        this.chat = msg.chat;
        this.setStatus("online");
        this.emit(this.rosterListeners);
        this.emit(this.chatListeners);
        break;
      case "joined":
        if (msg.player.id !== this.id) this.players.set(msg.player.id, msg.player);
        this.emit(this.rosterListeners);
        break;
      case "left":
        this.players.delete(msg.id);
        this.emit(this.rosterListeners);
        break;
      case "state": {
        let changed = false;
        for (const p of msg.players) {
          if (p.id === this.id) continue;
          if (!this.players.has(p.id)) changed = true;
          this.players.set(p.id, p);
        }
        if (changed) this.emit(this.rosterListeners);
        break;
      }
      case "chat":
        this.chat = [...this.chat.slice(-29), msg.line];
        this.emit(this.chatListeners);
        break;
    }
  }

  /** Send my position, at most ~15 times a second. */
  move(x: number, y: number, z: number, f: number, m: number, r: number) {
    const now = performance.now();
    if (now - this.lastSent < 66) return;
    this.lastSent = now;
    this.send({ t: "move", x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), f: +f.toFixed(3), m: +m.toFixed(2), r: +r.toFixed(2) });
  }

  say(text: string) {
    this.send({ t: "chat", text });
  }

  private send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private setStatus(s: Net["status"]) {
    this.status = s;
    this.emit(this.statusListeners);
  }

  private emit(set: Set<Listener>) {
    set.forEach((l) => l());
  }

  onRoster(l: Listener) {
    this.rosterListeners.add(l);
    return () => void this.rosterListeners.delete(l);
  }
  onChat(l: Listener) {
    this.chatListeners.add(l);
    return () => void this.chatListeners.delete(l);
  }
  onStatus(l: Listener) {
    this.statusListeners.add(l);
    return () => void this.statusListeners.delete(l);
  }
}

export const net = new Net();
