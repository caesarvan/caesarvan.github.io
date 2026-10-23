/* Life OS overview: read the same published source files as each detailed space. */
const DATA_BASE = new URL('./data/', import.meta.url);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value, digits = 2) => finite(value) ? new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value) : '资料不足';
const signed = value => finite(value) ? `${value > 0 ? '+' : ''}${fmt(value)}` : '资料不足';
const short = value => Math.abs(value) >= 10000 ? `${fmt(value / 10000, 1)}万` : fmt(value, 0);
const date = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10) : '日期待补';
const time = value => value && finite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '时间待补';
const todayShanghai = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
function query(data, key) { const rows = data?.queries?.[key]?.rows; if (!Array.isArray(rows)) throw Error(`快照缺少 ${key}，请重新读取。`); return rows; }
function monthsBetween(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || start > end) throw Error('财务资料期间无效。');
  const result = []; let [y,m] = start.slice(0,7).split('-').map(Number);
  while (`${y}-${String(m).padStart(2,'0')}` <= end.slice(0,7) && result.length < 1200) { result.push(`${y}-${String(m).padStart(2,'0')}`); if (++m === 13) { y++; m = 1; } }
  return result;
}

/** Integer-cent calculations; absent months/series remain null. */
export function financeModel(data, currency = 'CNY') {
  const start = data?.context?.periodStart, end = data?.context?.periodEnd;
  const all = query(data, 'transactions').filter(r => r.included === 1 && r.currency === currency && r.date >= start && r.date <= end);
  if (all.some(r => !Number.isSafeInteger(r.cents))) throw Error('财务金额未通过整数分校验。');
  const months = monthsBetween(start,end).map(month => {
    const rows = all.filter(r => r.date.startsWith(month));
    const sum = nature => rows.some(r => r.nature === nature) ? rows.filter(r => r.nature === nature).reduce((s,r) => s+r.cents,0)/100 : null;
    const gross = sum('expense'), refund = sum('refund');
    return { month, records: rows.length, gross, refund, income: sum('income'), net: gross !== null || refund !== null ? rows.reduce((s,r)=>s+(r.nature==='expense'?r.cents:r.nature==='refund'?-r.cents:0),0)/100 : null, unknown: rows.filter(r => ['unknown_in','unknown_out'].includes(r.nature)).length };
  });
  return { start, end, currency, months, latest: months.at(-1), count: all.length, currencies: [...new Set(query(data,'transactions').filter(r => r.included === 1).map(r => r.currency))].sort() };
}
export function investmentModel(data) {
  const accounts = query(data,'accounts');
  if (!accounts.length || accounts.some(r => !finite(r.equity) || !finite(r.total_pnl))) throw Error('投资账户金额不完整，暂不汇总。');
  if (new Set(accounts.map(r=>r.account)).size !== accounts.length) throw Error('账户名称重复，暂不汇总。');
  const history = query(data,'total_history').filter(r=>finite(r.equity) && r.day && finite(r.timestamp)).slice().sort((a,b)=>a.timestamp-b.timestamp);
  const daily = new Map(); for (const row of history) daily.set(row.day,row);
  return { accounts, equity: accounts.reduce((s,r)=>s+r.equity,0), pnl: accounts.reduce((s,r)=>s+r.total_pnl,0), daily: [...daily.values()], generatedAt: data.generatedAt };
}
export function webankModel(data) {
  const report = query(data,'reports').slice().sort((a,b)=>(b.as_of || '').localeCompare(a.as_of || ''))[0];
  if (!report || !finite(report.total_assets) || !Array.isArray(report.categories) || report.categories.some(r=>!finite(r.amount) || r.amount<0)) throw Error('微众资产资料不完整。');
  if (report.categories.reduce((s,r)=>s+Math.round(r.amount*100),0) !== Math.round(report.total_assets*100)) throw Error('微众资产构成未通过核对，暂不显示。');
  return { ...report, categories: report.categories.slice().sort((a,b)=>b.amount-a.amount) };
}
export function travelModel(data, today = todayShanghai()) {
  const trips = query(data,'trips').filter(r=>!['草案','规划','已取消','已移出'].includes(r.period) && /^\d{4}-\d{2}-\d{2}$/.test(r.start || '') && /^\d{4}-\d{2}-\d{2}$/.test(r.end || '')).slice().sort((a,b)=>a.start.localeCompare(b.start));
  const past = trips.filter(r=>r.end<today), upcoming=trips.filter(r=>r.end>=today);
  return { today, past, upcoming, next:upcoming[0], timeline:[...past.slice(-2),...upcoming.slice(0,3)], confirmed:past.filter(r=>r.confirmed===true).length };
}

