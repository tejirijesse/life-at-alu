// Basketball shootout: 60 seconds, as many baskets as you can. Drag back from the ball and let go
// to shoot (like a slingshot). Two points from close, three from the line; the spot moves after
// each basket. The score goes to the server, which pays capped coins and keeps the leaderboard.

import { useEffect, useRef, useState } from "react";
import { COIN } from "../../shared/world";
import { net } from "../net";
import type { GameProps } from "./GameHost";

const W = 640;
const H = 400;
const G = 900; // gravity, px/s²
const RIM = { x: 520, y: 150, r: 26 }; // rim centre and half-width
const SPOTS = [
  { x: 330, pts: 2 },
  { x: 250, pts: 2 },
  { x: 170, pts: 3 },
  { x: 110, pts: 3 },
];
const GROUND = 360;
const BALL_R = 13;
const TIME = 60;

type Ball = { x: number; y: number; vx: number; vy: number; live: boolean; scored: boolean; above: boolean };

export default function Basketball(_: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"ready" | "play" | "done">("ready");
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(TIME);
  const [result, setResult] = useState<{ coins: number; best: number } | null>(null);
  const [top, setTop] = useState<{ name: string; score: number }[]>([]);
  const game = useRef({ spot: 0, ball: null as Ball | null, drag: null as null | { x: number; y: number }, aim: null as null | { x: number; y: number }, score: 0, end: 0, msg: "", msgAt: 0 });

  useEffect(() => {
    const off = net.onGame("basketball", (d) => {
      const data = d as { type: string; coins?: number; best?: number; top?: { name: string; score: number }[] };
      if (data.type === "paid") setResult({ coins: data.coins ?? 0, best: data.best ?? 0 });
      if (data.type === "leaderboard" && data.top) setTop(data.top);
    });
    net.game("basketball", { type: "leaderboard" });
    return off;
  }, []);

  const start = () => {
    const g = game.current;
    g.spot = 0;
    g.ball = null;
    g.score = 0;
    g.end = performance.now() + TIME * 1000;
    setScore(0);
    setLeft(TIME);
    setResult(null);
    setPhase("play");
  };

  // The game loop: physics, drawing, the clock.
  useEffect(() => {
    if (phase !== "play") return;
    const ctx = canvas.current!.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const g = game.current;
      const spot = SPOTS[g.spot];
      const remaining = Math.max(0, (g.end - now) / 1000);
      setLeft(Math.ceil(remaining));

      // Ball physics.
      const b = g.ball;
      if (b?.live) {
        b.vy += G * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // The rim's two edges and the backboard.
        for (const ex of [RIM.x - RIM.r, RIM.x + RIM.r]) {
          const dx = b.x - ex;
          const dy = b.y - RIM.y;
          const d = Math.hypot(dx, dy);
          if (d < BALL_R + 3) {
            const nx = dx / d;
            const ny = dy / d;
            const dot = b.vx * nx + b.vy * ny;
            b.vx = (b.vx - 2 * dot * nx) * 0.6;
            b.vy = (b.vy - 2 * dot * ny) * 0.6;
            b.x = ex + nx * (BALL_R + 3);
            b.y = RIM.y + ny * (BALL_R + 3);
          }
        }
        if (b.x > RIM.x + RIM.r + 18 && b.y > 60 && b.y < RIM.y + 10) {
          b.x = RIM.x + RIM.r + 18;
          b.vx = -Math.abs(b.vx) * 0.5;
        }
        // Through the hoop: above the rim one frame, inside and below it the next.
        if (b.y < RIM.y) b.above = true;
        if (!b.scored && b.above && b.vy > 0 && b.y > RIM.y && b.y < RIM.y + 20 && Math.abs(b.x - RIM.x) < RIM.r - 4) {
          b.scored = true;
          g.score += spot.pts;
          setScore(g.score);
          g.msg = spot.pts === 3 ? "Three!" : "Swish!";
          g.msgAt = now;
          g.spot = (g.spot + 1) % SPOTS.length;
        }
        if (b.y > GROUND - BALL_R) {
          b.y = GROUND - BALL_R;
          b.vy *= -0.45;
          b.vx *= 0.7;
          if (Math.abs(b.vy) < 60) b.live = false;
        }
        if (b.x < -40 || b.x > W + 40) b.live = false;
      }

      // Draw: the court, the hoop, the ball, and the aim line.
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#e9dcc5";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#c8834e";
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.strokeStyle = "#f4ead8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(170, GROUND + 2);
      ctx.lineTo(170, H);
      ctx.stroke();
      // pole, board, rim, net
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(RIM.x + RIM.r + 30, 60, 8, GROUND - 60);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(RIM.x + RIM.r + 18, 70, 12, 110);
      ctx.strokeStyle = "#d4691f";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(RIM.x - RIM.r, RIM.y);
      ctx.lineTo(RIM.x + RIM.r + 18, RIM.y);
      ctx.stroke();
      ctx.strokeStyle = "#ffffffcc";
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= 4; i++) {
        const x = RIM.x - RIM.r + (i * 2 * RIM.r) / 4;
        ctx.beginPath();
        ctx.moveTo(x, RIM.y);
        ctx.lineTo(RIM.x + (x - RIM.x) * 0.6, RIM.y + 34);
        ctx.stroke();
      }
      // shooter's spot
      ctx.fillStyle = "#1d3f8a";
      ctx.beginPath();
      ctx.ellipse(spot.x, GROUND + 6, 24, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1a1b";
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillText(`${spot.pts} pts`, spot.x - 16, GROUND + 28);
      // the ball (in hand if not in flight)
      const bx = b?.live ? b.x : spot.x;
      const by = b?.live ? b.y : GROUND - 90;
      ctx.fillStyle = "#e07a2e";
      ctx.beginPath();
      ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5a2a0c";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // aim: a dotted preview of the arc
      if (g.drag && g.aim && !b?.live) {
        const vx = (g.drag.x - g.aim.x) * 4.2;
        const vy = (g.drag.y - g.aim.y) * 4.2;
        ctx.fillStyle = "#1a1a1b88";
        for (let t = 0.05; t < 0.6; t += 0.05) ctx.fillRect(spot.x + vx * t - 2, GROUND - 90 + vy * t + 0.5 * G * t * t - 2, 4, 4);
      }
      if (g.msg && now - g.msgAt < 900) {
        ctx.fillStyle = "#1d3f8a";
        ctx.font = "bold 28px ui-monospace, monospace";
        ctx.fillText(g.msg, RIM.x - 70, RIM.y - 40);
      }

      if (remaining <= 0 && !b?.live) {
        setPhase("done");
        net.game("basketball", { type: "result", score: g.score });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Drag back and release, slingshot style. Coordinates are in the canvas's own 640×400.
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onDown = (e: React.PointerEvent) => {
    if (phase !== "play" || game.current.ball?.live) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    game.current.drag = pos(e);
    game.current.aim = pos(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (game.current.drag) game.current.aim = pos(e);
  };
  const onUp = () => {
    const g = game.current;
    if (!g.drag || !g.aim) return;
    const vx = (g.drag.x - g.aim.x) * 4.2;
    const vy = (g.drag.y - g.aim.y) * 4.2;
    g.drag = g.aim = null;
    if (Math.hypot(vx, vy) < 80) return;
    g.ball = { x: SPOTS[g.spot].x, y: GROUND - 90, vx, vy, live: true, scored: false, above: false };
  };

  return (
    <div className="bb">
      <div className="bb-bar">
        <span>
          Score <b>{score}</b>
        </span>
        <span>
          Time <b>{left}s</b>
        </span>
      </div>
      <canvas ref={canvas} width={W} height={H} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      {phase !== "play" && (
        <div className="bb-over">
          {phase === "ready" ? (
            <>
              <p>60 seconds. Drag back from anywhere and let go to shoot: further back, harder throw.</p>
              <p className="campus-help">2 points close in, 3 from the line. Coins for every basket (capped per game).</p>
            </>
          ) : (
            <>
              <p className="bb-final">
                {score} points{result ? ` · +${result.coins} ${COIN}` : ""}
              </p>
              {result && result.coins === 0 && score > 0 && <p className="campus-help">You've hit this hour's coin limit for solo games. Scores still count.</p>}
              {result && <p className="campus-help">Your best: {result.best}</p>}
            </>
          )}
          <button onClick={start}>{phase === "ready" ? "Start →" : "Play again"}</button>
          {top.length > 0 && (
            <ol className="bb-top">
              {top.slice(0, 5).map((t, i) => (
                <li key={i}>
                  <span>{t.name}</span>
                  <b>{t.score}</b>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
