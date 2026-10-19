function ensureMaoMaoYunPollTimer() {
  maomaoyunPollTimer = startTransientTimer(maomaoyunPollTimer, 0.1, 'maomaoyunTaskTimer:');
}

// ===== MaoMaoYun VPN =======================================================
// MaoMaoYun registers a macOS VPN service named "MaoMaoYun". Use the native
// scutil network-connection interface instead of driving its SwiftUI window;
// this keeps the menu item usable even when the client window is hidden.
function openMaoMaoYunApp() {
  try {
    var task = $.NSTask.alloc.init;
    task.executableURL = $.NSURL.fileURLWithPath('/usr/bin/open');
    task.arguments = ['-b', maomaoyunBundleIdentifier];
    if (!task.launchAndReturnError(null)) throw new Error('Unable to open MaoMaoYun.');
  } catch (error) {
    // Opening the client is a convenience; VPN control through scutil remains
    // available if LaunchServices cannot locate the application bundle.
  }
}

function maomaoyunStatusLabel() {
  if (maomaoyunStatus === 'connected') return 'Connected';
  if (maomaoyunStatus === 'disconnected') return 'Disconnected';
  if (maomaoyunStatus === 'connecting') return 'Connecting';
  if (maomaoyunStatus === 'disconnecting') return 'Disconnecting';
  if (maomaoyunStatus === 'error') return 'Unavailable';
  return 'Checking';
}

// The thumb follows the requested direction while the amber status dot and
// dimmed track distinguish pending work from a confirmed connection.
function vpnSwitchTarget() {
  if (vpnSwitchPreviewValue !== null) return vpnSwitchPreviewValue;
  return maomaoyunStatus === 'connected' || maomaoyunStatus === 'connecting' ? 1 : 0;
}

function previewVPNSwitch() {
  if (isExiting) return;
  vpnSwitchPreviewValue = vpnSwitchTarget() ? 0 : 1;
  updateVPNSwitchAnimation();
  if (maomaoyunView) maomaoyunView.needsDisplay = true;
}

function stopVPNSwitchAnimation() {
  vpnSwitchAnimation.timer = stopTransientTimer(vpnSwitchAnimation.timer);
  vpnSwitchAnimation.value = vpnSwitchAnimation.target = vpnSwitchTarget();
  if (maomaoyunView) maomaoyunView.needsDisplay = true;
}

function stepVPNSwitchAnimation() {
  var elapsed = Date.now() - vpnSwitchAnimation.startedAt;
  var t = Math.max(0, Math.min(1, elapsed / 280));
  if (!menuIsOpen || isExiting) {
    stopVPNSwitchAnimation();
    return;
  }
  if (elapsed < 0 || t >= 1 || statusDisplayReducedMotion()) {
    vpnSwitchAnimation.timer = stopTransientTimer(vpnSwitchAnimation.timer);
    vpnSwitchAnimation.value = vpnSwitchAnimation.target;
    if (maomaoyunView) maomaoyunView.needsDisplay = true;
    return;
  }
  // Smooth acceleration and braking: zero velocity/acceleration at both
  // endpoints, unlike the previous fast-start cubic ease-out.
  var eased = t * t * t * (t * (6 * t - 15) + 10);
  vpnSwitchAnimation.value = vpnSwitchAnimation.from + (vpnSwitchAnimation.target - vpnSwitchAnimation.from) * eased;
  if (maomaoyunView) maomaoyunView.needsDisplay = true;
}

function updateVPNSwitchAnimation() {
  var target = vpnSwitchTarget();
  if (!menuIsOpen || isExiting || statusDisplayReducedMotion()) {
    stopVPNSwitchAnimation();
    return;
  }
  if (target === vpnSwitchAnimation.target) return;
  // Sample the previous trajectory before reversing a rapid manual toggle.
  if (vpnSwitchAnimation.timer) stepVPNSwitchAnimation();
  vpnSwitchAnimation.from = vpnSwitchAnimation.value;
  vpnSwitchAnimation.target = target;
  vpnSwitchAnimation.startedAt = Date.now();
  vpnSwitchAnimation.timer = startTransientTimer(vpnSwitchAnimation.timer, 1 / 60, 'vpnSwitchAnimationTimer:');
}

