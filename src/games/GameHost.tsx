// The frame every game opens in, over the campus: title, close button (or Esc), and the game.
// Also the wallet badge in the HUD.
//
// To add a game: write a component taking GameProps (see Basketball.tsx) and list it in GAMES.
// Talk to the server with net.game(id, data) and listen with net.onGame(id, …); the server side
// lives in server/games.

import { useEffect, useState, useSyncExternalStore } from "react";
import { COIN, type GameId, type Zone } from "../../shared/world";
import { net } from "../net";
import Basketball from "./Basketball";
import Chess from "./Chess";
import Pool from "./Pool";

export type GameProps = { zone: Zone; onClose: () => void };

const GAMES: Partial<Record<GameId, (p: GameProps) => React.ReactNode>> = {
  basketball: Basketball,
  chess: Chess,
  pool: Pool,
};

/** What each game will be, for the ones still being built. */
const COMING: Record<GameId, string> = {
  basketball: "",
  football: "Penalty shootout on the lawn: pick your corner, beat the keeper. Solo, or against a friend in goal.",
  archery: "Draw, aim against the wind, release. Five arrows, best total wins coins.",
  pool: "8-ball for two at the Commons table. Pay the entry, winner takes the pot.",
  chess: "Challenge whoever is at the pod. Full rules, with a clock.",
  quiz: "Kahoot-style: a host starts a quiz and everyone in the library answers against the clock.",
  poll: "Ask the campus a question; everyone votes and sees the results live.",
  startup: "Pitch your startup in a few lines; the campus votes, and the winner gets a coin prize.",
};

function useWallet() {
  useSyncExternalStore(
    (cb) => net.onAuth(cb),
    () => net.authVersion,
  );
  return { coins: net.account?.coins ?? 0, last: net.lastWallet };
}

/** Coins in the HUD, with a little "+36" when they change. */
export function Wallet() {
  const { coins, last } = useWallet();
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!last || Date.now() - last.at > 2000) return;
    setFlash(`${last.delta > 0 ? "+" : ""}${last.delta}`);
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [last]);
  return (
    <p className="campus-wallet" title={`${coins} ${COIN}`}>
      <i aria-hidden="true">₳</i>
      {coins.toLocaleString("en")} <span>{COIN}</span>
      {flash && <b className={flash.startsWith("-") ? "down" : "up"}>{flash}</b>}
    </p>
  );
}

export default function GameHost({ zone, onClose }: GameProps) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const Game = GAMES[zone.game];
  return (
    <div className="game" role="dialog" aria-label={zone.title}>
      <div className="game-frame">
        <header>
          <h2>{zone.title}</h2>
          <button className="game-close" onClick={onClose} aria-label="Close game">
            ✕
          </button>
        </header>
        {Game ? (
          <Game zone={zone} onClose={onClose} />
        ) : (
          <div className="game-soon">
            <p>{COMING[zone.game]}</p>
            <p className="campus-help">Coming soon in the demo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
