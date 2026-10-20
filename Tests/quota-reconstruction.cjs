// Real snapshots constrain totals; reconstructed dates never become truth.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');
const originalTZ=process.env.TZ;process.env.TZ='Asia/Shanghai';
const c=vm.createContext({});
vm.runInContext(['meter-panels-core','forecast-core','token-forecast-core','adaptive-forecast-core',
 'quota-reconstruction-core','forecast-learning-core'].map(readSource).join('\n'),c);
const D=86400,now=Date.parse('2026-10-20T12:00:00+08:00')/1000,begin=Date.parse('2026-09-21T00:00:00+08:00')/1000;
const clean=x=>JSON.parse(JSON.stringify(x));
const profile={version:3,source:'profile',accountId:'fixture-account',savedAt:now,days:Array.from({length:30},(_,i)=>({date:c.qhDate(begin+i*D),tokens:1e8}))};
const state=c.afNew('quota','fixture-account',now);state.plan='pro';state.planSince=begin;
state.anchors=Array.from({length:30},(_,i)=>({at:begin+i*D,remaining:100-i%7*5,
 resetAt:begin+(Math.floor(i/7)+1)*7*D,plan:'pro',boundary:i>0&&i%7===0}));
state.last={at:now,remaining:95,used:5,total:100,resetAt:now+6*D,resetDays:null};
const untouched=JSON.stringify({profile,state});
let reconstructed=c.reconstructQuotaDays(profile,state,null,now);
assert.equal(reconstructed.days.length,28);assert.equal(reconstructed.days[0].date,'2026-09-22');assert.equal(reconstructed.days.at(-1).date,'2026-10-19');
assert(reconstructed.days.every(d=>d.estimated&&Math.abs(d.loss-5)<1e-7));
assert.equal(JSON.stringify({profile,state}),untouched,'raw profile and official observations are immutable');
const sum=(xs,f)=>xs.reduce((s,x)=>s+f(x),0);
assert(Math.abs(sum(reconstructed.days,d=>sum(d.parts,p=>p.constrainedLoss))-sum(reconstructed.intervals,r=>r.loss))<1e-8,'observed interval totals are conserved exactly');
let f=c.forecastReconstructedQuota(reconstructed,state,now,3);assert(f);assert(Math.abs(f.typicalConsumption-15)<1e-8);assert.equal(f.estimatedDays,28);
const scaled=clean(profile);scaled.days.forEach(d=>d.tokens*=100);
assert.deepEqual(clean(c.reconstructQuotaDays(scaled,state,null,now).days.map(d=>d.loss)),clean(reconstructed.days.map(d=>d.loss)),'no fixed Token conversion');
assert.equal(c.reconstructQuotaDays({...profile,accountId:'other'},state,null,now),null);
assert.equal(c.reconstructQuotaDays({...profile,savedAt:now-21601},state,null,now),null);
assert.equal(c.reconstructQuotaDays({...profile,savedAt:now+61},state,null,now),null);
assert.equal(c.forecastReconstructedQuota(reconstructed,{...state,scope:'other'},now,3),null);
assert.equal(c.forecastReconstructedQuota(reconstructed,{...state,plan:'plus'},now,3),null);
assert.equal(c.forecastReconstructedQuota(reconstructed,{...state,planSince:begin+D},now,3),null);
const sparse=clean(state);sparse.anchors=sparse.anchors.slice(-2);
assert.equal(c.forecastReconstructedQuota(c.reconstructQuotaDays(profile,sparse,null,now),sparse,now,1),null,'one calibration is analysis only');
const empty=clean(profile);empty.days.forEach(d=>d.tokens=0);
assert(c.reconstructQuotaDays(empty,state,null,now).days.some(d=>d.source==='source-mismatch'&&d.loss===null),'positive quota loss with no Tokens is unknown, not zero');
const injected=clean(state);injected.days=[{at:begin,value:999999}];
assert.deepEqual(clean(c.reconstructQuotaDays(profile,injected,null,now)),clean(reconstructed),'imputed/foreign daily values cannot enter calibration');
// Future observations and a future profile response are unavailable at cutoff.
const future=clean(state);future.anchors.push({at:now+D,remaining:1,resetAt:now+6*D,plan:'pro',boundary:false});
assert.deepEqual(clean(c.reconstructQuotaDays(profile,future,null,now)),clean(reconstructed));
// Older-plan estimates may be analysed, but never train the current capacity.
const changed=clean(state),switchAt=begin+16*D+12*3600;
changed.planSince=switchAt;changed.anchors.forEach(a=>{if(a.at<switchAt)a.plan='plus';else a.boundary=a.boundary||a.at===begin+17*D;});
let mixed=c.reconstructQuotaDays(profile,changed,null,now),mf=c.forecastReconstructedQuota(mixed,changed,now,1);
assert(mixed.days.some(d=>d.source==='mixed-plan'&&d.loss===null));assert(mf&&mf.estimatedDays<28);
const changedOld=clean(profile);changedOld.days.forEach(d=>{if(c.qhBounds(d.date)[1]<switchAt)d.tokens*=1000;});
assert(Math.abs(c.forecastReconstructedQuota(c.reconstructQuotaDays(changedOld,changed,null,now),changed,now,1).typicalConsumption-mf.typicalConsumption)<1e-8);
const capacity={version:1,source:'user',accountId:state.scope,fromPlan:'plus',toPlan:'pro',
 fromBefore:switchAt,toSince:switchAt,consumptionScale:.2};
