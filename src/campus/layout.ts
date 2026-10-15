// ALU Kigali campus (MASS Design Group, 2020), rebuilt on the architects' own system.
//
// From the MASS project page:
//  · An 8.8 m × 8.8 m modular grid; each module holds up to 30 students.
//  · Circular pods (≈2.7 m) sit at the grid intersections, softening every corner and
//    housing stairs, lifts and risers; exterior pods are open-air learning spaces.
//  · Terraced over six levels down a steep 40 m slope; ~6,500 m² in total.
//  · Courtyards, terraces and open-air corridors; an 1,800 m³ stormwater retention pond;
//    light clay brick from Muhanga. (Its "large amphitheatre" is the indoor stair-seating.)
// The arrangement and the site (ridge, distant round pond with its ring path, stepped
// vegetable terraces, red-soil beds in front, the sandy platform up the slope) are read
// from aerial photographs, since no site plan is published.
//
// Units are metres. x runs east, z runs south (downhill toward the lawn), y is up.

export type Rect = { x0: number; x1: number; z0: number; z1: number };

export type Plaza = Rect & { y: number; name: string; paving?: string };

/** Stairs or a ramp: height goes from `yFrom` at z0 to `yTo` at z1. */
export type Ramp = Rect & { yFrom: number; yTo: number; along: "z" | "x"; stairs: boolean; name: string };

export type Block = Rect & {
  base: number;
  floors: number;
  radius: number;
  name: string;
  screen?: boolean;
  sign?: string;
  roofTerrace?: boolean;
  roofUnits?: boolean;
  plain?: string;
  /** Put pods on the grid corners (the MASS signature). Default true for brick blocks. */
  pods?: boolean;
};

export const G = 8.8; // grid module
export const FLOOR = 4;
export const POD_R = 1.5;

/** Grid helper: column/row index → metres. */
const g = (n: number) => +(n * G).toFixed(2);

// Six levels down the hill.
const L = { front: 0, mid: 4, spine: 8, upper: 12, parking: 22 };

/** The hillside: steep behind the building, easing across the lawn toward the pond. */
export function terrain(x: number, z: number) {
  let y: number;
  if (z < -50) y = 12 + (-50 - z) * 0.3;
  else if (z < 26) y = 12 - ((z + 50) / 76) * 12;
  // A near-level apron in front of the building…
  else if (z < 50) y = -(z - 26) * 0.04;
  // …then the ridge falls away to the south and west, toward the pond.
  else y = -0.96 - (z - 50) * 0.12;
  if (x < -58) y -= (-58 - x) * 0.09;
  return y + Math.sin(x * 0.04) * 0.5 + Math.cos(z * 0.03 + x * 0.015) * 0.4;
}

export const plazas: Plaza[] = [
  { name: "Parking", x0: -62, x1: 50, z0: -98, z1: -62, y: L.parking, paving: "#a19a91" },
  { name: "Upper terrace", x0: -62, x1: 62, z0: -52, z1: g(-3), y: L.upper },
  { name: "Spine level", x0: -56, x1: 56, z0: g(-3), z1: g(-1), y: L.spine },
  { name: "Mid terrace", x0: -56, x1: 56, z0: g(-1), z1: 0, y: L.mid },
  { name: "Front plaza", x0: -56, x1: 56, z0: 0, z1: 26, y: L.front },
];

export const ramps: Ramp[] = [
  // The grand stairs: one module wide, from the upper terrace to the front plaza.
  { name: "Grand stairs", x0: -G / 2, x1: G / 2, z0: g(-4), z1: 0, yFrom: L.upper, yTo: L.front, along: "z", stairs: true },
  { name: "West stairs", x0: -56, x1: -51, z0: g(-4), z1: 0, yFrom: L.upper, yTo: L.front, along: "z", stairs: true },
  { name: "East stairs", x0: 51, x1: 56, z0: g(-4), z1: 0, yFrom: L.upper, yTo: L.front, along: "z", stairs: true },
  { name: "West lawn steps", x0: -40, x1: -26, z0: 26, z1: 31, yFrom: L.front, yTo: -0.3, along: "z", stairs: true },
  { name: "East lawn steps", x0: 26, x1: 40, z0: 26, z1: 31, yFrom: L.front, yTo: -0.3, along: "z", stairs: true },
  { name: "Access road", x0: 50, x1: 62, z0: -98, z1: -52, yFrom: L.parking, yTo: L.upper, along: "z", stairs: false },
];

