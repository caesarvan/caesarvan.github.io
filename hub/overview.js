/* Life OS overview: read the same published source files as each detailed space. */
const DATA_BASE = new URL('./data/', import.meta.url);
const successfulData = new Map();
const requestVersions = new Map();
const CACHE_TTL = 60000;
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


function renderHousehold(data,card) {
  if(data.schemaVersion!=='household-budget/1.0'||data.members?.map(x=>x.name).join('|')!=='樊高一格|黄宇辰'||data.sharedWallet?.contributionRateBps!==5000)throw Error('共同预算资料结构不完整。');
  const rows=query(data,'monthly').map(r=>({month:r.month,fg:Number.isSafeInteger(r.fgCents)?r.fgCents/100:null,hyc:Number.isSafeInteger(r.hycCents)?r.hycCents/100:null}));
  const p=data.sharedWallet.proposal;
  const cents=[p.diningPerDayCents*p.commonDays,p.transportPerReunionCents*p.reunions,p.activityPerTimeCents*p.activities,p.commonConsumablesCents,p.contingencyCents];
  if(cents.some(v=>!Number.isSafeInteger(v)||v<0)||!Array.isArray(p.reserveRows)||p.reserveRows.some(r=>!Number.isSafeInteger(r.cents)||r.cents<0))throw Error('共同预算金额不完整。');
  const routine=cents.reduce((a,b)=>a+b,0),reserve=p.reserveRows.reduce((a,b)=>a+b.cents,0);
  card.querySelector('.ov-body').innerHTML=`<p class="ov-date">用户自报更新 2026-11-04 · 通常合计缴入约20,000元，流水核验与共同消费基线仍待核</p>
    <div class="ov-metrics">${metric('用户自报合计月缴入',fmt(data.sharedWallet.reportedContributionTotalCents/100),'CNY','通常各约10,000；未独立流水核验')}${metric('共同常规试算',fmt(routine/100),'CNY',`${p.commonDays}个共同日、${p.reunions}次相聚的提案`)}${metric('共同专项预留试算',fmt(reserve/100),'CNY','未来消费准备，不当自由储蓄')}</div>
    <p class="ov-note"><strong>结论：约20,000元共同缴入，应先定消费与旅行计划，再定可留存金额。</strong>常规试算7,300、专项试算5,000后，尚有约7,700元待扣未覆盖义务与周转金缺口；旅行每月3,000仅备款3.6万元/年。若从零均摊备足既有全年旅行上限10万元，常规加专项需约17,633.33，剩约2,366.67待扣义务。上限不要求花满，两套均为提案，不能称已实现储蓄。</p>
    <div class="ov-chart-heading"><h3>双方已记录消费 · 历史参考 · CNY</h3><span class="ov-legend"><i style="--mark:#278774"></i>樊高一格 <i style="--mark:#426fd0"></i>黄宇辰</span></div>
    <div class="ov-chart-area">${lineChart(rows,'month',[{key:'fg',label:'樊高一格',color:'#278774'},{key:'hyc',label:'黄宇辰',color:'#426fd0'}],'双方已记录消费历史，包含个人用途，非小荷包消费基线',{unit:'CNY'})}<div class="ov-tooltip" role="tooltip" hidden></div></div>
    <p class="ov-note">樊高一格记录截至10/28，黄宇辰截至11/3。历史28,899.20元月均包含个人用途，原4,899.20元比较差额不能作为小荷包储蓄；共同池流水识别及家庭抵销仍未完成。房贷车贷与樊高一格当前月租5,450由樊高一格个人承担；黄宇辰月租3,000仅作成本参考，其至2027年5月租金已由樊高一格在2026年5月预付，覆盖期内当前待付款为0，不重复扣共同池。</p>
    <p class="ov-note"><strong>租金预付更正：当前月租现金待付合计5,450元。</strong>试行共同安排加当前待付租金为17,750元，距24,000元现金预算尚余6,250元；满额旅行备款口径合计23,083.33元，尚余916.67元，均需再核个人生活、贷款等现金支出。已付租金保留历史付款与按租期成本，不当新增收入或实际储蓄；预付总额与原交易尚未匹配。</p>
    ${table(['月份','樊高一格 CNY','黄宇辰 CNY'],rows.map(r=>[r.month,fmt(r.fg),fmt(r.hyc)]))}
    ${sourceDetails('household-budget',data,'此前全部已有财务资料归属樊高一格，本次支付及银行三份归属黄宇辰。用户确认双方各缴税后实收50%、通常各缴约10000元，共同消费使用小荷包。沿用10月19日已记录约定：超过100元评审，黄宇辰15日、樊高一格30日缴入，周转金目标余额5000元（非已核余额或每月支出），共同旅行全年上限100000元（非必须支出）。缴入是内部转账；个人支出移出共同池不会自动减少全家总消费。共同常规、专项与尚未覆盖的共同固定应付分别处理；未知不填零，预留和真实储蓄不重复计。')}`;
}

