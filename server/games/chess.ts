// Chess at the open-air pods. Two players, 5 minutes each, full rules (chess.js checks every
// move on the server, so nobody can play an illegal one). Winner gets 30 coins; no entry fee.
// Every finished game is rated (progress.ts) and counts towards the two players' rivalry.
//
//   → open / close / sit (tables.ts)
//   → { type: "move", table, from: "e2", to: "e4", promotion?: "q" }
//   → { type: "rematch", table }  (after a game; colours swap when both ask)
//   → { type: "resign", table }   → { type: "draw", table }  (offer, or accept an offer)
//   ← { type: "state", table, white, black, fen, you, clocks, status, result, lastMove, drawOffer }

import { Chess } from "chess.js";
import { ZONES } from "../../shared/world";
import * as accounts from "../accounts";
import * as progress from "../progress";
import type { GameHandler, SystemContext } from "./index";
import { sendState, tables, type Table } from "./tables";

const CLOCK_MS = 5 * 60_000;
const PRIZE = 30;

type ChessGame = {
  chess: Chess;
  clocks: { w: number; b: number };
  /** When the side to move started thinking. */
  since: number;
  result: string | null;
  lastMove: { from: string; to: string } | null;
  /** Seat that offered a draw. */
  drawOffer: 0 | 1 | null;
  /** Rating changes from the finished game. */
  rated: { white: { rating: number; delta: number }; black: { rating: number; delta: number } } | null;
  /** Who wants a rematch after the game. */
  rematch: [boolean, boolean];
};

const fresh = (): ChessGame => ({ chess: new Chess(), clocks: { w: CLOCK_MS, b: CLOCK_MS }, since: 0, result: null, lastMove: null, drawOffer: null, rated: null, rematch: [false, false] });
const boards = tables(fresh, (id) => ZONES.some((z) => z.game === "chess" && z.id === id));

/** Time left for each side right now (the side to move is running). */
function clocksNow(t: Table<ChessGame>) {
  const c = { ...t.game.clocks };
  if (t.status === "playing") c[t.game.chess.turn()] -= Date.now() - t.game.since;
  return { w: Math.max(0, c.w), b: Math.max(0, c.b) };
}

/** A seated player as the board shows them: name and rating. */
function side(t: Table<ChessGame>, seat: 0 | 1) {
  const s = t.seats[seat];
  if (!s) return null;
  const a = accounts.get(s.email);
  return { name: s.name, rating: a ? Math.round(progress.progressOf(a).chess.rating) : 1200, games: a ? progress.progressOf(a).chess.games : 0 };
}

function view(t: Table<ChessGame>, playerId: string) {
  const seat = boards.seatOf(t, playerId);
  const [w, b] = t.seats;
  // Head to head, from white's side: past games between these two.
  const h2h = w && b && w.email !== b.email ? progress.rivalryOf(w.email, b.email) : null;
  return {
    type: "state",
    table: t.id,
    white: side(t, 0),
    black: side(t, 1),
    h2h: h2h && { white: h2h.wins, black: h2h.losses, draws: h2h.draws },
    rated: t.game.rated,
    rematch: t.game.rematch,
    you: seat === 0 ? "w" : seat === 1 ? "b" : null,
    fen: t.game.chess.fen(),
    clocks: clocksNow(t),
    serverTime: Date.now(),
    status: t.status,
    result: t.game.result,
    lastMove: t.game.lastMove,
    drawOffer: t.game.drawOffer,
    prize: PRIZE,
  };
}

const publish = (ctx: SystemContext, t: Table<ChessGame>) => sendState(ctx, boards.audience(t), (id) => view(t, id));

/** End the game. winner: seat index, or null for a draw. */
function finish(ctx: SystemContext, t: Table<ChessGame>, winner: 0 | 1 | null, why: string) {
  t.game.clocks = clocksNow(t);
  t.status = "over";
  const names = t.seats.map((s) => s?.name ?? "?");
  t.game.result = winner === null ? `Draw: ${why}` : `${names[winner]} wins: ${why}`;
  if (winner !== null) {
    const w = t.seats[winner];
    if (w) ctx.pay(PRIZE, `chess win (${why})`, w.id);
  }
  const [white, black] = t.seats;
  // Rated once both sides have moved twice, so an instant resign can't farm XP or rating.
  if (white && black && t.game.chess.history().length >= 4) t.game.rated = progress.chessResult(white.email, black.email, winner === null ? 0.5 : winner === 0 ? 1 : 0);
  publish(ctx, t);
}

