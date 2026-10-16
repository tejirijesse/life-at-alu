// Progression: XP and levels, chess ratings, rivalries, exploring, and the leaderboards.
//
// XP comes from doing things on campus (games, quizzes, polls, pitches, exploring). Levels and
// titles come from XP (shared/levels.ts). Separate points feed the skill boards so wealth never
// buys a ranking: quiz points (Academic Titans), game points (Gaming Champions), and a chess
// rating where beating a stronger player is worth more than beating a beginner.

import { levelFor, titleFor } from "../shared/levels";
import type { Account, BoardId, Boards, Progress, RankRow, Tag } from "../shared/protocol";
import * as accounts from "./accounts";
import { store, type ProgressEvent, type Rivalry } from "./store";

const events: ProgressEvent[] = [];
const rivalries = new Map<string, Rivalry>();

/** Load saved events and rivalries at start-up. */
export function seed(ev: ProgressEvent[], rv: Rivalry[]) {
  events.push(...ev);
  for (const r of rv) rivalries.set(r.key, r);
}

export const progressOf = (a: Account): Progress => (a.progress ??= accounts.freshProgress());
export const levelOf = (a: Account) => levelFor(progressOf(a).xp);
export const tagOf = (a: Account): Tag => {
  const p = progressOf(a);
  const level = levelFor(p.xp);
  return { level, title: titleFor(level), chess: p.chess.games ? Math.round(p.chess.rating) : null };
};

// The server tells the right player (and everyone, for name tags) when progress changes.
type Notify = (a: Account, gained: number, reason: string, levelUp: boolean, tagChanged: boolean) => void;
let notify: Notify = () => {};
export const onProgress = (fn: Notify) => void (notify = fn);

type Award = { xp: number; quiz?: number; game?: number };

/** Give XP (and quiz or game points) for something done. */
export function award(email: string, kind: string, reason: string, { xp, quiz = 0, game = 0 }: Award, tagBefore?: Tag) {
  const a = accounts.get(email);
  if (!a || (xp <= 0 && quiz <= 0 && game <= 0)) return null;
  const p = progressOf(a);
  const before = tagBefore ?? tagOf(a);
  p.xp += Math.max(0, Math.round(xp));
  p.quizPoints += Math.max(0, Math.round(quiz));
  p.gamePoints += Math.max(0, Math.round(game));
  a.v++;
  accounts.persist(a);
  const e: ProgressEvent = { email, kind, xp: Math.round(xp), quiz: Math.round(quiz), game: Math.round(game), at: Date.now() };
  events.push(e);
  store.addEvent(e);
  const after = tagOf(a);
  notify(a, e.xp, reason, after.level > before.level, after.level !== before.level || after.chess !== before.chess);
  return a;
}

/** Solo games (basketball, penalties, archery) earn XP, capped per hour so they can't be farmed. */
const soloAwards = new Map<string, number[]>();
export const SOLO_XP_PER_HOUR = 10;
export function soloAward(email: string, kind: string, score: number) {
  const now = Date.now();
  const recent = (soloAwards.get(email) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= SOLO_XP_PER_HOUR || score <= 0) return null;
  soloAwards.set(email, [...recent, now]);
  return award(email, kind, `${kind} score ${score}`, { xp: 8 + Math.min(40, score * 2), game: Math.min(50, score) });
}

/**
 * XP for a social action (posting a poll, voting, pitching): once per key, and at most perDay of
 * that kind a day, so ending and re-posting the same poll doesn't farm XP.
 */
const given = new Set<string>();
const daily = new Map<string, number[]>();
export function awardOnce(email: string, key: string, kind: string, reason: string, amount: Award, perDay = 20) {
  const k = `${email}|${key}`;
  if (given.has(k)) return null;
  const now = Date.now();
  const dk = `${email}|${kind}`;
  const today = (daily.get(dk) ?? []).filter((t) => now - t < 86_400_000);
  if (today.length >= perDay) return null;
  given.add(k);
  daily.set(dk, [...today, now]);
  return award(email, kind, reason, amount);
}

// ---------- Exploring ----------

/** First visit to a named place on campus. */
export function visit(email: string, place: string) {
  const a = accounts.get(email);
  if (!a || !place) return;
  const p = progressOf(a);
  if (p.places.includes(place)) return;
  p.places.push(place);
  award(email, "explore", `found ${place}`, { xp: 15 });
}

// ---------- Chess ratings and rivalries ----------

const rivalryKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** Head-to-head record, from me's point of view. */
export function rivalryOf(me: string, them: string) {
  const r = rivalries.get(rivalryKey(me, them));
  if (!r) return { wins: 0, losses: 0, draws: 0, streak: 0, streakIsMine: false };
  const mineIsA = r.a === me;
  return { wins: mineIsA ? r.aWins : r.bWins, losses: mineIsA ? r.bWins : r.aWins, draws: r.draws, streak: r.streak, streakIsMine: r.last === me };
}

/**
 * A finished chess game. score is white's result: 1 win, 0.5 draw, 0 loss.
 * Elo with K = 40 for a player's first 10 games, 24 after, so new players find their level fast.
 */
