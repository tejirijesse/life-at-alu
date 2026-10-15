// Inside the buildings. Every block in layout.ts becomes a hollow brick shell: ribbon windows
// you can see through, floor slabs, an internal stair up to the first floor, partition walls on
// the 8.8 m grid (one module, about 30 students), and furniture in every room.
//
// It also gives the world a height-aware sense of "where can I stand?" (surfaceAt) and
// "what's in my way?" (blockedAt), shared by the player and the simulated crowd.
//
// Doors are found, not placed: a door goes wherever a wall faces open ground at the same level
// as that floor, so the spine opens onto the upper terrace from its first floor, and so on.

import { blocks, blocked as blockedOutdoors, drums, FLOOR, G, heightAt, POD_R, type Block } from "./layout";

export const WALL = 0.3;
export const SLAB = 0.25;
export const SILL = 0.78;
export const HEAD = 2.33;
export const DOOR_W = 2.4;
/** Tallest step a person can take; matches the outdoor stair rule. */
export const STEP = 0.75;

export const RISE = 0.2;
export const TREAD = 0.26;
const RUN = (FLOOR / RISE) * TREAD; // 5.2 m: ends clear of the first partition
const STAIR_W = 1.5;

export type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
export type Face = "n" | "s" | "w" | "e";
export type Door = { block: number; floor: number; face: Face; x: number; z: number; y: number; nx: number; nz: number };
export type Stair = { block: number; x0: number; x1: number; z0: number; z1: number; y0: number };
export type RoomKind = "classroom" | "studio" | "library" | "commons" | "dining";
export type Room = { id: number; block: number; floor: number; kind: RoomKind; x0: number; x1: number; z0: number; z1: number; y: number };
export type Seat = { x: number; y: number; z: number; yaw: number; room: number };
type Rect = { x0: number; x1: number; z0: number; z1: number };

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** Index of the building whose footprint contains the point (strictly), or -1. */
export function blockAt(x: number, z: number) {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return i;
  }
  return -1;
}

// ---------- Stairs, partitions, doors ----------

/** Two-storey buildings get a straight stair along the north wall, rising eastward. */
export const stairs: (Stair | null)[] = blocks.map((b, i) => {
  if (b.floors < 2) return null; // every block is one or two storeys
  const x0 = b.x0 + 2.3; // clear of the round corner pod, with a landing
  const z0 = b.z0 + WALL + 0.05;
  return { block: i, x0, x1: x0 + RUN, z0, z1: z0 + STAIR_W, y0: b.base };
});

export function stairY(s: Stair, x: number) {
  const k = Math.min(FLOOR / RISE, Math.max(0, Math.ceil((x - s.x0) / TREAD - 1e-6)));
  return s.y0 + k * RISE;
}

/** Partition walls on the 8.8 m grid, for buildings long enough to hold more than one module. */
const partitionsOf = (b: Block) => {
  if (b.plain || b.x1 - b.x0 < 2 * G - 0.01) return [];
  const xs: number[] = [];
  for (let k = 1; b.x0 + k * G < b.x1 - 4; k++) xs.push(+(b.x0 + k * G).toFixed(2));
  return xs;
};
export const partitions = blocks.map(partitionsOf);

/** Room segments along x, between partitions. */
const segmentsOf = (i: number) => {
  const b = blocks[i];
  const edges = [b.x0, ...partitions[i], b.x1];
  return edges.slice(1).map((x1, k) => ({ x0: edges[k], x1 }));
};

const faceInfo = (b: Block, f: Face) => {
  const alongX = f === "n" || f === "s";
  const c = b.plain ? 0 : b.radius;
  return {
    alongX,
    at: f === "n" ? b.z0 : f === "s" ? b.z1 : f === "w" ? b.x0 : b.x1,
    nx: f === "w" ? -1 : f === "e" ? 1 : 0,
    nz: f === "n" ? -1 : f === "s" ? 1 : 0,
    s0: alongX ? b.x0 + c : b.z0 + c,
    s1: alongX ? b.x1 - c : b.z1 - c,
    mid: alongX ? (b.x0 + b.x1) / 2 : (b.z0 + b.z1) / 2,
    len: alongX ? b.x1 - b.x0 : b.z1 - b.z0,
  };
};
const FACES: Face[] = ["n", "s", "w", "e"];

