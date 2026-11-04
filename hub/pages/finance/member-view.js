/* Reviewed member aggregates. Original finance app remains intact for its owner. */
(function (global) {
  'use strict';
  const MEMBER_IDS = ['fg', 'hyc'];
  const NAMES = {fg:'樊高一格',hyc:'黄宇辰'};
  const KEYS = {fg:'fgCents',hyc:'hycCents'};
  const STORAGE_KEY = 'lifeos-finance-members';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const valid = value => Number.isSafeInteger(value);
  const sum = values => { const result=values.reduce((a,b)=>a+b,0); if(!valid(result))throw Error('金额超出可核算范围');return result; };
  const money = cents => cents===null ? '资料未齐' : new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
  const rows = (data,key) => data.queries?.[key]?.rows || [];
  const memberOf = row => MEMBER_IDS.find(id => String(row.label||'').startsWith(NAMES[id]));
  function validate(data) {
    if(data?.id!=='household-budget'||data.schemaVersion!=='household-budget/1.0'||data.context?.currency!=='CNY')throw Error('成员资料版本不匹配');
    if(!Array.isArray(data.members)||MEMBER_IDS.some(id=>!data.members.some(m=>m.id===id&&m.name===NAMES[id])))throw Error('成员姓名尚未核实');
    const monthly=rows(data,'monthly');let last='';
    if(!monthly.length)throw Error('月度资料缺失');
    for(const row of monthly){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month)||row.month<=last)throw Error('月度资料重复或无序');last=row.month;for(const id of MEMBER_IDS)if(row[KEYS[id]]!==null&&!valid(row[KEYS[id]]))throw Error('消费金额须为整数分或未知');}
    for(const row of rows(data,'categories'))if(!MEMBER_IDS.includes(row.member)||!valid(row.valueCents)||typeof row.category!=='string'||row.basis!==(row.member==='fg'?'gross':'net_linked_refund'))throw Error('分类资料口径不匹配');
    return data;
  }
  function model(data,selected,start,end) {
    validate(data);
    const members=MEMBER_IDS.filter(id=>selected.includes(id));
    const monthly=rows(data,'monthly').filter(row=>(!start||row.month>=start)&&(!end||row.month<=end)).map(row=>{
      const values=members.map(id=>row[KEYS[id]]),known=values.filter(value=>value!==null);
      return {...row,totalCents:members.length&&known.length===values.length?sum(known):null,knownCents:known.length?sum(known):null,complete:members.length>0&&known.length===values.length};
    });
    const complete=monthly.filter(row=>row.complete),known=monthly.filter(row=>row.knownCents!==null);
    const totalKnownCents=members.length&&known.length?sum(known.map(row=>row.knownCents)):null;
    const meanCents=complete.length?Math.round(sum(complete.map(row=>row.totalCents))/complete.length):null;
    return {members,monthly,totalKnownCents,meanCents,completeMonths:complete.length,incompleteMonths:monthly.length-complete.length,categories:rows(data,'categories').filter(row=>members.includes(row.member)),salary:rows(data,'observed_salary').filter(row=>members.includes(row.member)),utilities:rows(data,'utilities_review').filter(row=>members.includes(row.member)),management:rows(data,'management').filter(row=>members.includes(memberOf(row))),sources:(data.sources||[]).filter(source=>members.some(id=>source.id.startsWith(id+'-'))||(members.includes('hyc')&&['income-utilities-review','rent-prepayment-correction'].includes(source.id)))};
  }
  function csvCell(value){const text=value===null||value===undefined?'':String(value);return '"'+(/^[=+\-@]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"';}
  function csv(data,view,start,end) {
    const output=[['板块','成员','期间或日期','类别或说明','金额_CNY','口径与覆盖']];
    for(const row of view.monthly)for(const id of view.members)output.push(['月度消费',NAMES[id],row.month,'净消费',row[KEYS[id]]===null?null:(row[KEYS[id]]/100).toFixed(2),row[KEYS[id]]===null?'资料未齐；不计为0':'已记录净消费；家庭代付与重复抵销未完成']);
    for(const row of view.categories)output.push(['分类消费',NAMES[row.member],'来源全期间',row.category,(row.valueCents/100).toFixed(2),row.basis==='gross'?'原支付金额；非所选月范围':'扣已匹配退款净额；非所选月范围']);
    for(const row of view.salary)output.push(['明确工资入账',NAMES[row.member],row.date,'银行工资入账',(row.cents/100).toFixed(2),'已发布4笔观察；工资所属期及扣款组成待核']);
    for(const row of view.utilities)output.push(['水电燃气',NAMES[row.member],'来源全期间',row.category,row.cents===null?null:(row.cents/100).toFixed(2),row.note]);
    return '\ufeff'+output.map(row=>row.map(csvCell).join(',')).join('\r\n');
  }
  global.FinanceMemberView={model,validate,csv,STORAGE_KEY};
  if(typeof module!=='undefined'&&module.exports)module.exports=global.FinanceMemberView;
  if(!global.document)return;
  const document=global.document;
  const host=document.getElementById('finance-member-summary'),original=document.getElementById('finance-original-view'),label=document.getElementById('fm-view-label');
  if(!host||!original||!label)return;
  const boxes=Object.fromEntries(['all',...MEMBER_IDS].map(id=>[id,document.getElementById('fm-'+id)]));
  let data=null,selected=readSelection(),start='',end='',loadVersion=0;
  function readSelection(){try{const parsed=JSON.parse(global.localStorage.getItem(STORAGE_KEY));if(Array.isArray(parsed)&&parsed.every(id=>MEMBER_IDS.includes(id))&&new Set(parsed).size===parsed.length)return MEMBER_IDS.filter(id=>parsed.includes(id));}catch{}return [...MEMBER_IDS];}
  function title(){return selected.length===2?'全部成员':selected.length?NAMES[selected[0]]:'未选择成员';}
  function selectionChanged(persist=true){
    for(const id of MEMBER_IDS)boxes[id].checked=selected.includes(id);
    boxes.all.checked=selected.length===MEMBER_IDS.length;boxes.all.indeterminate=selected.length>0&&selected.length<MEMBER_IDS.length;
    const originalOnly=selected.length===1&&selected[0]==='fg';original.hidden=!originalOnly;host.hidden=originalOnly;
    label.textContent=originalOnly?'当前：樊高一格 · 以下为原财务总览及逐笔依据，沿用各模块原期间与口径。':selected.length?'当前：'+title()+' · 消费、分类与财务摘要按所选成员显示。':'当前未选择成员；请勾选姓名或全选。';
    if(persist)try{global.localStorage.setItem(STORAGE_KEY,JSON.stringify(selected));}catch{}
    render();
  }
  boxes.all.addEventListener('change',()=>{selected=boxes.all.checked?[...MEMBER_IDS]:[];selectionChanged();});
  for(const id of MEMBER_IDS)boxes[id].addEventListener('change',()=>{selected=MEMBER_IDS.filter(key=>boxes[key].checked);selectionChanged();});
  global.addEventListener('storage',event=>{if(event.key===STORAGE_KEY){selected=readSelection();selectionChanged(false);}});
  global.addEventListener('focus',()=>{const next=readSelection();if(JSON.stringify(next)!==JSON.stringify(selected)){selected=next;selectionChanged(false);}});
  function table(headers,body){return '<div class="fm-table-wrap"><table class="fm-table"><thead><tr>'+headers.map(h=>'<th'+(/CNY|笔数/.test(h)?' class="fm-number"':'')+'>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+body.map(row=>'<tr>'+row.map((cell,i)=>'<td'+(/CNY|笔数/.test(headers[i])?' class="fm-number"':'')+'>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
  function monthlyChart(view){
    const w=1100,h=300,left=80,right=25,top=22,bottom=48,plotH=h-top-bottom,plotW=w-left-right;
    const numbers=view.monthly.flatMap(row=>view.members.map(id=>row[KEYS[id]])).filter(value=>value!==null),max=Math.max(1,...numbers),step=plotW/Math.max(1,view.monthly.length),barW=Math.min(30,step/(view.members.length+1));
    let svg='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-labelledby="fm-chart-title fm-chart-desc"><title id="fm-chart-title">'+esc(title())+'月度已记录净消费，单位人民币元</title><desc id="fm-chart-desc">各成员按月并列；缺资料显示破折号，不按零计。下方提供完整数值表。</desc>';
    for(let i=0;i<=4;i++){const v=max*i/4,y=top+plotH*(1-i/4);svg+='<line class="fm-axis" x1="'+left+'" x2="'+(w-right)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(left-12)+'" y="'+(y+4)+'" text-anchor="end">'+(v/100).toLocaleString('zh-CN',{maximumFractionDigits:0})+'</text>';}
    view.monthly.forEach((row,index)=>{const center=left+step*(index+.5);svg+='<text x="'+center+'" y="'+(h-20)+'" text-anchor="middle">'+esc(row.month.slice(2))+'</text>';view.members.forEach((id,j)=>{const value=row[KEYS[id]],x=center+(j-(view.members.length-1)/2)*barW*1.2-barW/2;if(value===null){svg+='<text x="'+(x+barW/2)+'" y="'+(top+plotH-5)+'" text-anchor="middle">—</text>';return;}const bh=Math.max(1,value/max*plotH),y=top+plotH-bh,description=row.month+' '+NAMES[id]+' '+money(value)+'元';svg+='<rect class="fm-bar" tabindex="0" aria-label="'+esc(description)+'" x="'+x+'" y="'+y+'" width="'+barW+'" height="'+bh+'" rx="3" fill="var(--fm-'+id+')"><title>'+esc(description)+'</title></rect>';});});
    return '<div class="fm-chart">'+svg+'</svg></div>';
  }
  function categoryPanel(view,id){
    const categories=view.categories.filter(row=>row.member===id).sort((a,b)=>b.valueCents-a.valueCents),max=Math.max(1,...categories.map(row=>row.valueCents));
    return '<div class="fm-categories"><h4>'+NAMES[id]+'</h4><p>'+(id==='fg'?'原支付金额，未按类别冲减退款':'扣对应已匹配退款后的净额')+' · 来源全期间</p>'+categories.slice(0,8).map(row=>'<div class="fm-category-row"><div class="fm-category-label"><span>'+esc(row.category)+'</span><strong>¥'+money(row.valueCents)+'</strong></div><div class="fm-track"><i class="fm-'+id+'" style="width:'+Math.max(0,row.valueCents/max*100)+'%"></i></div></div>').join('')+'<details><summary>查看全部 '+categories.length+' 个类别</summary>'+table(['类别','金额 CNY'],categories.map(row=>[esc(row.category),money(row.valueCents)]))+'</details></div>';
  }
  function render(){
    if(host.hidden)return;
    if(!selected.length){host.innerHTML='<div class="fm-empty"><h2>选择成员后查看财务</h2><p>可单独选择姓名，也可全选比较双方记录。</p></div>';return;}
    if(!data)return;
    const view=model(data,selected,start,end),last=view.monthly.at(-1),monthOptions=value=>rows(data,'monthly').map(row=>'<option value="'+row.month+'"'+(row.month===value?' selected':'')+'>'+row.month+'</option>').join('');
    const displayMoney=value=>value===null?'资料未齐':'¥'+money(value);
    const metric=(name,value,note)=>'<div class="fm-metric"><span>'+name+'</span><strong>'+value+'</strong><small>'+note+'</small></div>';
    const selectedNames=selected.map(id=>NAMES[id]).join('、');
    let html='<div class="fm-toolbar"><div><h2>'+esc(title())+'的财务概览</h2><p class="fm-muted">金额单位：CNY · 月度净消费按下方月份范围筛选</p></div><div class="fm-periods"><label>开始月<select id="fm-start">'+monthOptions(start)+'</select></label><label>结束月<select id="fm-end">'+monthOptions(end)+'</select></label><button id="fm-export" class="fm-button">导出当前视角 CSV</button></div></div>';
    html+='<div class="fm-metrics">'+metric('范围内已知消费小计',displayMoney(view.totalKnownCents),view.incompleteMonths?'含'+view.incompleteMonths+'个资料未齐月份，仅加已知金额':'所选'+view.monthly.length+'个月；成员间代付与抵销待核')+metric('完整月份月均',displayMoney(view.meanCents),'仅按'+view.completeMonths+'个成员资料齐备月份计算')+metric(last?last.month+'月度消费':'月度消费',last?displayMoney(last.totalCents):'资料未齐',last&&!last.complete?'当月成员资料未齐，不给出合计':'当前所选成员的已记录金额')+'</div>';
    html+='<section class="fm-section"><h3>月度消费趋势</h3><p>所选成员：'+esc(selectedNames)+'。来源覆盖不完整，双方记录小计尚未完成家庭代付、报销及重复抵销。</p><div class="fm-legend">'+selected.map(id=>'<span><i style="background:var(--fm-'+id+')"></i>'+NAMES[id]+'</span>').join('')+'</div>'+monthlyChart(view)+table(['月份',...selected.map(id=>NAMES[id]+' CNY'),'所选成员小计 CNY'],view.monthly.map(row=>[esc(row.month),...selected.map(id=>money(row[KEYS[id]])),money(row.totalCents)]))+'<p class="fm-note">破折号与“资料未齐”表示缺口。2026年11月仅黄宇辰有截至11月3日的记录，樊高一格缺资料；全选时该月不生成双方合计。中国银行记录作为次级证据，不额外叠加到支付宝和微信消费。</p></section>';
    html+='<section class="fm-section"><h3>消费分类</h3><p>分类保留来源全期间，不随上方月范围变化。双方退款与分类口径不同，分别展示，不能直接相加。</p><div class="fm-category-grid'+(selected.length===1?' fm-one':'')+'">'+selected.map(id=>categoryPanel(view,id)).join('')+'</div></section>';
    if(view.salary.length){const salaryTotal=sum(view.salary.map(row=>row.cents));html+='<section class="fm-section"><h3>黄宇辰的明确工资入账</h3><p>7—10月共'+view.salary.length+'笔，已记录合计 ¥'+money(salaryTotal)+'。这是已有银行工资入账观察，保留完整来源期间；工资所属期及个税、社保等组成待核，不推算全年收入。</p>'+table(['入账日','金额 CNY'],view.salary.map(row=>[esc(row.date),money(row.cents)]))+'</section>';}
    if(view.utilities.length){html+='<section class="fm-section"><h3>所选成员的水电燃气已识别付款</h3><p>来源全期间，付款日与账期不同，不视为完整当前月账。</p>'+table(['成员 / 项目','笔数','金额 CNY','覆盖说明'],view.utilities.map(row=>[esc(NAMES[row.member]+' / '+row.category),row.count===null?'未识别':String(row.count),money(row.cents),esc(row.note)]))+'</section>';}
    if(view.management.length){html+='<section class="fm-section"><h3>其他已发布财务摘要</h3><p>以下保留各自来源期间与核对缺口，不与消费相加，也不合成当前家庭净资产。</p>'+table(['事项','观察值','说明'],view.management.map(row=>[esc(row.label),esc(row.value),esc(row.note)]))+'</section>';}
    html+='<section class="fm-section"><h3>本次视角的数据覆盖</h3><ul class="fm-source-list">'+view.sources.map(source=>'<li><strong>'+esc(source.label)+'</strong> · '+esc(source.asOf)+'<br>'+esc(source.coverage)+'</li>').join('')+'</ul><p class="fm-note">成员摘要来自已发布的白名单聚合。樊高一格原财务总览可通过上方姓名单选进入；<a href="../finance-unified/index.html">统一账库逐笔依据</a>目前公开范围为樊高一格原记录。黄宇辰原始账单与逐笔资料不在该公开明细中。</p><p class="fm-foot"><a href="../../#/household-budget">查看共同预算、专项预留与储蓄计划 ↗</a> · 共同预算按共同用途试算，个人视角不自动分摊家庭方案。</p></section>';
    host.innerHTML=html;
    document.getElementById('fm-start').addEventListener('change',event=>{start=event.target.value;if(start>end)end=start;render();});
    document.getElementById('fm-end').addEventListener('change',event=>{end=event.target.value;if(end<start)start=end;render();});
    document.getElementById('fm-export').addEventListener('click',()=>{const blob=new Blob([csv(data,view,start,end)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='财务视角-'+(selected.length===2?'全选':NAMES[selected[0]])+'-'+start+'至'+end+'.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  }
  async function load(){const version=++loadVersion,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch('../../data/household-budget.json',{cache:'no-cache',credentials:'omit',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);const next=validate(await response.json());if(version!==loadVersion)return;data=next;start=start||next.context.comparisonStart;end=end||next.context.comparisonEnd;render();}catch(error){if(version!==loadVersion)return;host.innerHTML='<div class="fm-error" role="alert"><p>成员资料暂时未能读取，不能把缺失当作没有消费。</p><p>'+esc(error.name==='AbortError'?'读取超时，请重试':error.message)+'</p><button id="fm-retry" class="fm-button">重试读取</button></div>';document.getElementById('fm-retry').addEventListener('click',load);}finally{clearTimeout(timer);}}
  selectionChanged(false);load();
})(typeof window!=='undefined'?window:globalThis);
