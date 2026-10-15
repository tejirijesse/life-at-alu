
// The built campus: terraced podiums, rounded brick blocks with ribbon windows and
// floor bands, roof terraces, pergolas, stairs, the mural wall and the outbuilding.

import * as THREE from "three";
import { useMemo } from "react";
import { beds, blocks, canopy, drums, FLOOR, heightAt, openPods, outbuilding, pergolas, planters, platform, plazas, pond, POD_R, ramps, spiral, terraces, terrain, type Block } from "./layout";
import { brick, gravel, paving, screen, sign } from "./textures";

const tex = (base: THREE.Texture, rx: number, ry: number) => {
  const t = base.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return t;
};

const M = {
  glass: new THREE.MeshStandardMaterial({ color: "#2f3a40", roughness: 0.15, metalness: 0.6 }),
  frame: new THREE.MeshStandardMaterial({ color: "#2a2a2a", roughness: 0.6 }),
  band: new THREE.MeshStandardMaterial({ color: "#d9c6a8", roughness: 0.9 }),
  white: new THREE.MeshStandardMaterial({ color: "#f2f0ea", roughness: 0.7 }),
  concrete: new THREE.MeshStandardMaterial({ color: "#cfc6b8", roughness: 0.95 }),
  timber: new THREE.MeshStandardMaterial({ color: "#b98a5a", roughness: 0.7 }),
  asphalt: new THREE.MeshStandardMaterial({ color: "#8e8a85", roughness: 1 }),
  rail: new THREE.MeshStandardMaterial({ color: "#1d1d1d", roughness: 0.5, metalness: 0.4 }),
  door: new THREE.MeshStandardMaterial({ color: "#1f2a38", roughness: 0.6 }),
  lampGlow: new THREE.MeshStandardMaterial({ color: "#ffd9a0", emissive: "#ffb966", emissiveIntensity: 1.6 }),
  duct: new THREE.MeshStandardMaterial({ color: "#c9cbcc", roughness: 0.35, metalness: 0.6 }),
  unit: new THREE.MeshStandardMaterial({ color: "#e6e6e3", roughness: 0.6 }),
  trunk: new THREE.MeshStandardMaterial({ color: "#5b4a3a" }),
  leaves: new THREE.MeshStandardMaterial({ color: "#6d8a3f", roughness: 1, flatShading: true }),
};

