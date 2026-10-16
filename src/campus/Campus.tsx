
// Life at ALU — the walkable campus, shared.
// Everyone who opens the link walks the same terraces; names over heads, campus-wide chat.
// Desktop: WASD / arrows to walk, Shift to run, drag (or Q / E) to look around.
// Phones: left thumb on the joystick, drag anywhere else to look.

import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import Architecture from "./Architecture";
import Environment from "./Environment";
import { blocks, heightAt, placeName, plazas, ramps } from "./layout";
import { blockedAt, indoorName, interiorAt, surfaceAt } from "./indoors";
import { Figure, poseFigure, setOutfit, type FigureStyle, type Rig } from "../three/Figure";
import { net } from "../net";
import Crowd from "./Crowd";
import GameSpots from "./GameSpots";
import { Chat, Labels, MapDots, placeLabel, RemotePlayers, styleFor, useNetStatus, useRoster } from "./Live";
import Onboarding, { useAuth } from "./Onboarding";
import GameHost, { Wallet } from "../games/GameHost";
import { LegendsBoard, LevelBadge, Rankings, XpToast } from "./Progress";
import { startById, ZONES, type Zone } from "../../shared/world";

type Input = {
  keys: Set<string>;
  joy: { x: number; y: number };
  yaw: number;
  pitch: number;
  active: boolean;
  /** Bird's-eye orbit around the whole campus. */
  aerial: boolean;
  zoom: number;
  /** Typing in chat: the keyboard belongs to the text box. */
  typing: boolean;
};

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The game spot I'm standing in, if any (same floor, within its radius). */
const zoneAt = (x: number, y: number, z: number) =>
  ZONES.find((zn) => Math.abs(zn.y - y) < 1.6 && Math.hypot(zn.x - x, zn.z - z) < zn.radius) ?? null;

