// Empirical fallback only. Tokens have no fixed subscription conversion rate.
// Keep stale/unknown/account/plan/refill gates independent of UI rendering.
function normalizeTokenHistory(s, account, now) {
  if (!s || s.version!==1 || !account || s.accountId!==account || !forecastNumber(s.savedAt) ||
      s.savedAt>now+60 || now-s.savedAt>21600 || !Array.isArray(s.anchors) || s.anchors.length>240 ||
      !Array.isArray(s.days) || s.days.length>23) return null;
  function validCounts(c) { return Array.isArray(c)&&c.length===3&&c.every(function(n){return forecastNumber(n)&&n>=0&&n<=1e13;})&&c[1]<=c[0]; }
  function validModels(m,c) {
    if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).length>20)return false;
    var sum=0;
    for(var k in m){if(!Object.prototype.hasOwnProperty.call(m,k)||!/^gpt-[a-zA-Z0-9.-]{1,60}$/.test(k)||!forecastNumber(m[k])||m[k]<0)return false;sum+=m[k];}
    return Math.abs(sum-c[0]-c[2])<=Math.max(1,sum*1e-9);
  }
  var previous=0, prefix=[0,0,0],modelPrefix={};
  for(var i=0;i<s.anchors.length;i++) {
    var a=s.anchors[i];
    if(!a||!forecastNumber(a.at)||a.at<previous||a.at>Math.min(s.savedAt,now)+60||a.at<now-22*86400 ||
       !validCounts(a.counts)||!validModels(a.models,a.counts)||!validForecastRemaining(a.used)||
       !forecastNumber(a.resetAt)||a.resetAt<=a.at||typeof a.plan!=='string'||!/^[a-zA-Z0-9_-]{1,32}$/.test(a.plan)||
       !forecastNumber(a.segment)||a.segment<1||a.segment%1||!forecastNumber(a.planSince)||a.planSince>a.at||a.planSince<=0||
       a.counts.some(function(n,j){return n<prefix[j];}))return null;
    if(Object.keys(modelPrefix).some(function(k){return !forecastNumber(a.models[k])||a.models[k]<modelPrefix[k];}))return null;
    previous=a.at;prefix=a.counts;modelPrefix=a.models;
  }
  previous=0;
  for(i=0;i<s.days.length;i++) {
    var d=s.days[i];if(!d||!forecastNumber(d.at)||d.at%86400||d.at<=previous||d.at>now||d.at<now-22*86400 ||
      !validCounts(d.counts)||!validModels(d.models,d.counts))return null;previous=d.at;
  }
  return s;
}
function tokenCountsTotal(c) { return c[0]+c[2]; }
function tokenCountsDifference(a,b) { return a.map(function(n,i){return n-b[i];}); }
function tokenModelDifference(a,b) {
  var m={};Object.keys(a).forEach(function(k){m[k]=a[k]-(b[k]||0);});return m;
}
function tokenMixSimilar(counts,models,referenceCounts,referenceModels) {
  var total=tokenCountsTotal(counts), reference=tokenCountsTotal(referenceCounts);
  if(total<=0||reference<=0)return false;
  var keys=Object.keys(models).concat(Object.keys(referenceModels)), unique={}, distance=0;
  keys.forEach(function(k){if(!unique[k]){unique[k]=true;distance+=Math.abs((models[k]||0)/total-(referenceModels[k]||0)/reference);}});
  // Coarse engineering guards, not billing weights. Avoid applying a Sol-heavy
  // or mostly cached calibration to an Astra-heavy/uncached workload.
  return distance<=0.6 && Math.abs(counts[1]/Math.max(1,counts[0])-referenceCounts[1]/Math.max(1,referenceCounts[0]))<=0.2 &&
    Math.abs(counts[2]/total-referenceCounts[2]/reference)<=0.1;
}
function forecastTokenHistory(w, history, context) {
  var now=context.now;
  if(!history||context.accountKnown===false||w.durationMins!==10080||context.sync!=='ready'||
     !context.lastSuccessAt||context.lastSuccessAt>now||now-context.lastSuccessAt>180||
     !validForecastRemaining(w.remaining)||w.remaining<=0||!forecastNumber(w.resetAt)||w.resetAt<=now||
     history.savedAt>now+60||now-history.savedAt>21600)return null;
  var anchors=history.anchors.filter(function(a){return a.at<=now;}), latest=anchors[anchors.length-1];
  // A historical account/plan snapshot must still describe the live quota.
  // Returning a value after a refill or on a different capacity would be worse
  // than abstaining. A 10-minute reset jitter tolerates protocol rounding.
  if(!latest||now-latest.at>86400||Math.abs(latest.resetAt-w.resetAt)>600||
     100-w.remaining<latest.used-1||context.plan&&context.plan!==latest.plan)return null;
  var since=latest.planSince, days=history.days.filter(function(d){return d.at>=since&&d.at+86400<=now&&d.at>=now-8*86400;}).slice(-7);
  // Missing local days are not invented as zero. A day needs quota anchors on
  // both sides (within 12h) to support treating it as an observed full day.
  days=days.filter(function(d){return anchors.some(function(a){return a.plan===latest.plan&&a.at>=d.at-43200&&a.at<=d.at;})&&
    anchors.some(function(a){return a.plan===latest.plan&&a.at>=d.at+86400&&a.at<=d.at+129600;});});
  if(days.length<2)return null;
  var recent=days.slice(-3), rc=[0,0,0], rm={};
  recent.forEach(function(d){d.counts.forEach(function(n,i){rc[i]+=n;});Object.keys(d.models).forEach(function(k){rm[k]=(rm[k]||0)+d.models[k];});});
  days=days.filter(function(d){return tokenMixSimilar(d.counts,d.models,rc,rm);});
  if(days.length<2)return null;
  var intervals=[], start=null;
  anchors.forEach(function(a) {
    if(a.plan!==latest.plan||a.at<since){start=null;return;}
    if(!start||start.segment!==a.segment||Math.abs(start.resetAt-a.resetAt)>600||a.used<start.used-1){start=a;return;}
    var span=a.at-start.at;
    if(span<6*3600)return;
    var c=tokenCountsDifference(a.counts,start.counts),m=tokenModelDifference(a.models,start.models),drop=a.used-start.used;
    if(span<=30*3600&&drop>=2&&drop<=80&&tokenCountsTotal(c)>=10000&&c.every(function(n){return n>=0;})&&tokenMixSimilar(c,m,rc,rm))
      intervals.push({ratio:drop*1e6/tokenCountsTotal(c),at:a.at});
    start=a;
  });
  if(intervals.length<3)return null;
  var ratios=intervals.slice(-20).map(function(i){return i.ratio;});
  var lo=forecastQuantile(ratios,.1)*.75, typical=forecastQuantile(ratios,.5), hi=forecastQuantile(ratios,.9)*1.25;
  if(!(lo>0)||hi/lo>10)return null; // radically inconsistent calibration
  var daily=days.map(function(d){return tokenCountsTotal(d.counts)/1e6;}), horizon=(w.resetAt-now)/86400;
  if(forecastQuantile(daily,.5)<=0)return null;
  var low=lo*forecastQuantile(daily,.25)*horizon, mid=typical*forecastQuantile(daily,.5)*horizon,
      high=hi*forecastQuantile(daily,.9)*horizon;
  var verdict=mid>w.remaining?'risk':high>=w.remaining-5?'tight':'safe';
  var lower=Math.max(0,Math.round(w.remaining-high)),upper=Math.max(0,Math.round(w.remaining-low));
  return {basis:'tokenHistory',status:'unknown',verdict:verdict,typicalConsumption:mid,lowConsumption:low,highConsumption:high,
    budget:forecastBudget(w.remaining,w.resetAt-now,true),
    text:'Historical rough estimate · ~'+lower+(lower===upper?'':'–'+upper)+'% at reset',
    calibrationIntervals:intervals.length,observedDays:days.length};
}
