const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {execFileSync, spawnSync} = require('child_process');
const {readSource:read, readLibrarySource} = require('./sources.cjs');

const core = vm.createContext({});
vm.runInContext(read('vpn-traffic-core'), core);
const now = Date.now(), GiB = 1024 ** 3;
const payload = (used = 3 * GiB, total = 400 * GiB, at = now, identity = 'a') => ({
  usedBytes:used,totalBytes:total,remainingBytes:Math.max(0,total-used),reportedAt:at,
  accountKey:identity.repeat(64),credentialRevision:identity.repeat(64),
  token:'TEST_SECRET_TOKEN',email:'TEST_SECRET_EMAIL',subscribe_url:'TEST_SECRET_URL'
});
const wire = traffic => JSON.stringify({version:2,state:'ready',traffic});
const failure = state => JSON.stringify({version:2,state,diagnostics:{message:'TEST_SECRET_SERVER_BODY'}});
const clean = value => JSON.parse(JSON.stringify(value));
const first = core.normalizeMaoMaoYunTraffic(payload(), now);
assert.equal(core.parseMaoMaoYunAccountResult(wire({...payload(),resetDays:31}),now).snapshot.resetDays,null,'Legacy v2 has no reset schedule contract');
for(const days of [0,1,28,31]) {
  const s=core.normalizeMaoMaoYunTraffic({...payload(),resetDays:days},now), p=core.maoMaoYunTrafficPresentation(s,'ready',now);
  assert.equal(s.resetDays,days);assert.equal(p.resetText,days===0?'Reset reported today':'Resets in '+days+' days');
  assert.match(p.forecastText,days===0?/Reported pace: learning/:/Budget.*\/day/);
  assert.equal(core.maoMaoYunTrafficPresentation(s,'ready',now+23*3600000).resetText,p.resetText,'No local calendar/day decrement');
}
for(const bad of [null,undefined,-1,1.5,'31',true,false]) {
 const s=core.normalizeMaoMaoYunTraffic({...payload(),resetDays:bad},now);assert.equal(s.resetDays,null);assert.equal(s.remainingBytes,397*GiB);
}
const historyWire=(state='ready',dayBytes=100,at=now)=>JSON.stringify({version:3,state:'history',history:{
  state,accountKey:'a'.repeat(64),credentialRevision:'a'.repeat(64),identityKind:'session',completeness:'unverified',
  billingBasis:'website-u+d',bucketBasis:'utc-24h',retentionDays:180,fetchedAt:at,days:state==='ready'?[[Math.floor(now/86400000)*86400-86400,dayBytes]]:[],rowCount:1,
  calendarBasis:'local-midnight',calendarState:'ready',calendarDays:[]}});
const history=core.parseMaoMaoYunHistoryResult(historyWire(),first,now).history;
assert.equal(history.days[0][1],100);assert.equal(history.completeness,'unverified');
assert.equal(history.retentionDays,180);
const expandedHistory={...history,days:Array.from({length:180},(_,i)=>[Math.floor(now/86400000)*86400-(179-i)*86400,i])};
assert.equal(core.normalizeMaoMaoYunHistory(expandedHistory,first,now).days.length,180);
assert.throws(()=>core.normalizeMaoMaoYunHistory({...expandedHistory,days:[[expandedHistory.days[0][0]-86400,1],...expandedHistory.days]},first,now));
assert.equal(core.normalizeMaoMaoYunHistory({...history,retentionDays:undefined},first,now).retentionDays,35,'legacy caches retain a narrow-source marker');
for(const retentionDays of [0,34,181,1.5,'180'])assert.throws(()=>core.normalizeMaoMaoYunHistory({...history,retentionDays},first,now));
assert.equal(core.parseMaoMaoYunHistoryResult(historyWire('ready',150),first,now).history.days[0][1],150,'Revised days replace, never sum with old response');
for(const bad of [historyWire().replace('website-u+d','raw-network'),historyWire().replace('a'.repeat(64),'b'.repeat(64)),
 historyWire().replace('unverified','complete'),historyWire().replace(',100]',',-1]'),'x'.repeat(8193)])
 assert.throws(()=>core.parseMaoMaoYunHistoryResult(bad,first,now));
