const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {readSource:read, readLibrarySource} = require('./sources.cjs');
const core = vm.createContext({});
vm.runInContext(read('core'), core);
for (const value of [null, undefined, 'bad', NaN, -1, 101]) {
  assert.throws(() => core.validPercent(value));
}
assert.equal(core.validPercent(100), 0);
assert.equal(core.validPercent(80), 20);
assert.equal(core.validPercent(95), 5);
const quotaWindow=(duration,used=30)=>({windowDurationMins:duration,usedPercent:used,resetsAt:2000000000});
const payload=(primary,secondary=null)=>({result:{rateLimits:{primary,secondary}}});
const value = core.normalizeUsage(payload(quotaWindow(300)));
assert.equal(value.windows.length,1);
assert.equal(value.windows[0].label,'Session');
assert.equal(core.quotaValueLabel({remaining:null}, 'ready'), 'Unavailable');
const weeklyOnly=core.normalizeUsage(payload(quotaWindow(10080,0)));
assert.deepEqual(JSON.parse(JSON.stringify(weeklyOnly.windows)).map(w=>w.label),['Weekly']);
assert.equal(core.gaugeQuotaWindow(weeklyOnly.windows).remaining,100);
const swapped=core.normalizeUsage(payload(quotaWindow(10080,10),quotaWindow(300,40)));
assert.deepEqual(JSON.parse(JSON.stringify(swapped.windows)).map(w=>w.label),['Session','Weekly']);
assert.equal(core.gaugeQuotaWindow(swapped.windows).remaining,60);
assert.equal(core.normalizeUsage(payload(null,quotaWindow(10080))).windows[0].label,'Weekly');
assert.equal(core.normalizeUsage(payload({usedPercent:30})).windows[0].label,'Quota');
assert.equal(core.normalizeUsage(payload(quotaWindow(1440))).windows[0].label,'24h quota');
for(const duration of [0,-1,'10080',NaN,Infinity,1.5]) {
 assert.throws(()=>core.normalizeUsage(payload(quotaWindow(duration))));
}
assert.throws(()=>core.normalizeUsage(payload(null)));
assert.throws(()=>core.normalizeUsage(payload(quotaWindow(300),quotaWindow(10080,101))));
const buckets={result:{rateLimitsByLimitId:{codex:{primary:quotaWindow(10080,25)},base_model_inference:{primary:quotaWindow(300,99)}}}};
assert.equal(core.gaugeQuotaWindow(core.normalizeUsage(buckets).windows).remaining,75);
assert.match(core.quotaValueLabel({remaining:70}, 'error'), /stale/);
assert.match(core.quotaValueLabel({remaining:70}, 'cached'), /stale/);
assert.equal(core.quotaValueLabel({remaining:null}, 'error'), 'Sync failed');
assert.equal(core.usageAccountIdFromAuth({auth_mode:'chatgpt',tokens:{account_id:'account-a'}}),'account-a');
assert.equal(core.usageAccountIdFromAuth({auth_mode:'apikey',tokens:{account_id:'account-a'}}),null);
assert.equal(core.usageAccountIdFromAuth({auth_mode:'chatgpt',tokens:{account_id:''}}),null);
assert.equal(core.usageAccountIdFromAuth({auth_mode:'chatgpt',tokens:{account_id:'bad\nvalue'}}),null);
const cacheTime=2000000000000;
const cacheFixture={version:1,accountId:'account-a',savedAt:cacheTime,usage:weeklyOnly};
assert.equal(core.normalizeUsageCache(cacheFixture,'account-a',cacheTime).windows[0].label,'Weekly');
for(const mutate of [
 c=>c.version=2,c=>c.accountId='account-b',c=>c.savedAt=cacheTime-86400001,
 c=>c.savedAt=cacheTime+60001,c=>c.savedAt='bad',c=>c.usage.windows=[],
 c=>c.usage.windows[0].remaining=101,c=>c.usage.windows[0].remaining=null,
 c=>c.usage.windows[0].durationMins='10080',c=>c.usage.credits=-1,
 c=>c.usage.expirations=['bad']
]) {
 const broken=JSON.parse(JSON.stringify(cacheFixture));mutate(broken);
 assert.throws(()=>core.normalizeUsageCache(broken,'account-a',cacheTime));
}
assert.throws(()=>core.normalizeUsageCache(cacheFixture,null,cacheTime));
assert(!core.isExecutionFresh(100, 2000, 900));
assert(core.isExecutionFresh(1900, 2000, 900));

