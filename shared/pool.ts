// 8-ball physics and rules, shared by the server (which decides what really happened on every
// shot) and the browser (which replays the same shot to animate it). Units are table pixels;
// the table is W × H with six pockets. Ball 0 is the cue ball, 1–7 solids, 8 the eight, 9–15
// stripes.

export const W = 640;
export const H = 320;
export const R = 9; // ball radius
export const POCKET_R = 17;
export const POCKETS = [
  { x: 0, y: 0 },
  { x: W / 2, y: -4 },
  { x: W, y: 0 },
  { x: 0, y: H },
  { x: W / 2, y: H + 4 },
  { x: W, y: H },
];
const FRICTION = 0.988; // per step
const STOP = 0.04;
const MAX_SPEED = 26; // per step, for a full-power shot
export const STEP_HZ = 120;

export type Ball = { id: number; x: number; y: number; vx: number; vy: number; down: boolean };
export type Shot = { angle: number; power: number; cue?: { x: number; y: number } };
export type ShotResult = { balls: Ball[]; pocketed: number[]; firstHit: number | null; steps: number };

export const isSolid = (id: number) => id >= 1 && id <= 7;
export const isStripe = (id: number) => id >= 9 && id <= 15;

/** The opening rack: a triangle with the 8 in the middle, a solid and a stripe in the back corners. */
export function rack(): Ball[] {
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 15, 7];
  const balls: Ball[] = [{ id: 0, x: W * 0.25, y: H / 2, vx: 0, vy: 0, down: false }];
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let i = 0; i <= row; i++) {
      balls.push({ id: order[k++], x: W * 0.68 + row * R * 1.75, y: H / 2 + (i - row / 2) * R * 2.02, vx: 0, vy: 0, down: false });
    }
  return balls;
}

export const clone = (b: Ball[]) => b.map((x) => ({ ...x }));

/** Is a spot free for placing the cue ball (ball in hand)? */
export function canPlace(balls: Ball[], x: number, y: number) {
  if (x < R || x > W - R || y < R || y > H - R) return false;
  return balls.every((b) => b.down || b.id === 0 || Math.hypot(b.x - x, b.y - y) > 2 * R + 0.5);
}

/** Start a shot: place the cue ball if allowed, then strike it. */
export function strike(balls: Ball[], shot: Shot) {
  const cue = balls.find((b) => b.id === 0)!;
  if (shot.cue) {
    cue.x = shot.cue.x;
    cue.y = shot.cue.y;
    cue.down = false;
  }
  const p = Math.max(0.05, Math.min(1, shot.power)) * MAX_SPEED;
  cue.vx = Math.cos(shot.angle) * p;
  cue.vy = Math.sin(shot.angle) * p;
}

/** One physics step. Returns whether anything is still moving, and reports hits and pots. */
export function step(balls: Ball[], onHit: (a: number, b: number) => void, onPot: (id: number) => void) {
  let moving = false;
  for (const b of balls) {
    if (b.down) continue;
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    if (Math.hypot(b.vx, b.vy) < STOP) b.vx = b.vy = 0;
    else moving = true;
    // Pockets first (so a ball can drop at a corner), then cushions.
    for (const pk of POCKETS)
      if (Math.hypot(b.x - pk.x, b.y - pk.y) < POCKET_R) {
        b.down = true;
        b.vx = b.vy = 0;
        onPot(b.id);
        break;
      }
    if (b.down) continue;
    if (b.x < R) (b.x = R), (b.vx = Math.abs(b.vx) * 0.8);
    if (b.x > W - R) (b.x = W - R), (b.vx = -Math.abs(b.vx) * 0.8);
    if (b.y < R) (b.y = R), (b.vy = Math.abs(b.vy) * 0.8);
    if (b.y > H - R) (b.y = H - R), (b.vy = -Math.abs(b.vy) * 0.8);
  }
  // Ball-on-ball: equal masses, so the speeds along the line of centres swap.
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.down) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const c = balls[j];
      if (c.down) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= 2 * R || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      // Separate them so they don't stick.
      const overlap = (2 * R - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      c.x += nx * overlap;
      c.y += ny * overlap;
      const va = a.vx * nx + a.vy * ny;
      const vc = c.vx * nx + c.vy * ny;
      if (va - vc <= 0) continue;
      const dv = (va - vc) * 0.96;
      a.vx -= dv * nx;
      a.vy -= dv * ny;
      c.vx += dv * nx;
      c.vy += dv * ny;
      onHit(a.id, c.id);
      moving = true;
    }
  }
  return moving;
}

