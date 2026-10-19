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

function restartMeter() {
  // The app's native supervisor owns the lifecycle and will launch one fresh
  // instance as soon as this process exits. Codex and the VPN are untouched.
  if (isExiting) return;
  isExiting = true;
  if(typeof clearMenuRowHover==='function')clearMenuRowHover();
  if(typeof flushMenuViewCallbacks==='function')flushMenuViewCallbacks();
  if(typeof stopMenuTracking==='function')stopMenuTracking();
  if(typeof tokenMeterReadState!=='undefined')cancelBackgroundTask(tokenMeterReadState);
  if(typeof tokenMeterPollTimer!=='undefined')tokenMeterPollTimer=stopTransientTimer(tokenMeterPollTimer);
  if(typeof stopTokenMeterAnimation==='function')stopTokenMeterAnimation();
  if(typeof clearTokenActivityHover==='function')clearTokenActivityHover();
  stopStatusDisplayAnimation();
  if (typeof stopLanguageAnimation === 'function') stopLanguageAnimation();
  if (typeof stopPreferencesAnimation === 'function') stopPreferencesAnimation();
  usagePollTimer = stopTransientTimer(usagePollTimer);
  maomaoyunPollTimer = stopTransientTimer(maomaoyunPollTimer);
  if (typeof stopVPNSwitchAnimation === 'function') stopVPNSwitchAnimation();
  cancelBackgroundTask(maomaoyunReadState);
  cancelBackgroundTask(maomaoyunActionState);
  stopMaoMaoYunTrafficRead();
  cancelBackgroundTask(refreshState);
  cancelBackgroundTask(runningReadState);
  tokenHistoryPollTimer=stopTransientTimer(tokenHistoryPollTimer);
  cancelBackgroundTask(tokenHistoryReadState);


  stopQuotaRingAnimation();
  $.NSApplication.sharedApplication.terminate(null);
}

