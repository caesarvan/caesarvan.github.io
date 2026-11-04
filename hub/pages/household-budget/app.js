const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=c=>Number.isSafeInteger(c)?new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100):'缺资料';
const short=c=>Math.abs(c)>=1000000?(c/1000000).toFixed(1)+'万':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(c/100);
const valid=Number.isSafeInteger;
let data,monthly=[],currentMonthly=null,loadSequence=0,loadController=null;
export const LOAD_TIMEOUT_MS=15000;
const table=(heads,rows)=>'<table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map((v,i)=>'<td'+(i?' class="number"':'')+'>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
const metric=(label,value,note='')=>'<div class="metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>';
const sum=values=>{const total=values.reduce((a,b)=>a+b,0);if(!valid(total))throw Error('金额合计超出整数分范围');return total;};
const median=values=>{const v=values.slice().sort((a,b)=>a-b);return v.length?Math.round(v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2):null;};
const monthValid=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const memberName=member=>member==='fg'?'樊高一格':member==='hyc'?'黄宇辰':'双方记录小计';
const bothCents=r=>valid(r.fgCents)&&valid(r.hycCents)?sum([r.fgCents,r.hycCents]):null;
const cellAmount=c=>valid(c)?(c/100).toFixed(2):'缺资料';
function calendarDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
function timestamp(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&calendarDate(value.slice(0,10))&&Number.isFinite(Date.parse(value));}
export function validateSnapshot(next){
  const require=(condition,label)=>{if(!condition)throw Error('快照校验失败：'+label);};
  const text=value=>typeof value==='string'&&value.trim().length>0;
  const rows=(key)=>{const value=next?.queries?.[key]?.rows;require(Array.isArray(value)&&value.length>0,key+'行缺失');return value;};
  require(next?.schemaVersion==='household-budget/1.0'&&next.id==='household-budget','版本或模块');
  require(timestamp(next.generatedAt),'生成时间');
  require(Array.isArray(next.members)&&next.members.length===2&&next.members[0]?.id==='fg'&&next.members[0]?.name==='樊高一格'&&next.members[1]?.id==='hyc'&&next.members[1]?.name==='黄宇辰','成员');
  const context=next.context;require(context?.currency==='CNY','仅支持人民币整数分');
  require(valid(context.baselineMonthlyCents)&&context.baselineMonthlyCents>0,'月均基线');
  require(monthValid(context.comparisonStart)&&monthValid(context.comparisonEnd)&&context.comparisonStart<=context.comparisonEnd,'基线期间');
  require(calendarDate(context.analysisDate)&&calendarDate(context.ownershipConfirmedAt)&&typeof context.householdReconciliationComplete==='boolean','分析日期与核对状态');
  const months=rows('monthly');let previous=null;
  for(const row of months){require(monthValid(row.month)&&(previous===null||row.month>previous),'月份唯一且有序');if(previous){const [year,month]=previous.split('-').map(Number);const following=month===12?(year+1)+'-01':year+'-'+String(month+1).padStart(2,'0');require(row.month===following,'月份缺口须显性保留');}previous=row.month;for(const key of ['fgCents','hycCents'])require(row[key]===null||valid(row[key]),key+'须为整数分或null');bothCents(row);}
  require(months.some(r=>r.month===context.comparisonStart)&&months.some(r=>r.month===context.comparisonEnd),'基线期间覆盖');
  const baseline=monthlyModel(months,'all',context.comparisonStart,context.comparisonEnd);require(baseline.missingMonths===0&&baseline.mean===context.baselineMonthlyCents,'月均基线与月表不一致');
  const categories=rows('categories'),categoryKeys=new Set();
  for(const row of categories){require(['fg','hyc'].includes(row.member)&&text(row.category)&&valid(row.valueCents),'分类金额');require(row.basis===(row.member==='fg'?'gross':'net_linked_refund'),'分类口径');const key=row.member+'|'+row.category;require(!categoryKeys.has(key),'类别重复');categoryKeys.add(key);}
  for(const member of ['fg','hyc']){const selected=categories.filter(r=>r.member===member);require(selected.length>0,'成员分类缺失');sum(selected.map(r=>r.valueCents));}
  const budgets=rows('budgets'),budgetKeys=new Set();
  for(const row of budgets){require(text(row.label)&&[row.budgetCents,row.routineCents,row.reserveCents].every(v=>valid(v)&&v>=0),'预算金额');require(!budgetKeys.has(row.budgetCents),'预算方案重复');budgetKeys.add(row.budgetCents);require(sum([row.routineCents,row.reserveCents])===row.budgetCents&&row.differenceCents===context.baselineMonthlyCents-row.budgetCents,'预算拆分或差额');scenarioModel(context.baselineMonthlyCents,row.budgetCents);}
  const projections=rows('projections'),projectionKeys=new Set();
  for(const row of projections){const key=row.budgetCents+'|'+row.months;require(budgetKeys.has(row.budgetCents)&&[3,6,12].includes(row.months)&&!projectionKeys.has(key),'情景期间或重复');require(valid(row.differenceCents)&&row.differenceCents===(context.baselineMonthlyCents-row.budgetCents)*row.months,'累计差额');projectionKeys.add(key);}
  require(projections.length===budgets.length*3,'情景期间不完整');
  for(const row of rows('management'))require([row.label,row.value,row.note].every(text),'管理说明');
  require(Array.isArray(next.sources)&&next.sources.length>0,'来源');const sourceIds=new Set();
  for(const source of next.sources){require([source.id,source.label,source.coverage].every(text)&&(calendarDate(source.asOf)||timestamp(source.asOf))&&!sourceIds.has(source.id),'来源字段');sourceIds.add(source.id);}
  for(const row of rows('summary'))require(text(row.key)&&valid(row.cents),'汇总金额');
  require(Array.isArray(next.methods)&&next.methods.every(text),'方法说明');
  return next;
}
export function monthlyModel(rows,member,start,end){
  if(!['fg','hyc','all'].includes(member)||!monthValid(start)||!monthValid(end)||start>end)throw Error('成员或月份范围无效');
  const selected=rows.filter(r=>r.month>=start&&r.month<=end);
  const value=r=>member==='fg'?r.fgCents:member==='hyc'?r.hycCents:bothCents(r);
  const known=selected.map(value).filter(valid),total=known.length?sum(known):null;
  return {selected,member,start,end,values:selected.map(value),total,mean:known.length?Math.round(total/known.length):null,median:median(known),knownMonths:known.length,missingMonths:selected.length-known.length};
}
export function monthlyTableModel(model){const all=model.member==='all';return {headers:all?['月份','樊高一格（元）','黄宇辰（元）','双方记录小计（元）']:['月份',memberName(model.member)+'（元）'],rows:model.selected.map((r,i)=>all?[r.month,r.fgCents,r.hycCents,model.values[i]]:[r.month,model.values[i]])};}
export function monthlyCsv(model){const view=monthlyTableModel(model),raw=[view.headers,...view.rows.map(row=>row.map((value,i)=>i?cellAmount(value):value))];return '\uFEFF'+raw.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n');}
export function scenarioModel(baseline,budget){
  if(!valid(baseline)||!valid(budget)||budget<0)throw Error('预算金额无效');
  const difference=baseline-budget,projections=[3,6,12].map(months=>({months,cents:difference*months}));if(!valid(difference)||!projections.every(r=>valid(r.cents)))throw Error('预算情景超出整数分范围');return {budget,difference,projections};
}
function trendChart(rows,member){
  const width=940,height=330,left=68,right=14,top=25,bottom=45;
  const series=member==='all'?[{key:'fgCents',name:'樊高一格',color:'var(--fg)'},{key:'hycCents',name:'黄宇辰',color:'var(--hyc)'}]:[{key:member==='fg'?'fgCents':'hycCents',name:member==='fg'?'樊高一格':'黄宇辰',color:member==='fg'?'var(--fg)':'var(--hyc)'}];
  const nums=rows.flatMap(r=>series.map(s=>r[s.key])).filter(valid),min=Math.min(0,...nums),max=Math.max(100,...nums),plot=width-left-right,step=plot/Math.max(rows.length,1),bw=Math.min(29,step/(series.length+1));
  const y=v=>top+(max-v)/(max-min)*(height-top-bottom),zero=y(0);
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="双方已记录月度净消费，人民币元"><title>已记录月度净消费，人民币元；缺失不绘制为零</title>`;
  for(let i=0;i<=4;i++){const v=min+(max-min)*i/4;svg+=`<line class="grid" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text text-anchor="end" x="${left-10}" y="${y(v)+5}">${short(Math.round(v))}</text>`;}
  svg+=`<line class="zero-line" x1="${left}" x2="${width-right}" y1="${zero}" y2="${zero}"/>`;
  rows.forEach((r,i)=>{const cx=left+(i+.5)*step;svg+=`<text x="${cx}" y="${height-15}" text-anchor="middle">${r.month.slice(5)}月</text>`;series.forEach((s,j)=>{const v=r[s.key],x=cx+(j-(series.length-1)/2)*(bw+3)-bw/2;if(!valid(v)){svg+=`<text x="${x+bw/2}" y="${height-bottom-8}" text-anchor="middle">缺</text>`;return;}svg+=`<rect x="${x}" y="${Math.min(zero,y(v))}" width="${bw}" height="${Math.abs(zero-y(v))}" rx="2" fill="${s.color}" tabindex="0"><title>${esc(r.month+' '+s.name+' '+fmt(v)+'元')}</title></rect>`;});});
  return svg+'</svg>';
}
export function bars(rows,{height=310,color='var(--fg)',label='分类金额，人民币元'}={}){
  if(!rows.length)return '<p class="empty">该范围没有可绘制金额。</p>';
  const width=940,left=175,right=145,top=16,bottom=43,rowH=(height-top-bottom)/Math.max(rows.length,1),min=Math.min(0,...rows.map(r=>r.cents)),max=Math.max(0,...rows.map(r=>r.cents)),span=max-min||100,plot=width-left-right,x=value=>left+(value-min)/span*plot,zero=x(0);
  let out=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>`;
  for(let i=0;i<=4;i++){const value=min+span*i/4,tick=x(value);out+=`<line class="grid" x1="${tick}" x2="${tick}" y1="${top}" y2="${height-bottom}"/><text x="${tick}" y="${height-15}" text-anchor="middle">${short(Math.round(value))}</text>`;}
  out+=`<line class="zero-line" data-zero="${zero}" x1="${zero}" x2="${zero}" y1="${top}" y2="${height-bottom}"/><text x="${width-12}" y="${height-15}" text-anchor="end">元</text>`;
  rows.forEach((r,i)=>{const y=top+i*rowH,end=x(r.cents);out+=`<text x="${left-14}" y="${y+rowH*.54}" text-anchor="end">${esc(r.label)}</text><rect data-cents="${r.cents}" x="${Math.min(zero,end)}" y="${y+rowH*.18}" width="${Math.abs(end-zero)}" height="${rowH*.48}" rx="2" fill="${r.cents<0?'var(--negative)':color}" tabindex="0"><title>${esc(r.label+' '+fmt(r.cents)+'元')}</title></rect><text class="value" x="${width-12}" text-anchor="end" y="${y+rowH*.54}">${fmt(r.cents)}</text>`;});return out+'</svg>';
}
function renderMonthly(){
  const start=$('start').value,end=$('end').value,member=$('member').value;
  if(!data)return;
  if(!monthValid(start)||!monthValid(end)||start>end||!['all','fg','hyc'].includes(member)||![start,end].every(month=>monthly.some(r=>r.month===month))){$('monthly-chart').innerHTML='<p class="empty">请选择有效月份，开始月应早于或等于结束月。</p>';$('consumption-metrics').innerHTML='';$('monthly-conclusion').textContent='请选择有效月份范围后再比较消费。';$('monthly-scope').textContent='月份范围无效，未显示统计或生成CSV。';$('monthly-table').innerHTML='';$('monthly-legend').hidden=true;$('export-monthly').disabled=true;currentMonthly=null;return;}
  const m=monthlyModel(monthly,member,start,end);currentMonthly=m;$('export-monthly').disabled=!m.selected.length;$('monthly-legend').hidden=false;$('monthly-legend').innerHTML=(member==='all'?['fg','hyc']:[member]).map(key=>'<span><i class="'+key+'"></i>'+memberName(key)+'</span>').join('');
  $('consumption-metrics').innerHTML=metric('可合计月份记录净消费',fmt(m.total)+' 元',m.knownMonths+'个可合计月份')+metric('记录月均',fmt(m.mean)+' 元','按可合计月份计算')+metric('记录月度中位数',fmt(m.median)+' 元','观察值，不等于必要生活费');
  $('monthly-chart').innerHTML=trendChart(m.selected,member);
  const known=m.selected.map((r,i)=>({month:r.month,value:m.values[i]})).filter(r=>valid(r.value)).sort((a,b)=>b.value-a.value);
  $('monthly-conclusion').textContent=known.length>=2&&m.total>0?'结论：'+known.slice(0,2).map(r=>r.month.slice(5)+'月').join('与')+'是该范围记录最高的两个月，合占 '+(sum(known.slice(0,2).map(r=>r.value))/m.total*100).toFixed(1)+'%。优先为计划性大额支出预留。':known.length>=2?'结论：该范围净额不为正，退款会影响比较，暂不推导消费高峰占比。':known.length?'结论：仅一个可合计月份，暂不据此判断消费趋势。':'结论：该范围资料不足，不能按零消费处理。';
  $('monthly-scope').textContent='金额为已记录净消费，退款按发生月；樊高一格资料最新10/28，黄宇辰最新11/3。'+(m.missingMonths?'所选范围有'+m.missingMonths+'个月资料不齐，未计入合计及均值。':'')+'双方代付、报销和重复抵销尚未完成，记录小计不等于最终家庭消费。';
  const view=monthlyTableModel(m);$('monthly-table').innerHTML=table(view.headers,view.rows.map(row=>row.map((value,i)=>i?fmt(value):value)));
}
function renderCategories(){
  const member=$('category-member').value,rows=data.queries.categories.rows.filter(r=>r.member===member).slice().sort((a,b)=>b.valueCents-a.valueCents),total=sum(rows.map(r=>r.valueCents));
  $('category-scope').textContent=member==='fg'?'樊高一格：2026年已记录原支付至10/28。退款尚未全部归到类别，不把本图当净支出占比。':'黄宇辰：本期支付扣对应退款后净额至11/3；微信消费保留待分类。分类为来源标签，不自动等同刚需。';
  $('category-chart').innerHTML=bars(rows.slice(0,7).map(r=>({label:r.category,cents:r.valueCents})),{height:340,color:member==='fg'?'var(--fg)':'var(--hyc)'});
  const pending=rows.filter(r=>/待分类/.test(r.category)).reduce((a,b)=>a+b.valueCents,0);
  $('category-conclusion').textContent=total<=0?'结论：该口径合计不为正，暂不计算消费类别占比。':member==='fg'?'结论：待分类占原支付 '+(pending/total*100).toFixed(1)+'%；先核清分类和报销，再对旅行、餐饮与购物设额度。':'结论：待分类占净消费 '+(pending/total*100).toFixed(1)+'%；先补微信类别，再判断哪些支出可以减少。';
  $('category-table').innerHTML=table(['来源类别',member==='fg'?'原支付（元）':'净消费（元）','本口径占比'],rows.map(r=>[r.category,fmt(r.valueCents),total>0?(r.valueCents/total*100).toFixed(1)+'%':'不适用']));
}
function renderBudget(){
  if(!data)return;const baseline=data.context.baselineMonthlyCents,budget=Math.round(Number($('budget').value)*100),m=scenarioModel(baseline,budget);
  $('budget-output').value=fmt(budget);$('budget-metrics').innerHTML=metric('选择的月消费上限',fmt(budget)+' 元','消费预算情景')+metric(m.difference>=0?'较记录月均少支出':'较记录月均多支出',fmt(Math.abs(m.difference))+' 元','并非已实现储蓄')+metric('相对基线变化',(Math.abs(m.difference)/baseline*100).toFixed(1)+'%',m.difference>=0?'消费控制幅度':'预算高于记录月均');
  $('savings-chart').innerHTML=bars(m.projections.map(r=>({label:r.months+'个月',cents:r.cents})),{height:250,label:'累计消费控制差额情景，人民币元；零轴右侧为较基线少支出，左侧为较基线多支出'});
  $('savings-table').innerHTML=table(['持续期间','累计消费控制差额（元）','性质'],m.projections.map(r=>[r.months+'个月',fmt(r.cents),'情景，非实际储蓄']));
  $('savings-conclusion').textContent=m.difference>0?'结论：若消费上限持续执行，6个月相对基线可少支出 '+fmt(m.difference*6)+' 元；只有核清其他资金需求并实际留存后，才计入储蓄。':'结论：当前消费预算不低于历史记录月均，不能从本情景推导新增消费节余额。';
  renderCash();
}
function renderCash(){
  const income=$('income').value,ob=$('obligations').value;
  if(income===''||ob===''){$('cash-result').textContent='结论：稳定收入及预算外应还与预留仍待核，目前无法可靠给出实际可存金额。';return;}
  const i=Math.round(Number(income)*100),o=Math.round(Number(ob)*100),b=Math.round(Number($('budget').value)*100);
  if(![i,o,b].every(valid)||i<0||o<0){$('cash-result').textContent='请输入有效的非负金额。';return;}
  const remaining=i-b-o;$('cash-result').textContent=remaining>=0?'按输入情景，每月可安排余额 '+fmt(remaining)+' 元。需以实际到账、用途及余额留存验证。':'按输入情景，每月仍缺 '+fmt(-remaining)+' 元，应先调整预算或资金安排。';
}
function renderSupporting(){
  const rows=data.queries.management.rows;$('management').innerHTML=table(['项目','已记录信息','处理'],rows.map(r=>[r.label,r.value,r.note]));
  $('sources').innerHTML='<p>此前全部已有资料归属樊高一格；新增三份支付及银行资料归属黄宇辰，依据2026年11月4日用户明确确认。</p>'+table(['来源','数据截止','覆盖说明'],data.sources.map(r=>[r.label,r.asOf,r.coverage]))+'<p class="note">金额以整数分计算。消费、退款、还款、资金转移及投资分别处理；未把中行付款重复加入支付渠道消费。来源缺失不填零，不跨币种或不同时点拼成当前总资产。预算和储蓄为待讨论情景。</p>';
}
export async function load(){
  const sequence=++loadSequence;loadController?.abort();const controller=new AbortController();loadController=controller;
  data=undefined;monthly=[];currentMonthly=null;$('export-monthly').disabled=true;
  $('status').hidden=false;$('analysis').hidden=true;$('analysis').setAttribute('aria-busy','true');$('data-date').textContent='';$('monthly-scope').textContent='';$('monthly-table').innerHTML='';$('status').textContent='正在读取已发布数据…（最长15秒）';
  let timer;
  try{const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('读取超时（15秒）'));controller.abort();},LOAD_TIMEOUT_MS);});
    const request=(async()=>{const response=await fetch(new URL('../../data/household-budget.json',import.meta.url),{cache:'no-cache',credentials:'omit',redirect:'error',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return response.json();})();
    const next=validateSnapshot(await Promise.race([request,timeout]));if(sequence!==loadSequence)return;data=next;monthly=data.queries.monthly.rows;
    const options=monthly.map(r=>'<option value="'+esc(r.month)+'">'+esc(r.month)+'</option>').join('');$('start').innerHTML=options;$('end').innerHTML=options;$('start').value=data.context.comparisonStart;$('end').value=data.context.comparisonEnd;
    $('data-date').textContent='樊高一格记录截至2026/10/28；黄宇辰截至2026/11/3 · 整理 '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'short'}).format(new Date(data.generatedAt));
    $('baseline').textContent=fmt(data.context.baselineMonthlyCents);
    $('budget-table').innerHTML=table(['消费方案（提案）','月上限（元）','较基线少支出／月（元）','持续12个月差额（元）'],data.queries.budgets.rows.map(r=>[r.label,fmt(r.budgetCents),fmt(r.differenceCents),fmt(r.differenceCents*12)]));
    renderMonthly();renderCategories();renderBudget();renderSupporting();$('status').hidden=true;$('analysis').hidden=false;
  }catch(e){if(sequence!==loadSequence)return;data=undefined;monthly=[];currentMonthly=null;$('export-monthly').disabled=true;$('analysis').hidden=true;$('status').hidden=false;$('status').textContent='数据读取失败，暂不显示分析。'+e.message+'，请点击重读快照。';}
  finally{clearTimeout(timer);if(sequence===loadSequence){$('analysis').setAttribute('aria-busy','false');loadController=null;}}
}
for(const id of ['member','start','end'])$(id).addEventListener('change',renderMonthly);
$('category-member').addEventListener('change',renderCategories);$('budget').addEventListener('input',renderBudget);for(const id of ['income','obligations'])$(id).addEventListener('input',renderCash);
$('reset').addEventListener('click',()=>{$('budget').value=24000;$('income').value='';$('obligations').value='';renderBudget();});$('reload').addEventListener('click',load);
$('export-monthly').addEventListener('click',()=>{if(!currentMonthly?.selected.length||$('export-monthly').disabled)return;const url=URL.createObjectURL(new Blob([monthlyCsv(currentMonthly)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=memberName(currentMonthly.member)+'-'+currentMonthly.start+'至'+currentMonthly.end+'-记录月度净消费.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
load();
