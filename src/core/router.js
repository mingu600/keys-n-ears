// Hash router. routes: [[pattern, loader]]; pattern uses :param segments.
// loader() -> Promise<{ mount(el, params, ctx) -> unmount }>.

export function matchRoute(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function createRouter(routes, el, ctx) {
  let unmount = null;
  let token = 0;

  async function render() {
    const my = ++token;
    const raw = location.hash.replace(/^#/, '') || '/';
    const path = raw.split('?')[0];
    let found = null;
    for (const [pattern, loader] of routes) {
      const params = matchRoute(pattern, path);
      if (params) { found = { loader, params }; break; }
    }
    if (!found) {
      navigate('#/');
      return;
    }
    let mod;
    try {
      mod = await found.loader();
    } catch (err) {
      if (my !== token) return;
      el.textContent = `Could not load this page: ${err.message}. Reload the page (Cmd-Shift-R) — the app may have just been updated.`;
      return;
    }
    if (my !== token) return; // a newer navigation superseded this one
    if (unmount) { try { unmount(); } catch (e) { console.error(e); } unmount = null; }
    el.innerHTML = '';
    unmount = mod.mount(el, found.params, ctx) || null;
  }

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash; // hashchange triggers render
  }

  return {
    start() {
      window.addEventListener('hashchange', render);
      render();
    },
    navigate,
  };
}