// Exercise the actual query with an abandoned row, a newer completed turn,
// and a long-running turn that is still producing execution records.
let sql;
const tasks = vm.createContext({
  codexDirectory: ':memory:', taskStateDatabasePath: ':memory:', runningTasksPath: ':memory:',
  runningReadState: {}, launchBackgroundTask: (exe,args) => { sql = args[args.length-1]; }
});
vm.runInContext(read('tasks'), tasks);
tasks.startRunningTasksRead();
assert(sql);
const fixture = `
ATTACH DATABASE ':memory:' AS state_db;
CREATE TABLE state_db.threads(id TEXT,archived INTEGER);
CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,status TEXT,started_at INTEGER,rollout_ordinal INTEGER);
CREATE TABLE thread_items(thread_id TEXT,turn_id TEXT,created_at_ms INTEGER);
INSERT INTO state_db.threads VALUES ('old',0),('finished',0),('long',0);
INSERT INTO thread_turns VALUES ('old','1','inProgress',100,1),('finished','1','inProgress',100,1),('finished','2','completed',1900,2),('long','1','inProgress',100,1);
INSERT INTO thread_items VALUES ('long','1',1950000);
`;
const result = execFileSync('/usr/bin/sqlite3', [':memory:'], {
 input: fixture + sql.replace(/^ATTACH DATABASE[^;]+;/,''),
 encoding:'utf8'
}).trim().split('\n').map(Number);
assert.deepEqual(result.sort((a,b)=>a-b), [100,1950]);
assert.equal(result.filter(t=>core.isExecutionFresh(t,2000,900)).length,1);

// Failed stop cannot advance to start; only confirmed Disconnected can.
let now=10000, commands=[];
const vpn = vm.createContext({
 Date:{now:()=>now}, vpnOperation:null,vpnLastWakeAt:0,vpnNextAttemptAt:0,
 maomaoyunActionState:{},maomaoyunReadState:{},maomaoyunServiceName:'test',
 maomaoyunPollTimer:null,maomaoyunLastStatusRequestAt:0,
 MAOMAOYUN_ACTION_TIMEOUT_MS:12000,MAOMAOYUN_STATUS_TIMEOUT_MS:5000,
 MAOMAOYUN_STABLE_REFRESH_MS:5000,MAOMAOYUN_TRANSITION_REFRESH_MS:750,
 maomaoyunItem:null,maomaoyunView:null,menuIsOpen:false,
 logError(){},ensureMaoMaoYunPollTimer(){},sendVoid(){},
 startTransientTimer(timer){return timer||{};},
 stopTransientTimer(){return null;},
 readBackgroundTaskOutput(pipe){return pipe;},
 resetBackgroundTask(s){s.task=null;s.outputPipe=null;s.startedAt=0;},
 launchBackgroundTask(exe,args,s){
  commands.push(args[1]);s.task={running:false,terminationStatus:0};
  s.outputPipe='';s.startedAt=now;
 }
});
vm.runInContext(read('vpn'),vpn);
// The shared cancellation helper lives with the other background-task tools.
const runtimeTools = vm.createContext({ObjC:{import(){},bindFunction(){}},$:{}});
vm.runInContext(read('runtime'),runtimeTools);
vpn.cancelBackgroundTask=state=>{
 runtimeTools.sendVoid=vpn.sendVoid;
 runtimeTools.cancelBackgroundTask(state);
};
vpn.reconnectMaoMaoYunAfterWake();
vpn.maomaoyunActionState.task.terminationStatus=1;
vpn.pollMaoMaoYunAction();
assert.deepEqual(commands,['stop']);
assert.equal(vpn.vpnOperation.phase,'stop');
assert(vpn.vpnNextAttemptAt>now);
vpn.maomaoyunReadState.task={running:false,terminationStatus:0};
vpn.maomaoyunReadState.outputPipe='Disconnected';
vpn.pollMaoMaoYunStatus();
assert.equal(commands.at(-1),'start');
vpn.pollMaoMaoYunAction();
vpn.maomaoyunReadState.outputPipe='Connected';
vpn.pollMaoMaoYunStatus();
assert.equal(vpn.vpnOperation,null);
now+=6000;vpn.reconnectMaoMaoYunAfterWake();
now+=61000;vpn.pollMaoMaoYunTasks();
assert.equal(vpn.vpnOperation,null);
assert.equal(vpn.maomaoyunStatus,'error');
console.log('Regression checks passed: quota validation, execution activity, VPN sequence/deadline.');

