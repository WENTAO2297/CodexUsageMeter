// Shanghai daily sources retain their real date boundaries. Legacy UTC data
// remains an unseasonal fallback, never silently converted to local dates.
function afVPNCalendar(now,horizon,shanghai){
  if(shanghai)return afShanghaiCalendar(now,horizon);
  var steps=[],elapsed=0,cursor=now;
  while(elapsed<horizon-1e-9){
    var duration=Math.min(horizon-elapsed,((Math.floor(cursor/AF_DAY)+1)*AF_DAY-cursor)/AF_DAY);
    steps.push({duration:duration,weekday:Math.floor(cursor/AF_DAY)%7});
    elapsed+=duration;cursor=now+elapsed*AF_DAY;
  }
  return steps;
}
function afVPNWindow(rows,latest,length){
  var selected=rows.filter(function(r){return r.start>=latest-(length-1)*AF_DAY;});
  var span=rows.length?(latest-rows[0].start)/AF_DAY+1:length;
  return {rows:selected,coverage:selected.length/Math.min(length,span),rate:afRate(selected,0,latest)};
}
function afVPNAdjustPath(path,front){
  if(!front)return path;
  var out=[],elapsed=0;
  path.forEach(function(step){
    var near=Math.max(0,Math.min(step.duration,front.days-elapsed)),rest=step.duration-near;
    if(near>0)out.push({duration:near,amount:step.amount*near/step.duration*(1-front.strength)+front.rate*near*front.strength});
    if(rest>1e-9)out.push({duration:rest,amount:step.amount*rest/step.duration});
    elapsed+=step.duration;
  });
  return out;
}
function afTrafficChange(s,rows,now,shanghai){
  if(rows.length<7||!s.last||now<s.last.at||now-s.last.at>600)return null;
  var samples=s.balances.filter(function(b){return b[0]>=now-2*AF_DAY&&b[0]<=now;}),segments=[],start=samples[0];
  if(samples.length<4)return null;
  samples.slice(1).forEach(function(b){
    var hours=(b[0]-start[0])/3600;
    if(hours<6)return;
    if(hours<=18&&b[1]>=start[1]&&b[2]===start[2])segments.push({start:start[0],end:b[0],loss:b[1]-start[1]});
    start=b;
  });
  var daily=rows.map(function(r){return r.loss/((r.end-r.start)/AF_DAY);});
  var median=afQuantile(daily,.5),mad=afQuantile(daily.map(function(v){return Math.abs(v-median);}),.5);
  var threshold=Math.max(2.5*mad,median*.35,s.last.total*.0001);
  function expected(r){
    var cursor=r.start,sum=0,offset=shanghai?28800:0;
    while(cursor<r.end){
      var edge=Math.min(r.end,(Math.floor((cursor+offset)/AF_DAY)+1)*AF_DAY-offset),weekday=Math.floor((cursor+offset)/AF_DAY)%7;
      var same=rows.filter(function(d){return Math.floor((d.start+offset)/AF_DAY)%7===weekday;});
      var rate=same.length>=3?afMean(same.map(function(d){return d.loss;})):median;
      sum+=rate*(edge-cursor)/AF_DAY;cursor=edge;
    }
    return sum/((r.end-r.start)/AF_DAY);
  }
  function run(direction){
    var out=[];
    for(var i=segments.length-1;i>=0;i--){
      var r=segments[i],rate=r.loss/((r.end-r.start)/AF_DAY),normal=expected(r);
      if(out.length&&r.end!==out[0].start)break;
      if(direction==='up'?rate<=normal+threshold:rate>=Math.max(0,normal-threshold))break;
      out.unshift(r);
    }
    if(!out.length||out[out.length-1].end<now-6*3600)return null;
    var exposure=(out[out.length-1].end-out[0].start)/AF_DAY;
    // A single burst / quiet night is not a new monthly rate. Partial
    // evidence changes only the near term, progressively, without a jump.
    if(direction==='up'?(out.length<2||exposure<.5):(out.length<4||exposure<1))return null;
    var strength=Math.min(1,direction==='up'?(exposure-.25)/.75:exposure-.5);
    return {direction:direction,rate:afRate(out,0,now),exposure:exposure,rows:out,
      start:out[0].start,end:out[out.length-1].end,strength:strength,confirmed:strength>=1};
  }
  return run('up')||run('down');
}
function afTrafficModels(s,now,horizon){
  // Treat the last 48h as provisional. Offline time cannot settle a report.
  var mature=s.days.filter(function(d){return d.at+AF_DAY<=d.lastSeen-2*AF_DAY&&d.lastSeen<=now&&d.at>=now-180*AF_DAY;});
  var local=(s.calendarDays||[]).filter(function(d){return d.at+AF_DAY<=d.lastSeen-2*AF_DAY&&d.lastSeen<=now&&d.at>=now-180*AF_DAY;});
  var shanghai=local.length>=7&&now-local[local.length-1].at<=5*AF_DAY;
  if(shanghai)mature=local;
  if(mature.length<3||now-mature[mature.length-1].at>5*AF_DAY)return {models:{},rows:[]};
  var latest=mature[mature.length-1].at,days=mature.filter(function(d){return d.at>=latest-34*AF_DAY;});
  var rows=days.map(function(d){return {start:d.at,end:d.at+AF_DAY,loss:d.value};});
  var dayType=shanghai?afDayTypeFit(rows,now):null;
  var week=afVPNWindow(rows,latest,7),month=afVPNWindow(rows,latest,28),models={},baselines={};
  var span=(latest-rows[0].start)/AF_DAY+1,coverage=rows.length/span;
  var recentOK=week.rows.length>=3&&week.coverage>=.8;
  if(recentOK)baselines.mean7=week.rate*horizon;
  if(span>=23&&month.coverage>=.8)baselines.mean28=month.rate*horizon;
  if(baselines.mean7!==undefined&&baselines.mean28!==undefined)baselines.simple=(baselines.mean7+baselines.mean28)/2;
  // Short/medium views adapt, then decay back toward the long SES level.
  // Gaps are not compressed away: ETS needs a contiguous daily tail.
  var tail=[rows[rows.length-1]];
  for(var i=rows.length-2;i>=0&&rows[i].end===tail[0].start;i--)tail.unshift(rows[i]);
  // Retain the established level fit. The calendar redistributes use around
  // that long level; it must not refit a different monthly mean from a short
  // and partially observed seasonal sample.
  var fit=recentOK?afVPNFitMultiSES(tail.map(function(r){return r.loss;})):null;
  if(fit){
    var model={rate:fit.members[fit.members.length-1].level,components:fit.members,
      lag:Math.max(0,(now-tail[tail.length-1].end)/AF_DAY)};
    if(shanghai)model.shanghai=true;if(dayType)model.dayType=dayType;
    model.center=afVPNModelTotal(model,now,horizon);models.multiSES=model;
  }
  else if(recentOK){var pooled={rate:week.rate};
    if(shanghai)pooled.shanghai=true;if(dayType)pooled.dayType=dayType;
    pooled.center=afVPNModelTotal(pooled,now,horizon);models.pooled=pooled;
  }
  var change=recentOK?afTrafficChange(s,rows,now,shanghai):null;
  if(change){
    var front={days:Math.min(horizon,Math.max(1,Math.min(2,change.exposure))),rate:change.rate,strength:change.strength};
    Object.keys(models).forEach(function(k){var model=models[k];model.front=front;
      model.center+=(front.rate*front.days-afVPNModelTotal(model,now,front.days))*front.strength;
    });
  }
  return {models:models,rows:rows,recentChange:change,coverageOK:recentOK&&coverage>=.8,
    recentCoverage:week.coverage,monthCoverage:month.coverage,baselines:baselines};
}
function afVPNSample(model,built,horizon,remaining,now,random,point){
  var path=null,calendar=afVPNCalendar(now,horizon,model.shanghai),rows=built.rows;
  if(model.paths&&model.paths.length)path=model.paths[Math.floor(random()*model.paths.length)];
  else if(model.weekdayRates){
    path=calendar.map(function(step){
      var same=rows.filter(function(r){return Math.floor(r.start/AF_DAY)%7===step.weekday;});
      var mean=afMean(same.map(function(r){return r.loss;}));
      var ratio=mean>0?same[Math.floor(random()*same.length)].loss/mean:1;
      return {duration:step.duration,amount:model.weekdayRates[step.weekday]*ratio*step.duration};
    });
  }else if(afNumber(model.rate)){
    var base=afMean(rows.map(function(r){return r.loss/((r.end-r.start)/AF_DAY)/afDayTypeFactor(model.dayType,r.start);}));
    var index=-1,left=0,elapsedPath=0;
    path=calendar.map(function(step){
      // Calendar-date rates do not depend on where a requested horizon ends.
      // A shorter forecast therefore cannot shift an earlier crossing time.
      var rate=afVPNFutureRate(model,elapsedPath,now+elapsedPath*AF_DAY);elapsedPath+=step.duration;
      if(!point&&base>0&&rows.length){
        if(index<0){index=Math.floor(random()*rows.length);left=2;}
        var row=rows[index];rate*=row.loss/((row.end-row.start)/AF_DAY)/afDayTypeFactor(model.dayType,row.start)/base;
        index++;left--;if(!left||!rows[index]||rows[index].start!==row.end)index=-1;
      }
      return {duration:step.duration,amount:rate*step.duration};
    });
  }
  if(path){
    path=afVPNAdjustPath(path,model.front);
    var loss=0,elapsed=0,crossing=null;
    path.forEach(function(step){
      if(crossing===null&&loss+step.amount>=remaining)
        crossing=elapsed+(step.amount>0?step.duration*Math.max(0,remaining-loss)/step.amount:0);
      loss+=step.amount;elapsed+=step.duration;
    });
    return {loss:loss,crossing:crossing,timingKnown:Math.abs(elapsed-horizon)<1e-6};
  }
  // A total can establish risk, but says nothing about WHEN it was spent.
  // Do not place an unknown crossing at the reset or divide balance by mean.
  var total=model.center;
  if(model.samples&&model.samples.length)total=model.samples[Math.floor(random()*model.samples.length)];
  else if(model.quantiles)total=afQuantile(model.quantiles,random());
  return {loss:total,crossing:null,timingKnown:false};
}
function afVPNForecast(s,now,horizon,remaining){
  var result=afDistribution(s,afTrafficModels(s,now,horizon),horizon,remaining,now);
  if(!result)return null;
  var cases=[{horizon:horizon,forecast:result}];
  [Math.max(0,horizon-1),horizon+1].forEach(function(h){
    cases.push({horizon:h,forecast:h>0?afDistribution(s,afTrafficModels(s,now,h),h,remaining,now):
      {verdict:'safe',timingAvailable:false}});
  });
  result.resetSensitive=cases.some(function(item){return !item.forecast||item.forecast.verdict!==result.verdict;});
  result.resetStable=!result.resetSensitive;result.resetLeadRange=null;
  var leads=[];
  var timed=cases.every(function(item){var f=item.forecast,r=f&&f.crossingRange;
    if(!f||f.verdict!=='risk'||f.evidence==='limited'||!f.timingAvailable||!r||r[1]>=item.horizon-1e-6)return false;
    leads.push(item.horizon-r[1],item.horizon-r[0]);return true;
  });
  if(timed){
    result.resetLeadRange=[Math.min.apply(null,leads),Math.max.apply(null,leads)];
    if(result.resetLeadRange[1]-result.resetLeadRange[0]>Math.max(.75,Math.min(2,horizon*.15))+1e-6)result.precision='qualitative';
  }else result.precision='qualitative';
  return result;
}
