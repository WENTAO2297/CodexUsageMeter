const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {readSource}=require('./sources.cjs');
function context(){const c=vm.createContext({});for(const n of ['forecast-core','adaptive-forecast-core',
 'quota-reconstruction-core','forecast-learning-core','vpn-forecast-models','vpn-forecast-core'])vm.runInContext(readSource(n),c);return c;}
const c=context(),D=86400,G=1024**3,clean=x=>JSON.parse(JSON.stringify(x));
const at=date=>Date.parse(date+'T00:00:00+08:00')/1000;
const start=at('2026-08-03'),now=start+56*D;
const weekend=t=>[0,6].includes(new Date((t+28800)*1000).getUTCDay());
const rows=Array.from({length:56},(_,i)=>({start:start+i*D,end:start+(i+1)*D,loss:weekend(start+i*D)?4:10}));
const profile=c.afDayTypeFit(rows,now);
assert(profile&&profile.zone==='Asia/Shanghai');assert(profile.ratio<1&&profile.ratio>.4,'learn, then shrink, not a hard-coded weekend discount');
assert(Math.abs(5*profile.workday+2*profile.weekend-7)<1e-10,'the calendar redistributes a typical week, not its total');
const opposite=c.afDayTypeFit(rows.map(r=>({...r,loss:weekend(r.start)?20:10})),now);
assert(opposite.ratio>1,'the user preference cannot force the observed weekend direction');
assert.equal(c.afDayTypeFit(rows.slice(0,7),start+7*D),null,'one week is not a recurring pattern');
const flat=c.afDayTypeFit(rows.map(r=>({...r,loss:10})),now);assert.equal(flat.ratio,1);
assert.equal(c.afDayTypeFit(rows.map(r=>({...r,loss:0})),now),null,'all-zero use cannot identify a relative ratio');
const weak=c.afDayTypeFit(rows.map(r=>({...r,weight:.25})),now);
assert(weak.ratio>profile.ratio,'derived dates learn a weaker calendar effect than independent measured exposure');
const future=[...rows,{start:now,end:now+D,loss:999999}];
assert.deepEqual(clean(c.afDayTypeFit(future,now)),clean(profile),'today/future totals cannot enter old fits');
const burst=rows.map(r=>({...r}));burst[48].loss=1000;
assert(c.afDayTypeFit(burst,now).ratio<1,'an exceptional week cannot reverse all other learned weekends');
const boundary=c.afShanghaiCalendar(at('2026-10-16')+23.5*3600,2/24);
assert.deepEqual(clean(boundary.map(s=>[s.duration,s.weekend])),[[.5/24,false],[1.5/24,true]],'Friday/Saturday switches at Shanghai midnight');
const friday=at('2026-10-16'),saturday=at('2026-10-17');
assert.equal(c.qhDate(friday+23.5*3600),'2026-10-16');
assert.equal(c.qhDate(friday+24.5*3600),'2026-10-17');
assert.deepEqual(clean(c.qhBounds('2026-10-17')),[saturday,saturday+D]);
assert(c.afCalendarExposure(friday,friday+D,profile)>c.afCalendarExposure(saturday,saturday+D,profile));
assert(Math.abs(c.afCalendarExposure(friday,friday+7*D,profile)-7)<1e-9);
const dated={rate:10,components:[{days:7,level:10}],shanghai:true,dayType:profile};
assert(Math.abs(c.afVPNModelTotal(dated,friday,28)-280)<1e-8,'weekday redistribution cannot invent a lower monthly mean');

// True interval totals can span both day types. Do not invent an official
// split or treat one interval as two independent observations.
const mixed=[];
for(let w=0;w<6;w++){
 const mon=start+w*7*D,level=1+w*.2;
 for(const [a,b]of [[.25,1.25],[2.25,3.25],[4.5,5.5],[5.5,6.25]]){
  const from=mon+a*D,to=mon+b*D,loss=c.afShanghaiCalendar(from,b-a).reduce((s,d)=>s+d.duration*(d.weekend?4:10)*level,0);
  mixed.push({start:from,end:to,loss});
 }
}
const mf=c.afDayTypeFit(mixed,now);assert(mf&&mf.ratio<1,'week intercepts separate rising overall use from weekday differences');
const firstHalf=c.afDayTypeFit(mixed.slice(0,12),start+21*D);
assert(firstHalf&&firstHalf.weeks===3);

let vpn=c.afNew('vpn','fixture',now);
const history={state:'ready',fetchedAt:now*1000,calendarBasis:'local-midnight',calendarState:'ready',
 days:rows.map(r=>[Math.floor(r.start/D)*D,r.loss*G]),calendarDays:rows.map(r=>[r.start,r.loss*G])};