tasks.menu = {};
tasks.pinnedAnchorDividerItem = {hidden:true};
tasks.pinnedMenuItems = [];
tasks.pinnedThreadsSnapshot = [];
vm.runInContext(read('pinned-menu'),tasks);
tasks.updateTaskSectionsMenu();
assert.equal(tasks.pinnedAnchorDividerItem.hidden,false);

let clock = 1000;
const icon = vm.createContext({
 Date:{now:()=>clock},Math,hasRunningTasks:true,isExiting:false,
 statusTransitionToMode:'idle',statusTransitionStartedAt:0,
 statusIconCurrentColor:{red:1,green:1,blue:1,alpha:1},
 statusIconPalette:{idle:{red:1,green:1,blue:1,alpha:1},active:{red:0,green:1,blue:0,alpha:1}},
 statusIconQuotaFraction:0.1,statusIconQuotaTargetFraction:0.1,
 usageAccountId:null,
 quotaRingAnimationStartedAt:0,quotaRingAnimationTimer:null,
 QUOTA_RING_ANIMATION_DURATION_MS:520,
 startTransientTimer(t){return t||{};},stopTransientTimer(){return null;}
});
vm.runInContext(read('status-icon'),icon);
icon.rebuildStatusIconImages=()=>{};
icon.updateStatusIcon();
icon.animateStatusIconQuota(0.8);
clock+=280;icon.stepIconAnimation();
assert.equal(icon.statusIconCurrentColor.red,0);
assert(icon.statusIconQuotaFraction>0.1 && icon.statusIconQuotaFraction<0.8);
clock+=240;icon.stepIconAnimation();
assert.equal(icon.statusIconQuotaFraction,0.8);
assert.equal(icon.quotaRingAnimationTimer,null);

// A failed refresh during a quota transition must retain the valid target,
// preserve the activity animation, and recover on the next valid payload.
vm.runInContext(read('usage-cache')+'\n'+read('usage'),icon);
icon.quotaWindows=[{label:'Session',durationMins:300,remaining:73,resetAt:123},{label:'Weekly',durationMins:10080,remaining:86,resetAt:456}];
icon.normalizeUsage=core.normalizeUsage;
icon.gaugeQuotaWindow=core.gaugeQuotaWindow;
icon.redrawUsageCardIfNeeded=()=>{};
icon.setMenuBarText=text=>{icon.usageText=text;};
icon.updateUsageLabel=icon.setMenuBarText;
icon.hasRunningTasks=false;
icon.updateStatusIcon();
icon.animateStatusIconQuota(0.73);
const pendingTimer=icon.quotaRingAnimationTimer;
icon.showUsageError();
assert.equal(icon.usageSyncState,'error');
assert.equal(icon.statusIconQuotaTargetFraction,0.73);
assert.equal(icon.quotaRingAnimationTimer,pendingTimer);
assert.match(icon.usageText,/73%.*stale/);
clock+=520;icon.stepIconAnimation();
assert.equal(icon.statusIconQuotaFraction,0.73);
assert.equal(icon.statusIconCurrentColor.green,1);
icon.applyUsagePayload(payload(quotaWindow(300,30),quotaWindow(10080,14)));
assert.equal(icon.usageSyncState,'ready');
clock+=520;icon.stepIconAnimation();
assert.equal(icon.statusIconQuotaFraction,0.7);
assert.equal(icon.usageText,'Session 70%');
// Upgrading to a weekly-only account changes both the card and the gauge.
icon.applyUsagePayload(payload(quotaWindow(10080,18)));
assert.equal(icon.quotaWindows.length,1);
assert.equal(icon.quotaWindows[0].label,'Weekly');
clock+=520;icon.stepIconAnimation();
assert.equal(icon.statusIconQuotaFraction,0.82);
assert.equal(icon.usageText,'Weekly 82%');
icon.showUsageError();
assert.equal(icon.statusIconQuotaFraction,0.82);
assert.equal(icon.usageText,'Weekly 82% · stale');
icon.applyUsagePayload(payload(quotaWindow(10080,10),quotaWindow(300,40)));
clock+=520;icon.stepIconAnimation();
assert.equal(icon.statusIconQuotaFraction,0.6);
assert.equal(icon.usageText,'Session 60%');
icon.quotaWindows=[{label:'Quota',durationMins:null,remaining:null,resetAt:null}];
icon.showUsageError();
assert.equal(icon.statusIconQuotaFraction,0.02);
assert.equal(icon.usageText,'!');
console.log('Regression checks passed: empty Pinned divider, concurrent icon animation, stale quota preservation/recovery.');

