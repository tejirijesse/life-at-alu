// Getting onto campus: sign up or log in with an ALU email and a code, make your avatar,
// choose where your story starts. Returning on the same device skips straight to "Welcome back".

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BLANK, BODIES, COLOURS, HAIR_COLOURS, HAIR_LABELS, HAIRS, OUTFIT_LABELS, OUTFITS, SKINS, type Avatar } from "../../shared/avatar";
import { COIN, STARTING_COINS, STARTS } from "../../shared/world";
import { Figure, poseFigure, type Rig } from "../three/Figure";
import { PRINTED } from "../three/outfits";
import { net } from "../net";
import { styleFor } from "./Live";

/** Re-renders when my sign-in or account changes. */
export function useAuth() {
  useSyncExternalStore(
    (cb) => net.onAuth(cb),
    () => net.authVersion,
  );
  return { auth: net.auth, account: net.account };
}

// ---------- Sign up / log in ----------

function SignIn() {
  const { auth } = useAuth();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [auth]);
  useEffect(() => net.connect(), []);

  if (auth.step === "code")
    return (
      <form
        className="ob-card"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          net.verify(code);
        }}
      >
        <p className="campus-kicker">Check your email</p>
        <h1>Enter your code</h1>
        <p className="campus-lede">
          We sent a 6-digit code to <b>{auth.email}</b>. It lasts 10 minutes.
        </p>
        {auth.demoCode && (
          <p className="ob-demo">
            <span>Demo mode: codes aren't emailed yet. Your code is</span>
            <b>{auth.demoCode}</b>
          </p>
        )}
        <input
          className="campus-name ob-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          aria-label="6-digit code"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        {auth.error && <p className="ob-error">{auth.error}</p>}
        <div className="campus-actions">
          <button type="submit" disabled={code.length !== 6 || busy}>
            {busy ? "Checking…" : "Continue →"}
          </button>
          <button type="button" className="ghost" onClick={() => net.backToEmail()}>
            Use a different email
          </button>
        </div>
      </form>
    );

  const valid = /^[^@\s]+@(alustudent|alueducation)\.com$/i.test(email.trim()) && (mode === "login" || name.trim().length > 0);
  return (
    <form
      className="ob-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        net.requestCode(email, mode === "signup" ? name : undefined);
      }}
    >
      <p className="campus-kicker">African Leadership University · Kigali · pilot</p>
      <h1>Life at ALU</h1>
      <p className="campus-lede">The ALU Kigali campus, shared. Make your avatar, meet your friends, play games on the terraces.</p>
      <div className="ob-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>
          Sign up
        </button>
        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
          Log in
        </button>
      </div>
      {mode === "signup" && (
        <input className="campus-name" value={name} maxLength={20} placeholder="Your first name" aria-label="Your first name" autoFocus onChange={(e) => setName(e.target.value)} />
      )}
      <input
        className="campus-name"
        type="email"
        value={email}
        maxLength={120}
        placeholder="you@alustudent.com"
        aria-label="Your ALU email"
        autoFocus={mode === "login"}
        onChange={(e) => setEmail(e.target.value)}
      />
      <p className="campus-help">Use your ALU email: @alustudent.com, or @alueducation.com for staff.</p>
      {auth.step === "signed-out" && auth.error && <p className="ob-error">{auth.error}</p>}
      <div className="campus-actions">
        <button type="submit" disabled={!valid || busy || net.status === "connecting"}>
          {net.status === "connecting" ? "Connecting…" : busy ? "Sending…" : "Send my code →"}
        </button>
      </div>
    </form>
  );
}

// ---------- Avatar creator ----------

function Spinner({ avatar }: { avatar: Avatar }) {
  const rig = useRef<Rig>(null);
  const style = useMemo(() => styleFor(avatar), [avatar]);
  useFrame(({ clock }) => {
    const r = rig.current;
    if (!r) return;
    r.root.rotation.y = Math.sin(clock.elapsedTime * 0.6) * 0.7;
    poseFigure(r, { phase: 0, amp: 0, jog: 0, sit: 0, headYaw: 0, headPitch: 0, time: clock.elapsedTime });
  });
  return <Figure key={JSON.stringify(avatar)} ref={rig} style={style} />;
}