for(const state of ['partial','unsupported'])assert.equal(core.parseMaoMaoYunHistoryResult(historyWire(state),first,now).state,state);
const today=Math.floor(now/86400000)*86400;
const reported={...history,days:Array.from({length:14},(_,i)=>[today-(14-i)*86400,100]),fetchedAt:now};
const noReset=core.normalizeMaoMaoYunTraffic({...payload(200,1000),resetDays:0},now);
let scenario=core.maoMaoYunTrafficForecast(noReset,reported,now);
assert.equal(scenario.basis,'reportedHistory');assert.equal(scenario.status,'unknown');assert.match(scenario.text,/~8 days left/);
assert(!/safe|On track|At risk/.test(scenario.text));assert.match(scenario.reason,/No next reset date/);
const midday=today*1000+12*3600000;
const revisions={...reported,fetchedAt:midday,days:reported.days.map(d=>[d[0],d[0]===today-2*86400?10000:d[1]])};
assert.equal(core.maoMaoYunTrafficForecast(noReset,revisions,midday).rateBytesPerDay,100,'Every training bucket must end at least 48h before non-midnight fetch time');
scenario=core.maoMaoYunTrafficForecast({...noReset,resetDays:2},reported,now);assert.equal(scenario.highConsumption,200);
assert.equal(core.maoMaoYunTrafficForecast({...noReset,resetDays:28},reported,now).basis,undefined);
assert.equal(core.maoMaoYunTrafficForecast(noReset,{...reported,days:reported.days.filter(d=>d[0]!==today-5*86400)},now).basis,undefined);
assert.equal(core.maoMaoYunTrafficForecast(noReset,{...reported,days:reported.days.map(d=>[d[0],0])},now).basis,undefined);
const partialAt=today*1000+23*3600000;
const partialHistory={...reported,fetchedAt:partialAt,days:Array.from({length:4},(_,i)=>[today-(3-i)*86400,100])};
assert.equal(core.maoMaoYunTrafficForecast({...noReset,resetDays:2},partialHistory,partialAt).basis,undefined);
assert.equal(core.maoMaoYunTrafficForecast({...noReset,resetDays:2},partialHistory,partialAt+2*3600000).basis,undefined,'Clock crossing midnight cannot mature a partially reported day');
assert.deepEqual(clean(first), {
  accountKey:'a'.repeat(64),credentialRevision:'a'.repeat(64),
  identityKind:'session',usedBytes:3*GiB,totalBytes:400*GiB,remainingBytes:397*GiB,resetDays:null,resetState:'unavailable',
  usedLabel:'3G',totalLabel:'400G',remainingLabel:'397G',remainingPercent:99.25,reportedAt:now,
  todayState:'pending',todayUsedBytes:null,todayStartAt:null,todayReportedAt:null,todayRetryAt:0
});
for (const [used,total,label] of [
  [GiB/2,GiB,'0.5G'],[0,400*GiB,'400G'],[400*GiB,400*GiB,'0G'],
  [401*GiB,400*GiB,'0G'],[768,1024,'0.25K'],[0,1,'1B'],[0,1024**4,'1T']
]) assert.equal(core.normalizeMaoMaoYunTraffic(payload(used,total),now).remainingLabel,label);
assert.equal(core.normalizeMaoMaoYunTraffic(payload(11654105907,400*GiB),now).remainingLabel,'389.15G',
  'Remaining is computed from raw bytes, not subtracting rounded client labels');
