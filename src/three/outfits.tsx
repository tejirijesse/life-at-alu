// Outfits and hairstyles for the avatar creator, built from the same soft primitives as the
// figure: Rwandan umushanana, Nigerian agbada and iro & buba, kitenge prints, hoodies, blazers,
// sportswear; locs, braids, buns and headwraps.
//
// Each piece mounts inside a group of the Figure's rig (body, torso, head, arm, forearm), so it
// moves with the walk cycle without any extra animation.

import * as THREE from "three";
import { capsule, geo, mat } from "./kit";

export type OutfitKind = "tee" | "hoodie" | "smart" | "sport" | "kitenge" | "umushanana" | "agbada" | "iro";
export type HairKind = "afro" | "short" | "locs" | "braids" | "bun" | "headwrap" | "bald";

/** Outfits whose fabric is a wax print in two colours. */
export const PRINTED = new Set<OutfitKind>(["kitenge", "umushanana", "iro"]);
/** Outfits with sleeves to the wrist. */
export const LONG_SLEEVES = new Set<OutfitKind>(["hoodie", "smart", "kitenge", "agbada"]);
/** Outfits that hang to the ankles: legs are hidden under them. */
export const FULL_LENGTH = new Set<OutfitKind>(["umushanana", "agbada", "iro"]);

// ---- Wax-print fabric ----