/** Where a door could go on a face, best first: one per room segment, preferring 72% along. */
function doorPositions(i: number, f: Face) {
  const b = blocks[i];
  const fi = faceInfo(b, f);
  if (!fi.alongX) return [fi.mid];
  const segs = segmentsOf(i);
  const want = b.x0 + 0.75 * (b.x1 - b.x0);
  if (segs.length === 1) return [want];
  return segs
    .map((s, k) => ({ x: (s.x0 + s.x1) / 2, k }))
    .filter(({ k }) => !(k === 0 && f === "n" && stairs[i]))
    .sort((a, c) => Math.abs(a.x - want) - Math.abs(c.x - want))
    .map(({ x }) => x);
}

const nearDrum = (x: number, z: number, pad: number) => drums.some((d) => Math.hypot(x - d.x, z - d.z) < d.r + pad);

export const doors: Door[] = [];
blocks.forEach((b, i) => {
  for (let floor = 0; floor < b.floors; floor++) {
    const y = b.base + floor * FLOOR;
    for (const face of FACES) {
      if (b.screen && face === "s" && floor > 0) continue;
      const fi = faceInfo(b, face);
      const opens = (x: number, z: number) =>
        [1.2, 2.2].every((out) => {
          const px = x + fi.nx * out;
          const pz = z + fi.nz * out;
          return blockAt(px, pz) < 0 && Math.abs(heightAt(px, pz) - y) < 0.3 && !blockedOutdoors(px, pz, 0.5) && !nearDrum(px, pz, 0.6);
        });
      const pos = doorPositions(i, face).find((p) => (fi.alongX ? opens(p, fi.at) : opens(fi.at, p)));
      if (pos === undefined) continue;
      const x = fi.alongX ? pos : fi.at;
      const z = fi.alongX ? fi.at : pos;
      doors.push({ block: i, floor, face, x, z, y, nx: fi.nx, nz: fi.nz });
    }
  }
});

// ---------- Walls, windows, frames (render data + colliders) ----------

export type Piece = Box & { kind: "brick" | "plain" | "plaster" };
export const pieces: Piece[] = [];
export const panes: Box[] = [];
export const mullions: Box[] = [];
export const frames: Box[] = [];

/** [a,b] minus the given gaps. */
function cut(a: number, b: number, gaps: [number, number][]) {
  let out: [number, number][] = [[a, b]];
  for (const [g0, g1] of gaps)
    out = out.flatMap(([s, e]) => (g1 <= s || g0 >= e ? [[s, e] as [number, number]] : ([[s, g0], [g1, e]] as [number, number][]).filter(([p, q]) => q - p > 0.05)));
  return out.filter(([s, e]) => e - s > 0.05);
}

