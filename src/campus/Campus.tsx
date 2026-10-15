
// ALU Campus Live — the walkable campus, shared.
// Everyone who opens the link walks the same terraces; names over heads, campus-wide chat.
// Desktop: WASD / arrows to walk, Shift to run, drag (or Q / E) to look around.
// Phones: left thumb on the joystick, drag anywhere else to look.

import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import Architecture from "./Architecture";
import Environment from "./Environment";
import { blocked, blocks, heightAt, placeName, plazas, ramps, spawn } from "./layout";
import { Figure, poseFigure, setOutfit, type FigureStyle, type Rig } from "../three/Figure";
import { net } from "../net";
import { Chat, Labels, MapDots, placeLabel, RemotePlayers, useNetStatus, useRoster, visitor } from "./Live";

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

const start = { x: spawn.x + (Math.random() - 0.5) * 8, z: spawn.z + (Math.random() - 0.5) * 3 };

function Player({
  input,
  onPlace,
  dotRef,
  style,
}: {
  input: React.MutableRefObject<Input>;
  onPlace: (p: string) => void;
  dotRef: React.RefObject<SVGGElement | null>;
  style: FigureStyle;
}) {
  const rig = useRef<Rig>(null);
  const { camera, scene, size } = useThree();
  const st = useRef({
    x: start.x,
    z: start.z,
    y: heightAt(start.x, start.z),
    facing: Math.PI,
    phase: 0,
    amp: 0,
    run: 0,
    lastPlace: "",
    t: 0,
    cam: new THREE.Vector3(start.x, heightAt(start.x, start.z) + 5, start.z + 9),
  });

  useEffect(() => {
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

    // Move axis by axis so walls slide; refuse steps taller than a stair.
    const here = heightAt(s.x, s.z);
    const ok = (x: number, z: number) => !blocked(x, z) && Math.abs(heightAt(x, z) - here) < 0.75 && Math.abs(x) < 300 && Math.abs(z) < 300;
    const ox = s.x;
    const oz = s.z;
    if (dx && ok(s.x + dx, s.z)) s.x += dx;
    if (dz && ok(s.x, s.z + dz)) s.z += dz;
    const moved = Math.hypot(s.x - ox, s.z - oz);

    s.y = damp(s.y, heightAt(s.x, s.z), 14, dt);
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

    // Third-person camera behind and above, following the look direction.
    const dist = 7.5;
    const target = new THREE.Vector3(s.x, s.y + 1.6, s.z);
    const want = new THREE.Vector3(
      s.x - fx * dist * Math.cos(inp.pitch),
      s.y + 1.6 + dist * Math.sin(inp.pitch),
      s.z - fz * dist * Math.cos(inp.pitch),
    );
    // Keep the camera above whatever terrain it's over.
    want.y = Math.max(want.y, heightAt(want.x, want.z) + 0.8);
    s.cam.lerp(want, 1 - Math.exp(-dt * 8));
    camera.position.copy(s.cam);
    camera.lookAt(target);

    // HUD: place name and minimap dot.
    s.t += dt;
    if (s.t > 0.25) {
      s.t = 0;
      const place = placeName(s.x, s.z);
      if (place !== s.lastPlace) {
        s.lastPlace = place;
        onPlace(place);
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
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("alu-live-name") ?? "";
    } catch {
      return "";
    }
  });
  const status = useNetStatus();
  const roster = useRoster();
  // My look depends on the colour the server hands me, so it's settled once I'm in.
  const [me, setMe] = useState<{ id: string; style: FigureStyle } | null>(null);
  useEffect(
    () =>
      net.onStatus(() => {
        if (net.status === "online" && net.id) setMe({ id: net.id, style: visitor(net.color, net.id) });
      }),
    [],
  );

  useEffect(() => {
    setTouch(window.matchMedia("(hover: none)").matches);
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
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

  const begin = (view: "walk" | "aerial") => {
    const n = name.trim().slice(0, 20);
    if (!n) return;
    try {
      localStorage.setItem("alu-live-name", n);
    } catch {}
    if (net.status === "idle") net.connect(n);
    input.current.active = true;
    toggleAerial(view === "aerial");
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
          {me && <Player input={input} onPlace={setPlace} dotRef={dotRef} style={me.style} />}
          <RemotePlayers />
        </Canvas>
      </div>

      <header className="campus-hud">
        <p className="campus-kicker">ALU Campus Live</p>
        <p className="campus-place">{place}</p>
        {started && (
          <p className={`campus-online${status === "online" ? "" : " off"}`}>
            <i />
            {status === "online"
              ? `${roster.length + 1} on campus`
              : status === "connecting"
                ? "Connecting…"
                : "Offline — is the server running?"}
          </p>
        )}
      </header>
      {started && <Labels selfId={me?.id ?? ""} />}
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

      {!started && (
        <div className="campus-start">
          <div>
            <p className="campus-kicker">African Leadership University · Kigali · pilot</p>
            <h1>Meet on campus.</h1>
            <p className="campus-lede">
              The ALU Kigali campus, shared. Everyone with the link walks the same terraces: see who’s around, say hello,
              find your friends by the grand stairs.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                begin("walk");
              }}
            >
              <input
                className="campus-name"
                value={name}
                maxLength={20}
                placeholder="Your first name"
                aria-label="Your first name"
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <div className="campus-actions">
                <button type="submit" disabled={!name.trim()}>
                  Walk the campus →
                </button>
                <button type="button" className="ghost" disabled={!name.trim()} onClick={() => begin("aerial")}>
                  See the whole campus
                </button>
              </div>
            </form>
            <p className="campus-help">
              {touch ? "Left thumb to walk · drag anywhere to look" : "WASD or arrows to walk · Shift to run · drag or Q / E to look"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
