const assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('./sources.cjs');
const ctx=vm.createContext({});
vm.runInContext(['meter-panels-core','forecast-core','vpn-traffic-core','forecast-display','i18n','dashboard'].map(readSource).join('\n'),ctx);
const now=2000000000,w={remaining:79,resetAt:now+6*86400,durationMins:10080};
ctx.Date=class extends Date {static now(){return now*1000;}};
const results=[];
for(const [status,headline] of [['safe','Expected to last until reset'],['tight','May be tight before reset'],['risk','May run out before reset']]){
 const f={basis:'history',status,text:'On track · ~15–30% at reset',budget:'Budget 13%/day'};
 const before=JSON.stringify(f);const s=ctx.quotaForecastSummary(w,f,now);
 assert.equal(s.headline,headline);assert.equal(s.detail,'~15–30% at reset');assert.equal(s.status,status);
 assert.equal(JSON.stringify(f),before);results.push(s);
}
let s=ctx.quotaForecastSummary(w,{basis:'recent',projectedRemaining:58,horizon:3600,text:'If pace holds: ~58% in 1h',status:'unknown'},now);
assert.equal(s.headline,'Only a short-term estimate');assert.equal(s.status,'unknown');results.push(s);
s=ctx.quotaForecastSummary(w,{basis:'recent',projectedRemaining:-4,horizon:1800,text:'If pace holds: empty within 30m',status:'risk'},now);
assert.equal(s.headline,'May run out within 30m');results.push(s);
s=ctx.quotaForecastSummary({...w,resetAt:now+600},{basis:'recent',projectedRemaining:58,horizon:600,text:'If pace holds: ~58% at reset',status:'unknown'},now);
assert.equal(s.headline,'Estimate to reset only');results.push(s);
for(const reason of ['Need 3 days of history','History incomplete','No recent use','Recent usage jump · waiting for sustained observations','Paused · quota stale','Reset time unknown','Awaiting reset']) {
 s=ctx.quotaForecastSummary(w,{status:'unknown',reason,budget:'Budget 13%/day'},now);
 assert.equal(s.status,'unknown');assert(!/Expected|before reset/.test(s.headline));results.push(s);
}
results.push(ctx.quotaForecastSummary(w,{status:'exhausted'},now));
const risk={basis:'tokenHistory',verdict:'risk',status:'unknown',typicalConsumption:158,
 text:'Historical rough estimate · ~0% at reset'};
for(const basis of ['tokenHistory','history']){
 const summary=ctx.quotaForecastSummary(w,{...risk,basis,status:basis==='history'?'risk':'unknown'},now);
 results.push(summary);const row=ctx.dashboardForecast(summary);
 assert.equal(row.label,'Estimated at reset');assert.equal(row.value,'0%');
 assert.equal(row.basis,'');assert.equal(row.status,basis==='history'?'risk':'unknown');
 assert.equal(row.outcome,'Expected to run out early','zero remaining retains the early-depletion warning');
 assert(!('timeLeftDays' in summary),'display no longer converts remaining quota into days');
}
assert.equal(ctx.dashboardForecast({headline:'May run out before reset',detail:'~0–0% at reset',status:'risk'}).value,'0%');
assert.equal(ctx.dashboardForecast({headline:'May be tight before reset',detail:'~0–30% at reset',status:'tight'}).value,'0–30%','a real range must not be collapsed');
for(const verdict of ['safe','tight','risk'])results.push(ctx.quotaForecastSummary(w,
 {basis:'tokenHistory',status:'unknown',verdict,text:'Historical rough estimate · ~0–30% at reset'},now));
const unit=1024**3,snapshot={remainingBytes:375.74*unit,totalBytes:400*unit,resetDays:30};
const p={hasValue:true,stale:false,forecastText:'Budget ~12.5G/day · learning',detail:'Updated 10:54',resetText:'Resets in 30 days'};
for(const [consumption,headline] of [[235.44,'At reported pace: lasts to reset'],[400,'At reported pace: may run out'],[375.74,'At reported pace: used up by reset']]){
 s=ctx.trafficForecastSummary(snapshot,p,{basis:'reportedHistory',highConsumption:consumption*unit});
 assert.equal(s.headline,headline);assert.equal(s.status,'unknown','reported history must never acquire safe/risk colors');results.push(s);
}
assert.equal(results.at(-1).detail,'At reset: ~0G left · estimate only','exact exhaustion at reset is not early exhaustion');
// Report days EARLIER than reset, not days of remaining use from now.
const timingForecast=(days,crossing)=>({basis:'adaptive',verdict:'risk',precision:'day',evidence:'supported',typicalConsumption:400*unit,
 highConsumption:500*unit,crossingDays:crossing,horizonDays:days,text:'At reset: ~0G left · estimate only'});
