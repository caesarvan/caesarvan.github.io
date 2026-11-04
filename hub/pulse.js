/* Snapshot-backed visual summary. Counts describe recorded items, never a life score. */
import { loadLifeData, lifeDate, lifeEscape as esc, lifeIcon, LIFE_KINDS, LIFE_STATUS } from './life-overview.js?v=20261105-colour';

const DOMAIN = Object.freeze({
  family: { color: '#c84c37', soft: '#fff0e9', label: 'FAMILY' },
  health: { color: '#00866d', soft: '#e6faf3', label: 'HEALTH' },
  knowledge: { color: '#7944dd', soft: '#f1ebff', label: 'KNOWLEDGE' },
  system: { color: '#3266d6', soft: '#eaf3ff', label: 'SYSTEM' },
});
const STATES = Object.freeze([
  { id: 'completed', color: '#00866d' },
  { id: 'confirmed', color: '#4284ed' },
  { id: 'in_progress', color: '#9863ec' },
  { id: 'needs_verification', color: '#e6a338' },
  { id: 'pending', color: '#96a2bb' },
]);
const count = (data, status) => data.items.filter(item => item.status === status).length;
const fmt = number => new Intl.NumberFormat('zh-CN').format(number);

function ring(rows, selected) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const radius = 78, length = 2 * Math.PI * radius;
  let offset = 0;
  const segments = rows.map(row => {
    const part = total ? row.count / total * length : 0;
    const gap = part > 3 ? 3 : 0;
    const circle = row.count ? `<circle class="pulse-ring-segment${selected && selected !== row.id ? ' is-dimmed' : ''}" cx="110" cy="110" r="${radius}" fill="none" stroke="${row.color}" stroke-width="20" stroke-dasharray="${Math.max(0, part - gap)} ${length}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"><title>${esc(LIFE_STATUS[row.id])} ${row.count} 条</title></circle>` : '';
    offset += part;
    return circle;
  }).join('');
  return `<svg class="pulse-ring" viewBox="0 0 220 220" role="img" aria-label="${esc(total ? rows.map(row => `${LIFE_STATUS[row.id]}${row.count}条`).join('，') : '尚无已读取的事项数据')}"><circle cx="110" cy="110" r="${radius}" fill="none" stroke="#ffffff12" stroke-width="20"/>${segments}</svg>`;
}