for (const field of ['usedBytes','totalBytes','remainingBytes']) {
  for (const bad of [null,undefined,true,false,'42',NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(()=>core.normalizeMaoMaoYunTraffic({...payload(),[field]:bad},now),field);
  }
}
for (const bad of [null,[],{},payload(0,0),{...payload(),remainingBytes:7},
  {...payload(),accountKey:'bad'}, {...payload(),credentialRevision:'bad'}]) {
  assert.throws(()=>core.normalizeMaoMaoYunTraffic(bad,now));
}
for (const bad of [null,'now',NaN,Infinity,0,-1,now+60001]) {
  assert.throws(()=>core.normalizeMaoMaoYunTraffic({...payload(),reportedAt:bad},now));
}
for (const bad of [null,'now',NaN,Infinity,0]) assert.throws(()=>core.normalizeMaoMaoYunTraffic(payload(),bad));
assert.equal(core.maoMaoYunTrafficPresentation(first,'ready',now).stale,false);
assert.equal(core.maoMaoYunTrafficPresentation(first,'ready',now+600001).stale,true);
assert.equal(core.maoMaoYunTrafficPresentation(first,'ready',now-60001).stale,true);
assert.match(core.maoMaoYunTrafficPresentation(first,'error',now).value,/stale/);
assert.match(core.maoMaoYunTrafficPresentation(first,'ready',now).detail,/^Updated /);
assert.equal(core.maoMaoYunTrafficPresentation(null,'authRequired',now).value,'Sign in');
assert.equal(core.maoMaoYunTrafficPresentation(null,'signingIn',now).value,'Signing in');
assert.equal(core.maoMaoYunTrafficPresentation(null,'loading',now).value,'Checking');
assert.equal(core.maoMaoYunTrafficPresentation(null,'error',now).value,'Unavailable');
assert(!JSON.stringify(first).includes('TEST_SECRET'),'normalization must discard all private fields');
assert.deepEqual(clean(core.parseMaoMaoYunAccountResult(failure('invalid')+'\n'+wire(payload())+'\n',now)),
  {state:'ready',snapshot:clean(first)},'last completed login attempt wins');
for (const state of ['authRequired','keychainLocked','credentialChanged','rateLimited','error','invalid','timeout','cancelled']) {
  assert.deepEqual(clean(core.parseMaoMaoYunAccountResult(failure(state),now)),{state});
}
for (const raw of [null,'','broken TEST_SECRET',wire(payload())+'\nbroken',JSON.stringify({version:1,state:'ready'}),
  JSON.stringify({version:2,state:'untrusted-state'}),'x'.repeat(65537),JSON.stringify({version:2,state:'ready'})]) {
  assert.throws(()=>core.parseMaoMaoYunAccountResult(raw,now));
}

// Non-blocking reads/login: only an explicit press can open the native window.
// No actual Keychain, website, model, client, VPN or user window is touched.
let clock=now, launches=[], historyLaunches=[], cancels=0, invalidations=0, launchFails=false, timerFails=false;
const ctx = vm.createContext({
  Date:class extends Date {static now(){return clock;}},
  ObjC:{unwrap:value=>value}, $:{NSHomeDirectory:()=>'/test-user'},
  createBackgroundTaskState:()=>({task:null,outputPipe:null,startedAt:0}),
  resourcePath:name=>'/test-resources/'+name,
  launchBackgroundTask(exe,args,state,captureError){
    assert.equal(exe,'/test-resources/MaoMaoYunAccount.app/Contents/MacOS/MaoMaoYunAccount');
    assert(args.length===1&&['--read','--login','--login-en','--history'].includes(args[0]));
    assert.equal(captureError,false,'stderr must not contaminate or leak through JSON parsing');
    if(launchFails)throw new Error('TEST_SECRET_LAUNCH_ERROR');
    (args[0]==='--history'?historyLaunches:launches).push(args[0]);state.task={running:true,terminationStatus:0};state.outputPipe='';state.startedAt=clock;
  },
  cancelBackgroundTask(state){if(state.task)cancels++;state.task=null;state.outputPipe=null;state.startedAt=0;},
  resetBackgroundTask(state){state.task=null;state.outputPipe=null;state.startedAt=0;},
  readBackgroundTaskOutput:pipe=>pipe,
  startTransientTimer(timer,interval,selector){
    assert([[.25,'maomaoyunTrafficTaskTimer:'],[.5,'maomaoyunTrafficLoginTimer:']].some(pair=>pair[0]===interval&&pair[1]===selector));
    if(timerFails)throw new Error('Timer unavailable');return timer||{};
  },
  stopTransientTimer(timer){if(timer)invalidations++;return null;}
});
vm.runInContext(read('vpn-traffic-core')+'\n'+read('forecast-display')+'\n'+read('state')+'\n'+read('vpn-traffic'),ctx);
function complete(raw=wire(payload(3*GiB,400*GiB,clock)),code=0,login=false) {
  const state=login?ctx.maomaoyunTrafficLoginState:ctx.maomaoyunTrafficReadState;
  assert(state.task,'Expected live helper task');state.task.running=false;state.task.terminationStatus=code;state.outputPipe=raw;
  if(login)ctx.pollMaoMaoYunAccountLogin();else ctx.pollMaoMaoYunTraffic();
  if(ctx.maomaoyunHistoryReadState.task) {
    ctx.maomaoyunHistoryReadState.task.running=false;
    ctx.maomaoyunHistoryReadState.outputPipe=JSON.stringify({version:3,state:'error'});
    ctx.pollMaoMaoYunHistory();
  }
}
function next(force=true) {clock+=force?60000:300000;ctx.requestMaoMaoYunTraffic(force);}
ctx.requestMaoMaoYunTraffic(true);ctx.requestMaoMaoYunTraffic(true);
assert.deepEqual(launches,['--read'],'overlapping requests coalesce');
complete();assert.equal(ctx.maomaoyunTrafficSourceState,'ready');
assert.equal(ctx.maomaoyunTrafficPollTimer,null);
ctx.requestMaoMaoYunTraffic(false);ctx.requestMaoMaoYunTraffic(true);assert.equal(launches.length,1,'open menus cannot spam the website');
next(false);clock+=35001;ctx.pollMaoMaoYunTraffic();
assert.equal(ctx.maomaoyunTrafficReadState.task,null);assert.equal(ctx.maomaoyunTrafficSourceState,'timeout');
assert(ctx.maomaoyunTrafficSnapshot,'transient failures preserve the validated snapshot with stale marking');
next();complete('',1);assert(ctx.maomaoyunTrafficSnapshot);
next();complete(failure('rateLimited'));
const beforeRate=launches.length;
clock+=60000;ctx.requestMaoMaoYunTraffic(true);assert.equal(launches.length,beforeRate,'force does not bypass 429 backoff');
clock=ctx.maomaoyunTrafficNextReadAt;ctx.requestMaoMaoYunTraffic(false);complete();
for (const state of ['credentialChanged','authRequired','keychainLocked','invalid']) {
  next();complete(failure(state));assert.equal(ctx.maomaoyunTrafficSnapshot,null,state+' must drop old-account values');
  assert.equal(ctx.maomaoyunTrafficLoginState.task,null,'failures must not launch login automatically');
  next();complete(wire(payload(10*GiB,200*GiB,clock,'b')));
  assert.equal(ctx.maomaoyunTrafficSnapshot.accountKey,'b'.repeat(64));assert.equal(ctx.maomaoyunTrafficSnapshot.totalLabel,'200G');
}
next();complete('broken TEST_SECRET_JSON');assert.equal(ctx.maomaoyunTrafficSnapshot,null);
launchFails=true;next();assert.equal(ctx.maomaoyunTrafficReadState.task,null);launchFails=false;
timerFails=true;next();assert.equal(ctx.maomaoyunTrafficReadState.task,null);timerFails=false;
ctx.applyMaoMaoYunAccountResult({state:'authRequired'});
ctx.signInMaoMaoYunAccount();const beforeLogin=launches.length;
assert.equal(launches.at(-1),'--login');assert.equal(ctx.maomaoyunTrafficSourceState,'signingIn');
ctx.signInMaoMaoYunAccount();clock+=300000;ctx.requestMaoMaoYunTraffic(true);
assert.equal(launches.length,beforeLogin,'login is single-instance and suspends background reads');
complete(failure('invalid')+'\n'+wire(payload(5*GiB,100*GiB,clock,'c')),0,true);
assert.equal(ctx.maomaoyunTrafficSnapshot.accountKey,'c'.repeat(64));assert.equal(ctx.maomaoyunTrafficLoginPollTimer,null);
ctx.requestMaoMaoYunTraffic(true);assert.equal(launches.length,beforeLogin,'verified login does not immediately duplicate the API query');
ctx.applyMaoMaoYunAccountResult({state:'authRequired'});ctx.signInMaoMaoYunAccount();
complete(failure('cancelled'),0,true);
assert.equal(launches.at(-1),'--read','closing login only revalidates an old saved session, never reopens the window');
complete(failure('authRequired'));ctx.signInMaoMaoYunAccount();clock+=1200001;ctx.pollMaoMaoYunAccountLogin();
assert.equal(ctx.maomaoyunTrafficLoginState.task,null);assert.equal(ctx.maomaoyunTrafficSourceState,'authRequired');
launchFails=true;ctx.signInMaoMaoYunAccount();assert.equal(ctx.maomaoyunTrafficSourceState,'authRequired');launchFails=false;
timerFails=true;ctx.signInMaoMaoYunAccount();assert.equal(ctx.maomaoyunTrafficLoginState.task,null);timerFails=false;
ctx.uiLanguage='en';ctx.signInMaoMaoYunAccount();
assert.equal(launches.at(-1),'--login-en','English selection routes only an explicit login to the English helper window');
ctx.stopMaoMaoYunTrafficRead();ctx.uiLanguage='zh-CN';
ctx.applyMaoMaoYunAccountResult({state:'authRequired'});ctx.signInMaoMaoYunAccount();
assert.equal(launches.at(-1),'--login','Chinese selection preserves the original login mode');
ctx.stopMaoMaoYunTrafficRead();
next();ctx.applyMaoMaoYunAccountResult({state:'authRequired'});ctx.signInMaoMaoYunAccount();
assert.equal(ctx.maomaoyunTrafficReadState.task,null,'explicit sign in cancels an older in-flight query');
ctx.stopMaoMaoYunTrafficRead();
assert.equal(ctx.maomaoyunTrafficReadState.task,null);assert.equal(ctx.maomaoyunTrafficLoginState.task,null);
assert.equal(ctx.maomaoyunTrafficPollTimer,null);assert.equal(ctx.maomaoyunTrafficLoginPollTimer,null);
// Independent history reads have a six-hour floor, share origin backoff, and
// cannot turn a fresh balance into an error or revive another login's history.
ctx.applyMaoMaoYunAccountResult({state:'ready',snapshot:first});
const hstate=ctx.maomaoyunHistoryReadState;
function finishHistory(raw){assert(hstate.task);hstate.task.running=false;hstate.outputPipe=raw;ctx.pollMaoMaoYunHistory();}
ctx.writePrivateJSON=()=>{};finishHistory(historyWire());assert.equal(ctx.maomaoyunHistorySnapshot.dayCount,1);
const hcount=historyLaunches.length;ctx.requestMaoMaoYunHistory();assert.equal(historyLaunches.length,hcount);
clock+=6*3600000;ctx.requestMaoMaoYunHistory();finishHistory(JSON.stringify({version:3,state:'history',history:{state:'rateLimited'}}));
assert.equal(ctx.maomaoyunTrafficSourceState,'ready');assert(ctx.maomaoyunTrafficNextReadAt>clock);
clock+=15*60000;ctx.requestMaoMaoYunHistory();assert.equal(historyLaunches.length,hcount+1,'15m backoff does not bypass six-hour cadence');
clock+=6*3600000;ctx.requestMaoMaoYunHistory();finishHistory(JSON.stringify({version:3,state:'keychainLocked'}));
assert.equal(ctx.maomaoyunTrafficSnapshot.remainingBytes,397*GiB);assert.equal(ctx.maomaoyunTrafficSourceState,'ready');
clock+=6*3600000;ctx.requestMaoMaoYunHistory();hstate.task.running=false;hstate.outputPipe=historyWire();
ctx.maomaoyunTrafficSnapshot=core.normalizeMaoMaoYunTraffic(payload(5*GiB,100*GiB,clock,'b'),clock);ctx.pollMaoMaoYunHistory();
assert.notEqual(ctx.maomaoyunTrafficSnapshot.credentialRevision,ctx.maomaoyunHistorySnapshot?.credentialRevision,'late history does not alter balance session');
ctx.stopMaoMaoYunTrafficRead();
ctx.isExiting=true;const prior=launches.length;ctx.requestMaoMaoYunTraffic(true);ctx.signInMaoMaoYunAccount();assert.equal(launches.length,prior);
assert(cancels>=4&&invalidations>=10);

// Actual NSTask/timer and NSMenu views, with a local printf protocol substitute.
// Never launch the real account login helper or open the user's menu.
const fixture=`
ObjC.registerSubclass({name:'CodexMeterTrafficTestDelegate',methods:{
  'maomaoyunTrafficTaskTimer:':{types:['void',['id']],implementation:function(){pollMaoMaoYunTraffic();}}
}});
delegate=$.CodexMeterTrafficTestDelegate.alloc.init;statusItem={};buildMenu();
var originalLaunch=launchBackgroundTask, rawResult='', launchCount=0;
launchBackgroundTask=function(exe,args,state,captureError){
  if(args[0]!=='--read')throw new Error('No real login allowed in this fixture');
  launchCount++;
  return originalLaunch('/usr/bin/printf',['%s\\n',rawResult],state,captureError);
};
function readFixture(raw) {
  rawResult=raw;maomaoyunTrafficLastReadAt=0;maomaoyunTrafficNextReadAt=0;
  requestMaoMaoYunTraffic(true);
  var deadline=Date.now()+6000;
  while(maomaoyunTrafficReadState.task&&Date.now()<deadline) {
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(.01));
  }
  if(maomaoyunTrafficReadState.task)throw new Error('Fixture timed out');
  return {snapshot:maomaoyunTrafficSnapshot,state:maomaoyunTrafficSourceState,
    presentation:maoMaoYunTrafficPresentation(maomaoyunTrafficSnapshot,maomaoyunTrafficSourceState,Date.now()),
    title:ObjC.unwrap(maomaoyunTrafficItem.title),height:Number(maomaoyunTrafficView.frame.size.height),
    enabled:!!maomaoyunTrafficItem.enabled,role:ObjC.unwrap(maomaoyunTrafficView.accessibilityRole),
    timerStopped:maomaoyunTrafficPollTimer===null,
    tooltip:ObjC.unwrap(maomaoyunTrafficView.toolTip)||null};
}
var results={ready:readFixture(${JSON.stringify(wire(payload()))})};
var maxPayload=JSON.parse(${JSON.stringify(wire(payload()))});maxPayload.padding='';
var size=JSON.stringify(maxPayload).length;maxPayload.padding=new Array(8191-size+1).join('x');
results.maxPipe=readFixture(JSON.stringify(maxPayload));
results.transient=readFixture(${JSON.stringify(failure('error'))});
results.expired=readFixture(${JSON.stringify(failure('authRequired'))});
var signIns=0;signInMaoMaoYunAccount=function(){signIns++;};
results.expired.press=!!maomaoyunTrafficView.accessibilityPerformPress;
maomaoyunTrafficView.mouseDown($());
results.expired.clickCount=signIns;
results.newAccount=readFixture(${JSON.stringify(wire(payload(5*GiB,100*GiB,now,'d')))});
results.newAccount.press=!!maomaoyunTrafficView.accessibilityPerformPress;
maomaoyunTrafficView.mouseDown($());
results.invalid=readFixture('broken TEST_SECRET_JSON');
results.stale=readFixture(${JSON.stringify(wire(payload(3*GiB,400*GiB,now-601000)))});
var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,dashboardMetricLayout(MENU_WIDTH,'traffic').height));
sendVoid(image,'lockFocus');maomaoyunTrafficView.drawRect(maomaoyunTrafficView.bounds);sendVoid(image,'unlockFocus');
JSON.stringify({results:results,signIns:signIns,launchCount:launchCount});
`;
const result=spawnSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+fixture],
  {encoding:'utf8',timeout:20000,maxBuffer:200000});
