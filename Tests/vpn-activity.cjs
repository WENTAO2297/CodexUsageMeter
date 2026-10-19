const assert=require('node:assert/strict'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {readSource}=require('./sources.cjs');
const core=vm.createContext({Date,registerMenuViewSubclass(){}});
vm.runInContext(readSource('vpn-traffic-core')+'\n'+readSource('vpn-activity'),core);
const clean=value=>JSON.parse(JSON.stringify(value));
const now=new Date(2026,10,3,12).getTime(),today=new Date(2026,10,3).getTime()/1000,G=1024**3;
const starts=Array.from({length:7},(_,i)=>new Date(2026,10,3-6+i).getTime()/1000);
const snapshot={accountKey:'a'.repeat(64),credentialRevision:'b'.repeat(64),reportedAt:now,
 todayState:'reported',todayStartAt:today,todayReportedAt:now,todayUsedBytes:3*G};
const history={accountKey:snapshot.accountKey,credentialRevision:snapshot.credentialRevision,state:'ready',fetchedAt:now,
 calendarBasis:'local-midnight',calendarState:'ready',calendarDays:starts.filter((_,i)=>i!==2).map((start,i)=>[start,i?i*G:0]),
 days:[[Math.floor(now/86400000)*86400,99999*G]]};
const model=(s=snapshot,h=history,state='ready',at=now,range=7)=>clean(core.vpnActivityModel(s,h,state,at,range));
const first=model();
assert.equal(first.days.length,7);assert.deepEqual(first.days.map(d=>d.start),starts);
assert.equal(first.days[0].bytes,0,'explicit zero survives');
assert.equal(first.days[2].bytes,null,'a missing report stays missing');
assert.equal(first.days[6].bytes,3*G,'today uses the fresh today source, not the older history response');
assert.equal(first.days[6].today,true);assert.equal(first.days.filter(d=>d.today).length,1);
assert(first.hasData&&!first.stale);assert(first.days.every(d=>d.bytes!==99999*G),'UTC forecast buckets never become chart dates');
assert.equal(model({...snapshot,todayState:'pending'}).days[6].bytes,null,'pending today cannot fall back to a stale history total');
assert.equal(model({...snapshot,todayUsedBytes:0}).days[6].bytes,0);
assert.equal(model({...snapshot,todayStartAt:today-86400}).days[6].bytes,null,'midnight rollover cannot reuse yesterday');
assert.equal(model({...snapshot,todayReportedAt:now+60001}).days[6].bytes,null,'future data is not current use');
for(const state of ['authRequired','credentialChanged','keychainLocked','invalid','signingIn'])
 assert(model(snapshot,history,state).days.every(d=>d.bytes===null),'unvalidated account data must be cleared: '+state);
for(const h of [null,{...history,accountKey:'c'.repeat(64)},{...history,credentialRevision:'c'.repeat(64)},
 {...history,state:'partial'},{...history,calendarState:'legacy'},{...history,calendarBasis:'utc-24h'},
 {...history,fetchedAt:now+60001},{...history,fetchedAt:now-36*86400000},
 {...history,calendarDays:[[starts[0]+3600,1]]},{...history,calendarDays:[[starts[0],-1]]},
 {...history,calendarDays:[[starts[0],1],[starts[0],2]]}])
 assert(model(snapshot,h).days.slice(0,6).every(d=>d.bytes===null),'invalid/mismatched histories cannot fill calendar columns');
assert(model(snapshot,history,'timeout').days.filter(d=>d.bytes!==null).every(d=>d.stale),'transient failures keep real gray last-known values');
assert(model(snapshot,{...history,fetchedAt:now-8*3600000}).days[0].stale,'old history is explicitly marked stale');
assert.equal(model(snapshot,{...history,calendarDays:starts.map(start=>[start,7*G])}).days[0].bytes,7*G,'revisions replace totals rather than add again');
const freshCalendar={...snapshot,calendarBasis:'local-midnight',calendarState:'ready',calendarReportedAt:now,
 calendarDays:starts.map(start=>[start,8*G])};
assert.equal(model(freshCalendar,{...history,fetchedAt:now-3600000}).days[0].bytes,8*G,'reuse the newest ordinary-read daily series without another query');
assert(model({...snapshot,calendarState:'unsupported'}).days[0].stale,'fallback histories are last-known when the latest daily query failed');
const allowance={...freshCalendar,totalBytes:400*G,usedBytes:25*G,remainingBytes:375*G};
const normalized=core.normalizeMaoMaoYunTraffic(allowance,now);
assert.equal(normalized.calendarDays.length,7);assert.equal(normalized.calendarReportedAt,now);
const damaged=core.normalizeMaoMaoYunTraffic({...allowance,calendarDays:[[starts[0],-1]]},now);
assert.equal(damaged.remainingBytes,375*G,'bad daily details never discard the valid remaining balance');
assert.equal(damaged.calendarState,'unsupported');
assert.equal(model(null,history).hasData,false);
const starts30=Array.from({length:30},(_,i)=>new Date(2026,10,3-29+i).getTime()/1000);
const monthlyHistory={...history,calendarDays:starts30.filter((_,i)=>i!==5).map((start,i)=>[start,i*G])};
const monthly=model(snapshot,monthlyHistory,'ready',now,30);
assert.equal(monthly.days.length,30);assert.deepEqual(monthly.days.map(d=>d.start),starts30);
assert.equal(monthly.days[0].bytes,0);assert.equal(monthly.days[5].bytes,null);
assert.equal(monthly.days[29].bytes,3*G,'30-day today keeps the same current daily source');
assert.deepEqual(monthly.days.slice(-7),model(snapshot,monthlyHistory).days,'range changes do not change daily measurement semantics');
assert(model(snapshot,{...monthlyHistory,accountKey:'c'.repeat(64)},'ready',now,30).days.slice(0,-1).every(d=>d.bytes===null));
assert(model(snapshot,monthlyHistory,'authRequired',now,30).days.every(d=>d.bytes===null));
assert.equal(model(snapshot,monthlyHistory,'ready',now,31).days.length,7,'only the two supported ranges are accepted');
assert.equal(core.vpnActivityAmount(null),'—');assert.equal(core.vpnActivityAmount(0),'0G');assert.equal(core.vpnActivityAmount(3*G),'3G');
const wire={...history,identityKind:'session',completeness:'unverified',billingBasis:'website-u+d',bucketBasis:'utc-24h',days:[],rowCount:0};
const parsed=clean(core.normalizeMaoMaoYunHistory(wire,snapshot,now));assert.deepEqual(parsed.calendarDays,history.calendarDays);
for(const extra of [{calendarBasis:'utc-24h'},{calendarState:'partial'},{calendarDays:[[starts[0],-1]]},
 {calendarDays:[[starts[0],1],[starts[0],1]]},{calendarState:'unsupported'}])
 assert.throws(()=>core.normalizeMaoMaoYunHistory({...wire,...extra},snapshot,now));
const legacy={...wire};delete legacy.calendarBasis;delete legacy.calendarDays;delete legacy.calendarState;
const normalizedLegacy=core.normalizeMaoMaoYunHistory(legacy,snapshot,now);assert.equal(normalizedLegacy.calendarState,'legacy');
assert.equal(core.normalizeMaoMaoYunHistory(normalizedLegacy,snapshot,now).calendarState,'legacy','legacy cache markers survive safe round trips');
if(process.argv.includes('--dst')){
 assert(starts.some((start,i)=>i&&start-starts[i-1]===25*3600),'calendar dates survive a 25-hour daylight-saving day');
 console.log('VPN calendar activity DST passed.');
}else{
 const child=spawnSync(process.execPath,[__filename,'--dst'],{encoding:'utf8',env:{...process.env,TZ:'America/New_York'}});
 assert.equal(child.status,0,child.stderr);
 console.log('VPN calendar source passed: 7/30 local dates, DST, missing/zero/partial today, source/identity/timezone guards and revisions.');
}
