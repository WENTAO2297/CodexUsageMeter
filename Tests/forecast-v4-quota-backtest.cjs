// Prospective synthetic quota replay. Uses production official-interval
// models; no token conversion, future labels or extra continuous-use claims.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {readSource}=require('./sources.cjs');
function context(modern){const c=vm.createContext({});vm.runInContext(readSource('forecast-core'),c);
 if(modern){vm.runInContext(readSource('adaptive-forecast-core'),c);vm.runInContext(readSource('forecast-learning-core'),c);}
 else vm.runInContext(fs.readFileSync(__dirname+'/fixtures/forecast-v3.js','utf8'),c);return c;}
const v4=context(true),v3=context(false),D=86400,base=25000*D;
const development=process.argv.includes('--development'),seeds=development?[17,193]:[1009,6029,10007,104729];
const names=['steady','weekly','rising','falling','step','one-burst','temporary-level','missing-and-sleep'];
function random(seed){return ()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2**32;};}
function world(name,seed){const r=random(seed),prefix=[0];for(let day=0;day<210;day++){
 let rate=name==='weekly'?[5,7,9,8,11,3,2][day%7]:8;
 if(name==='rising')rate=3+day*.07;if(name==='falling')rate=Math.max(2,18-day*.07);
 if(name==='step')rate=day<80?5:18;
 if(name==='one-burst'&&day%31===14)rate*=9;
 if(name==='temporary-level'&&day%35>=16&&day%35<=18)rate*=4;
 const daily=rate*(.8+r()*.4);for(let q=0;q<4;q++)prefix.push(prefix.at(-1)+daily/4);
 }return prefix;}
const report={};for(const h of [1,3,6.5])report[h]={origins:0,v3Available:0,v4Available:0,paired:0,
 v3:{error:0,bias:0,falseRisk:0,missedRisk:0},mean7:{error:0,bias:0,falseRisk:0,missedRisk:0},v4:{error:0,bias:0,falseRisk:0,missedRisk:0}};
const journals={v3:{scored:0,bounded:0,censored:0,invalid:0},v4:{scored:0,bounded:0,censored:0,invalid:0}};
for(const name of names)for(const seed of seeds){
 const truth=world(name,seed),states={v3:v3.afNew('quota','synthetic',base),v4:v4.afNew('quota','synthetic',base)};
 for(let t=0;t<180*4;t++){
  const day=Math.floor(t/4),slot=t%4,now=base+t*D/4,cycleStart=Math.floor(day/7)*28,reset=base+(cycleStart+28)*D/4;
  if(name==='missing-and-sleep'&&slot!==2&&day%3===0)continue;
  const remaining=Math.max(0,100-(truth[t]-truth[cycleStart])),window={remaining,resetAt:reset,durationMins:10080};
  for(const [key,c] of [['v3',v3],['v4',v4]])states[key]=c.afQuotaObserve(states[key],window,'synthetic',now);
  if(day<35||slot!==2||!remaining)continue;
  const fullH=(reset-now)/D;
  for(const [key,c] of [['v3',v3],['v4',v4]]){
   const s=states[key],hs=key==='v4'?c.afHorizons('quota',fullH):[1,3,7].filter(h=>h<=fullH);
   for(const h of hs){if(key==='v4'&&!c.afNeedsIssue(s,h,now))continue;
    const f=c.afDistribution(s,c.afQuotaModels(s,now,h,null,null),h,remaining,now);if(f)c.afIssue(s,f,h,now);}
  }
  for(const h of [1,3,6.5]){
   if(h>fullH)continue;const m=report[h];m.origins++;
   const oldBuilt=v3.afQuotaModels(states.v3,now,h,null,null),newBuilt=v4.afQuotaModels(states.v4,now,h,null,null);
   const old=v3.afDistribution(states.v3,oldBuilt,h,remaining,now),fresh=v4.afDistribution(states.v4,newBuilt,h,remaining,now);
   if(old)m.v3Available++;if(fresh)m.v4Available++;if(!old||!fresh)continue;m.paired++;
   const rows=newBuilt.rows.filter(r=>r.start>=now-7*D),mean=v4.afRate(rows,0,now)*h;
   const loss=truth[t+h*4]-truth[t],actualBalance=Math.max(0,remaining-loss),event=loss>=remaining;
   for(const [key,point] of [['v3',old.typicalConsumption],['mean7',mean],['v4',fresh.typicalConsumption]]){
    const error=Math.max(0,remaining-point)-actualBalance;m[key].error+=Math.abs(error);m[key].bias+=error;
    const risk=point>=remaining;if(risk&&!event)m[key].falseRisk++;if(!risk&&event)m[key].missedRisk++;
   }
  }
 }
 for(const key of ['v3','v4'])for(const f of states[key].forecasts)if(f.state in journals[key])journals[key][f.state]++;
}
for(const m of Object.values(report)){assert(m.paired>0);for(const key of ['v3','mean7','v4']){
 const score=m[key];score.remainingMAEpp=+(score.error/m.paired).toFixed(3);score.remainingBiasPP=+(score.bias/m.paired).toFixed(3);
 delete score.error;delete score.bias;}}
console.log(JSON.stringify({mode:development?'development':'held-out',seeds,scenarios:names,summary:report,journals,
 limitations:'Synthetic production official-interval replay, not real account accuracy. Target is capped remaining balance; exhausted demand is not an exact training label. Overlapping origins are descriptive, not independent confidence samples. Token fallback and continuous history blocks are not exercised.'},null,2));