function Player({
  input,
  onPlace,
  onZone,
  dotRef,
  style,
  spawn,
}: {
  input: React.MutableRefObject<Input>;
  onPlace: (p: string) => void;
  onZone: (z: Zone | null) => void;
  dotRef: React.RefObject<SVGGElement | null>;
  style: FigureStyle;
  spawn: { x: number; z: number; facing: number };
}) {
  const rig = useRef<Rig>(null);
  const { camera, scene, size } = useThree();
  // Arrive near the starting point, not all in one spot.
  const [start] = useState(() => ({ x: spawn.x + (Math.random() - 0.5) * 4, z: spawn.z + (Math.random() - 0.5) * 3 }));
  const st = useRef({
    x: start.x,
    z: start.z,
    y: heightAt(start.x, start.z),
    facing: spawn.facing,
    zone: null as Zone | null,
    phase: 0,
    amp: 0,
    run: 0,
    lastPlace: "",
    t: 0,
    cam: new THREE.Vector3(start.x, heightAt(start.x, start.z) + 5, start.z + 9),
  });

  useEffect(() => {
    // Dev only: window.__player lets you teleport while testing (set x, y, z).
    if (import.meta.env.DEV) (window as unknown as { __player: unknown }).__player = st.current;
    rig.current?.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    if (rig.current) setOutfit(rig.current, "tee");
    rig.current && (rig.current.backpack.visible = true);
  }, []);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    const inp = input.current;
    const r = rig.current;
    if (!r) return;

    // Keyboard turning.
    if (inp.typing) inp.keys.clear();
    if (inp.keys.has("q")) inp.yaw += dt * 1.8;
    if (inp.keys.has("e")) inp.yaw -= dt * 1.8;

    let fwd = 0;
    let side = 0;
    if (inp.active) {
      if (inp.keys.has("w") || inp.keys.has("arrowup")) fwd += 1;
      if (inp.keys.has("s") || inp.keys.has("arrowdown")) fwd -= 1;
      if (inp.keys.has("d") || inp.keys.has("arrowright")) side += 1;
      if (inp.keys.has("a") || inp.keys.has("arrowleft")) side -= 1;
      fwd += -inp.joy.y;
      side += inp.joy.x;
    }
    const mag = Math.min(1, Math.hypot(fwd, side));
    const running = inp.keys.has("shift") || Math.hypot(inp.joy.x, inp.joy.y) > 0.92;
    const speed = (running ? 7.5 : 3.6) * mag;

    const fx = Math.sin(inp.yaw);
    const fz = Math.cos(inp.yaw);
    const rx = -Math.cos(inp.yaw);
    const rz = Math.sin(inp.yaw);
    let dx = 0;
    let dz = 0;
    if (mag > 0.01) {
      const n = Math.hypot(fwd, side);
      dx = ((fx * fwd + rx * side) / n) * speed * dt;
      dz = ((fz * fwd + rz * side) / n) * speed * dt;
    }

    // Move axis by axis so walls slide; refuse steps taller than a stair. Height comes from
    // whatever floor, tread or terrace is under you, so upstairs and downstairs stay separate.
    const ground = (x: number, z: number) => surfaceAt(x, z, s.y);
    const here = ground(s.x, s.z) ?? s.y;
    const ok = (x: number, z: number) => {
      const g = ground(x, z);
      return g !== null && Math.abs(g - here) < 0.75 && !blockedAt(x, z, g) && Math.abs(x) < 300 && Math.abs(z) < 300;
    };
    const ox = s.x;
    const oz = s.z;
    if (dx && ok(s.x + dx, s.z)) s.x += dx;
    if (dz && ok(s.x, s.z + dz)) s.z += dz;
    const moved = Math.hypot(s.x - ox, s.z - oz);

    s.y = damp(s.y, ground(s.x, s.z) ?? here, 14, dt);
    if (moved > 1e-4) s.facing += wrap(Math.atan2(s.x - ox, s.z - oz) - s.facing) * (1 - Math.exp(-dt * 10));

    const v = moved / Math.max(dt, 1e-3);
    s.amp = damp(s.amp, Math.min(1, v / 3), 8, dt);
    s.run = damp(s.run, running && v > 4 ? 1 : 0, 5, dt);
    s.phase += moved * ((Math.PI * 2) / (1.35 + s.run * 0.7));

    r.root.position.set(s.x, s.y, s.z);
    r.root.rotation.y = s.facing;
    poseFigure(r, { phase: s.phase, amp: s.amp, jog: s.run, sit: 0, headYaw: 0, headPitch: 0, time: clock.elapsedTime });
    net.move(s.x, s.y, s.z, s.facing, s.amp, s.run);
    if (net.id) placeLabel(net.id, s.x, s.y, s.z, camera, size.width, size.height, 400);

    // Aerial: a slow orbit around the whole campus; drag to turn, scroll to zoom.
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = damp(fog.near, inp.aerial ? inp.zoom + 120 : 90, 2, dt);
      fog.far = damp(fog.far, inp.aerial ? inp.zoom * 4 + 300 : 380, 2, dt);
    }
    if (inp.aerial) {
      const angle = inp.yaw + Math.sin(clock.elapsedTime * 0.05) * 0.5;
      const want = new THREE.Vector3(Math.sin(angle) * inp.zoom, 6 + inp.zoom * 0.62, -8 + Math.cos(angle) * inp.zoom);
      s.cam.lerp(want, 1 - Math.exp(-dt * 2.5));
      camera.position.copy(s.cam);
      camera.lookAt(0, 4, -8);
      if (dotRef.current) dotRef.current.setAttribute("transform", `translate(${s.x} ${s.z}) rotate(${(-s.facing * 180) / Math.PI + 180})`);
      return;
    }

    // Third-person camera behind and above, following the look direction. Indoors it pulls in
    // and stays inside the room, under the ceiling, instead of ending up in the brickwork.
    const room = interiorAt(s.x, s.z, s.y);
    const dist = room ? 4.6 : 7.5;
    const target = new THREE.Vector3(s.x, s.y + (room ? 1.45 : 1.6), s.z);
    const want = new THREE.Vector3(
      s.x - fx * dist * Math.cos(inp.pitch),
      target.y + dist * Math.sin(inp.pitch),
      s.z - fz * dist * Math.cos(inp.pitch),
    );
    if (room) {
      // Walk back from the head toward the wanted spot only as far as the room allows.
      let t = 1;
      const axes: ["x" | "y" | "z", number, number][] = [
        ["x", room.x0, room.x1],
        ["y", room.y0, room.y1],
        ["z", room.z0, room.z1],
      ];
      for (const [a, lo, hi] of axes) {
        const d = want[a] - target[a];
        if (d > 1e-6 && target[a] + d * t > hi) t = Math.max(0, (hi - target[a]) / d);
        if (d < -1e-6 && target[a] + d * t < lo) t = Math.max(0, (lo - target[a]) / d);
      }
      want.lerpVectors(target, want, Math.max(0.12, t));
    } else {
      // Keep the camera above whatever terrain it's over.
      want.y = Math.max(want.y, heightAt(want.x, want.z) + 0.8);
    }
    s.cam.lerp(want, 1 - Math.exp(-dt * (room ? 12 : 8)));
    camera.position.copy(s.cam);
    camera.lookAt(target);

    // HUD: place name and minimap dot.
    s.t += dt;
    if (s.t > 0.25) {
      s.t = 0;
      const place = indoorName(s.x, s.z, s.y) ?? placeName(s.x, s.z);
      if (place !== s.lastPlace) {
        s.lastPlace = place;
        onPlace(place);
      }
      const zone = zoneAt(s.x, s.y, s.z);
      if (zone?.id !== s.zone?.id) {
        s.zone = zone;
        onZone(zone);
      }
    }
    if (dotRef.current) dotRef.current.setAttribute("transform", `translate(${s.x} ${s.z}) rotate(${(-s.facing * 180) / Math.PI + 180})`);
  });

  return <Figure ref={rig} style={style} shadow={false} />;
}

