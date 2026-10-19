// Version 3 pure forecasting. No AppKit, files, network or wall-clock reads.
var AF_VERSION=3,AF_DAY=86400,AF_RETENTION=180*86400;
var AF_MODELS=['pooled','recent','stable','slow','blocks','week','level','token'];
function afNumber(n){return typeof n==='number'&&isFinite(n)&&n>=0;}
function afTime(n){return afNumber(n)&&n>0;}
function afQuantile(a,p){if(!a.length)return null;var s=a.slice().sort(function(x,y){return x-y;}),k=(s.length-1)*p;
  return s[Math.floor(k)]+(s[Math.ceil(k)]-s[Math.floor(k)])*(k-Math.floor(k));}
function afMean(a){return a.length?a.reduce(function(s,v){return s+v;},0)/a.length:0;}
function afBand(days){return days<=1?1:days<=3?3:days<=7?7:days<=14?14:31;}
function afNew(kind,scope,now){return {version:AF_VERSION,kind:kind,scope:scope,savedAt:now,plan:'',planSince:0,
  anchors:[],days:[],forecasts:[],last:null,epoch:1,alert:null};}
function afClone(o){return JSON.parse(JSON.stringify(o));}
function afNormalize(raw,kind,scope,now){
  if(!raw||raw.version!==AF_VERSION||raw.kind!==kind||raw.scope!==scope||!scope||scope.length>256||
      !afTime(raw.savedAt)||raw.savedAt>now+60||now-raw.savedAt>AF_RETENTION||
      !Array.isArray(raw.anchors)||raw.anchors.length>1600||!Array.isArray(raw.days)||raw.days.length>182||
      !Array.isArray(raw.forecasts)||raw.forecasts.length>400||!afNumber(raw.epoch)||raw.epoch%1||raw.epoch<1||
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
    if(!f||!afTime(f.at)||!afTime(f.target)||f.target<=f.at||f.at>now+60||f.target-f.at>32*AF_DAY||
        !afNumber(f.baseline)||!afNumber(f.epoch)||typeof f.plan!=='string'||f.plan.length>32||
        !f.candidates||typeof f.candidates!=='object'||Array.isArray(f.candidates)||Object.keys(f.candidates).length>8||
        !afNumber(f.point)||!afNumber(f.high)||f.high<f.point||
        !afTime(f.sourceAt)||f.sourceAt>f.at||f.at-f.sourceAt>180||
        ['pending','scored','invalid','censored'].indexOf(f.state)<0||
        (f.state==='scored'&&(!afNumber(f.actual)||!afTime(f.resolvedAt)||f.resolvedAt>now+60||f.resolvedAt<f.target)))valid=false;
    else {
      var candidates={};Object.keys(f.candidates).forEach(function(k){if(AF_MODELS.indexOf(k)<0||!afNumber(f.candidates[k]))valid=false;else candidates[k]=f.candidates[k];});
      if(f.at>=now-AF_RETENTION)out.forecasts.push({at:f.at,sourceAt:f.sourceAt,target:f.target,baseline:f.baseline,epoch:f.epoch,plan:f.plan,
        candidates:candidates,point:f.point,high:f.high,state:f.state,actual:f.state==='scored'?f.actual:null,resolvedAt:f.state==='scored'?f.resolvedAt:null});
    }
  });
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
function afPrune(s,now){s.anchors=s.anchors.filter(function(a){return a.at>=now-AF_RETENTION;}).slice(-1600);
  s.days=s.days.filter(function(d){return d.at>=now-AF_RETENTION;}).slice(-182);
  s.forecasts=s.forecasts.filter(function(f){return f.at>=now-AF_RETENTION;}).slice(-400);s.savedAt=now;return s;}
