// Offline design experiment, deliberately absent from Sources/modules.list.
// --live reads sanitized caches and replays the existing bounded reader.
// Only aggregate scores leave memory; no account/credential/rollout data saved.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const DAY=86400, GiB=1024**3;
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const round=x=>x===null?null:Math.round(x*1000)/1000;
function weighted(rows,halfLife,now){
 let loss=0,exposure=0;
 for(const r of rows){const w=halfLife===Infinity?1:2**(-(now-(r.start+r.end)/2)/DAY/halfLife);
  loss+=r.loss*w;exposure+=(r.end-r.start)/DAY*w;}
 return exposure>0?loss/exposure:null;
}
function quantile(a,p){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),k=(s.length-1)*p;
 return s[Math.floor(k)]+(s[Math.ceil(k)]-s[Math.floor(k)])*(k-Math.floor(k));}

function quotaIntervals(anchors,cutoff){
 const past=anchors.filter(a=>a.at<=cutoff),latest=past.at(-1);
 if(!latest)return [];
 const out=[];let start=null;
 for(const a of past){
  if(a.plan!==latest.plan||a.at<latest.planSince){start=null;continue;}
  if(!start||a.segment!==start.segment||Math.abs(a.resetAt-start.resetAt)>600||a.used<start.used-.05){start=a;continue;}
  const span=a.at-start.at;
  if(span<12*3600)continue;
  // A full/depleted quota censors demand. Do not learn its plateau as idle.
  if(span<=36*3600&&a.used<99.5&&start.used<99.5)
   out.push({start:start.at,end:a.at,loss:Math.max(0,a.used-start.used)});
  start=a;
 }
 return out;
}
function intervalCandidates(intervals,now){
 const rows=intervals.filter(r=>r.end<=now&&r.end>=now-21*DAY);
 if(rows.length<2)return {};
 const pooled=weighted(rows,Infinity,now),fast=weighted(rows,3,now),slow=weighted(rows,14,now);
 return {pooled,ewma3:fast,ewma7:weighted(rows,7,now),blend:(fast+slow)/2,
  median:quantile(rows.map(r=>r.loss*DAY/(r.end-r.start)),.5)};
}
function dailyCandidates(days,cutoff,horizon){
 // Same 48h availability lag for every candidate and the current algorithm.
 const rows=days.filter(d=>d.at+DAY<=cutoff-2*DAY&&d.at>=cutoff-35*DAY);
 if(rows.length<3)return {};
 const ir=rows.map(d=>({start:d.at,end:d.at+DAY,loss:d.value}));
 const last=rows.at(-1).at;
 const mean=n=>avg(rows.filter(d=>d.at>=last-(n-1)*DAY).map(d=>d.value));
 const fast=weighted(ir,3,cutoff),slow=weighted(ir,14,cutoff);
 const out={mean7:mean(7)*horizon,mean28:mean(28)*horizon,
  ewma3:fast*horizon,ewma7:weighted(ir,7,cutoff)*horizon,blend:(fast+slow)/2*horizon};
 const map=new Map(rows.map(d=>[d.at,d.value])),blocks=[];
 for(const d of rows){let sum=0,valid=true;for(let j=0;j<horizon;j++){
  const v=map.get(d.at+j*DAY);if(v===undefined){valid=false;break;}sum+=v;}
  if(valid)blocks.push(sum);}
 if(blocks.length>=3){out.oldP50=quantile(blocks,.5);out.oldP90=quantile(blocks,.9);}
 // Seasonality shrinks toward the pooled level; fewer than 3 examples abstain.
 let seasonal=0;
 for(let j=0;j<horizon;j++){
  const target=(Math.floor(cutoff/DAY)+j)%7;
  const same=rows.filter(d=>Math.floor(d.at/DAY)%7===target);
  const n=same.length,b=n>=3?n/(n+4):0;
  seasonal+=(1-b)*(fast+slow)/2+b*avg(same.map(d=>d.value));
 }
 out.weekdayShrink=seasonal;
 // Separate a repeated level change from one exceptional reported day.
 // Exact constants are research settings, not calibrated production rules.
 const recent=rows.filter(d=>d.at>=last-2*DAY),older=rows.filter(d=>d.at<last-2*DAY).slice(-14);
 let levelChanged=false,level=null;
 if(recent.length===3&&recent[2].at-recent[0].at===2*DAY&&older.length>=7){
  const center=quantile(older.map(d=>d.value),.5);
  const mad=quantile(older.map(d=>Math.abs(d.value-center)),.5);
  const limit=Math.max(2.5*mad,center*.35,1e-6);
  levelChanged=recent.every(d=>d.value>center+limit)||recent.every(d=>d.value<center-limit);
  if(levelChanged)level=quantile(recent.map(d=>d.value),.5);
 }
 if(levelChanged)out.regime=level*horizon;
 else {
  // A whole-week forecast respects complete weekly cycles; same-weekday
  // effects are fitted only after enough repetitions, with shrinkage.
  const base=(mean(7)+mean(28))/2;let total=0;
  for(let j=0;j<horizon;j++){
   const same=rows.filter(d=>Math.floor(d.at/DAY)%7===(Math.floor(cutoff/DAY)+j)%7);
   const n=same.length,b=n>=3?n/(n+4):0;
   total+=(1-b)*base+b*quantile(same.map(d=>d.value),.5);
  }
  out.regime=total;
 }
 return out;
}
function stats(rows,names,commonNames=[]){
 const common=rows.filter(r=>commonNames.every(n=>Number.isFinite(r.predictions[n])));
 const score=set=>Object.fromEntries(names.map(name=>{
  const usable=set.filter(r=>Number.isFinite(r.predictions[name]));
  const risk={trueDepletion:0,trueReserve:0,falseAlarm:0,missedDepletion:0};
  for(const r of usable)for(const budget of r.budgets||[]){
   const observed=r.actual>=budget,predicted=r.predictions[name]>=budget;
   risk[observed?(predicted?'trueDepletion':'missedDepletion'):(predicted?'falseAlarm':'trueReserve')]++;
  }
  return [name,{evaluated:usable.length,availableOf:set.length,
   mae:round(avg(usable.map(r=>Math.abs(r.predictions[name]-r.actual)))),
   bias:round(avg(usable.map(r=>r.predictions[name]-r.actual))),
   ...(usable.some(r=>r.budgets)?{hypotheticalBudgetClassification:risk}:{})}];}));
 return {all:score(rows),commonCount:common.length,common:score(common)};
}
// Adapt only from forecasts whose outcomes were already resolved at cutoff.
// Small samples retain the equal blend. No tuning on the evaluation outcome.
function adaptive(rows,cutoff,fast,slow){
 const past=rows.filter(r=>r.end<=cutoff&&Number.isFinite(r.fast)&&Number.isFinite(r.slow));
 if(past.length<8)return (fast+slow)/2;
 const ef=avg(past.slice(-28).map(r=>Math.abs(r.fast-r.actual)));
 const es=avg(past.slice(-28).map(r=>Math.abs(r.slow-r.actual)));
 const learned=(es+1e-6)/(ef+es+2e-6),shrink=past.length/(past.length+20);
 const w=Math.min(.75,Math.max(.25,.5+shrink*(learned-.5)));
 return w*fast+(1-w)*slow;
}
function expertForecast(rows,cutoff,horizon,predictions){
 const names=['oldP50','mean7','ewma7','weekdayShrink'].filter(k=>Number.isFinite(predictions[k]));
 const resolved=rows.filter(r=>r.end<=cutoff&&names.every(k=>Number.isFinite(r.predictions[k]))).slice(-56);
 // Overlapping 28-day targets are not 28 independent experiments.
 let last=-Infinity,independent=0;
 for(const r of resolved){if(r.cutoff>=last){independent++;last=r.end;}}
 const error=Object.fromEntries(names.map(k=>[k,avg(resolved.map(r=>Math.abs(r.predictions[k]-r.actual)))]));
 const scale=quantile(Object.values(error).filter(Number.isFinite),.5)||1;
 const shrink=independent<4?0:Math.min(.8,independent/(independent+8));
 const raw=names.map(k=>1/(.2*scale+(error[k]??scale))),sum=raw.reduce((a,b)=>a+b,0);
 return names.reduce((s,k,i)=>s+predictions[k]*((1-shrink)/names.length+shrink*raw[i]/sum),0);
}
function dailyReplay(days,horizon){
 const rows=[],map=new Map(days.map(d=>[d.at,d.value]));
 for(const d of days){
  const cutoff=d.at;let actual=0,complete=true;
  for(let j=0;j<horizon;j++){
   const v=map.get(cutoff+j*DAY);if(v===undefined){complete=false;break;}actual+=v;}
  if(!complete)continue;
  const predictions=dailyCandidates(days,cutoff,horizon);
  if(!Object.keys(predictions).length)continue;
  const baseRows=days.filter(p=>p.at+DAY<=cutoff-2*DAY&&p.at>=cutoff-35*DAY)
   .map(p=>({start:p.at,end:p.at+DAY,loss:p.value}));
  const slow=weighted(baseRows,14,cutoff)*horizon;
  predictions.adaptive=adaptive(rows,cutoff,predictions.ewma3,slow);
  predictions.experts=expertForecast(rows,cutoff,horizon,predictions);
  rows.push({cutoff,end:cutoff+horizon*DAY,actual,predictions,fast:predictions.ewma3,slow});
 }
 return rows;
}
const VPN_NAMES=['oldP50','oldP90','mean7','mean28','ewma3','ewma7','blend','weekdayShrink','adaptive','experts','regime'];
function liveVPN(){
 const file=path.join(os.homedir(),'Library/Application Support/CodexUsageMeter/Cache/vpn-history.json');
 const h=JSON.parse(fs.readFileSync(file,'utf8')).history;
 if(h.state!=='ready'||h.completeness!=='unverified')throw Error('Expected validated ready reported history');
 const days=h.days.map(d=>({at:d[0],value:d[1]/GiB}));
 return {reportedDays:days.length,mode:'Retrospective final reported values with 48h availability lag; revisions at past cutoffs unknown',
  horizons:Object.fromEntries([1,3,7,28].map(n=>{const rows=dailyReplay(days,n);
   let last=-Infinity,disjoint=0;for(const r of rows){if(r.cutoff>=last){last=r.end;disjoint++;}}
   return [n,{origins:rows.length,disjointTargets:disjoint,
    ...stats(rows,VPN_NAMES,['oldP90','blend'])}];}))};
}
function liveQuota(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'meter-forecast-design-'));
 try{
  const binary=path.join(tmp,'reader');
  execFileSync('/usr/bin/xcrun',['clang','-fobjc-arc','-fblocks','-O2','-framework','Foundation','Sources/token-history-reader.m','-o',binary]);
  const root=process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),now=Date.now()/1000;
  const read=t=>JSON.parse(execFileSync(binary,[root,String(t)],{encoding:'utf8',timeout:35000}));
  const c=vm.createContext({});
  for(const n of ['forecast-core','token-forecast-core'])vm.runInContext(fs.readFileSync(path.join('Sources',n+'.js'),'utf8'),c);
  const all=read(now),byDay=new Map(),rows=[];
  for(const a of all.anchors.filter(a=>a.at<now-18*3600))byDay.set(Math.floor(a.at/DAY),a);
  let resetOrMissingTruth=0,censored=0;
  for(const a of [...byDay.values()].slice(-14)){
   // Re-read at each origin. Six-hour anchor replacement must not leak later data.
   const h=read(a.at),latest=h.anchors.at(-1);if(!latest)continue;
   const future=all.anchors.filter(b=>b.at>=a.at+18*3600&&b.at<=a.at+30*3600)
    .sort((x,y)=>Math.abs(x.at-a.at-DAY)-Math.abs(y.at-a.at-DAY))[0];
   if(!future||future.segment!==latest.segment||future.plan!==latest.plan||
      Math.abs(future.resetAt-latest.resetAt)>600||future.used<latest.used-.05){resetOrMissingTruth++;continue;}
   if(future.used>=99.5){censored++;continue;}
   const horizon=(future.at-latest.at)/DAY,actual=Math.max(0,future.used-latest.used);
   const predictions=Object.fromEntries(Object.entries(intervalCandidates(quotaIntervals(h.anchors,a.at),a.at)).map(([k,v])=>[k,v*horizon]));
   const w={durationMins:10080,remaining:100-latest.used,resetAt:latest.resetAt};
   const old=c.forecastTokenHistory(w,h,{now:a.at,sync:'ready',lastSuccessAt:a.at,accountKnown:true,plan:latest.plan});
   if(old)predictions.oldToken=old.typicalConsumption*(future.at-latest.at)/(latest.resetAt-latest.at);
   const training=quotaIntervals(h.anchors,a.at);
   if(Number.isFinite(predictions.ewma3))predictions.adaptive=adaptive(rows,a.at,predictions.ewma3,weighted(training,14,a.at)*horizon);
   rows.push({cutoff:a.at,end:future.at,actual,predictions,fast:predictions.ewma3,slow:weighted(training,14,a.at)*horizon});
  }
  const intervals=quotaIntervals(all.anchors,now);
  return {historyDays:all.days.length,anchors:all.anchors.length,validIntervals:intervals.length,
   intervalExposureDays:round(intervals.reduce((s,r)=>s+(r.end-r.start)/DAY,0)),
   evaluatedOrigins:rows.length,resetOrMissingTruth,censored,
   mode:'Reader replay before each cutoff; subsequent 18–30h same-segment actual usage; no full-reset accuracy claim',
   ...stats(rows,['oldToken','pooled','ewma3','ewma7','blend','median','adaptive'],['oldToken','blend'])};
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
function synthetic(){
 const result={};
 for(const pattern of ['steady','oneOff','stepUp','stepDown','weekly','missing']){
  const joined={};for(const n of [1,7,28])joined[n]=[];
  for(let seed=1;seed<=20;seed++){
   let state=seed;function random(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
   const days=[];
   for(let i=0;i<84;i++){
    let rate=6;
    if(pattern==='oneOff'&&i===40)rate=90;
    if(pattern==='stepUp')rate=i<40?2:12;
    if(pattern==='stepDown')rate=i<40?12:2;
    if(pattern==='weekly')rate=i%7>=5?18:3;
    const value=rate*(.8+.4*random());
    if(pattern!=='missing'||i%9!==0)days.push({at:(23000+i)*DAY,value});
   }
   for(const n of [1,7,28])joined[n].push(...dailyReplay(days,n).map(r=>({...r,budgets:[.8*6*n,1.2*6*n]})));
  }
  result[pattern]=Object.fromEntries([1,7,28].map(n=>[n,stats(joined[n],VPN_NAMES,['oldP90','blend'])]));
 }
 return result;
}
function invariants(){
 const base=23000*DAY;
 const anchor=(d,used,segment=1,resetAt=base+7*DAY)=>({at:base+d*DAY,used,segment,resetAt,plan:'test',planSince:base});
 const a=[anchor(0,2),anchor(.8,10),anchor(1.6,18),anchor(2.4,26)];
 assert.equal(quotaIntervals(a,base+3*DAY).length,3,'sleep gaps retain interval totals');
 assert.equal(quotaIntervals([...a,anchor(3.2,1,2)],base+4*DAY).length,3,'refill boundary never becomes negative use');
 assert.equal(quotaIntervals([anchor(0,98),anchor(1,100),anchor(2,100)],base+3*DAY).length,0,'depletion plateau excluded');
 assert.deepEqual(quotaIntervals([...a,anchor(4,99)],base+3*DAY),quotaIntervals(a,base+3*DAY),'future anchors excluded');
 assert.equal(quotaIntervals([anchor(0,1),{...anchor(1,5),plan:'other',planSince:base+DAY}],base+2*DAY).length,0,'plan boundary excluded');
 const days=Array.from({length:40},(_,i)=>({at:base+i*DAY,value:10}));
 assert.equal(dailyCandidates(days,base+20*DAY,7).blend,70);
 assert.equal(dailyCandidates(days.map(d=>d.at>=base+20*DAY?{...d,value:99999}:d),base+20*DAY,7).blend,70);
 const missing=days.filter((d,i)=>i!==10);assert.equal(dailyReplay(missing,7).some(r=>r.cutoff===base+5*DAY),false,'missing ground truth is not zero');
 const scored=[{end:base+10*DAY,fast:100,slow:1,actual:1}];
 assert.equal(adaptive(scored,base+5*DAY,4,8),6,'unresolved future labels excluded');
 return 'Passed: sleep intervals, refill/plan/censor boundaries, cutoff isolation, missing truth and delayed model feedback';
}
if(require.main===module){
 const report={invariants:invariants()};
 if(process.argv.includes('--live')){report.quota=liveQuota();report.vpn=liveVPN();}
 else if(process.argv.includes('--live-vpn'))report.vpn=liveVPN();
 else report.synthetic=synthetic();
 console.log(JSON.stringify(report,null,2));
}
module.exports={quotaIntervals,intervalCandidates,dailyCandidates,dailyReplay,stats,adaptive,invariants,synthetic};