export const blocks: Block[] = [
  // Upper studios on the top terrace.
  { name: "Library", x0: g(-2.5), x1: g(-1), z0: g(-4), z1: g(-3), base: L.upper, floors: 2, radius: 1, roofUnits: true },
  { name: "North studios", x0: g(1), x1: g(3), z0: g(-4.5), z1: g(-3), base: L.upper, floors: 2, radius: 1, roofUnits: true },
  { name: "North annex", x0: g(3), x1: g(4.5), z0: g(-4), z1: g(-3), base: L.upper, floors: 1, radius: 1, roofUnits: true },
  // The spine, split by the grand stairs.
  { name: "West spine", x0: g(-5.5), x1: g(-0.5), z0: g(-3), z1: g(-1), base: L.spine, floors: 2, radius: 1, roofUnits: true },
  { name: "East spine", x0: g(0.5), x1: g(5.5), z0: g(-3), z1: g(-1), base: L.spine, floors: 2, radius: 1, roofUnits: true },
  // Mid row.
  { name: "West wing", x0: g(-5.5), x1: g(-3.5), z0: g(-1), z1: 0, base: L.mid, floors: 2, radius: 1, screen: true },
  { name: "Commons", x0: g(-2.5), x1: g(-1), z0: g(-1), z1: 0, base: L.mid, floors: 1, radius: 1, roofTerrace: true },
  { name: "Enterprise", x0: g(1), x1: g(3.5), z0: g(-1), z1: 0, base: L.mid, floors: 2, radius: 1, roofUnits: true },
  { name: "East wing", x0: g(4), x1: g(5.5), z0: g(-1), z1: 0, base: L.mid, floors: 2, radius: 1 },
  // Front row, at lawn level.
  { name: "West terrace house", x0: g(-5.5), x1: g(-3.5), z0: 0, z1: g(2), base: L.front, floors: 2, radius: 1, roofTerrace: true },
  { name: "Enterprise terrace", x0: g(1), x1: g(3.5), z0: 0, z1: g(2), base: L.front, floors: 2, radius: 1, sign: "ENTERPRISE", roofTerrace: true },
  { name: "East terrace house", x0: g(4), x1: g(5.5), z0: 0, z1: g(1), base: L.front, floors: 1, radius: 1, roofTerrace: true },
  // The service building behind, with its terracotta roof.
  { name: "Service building", x0: 30, x1: 50, z0: -51, z1: -41, base: L.upper, floors: 1, radius: 0.4, plain: "#d8c7b2", pods: false },
];

/** Every brick block gets a pod at each grid corner. */
export const drums = blocks
  .filter((b) => !b.plain && b.pods !== false)
  .flatMap((b) =>
    [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z1],
    ].map(([x, z]) => ({ x, z, r: POD_R, h: b.floors * FLOOR + 0.8, base: b.base })),
  );

/** Exterior pods: open-air learning rings on the terraces. */
export const openPods = [
  { x: -18, z: 14, base: L.front },
  { x: -10, z: 20, base: L.front },
  { x: 40, z: 18, base: L.front },
  { x: -44, z: 22, base: L.front },
];

/** The slab bridging the grand stairs between the two halves of the spine. */
export const canopy = { x0: -G / 2 - 1, x1: G / 2 + 1, z0: g(-2.6), z1: g(-1.6), y: L.spine + 2 * FLOOR - 0.6 };

/** Round planters with young trees. */
export const planters = [
  { x: 0, z: -17, r: 1.6 },
  { x: 0, z: -5, r: 1.6 },
  { x: -30, z: 20, r: 1.4 },
  { x: 24, z: 22, r: 1.4 },
];

