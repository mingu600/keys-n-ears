import { buildPool, matches, revealVoicing, FAMILIES } from '../theory/chords.js';
import { record, pickNext, weakest, scoreFromTime, withHint, SKIP_SCORE, TARGETS } from '../core/scheduler.js';
import { createKeyboard } from '../ui/keyboard.js';
import { filterByGenre } from '../library/library.js';
import { touchSong } from '../core/practice-log.js';
import { poolFromSongs, progressionPrompt, voiceLeadOk } from './drill-logic.js';

const STORE_KEY = 'chord-drill:v2';
const ADVANCE_DELAY_MS = 350;
const DRILL_HTML = `
    <section class="stage">
      <div class="chordrow"><div id="chord" class="chord">…</div><span id="next" class="next muted"></span></div>
      <div class="meta">
        <span id="timer" class="timer">0.0s</span>
        <span id="feedback" class="feedback"></span>
      </div>
      <div id="tones" class="tones"></div>
      <div class="actions">
        <button id="hint" type="button">Hint <kbd>Space</kbd></button>
        <button id="skip" type="button">Skip <kbd>Enter</kbd></button>
        <button id="clear" type="button">Release all <kbd>Esc</kbd></button>
      </div>
    </section>

    <div id="keyboard" class="keyboard" aria-label="Piano keyboard"></div>
    <p class="help">No piano? Lower row <kbd>Z</kbd>–<kbd>M</kbd> = C3–B3 (black keys on <kbd>S D G H J</kbd>), upper row <kbd>Q</kbd>–<kbd>P</kbd> = C4–E5 (black keys on number row). Or click keys to toggle them.</p>

    <section class="panels">
      <div class="panel">
        <h2>Chords</h2>
        <div id="families" class="checks"></div>
        <label><input type="checkbox" id="slash"> Slash chords (D/F♯, Cmaj7/B)</label>
        <label><input type="checkbox" id="lenient"> Allow dropping the 5th in 4-note chords</label>
        <label><input type="checkbox" id="strict"> Strict voicing (every chord tone)</label>
        <label>Chords from <select id="source"><option value="all">All chords</option><option value="songs">From my songs</option></select></label>
        <label>Mode <select id="mode"><option value="single">Single chords</option><option value="lead">Voice leading</option></select></label>
        <p id="pool-size" class="muted"></p>
      </div>
      <div class="panel">
        <h2>Progress</h2>
        <p id="session"></p>
        <h3>Slowest chords (all time)</h3>
        <ol id="slowest" class="slowest"></ol>
        <button id="reset" type="button" class="quiet">Reset timings</button>
      </div>
    </section>
`;

export function mount(el, params, ctx) {
  const { midi, sound } = ctx;
  el.innerHTML = DRILL_HTML;
  const $ = (id) => el.querySelector('#' + id);
  let advanceTimer = null;
  let rafId = 0;

  const saved = load();
  const state = {
    settings: { families: ['triads'], slash: false, lenient: true, strict: false, source: 'all', mode: 'single', ...saved.settings },
    stats: saved.stats ?? {},
    pool: [],
    current: null,
    shownAt: 0,
    usedHint: false,
    solved: false,
    held: new Set(),
    session: { count: 0, totalMs: 0 },
    poolNote: '',
    lead: null, // { song, chords, idx, prevNotes } while walking a progression
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
    state.poolNote = '';
    let pool = null;
    if (state.settings.source === 'songs') {
      pool = poolFromSongs(filterByGenre(ctx.library?.songs ?? [], ctx.settings.genres));
      if (!pool.length) {
        pool = null;
        state.poolNote = 'No chords found in your songs for the current genre filter, so using All chords.';
      }
    }
    state.pool = pool ?? buildPool(state.settings);
    $('pool-size').textContent = `${state.pool.length} chords in rotation. ${state.poolNote}`.trim();
  }

  // Voice-leading mode: advance along the song's progression, starting a new song when it ends.
  function nextLeadChord() {
    if (!state.lead || state.lead.idx + 1 >= state.lead.chords.length) {
      const candidates = filterByGenre(ctx.library?.songs ?? [], ctx.settings.genres)
        .map((song) => ({ song, chords: progressionPrompt(song) }))
        .filter((c) => c.chords.length >= 2);
      if (!candidates.length) return false;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      state.lead = { song: pick.song, chords: pick.chords, idx: 0, prevNotes: null };
      markPracticed(pick.song.id);
    } else {
      state.lead.idx++;
    }
    state.current = state.lead.chords[state.lead.idx];
    return true;
  }

  async function markPracticed(id) {
    if (!ctx.store || !id) return;
    try {
      const map = (await ctx.store.get('songStatus')) ?? {};
      await ctx.store.set('songStatus', touchSong(map, id, new Date()));
    } catch (e) {
      console.error('song status not saved', e);
    }
  }

  function nextChord() {
    const leading = state.settings.mode === 'lead' && nextLeadChord();
    if (!leading) state.lead = null;
    $('next').textContent = leading ? (state.lead.chords[state.lead.idx + 1]?.symbol ?? '') : '';
    if (!leading) state.current = pickNext(state.pool, state.stats, state.current, {
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
    // Not in voice-leading mode: a repeated chord would otherwise count with zero movement.
    if (!leading) check();
  }

  function check() {
    if (state.solved || !state.current) return;
    if (!matches(state.current, state.held, { lenient: state.settings.lenient, strict: state.settings.strict })) return;
    if (state.lead?.prevNotes && !voiceLeadOk(state.lead.prevNotes, [...state.held])) {
      $('feedback').textContent = 'Right chord, smoother move?';
      return;
    }
    if (state.lead) state.lead.prevNotes = [...state.held];
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
    advanceTimer = setTimeout(nextChord, ADVANCE_DELAY_MS);
  }

  function hint() {
    if (state.solved) return;
    state.usedHint = true;
    sound.playNotes(revealVoicing(state.current));
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
    rafId = requestAnimationFrame(tickTimer);
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
    bindToggle('strict', 'strict');
    for (const key of ['source', 'mode']) {
      const sel = $(key);
      sel.value = state.settings[key];
      sel.addEventListener('change', () => {
        state.settings[key] = sel.value;
        if (key === 'mode') state.lead = null;
        applySettings();
      });
    }
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
  const keyboard = createKeyboard($('keyboard'), { onClick: (note) => midi.toggle(note) });

  const offChange = midi.on('change', ({ held, source }) => {
    state.held = held;
    if (source !== 'midi') sound.echo(held);
    render();
    check();
  });

  $('hint').addEventListener('click', hint);
  $('skip').addEventListener('click', skip);
  $('clear').addEventListener('click', () => midi.clear());
  $('reset').addEventListener('click', () => {
    if (!confirm('Reset all saved chord timings?')) return;
    state.stats = {};
    save();
    renderStats();
  });
  const onKeydown = (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (e.key === ' ') {
      e.preventDefault();
      hint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      skip();
    } else if (e.key === 'Escape') {
      midi.clear();
    }
  };
  window.addEventListener('keydown', onKeydown);
  const onGenres = () => {
    if (state.settings.source === 'songs' || state.settings.mode === 'lead') {
      state.lead = null;
      applySettings();
    }
  };
  window.addEventListener('hub:genres', onGenres);

  renderSettings();
  rebuildPool();
  renderStats();
  nextChord();
  tickTimer();

  return () => {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('hub:genres', onGenres);
    offChange();
    cancelAnimationFrame(rafId);
    clearTimeout(advanceTimer);
    midi.clear();
  };
}
