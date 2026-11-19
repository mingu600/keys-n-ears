// Sound engine: Salamander piano sampler (Tone.js), MIDI-out to the piano,
// drone, metronome, and a triangle-synth fallback when samples cannot load.

import * as synth from './fallback-synth.js';

const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';
const LOAD_TIMEOUT_MS = 10000;

// A0..C8 every minor third (Tone.js docs map); sharps are written 's' in file names.
const SAMPLE_URLS = {};
for (const [name, file] of [['A', 'A'], ['C', 'C'], ['D#', 'Ds'], ['F#', 'Fs']]) {
  for (let oct = 0; oct <= 8; oct++) {
    const key = `${name}${oct}`;
    if (key === 'A0' || (oct >= 1 && oct <= 7) || key === 'C8') SAMPLE_URLS[key] = `${file}${oct}.mp3`;
  }
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
const freq = (n) => 440 * 2 ** ((n - 69) / 12);
const vel127 = (v) => Math.max(1, Math.min(127, Math.round(v * 127)));

export function createSound(midi) {
  let sampler = null;
  let mode = null; // 'sampler' | 'fallback' once ready resolves
  let output = 'piano';
  const pianoActive = new Map(); // note -> sounding count (for cancelling stuck notes)

  // Raw Web Audio for drone and metronome (independent of Tone and of the sampler).
  let ac = null;
  const audio = () => {
    if (!ac) ac = new AudioContext();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };

  const unlock = () => {
    try {
      if (typeof window !== 'undefined' && window.Tone && window.Tone.start) window.Tone.start();
      if (ac && ac.state === 'suspended') ac.resume();
    } catch { /* ignore */ }
  };
  for (const ev of ['keydown', 'pointerdown']) window.addEventListener(ev, unlock, { passive: true });
  midi.on('note', unlock);

  const ready = new Promise((resolve) => {
    const T = typeof window !== 'undefined' ? window.Tone : undefined;
    if (!T || !T.Sampler) {
      mode = 'fallback';
      resolve('fallback');
      return;
    }
    let done = false;
    const finish = (m) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      mode = m;
      resolve(m);
    };
    const timer = setTimeout(() => finish('fallback'), LOAD_TIMEOUT_MS);
    try {
      sampler = new T.Sampler({
        urls: SAMPLE_URLS,
        baseUrl: SAMPLE_BASE,
        release: 1,
        onload: () => finish('sampler'),
        onerror: () => finish('fallback'),
      }).toDestination();
    } catch {
      finish('fallback');
    }
  });

  // Run fn once the mode is known; `elapsed` compensates the wait for scheduled times.
  const whenReady = (fn) => {
    if (mode) return fn(0);
    const t0 = performance.now();
    ready.then(() => fn((performance.now() - t0) / 1000));
  };

  const usePiano = () => output === 'piano' && midi.hasOutput();

  function playBrowser(notes, when, duration, velocity) {
    if (mode === 'sampler') {
      const T = window.Tone;
      sampler.triggerAttackRelease(notes.map(noteName), duration, T.now() + when, velocity);
    } else {
      for (const n of notes) {
        setTimeout(() => synth.noteOn(n), when * 1000);
        setTimeout(() => synth.noteOff(n), (when + duration) * 1000);
      }
    }
  }

  function playPiano(notes, when, duration, velocity) {
    const base = performance.now();
    const v = vel127(velocity);
    for (const n of notes) {
      midi.send([0x90, n, v], base + when * 1000);
      midi.send([0x80, n, 0], base + (when + duration) * 1000);
      pianoActive.set(n, (pianoActive.get(n) ?? 0) + 1);
      setTimeout(() => {
        const c = (pianoActive.get(n) ?? 1) - 1;
        if (c <= 0) pianoActive.delete(n);
        else pianoActive.set(n, c);
      }, (when + duration) * 1000);
    }
  }

  function playNotes(notes, { when = 0, duration = 1, velocity = 0.7 } = {}) {
    if (!notes || !notes.length) return;
    // MIDI-out does not need the sampler: send immediately, never wait for sample load.
    if (usePiano()) {
      playPiano(notes, when, duration, velocity);
      return;
    }
    whenReady((elapsed) => playBrowser(notes, Math.max(0, when - elapsed), duration, velocity));
  }

  function playSequence(events) {
    const timers = new Set();
    let stopped = false;
    const t0 = performance.now();
    for (const ev of events) {
      const delay = Math.max(0, ev.time * 1000 - (performance.now() - t0));
      const id = setTimeout(() => {
        timers.delete(id);
        if (!stopped) playNotes(ev.notes, { when: 0, duration: ev.duration });
      }, delay);
      timers.add(id);
    }
    return {
      stop() {
        stopped = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const n of pianoActive.keys()) midi.send([0x80, n, 0]);
        pianoActive.clear();
      },
    };
  }

  // --- Echo of QWERTY/mouse notes (browser only, never the piano) ---
  let echoed = new Set();
  let latestHeld = new Set();
  function echo(held) {
    latestHeld = new Set(held);
    whenReady(() => {
      if (mode !== 'sampler') {
        synth.sync(latestHeld);
        return;
      }
      for (const n of [...echoed]) if (!latestHeld.has(n)) sampler.triggerRelease(noteName(n));
      for (const n of latestHeld) if (!echoed.has(n)) sampler.triggerAttack(noteName(n), undefined, 0.7);
      echoed = new Set(latestHeld);
    });
  }

  // --- Drone: soft sustained low tonic + fifth ---
  let droneNodes = null;
  const drone = {
    start(pc) {
      drone.stop();
      const a = audio();
      const gain = a.createGain();
      gain.gain.setValueAtTime(0, a.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, a.currentTime + 0.3);
      gain.connect(a.destination);
      const base = 36 + (((pc % 12) + 12) % 12);
      const oscs = [base, base + 7].map((n) => {
        const o = a.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq(n);
        o.connect(gain);
        o.start();
        return o;
      });
      droneNodes = { gain, oscs };
    },
    stop() {
      if (!droneNodes) return;
      const { gain, oscs } = droneNodes;
      droneNodes = null;
      const a = audio();
      gain.gain.cancelScheduledValues(a.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, a.currentTime);
      gain.gain.linearRampToValueAtTime(0, a.currentTime + 0.2);
      for (const o of oscs) o.stop(a.currentTime + 0.25);
    },
  };

  // --- Metronome: short click, accent on beat 1 ---
  let metro = null;
  const click = (time, accent) => {
    const a = audio();
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.value = accent ? 1500 : 1000;
    g.gain.setValueAtTime(accent ? 0.35 : 0.2, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g).connect(a.destination);
    o.start(time);
    o.stop(time + 0.06);
  };
  const metronome = {
    start(bpm, beatsPerBar = 4, onBeat) {
      metronome.stop();
      const a = audio();
      const interval = 60 / bpm;
      let next = a.currentTime + 0.05;
      let beat = 0;
      const timeouts = new Set();
      const tick = () => {
        while (next < a.currentTime + 0.15) {
          const accent = beat % beatsPerBar === 0;
          click(next, accent);
          if (onBeat) {
            const idx = beat % beatsPerBar;
            const id = setTimeout(() => { timeouts.delete(id); onBeat(idx, accent); }, Math.max(0, (next - a.currentTime) * 1000));
            timeouts.add(id);
          }
          next += interval;
          beat++;
        }
      };
      tick();
      metro = { timer: setInterval(tick, 25), timeouts };
    },
    stop() {
      if (!metro) return;
      clearInterval(metro.timer);
      for (const id of metro.timeouts) clearTimeout(id);
      metro = null;
    },
  };

  return {
    ready,
    setOutput(o) { output = o === 'browser' ? 'browser' : 'piano'; },
    output: () => output,
    playNotes,
    playSequence,
    drone,
    metronome,
    echo,
  };
}
