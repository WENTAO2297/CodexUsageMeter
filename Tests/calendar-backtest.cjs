// Opt-in numeric-cache replay. Final daily reports are not as-of truth.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {readSource}=require('./sources.cjs');
const D=86400,G=1024**3;
function context(previous=false,neutral=false){const c=vm.createContext({});
 for(const n of ['forecast-core','adaptive-forecast-core','forecast-learning-core','vpn-forecast-models','vpn-forecast-core'])vm.runInContext(readSource(n),c);
 if(previous){vm.runInContext(fs.readFileSync(path.join(__dirname,'fixtures/calendar-previous.js'),'utf8'),c);c.AF_VERSION=4;c.AF_VPN_VERSION=6;}
 if(neutral)c.afDayTypeFit=()=>null;return c;}
const modern=context(),previous=context(true),neutral=context(false,true);
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const rounded=x=>x===null?null:+x.toFixed(5);
function scores(rows,key){let edge=0;return {origins:rows.length,nonoverlapping:rows.filter(r=>{if(r.start>=edge){edge=r.end;return true;}return false;}).length,
 mae:rounded(mean(rows.map(r=>Math.abs(r[key]-r.actual)))),bias:rounded(mean(rows.map(r=>r[key]-r.actual))),
 falseAlarm:rows.filter(r=>r[key]>=r.budget&&r.actual<r.budget).length,missed:rows.filter(r=>r[key]<r.budget&&r.actual>=r.budget).length};}
function state(c,training,legacy,now){const s=c.afNew('vpn','backtest',now);
 const entry=r=>({at:r.start,value:r.loss,firstSeen:now,changedAt:now,lastSeen:now,revision:0});
 s.days=legacy.map(entry);s.calendarDays=training.map(entry);
 s.last={at:now,used:0,total:100000,remaining:100000,resetAt:0,resetDays:28};return s;}
