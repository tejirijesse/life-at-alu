// What marks each game spot on campus (shared/world.ts ZONES): a court with a hoop, goals on the
// lawn, archery targets, a pool table in the Commons, chess boards at the pods, a quiz screen in
// the library, a notice board and a pitch stage, each with a soft glowing ring on the ground.

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { net } from "../net";
import { ZONES, type Zone } from "../../shared/world";
import { surfaceAt } from "./indoors";

const m = (color: string, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
const M = {
  court: m("#c8834e", 0.95),
  line: m("#f4ead8", 0.9),
  steel: m("#3a3a3a", 0.5, { metalness: 0.4 }),
  white: m("#fafafa", 0.6),
  rim: m("#d4691f", 0.4),
  felt: m("#1f6b46", 0.9),
  wood: m("#6b4226", 0.7),
  board: m("#f1e6cf", 0.8),
  dark: m("#2a2a2a", 0.8),
  target: [m("#fafafa"), m("#1a1a1b"), m("#1d3f8a"), m("#c0392b"), m("#e1b44c")],
  hay: m("#d8b65e", 1),
  screen: m("#0f2b55", 0.3, { emissive: "#1d3f8a", emissiveIntensity: 0.5 }),
  ring: new THREE.MeshBasicMaterial({ color: "#ffd166", transparent: true, opacity: 0.45, depthWrite: false }),
};

/** Paint for a sign or screen, drawn once. */
function label(text: string, bg: string, fg: string, w = 512, h = 128) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${Math.round(h * 0.42)}px ui-monospace, Menlo, monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
}

function Court() {
  return (
    <group>
      <mesh material={M.court} position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[14, 0.06, 9]} />
      </mesh>
      {/* three-point arc and key, as flat strips */}
      <mesh material={M.line} position={[3.4, 0.07, 0]}>
        <boxGeometry args={[0.08, 0.01, 3.6]} />
      </mesh>
      <mesh material={M.line} position={[-1.2, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.6, 4.7, 40, 1, -Math.PI / 2, Math.PI]} />
      </mesh>
      {/* the hoop at the east end */}
      <mesh material={M.steel} position={[6.6, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 3.2, 8]} />
      </mesh>
      <mesh material={M.white} position={[6.4, 3.1, 0]} castShadow>
        <boxGeometry args={[0.06, 1.0, 1.6]} />
      </mesh>
      <mesh material={M.rim} position={[6.05, 2.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.025, 6, 20]} />
      </mesh>
    </group>
  );
}

function Goals() {
  const goal = (x: number) => (
    <group position={[x, 0, 0]}>
      {[-1.6, 1.6].map((z) => (
        <mesh key={z} material={M.white} position={[0, 0.9, z]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.8, 8]} />
        </mesh>
      ))}
      <mesh material={M.white} position={[0, 1.8, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 3.25, 8]} />
      </mesh>
    </group>
  );
  return (
    <group>
      {goal(-7)}
      {goal(7)}
      <mesh material={M.line} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 1.9, 40]} />
      </mesh>
      <mesh material={M.line} position={[0, 0.03, 0]}>
        <boxGeometry args={[0.08, 0.01, 8]} />
      </mesh>
    </group>
  );
}

function Range() {
  return (
    <group>
      {[-2.2, 0, 2.2].map((z) => (
        <group key={z} position={[-3, 0, z]}>
          <mesh material={M.hay} position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.8, 1, 1.4]} />
          </mesh>
          {M.target.map((mt, i) => (
            <mesh key={i} material={mt} position={[0.41 + i * 0.002, 1.25, 0]} rotation={[0, Math.PI / 2, 0]}>
              <circleGeometry args={[0.5 - i * 0.1, 24]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh material={M.line} position={[3, 0.03, 0]}>
        <boxGeometry args={[0.08, 0.01, 6]} />
      </mesh>
    </group>
  );
}

function PoolTable() {
  return (
    <group>
      <mesh material={M.wood} position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.12, 1.35]} />
      </mesh>
      <mesh material={M.felt} position={[0, 0.79, 0]}>
        <boxGeometry args={[2.2, 0.02, 1.15]} />
      </mesh>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <mesh key={`${x}${z}`} material={M.wood} position={[x * 1.05, 0.34, z * 0.55]}>
          <boxGeometry args={[0.14, 0.68, 0.14]} />
        </mesh>
      )))}
      {["#f2f0ea", "#e1b44c", "#1d3f8a", "#c0392b", "#1a1a1b"].map((c, i) => (
        <mesh key={c} position={[-0.6 + i * 0.12 + (i % 2) * 0.05, 0.83, (i % 3) * 0.06 - 0.06]}>
          <sphereGeometry args={[0.03, 10, 8]} />
          <meshStandardMaterial color={c} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function ChessTable() {
  const board = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      g.fillStyle = (i + j) % 2 ? "#6b4226" : "#f1e6cf";
      g.fillRect(i * 8, j * 8, 8, 8);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  }, []);
  return (
    <group position={[2.4, 0, 0]}>
      <mesh material={M.wood} position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.2, 0.72, 10]} />
      </mesh>
      <mesh material={board} position={[0, 0.74, 0]}>
        <boxGeometry args={[0.7, 0.04, 0.7]} />
      </mesh>
    </group>
  );
}

