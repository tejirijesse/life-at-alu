// Cleaning what people type into games (poll questions, pitches, quiz questions): the same
// rule as chat, with no control characters or angle brackets, trimmed and capped.

export const cleanText = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

let counter = 0;
/** Short ids for polls and pitches. */
export const shortId = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;
