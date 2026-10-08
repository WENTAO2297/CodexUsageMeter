// ===== User commands and AppKit delegate ====================================
function openChatGPTWeb() {
  $.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString('https://chatgpt.com'));
}

function openCodexURL(path) {
  $.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString('codex://' + path));
}

function newTask() {
  openCodexURL('threads/new');
}

function openPinnedThread(sender) {
  try {
    var represented = sender.representedObject;
    var threadId = represented ? ObjC.unwrap(represented) : '';
    if (/^[0-9a-fA-F-]{36}$/.test(threadId)) {
      openCodexURL('threads/' + threadId);
    }
  } catch (error) {
    // A stale row should never affect the menu-bar component itself.
  }
}

function quitCodex() {
  // Let Codex close gracefully; the independent menu-bar component remains
  // available after the desktop app exits.
  var codexApps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.openai.codex');
  for (var i = 0; i < codexApps.count; i++) {
    codexApps.objectAtIndex(i).terminate();
  }
}

function restartMeter() {
  // The app's native supervisor owns the lifecycle and will launch one fresh
  // instance as soon as this process exits. Codex and the VPN are untouched.
  if (isExiting) return;
  isExiting = true;
  usagePollTimer = stopTransientTimer(usagePollTimer);
  maomaoyunPollTimer = stopTransientTimer(maomaoyunPollTimer);
  cancelBackgroundTask(maomaoyunReadState);
  cancelBackgroundTask(maomaoyunActionState);
  cancelBackgroundTask(refreshState);
  cancelBackgroundTask(runningReadState);
  cancelBackgroundTask(pinnedReadState);


  stopQuotaRingAnimation();
  $.NSApplication.sharedApplication.terminate(null);
}

ObjC.registerSubclass({
  name: 'CodexUsageMeterDelegate',
  methods: {
    'menuWillOpen:': {
      types: ['void', ['id']],
      implementation: function() { menuIsOpen = true; refreshAllSources(); }
    },
    'menuDidClose:': {
      types: ['void', ['id']],
      implementation: function() { menuIsOpen = false; }
    },
    'workspaceDidWake:': {
      types: ['void', ['id']],
      implementation: function() {
        reconnectMaoMaoYunAfterWake();
        refreshAllSources();
      }
    },
    'openChatGPTWeb:': {
      types: ['void', ['id']],
      implementation: function() { openChatGPTWeb(); }
    },
    'newTask:': {
      types: ['void', ['id']],
      implementation: function() { newTask(); }
    },
    'openPinnedThread:': {
      types: ['void', ['id']],
      implementation: function(sender) { openPinnedThread(sender); }
    },
    'toggleMaoMaoYun:': {
      types: ['void', ['id']],
      implementation: function() { toggleMaoMaoYun(); }
    },
    'quitCodex:': {
      types: ['void', ['id']],
      implementation: function() { quitCodex(); }
    },
    'restartMeter:': {
      types: ['void', ['id']],
      implementation: function() { restartMeter(); }
    },
    'refreshTimer:': {
      types: ['void', ['id']],
      implementation: function() { refresh(); }
    },
    'runningStatusTimer:': {
      types: ['void', ['id']],
      implementation: function() {
        pollRunningTasksRead();
        pollPinnedThreadsRead();
        requestRunningTasksRead();
      }
    },
    'pinnedTasksTimer:': {
      types: ['void', ['id']],
      implementation: function() {
        requestPinnedThreadsRead(false);
      }
    },
    'usageTaskTimer:': {
      types: ['void', ['id']],
      implementation: function() { pollUsageRefresh(); }
    },
    'maomaoyunTaskTimer:': {
      types: ['void', ['id']],
      implementation: function() { pollMaoMaoYunTasks(); }
    },
    'maomaoyunStatusTimer:': {
      types: ['void', ['id']],
      implementation: function() { requestMaoMaoYunStatus(false); }
    },
    'stepQuotaRingAnimation:': {
      types: ['void', ['id']],
      implementation: function() { if (!isExiting) stepIconAnimation(); }
    }


  }
});
delegate = $.CodexUsageMeterDelegate.alloc.init;
$.NSWorkspace.sharedWorkspace.notificationCenter.addObserverSelectorNameObject(
  delegate,
  'workspaceDidWake:',
  $.NSWorkspaceDidWakeNotification,
  null
);

$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
// Restore only a validated snapshot of this account, before the first icon
// and card are drawn. It is explicitly stale until the live endpoint replies.
syncUsageAccount();
statusItem = $.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);
statusButton = statusItem.button;
configureMenuBarIcon();
setMenuBarText(usageText);

buildMenu();
statusButton.toolTip = 'Codex Usage';
updateTaskSectionsMenu();
rebuildStatusIconImages();
updateStatusButtonTitle();
redrawUsageCardIfNeeded(true);
refreshAllSources();
// Quota windows change slowly. Refresh once per minute in the background and
// immediately whenever the user opens the menu.
scheduleCommonModeTimer(60, 'refreshTimer:', true);
// Task activity is independent of the quota endpoint. A direct SQLite read
// every two seconds keeps the icon accurate while a menu is open.
scheduleCommonModeTimer(2, 'runningStatusTimer:', true);
// Pinned-task changes are infrequent, but a short poll keeps this section
// automatically synchronized without requiring a manual menu refresh.
scheduleCommonModeTimer(15, 'pinnedTasksTimer:', true);
// Stable VPN state is inexpensive to sample every five seconds. Its 0.1s
// completion/animation timer exists only while a query or transition is live.
scheduleCommonModeTimer(MAOMAOYUN_STABLE_REFRESH_MS / 1000, 'maomaoyunStatusTimer:', true);
$.NSRunLoop.currentRunLoop.run;
