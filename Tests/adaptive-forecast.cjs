const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');const {readSource,readLibrarySource}=require('./sources.cjs');
const c=vm.createContext({});for(const n of ['forecast-core','token-forecast-core','vpn-traffic-core','adaptive-forecast-core','forecast-display'])vm.runInContext(readSource(n),c);
const DAY=86400,base=23000*DAY,clean=o=>JSON.parse(JSON.stringify(o));
let s=c.afNew('quota','account',base);
const w=(at,remaining,resetAt=base+7*DAY)=>({durationMins:10080,resetAt,remaining});
for(let i=0;i<=4;i++)s=c.afQuotaObserve(s,w(base+i*DAY,100-i*10),'pro',base+i*DAY);
assert.equal(c.afQuotaIntervals(s,base+4*DAY).length,4);
assert(c.afNormalize(clean(s),'quota','account',base+4*DAY));
const fractional=c.afQuotaObserve(c.afNew('quota','a',base),w(base,.1),'pro',base);
assert(c.afNormalize(clean(fractional),'quota','a',base),'fractional quota roundoff survives restart');
assert.equal(c.afNormalize(clean(s),'quota','other',base+4*DAY),null);
let built=c.afQuotaModels(s,base+4*DAY,2,null,null),f=c.afDistribution(s,built,2,60,base+4*DAY);
assert(Math.abs(f.typicalConsumption-20)<1e-9);assert(Math.abs(f.pointRemaining-40)<1e-9);
assert.equal(f.quality,'conditional');assert.equal(f.scoredIntervals,0);
c.afIssue(s,f,1,base+4*DAY);c.afIssue(s,f,1,base+4*DAY+30);
assert.equal(s.forecasts.length,1,'one prediction per day/horizon and epoch');
let roundtrip=c.afNormalize(clean(s),'quota','account',base+4*DAY+60);assert(roundtrip);
let next=c.afQuotaObserve(s,w(base+5*DAY,50),'pro',base+5*DAY);
assert.equal(next.forecasts[0].state,'scored');assert.equal(next.forecasts[0].actual,10);
c.afIssue(next,f,1,base+5*DAY);next=c.afQuotaObserve(next,w(base+5.5*DAY,95),'pro',base+5.5*DAY);
assert.equal(next.forecasts.at(-1).state,'invalid','refill cannot be scored as a successful zero use forecast');
assert(c.afQuotaIntervals(next,base+5.5*DAY).every(r=>r.loss>=0));
let refill=c.afNew('quota','a',base);
for(const [offset,remaining] of [[0,100],[.5,60],[.6,90],[.61,50],[.62,40]])
 refill=c.afQuotaObserve(refill,w(base+offset*DAY,remaining),'pro',base+offset*DAY);
assert(refill.anchors.some(a=>a.boundary&&a.remaining===90),'six-hour coalescing retains the exact refill boundary');
assert.equal(c.afQuotaIntervals(refill,base+DAY).length,1,'no interval can bridge a hidden refill after coalescing');
next=c.afQuotaObserve(next,w(base+6*DAY,90),'plus',base+6*DAY);
assert.equal(next.forecasts.length,0);assert.equal(next.anchors.length,1,'plan changes clear incompatible calibration');
let depleted=c.afNew('quota','a',base);
for(let i=0;i<3;i++)depleted=c.afQuotaObserve(depleted,w(base+i*DAY,i?0:2),'pro',base+i*DAY);
assert.equal(c.afQuotaIntervals(depleted,base+3*DAY).length,0,'depleted plateau is not idle evidence');
let clock=c.afQuotaObserve(next,w(base+5*DAY,90),'plus',base+5*DAY);assert.equal(clock.last,null,'backward clock discards uncertain state');
const anchors=[0,.8,1.6,2.4].map((d,i)=>({at:base+d*DAY,used:i*8,resetAt:base+7*DAY,plan:'pro',planSince:base,segment:1}));
let seeded=c.afNew('quota','a',base+3*DAY);
seeded=c.afSeedQuota(seeded,{accountId:'a',savedAt:base+3*DAY,anchors},'pro',base+3*DAY);
assert.equal(c.afQuotaIntervals(seeded,base+3*DAY).length,3,'long sleep intervals keep observed totals');
assert.equal(c.afSeedQuota(c.afNew('quota','b',base),{accountId:'a',savedAt:base,anchors},'pro',base).anchors.length,0);
// Past cutoffs cannot learn from future observations or resolved forecasts.
const past=c.afQuotaModels(seeded,base+2*DAY,1,null,null);
seeded.anchors.push({at:base+4*DAY,remaining:1,resetAt:base+7*DAY,plan:'pro'});
assert.deepEqual(clean(c.afQuotaModels(seeded,base+2*DAY,1,null,null)),clean(past));
const future=c.afNew('quota','a',base);future.forecasts=Array.from({length:30},(_,i)=>({
 at:base+i*DAY,target:base+(i+1)*DAY,state:'scored',resolvedAt:base+(i+1)*DAY,
 actual:1,candidates:{recent:1,slow:100},point:5}));
