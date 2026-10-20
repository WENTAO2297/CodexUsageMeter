// Direct, low-frequency website queries through our native Keychain helper.
// No client-cache reads, AI polling, browser automation or VPN commands here.
function maoMaoYunAccountExecutable() {
  return resourcePath('MaoMaoYunAccount.app/Contents/MacOS/MaoMaoYunAccount');
}

function stopMaoMaoYunTrafficWakeRecovery() {
  // Clear the owner before invalidating native objects: a late timer must not
  // revive the previous wake's retry budget.
  maomaoyunTrafficWakeRecovery = null;
  var timer = maomaoyunTrafficWakeTimer;
  maomaoyunTrafficWakeTimer = null;
  stopTransientTimer(timer);
}

function beginMaoMaoYunTrafficWakeRecovery(waitForReconnect) {
  stopMaoMaoYunTrafficWakeRecovery();
  var now = Date.now();
  if (isExiting || maomaoyunTrafficLoginState.task ||
      now < Math.max(maomaoyunTrafficNextReadAt, maomaoyunHistoryNextReadAt)) return;
  maomaoyunTrafficWakeRecovery = { startedAt: now, deadline: now + MAOMAOYUN_TRAFFIC_WAKE_DEADLINE_MS,
    waitingForReconnect: !!waitForReconnect, readyAt: 0, nextAttemptAt: 0, attempts: 0 };
  // A suspended balance/history helper can otherwise hold the single-flight
  // slot until its watchdog runs. Keep validated data, not the old tasks.
  cancelBackgroundTask(maomaoyunTrafficReadState);
  cancelBackgroundTask(maomaoyunHistoryReadState);
  stopIdleMaoMaoYunTrafficTimer();
  if (maomaoyunTrafficSnapshot) maomaoyunTrafficSourceState = 'loading';
  try {
    maomaoyunTrafficWakeTimer = startTransientTimer(null, 1, 'maomaoyunTrafficWakeTimer:');
  } catch (ignored) { stopMaoMaoYunTrafficWakeRecovery(); }
  updateMaoMaoYunTrafficMenuItem();
}

function maoMaoYunTrafficVPNOperationFinished() {
  if (!maomaoyunTrafficWakeRecovery) return;
  maomaoyunTrafficWakeRecovery.waitingForReconnect = false;
  pollMaoMaoYunTrafficWakeRecovery();
}

function pollMaoMaoYunTrafficWakeRecovery() {
  var recovery = maomaoyunTrafficWakeRecovery, now = Date.now();
  if (!recovery) return;
  if (isExiting || now < recovery.startedAt || now >= recovery.deadline || maomaoyunTrafficLoginState.task ||
      now < Math.max(maomaoyunTrafficNextReadAt, maomaoyunHistoryNextReadAt)) {
    stopMaoMaoYunTrafficWakeRecovery(); return;
  }
  if (recovery.waitingForReconnect || vpnOperation || maomaoyunStatus !== 'connected') {
    recovery.readyAt = 0; return;
  }
  // Connected is not yet a successful website read. Allow routes to settle;
  // the helper's normal timeouts and the bounded retries handle slow networks.
  if (!recovery.readyAt) { recovery.readyAt = now + MAOMAOYUN_TRAFFIC_WAKE_SETTLE_MS; return; }
  if (now < recovery.readyAt || now < recovery.nextAttemptAt ||
      maomaoyunTrafficReadState.task || maomaoyunHistoryReadState.task) return;
  if (recovery.attempts >= 3) { stopMaoMaoYunTrafficWakeRecovery(); return; }
  requestMaoMaoYunTraffic(true, recovery);
}

