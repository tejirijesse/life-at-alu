
// A stylised, collectible-figure version of Tejiri, built from soft primitives:
// slightly oversized head, compact body, an afro, glasses, a small moustache,
// a black t-shirt (with a black leather jacket in some places), dark trousers,
// and white three-stripe trainers with a gum sole.

import * as THREE from "three";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { capsule, ContactShadow, geo, mat, seeded } from "./kit";
import { BodyPieces, Fila, FULL_LENGTH, HairPieces, LowerSleeve, PRINTED, printMaterial, TorsoPieces, UpperSleeve, type HairKind, type OutfitKind } from "./outfits";

export type Outfit = "tee" | "jacket";

export type FigureStyle = {
  skin: string;
  hair: string;
  /** T-shirt / base layer. */
  top: string;
  /** Leather jacket worn over the top in some places. */
  jacket: string;
  trousers: string;
  shoes: string;
  stripes?: string;
  sole: string;
  glasses: boolean;
  moustache?: boolean;
  hairStyle: HairKind;
  face?: boolean;
  /** Avatar-creator options (see outfits.tsx). Without them the figure wears a plain tee. */
  body?: "masc" | "fem";
  outfit?: OutfitKind;
  /** Second colour for prints and trims. */
  accent?: string;
};

export const tejiri: FigureStyle = {
  skin: "#6e4130",
  hair: "#141010",
  top: "#1a1a1b",
  jacket: "#121213",
  trousers: "#1f1f21",
  shoes: "#f7f7f5",
  stripes: "#141414",
  sole: "#a8774f",
  glasses: true,
  moustache: true,
  hairStyle: "afro",
};

// Everyone else is a soft white figure, so Tejiri is the only colour in the world.
const mannequin = (tone = "#ecebe8"): FigureStyle => ({
  skin: tone,
  hair: "#d9d8d4",
  top: tone,
  jacket: tone,
  trousers: "#dedcd8",
  shoes: "#f4f4f2",
  sole: "#d6d5d1",
  glasses: false,
  hairStyle: "short",
  face: false,
});

export const athlete: FigureStyle = mannequin("#e9e8e4");

export const bystander = (_jacket?: string, _trousers?: string): FigureStyle => mannequin();

const hairCap = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, 1.3);

export type Rig = {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  shL: THREE.Group;
  shR: THREE.Group;
  elL: THREE.Group;
  elR: THREE.Group;
  backpack: THREE.Group;
  /** Every piece of the leather jacket; toggle visibility to change outfit. */
  jacket: THREE.Object3D[];
};

export function setOutfit(r: Rig, outfit: Outfit) {
  const on = outfit === "jacket";
  for (const o of r.jacket) if (o.visible !== on) o.visible = on;
}

export type Pose = {
  phase: number;
  amp: number;
  jog: number;
  sit: number;
  headYaw: number;
  headPitch: number;
  time: number;
};

/** Walk / jog / sit, blended. Angles are kept small: calm and confident, never bouncy. */
export function poseFigure(r: Rig, s: Pose) {
  const { phase, amp, jog, sit, time } = s;
  const A = amp * (1 + jog * 0.45);
  const sw = Math.sin(phase);
  const cw = Math.cos(phase);
  const breath = Math.sin(time * 1.6) * 0.006 * (1 - amp);

  const legSwing = 0.5 * A;
  r.hipL.rotation.x = -sw * legSwing * (1 - sit) - (Math.PI / 2) * sit;
  r.hipR.rotation.x = sw * legSwing * (1 - sit) - (Math.PI / 2) * sit;
  const kneeAmt = (0.7 + jog * 0.6) * A;
  r.kneeL.rotation.x = (Math.max(0, cw) * kneeAmt + 0.04 * A) * (1 - sit) + (Math.PI / 2) * sit;
  r.kneeR.rotation.x = (Math.max(0, -cw) * kneeAmt + 0.04 * A) * (1 - sit) + (Math.PI / 2) * sit;

  const armSwing = (0.42 + jog * 0.25) * A;
  r.shL.rotation.x = sw * armSwing * (1 - sit) - 0.55 * sit;
  r.shR.rotation.x = -sw * armSwing * (1 - sit) - 0.55 * sit;
  r.shL.rotation.z = -0.07 - jog * 0.05;
  r.shR.rotation.z = 0.07 + jog * 0.05;
  const elbow = -(0.18 + 0.25 * A + jog * 1.0);
  r.elL.rotation.x = elbow * (1 - sit) - 0.75 * sit;
  r.elR.rotation.x = elbow * (1 - sit) - 0.75 * sit;

  r.torso.rotation.y = sw * 0.07 * A * (1 - sit);
  r.torso.rotation.x = 0.03 * A + jog * 0.13 + sit * 0.06 + breath;
  r.body.position.y = (Math.abs(cw) - 0.6) * 0.045 * A * (1 - sit) - 0.31 * sit;
  r.body.position.z = -0.02 * sit;

  r.head.rotation.y = s.headYaw;
  r.head.rotation.x = s.headPitch + sit * 0.16 - jog * 0.08;
}

