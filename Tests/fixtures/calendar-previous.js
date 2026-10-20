// Frozen v6 VPN / v4 quota point builders for paired calendar-change replay.
// Shared numerical helpers behave identically when no calendar is attached.
function afTrafficModels(s,now,horizon){
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
  var tail=[rows[rows.length-1]];
  for(var i=rows.length-2;i>=0&&rows[i].end===tail[0].start;i--)tail.unshift(rows[i]);
  var fit=recentOK?afVPNFitMultiSES(tail.map(function(r){return r.loss;})):null;
  if(fit){var model={rate:fit.members[fit.members.length-1].level,components:fit.members,
      lag:Math.max(0,(now-tail[tail.length-1].end)/AF_DAY)};
    model.center=afVPNModelTotal(model,now,horizon);models.multiSES=model;
  }else if(recentOK)models.pooled={center:week.rate*horizon,rate:week.rate};
  var change=recentOK?afTrafficChange(s,rows,now):null;
  if(change){var front={days:Math.min(horizon,Math.max(1,Math.min(2,change.exposure))),rate:change.rate,strength:change.strength};
    Object.keys(models).forEach(function(k){var model=models[k];model.front=front;
      model.center+=(front.rate*front.days-afVPNModelTotal(model,now,front.days))*front.strength;
    });
  }
  return {models:models,rows:rows,recentChange:change,coverageOK:recentOK&&coverage>=.8,
    recentCoverage:week.coverage,monthCoverage:month.coverage,baselines:baselines};
}
function afQuotaModels(s,now,horizon,original,token,reconstructed){
  var rows=afQuotaIntervals(s,now).filter(function(r){return r.end>=now-28*AF_DAY;}),models={},span=0;
  rows.forEach(function(r){span+=(r.end-r.start)/AF_DAY;});
  if(rows.length>=2&&span>=1){
    [['pooled',0],['recent',3],['stable',7],['slow',14]].forEach(function(p){models[p[0]]={center:afRate(rows,p[1],now)*horizon};});
  }
  if(original&&original.basis==='history'&&original.adaptiveSamples&&original.adaptiveSamples.length>=3)
    models.blocks={center:original.typicalConsumption,samples:original.adaptiveSamples};
  if(!Object.keys(models).length&&token&&token.basis==='tokenHistory')models.token={center:token.typicalConsumption,
    quantiles:[token.lowConsumption,token.typicalConsumption,token.highConsumption]};
  if(reconstructed&&reconstructed.basis==='quotaReconstruction')models.reconstructed={center:reconstructed.typicalConsumption,
    quantiles:[reconstructed.lowConsumption,reconstructed.typicalConsumption,reconstructed.highConsumption],
    estimatedDays:reconstructed.estimatedDays};
  return {models:models,rows:rows,exposure:span};
}