function updateMaoMaoYunTrafficMenuItem() {
  if (!maomaoyunTrafficItem || !maomaoyunTrafficView) return;
  var forecast = typeof currentMaoMaoYunForecast==='function'?currentMaoMaoYunForecast(maomaoyunTrafficSnapshot,maomaoyunHistorySnapshot,Date.now()):
    maoMaoYunTrafficForecast(maomaoyunTrafficSnapshot,maomaoyunHistorySnapshot,Date.now());
  var presentation = maoMaoYunTrafficPresentation(maomaoyunTrafficSnapshot, maomaoyunTrafficSourceState, Date.now(), maomaoyunHistorySnapshot,forecast);
  var summary = trafficForecastSummary(maomaoyunTrafficSnapshot,presentation,forecast);
  if(typeof layoutMetricsPair==='function')layoutMetricsPair();
  var login = maoMaoYunTrafficNeedsLogin(maomaoyunTrafficSourceState);
  var key = JSON.stringify([presentation,summary]) + ':' + login;
  if (maomaoyunTrafficRenderKey === key) return;
  maomaoyunTrafficRenderKey = key;
  maomaoyunTrafficItem.title = 'Traffic · ' + presentation.value;
  maomaoyunTrafficItem.enabled = login;
  maomaoyunTrafficView.accessibilityRole = 'AXGroup';
  maomaoyunTrafficView.accessibilityValue = presentation.value + ' · ' + presentation.detail + ' · ' + presentation.usage +
    ' · ' + presentation.todayUsage + ' · ' + presentation.resetText + ' · ' + summary.headline + ' · ' + summary.detail + ' · ' + presentation.forecastText;
  if (typeof uiText === 'function') {
    maomaoyunTrafficItem.title = uiText(ObjC.unwrap(maomaoyunTrafficItem.title));
    maomaoyunTrafficView.accessibilityValue = uiText(ObjC.unwrap(maomaoyunTrafficView.accessibilityValue));
  }
  maomaoyunTrafficView.setNeedsDisplay(true);
}

function applyMaoMaoYunAccountResult(result) {
  if (result.state === 'ready') {
    var changed = !maomaoyunTrafficSnapshot || maomaoyunTrafficSnapshot.credentialRevision !== result.snapshot.credentialRevision;
    if (changed) {
      cancelBackgroundTask(maomaoyunHistoryReadState);
      stopIdleMaoMaoYunTrafficTimer();
      maomaoyunHistorySnapshot = null; maomaoyunHistoryLastReadAt = 0; maomaoyunHistoryNextReadAt = 0;
    }
    maomaoyunTrafficSnapshot = result.snapshot;
    maomaoyunTrafficSourceState = 'ready';
    maomaoyunTrafficNextReadAt = result.snapshot.todayRetryAt||0;
    if (maomaoyunTrafficNextReadAt) maomaoyunHistoryNextReadAt=Math.max(maomaoyunHistoryNextReadAt,maomaoyunTrafficNextReadAt);
    if (changed) restoreMaoMaoYunHistory();
    if(typeof recordAdaptiveVPN==='function')recordAdaptiveVPN(result.snapshot,maomaoyunHistorySnapshot);
  } else {
    // A missing/changed login or unsupported schema cannot safely retain an
    // old account's values. Only transient network/timeout/429 failures can.
    if (['authRequired', 'keychainLocked', 'credentialChanged', 'invalid'].indexOf(result.state) !== -1) {
      maomaoyunTrafficSnapshot = null;
      if(typeof resetAdaptiveVPN==='function')resetAdaptiveVPN();
      maomaoyunHistorySnapshot = null;
      cancelBackgroundTask(maomaoyunHistoryReadState);
      stopIdleMaoMaoYunTrafficTimer();
    }
    maomaoyunTrafficSourceState = result.state;
    maomaoyunTrafficNextReadAt = result.state === 'rateLimited' ? Date.now() + MAOMAOYUN_TRAFFIC_BACKOFF_MS : 0;
  }
  var recovery = maomaoyunTrafficWakeRecovery;
  if (recovery) {
    // Locked Keychain may recover after unlock; retry headlessly, but still
    // clear its unvalidated values above. Auth/schema/session failures and
    // origin 429 backoff are terminal, not reasons for automatic login.
    if (['error', 'timeout', 'keychainLocked'].indexOf(result.state) !== -1 &&
        recovery.attempts > 0 && recovery.attempts < 3 && Date.now() < recovery.deadline) {
      recovery.nextAttemptAt = Date.now() + (recovery.attempts === 1 ? 5000 : 15000);
    } else stopMaoMaoYunTrafficWakeRecovery();
  }
  updateMaoMaoYunTrafficMenuItem();
  if (result.state === 'ready') requestMaoMaoYunHistory();
}

