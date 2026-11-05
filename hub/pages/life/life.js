import { LIFE_KINDS, LIFE_STATUS, lifeEscape as esc, lifeText, lifeDate, lifeFreshness, lifeIcon, lifeStatusVisual, loadLifeData } from '../../life-overview.js?v=20261105-collections';

const root = document.documentElement;
const kind = new URLSearchParams(location.search).get('kind') || root.dataset.lifeKind || 'family';
const main = document.getElementById('life-main');
const tabs = document.getElementById('life-tabs');
const state = { filter: 'all', search: '', data: null, controller: null, request: 0, meetingView:'week',meetingWeek:'all',meetingSearch:'' };
const knownKind = Object.hasOwn(LIFE_KINDS, kind);

// The shared embed bridge owns embedded themes. Standalone pages follow the shell preference.
if (!root.dataset.lifeHubEmbed) {
  let theme = '';
  try { theme = localStorage.getItem('life-theme') || localStorage.getItem('life-hub-theme') || ''; } catch { /* Storage can be unavailable. */ }
  root.dataset.theme = theme === 'light' || theme === 'dark' ? theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
tabs.innerHTML = Object.entries(LIFE_KINDS).map(([id, config]) => `<a href="../life/index.html?kind=${id}${root.dataset.lifeHubEmbed ? '&embed=1' : ''}" class="lp-tab lp-${id}${id === kind ? ' active' : ''}"${id === kind ? ' aria-current="page"' : ''}>${lifeIcon(config.icon)}<span>${esc(config.title)}</span></a>`).join('');

function badge(status) { return `<span class="lp-status lp-status-${status}"><i aria-hidden="true"></i>${esc(LIFE_STATUS[status])}</span>`; }
function renderItem(item, data) {
  const sourceIndex = data.sources.findIndex(s => s.id === item.sourceId);
  const source = data.sources[sourceIndex];
  return `<article class="lp-item"><div class="lp-item-top">${badge(item.status)}<time>${esc(lifeDate(item.date))}</time></div><h3>${esc(item.title)}</h3><p>${esc(item.summary || '事项说明待补。')}</p>${item.tags.length ? `<div class="lp-tags">${item.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}<div class="lp-item-source">${source ? `<a href="#life-source-${sourceIndex}">来源：${esc(source.label)} <span aria-hidden="true">↘</span></a>` : '<span>关联来源待补</span>'}${item.status === 'completed' ? '<span>按来源中的完成记录</span>' : ''}</div></article>`;
}
function dateKey(value) {
  if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value||'') || !Number.isFinite(Date.parse(value))) return '';
  return lifeDate(value).slice(0,10).replaceAll('/','-');
}
function timelineVisual(items) {
  const groups=new Map();let missing=0;
  for(const item of items){const day=dateKey(item.date);if(!day){missing++;continue;}if(!groups.has(day))groups.set(day,[]);groups.get(day).push(item);}
  const rows=[...groups].sort(([a],[b])=>a.localeCompare(b));
  return `<div class="lp-chart-heading"><div><p class="lp-eyebrow">RECORDED DATES</p><h2>有日期的事项时间线</h2></div><span class="lp-count">${items.length-missing} 条有日期 · ${missing} 条日期待补</span></div>${rows.length?`<ol class="lp-date-timeline">${rows.map(([day,entries])=>`<li><time>${esc(day)}</time><div><div class="lp-date-marks" aria-label="${esc(day)}共${entries.length}条事项">${entries.map(item=>`<span class="lp-date-mark lp-mark-${item.status}" title="${esc(LIFE_STATUS[item.status])}：${esc(item.title)}"></span>`).join('')}<strong>${entries.length} 条</strong></div>${entries.map(item=>`<p><span>${esc(LIFE_STATUS[item.status])}</span>${esc(item.title)}</p>`).join('')}</div></li>`).join('')}</ol>`:'<div class="lp-chart-empty">当前筛选没有已知日期，不能绘制时间线。</div>'}<p class="lp-chart-note">每个方块对应 1 条已收录事项；颜色与文字共同标明状态。日期来自事项记录，不代表训练、系统采样或会议的连续历史。</p>`;
}
function sourceMatrix(data,items) {
  return `<div class="lp-source-matrix" role="table" aria-label="来源、读取状态、关联事项与来源时间"><div class="lp-matrix-head" role="row"><span role="columnheader">来源与时间</span><span role="columnheader">读取</span><span role="columnheader">事项</span></div>${data.sources.map(source=>{const count=items.filter(item=>item.sourceId===source.id).length,fresh=lifeFreshness(source.asOf);return `<div class="lp-matrix-row" role="row"><span role="cell"><strong>${esc(source.label)}</strong><small>${esc(lifeDate(source.asOf))}</small><em>${esc(fresh.label)}</em></span><span role="cell" class="lp-matrix-state ${source.readStatus==='read'?'lp-read-full':'lp-read-partial'}">${source.readStatus==='read'?'已读':source.readStatus==='partial'?'部分读取':'待核实'}</span><span role="cell" class="lp-matrix-number">${count}<small>条</small></span></div>`;}).join('')}</div><p class="lp-chart-note">“已读”仅描述来源读取，不能代表领域覆盖完整或自动化通过验收。事项数量随筛选变化。</p>`;
}
function tagVisual(items) {
  const counts=new Map();for(const item of items)for(const tag of new Set(item.tags))counts.set(tag,(counts.get(tag)||0)+1);
  const total=[...counts.values()].reduce((a,b)=>a+b,0);
  return `<div class="lp-tag-stats"><strong>${counts.size}<small>个标签</small></strong><strong>${total}<small>次事项标注</small></strong></div><div class="lp-topic-cluster">${[...counts].map(([tag,count])=>`<span>${esc(tag)}<b>${count} 次</b></span>`).join('')||'<p class="lp-muted">当前筛选没有已收录标签。</p>'}</div><p class="lp-chart-note">按事项的不同标签计次；同一事项可属于多个主题，标签次数非互斥，不代表学习进度、熟练度或投入时长。</p>`;
}
function renderVisuals(data,items) {
  const topicKind = ['knowledge','devices','projects','culture'].includes(kind);
  const domainTitle = ({knowledge:'知识主题与来源',health:'健康来源与行动覆盖',system:'系统来源证据矩阵',devices:'设备主题与来源',projects:'项目主题与验证来源',culture:'文化主题与来源'})[kind] || '家庭协作来源';
  document.getElementById('life-visuals').innerHTML=`<div class="lp-visual-grid"><section class="lp-panel lp-status-chart"><div class="lp-chart-heading"><div><p class="lp-eyebrow">ITEM STATUS</p><h2>已收录事项状态</h2></div><span class="lp-count">${items.length} 条</span></div>${lifeStatusVisual(items,{id:'detail-status'})}<p class="lp-chart-note">数量从 0 起算。仅统计当前筛选的已收录事项，不能换算为生活整体完成率。</p></section><section class="lp-panel lp-domain-chart"><div class="lp-chart-heading"><div><p class="lp-eyebrow">${topicKind?'TOPICS & SOURCES':'SOURCE COVERAGE'}</p><h2>${domainTitle}</h2></div></div>${topicKind?tagVisual(items):''}${sourceMatrix(data,items)}${kind==='health'?'<div class="lp-history-gap"><strong>原始健康历史待接入</strong><p>目前只有行动与覆盖记录，没有可用于展示体重、睡眠或训练量趋势的原始时间序列。</p></div>':''}</section></div><section class="lp-panel lp-timeline-panel">${timelineVisual(items)}</section>`;
}
const meetingStatus={minutes_available:'已有纪要',minutes_missing:'纪要待补',scheduled:'已安排'};
function meetingArchive(data) {
  const weeks=[...new Set(data.meetings.map(m=>m.weekOf).filter(Boolean))].sort().reverse();
  return `<section class="lp-panel lp-meeting-archive" aria-labelledby="life-meetings-heading"><div class="lp-chart-heading"><div><p class="lp-eyebrow">FAMILY WEEKLY ARCHIVE</p><h2 id="life-meetings-heading">每周家庭纪要</h2></div><span class="lp-count">${data.meetings.filter(m=>m.status==='minutes_available').length} 份已有纪要</span></div><p class="lp-chart-note">仅展示脱敏纪要与已记录决议。已安排的例会不等于已经召开；无回执的行动保留待核实。</p><div class="lp-archive-controls"><div class="lp-meeting-views" role="group" aria-label="纪要显示方式"><button type="button" data-meeting-view="week" aria-pressed="${state.meetingView==='week'}">按周归档</button><button type="button" data-meeting-view="timeline" aria-pressed="${state.meetingView==='timeline'}">时间线</button></div><label>选择周 <select id="life-meeting-week"><option value="all">全部已收录周</option>${weeks.map(week=>`<option value="${esc(week)}"${state.meetingWeek===week?' selected':''}>${esc(week)} 当周</option>`).join('')}<option value="unknown"${state.meetingWeek==='unknown'?' selected':''}>归档周待补</option></select></label><label class="lp-search"><span class="lp-visually-hidden">搜索纪要、决议与行动</span><input id="life-meeting-search" type="search" placeholder="搜索纪要、决议与行动" value="${esc(state.meetingSearch)}"></label></div><div id="life-meeting-rows"></div></section>`;
}
function renderMeetingRows() {
  const data=state.data,holder=document.getElementById('life-meeting-rows');if(!holder||!data)return;
  const search=state.meetingSearch.trim().toLocaleLowerCase('zh-CN');
  const meetings=data.meetings.filter(m=>(state.meetingWeek==='all'||(state.meetingWeek==='unknown'?!m.weekOf:m.weekOf===state.meetingWeek))&&(!search||[m.title,m.summary,...m.decisions,...m.actions.map(a=>a.title)].join(' ').toLocaleLowerCase('zh-CN').includes(search))).sort((a,b)=>(b.date||b.weekOf||'').localeCompare(a.date||a.weekOf||''));
  document.querySelectorAll('[data-meeting-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.meetingView===state.meetingView)));
  holder.className=`lp-meeting-list lp-meeting-${state.meetingView}`;
  holder.innerHTML=meetings.length?meetings.map(m=>{const source=data.sources.find(s=>s.id===m.sourceId);return `<details class="lp-meeting-card"><summary><span class="lp-meeting-date">${m.weekOf?`${esc(m.weekOf)} 当周`:'归档周待补'}<small>会议日期 ${esc(lifeDate(m.date))}</small></span><span class="lp-meeting-heading"><strong>${esc(m.title)}</strong><small>${m.decisions.length} 项决议 · ${m.actions.length} 项行动</small></span><span class="lp-meeting-status">${meetingStatus[m.status]}</span><b class="lp-meeting-toggle" aria-hidden="true">＋</b></summary><div class="lp-meeting-body">${m.summary?`<p>${esc(m.summary)}</p>`:'<p class="lp-muted">此记录尚无可公开的纪要正文。</p>'}${m.status!=='minutes_available'?'<p class="lp-evidence-note">此条不计入“已有纪要”，会议是否召开及纪要内容仍以来源记录为准。</p>':''}<h3>已记录决议</h3>${m.decisions.length?`<ol>${m.decisions.map(d=>`<li>${esc(d)}</li>`).join('')}</ol>`:'<p class="lp-muted">暂无已收录决议。</p>'}<h3>决议后的行动</h3>${m.actions.length?`<ul class="lp-meeting-actions">${m.actions.map(a=>`<li>${badge(a.status)}<span>${esc(a.title)}<small>期限 ${esc(lifeDate(a.dueDate))}</small></span></li>`).join('')}</ul>`:'<p class="lp-muted">暂无已收录行动。</p>'}<p class="lp-chart-note">来源：${esc(source?.label||'关联来源待补')} · ${esc(lifeDate(source?.asOf))}。仅公开摘要；未展示私人原件。</p></div></details>`;}).join(''):`<div class="lp-empty"><h3>${data.meetings.length?'当前条件没有纪要记录':'尚未收录每周纪要'}</h3><p>${data.meetings.length?'调整周次或搜索关键词继续查看。':'缺少纪要内容，不代表没有开会。后续按周追加脱敏纪要，不从提醒推定会议结果。'}</p></div>`;
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
  renderVisuals(data,filtered);
  list.innerHTML = filtered.length ? filtered.map(item => renderItem(item, data)).join('') : `<div class="lp-empty"><span aria-hidden="true">⌕</span><h3>${data.items.length ? '没有匹配的事项' : '尚未收录可公开事项'}</h3><p>${data.items.length ? '试试其他关键词或状态。' : '没有记录表示资料待补，不能推断为没有安排或活动。'}</p>${data.items.length ? '<button type="button" data-life-reset>清除筛选</button>' : ''}</div>`;
}
function render(data) {
  state.data = data;
  if (state.filter !== 'all' && !data.items.some(item => item.status === state.filter)) state.filter = 'all';
  const config = LIFE_KINDS[kind], freshness = lifeFreshness(data.sourceAsOf);
  const statusButtons = ['all', ...Object.keys(LIFE_STATUS).filter(status => data.items.some(item => item.status === status))];
  const metrics = data.metrics;
  document.title = `${data.title} · Caesar Life OS`;
  main.innerHTML = `<section class="lp-hero"><div class="lp-hero-heading"><span class="lp-hero-icon">${lifeIcon(config.icon)}</span><div><p class="lp-eyebrow">${config.kicker} · ${data.type==='collection'?'CURATED COLLECTION':'LIVING SUMMARY'}</p><h1>${esc(data.title)}</h1></div><span class="lp-snapshot-status">${data.status === 'partial' ? '摘要有缺口' : '已有公开摘要'}</span></div>${data.type==='collection'?'<p class="lp-chart-note">摘要锚点是单一摘要日期；各来源的真实时间分别保留在来源矩阵中，不表示全部来源同时更新。</p>':''}<p class="lp-lede">${esc(data.summary || '摘要说明待补。')}</p><div class="lp-meta"><span>${data.type==='collection'?'摘要锚点':'来源截至'} <time>${esc(lifeDate(data.sourceAsOf))}</time></span><span>摘要整理 <time>${esc(lifeDate(data.generatedAt))}</time></span><span>${esc(data.cadence)}</span><button type="button" data-life-reload>重新读取 <span aria-hidden="true">↻</span></button></div><div class="lp-freshness lp-${freshness.state}"><i aria-hidden="true"></i><span>${esc(freshness.label)}${freshness.state === 'stale' ? ' · 来源截至时间超过 48 小时；仅为展示提示，不代表采集失败。' : ' · 摘要整理时间不代表来源更新或自动化运行时间。'}</span></div></section>
    ${metrics.length ? `<dl class="lp-metrics">${metrics.map(metric => `<div><dt>${esc(metric.label)}</dt><dd>${esc(metric.value)}${metric.unit ? `<small>${esc(metric.unit)}</small>` : ''}</dd>${metric.note ? `<p>${esc(metric.note)}</p>` : ''}</div>`).join('')}</dl>` : ''}
    <div id="life-visuals" class="lp-visuals" aria-label="事项与来源可视化"></div>${kind==='family'?meetingArchive(data):''}
    <div class="lp-layout"><section class="lp-records lp-panel" aria-labelledby="life-records-heading"><div class="lp-panel-heading"><div><p class="lp-eyebrow">RECORDED ITEMS</p><h2 id="life-records-heading">当前记录</h2></div><span class="lp-count">${data.items.length} 条</span></div><p class="lp-evidence-note">“已确认”表示事项或需求已确认；“已完成”按来源中的完成记录标注。讨论、计划与接口连接不会自动计为完成。</p><div class="lp-controls"><div class="lp-filters" role="group" aria-label="按事项状态筛选">${statusButtons.map(status => `<button type="button" data-life-filter="${status}" aria-pressed="${state.filter === status}"${state.filter === status ? ' class="active"' : ''}>${status === 'all' ? '全部' : esc(LIFE_STATUS[status])}<small>${status === 'all' ? data.items.length : data.items.filter(item => item.status === status).length}</small></button>`).join('')}</div><label class="lp-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="lp-visually-hidden">搜索事项、标签或来源</span><input id="life-search" type="search" value="${esc(state.search)}" placeholder="搜索事项、标签或来源" autocomplete="off"><button type="button" data-life-clear aria-label="清空搜索"${state.search ? '' : ' hidden'}>×</button></label></div><p id="life-result-count" class="lp-result-count" role="status" aria-live="polite"></p><div id="life-items" class="lp-items"></div></section>
    <aside class="lp-sidebar"><section class="lp-panel lp-next" aria-labelledby="life-next-heading"><div class="lp-panel-heading"><div><p class="lp-eyebrow">WHAT'S NEXT</p><h2 id="life-next-heading">下一步</h2></div><span class="lp-mini-symbol" aria-hidden="true">↗</span></div>${data.nextActions.length ? `<ol>${data.nextActions.map(action => `<li>${esc(action)}</li>`).join('')}</ol>` : '<p class="lp-muted">下一步尚未提供。</p>'}<p class="lp-side-note">这是待推进方向，执行结果仍需后续证据。</p></section>
    <section class="lp-panel lp-coverage" aria-labelledby="life-coverage-heading"><div class="lp-panel-heading"><div><p class="lp-eyebrow">COVERAGE</p><h2 id="life-coverage-heading">覆盖与缺口</h2></div></div><p>${esc(data.coverage.summary)}</p>${data.coverage.gaps.length ? `<ul>${data.coverage.gaps.map(gap => `<li>${esc(gap)}</li>`).join('')}</ul>` : '<p class="lp-side-note">未列出具体缺口；这不构成完整性验证。</p>'}<div class="lp-scope"><strong>本次公开范围</strong><p>${esc(data.publicScope)}</p></div></section>
    <section class="lp-panel lp-source-panel" aria-labelledby="life-sources-heading"><div class="lp-panel-heading"><div><p class="lp-eyebrow">PROVENANCE</p><h2 id="life-sources-heading">来源记录</h2></div><span class="lp-count">${data.sources.length} 项</span></div><ul class="lp-sources">${data.sources.length ? data.sources.map((source, i) => `<li id="life-source-${i}" tabindex="-1"><div><strong>${esc(source.label)}</strong><span class="lp-read-status">${source.readStatus === 'read' ? '已读来源' : source.readStatus === 'partial' ? '部分读取' : '读取状态待核实'}</span></div>${source.kind ? `<p>${esc(source.kind)}</p>` : ''}<time>来源时间 ${esc(lifeDate(source.asOf))}</time></li>`).join('') : '<li class="lp-muted">来源尚未提供。</li>'}</ul><a class="lp-snapshot-link" href="../../data/${kind}.json" target="_blank" rel="noopener">查看已发布摘要 JSON <span aria-hidden="true">↗</span></a></section></aside></div>`;
  renderItems();
  renderMeetingRows();
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
  if(target.hasAttribute('data-meeting-view')){state.meetingView=target.dataset.meetingView==='timeline'?'timeline':'week';renderMeetingRows();return;}
  if (target.hasAttribute('data-life-filter')) { const filter = target.dataset.lifeFilter; if (filter === 'all' || Object.hasOwn(LIFE_STATUS, filter)) { state.filter = filter; renderItems(); } }
  if (target.hasAttribute('data-life-clear') || target.hasAttribute('data-life-reset')) {
    state.search = '';
    if (target.hasAttribute('data-life-reset')) state.filter = 'all';
    const input = document.getElementById('life-search');
    if (input) { input.value = ''; input.focus(); }
    renderItems();
  }
});
main.addEventListener('input', event => { if (event.target.id === 'life-search') { state.search = event.target.value; renderItems(); } if(event.target.id==='life-meeting-search'){state.meetingSearch=event.target.value;renderMeetingRows();} });
main.addEventListener('change',event=>{if(event.target.id==='life-meeting-week'){state.meetingWeek=event.target.value;renderMeetingRows();}});
window.addEventListener('pagehide', () => state.controller?.abort());
if (knownKind) { root.dataset.lifeKind = kind; load(); }
else { main.setAttribute('aria-busy', 'false'); main.innerHTML = '<section class="lp-error"><h1>未找到这个生活领域</h1><p>请选择上方的家庭、健康、学习或系统。</p><a href="../../#/home">返回生活总览</a></section>'; }
