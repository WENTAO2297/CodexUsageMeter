// Pure forecasting. Shanghai calendar effects have independently scored versions.
// No AppKit, files, network or wall-clock reads.
var AF_VERSION=5,AF_VPN_VERSION=7,AF_DAY=86400,AF_RETENTION=180*86400,AF_MAX_FORECASTS=1200,AF_MAX_BYTES=2097152;
var AF_MODELS=['pooled','recent','stable','slow','blocks','week','level','token'];
var AF_QUOTA_MODELS=AF_MODELS.concat(['reconstructed']);
var AF_VPN_MODELS=AF_MODELS.concat(['ses','multiSES']);
function afVersion(kind){return kind==='vpn'?AF_VPN_VERSION:AF_VERSION;}
function afNumber(n){return typeof n==='number'&&isFinite(n)&&n>=0;}
function afTime(n){return afNumber(n)&&n>0;}
function afQuantile(a,p){if(!a.length)return null;var s=a.slice().sort(function(x,y){return x-y;}),k=(s.length-1)*p;
  return s[Math.floor(k)]+(s[Math.ceil(k)]-s[Math.floor(k)])*(k-Math.floor(k));}
function afMean(a){return a.length?a.reduce(function(s,v){return s+v;},0)/a.length:0;}
function afBand(days){return days<=1?1:days<=3?3:days<=7?7:days<=14?14:31;}
function afNew(kind,scope,now){var s={version:afVersion(kind),kind:kind,scope:scope,savedAt:now,plan:'',planSince:0,
  anchors:[],days:[],balances:[],forecasts:[],last:null,epoch:1,alert:null};
  if(kind==='vpn')s.calendarDays=[];return s;}