function vpnReplay(local,legacy,horizons=[1,3,7,14,28]){const out={};
 for(const h of horizons){const results=[];
  for(const target of local){const now=target.start,train=local.filter(r=>r.end<=now-2*D),old=legacy.filter(r=>r.end<=now-2*D);
   const future=Array.from({length:h},(_,i)=>local.find(r=>r.start===now+i*D));
   if(train.length<7||future.some(r=>!r))continue;
   const values={};for(const [name,c]of [['previous',previous],['calendarOff',neutral],['calendar',modern]]){
    const built=c.afTrafficModels(state(c,train,old,now),now,h),m=Object.values(built.models)[0];values[name]=m?m.center:null;
    if(m&&name==='calendar')assert(Math.abs(c.afVPNSample(m,built,h,999999,now,()=>.5,true).loss-m.center)<1e-7,
     'calendar point total must equal its dated future path');
   }
   if(Object.values(values).some(v=>v===null))continue;
   const last=old.at(-1).start,recent=old.filter(r=>r.start>=last-6*D),budget=mean(recent.map(r=>r.loss))*h;
   results.push({start:now,end:now+h*D,actual:future.reduce((s,r)=>s+r.loss,0),budget,...values});
  }
  out[h]=Object.fromEntries(['previous','calendarOff','calendar'].map(k=>[k,scores(results,k)]));
 }return out;
}
function quotaReplay(full,now){const targets=modern.afQuotaIntervals(full,now),results=[];let active=0;
 for(const t of targets){const s=JSON.parse(JSON.stringify(full));s.forecasts=[];s.anchors=s.anchors.filter(a=>a.at<=t.start);
  const values={};for(const [name,c]of [['previous',previous],['calendar',modern]]){
   const built=c.afQuotaModels(s,t.start,(t.end-t.start)/D,null,null),f=c.afDistribution(s,built,(t.end-t.start)/D,1000,t.start);
   values[name]=f?f.typicalConsumption:null;if(name==='calendar'&&Object.values(built.models).some(m=>m.dayType))active++;
  }
  if(Object.values(values).some(v=>v===null))continue;
  results.push({start:t.start,end:t.end,actual:t.loss,budget:25*(t.end-t.start)/D,...values});
 }
 return {unit:'percentage-points per measured target interval (12–36h)',calendarActiveOrigins:active,
  previous:scores(results,'previous'),calendar:scores(results,'calendar')};
}
function synthetic(){const suites={};
 for(const [name,weekendRatio]of [['weekendLow',.4],['weekendHigh',1.8],['noCalendar',1]]){
  const combined={};for(const h of [1,3,7,28])combined[h]={previous:[],calendar:[]};
  for(const initial of [90763319,112004917,133027441]){
   let seed=initial;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
   const start=Date.parse('2026-01-05T00:00:00+08:00')/1000;
   const rows=Array.from({length:112},(_,i)=>{const at=start+i*D,w=[0,6].includes(new Date((at+28800)*1000).getUTCDay());
    return {start:at,end:at+D,loss:10*(w?weekendRatio:1)*(1+(random()-.5)*.2)};});
   const report=vpnReplay(rows,rows,[1,3,7,28]);
   for(const h of [1,3,7,28])for(const n of ['previous','calendar'])combined[h][n].push(report[h][n].mae);
  }
  for(const h of [1,3,7,28])combined[h]=Object.fromEntries(['previous','calendar'].map(n=>[n,rounded(mean(combined[h][n]))]));
  suites[name]=combined;
 }
 return {unit:'synthetic traffic units',mae:suites,limitations:'Constructed stable/noisy day-type tests, not observed account accuracy or monthly safety.'};
}
if(require.main===module){
 if(process.argv.includes('--synthetic'))console.log(JSON.stringify(synthetic(),null,2));
 else{assert(process.argv.includes('--local'),'--local is required before reading private numeric history');
  const root=path.join(os.homedir(),'Library/Application Support/CodexUsageMeter/Cache');
  const h=JSON.parse(fs.readFileSync(path.join(root,'vpn-history.json'),'utf8')).history;
  assert.equal(h.calendarState,'ready');assert.equal(h.calendarBasis,'local-midnight');
  const local=h.calendarDays.filter(d=>(d[0]+D)*1000<=h.fetchedAt-2*D*1000).map(d=>({start:d[0],end:d[0]+D,loss:d[1]/G}));
  const journal=[7,6,5,4].map(v=>path.join(root,'prediction-v'+v+'-vpn.json')).find(f=>fs.existsSync(f));
  const raw=JSON.parse(fs.readFileSync(journal,'utf8')),now=Date.now()/1000;
  const legacy=raw.days.filter(d=>d.at+D<=d.lastSeen-2*D&&d.lastSeen<=now).map(d=>({start:d.at,end:d.at+D,loss:d.value/G}));
  const qfile=[5,4].map(v=>path.join(root,'prediction-v'+v+'-quota.json')).find(f=>fs.existsSync(f));
  const quota=JSON.parse(fs.readFileSync(qfile,'utf8')),date=t=>new Date((t+28800)*1000).toISOString().slice(0,10);
  console.log(JSON.stringify({mode:'retrospective-final-values-48h-lag',zone:'Asia/Shanghai',vpn:{unit:'GiB',
   localMatureDates:local.length,localRange:[date(local[0].start),date(local.at(-1).start)],paired:vpnReplay(local,legacy)},quota:quotaReplay(quota,now),
   limitations:['Only source-validated Shanghai midnights are used for calendar fitting and daily targets.',
    'Older UTC archives are used only by the frozen previous baseline; they are not relabeled.',
    'Final reported values with assumed 48h latency, not historical availability/revision snapshots.',
    'Previously inspected history is not a blind test; overlapping origins and few weekends limit conclusions.',
    'Quota targets use real interval loss only; derived 28-day estimates are not backtest truth.',
    'Risk counts use hypothetical budgets, not observed account depletion. No personal records are exported.']},null,2));
 }
}
module.exports={vpnReplay,quotaReplay,synthetic};