function roundedRect(w: number, d: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  r = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Extrude a rounded footprint upward. Shape y maps to world -z, so we negate when placing. */
function slab(w: number, d: number, r: number, h: number, hole?: number) {
  const shape = roundedRect(w, d, r);
  if (hole) shape.holes.push(roundedRect(w - hole * 2, d - hole * 2, Math.max(0.2, r - hole)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  return g;
}

function Building({ b }: { b: Block }) {
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const H = b.floors * FLOOR;

  const parts = useMemo(() => {
    const brickMat = b.plain
      ? new THREE.MeshStandardMaterial({ color: b.plain, roughness: 0.95 })
      : new THREE.MeshStandardMaterial({ map: tex(brick(), 1 / 3, 1 / 3), roughness: 0.92 });
    const roofMat = b.plain
      ? new THREE.MeshStandardMaterial({ color: "#c98a5c", roughness: 1 })
      : new THREE.MeshStandardMaterial({ map: tex(gravel(), w / 6, d / 6), roughness: 1 });

    // Ribbon windows and mullions, floor by floor, on the four straight faces.
    const panes: THREE.Matrix4[] = [];
    const mullions: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const faces = [
      { axis: "x", len: w - 2 * b.radius - 1.2, at: d / 2 + 0.06, sign: 1 },
      { axis: "x", len: w - 2 * b.radius - 1.2, at: -d / 2 - 0.06, sign: -1 },
      { axis: "z", len: d - 2 * b.radius - 1.2, at: w / 2 + 0.06, sign: 1 },
      { axis: "z", len: d - 2 * b.radius - 1.2, at: -w / 2 - 0.06, sign: -1 },
    ];
    for (let f = 0; f < b.floors; f++) {
      const y = f * FLOOR + 1.55;
      faces.forEach((face, fi) => {
        // Leave the middle of the screened facade solid for the brick lattice.
        if (b.screen && fi === 0 && f > 0) return;
        if (face.len < 2) return;
        const pos = face.axis === "x" ? new THREE.Vector3(0, y, face.at) : new THREE.Vector3(face.at, y, 0);
        const scale = face.axis === "x" ? new THREE.Vector3(face.len, 1.55, 0.08) : new THREE.Vector3(0.08, 1.55, face.len);
        panes.push(m.compose(pos, q, scale).clone());
        const n = Math.floor(face.len / 1.6);
        for (let k = 0; k <= n; k++) {
          const t = -face.len / 2 + (k * face.len) / n;
          const p = face.axis === "x" ? new THREE.Vector3(t, y, face.at + face.sign * 0.04) : new THREE.Vector3(face.at + face.sign * 0.04, y, t);
          const sc = face.axis === "x" ? new THREE.Vector3(0.09, 1.6, 0.1) : new THREE.Vector3(0.1, 1.6, 0.09);
          mullions.push(m.compose(p, q, sc).clone());
        }
      });
    }
    const paneMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.glass, panes.length);
    panes.forEach((mm, i) => paneMesh.setMatrixAt(i, mm));
    const mullMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.frame, mullions.length);
    mullions.forEach((mm, i) => mullMesh.setMatrixAt(i, mm));
    paneMesh.castShadow = mullMesh.castShadow = true;

    return {
      brickMat,
      roofMat,
      walls: slab(w, d, b.radius, H),
      bands: Array.from({ length: b.floors }, (_, f) => ({ y: (f + 1) * FLOOR - 0.15, g: slab(w + 0.25, d + 0.25, b.radius + 0.12, 0.3) })),
      roof: slab(w - 0.6, d - 0.6, Math.max(0.3, b.radius - 0.3), 0.15),
      parapet: slab(w + 0.1, d + 0.1, b.radius + 0.05, 1.0, 0.35),
      paneMesh,
      mullMesh,
    };
  }, [b, w, d, H]);

  // Corner apex for the vertical sign (south-east rounded corner).
  const apex = b.radius * (1 - Math.SQRT1_2);

  return (
    <group position={[cx, b.base, cz]}>
      <mesh geometry={parts.walls} material={parts.brickMat} castShadow receiveShadow />
      {parts.bands.map((band, i) => (
        <mesh key={i} geometry={band.g} material={M.band} position={[0, band.y, 0]} castShadow />
      ))}
      <mesh geometry={parts.roof} material={parts.roofMat} position={[0, H, 0]} receiveShadow />
      <mesh geometry={parts.parapet} material={parts.brickMat} position={[0, H, 0]} castShadow />
      <primitive object={parts.paneMesh} />
      <primitive object={parts.mullMesh} />

      {b.screen && (
        <mesh position={[0, FLOOR + (H - FLOOR) / 2, d / 2 + 0.1]}>
          <planeGeometry args={[Math.max(4, w - 2 * b.radius - 1.2), H - FLOOR - 0.6]} />
          <meshStandardMaterial map={tex(screen(), (w - 2 * b.radius) / 3, (H - FLOOR) / 3)} roughness={0.9} />
        </mesh>
      )}

      {b.sign && (
        <mesh
          position={[w / 2 - apex + 0.08, H / 2 + 0.4, d / 2 - apex + 0.08]}
          rotation={[0, Math.PI / 4, 0]}
        >
          <planeGeometry args={[1.3, Math.min(H - 2, 10)]} />
          <meshStandardMaterial map={sign(b.sign)} roughness={0.6} />
        </mesh>
      )}

      {b.roofTerrace && <RoofTerrace w={w} d={d} h={H} />}
      {b.roofTerrace && <Railing w={w} d={d} h={H} />}
      {b.roofUnits && <RoofUnits w={w} d={d} h={H} seed={Math.round(cx * 7 + cz)} />}

      {/* Ground-floor entrance on the courtyard side */}
      <mesh position={[0, 1.4, d / 2 + 0.12]} material={M.door}>
        <boxGeometry args={[3.2, 2.8, 0.1]} />
      </mesh>
    </group>
  );
}

/** Tables, umbrellas and a railing on part of the roof. */
function RoofTerrace({ w, d, h }: { w: number; d: number; h: number }) {
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < 4; i++) out.push([-w / 4 + (i % 2) * (w / 4), -d / 6 + Math.floor(i / 2) * (d / 3)]);
    return out;
  }, [w, d]);
  return (
    <group position={[0, h + 0.15, 0]}>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.75, 0]} material={M.white} castShadow>
            <cylinderGeometry args={[0.6, 0.6, 0.05, 16]} />
          </mesh>
          <mesh position={[0, 1.3, 0]} material={M.rail}>
            <cylinderGeometry args={[0.03, 0.03, 2.6, 6]} />
          </mesh>
          <mesh position={[0, 2.5, 0]} castShadow>
            <coneGeometry args={[1.5, 0.6, 8, 1, true]} />
            <meshStandardMaterial color={i % 2 ? "#5d7a5a" : "#d9d2c3"} side={THREE.DoubleSide} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Black railing around a roof terrace. */
