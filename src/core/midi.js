// Collects held notes from three sources into one set:
//  - Web MIDI (a real piano, e.g. Yamaha P-515 over USB)
//  - computer keyboard (tracker layout, two octaves)
//  - mouse clicks on the on-screen keyboard (click toggles a note)
// Exposes an event stream (change/note/pedal/devices), MIDI output and device choice.

// Lower row = C3..B3, upper row = C4..E5.
const KEYMAP = {
  z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54, b: 55, h: 56, n: 57, j: 58, m: 59,
  q: 60, 2: 61, w: 62, 3: 63, e: 64, r: 65, 5: 66, t: 67, 6: 68, y: 69, 7: 70, u: 71,
  i: 72, 9: 73, o: 74, 0: 75, p: 76,
};

const STORE_KEY = 'hub:midi';

// Pure: decode a raw MIDI message. Returns null for anything we do not use.
export function parseMidiMessage(data) {
  const [status, a, b] = data;
  const kind = status & 0xf0;
  if (kind === 0x90 && b > 0) return { type: 'on', note: a, velocity: b };
  if (kind === 0x80 || kind === 0x90) return { type: 'off', note: a, velocity: b };
  if (kind === 0xb0 && a === 64) return { type: 'pedal', value: b };
  return null;
}

// Pure: remove every note held by `source` from the map; returns the notes released.
export function releaseSource(held, source) {
  const released = [];
  for (const [note, src] of held) {
    if (src === source) {
      held.delete(note);
      released.push(note);
    }
  }
  return released;
}

// Pure: ports in `portMap` (a Map of id -> port) that are currently connected.
export function connectedPorts(portMap) {
  return portMap ? [...portMap.values()].filter((p) => p.state === 'connected') : [];
}

// Pure: remove notes from the map (all, or only those held by `source`);
// returns [{ note, source }] for each released note.
export function releaseHeld(held, source) {
  const released = [];
  for (const [note, src] of held) {
    if (source === undefined || src === source) {
      held.delete(note);
      released.push({ note, source: src });
    }
  }
  return released;
}

// Pure: inputs to listen to. A saved id that is not connected falls back to all inputs.
export function pickInputs(all, savedId) {
  const pick = all.filter((i) => i.id === savedId);
  return savedId === 'all' || !pick.length ? all : pick;
}

// Pure-ish duck-typed check: only text-entry targets swallow note keys.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'number', 'password', 'email', 'url', 'tel', '']);
export function isTextEntryTarget(t) {
  if (!t || typeof t.tagName !== 'string') return false;
  const tag = t.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has(String(t.type ?? '').toLowerCase());
  return Boolean(t.isContentEditable);
}

