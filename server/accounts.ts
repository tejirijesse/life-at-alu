// Accounts, sign-in codes and the wallet.
//
// Demo mode (DEMO_CODES on, the default): codes are shown on screen instead of emailed, and there
// is no database. Accounts live in memory, and each browser keeps a signed copy (a token) that it
// hands back when it reconnects, so a restart forgets nobody who comes back on the same device.
// The signature means a browser can't edit its own coins: change one byte and the token is refused.

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cleanAvatar } from "../shared/avatar";
import type { Account } from "../shared/protocol";
import { emailAllowed, MAX_SOLO_PAYOUT, MAX_SOLO_PAYOUTS_PER_HOUR, STARTING_COINS, STARTS } from "../shared/world";

export const DEMO_CODES = process.env.DEMO_CODES !== "0";

const SECRET =
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : "dev-only-secret-not-for-production") ||
  randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) console.warn("SESSION_SECRET is not set: saved sign-ins won't survive a restart in production.");

const CODE_TTL_MS = 10 * 60_000;
const CODE_GAP_MS = 30_000;
const MAX_ATTEMPTS = 5;

const accounts = new Map<string, Account>();
const codes = new Map<string, { code: string; expires: number; attempts: number; sent: number; name?: string }>();
const soloPayouts = new Map<string, number[]>();

const b64 = (b: Buffer) => b.toString("base64url");
const sign = (body: string) => b64(createHmac("sha256", SECRET).update(body).digest());

export function tokenFor(a: Account) {
  const body = b64(Buffer.from(JSON.stringify(a)));
  return `${body}.${sign(body)}`;
}

function readToken(token: unknown): Account | null {
  if (typeof token !== "string" || token.length > 4000) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as Account;
  } catch {
    return null;
  }
}

export const get = (email: string) => accounts.get(email);

export const normaliseEmail = (e: unknown) => String(e ?? "").trim().toLowerCase().slice(0, 120);

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/** Step 1: a code for this email. With a name it's a sign-up; without, a log-in. */
export function startCode(rawEmail: unknown, rawName?: unknown): Result<{ email: string; code: string; isNew: boolean }> {
  const email = normaliseEmail(rawEmail);
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { ok: false, message: "That doesn't look like an email address." };
  if (!emailAllowed(email)) return { ok: false, message: "Use your ALU email (@alustudent.com or @alueducation.com)." };
  const name = rawName === undefined ? undefined : cleanName(rawName);
  if (rawName !== undefined && !name) return { ok: false, message: "Add your name to sign up." };
  const exists = accounts.has(email);
  if (name === undefined && !exists) return { ok: false, message: "No account for that email yet. Sign up first." };
  const prev = codes.get(email);
  if (prev && Date.now() - prev.sent < CODE_GAP_MS) return { ok: false, message: "A code was just sent. Wait a few seconds and try again." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  codes.set(email, { code, expires: Date.now() + CODE_TTL_MS, attempts: 0, sent: Date.now(), name });
  return { ok: true, value: { email, code, isNew: !exists } };
}

/** Step 2: the code they typed. Creates the account on first sign-up. */
export function verifyCode(rawEmail: unknown, rawCode: unknown): Result<{ account: Account; isNew: boolean }> {
  const email = normaliseEmail(rawEmail);
  const entry = codes.get(email);
  if (!entry || Date.now() > entry.expires) return { ok: false, message: "That code has expired. Ask for a new one." };
  if (++entry.attempts > MAX_ATTEMPTS) {
    codes.delete(email);
    return { ok: false, message: "Too many tries. Ask for a new code." };
  }
  if (String(rawCode ?? "").trim() !== entry.code) return { ok: false, message: "That code isn't right. Check it and try again." };
  codes.delete(email);
  let account = accounts.get(email);
  const isNew = !account;
  if (!account) {
    account = { email, name: entry.name ?? email.split("@")[0], avatar: null, start: null, coins: STARTING_COINS, createdAt: Date.now(), v: 1 };
    accounts.set(email, account);
  }
  return { ok: true, value: { account, isNew } };
}

/** Coming back on the same device: trust the signed copy, unless the server has a newer one. */
export function resume(token: unknown): Account | null {
  const fromToken = readToken(token);
  if (!fromToken || !emailAllowed(fromToken.email)) return null;
  const known = accounts.get(fromToken.email);
  if (known && known.v >= fromToken.v) return known;
  accounts.set(fromToken.email, fromToken);
  return fromToken;
}

export function saveProfile(email: string, rawAvatar: unknown, rawStart: unknown): Account | null {
  const a = accounts.get(email);
  if (!a) return null;
  a.avatar = cleanAvatar(rawAvatar);
  a.start = STARTS.some((s) => s.id === rawStart) ? String(rawStart) : STARTS[1].id;
  a.v++;
  return a;
}

/** Add (or, if negative, take) coins. Refuses to go below zero. */
export function pay(email: string, delta: number, _reason: string): Account | null {
  const a = accounts.get(email);
  if (!a || !Number.isFinite(delta)) return null;
  const amount = Math.round(delta);
  if (a.coins + amount < 0) return null;
  a.coins += amount;
  a.v++;
  return a;
}

/** Winnings from a solo game, capped per game and per hour so they can't be farmed. */
export function soloPayout(email: string, requested: number): number {
  const now = Date.now();
  const recent = (soloPayouts.get(email) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= MAX_SOLO_PAYOUTS_PER_HOUR) return 0;
  const amount = Math.max(0, Math.min(MAX_SOLO_PAYOUT, Math.round(requested)));
  if (amount > 0) soloPayouts.set(email, [...recent, now]);
  return amount;
}

export const cleanName = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .slice(0, 20);