const converted=c.reconstructQuotaDays(profile,changed,null,now,capacity);
const convertedForecast=c.forecastReconstructedQuota(converted,changed,now,1);
assert.equal(convertedForecast.estimatedDays,28,'explicit capacity normalization admits older dates');
assert(convertedForecast.capacityConvertedDays>0);
for(const day of converted.days){
 if(day.plan==='plus')assert(Math.abs(day.equivalentLoss-day.loss/5)<1e-8);
 if(day.plan==='pro')assert.equal(day.equivalentLoss,day.loss);
 if(day.source==='mixed-plan')assert(Math.abs(day.equivalentLoss-sum(day.parts,p=>p.loss*(p.plan==='plus'?.2:1)))<1e-8);
}
assert.equal(c.reconstructQuotaDays(profile,changed,null,now,{...capacity,accountId:'other'}).days[0].equivalentLoss,null);
assert.equal(c.reconstructQuotaDays(profile,changed,null,now,{...capacity,toSince:switchAt+86400,fromBefore:switchAt+86400}).days[0].equivalentLoss,null);
assert.equal(c.normalizeQuotaCapacity({...capacity,source:'guessed'},state.scope,now),null);
assert.equal(c.normalizeQuotaCapacity({...capacity,consumptionScale:0},state.scope,now),null);
// Hidden refills remain boundaries even with matching reset timestamps.
const refill=clean(state);refill.anchors=refill.anchors.slice(0,4);refill.anchors[2].boundary=true;
assert(!c.reconstructQuotaDays(profile,refill,null,now).intervals.some(r=>r.start===refill.anchors[1].at&&r.end===refill.anchors[2].at));
// A very large current-day Token count never leaks into completed-day history.
const partial=clean(profile);partial.days.at(-1).tokens=1e12;
assert.deepEqual(clean(c.reconstructQuotaDays(partial,state,null,now)),clean(reconstructed));
// The new model participates, capped at 20%, without increasing real exposure.
const fake={basis:'quotaReconstruction',typicalConsumption:60,lowConsumption:30,highConsumption:90,estimatedDays:28};
const plain=c.afQuotaModels(state,now,3,null,null),built=c.afQuotaModels(state,now,3,null,null,fake);
const base=c.afDistribution(state,plain,3,80,now),blended=c.afDistribution(state,built,3,80,now);
assert(blended.highConsumption>base.highConsumption);assert(blended.weights.reconstructed>0&&blended.weights.reconstructed<=.2);
assert.equal(blended.exposure,base.exposure);assert.equal(blended.coverage,base.coverage);assert.equal(blended.reconstructedDays,28);
const weights=c.afWeights(state,{pooled:{center:15},reconstructed:{center:60}},3,now);
assert(Math.abs(weights.weights.pooled-.8)<1e-8);assert.equal(weights.weights.reconstructed,.2);
const learned=clean(state);learned.forecasts=Array.from({length:8},(_,i)=>({modelVersion:c.AF_VERSION,state:'scored',
 sourceAt:now-(30-i*3)*D,issuedAt:now-(30-i*3)*D,resolvedAt:now-(27-i*3)*D,target:now-(27-i*3)*D,
 candidates:{pooled:1000,reconstructed:15},actualLower:15,actualUpper:15,point:15}));
