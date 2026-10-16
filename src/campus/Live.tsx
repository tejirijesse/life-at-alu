// The live layer: other people on campus, their names and chat bubbles, and the chat panel.

import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Figure, poseFigure, setOutfit, type FigureStyle, type Rig } from "../three/Figure";
import { net } from "../net";
import type { ChatLine } from "../../shared/protocol";
import type { Avatar } from "../../shared/avatar";

const SKIN = ["#6e4130", "#5a3324", "#8a5a3c", "#4a2a1e", "#a0704f", "#7a4a33"];
const TROUSERS = ["#1f1f21", "#2b3440", "#3a3a39", "#4a4038"];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Everyone wears their own colour; the rest is varied from their id so a crowd isn't clones. */
export function visitor(color: string, id: string): FigureStyle {
  const h = hash(id);
  return {
    skin: SKIN[h % SKIN.length],
    hair: "#141010",
    top: color,
    jacket: color,
    trousers: TROUSERS[(h >> 3) % TROUSERS.length],
    shoes: "#f7f7f5",
    stripes: "#141414",
    sole: "#a8774f",
    glasses: (h >> 5) % 3 === 0,
    hairStyle: (h >> 7) % 2 ? "afro" : "short",
  };
}

/** The figure for an avatar made in the creator. */
export function styleFor(a: Avatar): FigureStyle {
  const darkBottoms = a.colour === "#1a1a1b" ? "#2b3440" : "#1f1f21";
  return {
    skin: a.skin,
    hair: a.hairColour,
    top: a.colour,
    jacket: a.colour,
    trousers: a.outfit === "sport" ? a.accent : darkBottoms,
    shoes: a.outfit === "smart" || a.outfit === "agbada" ? "#2a1d15" : "#f7f7f5",
    sole: a.outfit === "smart" || a.outfit === "agbada" ? "#1b1410" : "#a8774f",
    glasses: a.glasses,
    hairStyle: a.hair,
    body: a.body,
    outfit: a.outfit,
    accent: a.accent,
  };
}

/** DOM elements for name labels, keyed by player id; avatars move them every frame. */
export const labelEls = new Map<string, HTMLDivElement>();
/** Minimap markers for other players. */
export const mapDots = new Map<string, SVGCircleElement>();

const v = new THREE.Vector3();
export function placeLabel(id: string, x: number, y: number, z: number, camera: THREE.Camera, w: number, h: number, maxDist = 70) {
  const el = labelEls.get(id);
  if (!el) return;
  v.set(x, y + 2.15, z);
  const dist = v.distanceTo(camera.position);
  v.project(camera);
  if (v.z > 1 || dist > maxDist) {
    el.style.opacity = "0";
    return;
  }
  el.style.opacity = String(Math.min(1, (maxDist - dist) / 15));
  el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
}

export type Roster = { id: string; name: string; color: string; look?: Avatar }[];

function rosterSnapshot(): Roster {
  return [...net.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, look: p.look }));
}

/** Re-renders when people join or leave (not on every movement tick). */
export function useRoster() {
  const cache = useRef<{ key: string; list: Roster }>({ key: "", list: [] });
  return useSyncExternalStore(
    (cb) => net.onRoster(cb),
    () => {
      const list = rosterSnapshot();
      const key = list.map((p) => p.id + p.name).join("|");
      if (key !== cache.current.key) cache.current = { key, list };
      return cache.current.list;
    },
  );
}

export function useNetStatus() {
  return useSyncExternalStore(
    (cb) => net.onStatus(cb),
    () => net.status,
  );
}

