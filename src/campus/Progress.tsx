// Progression on screen: my level and XP bar in the HUD, a toast when I earn XP (bigger on a
// level up), the Rankings window, and the Campus Legends board on the front plaza.

import * as THREE from "three";
import { useEffect, useState, useSyncExternalStore } from "react";
import { levelFor, levelProgress, MAX_LEVEL, titleFor, xpForLevel } from "../../shared/levels";
import type { BoardId, RankRow } from "../../shared/protocol";
import { COIN } from "../../shared/world";
import { net } from "../net";
import { surfaceAt } from "./indoors";

export const BOARDS: { id: BoardId; title: string; blurb: string; unit: string; weekly: boolean }[] = [
  { id: "legends", title: "Campus Legends", blurb: "XP from everything you do on campus.", unit: "XP", weekly: true },
  { id: "academic", title: "Academic Titans", blurb: "Quiz Night points (built-in quizzes).", unit: "pts", weekly: true },
  { id: "gaming", title: "Gaming Champions", blurb: "Wins and scores across the games.", unit: "pts", weekly: true },
  { id: "chess", title: "Chess Masters", blurb: "Chess rating. Beat stronger players to climb faster.", unit: "", weekly: false },
  { id: "wealth", title: "Wealth", blurb: `${COIN} balance. Shown for fun; it never counts towards your level.`, unit: "₳", weekly: false },
];

function useAccount() {
  useSyncExternalStore(
    (cb) => net.onAuth(cb),
    () => net.authVersion,
  );
  return net.account;
}

function useRanks() {
  return useSyncExternalStore(
    (cb) => net.onRanks(cb),
    () => net.ranks,
  );
}

/** "Lv 7 · Campus Explorer" and the bar to the next level. */
export function LevelBadge({ onOpen }: { onOpen: () => void }) {
  const account = useAccount();
  const xp = account?.progress?.xp ?? 0;
  const level = levelFor(xp);
  const pct = Math.round(levelProgress(xp) * 100);
  const top = level >= MAX_LEVEL;
  return (
    <button className="campus-level" onClick={onOpen} title={top ? `${xp} XP · top level` : `${xp} XP · ${xpForLevel(level + 1) - xp} XP to level ${level + 1} · open Rankings`}>
      <span className="lv">Lv {level}</span>
      <span className="ttl">{titleFor(level)}</span>
      <span className="bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="trophy" aria-label="Rankings">🏆</span>
    </button>
  );
}

