// Campus polls at the notice board. Anyone can post a question with 2–4 options; one vote per
// account (you can change it while the poll is open); live results. A poll closes after 10
// minutes, or when its creator ends it. One open poll per person; creators can remove theirs.
//
//   → open / close   → { type: "post", question, options }   → { type: "vote", poll, option }
//   → { type: "end", poll }   → { type: "remove", poll }
//   ← { type: "polls", polls: [...] }   ← { type: "error", message }

import type { GameHandler, SystemContext } from "./index";
import { cleanText, shortId } from "./text";

const OPEN_MS = 10 * 60_000;
const SHOWN = 5;
const KEEP = 30;

type Poll = { id: string; question: string; options: string[]; votes: Map<string, number>; by: string; byName: string; at: number; closesAt: number; closed: boolean };

const polls: Poll[] = [];
const watchers = new Set<string>();

/** The latest polls as one person sees them (with their own vote marked). */
function list(email: string) {
  const recent = [...polls].sort((a, b) => Number(a.closed) - Number(b.closed) || b.at - a.at).slice(0, SHOWN);
  return {
    type: "polls",
    polls: recent.map((p) => {
      const counts = p.options.map((_, i) => [...p.votes.values()].filter((v) => v === i).length);
      return {
        id: p.id,
        question: p.question,
        options: p.options,
        counts,
        total: p.votes.size,
        mine: p.votes.get(email) ?? null,
        byName: p.byName,
        yours: p.by === email,
        closed: p.closed,
        closesIn: p.closed ? 0 : Math.max(0, p.closesAt - Date.now()),
      };
    }),
  };
}

function publish(ctx: SystemContext) {
  for (const p of ctx.players()) if (watchers.has(p.id)) ctx.send(list(p.email), p.id);
}

export const poll: GameHandler = {
  message(ctx, data) {
    const d = (data ?? {}) as { type?: string; question?: unknown; options?: unknown; poll?: unknown; option?: unknown };
    const me = ctx.player;
    const target = polls.find((p) => p.id === d.poll);
    switch (d.type) {
      case "open":
        watchers.add(me.id);
        ctx.send(list(me.email));
        return;
      case "close":
        watchers.delete(me.id);
        return;
      case "post": {
        if (polls.some((p) => p.by === me.email && !p.closed)) return ctx.send({ type: "error", message: "You already have a poll open. End it first." });
        const question = cleanText(d.question, 140);
        const options = (Array.isArray(d.options) ? d.options : [])
          .map((o) => cleanText(o, 50))
          .filter(Boolean)
          .slice(0, 4);
        if (!question || options.length < 2) return ctx.send({ type: "error", message: "Add a question and at least two options." });
        if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return ctx.send({ type: "error", message: "Each option needs to be different." });
        const now = Date.now();
        polls.push({ id: shortId(), question, options, votes: new Map(), by: me.email, byName: me.name, at: now, closesAt: now + OPEN_MS, closed: false });
        if (polls.length > KEEP) polls.splice(0, polls.length - KEEP);
        publish(ctx);
        return;
      }
      case "vote": {
        const option = Number(d.option);
        if (!target || target.closed || !Number.isInteger(option) || option < 0 || option >= target.options.length) return;
        target.votes.set(me.email, option);
        publish(ctx);
        return;
      }
      case "end":
        if (target && target.by === me.email && !target.closed) {
          target.closed = true;
          publish(ctx);
        }
        return;
      case "remove":
        if (target && target.by === me.email) {
          polls.splice(polls.indexOf(target), 1);
          publish(ctx);
        }
        return;
    }
  },

  leave(_ctx, playerId) {
    watchers.delete(playerId);
  },

  tick(ctx) {
    const now = Date.now();
    let changed = false;
    for (const p of polls)
      if (!p.closed && now >= p.closesAt) {
        p.closed = true;
        changed = true;
      }
    if (changed) publish(ctx);
  },
};
