
// The hillside around the campus: grass, young trees, lamp posts, courtyard tables,
// the hazy city across the valley, sky and late-afternoon light.

import * as THREE from "three";
import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { blocks, heightAt, platform, plazas, pond, ramps, terraces, terrain } from "./layout";
import { grass, sky } from "./textures";
import { materials as M } from "./Architecture";

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number, pad = 0) =>
  x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
const onBuilt = (x: number, z: number, pad = 2) =>
  plazas.some((p) => inRect(p, x, z, pad)) ||
  ramps.some((r) => inRect(r, x, z, pad)) ||
  blocks.some((b) => inRect(b, x, z, pad)) ||
  inRect(terraces, x, z, 3) ||
  (Math.abs(x - platform.x) < platform.size / 2 + 3 && Math.abs(z - platform.z) < platform.size / 2 + 3) ||
  ((x - pond.x) / (pond.rx + 3)) ** 2 + ((z - pond.z) / (pond.rz + 3)) ** 2 < 1;

function Ground() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(700, 700, 140, 140);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = terrain(x, z) - 0.05;
      // Keep the hillside below every terrace, stair and building so it never pokes through.
      for (const p of plazas) if (inRect(p, x, z, 7)) y = Math.min(y, p.y - 0.4);
      for (const r of ramps) if (inRect(r, x, z, 7)) y = Math.min(y, Math.min(r.yFrom, r.yTo) - 0.4);
      for (const b of blocks) if (inRect(b, x, z, 7)) y = Math.min(y, b.base - 0.4);
      // Level ground for the pond and its ring path.
      if (Math.hypot(x - pond.x, z - pond.z) < pond.rx + 12) y = Math.min(y, terrain(pond.x, pond.z) - 0.05);
      pos.setY(i, y);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => {
    const t = grass().clone();
    t.needsUpdate = true;
    t.repeat.set(90, 90);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  }, []);
  return <mesh geometry={geo} material={mat} receiveShadow />;
}

function Trees() {
  const { trunks, crowns } = useMemo(() => {
    const r = seeded(11);
    const t: THREE.Matrix4[] = [];
    const c: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let tries = 0;
    while (t.length < 140 && tries < 3000) {
      tries++;
      const x = -120 + r() * 240;
      const z = -110 + r() * 230;
      if (onBuilt(x, z, 3)) continue;
      const y = terrain(x, z);
      const h = 2.2 + r() * 2.6;
      t.push(m.compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(0.09, h, 0.09)).clone());
      const s = 0.6 + r() * 0.9;
      c.push(m.compose(new THREE.Vector3(x, y + h + s * 0.4, z), q, new THREE.Vector3(s, s * 1.2, s)).clone());
    }
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshStandardMaterial({ color: "#5b4a3a" }), t.length);
    t.forEach((mm, i) => trunks.setMatrixAt(i, mm));
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: "#5f7f3a", roughness: 1, flatShading: true }), c.length);
    c.forEach((mm, i) => crowns.setMatrixAt(i, mm));
    trunks.castShadow = crowns.castShadow = true;
    return { trunks, crowns };
  }, []);
  return (
    <>
      <primitive object={trunks} />
      <primitive object={crowns} />
    </>
  );
}

/** Black lamp posts with warm heads along terrace edges and paths. */
function Lamps() {
  const { posts, heads } = useMemo(() => {
    const spots: [number, number][] = [];
    for (let x = -52; x <= 52; x += 13) if (Math.abs(x) > 14) spots.push([x, 25]);
    for (let x = -58; x <= 58; x += 14.5) spots.push([x, -51]);
    for (let z = 34; z <= 96; z += 10) spots.push([-24, z], [24, z]);
    spots.push([-6, 4], [6, 4], [-27, -4], [33, -4]);
    const p: THREE.Matrix4[] = [];
    const h: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const [x, z] of spots) {
      const y = heightAt(x, z);
      p.push(m.compose(new THREE.Vector3(x, y + 2, z), q, new THREE.Vector3(0.08, 4, 0.08)).clone());
      h.push(m.compose(new THREE.Vector3(x, y + 4.1, z), q, new THREE.Vector3(0.22, 0.4, 0.22)).clone());
    }
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), M.rail, p.length);
    p.forEach((mm, i) => posts.setMatrixAt(i, mm));
    const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), M.lampGlow, h.length);
    h.forEach((mm, i) => heads.setMatrixAt(i, mm));
    posts.castShadow = true;
    return { posts, heads };
  }, []);
  return (
    <>
      <primitive object={posts} />
      <primitive object={heads} />
    </>
  );
}