/** Run a whole shot to rest. Pure: works on a copy. */
export function simulate(start: Ball[], shot: Shot): ShotResult {
  const balls = clone(start);
  strike(balls, shot);
  const pocketed: number[] = [];
  let firstHit: number | null = null;
  let steps = 0;
  while (steps < STEP_HZ * 20) {
    steps++;
    const moving = step(
      balls,
      (a, b) => {
        if (firstHit === null && (a === 0 || b === 0)) firstHit = a === 0 ? b : a;
      },
      (id) => pocketed.push(id),
    );
    if (!moving) break;
  }
  for (const b of balls) b.vx = b.vy = 0;
  return { balls, pocketed, firstHit, steps };
}

// ---------- Rules (simplified 8-ball) ----------

export type Group = "solids" | "stripes" | null;
export type Rules = { groups: [Group, Group]; turn: 0 | 1 };
export type Verdict = {
  foul: string | null;
  /** Whose turn it is next. */
  turn: 0 | 1;
  groups: [Group, Group];
  ballInHand: boolean;
  /** Set when the frame is over. */
  winner: 0 | 1 | null;
  note: string;
};

const ofGroup = (g: Group, id: number) => (g === "solids" ? isSolid(id) : g === "stripes" ? isStripe(id) : false);
export const remaining = (balls: Ball[], g: Group) => balls.filter((b) => !b.down && ofGroup(g, b.id)).length;

/** What a shot means: fouls, who's on which group, whose turn, and whether someone won. */
export function judge(before: Ball[], r: ShotResult, rules: Rules): Verdict {
  const me = rules.turn;
  const them = (1 - me) as 0 | 1;
  const groups: [Group, Group] = [...rules.groups];
  const mine = groups[me];
  const clearedBefore = mine !== null && remaining(before, mine) === 0;

  let foul: string | null = null;
  if (r.pocketed.includes(0)) foul = "The cue ball went down";
  else if (r.firstHit === null) foul = "Missed every ball";
  else if (r.firstHit === 8 && !clearedBefore) foul = "Hit the 8 first";
  else if (mine && !ofGroup(mine, r.firstHit) && r.firstHit !== 8) foul = `Hit a ${mine === "solids" ? "stripe" : "solid"} first`;

  // The 8 decides the frame.
  if (r.pocketed.includes(8)) {
    const won = clearedBefore && !foul;
    return { foul, turn: me, groups, ballInHand: false, winner: won ? me : them, note: won ? "Potted the 8 to win" : "Potted the 8 too early" };
  }

  const potted = r.pocketed.filter((id) => id !== 0);
  // An open table is decided by the first ball potted cleanly.
  if (!mine && !foul && potted.length) {
    const g: Group = isSolid(potted[0]) ? "solids" : "stripes";
    groups[me] = g;
    groups[them] = g === "solids" ? "stripes" : "solids";
  }
  const ownPotted = potted.some((id) => (groups[me] ? ofGroup(groups[me], id) : true));
  if (foul) return { foul, turn: them, groups, ballInHand: true, winner: null, note: `${foul}: ball in hand` };
  if (ownPotted) return { foul: null, turn: me, groups, ballInHand: false, winner: null, note: "Potted: shoot again" };
  return { foul: null, turn: them, groups, ballInHand: false, winner: null, note: potted.length ? "Potted the wrong group" : "No pot" };
}
