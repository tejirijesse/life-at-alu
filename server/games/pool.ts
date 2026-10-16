// 8-ball pool at the Commons table. Two players pay a 20-coin entry; the winner takes the pot.
// The server owns the table: a player only sends the shot (angle, power, and where they put the
// cue ball if it's in hand). The server runs the physics itself (shared/pool.ts), applies the
// rules, and tells everyone the shot so their screens replay it exactly.
//
//   → open / close / sit (tables.ts)
//   → { type: "shot", table, angle, power, cue?: { x, y } }
//   ← { type: "state", table, ... }   ← { type: "shot", table, before, shot, n }   ← { type: "error", message }

import { canPlace, clone, judge, rack, remaining, simulate, W, H, type Ball, type Group, type Shot } from "../../shared/pool";
import { ZONES } from "../../shared/world";
import * as progress from "../progress";
import type { GameHandler, SystemContext } from "./index";
import { sendState, tables, type Table } from "./tables";

const ENTRY = 20;
const NO_SHOW_MS = 3 * 60_000;
const SHOT_CLOCK_MS = 60_000;

type PoolGame = {
  balls: Ball[];
  groups: [Group, Group];
  turn: 0 | 1;
  ballInHand: boolean;
  note: string;
  winner: 0 | 1 | null;
  /** Entry fees held for the winner. */
  pot: number;
  /** Who has paid in (so refunds go to the right people). */
  paid: [boolean, boolean];
  /** Shot counter, so clients know which replay is new. */
  n: number;
  shotStarted: number;
};

const fresh = (): PoolGame => ({ balls: rack(), groups: [null, null], turn: 0, ballInHand: false, note: "", winner: null, pot: 0, paid: [false, false], n: 0, shotStarted: 0 });
const tablesById = tables(fresh, (id) => ZONES.some((z) => z.game === "pool" && z.id === id));

function view(t: Table<PoolGame>, playerId: string) {
  const g = t.game;
  const seat = tablesById.seatOf(t, playerId);
  return {
    type: "state",
    table: t.id,
    players: t.seats.map((s, i) => (s ? { name: s.name, group: g.groups[i], left: g.groups[i] ? remaining(g.balls, g.groups[i]) : 7 } : null)),
    you: seat < 0 ? null : seat,
    balls: g.balls,
    turn: g.turn,
    ballInHand: g.ballInHand,
    note: g.note,
    status: t.status,
    winner: g.winner,
    pot: g.pot,
    entry: ENTRY,
    n: g.n,
    shotClock: t.status === "playing" ? Math.max(0, SHOT_CLOCK_MS - (Date.now() - g.shotStarted)) : null,
  };
}

const publish = (ctx: SystemContext, t: Table<PoolGame>) => sendState(ctx, tablesById.audience(t), (id) => view(t, id));

function win(ctx: SystemContext, t: Table<PoolGame>, seat: 0 | 1, why: string) {
  const g = t.game;
  g.winner = seat;
  g.note = `${t.seats[seat]?.name ?? "?"} wins: ${why}`;
  t.status = "over";
  const w = t.seats[seat];
  if (w && g.pot > 0) ctx.pay(g.pot, `pool win (${why})`, w.id);
  g.pot = 0;
  const l = t.seats[1 - seat];
  if (w && l && w.email !== l.email) {
    progress.award(w.email, "pool", "pool win", { xp: 30, game: 25 });
    progress.award(l.email, "pool", "pool game", { xp: 12 });
  }
  publish(ctx, t);
}

/** Give back the entry fee to whoever paid but never got a game. */
function refund(ctx: SystemContext, t: Table<PoolGame>, seat: 0 | 1) {
  const s = t.seats[seat];
  if (s && t.game.paid[seat]) {
    ctx.pay(ENTRY, "pool refund", s.id);
    t.game.pot -= ENTRY;
    t.game.paid[seat] = false;
  }
}

function leaveSeat(ctx: SystemContext, t: Table<PoolGame>, seat: 0 | 1) {
  if (t.status === "playing") return win(ctx, t, (1 - seat) as 0 | 1, `${t.seats[seat]?.name ?? "opponent"} left`);
  if (t.status === "waiting") refund(ctx, t, seat);
  t.seats[seat] = null;
  if (!t.seats[0] && !t.seats[1]) tablesById.reset(t);
  publish(ctx, t);
}

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

