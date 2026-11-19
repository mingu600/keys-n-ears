import { GENRES, normalizeSong, sectionChords } from '../library/schema.js';
import { applyTaps, shiftOccurrence } from '../library/tapsync.js';
import { createYouTube, parseYouTubeId } from '../core/youtube.js';
import { h } from './dom.js';
import { recordHook } from './hook-recorder.js';

const TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const clone = (x) => JSON.parse(JSON.stringify(x));
const barsToText = (bars) => (bars ?? []).map((b) => (Array.isArray(b) ? b.join(' ') : '')).join('\n');
const textToBars = (t) => t.split('\n').map((l) => l.trim().split(/\s+/).filter(Boolean)).filter((b) => b.length);
const isTyping = (t) => t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function blankSong() {
  return {
    id: '', title: '', artist: '', genres: [], year: null, key: { tonic: 'C', mode: 'major' }, bpm: 100,
    timeSignature: [4, 4], sections: [{ name: 'A', bars: [['C']] }], form: [{ section: 'A', start: null, chordTimes: null }],
    hooks: [], youtube: { id: null, offset: 0 }, verified: false,
  };
}

export function mount(el, params, ctx) {
  const root = h('div', { class: 'song-editor' });
  el.appendChild(root);
  const cleanups = [];
  let alive = true;

  if (!ctx.store || !ctx.library) {
    root.append(h('p', { class: 'err' }, 'The song store could not be opened in this browser.'));
    return () => {};
  }
  const existing = params.id ? ctx.library.songs.find((s) => s.id === params.id) : null;
  if (params.id && !existing) {
    root.append(h('p', {}, 'Song not found. '), h('a', { href: '#/library' }, 'Back to the library'));
    return () => {};
  }
  const isNew = !existing;
  const source = existing?.source ?? 'user';
  const draft = existing ? clone(existing) : blankSong();
  delete draft.source;
  draft.sections = (draft.sections ?? []).map((s) => ({ ...s }));
  draft.form = draft.form ?? [];
  draft.hooks = draft.hooks ?? [];
  draft.youtube = draft.youtube ?? { id: null, offset: 0 };
  draft.timeSignature = Array.isArray(draft.timeSignature) ? draft.timeSignature : [4, 4];
  draft.genres = draft.genres ?? [];
  const sectionNames = () => draft.sections.map((s) => s.name);

  // ---------- validation ----------
  const generalErrors = h('div', { id: 'general-errors' });
  const sectionErrorBoxes = new Map();
  function validate() {
    const { errors } = normalizeSong({ ...draft, id: draft.id || 'x' });
    const used = new Set();
    for (const s of draft.sections) {
      const box = sectionErrorBoxes.get(s);
      if (!box) continue;
      const mine = errors.filter((e) => e.startsWith(`${s.name}:`) || e.startsWith(`${s.name} bar`));
      mine.forEach((e) => used.add(e));
      box.replaceChildren(...mine.map((e) => h('p', { class: 'err' }, e)));
    }
    generalErrors.replaceChildren(...errors.filter((e) => !used.has(e)).map((e) => h('p', { class: 'err' }, e)));
  }

  // ---------- basics ----------
  const field = (label, input) => h('label', { class: 'field' }, label, input);
  const text = (key, label, type = 'text') => field(label, h('input', {
    type, value: draft[key] ?? '', oninput: (e) => {
      draft[key] = type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
      validate(); refreshFind();
    },
  }));
  const tonics = TONICS.includes(draft.key?.tonic) || !draft.key?.tonic ? TONICS : [...TONICS, draft.key.tonic];
  draft.key = draft.key ?? { tonic: 'C', mode: 'major' };
  const keyPicker = (key, onChange) => [
    h('select', { 'aria-label': 'Key tonic', onchange: (e) => { key.tonic = e.target.value; onChange(); } },
      tonics.map((t) => h('option', { value: t, selected: t === key.tonic }, t))),
    h('select', { 'aria-label': 'Key mode', onchange: (e) => { key.mode = e.target.value; onChange(); } },
      ['major', 'minor'].map((m) => h('option', { value: m, selected: m === key.mode }, m))),
  ];
  const basics = h('section', { class: 'panel' }, h('h2', {}, isNew ? 'New song' : 'Edit song'),
    h('div', { class: 'row' }, text('title', 'Title'), text('artist', 'Artist'), text('year', 'Year', 'number')),
    h('div', { class: 'row' }, GENRES.map((g) => h('label', {}, h('input', {
      type: 'checkbox', checked: draft.genres.includes(g), onchange: (e) => {
        const set = new Set(draft.genres); e.target.checked ? set.add(g) : set.delete(g);
        draft.genres = GENRES.filter((x) => set.has(x)); validate();
      },
    }), ` ${g}`))),
    h('div', { class: 'row' },
      field('Key', h('span', { class: 'row' }, keyPicker(draft.key, validate))),
      field('BPM', h('input', { type: 'number', min: 20, max: 300, value: draft.bpm ?? 100, oninput: (e) => { draft.bpm = Number(e.target.value) || 100; } })),
      field('Time signature', h('span', { class: 'row' },
        h('input', { type: 'number', min: 1, max: 16, 'aria-label': 'Beats per bar', value: draft.timeSignature[0], oninput: (e) => { draft.timeSignature[0] = Number(e.target.value) || 4; } }),
        '/',
        h('input', { type: 'number', min: 1, max: 16, 'aria-label': 'Beat unit', value: draft.timeSignature[1], oninput: (e) => { draft.timeSignature[1] = Number(e.target.value) || 4; } })))));

  // ---------- sections ----------
  const sectionsBox = h('section', { class: 'panel' });
  function renderSections() {
    sectionErrorBoxes.clear();
    sectionsBox.replaceChildren(h('h2', {}, 'Sections'));
    draft.sections.forEach((sec, i) => {
      const box = h('div');
      sectionErrorBoxes.set(sec, box);
      let oldName = sec.name;
      const overrideOn = !!sec.key;
      const keyHolder = h('span', { class: 'row' });
      const fillKey = () => {
        keyHolder.replaceChildren(...(sec.key ? keyPicker(sec.key, validate) : []));
      };
      fillKey();
      sectionsBox.append(h('div', { class: 'card' },
        h('div', { class: 'row' },
          field('Name', h('input', { type: 'text', value: sec.name, oninput: (e) => {
            const n = e.target.value;
            for (const f of draft.form) if (f.section === oldName) f.section = n;
            for (const k of draft.hooks) if (k.section === oldName) k.section = n;
            sec.name = oldName = n;
            renderForm(); renderTap(); renderHooks(); validate();
          } })),
          h('label', {}, h('input', { type: 'checkbox', checked: overrideOn, onchange: (e) => {
            sec.key = e.target.checked ? { tonic: draft.key.tonic, mode: draft.key.mode } : undefined;
            if (!sec.key) delete sec.key;
            fillKey(); validate();
          } }), ' Key override'),
          keyHolder,
          h('button', { type: 'button', disabled: draft.sections.length < 2, onclick: () => {
            const [gone] = draft.sections.splice(i, 1);
            draft.form = draft.form.filter((f) => f.section !== gone.name);
            renderAll();
          } }, 'Remove section')),
        h('label', { class: 'field' }, 'Bars (one per line, chords separated by spaces)',
          h('textarea', { 'aria-label': `Bars for ${sec.name}`, value: barsToText(sec.bars), oninput: (e) => {
            sec.bars = textToBars(e.target.value); renderTap(); validate();
          } })),
        box));
    });
    sectionsBox.append(h('button', { type: 'button', onclick: () => {
      let n = 'Section';
      for (let k = 1; sectionNames().includes(n); k++) n = `Section ${k + 1}`;
      draft.sections.push({ name: n, bars: [['C']] });
      renderAll();
    } }, 'Add section'));
  }

  // ---------- form ----------
  const formBox = h('section', { class: 'panel' });
  function renderForm() {
    formBox.replaceChildren(h('h2', {}, 'Form (order of sections)'));
    draft.form.forEach((f, i) => {
      const move = (d) => { const j = i + d; [draft.form[i], draft.form[j]] = [draft.form[j], draft.form[i]]; renderForm(); renderTap(); };
      formBox.append(h('div', { class: 'row' },
        h('span', { class: 'muted' }, `${i + 1}.`),
        h('select', { 'aria-label': `Form entry ${i + 1}`, onchange: (e) => {
          draft.form[i] = { section: e.target.value, start: null, chordTimes: null }; renderTap(); validate();
        } }, sectionNames().map((n) => h('option', { value: n, selected: n === f.section }, n)),
        sectionNames().includes(f.section) ? null : h('option', { value: f.section ?? '', selected: true }, `${f.section} (missing)`)),
        h('button', { type: 'button', disabled: i === 0, 'aria-label': 'Move up', onclick: () => move(-1) }, 'Up'),
        h('button', { type: 'button', disabled: i === draft.form.length - 1, 'aria-label': 'Move down', onclick: () => move(1) }, 'Down'),
        h('button', { type: 'button', onclick: () => { draft.form.splice(i, 1); renderForm(); renderTap(); validate(); } }, 'Remove')));
    });
    formBox.append(h('button', { type: 'button', onclick: () => {
      draft.form.push({ section: sectionNames()[0], start: null, chordTimes: null }); renderForm(); renderTap(); validate();
    } }, 'Add to form'));
  }

  // ---------- YouTube + tap-sync ----------
  let player = null, notEmbeddable = false, tapping = false, taps = [], occ = 0, rate = 1, tapNote = '';
  const ytBox = h('div', { class: 'yt', hidden: true });
  const ytMsg = h('p', { class: 'muted', role: 'status' });
  const findLink = h('a', { class: 'button', target: '_blank', rel: 'noopener', href: '#' }, 'Find on YouTube');
  const tapBox = h('div', { id: 'tap-panel' });
  function refreshFind() {
    findLink.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${draft.artist ?? ''} ${draft.title ?? ''}`.trim())}`;
  }
  const ytInput = h('input', { type: 'text', placeholder: 'Paste a YouTube link', 'aria-label': 'YouTube link', value: draft.youtube.id ?? '',
    oninput: (e) => {
      if (e.target.value.trim() === '') { setVideo(null); return; }
      const id = parseYouTubeId(e.target.value);
      ytMsg.textContent = id ? '' : 'That does not look like a YouTube link.';
      if (id) setVideo(id);
    } });
  const ytPanel = h('section', { class: 'panel' }, h('h2', {}, 'YouTube and tap-sync'),
    h('div', { class: 'row' }, ytInput, findLink), ytMsg, ytBox, tapBox);

  async function setVideo(id) {
    draft.youtube.id = id;
    notEmbeddable = false;
    stopTapping(false);
    ytBox.hidden = !id;
    if (id) {
      try {
        if (!player) {
          const p = await createYouTube(ytBox);
          if (!alive) { p.destroy(); return; }
          player = p;
          player.on('error', (code) => { if (code === 'not-embeddable') { notEmbeddable = true; renderTap(); } });
        }
        if (draft.youtube.id === id) player.load(id, draft.youtube.offset ?? 0);
      } catch (e) { ytMsg.textContent = e.message; }
    }
    renderTap();
  }

  const chordCount = (i) => sectionChords(draft, draft.form[i]?.section).length;
  function stopTapping(apply = true) {
    if (!tapping) return;
    tapping = false;
    try { player?.pause(); } catch { /* player gone */ }
    if (apply && draft.form[occ]) {
      const { chordTimes, warning } = applyTaps(taps, chordCount(occ));
      tapNote = warning ?? 'Timing saved to this occurrence (press Save to keep it).';
      if (chordTimes.length) draft.form[occ] = { ...draft.form[occ], start: chordTimes[0], chordTimes };
    }
    renderTap();
  }
  const onKey = (e) => {
    if (!tapping || e.code !== 'Space' || isTyping(e.target)) return;
    e.preventDefault();
    if (e.repeat) return;
    taps.push(player.time());
    renderTap();
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));

  function renderTap() {
    tapBox.replaceChildren();
    if (!draft.youtube.id) { tapBox.append(h('p', { class: 'muted' }, 'Add a YouTube link to sync')); return; }
    if (notEmbeddable) {
      tapBox.append(h('p', { class: 'muted' }, "This video can't be embedded; try another upload"),
        h('a', { class: 'button', target: '_blank', rel: 'noopener', href: `https://www.youtube.com/watch?v=${draft.youtube.id}` }, 'Open on YouTube'));
      return;
    }
    if (!draft.form.length) { tapBox.append(h('p', { class: 'muted' }, 'Add a section to the form first.')); return; }
    if (occ >= draft.form.length) occ = 0;
    const n = chordCount(occ);
    const prevIdx = draft.form.slice(0, occ).map((f, i) => i).reverse()
      .find((i) => draft.form[i].section === draft.form[occ].section && Array.isArray(draft.form[i].chordTimes) && draft.form[i].start != null);
    const times = draft.form[occ].chordTimes;
    tapBox.append(
      h('div', { class: 'row' },
        field('Occurrence', h('select', { disabled: tapping, onchange: (e) => { occ = Number(e.target.value); tapNote = ''; renderTap(); } },
          draft.form.map((f, i) => h('option', { value: i, selected: i === occ }, `${i + 1}. ${f.section}${Array.isArray(f.chordTimes) ? ' (synced)' : ''}`)))),
        field('Speed', h('select', { disabled: tapping, onchange: (e) => { rate = Number(e.target.value); } },
          [1, 0.75].map((r) => h('option', { value: r, selected: r === rate }, `${r}x`)))),
        tapping
          ? h('button', { type: 'button', onclick: () => stopTapping(true) }, 'Stop')
          : h('button', { type: 'button', class: 'primary', disabled: !player || n === 0, onclick: () => {
            document.activeElement?.blur?.();
            taps = []; tapNote = ''; tapping = true;
            player.setRate(rate);
            player.seek(draft.form[occ].start ?? draft.youtube.offset ?? 0);
            player.play();
            renderTap();
          } }, 'Start tapping'),
        prevIdx != null && !tapping ? h('button', { type: 'button', disabled: !player, onclick: () => {
          const shifted = shiftOccurrence(draft.form[prevIdx], player.time());
          draft.form[occ] = { ...draft.form[occ], ...shifted };
          tapNote = `Copied timing from occurrence ${prevIdx + 1}.`;
          renderTap();
        } }, `Copy timing from previous ${draft.form[occ].section}`) : null),
      tapping ? h('p', {}, `Press Space at each chord change: ${taps.length} of ${n} tapped.`) : null,
      !tapping && Array.isArray(times) ? h('p', { class: 'muted' }, `Synced times: ${times.map((t) => t.toFixed(1)).join(', ')}`) : null,
      tapNote ? h('p', { role: 'status' }, tapNote) : null);
  }

  // ---------- hooks ----------
  const hooksBox = h('section', { class: 'panel' });
  let hookName = '', hookSection = null, recorder = null, hookMsg = '';
  function stopRecording() {
    if (!recorder) return;
    const notes = recorder.stop();
    recorder = null;
    if (notes.length < 4) hookMsg = 'Need at least 4 notes. Nothing was saved.';
    else {
      draft.hooks.push({ name: hookName || `Hook ${draft.hooks.length + 1}`, section: hookSection, notes, verified: false });
      hookMsg = `Recorded ${notes.length} notes.`;
    }
    renderHooks(); validate();
  }
  cleanups.push(() => { recorder?.stop(); recorder = null; });
  function renderHooks() {
    if (!sectionNames().includes(hookSection)) hookSection = sectionNames()[0] ?? null;
    hooksBox.replaceChildren(h('h2', {}, 'Melody hooks'));
    draft.hooks.forEach((k, i) => hooksBox.append(h('div', { class: 'row' },
      h('strong', {}, k.name), h('span', { class: 'muted' }, `${k.section ?? ''} · ${k.notes?.length ?? 0} notes`),
      h('label', {}, h('input', { type: 'checkbox', checked: !!k.verified, onchange: (e) => { k.verified = e.target.checked; } }), ' I checked this'),
      h('button', { type: 'button', onclick: () => { draft.hooks.splice(i, 1); renderHooks(); validate(); } }, 'Delete'))));
    hooksBox.append(h('div', { class: 'row' },
      field('Hook name', h('input', { type: 'text', value: hookName, disabled: !!recorder, oninput: (e) => { hookName = e.target.value; } })),
      field('Section', h('select', { disabled: !!recorder, onchange: (e) => { hookSection = e.target.value; } },
        sectionNames().map((n) => h('option', { value: n, selected: n === hookSection }, n)))),
      recorder
        ? h('button', { type: 'button', onclick: stopRecording }, 'Stop')
        : h('button', { type: 'button', onclick: () => {
          hookMsg = '';
          recorder = recordHook(ctx.midi, draft.bpm || 100, () => stopRecording());
          renderHooks();
        } }, 'Record hook')),
    recorder ? h('p', { role: 'status' }, 'Recording: play 4 to 16 notes on your piano or computer keys, then press Stop.') : null,
    hookMsg ? h('p', { role: 'status' }, hookMsg) : null);
  }

  // ---------- actions ----------
  const status = h('p', { role: 'status', class: 'err' });
  const actions = h('div', { class: 'row' },
    h('button', { type: 'button', class: 'primary', onclick: async () => {
      stopTapping(true);
      if (recorder) stopRecording();
      try {
        const out = clone(draft);
        if (!out.id) out.id = `${slug(out.title || 'untitled')}-${Date.now().toString(36)}`;
        await ctx.store.putSong(out);
        ctx.library = await ctx.library.reload();
        ctx.navigate('#/library');
      } catch (e) { status.textContent = `Could not save: ${e.message}`; }
    } }, 'Save'),
    h('a', { class: 'button', href: '#/library' }, 'Cancel'),
    !isNew && source === 'user' ? h('button', { type: 'button', onclick: async () => {
      if (!window.confirm(`Delete "${draft.title}"? This cannot be undone.`)) return;
      try {
        await ctx.store.deleteSong(draft.id);
        ctx.library = await ctx.library.reload();
        ctx.navigate('#/library');
      } catch (e) { status.textContent = `Could not delete: ${e.message}`; }
    } }, 'Delete') : null);

  function renderAll() { renderSections(); renderForm(); renderTap(); renderHooks(); validate(); }
  root.append(basics, generalErrors, sectionsBox, formBox, ytPanel, hooksBox, status, actions);
  refreshFind();
  renderAll();
  if (draft.youtube.id) setVideo(draft.youtube.id);

  return () => {
    alive = false;
    tapping = false;
    for (const fn of cleanups) fn();
    try { player?.destroy(); } catch { /* ignore */ }
    player = null;
  };
}
