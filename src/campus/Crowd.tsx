// Draws the 1,200 simulated students from students.ts. Each body part is one InstancedMesh shared
// by everyone (torsos, heads, legs…), so the whole crowd is eight draw calls. People walking
// are re-posed every frame; people sitting or standing are posed once when they arrive.

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { buildCrowd, type Crowd as CrowdData, type Day } from "./students";

const hairCap = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, 1.3);
const lo = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 2, 6);
const ball = () => new THREE.SphereGeometry(1, 8, 6);

/** Body parts, sized like the player figures, with any fixed shaping baked into the geometry. */
const PARTS = {
  torso: { geo: lo(0.2, 0.22).scale(1.1, 1, 0.82), per: 1 },
  pelvis: { geo: ball().scale(0.2, 0.13, 0.16), per: 1 },
  head: { geo: ball().scale(0.34, 0.355, 0.325), per: 1 },
  hair: { geo: hairCap, per: 1 },
  leg: { geo: lo(0.08, 0.18), per: 4 }, // thigh L/R, shin L/R
  shoe: { geo: lo(0.07, 0.11).rotateX(Math.PI / 2).scale(1, 0.7, 1), per: 2 },
  arm: { geo: lo(0.06, 0.3), per: 2 },
  hand: { geo: ball().scale(0.058, 0.066, 0.058), per: 2 },
};
type PartName = keyof typeof PARTS;

/**
 * Write one part's matrix: root at (x, y, z) turned by yaw; the part hangs from `pivot`
 * (body space), swings by `a` about x, then sits at `off` in its swung frame, scaled by s.
 */
function put(arr: Float32Array, i: number, x: number, y: number, z: number, cy: number, sy: number, px: number, py: number, pz: number, a: number, ox: number, oy: number, oz: number, s = 1, sx = s, sz = s) {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  // R = Ry(yaw) · Rx(a)
  const r00 = cy, r01 = sy * sn, r02 = sy * c;
  const r10 = 0, r11 = c, r12 = -sn;
  const r20 = -sy, r21 = cy * sn, r22 = cy * c;
  // Offset in the swung frame, plus the pivot, turned by yaw.
  const vx = px + ox;
  const vy = py + c * oy - sn * oz;
  const vz = pz + sn * oy + c * oz;
  const o = i * 16;
  arr[o] = r00 * sx; arr[o + 1] = r10 * sx; arr[o + 2] = r20 * sx; arr[o + 3] = 0;
  arr[o + 4] = r01 * s; arr[o + 5] = r11 * s; arr[o + 6] = r21 * s; arr[o + 7] = 0;
  arr[o + 8] = r02 * sz; arr[o + 9] = r12 * sz; arr[o + 10] = r22 * sz; arr[o + 11] = 0;
  arr[o + 12] = x + cy * vx + sy * vz; arr[o + 13] = y + vy; arr[o + 14] = z - sy * vx + cy * vz; arr[o + 15] = 1;
}

type Meshes = Record<PartName, THREE.InstancedMesh>;

/** Pose one student. phase/amp drive walking; sit 1 = on a chair or step, lounge 1 = legs out on the grass. */
function pose(m: Meshes, i: number, d: Day, x: number, y: number, z: number, yaw: number, phase: number, amp: number, sit: number, lounge: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const sw = Math.sin(phase);
  const cw = Math.cos(phase);
  const seated = Math.max(sit, lounge);
  // Sitting drops the hips onto the seat (thighs resting on it).
  const by = y - seated * 0.59;

  const A = (n: PartName) => m[n].instanceMatrix.array as Float32Array;
  put(A("torso"), i, x, by, z, cy, sy, 0, 0.94, 0, 0, 0, 0, 0);
  put(A("pelvis"), i, x, by, z, cy, sy, 0, 0.7, 0, 0, 0, 0, 0);
  put(A("head"), i, x, by, z, cy, sy, 0, 1.55, 0, 0, 0, 0, 0);
  if (d.look.afro) put(A("hair"), i, x, by, z, cy, sy, 0, 1.61, -0.04, -0.42, 0, 0, 0, 0.385, 0.405, 0.4);
  else put(A("hair"), i, x, by, z, cy, sy, 0, 1.56, -0.01, -0.34, 0, 0, 0, 0.36, 0.348, 0.335);

  const legs = A("leg");
  const shoes = A("shoe");
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1;
    const swing = side * sw * 0.5 * amp;
    const hip = swing * (1 - seated) - (Math.PI / 2) * seated;
    const knee = (Math.max(0, side * cw) * 0.7 * amp + 0.04 * amp) * (1 - seated) + (Math.PI / 2) * sit;
    const hx = side * 0.1;
    put(legs, i * 4 + k, x, by, z, cy, sy, hx, 0.68, 0, hip, 0, -0.16, 0);
    // The knee, carried round by the hip.
    const ky = 0.68 - Math.cos(hip) * 0.32;
    const kz = -Math.sin(hip) * 0.32;
    put(legs, i * 4 + 2 + k, x, by, z, cy, sy, hx, ky, kz, hip + knee, 0, -0.15, 0);
    put(shoes, i * 2 + k, x, by, z, cy, sy, hx, ky, kz, hip + knee, 0, -0.31, 0.05);
  }
  const arms = A("arm");
  const hands = A("hand");
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1;
    const a = -side * sw * 0.42 * amp * (1 - seated) - 0.55 * sit + 0.45 * lounge;
    put(arms, i * 2 + k, x, by, z, cy, sy, side * 0.255, 1.14, 0, a, 0, -0.2, 0);
    put(hands, i * 2 + k, x, by, z, cy, sy, side * 0.255, 1.14, 0, a, 0, -0.45, 0.005);
  }
}