const weights=c.afWeights(future,{recent:{center:1},slow:{center:100}},1,base+.5*DAY);
assert.equal(weights.weights.recent,.5);assert.equal(weights.learning,false);
assert(c.afWeights(future,{recent:{center:1},slow:{center:100}},1,base+31*DAY).weights.recent>.5);
// Thirty overlapping 28-day labels provide only one independent result.
future.forecasts.forEach((r,i)=>{r.target=r.at+28*DAY;r.resolvedAt=r.target;});
assert.equal(c.afWeights(future,{recent:{center:1},slow:{center:100}},28,base+90*DAY).learning,false);
let v=c.afNew('vpn','session',base+40*DAY);
const hist=(at,amount=10)=>({state:'ready',fetchedAt:at*1000,days:Array.from({length:35},(_,i)=>[base+(i+5)*DAY,amount])});
v=c.afTrafficMerge(v,hist(base+40*DAY),base+40*DAY);
let vb=c.afTrafficModels(v,base+40*DAY,28),vf=c.afDistribution(v,vb,28,400,base+40*DAY);
assert(Math.abs(vf.pointRemaining-120)<1e-8);
assert(vf.highConsumption>=vf.typicalConsumption);assert.equal(vf.verdict,'safe');
const earlyVPN=c.afDistribution(v,vb,28,100,base+40*DAY);
assert(Math.abs(earlyVPN.crossingDays-10)<1e-8,'constant ten units per day exhausts one hundred units in ten days');
assert(Math.abs(c.trafficDepletionLeadDays({remainingBytes:100,resetDays:28},earlyVPN)-18)<1e-8,
 'actual model crossing is converted into eighteen days BEFORE reset');
const before=v.days.length;v=c.afTrafficMerge(v,hist(base+40*DAY+21600,11),base+40*DAY+21600);
assert.equal(v.days.length,before);assert.equal(v.days[0].value,11);assert.equal(v.days[0].revision,1);
assert(c.afNormalize(clean(v),'vpn','session',base+40*DAY+21600));
let partial=c.afNew('vpn','s',base+10*DAY);
partial=c.afTrafficMerge(partial,{state:'ready',fetchedAt:(base+10*DAY)*1000,days:[[base+9*DAY,999]]},base+10*DAY);
assert.equal(Object.keys(c.afTrafficModels(partial,base+14*DAY,1).models).length,0,'offline time cannot mature a partial report');
let zero=c.afNew('vpn','s',base+40*DAY);zero=c.afTrafficMerge(zero,hist(base+40*DAY,0),base+40*DAY);
const z=c.afDistribution(zero,c.afTrafficModels(zero,base+40*DAY,7),7,400,base+40*DAY);
assert.equal(z.pointRemaining,400,'explicit zero remains valid evidence');
let gap=c.afClone(v),response=hist(base+40*DAY+43200,11);response.days.splice(12,1);
gap=c.afTrafficMerge(gap,response,base+40*DAY+43200);assert.equal(gap.days.length,before-1,'missing returned day must not resurrect old report');
// Risk labels use typical depletion; a high scenario alone is only tight.
const snap={remainingBytes:100,resetDays:7,totalBytes:400};
let sum=c.trafficForecastSummary(snap,{hasValue:true,stale:false},{basis:'adaptive',verdict:'tight',
 typicalConsumption:50,highConsumption:150,crossingDays:8,horizonDays:7,text:'At reset: ~50G left · estimate only'});
