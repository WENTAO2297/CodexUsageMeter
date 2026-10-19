const assert = require('node:assert/strict');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {readSource, readLibrarySource} = require('./sources.cjs');
const definitions = readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];

// Use the production wake delegate, VPN confirmation flow and traffic reader.
// All time, tasks and timers are synthetic: never sleep the Mac, run scutil,
// contact the website, access Keychain, or open a login window here.
function fixture() {
  let now = 1800000000000, failTimer = false, failLaunch = false;
  const calls = [], timers = [], classes = {}, cancelled = [];
  const ctx = vm.createContext({
    Date:class extends Date {static now(){return now;}},
    ObjC:{unwrap:v=>v,registerSubclass:def=>{classes[def.name]=def.methods;}},
    $:{NSHomeDirectory:()=>'/fixture'},
    createBackgroundTaskState:extra=>Object.assign({task:null,outputPipe:null,startedAt:0},extra),
    resourcePath:name=>'/fixture/'+name,
    launchBackgroundTask(exe,args,state,captureError){
      if(failLaunch && args[0]==='--read')throw Error('Fixture launch failure');
      calls.push({at:now,exe,args:[...args],captureError});
      state.task={running:true,terminationStatus:0};state.startedAt=now;state.outputPipe='';
    },
    cancelBackgroundTask(state){if(state.task)cancelled.push(state.task);state.task=null;state.outputPipe=null;state.startedAt=0;},
    resetBackgroundTask(state){state.task=null;state.outputPipe=null;state.startedAt=0;},
    readBackgroundTaskOutput:pipe=>pipe,
    startTransientTimer(timer,interval,selector){
      if(timer)return timer;
      if(failTimer && selector==='maomaoyunTrafficWakeTimer:')throw Error('Fixture timer failure');
      const next={active:true,interval,selector};timers.push(next);return next;
    },
    stopTransientTimer(timer){if(timer)timer.active=false;return null;},
    requestRunningTasksRead(){},logError(){}
  });
  for(const name of ['state','vpn-traffic-core','vpn','vpn-traffic','usage'])vm.runInContext(readSource(name),ctx);
  vm.runInContext(definitions,ctx);
  ctx.requestUsageRefresh=()=>{};ctx.redrawUsageCardIfNeeded=()=>{};
  ctx.maomaoyunHistoryLastReadAt=now;
  const methods=classes.CodexUsageMeterDelegate;
  const readCount=()=>calls.filter(c=>c.args[0]==='--read').length;
  const timerCount=()=>timers.filter(t=>t.active&&t.selector==='maomaoyunTrafficWakeTimer:').length;
  function completeTask(state,raw=''){
    assert(state.task);state.task.running=false;state.outputPipe=raw;
  }
  function ready(revision='a',extra={}){
    return {version:3,state:'ready',traffic:{usedBytes:10,totalBytes:100,remainingBytes:90,
      accountKey:revision.repeat(64),credentialRevision:revision.repeat(64),reportedAt:now,resetDays:28,...extra}};
  }
  return {ctx,calls,cancelled,readCount,timerCount,ready,
    time:()=>now,
    wake(){methods['workspaceDidWake:'].implementation();},
    tick(){methods['maomaoyunTrafficWakeTimer:'].implementation();},
    advance(ms){now+=ms;this.tick();},
    connect(){
      completeTask(ctx.maomaoyunActionState);ctx.pollMaoMaoYunAction();
      completeTask(ctx.maomaoyunReadState,'Disconnected');ctx.pollMaoMaoYunStatus();
      completeTask(ctx.maomaoyunActionState);ctx.pollMaoMaoYunAction();
      completeTask(ctx.maomaoyunReadState,'Connected');ctx.pollMaoMaoYunStatus();
    },
    finish(state='ready',extra={}){
      completeTask(ctx.maomaoyunTrafficReadState,JSON.stringify(state==='ready'?ready('a',extra):{version:3,state}));
      ctx.pollMaoMaoYunTraffic();
    },
    seed(){ctx.maomaoyunTrafficSnapshot=ctx.normalizeMaoMaoYunTraffic(ready().traffic,now);ctx.maomaoyunTrafficSourceState='ready';},
    launchFailure(value){failLaunch=value;},timerFailure(){failTimer=true;}
  };
}

