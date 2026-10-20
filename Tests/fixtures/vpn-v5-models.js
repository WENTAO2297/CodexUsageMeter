// Frozen VPN v5 model construction for paired regression/replay only.
function afTrafficModels(s,now,horizon){
  // Treat the last 48h as provisional. Offline time cannot settle a report.
  var mature=s.days.filter(function(d){return d.at+AF_DAY<=d.lastSeen-2*AF_DAY&&d.lastSeen<=now&&d.at>=now-180*AF_DAY;});
  if(mature.length<3||now-mature[mature.length-1].at>5*AF_DAY)return {models:{},rows:[]};
  var latest=mature[mature.length-1].at,days=mature.filter(function(d){return d.at>=latest-34*AF_DAY;});
  var rows=days.map(function(d){return {start:d.at,end:d.at+AF_DAY,loss:d.value};});
  var week=afVPNWindow(rows,latest,7),month=afVPNWindow(rows,latest,28),models={},baselines={};
  var span=(latest-rows[0].start)/AF_DAY+1,coverage=rows.length/span;
  var recentOK=week.rows.length>=3&&week.coverage>=.8;
  if(recentOK)baselines.mean7=week.rate*horizon;
  if(span>=23&&month.coverage>=.8)baselines.mean28=month.rate*horizon;
  if(baselines.mean7!==undefined&&baselines.mean28!==undefined)baselines.simple=(baselines.mean7+baselines.mean28)/2;
  // Fit the exact native SES candidate used in the retrospective comparison.
  // Gaps are not compressed away: ETS needs a contiguous daily tail.
  var tail=[rows[rows.length-1]];
  for(var i=rows.length-2;i>=0&&rows[i].end===tail[0].start;i--)tail.unshift(rows[i]);
  var fit=recentOK?afVPNFitSES(tail.map(function(r){return r.loss;})):null;
  if(fit)models.ses={center:fit.level*horizon,rate:fit.level};
  else if(recentOK)models.pooled={center:week.rate*horizon,rate:week.rate};
  var change=recentOK?afTrafficChange(s,rows,now):null;
  if(change){
    var front={days:Math.min(horizon,Math.max(1,Math.min(2,change.exposure))),rate:change.rate,strength:change.strength};
    Object.keys(models).forEach(function(k){var model=models[k];model.front=front;
      model.center+=(front.rate-model.rate)*front.days*front.strength;
    });
  }
  return {models:models,rows:rows,recentChange:change,coverageOK:recentOK&&coverage>=.8,
    recentCoverage:week.coverage,monthCoverage:month.coverage,baselines:baselines};
}