/** The library screen: "ALU QUIZ NIGHT", or the PIN to join while a quiz is gathering players. */
function QuizScreen() {
  const [face] = useState(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 288;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, t, m: new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.35 }) };
  });
  useEffect(() => {
    const paint = (lines: [string, string]) => {
      const g = face.c.getContext("2d")!;
      g.fillStyle = "#0f2b55";
      g.fillRect(0, 0, 512, 288);
      g.fillStyle = "#ffd166";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = "bold 44px ui-monospace, Menlo, monospace";
      g.fillText(lines[0], 256, 100);
      g.fillStyle = "#ffffff";
      g.font = "bold 64px ui-monospace, Menlo, monospace";
      g.fillText(lines[1], 256, 190);
      face.t.needsUpdate = true;
    };
    paint(["ALU QUIZ NIGHT", "Host a quiz"]);
    return net.onGame("quiz", (d) => {
      const s = d as { type: string; phase?: string; pin?: string | null; index?: number; total?: number };
      if (s.type !== "screen") return;
      if (s.phase === "lobby" && s.pin) paint(["JOIN WITH PIN", s.pin]);
      else if (s.phase === "question" || s.phase === "reveal") paint(["QUIZ NIGHT", `Q ${(s.index ?? 0) + 1} / ${s.total}`]);
      else if (s.phase === "podium") paint(["QUIZ NIGHT", "Final scores"]);
      else paint(["ALU QUIZ NIGHT", "Host a quiz"]);
    });
  }, [face]);
  return (
    <group position={[0, 0, -3.2]}>
      <mesh material={M.dark} position={[0, 1.7, -0.04]}>
        <boxGeometry args={[3.2, 1.9, 0.06]} />
      </mesh>
      <mesh material={face.m} position={[0, 1.7, 0]}>
        <planeGeometry args={[3.0, 1.7]} />
      </mesh>
    </group>
  );
}

function NoticeBoard() {
  const face = useMemo(() => label("CAMPUS POLL", "#f1e6cf", "#1d3f8a"), []);
  return (
    <group rotation={[0, Math.PI, 0]}>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} material={M.wood} position={[x, 0.9, 0]} castShadow>
          <boxGeometry args={[0.1, 1.8, 0.1]} />
        </mesh>
      ))}
      <mesh material={M.wood} position={[0, 1.35, -0.02]} castShadow>
        <boxGeometry args={[2.0, 1.0, 0.06]} />
      </mesh>
      <mesh material={face} position={[0, 1.35, 0.015]}>
        <planeGeometry args={[1.85, 0.85]} />
      </mesh>
    </group>
  );
}

function PitchStage() {
  const banner = useMemo(() => label("STARTUP PITCH", "#1a1a1b", "#e1b44c"), []);
  return (
    <group position={[0, 0, -2.2]}>
      <mesh material={M.wood} position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[3.2, 0.2, 1.6]} />
      </mesh>
      <mesh material={banner} position={[0, 1.9, -0.7]}>
        <planeGeometry args={[2.6, 0.65]} />
      </mesh>
      <mesh material={M.steel} position={[0.6, 0.75, 0.2]}>
        <cylinderGeometry args={[0.02, 0.02, 1.1, 6]} />
      </mesh>
    </group>
  );
}

const PROPS: Record<Zone["game"], () => React.ReactNode> = {
  basketball: Court,
  football: Goals,
  archery: Range,
  pool: PoolTable,
  chess: ChessTable,
  quiz: QuizScreen,
  poll: NoticeBoard,
  startup: PitchStage,
};

/** A soft ring that breathes, so you can spot a game from across the terrace. */
function Ring({ r }: { r: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(clock.elapsedTime * 2) * 0.15;
  });
  return (
    <mesh ref={ref} material={M.ring.clone()} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <ringGeometry args={[r - 0.12, r, 48]} />
    </mesh>
  );
}

export default function GameSpots() {
  const spots = useMemo(() => ZONES.map((z) => ({ z, y: surfaceAt(z.x, z.z, z.y + 0.3) ?? z.y })), []);
  return (
    <>
      {spots.map(({ z, y }) => {
        const Prop = PROPS[z.game];
        return (
          <group key={z.id} position={[z.x, y, z.z]}>
            <Prop />
            <Ring r={Math.min(z.radius, 3)} />
          </group>
        );
      })}
    </>
  );
}
