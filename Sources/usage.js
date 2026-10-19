// ===== Usage refresh ========================================================
function ensureUsagePollTimer() {
  usagePollTimer = startTransientTimer(usagePollTimer, 0.25, 'usageTaskTimer:');
}

function syncUsageAccount() {
  var currentId = readUsageAccountId();
  if (currentId === usageAccountId) return;
  usageAccountId = currentId;
  usagePlanType = null;
  usageLastGoodAt = 0;
  if(typeof resetTokenHistory==='function')resetTokenHistory();
  restoreForecastHistory(currentId);
  quotaWindows = [{ label: 'Quota', durationMins: null, remaining: null, resetAt: null }];
  availableCredits = null;
  resetCreditExpirations = [];
  if(typeof resetTokenMeter==='function')resetTokenMeter();
  resetCreditCards=[];
  usageSyncState = 'loading';
  usageText = '!';
  var cached = readUsageCache(currentId);
  if (cached) {
    usageLastGoodAt = cached.savedAt/1000;
    usagePlanType = cached.planType;
    // Backward-compatible last-known plan, not a claim of a fresh plan read.
    var tokens=typeof tokenHistorySnapshot==='undefined'?null:tokenHistorySnapshot;
    var anchor=tokens&&tokens.accountId===currentId&&tokens.anchors[tokens.anchors.length-1];
    if(!usagePlanType&&anchor&&cached.windows.some(function(w){return w.durationMins===10080&&Math.abs(w.resetAt-anchor.resetAt)<=600;}))usagePlanType=anchor.plan;
    quotaWindows = cached.windows;
    availableCredits = cached.credits;
    resetCreditExpirations = cached.expirations;
    if(typeof observeResetCards==='function')resetCreditCards=observeResetCards(cached.resetCards,cached.expirations,[],cached.savedAt/1000,cached.credits);
    usageSyncState = 'cached';
    var gauge = gaugeQuotaWindow(quotaWindows);
    usageText = gauge.label + ' ' + gauge.remaining + '% · stale';
  }
  stopQuotaRingAnimation();
  statusIconQuotaFraction = cached ? gaugeQuotaWindow(quotaWindows).remaining / 100 : 0.02;
  statusIconQuotaTargetFraction = statusIconQuotaFraction;
  rebuildStatusIconImages();
  redrawUsageCardIfNeeded(true);
  updateStatusButtonTitle();
}

function applyUsagePayload(result) {
  var normalized = normalizeUsage(result);
  quotaWindows = normalized.windows;
  availableCredits = normalized.credits;
  resetCreditExpirations = normalized.expirations;
  if(typeof observeResetCards==='function'){
    resetCreditCards=observeResetCards(normalized.resetCards,normalized.expirations,resetCreditCards,Date.now()/1000,normalized.credits);
    normalized.resetCards=resetCreditCards;
  }
  usageSyncState = 'ready';
  var payload=result.result,limit=payload.rateLimitsByLimitId&&payload.rateLimitsByLimitId.codex||payload.rateLimits;
  usagePlanType=limit&&typeof limit.planType==='string'?limit.planType:null;
  recordQuotaForecast(quotaWindows);
  usageLastGoodAt = typeof forecastLastSuccessAt==='number'&&forecastLastSuccessAt>0?forecastLastSuccessAt:Date.now()/1000;
  if(typeof requestTokenHistoryRead==='function')requestTokenHistoryRead();
  var gauge = gaugeQuotaWindow(quotaWindows);
  animateStatusIconQuota(gauge.remaining / 100);
  redrawUsageCardIfNeeded(false);
  updateStatusIcon();
  updateUsageLabel(gauge.label + ' ' + gauge.remaining + '%');
  saveUsageCache(normalized);
}

function showUsageError() {
  usageSyncState = 'error';
  var gauge = gaugeQuotaWindow(quotaWindows);
  // A failed refresh does not invalidate the last known quota. Preserve both
  // the gauge and any animation toward that value, just as the card does.
  if (gauge.remaining === null) {
    stopQuotaRingAnimation();
    statusIconQuotaTargetFraction = 0.02;
    statusIconQuotaFraction = 0.02;
    rebuildStatusIconImages();
  }
  redrawUsageCardIfNeeded(true);
  setMenuBarText(gauge.remaining === null ? '!' : gauge.label + ' ' + gauge.remaining + '% · stale');
  updateStatusIcon();
}

function startUsageRefresh() {
  syncUsageAccount();
  // A retry does not erase the previous failure (or the cached value). Only
  // first launch/account change has the generic loading presentation.
  if (gaugeQuotaWindow(quotaWindows).remaining === null && usageSyncState !== 'error') {
    usageSyncState = 'loading';
    redrawUsageCardIfNeeded(true);
  }
  try {
    refreshState.accountId = usageAccountId;
    launchBackgroundTask(
      '/bin/zsh',
      [resourcePath('usage-reader.zsh')],
      refreshState,
      false
    );
    ensureUsagePollTimer();
  } catch (error) {
    logError('usage-launch', error);
    resetBackgroundTask(refreshState);
    usagePollTimer = stopTransientTimer(usagePollTimer);
    showUsageError();
  }
}

function requestUsageRefresh() {
  // Opening the menu must clear an old account's value even if its reader is
  // still in flight. Keep the existing request coalescing/late-reply guard.
  syncUsageAccount();
  if (refreshState.task) {
    // Coalesce overlapping timer requests into one trailing refresh rather
    // than spawning multiple app-server processes.
    refreshState.queued = true;
    return;
  }
  startUsageRefresh();
}

function pollUsageRefresh() {
  var task = refreshState.task;
  if (!task) return;

  if (task.running) {
    // usage-reader already has protocol timeouts; this watchdog protects the
    // menu-bar process if a child ignores them for any reason.
    if (!refreshState.timedOut && Date.now() - refreshState.startedAt > USAGE_READ_TIMEOUT_MS) {
      refreshState.timedOut = true;
      sendVoid(task, 'terminate');
    }
    return;
  }

  var outputPipe = refreshState.outputPipe;
  var timedOut = refreshState.timedOut;
  var requestAccountId = refreshState.accountId;
  resetBackgroundTask(refreshState);

  try {
    if (requestAccountId !== readUsageAccountId()) {
      // Discard an in-flight reply from the previous account and retry for the
      // current account. Do not overwrite its cache with a late response.
      syncUsageAccount();
      refreshState.queued = true;
      throw new Error('The account changed during the usage read.');
    }
    if (timedOut) throw new Error('The usage reader exceeded the 50-second watchdog.');
    if (task.terminationStatus !== 0) throw new Error('The usage reader exited with status ' + task.terminationStatus + '.');
    var raw = readBackgroundTaskOutput(outputPipe);
    if (!raw) throw new Error('The usage reader returned no data.');
    applyUsagePayload(JSON.parse(raw));
  } catch (error) {
    logError('usage', error);
    showUsageError();
  }

  if (refreshState.queued) {
    refreshState.queued = false;
    startUsageRefresh();
  } else {
    usagePollTimer = stopTransientTimer(usagePollTimer);
  }
}

function refresh() {
  // Usage refresh is intentionally independent from the task-activity poll.
  requestUsageRefresh();
}

function refreshAllSources() {
  requestUsageRefresh();
  requestRunningTasksRead(true);
  redrawUsageCardIfNeeded(false);
  requestMaoMaoYunStatus(true);
  requestMaoMaoYunTraffic(true);
  if(typeof requestTokenMeterRead==='function')requestTokenMeterRead(true);
}
