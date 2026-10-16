// Client side of the realtime connection: sign in, join, stream my position, receive everyone
// else's, keep my wallet, and carry game messages.

import type { Avatar } from "../shared/avatar";
import { SERVER_PORT, type Account, type BoardId, type Boards, type ChatLine, type ClientMsg, type PlayerState, type ServerMsg } from "../shared/protocol";

type Listener = () => void;

/** The server-signed copy of my account, kept so this device stays signed in. */
const SESSION_KEY = "life-at-alu-session";
const readSession = () => {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};
const writeSession = (token: string | null) => {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
};

export type AuthState =
  | { step: "checking" }
  | { step: "signed-out"; error?: string }
  | { step: "code"; email: string; isNew: boolean; demoCode?: string; error?: string }
  | { step: "signed-in"; isNew: boolean };

export class Net {
  ws: WebSocket | null = null;
  id = "";
  color = "#111";
  /** Latest known state of other players, updated in place (read every frame). */
  players = new Map<string, PlayerState>();
  chat: ChatLine[] = [];
  /** connecting → ready (socket open) → online (on campus). */
  status: "idle" | "connecting" | "ready" | "online" | "offline" = "idle";
  auth: AuthState = readSession() ? { step: "checking" } : { step: "signed-out" };
  account: Account | null = null;
  /** Bumped whenever my sign-in or account changes, so views know to re-read them. */
  authVersion = 0;
  /** The last change to my coins, for a little "+36" in the HUD. */
  lastWallet: { delta: number; reason: string; at: number } | null = null;
  /** The last XP I earned, for a toast (and a bigger one on levelling up). */
  lastXp: { gained: number; reason: string; levelUp: boolean; level: number; title: string; at: number } | null = null;
  /** The leaderboards, when asked for. */
  ranks: { boards: Boards; you: Record<BoardId, { weekly: number | null; all: number | null }>; weekStarts: number; at: number } | null = null;

  private listeners = { roster: new Set<Listener>(), chat: new Set<Listener>(), status: new Set<Listener>(), auth: new Set<Listener>(), ranks: new Set<Listener>() };
  private gameListeners = new Map<string, Set<(data: unknown) => void>>();
  private lastSent = 0;
  private retries = 0;
  /** Rejoin the campus automatically after a reconnect. */
  private wantCampus = false;

  connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const url = import.meta.env.VITE_SERVER_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${SERVER_PORT}`;
    this.setStatus("connecting");
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.setStatus("ready");
      const token = readSession();
      if (token) this.send({ t: "auth.resume", token });
    };
    ws.onmessage = (e) => this.handle(JSON.parse(e.data) as ServerMsg);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      // Everyone else is unknown until we're back; then the server sends them again.
      this.players.clear();
      this.emit("roster");
      this.setStatus(this.retries < 8 ? "connecting" : "offline");
      // Keep trying: a free-tier server can take most of a minute to wake up.
      const wait = Math.min(15000, 1500 * 2 ** this.retries++);
      setTimeout(() => this.ws === ws && ((this.ws = null), this.connect()), wait);
    };
  }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case "auth.code":
        this.setAuth({ step: "code", email: msg.email, isNew: msg.isNew, demoCode: msg.demoCode });
        break;
      case "auth.error":
        // A failed saved sign-in just means "log in again".
        if (this.auth.step === "checking") writeSession(null);
        this.setAuth(this.auth.step === "code" ? { ...this.auth, error: msg.message } : { step: "signed-out", error: this.auth.step === "checking" ? undefined : msg.message });
        break;
      case "auth.ok":
        writeSession(msg.token);
        this.account = msg.account;
        this.setAuth({ step: "signed-in", isNew: msg.isNew });
        if (this.wantCampus && msg.account.avatar) this.send({ t: "join" });
        break;
      case "profile.ok":
        writeSession(msg.token);
        this.account = msg.account;
        this.emit("auth");
        break;
      case "wallet":
        writeSession(msg.token);
        if (this.account) this.account = { ...this.account, coins: msg.coins };
        this.lastWallet = { delta: msg.delta, reason: msg.reason, at: Date.now() };
        this.emit("auth");
        break;
      case "progress":
        writeSession(msg.token);
        if (this.account) this.account = { ...this.account, progress: msg.progress };
        if (msg.gained > 0 || msg.levelUp) this.lastXp = { gained: msg.gained, reason: msg.reason, levelUp: msg.levelUp, level: msg.level, title: msg.title, at: Date.now() };
        this.emit("auth");
        break;
      case "tag": {
        const p = this.players.get(msg.id);
        if (p) {
          this.players.set(msg.id, { ...p, tag: msg.tag });
          this.emit("roster");
        }
        break;
      }
      case "ranks":
        this.ranks = { boards: msg.boards, you: msg.you, weekStarts: msg.weekStarts, at: Date.now() };
        this.emit("ranks");
        break;
      case "welcome":
        this.id = msg.id;
        this.color = msg.color;
        this.players.clear();
        msg.players.forEach((p) => this.players.set(p.id, p));
        this.chat = msg.chat;
        this.setStatus("online");
        this.emit("roster");
        this.emit("chat");
        break;
      case "joined":
        if (msg.player.id !== this.id) this.players.set(msg.player.id, msg.player);
        this.emit("roster");
        break;
      case "left":
        this.players.delete(msg.id);
        this.emit("roster");
        break;
      case "state": {
        let changed = false;
        for (const p of msg.players) {
          if (p.id === this.id) continue;
          const known = this.players.get(p.id);
          if (!known) changed = true;
          // Ticks carry positions only; keep the look and name tag we already have.
          this.players.set(p.id, { ...p, look: known?.look ?? p.look, tag: known?.tag ?? p.tag });
        }
        if (changed) this.emit("roster");
        break;
      }
      case "chat":
        this.chat = [...this.chat.slice(-29), msg.line];
        this.emit("chat");
        break;
      case "game":
        this.gameListeners.get(msg.game)?.forEach((l) => l(msg.data));
        break;
    }
  }

  // ---- Signing in ----

  /** Sign up (with a name) or log in (without): the server sends a code. */
  requestCode(email: string, name?: string) {
    this.connect();
    this.send({ t: "auth.start", email: email.trim(), name: name?.trim() });
  }
  verify(code: string) {
    if (this.auth.step === "code") this.send({ t: "auth.verify", email: this.auth.email, code: code.trim() });
  }
  backToEmail() {
    this.setAuth({ step: "signed-out" });
  }
  logout() {
    writeSession(null);
    this.account = null;
    this.wantCampus = false;
    this.send({ t: "auth.logout" });
    this.setAuth({ step: "signed-out" });
    // Leaving campus: a fresh socket is the simplest clean slate.
    this.ws?.close();
  }
  saveProfile(avatar: Avatar, start: string) {
    this.send({ t: "profile.save", avatar, start });
  }
  /** Walk onto campus (after signing in and making an avatar). */
  join() {
    this.wantCampus = true;
    this.send({ t: "join" });
  }

  // ---- On campus ----

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

  /** Ask for the leaderboards (they arrive through onRanks). */
  askRanks() {
    this.send({ t: "ranks" });
  }

  game(game: string, data: unknown) {
    this.send({ t: "game", game, data });
  }
  onGame(game: string, l: (data: unknown) => void) {
    if (!this.gameListeners.has(game)) this.gameListeners.set(game, new Set());
    this.gameListeners.get(game)!.add(l);
    return () => void this.gameListeners.get(game)?.delete(l);
  }

  private send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private setStatus(s: Net["status"]) {
    this.status = s;
    this.emit("status");
  }
  private setAuth(a: AuthState) {
    this.auth = a;
    this.emit("auth");
  }

  private emit(k: keyof Net["listeners"]) {
    if (k === "auth") this.authVersion++;
    this.listeners[k].forEach((l) => l());
  }

  onRoster(l: Listener) {
    this.listeners.roster.add(l);
    return () => void this.listeners.roster.delete(l);
  }
  onChat(l: Listener) {
    this.listeners.chat.add(l);
    return () => void this.listeners.chat.delete(l);
  }
  onStatus(l: Listener) {
    this.listeners.status.add(l);
    return () => void this.listeners.status.delete(l);
  }
  onRanks(l: Listener) {
    this.listeners.ranks.add(l);
    return () => void this.listeners.ranks.delete(l);
  }
  onAuth(l: Listener) {
    this.listeners.auth.add(l);
    return () => void this.listeners.auth.delete(l);
  }
}

export const net = new Net();
