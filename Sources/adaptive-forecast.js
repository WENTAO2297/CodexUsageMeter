// Private versioned numeric journals. Mutations run after source updates;
// menu drawing only consumes cached pure results. No extra polling or AI.
var adaptiveQuotaState=null,adaptiveVPNState=null,adaptiveQuotaResult=null,adaptiveVPNResult=null;
function adaptivePath(kind){
  var source=kind==='quota'?forecastHistoryPath:maomaoyunHistoryPath;
  return ObjC.unwrap($(source).stringByDeletingLastPathComponent)+'/prediction-v3-'+kind+'.json';
}
function adaptiveRead(kind,scope,now){
  if(!scope)return null;
  try {var file=adaptivePath(kind);
    if($.NSFileManager.defaultManager.fileExistsAtPath(file)){
      var text=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(file,$.NSUTF8StringEncoding,null));
      if(text&&text.length<=524288){var state=afNormalize(JSON.parse(text),kind,scope,now);if(state)return state;}
    }
  }catch(ignored){}
  return afNew(kind,scope,now);
}
function adaptiveSave(state){
  if(!state)return;
  if(state.kind==='quota'&&(usageAccountId!==state.scope||readUsageAccountId()!==state.scope))return;
  if(state.kind==='vpn'&&maomaoyunTrafficSnapshot&&adaptiveVPNScope(maomaoyunTrafficSnapshot)!==state.scope)return;
  try {if(JSON.stringify(state).length<=524288)writePrivateJSON(adaptivePath(state.kind),state);}
  catch(ignored){logError('adaptive-forecast-write',new Error('Numeric prediction journal could not be saved.'));}
}
function restoreAdaptiveQuota(account){adaptiveQuotaResult=null;adaptiveQuotaState=account?adaptiveRead('quota',account,Date.now()/1000):null;}
function adaptiveQuotaValid(window,context){
  return !!(adaptiveQuotaState&&context.accountId&&context.accountId===adaptiveQuotaState.scope&&context.plan&&
    context.plan===adaptiveQuotaState.plan&&context.sync==='ready'&&context.lastSuccessAt>0&&context.now>=context.lastSuccessAt&&
    context.now-context.lastSuccessAt<=180&&validForecastRemaining(window.remaining)&&validForecastWindow(window,context.now)&&
    window.durationMins===10080&&adaptiveQuotaState.last&&Math.abs(adaptiveQuotaState.last.resetAt-window.resetAt)<=600&&
    Math.abs(adaptiveQuotaState.last.remaining-window.remaining)<.05);
}
function recordAdaptiveQuota(windows){
  var now=typeof forecastLastSuccessAt==='number'?forecastLastSuccessAt:0;
  if(!usageAccountId||usageAccountId!==readUsageAccountId()||!usagePlanType||!now)return;
  var w=windows.filter(function(x){return x.durationMins===10080;})[0];if(!w)return;
  if(!adaptiveQuotaState||adaptiveQuotaState.scope!==usageAccountId)restoreAdaptiveQuota(usageAccountId);
  if(!adaptiveQuotaState.last||adaptiveQuotaState.last.at!==now||adaptiveQuotaState.last.remaining!==w.remaining||
      Math.abs(adaptiveQuotaState.last.resetAt-w.resetAt)>600)
    adaptiveQuotaState=afQuotaObserve(adaptiveQuotaState,w,usagePlanType,now);
  var tokens=typeof tokenHistorySnapshot==='undefined'?null:tokenHistorySnapshot;
  if(tokens&&tokens.accountId===usageAccountId)adaptiveQuotaState=afSeedQuota(adaptiveQuotaState,tokens,usagePlanType,Date.now()/1000);
  var record=forecastHistoryRecords.filter(function(r){return r.durationMins===10080;})[0];
  var context={now:now,sync:'ready',lastSuccessAt:now,accountKnown:true,accountId:usageAccountId,plan:usagePlanType};
  var original=forecastQuotaWindow(w,record,context),token=forecastTokenHistory(w,tokens,context),horizon=(w.resetAt-now)/AF_DAY;
  if(original.basis==='history')original.adaptiveSamples=weeklyForecastBlocks(record,horizon*AF_DAY,now).values;
  var built=afQuotaModels(adaptiveQuotaState,now,horizon,original,token);
  adaptiveQuotaResult=afAlert(adaptiveQuotaState,afDistribution(adaptiveQuotaState,built,horizon,w.remaining,now),now);
  if(adaptiveQuotaResult){
    adaptiveQuotaResult.remaining=w.remaining;adaptiveQuotaResult.resetAt=w.resetAt;adaptiveQuotaResult.at=now;
    [1,3,7].forEach(function(h){if(h<=horizon){
      var scaled=token?{basis:'tokenHistory',typicalConsumption:token.typicalConsumption*h/horizon,
        lowConsumption:token.lowConsumption*h/horizon,highConsumption:token.highConsumption*h/horizon}:null;
      var b=afQuotaModels(adaptiveQuotaState,now,h,null,scaled);
      afIssue(adaptiveQuotaState,afDistribution(adaptiveQuotaState,b,h,w.remaining,now),h,Date.now()/1000);
    }});
  }
  adaptiveSave(adaptiveQuotaState);
}
function currentAdaptiveQuotaForecast(window,context){
  var f=adaptiveQuotaResult;if(!f||!adaptiveQuotaValid(window,context)||f.remaining!==window.remaining||f.resetAt!==window.resetAt)return null;
  if(window.remaining===0)return null;
  var verdict=f.warningVerdict||f.verdict;
  return {basis:'adaptive',algorithmVersion:3,status:'unknown',verdict:verdict,typicalConsumption:f.typicalConsumption,
    highConsumption:f.highConsumption,pointRemaining:f.pointRemaining,remainingRange:f.remainingRange,quality:f.quality,
    weights:f.weights,scoredIntervals:f.scoredIntervals,
    text:'~'+Math.round(f.pointRemaining)+'% at reset',
    reason:'Conditional account-usage estimate. Historical variation and completed forecast errors; not a confidence guarantee.'};
}
function adaptiveVPNScope(snapshot){return snapshot?snapshot.accountKey+'|'+snapshot.credentialRevision:null;}
function resetAdaptiveVPN(){adaptiveVPNState=null;adaptiveVPNResult=null;}
function recordAdaptiveVPN(snapshot,history){
  if(!snapshot)return;
  var now=snapshot.reportedAt/1000,scope=adaptiveVPNScope(snapshot);
  if(!adaptiveVPNState||adaptiveVPNState.scope!==scope){adaptiveVPNState=adaptiveRead('vpn',scope,Date.now()/1000);adaptiveVPNResult=null;}
  if(!adaptiveVPNState.last||adaptiveVPNState.last.at!==now)adaptiveVPNState=afTrafficObserve(adaptiveVPNState,snapshot,now);
  if(history&&history.credentialRevision===snapshot.credentialRevision&&history.accountKey===snapshot.accountKey)
    adaptiveVPNState=afTrafficMerge(adaptiveVPNState,history,Date.now()/1000);
  // History replies may arrive after the balance read; use the current real
  // clock for maturity, but never fabricate a second balance observation.
  var clock=Date.now()/1000,horizon=snapshot.resetDays;
  var validHistory=history&&history.state==='ready'&&history.accountKey===snapshot.accountKey&&
    history.credentialRevision===snapshot.credentialRevision&&clock>=history.fetchedAt/1000&&clock-history.fetchedAt/1000<=7*3600;
  adaptiveVPNResult=validHistory&&horizon>0?afAlert(adaptiveVPNState,
    afDistribution(adaptiveVPNState,afTrafficModels(adaptiveVPNState,clock,horizon),horizon,snapshot.remainingBytes,clock),now):null;
  if(adaptiveVPNResult){
    adaptiveVPNResult.remaining=snapshot.remainingBytes;adaptiveVPNResult.at=now;adaptiveVPNResult.resetDays=horizon;
    [1,3,7,14,31].forEach(function(h){if(h<=horizon){
      afIssue(adaptiveVPNState,afDistribution(adaptiveVPNState,afTrafficModels(adaptiveVPNState,clock,h),h,snapshot.remainingBytes,clock),h,clock);
    }});
  }
  adaptiveSave(adaptiveVPNState);
}
function currentMaoMaoYunForecast(snapshot,history,now){
  var f=adaptiveVPNResult;
  if(snapshot&&f&&adaptiveVPNState&&adaptiveVPNState.scope===adaptiveVPNScope(snapshot)&&
      f.remaining===snapshot.remainingBytes&&f.resetDays===snapshot.resetDays&&now>=snapshot.reportedAt&&
      now-snapshot.reportedAt<=MAOMAOYUN_TRAFFIC_FRESH_MS&&snapshot.resetDays>0&&history&&history.state==='ready'&&
      history.accountKey===snapshot.accountKey&&history.credentialRevision===snapshot.credentialRevision&&
      now>=history.fetchedAt&&now-history.fetchedAt<=7*3600000){
    var index=Math.min(4,Math.max(0,Math.floor(Math.log(snapshot.totalBytes)/Math.log(1024))));
    // Approximate forecasts do not inherit two-decimal precision from balances.
    var unit=Math.pow(1024,index),amount=f.pointRemaining/unit;
    var value=(amount>0&&amount<1?'<1':Math.round(amount))+['B','K','M','G','T'][index];
    return {basis:'adaptive',algorithmVersion:3,status:'unknown',quality:f.quality,verdict:f.warningVerdict||f.verdict,
      pointRemaining:f.pointRemaining,typicalConsumption:f.typicalConsumption,highConsumption:f.highConsumption,
      crossingDays:f.crossingDays,horizonDays:snapshot.resetDays,weights:f.weights,scoredIntervals:f.scoredIntervals,
      text:'At reset: ~'+value+' left · estimate only',reason:'Conditional estimate from reported account history; reporting may be delayed.'};
  }
  return maoMaoYunTrafficForecast(snapshot,history,now);
}
