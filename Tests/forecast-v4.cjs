const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {readSource}=require('./sources.cjs');
const c=vm.createContext({});
for(const name of ['meter-panels-core','forecast-core','token-forecast-core','vpn-traffic-core',
 'adaptive-forecast-core','forecast-learning-core','vpn-forecast-models','vpn-forecast-core','forecast-display','i18n','dashboard'])vm.runInContext(readSource(name),c);
const D=86400,G=1024**3,base=24000*D,clean=x=>JSON.parse(JSON.stringify(x));
const windowAt=(at,remaining,resetAt=base+7*D)=>({durationMins:10080,resetAt,remaining});
function issueQuota(h=1){let s=c.afNew('quota','fixture',base);s=c.afQuotaObserve(s,windowAt(base,80),'pro',base);
 const f=c.afDistribution(s,{models:{pooled:{center:10*h}},rows:[{start:base-D,end:base,loss:10}]},h,80,base);
 c.afIssue(s,f,h,base);return s;}

// A shrinking reset horizon and the displayed monthly horizon both have
// their own immutable records, in addition to standard/near-reset probes.
for(const [kind,h,required] of [['quota',6.5,[1,3,6.5]],['vpn',28,[1,3,7,14,28]]]){
 const hs=clean(c.afHorizons(kind,h));for(const value of required)assert(hs.includes(value));
 assert(hs.some(value=>value<h&&c.afBand(value)===c.afBand(h)),'a same-band probe can finish before reset');
}
let s=issueQuota(6.5),first=JSON.stringify(s.forecasts[0]);
s=c.afQuotaObserve(s,windowAt(base+60,80),'pro',base+60);
const f=c.afDistribution(s,{models:{pooled:{center:65}},rows:[{start:base-D,end:base,loss:10}]},6.5-60/D,80,base+60);
c.afIssue(s,f,6.5-60/D,base+60);assert.equal(s.forecasts.length,1,'the same absolute reset target is not issued on every refresh');
assert.equal(JSON.stringify(s.forecasts[0].candidates),JSON.stringify(JSON.parse(first).candidates));
const migrated=issueQuota();migrated.forecasts[0].modelVersion=3;
assert.equal(c.afNeedsIssue(migrated,1,base),true,'a same-day v3 record cannot consume the new version evaluation slot');
c.afIssue(migrated,f,1,base);
assert.deepEqual(clean(migrated.forecasts.map(row=>row.modelVersion)),[3,c.AF_VERSION],'retain the old record and start current-version evaluation immediately');

// Real brackets survive a long sleep. No midpoint, silent interpolation or
// late-tolerance extension may create an exact one-day observation.
s=issueQuota();const frozen=JSON.stringify(s.forecasts[0].candidates);
s=c.afQuotaObserve(s,windowAt(base+.75*D,73),'pro',base+.75*D);
s=c.afQuotaObserve(s,windowAt(base+1.25*D,68),'pro',base+1.25*D);
assert.equal(s.forecasts[0].state,'bounded');assert.equal(s.forecasts[0].actual,null);
assert.deepEqual(clean([s.forecasts[0].actualLower,s.forecasts[0].actualUpper]),[7,12]);
assert.equal(JSON.stringify(s.forecasts[0].candidates),frozen);
assert.equal(c.afWeights(s,{pooled:{center:10}},1,base+2*D).independent,0,'wide bounds do not masquerade as exact learning labels');
assert(c.afNormalize(clean(s),'quota','fixture',base+1.25*D));

