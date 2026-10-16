// Chess at the pods: sit down, wait for an opponent, play with 5 minutes each.
// Tap a piece to see where it can go, tap a square to move. The server checks every move.

import { Chess as Rules, type Square } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { COIN } from "../../shared/world";
import type { GameProps } from "./GameHost";
import { useTable } from "./useTable";

type ChessState = {
  table: string;
  white: { name: string; rating: number; games: number } | null;
  black: { name: string; rating: number; games: number } | null;
  /** Past games between these two, from white's side. */
  h2h: { white: number; black: number; draws: number } | null;
  rated: { white: { rating: number; delta: number }; black: { rating: number; delta: number } } | null;
  rematch: [boolean, boolean];
  you: "w" | "b" | null;
  fen: string;
  clocks: { w: number; b: number };
  serverTime: number;
  status: "waiting" | "playing" | "over";
  result: string | null;
  lastMove: { from: string; to: string } | null;
  drawOffer: 0 | 1 | null;
  prize: number;
};

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = "abcdefgh";

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function ChessGame({ zone }: GameProps) {
  const { state, send } = useTable<ChessState>("chess", zone.id);
  const [picked, setPicked] = useState<Square | null>(null);
  const [now, setNow] = useState(Date.now());
  const [receivedAt, setReceivedAt] = useState(Date.now());
  useEffect(() => {
    setReceivedAt(Date.now());
    setPicked(null);
  }, [state]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const rules = useMemo(() => new Rules(state?.fen), [state?.fen]);
  const targets = useMemo(() => (picked ? new Set(rules.moves({ square: picked, verbose: true }).map((m) => m.to)) : new Set<string>()), [picked, rules]);

  if (!state) return <div className="game-soon">Setting up the board…</div>;

  const turn = rules.turn();
  const myTurn = state.status === "playing" && state.you === turn;
  // Count the running clock down locally between updates.
  const live = { ...state.clocks };
  if (state.status === "playing") live[turn] -= now - receivedAt;
  const flip = state.you === "b";
  const rows = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const cols = flip ? [...FILES].reverse() : [...FILES];
  const check = rules.inCheck() ? rules.board().flat().find((p) => p && p.type === "k" && p.color === turn)?.square : null;
  const mySeat = state.you === "w" ? 0 : state.you === "b" ? 1 : null;

  const tap = (sq: Square) => {
    if (!myTurn) return;
    const piece = rules.get(sq);
    if (picked && targets.has(sq)) {
      send({ type: "move", from: picked, to: sq, promotion: "q" });
      setPicked(null);
      return;
    }
    setPicked(piece && piece.color === state.you ? sq : null);
  };

  const player = (side: "w" | "b") => {
    const p = side === "w" ? state.white : state.black;
    const running = state.status === "playing" && turn === side;
    return (
      <div className={`ch-player${running ? " on" : ""}`}>
        <span>
          <i className={side === "w" ? "ch-w" : "ch-b"}>♚</i> {p?.name ?? "Empty seat"}
          {state.you === side && " (you)"}
          {p && <small className="ch-rating">{p.games ? `♟ ${p.rating}` : "unrated"}</small>}
        </span>
        <b>{clock(live[side])}</b>
      </div>
    );
  };

  return (
    <div className="ch">
      {player(flip ? "w" : "b")}
      <div className="ch-board" role="grid" aria-label="Chess board">
        {rows.map((r) =>
          cols.map((f, ci) => {
            const sq = `${f}${r}` as Square;
            const piece = rules.get(sq);
            const dark = (FILES.indexOf(f) + r) % 2 === 0;
            const cls = [
              "ch-sq",
              dark ? "dark" : "light",
              picked === sq && "picked",
              targets.has(sq) && "target",
              state.lastMove && (state.lastMove.from === sq || state.lastMove.to === sq) && "last",
              check === sq && "check",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button key={sq} className={cls} onClick={() => tap(sq)} aria-label={`${sq}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ""}`}>
                {piece && <span className={piece.color === "w" ? "ch-w" : "ch-b"}>{GLYPH[piece.type]}</span>}
                {ci === 0 && <small className="ch-rank">{r}</small>}
                {r === rows[rows.length - 1] && <small className="ch-file">{f}</small>}
              </button>
            );
          }),
        )}
      </div>
      {player(flip ? "b" : "w")}

      <div className="ch-actions">
        {state.status === "waiting" &&
          (state.you ? (
            <p>Waiting for an opponent… Anyone at the pod can join.</p>
          ) : (
            <>
              <p>
                Winner gets {state.prize} {COIN}. 5 minutes each.
              </p>
              <button onClick={() => send({ type: "sit" })}>{state.white ? "Join the game →" : "Sit down to play →"}</button>
            </>
          ))}
        {state.status === "playing" &&
          (state.you ? (
            <>
              <p>{myTurn ? (rules.inCheck() ? "Check! Your move." : "Your move.") : "Their move."}</p>
              <button className="ghost" onClick={() => send({ type: "draw" })}>
                {state.drawOffer !== null && state.drawOffer !== mySeat ? "Accept draw" : state.drawOffer === mySeat ? "Draw offered" : "Offer a draw"}
              </button>
              <button className="ghost" onClick={() => confirm("Resign this game?") && send({ type: "resign" })}>
                Resign
              </button>
            </>
          ) : (
            <p>Watching. {state.drawOffer !== null ? "A draw has been offered." : ""}</p>
          ))}
        {state.status === "over" && (
          <>
            <p className="ch-result">{state.result}</p>
            {state.rated && (
              <p className="ch-rated">
                {state.white?.name} {signed(state.rated.white.delta)} → {state.rated.white.rating} · {state.black?.name} {signed(state.rated.black.delta)} → {state.rated.black.rating}
              </p>
            )}
            {!state.rated && <p className="campus-help">Too short to be rated (each side needs two moves).</p>}
            {state.you && state.white && state.black ? (
              <button onClick={() => send({ type: "rematch" })} disabled={state.rematch[mySeat as 0 | 1]}>
                {state.rematch[mySeat as 0 | 1] ? "Waiting for them to accept…" : state.rematch[1 - (mySeat as 0 | 1)] ? "Accept rematch →" : "Rematch (colours swap) →"}
              </button>
            ) : (
              <button onClick={() => send({ type: "sit" })}>Play again →</button>
            )}
          </>
        )}
        {state.h2h && (state.h2h.white || state.h2h.black || state.h2h.draws) ? (
          <p className="ch-h2h">
            Head to head: {state.white?.name} {state.h2h.white} · {state.black?.name} {state.h2h.black}
            {state.h2h.draws ? ` · ${state.h2h.draws} drawn` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
