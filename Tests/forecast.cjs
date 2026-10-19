const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {readSource:read,readLibrarySource}=require('./sources.cjs');
const core=vm.createContext({});vm.runInContext(read('forecast-core'),core);
const now=2000073600, fresh={now,sync:'ready',lastSuccessAt:now,accountKnown:true};
const quota=(duration,remaining,elapsed)=>({durationMins:duration,remaining,resetAt:now+duration*60-elapsed});
const window=quota(300,70,7200), predict=(w,r=null,c=fresh)=>core.forecastQuotaWindow(w,r,c);
const approx=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
const record=(w,samples,buckets=[],segmentStart=samples[0]?.[0]||now)=>({durationMins:w.durationMins,resetAt:w.resetAt,
  epoch:now-28*86400,adjustedAt:null,samples,buckets,gaps:[],segmentStart});
let f=predict(window);assert.equal(f.status,'unknown');assert.match(f.text,/^Budget.*learning/);assert.equal(f.basis,undefined);
assert(!JSON.stringify(f).includes('cycle'));assert.match(predict(quota(10080,80,3*3600)).text,/Budget/);
assert.equal(predict(quota(300,0,3600)).status,'exhausted');
for(const [w,reason] of [[{...window,resetAt:now},'Awaiting reset'],[{...window,resetAt:null},'Reset time unknown'],
 [{...window,remaining:null},'Quota unavailable']])assert.match(predict(w).text,new RegExp(reason));
for(const sync of ['error','cached','loading'])assert.equal(predict(window,null,{...fresh,sync}).budget,undefined);
for(const lastSuccessAt of [0,now-181,now+1])assert.equal(predict(window,null,{...fresh,lastSuccessAt}).budget,undefined);
const points=(minutes,loss=1)=>Array.from({length:minutes/5+1},(_,i)=>[now-minutes*60+i*300,100-i*loss]);
let recent=record(window,points(30));f=predict(window,recent);assert.equal(f.basis,'recent');assert.equal(f.horizon,1800);
assert.match(f.text,/in 30m/);assert.equal(f.status,'unknown','short scenarios cannot claim all five hours are safe');
recent=record(window,points(60));f=predict(window,recent);assert.equal(f.horizon,3600);approx(f.rate,12);
assert.equal(predict(window,recent,{...fresh,accountKnown:false}).basis,undefined);
assert.equal(predict(window,record(window,points(25))).basis,undefined);
assert.match(predict(window,record(window,points(60,0))).reason,/No recent use/);
const jump=points(30,0);jump[jump.length-1][1]=40;
assert.match(predict({...window,remaining:40},record(window,jump)).text,/recent jump/);
const internalGap=[[now-3600,100],[now-3300,99],[now-3000,98],[now-1800,97],[now-1500,96],[now-1200,95],[now-900,94],[now-600,93],[now-300,92],[now,91]];
assert.equal(predict(window,record(window,internalGap)).basis,undefined);
f=predict({...window,resetAt:now+600},record({...window,resetAt:now+600},points(60)));assert.match(f.text,/at reset/);
let records=[];
for(let m=0;m<=125;m++)records=core.updateForecastHistory(records,[{...window,remaining:100-m/4}],now-125*60+m*60);
for(let m=126;m<140;m++){
 const t=now-125*60+m*60,w={...window,remaining:100-m/4};
 records=core.updateForecastHistory(records,[w],t);
 assert.equal(predict(w,records[0],{...fresh,now:t,lastSuccessAt:t}).horizon,3600,'60m horizon stays stable between 5m buckets');
}
const wweek={durationMins:10080,remaining:50,resetAt:now+2*86400};
const start=Math.floor((now-20*86400)/86400)*86400;
const buckets=Array.from({length:20*24},(_,i)=>[start+i*3600,.1,3600,0]);
const wr=record(wweek,[[now,50]],buckets);
f=predict(wweek,wr);assert.equal(f.status,'safe');assert.equal(f.basis,'history');approx(f.highConsumption,4.8);
assert.match(f.tooltip,/P50.*P90/);assert(!/95%|confidence interval/i.test(f.tooltip));
const busy=buckets.map(b=>[b[0],2,3600,0]);assert.equal(predict(wweek,record(wweek,[[now,50]],busy)).status,'risk');
const missing=buckets.map(b=>[b[0],.1,1800,1800]);assert.match(predict(wweek,record(wweek,[[now,50]],missing)).text,/gaps/);
assert.equal(predict({...wweek,resetAt:now+7*86400},record(wweek,[[now,50]],buckets.slice(-72))).basis,undefined,'3d does not model 7d');
assert.match(predict(wweek,record(wweek,[[now,50]],buckets.map(b=>[b[0],0,3600,0]))).reason,/No use/);
const first=core.updateForecastHistory([],[window],now-3600);
let gapped=core.updateForecastHistory(first,[{...window,remaining:20}],now);
assert.equal(gapped[0].gaps[0][2],50);assert.equal(gapped[0].buckets.reduce((sum,b)=>sum+b[1],0),0,'missing interval loss is retained, not distributed as observed use');
let refill=core.updateForecastHistory(gapped,[{...window,remaining:90}],now+60);
assert.equal(refill[0].samples.length,1);assert.equal(refill[0].buckets.length,0);assert.equal(refill[0].adjustedAt,now+60);
let rounded=core.updateForecastHistory([],[{...window,remaining:70}],now-600);
rounded=core.updateForecastHistory(rounded,[{...window,remaining:70.04}],now-300);
rounded=core.updateForecastHistory(rounded,[{...window,remaining:69}],now);
approx(rounded[0].buckets.reduce((sum,b)=>sum+b[1],0),1);
assert.equal(core.updateForecastHistory(rounded,[window],now-1)[0].samples.length,1,'clock rollback breaks epoch');
const short={durationMins:10,remaining:100,resetAt:now+600};
let crossing=core.updateForecastHistory([],[short],now);
crossing=core.updateForecastHistory(crossing,[{...short,remaining:10}],now+300);
crossing=core.updateForecastHistory(crossing,[{...short,resetAt:now+1200,remaining:100}],now+600);
crossing=core.updateForecastHistory(crossing,[{...short,resetAt:now+1200,remaining:10}],now+900);
assert.equal(crossing[0].buckets[0][1],180);
const snap=r=>({version:2,algorithmVersion:2,accountId:'account-a',savedAt:(now+900)*1000,windows:r});
assert.equal(core.normalizeForecastSnapshot(snap(crossing),'account-a',now+900).length,1,'normal reset within an hour roundtrips >100pp');
for(const bad of [null,{}, {...snap(crossing),accountId:'other'}, {...snap(crossing),algorithmVersion:99},
 {...snap(crossing),savedAt:(now+961)*1000},{...snap(crossing),windows:[crossing[0],crossing[0]]},
 {...snap(crossing),windows:[{...crossing[0],gaps:Array(201).fill([now,now+1,1])}]}])
 assert.equal(core.normalizeForecastSnapshot(bad,'account-a',now+900).length,0);