// Exercise request coalescing, failure presentation during retries, the new
// watchdog, cache restore, and a response that races with an account switch.
let usageClock=1000,account='account-a',launched=0,terminated=0;
const saved=[];
const usage=vm.createContext({
 Date:{now:()=>usageClock},usageAccountId:null,usageCachePath:'unused',
 quotaWindows:[{label:'Quota',durationMins:null,remaining:null,resetAt:null}],
 usageSyncState:'loading',usageText:'!',refreshState:{task:null,queued:false},
 usagePollTimer:null,USAGE_READ_TIMEOUT_MS:50000,
 normalizeUsage:core.normalizeUsage,gaugeQuotaWindow:core.gaugeQuotaWindow,
 redrawUsageCardIfNeeded(){},updateStatusIcon(){},updateStatusButtonTitle(){},
 animateStatusIconQuota(){},stopQuotaRingAnimation(){},rebuildStatusIconImages(){},
 logError(){},ensureUsagePollTimer(){},stopTransientTimer(){return null;},
 startTransientTimer(timer){return timer||{};},
 resourcePath(){return 'reader';},readBackgroundTaskOutput(p){return p;},
 resetBackgroundTask(s){s.task=null;s.outputPipe=null;s.startedAt=0;s.timedOut=false;},
 launchBackgroundTask(exe,args,s){launched++;s.task={running:true};s.startedAt=usageClock;s.timedOut=false;},
 sendVoid(){terminated++;}
});
vm.runInContext(read('usage'),usage);
usage.readUsageAccountId=()=>account;
usage.readUsageCache=id=>id==='account-a'?weeklyOnly:null;
usage.saveUsageCache=n=>saved.push(n);
usage.setMenuBarText=t=>usage.usageText=t;
usage.updateUsageLabel=usage.setMenuBarText;
usage.syncUsageAccount();
assert.equal(usage.usageSyncState,'cached');
assert.equal(usage.statusIconQuotaFraction,1);
usage.requestUsageRefresh();usage.requestUsageRefresh();usage.requestUsageRefresh();
assert.equal(launched,1);
assert.equal(usage.refreshState.queued,true);
usage.refreshState.task={running:false,terminationStatus:1};
usage.pollUsageRefresh();
assert.equal(launched,2);
assert.equal(usage.usageSyncState,'error');
assert.equal(usage.usageText,'Weekly 100% · stale');
usage.refreshState.task={running:false,terminationStatus:0};
usage.refreshState.outputPipe=JSON.stringify(payload(quotaWindow(10080,12)));
usage.pollUsageRefresh();
assert.equal(usage.usageSyncState,'ready');
assert.equal(usage.usageText,'Weekly 88%');
assert.equal(saved.length,1);
usage.requestUsageRefresh();
account='account-b';
usage.requestUsageRefresh();
assert.equal(usage.quotaWindows[0].remaining,null,'account switch clears old value during an in-flight read');
usage.refreshState.task={running:false,terminationStatus:0};
usage.refreshState.outputPipe=JSON.stringify(payload(quotaWindow(10080,90)));
usage.pollUsageRefresh();
assert.equal(saved.length,1,'old account reply must not be saved or applied');
assert.equal(usage.quotaWindows[0].remaining,null);
assert.equal(usage.usageText,'!');
assert.equal(usage.refreshState.accountId,'account-b');
assert.equal(usage.usageSyncState,'error','retry must not hide the failure');
usageClock+=30000;usage.pollUsageRefresh();assert.equal(terminated,0);
usageClock+=20001;usage.pollUsageRefresh();assert.equal(terminated,1);
usage.pollUsageRefresh();assert.equal(terminated,1,'watchdog terminates only once');
usage.refreshState.task={running:false,terminationStatus:1};usage.pollUsageRefresh();
assert.equal(usage.usageSyncState,'error');
usage.requestUsageRefresh();assert.equal(usage.usageSyncState,'error');
console.log('Regression checks passed: account-isolated cache validation, stale retries, coalescing, account switch race and 50s watchdog.');

