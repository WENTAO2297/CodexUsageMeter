const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {readSource}=require('./sources.cjs');
const c=vm.createContext({});
for(const name of ['forecast-core','adaptive-forecast-core','forecast-learning-core','vpn-forecast-models','vpn-forecast-core','forecast-display'])
 vm.runInContext(readSource(name),c);
const old=vm.createContext({});vm.runInContext(readSource('forecast-core'),old);
vm.runInContext(fs.readFileSync(__dirname+'/fixtures/forecast-v4.js','utf8'),old);
const D=86400,G=1024**3,at=24000*D,clean=x=>JSON.parse(JSON.stringify(x));
function traffic(count=35,rate=10){let state=c.afNew('vpn','fixture',at);
 state=c.afTrafficMerge(state,{state:'ready',fetchedAt:at*1000,days:Array.from({length:count},(_,i)=>[at-(count-i)*D,rate*G])},at);
 state.last={at,used:100*G,total:1000*G,remaining:900*G,resetAt:0,resetDays:28};return state;}
for(const rate of [0,1,10,10000]){
 const fit=c.afVPNFitSES(Array(33).fill(rate));assert(Math.abs(fit.level-rate)<1e-8);
 assert(fit.alpha>=.001&&fit.alpha<=.999);assert(fit.residuals.every(v=>Math.abs(v)<1e-8));
}
assert.equal(c.afVPNFitSES([1,2,3]),null);
let state=traffic(),built=c.afTrafficModels(state,at,28),forecast=c.afVPNForecast(state,at,28,100*G);
assert.deepEqual(Object.keys(built.models),['multiSES']);assert.equal(forecast.typicalConsumption/G,280);
assert.equal(forecast.algorithmVersion,c.AF_VPN_VERSION);
assert.equal(forecast.crossingDays,10);assert.equal(forecast.evidence,'supported');
assert.deepEqual(clean(forecast.resetLeadRange),[17,19]);assert.equal(forecast.precision,'day');
assert.equal(c.trafficDepletionLeadDays({remainingBytes:100*G,resetDays:28},forecast),18);
assert.equal(forecast.scoredIntervals,0);assert.equal(forecast.quality,'conditional');
assert.deepEqual(clean(forecast.baselines),{mean7:280*G,mean28:280*G,simple:280*G});
const before=JSON.stringify(state);c.afVPNForecast(state,at,7,100*G);assert.equal(JSON.stringify(state),before);
const future=clean(state);future.days.push({at:at+D,value:99999*G,firstSeen:at+4*D,changedAt:at+4*D,lastSeen:at+4*D,revision:0});
assert.deepEqual(clean(c.afTrafficModels(future,at,28)),clean(built),'later observations cannot leak into an old origin');

state=traffic(6);built=c.afTrafficModels(state,at,28);
assert.deepEqual(Object.keys(built.models),['pooled'],'short clean history can use a limited mean, not a fabricated ETS fit');
assert.equal(c.afVPNForecast(state,at,28,100*G).evidence,'limited');
state=traffic();state.days=state.days.filter(d=>!([5,6,7,8,9].includes((at-d.at)/D)));
assert.equal(Object.keys(c.afTrafficModels(state,at,28).models).length,0,'global coverage cannot hide a sparse recent week');
state=traffic();state.days=state.days.filter(d=>d.at!==at-5*D);
built=c.afTrafficModels(state,at,28);assert.deepEqual(Object.keys(built.models),['pooled'],'a gap cannot be compressed into an ETS training day');
assert(!built.rows.some(r=>r.loss===0),'missing day is never inserted as zero');

const archive=traffic(180),archiveBefore=JSON.stringify(archive.days);
assert.equal(archive.days.length,180,'the numeric prediction journal retains the recovered long history');
assert.equal(c.afTrafficModels(archive,at,28).rows.length,35,'archive retention is independent of the selected fitting window');
assert.equal(JSON.stringify(archive.days),archiveBefore);
const rolling=c.afTrafficMerge(archive,{state:'ready',fetchedAt:at*1000,days:[[at-4*D,12*G],[at-3*D,0]]},at);
assert(rolling.days.some(d=>d.at===at-180*D),'a narrower later server response cannot discard archived older dates');
assert.equal(rolling.days.find(d=>d.at===at-4*D).value,12*G,'revisions replace, rather than add to, archived values');
assert.equal(rolling.days.find(d=>d.at===at-3*D).value,0,'an explicit zero remains a report');
assert.equal(c.afPrune(rolling,at+D).days.length,179,'expired archive dates are still pruned at 180 days');
const replay=require('./vpn-model-backtest.cjs');
const missingBaseline=[{at,truth:{1:[10]},forecasts:{example:[8]},current:{},current5:{1:8}}];
const score=replay.score(missingBaseline,'example',1);
assert.equal(score.maeGiB,2);assert.equal(score.scaledMAE,null);
assert.equal(score.hypotheticalBudgets.decisions,0,'a missing recent mean is not a fabricated budget for longer-history candidates');

