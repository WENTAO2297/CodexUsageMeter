// Measured quota loss, not a token-to-quota estimate or a forecast. Use the
// closest real pair around a day (Session: an hour), reporting an average over
// that actual interval; never invent a midnight/100% baseline.
function observedQuotaUse(window, record, tokenHistory, context) {
  var now=context.now, weekly=window.durationMins===10080, unit=weekly?86400:3600;
  if(window.durationMins!==300&&!weekly)return null;
  if (!context.accountId || context.sync!=='ready' || !forecastNumber(context.lastSuccessAt) ||
      now<context.lastSuccessAt || now-context.lastSuccessAt>180 || !validForecastRemaining(window.remaining) ||
      !validForecastWindow(window,now)) return null;
  var points=[];
  if (record && forecastWindowKey(record)===forecastWindowKey(window)) {
    points=(record.samples||[]).filter(function(p){return p[0]<=now&&validForecastRemaining(p[1]);});
  }
  if (weekly && tokenHistory && tokenHistory.accountId===context.accountId && context.plan &&
      tokenHistory.savedAt<=now && now-tokenHistory.savedAt<=21600) {
    var anchors=tokenHistory.anchors||[],latest=anchors[anchors.length-1];
    if(latest&&latest.plan!==context.plan)return null;
    if(latest&&latest.planSince)points=points.filter(function(p){return p[0]>=latest.planSince;});
    if (latest && latest.plan===context.plan && Math.abs(latest.resetAt-window.resetAt)<=600 &&
        100-window.remaining>=latest.used-.05) {
      anchors.forEach(function(a){
        if (a.segment===latest.segment&&a.plan===context.plan&&a.at>=latest.planSince&&a.at<=now&&
            Math.abs(a.resetAt-window.resetAt)<=600&&validForecastRemaining(a.used))points.push([a.at,100-a.used]);
      });
    }
  }
  points.sort(function(a,b){return a[0]-b[0];});
  var candidates=points.filter(function(p){var age=now-p[0];return age>=unit*.5&&age<=unit*1.5;});
  candidates.sort(function(a,b){return Math.abs(now-a[0]-unit)-Math.abs(now-b[0]-unit);});
  if (!candidates.length) return null;
  var first=candidates[0],last=first[1];
  var tail=points.filter(function(p){return p[0]>=first[0];}).concat([[now,window.remaining]]);
  for(var i=0;i<tail.length;i++){if(tail[i][1]>last+.05)return null;last=Math.min(last,tail[i][1]);}
  var elapsed=now-first[0],loss=Math.max(0,first[1]-window.remaining);
  return {unit:weekly?'day':'h',pointsPerUnit:loss*unit/elapsed,loss:loss,observedSeconds:elapsed};
}