export const pergolas = [
  { x0: g(-2.5), x1: g(-1), z0: g(-1), z1: 0, y: L.mid + FLOOR, h: 3 },
  { x0: g(-5.5) + 1, x1: g(-4.2), z0: 2, z1: g(2) - 2, y: L.front + 2 * FLOOR, h: 3 },
];

/** Exterior spiral stair at the east end of the spine. */
export const spiral = { x: 58.5, z: -14, r: 3, y0: L.front, y1: L.spine + 2 * FLOOR };

/** Stormwater retention pond, far down the slope to the south-west, round, with a ring path. */
export const pond = { x: -112, z: 128, rx: 24, rz: 24 };

/** Red-soil planting beds on the apron in front of the Enterprise wing. */
export const beds = [
  { x0: -6, x1: 8, z0: 28, z1: 34 },
  { x0: 10, x1: 26, z0: 30, z1: 37 },
  { x0: -24, x1: -10, z0: 30, z1: 36 },
];

/** Stepped vegetable terraces on the slope between the building and the pond. */
export const terraces = { x0: -92, x1: -44, z0: 46, z1: 92, rows: 9 };

/** The sandy square platform up the slope. */
export const platform = { x: -40, z: -128, size: 22 };

/** Small single-storey outbuilding on the lawn. */
export const outbuilding = { x: -48, z: 52, w: 8, d: 5, h: 3 };

const inside = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Walkable surface height at a point. */
export function heightAt(x: number, z: number) {
  for (const r of ramps) {
    if (inside(r, x, z)) {
      const t = (z - r.z0) / (r.z1 - r.z0);
      const y = r.yFrom + (r.yTo - r.yFrom) * t;
      return r.stairs ? Math.round(y / 0.18) * 0.18 : y;
    }
  }
  for (const p of plazas) if (inside(p, x, z)) return p.y;
  return terrain(x, z);
}

export const colliders: Rect[] = [
  ...blocks.map((b) => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 })),
  ...drums.map((d) => ({ x0: d.x - d.r, x1: d.x + d.r, z0: d.z - d.r, z1: d.z + d.r })),
  ...planters.map((p) => ({ x0: p.x - p.r, x1: p.x + p.r, z0: p.z - p.r, z1: p.z + p.r })),
  ...openPods.map((p) => ({ x0: p.x - POD_R, x1: p.x + POD_R, z0: p.z - POD_R, z1: p.z + POD_R })),
  { x0: spiral.x - spiral.r, x1: spiral.x + spiral.r, z0: spiral.z - spiral.r, z1: spiral.z + spiral.r },
  {
    x0: outbuilding.x - outbuilding.w / 2,
    x1: outbuilding.x + outbuilding.w / 2,
    z0: outbuilding.z - outbuilding.d / 2,
    z1: outbuilding.z + outbuilding.d / 2,
  },
];

export function blocked(x: number, z: number, r = 0.45) {
  if (((x - pond.x) / pond.rx) ** 2 + ((z - pond.z) / pond.rz) ** 2 < 1) return true;
  return colliders.some((c) => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);
}

export function placeName(x: number, z: number) {
  if (((x - pond.x) / (pond.rx + 8)) ** 2 + ((z - pond.z) / (pond.rz + 8)) ** 2 < 1) return "Retention pond";
  if (inside(terraces, x, z)) return "Vegetable terraces";
  if (Math.abs(x - platform.x) < platform.size / 2 && Math.abs(z - platform.z) < platform.size / 2) return "The platform";
  for (const r of ramps) if (inside(r, x, z)) return r.name;
  for (const b of blocks)
    if (inside({ x0: b.x0 - 3, x1: b.x1 + 3, z0: b.z0 - 3, z1: b.z1 + 3 }, x, z) && Math.abs(heightAt(x, z) - b.base) < 1)
      return `By the ${b.name.toLowerCase()}`;
  for (const p of plazas) if (inside(p, x, z)) return p.name;
  return z > 26 ? "The lawn" : "Hillside";
}

export const spawn = { x: -14, z: 24 };
