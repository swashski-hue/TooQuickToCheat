// Host-screen sound effects: a question-timer tick and a sting for the
// fastest-answerer reveal. Lives on the host screen (not the Presentation
// Screen) because that's the window actually in focus on the host's
// machine — audio from a backgrounded/projected tab is unreliable in some
// browsers. Browsers block audio until a user gesture resumes the
// AudioContext, so unlockAudio() must run inside a real click handler
// before any play* call below will actually make sound.
let ctx = null;
const bufferCache = new Map();

function getContext() {
  if (!ctx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioContextClass();
  }
  return ctx;
}

// Kicked off as soon as sound is unlocked so playback isn't delayed by the
// fetch + decode round-trip the first time each sound is needed.
function loadBuffer(url) {
  if (!bufferCache.has(url)) {
    bufferCache.set(
      url,
      fetch(url)
        .then((res) => res.arrayBuffer())
        .then((data) => getContext().decodeAudioData(data))
    );
  }
  return bufferCache.get(url);
}

function playBuffer(url) {
  if (!ctx || ctx.state !== "running") return;
  loadBuffer(url).then((buffer) => {
    if (ctx.state !== "running") return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  });
}

export function unlockAudio() {
  const c = getContext();
  if (c.state === "suspended") c.resume();
  loadBuffer("/sounds/tick.ogg");
  Object.values(EMOJI_SOUND_FILES).forEach(loadBuffer);
}

export function playTick() {
  playBuffer("/sounds/tick.ogg");
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

// Real (or deliberate stand-in) sample per emoji, sourced from Mixkit's free
// sound effects library. Emojis not listed here fall back to the
// synthesized placeholder tone below until a matching sample is sourced.
const EMOJI_SOUND_FILES = {
  "🦁": "/sounds/lion-roar.wav",
  "🐯": "/sounds/tiger-roar.wav",
  "🐶": "/sounds/dog-bark.wav",
  "🐱": "/sounds/cat-meow.wav",
  "🐵": "/sounds/monkey-screech.wav",
  "🦉": "/sounds/owl-shriek.wav",
  "🦄": "/sounds/unicorn-sparkle.wav", // stand-in: no real unicorn sound
  "🐙": "/sounds/octopus-bubble.wav", // stand-in: octopuses don't vocalize
};

// One note per emoji from a pentatonic scale spanning ~3 octaves, so the
// remaining placeholder stings are quick and distinguishable from each
// other but still sound like they belong to the same family of sound.
const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const BASE_FREQ = 330;

function emojiBaseFreq(emoji) {
  const idx = EMOJI_ORDER.indexOf(emoji);
  const semitone = PENTATONIC_SEMITONES[idx] ?? PENTATONIC_SEMITONES[0];
  return BASE_FREQ * Math.pow(2, semitone / 12);
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

export function playFastestSting(emoji) {
  const file = EMOJI_SOUND_FILES[emoji];
  if (file) {
    playBuffer(file);
    return;
  }
  // Placeholder synthesized sting, pending a real/stand-in sample for this emoji.
  const base = emojiBaseFreq(emoji);
  tone(base, { startTime: 0, duration: 0.1, type: "triangle", peakGain: 0.2 });
  tone(base * 1.5, { startTime: 0.1, duration: 0.18, type: "triangle", peakGain: 0.25 });
}
