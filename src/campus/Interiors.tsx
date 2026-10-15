// Draws the inside of the campus from interiors.ts: brick shells with see-through ribbon
// windows, floor slabs with stairwells, the stairs, and every room's furniture. Walls are
// merged into a few meshes and furniture is instanced, so it's a handful of draw calls.

import * as THREE from "three";
import { useMemo } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { blocks, FLOOR } from "./layout";
import { chairs, frames, items, mullions, panes, pieces, rails, RISE, SLAB, stairs, TREAD, WALL, type Box } from "./indoors";
import { brick } from "./textures";

/** A box with UVs in world units (one texture tile per 3 m), so brick reads at a constant scale. */
function boxGeo(b: Box) {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const d = b.z1 - b.z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z; four vertices each.
  const spans: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * spans[f][0]) / 3, (uv.getY(i) * spans[f][1]) / 3);
    }
  g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  return g;
}

const merged = (boxes: Box[]) => (boxes.length ? mergeGeometries(boxes.map(boxGeo)) : null);

function instanced(boxes: Box[], material: THREE.Material, shadows = true) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, boxes.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  boxes.forEach((b, i) =>
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2), q, new THREE.Vector3(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0))),
  );
  mesh.count = boxes.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

const MAT = {
  glass: new THREE.MeshStandardMaterial({ color: "#3a4a52", roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false }),
  frame: new THREE.MeshStandardMaterial({ color: "#2a2a2a", roughness: 0.6 }),
  plaster: new THREE.MeshStandardMaterial({ color: "#f1ede6", roughness: 0.9 }),
  floor: new THREE.MeshStandardMaterial({ color: "#cdbfa9", roughness: 0.75 }),
  ceiling: new THREE.MeshStandardMaterial({ color: "#f4f1eb", roughness: 0.95 }),
  concrete: new THREE.MeshStandardMaterial({ color: "#cfc6b8", roughness: 0.95 }),
  rail: new THREE.MeshStandardMaterial({ color: "#1d1d1d", roughness: 0.5, metalness: 0.4 }),
  timber: new THREE.MeshStandardMaterial({ color: "#c49a6c", roughness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: "#3b3b3d", roughness: 0.5, metalness: 0.5 }),
  shelf: new THREE.MeshStandardMaterial({ color: "#7a5f45", roughness: 0.8 }),
  board: new THREE.MeshStandardMaterial({ color: "#fbfbf9", roughness: 0.3 }),
  light: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff4e0", emissiveIntensity: 1.2 }),
  chair: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }),
};

/** A slab with rounded corners and optional rectangular holes (stairwells), world-placed. */
function slabGeo(x0: number, x1: number, z0: number, z1: number, r: number, y: number, h: number, holes: Box[] = []) {
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  r = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r);
  s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  s.lineTo(-w / 2, -d / 2 + r);
  s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  // Shape y becomes world -z once rotated.
  for (const hb of holes) {
    const p = new THREE.Path();
    p.moveTo(hb.x0 - cx, -(hb.z0 - cz));
    p.lineTo(hb.x0 - cx, -(hb.z1 - cz));
    p.lineTo(hb.x1 - cx, -(hb.z1 - cz));
    p.lineTo(hb.x1 - cx, -(hb.z0 - cz));
    p.closePath();
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.translate(cx, y, cz);
  return g;
}

function Shells() {
  const geo = useMemo(() => {
    const brickMat = new THREE.MeshStandardMaterial({ map: brick(), roughness: 0.92 });
    const plain = blocks.find((b) => b.plain)?.plain ?? "#d8c7b2";
    const plainMat = new THREE.MeshStandardMaterial({ color: plain, roughness: 0.95 });

    const floors: THREE.BufferGeometry[] = [];
    const ceilings: THREE.BufferGeometry[] = [];
    blocks.forEach((b, i) => {
      const s = stairs[i];
      const hole: Box[] = s ? [{ x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, y0: 0, y1: 0 }] : [];
      const r = Math.max(0.2, b.radius - WALL);
      const ix0 = b.x0 + WALL - 0.02;
      const ix1 = b.x1 - WALL + 0.02;
      const iz0 = b.z0 + WALL - 0.02;
      const iz1 = b.z1 - WALL + 0.02;
      floors.push(slabGeo(ix0, ix1, iz0, iz1, r, b.base, 0.03));
      for (let f = 1; f < b.floors; f++) {
        floors.push(slabGeo(ix0, ix1, iz0, iz1, r, b.base + f * FLOOR - SLAB, SLAB, f === 1 ? hole : []));
      }
      // Ceiling under the roof.
      ceilings.push(slabGeo(ix0, ix1, iz0, iz1, r, b.base + b.floors * FLOOR - SLAB, SLAB - 0.02));
    });

    // Stair treads.
    const treads: Box[] = [];
    for (const s of stairs) {
      if (!s) continue;
      for (let k = 0; k < Math.round(FLOOR / RISE); k++) treads.push({ x0: s.x0 + k * TREAD, x1: s.x0 + (k + 1) * TREAD, z0: s.z0, z1: s.z1, y0: s.y0, y1: s.y0 + (k + 1) * RISE });
    }

    return {
      brick: { g: merged(pieces.filter((p) => p.kind === "brick")), m: brickMat },
      plain: { g: merged(pieces.filter((p) => p.kind === "plain")), m: plainMat },
      plaster: { g: merged(pieces.filter((p) => p.kind === "plaster")), m: MAT.plaster },
      floor: { g: mergeGeometries(floors), m: MAT.floor },
      ceiling: { g: mergeGeometries(ceilings), m: MAT.ceiling },
      treads: { g: merged(treads), m: MAT.concrete },
      panes: instanced(panes, MAT.glass, false),
      mullions: instanced(mullions, MAT.frame),
      frames: instanced(frames, MAT.frame),
      rails: instanced(rails, MAT.rail),
    };
  }, []);

  return (
    <>
      {(["brick", "plain", "plaster", "floor", "ceiling", "treads"] as const).map((k) =>
        geo[k].g ? <mesh key={k} geometry={geo[k].g!} material={geo[k].m} castShadow receiveShadow /> : null,
      )}
      <primitive object={geo.panes} />
      <primitive object={geo.mullions} />
      <primitive object={geo.frames} />
      <primitive object={geo.rails} />
    </>
  );
}