function afClone(o){return JSON.parse(JSON.stringify(o));}
function afNormalize(raw,kind,scope,now){
  if(!raw||(kind==='vpn'?[3,4,5,6,AF_VPN_VERSION]:[3,4,AF_VERSION]).indexOf(raw.version)<0||raw.kind!==kind||raw.scope!==scope||!scope||scope.length>256||
      !afTime(raw.savedAt)||raw.savedAt>now+60||now-raw.savedAt>AF_RETENTION||
      !Array.isArray(raw.anchors)||raw.anchors.length>1600||!Array.isArray(raw.days)||raw.days.length>182||
      !Array.isArray(raw.forecasts)||raw.forecasts.length>(raw.version===3?400:AF_MAX_FORECASTS)||!afNumber(raw.epoch)||raw.epoch%1||raw.epoch<1||
      typeof raw.plan!=='string'||raw.plan.length>32||!afNumber(raw.planSince)||raw.planSince>now+60)return null;
  var out=afNew(kind,scope,raw.savedAt),previous=0,valid=true;
  out.plan=raw.plan;out.planSince=raw.planSince;out.epoch=raw.epoch;
  raw.anchors.forEach(function(a){
    if(!a||!afTime(a.at)||a.at<=previous||a.at>now+60||!validForecastRemaining(a.remaining)||
        !afTime(a.resetAt)||a.resetAt<=a.at||typeof a.plan!=='string'||a.plan.length>32||
        (a.boundary!==undefined&&typeof a.boundary!=='boolean'))valid=false;
    else if(a.at>=now-AF_RETENTION)out.anchors.push({at:a.at,remaining:a.remaining,resetAt:a.resetAt,plan:a.plan,boundary:!!a.boundary});
    previous=a&&a.at;
  });previous=0;
  raw.days.forEach(function(d){
    if(!d||!afTime(d.at)||d.at%AF_DAY||d.at<=previous||d.at>now||!afNumber(d.value)||d.value>Number.MAX_SAFE_INTEGER||d.value%1||
        !afTime(d.firstSeen)||!afTime(d.changedAt)||!afTime(d.lastSeen)||d.firstSeen>d.changedAt||d.changedAt>d.lastSeen||
        d.lastSeen>now+60||!afNumber(d.revision)||d.revision%1)valid=false;
    else if(d.at>=now-AF_RETENTION)out.days.push({at:d.at,value:d.value,firstSeen:d.firstSeen,changedAt:d.changedAt,lastSeen:d.lastSeen,revision:d.revision});
    previous=d&&d.at;
  });
  raw.forecasts.forEach(function(f){
    var entry=afReadForecast(f,raw.version===3,kind,raw.last,now);
    if(!entry)valid=false;else if(entry.at>=now-AF_RETENTION)out.forecasts.push(entry);
  });
  if(kind==='vpn'&&raw.version===AF_VPN_VERSION&&raw.calendarDays!==undefined){
    if(!Array.isArray(raw.calendarDays)||raw.calendarDays.length>182)return null;
    previous=0;raw.calendarDays.forEach(function(d){
      if(!d||!afTime(d.at)||(d.at+28800)%AF_DAY||d.at<=previous||d.at>now||!afNumber(d.value)||d.value>Number.MAX_SAFE_INTEGER||d.value%1||
          !afTime(d.firstSeen)||!afTime(d.changedAt)||!afTime(d.lastSeen)||d.firstSeen>d.changedAt||d.changedAt>d.lastSeen||
          d.lastSeen>now+60||!afNumber(d.revision)||d.revision%1)valid=false;
      else if(d.at>=now-AF_RETENTION)out.calendarDays.push({at:d.at,value:d.value,firstSeen:d.firstSeen,
        changedAt:d.changedAt,lastSeen:d.lastSeen,revision:d.revision});
      previous=d&&d.at;
    });
  }
  if(raw.version>=4){
    if(!Array.isArray(raw.balances)||raw.balances.length>200)return null;
    previous=0;
    raw.balances.forEach(function(b){
      if(!Array.isArray(b)||b.length!==3||!afTime(b[0])||b[0]<=previous||b[0]>now+60||
          !afNumber(b[1])||!afNumber(b[2])||b[1]>b[2])valid=false;
      else if(b[0]>=now-7*AF_DAY)out.balances.push(b.slice());
      previous=b[0];
    });
  }
  if(raw.last){var l=raw.last;
    if(!afTime(l.at)||l.at>now+60||!afNumber(l.used)||!afNumber(l.total)||!afNumber(l.remaining)||
        l.remaining>l.total||Math.abs(l.remaining-Math.max(0,l.total-l.used))>(kind==='quota'?1e-8:0)||!afNumber(l.resetAt)||
        (l.resetDays!==null&&(!afNumber(l.resetDays)||l.resetDays%1)))valid=false;
    else out.last={at:l.at,used:l.used,total:l.total,remaining:l.remaining,resetAt:l.resetAt,resetDays:l.resetDays};
  }
  if(raw.version===afVersion(kind)&&raw.alert&&['safe','tight','risk'].indexOf(raw.alert.value)>=0&&afNumber(raw.alert.count)&&raw.alert.count<=3&&afTime(raw.alert.at)&&raw.alert.at<=now)
    out.alert={value:raw.alert.value,count:raw.alert.count,at:raw.alert.at};
  return valid?out:null;
}
function afPrune(s,now){
  s.anchors=s.anchors.filter(function(a){return a.at>=now-AF_RETENTION;}).slice(-1600);
  s.days=s.days.filter(function(d){return d.at>=now-AF_RETENTION;}).slice(-182);
  if(s.kind==='vpn')s.calendarDays=(s.calendarDays||[]).filter(function(d){return d.at>=now-AF_RETENTION;}).slice(-182);
  s.balances=s.balances.filter(function(b){return b[0]>=now-7*AF_DAY;}).slice(-200);
  s.forecasts=s.forecasts.filter(function(f){return f.at>=now-AF_RETENTION;}).slice(-AF_MAX_FORECASTS);
  s.savedAt=now;return s;
}
function afQuotaObserve(s,w,plan,now){
  if(!s||s.kind!=='quota'||!plan||!validForecastRemaining(w.remaining)||!validForecastWindow(w,now)||w.durationMins!==10080)return s;
  if(s.last&&now<s.last.at)return afNew('quota',s.scope,now);
  var changed=s.plan&&s.plan!==plan;
  if(changed){s=afNew('quota',s.scope,now);s.planSince=now;}
  s.plan=plan;if(!s.planSince)s.planSince=now;
  var prior=s.last,boundary=prior&&(Math.abs(prior.resetAt-w.resetAt)>600||w.remaining>prior.remaining+.05);
  if(boundary){afCloseTargets(s,prior,now,now>=prior.resetAt&&w.resetAt>prior.resetAt+600);s.epoch++;s.alert=null;}
  var a={at:now,remaining:w.remaining,resetAt:w.resetAt,plan:plan,boundary:!!boundary},tail=s.anchors[s.anchors.length-1];
  // One anchor per 6h plus exact boundaries; interval origin is never replaced.
  if(tail&&tail.at===now)s.anchors[s.anchors.length-1]=a;
  else if(tail&&!tail.boundary&&!boundary&&s.anchors.length>1&&Math.floor(tail.at/21600)===Math.floor(now/21600))s.anchors[s.anchors.length-1]=a;
  else s.anchors.push(a);
  s.last={at:now,used:100-w.remaining,total:100,remaining:w.remaining,resetAt:w.resetAt,resetDays:null};
  afResolve(s,s.last,now);return afPrune(s,now);
}
function afSeedQuota(s,history,plan,now){
  if(!s||!history||history.accountId!==s.scope||history.savedAt>now||now-history.savedAt>21600)return s;
  var latest=history.anchors[history.anchors.length-1];if(!latest||latest.plan!==plan)return s;
  if(s.plan&&s.plan!==plan)return s;
  if(!s.plan){s.plan=plan;s.planSince=latest.planSince;}
  // The reader supplies the last known plan boundary, including on first
  // asynchronous import after startup. Never import across a later boundary.
  if(s.last&&Math.abs(s.last.resetAt-latest.resetAt)<=600&&100-s.last.remaining>=latest.used-.05)
    s.planSince=latest.planSince;
  var byTime={},prior=null;
  history.anchors.forEach(function(a){if(a.plan===plan&&a.at>=s.planSince&&a.at<=now){
    byTime[a.at]={at:a.at,remaining:100-a.used,resetAt:a.resetAt,plan:plan,
      boundary:!!(prior&&(a.segment!==prior.segment||a.used<prior.used-.05||Math.abs(a.resetAt-prior.resetAt)>600))};prior=a;}});
  s.anchors.forEach(function(a){if(byTime[a.at]&&byTime[a.at].boundary)a.boundary=true;byTime[a.at]=a;});
  s.anchors=Object.keys(byTime).map(function(k){return byTime[k];}).sort(function(a,b){return a.at-b.at;});
  afRefineQuotaTargets(s,now);return afPrune(s,now);
}
function afQuotaIntervals(s,now){
  var out=[],start=null;
  s.anchors.forEach(function(a){
    if(a.at>now||a.at<s.planSince||a.plan!==s.plan){start=null;return;}
    if(!start||a.boundary||Math.abs(a.resetAt-start.resetAt)>600||a.remaining>start.remaining+.05){start=a;return;}
    var span=a.at-start.at;
    if(span<43200)return;
    if(span<=129600&&a.remaining>.5&&start.remaining>.5)
      out.push({start:start.at,end:a.at,loss:Math.max(0,start.remaining-a.remaining)});
    start=a;
  });return out;
}
function afTrafficObserve(s,snapshot,now){
  if(!s||s.kind!=='vpn'||!snapshot)return s;
  if(s.last&&now<s.last.at)return afNew('vpn',s.scope,now);
  var p=s.last,boundary=p&&(snapshot.totalBytes!==p.total||snapshot.usedBytes<p.used||
    (p.resetDays!==null&&snapshot.resetDays!==null&&snapshot.resetDays>p.resetDays+1));
  if(boundary){afCloseTargets(s,p,now,false);s.epoch++;s.alert=null;s.balances=[];
    if(snapshot.totalBytes!==p.total)s.forecasts=[];}
  s.last={at:now,used:snapshot.usedBytes,total:snapshot.totalBytes,remaining:snapshot.remainingBytes,resetAt:0,resetDays:snapshot.resetDays};
  var sample=[now,snapshot.usedBytes,snapshot.totalBytes],tail=s.balances[s.balances.length-1];
  if(tail&&tail[0]===now)s.balances[s.balances.length-1]=sample;
  else if(tail&&s.balances.length>1&&Math.floor(tail[0]/3600)===Math.floor(now/3600))s.balances[s.balances.length-1]=sample;
  else s.balances.push(sample);
  afResolve(s,s.last,now);return afPrune(s,now);
}
function afTrafficMerge(s,history,now){
  if(!s||!history||history.state!=='ready'||history.fetchedAt/1000>now||now-history.fetchedAt/1000>7*3600)return s;
  var at=history.fetchedAt/1000,byTime={};s.days.forEach(function(d){byTime[d.at]=d;});
  history.days.forEach(function(d){
    var old=byTime[d[0]];
    if(old&&old.lastSeen>at)return;
    byTime[d[0]]={at:d[0],value:d[1],firstSeen:old?old.firstSeen:at,
      changedAt:!old||old.value!==d[1]?at:old.changedAt,lastSeen:at,revision:old?old.revision+(old.value!==d[1]?1:0):0};
  });
  // A missing date inside a successful response range is unknown, not zero
  // and not a silently reused old report. Older dates outside retention stay.
  if(history.days.length){var present={};history.days.forEach(function(d){present[d[0]]=true;});
    var first=history.days[0][0],last=history.days[history.days.length-1][0];
    Object.keys(byTime).forEach(function(k){if(Number(k)>=first&&Number(k)<=last&&!present[k])delete byTime[k];});}
  s.days=Object.keys(byTime).map(function(k){return byTime[k];}).sort(function(a,b){return a.at-b.at;});
  // Only source-validated local midnights that are also Shanghai midnights
  // may learn weekday effects. Never relabel an old UTC aggregate as local.
  if(history.calendarBasis==='local-midnight'&&history.calendarState==='ready'&&history.calendarDays&&
      history.calendarDays.every(function(d){return (d[0]+28800)%AF_DAY===0;})){
    var local={};(s.calendarDays||[]).forEach(function(d){local[d.at]=d;});
    history.calendarDays.forEach(function(d){var old=local[d[0]];
      if(old&&old.lastSeen>at)return;
      local[d[0]]={at:d[0],value:d[1],firstSeen:old?old.firstSeen:at,changedAt:!old||old.value!==d[1]?at:old.changedAt,
        lastSeen:at,revision:old?old.revision+(old.value!==d[1]?1:0):0};
    });
    if(history.calendarDays.length){var reported={};history.calendarDays.forEach(function(d){reported[d[0]]=true;});
      var begin=history.calendarDays[0][0],end=history.calendarDays[history.calendarDays.length-1][0];
      Object.keys(local).forEach(function(k){if(Number(k)>=begin&&Number(k)<=end&&!reported[k])delete local[k];});}
    s.calendarDays=Object.keys(local).map(function(k){return local[k];}).sort(function(a,b){return a.at-b.at;});
  }
  return afPrune(s,now);
}
function afRate(rows,halfLife,now){
  var loss=0,time=0;rows.forEach(function(r){var w=halfLife?Math.pow(2,-(now-(r.start+r.end)/2)/AF_DAY/halfLife):1;
    loss+=w*r.loss;time+=w*(r.end-r.start)/AF_DAY;});return time>0?loss/time:0;
}
// Modern Shanghai dates use UTC+08:00, independent of the Mac's timezone.
// This is a weekday/weekend model, not a guessed public-holiday calendar.
function afShanghaiCalendar(now,horizon){
  var out=[],cursor=now,end=now+horizon*AF_DAY;
  while(cursor<end-1e-6){var day=Math.floor((cursor+28800)/AF_DAY),edge=Math.min(end,(day+1)*AF_DAY-28800);
    var weekday=new Date(day*AF_DAY*1000).getUTCDay();
    out.push({start:cursor,duration:(edge-cursor)/AF_DAY,weekend:weekday===0||weekday===6,
      week:day-(weekday+6)%7});cursor=edge;
  }return out;
}
function afDayTypeFactor(profile,at){
  if(!profile)return 1;
  var weekday=new Date((at+28800)*1000).getUTCDay();
  return weekday===0||weekday===6?profile.weekend:profile.workday;
}
function afCalendarExposure(start,end,profile){
  if(!profile)return (end-start)/AF_DAY;
  return afShanghaiCalendar(start,(end-start)/AF_DAY).reduce(function(sum,d){
    return sum+d.duration*(d.weekend?profile.weekend:profile.workday);},0);
}
function afDayTypeFit(rows,now){
  var weeks={};
  rows.forEach(function(r){
    if(r.end>now||r.start<now-56*AF_DAY||r.end<=r.start)return;
    var steps=afShanghaiCalendar(r.start,(r.end-r.start)/AF_DAY);
    if(!steps.length||steps.some(function(d){return d.week!==steps[0].week;}))return;
    var a=0,b=0;steps.forEach(function(d){if(d.weekend)b+=d.duration;else a+=d.duration;});
    var reliability=r.weight===undefined?1:r.weight,w=reliability/(a+b);
    var g=weeks[steps[0].week]||(weeks[steps[0].week]={at:r.end,aa:0,ab:0,bb:0,ay:0,by:0,a:0,b:0});
    g.aa+=w*a*a;g.ab+=w*a*b;g.bb+=w*b*b;g.ay+=w*a*r.loss;g.by+=w*b*r.loss;
    g.a+=reliability*a;g.b+=reliability*b;g.at=Math.max(g.at,r.end);
  });
  var ratios=[];
  Object.keys(weeks).forEach(function(k){var g=weeks[k],det=g.aa*g.bb-g.ab*g.ab;
    // Interval exposure, not fabricated per-day labels. Weak or collinear
    // workday/weekend mixtures cannot identify two different rates.
    if(g.a<.25||g.b<.25||det<=1e-8*g.aa*g.bb)return;
    var work=(g.ay*g.bb-g.by*g.ab)/det,weekend=(g.by*g.aa-g.ay*g.ab)/det;
    if(!(work>0)||weekend<0)return;
    ratios.push({log:Math.log(Math.max(.25,Math.min(4,weekend/work))),
      weight:Math.min(1,g.a/3,g.b)*Math.pow(2,-(now-g.at)/AF_DAY/28)});
  });
  if(ratios.length<2)return null;
  ratios.sort(function(a,b){return a.log-b.log;});
  var mass=ratios.reduce(function(s,r){return s+r.weight;},0),sum=0,median=ratios[ratios.length-1].log;
  for(var i=0;i<ratios.length;i++){sum+=ratios[i].weight;if(sum>=mass/2){median=ratios[i].log;break;}}
  // Shrink toward no calendar effect: estimates and sparse intervals carry
  // less exposure. A single exceptional week cannot define every weekend.
  var strength=mass/(mass+3),ratio=Math.exp(median*strength),workday=7/(5+2*ratio);
  return {zone:'Asia/Shanghai',workday:workday,weekend:workday*ratio,ratio:ratio,
    weeks:ratios.length,effectiveWeeks:mass,strength:strength};
}
function afCalendarRate(rows,halfLife,now,profile){
  if(!profile)return afRate(rows,halfLife,now);
  var loss=0,time=0;rows.forEach(function(r){var w=halfLife?Math.pow(2,-(now-(r.start+r.end)/2)/AF_DAY/halfLife):1;
    loss+=w*r.loss;time+=w*afCalendarExposure(r.start,r.end,profile);});
  return time>0?loss/time:0;
}
function afQuotaModels(s,now,horizon,original,token,reconstructed){
  var rows=afQuotaIntervals(s,now).filter(function(r){return r.end>=now-28*AF_DAY;}),models={},span=0;
  var dayType=afDayTypeFit(rows,now),future=afCalendarExposure(now,now+horizon*AF_DAY,dayType);
  rows.forEach(function(r){span+=(r.end-r.start)/AF_DAY;});
  if(rows.length>=2&&span>=1){
    [['pooled',0],['recent',3],['stable',7],['slow',14]].forEach(function(p){
      var model={center:afCalendarRate(rows,p[1],now,dayType)*future};
      if(dayType)model.dayType=dayType;models[p[0]]=model;
    });
  }
  if(original&&original.basis==='history'&&original.adaptiveSamples&&original.adaptiveSamples.length>=3)
    models.blocks={center:original.typicalConsumption,samples:original.adaptiveSamples};
  // Local token conversions cannot override available account-wide evidence.
  if(!Object.keys(models).length&&token&&token.basis==='tokenHistory')models.token={center:token.typicalConsumption,
    quantiles:[token.lowConsumption,token.typicalConsumption,token.highConsumption]};
  if(reconstructed&&reconstructed.basis==='quotaReconstruction')models.reconstructed={center:reconstructed.typicalConsumption,
    quantiles:[reconstructed.lowConsumption,reconstructed.typicalConsumption,reconstructed.highConsumption],
    estimatedDays:reconstructed.estimatedDays,dayType:reconstructed.dayType||null};
  return {models:models,rows:rows,exposure:span};
}