function requestMaoMaoYunTraffic(force, wakeRequest) {
  if (isExiting) return;
  updateMaoMaoYunTrafficMenuItem();
  var recovery = maomaoyunTrafficWakeRecovery, now = Date.now();
  if (recovery && recovery !== wakeRequest) return;
  if (wakeRequest && (wakeRequest !== recovery || recovery.waitingForReconnect || vpnOperation ||
      maomaoyunStatus !== 'connected' || now < recovery.startedAt || now >= recovery.deadline ||
      !recovery.readyAt || now < recovery.readyAt || now < recovery.nextAttemptAt || recovery.attempts >= 3)) return;
  if (maomaoyunTrafficReadState.task || maomaoyunTrafficLoginState.task) return;
  if (maomaoyunHistoryReadState.task) return;
  if (now < Math.max(maomaoyunTrafficNextReadAt, maomaoyunHistoryNextReadAt)) return;
  var interval = force ? MAOMAOYUN_TRAFFIC_MIN_REFRESH_MS : MAOMAOYUN_TRAFFIC_REFRESH_MS;
  if (!wakeRequest && maomaoyunTrafficLastReadAt && now >= maomaoyunTrafficLastReadAt && now - maomaoyunTrafficLastReadAt < interval - 250) return;
  if (wakeRequest) recovery.attempts++;
  maomaoyunTrafficLastReadAt = now;
  try {
    // The helper accepts modes only; no credential travels via args/env/files.
    launchBackgroundTask(maoMaoYunAccountExecutable(), ['--read'], maomaoyunTrafficReadState, false);
    maomaoyunTrafficPollTimer = startTransientTimer(maomaoyunTrafficPollTimer, 0.25, 'maomaoyunTrafficTaskTimer:');
  } catch (ignored) {
    cancelBackgroundTask(maomaoyunTrafficReadState);
    maomaoyunTrafficPollTimer = stopTransientTimer(maomaoyunTrafficPollTimer);
    applyMaoMaoYunAccountResult({ state: 'error' });
  }
}

function pollMaoMaoYunTraffic() {
  pollMaoMaoYunHistory();
  var task = maomaoyunTrafficReadState.task;
  if (!task || isExiting) return;
  if (task.running) {
    if (Date.now() - maomaoyunTrafficReadState.startedAt > MAOMAOYUN_TRAFFIC_READ_TIMEOUT_MS) {
      cancelBackgroundTask(maomaoyunTrafficReadState);
      maomaoyunTrafficPollTimer = stopTransientTimer(maomaoyunTrafficPollTimer);
      applyMaoMaoYunAccountResult({ state: 'timeout' });
    }
    return;
  }
  var pipe = maomaoyunTrafficReadState.outputPipe;
  var ok = task.terminationStatus === 0;
  resetBackgroundTask(maomaoyunTrafficReadState);
  maomaoyunTrafficPollTimer = stopTransientTimer(maomaoyunTrafficPollTimer);
  if (!ok) { applyMaoMaoYunAccountResult({ state: 'error' }); return; }
  try {
    applyMaoMaoYunAccountResult(parseMaoMaoYunAccountResult(readBackgroundTaskOutput(pipe), Date.now()));
  } catch (ignored) {
    // Never log parsing exceptions/output; errors must not echo credentials.
    applyMaoMaoYunAccountResult({ state: 'invalid' });
  }
}

