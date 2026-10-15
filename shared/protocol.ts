// Messages between the browser and the realtime server.
// Kept deliberately close to a Colyseus room's shape so Phase 1 can swap the transport.

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
};

export type ChatLine = { id: string; name: string; color: string; text: string; ts: number };

export type ClientMsg =
  | { t: "join"; name: string }
  | { t: "move"; x: number; y: number; z: number; f: number; m: number; r: number }
  | { t: "chat"; text: string };

export type ServerMsg =
  | { t: "welcome"; id: string; color: string; players: PlayerState[]; chat: ChatLine[] }
  | { t: "state"; players: PlayerState[] }
  | { t: "joined"; player: PlayerState }
  | { t: "left"; id: string }
  | { t: "chat"; line: ChatLine }
  | { t: "error"; message: string };

export const SERVER_PORT = 2567;
export const TICK_HZ = 12;