{
  const f=fixture();f.seed();const previous=f.ctx.maomaoyunTrafficSnapshot;
  // A just-started pre-sleep read must not block recovery or overwrite it later.
  f.ctx.requestMaoMaoYunTraffic(true);const old=f.ctx.maomaoyunTrafficReadState.task;
  f.wake();assert(f.cancelled.includes(old));assert.equal(f.ctx.maomaoyunTrafficReadState.task,null);
  assert.equal(f.ctx.maomaoyunTrafficSnapshot,previous);
  assert.equal(f.timerCount(),1);assert.equal(f.ctx.vpnOperation.phase,'stop');
  assert.equal(f.readCount(),1,'wake must not query while reconnect is stopping VPN');
  f.wake();assert.equal(f.timerCount(),1,'duplicate wake notifications coalesce');
  assert.equal(f.calls.filter(c=>c.args[1]==='stop').length,1);
  f.advance(10000);f.connect();
  f.ctx.requestMaoMaoYunTraffic(true);assert.equal(f.readCount(),1,'menu refresh cannot race the wake coordinator');
  f.advance(1499);assert.equal(f.readCount(),1);
  f.advance(1);assert.equal(f.readCount(),2,'settled reconnect bypasses only the normal one-minute cadence');
  f.tick();assert.equal(f.readCount(),2,'one recovery read at a time');
  f.finish();assert.equal(f.ctx.maomaoyunTrafficSourceState,'ready');assert.equal(f.timerCount(),0);
  assert.equal(f.ctx.maomaoyunTrafficWakeRecovery,null);f.advance(10000);assert.equal(f.readCount(),2);
  f.ctx.requestMaoMaoYunTraffic(true);assert.equal(f.readCount(),2,'normal rate limit resumes after success');
}
{
  const f=fixture();f.seed();f.wake();f.connect();f.advance(1500);f.finish('error');
  assert(f.ctx.maomaoyunTrafficSnapshot,'transient failure retains verified balance');
  f.ctx.requestMaoMaoYunTraffic(true);assert.equal(f.readCount(),1);
  f.advance(4999);assert.equal(f.readCount(),1);f.advance(1);assert.equal(f.readCount(),2);
  f.finish('timeout');f.advance(14999);assert.equal(f.readCount(),2);f.advance(1);assert.equal(f.readCount(),3);
  f.finish();assert.equal(f.timerCount(),0);assert.equal(f.ctx.maomaoyunTrafficSourceState,'ready');
  assert(f.calls.every(c=>!/^--login/.test(c.args[0])),'recovery never opens login');
}
{
  const f=fixture();f.wake();f.connect();f.advance(1500);
  f.finish('error');f.advance(5000);f.finish('error');f.advance(15000);f.finish('error');
  assert.equal(f.readCount(),3);assert.equal(f.timerCount(),0,'three failed attempts exhaust recovery');
  f.advance(30000);f.ctx.requestMaoMaoYunTraffic(true);assert.equal(f.readCount(),3);
  f.advance(30000);f.ctx.requestMaoMaoYunTraffic(true);assert.equal(f.readCount(),4,'ordinary cadence is restored, not disabled');
}
for(const field of ['maomaoyunTrafficNextReadAt','maomaoyunHistoryNextReadAt']){
  const f=fixture();f.ctx[field]=f.time()+900000;f.wake();f.connect();f.advance(5000);
  assert.equal(f.readCount(),0,'wake must respect existing origin backoff: '+field);
  assert.equal(f.timerCount(),0);assert(f.ctx[field]>f.time());
}
for(const state of ['rateLimited','authRequired','credentialChanged','invalid']){
  const f=fixture();f.seed();f.wake();f.connect();f.advance(1500);f.finish(state);
  assert.equal(f.timerCount(),0);assert.equal(f.ctx.maomaoyunTrafficWakeRecovery,null);
  f.advance(20000);assert.equal(f.readCount(),1,'terminal result does not loop: '+state);
  if(state==='rateLimited'){
    assert(f.ctx.maomaoyunTrafficSnapshot);assert.equal(f.ctx.maomaoyunTrafficNextReadAt,f.time()-20000+900000);
  } else assert.equal(f.ctx.maomaoyunTrafficSnapshot,null,'do not retain another or invalid account');
}
{
  const f=fixture();f.seed();f.wake();f.connect();f.advance(1500);f.finish('keychainLocked');
  assert.equal(f.ctx.maomaoyunTrafficSnapshot,null,'locked credentials still clear unvalidated values');
  f.advance(5000);assert.equal(f.readCount(),2);f.finish();assert.equal(f.timerCount(),0);
}
{
  const f=fixture();f.wake();f.connect();f.advance(1500);f.finish('ready',{todayRetryAt:f.time()+900000});
  assert.equal(f.timerCount(),0);assert(f.ctx.maomaoyunTrafficNextReadAt>f.time(),'today-report 429 retains its backoff');
}
{
  const f=fixture();f.ctx.maomaoyunTrafficSourceState='authRequired';f.ctx.signInMaoMaoYunAccount();
  const login=f.ctx.maomaoyunTrafficLoginState.task;f.wake();f.connect();f.advance(5000);
  assert.equal(f.ctx.maomaoyunTrafficLoginState.task,login);assert.equal(f.timerCount(),0);assert.equal(f.readCount(),0);
}
{
  const f=fixture();f.wake();f.connect();f.advance(1500);f.finish('keychainLocked');
  f.ctx.signInMaoMaoYunAccount();assert.equal(f.timerCount(),0,'explicit login supersedes automatic recovery');
  f.advance(20000);assert.equal(f.readCount(),1);
}
{
  const f=fixture();f.seed();
  // Make history eligible rather than relying on its six-hour normal timer.
  f.ctx.maomaoyunHistoryLastReadAt=0;f.ctx.requestMaoMaoYunHistory();
  const pending=f.ctx.maomaoyunHistoryReadState.task;assert(pending);
  f.wake();assert(f.cancelled.includes(pending));assert.equal(f.ctx.maomaoyunHistoryReadState.task,null);
  assert.equal(f.readCount(),0);
}
{
  const f=fixture();f.wake();f.connect();f.advance(1000);
  f.ctx.maomaoyunStatus='disconnected';f.advance(1000);assert.equal(f.readCount(),0);
  f.ctx.maomaoyunStatus='connected';f.tick();f.advance(1499);assert.equal(f.readCount(),0);f.advance(1);assert.equal(f.readCount(),1);
}
for(const change of ['deadline','clock','exit','manual','stop']){
  const f=fixture();f.wake();
  if(change==='deadline')f.advance(180000);
  if(change==='clock')f.advance(-1);
  if(change==='exit'){f.ctx.isExiting=true;f.tick();}
  if(change==='manual')f.ctx.startMaoMaoYunAction('stop',false);
  if(change==='stop')f.ctx.stopMaoMaoYunTrafficRead();
  assert.equal(f.timerCount(),0,'bounded recovery cleanup: '+change);assert.equal(f.readCount(),0);
}
{
  const f=fixture();f.wake();f.advance(6000);f.wake();assert.equal(f.timerCount(),1,'a later wake replaces the previous recovery');
  f.connect();f.advance(1500);f.launchFailure(true);
  // First launch already happened; watchdog and launch failures use the same bounded policy.
  f.advance(35001);f.ctx.pollMaoMaoYunTraffic();f.advance(5000);f.advance(15000);
  assert.equal(f.timerCount(),0);assert.equal(f.ctx.maomaoyunTrafficReadState.task,null);
}
{
  const f=fixture();f.timerFailure();f.wake();assert.equal(f.timerCount(),0);
  assert.equal(f.ctx.maomaoyunTrafficWakeRecovery,null,'timer setup failure must not permanently suppress traffic reads');
}
console.log('VPN wake model passed: production reconnect ordering, settling, bounded retries, stale retention, backoff/auth/session isolation, stale-task cancellation and lifecycle.');

