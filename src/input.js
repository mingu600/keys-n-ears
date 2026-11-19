// Collects held notes from three sources into one set:
//  - Web MIDI (a real piano, e.g. Yamaha P-515 over USB)
//  - computer keyboard (tracker layout, two octaves)
//  - mouse clicks on the on-screen keyboard (click toggles a note)
// Calls onChange(heldNotes:Set<number>, source) on every change.

// Lower row = C3..B3, upper row = C4..E5.
const KEYMAP = {
  z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54, b: 55, h: 56, n: 57, j: 58, m: 59,
  q: 60, 2: 61, w: 62, 3: 63, e: 64, r: 65, 5: 66, t: 67, 6: 68, y: 69, 7: 70, u: 71,
  i: 72, 9: 73, o: 74, 0: 75, p: 76,
};

export function createInput({ onChange, onStatus }) {
  const held = new Set();
  const emit = (source) => onChange(new Set(held), source);

  const press = (note, source) => {
    if (held.has(note)) return;
    held.add(note);
    emit(source);
  };
  const release = (note, source) => {
    if (!held.delete(note)) return;
    emit(source);
  };

  // --- Computer keyboard ---
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return;
    const note = KEYMAP[e.key.toLowerCase()];
    if (note === undefined) return;
    e.preventDefault();
    press(note, 'qwerty');
  });
  window.addEventListener('keyup', (e) => {
    const note = KEYMAP[e.key.toLowerCase()];
    if (note !== undefined) release(note, 'qwerty');
  });
  // Releasing keys while the window is unfocused would leave notes stuck.
  window.addEventListener('blur', () => {
    if (held.size === 0) return;
    held.clear();
    emit('qwerty');
  });

  // --- Mouse (called by the on-screen keyboard) ---
  const toggle = (note) => (held.has(note) ? release(note, 'mouse') : press(note, 'mouse'));
  const clear = () => {
    held.clear();
    emit('mouse');
  };

  // --- Web MIDI ---
  if (!navigator.requestMIDIAccess) {
    onStatus({ ok: false, text: 'Web MIDI not supported in this browser. Use Chrome, Edge, or Firefox (not Safari).' });
  } else {
    navigator.requestMIDIAccess({ sysex: false }).then(
      (access) => {
        const bind = () => {
          const names = [];
          for (const input of access.inputs.values()) {
            input.onmidimessage = (msg) => handleMidi(msg.data);
            names.push(input.name);
          }
          onStatus(
            names.length
              ? { ok: true, text: `MIDI: ${names.join(', ')}` }
              : { ok: false, text: 'No MIDI device found. Using computer keyboard. Plug in the piano and it connects automatically.' },
          );
        };
        access.onstatechange = bind;
        bind();
      },
      () => onStatus({ ok: false, text: 'MIDI permission denied. Using computer keyboard.' }),
    );
  }

  function handleMidi([status, note, velocity]) {
    const type = status & 0xf0;
    if (type === 0x90 && velocity > 0) press(note, 'midi');
    else if (type === 0x80 || (type === 0x90 && velocity === 0)) release(note, 'midi');
    // Sustain pedal (CC64) is ignored on purpose: only keys you physically hold count.
  }

  return { toggle, clear };
}
