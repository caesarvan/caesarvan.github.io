/* Public life summaries. All dates describe the source or the summary, never a live connection. */
export const LIFE_KINDS = Object.freeze({
  family: { title: '家庭协作', kicker: 'FAMILY', description: '生活安排、提醒与待办', icon: 'home' },
  health: { title: '健康与训练', kicker: 'HEALTH', description: '训练记录、计划与资料缺口', icon: 'heart' },
  knowledge: { title: '知识与决策', kicker: 'KNOWLEDGE', description: '正在探索的问题与知识积累', icon: 'book' },
  system: { title: '系统运行状态', kicker: 'SYSTEM', description: '运行证据、归档与改进方向', icon: 'layers' },
});
export const LIFE_STATUS = Object.freeze({
  confirmed: '已确认', needs_verification: '待核实', in_progress: '进行中', pending: '待推进', completed: '已完成',
});
export const lifeEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const lifeText = (value, fallback = '') => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? String(value) : fallback;
const array = value => Array.isArray(value) ? value : [];
const DATA_BASE = new URL('./data/', import.meta.url);
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const zonedDateTime = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i;

function sourceTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  // Date-only sources keep their Shanghai calendar date; unzoned times stay unparsed.
  const parsed = dateOnly.test(value) ? Date.parse(`${value}T00:00:00+08:00`) : zonedDateTime.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : NaN;
}
export function lifeDate(value) {
  if (!value) return '日期未提供';
  if (dateOnly.test(value)) return value;
  const timestamp = sourceTimestamp(value);
  if (!Number.isFinite(timestamp)) return lifeText(value, '日期未提供');
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(timestamp);
}
export function lifeFreshness(value, now = Date.now()) {
  const timestamp = sourceTimestamp(value);
  if (!Number.isFinite(timestamp)) return { label: '来源日期待补', state: 'unknown' };
  if (now - timestamp > 48 * 60 * 60 * 1000) return { label: '来源待更新', state: 'stale' };
  return { label: '48 小时内有来源记录', state: 'recent' };
}
export function lifeIcon(name) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1Z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M3 12h5l2-4 3 8 2-4h6"/>',
    book: '<path d="M12 5v16M3 3h4a7 7 0 0 1 5 2 7 7 0 0 1 5-2h4v16h-4a7 7 0 0 0-5 2 7 7 0 0 0-5-2H3Z"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.layers}</svg>`;
}