export function createMidi({ onStatus }) {
  const held = new Map(); // note -> source
  const listeners = { change: new Set(), note: new Set(), pedal: new Set(), devices: new Set() };
  const emit = (type, payload) => {
    for (const fn of listeners[type]) fn(payload);
  };
  const emitChange = (source) => emit('change', { held: new Set(held.keys()), source });
  const emitNote = (type, note, velocity, source) =>
    emit('note', { type, note, velocity, time: performance.now(), source });

  const press = (note, source, velocity = 100) => {
    if (held.has(note)) return;
    held.set(note, source);
    emitNote('on', note, velocity, source);
    emitChange(source);
  };
  const release = (note, source, velocity = 0) => {
    if (!held.delete(note)) return;
    emitNote('off', note, velocity, source);
    emitChange(source);
  };

  // Forced release (disconnect, blur, clear, input switch): note-offs, then one change.
  const forceRelease = (source, changeSource) => {
    const released = releaseHeld(held, source);
    if (!released.length) return;
    for (const r of released) emitNote('off', r.note, 0, r.source);
    emitChange(changeSource ?? source);
  };

  // --- Persistence ---
  let saved = { input: 'all', output: null };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && typeof raw === 'object') {
      saved = { input: typeof raw.input === 'string' ? raw.input : 'all', output: typeof raw.output === 'string' ? raw.output : null };
    }
  } catch { /* storage unavailable or corrupt: use defaults */ }
  const persist = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
  };

  // --- Computer keyboard ---
  const isFormTarget = isTextEntryTarget;
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isFormTarget(e.target)) return;
    const note = KEYMAP[e.key.toLowerCase()];
    if (note === undefined) return;
    e.preventDefault();
    press(note, 'qwerty');
  });
  window.addEventListener('keyup', (e) => {
    if (isFormTarget(e.target)) return;
    const note = KEYMAP[e.key.toLowerCase()];
    if (note !== undefined) release(note, 'qwerty');
  });
  // Releasing keys while the window is unfocused would leave notes stuck.
  window.addEventListener('blur', () => {
    forceRelease(undefined, 'qwerty');
  });

  // --- Mouse (called by the on-screen keyboard) ---
  const toggle = (note) => (held.has(note) ? release(note, 'mouse') : press(note, 'mouse'));
  const clear = () => forceRelease(undefined, 'mouse');

  // --- Web MIDI ---
  let access = null;
  const list = (map) => connectedPorts(map).map((p) => ({ id: p.id, name: p.name }));
  const inputs = () => list(access && access.inputs);
  const outputs = () => list(access && access.outputs);

  const handleMidi = (data) => {
    const m = parseMidiMessage(data);
    if (!m) return;
    if (m.type === 'pedal') emit('pedal', { value: m.value, time: performance.now() });
    else if (m.type === 'on') press(m.note, 'midi', m.velocity);
    else release(m.note, 'midi', m.velocity);
  };

  const selectedInputs = () => {
    if (!access) return [];
    const all = connectedPorts(access.inputs);
    return pickInputs(all, saved.input);
  };

  const bind = (statusOnDisconnect) => {
    if (!access) return;
    const active = selectedInputs();
    for (const input of access.inputs.values()) {
      input.onmidimessage = active.includes(input) ? (msg) => handleMidi(msg.data) : null;
    }
    if (statusOnDisconnect && !active.length) onStatus({ ok: false, text: 'MIDI device disconnected.' });
    else {
      onStatus(
        active.length
          ? { ok: true, text: `MIDI: ${active.map((i) => i.name).join(', ')}` }
          : { ok: false, text: 'No MIDI device found. Using computer keyboard. Plug in the piano and it connects automatically.' },
      );
    }
  };

  const selectInput = (id) => {
    forceRelease('midi');
    saved.input = id || 'all';
    persist();
    bind(false);
  };
  const selectOutput = (id) => {
    saved.output = id || null;
    persist();
  };
  const send = (bytes, timestampMs) => {
    if (!access || !saved.output) return;
    const out = access.outputs.get(saved.output);
    if (!out) return;
    try {
      if (timestampMs === undefined) out.send(bytes);
      else out.send(bytes, timestampMs);
    } catch { /* output disconnected or closed: never throw into callers */ }
  };

  if (!navigator.requestMIDIAccess) {
    onStatus({ ok: false, text: 'Web MIDI not supported in this browser. Use Chrome, Edge, or Firefox (not Safari).' });
  } else {
    navigator.requestMIDIAccess({ sysex: false }).then(
      (a) => {
        access = a;
        access.onstatechange = (e) => {
          const port = e && e.port;
          const gone = port && port.state === 'disconnected';
          if (gone && port.type === 'input') forceRelease('midi');
          bind(Boolean(gone));
          emit('devices', { inputs: inputs(), outputs: outputs() });
        };
        bind(false);
        emit('devices', { inputs: inputs(), outputs: outputs() });
      },
      () => onStatus({ ok: false, text: 'MIDI permission denied. Using computer keyboard.' }),
    );
  }

  return {
    held: () => new Set(held.keys()),
    on(type, fn) {
      listeners[type].add(fn);
      return () => listeners[type].delete(fn);
    },
    toggle,
    clear,
    inputs,
    outputs,
    selectInput,
    selectOutput,
    // True when a saved output is currently connected (so send() will reach a port).
    hasOutput: () => Boolean(access && saved.output && access.outputs.get(saved.output)?.state === 'connected'),
    send,
  };
}
