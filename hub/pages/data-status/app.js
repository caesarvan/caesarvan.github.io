const HUB = new URL('../../', import.meta.url);
const RELATED_MODULES = { 'household-budget': ['household-budget', 'finance'] };
const LABELS = { finance: '历史财务查询快照', 'finance-unified': '统一财务账库', 'household-budget': '家庭财务与共同预算', webank: '微众资产快照', investment: '投资账户与持仓', travel: '旅行快照', icloud: 'iCloud 资料索引', onedrive: 'OneDrive 资料索引', outlook: 'Outlook 附件索引', mail: '邮件归档索引', youtube: 'YouTube 收藏', family: '家庭协作摘要', health: '健康与训练摘要', knowledge: '知识与决策摘要', system: '系统运行摘要', devices: '设备与家庭科技', projects: '项目与实验', culture: '灵感与文化清单' };
const TYPE_LABELS = { snapshot: '业务快照', ledger: '账库记录', index: '资料索引', digest: '有限摘要', collection: '有限专题' };
const PALETTE = ['#c84c37', '#007f6c', '#7944dd', '#3266d6', '#a7660a'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function displayTime(value) {
  if (typeof value !== 'string') return '未单独登记';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return '未单独登记';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未单独登记';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function catalogModel(catalog, registry) {
  if (catalog?.version !== 1 || !Array.isArray(catalog.datasets) || registry?.version !== 1 || !Array.isArray(registry.modules)) throw new Error('Invalid registry');
  const modules = registry.modules.filter(m => m.enabled && typeof m.id === 'string');
  const ids = new Set();
  const datasets = catalog.datasets.map((entry, index) => {
    if (!entry || typeof entry.id !== 'string' || ids.has(entry.id)) throw new Error('Invalid dataset id');
    ids.add(entry.id);
    const linkedIds = new Set(RELATED_MODULES[entry.id] || [entry.id]);
    const linked = modules.filter(m => linkedIds.has(m.id));
    const loadable = entry.status === 'ready';
    const coverage = entry.coverage === 'partial' ? 'partial' : entry.coverage === 'ready' ? 'ready' : 'unspecified';
    const title = LABELS[entry.id] || linked[0]?.title || entry.id;
    return { ...entry, title, loadable, coverage, gap: !loadable || coverage !== 'ready', linked, color: PALETTE[index % PALETTE.length], records: Number.isSafeInteger(entry.records) && entry.records >= 0 ? entry.records : null };
  });
  return { datasets, staticModules: modules.filter(m => m.mode === 'static' && !ids.has(m.id)), counts: { total: datasets.length, loadable: datasets.filter(d => d.loadable).length, partial: datasets.filter(d => d.coverage === 'partial').length, unavailable: datasets.filter(d => !d.loadable).length } };
}

export function filteredDatasets(model, filter, query) {
  const term = String(query || '').trim().toLocaleLowerCase();
  return model.datasets.filter(d => (filter === 'all' || filter === 'gaps' && d.gap || filter === 'loadable' && d.loadable) && (!term || [d.id, d.title, TYPE_LABELS[d.type], ...d.linked.map(m => m.title)].join(' ').toLocaleLowerCase().includes(term)));
}

function link(module) {
  return `<a class="ds-open" href="${esc(new URL(`./#/${encodeURIComponent(module.id)}`, HUB).href)}">${esc(module.title)} <span aria-hidden="true">↗</span></a>`;
}

function renderCard(d) {
  const type = TYPE_LABELS[d.type] || '公开数据';
  const coverageText = d.coverage === 'partial' ? '部分覆盖' : d.coverage === 'ready' ? '已登记覆盖' : '范围待说明';
  const reason = !d.loadable ? d.reason || '目录未声明该快照可载入，保留待取得状态。' : d.coverage === 'partial' ? '目录声明部分覆盖，详细缺口与逐源日期请进入对应模块查看。' : d.coverage === 'unspecified' ? '目录尚未单独登记业务覆盖程度；不能把可载入解释为全部完整。' : '按来源声明的范围展示，完整性与实时性仍以对应模块说明为准。';
  const count = d.loadable && d.records !== null ? d.records.toLocaleString('zh-CN') : '未取得';
  return `<article class="ds-card" style="--ds-accent:${d.color}"><div class="ds-card-head"><div><span class="ds-kind">${esc(type)} <span aria-hidden="true">·</span> ${esc(d.id)}</span><h3>${esc(d.title)}</h3></div><span class="ds-availability ${d.loadable ? 'ds-ready' : 'ds-unavailable'}">${d.loadable ? '可载入' : '未取得'}</span></div><div class="ds-coverage ${d.coverage === 'partial' ? 'ds-partial' : ''}"><i aria-hidden="true"></i>${coverageText}</div><div class="ds-records"><strong>${count}</strong><span>${d.type === 'collection' ? '事项' : d.type === 'digest' ? '收录事项' : d.type === 'index' ? '索引条目' : '登记记录'}</span></div><dl class="ds-dates"><div><dt>${d.type==='collection'?'摘要锚点':'来源截止'}</dt><dd>${esc(displayTime(d.sourceAsOf))}</dd></div><div><dt>快照整理</dt><dd>${esc(displayTime(d.generatedAt))}</dd></div></dl><p class="ds-gap">${esc(reason)}${d.type==='collection'?' 单一摘要锚点，逐来源日期见详情。':''}</p><details class="ds-integrity"><summary>查看登记信息</summary><dl><div><dt>文件字节</dt><dd>${Number.isSafeInteger(d.bytes) && d.bytes >= 0 ? d.bytes.toLocaleString('zh-CN') : '未登记'}</dd></div><div><dt>SHA-256</dt><dd class="ds-hash">${/^[a-f\d]{64}$/i.test(d.sha256 || '') ? esc(d.sha256) : '未登记'}</dd></div></dl><p>以上为目录登记值，本页没有下载全部业务快照或核验正文。</p></details><div class="ds-card-links">${d.linked.length ? d.linked.map(link).join('') : '<span class="ds-muted">当前没有独立页签入口</span>'}</div></article>`;
}

function renderMetrics(counts) {
  const metrics = [[counts.total, '已登记数据集', '公开目录范围'], [counts.loadable, '可载入快照', '目录状态为 ready'], [counts.partial, '部分覆盖', '属于可载入内容的覆盖说明'], [counts.unavailable, '来源未取得', '空缺不会当作零值']];
  return metrics.map(([value, label, note], i) => `<div style="--ds-accent:${PALETTE[i]}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
}

if (typeof document !== 'undefined') {
  let model = null, filter = 'all';
  const $ = id => document.getElementById(id);
  function updateResults() {
    if (!model) return;
    const rows = filteredDatasets(model, filter, $('ds-query').value);
    $('ds-grid').innerHTML = rows.map(renderCard).join('');
    $('ds-results').textContent = `显示 ${rows.length} / ${model.datasets.length} 个数据集。部分覆盖与可载入可以同时成立。`;
    $('ds-empty').hidden = rows.length !== 0;
  }
  async function load() {
    $('data-main').setAttribute('aria-busy', 'true');
    $('ds-content').hidden = true; $('ds-error').hidden = true; $('ds-loading').hidden = false;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const [catalog, registry] = await Promise.all(['data/datasets.json', 'modules.json'].map(async name => {
        const response = await fetch(new URL(name, HUB), { cache: 'no-store', credentials: 'omit', signal: controller.signal });
        if (!response.ok) throw new Error('Catalog request failed');
        return response.json();
      }));
      model = catalogModel(catalog, registry);
      $('ds-metrics').innerHTML = renderMetrics(model.counts);
      $('ds-prepared').textContent = `目录整理：${displayTime(catalog.preparedAt)}`;
      $('ds-static').innerHTML = `<div><p class="ds-eyebrow">静态内容</p><h2 id="ds-static-title">有些内容，不是业务数据集。</h2><p>个人主页等静态页面单独保留；其中演示内容以页面标记为准，不计入数据集数量。</p></div><div class="ds-static-links">${model.staticModules.map(link).join('') || '<span class="ds-muted">暂无单独登记的静态页面</span>'}</div>`;
      $('ds-read-at').textContent = `本次目录读取：${displayTime(new Date().toISOString())} · 北京时间`;
      updateResults(); $('ds-content').hidden = false;
    } catch { model = null; $('ds-error').hidden = false; }
    finally { clearTimeout(timeout); controller.abort(); $('ds-loading').hidden = true; $('data-main').setAttribute('aria-busy', 'false'); }
  }
  document.querySelector('.ds-filter').addEventListener('click', event => {
    const button = event.target.closest('button[data-filter]'); if (!button) return;
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    updateResults();
  });
  $('ds-query').addEventListener('input', updateResults);
  $('ds-retry').addEventListener('click', load);
  load();
}
