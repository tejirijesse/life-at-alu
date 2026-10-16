// Shared handler for solo skill games (basketball, penalties, archery): the browser plays the
// game and reports a score; the server keeps the leaderboard and pays a capped reward.
//
//   → { type: "result", score }        ← { type: "paid", score, coins, best }
//   → { type: "leaderboard" }          ← { type: "leaderboard", top: [{ name, score }] }

import * as progress from "../progress";
import type { GameHandler } from "./index";

const MAX_SCORE = 200;

export function soloGame(id: string, reward: (score: number) => number): GameHandler {
  // Best score per player, kept in memory (resets when the server restarts).
  const best = new Map<string, { name: string; score: number }>();
  const top = () =>
    [...best.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ name, score }) => ({ name, score }));

  return {
    message(ctx, data) {
      const d = (data ?? {}) as { type?: string; score?: unknown };
      if (d.type === "leaderboard") {
        ctx.send({ type: "leaderboard", top: top() });
        return;
      }
      if (d.type !== "result") return;
      const score = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(d.score) || 0)));
      const prev = best.get(ctx.player.email);
      if (!prev || score > prev.score) best.set(ctx.player.email, { name: ctx.player.name, score });
      const coins = score > 0 ? ctx.soloPayout(reward(score), `${id} score ${score}`) : 0;
      progress.soloAward(ctx.player.email, id, score);
      ctx.send({ type: "paid", score, coins, best: Math.max(score, prev?.score ?? 0) });
      ctx.broadcast({ type: "leaderboard", top: top() });
    },
  };
}
