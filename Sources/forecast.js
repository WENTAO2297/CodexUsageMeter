// Account-scoped local observations, sampled only after a successful quota
// read. Forecasting adds no readers, network requests or model calls.
function restoreForecastHistory(accountId) {
  forecastHistoryRecords = [];
  forecastLastSuccessAt = 0;
  forecastBreakSegment = true;
  if(typeof restoreAdaptiveQuota==='function')restoreAdaptiveQuota(accountId);
  if (!accountId) return;
  try {
    var path = forecastHistoryPath;
    if (!$.NSFileManager.defaultManager.fileExistsAtPath(path)) {
      path = forecastLegacyHistoryPath;
      if (!$.NSFileManager.defaultManager.fileExistsAtPath(path)) return;
    }
    var text = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null));
    if (!text || text.length > 524288) throw new Error('Invalid forecast history size');
    forecastHistoryRecords = normalizeForecastSnapshot(JSON.parse(text), accountId, Date.now() / 1000);
  } catch (error) { logError('forecast-read', new Error('Forecast history ignored.')); }
}

function recordQuotaForecast(windows) {
  var now = Date.now() / 1000;
  forecastLastSuccessAt = now;
  // Without a stable identity, use only the current cycle baseline; never
  // reuse or persist a potentially different account's observations.
  if (!usageAccountId || readUsageAccountId() !== usageAccountId) {
    forecastHistoryRecords = [];
    return;
  }
  forecastHistoryRecords = updateForecastHistory(forecastHistoryRecords, windows, now, forecastBreakSegment);
  forecastBreakSegment = false;
  if(typeof recordAdaptiveQuota==='function')recordAdaptiveQuota(windows);
  try {
    writePrivateUsageJSON(forecastHistoryPath, {
      version: 2, algorithmVersion: FORECAST_ALGORITHM_VERSION, accountId: usageAccountId, savedAt: Date.now(), windows: forecastHistoryRecords
    });
  } catch (error) { logError('forecast-write', error); }
}

function canUseRecentQuotaDisplay() {
  var at=typeof usageLastGoodAt==='undefined'?0:usageLastGoodAt,now=Date.now()/1000;
  return (usageSyncState==='cached'||usageSyncState==='error'||usageSyncState==='ready'&&now-at>180)&&
    !!usageAccountId&&at>0&&now>=at&&now-at<=600&&
    typeof readUsageAccountId==='function'&&readUsageAccountId()===usageAccountId&&
    quotaWindows.every(function(w){return validForecastRemaining(w.remaining)&&validForecastWindow(w,now);});
}

function quotaDisplayContext() {
  var recent=canUseRecentQuotaDisplay();
  return {now:recent?usageLastGoodAt:Date.now()/1000,sync:recent?'ready':usageSyncState,
    lastSuccessAt:recent?usageLastGoodAt:forecastLastSuccessAt,accountKnown:!!usageAccountId,
    accountId:usageAccountId,plan:typeof usagePlanType==='undefined'?null:usagePlanType};
}

function currentQuotaForecasts() {
  return quotaWindows.map(function(window) {
    var record = forecastHistoryRecords.filter(function(item) { return item.durationMins === window.durationMins; })[0];
    // Brief failures render at the last real observation (<=10 minutes old).
    // No observations are added and the unseen interval is never called idle.
    var context=quotaDisplayContext();
    var original=forecastQuotaWindow(window,record,context);
    if(window.durationMins===300&&typeof afSessionForecast==='function')return afSessionForecast(window,record,context,original);
    if(typeof currentAdaptiveQuotaForecast==='function'){
      var adaptive=currentAdaptiveQuotaForecast(window,context);if(adaptive)return adaptive;
    }
    // Never replace observed-history forecasts, Session, exhausted or stale
    // states. No synthetic zeroes are inserted into the strict history model.
    if(window.durationMins===10080&&!original.basis&&original.budget&&typeof forecastTokenHistory==='function') {
      context.plan=typeof usagePlanType==='undefined'?null:usagePlanType;
      var rough=forecastTokenHistory(window,typeof tokenHistorySnapshot==='undefined'?null:tokenHistorySnapshot,context);
      if(rough)return rough;
    }
    return original;
  });
}

function currentObservedQuotaUse(window) {
  var record=forecastHistoryRecords.filter(function(item){return item.durationMins===window.durationMins;})[0];
  return observedQuotaUse(window,record,typeof tokenHistorySnapshot==='undefined'?null:tokenHistorySnapshot,quotaDisplayContext());
}

function observedQuotaUseLabel(window) {
  if(window.durationMins!==300&&window.durationMins!==10080)return '';
  var result=currentObservedQuotaUse(window),unit=window.durationMins===10080?'day':'h';
  if(!result)return 'Actual '+(unit==='day'?'daily':'hourly')+' use: observing';
  var value=result.pointsPerUnit.toFixed(1).replace(/\.0$/,'');
  return 'Actual '+(unit==='day'?'daily':'hourly')+' use: '+value+' pp';
}