ObjC.registerSubclass({
  name: 'CodexUsageMeterDelegate',
  methods: {
    'menuWillOpen:': {
      types: ['void', ['id']],
      implementation: function() {
        menuIsOpen = true;
        if (typeof stopVPNSwitchAnimation === 'function') stopVPNSwitchAnimation();
        if(typeof clearMenuRowHover==='function')clearMenuRowHover();
        setStatusDisplayOptionsExpanded(false);
        if (typeof setLanguageOptionsExpanded === 'function') setLanguageOptionsExpanded(false);
        if (typeof setPreferencesExpanded === 'function') setPreferencesExpanded(false, false);
        if (typeof setTokenMeterExpanded === 'function') setTokenMeterExpanded(false, false);
        if(typeof startMenuTracking==='function')startMenuTracking();
        if(typeof flushMenuViewCallbacks==='function')flushMenuViewCallbacks();
        refreshAllSources();
      }
    },
    'menuDidClose:': {
      types: ['void', ['id']],
      implementation: function() {
        menuIsOpen = false;
        vpnSwitchPreviewValue = null;
        if (typeof stopVPNSwitchAnimation === 'function') stopVPNSwitchAnimation();
        if(typeof clearMenuRowHover==='function')clearMenuRowHover();
        setStatusDisplayOptionsExpanded(false, false);
        if (typeof setLanguageOptionsExpanded === 'function') setLanguageOptionsExpanded(false,false);
        if (typeof setPreferencesExpanded === 'function') setPreferencesExpanded(false, false);
        if (typeof setTokenMeterExpanded === 'function') setTokenMeterExpanded(false, false);
        if(typeof stopMenuTracking==='function')stopMenuTracking();
        if(typeof flushMenuViewCallbacks==='function')flushMenuViewCallbacks();
      }
    },
    'menu:willHighlightItem:': {
      types:['void',['id','id']],
      implementation:function(activeMenu,item){
        if(typeof setMenuRowHoverControl!=='function')return;
        var owner=menuRowHover;
        try {
          if(!item||ObjC.unwrap(item)==null){clearMenuRowHover(owner);return;}
          var keyboard=menuRowKeyboardEvent();
          if(menuRowHover!==owner)return;
          // Native selection belongs to the containing metrics item, while a
          // toolbar link owns the pointer highlight inside that item.
          if(!keyboard&&owner.view&&owner.item&&owner.item.isEqual(item)&&!owner.view.isEqual(item.view)){
            if(menuRowHover===owner)reconcileMenuRowHover();
            return;
          }
          // Mirror native keyboard highlights across all shared command and
          // setting rows. Non-interactive cards never acquire a highlight.
          setMenuRowHoverControl(item.view,keyboard);
          reconcileMenuRowHover();
        } catch(error){noteMenuViewFailure('native-highlight',error);clearMenuRowHover(owner);}
      }
    },
    'preferencesButton:': {
      types: ['void', ['id']],
      implementation: function() { preferencesButtonPressed(); }
    },
    'tokenMeterTaskTimer:':{types:['void',['id']],implementation:function(){pollTokenMeterRead();}},
    'tokenMeterButton:':{types:['void',['id']],implementation:function(sender){tokenMeterButtonPressed(sender);}},
    'tokenMeterAnimationTimer:':{types:['void',['id']],implementation:function(){stepTokenMeterAnimation();}},
    'menuActionButton:': {
      types:['void',['id']],
      implementation:function(sender){menuActionButtonPressed(sender);}
    },
    'preferencesAnimationTimer:': {
      types: ['void', ['id']],
      implementation: function() { stepPreferencesAnimation(); }
    },
    'menuTrackingTimer:': {
      types: ['void', ['id']],
      implementation: function() {
        if(!menuIsOpen||isExiting){stopMenuTracking();return;}
        reconcileMenuRowHover();flushMenuViewCallbacks();
        if(typeof refreshTokenActivityHover==='function')refreshTokenActivityHover();
      }
    },
    'languageButton:': {
      types: ['void', ['id']],
      implementation: function(sender) { languageButtonPressed(sender); }
    },
    'languageAnimationTimer:': {
      types: ['void', ['id']],
      implementation: function() { stepLanguageAnimation(); }
    },
    'statusDisplayButton:': {
      types: ['void', ['id']],
      implementation: function(sender) {
        statusDisplayButtonPressed(sender);
      }
    },
    'statusDisplayAnimationTimer:': {
      types: ['void', ['id']],
      implementation: function() { stepStatusDisplayAnimation(); }
    },
    'workspaceDidWake:': {
      types: ['void', ['id']],
      implementation: function() {
        forecastLastSuccessAt = 0;
        forecastBreakSegment = true;
        reconnectMaoMaoYunAfterWake();
        refreshAllSources();
      }
    },
    'openChatGPTWeb:': {
      types: ['void', ['id']],
      implementation: function() { openChatGPTWeb(); }
    },
    'openMaoMaoYunApp:': {
      types: ['void', ['id']],
      implementation: function() { if(isExiting)return;sendVoid(menu,'cancelTracking');openMaoMaoYunApp(); }
    },
    'newTask:': {
      types: ['void', ['id']],
      implementation: function() { newTask(); }
    },
    'toggleMaoMaoYun:': {
      types: ['void', ['id']],
      implementation: function() { toggleMaoMaoYun(); }
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
        requestRunningTasksRead();
        // Local time/forecast freshness changes require no additional reads.
        redrawUsageCardIfNeeded(false);
        updateMaoMaoYunTrafficMenuItem();
        if(typeof requestTokenMeterRead==='function')requestTokenMeterRead(false);
        if(typeof refreshTokenMeterMenu==='function')refreshTokenMeterMenu(false);
      }
    },
    'usageTaskTimer:': {
      types: ['void', ['id']],
      implementation: function() { pollUsageRefresh(); }
    },
    'tokenHistoryTaskTimer:': {
      types:['void',['id']],
      implementation:function(){pollTokenHistoryRead();}
    },
    'vpnSwitchAnimationTimer:': {
      types: ['void', ['id']],
      implementation: function() { stepVPNSwitchAnimation(); }
    },
    'maomaoyunTaskTimer:': {
      types: ['void', ['id']],
      implementation: function() { pollMaoMaoYunTasks(); }
    },
    'maomaoyunStatusTimer:': {
      types: ['void', ['id']],
      implementation: function() { requestMaoMaoYunStatus(false); }
    },
    'maomaoyunTrafficTimer:': {
      types: ['void', ['id']],
      implementation: function() { requestMaoMaoYunTraffic(false); }
    },
    'maomaoyunTrafficWakeTimer:': {
      types: ['void', ['id']],
      implementation: function() { pollMaoMaoYunTrafficWakeRecovery(); }
    },
    'maomaoyunTrafficTaskTimer:': {
      types: ['void', ['id']],
      implementation: function() { pollMaoMaoYunTraffic(); }
    },
    'maomaoyunTrafficLoginTimer:': {
      types: ['void', ['id']],
      implementation: function() { pollMaoMaoYunAccountLogin(); }
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
restoreUILanguage();
restoreStatusDisplayMode();
// Restore only a validated snapshot of this account, before the first icon
// and card are drawn. It is explicitly stale until the live endpoint replies.
syncUsageAccount();
statusItem = $.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);
statusButton = statusItem.button;
configureMenuBarIcon();
setMenuBarText(usageText);

buildMenu();
// buildMenu attaches the real NSMenu. AppKit owns status-item opening and
// dismissal; menuIsOpen only controls our rendering/maintenance lifecycle.
// Detaching it and calling popUpStatusItemMenu inside a mouse-down action can
// leave the remote status item pressed without an active tracking session.
// A missed/aborted close must never turn every later click into cancelTracking.
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
// Stable VPN state is inexpensive to sample every five seconds. Its 0.1s
// completion/animation timer exists only while a query or transition is live.
scheduleCommonModeTimer(MAOMAOYUN_STABLE_REFRESH_MS / 1000, 'maomaoyunStatusTimer:', true);
// Check the 5-minute query deadline locally; opening the menu can refresh at
// most once per minute. No window opens unless the user presses Sign in.
scheduleCommonModeTimer(60, 'maomaoyunTrafficTimer:', true);
// The helper is compiled as a stay-open applet. Return startup to its native
// NSApplication event loop instead of nesting NSRunLoop.run inside the script:
// a Foundation loop services timers but is not AppKit's input dispatcher.
// Menu opening/closing must not depend on incidental native calls in a timer.
void 0;
