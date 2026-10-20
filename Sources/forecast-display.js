// Presentation only: summarize existing forecast results, never relax their
// evidence gates or extend a short Session estimate to a whole reset cycle.
function quotaPredictionBadge(window,forecast,now,stale) {
  var pace=quotaPaceModel(window,now,stale),f=forecast||{};
  if(stale||['No data','Reset unknown','Resetting','Exhausted','Quota low'].indexOf(pace.label)>=0)return pace;
  if(f.basis==='adaptive'&&['supported','adjusted'].indexOf(f.evidence)>=0){
    return {label:f.verdict==='risk'?'May run out':f.verdict==='tight'?'May be tight':'Reserve at reset',
      tone:f.verdict==='risk'||f.verdict==='tight'?'warning':'normal',source:'forecast'};
  }
  if(f.basis==='recent'&&meterNumber(f.projectedRemaining)&&f.projectedRemaining<0)
    return {label:'Near-term depletion',tone:'warning',source:'short-term'};
  return {label:pace.label==='Above pace'?'Cycle use ahead':'Cycle on pace',
    tone:pace.label==='Above pace'?'warning':'muted',source:'cycle'};
}

function trafficPredictionBadge(data,forecast) {
  if(!data.hasValue)return {label:'No data',tone:'muted'};
  if(data.stale)return {label:'Last known',tone:'muted'};
  if(data.fraction===0)return {label:'Exhausted',tone:'critical'};
  var f=forecast||{};
  if(!(data.resetDays>0))return {label:'Reset unknown',tone:'muted'};
  if(f.basis==='adaptive'){
    // Use the validated summary ETA, never reconstruct the balance from a
    // pointRemaining value that has already been clipped at zero.
    var summary=data.summary&&data.summary.adaptive;
    if(f.precision==='day'&&summary&&summary.depletionLeadDays!==null&&summary.depletionLeadDays!==undefined)
      return {label:'Est. empty '+(summary.depletionLeadDays<1?'<1':Math.round(summary.depletionLeadDays))+'d early',tone:'warning'};
    if(f.verdict==='risk')return {label:summary&&summary.possibleDepletionLabel||'Possible depletion',tone:'warning'};
    if(f.algorithmVersion>=5&&f.resetSensitive)return {label:'May be tight',tone:'warning'};
    if(f.verdict==='tight')return {label:'May be tight',tone:'warning'};
    if(f.recentChange==='up')return {label:'Recent use rising',tone:'warning'};
    if(['supported','adjusted'].indexOf(f.evidence)>=0)return {label:'Reserve at reset',tone:'normal'};
    return {label:'Forecast observing',tone:'muted'};
  }
  if(f.basis==='reportedHistory'&&data.summary&&/may run out|used up/.test(data.summary.headline))
    return {label:'May be tight',tone:'warning'};
  return {label:'Forecast observing',tone:'muted'};
}

function quotaForecastSummary(window, forecast, now) {
  var f = forecast || {}, detail = f.text || f.reason || 'Waiting for quota';
  var summary = {headline:'Not enough data to predict', detail:f.budget || f.reason || detail, status:'unknown'};
  if (f.status === 'exhausted') return {headline:'Quota exhausted',detail:'Waiting for reset',status:'exhausted'};
  if(f.basis==='adaptive')return {headline:f.verdict==='risk'?'May run out before reset':f.verdict==='tight'?'May be tight before reset':'Expected to last until reset',
    detail:f.text,status:'unknown',roughVerdict:f.verdict};
  if(f.basis==='tokenHistory') {
    return {headline:f.verdict==='risk'?'May run out before reset':f.verdict==='tight'?'May be tight before reset':'Expected to last until reset',
      detail:detail.split(' · ').slice(1).join(' · '),
      status:'unknown',roughVerdict:f.verdict};
  }
  if (f.basis === 'history') {
    summary.headline = f.status === 'safe' ? 'Expected to last until reset' :
      f.status === 'tight' ? 'May be tight before reset' : 'May run out before reset';
    summary.detail = detail.split(' · ').slice(1).join(' · ') || detail;
    summary.status = f.status;
    return summary;
  }
  if (f.basis === 'recent') {
    var toReset = window.resetAt - now <= f.horizon + 1;
    summary.headline = f.projectedRemaining < 0 ? 'May run out within ' + forecastDuration(f.horizon) :
      toReset ? 'Estimate to reset only' : 'Only a short-term estimate';
    summary.detail = detail.replace(/^If pace holds: /, '');
    summary.status = f.status;
    return summary;
  }
  var reason = f.reason || '';
  if (/stale|Waiting for quota|Quota unavailable|Reset time unknown|Awaiting reset/.test(reason)) {
    summary.headline = 'Prediction paused';
  } else if (/incomplete/.test(reason)) summary.headline = 'History has gaps; no prediction';
  else if (/No .*use/.test(reason)) summary.headline = 'Recent use too low to predict';
  else if (/jump/.test(reason)) summary.headline = 'Usage changed; observing again';
  return summary;
}