const CHAIR_TONES = ["#2f5d62", "#c46a3a", "#e1b44c", "#3d4f7a", "#8a3f4b"];

function Furniture() {
  const meshes = useMemo(() => {
    const tops: Box[] = [];
    const legs: Box[] = [];
    const shelves: Box[] = [];
    const books: Box[] = [];
    const boards: Box[] = [];
    const lights: Box[] = [];
    const rounds: Box[] = [];
    for (const it of items) {
      const top = { ...it, y0: it.y1 - 0.05 };
      if (it.kind === "desk" || it.kind === "table") {
        tops.push(top);
        const lw = 0.06;
        for (const [x, z] of [
          [it.x0 + 0.08, it.z0 + 0.08],
          [it.x1 - 0.08, it.z0 + 0.08],
          [it.x0 + 0.08, it.z1 - 0.08],
          [it.x1 - 0.08, it.z1 - 0.08],
        ])
          legs.push({ x0: x - lw / 2, x1: x + lw / 2, z0: z - lw / 2, z1: z + lw / 2, y0: it.y0, y1: it.y1 - 0.05 });
      } else if (it.kind === "round") {
        rounds.push(top);
        const cx = (it.x0 + it.x1) / 2;
        const cz = (it.z0 + it.z1) / 2;
        legs.push({ x0: cx - 0.04, x1: cx + 0.04, z0: cz - 0.04, z1: cz + 0.04, y0: it.y0, y1: it.y1 - 0.05 });
      } else if (it.kind === "shelf") {
        shelves.push(it);
        // Book rows on both faces.
        for (let s = 0; s < 4; s++) {
          const y0 = it.y0 + 0.12 + s * 0.5;
          books.push({ x0: it.x0 - 0.02, x1: it.x1 + 0.02, z0: it.z0 + 0.06, z1: it.z1 - 0.06, y0, y1: y0 + 0.3 });
        }
      } else if (it.kind === "board") boards.push(it);
      else if (it.kind === "light") lights.push(it);
    }

    const roundMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), MAT.timber, Math.max(1, rounds.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    rounds.forEach((b, i) =>
      roundMesh.setMatrixAt(i, m.compose(new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2), q, new THREE.Vector3(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0))),
    );
    roundMesh.count = rounds.length;
    roundMesh.castShadow = roundMesh.receiveShadow = true;

    // Chairs: a seat and a back, turned to face their table.
    const seatGeo = new THREE.BoxGeometry(0.44, 0.05, 0.42);
    seatGeo.translate(0, 0.36, 0);
    const backGeo = new THREE.BoxGeometry(0.44, 0.42, 0.04);
    backGeo.translate(0, 0.59, -0.21);
    const legGeo = new THREE.BoxGeometry(0.4, 0.34, 0.38);
    legGeo.translate(0, 0.17, 0);
    const chairGeo = mergeGeometries([seatGeo, backGeo]);
    const chairMesh = new THREE.InstancedMesh(chairGeo, MAT.chair, chairs.length);
    const frameMesh = new THREE.InstancedMesh(legGeo, new THREE.MeshStandardMaterial({ color: "#2b2b2c", roughness: 0.5, metalness: 0.4, wireframe: false }), chairs.length);
    const col = new THREE.Color();
    chairs.forEach((c, i) => {
      m.compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw), new THREE.Vector3(1, 1, 1));
      chairMesh.setMatrixAt(i, m);
      chairMesh.setColorAt(i, col.set(CHAIR_TONES[i % CHAIR_TONES.length]));
      // A thin frame under the seat (scaled down so it reads as legs from a distance).
      m.compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw), new THREE.Vector3(1, 1, 0.12));
      frameMesh.setMatrixAt(i, m);
    });
    chairMesh.castShadow = true;

    const bookMesh = instanced(books, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }));
    const tones = ["#8c3b2f", "#2f4f6a", "#c9a24a", "#4e6b3a", "#d9d2c3", "#5a3c5e"];
    books.forEach((_, i) => bookMesh.setColorAt(i, col.set(tones[i % tones.length])));

    return {
      tops: instanced(tops, MAT.timber),
      legs: instanced(legs, MAT.steel),
      shelves: instanced(shelves, MAT.shelf),
      books: bookMesh,
      boards: instanced(boards, MAT.board, false),
      lights: instanced(lights, MAT.light, false),
      rounds: roundMesh,
      chairs: chairMesh,
      chairFrames: frameMesh,
    };
  }, []);

  return (
    <>
      {Object.entries(meshes).map(([k, mesh]) => (
        <primitive key={k} object={mesh} />
      ))}
    </>
  );
}

export default function Interiors() {
  return (
    <>
      <Shells />
      <Furniture />
    </>
  );
}