function signInMaoMaoYunAccount() {
  if (isExiting || maomaoyunTrafficLoginState.task || !maoMaoYunTrafficNeedsLogin(maomaoyunTrafficSourceState)) return;
  stopMaoMaoYunTrafficWakeRecovery();
  cancelBackgroundTask(maomaoyunTrafficReadState);
  cancelBackgroundTask(maomaoyunHistoryReadState);
  maomaoyunHistorySnapshot = null;
  maomaoyunTrafficPollTimer = stopTransientTimer(maomaoyunTrafficPollTimer);
  maomaoyunTrafficSnapshot = null;
  maomaoyunTrafficSourceState = 'signingIn';
  updateMaoMaoYunTrafficMenuItem();
  try {
    var loginMode = typeof uiLanguage !== 'undefined' && uiLanguage === 'en' ? '--login-en' : '--login';
    launchBackgroundTask(maoMaoYunAccountExecutable(), [loginMode], maomaoyunTrafficLoginState, false);
    maomaoyunTrafficLoginPollTimer = startTransientTimer(maomaoyunTrafficLoginPollTimer, 0.5, 'maomaoyunTrafficLoginTimer:');
  } catch (ignored) {
    cancelBackgroundTask(maomaoyunTrafficLoginState);
    maomaoyunTrafficLoginPollTimer = stopTransientTimer(maomaoyunTrafficLoginPollTimer);
    applyMaoMaoYunAccountResult({ state: 'authRequired' });
  }
}

function pollMaoMaoYunAccountLogin() {
  var task = maomaoyunTrafficLoginState.task;
  if (!task || isExiting) return;
  if (task.running) {
    if (Date.now() - maomaoyunTrafficLoginState.startedAt > MAOMAOYUN_TRAFFIC_LOGIN_TIMEOUT_MS) {
      cancelBackgroundTask(maomaoyunTrafficLoginState);
      maomaoyunTrafficLoginPollTimer = stopTransientTimer(maomaoyunTrafficLoginPollTimer);
      applyMaoMaoYunAccountResult({ state: 'authRequired' });
    }
    return;
  }
  var pipe = maomaoyunTrafficLoginState.outputPipe;
  var ok = task.terminationStatus === 0;
  resetBackgroundTask(maomaoyunTrafficLoginState);
  maomaoyunTrafficLoginPollTimer = stopTransientTimer(maomaoyunTrafficLoginPollTimer);
  var result;
  try { result = ok ? parseMaoMaoYunAccountResult(readBackgroundTaskOutput(pipe), Date.now()) : { state: 'authRequired' }; }
  catch (ignored) { result = { state: 'authRequired' }; }
  if (result.state === 'cancelled') {
    // User closed the window: don't reopen it. Revalidate any previously saved
    // session headlessly rather than resurrecting its old in-memory snapshot.
    maomaoyunTrafficSourceState = 'loading';
    maomaoyunTrafficLastReadAt = 0;
    maomaoyunTrafficNextReadAt = 0;
    requestMaoMaoYunTraffic(true);
    return;
  }
  maomaoyunTrafficLastReadAt = Date.now();
  applyMaoMaoYunAccountResult(result);
}

function stopMaoMaoYunTrafficRead() {
  stopMaoMaoYunTrafficWakeRecovery();
  cancelBackgroundTask(maomaoyunTrafficReadState);
  cancelBackgroundTask(maomaoyunTrafficLoginState);
  cancelBackgroundTask(maomaoyunHistoryReadState);
  maomaoyunTrafficPollTimer = stopTransientTimer(maomaoyunTrafficPollTimer);
  maomaoyunTrafficLoginPollTimer = stopTransientTimer(maomaoyunTrafficLoginPollTimer);
}

function restoreMaoMaoYunHistory() {
  // A restart first validates the Keychain session and current balance. The
  // history file can never resurrect a balance or another login's records.
  try {
    if (!$.NSFileManager.defaultManager.fileExistsAtPath(maomaoyunHistoryPath)) return;
    var raw = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(maomaoyunHistoryPath, $.NSUTF8StringEncoding, null));
    if (!raw || raw.length > 16384) return;
    var saved = JSON.parse(raw);
    if (saved.version !== 1) return;
    var h = normalizeMaoMaoYunHistory(saved.history, maomaoyunTrafficSnapshot, Date.now());
    if (Date.now() - h.fetchedAt <= 35 * 86400000) {
      maomaoyunHistorySnapshot = h;
      // One migration read can recover records the old helper trimmed. Once
      // the wider response is cached, ordinary six-hour cadence resumes.
      maomaoyunHistoryLastReadAt = h.retentionDays>=MAOMAOYUN_HISTORY_DAYS?h.fetchedAt:0;
    }
  } catch (ignored) { /* Only anonymous numeric summaries; never log file content. */ }
}

