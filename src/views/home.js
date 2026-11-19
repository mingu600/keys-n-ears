import { minutesOn, recentSongIds } from '../core/practice-log.js';
import { h, put } from './dom.js';

const TILES = [
  { title: 'Song Studio', desc: 'Build and arrange your own songs.' },
  { title: 'Name That Progression', desc: 'Hear it, name the Roman numerals.' },
  { title: 'Melody Echo', desc: 'Listen, then play the melody back.' },
  { title: 'Style Lab', desc: 'Same chords, different genres.' },
  { title: 'Lead Sheet Play-Along', desc: 'Play through a chart with a backing track.' },
  { title: 'Chord Drill', desc: 'Play the chord shown, as fast as you can.', href: '#/drill' },
  { title: 'Progression Explorer', desc: 'Browse common progressions by key.' },
  { title: 'Song Library', desc: 'Your songs and charts.', href: '#/library' },
];

export function mount(el, params, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'home';
  const tiles = TILES.map((t) => {
    const tag = t.href ? 'a' : 'div';
    const attrs = t.href ? `href="${t.href}"` : 'aria-disabled="true"';
    return `<${tag} class="tile${t.href ? '' : ' disabled'}" ${attrs}>
      <h2>${t.title}</h2><p>${t.desc}</p>${t.href ? '' : '<span class="soon">Coming soon</span>'}
    </${tag}>`;
  }).join('');
  wrap.innerHTML = `
    <h2 class="section">Practice</h2>
    <div class="tiles">${tiles}</div>
    <h2 class="section">Recent</h2>`;
  const recent = h('div', { class: 'recent' });
  wrap.append(recent);
  el.appendChild(wrap);

  let alive = true;
  (async () => {
    let status = {};
    try { status = (await ctx?.store?.get('songStatus')) ?? {}; } catch { /* store unavailable: show empty state */ }
    if (!alive) return;
    const songs = ctx?.library?.songs ?? [];
    const rows = recentSongIds(status, 3)
      .map((id) => ({ song: songs.find((s) => s.id === id), info: status[id] }))
      .filter((r) => r.song);
    const mins = minutesOn(ctx?.practiceLog ?? {}, new Date());
    put(recent,
      h('p', {}, `Today: ${mins} min practiced`),
      rows.length
        ? h('ul', { class: 'recent-list' }, rows.map((r) => h('li', {}, `${r.song.title ?? '(untitled)'} `, h('span', { class: 'muted' }, `· ${r.info.status}`))))
        : h('p', { class: 'muted' }, 'Songs you practice will show up here.'));
  })();
  return () => { alive = false; };
}