function afDistribution(s,built,horizon,remaining,now){
  var models=built.models,names=Object.keys(models);if(!names.length||!(horizon>0)||horizon>366)return null;
  var weights=afWeights(s,models,horizon,now),seed=123456789;
  function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
  var rows=built.rows,base=afRate(rows,0,now),out=[],cross=[],byModel={},vpn=s.kind==='vpn',timingKnown=true;
  names.forEach(function(k){byModel[k]=[];});
  for(var i=0;i<256;i++){
    var choose=(i+.5)/256,totalWeight=0,k=names[names.length-1];
    for(var m=0;m<names.length;m++){totalWeight+=weights.weights[names[m]];if(choose<totalWeight){k=names[m];break;}}
    var model=models[k],loss=0,elapsed=0,crossed=null;
    if(vpn){
      // Couple each simulated future across reset +/- one day. Changing the
      // horizon must not reshuffle all later samples into unrelated futures.
      seed=(123456789^((i+1)*2654435761))|0;
      var sample=afVPNSample(model,built,horizon,remaining,now,random);
      loss=sample.loss;crossed=sample.crossing;if(!sample.timingKnown)timingKnown=false;
    }else if(model.paths&&model.paths.length){
      var path=model.paths[Math.floor(random()*model.paths.length)];
      path.forEach(function(step){
        if(crossed===null&&loss+step.amount>=remaining)
          crossed=elapsed+(step.amount>0?step.duration*Math.max(0,remaining-loss)/step.amount:step.duration);
        loss+=step.amount;elapsed+=step.duration;
      });
    }else if(model.quantiles){var p=random(),q=model.quantiles;
      loss=p<.25?q[0]:p<.5?q[0]+(q[1]-q[0])*(p-.25)/.25:p<.9?q[1]+(q[2]-q[1])*(p-.5)/.4:q[2];
      crossed=loss>=remaining?horizon:null;
    }else if(model.samples){loss=model.samples[Math.floor(random()*model.samples.length)];crossed=loss>=remaining?horizon:null;}
    else if(base>0&&rows.length){
      if(model.front){
        loss=model.front.rate*model.front.days;elapsed=model.front.days;
        if(loss>=remaining)crossed=model.front.rate>0?remaining/model.front.rate:elapsed;
      }
      while(elapsed<horizon){var index=Math.floor(random()*rows.length);
        for(var j=0;j<2&&elapsed<horizon;j++){
          // A two-row block must be truly adjacent; never bridge a missing
          // day or wrap the last historical day back to the first.
          var row=rows[index+j];
          if(!row||j&&row.start!==rows[index+j-1].end)break;
          var duration=Math.min((row.end-row.start)/AF_DAY,horizon-elapsed);
          var rate=model.front?model.tailRate:model.center/horizon;
          var amount=row.loss*duration/((row.end-row.start)/AF_DAY)*rate/base;
          if(crossed===null&&loss+amount>=remaining)crossed=elapsed+(amount>0?duration*Math.max(0,remaining-loss)/amount:duration);
          loss+=amount;elapsed+=duration;
        }
      }
    }else {loss=model.center;crossed=loss>=remaining&&loss>0?horizon*remaining/loss:null;}
    loss=Math.max(0,loss);out.push(loss);byModel[k].push(loss);cross.push(crossed===null?horizon+1:crossed);
  }
  var typical=vpn?names.reduce(function(sum,k){return sum+weights.weights[k]*models[k].center;},0):afQuantile(out,.5);
  var low=vpn?Math.min(typical,afQuantile(out,.1)):afQuantile(out,.1),high=Math.max(typical,afQuantile(out,.9));
  var scored=weights.records,adjusted=scored.length>=20;
  if(adjusted){
    var errorsLow=scored.map(function(f){return (afOutcomeBounds(f)[0]-f.point)*horizon/((f.target-f.sourceAt)/AF_DAY);});
    var errorsHigh=scored.map(function(f){return (afOutcomeBounds(f)[1]-f.point)*horizon/((f.target-f.sourceAt)/AF_DAY);});
    low=Math.min(low,Math.max(0,typical+afQuantile(errorsLow,.1)));
    high=Math.max(high,typical+afQuantile(errorsHigh,.9));
  }
  var evidence=afEvidence(s,built,horizon,weights,typical,low,high,cross,remaining,now);
  // Keep an untouched simple baseline for future paired evaluation, even
  // when a sustained change has adjusted the ensemble's pooled candidate.
  var latest=rows.length?Math.max.apply(null,rows.map(function(r){return r.end;})):0;
  var baselineRows=rows.filter(function(r){return r.start>=(s.kind==='vpn'?latest:now)-7*AF_DAY;});
  var baselines=baselineRows.length?{mean7:afRate(baselineRows,0,now)*horizon}:{};
  var result={algorithmVersion:afVersion(s.kind),basis:'adaptive',quality:adjusted?'empiricallyAdjusted':'conditional',
    typicalConsumption:typical,lowConsumption:low,highConsumption:high,horizonDays:horizon,
    pointRemaining:Math.max(0,Math.min(remaining,remaining-typical)),
    remainingRange:[Math.max(0,remaining-high),Math.max(0,remaining-low)],
    verdict:typical>=remaining?'risk':high>=remaining?'tight':'safe',
    crossingDays:afQuantile(cross,.5),crossingRange:evidence.crossingRange,precision:evidence.precision,
    evidence:evidence.level,coverage:evidence.coverage,exposure:evidence.exposure,recentChange:built.recentChange?built.recentChange.direction:null,
    weights:weights.weights,scoredIntervals:weights.independent,
    baselines:baselines,candidatePoints:Object.keys(byModel).reduce(function(result,k){result[k]=afQuantile(byModel[k],.5);return result;},{}),candidates:models};
  if(models.reconstructed)result.reconstructedDays=models.reconstructed.estimatedDays;
  if(vpn){
    result.baselines=afClone(built.baselines||{});result.timingAvailable=timingKnown;
    result.candidatePoints=names.reduce(function(points,k){points[k]=models[k].center;return points;},{});
    if(names.length===1&&afNumber(models[names[0]].rate))
      result.crossingDays=afVPNSample(models[names[0]],built,horizon,remaining,now,random,true).crossing;
    if(!timingKnown){result.crossingDays=null;result.crossingRange=null;result.precision='qualitative';}
  }
  return result;
}
function afEvidence(s,built,horizon,weights,point,low,high,cross,remaining,now) {
  var rows=built.rows,exposure=0,first=now,last=0;
  rows.forEach(function(r){exposure+=(r.end-r.start)/AF_DAY;first=Math.min(first,r.start);last=Math.max(last,r.end);});
  var span=last>first?(last-first)/AF_DAY:0,coverage=span?Math.min(1,exposure/span):0;
  var needed=s.kind==='vpn'?Math.min(14,Math.max(7,Math.ceil(horizon))):Math.min(7,Math.max(2,horizon));
  var supported=rows.length>=3&&exposure>=needed&&coverage>=.8&&(s.kind!=='vpn'||built.coverageOK===true)&&
    (high-low)<=Math.max(point,remaining*.1,1e-9)*1.5;
  var level=supported?(weights.independent>=20?'adjusted':'supported'):'limited';
  var range=[afQuantile(cross,.1),afQuantile(cross,.9)];
  var crossed=cross.filter(function(v){return v<horizon-1e-6;}).length/cross.length,agree=0;
  Object.keys(built.models).forEach(function(k){if(built.models[k].center>=remaining)agree+=weights.weights[k];});
  var precise=supported&&!built.recentChange&&span>=horizon&&crossed>=.8&&agree>=.8&&range[1]<horizon&&
    range[1]-range[0]<=Math.max(.75,Math.min(2,horizon*.15));
  return {level:level,precision:precise?'day':'qualitative',crossingRange:range,exposure:exposure,coverage:coverage};
}
function afAlert(s,result,now){
  if(!result)return result;
  var prior=s.alert;
  // Worsening is immediate. A recovery needs 3 distinct successful reads.
  var rank={safe:0,tight:1,risk:2},next=result.verdict;
  if(prior&&rank[next]<rank[prior.value]){
    if(now>prior.at){prior.count++;prior.at=now;}
    if(prior.count<3)result.warningVerdict=prior.value;else s.alert={value:next,count:0,at:now};
  }else if(!prior||next!==prior.value)s.alert={value:next,count:0,at:now};
  else {prior.count=0;prior.at=now;}
  return result;
}
function afSessionForecast(window,record,context,original){
  if(!original||original.basis!=='recent'||!record||window.durationMins!==300)return original;
  var samples=record.samples,now=context.now;
  function at(time){
    for(var i=1;i<samples.length;i++)if(samples[i][0]>=time&&samples[i-1][0]<=time&&samples[i][0]-samples[i-1][0]<=600)
      return samples[i-1][1]+(samples[i][1]-samples[i-1][1])*(time-samples[i-1][0])/(samples[i][0]-samples[i-1][0]);
    return null;
  }
  // Real 15-minute blocks, including idle. Do not infer continuity on wake.
  var end=samples[samples.length-1],start=Math.max(record.segmentStart,now-3600),blocks=[];
  for(var t=end[0];t-900>=start;t-=900){var a=at(t-900),b=at(t);if(a===null||b===null)return original;blocks.unshift(Math.max(0,a-b)*4);}
  if(blocks.length<2)return original;
  var fast=afMean(blocks.slice(-2)),slow=afMean(blocks),rate=(fast+slow)/2;
  var result=afClone(original),projected=window.remaining-rate*original.horizon/3600,atReset=window.resetAt-now<=original.horizon;
  result.algorithmVersion=AF_VERSION;result.rate=rate;result.projectedRemaining=projected;
  result.status=projected<0?'risk':atReset&&projected<=5?'tight':'unknown';
  result.text='If pace holds: '+(projected<0?'empty within '+forecastDuration(original.horizon):
    '~'+Math.round(projected)+'% '+(atReset?'at reset':'in '+forecastDuration(original.horizon)));
  return result;
}
