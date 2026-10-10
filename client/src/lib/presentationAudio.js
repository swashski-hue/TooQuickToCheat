// Presentation-screen-only sound effects: a question-timer tick and a sting
// for the fastest-answerer reveal. Browsers block audio until a user
// gesture resumes the AudioContext, so unlockAudio() must run inside a real
// click handler before any play* call below will actually make sound.
//
// The fastest-answerer sting is still a placeholder synthesized tone (first
// pass is just the trigger wiring) — swap the body of playFastestSting for
// real sample playback later without touching its call site in
// PresentationScreen.jsx.
let ctx = null;
let tickBufferPromise = null;

function getContext() {
  if (!ctx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioContextClass();
  }
  return ctx;
}

// Kicked off as soon as sound is unlocked so the first tick isn't delayed by
// the fetch + decode round-trip.
function loadTickBuffer() {
  if (!tickBufferPromise) {
    tickBufferPromise = fetch("/sounds/tick.ogg")
      .then((res) => res.arrayBuffer())
      .then((data) => getContext().decodeAudioData(data));
  }
  return tickBufferPromise;
}

export function unlockAudio() {
  const c = getContext();
  if (c.state === "suspended") c.resume();
  loadTickBuffer();
}

function tone(freq, { startTime = 0, duration = 0.12, type = "sine", peakGain = 0.25 } = {}) {
  if (!ctx || ctx.state !== "running") return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startTime;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.01);
  gain.gain.linearRampToValueAtTime(0, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playTick() {
  if (!ctx || ctx.state !== "running") return;
  loadTickBuffer().then((buffer) => {
    if (ctx.state !== "running") return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  });
}

// Mirrors server/gameManager.js's PLAYER_EMOJIS order (also duplicated in
// PlayerJoin.jsx) so each emoji maps to a fixed, distinct note — not fetched,
// so sound can't depend on a network round-trip.
const EMOJI_ORDER = [
  "🦄", "🐸", "🐵", "🦊",
  "🐼", "🐨", "🦁", "🐯",
  "🐶", "🐱", "🐹", "🐰",
  "🦉", "🐙", "🦀", "🤖",
];

// One note per emoji from a pentatonic scale spanning ~3 octaves, so all 16
// stings are quick and distinguishable from each other but still sound like
// they belong to the same family of sound.
const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const BASE_FREQ = 330;

function emojiBaseFreq(emoji) {
  const idx = EMOJI_ORDER.indexOf(emoji);
  const semitone = PENTATONIC_SEMITONES[idx] ?? PENTATONIC_SEMITONES[0];
  return BASE_FREQ * Math.pow(2, semitone / 12);
}

export function playFastestSting(emoji) {
  const base = emojiBaseFreq(emoji);
  tone(base, { startTime: 0, duration: 0.1, type: "triangle", peakGain: 0.2 });
  tone(base * 1.5, { startTime: 0.1, duration: 0.18, type: "triangle", peakGain: 0.25 });
}
