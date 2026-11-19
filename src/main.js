import { createMidi } from './core/midi.js';
import { createSound } from './core/sound.js';
import { createRouter } from './core/router.js';
import { openStore } from './core/store.js';
import { loadLibrary } from './library/library.js';
import { GENRES } from './library/schema.js';

const SETTINGS_KEY = 'hub:settings';

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; } catch { /* ignore */ }
  if (!Array.isArray(s.genres)) s.genres = [...GENRES];
  return s;
}

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
}

const midi = createMidi({
  onStatus({ ok, text }) {
    $('midi-status').textContent = text;
    $('midi-status').className = ok ? 'status ok' : 'status';
  },
});
const sound = createSound(midi);

const ctx = {
  midi,
  sound,
  store: null,
  library: null,
  settings,
  saveSettings,
  navigate: (hash) => router.navigate(hash),
};
if (location.hostname === 'localhost') window.ctx = ctx;

const routes = [
  ['/', () => import('./views/home.js')],
  ['/drill', () => import('./views/drill.js')],
  ['/library', () => import('./views/library.js')],
  ['/song/new', () => import('./views/song-editor.js')],
  ['/song/:id/edit', () => import('./views/song-editor.js')],
];
const router = createRouter(routes, $('view'), ctx);

// ---------- header controls ----------
const NAME_KEY = 'hub:midi';
function savedMidi() {
  try { return JSON.parse(localStorage.getItem(NAME_KEY)) ?? {}; } catch { return {}; }
}

function fillSelect(select, options, value) {
  select.innerHTML = '';
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    select.appendChild(o);
  }
  select.value = options.some(([v]) => v === value) ? value : options[0][0];
}

function refreshDevices() {
  const saved = savedMidi();
  fillSelect($('input-select'), [['all', 'All inputs'], ...midi.inputs().map((i) => [i.id, i.name])], saved.input ?? 'all');
  const outs = midi.outputs();
  const cur = midi.hasOutput() && sound.output() === 'piano' ? saved.output : '';
  fillSelect($('output-select'), [['', 'Prompts: Browser'], ...outs.map((o) => [o.id, `Prompts: ${o.name}`])], cur ?? '');
}

$('input-select').addEventListener('change', (e) => midi.selectInput(e.target.value));
$('output-select').addEventListener('change', (e) => {
  const id = e.target.value;
  if (id) { midi.selectOutput(id); sound.setOutput('piano'); }
  else { midi.selectOutput(null); sound.setOutput('browser'); }
});
midi.on('devices', refreshDevices);
refreshDevices();

function renderGenres() {
  const box = $('genre-list');
  box.innerHTML = '';
  for (const g of GENRES) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = settings.genres.includes(g);
    input.addEventListener('change', () => {
      const set = new Set(settings.genres);
      input.checked ? set.add(g) : set.delete(g);
      settings.genres = GENRES.filter((x) => set.has(x));
      saveSettings();
      renderGenreSummary();
      window.dispatchEvent(new CustomEvent('hub:genres')); // views re-filter on this
    });
    label.append(input, ` ${g}`);
    box.appendChild(label);
  }
  renderGenreSummary();
}
function renderGenreSummary() {
  const n = settings.genres.length;
  $('genre-summary').textContent = n === 0 || n === GENRES.length ? 'Genres: All' : `Genres: ${n}`;
}
renderGenres();

// Open the store and load the library before the first view renders.
try {
  ctx.store = await openStore();
  ctx.library = await loadLibrary(ctx.store);
} catch (e) {
  console.error('Could not open the song store', e);
}
router.start();