function updateMaoMaoYunMenuItem() {
  if (!maomaoyunItem) return;
  // Keep an accessible fallback title while the visible custom row stays
  // compact and uses a subtle status dot instead of a checkmark.
  maomaoyunItem.title = 'MaoMaoYun  ·  ' + maomaoyunStatusLabel();
  if (typeof uiText === 'function') maomaoyunItem.title = uiText(ObjC.unwrap(maomaoyunItem.title));
  maomaoyunItem.enabled = true;
  updateVPNSwitchAnimation();
  if (maomaoyunView) maomaoyunView.setNeedsDisplay(true);
  if (typeof vpnAppButton!=='undefined'&&vpnAppButton) vpnAppButton.needsDisplay=true;
}

function parseMaoMaoYunStatus(raw) {
  var firstLine = String(raw || '').split(/\r\n|\n|\r/)[0].trim().toLowerCase();
  if (firstLine === 'connected') return 'connected';
  if (firstLine === 'disconnected') return 'disconnected';
  if (firstLine === 'connecting') return 'connecting';
  if (firstLine === 'disconnecting') return 'disconnecting';
  if (firstLine === 'no service' || firstLine.indexOf('no service') === 0) return 'error';
  return 'unknown';
}

function requestMaoMaoYunStatus(force) {
  if (maomaoyunReadState.task || maomaoyunActionState.task) return;
  if (!force && Date.now() - maomaoyunLastStatusRequestAt < MAOMAOYUN_STABLE_REFRESH_MS - 250) return;
  try {
    launchBackgroundTask('/usr/sbin/scutil', ['--nc', 'status', maomaoyunServiceName], maomaoyunReadState, true);
    maomaoyunLastStatusRequestAt = Date.now();
    ensureMaoMaoYunPollTimer();
  } catch (error) { logError('vpn-status', error); vpnFailure(); }
}

function finishVPNOperation(ok) {
  if (!ok) logError('vpn', 'Operation failed or timed out');
  vpnOperation = null;
  vpnNextAttemptAt = 0;
  if (!ok) maomaoyunStatus = 'error';
  updateMaoMaoYunMenuItem();
  if (typeof maoMaoYunTrafficVPNOperationFinished === 'function') maoMaoYunTrafficVPNOperationFinished();
}

function vpnFailure() {
  if (vpnOperation && vpnOperation.attempts < 3 && Date.now() < vpnOperation.deadline) {
    vpnNextAttemptAt = Date.now() + 3000;
    ensureMaoMaoYunPollTimer();
  } else finishVPNOperation(false);
}

function sendVPNCommand(action) {
  cancelBackgroundTask(maomaoyunReadState);
  if (maomaoyunActionState.task) return;
  try {
    vpnOperation.attempts++;
    vpnNextAttemptAt = 0;
    maomaoyunStatus = action === 'stop' ? 'disconnecting' : 'connecting';
    launchBackgroundTask('/usr/sbin/scutil', ['--nc', action, maomaoyunServiceName], maomaoyunActionState, true);
    maomaoyunActionState.action = action;
    ensureMaoMaoYunPollTimer();
    updateMaoMaoYunMenuItem();
  } catch (error) { logError('vpn-command', error); resetBackgroundTask(maomaoyunActionState); vpnFailure(); }
}

function startMaoMaoYunAction(action, reconnect) {
  if (!reconnect && typeof stopMaoMaoYunTrafficWakeRecovery === 'function') stopMaoMaoYunTrafficWakeRecovery();
  cancelBackgroundTask(maomaoyunActionState);
  cancelBackgroundTask(maomaoyunReadState);
  vpnOperation = { phase: action, reconnect: !!reconnect, attempts: 0, deadline: Date.now() + 60000 };
  sendVPNCommand(action);
}

