const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {execFileSync,spawnSync}=require('node:child_process');
const {readSource}=require('./sources.cjs');
const c=vm.createContext({});vm.runInContext(['forecast-core','token-forecast-core','forecast-display','dashboard','i18n'].map(readSource).join('\n'),c);
const now=Math.floor(Date.now()/86400000)*86400,begin=now-7*86400,reset=now+2*86400;
function history(multiplier=1){
 const anchors=[],days=[];
 for(let i=0;i<=28;i++)anchors.push({at:begin+i*21600,used:i*2,resetAt:reset,plan:'prolite',segment:1,planSince:begin,
   counts:[i*1e6*multiplier,i*6e5*multiplier,i*1e4*multiplier],models:{'gpt-6.1-sol':i*1.01e6*multiplier}});
 for(let i=0;i<7;i++)days.push({at:begin+i*86400,counts:[4e6*multiplier,2.4e6*multiplier,4e4*multiplier],models:{'gpt-6.1-sol':4.04e6*multiplier}});
 return {version:1,accountId:'account-a',savedAt:now,anchors,days};
}
const context={now,sync:'ready',lastSuccessAt:now,accountKnown:true,plan:'prolite'},w={durationMins:10080,remaining:44,resetAt:reset};
let h=history(),f=c.forecastTokenHistory(w,h,context);
assert.equal(f.basis,'tokenHistory');assert.equal(f.status,'unknown','rough estimates cannot get a green guarantee');assert.equal(f.verdict,'safe');
assert(Math.abs(f.typicalConsumption-16)<1e-7);assert(f.highConsumption>f.typicalConsumption&&f.lowConsumption<f.typicalConsumption);
assert.equal(c.forecastTokenHistory(w,history(100),context).text,f.text,'empirical calibration, not a fixed token price');
assert.equal(c.forecastTokenHistory({...w,remaining:10},h,context).verdict,'risk');
assert.match(c.forecastTokenHistory({...w,remaining:1},h,context).text,/~0% at reset/,'identical endpoints collapse instead of showing 0–0%');
const depleted=c.forecastTokenHistory({...w,remaining:10},h,context);
const depletionRow=c.dashboardForecast(c.quotaForecastSummary({...w,remaining:10},depleted,now));
assert.equal(depletionRow.label,'Estimated at reset');assert.equal(depletionRow.value,'0%');
assert.equal(depletionRow.basis,'');assert.equal(depletionRow.status,'unknown');
assert.equal(c.dashboardForecast(c.quotaForecastSummary(w,f,now)).label,'Estimated at reset','non-risk estimates keep reset balances');
for(const change of [{sync:'error'},{sync:'cached'},{sync:'loading'},{accountKnown:false},{lastSuccessAt:now-181},{lastSuccessAt:now+1},{plan:'plus'}])
 assert.equal(c.forecastTokenHistory(w,h,{...context,...change}),null);
for(const change of [{durationMins:300},{resetAt:reset+700},{remaining:100},{remaining:0},{remaining:null},{resetAt:now}])assert.equal(c.forecastTokenHistory({...w,...change},h,context),null);
assert.equal(c.forecastTokenHistory(w,{...h,savedAt:now-21601},context),null);
assert.equal(c.forecastTokenHistory(w,{...h,days:h.days.slice(-1)},context),null);
let shifted=structuredClone(h);shifted.days.forEach(d=>{d.models={'gpt-6-astra':d.counts[0]+d.counts[2]};});
assert.equal(c.forecastTokenHistory(w,shifted,context),null,'do not borrow calibration across a different model mix');
shifted=structuredClone(h);shifted.days.forEach(d=>d.counts[1]=0);
assert.equal(c.forecastTokenHistory(w,shifted,context),null,'cache-heavy and uncached use are not equivalent');
shifted=structuredClone(h);shifted.anchors.forEach(a=>{a.segment=Math.floor((a.at-begin)/21600)+1;});
assert.equal(c.forecastTokenHistory(w,shifted,context),null,'refills/reset boundaries are not quota consumption');
shifted=structuredClone(h);shifted.anchors.at(-1).planSince=now-86400;
assert.equal(c.forecastTokenHistory(w,shifted,context),null,'capacity/plan changes invalidate old days');
assert(c.normalizeTokenHistory(h,'account-a',now));
for(const bad of [{...h,accountId:'other'},{...h,version:2},{...h,savedAt:now+61},{...h,days:Array(24).fill(h.days[0])},
 {...h,anchors:[{...h.anchors[0],counts:[1,2,3]}]}, {...h,anchors:[{...h.anchors[0],models:{'bad name':1}}]}])assert.equal(c.normalizeTokenHistory(bad,'account-a',now),null);