/** Tables and umbrellas in the courtyard and on the lower terrace. */
function Furniture() {
  const spots = useMemo(() => {
    const out: { x: number; z: number; c: string }[] = [];
    const cols = ["#e9e3d6", "#5d7a5a", "#2f5d7a"];
    [
      [-26, 8], [-22, 18], [-14, 8], [-6, 14], [6, 22], [36, 22], [46, 16], [-48, 24], [-26, -4], [33, -5],
    ].forEach(([x, z], i) => out.push({ x, z, c: cols[i % cols.length] }));
    return out;
  }, []);
  return (
    <>
      {spots.map((s, i) => {
        const y = heightAt(s.x, s.z);
        return (
          <group key={i} position={[s.x, y, s.z]}>
            <mesh position={[0, 0.75, 0]} material={M.white} castShadow>
              <cylinderGeometry args={[0.7, 0.7, 0.05, 16]} />
            </mesh>
            <mesh position={[0, 0.37, 0]} material={M.rail}>
              <cylinderGeometry args={[0.05, 0.05, 0.74, 6]} />
            </mesh>
            {[0, 1, 2, 3].map((k) => (
              <mesh key={k} position={[Math.cos((k * Math.PI) / 2) * 1.1, 0.45, Math.sin((k * Math.PI) / 2) * 1.1]} material={M.rail} castShadow>
                <boxGeometry args={[0.45, 0.9, 0.45]} />
              </mesh>
            ))}
            <mesh position={[0, 1.4, 0]} material={M.rail}>
              <cylinderGeometry args={[0.03, 0.03, 2.8, 6]} />
            </mesh>
            <mesh position={[0, 2.7, 0]} castShadow>
              <coneGeometry args={[1.7, 0.6, 8, 1, true]} />
              <meshStandardMaterial color={s.c} side={THREE.DoubleSide} roughness={0.9} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** The neighbourhood around: cream houses with terracotta roofs, fading into haze. */
function City() {
  const { walls, roofs } = useMemo(() => {
    const r = seeded(29);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const w: THREE.Matrix4[] = [];
    const rf: THREE.Matrix4[] = [];
    for (let i = 0; i < 560; i++) {
      const ang = r() * Math.PI * 2;
      const dist = 150 + r() * 260;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist - 40;
      // Houses sit beyond the road to the north and east; the slope below stays green.
      if (z > 40 && x < 160) continue;
      const sx = 7 + r() * 9;
      const sz = 6 + r() * 7;
      const h = 3.2 + (r() < 0.12 ? 6 : 0);
      const y = terrain(x, z);
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
      w.push(m.compose(new THREE.Vector3(x, y + h / 2 - 0.5, z), yaw, new THREE.Vector3(sx, h, sz)).clone());
      rf.push(m.compose(new THREE.Vector3(x, y + h - 0.5 + 1.1, z), yaw, new THREE.Vector3(sx * 0.6, 2.2, sz * 0.62)).clone());
    }
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#e7e0d4", roughness: 1 }), w.length);
    w.forEach((mm, i) => walls.setMatrixAt(i, mm));
    const roofGeo = new THREE.ConeGeometry(1, 1, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: "#b4553a", roughness: 0.9, flatShading: true }), rf.length);
    rf.forEach((mm, i) => roofs.setMatrixAt(i, mm));
    void q;
    return { walls, roofs };
  }, []);
  return (
    <>
      <primitive object={walls} />
      <primitive object={roofs} />
    </>
  );
}

function Sky() {
  const { scene } = useThree();
  useMemo(() => {
    scene.background = sky();
    scene.fog = new THREE.Fog("#e6e2da", 90, 380);
  }, [scene]);
  return null;
}

export default function Environment() {
  return (
    <>
      <Sky />
      <hemisphereLight args={["#d6e6f5", "#7d6a52", 1.1]} />
      <directionalLight
        position={[-90, 85, 70]}
        intensity={2.6}
        color="#ffe2bf"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-bias={-0.0004}
      />
      <Ground />
      <Trees />
      <Lamps />
      <Furniture />
      <City />
    </>
  );
}
