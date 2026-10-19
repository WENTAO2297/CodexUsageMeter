// Presentation only: summarize existing forecast results, never relax their
// evidence gates or extend a short Session estimate to a whole reset cycle.
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
  // Use the model's actual crossing time, not balance / average daily use.
  // Unknown horizons and censored/non-crossing paths cannot supply an ETA.
  if(forecast.basis!=='adaptive'||typeof horizon!=='number'||!(horizon>0)||!isFinite(horizon)||forecast.horizonDays!==horizon||
      typeof snapshot.remainingBytes!=='number'||!isFinite(snapshot.remainingBytes)||snapshot.remainingBytes<=0||
      typeof crossing!=='number'||!isFinite(crossing)||crossing<0||crossing>=horizon-1e-6||
      typeof forecast.typicalConsumption!=='number'||!isFinite(forecast.typicalConsumption)||
      forecast.typicalConsumption<snapshot.remainingBytes)return null;
  return horizon-crossing;
}

function trafficEarlyDepletionText(days) {
  return 'Estimated empty '+(days<1?'<1':Math.round(days))+'d before reset';
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
    var outcome=empty?(leadDays!==null?'May run out':'May use it all'):
      f.verdict==='tight'||f.verdict==='risk'?'May be tight':'Projected surplus';
    return {headline:leadDays!==null?trafficEarlyDepletionText(leadDays):empty?'At reported pace: may run out':'At reported pace: lasts to reset',detail:f.text,status:'unknown',
      adaptive:match?{value:'≈'+match[1],outcome:outcome,note:'At reset · reported estimate',status:'unknown',depletionLeadDays:leadDays}:null};
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