// Verify the actual delegate selector, NSTimer and NSTask lifecycle offscreen.
// A local printf process substitutes for the helper; no account or VPN access.
const native=`
delegate=$.CodexUsageMeterDelegate.alloc.init;
var originalLaunch=launchBackgroundTask,reads=0;
launchBackgroundTask=function(exe,args,state,captureError){
 if(args.length!==1||args[0]!=='--read')throw Error('No system or login task allowed');
 reads++;
 var response={version:3,state:'ready',traffic:{usedBytes:10,totalBytes:100,remainingBytes:90,
 accountKey:new Array(65).join('a'),credentialRevision:new Array(65).join('a'),reportedAt:Date.now(),resetDays:28}};
 return originalLaunch('/usr/bin/printf',['%s',JSON.stringify(response)],state,captureError);
};
requestMaoMaoYunHistory=function(){};restoreMaoMaoYunHistory=function(){};
MAOMAOYUN_TRAFFIC_WAKE_SETTLE_MS=0;maomaoyunStatus='connected';
beginMaoMaoYunTrafficWakeRecovery();pollMaoMaoYunTrafficWakeRecovery();
maomaoyunTrafficWakeTimer.fireDate=$.NSDate.dateWithTimeIntervalSinceNow(.01);
var until=Date.now()+5000;
while(maomaoyunTrafficWakeRecovery&&Date.now()<until)
 $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(.01));
var result={reads:reads,state:maomaoyunTrafficSourceState,remaining:maomaoyunTrafficSnapshot&&maomaoyunTrafficSnapshot.remainingBytes,
 stopped:!maomaoyunTrafficWakeTimer&&!maomaoyunTrafficPollTimer&&!maomaoyunTrafficWakeRecovery};
stopMaoMaoYunTrafficRead();JSON.stringify(result);
`;
const result=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+native],
  {encoding:'utf8',timeout:10000}));
assert.deepEqual(result,{reads:1,state:'ready',remaining:90,stopped:true});
console.log('VPN wake native fixture passed: real timer/delegate, nonblocking local task and complete timer cleanup (no network changes).');
