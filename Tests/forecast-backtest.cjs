// Synthetic replay only: no real account data and no claim of calibrated accuracy.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {readSource}=require('./sources.cjs');
const modern=vm.createContext({}),baseline=vm.createContext({});
vm.runInContext(readSource('forecast-core'),modern);
vm.runInContext(fs.readFileSync(path.join(__dirname,'fixtures/forecast-v1.js'),'utf8'),baseline);
const DAY=86400, base=1999987200;
function metrics(){return {scorable:0,forecast:0,falseRisk:0,missedExhaustion:0,tight:0,abstained:0,conditional:0,maeSum:0,maeCount:0};}
function score(m,f,remaining,loss){
 m.scorable++;const depleted=loss>=remaining;
 if(f.status==='unknown' && f.basis!=='recent'){m.abstained++;return;}
 if(f.status==='unknown')m.conditional++;
 m.forecast++;if(f.status==='risk'&&!depleted)m.falseRisk++;
 if(f.status==='safe'&&depleted)m.missedExhaustion++;
 if(f.status==='tight')m.tight++;
 const predicted=f.projectedRemaining!==undefined?f.projectedRemaining:f.typicalConsumption!==undefined?remaining-f.typicalConsumption:null;
 if(predicted!==null){m.maeSum+=Math.abs(Math.max(0,predicted)-Math.max(0,remaining-loss));m.maeCount++;}
}
const rows=[], old=metrics(),current=metrics(),commonOld=metrics(),commonNew=metrics();
let nh=[],oh=[];
for(let cycle=0;cycle<5;cycle++){
 const resetAt=base+(cycle+1)*7*DAY;
 let used=0;
 const samples=[];
 for(let step=0;step<7*DAY/300;step++){
  const t=base+cycle*7*DAY+step*300,day=Math.floor(step*300/DAY),hour=(step*300%DAY)/3600;
  // Alternating heavy starts and quiet days; preserve spikes and idle order.
  const rate=day===0&&hour<2?12:cycle===3&&hour>=8&&hour<16?1.6:.06;
  used=Math.min(100,used+rate*300/3600);
  samples.push({t,remaining:100-used,resetAt,durationMins:10080});
 }
 for(let i=0;i<samples.length;i++){
  const s=samples[i];
  nh=modern.updateForecastHistory(nh,[s],s.t);oh=baseline.updateForecastHistory(oh,[s],s.t);
  if(i!==2*DAY/300&&i!==5*DAY/300)continue;
  const context={now:s.t,sync:'ready',lastSuccessAt:s.t,accountKnown:true};
  const a=baseline.forecastQuotaWindow(s,oh[0],context),b=modern.forecastQuotaWindow(s,nh[0],context);
  const loss=Math.max(0,s.remaining-samples[samples.length-1].remaining);
  score(old,a,s.remaining,loss);score(current,b,s.remaining,loss);
  if(a.status!=='unknown'&&b.status!=='unknown'){score(commonOld,a,s.remaining,loss);score(commonNew,b,s.remaining,loss);}
  rows.push({cycle:cycle+1,day:i*300/DAY,baseline:a.status,modern:b.status,actualExhaustion:loss>=s.remaining});
 }
}
const sessionOld=metrics(),sessionNew=metrics();
for(const pattern of ['steady','burstThenIdle','lateJump','missing']){
 let n=[],o=[],remaining=100, series=[];
 for(let minute=0;minute<=300;minute+=5){
  const loss=pattern==='steady'?1:pattern==='burstThenIdle'&&minute<=20?8:pattern==='lateJump'&&minute===60?60:0;
  remaining=Math.max(0,remaining-loss);series.push({t:base+minute*60,remaining,resetAt:base+5*3600,durationMins:300});
 }
 for(let i=0;i<series.length;i++){
  const s=series[i];if(pattern==='missing'&&i>=4&&i<=8)continue;
  n=modern.updateForecastHistory(n,[s],s.t);o=baseline.updateForecastHistory(o,[s],s.t);
  if(i!==12)continue;
  const c={now:s.t,sync:'ready',lastSuccessAt:s.t,accountKnown:true};
  const a=baseline.forecastQuotaWindow(s,o[0],c),b=modern.forecastQuotaWindow(s,n[0],c);
  const truthEnd=series.find(p=>p.t>=s.t+(b.horizon||3600))||series.at(-1);
  score(sessionNew,b,s.remaining,s.remaining-truthEnd.remaining);
  score(sessionOld,a,s.remaining,s.remaining-series.at(-1).remaining);
 }
}
assert(current.abstained>0,'cold-start history must abstain');
assert.equal(sessionNew.scorable,4);
function finish(m){return {...m,mae:m.maeCount?Number((m.maeSum/m.maeCount).toFixed(2)):null};}
console.log('Synthetic forecast replay:',JSON.stringify({weekly:{cycles:5,evaluationPoints:rows.length,baseline:finish(old),modern:finish(current),
 commonPoints:commonNew.scorable,commonBaseline:finish(commonOld),commonModern:finish(commonNew)},
 session:{patterns:4,modern:finish(sessionNew),baseline:finish(sessionOld),horizons:'modern 30/60m conditions; baseline full reset horizon'},
 limitations:'Synthetic properties only; no real multiweek validation, confidence claim, or depletion lead-time calibration. Tight is counted separately; unknown is not a correct prediction.'}));
