// Two-player tables (chess boards, the pool table): who's seated, who's watching, and sending
// each of them the table as they should see it. The game decides what "state" means.
//
// Table messages every two-player game understands:
//   → { type: "open", table }    I opened the game at this table (start watching)
//   → { type: "close", table }   I closed it (stop watching; forfeit if I was playing)
//   → { type: "sit", table }     take a free seat
// The game sends back { type: "state", table, ... } whenever something changes.

import type { GamePlayer, SystemContext } from "./index";

export type Seat = GamePlayer | null;

export type Table<S> = {
  id: string;
  seats: [Seat, Seat];
  watchers: Set<string>;
  /** waiting: one or no players; playing; over: someone won (seats kept until a new game). */
  status: "waiting" | "playing" | "over";
  game: S;
  /** When the first player sat down (for refunds if nobody joins). */
  since: number;
};

export function tables<S>(fresh: () => S, valid: (id: string) => boolean) {
  const all = new Map<string, Table<S>>();
  return {
    get(id: unknown): Table<S> | null {
      if (typeof id !== "string" || !valid(id)) return null;
      if (!all.has(id)) all.set(id, { id, seats: [null, null], watchers: new Set(), status: "waiting", game: fresh(), since: 0 });
      return all.get(id)!;
    },
    all: () => [...all.values()],
    /** Which seat this player is in, or -1. */
    seatOf(t: Table<S>, playerId: string) {
      return t.seats.findIndex((s) => s?.id === playerId) as -1 | 0 | 1;
    },
    /** Everyone who should hear about this table. */
    audience(t: Table<S>) {
      const ids = new Set(t.watchers);
      for (const s of t.seats) if (s) ids.add(s.id);
      return ids;
    },
    /** Clear the table for the next game. */
    reset(t: Table<S>) {
      t.seats = [null, null];
      t.status = "waiting";
      t.game = fresh();
      t.since = 0;
    },
  };
}

/** Send every watcher and player their own view of the table. */
export function sendState<S>(ctx: SystemContext, ids: Set<string>, view: (playerId: string) => unknown) {
  for (const id of ids) ctx.send(view(id), id);
}