function reconnectMaoMaoYunAfterWake() {
  if (Date.now() - vpnLastWakeAt < 5000) return;
  vpnLastWakeAt = Date.now();
  if (typeof beginMaoMaoYunTrafficWakeRecovery === 'function') beginMaoMaoYunTrafficWakeRecovery(true);
  startMaoMaoYunAction('stop', true);
}

function toggleMaoMaoYun() {
  // A manual click supersedes automatic reconnect, including pending retries.
  if (maomaoyunStatus === 'connected' || maomaoyunStatus === 'connecting') {
    startMaoMaoYunAction('stop', false);
  } else if (maomaoyunStatus !== 'disconnecting') startMaoMaoYunAction('start', false);
}

function pollMaoMaoYunAction() {
  var task = maomaoyunActionState.task;
  if (!task) return;
  if (task.running) {
    if (Date.now() - maomaoyunActionState.startedAt > MAOMAOYUN_ACTION_TIMEOUT_MS) {
      cancelBackgroundTask(maomaoyunActionState); vpnFailure();
    }
    return;
  }
  var ok = task.terminationStatus === 0;
  var output = readBackgroundTaskOutput(maomaoyunActionState.outputPipe);
  resetBackgroundTask(maomaoyunActionState);
  if (!ok) { logError('vpn-command', output); vpnFailure(); return; }
  requestMaoMaoYunStatus(true);
}

function pollMaoMaoYunStatus() {
  var task = maomaoyunReadState.task;
  if (!task) return;
  if (task.running) {
    if (Date.now() - maomaoyunReadState.startedAt > MAOMAOYUN_STATUS_TIMEOUT_MS) {
      cancelBackgroundTask(maomaoyunReadState); vpnFailure();
    }
    return;
  }
  var ok = task.terminationStatus === 0;
  var raw = readBackgroundTaskOutput(maomaoyunReadState.outputPipe);
  resetBackgroundTask(maomaoyunReadState);
  maomaoyunStatus = ok ? parseMaoMaoYunStatus(raw) : 'error';
  if (maomaoyunStatus === 'unknown') maomaoyunStatus = 'error';
  if (vpnOperation) {
    if (vpnOperation.phase === 'stop' && maomaoyunStatus === 'disconnected') {
      if (vpnOperation.reconnect) {
        vpnOperation.phase = 'start'; vpnOperation.attempts = 0;
        sendVPNCommand('start'); return;
      }
      finishVPNOperation(true);
    } else if (vpnOperation.phase === 'start' && maomaoyunStatus === 'connected') {
      finishVPNOperation(true);
    } else if (maomaoyunStatus === 'error' ||
      (vpnOperation.phase === 'start' && maomaoyunStatus === 'disconnected')) {
      vpnFailure();
    }
  }
  updateMaoMaoYunMenuItem();
}

function pollMaoMaoYunTasks() {
  if (vpnOperation && Date.now() >= vpnOperation.deadline) {
    cancelBackgroundTask(maomaoyunActionState); cancelBackgroundTask(maomaoyunReadState);
    finishVPNOperation(false);
  }
  pollMaoMaoYunAction();
  pollMaoMaoYunStatus();
  if (vpnOperation && vpnNextAttemptAt && Date.now() >= vpnNextAttemptAt) {
    sendVPNCommand(vpnOperation.phase);
  }
  var busy = maomaoyunReadState.task || maomaoyunActionState.task;
  if (vpnOperation && !busy && !vpnNextAttemptAt &&
      Date.now() - maomaoyunLastStatusRequestAt >= MAOMAOYUN_TRANSITION_REFRESH_MS) {
    requestMaoMaoYunStatus(true);
  }
  if (menuIsOpen && vpnOperation) {
    if (maomaoyunView) maomaoyunView.setNeedsDisplay(true);
    if (typeof vpnAppButton!=='undefined'&&vpnAppButton) vpnAppButton.needsDisplay=true;
  }
  if (!vpnOperation && !maomaoyunReadState.task && !maomaoyunActionState.task) {
    maomaoyunPollTimer = stopTransientTimer(maomaoyunPollTimer);
  }
}