const prints = new Map<string, THREE.MeshStandardMaterial>();
/** A kitenge-style print: bold motifs in `accent` on `base`, drawn once and cached. */
export function printMaterial(base: string, accent: string) {
  const key = `${base}|${accent}`;
  if (prints.has(key)) return prints.get(key)!;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = accent;
  g.strokeStyle = accent;
  g.lineWidth = 5;
  // Concentric rings, diamonds and a zigzag band: the shapes of a typical wax print.
  for (const [x, y] of [
    [32, 32],
    [96, 96],
  ]) {
    g.beginPath();
    g.arc(x, y, 20, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(x, y, 8, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y] of [
    [96, 32],
    [32, 96],
  ]) {
    g.beginPath();
    g.moveTo(x, y - 16);
    g.lineTo(x + 14, y);
    g.lineTo(x, y + 16);
    g.lineTo(x - 14, y);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  for (let x = 0; x <= 128; x += 16) g.lineTo(x, x % 32 ? 60 : 68);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  prints.set(key, m);
  return m;
}

const skirtGeo = (top: number, bottom: number, h: number) => {
  const g = new THREE.CylinderGeometry(top, bottom, h, 20, 1, true);
  return g;
};
const longSkirt = skirtGeo(0.2, 0.34, 0.66);
const robe = skirtGeo(0.3, 0.46, 0.92);

// ---- Pieces on the body (hangs from the hips; legs move underneath) ----

export function BodyPieces({ outfit, fabric, accent, fem }: { outfit: OutfitKind; fabric: THREE.Material; accent: string; fem: boolean }) {
  if (outfit === "umushanana" || outfit === "iro")
    return <mesh geometry={longSkirt} material={fabric} position={[0, 0.41, 0]} scale={[fem ? 1.05 : 1, 1, 0.85]} />;
  if (outfit === "agbada")
    return (
      <>
        <mesh geometry={robe} material={fabric} position={[0, 0.58, 0]} scale={[1, 1, 0.7]} />
      </>
    );
  return null;
}

// ---- Pieces on the torso ----

export function TorsoPieces({ outfit, fabric, accent, colour }: { outfit: OutfitKind; fabric: THREE.Material; accent: string; colour: string }) {
  switch (outfit) {
    case "hoodie":
      return (
        <>
          {/* the hood, resting on the shoulders */}
          <mesh geometry={geo.torus} material={fabric} position={[0, 0.47, -0.07]} rotation={[Math.PI / 2 + 0.35, 0, 0]} scale={[0.17, 0.15, 1.8]} />
          {/* front pocket and the ALU initials */}
          <mesh geometry={geo.box} material={mat("#2a2a2a", 0.9)} position={[0, 0.1, 0.17]} scale={[0.22, 0.08, 0.01]} />
          <mesh geometry={geo.box} material={mat(accent, 0.6)} position={[0, 0.3, 0.178]} scale={[0.14, 0.04, 0.005]} />
        </>
      );
    case "smart":
      // A blazer over a white shirt: lapels, buttons, and the jacket body itself.
      return (
        <>
          <mesh geometry={capsule(0.212, 0.22)} material={mat(colour, 0.7)} position={[0, 0.22, -0.006]} scale={[1.12, 1, 0.84]} />
          <mesh geometry={geo.box} material={mat("#f4f2ee", 0.8)} position={[0, 0.3, 0.174]} scale={[0.08, 0.34, 0.02]} />
          <mesh geometry={geo.box} material={mat(colour, 0.7)} position={[-0.07, 0.4, 0.178]} scale={[0.07, 0.22, 0.02]} rotation={[-0.12, 0, -0.4]} />
          <mesh geometry={geo.box} material={mat(colour, 0.7)} position={[0.07, 0.4, 0.178]} scale={[0.07, 0.22, 0.02]} rotation={[-0.12, 0, 0.4]} />
          <mesh geometry={geo.box} material={mat(accent, 0.5)} position={[0, 0.34, 0.186]} scale={[0.03, 0.16, 0.01]} />
        </>
      );
    case "sport":
      return <mesh geometry={geo.box} material={mat(accent, 0.8)} position={[0, 0.22, 0.17]} scale={[0.03, 0.44, 0.01]} />;
    case "umushanana":
      // The sash: draped from the left shoulder across to the right hip.
      return <mesh geometry={geo.box} material={mat(accent, 0.85)} position={[0.02, 0.2, 0.16]} rotation={[0, 0, -0.62]} scale={[0.1, 0.62, 0.03]} />;
    case "agbada":
      // The big outer robe across the shoulders, with embroidery down the front.
      return (
        <>
          <mesh geometry={capsule(0.26, 0.2)} material={fabric} position={[0, 0.22, -0.01]} scale={[1.35, 1, 0.85]} />
          <mesh geometry={geo.box} material={mat(accent, 0.7)} position={[0, 0.26, 0.222]} scale={[0.16, 0.34, 0.012]} />
          <mesh geometry={geo.torus} material={mat(accent, 0.7)} position={[0, 0.47, 0.02]} rotation={[Math.PI / 2 - 0.2, 0, 0]} scale={[0.1, 0.09, 0.6]} />
        </>
      );
    case "iro":
      // The buba: a loose blouse, a little wider than a tee.
      return <mesh geometry={capsule(0.215, 0.2)} material={fabric} position={[0, 0.2, 0]} scale={[1.2, 1, 0.86]} />;
    default:
      return null;
  }
}

// ---- Sleeves ----

export function UpperSleeve({ outfit, fabric }: { outfit: OutfitKind; fabric: THREE.Material }) {
  if (!LONG_SLEEVES.has(outfit)) return null;
  const wide = outfit === "agbada";
  return <mesh geometry={capsule(wide ? 0.1 : 0.068, 0.15)} material={fabric} position={[0, -0.13, 0]} scale={wide ? [1.5, 1, 1.2] : [1, 1, 1]} />;
}
export function LowerSleeve({ outfit, fabric }: { outfit: OutfitKind; fabric: THREE.Material }) {
  if (!LONG_SLEEVES.has(outfit)) return null;
  const wide = outfit === "agbada";
  return <mesh geometry={capsule(wide ? 0.11 : 0.062, 0.13)} material={fabric} position={[0, -0.11, 0]} scale={wide ? [1.7, 1, 1.3] : [1, 1, 1]} />;
}

// ---- Hair beyond afro and short (those are the figure's own instanced curls) ----

const cap = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, 1.3);

export function HairPieces({ hair, hairMat, wrap, outfit }: { hair: HairKind; hairMat: THREE.Material; wrap: THREE.Material; outfit: OutfitKind }) {
  const strands = (n: number, r: number, len: number, spread: number) =>
    Array.from({ length: n }, (_, i) => {
      // Around the back and sides, leaving the face clear.
      const a = Math.PI * (0.18 + (1.64 * i) / (n - 1));
      return (
        <mesh
          key={i}
          geometry={capsule(r, len)}
          material={hairMat}
          position={[Math.cos(a) * spread, -0.12 - len / 2 + 0.05, -Math.sin(a) * spread * 0.9 - 0.03]}
          rotation={[Math.sin(a) * 0.15, 0, Math.cos(a) * 0.12]}
        />
      );
    });
  switch (hair) {
    case "locs":
      return (
        <>
          <mesh geometry={cap} material={hairMat} position={[0, 0.02, -0.01]} scale={[0.36, 0.37, 0.35]} rotation={[-0.34, 0, 0]} />
          {strands(13, 0.034, 0.3, 0.3)}
        </>
      );
    case "braids":
      return (
        <>
          <mesh geometry={cap} material={hairMat} position={[0, 0.02, -0.01]} scale={[0.355, 0.365, 0.34]} rotation={[-0.34, 0, 0]} />
          {strands(18, 0.022, 0.46, 0.29)}
        </>
      );
    case "bun":
      return (
        <>
          <mesh geometry={cap} material={hairMat} position={[0, 0.01, -0.01]} scale={[0.35, 0.36, 0.34]} rotation={[-0.34, 0, 0]} />
          <mesh geometry={geo.sphere} material={hairMat} position={[0, 0.34, -0.12]} scale={[0.15, 0.13, 0.15]} />
        </>
      );
    case "headwrap":
      // A gele with iro & buba (tall, fanned); otherwise a rounded wrap with a knot on top.
      return outfit === "iro" ? (
        <>
          <mesh geometry={geo.sphere} material={wrap} position={[0, 0.16, -0.04]} scale={[0.4, 0.3, 0.38]} />
          <mesh geometry={geo.sphere} material={wrap} position={[0, 0.38, -0.08]} scale={[0.46, 0.16, 0.2]} rotation={[0.3, 0, 0]} />
        </>
      ) : (
        <>
          <mesh geometry={geo.sphere} material={wrap} position={[0, 0.17, -0.06]} scale={[0.385, 0.31, 0.37]} />
          <mesh geometry={geo.sphere} material={wrap} position={[0, 0.44, 0]} scale={[0.12, 0.09, 0.11]} />
        </>
      );
    default:
      return null;
  }
}

/** The fila (cap) that goes with an agbada, unless the hair is wrapped. */
export function Fila({ colour }: { colour: string }) {
  return <mesh geometry={geo.cyl} material={mat(colour, 0.85)} position={[0, 0.3, -0.03]} rotation={[-0.2, 0, 0.12]} scale={[0.3, 0.16, 0.3]} />;
}
