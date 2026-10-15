// 1,200 simulated students. Each has a seat in a classroom (while seats last) and a day that
// loops: class, out to the terraces or the grand stairs, back to class, somewhere else…
//
// Everything is derived from the student's number and the wall clock, so every browser sees
// the same person in the same place at the same moment, with no server traffic. Real players
// walk among them.
//
// Movement follows a navigation graph built from the same collision rules the player uses:
// nodes across the terraces, stairs, doorways, rooms and internal stairs; an edge wherever a
// person could actually walk between two nodes.

import { FLOOR, plazas, ramps } from "./layout";
import { blockAt, blockedAt, doors, partitions, rooms, seats, stairs, stairY, STEP, surfaceAt } from "./indoors";
import { blocks } from "./layout";

export const STUDENTS = 1200;
const R = 0.35; // a student's radius when checking walls

// ---------- Navigation graph ----------

/** narrow: doorways and stairs, walked dead centre. room: the fine indoor grid. */
type NavNode = { x: number; y: number; z: number; narrow: boolean; room: boolean };
export const nodes: NavNode[] = [];
const addNode = (x: number, y: number, z: number, narrow = false, room = false) => {
  nodes.push({ x, y, z, narrow, room });
  return nodes.length - 1;
};
const standable = (x: number, z: number, y: number, r = R + 0.15) => {
  const s = surfaceAt(x, z, y + 0.1);
  return s !== null && Math.abs(s - y) < 0.05 && !blockedAt(x, z, y, r);
};

function walkable(a: NavNode, b: NavNode) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / 0.3));
  let y = a.y;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const s = surfaceAt(x, z, y);
    if (s === null || Math.abs(s - y) > STEP || blockedAt(x, z, s, R)) return false;
    y = s;
  }
  return Math.abs(y - b.y) < 0.3;
}

