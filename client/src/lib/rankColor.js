// Leaderboard rank → colour: blue (1st) through purple to coral (last).
// Piecewise so neither half of the blend crosses near-opposite hues (which
// would wash out to grey) — see PROJECT_STATUS/design notes for why blue→
// orange was rejected in favour of this route.
const RANK_GRADIENT = ["#9bcef3", "#aa9bf3", "#ff82a6"];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function lerpColor(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

/** index is 0-based rank (0 = 1st place), total is the full player count. */
export function rankColor(index, total) {
  if (total <= 1) return RANK_GRADIENT[0];
  const t = index / (total - 1);
  return t <= 0.5
    ? lerpColor(RANK_GRADIENT[0], RANK_GRADIENT[1], t / 0.5)
    : lerpColor(RANK_GRADIENT[1], RANK_GRADIENT[2], (t - 0.5) / 0.5);
}