assert.equal(c.compactForecastSummary(sum).outcome,'May be tight');assert.equal(c.compactForecastSummary(sum).value,'≈50G');
sum=c.trafficForecastSummary(snap,{hasValue:true,stale:false},{basis:'adaptive',verdict:'risk',
 typicalConsumption:150,highConsumption:200,crossingDays:3,horizonDays:7,text:'At reset: ~0G left · estimate only'});
assert.equal(c.compactForecastSummary(sum).outcome,'May run out');
assert.equal(c.compactForecastSummary(sum).depletionLeadDays,4,'three days of use until depletion means FOUR days before a seven-day reset');
const bad=clean(v);bad.days[0].value='10';assert.equal(c.afNormalize(bad,'vpn','session',base+41*DAY),null);
const extra=clean(v);extra.token='PRIVATE';const normalized=c.afNormalize(extra,'vpn','session',base+41*DAY);
assert(!JSON.stringify(normalized).includes('PRIVATE'),'unknown credential fields never persist');
const alert=c.afNew('vpn','s',base);c.afAlert(alert,{verdict:'risk'},base);
assert.equal(c.afAlert(alert,{verdict:'safe'},base+1).warningVerdict,'risk');
assert.equal(c.afAlert(alert,{verdict:'safe'},base+1).warningVerdict,'risk','duplicate reads do not advance hysteresis');
c.afAlert(alert,{verdict:'safe'},base+2);assert.equal(c.afAlert(alert,{verdict:'safe'},base+3).warningVerdict,undefined);
// Session still respects continuous observations and the short original horizon.
let sessionHistory=[],remaining=100;
for(let m=0;m<=60;m+=5){remaining-=m>30?2:1;sessionHistory=c.updateForecastHistory(sessionHistory,[{durationMins:300,resetAt:base+5*3600,remaining}],base+m*60,false);}
const sw={durationMins:300,resetAt:base+5*3600,remaining};
const sc={now:base+3600,sync:'ready',lastSuccessAt:base+3600,accountKnown:true};
const original=c.forecastQuotaWindow(sw,sessionHistory[0],sc),modern=c.afSessionForecast(sw,sessionHistory[0],sc,original);
assert.equal(modern.algorithmVersion,3);assert(modern.horizon<=3600);assert(modern.rate>original.rate,'recent sustained activity contributes more than older idle/low activity');
const spike={basis:undefined,reason:'Recent usage jump'};assert.equal(c.afSessionForecast(sw,sessionHistory[0],sc,spike),spike);
console.log('Adaptive core passed: account/plan/refill/censor guards, sleep totals, immutable cutoffs, mature revisions, missing/zero, typical vs high risk, and delayed independent learning.');