function afResolve(s,last,now){
  s.forecasts.forEach(function(f){
    if(f.state!=='pending'||now<f.target)return;
    if(f.epoch!==s.epoch||f.plan!==s.plan||now-f.target>1800||last.used<f.baseline-.05)f.state='invalid';
    else if(last.remaining===0)f.state='censored';
    else {f.state='scored';f.actual=Math.max(0,last.used-f.baseline);f.resolvedAt=now;}
  });
}
function afQuotaObserve(s,w,plan,now){
  if(!s||s.kind!=='quota'||!plan||!validForecastRemaining(w.remaining)||!validForecastWindow(w,now)||w.durationMins!==10080)return s;
  if(s.last&&now<s.last.at)return afNew('quota',s.scope,now);
  var changed=s.plan&&s.plan!==plan;
  if(changed){s=afNew('quota',s.scope,now);s.planSince=now;}
  s.plan=plan;if(!s.planSince)s.planSince=now;
  var prior=s.last,boundary=prior&&(Math.abs(prior.resetAt-w.resetAt)>600||w.remaining>prior.remaining+.05);
  if(boundary){s.epoch++;s.alert=null;s.forecasts.forEach(function(f){if(f.state==='pending')f.state='invalid';});}
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
  return afPrune(s,now);
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
  if(boundary){s.epoch++;s.alert=null;s.forecasts.forEach(function(f){if(f.state==='pending')f.state='invalid';});
    if(snapshot.totalBytes!==p.total)s.forecasts=[];}
  s.last={at:now,used:snapshot.usedBytes,total:snapshot.totalBytes,remaining:snapshot.remainingBytes,resetAt:0,resetDays:snapshot.resetDays};
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
function afTrafficModels(s,now,horizon){
  // Maturity is tied to the observed response time, not time passing offline.
  var mature=s.days.filter(function(d){return d.at+AF_DAY<=d.lastSeen-2*AF_DAY&&d.lastSeen<=now&&d.at>=now-180*AF_DAY;});
  if(mature.length<3||now-mature[mature.length-1].at>5*AF_DAY)return {models:{},rows:[]};
  var latest=mature[mature.length-1].at,days=mature.filter(function(d){return d.at>=latest-34*AF_DAY;});
  var rows=days.map(function(d){return {start:d.at,end:d.at+AF_DAY,loss:d.value};}),models={};
  function mean(n){return afMean(days.filter(function(d){return d.at>=latest-(n-1)*AF_DAY;}).map(function(d){return d.value;}));}
  models.pooled={center:mean(7)*horizon};models.slow={center:mean(28)*horizon};
  models.recent={center:afRate(rows,3,now)*horizon};models.stable={center:afRate(rows,7,now)*horizon};
  var map={};days.forEach(function(d){map[d.at]=d.value;});var blocks=[],length=Math.floor(horizon),fraction=horizon-length;
  days.forEach(function(d){var sum=0,okay=true;
    for(var j=0;j<length+(fraction>0?1:0);j++){var value=map[d.at+j*AF_DAY];if(value===undefined){okay=false;break;}sum+=value*(j===length?fraction:1);}
    if(okay)blocks.push(sum);});
  if(blocks.length>=3)models.blocks={center:afQuantile(blocks,.5),samples:blocks};
  var base=(mean(7)+mean(28))/2,week=0,supported=true;
  for(var j=0;j<Math.ceil(horizon);j++){
    var target=(Math.floor(now/AF_DAY)+j)%7,same=days.filter(function(d){return Math.floor(d.at/AF_DAY)%7===target;});
    if(same.length<3){supported=false;break;}
    var weight=same.length/(same.length+4);
    week+=((1-weight)*base+weight*afQuantile(same.map(function(d){return d.value;}),.5))*Math.min(1,horizon-j);
  }
  if(supported)models.week={center:week};
  var recent=days.filter(function(d){return d.at>=latest-2*AF_DAY;}),older=days.filter(function(d){return d.at<latest-2*AF_DAY;}).slice(-14);
  if(recent.length===3&&recent[2].at-recent[0].at===2*AF_DAY&&older.length>=7){
    var median=afQuantile(older.map(function(d){return d.value;}),.5),mad=afQuantile(older.map(function(d){return Math.abs(d.value-median);}),.5);
    var limit=Math.max(2.5*mad,median*.35,1);
    if(recent.every(function(d){return d.value>median+limit;})||recent.every(function(d){return d.value<median-limit;}))
      models.level={center:afQuantile(recent.map(function(d){return d.value;}),.5)*horizon};
  }
  return {models:models,rows:rows};
}
function afIndependent(rows){var end=0,n=0;rows.slice().sort(function(a,b){return a.at-b.at;}).forEach(function(r){if(r.at>=end){end=r.target;n++;}});return n;}
function afWeights(s,models,horizon,now){
  var names=Object.keys(models),past=s.forecasts.filter(function(f){return f.state==='scored'&&f.resolvedAt<=now&&
    afBand((f.target-f.at)/AF_DAY)===afBand(horizon)&&names.every(function(k){return afNumber(f.candidates[k]);});}).slice(-56);
  var neff=afIndependent(past),errors={},list=[];
  names.forEach(function(k){errors[k]=afMean(past.map(function(f){return Math.abs(f.candidates[k]-f.actual);}));list.push(errors[k]);});
  var scale=Math.max(1e-9,afQuantile(list,.5)||0),raw={},sum=0;
  names.forEach(function(k){raw[k]=1/(errors[k]+.2*scale);sum+=raw[k];});
  var learn=neff<4?0:Math.min(.8,neff/(neff+8)),weights={};
  names.forEach(function(k){weights[k]=(1-learn)/names.length+learn*raw[k]/sum;});
  return {weights:weights,independent:neff,learning:learn>0};
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
    if(model.quantiles){var p=random(),q=model.quantiles;
      loss=p<.25?q[0]:p<.5?q[0]+(q[1]-q[0])*(p-.25)/.25:p<.9?q[1]+(q[2]-q[1])*(p-.5)/.4:q[2];
      crossed=loss>=remaining?horizon:null;
    }else if(model.samples){loss=model.samples[Math.floor(random()*model.samples.length)];crossed=loss>=remaining?horizon:null;}
    else if(base>0&&rows.length){
      while(elapsed<horizon){var index=Math.floor(random()*rows.length);
        for(var j=0;j<2&&elapsed<horizon;j++){
          var row=rows[(index+j)%rows.length],duration=Math.min((row.end-row.start)/AF_DAY,horizon-elapsed);
          var amount=row.loss*duration/((row.end-row.start)/AF_DAY)*(model.center/horizon)/base;
          if(crossed===null&&loss+amount>=remaining)crossed=elapsed+(amount>0?duration*Math.max(0,remaining-loss)/amount:duration);
          loss+=amount;elapsed+=duration;
        }
      }
    }else loss=model.center;
    loss=Math.max(0,loss);out.push(loss);byModel[k].push(loss);cross.push(crossed===null?horizon+1:crossed);
  }
  var typical=afQuantile(out,.5),low=afQuantile(out,.1),high=Math.max(typical,afQuantile(out,.9));
  var scored=s.forecasts.filter(function(f){return f.state==='scored'&&f.resolvedAt<=now&&afBand((f.target-f.at)/AF_DAY)===afBand(horizon);});
  var neff=afIndependent(scored),adjusted=neff>=20;
  if(adjusted){var errors=scored.slice(-56).map(function(f){return f.actual-f.point;});
    low=Math.min(low,Math.max(0,typical+afQuantile(errors,.1)));high=Math.max(high,typical+afQuantile(errors,.9));}
  return {algorithmVersion:AF_VERSION,basis:'adaptive',quality:adjusted?'empiricallyAdjusted':'conditional',
    typicalConsumption:typical,lowConsumption:low,highConsumption:high,horizonDays:horizon,
    pointRemaining:Math.max(0,Math.min(remaining,remaining-typical)),
    remainingRange:[Math.max(0,remaining-high),Math.max(0,remaining-low)],
    verdict:typical>=remaining?'risk':high>=remaining?'tight':'safe',
    crossingDays:afQuantile(cross,.5),weights:weights.weights,scoredIntervals:weights.independent,
    candidatePoints:Object.keys(byModel).reduce(function(result,k){result[k]=afQuantile(byModel[k],.5);return result;},{}),candidates:models};
}
function afIssue(s,forecast,horizon,now){
  if(!forecast||!s.last||horizon<=0||horizon>31||now<s.last.at||now-s.last.at>180)return;
  if(s.forecasts.some(function(f){return Math.floor(f.at/AF_DAY)===Math.floor(now/AF_DAY)&&
      afBand((f.target-f.at)/AF_DAY)===afBand(horizon)&&f.epoch===s.epoch;}))return;
  var candidates={},factor=1+(now-s.last.at)/AF_DAY/horizon;
  Object.keys(forecast.candidates).forEach(function(k){candidates[k]=
    (forecast.candidatePoints?forecast.candidatePoints[k]:forecast.candidates[k].center)*factor;});
  s.forecasts.push({at:now,sourceAt:s.last.at,target:now+horizon*AF_DAY,baseline:s.last.used,epoch:s.epoch,plan:s.plan,
    candidates:candidates,point:forecast.typicalConsumption*factor,high:forecast.highConsumption*factor,state:'pending',actual:null,resolvedAt:null});
  afPrune(s,now);
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
  result.algorithmVersion=3;result.rate=rate;result.projectedRemaining=projected;
  result.status=projected<0?'risk':atReset&&projected<=5?'tight':'unknown';
  result.text='If pace holds: '+(projected<0?'empty within '+forecastDuration(original.horizon):
    '~'+Math.round(projected)+'% '+(atReset?'at reset':'in '+forecastDuration(original.horizon)));
  return result;
}
