'use strict';

(() => {
  const TYPE_LABELS = {bank_transaction:'银行／渠道流水',order:'平台订单',unlocated_order_item:'缺日期商品参考',cash_event:'投资账户动账',account_snapshot:'账户资产快照',portfolio_snapshot:'平台合计采样',position_record:'仓位记录',valuation:'产品估值',investment_trade:'投资成交',asset_snapshot:'资产快照',liability_snapshot:'负债快照',equity_evidence:'股权授予证据'};
  const TAB_NOTES = {expenses:'仅展示已计入账本的消费；退款关系可在依据中查看',orders:'订单只作消费用途证据；缺日期订单在“待核”中查看',bank:'原账本与投资账户动账分角色保留，待去重流水不重复计消费',investment:'仓位、估值、账户与组合快照分别保存，不作为现金流合计',review:'包含用途待分类、候选关联、缺日期与待去重记录'};
  const ROLE_LABELS = {primary:'原账本',evidence:'用途证据',valuation:'估值观察',position:'仓位观察',pending_dedup:'待去重流水'};
  const STATUS_LABELS = {included:'已计入',excluded:'未计入',observed:'来源观察',open:'未平仓',closed:'已平仓',unknown:'待核实',date_and_order_id_unknown:'缺日期及订单号',source_evidence_only_not_additive_to_existing_ledger:'待与原账本去重',confirmed:'已确认',supported:'证据支持的综合关联',candidate:'候选关系',high_confidence:'高置信综合关联',high_confidence_composite:'高置信综合关联',source_observation:'来源观察',existing_reviewed_ledger:'原账本已核对'};
  const els = Object.fromEntries(['records','search','type','platform','start','end','pending','reset','export','page-info','page-size','prev','next','result-count','view-note','detail-dialog','detail-body','close-dialog'].map(id => [id, document.getElementById(id)]));
  const state = {tab:'expenses',page:1,pageSize:25,records:[],filtered:[],byId:new Map(),summary:{},scopeStart:'2025-01-01'};
  let debounce;

  function text(value) {
    return String(value == null ? '' : value).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[邮箱已隐藏]');
  }
  function node(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = text(value);
    return element;
  }
  function json(value, fallback = {}) {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  function typeOf(record) { return record.type || record.record_type || 'unknown'; }
  function details(record) { return record._details || {}; }
  function category(record) { return record.effective_category || record.category || ''; }
  function purpose(record) {
    const d = details(record);
    if (['position_record','valuation'].includes(typeOf(record)) && d.instrument_name) return d.instrument_name;
    if (['account_snapshot','portfolio_snapshot'].includes(typeOf(record))) return (d.account_label || 'Vergex 平台合计')+' · '+(d.snapshot_kind==='sampled_account_equity'?'历史权益采样':d.snapshot_kind==='statement_total_assets'?'报表资产快照':d.snapshot_kind==='account_summary_observation'?'账户资产观察':'权益采样');
    return record.effective_purpose || record.purpose || d.merchant || d.display_name || d.native_symbol || d.description || d.product || (TYPE_LABELS[typeOf(record)] || '来源记录');
  }
  function knownDate(record) { return record.scope_status !== 'date_unknown' && /^\d{4}-\d{2}-\d{2}$/.test(record.event_date || ''); }
  function isExpense(record) {
    const d = details(record);
    return (record.ledger_role === 'primary') && (record.included === true || record.included === 1 || record.included === '1') && (d.nature === 'expense' || record.nature === 'expense' || typeOf(record) === 'expense' || typeOf(record) === 'consumption');
  }
  function links(record) { return Array.isArray(record.links) ? record.links : []; }
  function reasons(record) {
    const result = [];
    const d = details(record);
    if (!knownDate(record)) result.push(typeOf(record)==='unlocated_order_item'?'日期及订单号待补':'记录日期待补');
    if (/待分类|无法分类|未分类/.test(category(record))) result.push('消费用途待分类');
    else if (/待核查|待确认/.test(category(record))) result.push('收支性质待核查');
    if (record.ledger_role === 'pending_dedup' || /pending.*dedup/.test(d.dedup_status || '')) result.push('需要与原账本去重');
    if (links(record).some(link => /candidate|pending|review/.test([link.status,link.confidence].join(' ')))) result.push('有未确认候选关系');
    if (/candidate|needs_review|unresolved|pending_review/.test([record.status,record.confidence].join(' '))) result.push('关联证据待核实');
    return result;
  }
  function matchesTab(record, tab) {
    const t = typeOf(record);
    if (tab === 'expenses') return isExpense(record);
    if (tab === 'orders') return t === 'order';
    if (tab === 'bank') return t === 'bank_transaction' || t === 'cash_event';
    if (tab === 'investment') return ['cash_event','account_snapshot','portfolio_snapshot','position_record','valuation','investment_trade','asset_snapshot','liability_snapshot','equity_evidence'].includes(t);
    return reasons(record).length > 0;
  }
  function label(value) { return STATUS_LABELS[value] || value || '未提供'; }
  function decimal(value) {
    if (value === null || value === undefined || value === '') return '未提供';
    const str = String(value);
    if (!/^-?\d+(\.\d+)?$/.test(str)) return str;
    const parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
  function unit(record) {
    if (record.currency) return record.currency;
    if (record.unit === 'platform_native_unverified') return '平台单位 · 币种未确认';
    return record.unit || '币种未确认';
  }
  function amountBasis(record) {
    const t = typeOf(record), d = details(record);
    if (t === 'order') return d.amount_basis || d.observed_amount_label || '订单金额观察 · 不等同银行实付';
    if (t === 'unlocated_order_item') return '商品行参考，不记为消费';
    if (t === 'position_record') return '仓位观察 · 不是逐笔成交';
    if (t === 'equity_evidence') return '股权授予或计划证据 · 不是券商成交或已到账收入';
    if (['valuation','account_snapshot','portfolio_snapshot','asset_snapshot','liability_snapshot'].includes(t)) return '资产／负债／估值快照 · 不是支出或新增资金流';
    if (t === 'cash_event') return '真实动账证据 · 与原账本待去重';
    return d.natureLabel || ROLE_LABELS[record.ledger_role] || '原账本金额';
  }
  function badge(value, tone = '') { return node('span','badge' + (tone ? ' '+tone : ''),value); }
  function count(value) { return new Intl.NumberFormat('zh-CN').format(value); }
  function summaryValue(keys, fallback) {
    for (const key of keys) if (state.summary[key] !== undefined && state.summary[key] !== null) return state.summary[key];
    return fallback;
  }
  function options(select, values, firstLabel, labels = {}) {
    const selected = select.value;
    select.replaceChildren();
    const first = node('option','',firstLabel); first.value = 'all'; select.append(first);
    for (const value of values) { const option = node('option','',labels[value] || value); option.value = value; select.append(option); }
    if (values.includes(selected)) select.value = selected;
  }
  function updateFilters() {
    const base = state.records.filter(r => matchesTab(r,state.tab));
    options(els.type,[...new Set(base.map(typeOf))].sort(),'全部类型',TYPE_LABELS);
    options(els.platform,[...new Set(base.map(r => r.source_system).filter(Boolean))].sort(),'全部来源',{vergex:'Vergex',webank:'微众银行'});
  }
  function apply() {
    const query = els.search.value.trim().toLocaleLowerCase('zh-CN');
    const start = els.start.value || state.scopeStart, end = els.end.value;
    state.filtered = state.records.filter(record => {
      if (!matchesTab(record,state.tab)) return false;
      if (els.pending.checked && !reasons(record).length) return false;
      if (els.type.value !== 'all' && typeOf(record) !== els.type.value) return false;
      if (els.platform.value !== 'all' && record.source_system !== els.platform.value) return false;
      if (!knownDate(record)) {
        if (state.tab !== 'review' && !els.pending.checked) return false;
      } else {
        if (record.event_date < state.scopeStart || record.event_date < start || (end && record.event_date > end)) return false;
      }
      return !query || record._search.includes(query);
    });
    state.page = 1;
    render();
  }
  function setTab(tab) {
    state.tab = tab;
    for (const button of document.querySelectorAll('[data-tab]')) {
      const selected = button.dataset.tab === tab;
      button.setAttribute('aria-selected',String(selected)); button.tabIndex = selected ? 0 : -1;
    }
    els.records.setAttribute('aria-labelledby','tab-'+tab);
    updateFilters(); apply();
  }
  function render() {
    const total = state.filtered.length, pageCount = Math.max(1,Math.ceil(total/state.pageSize));
    state.page = Math.min(state.page,pageCount);
    const start = (state.page-1)*state.pageSize, shown = state.filtered.slice(start,start+state.pageSize);
    els['result-count'].textContent = `筛选到 ${count(total)} 条记录`;
    els['view-note'].textContent = TAB_NOTES[state.tab];
    els['page-info'].textContent = total ? `第 ${count(start+1)}–${count(start+shown.length)} 条 / 共 ${count(total)} 条` : '没有符合条件的记录';
    els.prev.disabled = state.page <= 1; els.next.disabled = state.page >= pageCount; els.export.disabled = total === 0;
    els.records.replaceChildren();
    if (!shown.length) {
      const empty = node('div','empty-state'); empty.append(node('strong','','没有符合筛选条件的记录'),node('p','','可以调整日期、类型或搜索词。没有数据不代表消费或资产为零。')); els.records.append(empty); return;
    }
    const table = node('table','record-table'), thead = node('thead'), head = node('tr');
    [['date-col','日期'],['purpose-col','消费用途／记录内容'],['source-col','平台／机构'],['category-col','类别／角色'],['amount-col','原记录金额'],['action-col','依据']].forEach(([cls,title])=>{const th=node('th',cls,title);th.scope='col';head.append(th);});
    thead.append(head); table.append(thead); const body = node('tbody');
    for (const record of shown) {
      const row = node('tr'), date = node('td','date-col');
      date.append(node('span','record-date',knownDate(record)?record.event_date:'日期待补'));
      const content = node('td','purpose-col'); content.append(node('div','record-title',purpose(record)));
      const sub = node('div','record-sub'); sub.append(node('span','',TYPE_LABELS[typeOf(record)]||typeOf(record)));
      if (record.external_id) sub.append(node('span','',' · '+record.external_id));
      if (links(record).length) sub.append(badge(`${links(record).length} 条关联`,'blue'));
      content.append(sub);
      const platform = node('td','source-col',record.source_system === 'webank' ? '微众银行' : record.source_system === 'vergex' ? 'Vergex' : record.source_system || '来源待补');
      const categoryCell = node('td','category-col');
      categoryCell.append(node('span','',category(record) || ROLE_LABELS[record.ledger_role] || '未分类'));
      const issues = reasons(record); if (issues.length) categoryCell.append(node('div','',null),badge(issues[0],'amber'));
      const amount = node('td','amount-col'), amountMain = node('div','amount',decimal(record.amount_decimal)); amountMain.title = text(record.amount_decimal == null?'金额未提供':record.amount_decimal); amount.append(amountMain,node('div','amount-unit',unit(record)));
      const action = node('td','action-col'), open = node('button','record-link','查看依据 ↗'); open.type = 'button'; open.setAttribute('aria-label','查看'+purpose(record)+'的依据');open.addEventListener('click',()=>showDetail(record)); action.append(open);
      row.append(date,content,platform,categoryCell,amount,action);body.append(row);
    }
    table.append(body); els.records.append(table);
  }
  function fact(grid, key, value, mono = false) {
    if (value === undefined || value === null || value === '') return;
    const wrap=node('div','detail-fact');wrap.append(node('dt','',key),node('dd',mono?'mono':'',value));grid.append(wrap);
  }
  function section(parent, title) { const part=node('section','detail-section');part.append(node('h3','',title));parent.append(part);return part; }
  function semanticText(value) {
    if (typeof value === 'string' || typeof value === 'number') return text(value);
    if (Array.isArray(value)) return value.map(semanticText).filter(Boolean).join('；');
    if (!value || typeof value !== 'object') return '';
    return ['basis','reason','explanation','title','purpose','category','confidence','matchReason'].map(k=>value[k]?semanticText(value[k]):'').filter(Boolean).join(' · ');
  }
  function showDetail(record) {
    const d = details(record), parent=els['detail-body'];parent.replaceChildren();
    const title=node('h2','',purpose(record));title.id='detail-title';parent.append(title);
    const hero=node('div','detail-hero'), role=node('div');role.append(badge(TYPE_LABELS[typeOf(record)]||typeOf(record),'blue'),badge(ROLE_LABELS[record.ledger_role]||record.ledger_role),badge(label(record.status)));const amount=node('div');amount.append(node('div','amount',decimal(record.amount_decimal)),node('div','amount-unit',unit(record)));hero.append(role,amount);parent.append(hero);
    parent.append(node('div','notice',amountBasis(record)));
    const info=section(parent,'这条记录是什么'), grid=node('dl','detail-grid');
    fact(grid,'记录日期',knownDate(record)?record.event_date:'日期未知，未计入日期区间');
    fact(grid,'时间口径',record.date_basis || d.date_basis || d.as_of_precision || record.date_precision);
    fact(grid,'来源时间',record.occurred_at || d.observed_at || d.captured_at);
    fact(grid,'时区',record.timezone || (knownDate(record)?'未单独提供':null));
    fact(grid,'原始商户',d.merchant || d.original_merchant || d.bank_merchant);
    fact(grid,'平台／机构',record.source_system);
    fact(grid,'类别',category(record) || '当前未分类');
    fact(grid,'原类别',d.categoryBeforeOrderReview || d.originalCategory || d.original_category);
    fact(grid,'商品／记录编号',record.external_id || d.order_id || d.native_position_id);
    fact(grid,'平台订单日期',d.order_date);
    fact(grid,'平台付款日期观察',d.payment_date);
    fact(grid,'平台状态',d.status);
    fact(grid,'平台展示金额（非付款确认）',d.displayed_amount_decimal == null?null:decimal(d.displayed_amount_decimal)+' · '+unit(record));
    fact(grid,'平台退款状态',d.refund_status);
    fact(grid,'平台退款日期（非银行到账确认）',d.refund_date);
    fact(grid,'账户',d.account_label || d.account || d.account_name || d.display_account);
    fact(grid,'市场符号',d.instrument_symbol || d.native_exchange_symbol || d.exchange_symbol || d.symbol || d.native_symbol);
    fact(grid,'资金性质',d.natureLabel || d.event_kind);
    fact(grid,'持仓数量',record.quantity_decimal ?? d.current_quantity ?? d.quantity);
    fact(grid,'入场价格',record.price_decimal ?? d.entry_price);
    fact(grid,'费用观察',record.fee_decimal ?? d.total_fee);
    fact(grid,'来源覆盖',d.source_coverage || d.coverage);
    fact(grid,'记录 ID',record.record_id,true);info.append(grid);
    let items = Array.isArray(d.items)?d.items:[];
    const orderEvidence = json(d.orderEvidence || d.order_evidence,[]);
    if (!items.length && Array.isArray(orderEvidence)) items=orderEvidence.flatMap(e=>Array.isArray(e.items)?e.items:e.title?[e]:[]);
    if (items.length) {
      const products=section(parent,'商品与服务明细'), ul=node('ul','detail-items');
      for (const item of items) {const li=node('li','',item.title || item.product_name || item.name || '商品名称待补'); const meta=[item.spec,item.qty!=null?'数量 '+item.qty:null].filter(Boolean);if(meta.length)li.append(node('small','',meta.join(' · ')));ul.append(li);}products.append(ul);
    }
    const basis=semanticText(d.category_basis || d.categoryBasis || json(d.categoryEvidence || d.category_evidence,null) || d.classification_basis);
    if (basis) {const part=section(parent,'分类依据');part.append(node('p','',basis));}
    const relations=section(parent,'订单、付款与退款关系');
    if (links(record).length) {
      const ul=node('ul','detail-links');
      for(const link of links(record)) {
        const to=link.to_record_id || link.to || link.target_record_id,from=link.from_record_id || link.from;
        const targetId=to===record.record_id?from:(to || link.record_id || from), target=state.byId.get(targetId), li=node('li');
        const rel=link.relation || link.type || '关联记录'; const relationLabel={order_match:'订单关联',refund_of:'退款对应原消费',candidate_order_match:'订单候选',refund_candidate:'退款候选',order_payment:'订单与付款',payment_for_order:'订单与付款',refund_to_expense:'退款与消费'}[rel] || rel;
        if(target) {const button=node('button','',`${relationLabel} · ${purpose(target)}`);button.type='button';button.addEventListener('click',()=>showDetail(target));li.append(button);} else li.append(node('span','record-title',relationLabel));
        li.append(node('small','',[label(link.status),label(link.confidence),semanticText(link.evidence || link.basis || link.reason)].filter(Boolean).join(' · ')));
        ul.append(li);
      }
      relations.append(ul);
    } else relations.append(node('p','','当前没有可展示的确认关联。金额相同或平台显示已退款，均不能单独证明付款或退款到账。'));
    relations.append(node('p','','订单证据与已计入消费属于同一消费的不同观察，不重复增加支出。高置信综合关联仍应与支付流水号直接对应的确认区分。'));
    const limitations=[];
    if(Array.isArray(d.limitations))limitations.push(...d.limitations);
    if(d.caveat)limitations.push(d.caveat);
    if(d.coverage==='partial'||d.coverage==='partial_history'||d.account_coverage==='partial_history')limitations.push('该来源覆盖不完整；未出现的期间或记录不视为零。');
    if(!record.currency)limitations.push('来源未确认币种；保留原数值，不与其他币种合计。');
    limitations.push(...reasons(record));
    if(typeOf(record)==='order')limitations.push('下单日期不一定是扣款日期；平台退款状态不等于银行已到账。');
    if(limitations.length){const part=section(parent,'覆盖范围与待核事项');part.append(node('div','detail-note',[...new Set(limitations.map(semanticText).filter(Boolean))].join('\n')));}
    const src=record.source || {}, srcs=Array.isArray(src)?src:[src], sourcePart=section(parent,'来源依据');
    for(const source of srcs) {
      const file=source.file || source.source_file || source.relative_path;
      const sg=node('dl','detail-grid');if(file)fact(sg,'来源文件',String(file).replace(/\\/g,'/').split('/').pop());
      fact(sg,'来源定位',typeof source.locator==='object'?JSON.stringify(source.locator):source.locator,true);
      fact(sg,'SHA-256',source.sha256,true);if(sg.children.length)sourcePart.append(sg);
    }
    if(!sourcePart.querySelector('dl'))sourcePart.append(node('p','','来源已随记录保存；本视图仅展示已授权的业务摘要。'));
    if(!els['detail-dialog'].open) els['detail-dialog'].showModal();
    els['detail-dialog'].scrollTop=0;
  }
  function csvCell(value) {
    let str=text(value);
    if(/^[\s\uFEFF]*[=+\-@]/.test(str)||/^[\t\r\n]/.test(str)||(/^-?\d+(\.\d+)?$/.test(str)&&str.replace(/\D/g,'').length>=15))str="'"+str;
    return '"'+str.replace(/"/g,'""')+'"';
  }
  function exportCsv() {
    const headings=['记录编号','原生订单或交易编号','记录类型','平台机构','日期','日期口径','消费用途或内容','类别','金额原值','币种','计价单位','账本角色','计入原账本','状态','关联数量'];
    const rows=state.filtered.map(r=>[r.record_id,r.external_id,TYPE_LABELS[typeOf(r)]||typeOf(r),r.source_system,r.event_date,r.date_basis,purpose(r),category(r),r.amount_decimal,r.currency,r.unit,ROLE_LABELS[r.ledger_role]||r.ledger_role,r.included?'是':'否',label(r.status),links(r).length]);
    const blob=new Blob(['\uFEFF'+[headings,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}), url=URL.createObjectURL(blob), anchor=node('a');
    anchor.href=url;anchor.download='统一账库_'+state.tab+'_'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function load() {
    try {
      const response=await fetch('../../data/finance-unified.json',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const payload=await response.json();if(!Array.isArray(payload.records))throw new Error('账库格式不正确');
      state.summary=payload.summary || {};state.scopeStart=payload.scope_start || '2025-01-01';
      state.records=payload.records.map(record=>{const copy={...record};copy._details=json(copy.details || copy.details_json,{});copy._search=text([purpose(copy),category(copy),copy.record_id,copy.external_id,copy.source_system,copy._details.merchant,copy._details.account_label,copy._details.instrument_name,JSON.stringify(copy._details.items || []),JSON.stringify(copy._details.order_evidence || copy._details.orderEvidence || [])].filter(Boolean).join(' ')).toLocaleLowerCase('zh-CN');return copy;});
      state.records.sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||'')||a.record_id.localeCompare(b.record_id));state.byId=new Map(state.records.map(r=>[r.record_id,r]));
      const summaries=[['bank',['bank_records','ledger_records'],state.records.filter(r=>typeOf(r)==='bank_transaction').length],['expense',['expense_records','consumption_records'],state.records.filter(isExpense).length],['order',['order_records','orders'],state.records.filter(r=>typeOf(r)==='order').length],['dianping',['dianping_orders'],state.records.filter(r=>typeOf(r)==='order'&&r.source_system==='大众点评').length],['pending',['pending_category','pending_categories'],state.records.filter(r=>isExpense(r)&&/待分类/.test(category(r))).length]];
      for(const [id,keys,fallback] of summaries)document.getElementById('metric-'+id).textContent=count(summaryValue(keys,fallback));
      const orders=state.records.filter(r=>typeOf(r)==='order'),knownOrders=summaryValue(['known_order_records'],orders.filter(knownDate).length),undatedOrders=summaryValue(['undated_order_records'],orders.filter(r=>!knownDate(r)).length);
      document.getElementById('order-coverage').textContent=`${count(knownOrders)} 笔日期明确 · ${count(undatedOrders)} 笔日期待补`;
      for(const button of document.querySelectorAll('[data-tab]'))button.querySelector('.tab-count').textContent=count(state.records.filter(r=>matchesTab(r,button.dataset.tab)).length);
      els.start.value=state.scopeStart;els.start.min=state.scopeStart;els.end.min=state.scopeStart;
      const generated=payload.generated_at || payload.as_of;document.getElementById('update-text').textContent=generated?'更新于 '+String(generated).replace('T',' ').replace(/\.\d+/,'').replace(/\+08:00$/,'')+' · 北京时间':'已读取统一账库';
      document.getElementById('coverage-note').textContent=`范围：${state.scopeStart} 起及此后已导入记录。${payload.bank_as_of?'账本最近记录日 '+payload.bank_as_of+'。':''}来源未完整覆盖所有账户；日期未知的记录独立待核。`;
      updateFilters();apply();
    } catch(error) {
      document.getElementById('update-text').textContent='数据暂未载入';els['result-count'].textContent='未能读取账库快照';els.records.replaceChildren();const empty=node('div','empty-state');empty.append(node('strong','','账库快照暂时无法读取'),node('p','','请稍后刷新。当前没有数据显示不代表没有消费记录。'),node('p','',String(error.message)));els.records.append(empty);
    }
  }
  for(const button of document.querySelectorAll('[data-tab]')) {
    button.addEventListener('click',()=>setTab(button.dataset.tab));
    button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...document.querySelectorAll('[data-tab]')],index=buttons.indexOf(button), next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();setTab(buttons[next].dataset.tab);});
  }
  els.search.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(apply,150);});
  for(const id of ['type','platform','start','end','pending'])els[id].addEventListener('change',apply);
  els.reset.addEventListener('click',()=>{els.search.value='';els.type.value='all';els.platform.value='all';els.start.value=state.scopeStart;els.end.value='';els.pending.checked=false;apply();});
  els['page-size'].addEventListener('change',()=>{state.pageSize=parseInt(els['page-size'].value,10);state.page=1;render();});
  els.prev.addEventListener('click',()=>{state.page--;render();});els.next.addEventListener('click',()=>{state.page++;render();});els.export.addEventListener('click',exportCsv);
  els['close-dialog'].addEventListener('click',()=>els['detail-dialog'].close());els['detail-dialog'].addEventListener('click',event=>{if(event.target===els['detail-dialog']){const rect=els['detail-dialog'].getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)els['detail-dialog'].close();}});
  load();
})();