function buildGraph() {
  // Terraces and the lawn.
  for (const p of plazas)
    for (let x = p.x0 + 1.5; x < p.x1 - 1; x += 4.5)
      for (let z = p.z0 + 1.5; z < p.z1 - 1; z += 4.5) if (blockAt(x, z) < 0 && standable(x, z, p.y)) addNode(x, p.y, z);
  for (let x = -58; x <= 58; x += 6)
    for (let z = 30; z <= 60; z += 6) {
      const y = surfaceAt(x, z, 50);
      if (y !== null && blockAt(x, z) < 0 && standable(x, z, y)) addNode(x, y, z);
    }
  // Down every stair and the access road: one lane, or three on the wide ones.
  for (const r of ramps) {
    const w = r.x1 - r.x0;
    const lanes = w > 7 ? [0.2, 0.5, 0.8] : [0.5];
    for (const f of lanes)
      for (let z = r.z0 + 0.4; z < r.z1; z += 2.5) {
        const x = r.x0 + w * f;
        const y = surfaceAt(x, z, 50);
        if (y !== null && standable(x, z, y, R)) addNode(x, y, z);
      }
  }
  // Doorways: a node just outside and just inside each one.
  for (const d of doors) {
    addNode(d.x + d.nx * 1.3, d.y, d.z + d.nz * 1.3, true);
    addNode(d.x - d.nx * 1.2, d.y, d.z - d.nz * 1.2, true);
  }
  // Rooms (a fine grid, to find the aisles between desks), partition doorways, internal stairs.
  for (const room of rooms)
    for (let x = room.x0 + 0.6; x < room.x1 - 0.4; x += 1.3)
      for (let z = room.z0 + 0.6; z < room.z1 - 0.4; z += 1.3) if (standable(x, z, room.y, R + 0.05)) addNode(x, room.y, z, false, true);
  blocks.forEach((b, i) => {
    const zm = (b.z0 + b.z1) / 2;
    for (let f = 0; f < b.floors; f++) for (const xp of partitions[i]) for (const s of [-0.8, 0.8]) addNode(xp + s, b.base + f * FLOOR, zm, true);
    const st = stairs[i];
    if (st) {
      const zc = (st.z0 + st.z1) / 2;
      addNode(st.x0 - 0.5, st.y0, zc, true);
      const xm = (st.x0 + st.x1) / 2;
      addNode(xm, stairY(st, xm), zc, true);
      addNode(st.x1 + 0.4, st.y0 + FLOOR, zc, true);
    }
  });

  // Edges between nearby nodes that someone could walk between.
  const CELL = 7;
  const grid = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const k = `${Math.floor(n.x / CELL)},${Math.floor(n.z / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(i);
  });
  const adj: { to: number; w: number }[][] = nodes.map(() => []);
  nodes.forEach((a, i) => {
    const cx = Math.floor(a.x / CELL);
    const cz = Math.floor(a.z / CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const j of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (j <= i) continue;
          const b = nodes[j];
          const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
          // Neighbours only, on the fine indoor grid; further elsewhere.
          if (d > (a.room && b.room ? 1.9 : 6.3) || Math.abs(b.y - a.y) > 4.2) continue;
          if (!walkable(a, b) || !walkable(b, a)) continue;
          adj[i].push({ to: j, w: d });
          adj[j].push({ to: i, w: d });
        }
  });
  return adj;
}

/** Shortest-path tree toward one node: next[n] is the step from n toward the target. */
function treeToward(adj: { to: number; w: number }[][], target: number) {
  const dist = new Float64Array(adj.length).fill(Infinity);
  const next = new Int32Array(adj.length).fill(-1);
  dist[target] = 0;
  next[target] = target;
  // Binary heap of [dist, node].
  const heap: [number, number][] = [[0, target]];
  const push = (e: [number, number]) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, n] = pop();
    if (d > dist[n]) continue;
    for (const e of adj[n]) {
      const nd = d + e.w;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        next[e.to] = n;
        push([nd, e.to]);
      }
    }
  }
  return next;
}

// ---------- Places to be ----------

export type Pose = "stand" | "sit" | "lounge";
type Slot = { x: number; y: number; z: number; yaw: number; pose: Pose };
type Place = { anchor: number; slots: Slot[]; dwell: [number, number] };

const nearestNode = (x: number, y: number, z: number, ok: (n: NavNode, i: number) => boolean = () => true) => {
  let best = -1;
  let bd = Infinity;
  nodes.forEach((n, i) => {
    if (Math.abs(n.y - y) > 0.6 || !ok(n, i)) return;
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
};

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Appearance ----------

const SKIN = ["#6e4130", "#5a3324", "#8a5a3c", "#4a2a1e", "#a0704f", "#7a4a33", "#3d2219"];
const TOPS = ["#1a1a1b", "#f2f0ea", "#c0392b", "#2e86ab", "#f1c40f", "#3b8b5a", "#7b5ea7", "#e67e22", "#16a085", "#d35d6e", "#34495e", "#a0522d", "#5dade2", "#f5b7b1", "#2c3e50"];
const TROUSERS = ["#1f1f21", "#2b3440", "#3a3a39", "#4a4038", "#1d3557", "#6b5b4b", "#c8b89a"];
const HAIR = ["#141010", "#1e1612", "#2a1d15", "#0d0b0a"];
const SHOES = ["#f7f7f5", "#f7f7f5", "#1b1b1b", "#8b5a3c", "#c0392b"];

export type Look = { skin: string; top: string; trousers: string; hair: string; shoes: string; afro: boolean };

// ---------- Days ----------

/** One student's looping day: alternate walks (polylines) and stays (a pose at a slot). */
export type Day = {
  look: Look;
  period: number;
  offset: number;
  speed: number;
  /** Segment start times within the period; walks and stays alternate, starting with a walk. */
  starts: Float64Array;
  /** For walks: index into pts / cum. For stays: index into slots. */
  ref: Int32Array;
  isWalk: Uint8Array;
  pts: Float32Array; // x, y, z per point, all walks back to back
  cum: Float32Array; // distance along its walk at each point
  walkStart: Int32Array; // first point of each walk
  walkEnd: Int32Array;
  slots: Slot[];
};

export type Crowd = { days: Day[]; stats: { nodes: number; edges: number; seated: number; places: number; ms: number; unreachable: string[] } };

export function buildCrowd(): Crowd {
  const t0 = performance.now();
  nodes.length = 0;
  const adj = buildGraph();

  // Keep the part of the graph you can reach from the front plaza.
  const root = nearestNode(-14, 0, 22);
  const reach = new Uint8Array(nodes.length);
  const stack = [root];
  reach[root] = 1;
  while (stack.length) for (const e of adj[stack.pop()!]) if (!reach[e.to]) (reach[e.to] = 1), stack.push(e.to);
  const reachable = (_: NavNode, i: number) => reach[i] === 1;

  // Rooms with seats → one place each, anchored in the room's aisle.
  const roomPlace = new Map<number, number>();
  const places: Place[] = [];
  for (const room of rooms) {
    const zm = (blocks[room.block].z0 + blocks[room.block].z1) / 2;
    const anchor = nearestNode((room.x0 + room.x1) / 2, room.y, zm, (n, i) => reachable(n, i) && n.x > room.x0 && n.x < room.x1 && n.z > room.z0 && n.z < room.z1);
    if (anchor < 0) continue;
    roomPlace.set(room.id, places.length);
    places.push({ anchor, slots: [], dwell: [240, 900] });
  }
  const homeSeats = seats.filter((s) => roomPlace.has(s.room));
  const unreachable = rooms.filter((rm) => !roomPlace.has(rm.id) && seats.some((s) => s.room === rm.id)).map((rm) => `${blocks[rm.block].name}/${rm.floor}/${rm.x0.toFixed(1)}`);

  // Outdoors: standing groups on the terraces and lawn, people sitting on the grand stairs and the lawn.
  const outdoor: number[] = [];
  const rng = mulberry(42);
  const candidates = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n, i }) => reach[i] && !n.narrow && n.z > -60 /* not the car park */ && blockAt(n.x, n.z) < 0 && !ramps.some((r) => n.x > r.x0 - 1 && n.x < r.x1 + 1 && n.z > r.z0 - 1 && n.z < r.z1 + 1) && !blockedAt(n.x, n.z, n.y, 2.2))
    // A shuffle with fixed keys, so every browser's sort agrees.
    .map((c) => ({ ...c, key: rng() }))
    .sort((a, b) => a.key - b.key);
  const centres: { n: NavNode; i: number }[] = [];
  for (const c of candidates) {
    if (centres.length >= 30) break;
    if (centres.some((o) => Math.hypot(o.n.x - c.n.x, o.n.z - c.n.z) < 9)) continue;
    centres.push(c);
  }
  for (const { n, i } of centres) {
    const lounge = n.z > 27; // on the lawn, people sit
    const slots: Slot[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rng() * 0.3;
      const rad = lounge ? 1.3 : 0.95 + rng() * 0.25;
      const x = n.x + Math.sin(a) * rad;
      const z = n.z + Math.cos(a) * rad;
      slots.push({ x, y: surfaceAt(x, z, n.y + 0.5) ?? n.y, z, yaw: a + Math.PI, pose: lounge ? "lounge" : "stand" });
    }
    outdoor.push(places.length);
    places.push({ anchor: i, slots, dwell: lounge ? [180, 600] : [60, 360] });
  }
  // The grand stairs: rows of people sitting either side of a walkway, facing down the hill.
  const grand = ramps.find((r) => r.name === "Grand stairs")!;
  for (let z0 = grand.z0 + 3; z0 < grand.z1 - 3; z0 += 8) {
    const slots: Slot[] = [];
    for (let z = z0; z < z0 + 6; z += 1.0)
      for (let x = grand.x0 + 0.7; x < grand.x1 - 0.6; x += 0.85) {
        if (Math.abs(x) < 1.0) continue;
        const y = surfaceAt(x, z, 50);
        if (y !== null) slots.push({ x, y, z, yaw: 0, pose: "sit" });
      }
    const anchor = nearestNode(0, surfaceAt(0, z0 + 3, 50) ?? 0, z0 + 3, (n, i) => reachable(n, i) && Math.abs(n.x) < 1);
    if (anchor < 0 || !slots.length) continue;
    outdoor.push(places.length);
    places.push({ anchor, slots, dwell: [120, 480] });
  }

  // A route tree toward every place's anchor.
  const trees = places.map((p) => treeToward(adj, p.anchor));
  const route = (from: number, to: number) => {
    const next = trees[to];
    const out: number[] = [];
    let n = places[from].anchor;
    if (next[n] < 0) return null;
    while (n !== places[to].anchor && out.length < 400) {
      out.push(n);
      n = next[n];
    }
    out.push(n);
    return out;
  };

  // Seats spread across campus: a fixed shuffle so student 7 always sits in the same chair.
  const seatKey = homeSeats.map((_, i) => mulberry(i * 7919 + 1)());
  const seatOrder = homeSeats.map((_, i) => i).sort((a, b) => seatKey[a] - seatKey[b]);

  const days: Day[] = [];
  for (let s = 0; s < STUDENTS; s++) {
    const r = mulberry(1000 + s * 2654435761);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const look: Look = { skin: pick(SKIN), top: pick(TOPS), trousers: pick(TROUSERS), hair: pick(HAIR), shoes: pick(SHOES), afro: r() < 0.55 };

    // The loop: home seat, somewhere outdoors, home, somewhere else… (or outdoors only, if no seat).
    const seat = s < seatOrder.length ? homeSeats[seatOrder[s]] : null;
    const stops: { place: number; slot: Slot }[] = [];
    const legs = 6;
    for (let k = 0; k < legs; k++) {
      if (seat && k % 2 === 0) stops.push({ place: roomPlace.get(seat.room)!, slot: { x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw, pose: "sit" } });
      else {
        const p = places[pick(outdoor)];
        stops.push({ place: places.indexOf(p), slot: pick(p.slots) });
      }
    }

    const pts: number[] = [];
    const cum: number[] = [];
    const walkStart: number[] = [];
    const walkEnd: number[] = [];
    const starts: number[] = [];
    const ref: number[] = [];
    const isWalk: number[] = [];
    const slots: Slot[] = [];
    const speed = 1.1 + r() * 0.4;
    let t = 0;
    for (let k = 0; k < stops.length; k++) {
      const a = stops[k];
      const b = stops[(k + 1) % stops.length];
      const path = route(a.place, b.place);
      if (!path) continue;
      // Walk: from the slot, through the graph (each person drifting a little off the centre line), to the next slot.
      const first = pts.length / 3;
      let d = 0;
      const pushPt = (x: number, y: number, z: number) => {
        const n = pts.length;
        if (n / 3 > first) d += Math.hypot(x - pts[n - 3], y - pts[n - 2], z - pts[n - 1]);
        pts.push(x, y, z);
        cum.push(d);
      };
      pushPt(a.slot.x, a.slot.y, a.slot.z);
      for (const n of path) {
        const node = nodes[n];
        let ox = 0;
        let oz = 0;
        if (!node.narrow) {
          const spread = node.room ? 0.4 : 1.2;
          ox = (r() - 0.5) * spread;
          oz = (r() - 0.5) * spread;
          if (blockedAt(node.x + ox, node.z + oz, node.y, 0.3) || surfaceAt(node.x + ox, node.z + oz, node.y) !== node.y) ox = oz = 0;
        }
        pushPt(node.x + ox, node.y, node.z + oz);
      }
      pushPt(b.slot.x, b.slot.y, b.slot.z);
      walkStart.push(first);
      walkEnd.push(pts.length / 3 - 1);
      starts.push(t);
      ref.push(walkStart.length - 1);
      isWalk.push(1);
      t += d / speed;
      // Stay.
      const pl = places[b.place];
      starts.push(t);
      ref.push(slots.length);
      isWalk.push(0);
      slots.push(b.slot);
      t += pl.dwell[0] + r() * (pl.dwell[1] - pl.dwell[0]);
    }
    if (!starts.length) {
      // Nowhere reachable: stand still at the front plaza.
      const n = nodes[root];
      starts.push(0);
      ref.push(0);
      isWalk.push(0);
      slots.push({ x: n.x + (r() - 0.5) * 10, y: n.y, z: n.z + (r() - 0.5) * 4, yaw: r() * 6, pose: "stand" });
      t = 600;
    }
    days.push({
      look,
      period: t,
      offset: r() * t,
      speed,
      starts: Float64Array.from(starts),
      ref: Int32Array.from(ref),
      isWalk: Uint8Array.from(isWalk),
      pts: Float32Array.from(pts),
      cum: Float32Array.from(cum),
      walkStart: Int32Array.from(walkStart),
      walkEnd: Int32Array.from(walkEnd),
      slots,
    });
  }

  let edges = 0;
  for (const a of adj) edges += a.length;
  return {
    days,
    stats: { nodes: nodes.length, edges: edges / 2, seated: Math.min(STUDENTS, homeSeats.length), places: places.length, ms: Math.round(performance.now() - t0), unreachable },
  };
}