function requestMaoMaoYunHistory() {
  var now = Date.now();
  if (isExiting || !maomaoyunTrafficSnapshot || maomaoyunTrafficSourceState !== 'ready' ||
      maomaoyunHistoryReadState.task || maomaoyunTrafficReadState.task || maomaoyunTrafficLoginState.task ||
      now < maomaoyunTrafficNextReadAt || now < maomaoyunHistoryNextReadAt ||
      (maomaoyunHistoryLastReadAt && now >= maomaoyunHistoryLastReadAt && now - maomaoyunHistoryLastReadAt < MAOMAOYUN_HISTORY_REFRESH_MS)) return;
  maomaoyunHistoryLastReadAt = now;
  try {
    maomaoyunHistoryReadState.credentialRevision = maomaoyunTrafficSnapshot.credentialRevision;
    launchBackgroundTask(maoMaoYunAccountExecutable(), ['--history'], maomaoyunHistoryReadState, false);
    maomaoyunTrafficPollTimer = startTransientTimer(maomaoyunTrafficPollTimer, 0.25, 'maomaoyunTrafficTaskTimer:');
  } catch (ignored) { cancelBackgroundTask(maomaoyunHistoryReadState); stopIdleMaoMaoYunTrafficTimer(); }
}

function pollMaoMaoYunHistory() {
  var state = maomaoyunHistoryReadState, task = state.task;
  if (!task || isExiting) return;
  if (task.running) {
    if (Date.now() - state.startedAt > MAOMAOYUN_TRAFFIC_READ_TIMEOUT_MS) {
      cancelBackgroundTask(state); maomaoyunTrafficPollTimer = stopTransientTimer(maomaoyunTrafficPollTimer);
    }
    return;
  }
  var pipe = state.outputPipe, revision = state.credentialRevision, okay = task.terminationStatus === 0;
  resetBackgroundTask(state); maomaoyunTrafficPollTimer = stopTransientTimer(maomaoyunTrafficPollTimer);
  if (!okay || !maomaoyunTrafficSnapshot || revision !== maomaoyunTrafficSnapshot.credentialRevision) return;
  try {
    var result = parseMaoMaoYunHistoryResult(readBackgroundTaskOutput(pipe), maomaoyunTrafficSnapshot, Date.now());
    if (result.state === 'rateLimited') {
      maomaoyunHistoryNextReadAt = Date.now() + MAOMAOYUN_TRAFFIC_BACKOFF_MS;
      maomaoyunTrafficNextReadAt = Math.max(maomaoyunTrafficNextReadAt, maomaoyunHistoryNextReadAt);
    }
    if (result.state === 'outputLimited' || result.state === 'invalid' || result.state === 'credentialChanged') {
      maomaoyunHistorySnapshot = null; maomaoyunTrafficRenderKey = null; updateMaoMaoYunTrafficMenuItem();
    }
    if (result.history) {
      // Replace the response snapshot: corrections to a date never add again.
      maomaoyunHistorySnapshot = result.history;
      if(typeof recordAdaptiveVPN==='function')recordAdaptiveVPN(maomaoyunTrafficSnapshot,result.history);
      maomaoyunTrafficRenderKey = null;
      updateMaoMaoYunTrafficMenuItem();
      try { writePrivateJSON(maomaoyunHistoryPath, {version:1,history:result.history}); } catch (ignoredWrite) { /* memory remains usable */ }
    }
  } catch (ignored) {
    maomaoyunHistorySnapshot = null; maomaoyunTrafficRenderKey = null; updateMaoMaoYunTrafficMenuItem();
  }
}

function stopIdleMaoMaoYunTrafficTimer() {
  if (!maomaoyunTrafficReadState.task && !maomaoyunHistoryReadState.task)
    maomaoyunTrafficPollTimer = stopTransientTimer(maomaoyunTrafficPollTimer);
}
