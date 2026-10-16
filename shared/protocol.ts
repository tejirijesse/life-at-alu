// Messages between the browser and the realtime server.
// Kept deliberately close to a Colyseus room's shape so Phase 1 can swap the transport.

import type { Avatar } from "./avatar";

export type PlayerState = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  /** Facing angle (radians). */
  f: number;
  /** Walking amount 0..1 and running 0..1, for the animation. */
  m: number;
  r: number;
  /** How they look. Sent when someone joins, not on every movement tick. */
  look?: Avatar;
};

export type ChatLine = { id: string; name: string; color: string; text: string; ts: number };

/** A person's account. The server is the source of truth; the browser keeps a signed copy. */
export type Account = {
  email: string;
  name: string;
  /** Null until they've made their avatar. */
  avatar: Avatar | null;
  /** Starting point id (shared/world.ts), null until chosen. */
  start: string | null;
  coins: number;
  createdAt: number;
  /** Bumped on every change, so the newest copy wins after a server restart. */
  v: number;
};

export type ClientMsg =
  // Sign up (with a name) or log in (without): ask for a code for this email.
  | { t: "auth.start"; email: string; name?: string }
  | { t: "auth.verify"; email: string; code: string }
  /** Pick up where you left off on this device. */
  | { t: "auth.resume"; token: string }
  | { t: "auth.logout" }
  | { t: "profile.save"; avatar: Avatar; start: string }
  | { t: "join" }
  | { t: "move"; x: number; y: number; z: number; f: number; m: number; r: number }
  | { t: "chat"; text: string }
  /** Anything for a game; the server hands it to that game's handler (server/games). */
  | { t: "game"; game: string; data: unknown };

export type ServerMsg =
  /** demoCode is only sent in demo mode, where codes are shown on screen instead of emailed. */
  | { t: "auth.code"; email: string; demoCode?: string; expiresIn: number; isNew: boolean }
  | { t: "auth.ok"; token: string; account: Account; isNew: boolean }
  | { t: "auth.error"; message: string }
  | { t: "profile.ok"; token: string; account: Account }
  /** Your balance changed. token is the refreshed signed copy to keep. */
  | { t: "wallet"; coins: number; delta: number; reason: string; token: string }
  | { t: "welcome"; id: string; color: string; players: PlayerState[]; chat: ChatLine[] }
  | { t: "state"; players: PlayerState[] }
  | { t: "joined"; player: PlayerState }
  | { t: "left"; id: string }
  | { t: "chat"; line: ChatLine }
  | { t: "game"; game: string; data: unknown }
  | { t: "error"; message: string };

export const SERVER_PORT = 2567;
export const TICK_HZ = 12;