/** "+15 XP · found the library", or a level-up card. */
export function XpToast() {
  useAccount();
  const last = net.lastXp;
  const [shown, setShown] = useState<typeof last>(null);
  useEffect(() => {
    if (!last || Date.now() - last.at > 2000) return;
    setShown(last);
    const t = setTimeout(() => setShown(null), last.levelUp ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [last]);
  if (!shown) return null;
  if (shown.levelUp)
    return (
      <div className="campus-levelup" role="status">
        <small>Level up</small>
        <b>Level {shown.level}</b>
        <span>{shown.title}</span>
      </div>
    );
  return (
    <p className="campus-xp" role="status">
      +{shown.gained} XP <span>· {shown.reason}</span>
    </p>
  );
}

const fmt = (id: BoardId, v: number) => (id === "wealth" ? `₳ ${v.toLocaleString("en")}` : v.toLocaleString("en"));

/** The Rankings window: a tab per board, this week or all time. */
export function Rankings({ onClose }: { onClose: () => void }) {
  const ranks = useRanks();
  const [board, setBoard] = useState<BoardId>("legends");
  const [period, setPeriod] = useState<"weekly" | "all">("weekly");
  useEffect(() => {
    net.askRanks();
    const t = setInterval(() => net.askRanks(), 15_000);
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const meta = BOARDS.find((b) => b.id === board)!;
  const view = meta.weekly ? period : "all";
  const rows = ranks?.boards[board][view] ?? [];
  const mine = ranks?.you[board][view] ?? null;
  const resets = ranks ? new Date(ranks.weekStarts + 7 * 86_400_000) : null;

  return (
    <div className="game" role="dialog" aria-label="Rankings">
      <div className="game-frame">
        <header>
          <h2>🏆 Rankings</h2>
          <button className="game-close" onClick={onClose} aria-label="Close rankings">
            ✕
          </button>
        </header>
        <div className="rk">
          <nav className="rk-tabs">
            {BOARDS.map((b) => (
              <button key={b.id} className={b.id === board ? "on" : ""} onClick={() => setBoard(b.id)}>
                {b.title}
              </button>
            ))}
          </nav>
          <p className="campus-help">{meta.blurb}</p>
          {meta.weekly && (
            <div className="rk-period">
              <button className={period === "weekly" ? "on" : ""} onClick={() => setPeriod("weekly")}>
                This week
              </button>
              <button className={period === "all" ? "on" : ""} onClick={() => setPeriod("all")}>
                All time
              </button>
              {period === "weekly" && resets && <small>Resets {resets.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "short" })}, 00:00 Kigali</small>}
            </div>
          )}
          {!ranks ? (
            <p className="game-soon">Fetching the boards…</p>
          ) : rows.length === 0 ? (
            <p className="game-soon">Nobody on this board yet. Be the first.</p>
          ) : (
            <ol className="rk-list">
              {rows.map((r, i) => (
                <Row key={`${r.name}-${i}`} i={i} r={r} board={board} unit={meta.unit} />
              ))}
            </ol>
          )}
          <p className="rk-you">{mine ? `You're #${mine} on this board.` : "You're not on this board yet."}</p>
        </div>
      </div>
    </div>
  );
}

function Row({ i, r, board, unit }: { i: number; r: RankRow; board: BoardId; unit: string }) {
  return (
    <li className={i < 3 ? `top top${i + 1}` : ""}>
      <span className="pos">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
      <span className="who">
        {r.name}
        <small>
          Lv {r.level} · {r.title}
        </small>
      </span>
      <span className="val">
        {fmt(board, r.value)} {board === "wealth" ? "" : unit}
      </span>
    </li>
  );
}

/** Where the Campus Legends board stands: the front plaza, facing the lawn. */
export const LEGENDS_BOARD = { x: 10, z: 25 };

/** The Campus Legends board on the plaza: this week's top five, kept fresh while you're on campus. */
export function LegendsBoard() {
  const ranks = useRanks();
  const [face] = useState(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 384;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, t, m: new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.3 }) };
  });
  const [y] = useState(() => surfaceAt(LEGENDS_BOARD.x, LEGENDS_BOARD.z, 0.3) ?? 0);
  useEffect(() => {
    net.askRanks();
    const t = setInterval(() => net.askRanks(), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const g = face.c.getContext("2d")!;
    g.fillStyle = "#14213d";
    g.fillRect(0, 0, 512, 384);
    g.fillStyle = "#ffd166";
    g.textAlign = "center";
    g.font = "bold 38px ui-monospace, Menlo, monospace";
    g.fillText("CAMPUS LEGENDS", 256, 56);
    g.fillStyle = "#9fb3d9";
    g.font = "20px ui-monospace, Menlo, monospace";
    g.fillText("this week's top XP", 256, 88);
    const rows = ranks?.boards.legends.weekly.slice(0, 5) ?? [];
    g.textAlign = "left";
    g.font = "bold 28px ui-monospace, Menlo, monospace";
    if (!rows.length) {
      g.fillStyle = "#ffffff";
      g.textAlign = "center";
      g.fillText("Play anything to get on the board", 256, 220);
    }
    rows.forEach((r, i) => {
      const y = 140 + i * 50;
      g.fillStyle = i === 0 ? "#ffd166" : "#ffffff";
      g.fillText(`${i + 1}. ${r.name.slice(0, 16)}`, 36, y);
      g.textAlign = "right";
      g.fillText(`${r.value}`, 476, y);
      g.textAlign = "left";
    });
    face.t.needsUpdate = true;
  }, [ranks, face]);
  return (
    <group position={[LEGENDS_BOARD.x, y, LEGENDS_BOARD.z]}>
      {[-1.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 1.2, -0.05]} castShadow>
          <boxGeometry args={[0.12, 2.4, 0.12]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, -0.06]} castShadow>
        <boxGeometry args={[3.2, 2.4, 0.08]} />
        <meshStandardMaterial color="#1a1a1b" roughness={0.6} />
      </mesh>
      <mesh material={face.m} position={[0, 1.9, 0]}>
        <planeGeometry args={[3.0, 2.25]} />
      </mesh>
    </group>
  );
}