export function chessResult(white: string, black: string, score: 1 | 0.5 | 0) {
  const w = accounts.get(white);
  const b = accounts.get(black);
  if (!w || !b || white === black) return null;
  const pw = progressOf(w).chess;
  const pb = progressOf(b).chess;
  const tagsBefore = [tagOf(w), tagOf(b)];
  const expected = 1 / (1 + Math.pow(10, (pb.rating - pw.rating) / 400));
  const k = (c: { games: number }) => (c.games < 10 ? 40 : 24);
  const dw = k(pw) * (score - expected);
  const db = k(pb) * (1 - score - (1 - expected));
  pw.rating = Math.max(100, pw.rating + dw);
  pb.rating = Math.max(100, pb.rating + db);
  pw.games++;
  pb.games++;
  if (score === 1) pw.wins++;
  if (score === 0) pb.wins++;

  // Rivalry record.
  const key = rivalryKey(white, black);
  const r = rivalries.get(key) ?? { key, a: white < black ? white : black, b: white < black ? black : white, aWins: 0, bWins: 0, draws: 0, last: null, streak: 0 };
  const winner = score === 1 ? white : score === 0 ? black : null;
  if (winner === null) {
    r.draws++;
    r.last = null;
    r.streak = 0;
  } else {
    if (winner === r.a) r.aWins++;
    else r.bWins++;
    r.streak = r.last === winner ? r.streak + 1 : 1;
    r.last = winner;
  }
  rivalries.set(key, r);
  store.saveRivalry(r);

  // XP and game points: more for a win, something for showing up. Upsets earn extra.
  const upset = (delta: number) => Math.max(0, Math.round(delta / 2));
  const xpFor = (s: number, delta: number) => (s === 1 ? 40 + upset(delta) : s === 0.5 ? 20 : 12);
  award(white, "chess", score === 1 ? "chess win" : score === 0.5 ? "chess draw" : "chess game", { xp: xpFor(score, dw), game: score * 30 }, tagsBefore[0]);
  award(black, "chess", score === 0 ? "chess win" : score === 0.5 ? "chess draw" : "chess game", { xp: xpFor(1 - score, db), game: (1 - score) * 30 }, tagsBefore[1]);
  return { white: { rating: Math.round(pw.rating), delta: Math.round(dw) }, black: { rating: Math.round(pb.rating), delta: Math.round(db) } };
}

// ---------- Leaderboards ----------

/** Monday 00:00 in Kigali (UTC+2), when the weekly boards reset. */
export function weekStart(now = Date.now()) {
  const kigali = new Date(now + 2 * 3_600_000);
  const day = (kigali.getUTCDay() + 6) % 7; // Monday = 0
  kigali.setUTCHours(0, 0, 0, 0);
  return kigali.getTime() - day * 86_400_000 - 2 * 3_600_000;
}

const TOP = 10;

export function ranks(email: string) {
  // Real players only: people who've made an avatar.
  const players = accounts.all().filter((a) => a.avatar);
  const since = weekStart();
  const week = new Map<string, { xp: number; quiz: number; game: number }>();
  for (const e of events) {
    if (e.at < since) continue;
    const w = week.get(e.email) ?? { xp: 0, quiz: 0, game: 0 };
    w.xp += e.xp;
    w.quiz += e.quiz;
    w.game += e.game;
    week.set(e.email, w);
  }
  const row = (a: Account, value: number): RankRow => {
    const t = tagOf(a);
    return { name: a.name, value: Math.round(value), level: t.level, title: t.title };
  };
  const board = (value: (a: Account) => number, minimum = 1) => {
    const sorted = players.map((a) => ({ a, v: value(a) })).filter((x) => x.v >= minimum).sort((x, y) => y.v - x.v);
    return { rows: sorted.slice(0, TOP).map((x) => row(x.a, x.v)), rankOf: (e: string) => { const i = sorted.findIndex((x) => x.a.email === e); return i < 0 ? null : i + 1; } };
  };
  const wk = (k: "xp" | "quiz" | "game") => (a: Account) => week.get(a.email)?.[k] ?? 0;
  const defs: Record<BoardId, { weekly: ReturnType<typeof board>; all: ReturnType<typeof board> }> = {
    legends: { weekly: board(wk("xp")), all: board((a) => progressOf(a).xp) },
    // Wealth is a balance, so it has no weekly version: both show the current balance.
    wealth: { weekly: board((a) => a.coins), all: board((a) => a.coins) },
    academic: { weekly: board(wk("quiz")), all: board((a) => progressOf(a).quizPoints) },
    gaming: { weekly: board(wk("game")), all: board((a) => progressOf(a).gamePoints) },
    // Chess: rated players only; the weekly view is the same ratings for now (seasons come later).
    chess: { weekly: board((a) => (progressOf(a).chess.games ? progressOf(a).chess.rating : 0)), all: board((a) => (progressOf(a).chess.games ? progressOf(a).chess.rating : 0)) },
  };
  const boards = {} as Boards;
  const you = {} as Record<BoardId, { weekly: number | null; all: number | null }>;
  for (const id of Object.keys(defs) as BoardId[]) {
    boards[id] = { weekly: defs[id].weekly.rows, all: defs[id].all.rows };
    you[id] = { weekly: defs[id].weekly.rankOf(email), all: defs[id].all.rankOf(email) };
  }
  return { boards, you, weekStarts: since };
}