// Test the actual layout and drawing: a missing Session must not reserve a
// second row, and reset credits still belong to the bottom visible row.
const definitions={};
const card=vm.createContext({
 ObjC:{registerSubclass(def){definitions[def.name]=def;}},
 $:{NSMakeSize(width,height){return {width,height};}},
 quotaWindows:swapped.windows,QUOTA_SPACING_UNIT:2,MENU_WIDTH:330,
 usageSyncState:'ready',availableCredits:3,resetCreditExpirations:[2000000000],
 renderState:{usageCardSnapshotKey:null},quotaValueLabel:core.quotaValueLabel,
 QUOTA_WARNING_THRESHOLD:20,QUOTA_CRITICAL_THRESHOLD:5
});
vm.runInContext(read('appearance')+'\n'+read('menu'),card);
assert.equal(card.quotaCardLayout().rows.length,2);
assert.equal(card.quotaCardLayout().height,93);
card.quotaWindows=weeklyOnly.windows;
assert.equal(card.quotaCardLayout().rows.length,1);
assert.equal(card.quotaCardLayout().height,48);
card.usageCardView={frame:{size:{height:93}},setFrameSize(size){this.frame.size=size;},setNeedsDisplay(){}};
card.redrawUsageCardIfNeeded(false);
assert.equal(card.usageCardView.frame.size.height,48);
const titles=[],trailing=[];
card.cardColors=()=>({body:'body',muted:'muted'});
card.quotaCardColor=()=> 'color';
card.drawCardText=text=>{titles.push(text);};
card.drawCardTextRight=()=>{};
card.drawRoundedBar=()=>{};
card.drawCardTextWithTrailingText=(left,right)=>{trailing.push(right);};
definitions.CodexUsageMeterCardView.methods['drawRect:'].implementation.call({bounds:{size:{width:330}}});
assert.deepEqual(titles,['Weekly']);
assert.equal(trailing.length,1);
assert.match(trailing[0],/3 uses/);
card.usageSyncState='cached';assert.equal(card.quotaResetLabel(card.quotaWindows[0]),'Cached value · updating');
card.usageSyncState='error';assert.equal(card.quotaResetLabel({remaining:null}),'Update failed · retrying');
card.availableCredits=null;assert.equal(card.inlineResetCreditText(),'');
card.quotaWindows=swapped.windows;
card.redrawUsageCardIfNeeded(false);
assert.equal(card.usageCardView.frame.size.height,93);
console.log('Regression checks passed: duration-based windows, weekly-only gauge, dynamic card height and reset credits.');

// Exercise the native resize bridge with both one and two quota rows.
const nativeCard=execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',
 readLibrarySource()+
 "\nusageCardView=$.CodexUsageMeterCardView.alloc.initWithFrame($.NSMakeRect(0,0,MENU_WIDTH,quotaCardLayout().height));"+
 "quotaWindows=normalizeUsage("+JSON.stringify(payload(quotaWindow(10080)))+").windows;redrawUsageCardIfNeeded(true);var single=Number(usageCardView.frame.size.height);"+
 "quotaWindows=normalizeUsage("+JSON.stringify(payload(quotaWindow(300),quotaWindow(10080)))+").windows;redrawUsageCardIfNeeded(true);"+
 "JSON.stringify({single:single,double:Number(usageCardView.frame.size.height)});"
],{encoding:'utf8',timeout:5000});
assert.deepEqual(JSON.parse(nativeCard),{single:48,double:93});
console.log('Regression check passed: native AppKit quota card resizing.');

