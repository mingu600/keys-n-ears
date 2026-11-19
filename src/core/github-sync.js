// Pull content packs from a GitHub repo's packs/ folder into the store. Pure apart from the injected fetch.
import { parsePack } from '../library/library.js';

export async function syncPacks({ owner, repo, token }, store, fetchFn = fetch) {
  const out = { added: [], updated: [], skipped: [], errors: [] };
  const headers = (accept) => ({ Authorization: `Bearer ${token}`, Accept: accept });
  let list;
  try {
    const res = await fetchFn(`https://api.github.com/repos/${owner}/${repo}/contents/packs`,
      { headers: headers('application/vnd.github+json') });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      out.errors.push('Token rejected or repo not found');
      return out;
    }
    if (!res.ok) { out.errors.push(`GitHub returned HTTP ${res.status}`); return out; }
    list = await res.json();
  } catch (e) {
    out.errors.push(`Could not reach GitHub: ${e.message}`);
    return out;
  }
  if (!Array.isArray(list)) { out.errors.push('packs is not a folder'); return out; }
  const stored = await store.getPacks();
  for (const f of list) {
    if (!f || f.type === 'dir' || !String(f.name).endsWith('.json')) continue;
    if (stored.some(r => r.sha && r.sha === f.sha)) { out.skipped.push(f.name); continue; }
    try {
      const res = await fetchFn(f.url, { headers: headers('application/vnd.github.raw+json') });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parsePack(await res.text());
      if (!parsed.ok) throw new Error(parsed.error);
      const existed = stored.some(r => r.id === parsed.pack.id);
      await store.putPack(parsed.pack, f.sha);
      (existed ? out.updated : out.added).push(f.name);
    } catch (e) {
      out.errors.push(`${f.name}: ${e.message}`);
    }
  }
  return out;
}
