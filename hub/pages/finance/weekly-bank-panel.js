/* The weekly bank view reads the same verified snapshot as the existing report. */
(() => {
  'use strict';
  const host = document.getElementById('weekly-bank-panel');
  if (!host) return;
  let snapshot = null;
  let analysisCurrency = 'CNY';
  let reviewPage = 1;
  const pageSize = 20;
  const labels = {
    date: '交易日期', periodStart: '期间开始', periodEnd: '期间结束',
    metric: '项目', label: '项目', value: '结果', currency: '币种',
    bank: '银行', account: '账户', amount: '金额', natureLabel: '交易性质',
    status: '状态', source: '来源类型', reason: '核对说明', sourceRef: '来源编号',
    notes: '说明', note: '说明', records: '记录数', count: '数量',
    gross: '消费金额', refund: '退款或返现', net: '净消费', income: '确认收入',
    transfer: '资金转移', repayment: '还款', investment: '投资资金流',
    expense: '消费金额', fee: '费用', transactionCount: '交易笔数',
    addedCount: '本轮新增', pendingCount: '待核查', period: '分析期间',
    weekStart: '周开始', weekEnd: '周结束', includedRecords: '计入笔数',
    totalRecords: '记录数', expenseCents: '消费金额（分）', refundCents: '退款金额（分）',
    incomeCents: '收入金额（分）', netExpenseCents: '净消费金额（分）',
    asOfDate: '统计日期', assetsTotal: '资产合计', reportedIncome: '报告收益',
    fundAssets: '基金资产', cashAssets: '卡内余额', currentPlusValue: '活期+市值',
    shortTermPlusValue: '短期+市值', stableWealthValue: '稳健理财市值',
    fixedIncomePlusValue: '固收+市值', returnPercentage: '报告收益率',
    previousValue: '前周', change: '较前周变化', changePercent: '较前周变化率'
  };
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function text(value) {
    if (value === null || value === undefined || value === '') return '未提供';
    if (typeof value === 'boolean') return value ? '是' : '否';
    return String(value);
  }
  function formatTime(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return '未提供';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(value)) + '（上海时间）';
  }
  function money(value, currency) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '未提供';
    if (!currency || !/^[A-Z]{3}$/.test(currency)) return text(value);
    try { return new Intl.NumberFormat('zh-CN', {style: 'currency', currency}).format(Number(value)); }
    catch { return text(value) + ' ' + currency; }
  }
  function rows(key) { return snapshot?.queries?.[key]?.rows || []; }
  function statusText(value) {
    return ({observed_ledger_only: '已记录账本范围', no_observed_records: '未收集到记录',
      derived_observed_ledger_only: '按已记录消费和退款计算', derived_observed_records: '按已记录消费和退款计算'})[value] || text(value);
  }
  function readableNote(value) {
    return String(value).replace(/included=1 的/g, '已确认计入的').replace(/\bnull\b/g, '未知');
  }
  function metricValue(row, field = 'value') {
    const value = row[field];
    if (value === null || value === undefined) return '未收集到记录';
    if (field === 'changePercent') return text(value) + '%';
    if (row.unit === '笔' || row.metric === 'transaction_count') return Number(value).toLocaleString('zh-CN') + ' 笔';
    return row.currency ? money(value, row.currency) : text(value);
  }
  function table(data, fields, caption) {
    const wrap = el('div', undefined, 'bank-weekly-table-wrap');
    const t = el('table');
    t.append(el('caption', caption));
    const head = el('tr');
    fields.forEach(field => { const th = el('th', labels[field] || field); th.scope = 'col'; head.append(th); });
    const thead = el('thead'); thead.append(head); t.append(thead);
    const body = el('tbody');
    data.forEach(row => {
      const tr = el('tr');
      fields.forEach(field => tr.append(el('td', ['value', 'previousValue', 'change', 'changePercent'].includes(field) ? metricValue(row, field) : field === 'status' ? statusText(row[field]) : ['amount', 'assetsTotal', 'reportedIncome', 'fundAssets', 'cashAssets', 'currentPlusValue', 'shortTermPlusValue', 'stableWealthValue', 'fixedIncomePlusValue'].includes(field) ? money(row[field], row.currency) : text(row[field]))));
      body.append(tr);
    });
    t.append(body); wrap.append(t);
    return wrap;
  }
  function summaryCards(data, target) {
    data.filter(row => row.metric || row.label).forEach(row => {
      const card = el('div', undefined, 'bank-weekly-card');
      card.append(el('span', row.metric === 'income_total' ? '确认收入' : row.label || row.metric));
      card.append(el('strong', metricValue(row)));
      if (row.previousValue !== null && row.previousValue !== undefined)
        card.append(el('small', `前周 ${metricValue(row, 'previousValue')}${row.changePercent !== null && row.changePercent !== undefined ? ` · ${row.changePercent > 0 ? '+' : ''}${row.changePercent}%` : ''}`));
      if (row.status && row.status !== 'no_observed_records') card.append(el('small', statusText(row.status)));
      target.append(card);
    });
  }
  function renderAnalysis() {
    const target = host.querySelector('[data-analysis-content]');
    target.replaceChildren();
    const selected = rows('bank_weekly_analysis').filter(row => row.currency === analysisCurrency);
    const find = (codes, label) => selected.find(row => codes.includes(row.metric) || row.label === label);
    const expense = find(['expense_total', 'expense'], '消费');
    const refund = find(['refund_total', 'refund'], '退款或返现');
    let net = find(['net_expense_total', 'net_total', 'net_consumption_total', 'net_spending_total'], '净消费');
    if (!net && expense && refund) {
      const cents = Number.isSafeInteger(expense.valueCents) && Number.isSafeInteger(refund.valueCents) ? expense.valueCents - refund.valueCents : null;
      const previousCents = Number.isSafeInteger(expense.previousValueCents) && Number.isSafeInteger(refund.previousValueCents) ? expense.previousValueCents - refund.previousValueCents : null;
      net = {metric: 'net_expense_total', label: '净消费', currency: analysisCurrency,
        value: cents === null ? null : cents / 100, previousValue: previousCents === null ? null : previousCents / 100,
        status: cents === null ? 'no_observed_records' : 'derived_observed_ledger_only'};
    }
    const income = find(['income_total', 'income'], '确认收入') || find(['income_total', 'income'], '收入');
    const cards = el('div', undefined, 'bank-weekly-cards');
    summaryCards([expense, refund, net, income].filter(Boolean), cards);
    target.append(cards);
    const count = find(['transaction_count'], '交易笔数');
    if (count) target.append(el('p', `${analysisCurrency} · 本周交易 ${metricValue(count)}${count.previousValue !== null && count.previousValue !== undefined ? ` · 前周 ${metricValue(count, 'previousValue')}` : ''}`, 'bank-weekly-note'));
    const comparisons = el('details', undefined, 'bank-weekly-details');
    comparisons.append(el('summary', `${analysisCurrency} 全部资金流与前周比较 · ${selected.length} 项`));
    comparisons.append(el('p', '消费、收入、转账、还款、投资和未知方向分列。未收集到记录的项目保留未知；不能把各项相加解释为净收支。', 'bank-weekly-note'));
    comparisons.append(table(selected, ['label', 'value', 'previousValue', 'change', 'changePercent', 'status'], '同币种的完整自然周比较'));
    target.append(comparisons);
  }
  function renderReview() {
    const target = host.querySelector('[data-review-table]');
    const status = host.querySelector('[data-review-status]').value;
    const needle = host.querySelector('[data-review-search]').value.trim().toLocaleLowerCase();
    const all = rows('refresh_review');
    const filtered = all.filter(row => (status === 'all' || String(row.action).startsWith('pending_')) &&
      (!needle || ['date', 'bank', 'reason', 'sourceRef', 'status'].some(field => String(row[field] ?? '').toLocaleLowerCase().includes(needle))));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    reviewPage = Math.min(reviewPage, pages);
    target.replaceChildren();
    if (filtered.length) target.append(table(filtered.slice((reviewPage - 1) * pageSize, reviewPage * pageSize),
      ['date', 'bank', 'amount', 'status', 'reason', 'sourceRef'], '银行增量逐笔核对'));
    else target.append(el('p', all.length ? '当前条件下没有核对记录。' : '这份快照尚未包含银行增量核对记录。', 'bank-weekly-muted'));
    const foot = el('div', undefined, 'bank-weekly-pagination');
    foot.append(el('span', `共 ${filtered.length} 条 · 第 ${reviewPage} / ${pages} 页`));
    for (const [label, change, disabled] of [['上一页', -1, reviewPage === 1], ['下一页', 1, reviewPage === pages]]) {
      const button = el('button', label); button.type = 'button'; button.disabled = disabled;
      button.addEventListener('click', () => { reviewPage += change; renderReview(); }); foot.append(button);
    }
    target.append(foot);
  }
  function render() {
    host.replaceChildren();
    host.removeAttribute('aria-busy');
    const head = el('div', undefined, 'bank-weekly-heading');
    const title = el('div');
    title.append(el('p', '每周自动整理 · 银行账单与动账提醒', 'bank-weekly-eyebrow'));
    title.append(el('h2', '银行流水每周分析'));
    const context = snapshot.context || {};
    title.append(el('p', `报告资料范围：${text(context.periodStart)} — ${text(context.periodEnd)} · 快照生成：${formatTime(snapshot.generatedAt)}`, 'bank-weekly-muted'));
    head.append(title);
    const anchor = el('a', '查看财务图表 ↓'); anchor.href = '#root'; head.append(anchor); host.append(head);

    const analysis = rows('bank_weekly_analysis');
    const analysisQuery = snapshot.queries?.bank_weekly_analysis;
    if (analysis[0]?.periodStart || analysis[0]?.periodEnd)
      host.append(el('p', `最近完整自然周：${text(analysis[0].periodStart)} — ${text(analysis[0].periodEnd)} · 各币种分别统计`, 'bank-weekly-note'));
    if (analysis.length) {
      const currencies = [...new Set(analysis.map(row => row.currency).filter(Boolean))];
      if (!currencies.includes(analysisCurrency)) analysisCurrency = currencies[0];
      const currencyControls = el('div', undefined, 'bank-weekly-controls');
      const label = el('label', '分析币种 '); const select = el('select');
      select.setAttribute('aria-label', '银行周分析币种');
      currencies.forEach(currency => { const option = el('option', currency); option.value = currency; option.selected = currency === analysisCurrency; select.append(option); });
      select.addEventListener('change', () => { analysisCurrency = select.value; renderAnalysis(); });
      label.append(select); currencyControls.append(label); host.append(currencyControls);
      const content = el('div'); content.dataset.analysisContent = ''; host.append(content);
      renderAnalysis();
    }
    const analysisNotes = [...new Set(analysis.map(row => row.notes || row.note).filter(Boolean))];
    const reportRows = analysis.filter(row => !row.metric && !row.label);
    if (reportRows.length) {
      const fields = [...new Set(reportRows.flatMap(row => Object.keys(row)))].filter(key => labels[key]);
      if (fields.length) host.append(table(reportRows.slice(0, 104), fields, '每周银行流水汇总（不同币种分别列示）'));
    }
    const analysisContext = context.bankWeekly || context.bankWeeklyAnalysis || {};
    if (analysisContext.periodStart || analysisContext.periodEnd)
      host.append(el('p', `本轮分析期间：${text(analysisContext.periodStart)} — ${text(analysisContext.periodEnd)}`, 'bank-weekly-muted'));
    if (!analysis.length) host.append(el('p', '本轮周分析尚未写入这份快照；以下仅列出已有核对和资料限制。', 'bank-weekly-muted'));
    if (analysis.length) host.append(el('p', '仅反映已记录的交易。未收集到记录不代表实际为零；转账、还款、投资与消费分别列示。', 'bank-weekly-note'));
    const noteSources = [...analysisNotes, ...(analysisQuery?.source?.caveats || [])];
    if (noteSources.length) {
      const notes = el('details', undefined, 'bank-weekly-details');
      notes.append(el('summary', '分析口径与覆盖说明'));
      const sentences = [...new Set(noteSources.flatMap(note => readableNote(note).split('。')).map(note => note.trim()).filter(Boolean))];
      notes.append(el('p', sentences.join('。') + '。', 'bank-weekly-note')); host.append(notes);
    }

    const statements = rows('webank_statements').map(row => ({...row,
      periodStart: row.periodStart ?? row.period_start, periodEnd: row.periodEnd ?? row.period_end,
      asOfDate: row.asOfDate ?? row.as_of, assetsTotal: row.assetsTotal ?? row.total_assets,
      reportedIncome: Object.hasOwn(row, 'reportedIncome') ? row.reportedIncome : row.return_amount,
      fundAssets: row.fundAssets ?? row.fund_value,
      cashAssets: row.cashAssets ?? row.card_cash_balance, currentPlusValue: row.currentPlusValue ?? row.current_plus_value,
      shortTermPlusValue: row.shortTermPlusValue ?? row.short_term_plus_value,
      stableWealthValue: row.stableWealthValue ?? row.stable_wealth_value,
      fixedIncomePlusValue: row.fixedIncomePlusValue ?? row.fixed_income_plus_value,
      returnPercentage: Object.hasOwn(row, 'returnPercentage') ? row.returnPercentage : row.return_pct
    }));
    if (statements.length) {
      const statementSection = el('details', undefined, 'bank-weekly-details');
      statementSection.append(el('summary', `银行资产对账单 · ${statements.length} 份`));
      statementSection.append(el('p', '以下按对账单各自统计日期展示。资产、报告收益及基金余额不作为新增消费，也不代表所有账户的当前净资产；不同日期的资产差额不能视为投资收益。', 'bank-weekly-note'));
      const fields = ['periodStart', 'periodEnd', 'asOfDate', 'currency', 'assetsTotal', 'cashAssets', 'currentPlusValue', 'shortTermPlusValue', 'stableWealthValue', 'fundAssets', 'fixedIncomePlusValue', 'reportedIncome', 'returnPercentage', 'status'].filter(field => statements.some(row => row[field] !== undefined));
      statementSection.append(table(statements, fields, '微众银行资产对账单'));
      host.append(statementSection);
    }

    const quality = el('details', undefined, 'bank-weekly-details'); quality.open = true;
    quality.append(el('summary', `资料覆盖与缺口 · ${rows('data_quality').length} 项`));
    const qualityList = el('ul', undefined, 'bank-weekly-quality');
    rows('data_quality').forEach(row => {
      const item = el('li');
      item.append(el('strong', text(row.limitation || row.label || row.issue)));
      item.append(el('span', [row.count === null || row.count === undefined ? null : text(row.count), row.unit, row.notes || row.note].filter(Boolean).join(' ')));
      qualityList.append(item);
    });
    if (qualityList.children.length) quality.append(qualityList);
    else quality.append(el('p', '未提供资料限制清单，不能据此视为覆盖完整。', 'bank-weekly-muted'));
    host.append(quality);

    const review = el('details', undefined, 'bank-weekly-details');
    const pending = rows('refresh_review').filter(row => String(row.action).startsWith('pending_')).length;
    review.open = false;
    review.append(el('summary', `银行增量核对 · ${pending} 条待核查 / ${rows('refresh_review').length} 条决定`));
    review.append(el('p', '待核查记录未新增消费金额；银行转账、还款、投资与账单应还额分别保留。这里与下方财务图表使用同一份数据快照。', 'bank-weekly-note'));
    const controls = el('div', undefined, 'bank-weekly-controls');
    const statusLabel = el('label', '核对状态 ');
    const select = el('select'); select.dataset.reviewStatus = '';
    for (const [value, label] of [['pending', '仅待核查'], ['all', '全部决定']]) { const option = el('option', label); option.value = value; select.append(option); }
    select.addEventListener('change', () => { reviewPage = 1; renderReview(); }); statusLabel.append(select);
    const searchLabel = el('label', '搜索 '); const input = el('input');
    input.type = 'search'; input.placeholder = '银行、日期、来源编号或核对说明'; input.dataset.reviewSearch = '';
    input.addEventListener('input', () => { reviewPage = 1; renderReview(); }); searchLabel.append(input);
    controls.append(statusLabel, searchLabel); review.append(controls);
    const reviewTable = el('div'); reviewTable.dataset.reviewTable = ''; review.append(reviewTable); host.append(review);
    renderReview();
  }
  function update(next) { snapshot = next; reviewPage = 1; render(); }
  globalThis.addEventListener('finance:snapshot', event => update(event.detail));
  globalThis.addEventListener('finance:snapshot-error', event => {
    const old = host.querySelector('[role="alert"]'); if (old) old.remove();
    const message = el('p', event.detail + (snapshot ? ' 当前保留上次成功读取的分析。' : ''), 'bank-weekly-error');
    message.setAttribute('role', 'alert'); host.prepend(message); host.removeAttribute('aria-busy');
  });
  if (globalThis.__lifeHubFinanceSnapshot) update(globalThis.__lifeHubFinanceSnapshot);
})();
