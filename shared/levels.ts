// Levels and status titles, shared by the server (which awards them) and the HUD (which shows
// progress to the next level). XP needed rises gently: level 2 at 60 XP, 10 at about 2,000,
// 50 at about 30,000, 100 at about 94,000.

export const MAX_LEVEL = 100;

/** Total XP needed to reach a level. */
export const xpForLevel = (level: number) => (level <= 1 ? 0 : Math.round(60 * Math.pow(level - 1, 1.6)));

export function levelFor(xp: number) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Campus status by level. */
export function titleFor(level: number) {
  if (level >= 100) return "ALU Legend";
  if (level >= 76) return "Campus Icon";
  if (level >= 51) return "Elite Student";
  if (level >= 31) return "Campus Influencer";
  if (level >= 16) return "Rising Star";
  if (level >= 6) return "Campus Explorer";
  return "New Arrival";
}

/** How far through the current level, 0..1, for the XP bar. */
export function levelProgress(xp: number) {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return 1;
  const a = xpForLevel(level);
  const b = xpForLevel(level + 1);
  return (xp - a) / (b - a);
}