c.afTrafficMerge(vpn,history,now);assert.equal(vpn.calendarDays.length,56);
vpn.last={at:now,used:100*G,total:1000*G,remaining:900*G,resetAt:0,resetDays:28};
const before=JSON.stringify(vpn),built=c.afTrafficModels(vpn,now,28),model=built.models.multiSES;
assert(model.shanghai&&model.dayType&&model.dayType.ratio<1);
assert(built.rows.every(r=>(r.start+28800)%D===0));
const sample=c.afVPNSample(model,built,28,30*G,now,()=>.5,true);
assert(Math.abs(sample.loss-model.center)<1e-4,'calendar total equals the depletion path total');
const short=c.afVPNSample(model,built,5,30*G,now,()=>.5,true);
assert(Math.abs(short.crossing-sample.crossing)<1e-9,'short and long targets share their early path');
assert.equal(JSON.stringify(vpn),before,'forecasting cannot rewrite true history');
assert(c.afNormalize(clean(vpn),'vpn','fixture',now));
const wrong=clean(vpn);wrong.calendarDays[0].at-=28800;
assert.equal(c.afNormalize(wrong,'vpn','fixture',now),null,'a UTC bucket cannot claim to be a Shanghai daily start');
const unsupported=c.afNew('vpn','fixture',now);
c.afTrafficMerge(unsupported,{...history,calendarDays:history.days},now);
assert.equal(unsupported.calendarDays.length,0,'unknown calendar mapping must retain only the legacy, nonseasonal history');
const old=clean(vpn);old.version=6;delete old.calendarDays;old.alert={value:'risk',at:now,count:0};
const migrated=c.afNormalize(old,'vpn','fixture',now);assert(migrated&&migrated.version===7);
assert.equal(migrated.calendarDays.length,0);assert.equal(migrated.alert,null);
assert.equal(migrated.days.length,56,'migration keeps old facts without manufacturing local dates');
const revised=clean(history);revised.fetchedAt=(now+3600)*1000;revised.calendarDays[0][1]+=G;
c.afTrafficMerge(vpn,revised,now+3600);assert.equal(vpn.calendarDays[0].revision,1);
const missing=clean(revised);missing.fetchedAt=(now+7200)*1000;missing.calendarDays.splice(8,1);
c.afTrafficMerge(vpn,missing,now+7200);assert.equal(vpn.calendarDays.length,55,'missing returned dates do not become zeros or stale reports');

// Calendar-corrected measured models are different at equal horizons starting
// on different day types, but reconstruction retains its existing 20% cap.
const quota=c.afNew('quota','fixture',now);quota.plan='pro';quota.planSince=start;
for(let w=0;w<7;w++)for(let d=0;d<=7;d++){
 const t=start+(w*7+d)*D;
 if(d===0)quota.anchors.push({at:t,remaining:100,resetAt:t+7*D,plan:'pro',boundary:true});
 else quota.anchors.push({at:t,remaining:100-Array.from({length:d},(_,i)=>weekend(start+(w*7+i)*D)?2:5).reduce((a,b)=>a+b,0),
  resetAt:start+(w*7+7)*D,plan:'pro',boundary:false});
}
quota.anchors.sort((a,b)=>a.at-b.at||Number(a.boundary)-Number(b.boundary));
const qb=c.afQuotaModels(quota,now,1,null,null);assert(qb.models.pooled.dayType.ratio<1);
const models={...qb.models,reconstructed:{center:1}};
assert(c.afWeights(quota,models,1,now).weights.reconstructed<=.2+1e-9);
const legacyQuota=clean(c.afNew('quota','fixture',now));legacyQuota.version=4;legacyQuota.alert={value:'risk',count:0,at:now};
const qUpgrade=c.afNormalize(legacyQuota,'quota','fixture',now);
assert(qUpgrade&&qUpgrade.version===5&&qUpgrade.alert===null);
assert.equal(c.afNormalize({...legacyQuota,version:6},'quota','fixture',now),null);
quota.forecasts=[{modelVersion:4,state:'scored',at:now-D,sourceAt:now-D,issuedAt:now-D,target:now,
 resolvedAt:now,actualLower:1,actualUpper:1,candidates:{pooled:1}}];
assert.equal(c.afWeights(quota,{pooled:{center:1}},1,now).independent,0,'old model scores cannot validate the new calendar model');
console.log('Shanghai calendar passed: robust week-level effects, exposure-based shrinkage, both learned directions, UTC migration, exact midnight boundaries, revisions, date gaps, coherent VPN path/ETA and independent quota versions.');
module.exports={context};
