// The game's rules of the world, shared by browser and server: where your story starts,
// where the games are, and what the wallet does.

export const ALLOWED_EMAIL_DOMAINS = ["alustudent.com", "alueducation.com"];
export const STARTING_COINS = 1000;
export const COIN = "ALU Coins";

export function emailAllowed(email: string) {
  const at = email.lastIndexOf("@");
  return at > 0 && ALLOWED_EMAIL_DOMAINS.includes(email.slice(at + 1).toLowerCase());
}

/**
 * Where your story begins. It changes where you appear and your welcome, never your money.
 * facing: 0 looks down the hill (+z, toward the lawn), Math.PI looks up it.
 */
export type Start = { id: string; title: string; blurb: string; welcome: string; x: number; z: number; facing: number };

export const STARTS: Start[] = [
  {
    id: "lagos",
    title: "Arriving from Lagos",
    blurb: "Fresh off the flight for Ikaze. Suitcase, big plans, no idea where the library is.",
    welcome: "Ikaze! Welcome to Kigali. Your ride dropped you in the car park: head down the access road to campus.",
    x: 38,
    z: -72,
    facing: 0,
  },
  {
    id: "kigali",
    title: "Kigali local",
    blurb: "Came up on a moto from Kimironko. You know the city; now meet the campus.",
    welcome: "Murakaza neza! The front plaza is right ahead.",
    x: -14,
    z: 40,
    facing: Math.PI,
  },
  {
    id: "campus",
    title: "Living on campus",
    blurb: "You've been here a while. Your friends are on the upper terrace by the library.",
    welcome: "Morning! Class is up the stairs. Coffee first?",
    x: -10,
    z: -40,
    facing: 0,
  },
  {
    id: "international",
    title: "International student",
    blurb: "From Kenya, Ghana, Zambia, Egypt, Morocco… one of 40+ countries on campus.",
    welcome: "Welcome to ALU! Say hi to someone by the grand stairs.",
    // At the foot of the grand stairs, clear of the courtyard tables (Environment.tsx).
    x: 0,
    z: 23,
    facing: Math.PI,
  },
  {
    id: "staff",
    title: "Staff & faculty",
    blurb: "Teaching, mentoring, running the place. Ready for staff vs students on One ALU day.",
    welcome: "Good to see you. The Enterprise wing is to your right.",
    x: 20,
    z: 24,
    facing: Math.PI,
  },
];

export const startById = (id: string) => STARTS.find((s) => s.id === id) ?? STARTS[1];

/** Places on campus where a game can be started. y is the floor level the spot is on. */
export type GameId = "basketball" | "football" | "archery" | "pool" | "chess" | "quiz" | "poll" | "startup";
export type Zone = { id: string; game: GameId; title: string; x: number; y: number; z: number; radius: number };

export const ZONES: Zone[] = [
  { id: "court", game: "basketball", title: "Basketball shootout", x: 34, y: 0, z: 42, radius: 6 },
  { id: "pitch", game: "football", title: "Football penalties", x: -8, y: 0, z: 46, radius: 7 },
  { id: "range", game: "archery", title: "Archery", x: -58, y: 0, z: 40, radius: 5 },
  { id: "commons-pool", game: "pool", title: "8-ball pool", x: -18, y: 4, z: -4.4, radius: 3 },
  { id: "pod-chess-1", game: "chess", title: "Chess", x: -18, y: 0, z: 14, radius: 3 },
  { id: "pod-chess-2", game: "chess", title: "Chess", x: -10, y: 0, z: 20, radius: 3 },
  { id: "library-quiz", game: "quiz", title: "ALU Quiz Night", x: -15, y: 12, z: -30.8, radius: 4.5 },
  { id: "notice-board", game: "poll", title: "Poll voting", x: -4, y: 0, z: 23, radius: 3 },
  { id: "enterprise-pitch", game: "startup", title: "Startup competition", x: 20, y: 0, z: 13, radius: 4.5 },
];

/** Solo-game payouts are capped so they can't be farmed: per game, and per hour across games. */
export const MAX_SOLO_PAYOUT = 60;
export const MAX_SOLO_PAYOUTS_PER_HOUR = 8;
