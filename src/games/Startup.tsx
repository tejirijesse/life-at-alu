// The startup competition at the Enterprise pitch stage: pitch your idea in a few lines, give your
// 3 votes to the best of the rest. The top pitch when the round ends wins the prize.

import { useEffect, useState } from "react";
import { COIN } from "../../shared/world";
import { net } from "../net";
import type { GameProps } from "./GameHost";

type Pitch = { id: string; name: string; oneLiner: string; problem: string; solution: string; byName: string; votes: number; mine: boolean; voted: boolean };
type Round = {
  open: boolean;
  endsIn: number | null;
  votesLeft: number;
  prize: number;
  pitched: boolean;
  lastWinner: { name: string; byName: string; votes: number; paid: number } | null;
  pitches: Pitch[];
};

const FIELDS = [
  { key: "name", label: "Startup name", max: 40 },
  { key: "oneLiner", label: "One-liner", max: 100 },
  { key: "problem", label: "The problem", max: 240 },
  { key: "solution", label: "Your solution", max: 240 },
] as const;

export default function Startup(_: GameProps) {
  const [r, setR] = useState<Round | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [form, setForm] = useState({ name: "", oneLiner: "", problem: "", solution: "" });
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const off = net.onGame("startup", (d) => {
      const data = d as { type: string; message?: string };
      if (data.type === "round") {
        setR(d as Round);
        setReceivedAt(Date.now());
        setError(null);
      }
      if (data.type === "error") setError(data.message ?? "Something went wrong.");
    });
    net.game("startup", { type: "open" });
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      net.game("startup", { type: "close" });
      off();
      clearInterval(t);
    };
  }, []);

  if (!r) return <div className="game-soon">Setting up the stage…</div>;
  const send = (data: Record<string, unknown>) => net.game("startup", data);
  const left = r.endsIn === null ? null : Math.max(0, r.endsIn - (now - receivedAt));
  const complete = FIELDS.every((f) => form[f.key].trim());

  return (
    <div className="qz">
      <p className="qz-host">
        {r.open && left !== null ? `Round ends in ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` : "No round running: the first pitch starts one (30 minutes)."} · Top pitch wins {r.prize} {COIN}
        {r.open && ` · ${r.votesLeft} vote${r.votesLeft === 1 ? "" : "s"} left`}
      </p>
      {r.lastWinner && (
        <p className="qz-note">
          Last round: <b>{r.lastWinner.name}</b> by {r.lastWinner.byName} won with {r.lastWinner.votes} vote{r.lastWinner.votes === 1 ? "" : "s"}
          {r.lastWinner.paid ? ` (+${r.lastWinner.paid} ${COIN})` : " (needs two pitches for the prize)"}.
        </p>
      )}

      {!r.pitched &&
        (writing ? (
          <form
            className="qz-builder"
            onSubmit={(e) => {
              e.preventDefault();
              send({ type: "pitch", ...form });
              setWriting(false);
            }}
          >
            {FIELDS.map((f) =>
              f.max > 100 ? (
                <textarea key={f.key} className="campus-name" maxLength={f.max} rows={3} placeholder={f.label} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              ) : (
                <input key={f.key} className="campus-name" maxLength={f.max} placeholder={f.label} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              ),
            )}
            <div className="ch-actions">
              <button type="button" className="ghost" onClick={() => setWriting(false)}>
                Cancel
              </button>
              <button type="submit" disabled={!complete}>
                Pitch it →
              </button>
            </div>
          </form>
        ) : (
          <div className="ch-actions">
            <button onClick={() => setWriting(true)}>Pitch your startup →</button>
          </div>
        ))}
      {error && <p className="ob-error">{error}</p>}

      {r.pitches.map((p, i) => (
        <section key={p.id} className="pv">
          <h3>
            {i === 0 && p.votes > 0 ? "🏆 " : ""}
            {p.name} <small>by {p.mine ? "you" : p.byName}</small>
          </h3>
          <p className="pv-line">{p.oneLiner}</p>
          <p className="campus-help">
            <b>Problem:</b> {p.problem}
          </p>
          <p className="campus-help">
            <b>Solution:</b> {p.solution}
          </p>
          <div className="ch-actions">
            <span>
              {p.votes} vote{p.votes === 1 ? "" : "s"}
            </span>
            {p.mine ? (
              <button className="ghost" onClick={() => send({ type: "remove", pitch: p.id })}>
                Withdraw
              </button>
            ) : (
              <button className={p.voted ? "" : "ghost"} disabled={!p.voted && r.votesLeft === 0} onClick={() => send({ type: "vote", pitch: p.id })}>
                {p.voted ? "✓ Voted (undo)" : "Vote"}
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