assert.equal(result.status,0,result.stderr||result.error?.message||'Native traffic test failed');
assert(!result.stdout.includes('TEST_SECRET'),'no raw diagnostics or credentials may escape to presentation');
const native=JSON.parse(result.stdout);
assert.equal(native.results.ready.state,'ready');
assert(Object.values(native.results).every(entry=>entry.tooltip===null),
 'traffic never registers hover popups after success, failure or account changes');
assert.equal(native.results.maxPipe.state,'ready','Maximum legal 8192-byte stdout including newline must not deadlock NSTask');
assert.equal(native.results.ready.snapshot.remainingLabel,'397G');assert.equal(native.results.ready.enabled,false);
assert.equal(native.results.transient.presentation.stale,true);
assert.equal(native.results.expired.snapshot,null);assert.equal(native.results.expired.enabled,true);
assert.equal(native.results.expired.role,'AXGroup');assert.equal(native.results.expired.press,true);
assert.equal(native.results.expired.clickCount,2);
assert.equal(native.results.newAccount.press,false);assert.equal(native.signIns,2);
assert.equal(native.results.newAccount.snapshot.totalLabel,'100G');assert.equal(native.results.newAccount.role,'AXGroup');
assert.equal(native.results.invalid.snapshot,null);assert.equal(native.results.stale.presentation.stale,true);
assert(Object.values(native.results).every(entry=>entry.height===64&&entry.timerStopped),'background updates must not resize tracking-menu rows or leak timers');
console.log('VPN traffic checks passed: website byte protocol/privacy, low-frequency single-flight reads, login/expiry, account changes, network/429/timeouts, shutdown and native layout/press.');

