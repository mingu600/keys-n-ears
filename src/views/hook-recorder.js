// Records MIDI/QWERTY note-ons into a hook: 8th-note quantized relative to the first note, max 16 notes.
const MAX_NOTES = 16;
const q8 = (beats) => Math.round(beats * 2) / 2;

export function recordHook(midi, bpm, onFull) {
  const msPerBeat = 60000 / bpm;
  const events = [];
  let t0 = null;
  const open = new Map(); // midi note -> event
  const off = midi.on('note', (e) => {
    const now = performance.now();
    if (e.type === 'on') {
      if (events.length >= MAX_NOTES) return;
      if (t0 === null) t0 = now;
      const ev = { note: e.note, on: now, off: null };
      events.push(ev);
      open.set(e.note, ev);
      if (events.length >= MAX_NOTES) setTimeout(onFull, 0);
    } else if (e.type === 'off') {
      const ev = open.get(e.note);
      if (ev) { ev.off = now; open.delete(e.note); }
    }
  });
  return {
    stop() {
      off();
      return events.map((ev) => {
        const start = q8((ev.on - t0) / msPerBeat);
        const end = ev.off == null ? start : q8((ev.off - t0) / msPerBeat);
        return [ev.note, start, Math.max(0.5, end - start)];
      });
    },
  };
}
