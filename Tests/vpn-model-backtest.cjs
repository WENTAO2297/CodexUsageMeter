// Local, retrospective final-value replay, with an explicit 48h report lag.
// Not an as-of revision archive and not proof of real monthly exhaustion.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {readSource}=require('./sources.cjs');
const D=86400,G=1024**3,avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
function context(frozen=false){const c=vm.createContext({});vm.runInContext(readSource('forecast-core'),c);
 if(frozen)vm.runInContext(fs.readFileSync(path.join(__dirname,'fixtures/forecast-v4.js'),'utf8'),c);
 else for(const name of ['adaptive-forecast-core','forecast-learning-core','vpn-forecast-models','vpn-forecast-core'])vm.runInContext(readSource(name),c);
 if(!frozen)vm.runInContext(fs.readFileSync(path.join(__dirname,'fixtures/vpn-model-candidates.js'),'utf8'),c);
 return c;}
const c=context(),v4=context(true),v5=context();
// This historical research entry point keeps its original v6 meaning. New
// Shanghai calendar comparisons live in calendar-backtest.cjs instead.
vm.runInContext(fs.readFileSync(path.join(__dirname,'fixtures/calendar-previous.js'),'utf8'),c);c.AF_VPN_VERSION=6;
vm.runInContext(fs.readFileSync(path.join(__dirname,'fixtures/vpn-v5-models.js'),'utf8'),v5);
v5.AF_VPN_VERSION=5;
function readLocal(){
 const root=path.join(os.homedir(),'Library/Application Support/CodexUsageMeter/Cache');
 const helperIndex=process.argv.indexOf('--helper');
 if(helperIndex>=0){
  const existing=JSON.parse(fs.readFileSync(path.join(root,'vpn-history.json'),'utf8')).history;
  const response=execFileSync(process.argv[helperIndex+1],['--history'],{encoding:'utf8',timeout:35000,maxBuffer:8192});
  const boundary=vm.createContext({});vm.runInContext(readSource('vpn-traffic-core'),boundary);
  const parsed=boundary.parseMaoMaoYunHistoryResult(response,existing,Date.now());
  assert.equal(parsed.state,'ready','The explicit live helper must return current, account-bound numeric history');
  const h=parsed.history,rows=h.days.filter(d=>(d[0]+D)*1000<=h.fetchedAt-2*D*1000)
   .map(d=>({start:d[0],end:d[0]+D,loss:d[1]/G}));
  return {rows,revisedDays:null,source:{kind:'official-history-read',reportedDays:h.days.length,
   returnedBuckets:h.diagnostics.bucketCount,retentionDays:h.retentionDays,
   earliestReturned:new Date(h.sourceStart*1000).toISOString().slice(0,10)}};
 }
 const file=[7,6,5,4].map(v=>path.join(root,'prediction-v'+v+'-vpn.json')).find(f=>fs.existsSync(f));
 const raw=JSON.parse(fs.readFileSync(file,'utf8')),now=Date.now()/1000;
 assert.equal(raw.kind,'vpn');assert([4,5,6,7].includes(raw.version));
 const rows=raw.days.filter(d=>d.at+D<=d.lastSeen-2*D&&d.lastSeen<=now&&d.value>=0)
  .map(d=>({start:d.at,end:d.at+D,loss:d.value/G}));
 return {rows,revisedDays:raw.days.filter(d=>d.revision>0).length,source:{kind:'numeric-journal',version:raw.version}};
}
function origins(rows){
 const map=new Map(rows.map(r=>[r.start,r.loss])),out=[];
 for(const row of rows){
  const training=rows.filter(r=>r.end<=row.start-2*D&&r.start>=row.start-183*D);
  if(training.length<7)continue;
  const latest=training.at(-1).start,recent=training.filter(r=>r.start>=latest-34*D);
  const forecasts=c.afVPNDailyModels(recent,row.start,28);
  for(const length of [7,14,28,56,90,180]){
   const selected=training.filter(r=>r.start>=latest-(length-1)*D),tail=[selected.at(-1)];
   for(let i=selected.length-2;i>=0&&selected[i].end===tail[0].start;i--)tail.unshift(selected[i]);
   const fit=c.afVPNFitSES(tail.map(r=>r.loss));
   if(fit)forecasts['ses'+length]=Array(28).fill(fit.level);
  }
  const full=c.afVPNDailyModels(training,row.start,28);
  if(full.historical)forecasts.historicalAll=full.historical;
  if(full.etsHistorical)forecasts.etsHistoricalAll=full.etsHistorical;
  const s=v4.afNew('vpn','research',row.start);
  s.days=training.map(r=>({at:r.start,value:r.loss,firstSeen:row.start,changedAt:row.start,lastSeen:row.start,revision:0}));
  s.last={at:row.start,used:0,total:100000,remaining:100000,resetAt:0,resetDays:28};
  const current={},current5={},current6={};
  const s5=c.afNew('vpn','research',row.start);s5.days=JSON.parse(JSON.stringify(s.days));s5.last={...s.last};
  for(const h of [1,3,7,14,28]){
   const f=v4.afDistribution(s,v4.afTrafficModels(s,row.start,h),h,100000,row.start);
   if(f)current[h]=f.typicalConsumption;
   const f5=v5.afDistribution(s5,v5.afTrafficModels(s5,row.start,h),h,100000,row.start);
   if(f5)current5[h]=f5.typicalConsumption;
   const built=c.afTrafficModels(s5,row.start,h),f6=c.afDistribution(s5,built,h,100000,row.start);
   if(f6)current6[h]=f6.typicalConsumption;
   if(h===28&&f6){const model=Object.values(built.models)[0];
    forecasts.v6=Array.from({length:28},(_,j)=>c.afVPNFutureRate(model,j));}
  }
  if(forecasts.v6)for(const h of [1,3,7,14,28])assert(Math.abs(forecasts.v6.slice(0,h).reduce((a,b)=>a+b,0)-current6[h])<1e-7,
   'point totals and reported depletion paths must match at every horizon');
  const tail=[training.at(-1)];for(let i=training.length-2;i>=0&&training[i].end===tail[0].start;i--)tail.unshift(training[i]);
  const truth={};for(const h of [1,3,7,14,28]){const future=Array.from({length:h},(_,j)=>map.get(row.start+j*D));
   if(future.every(Number.isFinite))truth[h]=future;}
  out.push({at:row.start,forecasts,current,current5,current6,truth,tail:tail.map(r=>r.loss),lag:(row.start-training.at(-1).start)/D});
 }
 return out;
}
function addReference(items,python){
 const eligible=items.filter(r=>r.tail.length>=7);
 const requests=eligible.map(r=>({values:r.tail,steps:r.lag+28}));
 const raw=execFileSync(python,[path.join(__dirname,'vpn-forecast-reference.py')],
  {input:JSON.stringify(requests),encoding:'utf8',timeout:120000,maxBuffer:8*1024**2});
 const result=JSON.parse(raw);assert.equal(result.predictions.length,eligible.length);
 eligible.forEach((r,i)=>{for(const [name,values] of Object.entries(result.predictions[i]))r.forecasts[name]=values.slice(r.lag-1,r.lag-1+28);
  if(r.forecasts.sfSES)r.forecasts.sfSESMean7=r.forecasts.sfSES.map((v,j)=>(v+r.forecasts.mean7[j])/2);
  if(r.forecasts.sfAutoETS)r.forecasts.sfAutoMean7=r.forecasts.sfAutoETS.map((v,j)=>(v+r.forecasts.mean7[j])/2);
 });return {library:result.library,version:result.version,unavailable:result.unavailable};
}
function crossing(values,balance){let used=0;for(let j=0;j<values.length;j++){
 if(used+values[j]>=balance)return j+(values[j]>0?(balance-used)/values[j]:0);used+=values[j];}return null;}