function Preview({ avatar }: { avatar: Avatar }) {
  return (
    <div className="ob-preview">
      <Canvas dpr={[1, 2]} camera={{ fov: 28, position: [0, 1.15, 5.6] }} onCreated={({ camera }) => camera.lookAt(0, 1.0, 0)}>
        <color attach="background" args={["#efe9df"]} />
        <hemisphereLight args={["#ffffff", "#b8a58c", 1.6]} />
        <directionalLight position={[2, 4, 3]} intensity={2.2} />
        <Spinner avatar={avatar} />
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.8, 40]} />
          <meshStandardMaterial color="#dcd2c3" />
        </mesh>
      </Canvas>
    </div>
  );
}

const Swatches = ({ list, value, onPick, label }: { list: readonly string[]; value: string; onPick: (c: string) => void; label: string }) => (
  <div className="ob-swatches" role="radiogroup" aria-label={label}>
    {list.map((c) => (
      <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} className={value === c ? "on" : ""} style={{ background: c }} onClick={() => onPick(c)} />
    ))}
  </div>
);

const Chips = <T extends string>({ list, labels, value, onPick, label }: { list: readonly T[]; labels: Record<T, string>; value: T; onPick: (v: T) => void; label: string }) => (
  <div className="ob-chips" role="radiogroup" aria-label={label}>
    {list.map((v) => (
      <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onPick(v)}>
        {labels[v]}
      </button>
    ))}
  </div>
);

const TABS = ["Body", "Hair", "Outfit"] as const;

function Creator({ initial, onDone }: { initial: Avatar; onDone: (a: Avatar) => void }) {
  const [a, setA] = useState(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Body");
  const set = (p: Partial<Avatar>) => setA((v) => ({ ...v, ...p }));
  return (
    <div className="ob-creator">
      <Preview avatar={a} />
      <div className="ob-panel">
        <p className="campus-kicker">Make your avatar</p>
        <div className="ob-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        {tab === "Body" && (
          <>
            <h3>Body</h3>
            <Chips list={BODIES} labels={{ masc: "Masculine", fem: "Feminine" }} value={a.body} onPick={(body) => set({ body })} label="Body" />
            <h3>Skin tone</h3>
            <Swatches list={SKINS} value={a.skin} onPick={(skin) => set({ skin })} label="Skin tone" />
            <h3>Glasses</h3>
            <Chips list={["no", "yes"] as const} labels={{ no: "None", yes: "Glasses" }} value={a.glasses ? "yes" : "no"} onPick={(v) => set({ glasses: v === "yes" })} label="Glasses" />
          </>
        )}
        {tab === "Hair" && (
          <>
            <h3>Style</h3>
            <Chips list={HAIRS} labels={HAIR_LABELS} value={a.hair} onPick={(hair) => set({ hair })} label="Hair style" />
            <h3>{a.hair === "headwrap" ? "Hair (under the wrap)" : "Colour"}</h3>
            <Swatches list={HAIR_COLOURS} value={a.hairColour} onPick={(hairColour) => set({ hairColour })} label="Hair colour" />
            {a.hair === "headwrap" && <p className="campus-help">The wrap uses your outfit colours: change them under Outfit.</p>}
          </>
        )}
        {tab === "Outfit" && (
          <>
            <h3>Outfit</h3>
            <Chips list={OUTFITS} labels={OUTFIT_LABELS} value={a.outfit} onPick={(outfit) => set({ outfit })} label="Outfit" />
            <h3>{PRINTED.has(a.outfit) ? "Fabric colour" : "Main colour"}</h3>
            <Swatches list={COLOURS} value={a.colour} onPick={(colour) => set({ colour })} label="Main colour" />
            <h3>{PRINTED.has(a.outfit) ? "Print colour" : a.outfit === "umushanana" ? "Sash colour" : "Accent colour"}</h3>
            <Swatches list={COLOURS} value={a.accent} onPick={(accent) => set({ accent })} label="Accent colour" />
          </>
        )}
        <div className="campus-actions">
          <button type="button" onClick={() => onDone(a)}>
            Looks good →
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Starting point ----------

function StartPicker({ initial, onBack, onDone }: { initial: string; onBack: () => void; onDone: (start: string) => void }) {
  const [pick, setPick] = useState(initial);
  return (
    <div className="ob-card ob-wide">
      <p className="campus-kicker">Where does your story start?</p>
      <h1>Choose your start</h1>
      <p className="campus-lede">
        This changes where you arrive and how you're welcomed. Everyone gets the same {STARTING_COINS.toLocaleString("en")} {COIN}.
      </p>
      <div className="ob-starts" role="radiogroup" aria-label="Starting point">
        {STARTS.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} className={pick === s.id ? "on" : ""} onClick={() => setPick(s.id)}>
            <b>{s.title}</b>
            <span>{s.blurb}</span>
          </button>
        ))}
      </div>
      <div className="campus-actions">
        <button type="button" onClick={() => onDone(pick)}>
          Start my day →
        </button>
        <button type="button" className="ghost" onClick={onBack}>
          Back to my avatar
        </button>
      </div>
    </div>
  );
}