const legacy={version:1,accountId:'account-a',savedAt:now*1000,windows:[record(window,points(60))]};
assert.equal(core.normalizeForecastSnapshot(legacy,'account-a',now)[0].buckets.length,0);
assert.equal(core.normalizeForecastSnapshot(legacy,null,now).length,0);
assert.equal(core.updateForecastHistory([], [{...window,resetAt:now-1}],now).length,0);
console.log('Forecast checks passed: budgets without cycle fallback, bounded Session scenarios, gaps/jumps/idle, cross-cycle Weekly blocks, rounding, refills, rollback, migration and retention guards.');

// Production account changes, late replies, stale/cache reads and disk failures.
let clock=now*1000,account='account-a',stored=legacy;
const ctx=vm.createContext({Date:{now:()=>clock},usageAccountId:null,forecastHistoryRecords:[],forecastLastSuccessAt:0,forecastBreakSegment:true,
 quotaWindows:[],usageSyncState:'loading',usageText:'!',availableCredits:null,resetCreditExpirations:[],
 forecastHistoryPath:'unused-v2',forecastLegacyHistoryPath:'unused-v1',refreshState:{task:null,queued:false},usagePollTimer:null,USAGE_READ_TIMEOUT_MS:50000,
 ObjC:{unwrap:x=>x},$:{NSFileManager:{defaultManager:{fileExistsAtPath:()=>true}},NSString:{stringWithContentsOfFileEncodingError:()=>JSON.stringify(stored)}},
 readUsageAccountId:()=>account,readUsageCache:()=>null,writePrivateUsageJSON:(p,s)=>{stored=s;},saveUsageCache(){},
 stopQuotaRingAnimation(){},rebuildStatusIconImages(){},redrawUsageCardIfNeeded(){},updateStatusButtonTitle(){},animateStatusIconQuota(){},
 updateStatusIcon(){},updateUsageLabel(){},logError(){},setMenuBarText(){},resetBackgroundTask:s=>{s.task=null;},readBackgroundTaskOutput:p=>p,stopTransientTimer:()=>null});
