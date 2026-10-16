// Campus polls at the notice board: ask a question, everyone votes, results update live.

import { useEffect, useState } from "react";
import { net } from "../net";
import type { GameProps } from "./GameHost";

type PollView = {
  id: string;
  question: string;
  options: string[];
  counts: number[];
  total: number;
  mine: number | null;
  byName: string;
  yours: boolean;
  closed: boolean;
  closesIn: number;
};

export default function Poll(_: GameProps) {
  const [polls, setPolls] = useState<PollView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  useEffect(() => {
    const off = net.onGame("poll", (d) => {
      const data = d as { type: string; polls?: PollView[]; message?: string };
      if (data.type === "polls") {
        setPolls(data.polls ?? []);
        setError(null);
      }
      if (data.type === "error") setError(data.message ?? "Something went wrong.");
    });
    net.game("poll", { type: "open" });
    return () => {
      net.game("poll", { type: "close" });
      off();
    };
  }, []);

  if (!polls) return <div className="game-soon">Reading the notice board…</div>;
  const send = (data: Record<string, unknown>) => net.game("poll", data);
  const filled = options.filter((o) => o.trim());

  return (
    <div className="qz">
      {asking ? (
        <form
          className="qz-builder"
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: "post", question, options: filled });
            setAsking(false);
            setQuestion("");
            setOptions(["", ""]);
          }}
        >
          <input className="campus-name" maxLength={140} placeholder="Your question" value={question} onChange={(e) => setQuestion(e.target.value)} />
          {options.map((o, i) => (
            <input key={i} className="campus-name" maxLength={50} placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setOptions(options.map((v, k) => (k === i ? e.target.value : v)))} />
          ))}
          <p className="campus-help">Polls stay open for 10 minutes. One open poll per person.</p>
          <div className="ch-actions">
            {options.length < 4 && (
              <button type="button" className="ghost" onClick={() => setOptions([...options, ""])}>
                Add an option
              </button>
            )}
            <button type="button" className="ghost" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button type="submit" disabled={!question.trim() || filled.length < 2}>
              Post the poll →
            </button>
          </div>
        </form>
      ) : (
        <div className="ch-actions">
          <button onClick={() => setAsking(true)}>Ask the campus →</button>
        </div>
      )}
      {error && <p className="ob-error">{error}</p>}
      {!polls.length && <p className="game-soon">No polls yet. Ask the first one.</p>}
      {polls.map((p) => (
        <section key={p.id} className={`pv${p.closed ? " closed" : ""}`}>
          <h3>{p.question}</h3>
          <p className="campus-help">
            by {p.yours ? "you" : p.byName} · {p.total} vote{p.total === 1 ? "" : "s"} · {p.closed ? "closed" : `closes in ${Math.ceil(p.closesIn / 60000)} min`}
          </p>
          {p.options.map((o, i) => {
            const pct = p.total ? Math.round((p.counts[i] / p.total) * 100) : 0;
            return (
              <button key={i} className={`pv-opt${p.mine === i ? " mine" : ""}`} disabled={p.closed} onClick={() => send({ type: "vote", poll: p.id, option: i })}>
                <span className="pv-bar" style={{ width: `${pct}%` }} />
                <span className="pv-label">
                  {p.mine === i ? "✓ " : ""}
                  {o}
                </span>
                <b>{pct}%</b>
              </button>
            );
          })}
          {p.yours && (
            <div className="ch-actions">
              {!p.closed && (
                <button className="ghost" onClick={() => send({ type: "end", poll: p.id })}>
                  End poll
                </button>
              )}
              <button className="ghost" onClick={() => send({ type: "remove", poll: p.id })}>
                Remove
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