function RemoteAvatar({ id, color, look }: { id: string; color: string; look?: Avatar }) {
  const rig = useRef<Rig>(null);
  const style = useMemo(() => (look ? styleFor(look) : visitor(color, id)), [color, id, look]);
  const { camera, size } = useThree();
  const st = useRef<{ x: number; y: number; z: number; f: number; phase: number; amp: number; run: number } | null>(null);

  useEffect(() => {
    if (!rig.current) return;
    setOutfit(rig.current, "tee");
    rig.current.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }, []);

  useFrame(({ clock }, delta) => {
    const p = net.players.get(id);
    const r = rig.current;
    if (!p || !r) return;
    const dt = Math.min(delta, 0.05);
    if (!st.current) st.current = { x: p.x, y: p.y, z: p.z, f: p.f, phase: 0, amp: 0, run: 0 };
    const s = st.current;

    // Ease toward the last reported position (updates arrive ~12×/s).
    const k = 1 - Math.exp(-dt * 10);
    const ox = s.x;
    const oz = s.z;
    if (Math.hypot(p.x - s.x, p.z - s.z) > 12) {
      s.x = p.x;
      s.z = p.z;
      s.y = p.y;
    } else {
      s.x += (p.x - s.x) * k;
      s.z += (p.z - s.z) * k;
      s.y += (p.y - s.y) * k;
    }
    s.f += Math.atan2(Math.sin(p.f - s.f), Math.cos(p.f - s.f)) * k;
    s.amp += (p.m - s.amp) * k;
    s.run += (p.r - s.run) * k;
    s.phase += Math.hypot(s.x - ox, s.z - oz) * ((Math.PI * 2) / (1.35 + s.run * 0.7));

    r.root.position.set(s.x, s.y, s.z);
    r.root.rotation.y = s.f;
    poseFigure(r, { phase: s.phase, amp: s.amp, jog: s.run, sit: 0, headYaw: 0, headPitch: 0, time: clock.elapsedTime + hash(id) });

    placeLabel(id, s.x, s.y, s.z, camera, size.width, size.height);
    mapDots.get(id)?.setAttribute("transform", `translate(${s.x} ${s.z})`);
  });

  return <Figure ref={rig} style={style} shadow={false} />;
}

export function RemotePlayers() {
  const roster = useRoster();
  return (
    <>
      {roster.map((p) => (
        <RemoteAvatar key={p.id + (p.look ? JSON.stringify(p.look) : "")} id={p.id} color={p.color} look={p.look} />
      ))}
    </>
  );
}

function useChat() {
  return useSyncExternalStore(
    (cb) => net.onChat(cb),
    () => net.chat,
  );
}

/** Name tags over everyone else, and a speech bubble over whoever spoke in the last few seconds. */
export function Labels({ selfId }: { selfId: string }) {
  const roster = useRoster();
  const chat = useChat();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const bubbles = new Map<string, ChatLine>();
  for (const line of chat) if (now - line.ts < 7000) bubbles.set(line.id, line);

  const people = selfId ? [...roster, { id: selfId, name: "", color: net.color }] : roster;
  return (
    <div className="labels" aria-hidden="true">
      {people.map((p) => {
        const said = bubbles.get(p.id);
        return (
          <div
            key={p.id}
            className="label"
            style={{ opacity: 0, background: p.name ? undefined : "transparent", padding: p.name ? undefined : 0 }}
            ref={(el) => {
              if (el) labelEls.set(p.id, el);
              else labelEls.delete(p.id);
            }}
          >
            {said && <span className="bubble">{said.text}</span>}
            {p.name && (
              <>
                <b style={{ background: p.color }} />
                {p.name}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MapDots() {
  const roster = useRoster();
  return (
    <>
      {roster.map((p) => (
        <circle
          key={p.id}
          r="2.2"
          fill={p.color}
          stroke="#fff"
          strokeWidth="0.8"
          ref={(el) => {
            if (el) mapDots.set(p.id, el);
            else mapDots.delete(p.id);
          }}
        />
      ))}
    </>
  );
}

/** Campus-wide chat. Enter or T to start typing; Esc to go back to walking. */
export function Chat({ onTyping }: { onTyping: (typing: boolean) => void }) {
  const chat = useChat();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.activeElement === input.current) return;
      if (e.key === "Enter" || e.key === "t" || e.key === "T") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <div className="chat">
      <ul className="chat-lines" ref={list}>
        {chat.slice(-12).map((l) => (
          <li key={l.ts + l.id}>
            <strong style={{ color: l.color }}>{l.name}</strong>
            {l.text}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) net.say(text.trim());
          setText("");
          input.current?.blur();
        }}
      >
        <input
          ref={input}
          value={text}
          maxLength={200}
          placeholder="Press Enter to chat"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => onTyping(true)}
          onBlur={() => onTyping(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") input.current?.blur();
          }}
        />
      </form>
    </div>
  );
}