for(const [days,crossing,lead,display] of [[28,18,10,'10'],[28,17.4,10.6,'11'],[28,27,1,'1'],[28,27.5,.5,'<1']]){
 const snapshotAtReset={...snapshot,resetDays:days},forecast=timingForecast(days,crossing),before=JSON.stringify(forecast);
 const summary=ctx.trafficForecastSummary(snapshotAtReset,p,forecast),compact=ctx.compactForecastSummary(summary);
 const row=ctx.dashboardForecast(summary),short=ctx.compactOutcomeLabel(ctx.dashboardOutcomeText({kind:'traffic'},row));
 assert(Math.abs(compact.depletionLeadDays-lead)<1e-9);
 assert.equal(summary.headline,'Estimated empty '+display+'d before reset');
 assert.equal(row.outcome,summary.headline);
 assert.equal(short,'Est. empty '+display+'d early');
 assert.equal(row.value,'0G','estimated remaining stays an amount, not a duration');
 const badge=ctx.dashboardMetricBadge({kind:'traffic',hasValue:true,stale:false,summary});
 assert.equal(badge.label,short);assert.equal(badge.tone,'warning','the existing typical early crossing may be emphasized in the shared title style');
 assert.equal(summary.status,'unknown','a warning badge is not a confidence upgrade');
 ctx.uiLanguage='zh-CN';assert.equal(ctx.uiText(short),'提前约 '+display+' 天用尽');
 assert.equal(ctx.uiText('Traffic · '+summary.headline),'流量 · 预计重置前 '+display+' 天用尽','composed accessibility text is localized');
 ctx.uiLanguage='en';assert.equal(ctx.uiText(short),short);
 assert.equal(JSON.stringify(forecast),before,'presentation does not change the model');results.push(summary);
}
const exactReset=ctx.trafficForecastSummary(snapshot,p,{...timingForecast(30,30),typicalConsumption:snapshot.remainingBytes});
assert.equal(ctx.compactForecastSummary(exactReset).outcome,'May run out','without a supported early ETA, depletion stays qualitative');
assert.equal(ctx.compactForecastSummary(exactReset).depletionLeadDays,null,'exact reset exhaustion is not zero days early');
// Coarse warnings retain useful timing without promoting the model's
// precision/evidence or claiming every scenario depletes before reset.
for(const [crossing,range,label] of [[25,[14,31],'May run out ~5d early'],
 [29.5,[28,31],'May run out ~<1d early'],[25,[23,27],'May run out 3–7d early'],
 [25,[24,26],'May run out ~5d early'],[25,null,'May run out ~5d early']]){
 const f={...timingForecast(30,crossing),precision:'qualitative',evidence:'limited',crossingRange:range},before=JSON.stringify(f);
 const summary=ctx.trafficForecastSummary(snapshot,p,f);
 assert.equal(summary.headline,label);assert.equal(summary.adaptive.possibleDepletionLabel,label);
 assert.equal(summary.adaptive.depletionLeadDays,null,'coarse timing does not pass the stricter date gate');
 const badge=ctx.trafficPredictionBadge({hasValue:true,stale:false,fraction:.5,resetDays:30,summary},f);
 assert.equal(badge.label,label);assert.equal(badge.tone,'warning');assert.equal(ctx.meterStatusSymbol(label),'exclamationmark.triangle.fill');
 assert.equal(ctx.dashboardForecast(summary).outcome,label,'accessibility and narrow fallback share the numeric warning');
 ctx.uiLanguage='zh-CN';assert.match(ctx.uiText(label),/^提前约 /);
 assert(!/可能|预计/.test(ctx.uiText(label)),'numeric warning keeps only the concise approximate lead');
 ctx.uiLanguage='en';assert.equal(ctx.uiText(label),label,'English and evidence semantics are unchanged');
 assert.equal(JSON.stringify(f),before,'display does not change the forecast or precision');
 results.push(summary);
}
for(const f of [{...timingForecast(30,31),precision:'qualitative'},
 {...timingForecast(30,25),verdict:'risk',typicalConsumption:100*unit},
 {...timingForecast(28,25),precision:'qualitative'}])
 assert.equal(ctx.trafficPossibleDepletionText(snapshot,f),null,'non-crossing, held warning or mismatched horizon must not invent days');