function trafficDepletionLeadDays(snapshot, forecast) {
  var horizon=snapshot.resetDays,crossing=forecast.crossingDays;
  if(forecast.algorithmVersion>=5&&(!forecast.timingAvailable||!forecast.resetStable||!forecast.resetLeadRange))return null;
  // Use the model's actual crossing time, not balance / average daily use.
  // Unknown horizons and censored/non-crossing paths cannot supply an ETA.
  if(forecast.basis!=='adaptive'||forecast.precision!=='day'||typeof horizon!=='number'||!(horizon>0)||!isFinite(horizon)||forecast.horizonDays!==horizon||
      typeof snapshot.remainingBytes!=='number'||!isFinite(snapshot.remainingBytes)||snapshot.remainingBytes<=0||
      typeof crossing!=='number'||!isFinite(crossing)||crossing<0||crossing>=horizon-1e-6||
      typeof forecast.typicalConsumption!=='number'||!isFinite(forecast.typicalConsumption)||
      forecast.typicalConsumption<snapshot.remainingBytes)return null;
  return horizon-crossing;
}

function trafficEarlyDepletionText(days) {
  return 'Estimated empty '+(days<1?'<1':Math.round(days))+'d before reset';
}

// Preserve approximate lead times even when strict day precision is unavailable.
// A conditional point path is not a claim that every scenario will deplete.
function trafficPossibleDepletionText(snapshot,forecast) {
  return forecastDepletionText(snapshot.remainingBytes,snapshot.resetDays,forecast);
}

// VPN warnings use existing path times, never a balance / average-rate ETA.
function forecastDepletionText(remaining,h,forecast) {
  var f=forecast||{},c=f.crossingDays,r=f.crossingRange;
  if(f.basis!=='adaptive'||f.verdict!=='risk'||typeof h!=='number'||!isFinite(h)||h<=0||f.horizonDays!==h||
      typeof remaining!=='number'||!isFinite(remaining)||remaining<=0||
      typeof f.typicalConsumption!=='number'||!isFinite(f.typicalConsumption)||f.typicalConsumption<remaining||
      typeof c!=='number'||!isFinite(c)||c<0||c>=h-1e-6)return null;
  if(f.algorithmVersion>=5){
    // This is the user-requested approximate point ETA, not the strict day
    // gate above. A non-crossing upper scenario must not erase a valid point.
    if(!f.timingAvailable)return null;
    var leadRange=f.resetLeadRange;
    if(leadRange&&leadRange[1]-leadRange[0]>2+1e-6&&Math.floor(leadRange[0])>=1)
      return 'May run out '+Math.floor(leadRange[0])+'–'+Math.ceil(leadRange[1])+'d early';
  }
  // Only show a range if both endpoints actually cross before reset. The
  // horizon+1 sentinel means some scenarios do not deplete, not "-1d early".
  if(Array.isArray(r)&&r.length===2&&typeof r[0]==='number'&&typeof r[1]==='number'&&
      isFinite(r[0])&&isFinite(r[1])&&r[0]>=0&&r[0]<=c&&c<=r[1]&&r[1]<h-1e-6&&r[1]-r[0]>2){
    var lower=Math.floor(h-r[1]),upper=Math.ceil(h-r[0]);
    if(lower>=1)return 'May run out '+lower+'–'+upper+'d early';
  }
  var lead=h-c;
  return 'May run out ~'+(lead<1?'<1':Math.round(lead))+'d early';
}

