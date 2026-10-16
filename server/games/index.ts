// Games on the server. Each game is a handler that receives that game's messages from players
// and talks back through the context: to one player, to everyone, and to the wallet.
//
// To add a game: write a handler (see solo.ts), list it in HANDLERS, and add its zone in
// shared/world.ts and its screen in src/games. Messages arrive as { t: "game", game, data }.

import type { GameId } from "../../shared/world";
import { chess } from "./chess";
import { pool } from "./pool";
import { soloGame } from "./solo";

export type GamePlayer = { id: string; name: string; email: string };

export type GameContext = {
  /** Who sent this message. */
  player: GamePlayer;
  /** Everyone currently on campus. */
  players(): GamePlayer[];
  /** Send this game's data to one player, or to the sender if no id is given. */
  send(data: unknown, toId?: string): void;
  /** Send this game's data to everyone on campus (or those for whom only() is true). */
  broadcast(data: unknown, only?: (p: GamePlayer) => boolean): void;
  /** Change a player's coins (the sender by default). False if they can't afford it. */
  pay(delta: number, reason: string, toId?: string): boolean;
  /** Pay out a solo-game win, capped so it can't be farmed. Returns the amount paid. */
  soloPayout(requested: number, reason: string): number;
};

export type GameHandler = {
  message(ctx: GameContext, data: unknown): void;
  /** Someone left campus: tidy up any table or match they were in. */
  leave?(ctx: SystemContext, playerId: string): void;
  /** Called once a second, for clocks and timeouts. */
  tick?(ctx: SystemContext): void;
};

/** A context with no sender, for timers and departures. */
export type SystemContext = Omit<GameContext, "player" | "soloPayout">;

export const HANDLERS: Partial<Record<GameId, GameHandler>> = {
  basketball: soloGame("basketball", (score) => score * 4),
  football: soloGame("football", (score) => score * 10),
  archery: soloGame("archery", (score) => Math.round(score / 2)),
  chess,
  pool,
};