state=traffic();
forecast=c.afVPNForecast(state,at,7,75*G);
assert.equal(forecast.verdict,'safe');assert.equal(forecast.resetSensitive,true);
assert.equal(c.trafficPredictionBadge({hasValue:true,resetDays:7,fraction:.5},forecast).label,'May be tight');
const summary=c.trafficForecastSummary({remainingBytes:75*G,resetDays:7},
 {hasValue:true,stale:false},{...forecast,text:'At reset: ~5G left · estimate only'});
assert.equal(summary.adaptive.outcome,'May be tight');assert.equal(summary.headline,'May be tight before reset');
assert.equal(c.trafficPossibleDepletionText({remainingBytes:75*G,resetDays:7},forecast),null);
const noTiming=c.afDistribution(state,{models:{blocks:{center:110*G,samples:[100*G,110*G,120*G]}},rows:built.rows,coverageOK:true},10,10*G,at);
assert.equal(noTiming.timingAvailable,false);assert.equal(noTiming.crossingDays,null);assert.equal(noTiming.precision,'qualitative');
assert.equal(c.trafficPossibleDepletionText({remainingBytes:10*G,resetDays:10},noTiming),null,'a total does not establish a depletion date');

// Keep the user's coarse "~N days early" feature. Uncertain non-depleting
// scenarios lower precision; they do not erase a valid typical path's ETA.
const coarse={basis:'adaptive',algorithmVersion:5,evidence:'supported',precision:'qualitative',verdict:'risk',
 typicalConsumption:400*G,highConsumption:600*G,horizonDays:24,crossingDays:16.4,crossingRange:[10.2,25],
 timingAvailable:true,resetStable:true,resetSensitive:false,resetLeadRange:null,text:'At reset: ~0G left · estimate only'};
const coarseSnapshot={remainingBytes:272*G,totalBytes:400*G,resetDays:24};
const coarseBefore=JSON.stringify(coarse),coarseSummary=c.trafficForecastSummary(coarseSnapshot,{hasValue:true,stale:false},coarse);
assert.equal(c.trafficPossibleDepletionText(coarseSnapshot,coarse),'May run out ~8d early');
assert.equal(coarseSummary.headline,'May run out ~8d early');
assert.equal(c.trafficPredictionBadge({hasValue:true,resetDays:24,fraction:.68,summary:coarseSummary},coarse).label,'May run out ~8d early');
assert.equal(c.trafficDepletionLeadDays(coarseSnapshot,coarse),null,'the strict day-precision result stays unavailable');
assert.equal(JSON.stringify(coarse),coarseBefore,'restoring the label cannot change the prediction or precision');
assert.equal(c.trafficPossibleDepletionText(coarseSnapshot,{...coarse,crossingRange:[12,20]}),'May run out 4–12d early');
assert.equal(c.trafficPossibleDepletionText(coarseSnapshot,{...coarse,timingAvailable:false}),null);
const nearReset={...coarse,crossingDays:23.75,resetSensitive:true};
const nearSummary=c.trafficForecastSummary(coarseSnapshot,{hasValue:true,stale:false},nearReset);
assert.equal(nearSummary.headline,'May run out ~<1d early');
assert.equal(c.trafficPredictionBadge({hasValue:true,resetDays:24,fraction:.68,summary:nearSummary},nearReset).label,'May run out ~<1d early');