s=issueQuota();s=c.afQuotaObserve(s,windowAt(base+.99*D,70.1),'pro',base+.99*D);
s=c.afQuotaObserve(s,windowAt(base+1.01*D,69.9),'pro',base+1.01*D);
assert.equal(s.forecasts[0].state,'scored');assert.equal(s.forecasts[0].actual,null,'even a narrow bracket is not a measured midpoint');
assert(Math.abs(s.forecasts[0].actualLower-9.9)<1e-8&&Math.abs(s.forecasts[0].actualUpper-10.1)<1e-8);
assert(c.afNormalize(clean(s),'quota','fixture',base+1.01*D));
const privateField=clean(s);privateField.forecasts[0].resolution='PRIVATE-VALUE';
assert(!JSON.stringify(c.afNormalize(privateField,'quota','fixture',base+1.01*D)).includes('PRIVATE-VALUE'),'only whitelisted provenance survives cache restoration');
const futureResolution=clean(s);futureResolution.forecasts[0].resolvedAt=base+100*D;
assert.equal(c.afNormalize(futureResolution,'quota','fixture',base+1.01*D),null);

s=issueQuota();s=c.afQuotaObserve(s,windowAt(base+.5*D,90),'pro',base+.5*D);
assert.equal(s.forecasts[0].state,'invalid','manual refill cannot score as a low-use success');
s=issueQuota();s=c.afQuotaObserve(s,windowAt(base+.5*D,0),'pro',base+.5*D);
assert.equal(s.forecasts[0].state,'censored');assert.equal(s.forecasts[0].actual,null);

// The full reset target remains bounded when the counter disappears. A
// distinct near-reset target can be observed and scored without crossing it.
s=issueQuota(7);s=c.afQuotaObserve(s,windowAt(base+6.9*D,20),'pro',base+6.9*D);
s=c.afQuotaObserve(s,windowAt(base+7.01*D,100,base+14*D),'pro',base+7.01*D);
assert.equal(s.forecasts[0].state,'bounded');assert.equal(s.forecasts[0].resolution,'reset-bound');
assert.equal(s.forecasts[0].actualLower,60);assert.equal(s.forecasts[0].actualUpper,80);

// Long-horizon learning uses independent intervals across the retained
// history, not the last 56 overlapping daily submissions (only ~2 months).
const learning=c.afNew('vpn','fixture',base);
learning.forecasts=Array.from({length:140},(_,i)=>({at:base+i*D,sourceAt:base+i*D,issuedAt:base+i*D,
 target:base+(i+28)*D,modelVersion:c.AF_VPN_VERSION,state:'scored',resolvedAt:base+(i+28)*D,
 candidates:{recent:280,slow:560},point:300,actualLower:280,actualUpper:280,actual:280}));
const weights=c.afWeights(learning,{recent:{center:280},slow:{center:560}},28,base+180*D);
assert.equal(weights.independent,5);assert(weights.learning&&weights.weights.recent>.5);
for(const version of [4,5,6]){learning.forecasts.forEach(row=>row.modelVersion=version);
 assert.equal(c.afWeights(learning,{recent:{center:280},slow:{center:560}},28,base+180*D).learning,false,'older outcomes never calibrate the new VPN model');}
learning.forecasts.forEach(row=>row.modelVersion=c.AF_VPN_VERSION);
assert.equal(c.afWeights(learning,{recent:{center:280},slow:{center:560}},28,base+10*D).independent,0,'future target outcomes cannot leak back');

function trafficHistory(at,days=35,rate=10){return {state:'ready',fetchedAt:at*1000,
 days:Array.from({length:days},(_,i)=>[Math.floor(at/D)*D-(days-i)*D,rate*G])};}
function trafficSeries(rates){let state=c.afNew('vpn','fixture',base),used=100*G;
 state=c.afTrafficMerge(state,trafficHistory(base),base);
 rates.forEach((rate,i)=>{if(i)used+=rate*G/4;const at=base+i*D/4;
  state=c.afTrafficObserve(state,{reportedAt:at*1000,totalBytes:1000*G,usedBytes:used,remainingBytes:1000*G-used,resetDays:28},at);});
 return state;}
