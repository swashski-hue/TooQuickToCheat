/** Mirrors server/gameManager.js computeAnswerLetter — used client-side only for editor preview. */
export function computeAnswerLetter(answerText) {
  if (!answerText) return null;
  let text = answerText.trim();
  const leadingThe = /^the\s+/i.exec(text);
  if (leadingThe) text = text.slice(leadingThe[0].length);
  const letterMatch = /[A-Za-z]/.exec(text);
  return letterMatch ? letterMatch[0].toUpperCase() : null;
}

/** 4x6 letter board: U/V and Y/Z share a tile so 26 letters fit 24 cells. */
export const LETTER_TILES = [
  "A", "B", "C", "D",
  "E", "F", "G", "H",
  "I", "J", "K", "L",
  "M", "N", "O", "P",
  "Q", "R", "S", "T",
  "UV", "W", "X", "YZ",
];

export function tileLetters(tile) {
  return tile.split("");
}