// Exercise the real Foundation bridge: null attributes previously raised an
// NSNull exception, silently preventing creation of the first error log.
const logFixture=fs.mkdtempSync(path.join(require('os').tmpdir(),'codex-meter-log-test-'));
try {
 const logPath=path.join(logFixture,'errors.log');
 let logSource=read('runtime').slice(read('runtime').indexOf('function logError('));
 logSource=logSource.replace("ObjC.unwrap($.NSHomeDirectory()) + '/Library/Application Support/CodexUsageMeter/widget-errors.log'",JSON.stringify(logPath));
 execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',"ObjC.import('Foundation');\n"+logSource+"\nlogError('test','diagnostic creation'); logError('test','diagnostic creation');"],{timeout:5000});
 const logged=fs.readFileSync(logPath,'utf8').trim().split('\n');
 assert.equal(logged.length,1);
 assert.match(logged[0],/\[test\] diagnostic creation/);
} finally {
 fs.rmSync(logFixture,{recursive:true,force:true});
}
console.log('Regression check passed: native diagnostic log creation/deduplication.');

// Real Foundation I/O, private permissions and restart restoration. Only
// synthetic credentials are used, and all writes stay in this temp fixture.
const cacheRoot=fs.mkdtempSync(path.join(require('os').tmpdir(),'codex-meter-cache-test-'));
try {
 const fakeHome=path.join(cacheRoot,'auth');fs.mkdirSync(fakeHome);
 const authPath=path.join(fakeHome,'auth.json'),cachePath=path.join(cacheRoot,'cache','quota.json');
 fs.writeFileSync(authPath,JSON.stringify({auth_mode:'chatgpt',tokens:{account_id:'test-account',access_token:'never-persist-this'}}));
 const nativeSource=[readLibrarySource(),
  'usageCachePath='+JSON.stringify(cachePath)+';logError=function(){};animateStatusIconQuota=function(){};updateUsageLabel=function(t){usageText=t;};'].join('\n');
 const runNative=code=>JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',nativeSource+'\n'+code],
  {encoding:'utf8',timeout:5000,env:{...process.env,CODEX_HOME:fakeHome}}));
 const written=runNative('syncUsageAccount();applyUsagePayload('+JSON.stringify(payload(quotaWindow(10080,12)))+');JSON.stringify({state:usageSyncState,identified:usageAccountId!==null});');
 assert.deepEqual(written,{state:'ready',identified:true});
 const cached=JSON.parse(fs.readFileSync(cachePath,'utf8'));
 assert.equal(cached.usage.windows[0].remaining,88);
 assert(!fs.readFileSync(cachePath,'utf8').includes('never-persist-this'));
 assert.equal(fs.statSync(cachePath).mode&0o777,0o600);
 assert.equal(fs.statSync(path.dirname(cachePath)).mode&0o777,0o700);
 const restored=runNative('syncUsageAccount();JSON.stringify({state:usageSyncState,remaining:quotaWindows[0].remaining,ring:statusIconQuotaFraction});');
 assert.deepEqual(restored,{state:'cached',remaining:88,ring:0.88});
 fs.writeFileSync(authPath,JSON.stringify({auth_mode:'chatgpt',tokens:{account_id:'other-account'}}));
 assert.equal(runNative('syncUsageAccount();JSON.stringify({remaining:quotaWindows[0].remaining});').remaining,null);
 fs.writeFileSync(cachePath,'not JSON');
 assert.equal(runNative('syncUsageAccount();JSON.stringify({remaining:quotaWindows[0].remaining});').remaining,null);
} finally {fs.rmSync(cacheRoot,{recursive:true,force:true});}
console.log('Regression checks passed: native cache I/O, private permissions, restart, corrupt cache and account isolation.');