assert(c.afWeights(learned,{pooled:{center:15},reconstructed:{center:15}},3,now).weights.reconstructed<=.2,'even favourable scores cannot exceed the evidence cap');
const unsupported=c.afDistribution({...state,anchors:[]},{models:{reconstructed:built.models.reconstructed},rows:[]},3,80,now);
assert.equal(unsupported.evidence,'limited','estimated dates alone cannot earn a green evidence guarantee');
// Learner records the candidate, but settles only against later real counters.
const scored=clean(state);scored.last={...scored.last,resetAt:now+6*D};
c.afIssue(scored,blended,1,now);assert.equal(scored.forecasts.length,1);
assert('reconstructed' in scored.forecasts[0].candidates);
c.afResolve(scored,{...scored.last,at:now+D,used:10,remaining:90},now+D);
assert.equal(scored.forecasts[0].actual,5);
assert(c.afReadForecast(scored.forecasts[0],false,'quota',scored.last,now+D));
// Real JXA integration saves only a separate private derived cache. Native
// tests use readLibrarySource's scratch root, never the installed app's files.
const native=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+`
usageAccountId='fixture-account';usagePlanType='pro';usageSyncState='ready';
readUsageAccountId=function(){return usageAccountId;};forecastHistoryRecords=[];
var clock=Date.now()/1000,offset=clock-${now};
adaptiveQuotaState=${JSON.stringify(state)};
adaptiveQuotaState.planSince+=offset;adaptiveQuotaState.anchors.forEach(function(a){a.at+=offset;a.resetAt+=offset;});
adaptiveQuotaState.last.at=clock;adaptiveQuotaState.last.resetAt=clock+6*86400;
var localToday=qhDate(clock),dateStart=qhBounds(localToday)[0]-29*86400;
tokenMeterSnapshot={version:3,source:'profile',accountId:usageAccountId,savedAt:clock,
 days:Array.from({length:30},function(_,i){return {date:qhDate(dateStart+i*86400),tokens:1e8};})};
writePrivateJSON(adaptiveQuotaCapacityPath(),{version:1,source:'user',accountId:usageAccountId,
 fromPlan:'plus',toPlan:'pro',fromBefore:adaptiveQuotaState.planSince,toSince:adaptiveQuotaState.planSince,consumptionScale:.2});
var capacityBound=readQuotaCapacityRule(usageAccountId,clock).consumptionScale===.2&&readQuotaCapacityRule('other',clock)===null;
forecastLastSuccessAt=clock;quotaWindows=[{durationMins:10080,remaining:95,resetAt:clock+6*86400}];
var before=JSON.stringify(tokenMeterSnapshot);recordAdaptiveQuota(quotaWindows);
var text=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(adaptiveQuotaDailyPath(),$.NSUTF8StringEncoding,null));
var derived=JSON.parse(text),out=currentAdaptiveQuotaForecast(quotaWindows[0],{now:clock,sync:'ready',lastSuccessAt:clock,accountId:usageAccountId,plan:usagePlanType});
var forecastsBefore=adaptiveQuotaState.forecasts.length,derivedBefore=quotaReconstructionSnapshot;
forecastLastSuccessAt=clock-181;recordAdaptiveQuota(quotaWindows);
JSON.stringify({path:adaptiveQuotaDailyPath(),version:derived.version,days:derived.days.length,
 rawUnchanged:before===JSON.stringify(tokenMeterSnapshot),candidate:!!(out&&out.weights.reconstructed),
 staleIgnored:forecastsBefore===adaptiveQuotaState.forecasts.length&&derivedBefore===quotaReconstructionSnapshot,
 capacityBound:capacityBound,
 derivedOnly:derived.days.every(function(d){return d.estimated;})});`],{encoding:'utf8',timeout:15000}));
assert.equal(native.days,28);assert(native.rawUnchanged&&native.derivedOnly&&native.candidate&&native.staleIgnored&&native.capacityBound);
assert.equal(fs.statSync(native.path).mode&0o777,0o600);assert(native.path.includes('meter-fixture-cache-'));
if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ;
console.log('Quota reconstruction passed: 28 separate estimated dates, plan/reset/account gates, conservation, empirical scaling, no future/partial-day leakage, <=20% blend, real-only scoring and private JXA integration.');