blocks.forEach((b, i) => {
  const kind = b.plain ? "plain" : "brick";
  for (let floor = 0; floor < b.floors; floor++) {
    const y0 = b.base + floor * FLOOR;
    const y1 = y0 + FLOOR;
    for (const face of FACES) {
      const fi = faceInfo(b, face);
      const gaps = doors
        .filter((d) => d.block === i && d.floor === floor && d.face === face)
        .map((d) => {
          const p = fi.alongX ? d.x : d.z;
          return [p - DOOR_W / 2, p + DOOR_W / 2] as [number, number];
        });
      // A slice of this face's wall, from s to e along the face and ya to yb in height.
      const wall = (s: number, e: number, ya: number, yb: number, k: Piece["kind"] = kind) => {
        if (e - s < 0.05 || yb - ya < 0.05) return;
        const across = face === "n" || face === "w" ? [fi.at, fi.at + WALL] : [fi.at - WALL, fi.at];
        pieces.push(
          fi.alongX
            ? { x0: s, x1: e, z0: across[0], z1: across[1], y0: ya, y1: yb, kind: k }
            : { x0: across[0], x1: across[1], z0: s, z1: e, y0: ya, y1: yb, kind: k },
        );
      };
      // Below the door head, doorways are cut out; above it the wall runs through.
      const wallWithDoors = (s: number, e: number, ya: number, yb: number) => {
        const head = y0 + HEAD;
        if (ya < head) for (const [p, q] of cut(s, e, gaps)) wall(p, q, ya, Math.min(yb, head));
        if (yb > head) wall(s, e, Math.max(ya, head), yb);
      };

      const solid = b.screen && face === "s" && floor > 0;
      const L = fi.len - 2 * b.radius - 1.2;
      if (solid || L < 2) {
        wallWithDoors(fi.s0, fi.s1, y0, y1);
        continue;
      }
      const p0 = fi.mid - L / 2;
      const p1 = fi.mid + L / 2;
      wallWithDoors(fi.s0, p0, y0, y1);
      wallWithDoors(p1, fi.s1, y0, y1);
      wallWithDoors(p0, p1, y0, y0 + SILL); // sill
      wall(p0, p1, y0 + HEAD, y1); // head

      // Glass in the ribbon window, just proud of the wall, and its mullions.
      const out = fi.nx + fi.nz > 0 ? 0.06 : -0.06;
      for (const [p, q] of cut(p0, p1, gaps)) {
        const t0 = fi.at + out - 0.04;
        const t1 = fi.at + out + 0.04;
        panes.push(fi.alongX ? { x0: p, x1: q, z0: t0, z1: t1, y0: y0 + SILL, y1: y0 + HEAD } : { x0: t0, x1: t1, z0: p, z1: q, y0: y0 + SILL, y1: y0 + HEAD });
        const n = Math.max(1, Math.round((q - p) / 1.6));
        for (let k = 0; k <= n; k++) {
          const c = p + ((q - p) * k) / n;
          const m0 = fi.at + out + Math.sign(out) * 0.04 - 0.05;
          mullions.push(
            fi.alongX
              ? { x0: c - 0.045, x1: c + 0.045, z0: m0, z1: m0 + 0.1, y0: y0 + SILL - 0.02, y1: y0 + HEAD + 0.02 }
              : { x0: m0, x1: m0 + 0.1, z0: c - 0.045, z1: c + 0.045, y0: y0 + SILL - 0.02, y1: y0 + HEAD + 0.02 },
          );
        }
      }
      // Dark frames around each doorway.
      for (const [g0, g1] of gaps) {
        const inner = fi.at + WALL * (face === "n" || face === "w" ? 1 : -1);
        const lo = Math.min(fi.at, inner) - 0.05;
        const hi = Math.max(fi.at, inner) + 0.05;
        for (const g of [g0, g1])
          frames.push(fi.alongX ? { x0: g - 0.07, x1: g + 0.07, z0: lo, z1: hi, y0, y1: y0 + HEAD } : { x0: lo, x1: hi, z0: g - 0.07, z1: g + 0.07, y0, y1: y0 + HEAD });
        frames.push(fi.alongX ? { x0: g0, x1: g1, z0: lo, z1: hi, y0: y0 + HEAD - 0.1, y1: y0 + HEAD } : { x0: lo, x1: hi, z0: g0, z1: g1, y0: y0 + HEAD - 0.1, y1: y0 + HEAD });
      }
    }

    // Partition walls, each with a doorway through the middle.
    const zm = (b.z0 + b.z1) / 2;
    for (const xp of partitions[i]) {
      const top = y1 - SLAB;
      const p = (z0: number, z1: number, ya: number, yb: number) => pieces.push({ x0: xp - 0.08, x1: xp + 0.08, z0, z1, y0: ya, y1: yb, kind: "plaster" });
      p(b.z0 + WALL, zm - 1.1, y0, top);
      p(zm + 1.1, b.z1 - WALL, y0, top);
      p(zm - 1.1, zm + 1.1, y0 + 2.4, top);
    }
  }
});

/** Rails around the stairwell on the first floor. */
export const rails: Box[] = [];
for (const s of stairs) {
  if (!s) continue;
  const y = s.y0 + FLOOR;
  rails.push({ x0: s.x0, x1: s.x1, z0: s.z1 - 0.03, z1: s.z1 + 0.03, y0: y + 0.95, y1: y + 1.0 });
  rails.push({ x0: s.x0 - 0.03, x1: s.x0 + 0.03, z0: s.z0, z1: s.z1, y0: y + 0.95, y1: y + 1.0 });
  for (let x = s.x0; x <= s.x1 + 0.01; x += 1.0) rails.push({ x0: x - 0.025, x1: x + 0.025, z0: s.z1 - 0.025, z1: s.z1 + 0.025, y0: y, y1: y + 0.97 });
}