const dirty = (m: Meshes) => {
  for (const k in m) m[k as PartName].instanceMatrix.needsUpdate = true;
};

function CrowdMeshes({ data }: { data: CrowdData }) {
  const [meshes] = useState(() => {
    const n = data.days.length;
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 });
    const out = {} as Meshes;
    for (const [name, p] of Object.entries(PARTS) as [PartName, (typeof PARTS)[PartName]][]) {
      const im = new THREE.InstancedMesh(p.geo, mat, n * p.per);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = true;
      im.receiveShadow = true;
      out[name] = im;
    }
    // Colours, once.
    const c = new THREE.Color();
    data.days.forEach((d, i) => {
      const L = d.look;
      out.torso.setColorAt(i, c.set(L.top));
      out.pelvis.setColorAt(i, c.set(L.trousers));
      out.head.setColorAt(i, c.set(L.skin));
      out.hair.setColorAt(i, c.set(L.hair));
      for (let k = 0; k < 4; k++) out.leg.setColorAt(i * 4 + k, c.set(L.trousers));
      for (let k = 0; k < 2; k++) {
        out.shoe.setColorAt(i * 2 + k, c.set(L.shoes));
        out.arm.setColorAt(i * 2 + k, c.set(L.top));
        out.hand.setColorAt(i * 2 + k, c.set(L.skin));
      }
    });
    return out;
  });

  // Per-student cursors and smoothed facing.
  const [state] = useState(() => ({
    seg: new Int32Array(data.days.length).fill(-1),
    pt: new Int32Array(data.days.length),
    yaw: new Float32Array(data.days.length),
    last: new Float64Array(data.days.length),
  }));

  useFrame((_, delta) => {
    const now = Date.now() / 1000;
    const dt = Math.min(delta, 0.1);
    data.days.forEach((d, i) => {
      const tau = (((now + d.offset) % d.period) + d.period) % d.period;
      // Find the segment we're in (usually the same as last frame).
      let k = state.seg[i];
      if (k < 0 || tau < d.starts[k] || tau < state.last[i]) k = 0;
      while (k + 1 < d.starts.length && d.starts[k + 1] <= tau) k++;
      const changed = k !== state.seg[i];
      state.seg[i] = k;
      state.last[i] = tau;

      if (!d.isWalk[k]) {
        if (!changed) return; // still sitting or standing: nothing to redraw
        const s = d.slots[d.ref[k]];
        state.yaw[i] = s.yaw;
        pose(meshes, i, d, s.x, s.y, s.z, s.yaw, 0, 0, s.pose === "sit" ? 1 : 0, s.pose === "lounge" ? 1 : 0);
        return;
      }

      // Walking: distance along this walk's polyline.
      const w = d.ref[k];
      const a = d.walkStart[w];
      const b = d.walkEnd[w];
      const dist = (tau - d.starts[k]) * d.speed;
      let p = changed ? a : Math.max(a, state.pt[i]);
      while (p < b - 1 && d.cum[p + 1] < dist) p++;
      state.pt[i] = p;
      const span = Math.max(1e-6, d.cum[p + 1] - d.cum[p]);
      const t = Math.min(1, Math.max(0, (dist - d.cum[p]) / span));
      const P = d.pts;
      const x0 = P[p * 3], y0 = P[p * 3 + 1], z0 = P[p * 3 + 2];
      const x1 = P[p * 3 + 3], y1 = P[p * 3 + 4], z1 = P[p * 3 + 5];
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const z = z0 + (z1 - z0) * t;
      if (Math.hypot(x1 - x0, z1 - z0) > 1e-3) {
        const want = Math.atan2(x1 - x0, z1 - z0);
        const diff = Math.atan2(Math.sin(want - state.yaw[i]), Math.cos(want - state.yaw[i]));
        state.yaw[i] += diff * (changed ? 1 : 1 - Math.exp(-dt * 9));
      }
      pose(meshes, i, d, x, y, z, state.yaw[i], dist * ((Math.PI * 2) / 1.35), 1, 0, 0);
    });
    dirty(meshes);
  });

  return (
    <>
      {Object.entries(meshes).map(([k, m]) => (
        <primitive key={k} object={m} />
      ))}
    </>
  );
}

/** Builds the crowd just after the campus first appears, so the page doesn't stall on load. */
export default function Crowd({ onReady }: { onReady?: (n: number) => void }) {
  const [data, setData] = useState<CrowdData | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const c = buildCrowd();
      if (import.meta.env.DEV) console.info("crowd", c.stats);
      setData(c);
      onReady?.(c.days.length);
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data ? <CrowdMeshes data={data} /> : null;
}