function Railing({ w, d, h }: { w: number; d: number; h: number }) {
  const mesh = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const list: THREE.Matrix4[] = [];
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.floor(len / 1.2));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        list.push(m.compose(new THREE.Vector3(x0 + (x1 - x0) * t, h + 1.6, z0 + (z1 - z0) * t), q, new THREE.Vector3(0.05, 1.1, 0.05)).clone());
      }
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(x1 - x0, z1 - z0));
      list.push(m.compose(new THREE.Vector3((x0 + x1) / 2, h + 2.15, (z0 + z1) / 2), rot, new THREE.Vector3(0.06, 0.06, len)).clone());
    };
    const a = w / 2 - 0.4;
    const c = d / 2 - 0.4;
    edge(-a, c, a, c);
    edge(a, -c, a, c);
    edge(-a, -c, -a, c);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.rail, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    return im;
  }, [w, d, h]);
  return <primitive object={mesh} />;
}

/** Ducts, AC units and hatches on the gravel roofs. */
function RoofUnits({ w, d, h, seed }: { w: number; d: number; h: number; seed: number }) {
  const items = useMemo(() => {
    let s = Math.abs(seed) + 3;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    return Array.from({ length: 5 }, () => ({
      x: (r() - 0.5) * (w - 6),
      z: (r() - 0.5) * (d - 6),
      kind: r() < 0.5 ? "duct" : "box",
      rot: r() < 0.5 ? 0 : Math.PI / 2,
      len: 3 + r() * 5,
    }));
  }, [w, d, seed]);
  return (
    <group position={[0, h + 0.15, 0]}>
      {items.map((it, i) =>
        it.kind === "duct" ? (
          <mesh key={i} position={[it.x, 0.45, it.z]} rotation={[0, it.rot, Math.PI / 2]} material={M.duct} castShadow>
            <cylinderGeometry args={[0.35, 0.35, it.len, 10]} />
          </mesh>
        ) : (
          <mesh key={i} position={[it.x, 0.55, it.z]} rotation={[0, it.rot, 0]} material={M.unit} castShadow>
            <boxGeometry args={[1.4, 1.1, 1]} />
          </mesh>
        ),
      )}
    </group>
  );
}

