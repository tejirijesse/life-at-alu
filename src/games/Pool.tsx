// 8-ball pool at the Commons table. Pay the entry to sit; the winner takes the pot.
// On your turn, drag back from the cue ball and let go: the direction is the aim, the distance is
// the power. With ball in hand, tap where to put the cue ball first. The server decides every
// shot; this screen replays it with the same physics (shared/pool.ts).

import { useEffect, useRef, useState } from "react";
import { canPlace, clone, H, isStripe, POCKETS, R, simulate, step, STEP_HZ, strike, W, type Ball, type Group, type Shot } from "../../shared/pool";
import { COIN } from "../../shared/world";
import type { GameProps } from "./GameHost";
import { useTable } from "./useTable";

type PoolState = {
  table: string;
  players: ({ name: string; group: Group; left: number } | null)[];
  you: 0 | 1 | null;
  balls: Ball[];
  turn: 0 | 1;
  ballInHand: boolean;
  note: string;
  status: "waiting" | "playing" | "over";
  winner: 0 | 1 | null;
  pot: number;
  entry: number;
  n: number;
  shotClock: number | null;
};

const PAD = 22; // rail width around the cloth
const COLOURS = ["#f8f8f4", "#e8b622", "#1d4fa8", "#c8322a", "#6c3d9a", "#e0782a", "#2f8a4f", "#7c2430", "#111111"];
const colourOf = (id: number) => COLOURS[id > 8 ? id - 8 : id];

