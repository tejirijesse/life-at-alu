// ALU Quiz Night in the library. Host a built-in set or your own questions; everyone else joins
// with the PIN on the library screen and answers on their own phone or laptop.

import { useEffect, useState } from "react";
import { COIN } from "../../shared/world";
import { net } from "../net";
import type { GameProps } from "./GameHost";

type QuizState = {
  phase: "idle" | "lobby" | "question" | "reveal" | "podium";
  host: { name: string } | null;
  isHost: boolean;
  joined: boolean;
  pin: string | null;
  title: string;
  sets: { id: string; title: string; count: number }[];
  players: string[];
  index: number;
  total: number;
  question: { q: string; options: string[] } | null;
  correct: number | null;
  msLeft: number | null;
  answered: number;
  you: { score: number; choice: number | null; last: number } | null;
  leaderboard: { name: string; score: number; last: number }[];
  paid: { name: string; coins: number }[];
  prizes: number[] | null;
};

/** The four answer tiles, Kahoot-style: a colour and a shape each. */
const TILES = [
  { colour: "#c0392b", shape: "▲" },
  { colour: "#1d4fa8", shape: "◆" },
  { colour: "#c99a1e", shape: "●" },
  { colour: "#2f8a4f", shape: "■" },
];

type Draft = { q: string; options: string[]; answer: number };
const blankQuestion = (): Draft => ({ q: "", options: ["", "", "", ""], answer: 0 });

function Builder({ onHost }: { onHost: (custom: Draft[]) => void }) {
  const [qs, setQs] = useState<Draft[]>([blankQuestion()]);
  const set = (i: number, d: Partial<Draft>) => setQs((all) => all.map((x, k) => (k === i ? { ...x, ...d } : x)));
  const complete = qs.filter((x) => x.q.trim() && x.options.every((o) => o.trim()));
  return (
    <div className="qz-builder">
      {qs.map((x, i) => (
        <fieldset key={i}>
          <legend>Question {i + 1}</legend>
          <input className="campus-name" maxLength={160} placeholder="Question" value={x.q} onChange={(e) => set(i, { q: e.target.value })} />
          {x.options.map((o, k) => (
            <label key={k} className="qz-opt">
              <input type="radio" name={`ans${i}`} checked={x.answer === k} onChange={() => set(i, { answer: k })} aria-label={`Answer ${k + 1} is correct`} />
              <span style={{ background: TILES[k].colour }}>{TILES[k].shape}</span>
              <input maxLength={60} placeholder={`Answer ${k + 1}`} value={o} onChange={(e) => set(i, { options: x.options.map((v, j) => (j === k ? e.target.value : v)) })} />
            </label>
          ))}
        </fieldset>
      ))}
      <p className="campus-help">Tick the right answer for each question. Up to 10 questions. Quizzes you write are just for fun: no coins.</p>
      <div className="ch-actions">
        {qs.length < 10 && (
          <button className="ghost" onClick={() => setQs((all) => [...all, blankQuestion()])}>
            Add a question
          </button>
        )}
        <button disabled={!complete.length} onClick={() => onHost(complete)}>
          Host my quiz ({complete.length}) →
        </button>
      </div>
    </div>
  );
}