for(const verdict of ['risk','tight','safe']){
 const summary=c.quotaForecastSummary(w,{...f,verdict},now),row=c.dashboardForecast(summary);
 assert.equal(row.basis,'');assert.equal(row.status,'unknown');assert.match(row.value,/^\d/);
 c.uiLanguage='zh-CN';for(const v of Object.values(row).filter(v=>typeof v==='string'&&v!=='unknown'))assert(!/[A-Za-z]{2,}/.test(c.uiText(v)),v);
 c.uiLanguage='en';
}
// Integration: strict evidence wins; fallback only fills live Weekly unknowns.
const integration=vm.createContext({Date:{now:()=>now*1000},quotaWindows:[w],forecastHistoryRecords:[],usageSyncState:'ready',
 forecastLastSuccessAt:now,usageAccountId:'account-a',usagePlanType:'prolite',tokenHistorySnapshot:h});
vm.runInContext(['forecast-core','token-forecast-core','forecast'].map(readSource).join('\n'),integration);
assert.equal(integration.currentQuotaForecasts()[0].basis,'tokenHistory');integration.usageSyncState='error';assert.equal(integration.currentQuotaForecasts()[0].basis,undefined);
integration.usageSyncState='ready';integration.forecastQuotaWindow=()=>({basis:'history',status:'safe',budget:'fixture'});
assert.equal(integration.currentQuotaForecasts()[0].basis,'history');

// Single-flight reader, bounded timeout, account races and refill backoff.
let clock=now*1000,account='account-a',launches=0,cancels=0,stops=0,terminations=0;
const reader=vm.createContext({Date:{now:()=>clock},usageAccountId:account,usagePlanType:'prolite',usageSyncState:'ready',
 quotaWindows:[w],tokenHistorySnapshot:null,tokenHistoryReadState:{task:null,timedOut:false},tokenHistoryPollTimer:null,
 tokenHistoryNextReadAt:0,tokenHistoryLastReadAt:0,tokenHistoryPath:'fixture',codexDirectory:'fixture',
 ObjC:{unwrap:x=>x},$:{NSUTF8StringEncoding:4,NSString:{stringWithContentsOfFileEncodingError:()=>JSON.stringify(h)},
  NSProcessInfo:{processInfo:{environment:{objectForKey:()=>null}}}},
 resourcePath:x=>x,readUsageAccountId:()=>account,redrawUsageCardIfNeeded(){},
 launchBackgroundTask:(p,args,s)=>{assert.equal(p,'TokenHistoryReader');assert.equal(args.at(-1),'--cache');launches++;s.task={running:true,terminationStatus:0};s.startedAt=clock;},
 cancelBackgroundTask:s=>{cancels++;s.task=null;s.timedOut=false;},stopTransientTimer:()=>{stops++;return null;},
 startTransientTimer:()=>({}),resetBackgroundTask:s=>{s.task=null;s.timedOut=false;},sendVoid:()=>{terminations++;}});
vm.runInContext(['forecast-core','token-forecast-core','token-history'].map(readSource).join('\n'),reader);
reader.resetTokenHistory();assert(reader.tokenHistorySnapshot);reader.requestTokenHistoryRead();reader.requestTokenHistoryRead();assert.equal(launches,1);
reader.tokenHistoryReadState.task.running=false;reader.pollTokenHistoryRead();assert(reader.tokenHistorySnapshot);reader.requestTokenHistoryRead();assert.equal(launches,1);
reader.quotaWindows=[{...w,resetAt:reset+86400}];reader.requestTokenHistoryRead();assert.equal(launches,1,'refills respect minimum scan interval');
clock+=600001;reader.requestTokenHistoryRead();assert.equal(launches,2);
clock+=30001;reader.pollTokenHistoryRead();reader.pollTokenHistoryRead();assert.equal(terminations,1);
reader.tokenHistoryReadState.task.running=false;reader.pollTokenHistoryRead();assert.equal(reader.tokenHistorySnapshot,null);reader.requestTokenHistoryRead();assert.equal(launches,2);
clock+=600001;reader.requestTokenHistoryRead();assert.equal(launches,3);
account='account-b';reader.usageAccountId=account;reader.tokenHistoryReadState.task.running=false;reader.pollTokenHistoryRead();assert.equal(reader.tokenHistorySnapshot,null);
reader.resetTokenHistory();assert.equal(reader.tokenHistorySnapshot,null);assert(cancels>=2&&stops>=2);
reader.usageAccountId=null;reader.requestTokenHistoryRead();assert.equal(launches,3);

