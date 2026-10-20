// Frozen production v4 baseline (2026-10-20); tests only, never assembled into the app.
// Version 4 pure forecasting. No AppKit, files, network or wall-clock reads.
var AF_VERSION=4,AF_DAY=86400,AF_RETENTION=180*86400,AF_MAX_FORECASTS=1200,AF_MAX_BYTES=2097152;
var AF_MODELS=['pooled','recent','stable','slow','blocks','week','level','token'];
function afNumber(n){return typeof n==='number'&&isFinite(n)&&n>=0;}
function afTime(n){return afNumber(n)&&n>0;}
function afQuantile(a,p){if(!a.length)return null;var s=a.slice().sort(function(x,y){return x-y;}),k=(s.length-1)*p;
  return s[Math.floor(k)]+(s[Math.ceil(k)]-s[Math.floor(k)])*(k-Math.floor(k));}
function afMean(a){return a.length?a.reduce(function(s,v){return s+v;},0)/a.length:0;}
function afBand(days){return days<=1?1:days<=3?3:days<=7?7:days<=14?14:31;}
function afNew(kind,scope,now){return {version:AF_VERSION,kind:kind,scope:scope,savedAt:now,plan:'',planSince:0,
  anchors:[],days:[],balances:[],forecasts:[],last:null,epoch:1,alert:null};}
