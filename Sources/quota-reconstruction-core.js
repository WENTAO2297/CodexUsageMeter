// Derived estimates, never observations or scoring labels. Profile date labels
// are paired with the user's Shanghai calendar; intraday timing is not known.
function qhDate(at) {
  var d=new Date((at+28800)*1000);
  return d.getUTCFullYear()+'-'+('0'+(d.getUTCMonth()+1)).slice(-2)+'-'+('0'+d.getUTCDate()).slice(-2);
}
function qhBounds(date) {
  var p=date.split('-').map(Number);
  return [Date.UTC(p[0],p[1]-1,p[2])/1000-28800,Date.UTC(p[0],p[1]-1,p[2]+1)/1000-28800];
}
function qhQuantile(rows,key,p) {
  var sorted=rows.slice().sort(function(a,b){return a[key]-b[key];}),total=0,sum=0;
  sorted.forEach(function(r){total+=r.weight;});
  for(var i=0;i<sorted.length;i++){sum+=sorted[i].weight;if(sum>=total*p)return sorted[i][key];}
  return sorted.length?sorted[sorted.length-1][key]:null;
}
function normalizeQuotaCapacity(rule,account,now) {
  if(!rule||rule.version!==1||rule.source!=='user'||rule.accountId!==account||
      typeof rule.fromPlan!=='string'||typeof rule.toPlan!=='string'||rule.fromPlan===rule.toPlan||
      !/^[a-zA-Z0-9_-]{1,32}$/.test(rule.fromPlan)||!/^[a-zA-Z0-9_-]{1,32}$/.test(rule.toPlan)||
      !afTime(rule.toSince)||rule.toSince>now||rule.fromBefore!==rule.toSince||
      !afNumber(rule.consumptionScale)||rule.consumptionScale<=0||rule.consumptionScale>1)return null;
  return rule;
}
function reconstructQuotaDays(profile,state,history,now,capacityRule) {
  if(!state||state.kind!=='quota'||!state.plan||!state.scope)return null;
  profile=normalizeTokenMeter(profile,state.scope,now);
  if(!profile||now-profile.savedAt>21600)return null;
  capacityRule=normalizeQuotaCapacity(capacityRule,state.scope,now);
  if(capacityRule&&(capacityRule.toPlan!==state.plan||Math.abs(capacityRule.toSince-state.planSince)>600))capacityRule=null;
  var today=qhDate(now),days=profile.days.filter(function(d){return d.date<today;}).slice(-28).map(function(d){
    var bounds=qhBounds(d.date);return {date:d.date,start:bounds[0],end:bounds[1],tokens:d.tokens,estimated:true,parts:[]};
  });
  // Deduplicate exact timestamps, keeping the journal's boundary guards. The
  // local reader contributes older plans, not its differently scoped tokens.
  var byTime={},prior=null;
  if(history&&history.accountId===state.scope&&history.savedAt<=now&&now-history.savedAt<=21600)
    history.anchors.forEach(function(a){if(a.at<=now){
      byTime[a.at]={at:a.at,remaining:100-a.used,resetAt:a.resetAt,plan:a.plan,planSince:a.planSince,
        boundary:!!(prior&&(a.segment!==prior.segment||a.plan!==prior.plan||a.used<prior.used-.05||Math.abs(a.resetAt-prior.resetAt)>600))};prior=a;
    }});
  state.anchors.forEach(function(a){if(a.at<=now){
    var old=byTime[a.at];byTime[a.at]={at:a.at,remaining:a.remaining,resetAt:a.resetAt,plan:a.plan,
      planSince:old?old.planSince:0,boundary:!!a.boundary||!!(old&&old.boundary)};
  }});
  var anchors=Object.keys(byTime).map(function(k){return byTime[k];}).sort(function(a,b){return a.at-b.at;});
  if(!anchors.length)return null;
  var phases=[],calibrations={},intervals=[];
  anchors.forEach(function(a){var tail=phases[phases.length-1];
    if(!tail||tail.plan!==a.plan){
      var current=a.plan===state.plan&&a.at>=state.planSince;
      var since=current?state.planSince:a.planSince;
      var start=tail?Math.max(tail.observedAt,since&&since<=a.at?since:a.at):0;
      phases.push({plan:a.plan,start:start,since:current?state.planSince:start,observedAt:a.at});
    }
  });
  function pieces(start,end) {return days.map(function(d){
    var duration=Math.max(0,Math.min(end,d.end)-Math.max(start,d.start));
    return {day:d,duration:duration,tokens:d.tokens*duration/(d.end-d.start)};
  }).filter(function(p){return p.duration>0;});}
  // Only entirely represented, completed dates can calibrate a conversion.
  function indicator(start,end) {
    var parts=pieces(start,end),span=0,total=0;
    parts.forEach(function(p){span+=p.duration;total+=p.tokens;});
    return Math.abs(span-(end-start))<1?total:null;
  }
  phases.forEach(function(phase,index){
    var stop=index+1<phases.length?phases[index+1].start:now;
    var relevant=anchors.filter(function(a){return a.plan===phase.plan&&a.at>=phase.since&&a.at<stop;});
    var pseudo={plan:phase.plan,planSince:phase.since,anchors:relevant};
    var samples=afQuotaIntervals(pseudo,now).map(function(r){var tokens=indicator(r.start,r.end);
      return tokens>=1e6&&r.loss>=2?{at:r.end,ratio:r.loss*1e8/tokens,
        weight:(r.end-r.start)/86400*Math.pow(2,-(now-r.end)/86400/14),start:r.start,end:r.end}:null;
    }).filter(function(r){return r!==null;});
    // A repeated plan after another capacity is a different calibration era.
    var key=phase.plan+'@'+phase.since,ratio=qhQuantile(samples,'ratio',.5);
    calibrations[key]={plan:phase.plan,since:phase.since,ratio:ratio,
      lowRatio:qhQuantile(samples,'ratio',.1),highRatio:qhQuantile(samples,'ratio',.9),
      intervals:samples.length,exposure:samples.reduce(function(s,r){return s+(r.end-r.start)/86400;},0),
      latest:samples.length?Math.max.apply(null,samples.map(function(r){return r.end;})):0};
    days.forEach(function(d){var start=Math.max(d.start,phase.start),end=Math.min(d.end,stop);
      if(end<=start)return;
      var assumed=end<=phase.observedAt,amount=d.tokens*(end-start)/(d.end-d.start);
      d.parts.push({plan:phase.plan,era:key,start:start,end:end,tokens:amount,assumedPlan:assumed,
        covered:0,coveredTokens:0,constrainedLoss:0,loss:null});
    });
    for(var i=1;i<relevant.length;i++){
      var a=relevant[i-1],b=relevant[i],span=b.at-a.at;
      if(b.boundary||span<=0||span>36*3600||Math.abs(b.resetAt-a.resetAt)>600||b.remaining>a.remaining+.05||
          a.remaining<=.5||b.remaining<=.5||b.at>a.resetAt)continue;
      var total=indicator(a.at,b.at);if(total===null)continue;
      var loss=Math.max(0,a.remaining-b.remaining);
      // Zero tokens with a positive quota drop is a source mismatch, not an
      // invitation to invent an intraday Token distribution.
      if(loss>0&&!(total>0)){
        pieces(a.at,b.at).forEach(function(p){p.day.parts.forEach(function(x){if(x.era===key)x.mismatch=true;});});
        continue;
      }
      intervals.push({start:a.at,end:b.at,loss:loss,plan:phase.plan});
      pieces(a.at,b.at).forEach(function(p){var part=p.day.parts.filter(function(x){return x.era===key;})[0];
        if(!part)return;part.covered+=p.duration;part.coveredTokens+=p.tokens;
        part.constrainedLoss+=total>0?loss*p.tokens/total:0;
      });
    }
  });
  days.forEach(function(d){
    d.parts.forEach(function(p){var c=calibrations[p.era],uncovered=Math.max(0,p.tokens-p.coveredTokens);
      p.loss=!p.mismatch&&c.ratio!==null?p.constrainedLoss+uncovered*c.ratio/1e8:null;
      p.coverage=Math.min(1,p.covered/(p.end-p.start));
    });
    var p=d.parts[0];d.plan=d.parts.length===1?p.plan:null;
    d.loss=d.parts.length===1?p.loss:null;
    d.coverage=d.parts.length===1?p.coverage:0;
    d.source=d.parts.length>1?'mixed-plan':!p?'unavailable':p.mismatch?'source-mismatch':p.assumedPlan?'plan-assumed':p.covered>0?'snapshot-constrained':'token-imputed';
    // Capacity ratios are explicit account-bound user input, not inferred
    // from a plan's marketing name or from 5-hour/session percentages.
    var equivalent=0,weight=0,converted=false,complete=d.parts.length>0;
    d.parts.forEach(function(part){
      var native=part.plan===state.plan&&part.start>=state.planSince;
      var mapped=capacityRule&&part.plan===capacityRule.fromPlan&&part.end<=capacityRule.fromBefore;
      if(part.loss===null||!native&&!mapped){complete=false;return;}
      var scale=native?1:capacityRule.consumptionScale;
      part.equivalentLoss=part.loss*scale;part.capacityScale=scale;
      equivalent+=part.equivalentLoss;converted=converted||!native;
      var reliability=.15+.35*part.coverage;
      if(!native){reliability*=.5;if(part.assumedPlan)reliability*=.5;}
      weight+=reliability*(part.end-part.start)/(d.end-d.start);
    });
    d.equivalentLoss=complete?equivalent:null;d.equivalentWeight=complete?weight:0;
    d.capacityConverted=complete&&converted;
  });
  return {version:1,source:'quota-reconstruction',durationMins:10080,accountId:state.scope,savedAt:now,profileSavedAt:profile.savedAt,
    plan:state.plan,planSince:state.planSince,dayBasis:'profile-label/Asia-Shanghai-estimate',
    capacityRule:capacityRule,calibrations:calibrations,days:days,intervals:intervals};
}
function forecastReconstructedQuota(reconstruction,state,now,horizon) {
  if(!reconstruction||reconstruction.accountId!==state.scope||reconstruction.plan!==state.plan||
      reconstruction.planSince!==state.planSince||reconstruction.savedAt>now+60||now-reconstruction.profileSavedAt>21600)return null;
  var calibration=reconstruction.calibrations[state.plan+'@'+state.planSince];
  if(!calibration||calibration.intervals<3||calibration.exposure<1.5||now-calibration.latest>7*86400||
      !(calibration.lowRatio>0)||calibration.highRatio/calibration.lowRatio>10)return null;
  var days=reconstruction.days.filter(function(d){return d.end<=now&&d.equivalentWeight>0&&d.equivalentLoss!==null;});
  var calendar=afDayTypeFit(days.map(function(d){return {start:d.start,end:d.end,loss:d.equivalentLoss,weight:d.equivalentWeight};}),now);
  var rows=days.map(function(d){return {loss:d.equivalentLoss,exposure:afCalendarExposure(d.start,d.end,calendar),
    weight:d.equivalentWeight*Math.pow(2,-(now-d.end)/86400/7)};});
  if(rows.length<3)return null;
  var total=0,exposure=0,loss=0;rows.forEach(function(r){total+=r.weight;exposure+=r.weight*r.exposure;loss+=r.loss*r.weight;});
  var future=afCalendarExposure(now,now+horizon*86400,calendar),adjustment=future/horizon*total/exposure;
  var mid=loss/exposure*future;
  return {basis:'quotaReconstruction',typicalConsumption:mid,
    lowConsumption:Math.min(mid,qhQuantile(rows,'loss',.25)*.75*horizon*adjustment),
    highConsumption:Math.max(mid,qhQuantile(rows,'loss',.9)*1.25*horizon*adjustment),
    dayType:calendar,
    estimatedDays:rows.length,capacityConvertedDays:days.filter(function(d){return d.capacityConverted;}).length,
    calibrationIntervals:calibration.intervals};
}