// The first measured high-use hours belong at the front, not spread over a month.
state=traffic();state.balances=[];
for(let i=0;i<=4;i++)state.balances.push([at-D+i*D/4,(100+i*10)*G,1000*G]);
state.last={...state.last,used:140*G,remaining:860*G};
built=c.afTrafficModels(state,at,28);assert.equal(built.recentChange.direction,'up');
assert.equal(built.recentChange.confirmed,true);assert.equal(built.models.multiSES.center/G,310);
let short=c.afVPNSample(built.models.multiSES,built,1,20*G,at,()=>.5,true);
let long=c.afVPNSample(built.models.multiSES,built,28,20*G,at,()=>.5,true);
assert.equal(short.crossing,.5);assert.equal(long.crossing,.5,'same daily path has the same crossing at every sufficient horizon');
assert.equal(long.loss/G,310,'a one-day confirmed rise is not automatically extrapolated for the whole month');
const fractional=c.afVPNCalendar(at+D/4,1.5);assert.deepEqual(clean(fractional.map(s=>s.duration)),[.75,.75]);

for(const [count,expected] of [[7,[7]],[10,[7,10]],[14,[7,14]],[35,[7,14,35]]]){
 const fit=c.afVPNFitMultiSES(Array.from({length:count},(_,i)=>i+1));
 assert.deepEqual(clean(fit.members.map(m=>m.days)),expected,'a short tail is not counted as duplicate models');
}
assert.equal(c.afVPNFitMultiSES([1,2,3]),null);
const isolated=Array(35).fill(10);isolated[32]=100;
const spikeFit=c.afVPNFitMultiSES(isolated);assert(spikeFit.isolatedSpike);
assert.deepEqual(clean(spikeFit.members.map(m=>m.days)),[35]);
assert.equal(spikeFit.level,c.afVPNFitSES(isolated).level,'an isolated peak still contributes to the real long-run fit');
isolated[33]=100;assert(!c.afVPNFitMultiSES(isolated).isolatedSpike,'a sustained multi-day increase is not suppressed as one download');
const fading={rate:5*G,components:[{days:7,level:60*G},{days:14,level:20*G},{days:35,level:5*G}],lag:2};
assert(c.afVPNFutureRate(fading,0)>c.afVPNFutureRate(fading,14));
assert(Math.abs(c.afVPNFutureRate(fading,1000)-5*G)<.01,'short spikes do not become a permanent monthly level');
const first=c.afVPNSample(fading,{rows:[]},.6,10*G,at+D/4,()=>.5,true),far=c.afVPNSample(fading,{rows:[]},28,10*G,at+D/4,()=>.5,true);
assert(Math.abs(first.crossing-far.crossing)<1e-9,'partial-day and long forecasts share the exact early path');
assert(Math.abs(c.afVPNModelTotal(fading,at+D/4,28)-far.loss)<1e-6,'display total and point ETA use the same dated path');
const migrated=clean(traffic());migrated.version=5;migrated.alert={value:'risk',count:0,at};
const upgraded=c.afNormalize(migrated,'vpn','fixture',at);
assert.equal(upgraded.version,c.AF_VPN_VERSION);assert.equal(upgraded.days.length,migrated.days.length);assert.equal(upgraded.alert,null);
assert.equal(c.afNormalize({...clean(traffic()),version:6},'quota','fixture',at),null,'VPN migration cannot expand quota versions');

// Without evidence of a weekday effect, numerical behavior is unchanged.
// The version is intentionally independent of the previous model's scores.
for(const horizon of [1,3,6.5])for(const remaining of [0,5,70]){
 let modern=c.afNew('quota','fixture',at),legacy=old.afNew('quota','fixture',at);
 for(let i=0;i<6;i++)for(const [ctx,s] of [[c,modern],[old,legacy]])
  ctx.afQuotaObserve(s,{durationMins:10080,resetAt:at+7*D,remaining:100-i*5},'pro',at+i*D);
 const now=at+5*D,mb=c.afQuotaModels(modern,now,horizon,null,null),lb=old.afQuotaModels(legacy,now,horizon,null,null);
 assert.deepEqual(clean(mb),clean(lb));
 assert.deepEqual(clean(c.afDistribution(modern,mb,horizon,remaining,now)),{...clean(old.afDistribution(legacy,lb,horizon,remaining,now)),algorithmVersion:c.AF_VERSION});
 assert.deepEqual(clean(modern),{...clean(legacy),version:c.AF_VERSION});
}
console.log('VPN passed: deduplicated multiscale SES, fading deviations, dated path/ETA coherence, settlement/missing gates, facts-only migration, front correction, coarse ETA and unseasonal Codex numerical equivalence.');