function Minimap({ dotRef }: { dotRef: React.RefObject<SVGGElement | null> }) {
  return (
    <svg className="minimap" viewBox="-66 -100 132 195" aria-hidden="true">
      {plazas.map((p) => (
        <rect key={p.name} x={p.x0} y={p.z0} width={p.x1 - p.x0} height={p.z1 - p.z0} className="mm-plaza" />
      ))}
      {ramps.map((r) => (
        <rect key={r.name} x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} className="mm-ramp" />
      ))}
      {blocks.map((b) => (
        <rect key={b.name} x={b.x0} y={b.z0} width={b.x1 - b.x0} height={b.z1 - b.z0} rx={b.radius} className="mm-block" />
      ))}
      <MapDots />
      <g ref={dotRef}>
        <circle r="2.6" className="mm-dot" />
        <path d="M0 -6 L2.6 -1.5 L-2.6 -1.5 Z" className="mm-dot" />
      </g>
    </svg>
  );
}

function Joystick({ input }: { input: React.MutableRefObject<Input> }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (id.current !== e.pointerId || !base.current || !knob.current) return;
    const r = base.current.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    input.current.joy = { x, y };
    knob.current.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
  };
  const end = () => {
    id.current = null;
    input.current.joy = { x: 0, y: 0 };
    if (knob.current) knob.current.style.transform = "";
  };
  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        id.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} className="joystick-knob" />
    </div>
  );
}