// ---------- The whole flow ----------

/** Shown until the person is on campus. onEnter(aerial) is called when they walk in. */
export default function Onboarding({ onEnter }: { onEnter: (aerial: boolean) => void }) {
  const { auth, account } = useAuth();
  const [stage, setStage] = useState<"auto" | "avatar" | "start">("auto");
  const [draft, setDraft] = useState<Avatar>(account?.avatar ?? BLANK);
  const saving = useRef(false);

  // Once the save comes back, walk in.
  useEffect(() => {
    if (saving.current && account?.avatar && account.start) {
      saving.current = false;
      onEnter(false);
    }
  }, [account, onEnter]);

  useEffect(() => net.connect(), []);

  let body: React.ReactNode;
  if (auth.step === "checking")
    body = (
      <div className="ob-card">
        <p className="campus-kicker">Life at ALU</p>
        <h1>Signing you back in…</h1>
        <p className="campus-lede">{net.status === "connecting" ? "Waking up the campus server. This can take up to a minute." : "One moment."}</p>
      </div>
    );
  else if (auth.step !== "signed-in" || !account) body = <SignIn />;
  else if (stage === "avatar" || (stage === "auto" && !account.avatar))
    body = (
      <Creator
        initial={draft}
        onDone={(a) => {
          setDraft(a);
          setStage("start");
        }}
      />
    );
  else if (stage === "start")
    body = (
      <StartPicker
        initial={account.start ?? STARTS[1].id}
        onBack={() => setStage("avatar")}
        onDone={(start) => {
          saving.current = true;
          net.saveProfile(draft, start);
        }}
      />
    );
  else
    body = (
      <div className="ob-card ob-back">
        <Preview avatar={account.avatar!} />
        <div>
          <p className="campus-kicker">Welcome back</p>
          <h1>Hi, {account.name}</h1>
          <p className="campus-lede">
            {account.coins.toLocaleString("en")} {COIN} in your wallet.
          </p>
          <div className="campus-actions">
            <button type="button" onClick={() => onEnter(false)}>
              Walk the campus →
            </button>
            <button type="button" className="ghost" onClick={() => onEnter(true)}>
              See the whole campus
            </button>
          </div>
          <div className="campus-actions ob-small">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setDraft(account.avatar!);
                setStage("avatar");
              }}
            >
              Edit my avatar
            </button>
            <button type="button" className="ghost" onClick={() => net.logout()}>
              Log out
            </button>
          </div>
        </div>
      </div>
    );

  return <div className="campus-start">{body}</div>;
}