// Real Foundation private I/O and integration; isolated directory, no VPN or network.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'meter-adaptive-native-'));
try{
 const code=readLibrarySource()+`\n
var root=${JSON.stringify(tmp)};
adaptivePath=function(kind){return root+'/prediction-'+kind+'.json';};
var now=Date.now()/1000;
usageAccountId='test-account';readUsageAccountId=function(){return usageAccountId;};
var state=afNew('quota','test-account',now);state=afQuotaObserve(state,{remaining:80,resetAt:now+7*86400,durationMins:10080},'pro',now);
adaptiveSave(state);var restored=adaptiveRead('quota','test-account',now);
var isolated=adaptiveRead('quota','other-account',now);
usageAccountId='test-account';usagePlanType='pro';usageSyncState='ready';forecastLastSuccessAt=now;
readUsageAccountId=function(){return usageAccountId;};forecastHistoryRecords=[];
quotaWindows=[{durationMins:10080,remaining:60,resetAt:now+3*86400}];
tokenHistorySnapshot={accountId:usageAccountId,savedAt:now,days:[],anchors:[0,1,2,3,4].map(function(i){
 return {at:now-(4-i)*86400,used:i*10,resetAt:now+3*86400,plan:'pro',planSince:now-4*86400,segment:1};})};
recordAdaptiveQuota(quotaWindows);
var live=currentAdaptiveQuotaForecast(quotaWindows[0],{now:now,sync:'ready',lastSuccessAt:now,accountId:usageAccountId,plan:'pro'});
var stale=currentAdaptiveQuotaForecast(quotaWindows[0],{now:now+1000,sync:'ready',lastSuccessAt:now,accountId:usageAccountId,plan:'pro'});
var changed=currentAdaptiveQuotaForecast(quotaWindows[0],{now:now,sync:'ready',lastSuccessAt:now,accountId:'other',plan:'pro'});
var vs={accountKey:'a'.repeat(64),credentialRevision:'b'.repeat(64),reportedAt:now*1000,
 usedBytes:100*1024*1024*1024,totalBytes:400*1024*1024*1024,remainingBytes:300*1024*1024*1024,resetDays:28};
var vh={accountKey:vs.accountKey,credentialRevision:vs.credentialRevision,state:'ready',fetchedAt:now*1000,
 days:Array.from({length:35},function(_,i){return [Math.floor(now/86400)*86400-(35-i)*86400,5*1024*1024*1024];})};
recordAdaptiveVPN(vs,vh);var vpn=currentMaoMaoYunForecast(vs,vh,now*1000);
var countBefore=adaptiveVPNState.forecasts.length;recordAdaptiveVPN(vs,vh);
var countAfter=adaptiveVPNState.forecasts.length;
var vault=adaptiveRead('vpn',adaptiveVPNScope(vs),Date.now()/1000);
var corruptHistory=currentMaoMaoYunForecast(vs,{state:'partial',fetchedAt:now*1000,credentialRevision:vs.credentialRevision},now*1000);
// Draw actual production cards with v3 results in both languages, offscreen.
maomaoyunTrafficSnapshot=normalizeMaoMaoYunTraffic(vs,Math.floor(now*1000));maomaoyunTrafficSourceState='ready';maomaoyunHistorySnapshot=vh;
quotaWindows[0].label='Weekly';delegate=$.NSObject.alloc.init;statusItem={};buildMenu();
var rendered=[];
['zh-CN','en'].forEach(function(code){uiLanguage=code;redrawUsageCardIfNeeded(true);updateMaoMaoYunTrafficMenuItem();
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,metricsPairView.frame.size.height));image.lockFocus;
 metricsPairView.drawRect(metricsPairView.bounds);
 [usageCardView,maomaoyunTrafficView].forEach(function(view){$.NSGraphicsContext.saveGraphicsState;
 var transform=$.NSAffineTransform.transform;transform.translateXByYBy(view.frame.origin.x,view.frame.origin.y);transform.concat;
 view.drawRect(view.bounds);$.NSGraphicsContext.restoreGraphicsState;});image.unlockFocus;
 rendered.push(Number(image.TIFFRepresentation.length)>0);});
JSON.stringify({count:restored.anchors.length,scope:restored.scope,isolated:isolated.anchors.length,
 version:restored.version,valid:!!afNormalize(restored,'quota','test-account',now),
 quotaBasis:live&&live.basis,quotaRemaining:live&&live.pointRemaining,stale:stale,changed:changed,
 vpnBasis:vpn.basis,vpnRemaining:vpn.pointRemaining/(1024*1024*1024),
 issuedOnce:countBefore===countAfter,restoredVPN:vault.days.length,partialBlocked:corruptHistory.basis!=='adaptive',rendered:rendered});`;
 const result=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',code],{encoding:'utf8',timeout:15000}));
 assert.deepEqual(result,{count:1,scope:'test-account',isolated:0,version:3,valid:true,
 quotaBasis:'adaptive',quotaRemaining:30,stale:null,changed:null,vpnBasis:'adaptive',vpnRemaining:160,
 issuedOnce:true,restoredVPN:35,partialBlocked:true,rendered:[true,true]});
 const file=path.join(tmp,'prediction-quota.json');assert.equal(fs.statSync(file).mode&0o777,0o600);
 assert.equal(fs.statSync(tmp).mode&0o777,0o700);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('Adaptive Foundation journal passed: real private atomic persistence, restart restore and account isolation.');

// Explicit read-only live check through the app's own signed account helper.
// No credentials, raw responses, account IDs or query URLs are printed.
if(process.argv.includes('--live')){
 const helper=path.join(os.homedir(),'Applications/Codex Usage Meter.app/Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/Resources/MaoMaoYunAccount.app/Contents/MacOS/MaoMaoYunAccount');
 function query(mode){try{return execFileSync(helper,[mode],{encoding:'utf8',timeout:40000,stdio:['ignore','pipe','pipe']});}
  catch{throw Error('Live website helper did not complete; no raw response retained.');}}
 const now=Date.now(),result=c.parseMaoMaoYunAccountResult(query('--read'),Date.now());
 if(result.state!=='ready')throw Error('Live traffic unavailable: '+result.state);
 const snapshot=result.snapshot,history=c.parseMaoMaoYunHistoryResult(query('--history'),snapshot,Date.now());
 if(history.state!=='ready')throw Error('Live history unavailable: '+history.state);
 const at=Date.now()/1000;let store=c.afNew('vpn','live-session',at);
 store=c.afTrafficObserve(store,snapshot,snapshot.reportedAt/1000);
 store=c.afTrafficMerge(store,history.history,at);
 const forecast=c.afDistribution(store,c.afTrafficModels(store,at,snapshot.resetDays),snapshot.resetDays,snapshot.remainingBytes,at);
 assert(forecast&&forecast.algorithmVersion===3,'v3 must produce a real-data forecast, not fall through silently');
 assert(forecast.pointRemaining>=0&&forecast.pointRemaining<=snapshot.remainingBytes);
 assert(forecast.highConsumption>=forecast.typicalConsumption);
 console.log(JSON.stringify({liveTraffic:{algorithm:3,reportedDays:store.days.length,resetDays:snapshot.resetDays,
  estimateGiB:Math.round(forecast.pointRemaining/1024**3),quality:forecast.quality,models:Object.keys(forecast.weights),
  typicalConsumptionGiB:Math.round(forecast.typicalConsumption/1024**3),highConsumptionGiB:Math.round(forecast.highConsumption/1024**3),
  elapsedMs:Date.now()-now}},null,2));
 const folder=path.join(os.homedir(),'Library/Application Support/CodexUsageMeter/Cache');
 const quota=JSON.parse(fs.readFileSync(path.join(folder,'quota.json'),'utf8'));
 const tokens=JSON.parse(fs.readFileSync(path.join(folder,'token-history.json'),'utf8'));
 const window=quota.usage.windows.find(w=>w.durationMins===10080),observedAt=quota.savedAt/1000;
 assert(window&&quota.accountId===tokens.accountId&&quota.planType,'current account/plan binding required');
 let qs=c.afNew('quota',quota.accountId,observedAt);
 qs=c.afQuotaObserve(qs,window,quota.planType,observedAt);
 qs=c.afSeedQuota(qs,tokens,quota.planType,at);
 const horizon=(window.resetAt-observedAt)/DAY,b=c.afQuotaModels(qs,observedAt,horizon,null,null);
 const qf=c.afDistribution(qs,b,horizon,window.remaining,observedAt);
 assert(qf&&qf.algorithmVersion===3,'official interval observations must support the current quota');
 console.log(JSON.stringify({liveQuota:{algorithm:3,officialIntervals:c.afQuotaIntervals(qs,observedAt).length,
  snapshotAgeSeconds:Math.round(at-observedAt),estimatePercent:Math.round(qf.pointRemaining),quality:qf.quality}},null,2));
}