// ---------- Rooms and furniture ----------

export const rooms: Room[] = [];
export const seats: Seat[] = [];
export type Item = Box & { kind: "desk" | "table" | "round" | "shelf" | "board" | "light" };
export const items: Item[] = [];
export const chairs: { x: number; y: number; z: number; yaw: number }[] = [];

const kindOf = (b: Block, floor: number, k: number): RoomKind => {
  if (b.name === "Library") return "library";
  if (b.name === "Commons") return "commons";
  if (b.name === "Service building") return "dining";
  if (floor === 0 && /terrace|Enterprise/.test(b.name)) return "studio";
  return (k + floor) % 3 === 2 ? "studio" : "classroom";
};

blocks.forEach((b, i) => {
  const segs = segmentsOf(i);
  const zm = (b.z0 + b.z1) / 2;
  const st = stairs[i];
  for (let floor = 0; floor < b.floors; floor++) {
    const y = b.base + floor * FLOOR;
    segs.forEach((seg, k) => {
      const room: Room = {
        id: rooms.length,
        block: i,
        floor,
        kind: kindOf(b, floor, k),
        x0: seg.x0 + (seg.x0 === b.x0 ? WALL : 0.08),
        x1: seg.x1 - (seg.x1 === b.x1 ? WALL : 0.08),
        z0: b.z0 + WALL,
        z1: b.z1 - WALL,
        y,
      };
      rooms.push(room);

      // Keep clear: corner pods, the stair and its landings, doorways, the central aisle.
      const keepClear: Rect[] = [];
      if (!b.plain && b.pods !== false)
        for (const [cx, cz] of [
          [b.x0, b.z0],
          [b.x1, b.z0],
          [b.x0, b.z1],
          [b.x1, b.z1],
        ])
          keepClear.push({ x0: cx - POD_R - 0.4, x1: cx + POD_R + 0.4, z0: cz - POD_R - 0.4, z1: cz + POD_R + 0.4 });
      if (st && floor <= 1) keepClear.push({ x0: st.x0 - (floor === 0 ? 2 : 0.6), x1: st.x1 + (floor === 1 ? 2 : 0.6), z0: st.z0 - 0.6, z1: st.z1 + 0.9 });
      for (const d of doors)
        if (d.block === i && d.floor === floor) {
          const half = DOOR_W / 2 + 0.6;
          keepClear.push(
            d.nz
              ? { x0: d.x - half, x1: d.x + half, z0: Math.min(d.z, d.z - d.nz * 3.2), z1: Math.max(d.z, d.z - d.nz * 3.2) }
              : { x0: Math.min(d.x, d.x - d.nx * 3.2), x1: Math.max(d.x, d.x - d.nx * 3.2), z0: d.z - half, z1: d.z + half },
          );
        }
      for (const xp of partitions[i]) keepClear.push({ x0: xp - 1.7, x1: xp + 1.7, z0: zm - 1.6, z1: zm + 1.6 });
      keepClear.push({ x0: room.x0, x1: room.x1, z0: zm - 1.2, z1: zm + 1.2 });

      // Lay out cells of cw × cd across the room; place() returns the cell's footprint and fills it.
      // Lay out cells of cw × cd on each side of the central aisle, skipping anything in the way.
      const grid = (cw: number, cd: number, left: number, place: (cx: number, cz: number, ix: number) => void, fp: (cx: number, cz: number) => Rect) => {
        const ux0 = room.x0 + left;
        const ux1 = room.x1 - 0.5;
        const nx = Math.floor((ux1 - ux0) / cw);
        const sx = ux0 + (ux1 - ux0 - nx * cw) / 2 + cw / 2;
        for (const [uz0, uz1] of [
          [room.z0 + 0.4, zm - 1.2],
          [zm + 1.2, room.z1 - 0.4],
        ]) {
          // A shallow half still takes one row if the furniture itself fits.
          const span = uz1 - uz0;
          const probe = fp(0, 0);
          const nz = Math.max(Math.floor(span / cd), span >= probe.z1 - probe.z0 + 0.2 ? 1 : 0);
          const sz = uz0 + (uz1 - uz0 - nz * cd) / 2 + cd / 2;
          for (let ix = 0; ix < nx; ix++)
            for (let iz = 0; iz < nz; iz++) {
              const cx = sx + ix * cw;
              const cz = sz + iz * cd;
              if (keepClear.some((r) => overlaps(r, fp(cx, cz)))) continue;
              place(cx, cz, ix);
            }
        }
      };
      const seat = (x: number, z: number, yaw: number) => {
        chairs.push({ x, y, z, yaw });
        seats.push({ x, y: y + 0.38, z, yaw, room: room.id }); // seat height suits the figures' proportions
      };
      const item = (kind: Item["kind"], cx: number, cz: number, w: number, d: number, h: number, lift = 0) =>
        items.push({ kind, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: y + lift, y1: y + lift + h });

      if (room.kind === "classroom") {
        // Rows of two-person desks facing a pair of whiteboards on the west wall.
        for (const half of [-1, 1]) {
          const zc = half < 0 ? (room.z0 + zm - 1.2) / 2 : (zm + 1.2 + room.z1) / 2;
          const span = Math.min(2.6, (zm - 1.2 - room.z0) - 0.6);
          if (span > 1) item("board", room.x0 + 0.04, zc, 0.04, span, 1.2, 0.95);
        }
        grid(1.7, 1.9, 2.2, (cx, cz) => {
          item("desk", cx, cz, 0.6, 1.4, 0.66);
          seat(cx + 0.55, cz - 0.35, -Math.PI / 2);
          seat(cx + 0.55, cz + 0.35, -Math.PI / 2);
        }, (cx, cz) => ({ x0: cx - 0.3, x1: cx + 0.85, z0: cz - 0.75, z1: cz + 0.75 }));
      } else if (room.kind === "studio") {
        grid(2.6, 2.6, 0.5, (cx, cz) => {
          item("round", cx, cz, 1.2, 1.2, 0.66);
          for (let a = 0; a < 4; a++) {
            const t = (a * Math.PI) / 2 + Math.PI / 4;
            seat(cx + Math.sin(t) * 0.85, cz + Math.cos(t) * 0.85, t + Math.PI);
          }
        }, (cx, cz) => ({ x0: cx - 1.15, x1: cx + 1.15, z0: cz - 1.15, z1: cz + 1.15 }));
      } else if (room.kind === "library") {
        grid(2.4, 2.6, 0.5, (cx, cz, ix) => {
          if (ix % 2 === 0) {
            item("shelf", cx, cz, 0.5, 2.2, 2.1);
            return;
          }
          item("table", cx, cz, 0.8, 1.6, 0.66);
          for (const sx of [-1, 1]) for (const sz of [-0.4, 0.4]) seat(cx + sx * 0.6, cz + sz, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
        }, (cx, cz) => ({ x0: cx - 0.95, x1: cx + 0.95, z0: cz - 1.15, z1: cz + 1.15 }));
      } else {
        // Commons and dining: long tables, three a side.
        grid(3.0, 2.8, 0.5, (cx, cz) => {
          item("table", cx, cz, 2.2, 0.9, 0.66);
          for (const sx of [-0.7, 0, 0.7]) {
            seat(cx + sx, cz + 0.65, Math.PI);
            seat(cx + sx, cz - 0.65, 0);
          }
        }, (cx, cz) => ({ x0: cx - 1.2, x1: cx + 1.2, z0: cz - 1.05, z1: cz + 1.05 }));
      }

      // Two ceiling light panels per room.
      const top = y + FLOOR - SLAB - 0.04;
      for (const t of [0.3, 0.7]) item("light", room.x0 + (room.x1 - room.x0) * t, zm, Math.min(2.4, (room.x1 - room.x0) * 0.3), 0.6, 0.04, top - y);
    });
  }
});

// ---------- Collision ----------

export const colliders: Box[] = [
  ...pieces,
  ...items.filter((it) => it.kind !== "board" && it.kind !== "light").map((it) => ({ ...it, x0: it.x0 - 0.05, x1: it.x1 + 0.05, z0: it.z0 - 0.05, z1: it.z1 + 0.05 })),
];

const CELL = 4;
const key = (ix: number, iz: number) => (ix + 512) * 1024 + (iz + 512);
const buckets = new Map<number, number[]>();
colliders.forEach((c, n) => {
  for (let ix = Math.floor(c.x0 / CELL); ix <= Math.floor(c.x1 / CELL); ix++)
    for (let iz = Math.floor(c.z0 / CELL); iz <= Math.floor(c.z1 / CELL); iz++) {
      const k = key(ix, iz);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(n);
    }
});

/** Is a body of radius r standing with its feet at height y at (x, z) in something? */
export function blockedAt(x: number, z: number, y: number, r = 0.45) {
  if (blockedOutdoors(x, z, r)) return true;
  const lo = y + 0.2;
  const hi = y + 1.7;
  // The corner pods are round.
  for (const d of drums) if (hi > d.base && lo < d.base + d.h && (x - d.x) ** 2 + (z - d.z) ** 2 < (d.r + r) ** 2) return true;
  for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++)
    for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
      const list = buckets.get(key(ix, iz));
      if (!list) continue;
      for (const n of list) {
        const c = colliders[n];
        if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r && hi > c.y0 && lo < c.y1) return true;
      }
    }
  return false;
}

