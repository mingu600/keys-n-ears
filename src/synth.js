// Tiny Web Audio synth so computer-keyboard and mouse input make sound.
// MIDI input stays silent here because the piano already makes sound.

let ctx = null;
const voices = new Map();

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const freq = (note) => 440 * 2 ** ((note - 69) / 12);

export function noteOn(note) {
  if (voices.has(note)) return;
  const a = audio();
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq(note);
  gain.gain.setValueAtTime(0, a.currentTime);
  gain.gain.linearRampToValueAtTime(0.15, a.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.05, a.currentTime + 0.8);
  osc.connect(gain).connect(a.destination);
  osc.start();
  voices.set(note, { osc, gain });
}

export function noteOff(note) {
  const v = voices.get(note);
  if (!v) return;
  const a = audio();
  v.gain.gain.cancelScheduledValues(a.currentTime);
  v.gain.gain.setValueAtTime(v.gain.gain.value, a.currentTime);
  v.gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.15);
  v.osc.stop(a.currentTime + 0.2);
  voices.delete(note);
}

// Keep the synth in sync with the held-note set.
export function sync(held) {
  for (const note of [...voices.keys()]) if (!held.has(note)) noteOff(note);
  for (const note of held) noteOn(note);
}