function afClone(o){return JSON.parse(JSON.stringify(o));}
function afNormalize(raw,kind,scope,now){
  if(!raw||[3,AF_VERSION].indexOf(raw.version)<0||raw.kind!==kind||raw.scope!==scope||!scope||scope.length>256||
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
  if(raw.version===AF_VERSION){
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
  if(raw.alert&&['safe','tight','risk'].indexOf(raw.alert.value)>=0&&afNumber(raw.alert.count)&&raw.alert.count<=3&&afTime(raw.alert.at)&&raw.alert.at<=now)
    out.alert={value:raw.alert.value,count:raw.alert.count,at:raw.alert.at};
  return valid?out:null;
}
function afPrune(s,now){
  s.anchors=s.anchors.filter(function(a){return a.at>=now-AF_RETENTION;}).slice(-1600);
  s.days=s.days.filter(function(d){return d.at>=now-AF_RETENTION;}).slice(-182);
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
  return afPrune(s,now);
}
function afRate(rows,halfLife,now){
  var loss=0,time=0;rows.forEach(function(r){var w=halfLife?Math.pow(2,-(now-(r.start+r.end)/2)/AF_DAY/halfLife):1;
    loss+=w*r.loss;time+=w*(r.end-r.start)/AF_DAY;});return time>0?loss/time:0;
}
function afQuotaModels(s,now,horizon,original,token){
  var rows=afQuotaIntervals(s,now).filter(function(r){return r.end>=now-28*AF_DAY;}),models={},span=0;
  rows.forEach(function(r){span+=(r.end-r.start)/AF_DAY;});
  if(rows.length>=2&&span>=1){
    [['pooled',0],['recent',3],['stable',7],['slow',14]].forEach(function(p){models[p[0]]={center:afRate(rows,p[1],now)*horizon};});
  }
  if(original&&original.basis==='history'&&original.adaptiveSamples&&original.adaptiveSamples.length>=3)
    models.blocks={center:original.typicalConsumption,samples:original.adaptiveSamples};
  // Local token conversions cannot override available account-wide evidence.
  if(!Object.keys(models).length&&token&&token.basis==='tokenHistory')models.token={center:token.typicalConsumption,
    quantiles:[token.lowConsumption,token.typicalConsumption,token.highConsumption]};
  return {models:models,rows:rows,exposure:span};
}
function afTrafficChange(s,rows,now) {
  if(rows.length<7||!s.last||now<s.last.at||now-s.last.at>600)return null;
  var samples=s.balances.filter(function(b){return b[0]>=now-2*AF_DAY&&b[0]<=now;});
  if(samples.length<4)return null;
  var history=rows.map(function(r){return r.loss/((r.end-r.start)/AF_DAY);});
  var median=afQuantile(history,.5),mad=afQuantile(history.map(function(v){return Math.abs(v-median);}),.5);
  var segments=[],start=samples[0];
  samples.slice(1).forEach(function(b){
    var hours=(b[0]-start[0])/3600;
    if(hours<6)return;
    if(hours<=18&&b[1]>=start[1]&&b[2]===start[2])segments.push({start:start[0],end:b[0],loss:b[1]-start[1]});
    start=b;
  });
  function contiguous(recent){return recent.length>=3&&recent[recent.length-1].end>=now-6*3600&&
    recent.every(function(r,i){return !i||recent[i-1].end===r.start;});}
  var recent=segments.slice(-3);
  if(!contiguous(recent))return null;
  function expected(r){
    var cursor=r.start,sum=0;
    while(cursor<r.end){
      var edge=Math.min(r.end,(Math.floor(cursor/AF_DAY)+1)*AF_DAY),weekday=Math.floor(cursor/AF_DAY)%7;
      var same=rows.filter(function(d){return Math.floor(d.start/AF_DAY)%7===weekday;});
      var rate=same.length>=3?afMean(same.map(function(d){return d.loss;})):median;
      sum+=rate*(edge-cursor)/AF_DAY;cursor=edge;
    }
    return sum/((r.end-r.start)/AF_DAY);
  }
  var threshold=Math.max(2.5*mad,median*.35,s.last.total*.0001);
  var up=recent.every(function(r){return r.loss/((r.end-r.start)/AF_DAY)>expected(r)+threshold;});
  // Slower use needs at least 36 hours, not merely one quiet night. Select
  // enough real contiguous segments even when observations arrive hourly.
  var slow=segments.slice(-6);
  var down=contiguous(slow)&&slow[slow.length-1].end-slow[0].start>=1.5*AF_DAY&&
    slow.every(function(r){return r.loss/((r.end-r.start)/AF_DAY)<Math.max(0,expected(r)-threshold);});
  if(!up&&!down)return null;
  if(!up)recent=slow;
  var exposure=(recent[recent.length-1].end-recent[0].start)/AF_DAY;
  return {direction:up?'up':'down',rate:afRate(recent,0,now),exposure:exposure,rows:recent,
    start:recent[0].start,end:recent[recent.length-1].end};
}
function afTrafficModels(s,now,horizon){
  // Maturity is tied to the observed response time, not time passing offline.
  var mature=s.days.filter(function(d){return d.at+AF_DAY<=d.lastSeen-2*AF_DAY&&d.lastSeen<=now&&d.at>=now-180*AF_DAY;});
  if(mature.length<3||now-mature[mature.length-1].at>5*AF_DAY)return {models:{},rows:[]};
  var latest=mature[mature.length-1].at,days=mature.filter(function(d){return d.at>=latest-34*AF_DAY;});
  var rows=days.map(function(d){return {start:d.at,end:d.at+AF_DAY,loss:d.value};}),models={};
  function mean(n){return afMean(days.filter(function(d){return d.at>=latest-(n-1)*AF_DAY;}).map(function(d){return d.value;}));}
  models.pooled={center:mean(7)*horizon};models.slow={center:mean(28)*horizon};
  models.recent={center:afRate(rows,3,now)*horizon};models.stable={center:afRate(rows,7,now)*horizon};
  var map={};days.forEach(function(d){map[d.at]=d.value;});var blocks=[],paths=[],length=Math.floor(horizon),fraction=horizon-length;
  days.forEach(function(d){var sum=0,okay=true,path=[];
    for(var j=0;j<length+(fraction>0?1:0);j++){
      var value=map[d.at+j*AF_DAY];if(value===undefined){okay=false;break;}
      var duration=j===length?fraction:1;sum+=value*duration;path.push({duration:duration,amount:value*duration});
    }
    if(okay){blocks.push(sum);paths.push(path);}});
  if(blocks.length>=3)models.blocks={center:afQuantile(blocks,.5),samples:blocks,paths:paths};
  var base=(mean(7)+mean(28))/2,week=0,supported=true;
  for(var cursor=now;cursor<now+horizon*AF_DAY;){
    var edge=Math.min(now+horizon*AF_DAY,(Math.floor(cursor/AF_DAY)+1)*AF_DAY);
    var target=Math.floor(cursor/AF_DAY)%7,same=days.filter(function(d){return Math.floor(d.at/AF_DAY)%7===target;});
    if(same.length<3){supported=false;break;}
    var weight=same.length/(same.length+4);
    week+=((1-weight)*base+weight*afQuantile(same.map(function(d){return d.value;}),.5))*(edge-cursor)/AF_DAY;
    cursor=edge;
  }
  if(supported)models.week={center:week};
  var recent=days.filter(function(d){return d.at>=latest-2*AF_DAY;}),older=days.filter(function(d){return d.at<latest-2*AF_DAY;}).slice(-14);
  if(recent.length===3&&recent[2].at-recent[0].at===2*AF_DAY&&older.length>=7){
    var median=afQuantile(older.map(function(d){return d.value;}),.5),mad=afQuantile(older.map(function(d){return Math.abs(d.value-median);}),.5);
    var limit=Math.max(2.5*mad,median*.35,1);
    if(recent.every(function(d){return d.value>median+limit;})||recent.every(function(d){return d.value<median-limit;}))
      models.level={center:afQuantile(recent.map(function(d){return d.value;}),.5)*horizon};
  }
  var change=afTrafficChange(s,rows,now);
  if(change){
    // Only the demonstrated near term changes the common point projection.
    // Persistence over the entire month remains a separate risk scenario.
    var front=Math.min(horizon,Math.max(1,Math.min(2,change.exposure)));
    Object.keys(models).forEach(function(k){
      var model=models[k],oldRate=model.center/horizon,delta=(change.rate-oldRate)*front;
      if(model.samples){model.samples=model.samples.map(function(v){return Math.max(0,v+delta);});model.paths=null;}
      else {model.front={days:front,rate:change.rate,rows:change.rows};model.tailRate=oldRate;}
      model.center=Math.max(0,model.center+delta);
    });
    models.level={center:change.rate*horizon};
  }
  return {models:models,rows:rows,recentChange:change};
}

function afDistribution(s,built,horizon,remaining,now){
  var models=built.models,names=Object.keys(models);if(!names.length||!(horizon>0)||horizon>366)return null;
  var weights=afWeights(s,models,horizon,now),seed=123456789;
  function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
  var rows=built.rows,base=afRate(rows,0,now),out=[],cross=[],byModel={};
  names.forEach(function(k){byModel[k]=[];});
  for(var i=0;i<256;i++){
    var choose=(i+.5)/256,totalWeight=0,k=names[names.length-1];
    for(var m=0;m<names.length;m++){totalWeight+=weights.weights[names[m]];if(choose<totalWeight){k=names[m];break;}}
    var model=models[k],loss=0,elapsed=0,crossed=null;
    if(model.paths&&model.paths.length){
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
  var typical=afQuantile(out,.5),low=afQuantile(out,.1),high=Math.max(typical,afQuantile(out,.9));
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
  return {algorithmVersion:AF_VERSION,basis:'adaptive',quality:adjusted?'empiricallyAdjusted':'conditional',
    typicalConsumption:typical,lowConsumption:low,highConsumption:high,horizonDays:horizon,
    pointRemaining:Math.max(0,Math.min(remaining,remaining-typical)),
    remainingRange:[Math.max(0,remaining-high),Math.max(0,remaining-low)],
    verdict:typical>=remaining?'risk':high>=remaining?'tight':'safe',
    crossingDays:afQuantile(cross,.5),crossingRange:evidence.crossingRange,precision:evidence.precision,
    evidence:evidence.level,coverage:evidence.coverage,exposure:evidence.exposure,recentChange:built.recentChange?built.recentChange.direction:null,
    weights:weights.weights,scoredIntervals:weights.independent,
    baselines:baselines,candidatePoints:Object.keys(byModel).reduce(function(result,k){result[k]=afQuantile(byModel[k],.5);return result;},{}),candidates:models};
}
function afEvidence(s,built,horizon,weights,point,low,high,cross,remaining,now) {
  var rows=built.rows,exposure=0,first=now,last=0;
  rows.forEach(function(r){exposure+=(r.end-r.start)/AF_DAY;first=Math.min(first,r.start);last=Math.max(last,r.end);});
  var span=last>first?(last-first)/AF_DAY:0,coverage=span?Math.min(1,exposure/span):0;
  var needed=s.kind==='vpn'?Math.min(14,Math.max(7,Math.ceil(horizon))):Math.min(7,Math.max(2,horizon));
  var supported=rows.length>=3&&exposure>=needed&&coverage>=.8&&
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

// Versioned, prospective evaluation. Never interpolate an unobserved balance.
function afHorizons(kind,horizon) {
  var values=(kind==='quota'?[1,3,7]:[1,3,7,14,28]).filter(function(h){return h<horizon-1e-8;});
  if(horizon>1){
    // A separate near-reset probe can finish before a counter resets. Keep the
    // actual display target too; never pretend the probe is that exact target.
    var margin=kind==='quota'?1/24:1;
    if(horizon-margin>0)values.push(horizon-margin);
  }
  values.push(horizon);
  return values.filter(function(h,i){return h>0&&h<=31&&values.indexOf(h)===i;}).sort(function(a,b){return a-b;});
}

function afReadForecast(f,legacy,kind,last,now) {
  if(!f||!afTime(f.at)||!afTime(f.target)||f.target<=f.at||f.target-f.at>32*AF_DAY||f.at>now+60||
      !afNumber(f.baseline)||!afNumber(f.epoch)||f.epoch%1||typeof f.plan!=='string'||f.plan.length>32||
      !f.candidates||typeof f.candidates!=='object'||Array.isArray(f.candidates)||Object.keys(f.candidates).length>AF_MODELS.length||
      !afNumber(f.point)||!afNumber(f.high)||f.high<f.point||!afTime(f.sourceAt)||f.sourceAt>f.at||f.at-f.sourceAt>180||
      ['pending','scored','bounded','invalid','censored'].indexOf(f.state)<0)return null;
  var candidates={},valid=Object.keys(f.candidates).length>0;
  Object.keys(f.candidates).forEach(function(k){if(AF_MODELS.indexOf(k)<0||!afNumber(f.candidates[k]))valid=false;else candidates[k]=f.candidates[k];});
  var baselines={};
  if(!legacy&&f.baselines!==undefined){
    if(!f.baselines||typeof f.baselines!=='object'||Array.isArray(f.baselines))return null;
    Object.keys(f.baselines).forEach(function(k){if(k!=='mean7'||!afNumber(f.baselines[k]))valid=false;else baselines[k]=f.baselines[k];});
  }
  var modelVersion=legacy?3:f.modelVersion,issuedAt=legacy?f.at:f.issuedAt;
  var capacity=legacy?(kind==='quota'?100:last&&last.total):f.capacity;
  var beforeAt=legacy?f.at:f.beforeAt,beforeUsed=legacy?f.baseline:f.beforeUsed;
  if([3,AF_VERSION].indexOf(modelVersion)<0||!afTime(issuedAt)||issuedAt<f.at||issuedAt>f.at+180||issuedAt>=f.target||
      !afNumber(capacity)||capacity<f.baseline||!afTime(beforeAt)||beforeAt<f.at||beforeAt>Math.min(f.target,now+60)||
      !afNumber(beforeUsed)||beforeUsed<f.baseline-.05||beforeUsed>capacity+.05)return null;
  var low=legacy?Math.min(f.point,f.high):f.low,lower=legacy?(f.state==='scored'?f.actual:null):f.actualLower;
  var upper=legacy?(f.state==='scored'?f.actual:null):f.actualUpper;
  if(!afNumber(low)||low>f.point)return null;
  if(f.state==='scored'||f.state==='bounded'){
    if(!afNumber(lower)||!afNumber(upper)||lower>upper||upper>capacity-f.baseline+.05||
        !afTime(f.resolvedAt)||f.resolvedAt<f.target||f.resolvedAt>now+60)return null;
  }else if(f.state==='censored'){
    if(lower!==null&&(!afNumber(lower)||lower>capacity-f.baseline+.05)||
        upper!==null&&(!afNumber(upper)||upper>capacity-f.baseline+.05||lower!==null&&upper<lower))return null;
  }else {lower=null;upper=null;}
  if(f.resetAt!==undefined&&(!afNumber(f.resetAt)||f.resetAt&&f.resetAt<=f.at))return null;
  if(f.resolvedAt!==null&&f.resolvedAt!==undefined&&(!afTime(f.resolvedAt)||f.resolvedAt>now+60))return null;
  var resolution=['legacy','exact','bracketed','reset-bound','historical-bracket','depleted-before-target',
    'depleted-after-gap','boundary'].indexOf(f.resolution)>=0?f.resolution:null;
  return valid?{at:f.at,sourceAt:f.sourceAt,issuedAt:issuedAt,target:f.target,baseline:f.baseline,capacity:capacity,
    epoch:f.epoch,plan:f.plan,resetAt:f.resetAt||0,modelVersion:modelVersion,candidates:candidates,baselines:baselines,
    point:f.point,low:low,high:f.high,state:f.state,beforeAt:beforeAt,beforeUsed:beforeUsed,
    actual:lower!==null&&lower===upper?lower:null,actualLower:lower,actualUpper:upper,
    resolvedAt:f.resolvedAt||null,resolution:legacy?'legacy':resolution}:null;
}

function afSettle(s,f,lower,upper,now,resolution) {
  f.actualLower=Math.max(0,lower);f.actualUpper=Math.max(f.actualLower,upper);
  f.actual=f.actualLower===f.actualUpper?f.actualLower:null;
  f.resolvedAt=now;f.resolution=resolution;
  // Wide brackets remain useful bounds, not fabricated exact training labels.
  var floor=s.kind==='quota'?.5:Math.pow(1024,3)*.1;
  f.state=upper-lower<=Math.max(floor,upper*.1)?'scored':'bounded';
}

function afResolve(s,last,now) {
  s.forecasts.forEach(function(f){
    if(f.state!=='pending')return;
    if(f.epoch!==s.epoch||f.plan!==s.plan||last.used<f.beforeUsed-.05){f.state='invalid';return;}
    if(now<=f.target){f.beforeAt=now;f.beforeUsed=last.used;}
    if(last.remaining===0){
      f.state='censored';f.actual=null;f.actualLower=Math.max(0,f.beforeUsed-f.baseline);f.actualUpper=null;
      f.resolvedAt=now;f.resolution=now<=f.target?'depleted-before-target':'depleted-after-gap';return;
    }
    if(now<f.target)return;
    afSettle(s,f,Math.max(0,f.beforeUsed-f.baseline),Math.max(0,last.used-f.baseline),now,
      now===f.target?'exact':'bracketed');
  });
}

function afCloseTargets(s,prior,now,regularReset) {
  s.forecasts.forEach(function(f){
    if(f.state!=='pending')return;
    if(regularReset&&f.resetAt===prior.resetAt&&f.target<=prior.resetAt+1&&f.target>=f.beforeAt){
      if(prior.remaining===0){f.state='censored';f.actualLower=Math.max(0,f.beforeUsed-f.baseline);
        f.actualUpper=null;f.resolution='depleted-before-target';f.resolvedAt=now;}
      else afSettle(s,f,Math.max(0,f.beforeUsed-f.baseline),f.capacity-f.baseline,now,'reset-bound');
    }else {f.state='invalid';f.resolution='boundary';}
  });
}

function afRefineQuotaTargets(s,now) {
  s.forecasts.forEach(function(f){
    if(f.state!=='bounded'||!f.resetAt)return;
    var before=null,after=null;
    s.anchors.forEach(function(a){
      if(a.at>now||a.plan!==f.plan||Math.abs(a.resetAt-f.resetAt)>600||a.at<f.sourceAt)return;
      if(a.at<=f.target&&(!before||a.at>before.at))before=a;
      if(a.at>=f.target&&(!after||a.at<after.at))after=a;
    });
    if(!before||!after||after.remaining<=.5||before.remaining<after.remaining-.05)return;
    var low=Math.max(f.actualLower,100-before.remaining-f.baseline),high=Math.min(f.actualUpper,100-after.remaining-f.baseline);
    if(high>=low)afSettle(s,f,low,high,now,'historical-bracket');
  });
}

function afIndependentRows(rows) {
  var end=0,out=[];
  rows.slice().sort(function(a,b){return a.target-b.target||a.at-b.at;}).forEach(function(r){
    if(r.sourceAt===undefined?r.at>=end:r.sourceAt>=end){end=r.target;out.push(r);}
  });
  return out;
}
function afIndependent(rows){return afIndependentRows(rows).length;}
function afOutcomeBounds(f) {
  return afNumber(f.actualLower)&&afNumber(f.actualUpper)?[f.actualLower,f.actualUpper]:[f.actual,f.actual];
}
function afScoreRows(s,names,horizon,now) {
  return afIndependentRows(s.forecasts.filter(function(f){
    return f.modelVersion===AF_VERSION&&f.state==='scored'&&f.resolvedAt<=now&&f.issuedAt<=now&&
      afBand((f.target-f.sourceAt)/AF_DAY)===afBand(horizon)&&names.every(function(k){return afNumber(f.candidates[k]);});
  })).slice(-56);
}
function afWeights(s,models,horizon,now) {
  var names=Object.keys(models),past=afScoreRows(s,names,horizon,now),errors={},list=[];
  names.forEach(function(k){
    // Minimax absolute error over the observed target bracket; not an MAE
    // against an invented midpoint. Divide by actual horizon for comparisons.
    errors[k]=afMean(past.map(function(f){var b=afOutcomeBounds(f),p=f.candidates[k];
      return Math.max(Math.abs(p-b[0]),Math.abs(p-b[1]))/((f.target-f.sourceAt)/AF_DAY);}));
    list.push(errors[k]);
  });
  var scale=Math.max(1e-9,afQuantile(list,.5)||0),raw={},sum=0;
  names.forEach(function(k){raw[k]=1/(errors[k]+.2*scale);sum+=raw[k];});
  var neff=past.length,learn=neff<4?0:Math.min(.8,neff/(neff+8)),weights={};
  names.forEach(function(k){weights[k]=(1-learn)/names.length+learn*raw[k]/sum;});
  return {weights:weights,independent:neff,learning:learn>0,records:past,loss:'bounded-absolute-error'};
}

function afNeedsIssue(s,horizon,now) {
  return !!(s.last&&horizon>0&&horizon<=31&&now>=s.last.at&&now-s.last.at<=180&&s.last.at+horizon*AF_DAY>now&&
    !s.forecasts.some(function(f){return f.modelVersion===AF_VERSION&&Math.floor(f.at/AF_DAY)===Math.floor(s.last.at/AF_DAY)&&f.epoch===s.epoch&&
      (Math.abs((f.target-f.sourceAt)/AF_DAY-horizon)<1e-6||Math.abs(f.target-s.last.at-horizon*AF_DAY)<60);}));
}
function afIssue(s,forecast,horizon,now) {
  if(!forecast||!afNeedsIssue(s,horizon,now))return;
  var candidates={};
  Object.keys(forecast.candidates).forEach(function(k){candidates[k]=forecast.candidatePoints[k];});
  s.forecasts.push({at:s.last.at,sourceAt:s.last.at,issuedAt:now,target:s.last.at+horizon*AF_DAY,
    baseline:s.last.used,capacity:s.last.total,epoch:s.epoch,plan:s.plan,resetAt:s.last.resetAt,
    modelVersion:AF_VERSION,candidates:candidates,baselines:afClone(forecast.baselines||{}),point:forecast.typicalConsumption,
    low:forecast.lowConsumption,high:forecast.highConsumption,state:'pending',beforeAt:s.last.at,beforeUsed:s.last.used,
    actual:null,actualLower:null,actualUpper:null,resolvedAt:null,resolution:null});
  afPrune(s,now);
}
