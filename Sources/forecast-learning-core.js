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
  var allowedModels=kind==='vpn'?AF_VPN_MODELS:AF_QUOTA_MODELS;
  if(!f||!afTime(f.at)||!afTime(f.target)||f.target<=f.at||f.target-f.at>32*AF_DAY||f.at>now+60||
      !afNumber(f.baseline)||!afNumber(f.epoch)||f.epoch%1||typeof f.plan!=='string'||f.plan.length>32||
      !f.candidates||typeof f.candidates!=='object'||Array.isArray(f.candidates)||Object.keys(f.candidates).length>allowedModels.length||
      !afNumber(f.point)||!afNumber(f.high)||f.high<f.point||!afTime(f.sourceAt)||f.sourceAt>f.at||f.at-f.sourceAt>180||
      ['pending','scored','bounded','invalid','censored'].indexOf(f.state)<0)return null;
  var candidates={},valid=Object.keys(f.candidates).length>0;
  Object.keys(f.candidates).forEach(function(k){if(allowedModels.indexOf(k)<0||!afNumber(f.candidates[k]))valid=false;else candidates[k]=f.candidates[k];});
  var baselines={};
  if(!legacy&&f.baselines!==undefined){
    if(!f.baselines||typeof f.baselines!=='object'||Array.isArray(f.baselines))return null;
    Object.keys(f.baselines).forEach(function(k){
      var allowed=kind==='vpn'&&f.modelVersion>=5?['mean7','mean28','simple']:['mean7'];
      if(allowed.indexOf(k)<0||!afNumber(f.baselines[k]))valid=false;else baselines[k]=f.baselines[k];
    });
  }
  var modelVersion=legacy?3:f.modelVersion,issuedAt=legacy?f.at:f.issuedAt;
  var capacity=legacy?(kind==='quota'?100:last&&last.total):f.capacity;
  var beforeAt=legacy?f.at:f.beforeAt,beforeUsed=legacy?f.baseline:f.beforeUsed;
  if((kind==='vpn'?[3,4,5,6,AF_VPN_VERSION]:[3,4,AF_VERSION]).indexOf(modelVersion)<0||!afTime(issuedAt)||issuedAt<f.at||issuedAt>f.at+180||issuedAt>=f.target||
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
    return f.modelVersion===afVersion(s.kind)&&f.state==='scored'&&f.resolvedAt<=now&&f.issuedAt<=now&&
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
  // Reconstructed dates share the raw anchors' evidence. They cannot count
  // as independent observations or dominate the measured candidates.
  if(s.kind==='quota'&&names.length>1&&weights.reconstructed>.2){
    var rescale=.8/(1-weights.reconstructed);
    names.forEach(function(k){weights[k]=k==='reconstructed'?.2:weights[k]*rescale;});
  }
  return {weights:weights,independent:neff,learning:learn>0,records:past,loss:'bounded-absolute-error'};
}

function afNeedsIssue(s,horizon,now) {
  return !!(s.last&&horizon>0&&horizon<=31&&now>=s.last.at&&now-s.last.at<=180&&s.last.at+horizon*AF_DAY>now&&
    !s.forecasts.some(function(f){return f.modelVersion===afVersion(s.kind)&&Math.floor(f.at/AF_DAY)===Math.floor(s.last.at/AF_DAY)&&f.epoch===s.epoch&&
      (Math.abs((f.target-f.sourceAt)/AF_DAY-horizon)<1e-6||Math.abs(f.target-s.last.at-horizon*AF_DAY)<60);}));
}
function afIssue(s,forecast,horizon,now) {
  if(!forecast||!afNeedsIssue(s,horizon,now))return;
  var candidates={};
  Object.keys(forecast.candidates).forEach(function(k){candidates[k]=forecast.candidatePoints[k];});
  s.forecasts.push({at:s.last.at,sourceAt:s.last.at,issuedAt:now,target:s.last.at+horizon*AF_DAY,
    baseline:s.last.used,capacity:s.last.total,epoch:s.epoch,plan:s.plan,resetAt:s.last.resetAt,
    modelVersion:afVersion(s.kind),candidates:candidates,baselines:afClone(forecast.baselines||{}),point:forecast.typicalConsumption,
    low:forecast.lowConsumption,high:forecast.highConsumption,state:'pending',beforeAt:s.last.at,beforeUsed:s.last.used,
    actual:null,actualLower:null,actualUpper:null,resolvedAt:null,resolution:null});
  afPrune(s,now);
}