/** Independent loading, retry and cancellation; source snapshots are read-only. */
export function mountPulse(container, { modules = [] } = {}) {
  if (!container) throw Error('缺少生活脉冲容器。');
  const ids = Object.keys(DOMAIN).filter(id => !modules.length || modules.some(module => module.id === id && module.enabled !== false));
  const controller = new AbortController(), records = new Map(), versions = new Map();
  let selected = null, destroyed = false;
  container.classList.add('pulse-dashboard');
  if (!ids.length) { container.replaceChildren(); return { ready: Promise.resolve(), destroy() { controller.abort(); } }; }

  function renderDomain(id) {
    const state = records.get(id), kind = LIFE_KINDS[id], domain = DOMAIN[id];
    const heading = `<a class="pulse-domain-link" href="#/${id}" aria-label="查看${esc(kind.title)}"><span class="pulse-domain-icon">${lifeIcon(kind.icon)}</span><span><small>${domain.label}</small><strong>${esc(kind.title)}</strong></span><span class="pulse-domain-arrow" aria-hidden="true">↗</span></a>`;
    let body;
    if (!state || state.loading) body = '<div class="pulse-domain-loading" role="status"><span class="pulse-skeleton"></span><span class="pulse-skeleton"></span><p>正在读取已发布摘要…</p></div>';
    else if (state.error) body = `<div class="pulse-domain-error" role="status"><strong>摘要暂未读到</strong><p>${esc(state.error)}</p><button type="button" data-pulse-retry="${id}">重新读取 ↻</button></div>`;
    else {
      const data = state.data, total = data.items.length;
      const shown = selected ? count(data, selected) : total;
      const description = selected ? LIFE_STATUS[selected] : '已收录事项';
      body = `<div class="pulse-domain-count"><strong>${fmt(shown)}<small>条</small></strong><span>${esc(description)}</span><span class="pulse-domain-badge">${data.status === 'partial' ? '摘要有缺口' : '已有摘要'}</span></div>
        <div class="pulse-domain-stack" role="img" aria-label="${esc(STATES.map(status => `${LIFE_STATUS[status.id]}${count(data, status.id)}条`).join('，'))}">${total ? STATES.filter(status => count(data, status.id)).map(status => `<span class="${selected && selected !== status.id ? 'is-dimmed' : ''}" style="flex:${count(data, status.id)};background:${status.color}" title="${esc(LIFE_STATUS[status.id])} ${count(data, status.id)}条"></span>`).join('') : '<span class="pulse-stack-empty"></span>'}</div>
        <p class="pulse-domain-observation">${esc(data.items[0]?.title || data.summary || '尚未收录可公开事项。')}</p>
        <p class="pulse-domain-date">来源截至 <time>${esc(lifeDate(data.sourceAsOf))}</time></p>`;
    }
    return `<article class="pulse-domain pulse-domain-${id}" style="--pulse-domain:${domain.color};--pulse-soft:${domain.soft}" ${state?.loading ? 'aria-busy="true"' : ''}>${heading}${body}</article>`;
  }

  function render() {
    if (destroyed) return;
    const loaded = ids.flatMap(id => records.get(id)?.data ? [records.get(id).data] : []);
    const rows = STATES.map(status => ({ ...status, count: loaded.reduce((sum, data) => sum + count(data, status.id), 0) }));
    const total = rows.reduce((sum, row) => sum + row.count, 0), shown = selected ? rows.find(row => row.id === selected).count : total;
    const pending = ids.filter(id => !records.get(id) || records.get(id).loading).length;
    const failed = ids.filter(id => records.get(id)?.error).length;
    const coverage = loaded.length === ids.length ? (ids.length === 4 ? '四域公开摘要' : `${ids.length} 个领域摘要`) : `已读 ${loaded.length}/${ids.length} 个领域${failed ? ` · ${failed} 项读取失败` : pending ? ' · 其余读取中' : ''}`;
    const focus = container.querySelector(':focus')?.dataset?.pulseState;
    container.innerHTML = `<section class="pulse-layout" aria-label="生活脉冲，收录事项状态图表">
      <div class="pulse-feature"><div class="pulse-feature-heading"><div><p class="pulse-kicker"><span></span> LIFE PULSE</p><h2>让生活，有迹可循。</h2></div><span class="pulse-snapshot">已发布快照</span></div>
        <div class="pulse-feature-core"><div class="pulse-orbit">${ring(rows, selected)}<div class="pulse-ring-center" role="status" aria-live="polite"><strong>${loaded.length ? fmt(shown) : '—'}</strong><span>${esc(selected ? LIFE_STATUS[selected] : '已收录事项')}</span><small>${esc(coverage)}</small></div></div>
        <div class="pulse-feature-copy"><p class="pulse-feature-label">每一种状态，都值得被看见</p><p>沿着家庭、健康、知识与系统，<br>看见已记录的进展与待办。</p><span class="pulse-chart-hint">点击图例，聚焦一种状态 ↓</span></div></div>
        <div class="pulse-legend" aria-label="聚焦事项状态">${rows.map(row => `<button type="button" data-pulse-state="${row.id}" aria-pressed="${selected === row.id}" class="${selected === row.id ? 'is-selected' : ''}"><i style="background:${row.color}"></i><span>${esc(LIFE_STATUS[row.id])}</span><strong>${loaded.length ? fmt(row.count) : '—'}</strong></button>`).join('')}</div>
        <p class="pulse-feature-note">仅统计已读取摘要中的事项状态，${loaded.length < ids.length ? '读取未完成的领域不计为 0。' : '不表示生活整体完成率。'}<span>各领域来源日期分别保留 · 非实时连接</span></p>
      </div>
      <div class="pulse-domains">${ids.map(renderDomain).join('')}</div>
    </section>`;
    if (focus) container.querySelector(`[data-pulse-state="${focus}"]`)?.focus({ preventScroll: true });
  }

  async function load(id) {
    const version = (versions.get(id) || 0) + 1;
    versions.set(id, version);
    records.set(id, { loading: true });
    render();
    try {
      const data = await loadLifeData(id, { signal: controller.signal });
      if (!destroyed && versions.get(id) === version) records.set(id, { data });
    } catch (error) {
      if (!destroyed && versions.get(id) === version) records.set(id, { error: error?.message || '摘要读取失败，请稍后重试。' });
    } finally {
      if (!destroyed && versions.get(id) === version) render();
    }
  }
  const click = event => {
    const retry = event.target.closest?.('[data-pulse-retry]');
    if (retry && ids.includes(retry.dataset.pulseRetry)) { load(retry.dataset.pulseRetry); return; }
    const button = event.target.closest?.('[data-pulse-state]');
    if (button && STATES.some(status => status.id === button.dataset.pulseState)) { selected = selected === button.dataset.pulseState ? null : button.dataset.pulseState; render(); }
  };
  container.addEventListener('click', click);
  render();
  const ready = Promise.allSettled(ids.map(load));
  return { ready, destroy() { destroyed = true; controller.abort(); container.removeEventListener('click', click); container.replaceChildren(); } };
}
