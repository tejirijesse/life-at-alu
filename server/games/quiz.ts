// ALU Quiz Night, Kahoot-style, in the library. Anyone there can host: pick a built-in set
// (quiz-sets.ts) or write their own questions. Players join with the PIN on the library
// screen. The server times every question (20 s); a right answer scores 500 plus up to 500 for
// speed. A leaderboard after each question, a podium at the end. With a built-in set and at
// least two players, the top three get 50 / 30 / 20 coins (the host doesn't play, and custom
// quizzes are just for fun, so nobody can farm coins with questions they wrote).
//
//   → open / close (watch)        → { type: "host", set } | { type: "host", custom: Question[] }
//   → { type: "join", pin }       → { type: "start" } / { type: "next" } / { type: "end" } (host)
//   → { type: "answer", choice }
//   ← { type: "state", ... } to people with the quiz open    ← { type: "screen", ... } to everyone

import { ZONES } from "../../shared/world";
import type { GameHandler, GamePlayer, SystemContext } from "./index";
import { SETS, type Question } from "./quiz-sets";
import { cleanText } from "./text";

const ROOM = ZONES.find((z) => z.game === "quiz")!.id;
const QUESTION_MS = 20_000;
const REVEAL_MS = 7_000;
const PRIZES = [50, 30, 20];
const MAX_CUSTOM = 10;
const LOBBY_IDLE_MS = 15 * 60_000;

type Phase = "idle" | "lobby" | "question" | "reveal" | "podium";
type Player = { id: string; name: string; score: number; answer: { choice: number; at: number } | null; last: number };

const q = {
  phase: "idle" as Phase,
  host: null as GamePlayer | null,
  pin: "",
  title: "",
  builtIn: false,
  questions: [] as Question[],
  index: -1,
  /** When the current question or reveal ends. */
  until: 0,
  started: 0,
  players: new Map<string, Player>(),
  watchers: new Set<string>(),
  paid: [] as { name: string; coins: number }[],
  hostedAt: 0,
};

const ranking = () =>
  [...q.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ name: p.name, score: p.score, last: p.last }));

function view(id: string) {
  const isHost = q.host?.id === id;
  const me = q.players.get(id);
  const question = q.questions[q.index];
  const showQuestion = q.phase === "question" || q.phase === "reveal";
  return {
    type: "state",
    phase: q.phase,
    host: q.host ? { name: q.host.name } : null,
    isHost,
    joined: !!me,
    // Only the host and joined players see the PIN in the game window; everyone sees it on the screen.
    pin: isHost || me ? q.pin : null,
    title: q.title,
    sets: SETS.map((s) => ({ id: s.id, title: s.title, count: s.questions.length })),
    players: [...q.players.values()].map((p) => p.name),
    index: q.index,
    total: q.questions.length,
    question: showQuestion ? { q: question.q, options: question.options } : null,
    correct: q.phase === "reveal" ? question.answer : null,
    msLeft: q.phase === "question" || q.phase === "reveal" ? Math.max(0, q.until - Date.now()) : null,
    answered: [...q.players.values()].filter((p) => p.answer).length,
    you: me ? { score: me.score, choice: me.answer?.choice ?? null, last: me.last } : null,
    leaderboard: q.phase === "reveal" || q.phase === "podium" ? ranking().slice(0, 5) : [],
    paid: q.phase === "podium" ? q.paid : [],
    prizes: q.builtIn ? PRIZES : null,
  };
}

/** Everyone with the quiz open (watchers, players, host) gets their own view; everyone on campus gets the screen. */
function publish(ctx: SystemContext) {
  const ids = new Set(q.watchers);
  for (const id of q.players.keys()) ids.add(id);
  if (q.host) ids.add(q.host.id);
  for (const id of ids) ctx.send(view(id), id);
  ctx.broadcast({ type: "screen", phase: q.phase, pin: q.phase === "lobby" ? q.pin : null, title: q.title, index: q.index, total: q.questions.length });
}

function reset() {
  q.phase = "idle";
  q.host = null;
  q.pin = "";
  q.title = "";
  q.questions = [];
  q.index = -1;
  q.players.clear();
  q.paid = [];
}

function ask(ctx: SystemContext, i: number) {
  q.index = i;
  q.phase = "question";
  q.started = Date.now();
  q.until = q.started + QUESTION_MS;
  for (const p of q.players.values()) {
    p.answer = null;
    p.last = 0;
  }
  publish(ctx);
}

function reveal(ctx: SystemContext) {
  const right = q.questions[q.index].answer;
  for (const p of q.players.values()) {
    if (p.answer && p.answer.choice === right) {
      const speed = 1 - Math.min(1, (p.answer.at - q.started) / QUESTION_MS);
      p.last = 500 + Math.round(500 * speed);
      p.score += p.last;
    }
  }
  q.phase = "reveal";
  q.until = Date.now() + REVEAL_MS;
  publish(ctx);
}

