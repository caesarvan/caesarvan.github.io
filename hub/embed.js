/* Shared shell bridge. Standalone URLs keep their original navigation. */
(() => {
  'use strict';
  const script = document.currentScript;
  const hub = new URL('./', script?.src || new URL('../../embed.js', location.href));
  let embedded = false;
  try {
    embedded = parent !== window && parent.location.origin === location.origin &&
      new URLSearchParams(location.search).get('embed') === '1';
  } catch { /* A page embedded on another origin keeps its standalone view. */ }
  if (!embedded) return;

  const root = document.documentElement;
  const path = location.pathname.slice(hub.pathname.length);
  const page = /^pages\/([^/]+)\//.exec(path)?.[1];
  const fileKinds = new Set(['icloud', 'onedrive', 'outlook', 'mail', 'youtube']);
  const requestedKind = new URLSearchParams(location.search).get('kind');
  let moduleId = page === 'files' ? fileKinds.has(requestedKind) ? requestedKind : 'icloud' : page || '';
  root.dataset.lifeHubEmbed = 'true';
  root.dataset.lifeHubModule = moduleId;

  // The registry defines allowed destinations; built-ins cover clicks before it loads.
  let modules = ['finance', 'webank', 'investment', 'travel', 'profile'].map(id => ({
    id, href: `./pages/${id}/index.html`, type: 'page', enabled: true
  })).concat([...fileKinds].map(id => ({
    id, href: `./pages/files/index.html?kind=${id}`, type: 'page', enabled: true
  })));
  fetch(new URL('modules.json', hub), { credentials: 'omit' })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (data?.version === 1 && Array.isArray(data.modules)) {
        modules = data.modules.filter(item => item.enabled && typeof item.id === 'string' && typeof item.href === 'string');
      }
    }).catch(() => { /* Existing entrypoints remain usable if the registry is unavailable. */ });

  function destination(url) {
    if (url.origin !== location.origin) return null;
    if ((url.pathname === hub.pathname || url.pathname === `${hub.pathname}index.html`) && url.hash.startsWith('#/')) {
      let id;
      try { id = decodeURIComponent(url.hash.slice(2)); } catch { return null; }
      return id === 'home' || modules.some(item => item.id === id) ? id : null;
    }
    for (const item of modules) {
      if (item.type !== 'page') continue;
      const entry = new URL(item.href, hub);
      if (entry.origin !== url.origin) continue;
      const directory = entry.pathname.slice(0, entry.pathname.lastIndexOf('/') + 1);
      if (!url.pathname.startsWith(directory)) continue;
      if (entry.searchParams.has('kind') && entry.searchParams.get('kind') !== (url.searchParams.get('kind') || 'icloud')) continue;
      return item.id;
    }
    return null;
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank') return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch { return; }
    const target = destination(url);
    if (!target) return;
    const shellLink = url.pathname === hub.pathname || url.pathname === `${hub.pathname}index.html`;
    if (target !== moduleId || shellLink) {
      event.preventDefault();
      parent.postMessage({ type: 'life-hub:navigate', module: target, href: url.href }, location.origin);
      return;
    }
    // Same-module tabs and local anchors continue within the embedded page.
    // Carry embed mode across profile subpages without dropping language or section.
    url.searchParams.set('embed', '1');
    anchor.href = url.href;
    if (anchor.target === '_top' || anchor.target === '_parent') anchor.target = '_self';
  }, true);

  function applyTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return;
    root.dataset.theme = theme;
    root.dataset.colorScheme = theme;
    window.dispatchEvent(new CustomEvent('life-hub:theme', { detail: { theme } }));
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'life-hub:theme') applyTheme(event.data.theme);
  });
  try { applyTheme(parent.document.documentElement.dataset.theme); } catch { /* Same-origin check above is the gate. */ }

  let frame = 0, previousHeight = 0;
  function reportHeight() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const body = document.body;
      if (!body) return;
      const height = Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height));
      if (height < 1 || Math.abs(height - previousHeight) < 2) return;
      previousHeight = height;
      parent.postMessage({ type: 'life-hub:height', module: moduleId, height }, location.origin);
    });
  }
  function ready() {
    // Business tabs stay available after the app collapses its standalone topbar.
    const revealBusinessTabs = () => {
      document.querySelectorAll('.dashboard-tabs-collapse').forEach(tabs => {
        if (tabs.getAttribute('aria-hidden') !== 'false') tabs.setAttribute('aria-hidden', 'false');
        if (tabs.hasAttribute('inert')) tabs.removeAttribute('inert');
      });
      reportHeight();
    };
    const observer = new MutationObserver(revealBusinessTabs);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'inert', 'class'] });
    if ('ResizeObserver' in window) new ResizeObserver(reportHeight).observe(document.body);
    window.addEventListener('resize', reportHeight);
    window.addEventListener('load', reportHeight);
    document.fonts?.ready.then(reportHeight);
    revealBusinessTabs();
    parent.postMessage({ type: 'life-hub:ready', module: moduleId }, location.origin);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