for(const crossing of [undefined,null,'18',-1,30,31,NaN,Infinity]){
 const summary=ctx.trafficForecastSummary(snapshot,p,timingForecast(30,crossing));
 assert.equal(ctx.compactForecastSummary(summary).depletionLeadDays,null,'invalid/non-crossing paths have no invented day count');
 assert(!/^Estimated empty /.test(summary.headline));
}
for(const [ss,ff] of [[{...snapshot,resetDays:null},timingForecast(30,18)],
 [snapshot,timingForecast(28,18)],
 [snapshot,{...timingForecast(30,18),typicalConsumption:100*unit,verdict:'tight'}]]){
 assert.equal(ctx.trafficDepletionLeadDays(ss,ff),null,'unknown/mismatched horizons and high-only depletion cannot supply an early ETA');
 assert(!/^Estimated empty /.test(ctx.trafficForecastSummary(ss,p,ff).headline));
}
for(const presentation of [{...p,stale:true},{...p,hasValue:false}]){
 const summary=ctx.trafficForecastSummary(snapshot,presentation,timingForecast(30,18));
 assert.equal(summary.headline,'Prediction paused');assert(!summary.adaptive);
}
assert.equal(ctx.trafficForecastSummary({...snapshot,remainingBytes:0},p,timingForecast(30,0)).headline,'Traffic exhausted');
for(const state of [{...p,hasValue:false},{...p,stale:true}]){
 s=ctx.trafficForecastSummary(snapshot,state,{basis:'reportedHistory',highConsumption:unit});
 assert.equal(s.headline,'Prediction paused');results.push(s);
}
s=ctx.trafficForecastSummary(snapshot,p,{reason:'Need more consecutive reported history'});
assert.equal(s.headline,'Not enough data to predict');assert.match(s.detail,/Budget/);results.push(s);
s=ctx.trafficForecastSummary({...snapshot,resetDays:0},p,{basis:'reportedHistory',text:'If reported pace holds: ~8 days left'});
assert.equal(s.headline,'Next reset date unknown');assert.equal(s.detail,'~8 days left · estimate only');results.push(s);
results.push(ctx.trafficForecastSummary({...snapshot,remainingBytes:0},p,{}));
for(const summary of results)for(const text of [summary.headline,summary.detail]){
 ctx.uiLanguage='zh-CN';assert(!/[A-Za-z]{2,}/.test(ctx.uiText(text)),`Untranslated summary: ${text}`);
 ctx.uiLanguage='en';assert.equal(ctx.uiText(text),text);
}
for(const summary of results) {
 const before=JSON.stringify(summary), row=ctx.compactForecastSummary(summary);
 assert.equal(JSON.stringify(summary),before,'compact rendering never changes forecast results');
 assert.equal(row.status,summary.status,'reported estimates remain neutral and stale states remain unknown');
 for(const text of [row.outcome,row.value,row.note]){
  ctx.uiLanguage='zh-CN';assert(!/[A-Za-z]{2,}/.test(ctx.uiText(text)),`Untranslated compact forecast: ${text}`);
  ctx.uiLanguage='en';assert.equal(ctx.uiText(text),text);
 }
 const dashboard=ctx.dashboardForecast(summary);
 assert.equal(dashboard.status,summary.status);
 assert(!dashboard.value.startsWith('≈'),'estimated headings make the approximation prefix redundant');
 if(/historical rough estimate|reported estimate/i.test(row.note)&&row.value!=='—')assert.equal(dashboard.basis,'','provenance stays in data, not visible prose');
 for(const text of [dashboard.label,dashboard.value,dashboard.outcome,dashboard.basis]){
  ctx.uiLanguage='zh-CN';assert(!/[A-Za-z]{2,}/.test(ctx.uiText(text)),`Untranslated dashboard field: ${text}`);
  ctx.uiLanguage='en';assert.equal(ctx.uiText(text),text);
 }
}
const unknown=ctx.compactForecastSummary({headline:'Not enough data to predict',detail:'Budget 13%/day',status:'unknown'});
assert.equal(unknown.value,'—','a daily budget must not appear in the predicted-remaining column');
assert.equal(unknown.note,'Budget 13%/day');
const short=ctx.compactForecastSummary({headline:'May run out within 30m',detail:'empty within 30m',status:'risk'});
assert.equal(short.value,'≈0%');assert.equal(short.note,'In 30m · recent pace','short horizon stays explicit');