function podium(ctx: SystemContext) {
  q.phase = "podium";
  q.paid = [];
  const ranked = [...q.players.values()].sort((a, b) => b.score - a.score);
  if (q.builtIn && ranked.length >= 2)
    ranked.slice(0, PRIZES.length).forEach((p, i) => {
      if (p.score > 0 && ctx.pay(PRIZES[i], `quiz night #${i + 1}`, p.id)) q.paid.push({ name: p.name, coins: PRIZES[i] });
    });
  publish(ctx);
}

const advance = (ctx: SystemContext) => (q.index + 1 < q.questions.length ? ask(ctx, q.index + 1) : podium(ctx));

/** A question written by the host, checked and cleaned. */
function cleanQuestion(raw: unknown): Question | null {
  const r = (raw ?? {}) as { q?: unknown; options?: unknown; answer?: unknown };
  const text = cleanText(r.q, 160);
  const options = Array.isArray(r.options) ? r.options.slice(0, 4).map((o) => cleanText(o, 60)) : [];
  const answer = Number(r.answer);
  if (!text || options.length !== 4 || options.some((o) => !o) || ![0, 1, 2, 3].includes(answer)) return null;
  return { q: text, options: options as Question["options"], answer: answer as Question["answer"] };
}

export const quiz: GameHandler = {
  message(ctx, data) {
    const d = (data ?? {}) as { type?: string; set?: unknown; custom?: unknown; pin?: unknown; choice?: unknown };
    const me = ctx.player;
    const isHost = q.host?.id === me.id;
    switch (d.type) {
      case "open":
        q.watchers.add(me.id);
        ctx.send(view(me.id));
        return;
      case "close":
        q.watchers.delete(me.id);
        return;
      case "host": {
        if (q.phase !== "idle" && q.phase !== "podium") return ctx.send({ type: "error", message: `${q.host?.name ?? "Someone"} is already hosting.` });
        let questions: Question[] = [];
        let title = "";
        let builtIn = false;
        if (typeof d.set === "string") {
          const set = SETS.find((s) => s.id === d.set);
          if (!set) return;
          questions = set.questions;
          title = set.title;
          builtIn = true;
        } else if (Array.isArray(d.custom)) {
          questions = d.custom.slice(0, MAX_CUSTOM).map(cleanQuestion).filter((x): x is Question => !!x);
          title = `${me.name}'s quiz`;
          if (!questions.length) return ctx.send({ type: "error", message: "Add at least one complete question: text, four answers, and the right one picked." });
        } else return;
        reset();
        q.phase = "lobby";
        q.host = me;
        q.pin = String(1000 + Math.floor(Math.random() * 9000));
        q.title = title;
        q.builtIn = builtIn;
        q.questions = questions;
        q.hostedAt = Date.now();
        q.watchers.add(me.id);
        publish(ctx);
        return;
      }
      case "join":
        if (q.phase !== "lobby" && q.phase !== "question" && q.phase !== "reveal") return;
        if (isHost) return;
        if (String(d.pin ?? "").trim() !== q.pin) return ctx.send({ type: "error", message: "That PIN isn't right. It's on the library screen." });
        if (!q.players.has(me.id)) q.players.set(me.id, { id: me.id, name: me.name, score: 0, answer: null, last: 0 });
        publish(ctx);
        return;
      case "start":
        if (isHost && q.phase === "lobby") ask(ctx, 0);
        return;
      case "next":
        if (isHost && q.phase === "reveal") advance(ctx);
        else if (isHost && q.phase === "question") reveal(ctx);
        return;
      case "end":
        if (isHost) {
          reset();
          publish(ctx);
        }
        return;
      case "answer": {
        const p = q.players.get(me.id);
        const choice = Number(d.choice);
        if (!p || q.phase !== "question" || p.answer || ![0, 1, 2, 3].includes(choice)) return;
        p.answer = { choice, at: Date.now() };
        // Everyone's in: no need to wait for the clock.
        if ([...q.players.values()].every((x) => x.answer)) reveal(ctx);
        else publish(ctx);
        return;
      }
    }
  },

  leave(ctx, playerId) {
    q.watchers.delete(playerId);
    const wasPlaying = q.players.delete(playerId);
    const wasHost = q.host?.id === playerId;
    if (wasHost) reset();
    if (wasPlaying || wasHost) publish(ctx);
  },

  tick(ctx) {
    const now = Date.now();
    if (q.phase === "question" && now >= q.until) reveal(ctx);
    else if (q.phase === "reveal" && now >= q.until) advance(ctx);
    else if (q.phase === "lobby" && now - q.hostedAt > LOBBY_IDLE_MS) {
      reset();
      publish(ctx);
    }
  },
};