export default function Quiz(_: GameProps) {
  const [s, setS] = useState<QuizState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [writing, setWriting] = useState(false);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const off = net.onGame("quiz", (d) => {
      const data = d as { type: string; message?: string };
      if (data.type === "state") {
        setS(d as QuizState);
        setReceivedAt(Date.now());
        setError(null);
      }
      if (data.type === "error") setError(data.message ?? "Something went wrong.");
    });
    net.game("quiz", { type: "open" });
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => {
      net.game("quiz", { type: "close" });
      off();
      clearInterval(t);
    };
  }, []);

  if (!s) return <div className="game-soon">Opening the library…</div>;
  const send = (data: Record<string, unknown>) => net.game("quiz", data);
  const left = s.msLeft === null ? 0 : Math.max(0, s.msLeft - (now - receivedAt));

  let body: React.ReactNode;
  if (s.phase === "idle" || (s.phase === "podium" && !s.isHost && !s.joined)) {
    body = writing ? (
      <Builder
        onHost={(custom) => {
          send({ type: "host", custom });
          setWriting(false);
        }}
      />
    ) : (
      <>
        <p>No quiz running. Host one for whoever's in the library:</p>
        <div className="qz-sets">
          {s.sets.map((set) => (
            <button key={set.id} onClick={() => send({ type: "host", set: set.id })}>
              <b>{set.title}</b>
              <span>{set.count} questions · top 3 win coins</span>
            </button>
          ))}
          <button className="ghost" onClick={() => setWriting(true)}>
            <b>Write your own</b>
            <span>Up to 10 questions, just for fun</span>
          </button>
        </div>
      </>
    );
  } else if (s.phase === "lobby") {
    body = s.isHost ? (
      <>
        <p className="qz-pin-label">Players join with this PIN (it's on the library screen too):</p>
        <p className="qz-pin">{s.pin}</p>
        <p>{s.players.length ? `In: ${s.players.join(", ")}` : "Waiting for players…"}</p>
        <div className="ch-actions">
          <button disabled={!s.players.length} onClick={() => send({ type: "start" })}>
            Start the quiz →
          </button>
          <button className="ghost" onClick={() => send({ type: "end" })}>
            Cancel
          </button>
        </div>
      </>
    ) : s.joined ? (
      <p>
        You're in! Waiting for {s.host?.name} to start {s.title}. ({s.players.length} playing)
      </p>
    ) : (
      <JoinForm s={s} pin={pin} setPin={setPin} send={send} />
    );
  } else if (s.phase === "question" || s.phase === "reveal") {
    const q = s.question!;
    body = (
      <>
        <div className="qz-top">
          <span>
            Question {s.index + 1} of {s.total}
          </span>
          {s.phase === "question" && <b>{Math.ceil(left / 1000)}s</b>}
        </div>
        {s.phase === "question" && <div className="qz-timer" style={{ width: `${(left / 20000) * 100}%` }} />}
        <h3 className="qz-q">{q.q}</h3>
        <div className="qz-tiles">
          {q.options.map((o, k) => {
            const chosen = s.you?.choice === k;
            const reveal = s.phase === "reveal";
            const cls = ["qz-tile", chosen && "chosen", reveal && (k === s.correct ? "right" : "wrong")].filter(Boolean).join(" ");
            return (
              <button key={k} className={cls} style={{ background: TILES[k].colour }} disabled={!s.joined || s.you?.choice !== null || reveal} onClick={() => send({ type: "answer", choice: k })}>
                <i>{TILES[k].shape}</i> {o}
              </button>
            );
          })}
        </div>
        {s.phase === "question" &&
          (s.isHost ? (
            <div className="ch-actions">
              <p>
                {s.answered} of {s.players.length} answered
              </p>
              <button className="ghost" onClick={() => send({ type: "next" })}>
                Show the answer now
              </button>
            </div>
          ) : s.joined ? (
            <p className="qz-note">{s.you?.choice !== null ? "Locked in!" : "Pick an answer: faster is worth more."}</p>
          ) : (
            <JoinForm s={s} pin={pin} setPin={setPin} send={send} />
          ))}
        {s.phase === "reveal" && (
          <>
            {s.you && <p className="qz-note">{s.you.last ? `Correct! +${s.you.last}` : s.you.choice === null ? "Too slow!" : "Not this time."}</p>}
            <Board rows={s.leaderboard} />
            {s.isHost && (
              <div className="ch-actions">
                <button onClick={() => send({ type: "next" })}>{s.index + 1 < s.total ? "Next question →" : "Show the podium →"}</button>
              </div>
            )}
          </>
        )}
      </>
    );
  } else {
    // Podium.
    body = (
      <>
        <h3 className="qz-q">{s.title}: final scores</h3>
        <Board rows={s.leaderboard} podium />
        {s.paid.length > 0 ? (
          <p>{s.paid.map((p) => `${p.name} +${p.coins} ${COIN}`).join(" · ")}</p>
        ) : (
          <p className="campus-help">{s.prizes ? "Prizes need at least two players." : "A home-made quiz: glory only, no coins."}</p>
        )}
        {s.isHost && (
          <div className="ch-actions">
            <button onClick={() => send({ type: "end" })}>Close the quiz</button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="qz">
      {s.host && s.phase !== "idle" && (
        <p className="qz-host">
          {s.title} · hosted by {s.isHost ? "you" : s.host.name}
          {s.you ? ` · your score ${s.you.score}` : ""}
          {s.isHost && (s.phase === "question" || s.phase === "reveal") && (
            <button className="qz-end" onClick={() => confirm("End the quiz for everyone?") && send({ type: "end" })}>
              End quiz
            </button>
          )}
        </p>
      )}
      {body}
      {error && <p className="ob-error">{error}</p>}
    </div>
  );
}

function JoinForm({ s, pin, setPin, send }: { s: QuizState; pin: string; setPin: (p: string) => void; send: (d: Record<string, unknown>) => void }) {
  return (
    <form
      className="qz-join"
      onSubmit={(e) => {
        e.preventDefault();
        send({ type: "join", pin });
      }}
    >
      <p>
        {s.host?.name} is hosting {s.title}. Enter the PIN from the library screen:
      </p>
      <input className="campus-name ob-code" inputMode="numeric" maxLength={4} placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      <div className="ch-actions">
        <button type="submit" disabled={pin.length !== 4}>
          Join →
        </button>
      </div>
    </form>
  );
}

function Board({ rows, podium }: { rows: { name: string; score: number; last: number }[]; podium?: boolean }) {
  if (!rows.length) return null;
  return (
    <ol className={`bb-top qz-board${podium ? " podium" : ""}`}>
      {rows.map((r, i) => (
        <li key={r.name + i}>
          <span>
            {podium && i < 3 ? ["🥇", "🥈", "🥉"][i] + " " : ""}
            {r.name}
          </span>
          <b>
            {r.score}
            {!podium && r.last ? <small> +{r.last}</small> : null}
          </b>
        </li>
      ))}
    </ol>
  );
}
