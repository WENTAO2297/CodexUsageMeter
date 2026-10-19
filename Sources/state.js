// Shared initial state and configuration; loaded after runtime.js imports AppKit.
// Feature modules own transitions. Keep the established defaults and timings here.
var statusItem;
var statusButton;
var statusDisplayMode = 'quota';
var STATUS_DISPLAY_PREFERENCE_KEY = 'menuBarDisplayMode';
var STATUS_DISPLAY_OPTIONS = [
  { mode: 'quota', title: 'Remaining Quota' },
  { mode: 'icon', title: 'Codex Icon' }
];
var statusDisplayExpanded = false;
var statusDisplayReveal = 0;
var statusDisplayAnimation = { timer: null, from: 0, to: 0, startedAt: 0, duration: 0 };
var STATUS_DISPLAY_ANIMATION_MS = 180;
var statusDisplayDisclosureItem;
var statusDisplayMenuItems = {};
var preferencesExpanded = false;
var preferencesReveal = 0;
var preferencesAnimation = { timer: null, from: 0, to: 0, startedAt: 0 };
var preferencesDisclosureItem;
var menu;
var resetCreditCards=[];
var resetCardsHeaderItem=null;
var resetCardsMenuItems=[];
var resetCardDateCapsuleWidth=36;
var tokenMeterView=null;
var tokenMeterItem=null;
var tokenMeterDisclosureItem=null;
var tokenMeterExpanded=false;
var tokenMeterReveal=0;
var TOKEN_ACTIVITY_ANIMATION_MS=500;
var tokenMeterAnimation={timer:null,from:0,to:0,arrowFrom:0,arrowReveal:0,startedAt:0};
var tokenActivityHover=null;
var usageActivityDays=7;
var tokenActivityRangeButtons=[];
var TOKEN_ACTIVITY_RANGE_ANIMATION_MS=220;
var tokenActivityRangeAnimation={value:0,from:0,to:0,startedAt:0};
var tokenMeterSnapshot=null;
var tokenMeterSync='loading';
var tokenMeterReadState=createBackgroundTaskState({timedOut:false,accountId:null});
var tokenMeterPollTimer=null;
var tokenMeterPolling=false;
var tokenMeterNextReadAt=0;
var tokenMeterLastReadAt=0;
var tokenMeterPath=ObjC.unwrap($.NSHomeDirectory())+'/Library/Application Support/CodexUsageMeter/Cache/token-profile.json';
var vpnAppButton = null; // MaoMaoYun name button opens the client.
var metricsPairView = null;
var maomaoyunItem;
var maomaoyunView;
var maomaoyunTrafficItem;
var maomaoyunTrafficView;
var maomaoyunTrafficSnapshot = null;
var maomaoyunTrafficSourceState = 'loading';
var maomaoyunTrafficRenderKey = null;
var maomaoyunTrafficReadState = createBackgroundTaskState();
var maomaoyunTrafficLoginState = createBackgroundTaskState();
var maomaoyunHistoryReadState = createBackgroundTaskState();
var maomaoyunHistorySnapshot = null;
var maomaoyunHistoryLastReadAt = 0;
var maomaoyunHistoryNextReadAt = 0;
var maomaoyunHistoryPath = ObjC.unwrap($.NSHomeDirectory()) + '/Library/Application Support/CodexUsageMeter/Cache/vpn-history.json';
var MAOMAOYUN_HISTORY_REFRESH_MS = 6 * 60 * 60 * 1000;
var maomaoyunTrafficPollTimer = null;
var maomaoyunTrafficLoginPollTimer = null;
var maomaoyunTrafficLastReadAt = 0;
var maomaoyunTrafficNextReadAt = 0;
var maomaoyunTrafficWakeRecovery = null;
var maomaoyunTrafficWakeTimer = null;
var MAOMAOYUN_TRAFFIC_WAKE_SETTLE_MS = 1500;
var MAOMAOYUN_TRAFFIC_WAKE_DEADLINE_MS = 3 * 60 * 1000;
var MAOMAOYUN_TRAFFIC_REFRESH_MS = 5 * 60 * 1000;
var MAOMAOYUN_TRAFFIC_MIN_REFRESH_MS = 60 * 1000;
var MAOMAOYUN_TRAFFIC_BACKOFF_MS = 15 * 60 * 1000;
var MAOMAOYUN_TRAFFIC_READ_TIMEOUT_MS = 35000;
var MAOMAOYUN_TRAFFIC_LOGIN_TIMEOUT_MS = 20 * 60 * 1000;
var usageCardView;
var delegate;
// Until a valid quota value is available, use the same visible state as a
// failed read. A placeholder dash adds a third status without adding useful
// information; the menu still distinguishes loading from error internally.
var usageText = '!';
var usageSyncState = 'loading';
var maomaoyunServiceName = 'MaoMaoYun';
var maomaoyunBundleIdentifier = 'us.wbgroup.maoyunMac.MaoMaoYun-Mac';
var maomaoyunStatus = 'unknown';
var vpnSwitchAnimation = { value: 0, from: 0, target: 0, startedAt: 0, timer: null };
// Temporary animation preview: clicks never issue a VPN command.
var vpnSwitchPreviewValue = null;
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
// task state is read directly on its fixed cadence.
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
var forecastHistoryPath = ObjC.unwrap($.NSHomeDirectory()) + '/Library/Application Support/CodexUsageMeter/Cache/forecast-v2.json';
var forecastLegacyHistoryPath = ObjC.unwrap($.NSHomeDirectory()) + '/Library/Application Support/CodexUsageMeter/Cache/forecast.json';
var forecastHistoryRecords = [];
var forecastLastSuccessAt = 0;
var forecastBreakSegment = true;
var usagePlanType = null;
var usageLastGoodAt = 0;
var tokenHistoryPath = ObjC.unwrap($.NSHomeDirectory()) + '/Library/Application Support/CodexUsageMeter/Cache/token-history.json';
var tokenHistorySnapshot = null;
var tokenHistoryReadState = createBackgroundTaskState({timedOut:false,accountId:null});
var tokenHistoryPollTimer = null;
var tokenHistoryNextReadAt = 0;
var tokenHistoryLastReadAt = 0;
var runningReadState = createBackgroundTaskState({ timedOut: false, queued: false });
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
var MENU_WIDTH = 288;
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
