(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const currency = new Intl.NumberFormat('zh-CN', {minimumFractionDigits:2,maximumFractionDigits:2});
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const money = value => finite(value) ? currency.format(value) : '待补资料';
  const signed = value => finite(value) ? `${value > 0 ? '+' : ''}${money(value)}` : '待补资料';
  const cents = value => Math.round(value * 100);
  const dateTime = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '时间待补';
  const reportName = row => `${row.report_type === 'weekly' ? '周报' : '月报'} · ${row.period_start} — ${row.period_end}`;
  let snapshot = null;
  let current = null;
  let requestNumber = 0;
  function text(id,value) { byId(id).textContent = value; }
  function rows(key) { return snapshot.queries[key].rows; }
  function element(tag, value, className) {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = value;
    if (className) el.className = className;
    return el;
  }
  function cell(row, value, className) { row.append(element('td', value, className)); }
  function direction(value) { return finite(value) && value !== 0 ? value > 0 ? 'positive' : 'negative' : ''; }
  function table(target, records, values) {
    const body = byId(target); body.replaceChildren();
    for (const record of records) {
      const row = element('tr');
      if (record.category === '合计') row.className = 'total-row';
      for (const get of values) { const result = get(record); cell(row, Array.isArray(result) ? result[0] : result, Array.isArray(result) ? result[1] : ''); }
      body.append(row);
    }
    if (!records.length) { const row = element('tr'); const empty = element('td', '当前条件没有匹配记录'); empty.colSpan=values.length; row.append(empty); body.append(row); }
  }
  function renderHoldings() {
    const all = rows('holdings').filter(row => row.report_id === current.id);
    const keyword = byId('holding-search').value.trim().toLocaleLowerCase();
    const selected = all.filter(row => !keyword || `${row.product} ${row.category}`.toLocaleLowerCase().includes(keyword)).sort((a,b) => b.amount-a.amount);
    table('holdings-rows', selected, [r=>r.product,r=>r.category,r=>money(r.amount),r=>r.source_page]);
    text('holding-result', keyword ? `找到 ${selected.length} / ${all.length} 项。搜索仅筛选持仓明细，上方资产汇总保持完整报告口径。` : `共 ${all.length} 项期末持仓，按金额从高到低排列。`);
  }
  function renderFlows() {
    const flows = rows('cash_flows').filter(row => row.report_id === current.id);
    const summary = rows('flow_summary').filter(row => row.report_id === current.id);
    text('flow-count', `${flows.length} 笔 · 卡期末余额 ${money(current.cash_closing)} 元`);
    table('flow-summary-rows', summary, [r=>r.summary,r=>r.count,r=>[signed(r.amount),direction(r.amount)]]);
    table('flow-detail-rows',flows,[r=>r.date,r=>r.summary,r=>[signed(r.amount),direction(r.amount)],r=>money(r.balance),r=>r.source_page]);
    const subscription = -flows.filter(r=>r.kind==='fund_subscription').reduce((sum,r)=>sum+cents(r.amount),0)/100;
    const refunds = flows.filter(r=>r.kind==='subscription_refund').reduce((sum,r)=>sum+cents(r.amount),0)/100;
    const transfer = -flows.filter(r=>r.kind==='account_transfer_out').reduce((sum,r)=>sum+cents(r.amount),0)/100;
    const findings = byId('flow-findings'); findings.replaceChildren();
    for (const [label,value] of [['基金申购',subscription],['配售退款',refunds],['净申购（申购减退款）',subscription-refunds],['账户扣划转出',transfer]]) {
      const part = element('span'); part.append(element('span',`${label} `),element('strong',`${money(value)} 元`)); findings.append(part);
    }
    byId('flow-details').open = false;
  }
  function render() {
    current = rows('reports').find(row=>row.id===byId('report-select').value) || rows('reports')[0];
    byId('holding-search').value='';
    const reports = rows('reports').slice().sort((a,b)=>b.as_of.localeCompare(a.as_of));
    const earlier = reports.filter(row=>row.as_of<current.as_of && row.currency===current.currency)[0];
    text('period-label', `${current.period_start} — ${current.period_end} · ${current.currency} 人民币`);
    text('source-date', `快照整理于 ${dateTime(snapshot.generatedAt)}`);
    text('total-assets', `¥${money(current.total_assets)}`);
    text('assets-date', `资产截至 ${current.as_of}，非今日余额`);
    const change = earlier ? (cents(current.total_assets)-cents(earlier.total_assets))/100 : null;
    text('assets-change', earlier ? `${signed(change)} 元` : '暂无较早快照');
    byId('assets-change').className = earlier ? direction(change) : 'unavailable';
    text('change-label', earlier ? `${earlier.as_of} → ${current.as_of}，非投资盈亏` : '没有可直接比较的更早资产报告');
    text('report-return', finite(current.return_amount) ? `${signed(current.return_amount)} 元` : '待补资料');
    text('return-gap', current.report_type==='weekly' ? snapshot.coverage.missing_comparison : current.return_unavailable_reason);
    const chart = byId('allocation-chart'); chart.replaceChildren();
    for (const category of current.categories.slice().sort((a,b)=>b.amount-a.amount)) {
      const row = element('div',undefined,'allocation-row');
      const track = element('div',undefined,'allocation-track'); const bar=element('div',undefined,'allocation-bar');
      const weight = current.total_assets > 0 ? category.amount/current.total_assets*100 : null;
      bar.style.width=`${weight === null ? 0 : Math.max(0,Math.min(100,weight))}%`;track.append(bar);
      row.append(element('span',category.category,'allocation-name'),track,element('span',`${money(category.amount)} 元`,'allocation-value'),element('span',weight===null?'占比待补':`${weight.toFixed(2)}%`,'allocation-weight'));chart.append(row);
    }
    text('concentration', `前三项产品占 ${current.top3_weight_pct.toFixed(2)}%`);
    const comparisons=rows('comparisons').filter(row=>row.latest_as_of===current.as_of && earlier && row.earlier_as_of===earlier.as_of);
    byId('comparison-section').hidden=!comparisons.length;
    if(comparisons.length){
      text('comparison-period',`${earlier.as_of} 与 ${current.as_of}，按同币种同分类比较。`);
      text('earlier-column',`${earlier.as_of}（元）`);text('latest-column',`${current.as_of}（元）`);
      table('comparison-rows',comparisons,[r=>r.category,r=>money(r.earlier_amount),r=>money(r.latest_amount),r=>[signed(r.change_amount),direction(r.change_amount)]]);
    }
    text('holdings-description',`其中基金为 ${current.fund_count} 个份额类别，可能包含同标的及 A/C/E 等不同份额，不等于独立策略数量。`);
    renderHoldings();renderFlows();
    const source=byId('source-evidence');source.replaceChildren();
    for(const line of [
      `来源：${current.source}，${reportName(current)}。资产见第 ${current.source_pages_assets} 页；微众卡流水见第 ${current.source_pages_flows} 页。`,
      `核对：资产分类合计${current.checks.asset_total_reconciled?'通过':'待复核'}；分类内产品合计${current.checks.product_totals_reconciled?'通过':'待复核'}；卡流水余额链${current.checks.cash_balance_chain_reconciled?'通过':'待复核'}（${current.checks.cash_balance_pairs} 组相邻余额）。`,
      `卡期初 ${money(current.cash_opening)} 元，期末 ${money(current.cash_closing)} 元，本期卡净流量 ${signed(current.cash_net_flow)} 元。卡流水仅覆盖该卡，不是整个投资组合的外部资金流。`,
      `前三项产品：${current.top3_products.join('、')}。分类与份额类别不能用于推断底层资产相互独立。`,
      `资料缺口：${current.return_unavailable_reason} ${snapshot.coverage.missing_comparison}`,
      `台账口径：${snapshot.coverage.ledger_policy}`
    ])source.append(element('p',line));
  }
  function validate(data) {
    if(!data || data.schema_version!==1 || !data.queries || !data.coverage) throw Error('报告数据结构不完整，请稍后重试。');
    for(const key of ['reports','holdings','cash_flows','flow_summary','comparisons']) if(!Array.isArray(data.queries[key]?.rows)) throw Error('报告明细结构不完整，请稍后重试。');
    for(const report of data.queries.reports.rows){
      if(!report.id || report.currency!=='CNY' || !/^\d{4}-\d{2}-\d{2}$/.test(report.as_of) || !Array.isArray(report.categories) || !finite(report.total_assets) || !finite(report.top3_weight_pct) || !report.checks) throw Error('报告资产字段不完整，请稍后重试。');
      if(report.categories.some(row=>!finite(row.amount)) || report.categories.reduce((sum,row)=>sum+cents(row.amount),0)!==cents(report.total_assets)) throw Error('资产分类合计未通过核对，暂不显示。');
    }
    return data;
  }
  async function load() {
    const number=++requestNumber;
    for(const id of ['report-content','error-state','empty-state'])byId(id).hidden=true;
    byId('loading-state').hidden=false;byId('report-select').disabled=true;
    try{
      const response=await fetch('../../data/webank.json',{cache:'no-store',credentials:'omit',redirect:'error'});
      if(!response.ok)throw Error(`数据文件读取失败（HTTP ${response.status}）。`);
      const raw=await response.text();if(raw.length>5*1024*1024)throw Error('报告数据超过读取上限。');
      const data=validate(JSON.parse(raw));if(number!==requestNumber)return;snapshot=data;
      const reports=rows('reports').slice().sort((a,b)=>b.as_of.localeCompare(a.as_of));
      if(!reports.length){byId('report-select').replaceChildren(element('option','暂无可用报告'));byId('empty-state').hidden=false;return;}
      const select=byId('report-select');select.replaceChildren(...reports.map(row=>{const option=element('option',reportName(row));option.value=row.id;return option;}));select.value=reports[0].id;select.disabled=false;
      render();byId('report-content').hidden=false;
    }catch(error){if(number!==requestNumber)return;byId('report-select').replaceChildren(element('option','载入失败'));text('error-message',error instanceof SyntaxError?'报告文件不是有效 JSON，请稍后重试。':error.message||'网络读取失败，请稍后重试。');byId('error-state').hidden=false;}
    finally{if(number===requestNumber)byId('loading-state').hidden=true;}
  }
  byId('report-select').addEventListener('change',render);
  byId('holding-search').addEventListener('input',renderHoldings);
  byId('retry-button').addEventListener('click',load);
  load();
})();