export const chess: GameHandler = {
  message(ctx, data) {
    const d = (data ?? {}) as { type?: string; table?: unknown; from?: unknown; to?: unknown; promotion?: unknown };
    const t = boards.get(d.table);
    if (!t) return;
    const me = ctx.player;
    const seat = boards.seatOf(t, me.id);

    switch (d.type) {
      case "open":
        t.watchers.add(me.id);
        ctx.send(view(t, me.id));
        return;
      case "close":
        t.watchers.delete(me.id);
        if (seat !== -1) leaveSeat(ctx, t, seat);
        return;
      case "sit": {
        if (seat !== -1) return;
        if (t.status === "over") boards.reset(t);
        const free = t.seats.findIndex((s) => !s);
        if (free < 0) return;
        t.seats[free] = me;
        t.watchers.add(me.id);
        if (t.seats[0] && t.seats[1]) {
          t.status = "playing";
          t.game.since = Date.now();
        }
        publish(ctx, t);
        return;
      }
      case "move": {
        if (t.status !== "playing" || seat === -1) return;
        const g = t.game;
        if ((g.chess.turn() === "w" ? 0 : 1) !== seat) {
          ctx.send(view(t, me.id)); // not your turn: put their board back
          return;
        }
        const left = clocksNow(t)[g.chess.turn()];
        if (left <= 0) return finish(ctx, t, (1 - seat) as 0 | 1, "out of time");
        let move;
        try {
          move = g.chess.move({ from: String(d.from), to: String(d.to), promotion: typeof d.promotion === "string" ? d.promotion : "q" });
        } catch {
          ctx.send(view(t, me.id)); // illegal: put their board back
          return;
        }
        // Stop my clock, start theirs.
        g.clocks[move.color] = left;
        g.since = Date.now();
        g.lastMove = { from: move.from, to: move.to };
        g.drawOffer = null;
        if (g.chess.isCheckmate()) return finish(ctx, t, seat, "checkmate");
        if (g.chess.isStalemate()) return finish(ctx, t, null, "stalemate");
        if (g.chess.isInsufficientMaterial()) return finish(ctx, t, null, "insufficient material");
        if (g.chess.isThreefoldRepetition()) return finish(ctx, t, null, "threefold repetition");
        if (g.chess.isDraw()) return finish(ctx, t, null, "fifty-move rule");
        publish(ctx, t);
        return;
      }
      case "rematch": {
        // Both players still at the board after a game: play again with colours swapped.
        if (t.status !== "over" || seat === -1 || !t.seats[0] || !t.seats[1]) return;
        t.game.rematch[seat] = true;
        if (t.game.rematch[0] && t.game.rematch[1]) {
          const swapped: typeof t.seats = [t.seats[1], t.seats[0]];
          boards.reset(t);
          t.seats = swapped;
          t.status = "playing";
          t.game.since = Date.now();
        }
        publish(ctx, t);
        return;
      }
      case "resign":
        if (t.status === "playing" && seat !== -1) finish(ctx, t, (1 - seat) as 0 | 1, `${me.name} resigned`);
        return;
      case "draw":
        if (t.status !== "playing" || seat === -1) return;
        if (t.game.drawOffer !== null && t.game.drawOffer !== seat) return finish(ctx, t, null, "agreed");
        t.game.drawOffer = seat;
        publish(ctx, t);
        return;
    }
  },

  leave(ctx, playerId) {
    for (const t of boards.all()) {
      t.watchers.delete(playerId);
      const seat = boards.seatOf(t, playerId);
      if (seat !== -1) leaveSeat(ctx, t, seat);
    }
  },

  // Flag whoever runs out of time.
  tick(ctx) {
    for (const t of boards.all()) {
      if (t.status !== "playing") continue;
      const side = t.game.chess.turn();
      if (clocksNow(t)[side] <= 0) finish(ctx, t, side === "w" ? 1 : 0, "out of time");
    }
  },
};

/** Getting up: free seat before the game starts, forfeit during it. */
function leaveSeat(ctx: SystemContext, t: Table<ChessGame>, seat: 0 | 1) {
  if (t.status === "playing") {
    finish(ctx, t, (1 - seat) as 0 | 1, `${t.seats[seat]?.name ?? "opponent"} left`);
    return;
  }
  t.seats[seat] = null;
  if (t.status === "over" && !t.seats[0] && !t.seats[1]) boards.reset(t);
  publish(ctx, t);
}