/**
 * The surface someone at height y would stand on at (x, z): the highest floor, stair tread or
 * terrace no more than a step above them. null where there's nothing (under the stairs).
 */
export function surfaceAt(x: number, z: number, y: number): number | null {
  const bi = blockAt(x, z);
  if (bi < 0) return heightAt(x, z);
  const b = blocks[bi];
  const s = stairs[bi];
  const onStair = !!s && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1;
  let best = -Infinity;
  for (let f = 0; f < b.floors; f++) {
    if (onStair && f <= 1) continue; // the stair replaces the ground floor, and the first floor has a hole
    const fy = b.base + f * FLOOR;
    if (fy <= y + STEP && fy > best) best = fy;
  }
  if (onStair) {
    const sy = stairY(s, x);
    if (sy <= y + STEP && sy > best) best = sy;
  }
  return best === -Infinity ? null : best;
}

/** The open volume of the floor someone is on, for keeping the camera indoors. */
export function interiorAt(x: number, z: number, y: number): Box | null {
  const bi = blockAt(x, z);
  if (bi < 0) return null;
  const b = blocks[bi];
  const f = Math.max(0, Math.min(b.floors - 1, Math.floor((y - b.base + 0.3) / FLOOR)));
  const s = stairs[bi];
  const onStair = !!s && x > s.x0 - 0.5 && x < s.x1 + 0.5 && z > s.z0 - 0.5 && z < s.z1 + 0.5;
  // Between the partitions either side, or across both rooms while in a partition doorway.
  let x0 = b.x0 + WALL;
  let x1 = b.x1 - WALL;
  for (const xp of partitions[bi]) {
    if (Math.abs(x - xp) < 1.2) continue;
    if (xp < x) x0 = Math.max(x0, xp + 0.08);
    else x1 = Math.min(x1, xp - 0.08);
  }
  return {
    x0: x0 + 0.25,
    x1: x1 - 0.25,
    z0: b.z0 + WALL + 0.25,
    z1: b.z1 - WALL - 0.25,
    y0: b.base + f * FLOOR + 0.3,
    y1: b.base + (onStair ? 2 : f + 1) * FLOOR - SLAB - 0.25,
  };
}

const ORDINAL = ["ground floor", "first floor", "second floor"];
/** "Library · first floor", or null outdoors. */
export function indoorName(x: number, z: number, y: number) {
  const bi = blockAt(x, z);
  if (bi < 0) return null;
  const b = blocks[bi];
  const f = Math.max(0, Math.min(b.floors - 1, Math.round((y - b.base) / FLOOR)));
  return `${b.name} · ${ORDINAL[f]}`;
}