let vpn=trafficSeries([10,10,10,10,10,40,40,40]),at=base+7*D/4;
let built=c.afTrafficModels(vpn,at,1);assert.equal(built.recentChange.direction,'up');
let projection=c.afDistribution(vpn,built,1,vpn.last.remaining,at);
assert(Math.abs(projection.typicalConsumption/G-30)<1e-6,'18h of new counter evidence blends progressively, before daily reports mature');
assert.equal(projection.baselines.mean7/G,10,'the untouched seven-day baseline remains available for prospective comparison');
c.afIssue(vpn,projection,1,at);
assert.equal(vpn.forecasts[0].baselines.mean7/G,10);
projection.baselines.mean7=99*G;assert.equal(vpn.forecasts[0].baselines.mean7/G,10,'issued baseline is immutable');
assert.equal(projection.precision,'qualitative','a freshly detected regime change is not an exact depletion date');
const changedMonthly=c.afDistribution(vpn,c.afTrafficModels(vpn,at,28),28,20*G,at);
assert(changedMonthly.crossingDays<1,'recent measured high use belongs at the front of a path, not spread evenly over a month');
vpn=trafficSeries([10,10,10,10,10,100,10,10]);
assert.equal(c.afTrafficModels(vpn,at,28).recentChange,null,'one burst does not establish a sustained monthly level');
const before=JSON.stringify(vpn);c.afTrafficModels(vpn,at,28);assert.equal(JSON.stringify(vpn),before,'model construction is read-only');
vpn=c.afTrafficObserve(vpn,{reportedAt:(at+3600)*1000,totalBytes:1000*G,usedBytes:0,remainingBytes:1000*G,resetDays:30},at+3600);
assert.equal(vpn.balances.length,1,'reset starts a new recent-counter segment');
vpn=trafficSeries([10,10,10,10,1,1,1]);
assert.equal(c.afTrafficModels(vpn,base+6*D/4,7).recentChange,null,'one quiet night is not a sustained reduction');
vpn=trafficSeries([10,10,1,1,1,1,1,1]);
assert.equal(c.afTrafficModels(vpn,base+7*D/4,7).recentChange.direction,'down','six contiguous six-hour segments can confirm a sustained reduction');

// Sparse history / disagreement / a regime change can still issue a coarse
// forecast, but may not manufacture a specific depletion day or a probability.
vpn=c.afTrafficMerge(c.afNew('vpn','fixture',base),trafficHistory(base,6),base);
projection=c.afVPNForecast(vpn,base,28,100*G);
assert(projection);assert.equal(projection.evidence,'limited');assert.equal(projection.precision,'qualitative');
assert.equal(c.trafficDepletionLeadDays({remainingBytes:100*G,resetDays:28},projection),null);
vpn=c.afTrafficMerge(c.afNew('vpn','fixture',base),trafficHistory(base),base);
projection=c.afVPNForecast(vpn,base,28,100*G);
assert.equal(projection.evidence,'supported');assert.equal(projection.precision,'day');
assert.equal(c.trafficDepletionLeadDays({remainingBytes:100*G,resetDays:28},projection),18);
assert(!Object.keys(projection).some(k=>/confidence|probability/i.test(k)),'conditional path counts are not labelled calibrated confidence');

// The journal remains bounded even with a maximally dense retained history.
const dense=issueQuota(),entry=clean(dense.forecasts[0]);
dense.forecasts=Array.from({length:1300},()=>clean(entry));c.afPrune(dense,base);
assert.equal(dense.forecasts.length,c.AF_MAX_FORECASTS);
assert(Buffer.byteLength(JSON.stringify(dense))<c.AF_MAX_BYTES);

