import { buildPool, matches, revealVoicing, FAMILIES } from '../theory/chords.js';
import { record, pickNext, weakest, scoreFromTime, withHint, SKIP_SCORE, TARGETS } from '../core/scheduler.js';
import { createInput } from '../core/midi.js';
import { createKeyboard } from '../ui/keyboard.js';
import * as synth from '../core/fallback-synth.js';

const STORE_KEY = 'chord-drill:v2';
const ADVANCE_DELAY_MS = 350;

const $ = (id) => document.getElementById(id);

const saved = load();
const state = {
  settings: saved.settings ?? { families: ['triads'], slash: false, lenient: true },
  stats: saved.stats ?? {},
  pool: [],
  current: null,
  shownAt: 0,
  usedHint: false,
  solved: false,
  held: new Set(),
  session: { count: 0, totalMs: 0 },
};

// ---------- persistence (per-browser only) ----------
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {};
  } catch {
    return {};
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ settings: state.settings, stats: state.stats }));
  } catch {
    /* storage unavailable: drill still works, stats just won't persist */
  }
}

// ---------- drill flow ----------
function rebuildPool() {
  if (state.settings.families.length === 0) state.settings.families = ['triads'];
  state.pool = buildPool(state.settings);
  $('pool-size').textContent = `${state.pool.length} chords in rotation`;
}

function nextChord() {
  state.current = pickNext(state.pool, state.stats, state.current, {
    keyOf: (c) => 'chord:' + c.id,
    // Avoid back-to-back chords with the same root and quality (e.g. C then C/E),
    // so a still-held previous chord can't count as the answer.
    tooSimilar: (a, b) => !!b && a.root === b.root && a.quality === b.quality,
  });
  state.shownAt = performance.now();
  state.usedHint = false;
  state.solved = false;
  $('chord').textContent = state.current.symbol;
  $('chord').className = 'chord';
  $('feedback').textContent = '';
  render();
  // The player may already be holding the answer (rare, but possible).
  check();
}

function check() {
  if (state.solved || !state.current) return;
  if (!matches(state.current, state.held, { lenient: state.settings.lenient })) return;
  const ms = performance.now() - state.shownAt;
  const score = scoreFromTime(ms, TARGETS.chord);
  finish(state.usedHint ? withHint(score) : score, ms, state.usedHint ? 'Got it (hint used)' : `${(ms / 1000).toFixed(2)}s`);
}

function finish(score, rawMs, message) {
  state.solved = true;
  state.stats = record(state.stats, 'chord:' + state.current.id, score, rawMs);
  state.session.count++;
  state.session.totalMs += rawMs;
  save();
  $('chord').className = 'chord correct';
  $('feedback').textContent = message;
  renderStats();
  setTimeout(nextChord, ADVANCE_DELAY_MS);
}

function hint() {
  if (state.solved) return;
  state.usedHint = true;
  render();
}

function skip() {
  if (state.solved) return;
  finish(SKIP_SCORE, performance.now() - state.shownAt, `Skipped: ${state.current.tones.map((t) => t.name).join(' ')}`);
}

// ---------- rendering ----------
function render() {
  const hintNotes = state.usedHint && state.current ? revealVoicing(state.current) : [];
  keyboard.render(state.held, hintNotes);
  $('tones').textContent = state.usedHint ? state.current.tones.map((t) => t.name).join(' – ') : '';
}

function renderStats() {
  const { count, totalMs } = state.session;
  $('session').textContent = count ? `${count} chords · avg ${(totalMs / count / 1000).toFixed(2)}s` : 'No chords yet';
  const list = $('slowest');
  list.innerHTML = '';
  for (const s of weakest(state.stats, { prefix: 'chord:', count: 5 })) {
    const li = document.createElement('li');
    const last = s.lastMs === undefined ? '—' : `${(s.lastMs / 1000).toFixed(1)}s`;
    li.innerHTML = `<span>${s.key.slice('chord:'.length)}</span><span>${last}</span>`;
    list.appendChild(li);
  }
  if (!list.children.length) list.innerHTML = '<li class="muted">Play a few chords first</li>';
}

function tickTimer() {
  if (state.current && !state.solved) {
    $('timer').textContent = `${((performance.now() - state.shownAt) / 1000).toFixed(1)}s`;
  }
  requestAnimationFrame(tickTimer);
}

function renderSettings() {
  const box = $('families');
  box.innerHTML = '';
  for (const [key, label] of Object.entries(FAMILIES)) {
    const id = `fam-${key}`;
    const wrap = document.createElement('label');
    wrap.innerHTML = `<input type="checkbox" id="${id}"> ${label}`;
    const input = wrap.querySelector('input');
    input.checked = state.settings.families.includes(key);
    input.addEventListener('change', () => {
      const fams = new Set(state.settings.families);
      input.checked ? fams.add(key) : fams.delete(key);
      state.settings.families = [...fams];
      if (fams.size === 0) input.checked = true; // keep at least one family on
      applySettings();
    });
    box.appendChild(wrap);
  }
  bindToggle('slash', 'slash');
  bindToggle('lenient', 'lenient');
}

function bindToggle(id, key) {
  const el = $(id);
  el.checked = state.settings[key];
  el.addEventListener('change', () => {
    state.settings[key] = el.checked;
    applySettings();
  });
}

function applySettings() {
  rebuildPool();
  save();
  nextChord();
}

// ---------- wiring ----------
const keyboard = createKeyboard($('keyboard'), { onClick: (note) => input.toggle(note) });

const input = createInput({
  onChange(held, source) {
    state.held = held;
    if (source !== 'midi') synth.sync(held);
    render();
    check();
  },
  onStatus({ ok, text }) {
    $('midi-status').textContent = text;
    $('midi-status').className = ok ? 'status ok' : 'status';
  },
});

$('hint').addEventListener('click', hint);
$('skip').addEventListener('click', skip);
$('clear').addEventListener('click', () => input.clear());
$('reset').addEventListener('click', () => {
  if (!confirm('Reset all saved chord timings?')) return;
  state.stats = {};
  save();
  renderStats();
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === ' ') {
    e.preventDefault();
    hint();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    skip();
  } else if (e.key === 'Escape') {
    input.clear();
  }
});

renderSettings();
rebuildPool();
renderStats();
nextChord();
tickTimer();