export function normalizeLifeData(raw, id) {
  if (!Object.hasOwn(LIFE_KINDS, id) || !raw || raw.id !== id || raw.schemaVersion !== 1 || !['ready', 'partial'].includes(raw.status)) throw Error('摘要格式或模块标识不匹配，请重试。');
  if (!Array.isArray(raw.items) || !Array.isArray(raw.sources)) throw Error('摘要缺少事项或来源清单，请重试。');
  return {
    id, title: lifeText(raw.title, LIFE_KINDS[id].title), summary: lifeText(raw.summary),
    sourceAsOf: lifeText(raw.sourceAsOf), generatedAt: lifeText(raw.generatedAt), cadence: lifeText(raw.cadence, '更新周期未提供'), status: raw.status,
    coverage: { summary: lifeText(raw.coverage?.summary, '来源覆盖说明待补。'), gaps: array(raw.coverage?.gaps).map(v => lifeText(v)).filter(Boolean) },
    sources: raw.sources.map((s, i) => ({ id: lifeText(s?.id, `source-${i}`), label: lifeText(s?.label, '未命名来源'), asOf: lifeText(s?.asOf), kind: lifeText(s?.kind), readStatus: lifeText(s?.readStatus) })),
    metrics: array(raw.metrics).map(m => ({ label: lifeText(m?.label, '摘要指标'), value: lifeText(m?.value, '待补'), unit: lifeText(m?.unit), note: lifeText(m?.note) })),
    items: raw.items.map((item, i) => ({ id: lifeText(item?.id, `item-${i}`), title: lifeText(item?.title, '未命名事项'), summary: lifeText(item?.summary), status: Object.hasOwn(LIFE_STATUS, item?.status) ? item.status : 'needs_verification', date: lifeText(item?.date), sourceId: lifeText(item?.sourceId), tags: array(item?.tags).map(v => lifeText(v)).filter(Boolean) })),
    nextActions: array(raw.nextActions).map(v => lifeText(v) || lifeText(v?.title) || lifeText(v?.summary) || lifeText(v?.action)).filter(Boolean),
    publicScope: lifeText(raw.publicScope, '公开范围说明待补。'),
  };
}
export async function loadLifeData(id, { signal } = {}) {
  if (!Object.hasOwn(LIFE_KINDS, id)) throw Error('未知的生活模块。');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(new URL(`${id}.json`, DATA_BASE), { signal: controller.signal, credentials: 'omit', cache: 'no-cache' });
    if (!response.ok) throw Error(`公开摘要暂时无法读取（HTTP ${response.status}）。`);
    return normalizeLifeData(await response.json(), id);
  } catch (error) {
    if (error?.name === 'AbortError' && !signal?.aborted) throw Error('读取超时，请稍后重试。');
    if (error instanceof SyntaxError) throw Error('摘要文件尚未准备好，请稍后重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function renderCard(data) {
  const esc = lifeEscape, freshness = lifeFreshness(data.sourceAsOf);
  const metrics = data.metrics.slice(0, 2);
  const sourceLabels = [...new Set(data.sources.map(s => s.label))];
  return `<div class="lo-card-content"><div class="lo-state-row"><span class="lo-badge ${data.status === 'partial' ? 'lo-partial' : ''}">${data.status === 'partial' ? '摘要有缺口' : '已有公开摘要'}</span><span class="lo-freshness lo-${freshness.state}">${esc(freshness.label)}</span></div>
    <p class="lo-summary">${esc(data.summary || '摘要说明待补。')}</p>
    ${metrics.length ? `<dl class="lo-metrics">${metrics.map(m => `<div><dt>${esc(m.label)}</dt><dd>${esc(m.value)}${m.unit ? `<small>${esc(m.unit)}</small>` : ''}</dd>${m.note ? `<p>${esc(m.note)}</p>` : ''}</div>`).join('')}</dl>` : ''}
    <ul class="lo-items">${data.items.length ? data.items.slice(0, 2).map(item => `<li><span class="lo-item-state lo-status-${item.status}">${esc(LIFE_STATUS[item.status])}</span><span>${esc(item.title)}</span></li>`).join('') : '<li class="lo-muted">尚未收录可公开事项。</li>'}</ul>
    <details class="lo-coverage"><summary>来源与缺口</summary><p>${esc(data.coverage.summary)}</p>${data.coverage.gaps.length ? `<ul>${data.coverage.gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}<ul class="lo-sources">${data.sources.map(s => `<li>${esc(s.label)} · ${esc(lifeDate(s.asOf))}</li>`).join('')}</ul></details>
    <div class="lo-dates"><span>来源截至 <time>${esc(lifeDate(data.sourceAsOf))}</time></span><span>摘要整理 <time>${esc(lifeDate(data.generatedAt))}</time></span></div>
    <p class="lo-card-note">${esc(sourceLabels.length ? `${sourceLabels.length} 项来源 · ${data.cadence}` : `来源待补 · ${data.cadence}`)}${freshness.state === 'stale' ? ' · 超过 48 小时仅提示待更新，不代表采集失败。' : ''}</p></div>`;
}

/** Mounts only the four registered life modules. Each card has an independent retry. */
export function mountLifeOverview(container, { modules = [] } = {}) {
  if (!container) throw Error('缺少生活摘要容器。');
  const ids = Object.keys(LIFE_KINDS).filter(id => !modules.length || modules.some(m => m.id === id && m.enabled !== false));
  const controller = new AbortController();
  const versions = new Map();
  let destroyed = false;
  container.innerHTML = `<section class="lo-overview" aria-labelledby="lo-heading"><div class="lo-section-heading"><div><p class="lo-eyebrow">LIFE IN PROGRESS</p><h2 id="lo-heading">生活也在持续生长</h2><p>家庭、健康、知识与系统，从已记录的事实继续。</p></div><span class="lo-section-tag">每日整理 · 保留缺口</span></div><div class="lo-grid">${ids.map(id => { const config = LIFE_KINDS[id]; return `<article class="lo-card lo-${id}" data-lo-id="${id}"><div class="lo-card-heading"><span class="lo-icon">${lifeIcon(config.icon)}</span><div><h3>${lifeEscape(config.title)}</h3><p>${lifeEscape(config.description)}</p></div><a class="lo-enter" href="#/${id}" aria-label="查看${lifeEscape(config.title)}详情"><span>查看详情</span><b aria-hidden="true">↗</b></a></div><div class="lo-body" aria-live="polite" aria-busy="true"><p class="lo-loading">正在读取公开摘要…</p></div></article>`; }).join('')}</div><p class="lo-global-note">需求、讨论与计划按各自状态保留；完成以来源中的完成记录为准。摘要整理时间不等于来源更新或自动化运行时间。</p></section>`;
  async function load(id) {
    const version = (versions.get(id) || 0) + 1;
    versions.set(id, version);
    const body = container.querySelector(`[data-lo-id="${id}"] .lo-body`);
    if (!body || destroyed) return;
    body.setAttribute('aria-busy', 'true');
    body.innerHTML = '<p class="lo-loading">正在读取公开摘要…</p>';
    try {
      const data = await loadLifeData(id, { signal: controller.signal });
      if (!destroyed && versions.get(id) === version) body.innerHTML = renderCard(data);
    } catch (error) {
      if (!destroyed && versions.get(id) === version) body.innerHTML = `<div class="lo-error"><strong>这份摘要暂时没有读到</strong><p>${lifeEscape(error?.message || '请检查连接后重试。')}</p><button type="button" data-lo-retry="${id}">重新读取</button></div>`;
    } finally {
      if (!destroyed && versions.get(id) === version) body.setAttribute('aria-busy', 'false');
    }
  }
  const onClick = event => { const button = event.target.closest?.('[data-lo-retry]'); if (button && Object.hasOwn(LIFE_KINDS, button.dataset.loRetry)) load(button.dataset.loRetry); };
  container.addEventListener('click', onClick);
  const ready = Promise.allSettled(ids.map(load));
  return { ready, destroy() { destroyed = true; controller.abort(); container.removeEventListener('click', onClick); container.replaceChildren(); } };
}