// Check the actual badge entry point: quota emphasis follows measured cycle
// pace, while forecast outcomes retain their original evidence/confidence.
for(const [verdict,outcome] of [
 ['risk','Expected to run out early'],
 ['tight','Low reserve at reset'],
 ['safe','Projected surplus']
]){
 const forecast={basis:'tokenHistory',status:'unknown',verdict,
  typicalConsumption:verdict==='risk'?158:60,text:'Historical rough estimate · ~0–30% at reset'};
 const summary=ctx.quotaForecastSummary(w,forecast,now),row=ctx.dashboardForecast(summary);
 const before=JSON.stringify({forecast,summary,row});
 assert.equal(row.outcome,outcome);
 assert.equal(row.status,'unknown','styling never upgrades rough-history confidence');
 const data={window:w,hasValue:true,stale:false,summary};
 assert.equal(ctx.dashboardMetricBadge(data).tone,'warning','quota badge follows actual cycle pace, not the conditional verdict');
 assert.equal(ctx.dashboardMetricBadge({...data,stale:true}).tone,'muted','stale data overrides risk emphasis');
 assert.equal(JSON.stringify({forecast,summary,row}),before,'badge selection must not mutate forecasts');
}
for(const [consumption,outcome] of [[235.44,'Projected surplus'],[400,'Expected to run out early'],[375.74,'Expected empty at reset']]){
 const summary=ctx.trafficForecastSummary(snapshot,p,{basis:'reportedHistory',highConsumption:consumption*unit});
 const row=ctx.dashboardForecast(summary),before=JSON.stringify(row);
 assert.equal(row.outcome,outcome);
 assert.equal(row.status,'unknown');
 assert.equal(ctx.dashboardOutcomeText({kind:'traffic'},row),{
  'Projected surplus':'Expected remaining at reset',
  'Expected to run out early':'Projected early depletion',
  'Expected empty at reset':'Projected depletion at reset'
 }[outcome],'traffic conclusion follows actual forecast, never a fixed depletion label');
 const badge=ctx.dashboardMetricBadge({kind:'traffic',hasValue:true,stale:false,summary});
 assert.equal(badge.tone,outcome==='Projected surplus'?'normal':'warning','visible depletion/tightness remains a warning without changing model confidence');
 assert.equal(summary.status,'unknown','green is a display convention, not a confidence upgrade');
 assert.equal(ctx.dashboardMetricBadge({kind:'traffic',hasValue:true,stale:true,summary}).tone,'muted','stale reserves never stay green');
 assert.equal(ctx.dashboardMetricBadge({kind:'traffic',hasValue:false,stale:false,summary}).tone,'muted','missing data never shows green');
 assert.equal(JSON.stringify(row),before);
}
for(const data of [{},{kind:'traffic'}]){
 const summary=data.kind==='traffic'?ctx.trafficForecastSummary({...snapshot,remainingBytes:0},p,{}):
  ctx.quotaForecastSummary({...w,remaining:0},{status:'exhausted'},now);
 const row=ctx.dashboardForecast(summary);
 assert.equal(row.outcome,'Exhausted');
 const badgeData={...data,window:{...w,remaining:0},hasValue:true,stale:false,summary};
 assert.equal(ctx.dashboardMetricBadge(badgeData).tone,'critical','confirmed exhaustion remains critical');
 assert.equal(ctx.dashboardMetricBadge({...badgeData,stale:true}).tone,'muted','stale exhaustion is not presented as fresh');
}
for(const headline of ['Not enough data to predict','Prediction paused','Next reset date unknown']){
 const row=ctx.dashboardForecast({headline,detail:'Waiting for quota',status:'unknown'});
 assert(!/depletion|remaining at reset/.test(ctx.dashboardOutcomeText({kind:'traffic'},row)),
  'unknown or paused traffic must not acquire a positive forecast');
 assert.equal(ctx.dashboardMetricBadge({kind:'traffic',hasValue:true,stale:false,
  summary:{headline,detail:'Waiting for quota',status:'unknown'}}).tone,'muted','unknown evidence is not a traffic warning');
}
assert.equal(ctx.dashboardOutcomeText({kind:'traffic',stale:true},{outcome:'Projected surplus',value:'88.94G'}),'');
assert.equal(ctx.dashboardOutcomeText({},{outcome:'Projected surplus',value:'30%'}),'','quota surplus remains concise');
const session={remaining:8,resetAt:now+3*3600,durationMins:300};
const sessionSummary=ctx.quotaForecastSummary(session,{basis:'recent',projectedRemaining:-4,horizon:1800,
 text:'If pace holds: empty within 30m',status:'risk'},now);
const sessionRow=ctx.dashboardForecast(sessionSummary);
assert.equal(sessionRow.value,'0%');
assert.equal(sessionRow.outcome,'Expected to run out soon','short-term Session scenarios do not claim a full-cycle early depletion');
assert.equal(sessionRow.label,'In 30m','short-term estimates must not claim to cover the whole reset cycle');
assert.equal(ctx.dashboardMetricBadge({window:session,hasValue:true,stale:false,summary:sessionSummary}).tone,'warning');
assert.equal(ctx.dashboardMetricBadge({window:{...w,remaining:100},hasValue:true,stale:false}).tone,'muted','unmodelled cycle progress is not a green forecast');
for(const [key,chinese] of [['Expected to run out early','预计在重置前用尽'],['Expected to run out soon','预计近期用尽']]){
 ctx.uiLanguage='zh-CN';assert.equal(ctx.uiText(key),chinese);
 ctx.uiLanguage='en';assert.equal(ctx.uiText(key),key);
}
console.log('Forecast display checks passed: evidence unchanged, green visible reserves only, warning/stale/exhausted overrides, equality boundary and bilingual text.');