const FINANCE_MEMBERS_KEY = 'lifeos-finance-members';
const FINANCE_MEMBERS = [{id:'fg',name:'樊高一格',key:'fgCents',color:'#278774'},{id:'hyc',name:'黄宇辰',key:'hycCents',color:'#426fd0'}];
function storedFinanceMembers() {
  try {
    const value=JSON.parse(localStorage.getItem(FINANCE_MEMBERS_KEY));
    if(Array.isArray(value)&&value.every(id=>['fg','hyc'].includes(id))&&new Set(value).size===value.length)return FINANCE_MEMBERS.filter(m=>value.includes(m.id)).map(m=>m.id);
  } catch (_) { /* Browser storage may be unavailable; keep the default view usable. */ }
  return ['fg','hyc'];
}
/** The selected members share one published monthly source; missing amounts stay unknown. */
export function memberFinanceModel(data, selected=['fg','hyc'], range='12') {
  if(data?.schemaVersion!=='household-budget/1.0'||!Array.isArray(selected)||selected.some(id=>!FINANCE_MEMBERS.some(m=>m.id===id))||new Set(selected).size!==selected.length)throw Error('财务成员或资料结构无效。');
  const members=FINANCE_MEMBERS.filter(m=>selected.includes(m.id));
  const source=query(data,'monthly'); let previous='';
  for(const row of source){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month)||row.month<=previous)throw Error('财务月份须唯一且有序。');
    previous=row.month;
    if(FINANCE_MEMBERS.some(m=>row[m.key]!==null&&!Number.isSafeInteger(row[m.key])))throw Error('财务金额未通过整数分校验。');
  }
  const sum=values=>{const result=values.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(result))throw Error('财务合计超出金额范围。');return result;};
  const selectedRows=range==='all'?source:source.slice(-12);
  const rows=selectedRows.map(row=>{
    const amounts=members.map(m=>row[m.key]);
    return {month:row.month,fg:members.some(m=>m.id==='fg')&&row.fgCents!==null?row.fgCents/100:null,hyc:members.some(m=>m.id==='hyc')&&row.hycCents!==null?row.hycCents/100:null,net:members.length&&amounts.every(Number.isSafeInteger)?sum(amounts)/100:null,knownCents:members.length&&amounts.some(Number.isSafeInteger)?sum(amounts.filter(Number.isSafeInteger)):null};
  });
  const available=rows.filter(r=>r.net!==null),known=rows.filter(r=>r.knownCents!==null);
  return {members,rows,latest:rows.at(-1),knownTotal:known.length?sum(known.map(r=>r.knownCents))/100:null,mean:available.length?sum(available.map(r=>Math.round(r.net*100)))/available.length/100:null,availableMonths:available.length,missingMonths:rows.length-available.length};
}
function renderFinance(data, card) {
  const state={members:storedFinanceMembers(),range:'12'};
  const body=card.querySelector('.ov-body');
  function render() {
    const model=memberFinanceModel(data,state.members,state.range),members=model.members,rows=model.rows;
    const selection=members.length===2?'all':members[0]?.id||'none',names=members.map(m=>m.name).join('、');
    const controls=`<div class="ov-card-controls ov-member-controls"><label>成员视角 <select data-ov-member aria-label="首页财务成员视角">${selection==='none'?'<option value="none" selected disabled>未选择成员</option>':''}<option value="all"${selection==='all'?' selected':''}>全选</option>${FINANCE_MEMBERS.map(m=>`<option value="${m.id}"${selection===m.id?' selected':''}>${m.name}</option>`).join('')}</select></label><label>范围 <select data-ov-range aria-label="首页财务趋势范围"><option value="12"${state.range==='12'?' selected':''}>近 12 个月</option><option value="all"${state.range==='all'?' selected':''}>全部月份</option></select></label><span class="ov-member-scope" role="status" aria-live="polite">${esc(names||'请选择成员')}</span></div>`;
    if(!members.length){body.innerHTML=controls+'<div class="ov-no-chart">选择姓名或全选后查看财务记录</div>';return;}
    const sourceDate=id=>data.sources?.find(s=>s.id===id)?.asOf;
    const coverage=members.map(m=>`${m.name}截至 ${date(sourceDate(m.id==='fg'?'fg-primary':'hyc-channels'))}`).join(' · ');
    const series=members.map(m=>({key:m.id,label:m.name,color:m.color}));
    if(members.length===2)series.push({key:'net',label:'双方可合计月份小计',color:'#8570d3',dash:true});
    const headers=['月份',...members.map(m=>m.name+' CNY'),...(members.length===2?['双方小计 CNY']:[])];
    body.innerHTML=controls+`<p class="ov-date">${esc(coverage)} · CNY</p>
      <div class="ov-metrics ov-finance-metrics">${metric('已知金额记录小计',fmt(model.knownTotal),'CNY','所选成员、所示月份的已知金额')}${metric('可合计月份月均',fmt(model.mean),'CNY',`${model.availableMonths}个月有全部所选成员金额`)}${metric(`${model.latest?.month||'最近月份'} 净消费`,fmt(model.latest?.net),'CNY',model.latest?.net===null?'所选成员资料有缺口':'已记录支付减退款')}${metric('可合计月份',`${model.availableMonths} / ${rows.length}`,'',model.missingMonths?'缺资料保留空缺':'有记录不代表账户覆盖完整')}</div>
      <div class="ov-chart-heading"><h3>所选成员月度净消费 · CNY</h3><span class="ov-legend ov-member-legend">${series.map(s=>`<span><i${s.dash?' class="ov-dashed"':''} style="--mark:${s.color}"></i>${esc(s.label)}</span>`).join('')}</span></div>
      <div class="ov-chart-area">${lineChart(rows,'month',series,`${names}月度已记录净消费，人民币元；资料空缺不计为零`,{unit:'CNY'})}<div class="ov-tooltip" role="tooltip" hidden></div></div>
      <p class="ov-note">${model.missingMonths?`所示${rows.length}个月中，${model.missingMonths}个月缺少所选成员金额；这些月份不绘制双方小计、不计入可合计月份月均。`:''}已知金额记录小计保留缺资料月份中仍已取得的金额。各账户覆盖不完整，家庭代付、报销及重复抵销尚未完成，不代表家庭最终实际消费。</p>
      ${table(headers,rows.map(r=>[r.month,...members.map(m=>fmt(r[m.id])),...(members.length===2?[fmt(r.net)]:[])]))}
      <p class="ov-note"><a href="#/finance">按当前成员查看财务概览与分类 ↗</a> · <a href="#/household-budget">家庭共同预算 ↗</a></p>
      ${sourceDetails('household-budget',data,'按所选成员读取已发布月度净消费，使用整数分合计；退款保留发生月份。任一所选成员缺少金额时，当月小计保留未知，不用另一人的金额替代。中国银行资金证据不重复加入渠道消费。共同预算、个人投资和不同时点的银行余额各自保留独立口径。')}`;
  }
  card.onchange=event=>{
    if(event.target.matches('[data-ov-member]')){
      state.members=event.target.value==='all'?['fg','hyc']:[event.target.value];
      try{localStorage.setItem(FINANCE_MEMBERS_KEY,JSON.stringify(state.members));}catch(_){}
      render();
    }else if(event.target.matches('[data-ov-range]')){state.range=event.target.value;render();}
  };
  render();
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
export function fileSummary(id,data) {
  if(data.status!=='ready')return { id,status:'unavailable',reason:data.reason || '来源尚未同步',generatedAt:data.generatedAt };
  if(!Array.isArray(data.entries))throw Error('资料索引结构不完整。');
  return {id,status:'ready',count:data.entries.filter(r=>r.directory!==true).length,dirs:data.entries.filter(r=>r.directory===true).length,groups:new Set(data.entries.map(r=>r.group || '未分类')).size,generatedAt:data.generatedAt};
}

export function mountOverview(container, {modules=[]}={}) {
  if (!(container instanceof Element)) throw Error('首页摘要需要有效容器。');
  let destroyed=false; const controllers=new Set(), cards=new Map();
  const definitions=[{id:'household-budget',label:'家庭共同预算',icon:'⌂',wide:true,subtitle:'樊高一格与黄宇辰 · 共同筹资、消费与留存'},{id:'finance',label:'家庭财务',icon:'◫',wide:true,subtitle:'按姓名或全选，查看已记录消费'},{id:'investment',label:'樊高一格投资',icon:'↗',subtitle:'账户权益与盈亏的同屏视图'},{id:'webank',label:'樊高一格微众资产',icon:'▤',subtitle:'资产构成与独立报告口径'},{id:'travel',label:'旅行手记',icon:'✈',subtitle:'下一程与过去的足迹'},{id:'files',label:'资料与收藏',icon:'▱',subtitle:'知识、附件与收藏的统一入口'}];
  const enabled=id=>modules.length===0 || modules.some(m=>m.id===id && m.enabled!==false);
  const active=definitions.filter(d=>d.id==='files'?['icloud','onedrive','outlook','mail','youtube'].some(enabled):enabled(d.id));
  container.classList.add('ov-overview'); container.innerHTML=`<div class="ov-overview-status"><span>各领域摘要 · 数据截止见各卡片</span><span class="ov-snapshot-label"><i></i> 已发布快照</span></div><div class="ov-overview-grid">${active.map(d=>`<article class="ov-card${d.wide?' ov-wide':''} ov-${d.id}" data-ov-card="${d.id}" aria-label="${esc(d.label)}首页摘要"><div class="ov-card-top"><div class="ov-card-title"><span class="ov-icon" aria-hidden="true">${d.icon}</span><div><h2>${esc(d.label)}</h2><p>${esc(d.subtitle)}</p></div></div>${d.id!=='files'?`<a class="ov-enter" href="#/${d.id}" aria-label="进入${esc(d.label)}">查看详情 <span aria-hidden="true">↗</span></a>`:''}</div><div class="ov-body"><div class="ov-loading" role="status"><span></span>正在读取已发布数据…</div></div>${['finance','webank','investment'].includes(d.id)?related(['finance','webank','investment'].filter(id=>id!==d.id),modules):''}</article>`).join('')}</div><p class="ov-global-note">每个领域保留自己的来源与数据截止。不同币种、平台单位及统计日期的资产分别展示。</p>`;
  for(const card of container.querySelectorAll('[data-ov-card]'))cards.set(card.dataset.ovCard,card);
  async function fetchData(id,{force=false}={}) {
    if(force)successfulData.delete(id);
    const cached=successfulData.get(id);
    if(cached && Date.now()-cached.at<CACHE_TTL)return cached.data;
    const version=(requestVersions.get(id)||0)+1;requestVersions.set(id,version);
    const controller=new AbortController();controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),45000);
    try { const response=await fetch(new URL(`${id}.json`,DATA_BASE),{signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-cache'}); if(!response.ok)throw Error(`HTTP ${response.status}，快照暂时无法读取。`);const result=await response.json();if(!result || typeof result!=='object')throw Error('快照格式不完整。');if(!destroyed && requestVersions.get(id)===version)successfulData.set(id,{data:result,at:Date.now()});return result; }
    catch(error){if(error.name==='AbortError')throw Error('读取超时，请重试。');if(error instanceof SyntaxError)throw Error('快照 JSON 无效，请稍后重试。');throw error;}
    finally{clearTimeout(timeout);controllers.delete(controller);}
  }
  async function load(id,force=false) {
    const card=cards.get(id);if(!card||destroyed)return;
    card.querySelector('.ov-body').innerHTML='<div class="ov-loading" role="status"><span></span>正在读取已发布数据…</div>';
    try {const data=await fetchData(id==='finance'?'household-budget':id,{force});if(destroyed)return;({'household-budget':renderHousehold,finance:renderFinance,investment:renderInvestment,webank:renderWebank,travel:renderTravel}[id])(data,card);}
    catch(error){successfulData.delete(id==='finance'?'household-budget':id);if(destroyed)return;card.querySelector('.ov-body').innerHTML=`<div class="ov-error" role="status"><strong>这份数据暂时无法显示</strong><p>${esc(error.message || '网络读取失败')}</p><button type="button" data-ov-retry="${id}">重新读取</button></div>`;}
  }
  const fileIds=['icloud','outlook','youtube','onedrive','mail'].filter(enabled),fileStates=new Map();
  function renderFiles(){
    const card=cards.get('files');if(!card||destroyed)return;
    const items=fileIds.map(id=>{const s=fileStates.get(id),m=modules.find(m=>m.id===id),names={icloud:'iCloud 资料',outlook:'Outlook 附件',youtube:'YouTube 收藏',onedrive:'OneDrive 资料',mail:'邮件归档'};return `<div class="ov-file-item"><a href="#/${id}" class="ov-file-label"><span class="ov-file-icon ov-file-${id}" aria-hidden="true">${esc(m?.icon || {icloud:'☁',outlook:'✉',youtube:'▷',onedrive:'▱',mail:'▤'}[id])}</span><span><strong>${esc(names[id])}</strong><small>${s?.status==='ready'?`索引更新 ${esc(date(s.generatedAt))}`:s?.status==='unavailable'?'源索引尚未同步':s?.status==='error'?'快照读取失败':'读取中…'}</small></span><span class="ov-file-count">${s?.status==='ready'?`${fmt(s.count,0)}<small>${id==='youtube'?'条收藏':'份索引'}</small>`:s?.status==='unavailable'?'<em>待同步</em>':s?.status==='error'?'<em>读取失败</em>':'…'} <b aria-hidden="true">↗</b></span></a>${s?.reason?`<p class="ov-file-reason">${esc(s.reason)}</p>`:''}${s?.status==='error'?`<button class="ov-file-retry" type="button" data-ov-file-retry="${id}">重新读取</button>`:''}</div>`;}).join('');
    card.querySelector('.ov-body').innerHTML=`<p class="ov-date">数量来自已发布数据目录，点击条目查看完整索引</p><div class="ov-file-list">${items}</div><div class="ov-files-footer"><span>索引可搜索，原件保留在原位置</span><button type="button" data-ov-files-refresh>重读快照 ↻</button></div><p class="ov-note">未同步来源保留待同步状态，不计为 0 份资料。这里重读的是已发布目录，不会触发云盘或邮箱实时同步。</p><details class="ov-source"><summary>来源与统计口径</summary><p>首页读取 datasets.json 中各来源的状态、记录数与索引日期，不下载完整索引。数量沿用原目录 records 字段，不跨来源去重；进入详情后再加载完整资料或收藏索引。</p><p>源索引日期显示在各条目下方。云端占位文件尚未同步时，保留原始原因。<a href="${esc(new URL('datasets.json',DATA_BASE).href)}" target="_blank" rel="noopener">查看已发布数据目录 ↗</a></p></details>`;
  }
  let filesRequest=0;
  async function loadFiles(force=false){
    const request=++filesRequest;fileStates.clear();renderFiles();
    try{
      const catalog=await fetchData('datasets',{force});if(destroyed||request!==filesRequest)return;
      if(!Array.isArray(catalog.datasets))throw Error('数据目录结构不完整。');
      for(const id of fileIds){
        const row=catalog.datasets.find(row=>row.id===id);
        if(!row){fileStates.set(id,{status:'error',reason:'数据目录尚未登记此来源。'});continue;}
        if(row.status!=='ready'){fileStates.set(id,{id,status:'unavailable',reason:row.reason||'来源尚未同步',generatedAt:row.generatedAt});continue;}
        if(!Number.isSafeInteger(row.records)||row.records<0){fileStates.set(id,{status:'error',reason:'数据目录未提供有效记录数。'});continue;}
        fileStates.set(id,{id,status:'ready',count:row.records,generatedAt:row.generatedAt});
      }
    }catch(error){successfulData.delete('datasets');if(destroyed||request!==filesRequest)return;for(const id of fileIds)fileStates.set(id,{status:'error',reason:error.message||'网络读取失败'});}
    renderFiles();
  }
  function click(event){const r=event.target.closest('[data-ov-retry]'),f=event.target.closest('[data-ov-file-retry]');if(r)load(r.dataset.ovRetry,true);if(f||event.target.closest('[data-ov-files-refresh]'))loadFiles(true);}
  function tip(event){const target=event.target.closest?.('[data-ov-tip]');if(!target)return;const area=target.closest('.ov-chart-area'),tooltip=area?.querySelector('.ov-tooltip');if(!tooltip)return;tooltip.textContent=target.dataset.ovTip;tooltip.hidden=false;const rect=area.getBoundingClientRect(),point=target.getBoundingClientRect();tooltip.style.left=`${Math.max(8,Math.min(rect.width-210,point.x-rect.x))}px`;tooltip.style.top=`${Math.max(4,point.y-rect.y-32)}px`;}
  function hideTip(event){if(event.relatedTarget?.closest?.('[data-ov-tip]'))return;for(const el of container.querySelectorAll('.ov-tooltip'))el.hidden=true;}
  container.addEventListener('click',click);container.addEventListener('pointerover',tip);container.addEventListener('focusin',tip);container.addEventListener('pointerout',hideTip);container.addEventListener('focusout',hideTip);
  const ready=Promise.all([...active.filter(d=>d.id!=='files').map(d=>load(d.id)),...(cards.has('files')?[loadFiles()]:[])]);
  return { ready, destroy(){destroyed=true;for(const controller of controllers)controller.abort();container.removeEventListener('click',click);container.removeEventListener('pointerover',tip);container.removeEventListener('focusin',tip);container.removeEventListener('pointerout',hideTip);container.removeEventListener('focusout',hideTip);container.replaceChildren();} };
}
