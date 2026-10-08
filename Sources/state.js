// Shared initial state and configuration; loaded after runtime.js imports AppKit.
// Feature modules own transitions. Keep the established defaults and timings here.
var statusItem;
var statusButton;
var menu;
var maomaoyunItem;
var maomaoyunView;
var usageCardView;
var pinnedAnchorDividerItem;
var pinnedMenuItems = [];
var pinnedTasksSnapshotKey = null;
var pinnedThreadsSnapshot = [];
var delegate;
// Until a valid quota value is available, use the same visible state as a
// failed read. A placeholder dash adds a third status without adding useful
// information; the menu still distinguishes loading from error internally.
var usageText = '!';
var usageSyncState = 'loading';
var maomaoyunServiceName = 'MaoMaoYun';
var maomaoyunBundleIdentifier = 'us.wbgroup.maoyunMac.MaoMaoYun-Mac';
var maomaoyunStatus = 'unknown';
var maomaoyunReadState = createBackgroundTaskState();
var maomaoyunActionState = createBackgroundTaskState({ action: null });
var maomaoyunLastStatusRequestAt = 0;
var MAOMAOYUN_ACTION_TIMEOUT_MS = 12000;
var MAOMAOYUN_STATUS_TIMEOUT_MS = 5000;
var MAOMAOYUN_STABLE_REFRESH_MS = 5000;
var MAOMAOYUN_TRANSITION_REFRESH_MS = 750;
var vpnOperation = null;
var vpnLastWakeAt = 0;
var vpnNextAttemptAt = 0;
var menuIsOpen = false;
var runningLastReadAt = 0;
var runningLastSuccessAt = 0;
var maomaoyunPollTimer = null;


// Keep rendering and background work in separate state containers. Running
// task state is read directly on its fixed cadence, while pinned threads use
// file revisions because they change much less often.
var codexDirectory = ObjC.unwrap($.NSHomeDirectory()) + '/.codex';
var runningTasksPath = codexDirectory + '/thread_history_1.sqlite';
var taskStateDatabasePath = codexDirectory + '/state_5.sqlite';
var renderState = {
  usageCardSnapshotKey: null,
  cardColors: null,
  fonts: {}
};
var refreshState = createBackgroundTaskState({ timedOut: false, queued: false });
var usagePollTimer = null;
var USAGE_READ_TIMEOUT_MS = 50000;
var usageAccountId = null;
var usageCachePath = ObjC.unwrap($.NSHomeDirectory()) + '/Library/Application Support/CodexUsageMeter/Cache/quota.json';
var runningReadState = createBackgroundTaskState({ timedOut: false, queued: false });
var pinnedReadState = createBackgroundTaskState({ revision: null, queued: false });
var hasRunningTasks = false;
var isExiting = false;
var statusIconSource;
var statusIconCurrentColor = { red: 0.91, green: 0.91, blue: 0.93, alpha: 1.0 };
// The menu-bar item uses a single circular gauge instead of a separate
// percentage label. Keep the fraction separate from the activity color so
// quota refreshes can redraw the ring without restarting the active-state
// transition.
var statusIconQuotaFraction = 0.02;
var statusIconQuotaTargetFraction = 0.02;
var quotaRingAnimationTimer = null;
var quotaRingAnimationFromFraction = 0.02;
var quotaRingAnimationStartedAt = 0;
var QUOTA_RING_ANIMATION_DURATION_MS = 520;
var statusTransitionFromColor = null;
var statusTransitionStartedAt = 0;
var statusTransitionToMode = 'idle';

var QUOTA_WARNING_THRESHOLD = 20;
var QUOTA_CRITICAL_THRESHOLD = 5;
// A 2pt base grid keeps the quota card compact while preserving hierarchy:
// one unit inside each quota group, four units between groups and at edges.
var QUOTA_SPACING_UNIT = 2;
var MENU_WIDTH = 330;
var TASK_ACTIVITY_FRESHNESS_SECONDS = 15 * 60;
var RUNNING_TASK_READ_TIMEOUT_MS = 5000;
// This is the shared healthy/connected accent across the whole component.
var ACTIVE_ACCENT = { red: 0.39, green: 0.85, blue: 0.60, alpha: 1.0 };
var statusIconPalette = {
  idle: { red: 0.91, green: 0.91, blue: 0.93, alpha: 1.0 },
  active: ACTIVE_ACCENT
};
// ===== Quota and presentation state =========================================
// The menu uses one compact quota block for the returned rate-limit windows.
// Keeping the values here lets it redraw immediately after a refresh without
// replacing the menu item (which would cause a visible flicker).
var quotaWindows = [{ label: 'Quota', durationMins: null, remaining: null, resetAt: null }];
var availableCredits = null;
var resetCreditExpirations = [];
