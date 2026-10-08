ObjC.import('AppKit');
ObjC.import('Foundation');
ObjC.import('objc');
ObjC.bindFunction('objc_msgSend', ['void', ['id', 'SEL']]);

// Some AppKit selectors are not exposed as JavaScript functions. objc_msgSend keeps
// the custom view compatible with the system's AppKit bridge.
function sendVoid(object, selectorName) {
  $.objc_msgSend(object, $.sel_registerName(selectorName));
}

// NSMenu switches the main run loop into event-tracking mode while it is
// visible. Timers scheduled in the default mode pause there, which used to
// leave an open menu with stale running-task rows. Common modes keep timers
// alive during both normal app activity and menu tracking.
function scheduleCommonModeTimer(interval, selector, repeats) {
  try {
    var timer = $.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(
      interval, delegate, selector, null, repeats
    );
    $.NSRunLoop.currentRunLoop.addTimerForMode(timer, $.NSRunLoopCommonModes);
    return timer;
  } catch (error) {
    // Preserve the established default-mode behavior on an older macOS build
    // rather than allowing a timer setup failure to affect the meter.
    return $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
      interval, delegate, selector, null, repeats
    );
  }
}

function startTransientTimer(currentTimer, interval, selector) {
  if (currentTimer) return currentTimer;
  return scheduleCommonModeTimer(interval, selector, true);
}

function stopTransientTimer(currentTimer) {
  if (currentTimer) sendVoid(currentTimer, 'invalidate');
  return null;
}

// All external readers use the same non-blocking NSTask lifecycle. Keeping
// launch/reset/output conversion here prevents one subsystem from drifting
// into a subtly different timeout or pipe-handling implementation.
function createBackgroundTaskState(fields) {
  var state = { task: null, outputPipe: null, startedAt: 0 };
  Object.keys(fields || {}).forEach(function(key) { state[key] = fields[key]; });
  return state;
}

function launchBackgroundTask(executablePath, argumentsList, state, captureStandardError) {
  var task = $.NSTask.alloc.init;
  var outputPipe = $.NSPipe.pipe;
  task.executableURL = $.NSURL.fileURLWithPath(executablePath);
  task.arguments = argumentsList;
  task.standardOutput = outputPipe;
  task.standardError = captureStandardError ? outputPipe : $.NSFileHandle.fileHandleWithStandardError;
  if (!task.launchAndReturnError(null)) throw new Error('Unable to launch background task: ' + executablePath);
  state.task = task;
  state.outputPipe = outputPipe;
  state.startedAt = Date.now();
  if (Object.prototype.hasOwnProperty.call(state, 'timedOut')) state.timedOut = false;
  return task;
}

function resetBackgroundTask(state) {
  state.task = null;
  state.outputPipe = null;
  state.startedAt = 0;
  if (Object.prototype.hasOwnProperty.call(state, 'timedOut')) state.timedOut = false;
}

function cancelBackgroundTask(state) {
  if (state.task && state.task.running) sendVoid(state.task, 'terminate');
  resetBackgroundTask(state);
}

function readBackgroundTaskOutput(outputPipe) {
  var outputData = outputPipe.fileHandleForReading.readDataToEndOfFile;
  var output = $.NSString.alloc.initWithDataEncoding(outputData, $.NSUTF8StringEncoding);
  return output ? ObjC.unwrap(output) : '';
}


function logError(component, error) {
  // The supervisor captures stderr and rotates it after each process exit.
  // Bound live growth as well, and rate-limit duplicate errors.
  try {
    var key = component + ':' + String(error);
    var now = Date.now();
    if (logError.lastKey === key && now - logError.lastAt < 60000) return;
    logError.lastKey = key; logError.lastAt = now;
    var path = ObjC.unwrap($.NSHomeDirectory()) + '/Library/Application Support/CodexUsageMeter/widget-errors.log';
    var manager = $.NSFileManager.defaultManager;
    // JXA bridges null to NSNull here, which NSDictionary attributes cannot
    // accept. An empty dictionary lets the first diagnostic file be created.
    if (!manager.fileExistsAtPath(path)) manager.createFileAtPathContentsAttributes(path, $.NSData.data, $.NSDictionary.dictionary);
    var handle = $.NSFileHandle.fileHandleForWritingAtPath(path);
    if (Number(handle.seekToEndOfFile) > 200000) handle.truncateFileAtOffset(0);
    handle.writeData($(new Date().toISOString() + ' [' + component + '] ' + String(error).slice(0, 1500) + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
    handle.closeFile;
  } catch (ignored) {}
}

function fileRevision(path) {
  try {
    var attributes = $.NSFileManager.defaultManager.attributesOfItemAtPathError($(path), null);
    if (!attributes) return 'missing';
    var modified = attributes.objectForKey($.NSFileModificationDate);
    var size = attributes.objectForKey($.NSFileSize);
    var timestamp = modified ? Number(modified.timeIntervalSince1970) : 0;
    return timestamp + ':' + (size ? Number(ObjC.unwrap(size)) : 0);
  } catch (error) {
    return 'unavailable';
  }
}

function combinedRevision(paths) {
  var revisions = [];
  for (var i = 0; i < paths.length; i++) revisions.push(fileRevision(paths[i]));
  return revisions.join('|');
}

function resourcePath(name) {
  return ObjC.unwrap($.NSBundle.mainBundle.resourcePath) + '/' + name;
}