// Production UI semantics: the same 70% / 4-days pace can conflict with a
// credible usage forecast. The prediction wins; weak evidence stays explicit.
const window={remaining:70,durationMins:10080,resetAt:base+4*D};
assert.equal(c.quotaPaceModel(window,base,false).label,'On pace');
const risk={basis:'adaptive',evidence:'supported',verdict:'risk'},safe={...risk,verdict:'safe'};
assert.equal(c.quotaPredictionBadge(window,risk,base,false).label,'May run out');
assert.equal(c.quotaPredictionBadge(window,safe,base,false).tone,'normal');
assert.equal(c.quotaPredictionBadge(window,{...safe,evidence:'limited'},base,false).label,'Cycle on pace');
assert.equal(c.quotaPredictionBadge(window,{...safe,evidence:'limited'},base,false).tone,'muted');
assert.equal(c.quotaPredictionBadge({...window,remaining:5},safe,base,false).label,'Quota low');
assert.equal(c.quotaPredictionBadge(window,risk,base,true).label,'Last known');
assert.equal(c.quotaPredictionBadge({...window,durationMins:300,resetAt:base+3*3600},
 {basis:'recent',projectedRemaining:-1,horizon:1800},base,false).label,'Near-term depletion');
const timedQuota={...risk,at:base,resetAt:window.resetAt,horizonDays:4,typicalConsumption:90,
 precision:'qualitative',crossingDays:2,crossingRange:[1,5],text:'~0% at reset'};
// Weekly quota reminders stay qualitative even when the model supplies
// a valid point, sub-day or range crossing. VPN retains its timed warnings.
for(const [forecast,label] of [[timedQuota,'May run out'],
 [{...timedQuota,evidence:'limited'},'Cycle on pace'],
 [{...timedQuota,evidence:'adjusted',precision:'day'},'May run out'],
 [{...timedQuota,crossingDays:3.5},'May run out'],
 [{...timedQuota,horizonDays:6.5,resetAt:base+6.5*D,crossingDays:3,crossingRange:[.5,4]},'May run out']]){
 const w={...window,resetAt:forecast.resetAt},before=JSON.stringify(forecast);
 const badge=c.quotaPredictionBadge(w,forecast,base,false);
 assert.equal(badge.label,label);assert.equal(badge.tone,forecast.evidence==='limited'?'muted':'warning');
 const summary=c.quotaForecastSummary(w,forecast,base);
 assert.equal(summary.headline,'May run out before reset','accessible summary must not restore quota day counts');
 assert.equal(JSON.stringify(forecast),before,'qualitative display cannot change the prediction');
 for(const locale of ['zh-CN','en']){
  c.uiLanguage=locale;
  assert(!/\d|提前约|d early/.test(c.uiText(badge.label)),'quota badges do not expose depletion days in either language');
  assert(!/\d|提前约|d early/.test(c.uiText(summary.headline)),'quota summaries do not expose depletion days in either language');
 }
}
assert.equal(c.quotaPredictionBadge({...window,remaining:5},timedQuota,base,false).label,'Quota low');
assert.equal(c.quotaPredictionBadge({...window,remaining:0},timedQuota,base,false).label,'Exhausted');
assert.equal(c.quotaPredictionBadge(window,timedQuota,base,true).label,'Last known');
const data={hasValue:true,stale:false,resetDays:28,fraction:.5};
assert.equal(c.trafficPredictionBadge(data,{...risk,precision:'qualitative'}).label,'Possible depletion');
assert.equal(c.trafficPredictionBadge(data,{...safe,evidence:'limited'}).label,'Forecast observing');
assert.equal(c.trafficPredictionBadge(data,{...safe,recentChange:'up'}).label,'Recent use rising');
for(const label of ['Cycle on pace','Cycle use ahead','Possible depletion','Near-term depletion','Recent use rising','Forecast observing']){
 c.uiLanguage='zh-CN';assert(!/[a-z]/i.test(c.uiText(label)),label);assert(c.meterStatusSymbol(label));
}
assert(readSource('menu').includes('summary:summary,forecast:forecasts[i]'),'actual native quota draw receives the forecast');
assert(readSource('menu').includes('summary:summary,forecast:forecast'),'actual native traffic draw receives the forecast');
console.log('Forecast v4 passed: actual/near-reset horizons, sleep bounds without invented labels, long-horizon independent learning, version isolation, sustained counter changes, ETA precision and real badge routing.');
