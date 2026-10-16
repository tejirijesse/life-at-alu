// What a person looks like. Chosen in the avatar creator, saved on the account, sent to
// everyone else on campus. Every field is a pick from a fixed list, so the server can check it.

export const BODIES = ["masc", "fem"] as const;
export const SKINS = ["#f1c9a5", "#d9a37a", "#b97a52", "#8d5537", "#6e4130", "#57321f", "#3d2219", "#2b1710"] as const;
export const HAIRS = ["afro", "short", "locs", "braids", "bun", "headwrap", "bald"] as const;
export const HAIR_COLOURS = ["#141010", "#3a2416", "#6b4226", "#a8743d", "#c9c2b6", "#7a2d2d"] as const;
export const OUTFITS = ["tee", "hoodie", "smart", "sport", "kitenge", "umushanana", "agbada", "iro"] as const;
/** Main clothing colours; patterned outfits use a second colour from the same list. */
export const COLOURS = ["#1a1a1b", "#f2f0ea", "#c0392b", "#1d3f8a", "#e1b44c", "#2f7d4f", "#7b5ea7", "#d4691f", "#0f7c7c", "#c2185b", "#8a5a3c", "#5dade2"] as const;

export type Avatar = {
  body: (typeof BODIES)[number];
  skin: string;
  hair: (typeof HAIRS)[number];
  hairColour: string;
  outfit: (typeof OUTFITS)[number];
  colour: string;
  /** Second colour, for prints (kitenge, umushanana, iro & buba) and trims. */
  accent: string;
  glasses: boolean;
};

export const OUTFIT_LABELS: Record<Avatar["outfit"], string> = {
  tee: "Casual tee",
  hoodie: "ALU hoodie",
  smart: "Smart blazer",
  sport: "Sportswear",
  kitenge: "Kitenge shirt",
  umushanana: "Umushanana",
  agbada: "Agbada",
  iro: "Iro & buba",
};

export const HAIR_LABELS: Record<Avatar["hair"], string> = {
  afro: "Afro",
  short: "Short",
  locs: "Locs",
  braids: "Braids",
  bun: "Bun",
  headwrap: "Headwrap",
  bald: "Bald",
};

/** A blank starting point: the avatar creator opens on this. */
export const BLANK: Avatar = {
  body: "masc",
  skin: SKINS[4],
  hair: "short",
  hairColour: HAIR_COLOURS[0],
  outfit: "tee",
  colour: COLOURS[1],
  accent: COLOURS[4],
  glasses: false,
};

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** Anything from the network, coerced into a valid avatar. */
export function cleanAvatar(a: unknown): Avatar {
  const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  return {
    body: pick(BODIES, o.body, BLANK.body),
    skin: pick(SKINS, o.skin, BLANK.skin),
    hair: pick(HAIRS, o.hair, BLANK.hair),
    hairColour: pick(HAIR_COLOURS, o.hairColour, BLANK.hairColour),
    outfit: pick(OUTFITS, o.outfit, BLANK.outfit),
    colour: pick(COLOURS, o.colour, BLANK.colour),
    accent: pick(COLOURS, o.accent, BLANK.accent),
    glasses: o.glasses === true,
  };
}
