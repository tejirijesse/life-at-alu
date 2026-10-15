
// Shared geometry, materials and small building blocks. Everything in the world is
// assembled from these few primitives so the whole site ships with zero model files.

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { journey, smoothstep } from "@/lib/journey";

export const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 28, 18),
  sphereLo: new THREE.SphereGeometry(1, 12, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  cone: new THREE.ConeGeometry(1, 1, 24),
  prism: new THREE.CylinderGeometry(1, 1, 1, 3),
  plane: new THREE.PlaneGeometry(1, 1),
  torus: new THREE.TorusGeometry(1, 0.06, 8, 40),
};

const capsules = new Map<string, THREE.CapsuleGeometry>();
export function capsule(r: number, l: number) {
  const k = `${r}:${l}`;
  if (!capsules.has(k)) capsules.set(k, new THREE.CapsuleGeometry(r, l, 8, 18));
  return capsules.get(k)!;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, rough = 0.92, metal = 0) {
  const k = `${color}:${rough}:${metal}`;
  if (!mats.has(k)) {
    mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  }
  return mats.get(k)!;
}

type V3 = [number, number, number];

/**
 * The white-clay rule: every environment colour is pulled most of the way to white,
 * so places read through form and a faint tint, never through colour.
 */
const WHITE = new THREE.Color("#ffffff");
const clayCache = new Map<string, string>();
export function clay(color: string, keep = 0.28) {
  const k = `${color}:${keep}`;
  if (!clayCache.has(k)) {
    // Lift toward white, then take out most of the warmth so white stays bright, not milky.
    const c = new THREE.Color(color).lerp(WHITE, 1 - keep);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s * 0.45, hsl.l);
    clayCache.set(k, "#" + c.getHexString());
  }
  return clayCache.get(k)!;
}

export function B({ p, s, c, r, rough }: { p: V3; s: V3; c: string; r?: V3; rough?: number }) {
  return <mesh geometry={geo.box} material={mat(clay(c), rough)} position={p} scale={s} rotation={r} />;
}

export function Cyl({ p, s, c, r }: { p: V3; s: V3; c: string; r?: V3 }) {
  return <mesh geometry={geo.cyl} material={mat(clay(c))} position={p} scale={s} rotation={r} />;
}

export function Ball({ p, s, c, lo, r }: { p: V3; s: V3; c: string; lo?: boolean; r?: V3 }) {
  return <mesh geometry={lo ? geo.sphereLo : geo.sphere} material={mat(clay(c))} position={p} scale={s} rotation={r} />;
}

/** A large ground slab for one scene. */
export function Ground({ span, color, depth = 70 }: { span: number; color: string; depth?: number }) {
  return (
    <mesh geometry={geo.plane} material={mat(clay(color, 0.08), 1)} rotation={[-Math.PI / 2, 0, 0]} position={[span / 2, 0, -depth / 2 + 12]} scale={[span + 0.02, depth, 1]} />
  );
}

/** Soft radial blob texture used for contact shadows. */
let blob: THREE.Texture | null = null;
export function blobTexture() {
  if (blob) return blob;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(20,20,20,0.34)");
  grad.addColorStop(0.5, "rgba(20,20,20,0.12)");
  grad.addColorStop(1, "rgba(20,20,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  blob = new THREE.CanvasTexture(c);
  return blob;
}

export function ContactShadow({ scale = 1.1 }: { scale?: number }) {
  const m = useMemo(
    () => new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
    [],
  );
  return <mesh geometry={geo.plane} material={m} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} scale={[scale, scale * 0.8, 1]} />;
}

/** Paper with a few printed lines — the recurring "record" object. */
let paperTex: THREE.Texture | null = null;
function paperTexture() {
  if (paperTex) return paperTex;
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 96, 128);
  g.fillStyle = "rgba(60,58,54,0.35)";
  g.fillRect(12, 14, 46, 4);
  for (let y = 30; y < 116; y += 11) g.fillRect(12, y, 50 + ((y * 7) % 22), 2);
  paperTex = new THREE.CanvasTexture(c);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  return paperTex;
}

export type Sheet = {
  from: V3;
  rot?: V3;
  to?: V3;
  toScale?: [number, number];
};

/**
 * Sheets of paper driven by a scene's scroll progress: they appear, may gather into
 * an ordered structure, and may drift away and fade — fragments becoming (or failing
 * to become) a record.
 */
export function Sheets({
  scene,
  sheets,
  appear,
  gather,
  vanish,
  drift = [0, -1, 0],
  size = [0.42, 0.56],
}: {
  scene: number;
  sheets: Sheet[];
  appear: [number, number];
  gather?: [number, number];
  vanish?: [number, number];
  drift?: V3;
  size?: [number, number];
}) {
  const group = useRef<THREE.Group>(null);
  const materials = useMemo(
    () =>
      sheets.map(
        () =>
          new THREE.MeshStandardMaterial({
            map: paperTexture(),
            roughness: 0.95,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
      ),
    [sheets],
  );

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const p = journey.locals[scene] ?? 0;
    const time = clock.elapsedTime;
    g.children.forEach((m, i) => {
      const s = sheets[i];
      const stag = i * 0.012;
      const a = smoothstep(appear[0] + stag, appear[1] + stag, p);
      const gt = gather ? smoothstep(gather[0] + stag, gather[1] + stag, p) : 0;
      const vt = vanish ? smoothstep(vanish[0] + stag, vanish[1] + stag, p) : 0;
      const to = s.to ?? s.from;
      const bob = journey.reduced ? 0 : Math.sin(time * 0.8 + i * 1.7) * 0.04 * (1 - gt);
      m.position.set(
        s.from[0] + (to[0] - s.from[0]) * gt + drift[0] * vt,
        s.from[1] + (to[1] - s.from[1]) * gt + drift[1] * vt + bob + (1 - a) * -0.25,
        s.from[2] + (to[2] - s.from[2]) * gt + drift[2] * vt,
      );
      const r = s.rot ?? [0, 0, 0];
      m.rotation.set(r[0] * (1 - gt) + vt * 0.6, r[1] * (1 - gt), r[2] * (1 - gt) + vt * 0.4);
      const ts = s.toScale ?? size;
      m.scale.set(size[0] + (ts[0] - size[0]) * gt, size[1] + (ts[1] - size[1]) * gt, 1);
      const mt = materials[i];
      mt.opacity = a * (1 - vt);
      m.visible = mt.opacity > 0.01;
    });
  });

  return (
    <group ref={group}>
      {sheets.map((_, i) => (
        <mesh key={i} geometry={geo.plane} material={materials[i]} />
      ))}
    </group>
  );
}

/** Seeded random so every scene is laid out the same way on every visit. */
export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