export const pool: GameHandler = {
  message(ctx, data) {
    const d = (data ?? {}) as { type?: string; table?: unknown; angle?: unknown; power?: unknown; cue?: { x?: unknown; y?: unknown } };
    const t = tablesById.get(d.table);
    if (!t) return;
    const me = ctx.player;
    const seat = tablesById.seatOf(t, me.id);
    const g = t.game;

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
        if (t.status === "over") tablesById.reset(t);
        const free = t.seats.findIndex((s) => !s) as -1 | 0 | 1;
        if (free === -1) return;
        if (!ctx.pay(-ENTRY, "pool entry")) {
          ctx.send({ type: "error", table: t.id, message: `You need ${ENTRY} coins to play.` });
          return;
        }
        t.seats[free] = me;
        t.game.paid[free] = true;
        t.game.pot += ENTRY;
        t.watchers.add(me.id);
        if (!t.since) t.since = Date.now();
        if (t.seats[0] && t.seats[1]) {
          t.status = "playing";
          g.turn = 0;
          g.note = `${t.seats[0].name} breaks`;
          g.shotStarted = Date.now();
        }
        publish(ctx, t);
        return;
      }
      case "shot": {
        if (t.status !== "playing" || seat !== g.turn) return;
        if (!finite(d.angle) || !finite(d.power)) return;
        const shot: Shot = { angle: d.angle as number, power: Math.max(0.05, Math.min(1, d.power as number)) };
        if (g.ballInHand && d.cue && finite(d.cue.x) && finite(d.cue.y)) {
          const x = d.cue.x as number;
          const y = d.cue.y as number;
          if (!canPlace(g.balls, x, y)) {
            ctx.send({ type: "error", table: t.id, message: "The cue ball can't go there." });
            return;
          }
          shot.cue = { x, y };
        }
        const before = clone(g.balls);
        // A cue ball that went down last time comes back to the head spot unless placed.
        const cue = before.find((b) => b.id === 0)!;
        if (cue.down && !shot.cue) shot.cue = { x: W * 0.25, y: H / 2 };
        const result = simulate(before, shot);
        const verdict = judge(before, result, { groups: g.groups, turn: g.turn });
        g.n++;
        ctx.broadcast({ type: "shot", table: t.id, before, shot, n: g.n }, (p) => tablesById.audience(t).has(p.id));
        g.balls = result.balls;
        g.groups = verdict.groups;
        g.note = verdict.note;
        if (verdict.winner !== null) return win(ctx, t, verdict.winner, verdict.note);
        g.turn = verdict.turn;
        g.ballInHand = verdict.ballInHand;
        g.shotStarted = Date.now();
        publish(ctx, t);
        return;
      }
    }
  },

  leave(ctx, playerId) {
    for (const t of tablesById.all()) {
      t.watchers.delete(playerId);
      const seat = tablesById.seatOf(t, playerId);
      if (seat !== -1) leaveSeat(ctx, t, seat);
    }
  },

  tick(ctx) {
    const now = Date.now();
    for (const t of tablesById.all()) {
      const g = t.game;
      // Nobody came to play: refund and free the table.
      if (t.status === "waiting" && t.since && now - t.since > NO_SHOW_MS) {
        for (const seat of [0, 1] as const) refund(ctx, t, seat);
        const ids = tablesById.audience(t);
        tablesById.reset(t);
        sendState(ctx, ids, (id) => ({ ...view(t, id), note: "No opponent came, so your entry was refunded." }));
      }
      // Took too long: the turn passes with ball in hand.
      if (t.status === "playing" && now - g.shotStarted > SHOT_CLOCK_MS) {
        g.note = `${t.seats[g.turn]?.name ?? "Player"} ran out of time: ball in hand`;
        g.turn = (1 - g.turn) as 0 | 1;
        g.ballInHand = true;
        g.shotStarted = now;
        publish(ctx, t);
      }
    }
  },
};