/** Drum towers wrapped in perforated brick. */
function Drums() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex(screen(), 5, 3), roughness: 0.92 }), []);
  return (
    <>
      {drums.map((d, i) => (
        <group key={i} position={[d.x, d.base, d.z]}>
          <mesh position={[0, d.h / 2, 0]} material={mat} castShadow receiveShadow>
            <cylinderGeometry args={[d.r, d.r, d.h, 28]} />
          </mesh>
          <mesh position={[0, d.h + 0.08, 0]} material={M.band}>
            <cylinderGeometry args={[d.r + 0.12, d.r + 0.12, 0.16, 28]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** The slab bridging the top of the grand stairs, on slim round columns. */
function Canopy() {
  const c = canopy;
  const w = c.x1 - c.x0;
  const d = c.z1 - c.z0;
  const geo = useMemo(() => slab(w, d, 3, 0.6), [w, d]);
  const cols: [number, number][] = [
    [c.x0 + 2, c.z1 - 1],
    [c.x1 - 2, c.z1 - 1],
  ];
  return (
    <group>
      <mesh geometry={geo} material={M.band} position={[(c.x0 + c.x1) / 2, c.y, (c.z0 + c.z1) / 2]} castShadow receiveShadow />
      {cols.map(([x, z], i) => (
        <mesh key={i} position={[x, c.y / 2, z]} material={M.band} castShadow>
          <cylinderGeometry args={[0.45, 0.45, c.y, 14]} />
        </mesh>
      ))}
    </group>
  );
}

/** Round brick planters with young trees. */
function Planters() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex(brick(), 2, 0.4), roughness: 0.92 }), []);
  return (
    <>
      {planters.map((p, i) => {
        const y = heightAt(p.x, p.z);
        return (
          <group key={i} position={[p.x, y, p.z]}>
            <mesh position={[0, 0.4, 0]} material={mat} castShadow>
              <cylinderGeometry args={[p.r, p.r, 0.8, 24]} />
            </mesh>
            <mesh position={[0, 2, 0]} material={M.trunk}>
              <cylinderGeometry args={[0.08, 0.1, 3.2, 6]} />
            </mesh>
            <mesh position={[0, 3.8, 0]} material={M.leaves} castShadow>
              <icosahedronGeometry args={[1.1, 0]} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** Exterior pods: open-air learning rings, a gap facing the plaza, a bench inside. */
function OpenPods() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex(screen(), 3, 1), roughness: 0.92, side: THREE.DoubleSide }), []);
  return (
    <>
      {openPods.map((p, i) => (
        <group key={i} position={[p.x, p.base, p.z]} rotation={[0, Math.PI / 2 + i, 0]}>
          <mesh position={[0, 1.2, 0]} material={mat} castShadow>
            <cylinderGeometry args={[POD_R, POD_R, 2.4, 28, 1, true, 0.5, Math.PI * 2 - 1]} />
          </mesh>
          <mesh position={[0, 0.45, 0]} material={M.timber}>
            <torusGeometry args={[POD_R - 0.45, 0.22, 6, 20, Math.PI * 1.4]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** The exterior spiral stair at the east end of the spine. */
function Spiral() {
  const mesh = useMemo(() => {
    const steps: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const n = Math.round((spiral.y1 - spiral.y0) / 0.2);
    for (let i = 0; i < n; i++) {
      const a = i * 0.32;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      const y = spiral.y0 + i * 0.2;
      steps.push(m.compose(new THREE.Vector3(Math.cos(a) * spiral.r * 0.55, y, Math.sin(a) * spiral.r * 0.55), q, new THREE.Vector3(spiral.r * 0.95, 0.08, 0.7)).clone());
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.concrete, steps.length);
    steps.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = true;
    return im;
  }, []);
  return (
    <group position={[spiral.x, 0, spiral.z]}>
      <primitive object={mesh} />
      <mesh position={[0, (spiral.y0 + spiral.y1) / 2, 0]} material={M.rail}>
        <cylinderGeometry args={[0.18, 0.18, spiral.y1 - spiral.y0, 10]} />
      </mesh>
    </group>
  );
}

/** The round stormwater pond far down the slope, with its ring path. */
function Pond() {
  const y = terrain(pond.x, pond.z) + 0.15;
  return (
    <group position={[pond.x, y, pond.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]} receiveShadow>
        <circleGeometry args={[pond.rx, 64]} />
        <meshStandardMaterial color="#7c9396" roughness={0.1} metalness={0.35} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <ringGeometry args={[pond.rx, pond.rx + 1.6, 64]} />
        <meshStandardMaterial color="#8d7b5e" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[pond.rx + 4, pond.rx + 6.5, 72]} />
        <meshStandardMaterial color="#b98e66" roughness={1} />
      </mesh>
    </group>
  );
}

/** Red-soil planting beds in front of the building. */
function Beds() {
  return (
    <>
      {beds.map((b, i) => (
        <mesh key={i} position={[(b.x0 + b.x1) / 2, terrain((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) + 0.12, (b.z0 + b.z1) / 2]} receiveShadow>
          <boxGeometry args={[b.x1 - b.x0, 0.3, b.z1 - b.z0]} />
          <meshStandardMaterial color="#9a5a3c" roughness={1} />
        </mesh>
      ))}
    </>
  );
}

/** Stepped vegetable terraces: rows of soil and green, each a little lower down the slope. */
function VegetableTerraces() {
  const rows = useMemo(() => {
    const t = terraces;
    const depth = (t.z1 - t.z0) / t.rows;
    return Array.from({ length: t.rows }, (_, k) => {
      const z = t.z0 + (k + 0.5) * depth;
      const y = terrain((t.x0 + t.x1) / 2, z);
      return { z, y, depth, k };
    });
  }, []);
  const w = terraces.x1 - terraces.x0;
  return (
    <group position={[(terraces.x0 + terraces.x1) / 2, 0, 0]}>
      {rows.map((r) => (
        <group key={r.k}>
          <mesh position={[0, r.y - 0.6, r.z]} receiveShadow castShadow>
            <boxGeometry args={[w, 1.6, r.depth - 0.3]} />
            <meshStandardMaterial color={r.k % 3 === 1 ? "#7a6a3e" : "#5f7a3a"} roughness={1} />
          </mesh>
          {Array.from({ length: 7 }).map((_, j) => (
            <mesh key={j} position={[-w / 2 + (j + 0.5) * (w / 7), r.y + 0.22, r.z]}>
              <boxGeometry args={[w / 7 - 0.8, 0.12, r.depth - 1.2]} />
              <meshStandardMaterial color={(j + r.k) % 2 ? "#8b5a3c" : "#6e8f43"} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** The sandy square platform up the slope. */
function Platform() {
  const y = terrain(platform.x, platform.z);
  return (
    <mesh position={[platform.x, y - 0.4, platform.z]} receiveShadow>
      <boxGeometry args={[platform.size, 1.2, platform.size]} />
      <meshStandardMaterial color="#e2cfaa" roughness={1} />
    </mesh>
  );
}

/** Terraced podiums: paved tops, brick retaining walls. */
type R = { x0: number; x1: number; z0: number; z1: number };
/** Rectangle minus a hole → up to four pieces. */
function subtract(a: R, h: R): R[] {
  if (h.x1 <= a.x0 || h.x0 >= a.x1 || h.z1 <= a.z0 || h.z0 >= a.z1) return [a];
  const out: R[] = [];
  if (h.z0 > a.z0) out.push({ ...a, z1: h.z0 });
  if (h.z1 < a.z1) out.push({ ...a, z0: h.z1 });
  const z0 = Math.max(a.z0, h.z0);
  const z1 = Math.min(a.z1, h.z1);
  if (h.x0 > a.x0) out.push({ x0: a.x0, x1: h.x0, z0, z1 });
  if (h.x1 < a.x1) out.push({ x0: h.x1, x1: a.x1, z0, z1 });
  return out;
}

/** Each terrace, with the stairwells cut out so the stairs aren't buried. */
const podiumPieces = () =>
  plazas.flatMap((p) => {
    let pieces: R[] = [p];
    for (const r of ramps) pieces = pieces.flatMap((piece) => subtract(piece, r));
    return pieces.map((piece) => ({ ...p, ...piece, name: `${p.name}:${piece.x0}:${piece.z0}` }));
  });

function Podiums() {
  const items = useMemo(
    () =>
      podiumPieces().map((p) => {
        const w = p.x1 - p.x0;
        const d = p.z1 - p.z0;
        const low = Math.min(terrain(p.x0, p.z1), terrain(p.x1, p.z1), terrain(p.x0, p.z0), terrain(p.x1, p.z0)) - 3;
        const h = p.y - low;
        const side = new THREE.MeshStandardMaterial({ map: tex(brick(), Math.max(w, d) / 3, h / 3), roughness: 0.92 });
        const top = p.paving
          ? new THREE.MeshStandardMaterial({ color: p.paving, roughness: 1 })
          : new THREE.MeshStandardMaterial({ map: tex(paving(), w / 4, d / 4), roughness: 0.95 });
        return { p, w, d, h, low, mats: [side, side, top, side, side, side] };
      }),
    [],
  );
  return (
    <>
      {items.map(({ p, w, d, h, low, mats }) => (
        <mesh
          key={p.name}
          position={[(p.x0 + p.x1) / 2, low + h / 2, (p.z0 + p.z1) / 2]}
          material={mats}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[w, h, d]} />
        </mesh>
      ))}
    </>
  );
}

/** Stairs as real steps, and the access road as a smooth slope of thin slabs. */
function Stairs() {
  const mesh = useMemo(() => {
    const mats: THREE.Matrix4[] = [];
    const roadMats: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const r of ramps) {
      const len = r.z1 - r.z0;
      const width = r.x1 - r.x0;
      const n = r.stairs ? Math.max(4, Math.round(Math.abs(r.yFrom - r.yTo) / 0.18)) : 44;
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const top = r.yFrom + (r.yTo - r.yFrom) * (r.stairs ? Math.min(1, (i + 0.5) / n) : t0);
        const z = r.z0 + (i + 0.5) * (len / n);
        const bottom = Math.min(top, terrain((r.x0 + r.x1) / 2, z), r.yTo) - 3;
        const h = top - bottom;
        (r.stairs ? mats : roadMats).push(
          m.compose(new THREE.Vector3((r.x0 + r.x1) / 2, bottom + h / 2, z), q, new THREE.Vector3(width, h, len / n + 0.01)).clone(),
        );
      }
    }
    const stairs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.concrete, mats.length);
    mats.forEach((mm, i) => stairs.setMatrixAt(i, mm));
    const road = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.asphalt, roadMats.length);
    roadMats.forEach((mm, i) => road.setMatrixAt(i, mm));
    stairs.castShadow = stairs.receiveShadow = road.receiveShadow = true;
    return { stairs, road };
  }, []);
  return (
    <>
      <primitive object={mesh.stairs} />
      <primitive object={mesh.road} />
    </>
  );
}

/** White slatted pergolas over courtyards and roof terraces. */
function Pergolas() {
  const mesh = useMemo(() => {
    const posts: THREE.Matrix4[] = [];
    const slats: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const p of pergolas) {
      const w = p.x1 - p.x0;
      const d = p.z1 - p.z0;
      for (const x of [p.x0, p.x1]) for (const z of [p.z0, p.z1]) posts.push(m.compose(new THREE.Vector3(x, p.y + p.h / 2, z), q, new THREE.Vector3(0.25, p.h, 0.25)).clone());
      for (const x of [p.x0, p.x1]) posts.push(m.compose(new THREE.Vector3(x, p.y + p.h, (p.z0 + p.z1) / 2), q, new THREE.Vector3(0.3, 0.3, d)).clone());
      for (let i = 0; i <= Math.floor(d / 0.5); i++)
        slats.push(m.compose(new THREE.Vector3((p.x0 + p.x1) / 2, p.y + p.h + 0.2, p.z0 + i * 0.5), q, new THREE.Vector3(w + 0.4, 0.12, 0.08)).clone());
    }
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.white, posts.length);
    posts.forEach((mm, i) => pm.setMatrixAt(i, mm));
    const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.white, slats.length);
    slats.forEach((mm, i) => sm.setMatrixAt(i, mm));
    pm.castShadow = sm.castShadow = true;
    return { pm, sm };
  }, []);
  return (
    <>
      <primitive object={mesh.pm} />
      <primitive object={mesh.sm} />
    </>
  );
}

function Outbuilding() {
  const o = outbuilding;
  const y = terrain(o.x, o.z);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex(brick(), o.w / 3, o.h / 3), roughness: 0.92 }), [o.w, o.h]);
  return (
    <group position={[o.x, y, o.z]}>
      <mesh position={[0, o.h / 2 - 0.5, 0]} material={mat} castShadow receiveShadow>
        <boxGeometry args={[o.w, o.h + 1, o.d]} />
      </mesh>
      {[-2, 2].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.1, o.d / 2 + 0.03]} material={M.door}>
            <boxGeometry args={[1.6, 2.4, 0.06]} />
          </mesh>
          <mesh position={[x + 1.3, 2.7, o.d / 2 + 0.1]} material={M.lampGlow}>
            <boxGeometry args={[0.25, 0.35, 0.1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Architecture() {
  return (
    <>
      <Podiums />
      <Stairs />
      {blocks.map((b) => (
        <Building key={b.name} b={b} />
      ))}
      <Pergolas />
      <Drums />
      <OpenPods />
      <Spiral />
      <Pond />
      <Beds />
      <VegetableTerraces />
      <Platform />
      <Canopy />
      <Planters />
      <Outbuilding />
    </>
  );
}

export { M as materials };