function hairPoints(style: HairKind) {
  const rand = seeded(style === "afro" ? 7 : 11);
  const pts: { p: THREE.Vector3; s: number }[] = [];
  if (style === "short") {
    const n = 200;
    const tilt = new THREE.Euler(0.32, 0, 0);
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = i * 2.399963;
      const d = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad);
      if (d.clone().applyEuler(tilt).y < 0.3) continue;
      pts.push({ p: d.multiplyScalar(0.34), s: 0.04 });
    }
    return pts;
  }
  // Afro: a full, rounded volume sitting high and slightly back, clear of the face.
  const n = 620;
  const centre = new THREE.Vector3(0, 0.085, -0.035);
  const radii = new THREE.Vector3(0.425, 0.39, 0.415);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    const d = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad);
    // Leave the face, the ears and the nape open.
    if (d.y < -0.32) continue;
    if (d.z > 0.42 && d.y < 0.42) continue;
    if (Math.abs(d.x) > 0.8 && d.y < 0.05 && d.z > -0.3) continue;
    const jitter = 0.97 + rand() * 0.06;
    const p = new THREE.Vector3(d.x * radii.x, d.y * radii.y, d.z * radii.z).multiplyScalar(jitter).add(centre);
    pts.push({ p, s: 0.062 + rand() * 0.034 });
  }
  return pts;
}