const cacheRoot=fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-vpn-history-test-'));
try {
 const cachePath=path.join(cacheRoot,'cache','vpn-history.json');
 const source=readLibrarySource()+'\nmaomaoyunHistoryPath='+JSON.stringify(cachePath)+';'+
  'maomaoyunTrafficSnapshot='+JSON.stringify(first)+';';
 const nativeRun=code=>JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',source+'\n'+code],{encoding:'utf8',timeout:8000}));
 nativeRun('writePrivateJSON(maomaoyunHistoryPath,{version:1,history:'+JSON.stringify(history)+'});JSON.stringify(true);');
 assert.equal(fs.statSync(cachePath).mode&0o777,0o600);assert.equal(fs.statSync(path.dirname(cachePath)).mode&0o777,0o700);
 assert(!fs.readFileSync(cachePath,'utf8').includes('TEST_SECRET'));
 const saved=nativeRun('restoreMaoMaoYunHistory();JSON.stringify({count:maomaoyunHistorySnapshot.dayCount,last:maomaoyunHistoryLastReadAt});');
 assert.equal(saved.count,1);assert.equal(saved.last,history.fetchedAt,'validated cache maintains six-hour cadence across restart');
 const legacy=nativeRun('var h='+JSON.stringify(history)+';delete h.retentionDays;writePrivateJSON(maomaoyunHistoryPath,{version:1,history:h});restoreMaoMaoYunHistory();JSON.stringify({count:maomaoyunHistorySnapshot.dayCount,last:maomaoyunHistoryLastReadAt});');
 assert.equal(legacy.count,1);assert.equal(legacy.last,0,'old cache remains usable but permits one migration read for earlier dates');
 assert.equal(nativeRun('maomaoyunTrafficSnapshot.credentialRevision="'+('b'.repeat(64))+'";restoreMaoMaoYunHistory();JSON.stringify(maomaoyunHistorySnapshot);'),null);
 const texts=['Budget ~389.15G/day · learning','If reported pace holds: >999 days left','If reported pace holds: ~999.99T left','Reset schedule unavailable'];
 const widths=nativeRun('JSON.stringify('+JSON.stringify(texts)+'.map(function(t){return Number($(t).sizeWithAttributes(cardAttributes(9,cardColors().body,false)).width);}));');
 assert(widths.every(width=>width<=298),'VPN forecast/reset lines must fit fixed menu width');
 console.log('VPN history checks passed: native private atomic cache, session restore isolation/cadence and compact AppKit text widths.');
} finally {fs.rmSync(cacheRoot,{recursive:true,force:true});}

