import { LIFE_KINDS, LIFE_STATUS, lifeEscape as esc, lifeText, lifeDate, lifeFreshness, lifeIcon, loadLifeData } from '../../life-overview.js?v=20261104';

const root = document.documentElement;
const kind = new URLSearchParams(location.search).get('kind') || 'family';
const main = document.getElementById('life-main');
const tabs = document.getElementById('life-tabs');
const state = { filter: 'all', search: '', data: null, controller: null, request: 0 };
const knownKind = Object.hasOwn(LIFE_KINDS, kind);

// The shared embed bridge owns embedded themes. Standalone pages follow the shell preference.
if (!root.dataset.lifeHubEmbed) {
  let theme = '';
  try { theme = localStorage.getItem('life-theme') || localStorage.getItem('life-hub-theme') || ''; } catch { /* Storage can be unavailable. */ }
  root.dataset.theme = theme === 'light' || theme === 'dark' ? theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
tabs.innerHTML = Object.entries(LIFE_KINDS).map(([id, config]) => `<a href="./index.html?kind=${id}${root.dataset.lifeHubEmbed ? '&embed=1' : ''}" class="lp-tab lp-${id}${id === kind ? ' active' : ''}"${id === kind ? ' aria-current="page"' : ''}>${lifeIcon(config.icon)}<span>${esc(config.title)}</span></a>`).join('');

function badge(status) { return `<span class="lp-status lp-status-${status}"><i aria-hidden="true"></i>${esc(LIFE_STATUS[status])}</span>`; }
function renderItem(item, data) {
  const sourceIndex = data.sources.findIndex(s => s.id === item.sourceId);
  const source = data.sources[sourceIndex];
  return `<article class="lp-item"><div class="lp-item-top">${badge(item.status)}<time>${esc(lifeDate(item.date))}</time></div><h3>${esc(item.title)}</h3><p>${esc(item.summary || '事项说明待补。')}</p>${item.tags.length ? `<div class="lp-tags">${item.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}<div class="lp-item-source">${source ? `<a href="#life-source-${sourceIndex}">来源：${esc(source.label)} <span aria-hidden="true">↘</span></a>` : '<span>关联来源待补</span>'}${item.status === 'completed' ? '<span>按来源中的完成记录</span>' : ''}</div></article>`;
}
function renderItems() {
  const data = state.data;
  if (!data) return;
  const search = state.search.trim().toLocaleLowerCase('zh-CN');
  const filtered = data.items.filter(item => {
    if (state.filter !== 'all' && item.status !== state.filter) return false;
    const source = data.sources.find(s => s.id === item.sourceId);
    return !search || [item.title, item.summary, item.date, LIFE_STATUS[item.status], ...item.tags, source?.label || ''].join(' ').toLocaleLowerCase('zh-CN').includes(search);
  });
  const list = document.getElementById('life-items');
  document.getElementById('life-result-count').textContent = `显示 ${filtered.length} / ${data.items.length} 条已收录事项`;
  document.querySelectorAll('[data-life-filter]').forEach(button => { const active = button.dataset.lifeFilter === state.filter; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  const clear = document.querySelector('[data-life-clear]');
  if (clear) clear.hidden = !state.search;
  list.innerHTML = filtered.length ? filtered.map(item => renderItem(item, data)).join('') : `<div class="lp-empty"><span aria-hidden="true">⌕</span><h3>${data.items.length ? '没有匹配的事项' : '尚未收录可公开事项'}</h3><p>${data.items.length ? '试试其他关键词或状态。' : '没有记录表示资料待补，不能推断为没有安排或活动。'}</p>${data.items.length ? '<button type="button" data-life-reset>清除筛选</button>' : ''}</div>`;
}
function render(data) {
  state.data = data;
  if (state.filter !== 'all' && !data.items.some(item => item.status === state.filter)) state.filter = 'all';
  const config = LIFE_KINDS[kind], freshness = lifeFreshness(data.sourceAsOf);
  const statusButtons = ['all', ...Object.keys(LIFE_STATUS).filter(status => data.items.some(item => item.status === status))];
  const metrics = data.metrics;
  document.title = `${data.title} · Caesar Life OS`;
  main.innerHTML = `<section class="lp-hero"><div class="lp-hero-heading"><span class="lp-hero-icon">${lifeIcon(config.icon)}</span><div><p class="lp-eyebrow">${config.kicker} · LIVING SUMMARY</p><h1>${esc(data.title)}</h1></div><span class="lp-snapshot-status">${data.status === 'partial' ? '摘要有缺口' : '已有公开摘要'}</span></div><p class="lp-lede">${esc(data.summary || '摘要说明待补。')}</p><div class="lp-meta"><span>来源截至 <time>${esc(lifeDate(data.sourceAsOf))}</time></span><span>摘要整理 <time>${esc(lifeDate(data.generatedAt))}</time></span><span>${esc(data.cadence)}</span><button type="button" data-life-reload>重新读取 <span aria-hidden="true">↻</span></button></div><div class="lp-freshness lp-${freshness.state}"><i aria-hidden="true"></i><span>${esc(freshness.label)}${freshness.state === 'stale' ? ' · 来源截至时间超过 48 小时；仅为展示提示，不代表采集失败。' : ' · 摘要整理时间不代表来源更新或自动化运行时间。'}</span></div></section>
    ${metrics.length ? `<dl class="lp-metrics">${metrics.map(metric => `<div><dt>${esc(metric.label)}</dt><dd>${esc(metric.value)}${metric.unit ? `<small>${esc(metric.unit)}</small>` : ''}</dd>${metric.note ? `<p>${esc(metric.note)}</p>` : ''}</div>`).join('')}</dl>` : ''}
    <div class="lp-layout"><section class="lp-records lp-panel" aria-labelledby="life-records-heading"><div class="lp-panel-heading"><div><p class="lp-eyebrow">RECORDED ITEMS</p><h2 id="life-records-heading">当前记录</h2></div><span class="lp-count">${data.items.length} 条</span></div><p class="lp-evidence-note">“已确认”表示事项或需求已确认；“已完成”按来源中的完成记录标注。讨论、计划与接口连接不会自动计为完成。</p><div class="lp-controls"><div class="lp-filters" role="group" aria-label="按事项状态筛选">${statusButtons.map(status => `<button type="button" data-life-filter="${status}" aria-pressed="${state.filter === status}"${state.filter === status ? ' class="active"' : ''}>${status === 'all' ? '全部' : esc(LIFE_STATUS[status])}<small>${status === 'all' ? data.items.length : data.items.filter(item => item.status === status).length}</small></button>`).join('')}</div><label class="lp-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="lp-visually-hidden">搜索事项、标签或来源</span><input id="life-search" type="search" value="${esc(state.search)}" placeholder="搜索事项、标签或来源" autocomplete="off"><button type="button" data-life-clear aria-label="清空搜索"${state.search ? '' : ' hidden'}>×</button></label></div><p id="life-result-count" class="lp-result-count" role="status" aria-live="polite"></p><div id="life-items" class="lp-items"></div></section>
    <aside class="lp-sidebar"><section class="lp-panel lp-next" aria-labelledby="life-next-heading"><div class="lp-panel-heading"><div><p class="lp-eyebrow">WHAT'S NEXT</p><h2 id="life-next-heading">下一步</h2></div><span class="lp-mini-symbol" aria-hidden="true">↗</span></div>${data.nextActions.length ? `<ol>${data.nextActions.map(action => `<li>${esc(action)}</li>`).join('')}</ol>` : '<p class="lp-muted">下一步尚未提供。</p>'}<p class="lp-side-note">这是待推进方向，执行结果仍需后续证据。</p></section>
    <section class="lp-panel lp-coverage" aria-labelledby="life-coverage-heading"><div class="lp-panel-heading"><div><p class="lp-eyebrow">COVERAGE</p><h2 id="life-coverage-heading">覆盖与缺口</h2></div></div><p>${esc(data.coverage.summary)}</p>${data.coverage.gaps.length ? `<ul>${data.coverage.gaps.map(gap => `<li>${esc(gap)}</li>`).join('')}</ul>` : '<p class="lp-side-note">未列出具体缺口；这不构成完整性验证。</p>'}<div class="lp-scope"><strong>本次公开范围</strong><p>${esc(data.publicScope)}</p></div></section>
    <section class="lp-panel lp-source-panel" aria-labelledby="life-sources-heading"><div class="lp-panel-heading"><div><p class="lp-eyebrow">PROVENANCE</p><h2 id="life-sources-heading">来源记录</h2></div><span class="lp-count">${data.sources.length} 项</span></div><ul class="lp-sources">${data.sources.length ? data.sources.map((source, i) => `<li id="life-source-${i}" tabindex="-1"><div><strong>${esc(source.label)}</strong><span class="lp-read-status">${source.readStatus === 'read' ? '已读来源' : source.readStatus === 'partial' ? '部分读取' : '读取状态待核实'}</span></div>${source.kind ? `<p>${esc(source.kind)}</p>` : ''}<time>来源时间 ${esc(lifeDate(source.asOf))}</time></li>`).join('') : '<li class="lp-muted">来源尚未提供。</li>'}</ul><a class="lp-snapshot-link" href="../../data/${kind}.json" target="_blank" rel="noopener">查看已发布摘要 JSON <span aria-hidden="true">↗</span></a></section></aside></div>`;
  renderItems();
}
async function load() {
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const request = ++state.request;
  main.setAttribute('aria-busy', 'true');
  const reload = main.querySelector('[data-life-reload]');
  if (reload) { reload.disabled = true; reload.textContent = '正在重新读取…'; }
  else main.innerHTML = '<div class="lp-loading" role="status"><span class="lp-loading-mark" aria-hidden="true"></span><h1>正在读取生活摘要</h1><p>从已发布的来源继续。</p></div>';
  try {
    const data = await loadLifeData(kind, { signal: controller.signal });
    if (request === state.request) render(data);
  } catch (error) {
    if (controller.signal.aborted || request !== state.request) return;
    main.innerHTML = `<section class="lp-error" role="alert"><span class="lp-error-symbol" aria-hidden="true">↻</span><p class="lp-eyebrow">SUMMARY UNAVAILABLE</p><h1>这份摘要暂时没有读到</h1><p>${esc(error?.message || '请检查连接后重试。')}</p><p class="lp-muted">读取失败不会被视为没有数据或运行正常。</p><button class="lp-primary-button" type="button" data-life-reload>重新读取</button><a href="../../#/home">返回生活总览</a></section>`;
  } finally { if (request === state.request) main.setAttribute('aria-busy', 'false'); }
}
main.addEventListener('click', event => {
  const target = event.target.closest?.('button');
  if (!target) return;
  if (target.hasAttribute('data-life-reload')) { load(); return; }
  if (target.hasAttribute('data-life-filter')) { const filter = target.dataset.lifeFilter; if (filter === 'all' || Object.hasOwn(LIFE_STATUS, filter)) { state.filter = filter; renderItems(); } }
  if (target.hasAttribute('data-life-clear') || target.hasAttribute('data-life-reset')) {
    state.search = '';
    if (target.hasAttribute('data-life-reset')) state.filter = 'all';
    const input = document.getElementById('life-search');
    if (input) { input.value = ''; input.focus(); }
    renderItems();
  }
});
main.addEventListener('input', event => { if (event.target.id === 'life-search') { state.search = event.target.value; renderItems(); } });
window.addEventListener('pagehide', () => state.controller?.abort());
if (knownKind) { root.dataset.lifeKind = kind; load(); }
else { main.setAttribute('aria-busy', 'false'); main.innerHTML = '<section class="lp-error"><h1>未找到这个生活领域</h1><p>请选择上方的家庭、健康、学习或系统。</p><a href="../../#/home">返回生活总览</a></section>'; }
