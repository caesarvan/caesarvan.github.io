const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=c=>Number.isSafeInteger(c)?new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100):'缺资料';
const short=c=>Math.abs(c)>=1000000?(c/1000000).toFixed(1)+'万':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(c/100);
const valid=Number.isSafeInteger;
let data,monthly=[],currentMonthly=null,loadSequence=0,loadController=null;
export const LOAD_TIMEOUT_MS=15000;
const table=(heads,rows)=>'<table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map((v,i)=>'<td'+(i?' class="number"':'')+'>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
const metric=(label,value,note='')=>'<div class="metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>';
const sum=values=>values.reduce((total,value)=>{const next=total+value;if(!valid(value)||!valid(next))throw Error('金额合计超出整数分范围');return next;},0);
const median=values=>{const v=values.slice().sort((a,b)=>a-b);return v.length?Math.round(v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2):null;};
const monthValid=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const memberName=member=>member==='fg'?'樊高一格':member==='hyc'?'黄宇辰':'双方记录小计';
const bothCents=r=>valid(r.fgCents)&&valid(r.hycCents)?sum([r.fgCents,r.hycCents]):null;
const cellAmount=c=>valid(c)?(c/100).toFixed(2):'缺资料';
function calendarDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
function timestamp(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&calendarDate(value.slice(0,10))&&Number.isFinite(Date.parse(value));}
export function inputCents(value){
  if(typeof value!=='string'||value.trim()==='')return null;
  const text=value.trim();if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('金额须为非负数字，最多两位小数');
  const [whole,fraction='']=text.split('.'),amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('金额超出整数分范围');return Number(amount);
}
export function sharedWalletModel(wallet,{commonDays=wallet.proposal.commonDays,reunions=wallet.proposal.reunions,fgIncomeCents=null,hycIncomeCents=null,fixedObligationsCents=null,contributionMode=Array.isArray(wallet.reportedMonthlyContributions)?'reported':'income'}={}){
  if(wallet.contributionRateBps!==5000)throw Error('小荷包缴入比例须为50%');
  if(![commonDays,reunions].every(v=>valid(v)&&v>=0&&v<=31))throw Error('共同日数和团聚次数须为0至31的整数');
  for(const value of [fgIncomeCents,hycIncomeCents,fixedObligationsCents])if(value!==null&&(!valid(value)||value<0))throw Error('收入和共同固定义务须为非负整数分或未知');
  const p=wallet.proposal,activities=reunions*p.activities/p.reunions;
  if(!valid(activities))throw Error('共同活动次数试算须为整数');
  const routineRows=[{label:'共同餐饮',count:commonDays,unit:'日',unitCents:p.diningPerDayCents,cents:commonDays*p.diningPerDayCents},{label:'共同交通',count:reunions,unit:'次团聚',unitCents:p.transportPerReunionCents,cents:reunions*p.transportPerReunionCents},{label:'共同活动',count:activities,unit:'次活动',unitCents:p.activityPerTimeCents,cents:activities*p.activityPerTimeCents},{label:'共同消耗品',count:1,unit:'月',unitCents:p.commonConsumablesCents,cents:p.commonConsumablesCents},{label:'共同机动',count:1,unit:'月',unitCents:p.contingencyCents,cents:p.contingencyCents}];
  const routineCents=sum(routineRows.map(r=>r.cents)),reserveCents=sum(p.reserveRows.map(r=>r.cents));
  const contribution=value=>value===null?null:Number((BigInt(value)+1n)/2n);
  if(!['reported','income'].includes(contributionMode))throw Error('缴入测算模式无效');
  let fgContributionCents,hycContributionCents;
  if(contributionMode==='reported'){
    if(wallet.contributionEvidence!=='user_report_approximate'||!Array.isArray(wallet.reportedMonthlyContributions))throw Error('用户自报缴入资料未齐');
    const reported=Object.fromEntries(wallet.reportedMonthlyContributions.map(r=>[r.member,r.cents]));
    if(![reported.fg,reported.hyc].every(v=>valid(v)&&v>=0)||sum([reported.fg,reported.hyc])!==wallet.reportedContributionTotalCents)throw Error('用户自报缴入合计不一致');
    fgContributionCents=reported.fg;hycContributionCents=reported.hyc;
  }else{fgContributionCents=contribution(fgIncomeCents);hycContributionCents=contribution(hycIncomeCents);}
  const contributionCents=fgContributionCents===null||hycContributionCents===null?null:sum([fgContributionCents,hycContributionCents]);
  const beforeFixedObligationsCents=contributionCents===null?null:sum([contributionCents,-routineCents,-reserveCents]);
  const conditionalRemainderCents=beforeFixedObligationsCents===null||fixedObligationsCents===null?null:sum([beforeFixedObligationsCents,-fixedObligationsCents]);
  return {commonDays,reunions,activities,routineRows,routineCents,reserveCents,contributionMode,fgContributionCents,hycContributionCents,contributionCents,fixedObligationsCents,beforeFixedObligationsCents,conditionalRemainderCents};
}
export function weeklyDateBudgetModel(plan,dateCount=4){
  if(!plan||plan.status!=='user-confirmed-weekly-cap'||!valid(plan.weeklyCapCents)||plan.weeklyCapCents!==100000||!valid(plan.monthlyDepositPlanCents)||plan.monthlyDepositPlanCents!==2000000)throw Error('每周约会规则缺失或无效');
  if(!valid(dateCount)||![4,5].includes(dateCount))throw Error('本月约会周末数须为4或5');
  return {dateCount,weeklyCapCents:plan.weeklyCapCents,monthlyDateCapCents:plan.weeklyCapCents*dateCount,monthlyDepositPlanCents:plan.monthlyDepositPlanCents};
}
function renderWeeklyDateBudget(){
  if(!data)return;
  const plan=data.weeklyDateBudget,m=weeklyDateBudgetModel(plan,Number($('weekly-date-count').value));
  $('weekly-metrics').innerHTML=metric('小荷包月缴入计划',fmt(m.monthlyDepositPlanCents)+' 元','计划金额，实际缴入待核')+metric('每周约会总上限',fmt(m.weeklyCapCents)+' 元','餐饮、活动、交通、购物在内轮换')+metric('本月约会预算上限',fmt(m.monthlyDateCapCents)+' 元',m.dateCount+'个约会周末，不含另外确定的旅行等支出');
  $('weekly-month-chart').innerHTML=[4,5].map(count=>'<div class="weekly-bar-row"><span>'+count+'个周末</span><div class="weekly-bar-track"><div class="weekly-bar" style="width:'+count*20+'%" role="img" aria-label="'+count+'个周末，预算上限'+count*1000+'元"></div></div><strong>'+fmt(count*plan.weeklyCapCents)+' 元</strong></div>').join('');
  $('weekly-rotations').innerHTML=plan.rotationExamples.map(example=>'<article class="weekly-example"><h3>'+esc(example.label)+'</h3>'+table(['项目','两人合计（元）'],example.rows.map(row=>[row.label,fmt(row.cents)]))+'<p class="weekly-total">合计 <strong>'+fmt(example.totalCents)+' 元</strong></p></article>').join('');
  $('weekly-conclusion').textContent='本月按'+m.dateCount+'个约会周末安排，上限'+fmt(m.monthlyDateCapCents)+'元；每周在1,000元内轮换，不额外叠加购物预留。';
  $('weekly-annual-scope').textContent=plan.annualizedBasis+'按52个周末换算全年52,000元，月均约4,333.33元；这些是预算换算，不是已发生消费或实际储蓄。';
}
export function salaryObservationModel(rows,contributionCents,currentRentCashDueCents){
  const ordered=rows.filter(row=>row.member==='hyc').slice().sort((a,b)=>a.date.localeCompare(b.date)),recent=ordered.slice(-3);
  const recentMeanCents=recent.length===3&&recent.every(row=>valid(row.cents))?Math.round(sum(recent.map(row=>row.cents))/3):null;
  const afterContributionRentCents=recentMeanCents===null||!valid(contributionCents)||!valid(currentRentCashDueCents)?null:sum([recentMeanCents,-contributionCents,-currentRentCashDueCents]);
  return {ordered,recent,recentMeanCents,afterContributionRentCents};
}
export function travelFundingModel(wallet,commonModel){
  return wallet.travelFundingScenarios.slice().sort((a,b)=>Number(a.id==='full-cap')-Number(b.id==='full-cap')).map(row=>{const totalAllocationCents=sum([commonModel.routineCents,row.travelMonthlyCents,row.otherReserveMonthlyCents]),beforeFixedObligationsCents=commonModel.contributionCents===null?null:sum([commonModel.contributionCents,-totalAllocationCents]),conditionalRemainderCents=beforeFixedObligationsCents===null||commonModel.fixedObligationsCents===null?null:sum([beforeFixedObligationsCents,-commonModel.fixedObligationsCents]);return {...row,routineMonthlyCents:commonModel.routineCents,totalAllocationCents,beforeFixedObligationsCents,conditionalRemainderCents};});
}
export function workingCapitalGap(wallet){return valid(wallet.currentBalanceCents)?Math.max(0,wallet.priorAgreements.workingCapitalTargetCents-wallet.currentBalanceCents):null;}
export function familyBudgetConstraintModel(wallet,scenarios,budgetCents=2400000){
  if(!valid(budgetCents)||budgetCents<0)throw Error('家庭预算对照金额无效');
  const rentCents=sum([wallet.personalMonthlyRentCashDueCents.fg,wallet.personalMonthlyRentCashDueCents.hyc]),referenceRentCents=sum([wallet.personalMonthlyRentCents.fg,wallet.personalMonthlyRentCents.hyc]);
  return scenarios.map(row=>{const listedAllocationCents=sum([rentCents,row.totalAllocationCents]);return {id:row.id,label:row.label,rentCents,referenceRentCents,commonAllocationCents:row.totalAllocationCents,listedAllocationCents,budgetCents,differenceCents:sum([budgetCents,-listedAllocationCents])};});
}
export function validateSnapshot(next){
  const require=(condition,label)=>{if(!condition)throw Error('快照校验失败：'+label);};
  const text=value=>typeof value==='string'&&value.trim().length>0;
  const rows=(key)=>{const value=next?.queries?.[key]?.rows;require(Array.isArray(value)&&value.length>0,key+'行缺失');return value;};
  require(next?.schemaVersion==='household-budget/1.0'&&next.id==='household-budget','版本或模块');
  require(timestamp(next.generatedAt),'生成时间');
  require(Array.isArray(next.members)&&next.members.length===2&&next.members[0]?.id==='fg'&&next.members[0]?.name==='樊高一格'&&next.members[1]?.id==='hyc'&&next.members[1]?.name==='黄宇辰','成员');
  const context=next.context;require(context?.currency==='CNY','仅支持人民币整数分');
  require(next.activeBudgetModel==='weekly_date_budget','现行预算模型');
  const weekly=next.weeklyDateBudget;weeklyDateBudgetModel(weekly);
  require(weekly.fourDatesCents===400000&&weekly.fiveDatesCents===500000&&weekly.annual52DatesCents===5200000&&weekly.monthlyAnnualizedCents===433333&&weekly.annualRoundingRemainderCents===4,'周月年预算换算');
  require(weekly.monthlyDepositStatus==='user-selected-plan-not-verified-actual'&&weekly.actualDateSpendingCents===null&&weekly.actualMonthlySavingsCents===null,'计划与实际分列');
  require(weekly.shoppingIncludedWithinWeeklyCap===true&&weekly.rotationRequired===true&&Array.isArray(weekly.rotationExamples)&&weekly.rotationExamples.length===3,'周预算范围与轮换');
  const rotationIds=new Set();for(const example of weekly.rotationExamples){require(['dining','activity','shopping'].includes(example.id)&&!rotationIds.has(example.id)&&text(example.label)&&Array.isArray(example.rows)&&example.rows.length===4,'轮换组合');rotationIds.add(example.id);for(const row of example.rows)require(text(row.label)&&valid(row.cents)&&row.cents>=0,'轮换项目金额');require(example.totalCents===sum(example.rows.map(row=>row.cents))&&example.totalCents<=weekly.weeklyCapCents,'轮换合计须在周上限内');}

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
  const wallet=next.sharedWallet,p=wallet?.proposal;require(wallet?.contributionRateBps===5000&&text(wallet.scope),'小荷包规则与范围');
  for(const key of ['actualMonthlyContributionCents','actualCommonSpendingCents','currentBalanceCents','sharedFixedObligationsCents'])require(wallet[key]===null||(valid(wallet[key])&&wallet[key]>=0),'小荷包实际金额或未知状态');
  require(p&&valid(p.commonDays)&&p.commonDays>=0&&p.commonDays<=31&&valid(p.reunions)&&p.reunions>0&&p.reunions<=31&&valid(p.activities)&&p.activities===p.reunions,'共同日数、团聚与活动提案');
  for(const key of ['diningPerDayCents','transportPerReunionCents','activityPerTimeCents','commonConsumablesCents','contingencyCents'])require(valid(p[key])&&p[key]>=0,'共同常规金额');
  require(Array.isArray(p.reserveRows)&&p.reserveRows.length>0,'共同专项预留');const reserves=new Set();for(const row of p.reserveRows){require(text(row.label)&&valid(row.cents)&&row.cents>=0&&!reserves.has(row.label),'共同专项金额或重复');reserves.add(row.label);}
  if(['reportedMonthlyContributions','reportedContributionTotalCents','contributionEvidence'].some(key=>wallet[key]!==undefined)){
    require(wallet.contributionEvidence==='user_report_approximate'&&Array.isArray(wallet.reportedMonthlyContributions)&&wallet.reportedMonthlyContributions.length===2,'用户自报缴入证据');
    const members=new Set();for(const row of wallet.reportedMonthlyContributions){require(['fg','hyc'].includes(row.member)&&!members.has(row.member)&&valid(row.cents)&&row.cents>=0,'自报成员缴入');members.add(row.member);}
    require(valid(wallet.reportedContributionTotalCents)&&sum(wallet.reportedMonthlyContributions.map(r=>r.cents))===wallet.reportedContributionTotalCents,'用户自报缴入合计');
  }
  if(wallet.personalMonthlyRentCents!==undefined){require(wallet.personalMonthlyRentCents&&['fg','hyc'].every(member=>valid(wallet.personalMonthlyRentCents[member])&&wallet.personalMonthlyRentCents[member]>=0),'各自个人房租');sum(Object.values(wallet.personalMonthlyRentCents));}
  require(wallet.personalMonthlyRentCashDueCents&&['fg','hyc'].every(member=>valid(wallet.personalMonthlyRentCashDueCents[member])&&wallet.personalMonthlyRentCashDueCents[member]>=0),'当前个人房租现金应付须显性提供，不能缺失填0');
  const prepay=wallet.rentPrepayment;require(prepay&&prepay.beneficiary==='hyc'&&prepay.payer==='fg'&&prepay.evidence==='user_confirmed'&&monthValid(prepay.paymentMonth)&&monthValid(prepay.coverageThroughMonth)&&typeof prepay.transactionMatched==='boolean','房租预付用户确认与覆盖截止');require(prepay.amountCents===null||(valid(prepay.amountCents)&&prepay.amountCents>=0),'预付金额须为整数分或未知');require(prepay.coverageStartMonth===null||(monthValid(prepay.coverageStartMonth)&&prepay.coverageStartMonth<=prepay.coverageThroughMonth),'预付覆盖起月');if(wallet.personalMonthlyRentCashDueCents.hyc===0)require(context.analysisDate.slice(0,7)>=prepay.paymentMonth&&context.analysisDate.slice(0,7)<=prepay.coverageThroughMonth,'当前0应付须在已确认预付期间内');
  if(wallet.reportedGrossSalaryCents!==undefined)for(const [member,cents] of Object.entries(wallet.reportedGrossSalaryCents))require(['fg','hyc'].includes(member)&&valid(cents)&&cents>=0,'用户自报税前工资');
  if(wallet.obligationScope!==undefined)require(text(wallet.obligationScope),'个人与共同义务归属');
  if(wallet.priorAgreements!==undefined){const prior=wallet.priorAgreements;require(prior&&prior.status==='prior-recorded-agreement'&&calendarDate(prior.sourceDate),'既有共同约定来源');for(const key of ['reviewThresholdCents','workingCapitalTargetCents','annualTravelBudgetCapCents'])require(valid(prior[key])&&prior[key]>=0,'既有共同约定金额');for(const key of ['hycContributionDay','fgContributionDay'])require(valid(prior[key])&&prior[key]>=1&&prior[key]<=31,'既有缴入日');}
  const defaultCommon=sharedWalletModel(wallet);require(Array.isArray(wallet.travelFundingScenarios)&&wallet.travelFundingScenarios.length===2&&wallet.priorAgreements,'旅行备款对比');const scenarioIds=new Set();
  for(const row of wallet.travelFundingScenarios){require(['trial','full-cap'].includes(row.id)&&!scenarioIds.has(row.id)&&text(row.label),'旅行方案或重复');scenarioIds.add(row.id);for(const key of ['travelMonthlyCents','otherReserveMonthlyCents','routineMonthlyCents','totalAllocationCents','annualTravelFundingCents'])require(valid(row[key])&&row[key]>=0,'旅行备款整数分');require(row.routineMonthlyCents===defaultCommon.routineCents&&row.totalAllocationCents===sum([row.travelMonthlyCents,row.otherReserveMonthlyCents,row.routineMonthlyCents]),'旅行方案合计');require(valid(row.beforeFixedObligationsCents)&&row.beforeFixedObligationsCents===wallet.reportedContributionTotalCents-row.totalAllocationCents,'旅行方案未扣F余量');require(row.annualTravelFundingCents===row.travelMonthlyCents*12&&valid(row.annualTravelFundingCents),'旅行年度预留');if(row.id==='full-cap')require(row.travelMonthlyCents===Math.round(wallet.priorAgreements.annualTravelBudgetCapCents/12)&&valid(row.annualRoundingRemainderCents)&&row.annualRoundingRemainderCents===wallet.priorAgreements.annualTravelBudgetCapCents-row.annualTravelFundingCents,'满额年度预留与分舍入');}
  const trial=wallet.travelFundingScenarios.find(row=>row.id==='trial'),travelReserve=p.reserveRows.find(row=>/旅行/.test(row.label));require(travelReserve&&trial.travelMonthlyCents===travelReserve.cents&&trial.otherReserveMonthlyCents===sum(p.reserveRows.filter(row=>row!==travelReserve).map(row=>row.cents))&&wallet.travelFundingScenarios.every(row=>row.otherReserveMonthlyCents===trial.otherReserveMonthlyCents),'旅行与其他专项不重计');
  const salaries=rows('observed_salary');require(next.queries.observed_salary.status==='bank-credits-not-payroll-components'&&text(next.queries.observed_salary.note),'工资观察口径');const salaryKeys=new Set();for(const row of salaries){require(['fg','hyc'].includes(row.member)&&calendarDate(row.date)&&(row.cents===null||(valid(row.cents)&&row.cents>=0)),'工资观察字段');const key=row.member+'|'+row.date;require(!salaryKeys.has(key),'工资观察重复');salaryKeys.add(key);}
  const utilities=rows('utilities_review');require(next.queries.utilities_review.status==='identified-payments-not-complete-monthly-bills','水电观察口径');const utilityKeys=new Set();for(const row of utilities){require(['fg','hyc'].includes(row.member)&&text(row.category)&&text(row.note)&&(row.count===null||(valid(row.count)&&row.count>=0))&&(row.cents===null||(valid(row.cents)&&row.cents>=0)),'水电金额或笔数');const key=row.member+'|'+row.category;require(!utilityKeys.has(key),'水电类别重复');utilityKeys.add(key);}
  const insights=rows('income_utilities_insights');require(next.queries.income_utilities_insights.status==='source-backed-with-explicit-gaps','收入水电结论口径');for(const row of insights)require(text(row.label)&&text(row.note)&&(row.cents===null||valid(row.cents)),'收入水电结论字段');
  const observed=salaryObservationModel(salaries,wallet.reportedMonthlyContributions?.find(row=>row.member==='hyc')?.cents,wallet.personalMonthlyRentCashDueCents.hyc),meanInsight=insights.find(row=>row.label==='黄宇辰近三笔工资入账均值'),cashInsight=insights.find(row=>row.label.startsWith('扣自报月缴入')&&row.label.endsWith('观察均值'));require(meanInsight&&meanInsight.cents===observed.recentMeanCents&&cashInsight&&cashInsight.cents===observed.afterContributionRentCents,'工资观察均值或当前现金余量不一致');
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
  $('budget-output').value=fmt(budget);$('budget-metrics').innerHTML=metric('历史总消费假设',fmt(budget)+' 元','含个人与共同用途')+metric(m.difference>=0?'较历史月均少支出':'较历史月均多支出',fmt(Math.abs(m.difference))+' 元','不等于小荷包节余')+metric('相对历史月均变化',(Math.abs(m.difference)/baseline*100).toFixed(1)+'%','历史口径敏感性');
  $('savings-chart').innerHTML=bars(m.projections.map(r=>({label:r.months+'个月',cents:r.cents})),{height:250,label:'累计消费控制差额情景，人民币元；零轴右侧为较基线少支出，左侧为较基线多支出'});
  $('savings-table').innerHTML=table(['持续期间','历史总消费差额（元）','性质'],m.projections.map(r=>[r.months+'个月',fmt(r.cents),'历史情景，非小荷包节余']));
  $('savings-conclusion').textContent='历史口径下，6个月总消费差额为 '+fmt(m.difference*6)+' 元。历史资料未完成共同用途识别，不能作为小荷包节余或已实现储蓄。';
}
function renderSharedWallet(){
  if(!data)return;
  try{
    const wallet=data.sharedWallet,mode=$('contribution-mode').value;$('income-verification').hidden=mode!=='income';
    const m=sharedWalletModel(wallet,{commonDays:$('common-days').value===''?NaN:Number($('common-days').value),reunions:$('reunions').value===''?NaN:Number($('reunions').value),fgIncomeCents:mode==='income'?inputCents($('fg-income').value):null,hycIncomeCents:mode==='income'?inputCents($('hyc-income').value):null,fixedObligationsCents:inputCents($('shared-fixed').value),contributionMode:mode});
    $('wallet-metrics').innerHTML=metric('旧共同常规试算',fmt(m.routineCents)+' 元／月',m.commonDays+'个共同日、'+m.reunions+'次团聚')+metric('旧共同专项预留提案',fmt(m.reserveCents)+' 元／月','属于专项资金安排，不能重复扣款')+metric('尚未覆盖的共担固定义务 F',valid(m.fixedObligationsCents)?fmt(m.fixedObligationsCents)+' 元／月':'待核','空白为未知；明确输入0才按0计算');
    $('wallet-breakdown').innerHTML=table(['共同常规项目（提案）','数量','单价（元）','月试算（元）'],m.routineRows.map(r=>[r.label,r.count+r.unit,fmt(r.unitCents),fmt(r.cents)]));
    $('wallet-reserves').innerHTML=table(['共同专项预留（提案）','月预留（元）'],wallet.proposal.reserveRows.map(r=>[r.label,fmt(r.cents)]));
    const reported=m.contributionMode==='reported',approx=reported?'约 ':'',basis=reported?'用户自报通常月缴入；流水未核':'本人税后实收 × 50%，按分舍入';
    $('wallet-contributions').innerHTML=metric(reported?'樊高一格自报月缴入':'樊高一格50%核验试算',valid(m.fgContributionCents)?approx+fmt(m.fgContributionCents)+' 元':'待核',basis)+metric(reported?'黄宇辰自报月缴入':'黄宇辰50%核验试算',valid(m.hycContributionCents)?approx+fmt(m.hycContributionCents)+' 元':'待核',basis)+metric(reported?'自报合计缴入情景 C':'双方50%核验合计 C',valid(m.contributionCents)?approx+fmt(m.contributionCents)+' 元／月':'待核',reported?'用户自报约数；非独立流水核验':'各自四舍五入至分后相加');
    const unknown=[];if(!valid(m.fgContributionCents))unknown.push('樊高一格税后实收');if(!valid(m.hycContributionCents))unknown.push('黄宇辰税后实收');
    const prefix=reported?'按用户自报近似缴入测算，':'按50%核验输入情景，';
    $('wallet-result').textContent=unknown.length?'条件余量待核：请核实'+unknown.join('、')+'。未填项不按0处理，不由缴入反推净薪。':m.fixedObligationsCents===null?prefix+(m.beforeFixedObligationsCents>=0?'未扣F的条件空间'+approx+fmt(m.beforeFixedObligationsCents)+' 元／月。':'未扣F已出现共同安排缺口'+approx+fmt(-m.beforeFixedObligationsCents)+' 元／月。')+'F仍待核，尚不能给出扣F后的条件余量，更不是实际结余或储蓄。':m.conditionalRemainderCents>=0?prefix+'每月条件余量'+approx+fmt(m.conditionalRemainderCents)+' 元（C − 共同常规 − 专项预留 − F）。仍需按实际缴入与支出核验，不是已实现储蓄。':prefix+'每月共同安排缺口'+approx+fmt(-m.conditionalRemainderCents)+' 元。需复核共同支出和专项安排，不能将负数称为储蓄。';
    const facts=[['流水核验的月缴入',wallet.actualMonthlyContributionCents,'待流水核验'],['流水核验的共同支出',wallet.actualCommonSpendingCents,'共同用途尚未完整识别'],['流水核验的当前余额',wallet.currentBalanceCents,'待余额核验']];
    if(valid(wallet.reportedContributionTotalCents))facts.unshift(['用户自报通常月缴入',wallet.reportedContributionTotalCents,'约数；非独立核验']);
    $('wallet-actual').innerHTML=table(['小荷包信息','金额（元）','依据与状态'],facts.map(([label,cents,note])=>[label,valid(cents)?fmt(cents):'待核',note]));
    $('wallet-scope').textContent=wallet.scope+'。用户自报与流水核验分列，实际信息不由历史消费、资产或输入情景反推。';
    const rent=wallet.personalMonthlyRentCents,personal=[];
    if(rent){personal.push(['樊高一格月租合同／参考成本',fmt(rent.fg)+' 元','成本参考，与当前现金应付分列'],['黄宇辰月租合同／参考成本',fmt(rent.hyc)+' 元','参考成本保留；不能再按月重复扣已预付现金'],['双方月租参考成本合计',fmt(sum([rent.fg,rent.hyc]))+' 元','非当前现金应付合计，不自动扣入共同池']);}
    const cashRent=wallet.personalMonthlyRentCashDueCents,prepay=wallet.rentPrepayment;personal.push(['樊高一格当前房租现金应付',fmt(cashRent.fg)+' 元','当前现金安排参考；个人住房不扣共同池'],['黄宇辰当前房租现金应付',fmt(cashRent.hyc)+' 元','用户确认樊高一格已预付；0不是缺失补值'],['当前房租现金应付合计',fmt(sum([cashRent.fg,cashRent.hyc]))+' 元','用于当前现金预算对照，不代表租赁成本消失']);
    for(const [member,cents] of Object.entries(wallet.reportedGrossSalaryCents||{}))personal.push([memberName(member)+'自报税前月薪',fmt(cents)+' 元','税前口径；不能作为实发或由缴入反推净薪']);
    $('personal-costs').innerHTML=personal.length?table(['个人成本与收入参考','用户自报金额','口径'],personal):'<p class="note">个人成本参考资料待补。</p>';
    $('rent-prepayment-note').textContent='用户确认：樊高一格已于'+prepay.paymentMonth+'为黄宇辰预付房租，覆盖至'+prepay.coverageThroughMonth+'；覆盖起月'+(prepay.coverageStartMonth===null?'待核':prepay.coverageStartMonth)+'，预付总额'+(prepay.amountCents===null?'待核':fmt(prepay.amountCents)+'元')+'，'+(prepay.transactionMatched?'来源标记已匹配流水':'尚未匹配具体流水')+'。当前黄宇辰现金应付按0处理，月租参考成本仍保留。预付现金发生在5月，按期租赁成本仍可存在；不能因此称全年租金消失、增加收入；不认定黄宇辰欠款。';
    const prior=wallet.priorAgreements;
    $('personal-obligation-scope').textContent=prior?'按'+prior.sourceDate+'既有约定，个人住房、水电、家电、清洁及个人单独旅行属个人范围。房贷车贷由樊高一格个人承担；黄宇辰房租按最新用户确认已由樊高一格预付，不在当前共同池或个人现金预算重复扣除。代付不自动形成双方债务；其他例外需共同确认。':(wallet.obligationScope||'个人与共同义务范围待核')+'。个人贷款和已预付房租不在共同池重复扣除；未明确共同承担的项目不自动计入F。';
    if(prior){
      $('prior-agreements').innerHTML='<h3>'+esc(prior.sourceDate)+'已记录的共同约定</h3>'+table(['既有约定','沿用规则'],[['共同范围','共同活动、共同采购与双方共同旅行；个人单独旅行不属共同'],['个人承担','个人住房、水电、家电、清洁由个人承担'],['支出评审门槛','不超过'+fmt(prior.reviewThresholdCents)+'元默认可付；超过须评审'],['共同池缴入日','黄宇辰每月'+prior.hycContributionDay+'日；樊高一格每月'+prior.fgContributionDay+'日'],['周转金余额目标',fmt(prior.workingCapitalTargetCents)+'元：目标存量，不是已存余额或每月另扣支出'],['双方共同旅行全年上限',fmt(prior.annualTravelBudgetCapCents)+'元：支出上限，不等于必须花满']]);
      const travel=wallet.proposal.reserveRows.find(r=>/旅行/.test(r.label)),fullCapMonthly=Math.round(prior.annualTravelBudgetCapCents/12);
      $('prior-travel-scope').textContent='若按全年旅行上限满额预留，月均需约'+fmt(fullCapMonthly)+'元；'+(travel?'当前每月旅行'+fmt(travel.cents)+'元仅为新增试算，未覆盖全年上限。':'当前专项未核全年旅行预留。')+'需另核已备款与行程；不自动把全年上限当必须支出或额外F。周转金目标与月专项预留分别核对；月机动金额不改变既有支出评审门槛。';
    }else{$('prior-agreements').innerHTML='<p class="note">既有共同约定来源待补，新增试算不替代原已决规则。</p>';$('prior-travel-scope').textContent='旅行专项仅为试算；年度上限、已备款和行程仍需核对。';}
    const scenarios=travelFundingModel(wallet,m);
    $('travel-funding-table').innerHTML=table(['旅行备款口径','共同常规（元／月）','旅行备款（元／月）','其他专项（元／月）','共同安排合计（元／月）','未扣F条件空间（元／月）','扣F后条件余量'],scenarios.map(row=>[row.label,fmt(row.routineMonthlyCents),fmt(row.travelMonthlyCents),fmt(row.otherReserveMonthlyCents),fmt(row.totalAllocationCents),fmt(row.beforeFixedObligationsCents),row.conditionalRemainderCents===null?'F待核':fmt(row.conditionalRemainderCents)+' 元']));
    $('travel-funding-scope').textContent='按当前'+m.commonDays+'个共同日、'+m.reunions+'次团聚及所选缴入口径比较。两套都是备款安排，专项留存不是当月消费；满额方案从零均摊12个月，上限不是必须花满。实际应扣已有专项余额，并按已确定行程和期限安排，不能把差额直接称储蓄。满额月预留按分舍入后，12期仍差'+fmt(scenarios.find(row=>row.id==='full-cap').annualRoundingRemainderCents)+'元，需在末期核齐。';
    const gap=workingCapitalGap(wallet);
    $('working-capital-result').textContent=gap===null?'先核周转金：目标'+fmt(prior.workingCapitalTargetCents)+'元，当前余额未核，缺口仍未知。先核余额并补足周转金缺口，再讨论未分配余量；上述两套条件空间都不能整笔称为自由储蓄。':gap>0?'周转金目标尚差'+fmt(gap)+'元。应优先用扣F后的条件余量补足缺口；目标是存量，不是每月重复扣款。':'已核余额达到周转金目标；是否形成储蓄仍需核对实际缴入、支出、专项与F，不能只凭预算差额判断。';
    const constraints=familyBudgetConstraintModel(wallet,scenarios);
    $('family-budget-constraint-table').innerHTML=table(['备款口径','当前房租现金应付（元）','共同安排（元）','已列现金备款小计（元）','24,000元对照差额（元）'],constraints.map(row=>[row.label,fmt(row.rentCents),fmt(row.commonAllocationCents),fmt(row.listedAllocationCents),fmt(row.differenceCents)]));
    $('family-budget-constraint-result').textContent='按当前共同日数与房租现金应付，旅行3000试算已列备款'+fmt(constraints[0].listedAllocationCents)+'元，24,000元对照'+(constraints[0].differenceCents>=0?'尚余'+fmt(constraints[0].differenceCents)+'元':'已超出'+fmt(-constraints[0].differenceCents)+'元')+'；满额全年旅行备款口径为'+fmt(constraints[1].listedAllocationCents)+'元，'+(constraints[1].differenceCents<0?'已超24,000元'+fmt(-constraints[1].differenceCents)+'元':'仅余'+fmt(constraints[1].differenceCents)+'元')+'，仍未计F、个人水电、工作餐、通勤及待核贷款现金支出，空间很紧。此为当前现金预算；历史预付和按期租赁成本须另列，不能因当前不重复付款而认定全年租金消失。';
  }catch(error){for(const id of ['wallet-metrics','wallet-breakdown','wallet-reserves','wallet-contributions','wallet-actual','travel-funding-table','family-budget-constraint-table'])$(id).innerHTML='';for(const id of ['travel-funding-scope','working-capital-result','family-budget-constraint-result'])$(id).textContent='';$('wallet-result').textContent='共同预算输入无效：'+error.message+'；未输出条件余量。';}
}
function renderSupporting(){
  const rows=data.queries.management.rows;$('management').innerHTML=table(['项目','已记录信息','处理'],rows.map(r=>[r.label,r.value,r.note]));
  $('sources').innerHTML='<p>此前全部已有资料归属樊高一格；新增三份支付及银行资料归属黄宇辰，依据2026年11月4日用户明确确认。</p>'+table(['来源','数据截止','覆盖说明'],data.sources.map(r=>[r.label,r.asOf,r.coverage]))+'<p class="note">金额以整数分计算。消费、退款、还款、资金转移及投资分别处理；未把中行付款重复加入支付渠道消费。来源缺失不填零，不跨币种或不同时点拼成当前总资产。每周约会上限已确认，轮换组合与历史情景仅作参考。</p>';
}
function renderIncomeUtilities(){
  const salary=data.queries.observed_salary,wallet=data.sharedWallet,observed=salaryObservationModel(salary.rows,wallet.reportedMonthlyContributions.find(row=>row.member==='hyc').cents,wallet.personalMonthlyRentCashDueCents.hyc);
  $('salary-metrics').innerHTML=metric('近三笔工资入账均值',fmt(observed.recentMeanCents)+' 元','观察值；工资条组成和所属期缺失')+metric('自报月缴入及当前房租应付',fmt(sum([wallet.reportedMonthlyContributions.find(row=>row.member==='hyc').cents,wallet.personalMonthlyRentCashDueCents.hyc]))+' 元','缴入约数；本期已预付租金不再扣')+metric('扣当前现金两项后观察均值',fmt(observed.afterContributionRentCents)+' 元','仍需个人水电、生活与其他义务');
  $('salary-table').innerHTML=table(['入账日（非工资所属期）','成员','已观察工资入账（元）'],salary.rows.map(row=>[row.date,memberName(row.member),fmt(row.cents)]));$('salary-scope').textContent=salary.note+'。7月起记录的是入账日期，不代表工资所属月份；这些银行入账不能据此确认标准净薪，不自动填入50%收入核验栏，也不作未来稳定收入预测。';
  const utilities=data.queries.utilities_review.rows,categories=[...new Set(utilities.map(row=>row.category))];
  $('utilities-table').innerHTML=table(['类别','樊高一格已识别付款（元）','笔数','黄宇辰已识别付款（元）','笔数','账期与覆盖说明'],categories.map(category=>{const fg=utilities.find(row=>row.member==='fg'&&row.category===category),hyc=utilities.find(row=>row.member==='hyc'&&row.category===category);return [category,fg?.cents===null||!fg?'未识别':fmt(fg.cents),valid(fg?.count)?fg.count:'未知',hyc?.cents===null||!hyc?'未识别':fmt(hyc.cents),valid(hyc?.count)?hyc.count:'未知',[fg?'樊高一格：'+fg.note:'樊高一格资料缺失',hyc?'黄宇辰：'+hyc.note:'黄宇辰资料缺失'].join('；')];}));
  $('income-utilities-insights').innerHTML=table(['观察与解释','金额（元）','限制'],data.queries.income_utilities_insights.rows.map(row=>[row.label,fmt(row.cents),row.note]));
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
    $('common-days').value=data.sharedWallet.proposal.commonDays;$('reunions').value=data.sharedWallet.proposal.reunions;$('fg-income').value='';$('hyc-income').value='';$('shared-fixed').value=data.sharedWallet.sharedFixedObligationsCents===null?'':cellAmount(data.sharedWallet.sharedFixedObligationsCents);const hasReported=Array.isArray(data.sharedWallet.reportedMonthlyContributions);$('contribution-mode').innerHTML='<option value="reported"'+(hasReported?'':' disabled')+'>用户自报通常缴入（约数）</option><option value="income">按税后实收50%核验</option>';$('contribution-mode').value=hasReported?'reported':'income';
    renderWeeklyDateBudget();renderSharedWallet();renderIncomeUtilities();renderMonthly();renderCategories();renderBudget();renderSupporting();$('status').hidden=true;$('analysis').hidden=false;
  }catch(e){if(sequence!==loadSequence)return;data=undefined;monthly=[];currentMonthly=null;$('export-monthly').disabled=true;$('analysis').hidden=true;$('status').hidden=false;$('status').textContent='数据读取失败，暂不显示分析。'+e.message+'，请点击重读快照。';}
  finally{clearTimeout(timer);if(sequence===loadSequence){$('analysis').setAttribute('aria-busy','false');loadController=null;}}
}
for(const id of ['member','start','end'])$(id).addEventListener('change',renderMonthly);
$('weekly-date-count').addEventListener('change',renderWeeklyDateBudget);
$('category-member').addEventListener('change',renderCategories);$('budget').addEventListener('input',renderBudget);for(const id of ['fg-income','hyc-income','shared-fixed','common-days','reunions'])$(id).addEventListener('input',renderSharedWallet);
$('contribution-mode').addEventListener('change',renderSharedWallet);
$('wallet-reset').addEventListener('click',()=>{if(!data)return;$('common-days').value=data.sharedWallet.proposal.commonDays;$('reunions').value=data.sharedWallet.proposal.reunions;renderSharedWallet();});
$('reset').addEventListener('click',()=>{$('budget').value=24000;renderBudget();});$('reload').addEventListener('click',load);
$('export-monthly').addEventListener('click',()=>{if(!currentMonthly?.selected.length||$('export-monthly').disabled)return;const url=URL.createObjectURL(new Blob([monthlyCsv(currentMonthly)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=memberName(currentMonthly.member)+'-'+currentMonthly.start+'至'+currentMonthly.end+'-记录月度净消费.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
load();