export const Figure = forwardRef<Rig, { style: FigureStyle; shadow?: boolean }>(function Figure(
  { style, shadow = true },
  ref,
) {
  const g = {
    root: useRef<THREE.Group>(null!),
    body: useRef<THREE.Group>(null!),
    torso: useRef<THREE.Group>(null!),
    head: useRef<THREE.Group>(null!),
    hipL: useRef<THREE.Group>(null!),
    hipR: useRef<THREE.Group>(null!),
    kneeL: useRef<THREE.Group>(null!),
    kneeR: useRef<THREE.Group>(null!),
    shL: useRef<THREE.Group>(null!),
    shR: useRef<THREE.Group>(null!),
    elL: useRef<THREE.Group>(null!),
    elR: useRef<THREE.Group>(null!),
    backpack: useRef<THREE.Group>(null!),
  };
  const jacketParts = useRef<Set<THREE.Object3D>>(new Set());
  const jacketRef = (o: THREE.Object3D | null) => {
    if (o) jacketParts.current.add(o);
  };
  useImperativeHandle(ref, () => ({
    ...(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.current])) as Omit<Rig, "jacket">),
    jacket: [...jacketParts.current],
  }));

  const outfit: OutfitKind = style.outfit ?? "tee";
  const fem = style.body === "fem";
  const accent = style.accent ?? style.top;
  const skin = mat(style.skin, 0.62);
  // Printed outfits use the wax-print fabric everywhere the plain top would go.
  const top = PRINTED.has(outfit) ? printMaterial(style.top, accent) : mat(outfit === "smart" ? "#f4f2ee" : style.top, 0.95);
  const fabric = outfit === "agbada" ? mat(style.top, 0.85) : outfit === "smart" ? mat(style.top, 0.7) : top;
  const leather = mat(style.jacket, 0.42, 0.12);
  const trousers = mat(style.trousers, 0.9);
  const shoe = mat(style.shoes, 0.5);
  const stripe = mat(style.stripes ?? style.shoes, 0.5);
  const sole = mat(style.sole, 0.75);
  const hairMat = mat(style.hair, 1);
  const dark = mat("#1b1a19", 0.35, 0.2);
  const isTejiri = !!style.stripes;

  const curls = style.hairStyle === "afro" || style.hairStyle === "short";
  const hair = useMemo(() => {
    const pts = curls ? hairPoints(style.hairStyle) : [];
    const mesh = new THREE.InstancedMesh(geo.sphereLo, hairMat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach((h, i) => {
      m.compose(h.p, new THREE.Quaternion(), new THREE.Vector3(h.s, h.s * 0.92, h.s));
      mesh.setMatrixAt(i, m);
    });
    return mesh;
  }, [style.hairStyle, hairMat]);

  const leg = (side: 1 | -1) => (
    <group key={side} ref={side < 0 ? g.hipL : g.hipR} position={[side * 0.1, 0.68, 0]}>
      <mesh geometry={capsule(0.085, 0.2)} material={trousers} position={[0, -0.16, 0]} />
      <group ref={side < 0 ? g.kneeL : g.kneeR} position={[0, -0.32, 0]}>
        <mesh geometry={capsule(0.075, 0.18)} material={outfit === "sport" ? skin : trousers} position={[0, -0.13, 0]} />
        {/* trainer: white upper, three stripes each side, heel tab, gum sole */}
        <mesh geometry={capsule(0.072, 0.11)} material={shoe} position={[0, -0.285, 0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.78]} />
        <mesh geometry={capsule(0.078, 0.12)} material={sole} position={[0, -0.325, 0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.32]} />
        {isTejiri &&
          [-1, 1].flatMap((face) =>
            [0, 1, 2].map((k) => (
              <mesh
                key={`${face}${k}`}
                geometry={geo.box}
                material={stripe}
                position={[face * 0.071, -0.282, 0.012 + k * 0.032]}
                rotation={[-0.55, 0, 0]}
                scale={[0.006, 0.07, 0.012]}
              />
            )),
          )}
        {isTejiri && <mesh geometry={geo.box} material={stripe} position={[0, -0.272, -0.072]} scale={[0.05, 0.05, 0.01]} />}
      </group>
    </group>
  );

  const arm = (side: 1 | -1) => (
    <group key={side} ref={side < 0 ? g.shL : g.shR} position={[side * (fem ? 0.235 : 0.255), 0.42, 0]}>
      {/* t-shirt sleeve, then bare arm */}
      <mesh geometry={capsule(0.074, 0.06)} material={top} position={[0, -0.06, 0]} />
      <mesh geometry={capsule(0.056, 0.12)} material={skin} position={[0, -0.15, 0]} />
      <mesh ref={jacketRef} geometry={capsule(0.082, 0.15)} material={leather} position={[0, -0.13, 0]} visible={false} />
      <UpperSleeve outfit={outfit} fabric={fabric} />
      <group ref={side < 0 ? g.elL : g.elR} position={[0, -0.27, 0]}>
        <LowerSleeve outfit={outfit} fabric={fabric} />
        <mesh geometry={capsule(0.052, 0.13)} material={skin} position={[0, -0.11, 0]} />
        <mesh ref={jacketRef} geometry={capsule(0.066, 0.13)} material={leather} position={[0, -0.11, 0]} visible={false} />
        <mesh geometry={geo.sphere} material={skin} position={[0, -0.25, 0.005]} scale={[0.058, 0.066, 0.058]} />
      </group>
    </group>
  );

  return (
    <group ref={g.root}>
      {shadow && <ContactShadow scale={1.15} />}
      <group ref={g.body}>
        <mesh geometry={geo.sphere} material={trousers} position={[0, 0.7, 0]} scale={[fem ? 0.22 : 0.2, 0.13, 0.16]} />
        {leg(-1)}
        {leg(1)}
        {FULL_LENGTH.has(outfit) && <BodyPieces outfit={outfit} fabric={fabric} accent={accent} fem={fem} />}
        <group ref={g.torso} position={[0, 0.72, 0]}>
          {/* black t-shirt with a crew neck */}
          <mesh geometry={capsule(0.2, 0.22)} material={top} position={[0, 0.22, 0]} scale={[fem ? 1.0 : 1.1, 1, 0.82]} />
          <TorsoPieces outfit={outfit} fabric={fabric} accent={accent} colour={style.top} />
          <mesh geometry={geo.torus} material={top} position={[0, 0.48, 0.01]} rotation={[Math.PI / 2 - 0.15, 0, 0]} scale={[0.085, 0.075, 0.5]} />
          {/* leather jacket, shown in some places */}
          <group ref={jacketRef} visible={false}>
            <mesh geometry={capsule(0.212, 0.22)} material={leather} position={[0, 0.22, -0.006]} scale={[1.12, 1, 0.84]} />
            <mesh geometry={geo.box} material={top} position={[0, 0.3, 0.172]} scale={[0.07, 0.34, 0.02]} />
            <mesh geometry={geo.box} material={leather} position={[-0.07, 0.42, 0.176]} scale={[0.07, 0.2, 0.02]} rotation={[-0.12, 0, -0.4]} />
            <mesh geometry={geo.box} material={leather} position={[0.07, 0.42, 0.176]} scale={[0.07, 0.2, 0.02]} rotation={[-0.12, 0, 0.4]} />
            <mesh geometry={geo.box} material={mat("#3a3a3c", 0.3, 0.6)} position={[0.05, 0.2, 0.19]} scale={[0.004, 0.26, 0.004]} />
          </group>
          <group ref={g.backpack} visible={false}>
            <mesh geometry={capsule(0.15, 0.16)} material={mat("#2a2a2c", 0.8)} position={[0, 0.25, -0.22]} scale={[1.05, 1, 0.55]} />
            <mesh geometry={geo.box} material={mat("#232325")} position={[-0.11, 0.33, -0.02]} scale={[0.03, 0.34, 0.3]} />
            <mesh geometry={geo.box} material={mat("#232325")} position={[0.11, 0.33, -0.02]} scale={[0.03, 0.34, 0.3]} />
          </group>
          {arm(-1)}
          {arm(1)}
          <mesh geometry={geo.cyl} material={skin} position={[0, 0.52, 0]} scale={[0.075, 0.12, 0.075]} />
          <group ref={g.head} position={[0, 0.83, 0]}>
            <mesh geometry={geo.sphere} material={skin} scale={[0.34, 0.355, 0.325]} />
            {/* hair: a dark base plus instanced curls for texture and volume */}
            {style.hairStyle === "afro" && (
              <mesh geometry={hairCap} material={hairMat} position={[0, 0.06, -0.04]} scale={[0.405, 0.385, 0.4]} rotation={[-0.42, 0, 0]} />
            )}
            {style.hairStyle === "short" && (
              <mesh geometry={hairCap} material={hairMat} position={[0, 0.01, -0.01]} scale={[0.348, 0.36, 0.335]} rotation={[-0.34, 0, 0]} />
            )}
            {curls && <primitive object={hair} />}
            <HairPieces hair={style.hairStyle} hairMat={hairMat} wrap={printMaterial(accent, style.top)} outfit={outfit} />
            {outfit === "agbada" && style.hairStyle !== "headwrap" && <Fila colour={accent} />}
            {/* ears */}
            <mesh geometry={geo.sphere} material={skin} position={[0.336, -0.01, 0]} scale={[0.04, 0.065, 0.05]} />
            <mesh geometry={geo.sphere} material={skin} position={[-0.336, -0.01, 0]} scale={[0.04, 0.065, 0.05]} />
            {style.face !== false && (
              <>
                <mesh geometry={geo.sphere} material={dark} position={[0.115, 0.01, 0.3]} scale={[0.028, 0.034, 0.02]} />
                <mesh geometry={geo.sphere} material={dark} position={[-0.115, 0.01, 0.3]} scale={[0.028, 0.034, 0.02]} />
                <mesh geometry={geo.box} material={hairMat} position={[0.115, 0.1, 0.302]} scale={[0.085, 0.017, 0.02]} rotation={[0, 0, -0.06]} />
                <mesh geometry={geo.box} material={hairMat} position={[-0.115, 0.1, 0.302]} scale={[0.085, 0.017, 0.02]} rotation={[0, 0, 0.06]} />
                <mesh geometry={geo.sphere} material={mat("#633a2a", 0.6)} position={[0, -0.06, 0.322]} scale={[0.04, 0.036, 0.03]} />
                {style.moustache && (
                  <>
                    <mesh geometry={capsule(0.011, 0.04)} material={hairMat} position={[0.032, -0.112, 0.316]} rotation={[0, 0, Math.PI / 2 + 0.22]} />
                    <mesh geometry={capsule(0.011, 0.04)} material={hairMat} position={[-0.032, -0.112, 0.316]} rotation={[0, 0, Math.PI / 2 - 0.22]} />
                  </>
                )}
                <mesh geometry={geo.box} material={mat("#3e2219", 0.7)} position={[0, -0.158, 0.302]} scale={[0.06, 0.011, 0.012]} />
              </>
            )}
            {style.glasses && (
              <group position={[0, 0.01, 0.335]}>
                <mesh geometry={geo.torus} material={dark} position={[0.118, 0, 0]} scale={[0.082, 0.072, 0.4]} />
                <mesh geometry={geo.torus} material={dark} position={[-0.118, 0, 0]} scale={[0.082, 0.072, 0.4]} />
                <mesh geometry={geo.box} material={dark} position={[0, 0.012, 0]} scale={[0.06, 0.011, 0.011]} />
                <mesh geometry={geo.box} material={dark} position={[0.205, 0.01, -0.17]} scale={[0.011, 0.011, 0.34]} rotation={[0, -0.1, 0]} />
                <mesh geometry={geo.box} material={dark} position={[-0.205, 0.01, -0.17]} scale={[0.011, 0.011, 0.34]} rotation={[0, 0.1, 0]} />
              </group>
            )}
          </group>
        </group>
      </group>
    </group>
  );
});