function score(items,name,h,filter=()=>true){
 const values=[];let falseAlarm=0,missed=0,decisions=0,etaError=0,etaN=0,last=-Infinity,independent=0;
 for(const row of items){
  if(!filter(row)||!row.truth[h])continue;
  const point=name==='v4'?row.current[h]:name==='v5'?row.current5[h]:name==='v6'?row.current6[h]:row.forecasts[name]?.slice(0,h).reduce((s,v)=>s+v,0);
  if(!Number.isFinite(point))continue;
  const actual=row.truth[h].reduce((s,v)=>s+v,0),baseline=row.forecasts.mean7?row.forecasts.mean7[0]*h:null;
  values.push({error:Math.abs(point-actual),bias:point-actual,scaled:baseline===null?null:Math.abs(point-actual)/Math.max(baseline,1)});
  if(row.at>=last){independent++;last=row.at+h*D;}
  if(baseline===null)continue; // Missing recent reports cannot invent a budget baseline.
  for(const factor of [.75,1,1.25]){const balance=Math.max(1,baseline*factor),event=actual>=balance,flag=point>=balance;
   decisions++;if(flag&&!event)falseAlarm++;if(!flag&&event)missed++;
   if(name!=='v4'&&name!=='v5'&&event&&flag){const real=crossing(row.truth[h],balance),pred=crossing(row.forecasts[name].slice(0,h),balance);
    if(real!==null&&pred!==null){etaError+=Math.abs(pred-real);etaN++;}}
  }
 }
 const round=v=>v===null?null:+v.toFixed(4);
 return {origins:values.length,nonoverlappingTargets:independent,maeGiB:round(avg(values.map(v=>v.error))),
  biasGiB:round(avg(values.map(v=>v.bias))),scaledMAE:round(avg(values.map(v=>v.scaled).filter(Number.isFinite))),
  hypotheticalBudgets:{decisions,falseAlarm,missedDepletion:missed,dailyCrossingMAEDays:etaN?round(etaError/etaN):null}};
}
function report(rows,items,reference){
 const names=[...new Set(['v4','v5','v6',...items.flatMap(r=>Object.keys(r.forecasts))])];
 const split=rows[0].start+Math.floor(rows.length*2/3)*D;
 const horizons={};for(const h of [1,3,7,14,28]){
  horizons[h]=Object.fromEntries(names.map(name=>[name,{all:score(items,name,h),
   development:score(items,name,h,r=>r.at+h*D<=split),holdout:score(items,name,h,r=>r.at>=split)}]));
 }
 return {mode:'retrospective-final-values-48h-lag',settledReportedDays:rows.length,
  range:[rows[0].start,rows.at(-1).start].map(t=>new Date(t*1000).toISOString().slice(0,10)),
  holdoutStart:new Date(split*1000).toISOString().slice(0,10),reference,horizons,
  limitations:['Historical revisions at old origins are unavailable; the 48h lag is an assumption, not an as-of archive.',
   'Overlapping origins are not independent. Compare each model on matching available dates.',
   'Budgets are hypothetical, not observed real account exhaustion; crossing is interpolated within reported days.',
   'Small history cannot establish 28-day or full-reset accuracy. No raw days, account IDs or credentials are saved.']};
}
if(require.main===module){
 assert(process.argv.includes('--local'),'Explicit --local required to read private numeric caches');
 const {rows,revisedDays,source}=readLocal(),items=origins(rows),index=process.argv.indexOf('--reference-python');
 const reference=index>=0?addReference(items,process.argv[index+1]):null;
 const result={...report(rows,items,reference),revisedDays,source,
  selectionRule:'Paired v5/v6 at identical origins, 48h reporting lag. Inspect all horizons, recent temporal diagnostics, hypothetical risk tradeoffs and nonoverlapping counts. v6 uses deduplicated 7/14/35 SES views with short deviations decaying toward the longest level; no fitted ensemble weights. Previously inspected history is not a new blind holdout.'};
 if(process.argv.includes('--compact')){
  result.horizons=Object.fromEntries(Object.entries(result.horizons).map(([h,group])=>[h,
   Object.entries(group).filter(([,v])=>v.all.origins).map(([name,v])=>({name,n:v.all.origins,nonoverlapping:v.all.nonoverlappingTargets,mae:v.all.maeGiB,bias:v.all.biasGiB,
    developmentN:v.development.origins,developmentMAE:v.development.maeGiB,holdoutN:v.holdout.origins,holdoutIndependent:v.holdout.nonoverlappingTargets,holdoutMAE:v.holdout.maeGiB,
    pairedV4MAE:score(items,'v4',Number(h),r=>name==='v4'||name==='v5'?Number.isFinite(r.current5[h]):!!r.forecasts[name]).maeGiB,
    pairedV5N:score(items,name,Number(h),r=>Number.isFinite(r.current5[h])).origins,
    pairedMAE:score(items,name,Number(h),r=>Number.isFinite(r.current5[h])).maeGiB,
    pairedV5MAE:score(items,'v5',Number(h),r=>name==='v4'?Number.isFinite(r.current[h]):name==='v5'||!!r.forecasts[name]).maeGiB,
    falseAlarm:v.all.hypotheticalBudgets.falseAlarm,missed:v.all.hypotheticalBudgets.missedDepletion}))]));
 }
 console.log(JSON.stringify(result,null,2));
}
module.exports={context,origins,score,crossing,report};