export default function Campus() {
  const input = useRef<Input>({ keys: new Set(), joy: { x: 0, y: 0 }, yaw: Math.PI, pitch: 0.32, active: false, aerial: true, zoom: 125, typing: false });
  const [aerial, setAerial] = useState(true);
  const toggleAerial = (on?: boolean) => {
    const next = on ?? !input.current.aerial;
    input.current.aerial = next;
    input.current.yaw = next ? 0.75 : Math.PI;
    setAerial(next);
  };
  const dotRef = useRef<SVGGElement>(null);
  const [place, setPlace] = useState("Lower terrace");
  const [started, setStarted] = useState(false);
  const [touch, setTouch] = useState(false);
  const status = useNetStatus();
  const { account } = useAuth();
  const [students, setStudents] = useState(0);
  const roster = useRoster();
  // I appear once the server has me on campus, looking like the avatar on my account.
  const [me, setMe] = useState<{ id: string; style: FigureStyle; spawn: { x: number; z: number; facing: number }; welcome: string } | null>(null);
  useEffect(
    () =>
      net.onStatus(() => {
        const a = net.account;
        if (net.status === "online" && net.id && a?.avatar) {
          const s = startById(a.start ?? "");
          setMe((m) => {
            if (m && m.id === net.id) return m;
            // Look the way you arrive facing (unless you're in the aerial view).
            if (!input.current.aerial) input.current.yaw = s.facing;
            return { id: net.id, style: styleFor(a.avatar!), spawn: s, welcome: s.welcome };
          });
        }
      }),
    [],
  );
  // The game spot I'm standing in, and the game I've opened.
  const [zone, setZone] = useState<Zone | null>(null);
  const [playing, setPlaying] = useState<Zone | null>(null);
  const [rankings, setRankings] = useState(false);
  const zoneRef = useRef<Zone | null>(null);
  zoneRef.current = zone;
  const openGame = () => {
    if (!zoneRef.current) return;
    input.current.keys.clear();
    input.current.active = false;
    setPlaying(zoneRef.current);
  };
  const closeGame = () => {
    input.current.active = true;
    setPlaying(null);
  };
  const [welcome, setWelcome] = useState<string | null>(null);
  useEffect(() => {
    if (!me) return;
    setWelcome(me.welcome);
    const t = setTimeout(() => setWelcome(null), 9000);
    return () => clearTimeout(t);
  }, [me]);

  useEffect(() => {
    setTouch(window.matchMedia("(hover: none)").matches);
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "f" && input.current.active && zoneRef.current) {
        openGame();
        return;
      }
      if (k === "v" && input.current.active) {
        const next = !input.current.aerial;
        input.current.aerial = next;
        input.current.yaw = next ? 0.75 : Math.PI;
        setAerial(next);
        return;
      }
      if (["w", "a", "s", "d", "q", "e", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        input.current.keys.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => input.current.keys.delete(e.key.toLowerCase());
    const blur = () => input.current.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Drag anywhere on the world to look around.
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const handlers = useMemo(
    () => ({
      onPointerDown: (e: React.PointerEvent) => {
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      },
      onPointerMove: (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        input.current.yaw -= (e.clientX - d.x) * 0.006;
        input.current.pitch = Math.max(0.05, Math.min(1.1, input.current.pitch + (e.clientY - d.y) * 0.004));
        d.x = e.clientX;
        d.y = e.clientY;
      },
      onPointerUp: () => (drag.current = null),
      onPointerLeave: () => (drag.current = null),
      onWheel: (e: React.WheelEvent) => {
        if (input.current.aerial) input.current.zoom = Math.max(55, Math.min(260, input.current.zoom + e.deltaY * 0.12));
      },
    }),
    [],
  );

  const begin = (aerialView: boolean) => {
    net.join();
    input.current.active = true;
    toggleAerial(aerialView);
    setStarted(true);
  };


  return (
    <div className="campus">
      <div className="campus-canvas" {...handlers}>
        <Canvas
          shadows
          dpr={[1, 1.6]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          camera={{ fov: 55, near: 0.1, far: 1600, position: [0, 10, 50] }}
        >
          <Environment />
          <Architecture />
          {me && <Player key={me.id} input={input} onPlace={setPlace} onZone={setZone} dotRef={dotRef} style={me.style} spawn={me.spawn} />}
          <RemotePlayers />
          <Crowd onReady={setStudents} />
          <GameSpots />
          {started && <LegendsBoard />}
        </Canvas>
      </div>

      <header className="campus-hud">
        <p className="campus-kicker">Life at ALU</p>
        <p className="campus-place">{place}</p>
        {started && account && <Wallet />}
        {started && account && <LevelBadge
            onOpen={() => {
              input.current.keys.clear();
              input.current.active = false;
              setRankings(true);
            }}
          />}
        {started && (
          <p className={`campus-online${status === "online" ? "" : " off"}`}>
            <i />
            {status === "online"
              ? `${roster.length + 1} online${students ? ` · ${students.toLocaleString("en")} students on campus` : ""}`
              : status === "connecting"
                ? "Connecting…"
                : "Offline — is the server running?"}
          </p>
        )}
      </header>
      {started && <Labels selfId={me?.id ?? ""} />}
      {started && <XpToast />}
      {rankings && (
        <Rankings
          onClose={() => {
            input.current.active = true;
            setRankings(false);
          }}
        />
      )}
      {started && status === "online" && <Chat onTyping={(t) => (input.current.typing = t)} />}
      <Minimap dotRef={dotRef} />
      {started && !touch && (
        <p className="campus-keys">
          {aerial ? "Drag to turn · scroll to zoom · V to walk · Enter to chat" : "WASD to walk · Shift to run · drag to look · V aerial · Enter to chat"}
        </p>
      )}
      {started && touch && !aerial && <Joystick input={input} />}
      {started && (
        <button className="campus-view" onClick={() => toggleAerial()}>
          {aerial ? "Walk the campus" : "Aerial view"}
        </button>
      )}

      {started && welcome && !playing && <p className="campus-welcome">{welcome}</p>}
      {started && zone && !playing && !aerial && (
        <button className="campus-play" onClick={openGame}>
          <span>{zone.title}</span>
          <b>{touch ? "Tap to play" : "Press F to play"}</b>
        </button>
      )}
      {playing && <GameHost zone={playing} onClose={closeGame} />}

      {!started && <Onboarding onEnter={begin} />}
    </div>
  );
}