export default function PoolGame({ zone }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // What's on screen: either the last state, or a shot being replayed.
  const view = useRef<{ balls: Ball[]; animating: boolean; pending: PoolState | null; lastN: number; timer?: number }>({ balls: [], animating: false, pending: null, lastN: 0 });
  const aim = useRef<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const [cuePlaced, setCuePlaced] = useState<{ x: number; y: number } | null>(null);
  const [shown, setShown] = useState<PoolState | null>(null);

  const { state, error, send } = useTable<PoolState>("pool", zone.id, (d) => {
    // A shot to replay: start from the table as it was, strike, and animate to rest.
    if (d.type !== "shot") return;
    const n = Number(d.n);
    if (n <= view.current.lastN) return;
    view.current.lastN = n;
    const balls = clone(d.before as Ball[]);
    strike(balls, d.shot as Shot);
    view.current.balls = balls;
    view.current.animating = true;
    // If the screen stops drawing (tab in the background, phone locked), still land on the
    // result once the shot would have finished.
    const ms = (simulate(d.before as Ball[], d.shot as Shot).steps / STEP_HZ) * 1000 + 400;
    clearTimeout(view.current.timer);
    view.current.timer = window.setTimeout(() => finishReplay(), ms);
  });

  /** End the replay and show the table as the server left it. */
  function finishReplay() {
    const v = view.current;
    if (!v.animating) return;
    v.animating = false;
    if (v.pending) {
      v.balls = clone(v.pending.balls);
      setShown(v.pending);
      v.pending = null;
    }
  }

  // New state: show it now, or after the replay finishes.
  useEffect(() => {
    if (!state) return;
    if (view.current.lastN === 0) view.current.lastN = state.n;
    if (view.current.animating) view.current.pending = state;
    else {
      view.current.balls = clone(state.balls);
      setShown(state);
    }
    setCuePlaced(null);
  }, [state]);

  const ready = !!(shown ?? state);

  // Draw loop (and the replay's physics, two steps a frame = the server's 120 Hz).
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const draw = (now: number) => {
      const v = view.current;
      // Advance the replay by real time at the server's 120 Hz, whatever the screen's frame rate.
      carry = Math.min(carry + ((now - last) / 1000) * STEP_HZ, 240);
      last = now;
      if (v.animating) {
        let moving = true;
        for (; carry >= 1 && moving; carry--) moving = step(v.balls, () => {}, () => {});
        if (!moving) finishReplay();
      }
      if (!v.animating) carry = 0;
      ctx.save();
      ctx.clearRect(0, 0, W + PAD * 2, H + PAD * 2);
      // rails and cloth
      ctx.fillStyle = "#5a3418";
      ctx.fillRect(0, 0, W + PAD * 2, H + PAD * 2);
      ctx.translate(PAD, PAD);
      ctx.fillStyle = "#1f6b46";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#0b0b0b";
      for (const p of POCKETS) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#ffffff22";
      ctx.beginPath();
      ctx.moveTo(W * 0.25, 0);
      ctx.lineTo(W * 0.25, H);
      ctx.stroke();
      // balls
      const balls = v.balls.map((b) => (b.id === 0 && cuePlaced && !v.animating ? { ...b, x: cuePlaced.x, y: cuePlaced.y, down: false } : b));
      for (const b of balls) {
        if (b.down) continue;
        ctx.fillStyle = colourOf(b.id);
        ctx.beginPath();
        ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
        ctx.fill();
        if (isStripe(b.id)) {
          ctx.fillStyle = "#f8f8f4";
          ctx.fillRect(b.x - R, b.y - R * 0.95, R * 2, R * 0.55);
          ctx.fillRect(b.x - R, b.y + R * 0.4, R * 2, R * 0.55);
          ctx.strokeStyle = colourOf(b.id);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(b.x, b.y, R - 0.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (b.id !== 0) {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(b.x, b.y, 3.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#111";
          ctx.font = "bold 5px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(b.id), b.x, b.y + 0.3);
        }
      }
      // aim: the cue stick behind the ball and a guide line ahead of it
      const cue = balls.find((b) => b.id === 0);
      const a = aim.current;
      if (a && cue && !cue.down && !v.animating) {
        const dx = a.from.x - a.to.x;
        const dy = a.from.y - a.to.y;
        const len = Math.hypot(dx, dy);
        if (len > 4) {
          const ux = dx / len;
          const uy = dy / len;
          const power = Math.min(1, len / 160);
          ctx.strokeStyle = "#ffffff66";
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.moveTo(cue.x, cue.y);
          ctx.lineTo(cue.x + ux * 260, cue.y + uy * 260);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = "#d9b27a";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(cue.x - ux * (R + 6 + power * 40), cue.y - uy * (R + 6 + power * 40));
          ctx.lineTo(cue.x - ux * (R + 180 + power * 40), cue.y - uy * (R + 180 + power * 40));
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(4, H - 10, (W / 3) * power, 6);
        }
      }
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // The canvas only exists once the first state has arrived, so start drawing then.
  }, [cuePlaced, ready]);

  const s = shown ?? state;
  if (!s) return <div className="game-soon">Racking up…</div>;

  const myTurn = s.status === "playing" && s.you === s.turn && !view.current.animating;
  const toTable = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * (W + PAD * 2) - PAD, y: ((e.clientY - r.top) / r.height) * (H + PAD * 2) - PAD };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!myTurn) return;
    const p = toTable(e);
    if (s.ballInHand && !cuePlaced) {
      if (canPlace(s.balls, p.x, p.y)) setCuePlaced(p);
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    aim.current = { from: p, to: p };
  };
  const onMove = (e: React.PointerEvent) => {
    if (aim.current) aim.current.to = toTable(e);
  };
  const onUp = () => {
    const a = aim.current;
    aim.current = null;
    if (!a || !myTurn) return;
    const dx = a.from.x - a.to.x;
    const dy = a.from.y - a.to.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return;
    send({ type: "shot", angle: Math.atan2(dy, dx), power: Math.min(1, len / 160), cue: s.ballInHand ? cuePlaced : undefined });
  };

  const me = s.you;
  const label = (i: 0 | 1) => {
    const p = s.players[i];
    if (!p) return <span className="pl-empty">Empty seat</span>;
    return (
      <span className={s.status === "playing" && s.turn === i ? "pl-on" : ""}>
        {p.name}
        {me === i && " (you)"} · {p.group ? `${p.group} (${p.left} left)` : "open table"}
      </span>
    );
  };

  return (
    <div className="pl">
      <div className="pl-bar">
        {label(0)}
        <b>
          Pot {s.pot} {COIN}
        </b>
        {label(1)}
      </div>
      <canvas ref={canvas} width={W + PAD * 2} height={H + PAD * 2} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <div className="ch-actions">
        {error && <p className="ob-error">{error}</p>}
        {s.status === "waiting" &&
          (me !== null ? (
            <p>Waiting for an opponent… Your {s.entry} coins are refunded if nobody comes in 3 minutes.</p>
          ) : (
            <>
              <p>
                Entry {s.entry} {COIN}; the winner takes the pot.
              </p>
              <button onClick={() => send({ type: "sit" })}>{s.players[0] ? "Join the game →" : "Sit down to play →"}</button>
            </>
          ))}
        {s.status === "playing" && (
          <p>
            {s.note ? `${s.note}. ` : ""}
            {myTurn ? (s.ballInHand && !cuePlaced ? "Ball in hand: tap to place the cue ball." : "Your shot: drag back from the cue ball and let go.") : me !== null ? "Their shot." : "Watching."}
            {s.shotClock !== null && ` (${Math.ceil(s.shotClock / 1000)}s)`}
          </p>
        )}
        {s.status === "over" && (
          <>
            <p className="ch-result">{s.note}</p>
            <button onClick={() => send({ type: "sit" })}>Play again →</button>
          </>
        )}
      </div>
    </div>
  );
}
