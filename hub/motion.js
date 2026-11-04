/* Progressive motion for published facts: no counter substitutions or data changes. */
const STORAGE_KEY = 'lifeos-motion';
const CANDIDATES = '.welcome, .ov-card, .lo-card, .ov-metric strong, .lo-metrics dd, .ov-line-chart, .ov-pnl-chart, .lp-bar-chart, .ov-allocation, .lo-status-stack, [data-motion-reveal]';
const EASE = 'cubic-bezier(.2,.75,.25,1)';

/** Mount once on the stable main element; newly rendered routes are observed automatically. */
export function mountMotion(root = document.querySelector('#main'), { toggle = '[data-motion-toggle]' } = {}) {
  if (!root) return { destroy() {}, setEnabled() {}, get enabled() { return false; } };
  const document = root.ownerDocument;
  const window = document.defaultView;
  const systemPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set();
  const pending = new Set();
  const seen = new WeakSet();
  let destroyed = false;
  let userEnabled = true;
  try { userEnabled = window.localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* Storage is optional. */ }
  const enabled = () => !destroyed && userEnabled && !systemPreference.matches;

  function animate(element, keyframes, options = {}) {
    if (!enabled() || !element.isConnected || typeof element.animate !== 'function') return;
    // A final-state document remains usable if this enhancement is unsupported or fails.
    let animation;
    try { animation = element.animate(keyframes, { duration: 650, easing: EASE, ...options }); }
    catch { return; }
    active.add(animation);
    if (document.hidden) animation.pause();
    const forget = () => active.delete(animation);
    animation.addEventListener('finish', forget, { once: true });
    animation.addEventListener('cancel', forget, { once: true });
  }

  function reveal(element) {
    if (!enabled() || !element.isConnected || seen.has(element)) return;
    seen.add(element);
    if (element.matches('.ov-line-chart')) {
      const paths = [...element.querySelectorAll('path')];
      paths.forEach((path, index) => {
        const stroke = path.getAttribute('stroke');
        // Keep dashed comparisons and separate missing-data segments intact.
        if (!stroke || path.hasAttribute('stroke-dasharray') || typeof path.getTotalLength !== 'function') {
          animate(path, [{ opacity: .18 }, { opacity: 1 }], { duration: 750 });
          return;
        }
        let length;
        try { length = path.getTotalLength(); } catch { return; }
        if (!Number.isFinite(length) || length <= 0) return;
        animate(path, [
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 },
        ], { duration: 1050, delay: Math.min(index * 75, 225) });
      });
      return;
    }
    if (element.matches('.ov-pnl-chart, .lp-bar-chart')) {
      const baseline = Number(element.querySelector('line')?.getAttribute('x1'));
      [...element.querySelectorAll('rect[fill]')].forEach((bar, index) => {
        const growsLeft = Number.isFinite(baseline) && Number(bar.getAttribute('x')) < baseline;
        // Reveal from the zero line, including negative bars; exact geometry never changes.
        animate(bar, [
          { clipPath: growsLeft ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)', opacity: .35 },
          { clipPath: 'inset(0 0 0 0)', opacity: 1 },
        ], { duration: 800, delay: Math.min(index * 55, 275) });
      });
      return;
    }
    if (element.matches('.ov-allocation, .lo-status-stack')) {
      animate(element, [
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0 0 0)' },
      ], { duration: 850 });
      return;
    }
    const isMetric = element.matches('.ov-metric strong, .lo-metrics dd');
    animate(element, [
      { opacity: .3, transform: `translateY(${isMetric ? 5 : 12}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: isMetric ? 500 : 600 });
  }

  const intersection = typeof window.IntersectionObserver === 'function'
    ? new window.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || document.hidden) continue;
        intersection.unobserve(entry.target);
        pending.delete(entry.target);
        reveal(entry.target);
      }
    }, { threshold: .08, rootMargin: '0px 0px -16px 0px' })
    : null;

  function register(element) {
    if (!enabled() || seen.has(element) || pending.has(element)) return;
    if (intersection) { pending.add(element); intersection.observe(element); }
    else reveal(element);
  }
  function scan(node = root) {
    if (!enabled() || node.nodeType !== 1) return;
    if (node.matches(CANDIDATES)) register(node);
    node.querySelectorAll(CANDIDATES).forEach(register);
  }
  function prune() {
    for (const element of pending) {
      if (!element.isConnected) { intersection?.unobserve(element); pending.delete(element); }
    }
    for (const animation of active) {
      if (!animation.effect?.target?.isConnected) { animation.cancel(); active.delete(animation); }
    }
  }
  const mutations = typeof window.MutationObserver === 'function'
    ? new window.MutationObserver(records => {
      prune();
      for (const record of records) for (const node of record.addedNodes) scan(node);
    })
    : null;

  function sync() {
    const full = enabled();
    document.documentElement.dataset.motion = full ? 'full' : 'reduced';
    for (const button of document.querySelectorAll(toggle)) {
      button.setAttribute('aria-pressed', String(full));
      button.setAttribute('aria-label', systemPreference.matches ? '系统已启用减少动态效果' : full ? '关闭图表动效' : '开启图表动效');
      button.textContent = full ? '动效 · 开' : '动效 · 关';
      button.disabled = systemPreference.matches;
      button.title = systemPreference.matches ? '遵循系统的减少动态效果设置' : '控制图表绘制与页面入场动画';
    }
    if (!full) {
      intersection?.disconnect();
      pending.clear();
      for (const animation of active) animation.cancel();
      active.clear();
    } else scan();
    document.dispatchEvent(new window.CustomEvent('lifeos:motionchange', { detail: { enabled: full } }));
  }
  function setEnabled(value) {
    if (destroyed) return;
    userEnabled = Boolean(value);
    try { window.localStorage.setItem(STORAGE_KEY, userEnabled ? 'on' : 'off'); } catch { /* Continue without persistence. */ }
    sync();
  }
  const click = event => {
    if (event.target.closest?.(toggle) && !systemPreference.matches) setEnabled(!userEnabled);
  };
  function visibility() {
    document.documentElement.dataset.pageHidden = String(document.hidden);
    prune();
    for (const animation of active) {
      if (document.hidden) animation.pause();
      else if (enabled()) animation.play();
    }
    if (!document.hidden && enabled()) {
      // Re-observe charts that entered the viewport while the tab was hidden.
      for (const element of pending) { intersection?.unobserve(element); intersection?.observe(element); }
    }
  }
  mutations?.observe(root, { childList: true, subtree: true });
  document.addEventListener('click', click);
  document.addEventListener('visibilitychange', visibility);
  systemPreference.addEventListener?.('change', sync);
  sync();
  visibility();
  return {
    setEnabled,
    get enabled() { return enabled(); },
    destroy() {
      destroyed = true;
      intersection?.disconnect();
      mutations?.disconnect();
      pending.clear();
      for (const animation of active) animation.cancel();
      active.clear();
      document.removeEventListener('click', click);
      document.removeEventListener('visibilitychange', visibility);
      systemPreference.removeEventListener?.('change', sync);
    },
  };
}