const sourceDetails = (name,data,body) => `<details class="ov-source"><summary>来源与统计口径</summary><p>${body}</p><p>快照整理 ${esc(time(data.generatedAt))}（上海时间） · <a href="${esc(new URL(`${name}.json`,DATA_BASE).href)}" target="_blank" rel="noopener">查看已发布快照 ↗</a></p></details>`;
const metric = (label,value,unit='',extra='') => `<div class="ov-metric"><span>${esc(label)}</span><strong>${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</strong>${extra ? `<em>${esc(extra)}</em>` : ''}</div>`;
const related = (ids,modules) => `<div class="ov-related"><span>继续关联查看</span>${ids.filter(id=>modules.some(m=>m.id===id&&m.enabled!==false)).map(id=>`<a href="#/${esc(id)}">${esc(modules.find(m=>m.id===id).title)} <span aria-hidden="true">↗</span></a>`).join('')}</div>`;
function table(headers, rows) { return `<details class="ov-values"><summary>查看图表数据</summary><div class="ov-table-wrap"><table><thead><tr>${headers.map(s=>`<th scope="col">${esc(s)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((s,i)=>`<${i?'td':'th scope="row"'}>${esc(s)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div></details>`; }

/* Charts deliberately keep the zero baseline, recorded gaps, and native dates. */
function lineChart(rows, key, series, label, options={}) {
  const w=options.compact?520:680,h=208,l=64,r=18,t=19,b=35, values=rows.flatMap(row=>series.map(s=>row[s.key])).filter(finite);
  if (!values.length) return '<div class="ov-no-chart">当前范围没有可绘制的记录</div>';
  const min=Math.min(0,...values), max=Math.max(0,...values), span=max-min || 1, y=v=>t+(max-v)/span*(h-t-b), x=i=>l+(rows.length===1?.5:i/(rows.length-1))*(w-l-r);
  let out=`<svg class="ov-line-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>`;
  for (let i=0;i<=3;i++) { const v=max-span*i/3, yy=y(v); out+=`<line x1="${l}" x2="${w-r}" y1="${yy}" y2="${yy}" class="ov-gridline"/><text x="${l-9}" y="${yy+4}" text-anchor="end" class="ov-axis">${esc(short(v))}</text>`; }
  out+=`<line x1="${l}" x2="${w-r}" y1="${y(0)}" y2="${y(0)}" class="ov-baseline"/>`;
  for (const s of series) {
    let path='',inSegment=false;
    rows.forEach((row,i)=>{if(!finite(row[s.key])){inSegment=false;return;}path+=`${inSegment?'L':'M'}${x(i).toFixed(2)},${y(row[s.key]).toFixed(2)} `;inSegment=true;});
    if (options.area && series.length===1 && rows.every(row=>finite(row[s.key]))) out+=`<path d="M${x(0)},${y(0)} ${path.replace(/^M/,'L')}L${x(rows.length-1)},${y(0)}Z" fill="${s.color}" fill-opacity=".075"/>`;
    out+=`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dash?'stroke-dasharray="5 5"':''}/>`;
    rows.forEach((row,i)=>{if(!finite(row[s.key]))return;const tip=`${row[key]} · ${s.label} ${fmt(row[s.key])} ${options.unit||''}`;out+=`<g class="ov-chart-point" tabindex="0" role="graphics-symbol" aria-label="${esc(tip)}" data-ov-tip="${esc(tip)}"><circle cx="${x(i)}" cy="${y(row[s.key])}" r="11" fill="transparent"/><circle cx="${x(i)}" cy="${y(row[s.key])}" r="${rows.length>20?2.5:3.5}" fill="${s.color}" stroke="var(--card,#fff)" stroke-width="1.7"/></g>`;});
  }
  const indexes=[...new Set([0, Math.floor((rows.length-1)/3),Math.floor((rows.length-1)*2/3),rows.length-1])];
  for(const i of indexes)out+=`<text x="${x(i)}" y="${h-10}" text-anchor="${i===0?'start':i===rows.length-1?'end':'middle'}" class="ov-axis">${esc(rows[i][key])}</text>`;
  return out+'</svg>';
}
function pnlChart(accounts) {
  const width=520,left=133,right=100,rowH=29,top=8,h=top+accounts.length*rowH+8;
  const low=Math.min(0,...accounts.map(r=>r.total_pnl)),high=Math.max(0,...accounts.map(r=>r.total_pnl)),span=high-low||1,x=v=>left+(v-low)/span*(width-left-right),zero=x(0);
  return `<svg class="ov-pnl-chart" viewBox="0 0 ${width} ${h}" role="img" aria-label="按唯一账户展示平台累计盈亏，平台计价单位"><title>账户累计盈亏 · 平台计价单位</title><line x1="${zero}" x2="${zero}" y1="0" y2="${h}" class="ov-baseline"/>${accounts.map((a,i)=>{const yy=top+i*rowH,xx=x(a.total_pnl),tip=`${a.account} · 平台累计盈亏 ${signed(a.total_pnl)} 平台单位`;return `<g class="ov-chart-point" tabindex="0" role="graphics-symbol" aria-label="${esc(tip)}" data-ov-tip="${esc(tip)}"><title>${esc(tip)}</title><text x="${left-12}" y="${yy+15}" text-anchor="end" class="ov-account-label">${esc(a.account.length>15?`${a.account.slice(0,14)}…`:a.account)}</text><rect x="${Math.min(zero,xx)}" y="${yy+3}" width="${Math.max(1,Math.abs(xx-zero))}" height="15" rx="3" fill="${a.total_pnl<0?'#b58668':'#7d6bd4'}"/><text x="${width-3}" y="${yy+15}" text-anchor="end" class="ov-account-value">${esc(signed(a.total_pnl))}</text></g>`;}).join('')}</svg>`;
}

function renderFinance(data, card) {
  const state={currency:'CNY',range:'12'};
  function render() {
    const model=financeModel(data,state.currency),latest=model.latest, rows=state.range==='all'?model.months:model.months.slice(-12);
    const income=latest.income===null?'暂无记录':fmt(latest.income);
    card.querySelector('.ov-body').innerHTML=`<div class="ov-card-controls"><span class="ov-date">交易资料 ${esc(model.start)} — ${esc(model.end)}</span><label>币种 <select data-ov-currency aria-label="首页财务币种">${model.currencies.map(c=>`<option${c===state.currency?' selected':''}>${esc(c)}</option>`).join('')}</select></label><label class="ov-range-label">范围 <select data-ov-range aria-label="首页财务趋势范围"><option value="12"${state.range==='12'?' selected':''}>近 12 个月</option><option value="all"${state.range==='all'?' selected':''}>全部月份</option></select></label></div>
      <div class="ov-metrics ov-finance-metrics">${metric(`${latest.month} 净消费`,fmt(latest.net),state.currency,'消费减已记录退款')}${metric('消费金额',fmt(latest.gross),state.currency)}${metric('已记录退款',latest.refund===null?'暂无记录':fmt(latest.refund),latest.refund===null?'':state.currency)}${metric('已确认收入',income,latest.income===null?'':state.currency,latest.income===null?'本月无确认收入记录':'按到账性质识别')}</div>
      <div class="ov-finance-charts"><div><div class="ov-chart-heading"><h3>月度消费与退款 · ${esc(state.currency)}</h3><span class="ov-legend"><i style="--mark:#8570d3"></i>消费 <i class="ov-dashed" style="--mark:#b58668"></i>退款</span></div><div class="ov-chart-area">${lineChart(rows,'month',[{key:'gross',label:'消费',color:'#8570d3'},{key:'refund',label:'退款',color:'#b58668',dash:true}],`月度消费与退款，${state.currency}，${rows[0].month}至${rows.at(-1).month}`,{unit:state.currency,compact:true})}<div class="ov-tooltip" role="tooltip" hidden></div></div></div><div><div class="ov-chart-heading"><h3>月度已确认收入 · ${esc(state.currency)}</h3><span class="ov-subtle">独立纵轴</span></div><div class="ov-chart-area">${lineChart(rows,'month',[{key:'income',label:'已确认收入',color:'#438f87'}],`月度已确认收入，${state.currency}，${rows[0].month}至${rows.at(-1).month}`,{unit:state.currency,compact:true})}<div class="ov-tooltip" role="tooltip" hidden></div></div></div></div>
      <p class="ov-note">${latest.month} 截至 ${esc(model.end.slice(5))}，当前月未结束。${latest.unknown ? `本月 ${latest.unknown} 笔资金流性质待核查。` : ''} 空缺表示没有该类记录；账本不能证明完整账户收支。</p>
      ${table(['月份',`消费 ${state.currency}`,`退款 ${state.currency}`,`净消费 ${state.currency}`,`确认收入 ${state.currency}`],rows.map(r=>[r.month,fmt(r.gross),r.refund===null?'无该类记录':fmt(r.refund),fmt(r.net),r.income===null?'无该类记录':fmt(r.income)]))}
      ${sourceDetails('finance',data,'仅 included=1，按整数分和交易日汇总。消费与退款分别识别；还款、分期本金、转账、融资、投资及待核查资金流均不计入消费或确认收入。没有对应性质的记录显示为空缺，不推断实际为零。')}`;
  }
  card.addEventListener('change',event=>{ if(event.target.matches('[data-ov-currency]')){state.currency=event.target.value;render();} if(event.target.matches('[data-ov-range]')){state.range=event.target.value;render();} }); render();
}
function renderInvestment(data,card) {
  const m=investmentModel(data),show=m.daily;
  card.querySelector('.ov-body').innerHTML=`<p class="ov-date">读取 ${esc(time(m.generatedAt))} · 仅 Vergex 连接账户</p><div class="ov-metrics">${metric('账户权益',fmt(m.equity),'平台单位',`${m.accounts.length} 个唯一账户`)}${metric('平台累计盈亏',signed(m.pnl),'平台单位','部分账户历史不完整')}</div>
    <div class="ov-chart-heading"><h3>日末权益轨迹</h3><span class="ov-subtle">平台单位</span></div><div class="ov-chart-area">${lineChart(show,'day',[{key:'equity',label:'账户权益',color:'#8570d3'}],'Vergex日末权益轨迹，平台计价单位',{area:true,unit:'平台单位',compact:true})}<div class="ov-tooltip" role="tooltip" hidden></div></div>
    <div class="ov-chart-heading ov-tight"><h3>账户累计盈亏</h3><span class="ov-subtle">含已实现与未实现</span></div><div class="ov-chart-area">${pnlChart(m.accounts)}<div class="ov-tooltip" role="tooltip" hidden></div></div>
    <p class="ov-note">历史权益受出入金和采样覆盖影响，轨迹不代表投资收益率。源接口未提供统一币种，不能折算或并入人民币资产。</p>
    ${table(['账户','权益（平台单位）','累计盈亏（平台单位）'],m.accounts.map(r=>[r.account,fmt(r.equity),signed(r.total_pnl)]))}
    ${sourceDetails('investment',data,'账户按原看板唯一账户口径汇总，策略共用余额不重复计。日末权益取每个上海日期最后一个已记录样本，最新账户汇总与历史采样时刻可能不同。平台累计盈亏沿用原字段，不与已平仓仓位盈亏混算。')}`;
}
function renderWebank(data,card) {
  const m=webankModel(data),colors=['#8c78d5','#c1b1e7','#a3b9b1','#cbb590','#9baac8','#bac2cd'];
  card.querySelector('.ov-body').innerHTML=`<p class="ov-date">资产截至 ${esc(m.as_of)} · ${esc(m.currency)} · 非今日余额</p><div class="ov-metrics">${metric('微众账户资产',fmt(m.total_assets),m.currency)}${metric('投资收益',finite(m.return_amount)?signed(m.return_amount):'资料不足',finite(m.return_amount)?m.currency:'','缺少可核对的收益口径')}</div>
    <div class="ov-chart-heading"><h3>资产构成</h3><span class="ov-subtle">同一报告期末</span></div>
    <div class="ov-allocation" role="img" aria-label="${esc(m.as_of)}微众资产构成，合计${esc(fmt(m.total_assets))}${esc(m.currency)}">${m.categories.map((r,i)=>`<span style="width:${m.total_assets>0?r.amount/m.total_assets*100:0}%;background:${colors[i%colors.length]}" title="${esc(r.category)} ${esc(fmt(r.amount))} ${esc(m.currency)}"></span>`).join('')}</div>
    <div class="ov-allocation-list">${m.categories.map((r,i)=>`<div><span><i style="--mark:${colors[i%colors.length]}"></i>${esc(r.category)}</span><strong>${esc(fmt(r.amount))}<small>${esc(m.currency)}</small></strong><em>${m.total_assets>0?fmt(r.amount/m.total_assets*100,2)+'%':'占比待补'}</em></div>`).join('')}</div>
    <div class="ov-bank-context"><div><span>前三产品合计占比</span><strong>${esc(fmt(m.top3_weight_pct))}%</strong></div><div><span>报告期间</span><strong>${esc(m.period_start.slice(5))} — ${esc(m.period_end.slice(5))}</strong></div></div>
    <p class="ov-note">仅微众银行 App 账户，不含 We2000。两期资产差额受资金流影响，不能作为投资收益；与财务流水关联查看时保留独立口径。</p>
    ${sourceDetails('webank',data,`${esc(m.source)}，资产分类已按整数分复核至报告总额。前三产品为${esc(m.top3_products.join('、'))}，合计 ${esc(fmt(m.top3_amount))} ${esc(m.currency)}。${esc(m.return_unavailable_reason)} 卡流水不代表完整投资组合的外部资金流。`)}`;
}
function renderTravel(data,card) {
  const m=travelModel(data),n=m.next,travelLabel=n ? (n.start<m.today?'当前旅程':n.start===m.today?'今天开始':'下一程'):'下一程';
  card.querySelector('.ov-body').innerHTML=`<p class="ov-date">资料核查 ${esc(date(data.generatedAt))} · 今日 ${esc(m.today)}</p>
    <div class="ov-next-trip"><span class="ov-trip-symbol" aria-hidden="true">✈</span><div><small>${travelLabel}</small><h3>${n?esc(n.destination):'暂无已收录的未来行程'}</h3><p>${n?`${esc(n.start)} — ${esc(n.end)}`:'未来资料尚待补充'}</p>${n?`<span class="ov-trip-status">${esc(n.status)} · ${esc(n.summary||`${n.flights} 段航班 · ${n.hotels} 笔住宿`)}</span>`:''}</div></div>
    <div class="ov-travel-counts"><span><strong>${m.past.length}</strong> 历史记录</span><span><strong>${m.confirmed}</strong> 本人确认成行</span><span><strong>${m.upcoming.length}</strong> 当前及未来</span></div>
    <div class="ov-chart-heading"><h3>旅程时间线</h3><span class="ov-subtle">近期历史与未来</span></div><ol class="ov-timeline">${m.timeline.map(r=>`<li class="${r.end<m.today?'ov-past':'ov-future'}"><time>${esc(r.start)}</time><div><strong>${esc(r.destination)}</strong><small>${esc(r.status)}${r.end!==r.start?` · 至 ${esc(r.end)}`:''}</small></div></li>`).join('')}</ol>
    <p class="ov-note">预订或日历记录不等于实际成行。草案、规划、取消和已移出记录不参与有效行程计数，平台退改状态仍需核对。</p>
    ${sourceDetails('travel',data,'来自已核对的日历、邮件与本地旅行凭证。按上海“今天”划分历史及未来，起止日期沿用出行当地日期；详情保留当地时区。尚未开启日历或订单实时同步。')}`;
}
function fileSummary(id,data) {
  if(data.status!=='ready')return { id,status:'unavailable',reason:data.reason || '来源尚未同步',generatedAt:data.generatedAt };
  if(!Array.isArray(data.entries))throw Error('资料索引结构不完整。');
  return {id,status:'ready',count:data.entries.filter(r=>r.directory!==true).length,dirs:data.entries.filter(r=>r.directory===true).length,groups:new Set(data.entries.map(r=>r.group || '未分类')).size,generatedAt:data.generatedAt};
}

export function mountOverview(container, {modules=[]}={}) {
  if (!(container instanceof Element)) throw Error('首页摘要需要有效容器。');
  let destroyed=false; const controllers=new Set(), cards=new Map();
  const definitions=[{id:'finance',label:'财务总览',icon:'◫',wide:true,subtitle:'消费、收入与资金流，一起看清'},{id:'investment',label:'投资表现',icon:'↗',subtitle:'账户权益与盈亏的同屏视图'},{id:'webank',label:'微众资产',icon:'▤',subtitle:'资产构成与独立报告口径'},{id:'travel',label:'旅行手记',icon:'✈',subtitle:'下一程与过去的足迹'},{id:'files',label:'资料与收藏',icon:'▱',subtitle:'知识、附件与收藏的统一入口'}];
  const enabled=id=>modules.length===0 || modules.some(m=>m.id===id && m.enabled!==false);
  const active=definitions.filter(d=>d.id==='files'?['icloud','onedrive','outlook','mail','youtube'].some(enabled):enabled(d.id));
  container.classList.add('ov-overview'); container.innerHTML=`<div class="ov-overview-status"><span>各领域摘要 · 数据截止见各卡片</span><span class="ov-snapshot-label"><i></i> 已发布快照</span></div><div class="ov-overview-grid">${active.map(d=>`<article class="ov-card${d.wide?' ov-wide':''} ov-${d.id}" data-ov-card="${d.id}" aria-label="${esc(d.label)}首页摘要"><div class="ov-card-top"><div class="ov-card-title"><span class="ov-icon" aria-hidden="true">${d.icon}</span><div><h2>${esc(d.label)}</h2><p>${esc(d.subtitle)}</p></div></div>${d.id!=='files'?`<a class="ov-enter" href="#/${d.id}" aria-label="进入${esc(d.label)}">查看详情 <span aria-hidden="true">↗</span></a>`:''}</div><div class="ov-body"><div class="ov-loading" role="status"><span></span>正在读取已发布数据…</div></div>${['finance','webank','investment'].includes(d.id)?related(['finance','webank','investment'].filter(id=>id!==d.id),modules):''}</article>`).join('')}</div><p class="ov-global-note">每个领域保留自己的来源与数据截止。不同币种、平台单位及统计日期的资产分别展示。</p>`;
  for(const card of container.querySelectorAll('[data-ov-card]'))cards.set(card.dataset.ovCard,card);
  async function fetchData(id) {
    const controller=new AbortController();controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),20000);
    try { const response=await fetch(new URL(`${id}.json`,DATA_BASE),{signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'}); if(!response.ok)throw Error(`HTTP ${response.status}，快照暂时无法读取。`);const result=await response.json();if(!result || typeof result!=='object')throw Error('快照格式不完整。');return result; }
    catch(error){if(error.name==='AbortError')throw Error('读取超时，请重试。');if(error instanceof SyntaxError)throw Error('快照 JSON 无效，请稍后重试。');throw error;}
    finally{clearTimeout(timeout);controllers.delete(controller);}
  }
  async function load(id) {
    const card=cards.get(id);if(!card||destroyed)return;
    card.querySelector('.ov-body').innerHTML='<div class="ov-loading" role="status"><span></span>正在读取已发布数据…</div>';
    try {const data=await fetchData(id);if(destroyed)return;({finance:renderFinance,investment:renderInvestment,webank:renderWebank,travel:renderTravel}[id])(data,card);}
    catch(error){if(destroyed)return;card.querySelector('.ov-body').innerHTML=`<div class="ov-error" role="status"><strong>这份数据暂时无法显示</strong><p>${esc(error.message || '网络读取失败')}</p><button type="button" data-ov-retry="${id}">重新读取</button></div>`;}
  }
  const fileIds=['icloud','outlook','youtube','onedrive','mail'].filter(enabled),fileStates=new Map();
  function renderFiles(){
    const card=cards.get('files');if(!card||destroyed)return;
    const items=fileIds.map(id=>{const s=fileStates.get(id),m=modules.find(m=>m.id===id),names={icloud:'iCloud 资料',outlook:'Outlook 附件',youtube:'YouTube 收藏',onedrive:'OneDrive 资料',mail:'邮件归档'};return `<div class="ov-file-item"><a href="#/${id}" class="ov-file-label"><span class="ov-file-icon ov-file-${id}" aria-hidden="true">${esc(m?.icon || {icloud:'☁',outlook:'✉',youtube:'▷',onedrive:'▱',mail:'▤'}[id])}</span><span><strong>${esc(names[id])}</strong><small>${s?.status==='ready'?`${fmt(s.groups,0)} 个分类 · ${esc(date(s.generatedAt))}`:s?.status==='unavailable'?'源索引尚未同步':s?.status==='error'?'快照读取失败':'读取中…'}</small></span><span class="ov-file-count">${s?.status==='ready'?`${fmt(s.count,0)}<small>${id==='youtube'?'条收藏':'份索引'}</small>`:s?.status==='unavailable'?'<em>待同步</em>':s?.status==='error'?'<em>读取失败</em>':'…'} <b aria-hidden="true">↗</b></span></a>${s?.reason?`<p class="ov-file-reason">${esc(s.reason)}</p>`:''}${s?.status==='error'?`<button class="ov-file-retry" type="button" data-ov-file-retry="${id}">重新读取</button>`:''}</div>`;}).join('');
    card.querySelector('.ov-body').innerHTML=`<p class="ov-date">数量来自已发布索引，点击条目进入同一空间</p><div class="ov-file-list">${items}</div><div class="ov-files-footer"><span>索引可搜索，原件保留在原位置</span><button type="button" data-ov-files-refresh>重读快照 ↻</button></div><p class="ov-note">未同步来源保留待同步状态，不计为 0 份资料。这里重读的是已发布快照，不会触发云盘或邮箱实时同步。</p><details class="ov-source"><summary>来源与统计口径</summary><p>直接读取 iCloud、Outlook、YouTube、OneDrive 与邮件归档的既有 JSON。数量为非目录索引条目数，不跨来源去重；收藏数量为书签数，分类名按原索引保留。</p><p>源索引日期显示在各条目下方。云端占位文件尚未同步时，保留原始原因。</p></details>`;
  }
  async function loadFile(id){fileStates.delete(id);renderFiles();try{const data=await fetchData(id);fileStates.set(id,fileSummary(id,data));}catch(error){fileStates.set(id,{status:'error',reason:error.message||'网络读取失败'});}renderFiles();}
  function click(event){const r=event.target.closest('[data-ov-retry]'),f=event.target.closest('[data-ov-file-retry]');if(r)load(r.dataset.ovRetry);if(f)loadFile(f.dataset.ovFileRetry);if(event.target.closest('[data-ov-files-refresh]'))Promise.all(fileIds.map(loadFile));}
  function tip(event){const target=event.target.closest?.('[data-ov-tip]');if(!target)return;const area=target.closest('.ov-chart-area'),tooltip=area?.querySelector('.ov-tooltip');if(!tooltip)return;tooltip.textContent=target.dataset.ovTip;tooltip.hidden=false;const rect=area.getBoundingClientRect(),point=target.getBoundingClientRect();tooltip.style.left=`${Math.max(8,Math.min(rect.width-210,point.x-rect.x))}px`;tooltip.style.top=`${Math.max(4,point.y-rect.y-32)}px`;}
  function hideTip(event){if(event.relatedTarget?.closest?.('[data-ov-tip]'))return;for(const el of container.querySelectorAll('.ov-tooltip'))el.hidden=true;}
  container.addEventListener('click',click);container.addEventListener('pointerover',tip);container.addEventListener('focusin',tip);container.addEventListener('pointerout',hideTip);container.addEventListener('focusout',hideTip);
  const ready=Promise.all([...active.filter(d=>d.id!=='files').map(d=>load(d.id)),...(cards.has('files')?fileIds.map(loadFile):[])]);
  return { ready, destroy(){destroyed=true;for(const controller of controllers)controller.abort();container.removeEventListener('click',click);container.removeEventListener('pointerover',tip);container.removeEventListener('focusin',tip);container.removeEventListener('pointerout',hideTip);container.removeEventListener('focusout',hideTip);container.replaceChildren();} };
}