vm.runInContext(read('core')+'\n'+read('forecast-core')+'\n'+read('forecast')+'\n'+read('usage'),ctx);
ctx.syncUsageAccount();assert.equal(ctx.forecastLastSuccessAt,0);
const payload={result:{rateLimits:{primary:{windowDurationMins:300,usedPercent:30,resetsAt:window.resetAt}}}};
ctx.applyUsagePayload(payload);assert.equal(ctx.currentQuotaForecasts()[0].basis,undefined,'restart breaks Session segment');
assert.equal(stored.version,2);const before=JSON.stringify(stored);
ctx.showUsageError();assert.match(ctx.currentQuotaForecasts()[0].budget,/Budget/);assert.equal(JSON.stringify(stored),before);
ctx.writePrivateUsageJSON=()=>{throw Error('fixture disk error');};ctx.applyUsagePayload(payload);assert.equal(ctx.usageSyncState,'ready');
clock+=181000;assert.match(ctx.currentQuotaForecasts()[0].budget,/Budget/,'slow refresh keeps the recent display');
clock+=420000;assert.equal(ctx.currentQuotaForecasts()[0].budget,undefined,'extended failures still expire');
account='account-b';ctx.syncUsageAccount();assert.equal(ctx.forecastHistoryRecords.length,0);
ctx.refreshState={task:{running:false,terminationStatus:0},accountId:'account-a',queued:false,outputPipe:JSON.stringify(payload)};
ctx.startUsageRefresh=()=>{};ctx.pollUsageRefresh();assert.equal(ctx.forecastHistoryRecords.length,0);
account=null;ctx.syncUsageAccount();clock=now*1000;ctx.applyUsagePayload(payload);
assert.equal(ctx.currentQuotaForecasts()[0].basis,undefined);assert.match(ctx.currentQuotaForecasts()[0].text,/Budget/);
console.log('Forecast integration checks passed: account isolation, fresh-read gate, restart break, late replies and failed persistence.');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-forecast-test-'));
try {
 const cachePath=path.join(root,'cache','forecast.json');
 const nativeSource=readLibrarySource()+'\nusageAccountId="fixture-account";readUsageAccountId=function(){return "fixture-account";};'+
   'forecastHistoryPath='+JSON.stringify(cachePath)+';logError=function(){};';
 const run=code=>JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',nativeSource+'\n'+code],{encoding:'utf8',timeout:8000}));
 const liveNow=Date.now()/1000;
 const w={label:'Weekly',durationMins:10080,remaining:70,resetAt:liveNow+120*3600};
 run('recordQuotaForecast('+JSON.stringify([w])+');JSON.stringify(forecastHistoryRecords.length);');
 assert.equal(fs.statSync(cachePath).mode&0o777,0o600);assert.equal(fs.statSync(path.dirname(cachePath)).mode&0o777,0o700);
 const content=fs.readFileSync(cachePath,'utf8');assert(!/token|prompt|thread|apiKey/i.test(content));
 assert.equal(run('restoreForecastHistory(usageAccountId);JSON.stringify({count:forecastHistoryRecords.length,fresh:forecastLastSuccessAt});').count,1);
 assert.equal(run('restoreForecastHistory(usageAccountId);JSON.stringify(forecastLastSuccessAt);'),0);
 assert.equal(run('restoreForecastHistory("other-account");JSON.stringify(forecastHistoryRecords.length);'),0);
 run('readUsageAccountId=function(){return "other-account";};recordQuotaForecast('+JSON.stringify([{...w,remaining:50}])+');JSON.stringify(forecastHistoryRecords.length);');
 assert.equal(fs.readFileSync(cachePath,'utf8'),content);
 fs.writeFileSync(cachePath,'bad JSON');assert.equal(run('restoreForecastHistory(usageAccountId);JSON.stringify(forecastHistoryRecords.length);'),0);
 // Native fonts and actual draw calls, one/two compact windows, with forecast
 // details retained only in accessibility. Use isolated data, not the real menu.
 const drawing=run('MENU_WIDTH=360;quotaWindows='+JSON.stringify([w,{...w,label:'Session',durationMins:300,resetAt:liveNow+3*3600}])+';'+
   'usageSyncState="ready";forecastLastSuccessAt=Date.now()/1000;'+
   'usageCardView=$.CodexUsageMeterCardView.alloc.initWithFrame($.NSMakeRect(0,0,MENU_WIDTH,quotaCardLayout().height));'+
   'redrawUsageCardIfNeeded(true);var texts=currentQuotaForecasts().map(function(f){return f.text;});'+
   'var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,quotaCardLayout().height));sendVoid(image,"lockFocus");usageCardView.drawRect(usageCardView.bounds);sendVoid(image,"unlockFocus");'+
   'JSON.stringify({height:Number(usageCardView.frame.size.height),label:ObjC.unwrap(usageCardView.accessibilityLabel),widths:texts.map(function(t){return Number($(t).sizeWithAttributes(cardAttributes(9,cardColors().body,false)).width);})});');
 assert.equal(drawing.height,136);assert(!/Budget|每日预算/.test(drawing.label));assert(drawing.widths.every(width=>width<=328));
 const allTexts=['On track · ~90–95% at reset','Budget 8.2%/day · learning',
   'If pace holds: empty within 30m','Forecast: Exhausted · waiting for reset',
   'Forecast: Paused · quota stale','Forecast: Waiting for quota','Forecast: Reset time unknown',
   'Forecast: Awaiting reset','Forecast: Learning usage pace','Forecast: Learning · quota changed','Forecast: No use observed yet'];
 const widths=run('JSON.stringify('+JSON.stringify(allTexts)+'.map(function(t){return Number($(t).sizeWithAttributes(cardAttributes(9,cardColors().body,false)).width);}));');
 assert(widths.every(width=>width<=298),'all forecast lines must fit without wrapping');
 console.log('Forecast checks passed: real Foundation persistence, private permissions, restart, corruption/account guards and native AppKit text/layout drawing.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
