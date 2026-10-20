// Prospective synthetic replay of the actual production algorithms. Future
// truth is used only for scoring, never passed into models or weight learning.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {readSource}=require('./sources.cjs');
function context(modern){const c=vm.createContext({});vm.runInContext(readSource('forecast-core'),c);
 if(modern)vm.runInContext(fs.readFileSync(__dirname+'/fixtures/forecast-v4.js','utf8'),c);
 else vm.runInContext(fs.readFileSync(__dirname+'/fixtures/forecast-v3.js','utf8'),c);return c;}
const modern=context(true),legacy=context(false),D=86400,G=1024**3,base=25000*D;
const development=process.argv.includes('--development'),seeds=development?[17,193]:[1009,6029,10007,104729];
const names=['steady','weekly','rising','falling','step','one-burst','temporary-level','missing-and-sleep'];
function random(seed){return ()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2**32;};}
function world(name,seed){const r=random(seed),daily=[];for(let d=0;d<210;d++){
 let rate=name==='weekly'?([5,7,9,8,11,3,2][d%7]):8;
 if(name==='rising')rate=3+d*.07;
 if(name==='falling')rate=Math.max(2,18-d*.07);
 if(name==='step')rate=d<80?5:18;
 if(name==='one-burst'&&d%31===14)rate*=9;
 if(name==='temporary-level'&&d%35>=16&&d%35<=18)rate*=4;
 daily.push(rate*(.8+r()*.4)*G);
 }const quarters=daily.flatMap(value=>[value/4,value/4,value/4,value/4]),prefix=[0];
 quarters.forEach(v=>prefix.push(prefix.at(-1)+v));return {daily,quarters,prefix};}