// Explicit live check only: read this app's own Keychain item via its helper.
// Credential values never enter Node/JXA, args/env, test output or fixtures.
if(process.argv.includes('--live')) {
  const arg=process.argv.indexOf('--helper');
  const helper=arg<0?path.join(os.homedir(),'Applications/Codex Usage Meter.app/Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/Resources/MaoMaoYunAccount.app/Contents/MacOS/MaoMaoYunAccount'):process.argv[arg+1];
  assert(helper&&path.isAbsolute(helper),'Helper path must be absolute');
  fs.accessSync(helper,fs.constants.X_OK);
  const response=execFileSync(helper,['--read'],{encoding:'utf8',timeout:40000,maxBuffer:65536});
  const parsed=core.parseMaoMaoYunAccountResult(response,Date.now());
  assert.equal(parsed.state,'ready','Live website query must be verified; reconnect explicitly if required');
  console.log('Live VPN website read passed:',JSON.stringify({
    remaining:parsed.snapshot.remainingLabel,total:parsed.snapshot.totalLabel,used:parsed.snapshot.usedLabel,
    reportedAt:parsed.snapshot.reportedAt,resetDays:parsed.snapshot.resetDays,resetState:parsed.snapshot.resetState,
    todayState:parsed.snapshot.todayState,todayUsage:core.maoMaoYunTrafficPresentation(parsed.snapshot,'ready',Date.now()).todayUsage
  }));
  const historyResponse=execFileSync(helper,['--history'],{encoding:'utf8',timeout:40000,maxBuffer:8192});
  const history=core.parseMaoMaoYunHistoryResult(historyResponse,parsed.snapshot,Date.now());
  console.log('Live VPN history:',JSON.stringify({state:history.state,dayCount:history.history?.dayCount,
    rowCount:history.history?.rowCount,sourceStart:history.history?.sourceStart,sourceEnd:history.history?.sourceEnd,
    completeness:history.history?.completeness,billingBasis:history.history?.billingBasis,bucketBasis:history.history?.bucketBasis,
    diagnostics:history.history?.diagnostics}));
  assert.equal(history.state,'ready','Live history shape remains unverified unless this read passes');
}
