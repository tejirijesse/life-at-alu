// The startup competition at the Enterprise pitch stage. A round opens with the first pitch and
// runs for 30 minutes. Everyone may submit one pitch per round and gets 3 votes (one per pitch,
// never their own; they can take a vote back). When the round ends, the pitch with the most votes
// wins 100 coins, if at least two pitches competed and the winner got a vote.
//
//   → open / close   → { type: "pitch", name, oneLiner, problem, solution }
//   → { type: "vote", pitch } (toggles)   → { type: "remove", pitch }
//   ← { type: "round", ... }   ← { type: "error", message }

import * as progress from "../progress";
import type { GameHandler, SystemContext } from "./index";
import { cleanText, shortId } from "./text";

// STARTUP_ROUND_MS shortens rounds for testing.
const ROUND_MS = Number(process.env.STARTUP_ROUND_MS) || 30 * 60_000;
const VOTES = 3;
const PRIZE = 100;
/** Name + one-liner + problem + solution, about 600 characters in all. */
const LIMITS = { name: 40, oneLiner: 100, problem: 240, solution: 240 };

type Pitch = { id: string; name: string; oneLiner: string; problem: string; solution: string; by: string; byName: string; byId: string; at: number; votes: Set<string> };

const round = { endsAt: 0, pitches: [] as Pitch[] };
let lastWinner: { name: string; byName: string; votes: number; paid: number } | null = null;
const watchers = new Set<string>();

const votesUsed = (email: string) => round.pitches.filter((p) => p.votes.has(email)).length;

function view(email: string) {
  return {
    type: "round",
    open: round.endsAt > 0,
    endsIn: round.endsAt ? Math.max(0, round.endsAt - Date.now()) : null,
    votesLeft: VOTES - votesUsed(email),
    prize: PRIZE,
    pitched: round.pitches.some((p) => p.by === email),
    lastWinner,
    pitches: [...round.pitches]
      .sort((a, b) => b.votes.size - a.votes.size || a.at - b.at)
      .map((p) => ({ id: p.id, name: p.name, oneLiner: p.oneLiner, problem: p.problem, solution: p.solution, byName: p.byName, votes: p.votes.size, mine: p.by === email, voted: p.votes.has(email) })),
  };
}

function publish(ctx: SystemContext) {
  for (const p of ctx.players()) if (watchers.has(p.id)) ctx.send(view(p.email), p.id);
}

function endRound(ctx: SystemContext) {
  const ranked = [...round.pitches].sort((a, b) => b.votes.size - a.votes.size || a.at - b.at);
  const top = ranked[0];
  if (top && top.votes.size > 0) {
    const eligible = ranked.length >= 2;
    const paid = eligible && ctx.pay(PRIZE, `startup competition: ${top.name}`, top.byId) ? PRIZE : 0;
    if (eligible) progress.award(top.by, "startup", `won the startup competition`, { xp: 100, game: 40 });
    lastWinner = { name: top.name, byName: top.byName, votes: top.votes.size, paid };
  } else lastWinner = null;
  round.endsAt = 0;
  round.pitches = [];
  publish(ctx);
}

export const startup: GameHandler = {
  message(ctx, data) {
    const d = (data ?? {}) as Record<string, unknown>;
    const me = ctx.player;
    // Came back on a new connection? Winnings go to wherever you are now.
    for (const p of round.pitches) if (p.by === me.email) p.byId = me.id;
    const target = round.pitches.find((p) => p.id === d.pitch);
    switch (d.type) {
      case "open":
        watchers.add(me.id);
        ctx.send(view(me.email));
        return;
      case "close":
        watchers.delete(me.id);
        return;
      case "pitch": {
        if (round.pitches.some((p) => p.by === me.email)) return ctx.send({ type: "error", message: "You've already pitched this round." });
        const pitch = {
          name: cleanText(d.name, LIMITS.name),
          oneLiner: cleanText(d.oneLiner, LIMITS.oneLiner),
          problem: cleanText(d.problem, LIMITS.problem),
          solution: cleanText(d.solution, LIMITS.solution),
        };
        if (!pitch.name || !pitch.oneLiner || !pitch.problem || !pitch.solution) return ctx.send({ type: "error", message: "Fill in the name, one-liner, problem and solution." });
        if (!round.endsAt) round.endsAt = Date.now() + ROUND_MS;
        progress.awardOnce(me.email, `pitch:${round.endsAt}`, "pitch", "pitched a startup", { xp: 20 }, 4);
        round.pitches.push({ ...pitch, id: shortId(), by: me.email, byName: me.name, byId: me.id, at: Date.now(), votes: new Set() });
        publish(ctx);
        return;
      }
      case "vote": {
        if (!target) return;
        if (target.by === me.email) return ctx.send({ type: "error", message: "You can't vote for your own pitch." });
        if (target.votes.has(me.email)) target.votes.delete(me.email);
        else if (votesUsed(me.email) >= VOTES) return ctx.send({ type: "error", message: `You've used all ${VOTES} votes. Take one back to move it.` });
        else {
          target.votes.add(me.email);
          progress.awardOnce(me.email, `pvote:${target.id}`, "vote", "backed a startup", { xp: 5 });
        }
        publish(ctx);
        return;
      }
      case "remove":
        if (target && target.by === me.email) {
          round.pitches.splice(round.pitches.indexOf(target), 1);
          if (!round.pitches.length) round.endsAt = 0;
          publish(ctx);
        }
        return;
    }
  },

  leave(_ctx, playerId) {
    watchers.delete(playerId);
    // Keep their pitch; if they come back, the next message or the payout finds them again.
    for (const p of round.pitches) if (p.byId === playerId) p.byId = "";
  },

  tick(ctx) {
    if (round.endsAt && Date.now() >= round.endsAt) {
      // If the winner left and came back, find their new connection.
      for (const p of round.pitches) if (!p.byId) p.byId = ctx.players().find((x) => x.email === p.by)?.id ?? "";
      endRound(ctx);
    }
  },
};
