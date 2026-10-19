const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {readSource}=require('./sources.cjs');
const core=vm.createContext({});vm.runInContext(readSource('core')+'\n'+readSource('meter-panels-core'),core);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-profile-meter-test-'));
try {
  const binary=path.join(root,'profile-test');
  execFileSync('/usr/bin/xcrun',['clang','-fobjc-arc','-fblocks','-Wall','-Wextra','-Werror','-Wno-unused-function',
    '-framework','Foundation','Tests/token-profile-reader.m','-o',binary],{cwd:path.join(__dirname,'..')});
  console.log(execFileSync(binary,{encoding:'utf8',timeout:5000}).trim());
  if(process.argv.includes('--live')){
    const reader=path.join(root,'reader');
    execFileSync('/usr/bin/xcrun',['clang','-fobjc-arc','-fblocks','-Wall','-Wextra','-Werror','-framework','Foundation','Sources/token-profile-reader.m','-o',reader],{cwd:path.join(__dirname,'..')});
    const profileRoot=process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),current=JSON.parse(fs.readFileSync(path.join(profileRoot,'auth.json'),'utf8')).tokens?.account_id;
    const actual=JSON.parse(execFileSync(reader,[profileRoot,String(Date.now()/1000)],{encoding:'utf8',timeout:30000}));
    const valid=core.normalizeTokenMeter(actual,current,Date.now()/1000);assert(valid,'real native profile payload passes account/date validation');
    console.log('Live official profile:',JSON.stringify({source:valid.source,period:[valid.days[0].date,valid.days[29].date],
      total:core.tokenMeterModel(valid).total,days:valid.days}));
  }
} finally {fs.rmSync(root,{recursive:true,force:true});}
const now=Math.floor(Date.now()/1000),local=new Date(now*1000),today=Date.UTC(local.getFullYear(),local.getMonth(),local.getDate());
const snapshot={version:3,source:'profile',accountId:'meter-fixture',savedAt:now,
  days:Array.from({length:30},(_,i)=>({date:new Date(today-(29-i)*86400000).toISOString().slice(0,10),tokens:(i+1)*12345}))};
assert(core.normalizeTokenMeter(snapshot,'meter-fixture',now));
assert.equal(core.tokenMeterModel(snapshot).total,465*12345);
assert.equal(core.tokenMeterModel(snapshot).startDate,snapshot.days[0].date);
assert.equal(core.tokenMeterModel(snapshot).endDate,snapshot.days[29].date);
assert.equal(core.tokenMeterModel(snapshot).days.length,30);
assert.equal(core.tokenMeterModel(null),null);
for(const change of [s=>s.version=1,s=>s.version=2,s=>s.source='local',s=>s.accountId='other',s=>s.savedAt=now+61,
  s=>s.savedAt=now-86401,s=>s.days.pop(),s=>s.days[2].date=s.days[1].date,s=>s.days[0].date='2026-02-30',
  s=>s.days[29].date='2025-01-01',s=>s.days[0].tokens=-1,s=>s.days[0].tokens=true,
  s=>s.days[0].tokens=1.2,s=>s.days.forEach(d=>d.tokens=9007199254740991)]){
  const invalid=structuredClone(snapshot);change(invalid);assert.equal(core.normalizeTokenMeter(invalid,'meter-fixture',now),null);
}
assert.equal(core.normalizeTokenMeter(snapshot,null,now),null);
console.log('Profile activity model passed: exact thirty dates, total, numeric/schema/identity guards; seven-day and local caches rejected.');

let clock=2000000000000,identity='account-a',launches=0,terminations=0,reads=0;
const state={task:null,startedAt:0,timedOut:false,accountId:null};
const controller=vm.createContext({Date:{now:()=>clock},usageAccountId:identity,usageSyncState:'error',isExiting:false,
  tokenMeterReadState:state,tokenMeterPollTimer:null,tokenMeterPolling:false,tokenMeterSnapshot:null,
  tokenMeterNextReadAt:0,tokenMeterLastReadAt:0,tokenMeterSync:'loading',tokenMeterPath:'fixture',codexDirectory:'fixture',
  $:{NSProcessInfo:{processInfo:{environment:{objectForKey:()=>null}}}},ObjC:{unwrap:v=>v},resourcePath:s=>s,
  launchBackgroundTask(exe,args,s){assert.equal(exe,'TokenProfileReader');assert.equal(args[2],'--cache');launches++;s.task={running:true,terminationStatus:0};s.startedAt=clock;},
  cancelBackgroundTask(s){s.task=null;},stopTransientTimer:()=>null,startTransientTimer:()=>({}),
  resetBackgroundTask(s){s.task=null;s.timedOut=false;},readUsageAccountId:()=>identity,
  refreshTokenMeterMenu(){},logError(){},sendVoid(){terminations++;}});
vm.runInContext(readSource('token-meter'),controller);
controller.readTokenMeterCache=account=>{reads++;return {source:'profile',accountId:account,savedAt:clock/1000};};
controller.resetTokenMeter();assert.equal(controller.tokenMeterSync,'cached');
controller.requestTokenMeterRead(false);controller.requestTokenMeterRead(true);assert.equal(launches,1);
state.task.running=false;controller.pollTokenMeterRead();assert.equal(controller.tokenMeterSync,'ready');
controller.requestTokenMeterRead(false);assert.equal(launches,1);
clock+=60001;controller.requestTokenMeterRead(false);assert.equal(launches,1);
controller.requestTokenMeterRead(true);assert.equal(launches,2);
clock+=35001;controller.pollTokenMeterRead();controller.pollTokenMeterRead();assert.equal(terminations,1);
state.task.running=false;controller.pollTokenMeterRead();assert.equal(controller.tokenMeterSync,'error');
assert.equal(controller.tokenMeterSnapshot.source,'profile');
clock+=300001;controller.requestTokenMeterRead(false);assert.equal(launches,3);
state.task.running=false;state.task.terminationStatus=4;controller.pollTokenMeterRead();
assert.equal(controller.tokenMeterSync,'rateLimited');clock+=60001;controller.requestTokenMeterRead(true);assert.equal(launches,3,'429 backoff cannot be bypassed by menu opens');
clock+=900000;controller.requestTokenMeterRead(false);assert.equal(launches,4);
state.task.running=false;state.task.terminationStatus=3;controller.pollTokenMeterRead();
assert.equal(controller.tokenMeterSync,'authRequired');assert.equal(controller.tokenMeterSnapshot,null);
clock+=300001;controller.requestTokenMeterRead(false);assert.equal(launches,5);
identity='account-b';controller.usageAccountId=identity;state.task.running=false;
const before=reads;controller.pollTokenMeterRead();assert.equal(reads,before);
controller.resetTokenMeter();assert.equal(controller.tokenMeterSnapshot.accountId,identity);
controller.usageAccountId=null;controller.readTokenMeterCache=()=>null;controller.resetTokenMeter();
controller.requestTokenMeterRead(true);assert.equal(launches,5);assert.equal(controller.tokenMeterSnapshot,null);
console.log('Profile meter controller passed: independent quota/source, single-flight/cadence, watchdog, 429 backoff, auth clearing, stale retention and account races.');
