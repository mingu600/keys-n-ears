import { filterByGenre, parsePack, parseImport, withoutToken, keepToken } from '../library/library.js';
import { syncPacks } from '../core/github-sync.js';
import { h, download } from './dom.js';
import { STATUSES, touchSong } from '../core/practice-log.js';

const badge = (text, cls = '', title = '') => h('span', { class: `badge ${cls}`, title }, text);

export function mount(el, params, ctx) {
  const root = h('div', { class: 'library' });
  el.appendChild(root);
  let query = '';
  let message = '';
  let pendingImport = null;
  let syncResult = null;
  let alive = true;
  let packs = [];
  let songStatus = {};

  const onGenres = () => renderList();
  window.addEventListener('hub:genres', onGenres);

  async function refresh() {
    ctx.library = await ctx.library.reload();
    packs = await ctx.store.getPacks();
    if (alive) render();
  }

  function say(text) { message = text; if (alive) render(); }

  function render() {
    root.replaceChildren();
    if (!ctx.store || !ctx.library) {
      root.append(h('p', { class: 'err' }, 'The song store could not be opened in this browser.'));
      return;
    }
    root.append(h('h2', { class: 'section' }, 'Song Library'));
    root.append(toolbar());
    if (message) root.append(h('p', { role: 'status' }, message));
    if (pendingImport) root.append(importChoice());
    root.append(h('ul', { class: 'song-list', id: 'song-list' }));
    renderList();
    root.append(notes());
    root.append(contentSettings());
  }

  function toolbar() {
    const search = h('input', { type: 'search', placeholder: 'Search title or artist', 'aria-label': 'Search songs', value: query,
      oninput: (e) => { query = e.target.value; renderList(); } });
    const file = h('input', { type: 'file', hidden: true, accept: '.json,application/json', onchange: onFile });
    return h('div', { class: 'bar' },
      search,
      h('a', { class: 'button primary', href: '#/song/new' }, 'New song'),
      h('button', { type: 'button', onclick: doExport }, 'Export'),
      h('button', { type: 'button', onclick: () => file.click() }, 'Import'),
      file);
  }

  function renderList() {
    const ul = root.querySelector('#song-list');
    if (!ul) return;
    ul.replaceChildren();
    const q = query.trim().toLowerCase();
    const songs = filterByGenre(ctx.library.songs, ctx.settings.genres)
      .filter((s) => !q || `${s.title} ${s.artist}`.toLowerCase().includes(q));
    if (!songs.length) ul.append(h('li', { class: 'muted' }, ctx.library.songs.length ? 'No songs match.' : 'No songs yet. Create one or import a pack.'));
    for (const s of songs) ul.append(songRow(s));
  }

  function songRow(s) {
    const errs = ctx.library.errorsById.get(s.id) ?? [];
    const synced = (s.form ?? []).some((f) => Array.isArray(f.chordTimes));
    const badges = [];
    if (!s.verified) badges.push(badge('unverified', 'warn'));
    if (!synced) badges.push(badge('needs sync', 'warn'));
    if (errs.length) badges.push(badge('has errors', 'warn', errs.join('\n')));
    if ((s.hooks ?? []).length) badges.push(badge('has melody', 'good'));
    const meta = [s.artist, (s.genres ?? []).join(', '), s.key ? `${s.key.tonic} ${s.key.mode}` : ''].filter(Boolean).join(' · ');
    const li = h('li', { class: 'song' },
      h('div', {}, h('h2', {}, s.title ?? '(untitled)'), h('div', { class: 'muted' }, meta), h('div', {}, badges)),
      h('div', { class: 'row' }, statusSelect(s), h('a', { class: 'button', href: `#/song/${encodeURIComponent(s.id)}/edit` }, 'Edit')));
    if (errs.length) {
      const d = h('details', {}, h('summary', {}, 'Errors'), h('ul', {}, errs.map((e) => h('li', { class: 'err' }, e))));
      li.append(d);
    }
    return li;
  }

  function statusSelect(s) {
    const sel = h('select', { class: 'status', 'aria-label': `Status of ${s.title ?? 'song'}`, onchange: async (e) => {
      try {
        songStatus = touchSong(songStatus, s.id, new Date(), e.target.value);
        await ctx.store.set('songStatus', songStatus);
      } catch (err) { say(`Could not save status: ${err.message}`); }
    } }, STATUSES.map((v) => h('option', { value: v }, v)));
    sel.value = songStatus[s.id]?.status ?? 'new';
    return sel;
  }

  function notes() {
    const w = ctx.library.warnings;
    return h('details', { class: 'notes' }, h('summary', {}, `Content notes (${w.length})`),
      w.length ? h('ul', {}, w.map((x) => h('li', { class: 'muted' }, x))) : h('p', { class: 'muted' }, 'Nothing to report.'));
  }

  // ---------- export / import ----------
  async function doExport() {
    try {
      const data = await ctx.store.exportAll();
      download(`keys-n-ears-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(withoutToken(data), null, 2)); // token never goes into a file
    } catch (e) { say(`Export failed: ${e.message}`); }
  }

  async function onFile(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let text;
    try { text = await f.text(); } catch (err) { say(`Could not read the file: ${err.message}`); return; }
    let kind = null;
    try { kind = JSON.parse(text)?.kind; } catch { /* parse functions give the message */ }
    if (kind === 'pack') {
      const r = parsePack(text);
      if (!r.ok) { say(`Import refused: ${r.error}`); return; }
      try {
        await ctx.store.putPack(r.pack);
        await refresh();
        say(`Pack "${r.pack.title ?? r.pack.id}" installed.${r.warnings.length ? ` ${r.warnings.length} warning(s) in Content notes.` : ''}`);
      } catch (err) { say(`Import failed: ${err.message}`); }
      return;
    }
    const r = parseImport(text);
    if (!r.ok) { say(`Import refused: ${r.error}`); return; }
    pendingImport = r.data;
    message = '';
    render();
  }

  function importChoice() {
    const run = async (mode) => {
      const data = pendingImport;
      pendingImport = null;
      try {
        await ctx.store.importAll(keepToken(data, await ctx.store.get('contentSync')), { mode });
        await refresh();
        say(`Backup imported (${mode}).`);
      } catch (err) { say(`Import failed, nothing changed: ${err.message}`); }
    };
    return h('div', { class: 'card' },
      h('p', {}, `This backup has ${pendingImport.songs.length} song(s). Merge adds them to what you have; Replace erases current songs, packs and settings first.`),
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: () => run('merge') }, 'Merge'),
        h('button', { type: 'button', onclick: () => run('replace') }, 'Replace everything'),
        h('button', { type: 'button', onclick: () => { pendingImport = null; render(); } }, 'Cancel')));
  }

  // ---------- content settings ----------
  function contentSettings() {
    const box = h('section', { class: 'panel' }, h('h2', {}, 'Content settings'));
    const owner = h('input', { type: 'text', 'aria-label': 'GitHub owner' });
    const repo = h('input', { type: 'text', 'aria-label': 'GitHub repo', value: 'keys-n-ears-content' });
    const token = h('input', { type: 'password', 'aria-label': 'GitHub token', autocomplete: 'off' });
    const result = h('div', { id: 'sync-result', role: 'status' });
    const showResult = () => {
      result.replaceChildren();
      if (!syncResult) return;
      const r = syncResult;
      if (!r.ran) { result.append(...r.errors.map((x) => h('p', { class: 'err' }, x))); return; }
      result.append(h('p', {}, `Added ${r.added.length}, updated ${r.updated.length}, unchanged ${r.skipped.length}.`),
        ...r.errors.map((x) => h('p', { class: 'err' }, x)));
    };
    ctx.store.get('contentSync').then((c) => {
      if (!c) return;
      owner.value = c.owner ?? ''; repo.value = c.repo || repo.value; token.value = c.token ?? '';
    }).catch(() => {});
    const sync = h('button', { type: 'button', onclick: async () => {
      const cfg = { owner: owner.value.trim(), repo: repo.value.trim(), token: token.value.trim() };
      if (!cfg.owner || !cfg.repo || !cfg.token) {
        syncResult = { ran: false, added: [], updated: [], skipped: [], errors: ['Enter the GitHub owner, repo and token first.'] };
        showResult();
        return;
      }
      await ctx.store.set('contentSync', cfg);
      sync.disabled = true;
      try { syncResult = { ran: true, ...(await syncPacks(cfg, ctx.store)) }; await refresh(); } finally { sync.disabled = false; }
      showResult();
    } }, 'Sync');
    box.append(
      h('div', { class: 'row' },
        h('label', { class: 'field' }, 'GitHub owner', owner),
        h('label', { class: 'field' }, 'Repo', repo),
        h('label', { class: 'field' }, 'Token', token),
        sync),
      result,
      h('h3', {}, 'Installed packs'),
      packList());
    showResult();
    return box;
  }

  function packList() {
    if (!packs.length) return h('p', { class: 'muted' }, 'No packs installed.');
    return h('ul', { class: 'song-list' }, packs.map((r) => {
      const p = r.pack ?? {};
      const hooks = Object.values(p.hooks ?? {}).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
      return h('li', { class: 'song' },
        h('div', {}, h('strong', {}, p.title ?? p.name ?? r.id),
          h('div', { class: 'muted' }, `${p.createdAt ?? 'no date'} · ${(p.songs ?? []).length} songs · ${hooks} hooks`)),
        h('button', { type: 'button', onclick: async () => {
          await ctx.store.deletePack(r.id);
          await refresh();
        } }, 'Remove'));
    }));
  }

  (async () => {
    try { if (ctx.store) { packs = await ctx.store.getPacks(); songStatus = (await ctx.store.get('songStatus')) ?? {}; } } catch { /* render shows an error if the store is missing */ }
    if (alive) render();
  })();

  return () => {
    alive = false;
    window.removeEventListener('hub:genres', onGenres);
  };
}
