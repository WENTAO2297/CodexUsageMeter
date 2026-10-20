// Independently seeded synthetic stress check; never real account accuracy.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{context,crossing}=require('./vpn-model-backtest.cjs');
const c=context(),old=context(true),previous=context(),D=86400,base=25000*D;
vm.runInContext(fs.readFileSync(__dirname+'/fixtures/vpn-v5-models.js','utf8'),previous);previous.AF_VPN_VERSION=5;
const seeds=process.argv.includes('--development')?[739391,1299709,15485863,32452843,49979687,67867967]:[86028121,104395303,122949829];
const scenarios=['steady','weekly','rising','falling','step','one-burst','temporary-level','missing'];
const summary=Object.fromEntries([1,7,28].map(h=>[h,{n:0,v4:{error:0,falseAlarm:0,missed:0},mean7:{error:0,falseAlarm:0,missed:0},v5:{error:0,falseAlarm:0,missed:0},v6:{error:0,falseAlarm:0,missed:0},numeric:0,numericFalse:0}]));
const details={};
for(const scenario of scenarios)for(let seed of seeds){
 function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2**32;}
 const values=Array.from({length:120},(_,i)=>{
  let rate=scenario==='weekly'?[4,8,10,12,6,2,1][i%7]:8;
  if(scenario==='rising')rate=2+i*.1;
  if(scenario==='falling')rate=Math.max(1,16-i*.1);
  if(scenario==='step')rate=i<55?4:20;
  if(scenario==='one-burst'&&i%29===18)rate*=10;
  if(scenario==='temporary-level'&&i%31>=16&&i%31<=18)rate*=4;
  return rate*(.8+.4*random());
 });
 for(let day=35;day<=84;day+=7)for(const h of [1,7,28]){
  const now=base+day*D,rows=[];
  for(let i=day-35;i<day-2;i++){
   if(scenario==='missing'&&i%17===8)continue;
   rows.push({at:base+i*D,value:values[i],firstSeen:now,changedAt:now,lastSeen:now,revision:0});
  }
  const make=ctx=>{const s=ctx.afNew('vpn','stress',now);s.days=rows;s.last={at:now,used:0,total:10000,remaining:10000,resetAt:0,resetDays:h};return s;};
  const s=make(c),previousState=make(old),built=c.afTrafficModels(s,now,h),older=old.afTrafficModels(previousState,now,h);
  const fresh=c.afDistribution(s,built,h,10000,now),legacy=old.afDistribution(previousState,older,h,10000,now);
  const previousState5=make(previous),v5=previous.afDistribution(previousState5,previous.afTrafficModels(previousState5,now,h),h,10000,now);
  if(!fresh||!legacy||!v5)continue;
  const mean7=built.baselines.mean7,truth=values.slice(day,day+h),actual=truth.reduce((a,b)=>a+b,0),g=summary[h];g.n++;
  const detail=details[scenario+'/'+h]||(details[scenario+'/'+h]={n:0,v4:0,mean7:0,v5:0,v6:0});detail.n++;
  for(const [name,point] of [['v4',legacy.typicalConsumption],['mean7',mean7],['v5',v5.typicalConsumption],['v6',fresh.typicalConsumption]]){
   const error=Math.abs(point-actual);g[name].error+=error;detail[name]+=error;
   for(const factor of [.75,1.25]){const balance=mean7*factor,flag=point>=balance,event=actual>=balance;
    if(flag&&!event)g[name].falseAlarm++;if(!flag&&event)g[name].missed++;}
  }
  const balance=mean7*.75,timed=c.afVPNForecast(s,now,h,balance);
  assert(timed.lowConsumption<=timed.typicalConsumption&&timed.highConsumption>=timed.typicalConsumption);
  if(timed.precision==='day'){g.numeric++;if(crossing(truth,balance)===null)g.numericFalse++;}
  assert.equal(c.afNormalize({...JSON.parse(JSON.stringify(s)),days:[]},'vpn','stress',now)?.version,6);
 }
}
for(const g of Object.values(summary)){
 assert(g.n>0);for(const name of ['v4','mean7','v5','v6']){g[name].maeGiB=+(g[name].error/g.n).toFixed(4);delete g[name].error;}
}
for(const g of Object.values(details))for(const name of ['v4','mean7','v5','v6'])g[name]=+(g[name]/g.n).toFixed(4);
console.log(JSON.stringify({mode:process.argv.includes('--development')?'synthetic-development':'synthetic-held-out-seeds',seeds,scenarios,summary,details,
 limitations:'New random seeds, known constructed patterns, overlapping targets and hypothetical balances. Not real monthly accuracy; stress results were not used to fit SES parameters.'},null,2));
