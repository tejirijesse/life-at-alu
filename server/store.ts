// Where accounts, progress events and rivalries are kept between restarts.
//
// With DATABASE_URL set (Supabase or any Postgres), they go to the database; the tables are
// created on first start. Without it (local development), they go to data/store.json.
//
// The server loads everything at start-up and works from memory; every change is written
// through here as it happens. That's plenty for a campus-sized pilot.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import type { Account } from "../shared/protocol";

/** Something that earned XP or points, for weekly leaderboards. */
export type ProgressEvent = { email: string; kind: string; xp: number; quiz: number; game: number; at: number };
export type Rivalry = { key: string; a: string; b: string; aWins: number; bWins: number; draws: number; last: string | null; streak: number };

export type Store = {
  name: string;
  load(): Promise<{ accounts: Account[]; events: ProgressEvent[]; rivalries: Rivalry[] }>;
  saveAccount(a: Account): void;
  addEvent(e: ProgressEvent): void;
  saveRivalry(r: Rivalry): void;
};

/** Events older than this aren't needed for weekly boards. */
const EVENT_DAYS = 35;

// ---------- File (local development) ----------

function fileStore(path = "data/store.json"): Store {
  let data = { accounts: {} as Record<string, Account>, events: [] as ProgressEvent[], rivalries: {} as Record<string, Rivalry> };
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    timer = null;
    mkdirSync("data", { recursive: true });
    writeFileSync(`${path}.tmp`, JSON.stringify(data));
    renameSync(`${path}.tmp`, path);
  };
  const soon = () => (timer ??= setTimeout(flush, 300));
  return {
    name: `file (${path})`,
    async load() {
      try {
        data = { ...data, ...JSON.parse(readFileSync(path, "utf8")) };
      } catch {}
      const cutoff = Date.now() - EVENT_DAYS * 86_400_000;
      data.events = data.events.filter((e) => e.at > cutoff);
      return { accounts: Object.values(data.accounts), events: data.events, rivalries: Object.values(data.rivalries) };
    },
    saveAccount(a) {
      data.accounts[a.email] = a;
      soon();
    },
    addEvent(e) {
      data.events.push(e);
      soon();
    },
    saveRivalry(r) {
      data.rivalries[r.key] = r;
      soon();
    },
  };
}

// ---------- Postgres (Supabase in production) ----------

function pgStore(url: string): Store {
  // Supabase's session pooler; prepare:false keeps it working on the transaction pooler too.
  const sql = postgres(url, { ssl: url.includes("localhost") ? false : "require", max: 4, prepare: false, idle_timeout: 30 });
  const report = (what: string) => (err: unknown) => console.error(`store: ${what} failed:`, err instanceof Error ? err.message : err);
  return {
    name: "postgres",
    async load() {
      await sql`create table if not exists accounts (email text primary key, data jsonb not null, updated_at timestamptz not null default now())`;
      await sql`create table if not exists progress_events (id bigserial primary key, email text not null, kind text not null, xp int not null, quiz int not null default 0, game int not null default 0, at timestamptz not null)`;
      await sql`create index if not exists progress_events_at on progress_events (at)`;
      await sql`create table if not exists rivalries (key text primary key, data jsonb not null)`;
      const accounts = await sql<{ data: Account }[]>`select data from accounts`;
      const events = await sql<{ email: string; kind: string; xp: number; quiz: number; game: number; at: Date }[]>`
        select email, kind, xp, quiz, game, at from progress_events where at > now() - make_interval(days => ${EVENT_DAYS})`;
      const rivalries = await sql<{ data: Rivalry }[]>`select data from rivalries`;
      return {
        accounts: accounts.map((r) => r.data),
        events: events.map((e) => ({ ...e, at: e.at.getTime() })),
        rivalries: rivalries.map((r) => r.data),
      };
    },
    saveAccount(a) {
      sql`insert into accounts (email, data, updated_at) values (${a.email}, ${sql.json(a as never)}, now())
          on conflict (email) do update set data = excluded.data, updated_at = now()`.catch(report("saving an account"));
    },
    addEvent(e) {
      sql`insert into progress_events (email, kind, xp, quiz, game, at) values (${e.email}, ${e.kind}, ${e.xp}, ${e.quiz}, ${e.game}, ${new Date(e.at)})`.catch(report("saving an event"));
    },
    saveRivalry(r) {
      sql`insert into rivalries (key, data) values (${r.key}, ${sql.json(r as never)})
          on conflict (key) do update set data = excluded.data`.catch(report("saving a rivalry"));
    },
  };
}

export const store: Store = process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : fileStore();