function blank(){return {n:0,error:0,bias:0,falseRisk:0,missedRisk:0,decisions:0,etaShown:0,etaFalse:0,etaError:0,etaScored:0};}
const totals={},details={};for(const h of [1,7,28])totals[h]={origins:0,v3Available:0,v4Available:0,eligible:0,v3:blank(),mean7:blank(),v4:blank()};
const journal={v3:{scored:0,invalid:0,pending:0,bounded:0,censored:0},v4:{scored:0,invalid:0,pending:0,bounded:0,censored:0}};
for(const name of names)for(const seed of seeds){
 const truth=world(name,seed),states={v3:legacy.afNew('vpn','synthetic',base),v4:modern.afNew('vpn','synthetic',base)};
 for(let t=0;t<180*4;t++){
  const day=Math.floor(t/4),slot=t%4,now=base+t*D/4;
  if(name==='missing-and-sleep'&&slot!==2&&day%3===0)continue;
  const cycleStart=Math.floor(day/30)*120,used=truth.prefix[t]-truth.prefix[cycleStart],resetDays=Math.floor((cycleStart+120-t)/4);
  const snapshot={reportedAt:now*1000,totalBytes:10000*G,usedBytes:used,remainingBytes:10000*G-used,resetDays};
  const days=[];for(let d=Math.max(0,day-34);d<=day;d++){
   if(name==='missing-and-sleep'&&d%17===8)continue;
   let value=d===day?truth.prefix[t]-truth.prefix[d*4]:truth.daily[d];
   // Recent reports can be provisional. Each replay only sees the report
   // available at this query, not the final revised series used as truth.
   if(t-d*4<12)value*=.85;
   days.push([base+d*D,Math.round(value)]);
  }
  for(const [key,c] of [['v3',legacy],['v4',modern]]){
   let s=states[key];s=c.afTrafficObserve(s,snapshot,now);s=c.afTrafficMerge(s,{state:'ready',fetchedAt:now*1000,days},now);states[key]=s;
  }
  if(day<35||slot!==2||resetDays<1)continue;
  // Register production evaluation targets using only current observations.
  for(const [key,c] of [['v3',legacy],['v4',modern]]){
   const s=states[key],hs=key==='v4'?c.afHorizons('vpn',resetDays):[1,3,7,14,31].filter(h=>h<=resetDays);
   for(const h of hs){if(key==='v4'&&!c.afNeedsIssue(s,h,now))continue;
    const f=c.afDistribution(s,c.afTrafficModels(s,now,h),h,snapshot.remainingBytes,now);if(f)c.afIssue(s,f,h,now);}
  }
  for(const h of [1,7,28]){
   if(h>resetDays)continue;
   const oldBuilt=legacy.afTrafficModels(states.v3,now,h),newBuilt=modern.afTrafficModels(states.v4,now,h);
   const old=legacy.afDistribution(states.v3,oldBuilt,h,snapshot.remainingBytes,now),fresh=modern.afDistribution(states.v4,newBuilt,h,snapshot.remainingBytes,now);
   totals[h].origins++;if(old)totals[h].v3Available++;if(fresh)totals[h].v4Available++;
   if(!old||!fresh)continue; // Public paired points only; counts are reported.
   // The baseline is the untouched seven-day mean, not a candidate already
   // adjusted by v4's new balance-change detector.
   const actual=(truth.prefix[t+h*4]-truth.prefix[t])/G,mean7=oldBuilt.models.pooled.center/G;
   const total=totals[h],detail=details[name+'/'+h]||(details[name+'/'+h]={eligible:0,v3:blank(),mean7:blank(),v4:blank()});
   total.eligible++;detail.eligible++;
   for(const [key,f] of [['v3',old],['mean7',{typicalConsumption:mean7*G}],['v4',fresh]]){
    const point=f.typicalConsumption/G;
    for(const item of [total[key],detail[key]]){item.n++;item.error+=Math.abs(point-actual);item.bias+=point-actual;
     for(const factor of [.8,1.2]){const balance=mean7*factor,flag=point>=balance,event=actual>=balance;
      item.decisions++;if(flag&&!event)item.falseRisk++;if(!flag&&event)item.missedRisk++;}}
   }
   // Depletion-day checks use a synthetic fixed balance; they are not real
   // account exhaustion events or evidence of calibrated probabilities.
   const balance=mean7*.8*G,eta=modern.afDistribution(states.v4,newBuilt,h,balance,now);
   if(eta.precision==='day'){
    let loss=0,cross=null;for(let q=t;q<t+h*4;q++){const amount=truth.quarters[q];
     if(loss+amount>=balance){cross=(q-t)/4+(balance-loss)/amount/4;break;}loss+=amount;}
    for(const item of [total.v4,detail.v4]){item.etaShown++;if(cross===null)item.etaFalse++;
     else{item.etaScored++;item.etaError+=Math.abs(cross-eta.crossingDays);}}
   }
  }
 }
 for(const key of ['v3','v4'])for(const f of states[key].forecasts)journal[key][f.state]++;
}
function finish(group){const out={origins:group.origins,v3Available:group.v3Available,v4Available:group.v4Available,pairedForecasts:group.eligible};for(const key of ['v3','mean7','v4']){const m=group[key];
 out[key]={maeGiB:+(m.error/m.n).toFixed(3),biasGiB:+(m.bias/m.n).toFixed(3),falseRisk:m.falseRisk,
  missedRisk:m.missedRisk,syntheticBudgetDecisions:m.decisions};
 if(key==='v4')Object.assign(out[key],{numericEtaShown:m.etaShown,numericEtaFalse:m.etaFalse,
  numericEtaMAEDays:m.etaScored?+(m.etaError/m.etaScored).toFixed(3):null});}return out;}
const summary={};for(const [h,g] of Object.entries(totals)){assert(g.eligible>0);summary[h]=finish(g);}
const report={mode:development?'development':'held-out',seeds,scenarios:names,summary,journal,
 limitations:'Synthetic paired replay, not real account accuracy. Models receive only as-of reports/counters. Budgets are hypothetical. Exact ETA availability/false displays are separate. No percentages or confidence guarantees.'};
if(process.argv.includes('--details'))report.details=Object.fromEntries(Object.entries(details).map(([k,v])=>[k,finish(v)]));
console.log(JSON.stringify(report,null,2));