// Test the actual bundled native reader against local numeric fixtures.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-token-test-'));
try{
 const binary=path.join(root,'reader');execFileSync('/usr/bin/xcrun',['clang','-fobjc-arc','-fblocks','-Wall','-Wextra','-Werror','-framework','Foundation','Sources/token-history-reader.m','-o',binary],{cwd:path.join(__dirname,'..')});
 fs.mkdirSync(path.join(root,'sessions'));fs.mkdirSync(path.join(root,'archived_sessions'));
 fs.writeFileSync(path.join(root,'auth.json'),JSON.stringify({auth_mode:'chatgpt',tokens:{account_id:'fixture-account'}}));
 const time=now-2*86400;
 const meta=id=>({type:'session_meta',timestamp:new Date(time*1000).toISOString(),payload:{id,creator_account_id:'fixture-account'}});
 const turn=model=>({type:'turn_context',payload:{turn_id:'turn-one',model}});
 const event=(i,primaryWeekly=false)=>({type:'event_msg',timestamp:new Date((time+i*3600)*1000).toISOString(),payload:{type:'token_count',
  info:{total_token_usage:{input_tokens:(i+1)*100,cached_input_tokens:(i+1)*50,output_tokens:(i+1)*10,reasoning_output_tokens:(i+1)*5},
    last_token_usage:{input_tokens:100,cached_input_tokens:50,output_tokens:10}},
  rate_limits:{limit_id:'codex',plan_type:'prolite',primary:primaryWeekly?{window_minutes:10080,used_percent:i,resets_at:reset}:{window_minutes:300,used_percent:99,resets_at:reset},
    secondary:primaryWeekly?null:{window_minutes:10080,used_percent:i,resets_at:reset}}}});
 const lines=[meta('one'),turn('gpt-6.1-sol'),...Array.from({length:36},(_,i)=>event(i,i%2===0))];
 const write=(folder,name,events)=>fs.writeFileSync(path.join(root,folder,`rollout-${name}.jsonl`),events.map(x=>JSON.stringify(x)).join('\n')+'\n');
 write('sessions','one',lines);write('archived_sessions','fork',[meta('fork'),...lines.slice(1)]);
 write('sessions','foreign',[{...meta('foreign'),payload:{id:'foreign',creator_account_id:'other'}},turn('gpt-6.1-sol'),event(0)]);
 write('sessions','review',[meta('review'),turn('codex-auto-review'),event(0)]);
 const read=cutoff=>JSON.parse(execFileSync(binary,[root,String(cutoff)],{encoding:'utf8'}));
 const result=read(now);assert.equal(result.accountId,'fixture-account');assert.equal(result.anchors.at(-1).used,35,'duration identifies Weekly, not primary position');
 assert.equal(result.days.reduce((s,d)=>s+d.counts[0]+d.counts[2],0),3960,'fork copies and auto-review are excluded; reasoning not double counted');
 assert(!/session|turn-one|foreign|prompt|token[s]?"/.test(JSON.stringify(result)),'output contains only numeric aggregates and model/plan metadata');
 const past=read(time+3600*10);assert.equal(past.anchors.at(-1).used,10,'real reader cutoff excludes future events');
 assert.equal(past.days.reduce((s,d)=>s+d.counts[0]+d.counts[2],0),1210);
 fs.writeFileSync(path.join(root,'auth.json'),'[]');assert.equal(spawnSync(binary,[root]).status,3,'invalid auth fails closed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('Token forecast checks passed: empirical scaling, model/cache/plan/reset/account guards, neutral bilingual UI, strict-priority integration, native deduplication and replay cutoff.');