function trafficForecastSummary(snapshot, presentation, forecast) {
  var f = forecast || {}, summary = {headline:'Not enough data to predict',detail:presentation.forecastText,status:'unknown'};
  if (!presentation.hasValue || presentation.stale) {
    summary.headline = 'Prediction paused';summary.detail = presentation.detail;return summary;
  }
  if (snapshot.remainingBytes === 0) return {headline:'Traffic exhausted',detail:presentation.resetText,status:'exhausted'};
  if(f.basis==='adaptive'){
    var match=/^At reset: ~([<\d.]+[BKMGT]) left/.exec(f.text||'');
    var empty=f.typicalConsumption>=snapshot.remainingBytes;
    var leadDays=trafficDepletionLeadDays(snapshot,f);
    var possible=trafficPossibleDepletionText(snapshot,f);
    var outcome=f.algorithmVersion>=5&&f.resetSensitive&&!empty?'May be tight':empty?'May run out':
      f.verdict==='tight'||f.verdict==='risk'?'May be tight':'Projected surplus';
    return {headline:leadDays!==null?trafficEarlyDepletionText(leadDays):possible|| (f.algorithmVersion>=5&&f.resetSensitive?'May be tight before reset':empty?'At reported pace: may run out':'At reported pace: lasts to reset'),detail:f.text,status:'unknown',
      adaptive:match?{value:'≈'+match[1],outcome:outcome,note:'At reset · reported estimate',status:'unknown',depletionLeadDays:leadDays,possibleDepletionLabel:possible}:null};
  }
  if (f.basis === 'reportedHistory' && snapshot.resetDays > 0) {
    // Only a conditional reported-data scenario, not a safe/risk judgment.
    // Keep the excess-consumption branch explicit instead of showing 0 left
    // as though depletion were predicted to occur exactly at the reset.
    summary.headline = f.highConsumption > snapshot.remainingBytes ?
      'At reported pace: may run out' : f.highConsumption === snapshot.remainingBytes ?
      'At reported pace: used up by reset' : 'At reported pace: lasts to reset';
    summary.detail = f.highConsumption > snapshot.remainingBytes ? 'Before reset · estimate only' :
      'At reset: ~' + formatMaoMaoYunTrafficAmount(snapshot.remainingBytes-f.highConsumption,
        Math.min(4,Math.max(0,Math.floor(Math.log(snapshot.totalBytes)/Math.log(1024))))) + ' left · estimate only';
  } else if (f.basis === 'reportedHistory') {
    summary.headline = 'Next reset date unknown';
    summary.detail = f.text.replace(/^If reported pace holds: /,'') + ' · estimate only';
  } else if (!(snapshot.resetDays > 0)) {
    summary.headline = 'Next reset date unknown';summary.detail = f.reason || 'Not enough data to predict';
  } else if (/No use/.test(f.reason || '')) summary.headline = 'Recent use too low to predict';
  else if (/missing/.test(f.reason || '')) summary.headline = 'History has gaps; no prediction';
  return summary;
}

// Compact view model: short outcome on the left, the actual estimate on the
// right, and its horizon/basis below. Never extract a budget as a prediction.
function compactForecastSummary(summary) {
  if(summary.adaptive)return summary.adaptive;
  var s=summary, result={outcome:'Not enough data',value:'—',note:s.detail,status:s.status};
  var historyValue=/^(~?[\d.–]+%) at reset$/.exec(s.detail);
  var trafficValue=/^At reset: ~([\d.]+[BKMGT]) left · estimate only$/.exec(s.detail);
  if (historyValue) {
    var verdict=s.roughVerdict||s.status;
    result.outcome=verdict==='safe'?'Projected surplus':verdict==='tight'?'May be tight':'May run out';
    result.value='≈'+historyValue[1].replace(/^~/,'');
    result.value=result.value.replace(/^(≈)([\d.]+)–\2%$/,'$1$2%');
    result.note=s.roughVerdict?'At reset · historical rough estimate':'At reset · historical scenario';
  } else if (trafficValue) {
    result.outcome=s.headline==='At reported pace: used up by reset'?'May use it all':'Projected surplus';
    result.value='≈'+trafficValue[1];result.note='At reset · reported estimate';
  } else if (s.headline==='At reported pace: may run out') {
    result.outcome='May run out';result.note='Before reset · reported estimate';
  } else if (/^May run out within /.test(s.headline)) {
    result.outcome='May run out';result.value='≈0%';
    result.note='In '+s.headline.replace(/^May run out within /,'')+' · recent pace';
  } else if (s.headline==='Only a short-term estimate'||s.headline==='Estimate to reset only') {
    result.outcome='Short-term estimate';
    var recent=/^(~?\d+%) (in (.+)|at reset)$/.exec(s.detail);
    if(recent) {result.value='≈'+recent[1].replace(/^~/,'');
      result.note=recent[3]?'In '+recent[3]+' · recent pace':'At reset · recent pace';}
  } else if (s.headline==='Next reset date unknown') {
    result.outcome='Reset unknown';result.note=s.detail;
  } else if (s.headline==='History has gaps; no prediction') result.outcome='History has gaps';
  else if (s.headline==='Recent use too low to predict') result.outcome='Not enough usage';
  else if (s.headline==='Usage changed; observing again') result.outcome='Observing again';
  else if (s.headline==='Prediction paused') result.outcome='Paused';
  else if (s.headline==='Quota exhausted'||s.headline==='Traffic exhausted') result.outcome='Exhausted';
  return result;
}
