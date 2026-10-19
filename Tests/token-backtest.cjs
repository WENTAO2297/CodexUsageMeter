// Optional real-history walk-forward test. Prints aggregate error statistics,
// never account IDs, paths, prompts, task names or raw rollout events.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const {readSource}=require('./sources.cjs');
if(!process.argv.includes('--live'))throw Error('Use --live to explicitly allow reading local numeric history');
const c=vm.createContext({});vm.runInContext(['forecast-core','token-forecast-core'].map(readSource).join('\n'),c);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-token-backtest-'));
try{
 const binary=path.join(temp,'reader');execFileSync('/usr/bin/xcrun',['clang','-fobjc-arc','-fblocks','-O2','-framework','Foundation','Sources/token-history-reader.m','-o',binary]);
 const root=process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),now=Date.now()/1000;
 const read=t=>JSON.parse(execFileSync(binary,[root,String(t)],{encoding:'utf8',timeout:35000}));
 const all=read(now),points=all.anchors.filter(a=>a.at<now-18*3600),byDay=new Map();
 // At most one cutoff per UTC day, avoiding scores dominated by overlapping
 // predictions. The real reader truncates before the cutoff on each replay.
 for(const a of points)byDay.set(Math.floor(a.at/86400),a);
 const results=[];let abstentions=0,invalidated=0,fullCycleEvaluations=0;
 for(const a of [...byDay.values()].slice(-8)){
   const replay=read(a.at),h=c.normalizeTokenHistory(replay,replay.accountId,a.at),latest=h?.anchors.at(-1);
   if(!latest){abstentions++;continue;}
   const w={durationMins:10080,remaining:100-latest.used,resetAt:latest.resetAt};
   const f=c.forecastTokenHistory(w,h,{now:a.at,sync:'ready',lastSuccessAt:a.at,accountKnown:true,plan:latest.plan});
   if(!f){abstentions++;continue;}
   const target=a.at+24*3600;
   const future=all.anchors.filter(b=>b.at>a.at&&b.at<=target+6*3600&&b.at>=target-6*3600)
     .sort((x,y)=>Math.abs(x.at-target)-Math.abs(y.at-target))[0];
   if(!future||future.segment!==latest.segment||future.plan!==latest.plan||Math.abs(future.resetAt-latest.resetAt)>600||future.used<latest.used){invalidated++;continue;}
   const actual=future.used-latest.used,scale=(future.at-a.at)/(w.resetAt-a.at);
   const typical=f.typicalConsumption*scale,lo=f.lowConsumption*scale,hi=f.highConsumption*scale;
   results.push({actual,predicted:typical,low:lo,high:hi,error:Math.abs(actual-typical),hit:actual>=lo&&actual<=hi});
   // Coupon/early reset is not ground truth for a forecast to the original
   // deadline. Only an unchanged segment observed at that deadline counts.
   if(Math.abs(future.at-w.resetAt)<=1800)fullCycleEvaluations++;
 }
 const mean=key=>results.length?Math.round(results.reduce((s,r)=>s+r[key],0)/results.length*10)/10:null;
 const report={method:'Real reader replay; one cutoff per day; subsequent ~24h consumption component',
   attempted:byDay.size>8?8:byDay.size,evaluated:results.length,abstained:abstentions,resetOrMissingGroundTruth:invalidated,
   meanAbsoluteErrorPercentagePoints:mean('error'),meanActualConsumption:mean('actual'),meanPredictedConsumption:mean('predicted'),
   scenarioRangeHits:results.filter(r=>r.hit).length,fullWeeklyResetEvaluations:fullCycleEvaluations,
   limitations:'Small sample, not a confidence interval. No validated whole-week accuracy claim. Only local token history; other devices/cloud may be missing.'};
 assert.equal(results.length+abstentions+invalidated,Math.min(8,byDay.size));console.log(JSON.stringify(report,null,2));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
