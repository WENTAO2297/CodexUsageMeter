// Presentation-only localization. Stored data and pure calculations remain
// language-neutral. Never apply this to user-authored chat titles or secrets.
var uiLanguage = 'en'; // Library fixtures; production restores Chinese by default.
var UI_LANGUAGE_KEY = 'CodexUsageMeterUILanguage';
var localizedMenuItems = [];
var languageMenuItem = null;
var languageMenuItems = {};
var languageExpanded = false;
var languageReveal = 0;
var languageAnimation = {timer:null,from:0,to:0,startedAt:0};
var UI_ZH = {
  'Above pace':'消耗偏快', 'On pace':'进度正常',
  'Quota low':'余量偏低', 'Resetting':'正在重置', 'Reset unknown':'重置未知',
  'Reset cards':'重置卡', 'No reset cards':'暂无重置卡', 'Awaiting quota':'等待额度更新',
  'Expired · refreshing':'已到期，待更新', 'Expiry':'到期时间', 'Official grant':'官网发放',
  'Bar measured from first observation':'进度条从首次记录时开始计时', 'available':'可用', 'cards':'张',
  'Usage activity':'用量活动', 'Past 7 days':'过去7天', 'Today so far':'截至当前', 'Reported daily usage':'官网每日用量', 'VPN usage':'VPN 用量', 'Independent scales':'独立刻度',
  'Token activity':'Token 活动', 'Expanded':'已展开', 'Collapsed':'已折叠', 'Past 30 days':'过去30天', 'Profile data':'官方统计', 'Account unavailable':'账号不可用',
  'Updating':'更新中', 'Last count':'上次统计', 'Sign in to Codex':'请登录 Codex',
  'Codex Weekly':'Codex 周额度',
  'Codex Session':'Codex 5 小时', 'Codex Quota':'Codex 额度',
  'VPN Traffic':'VPN 流量', 'Used today':'今日已使用',
  'Daily average':'日均消耗', 'Hourly use':'小时实耗', 'Observing':'记录中',
  'Expected to run out early':'预计在重置前用尽', 'Expected to run out soon':'预计近期用尽',
  'Expected empty at reset':'预计重置时用尽',
  'Session':'5 小时额度', 'Weekly':'周额度', 'Quota':'额度',
  'Traffic':'流量', 'Preferences':'偏好设置', 'Language':'语言', 'New Task':'新建任务', 'Ask ChatGPT':'询问 ChatGPT',
  'Open MaoMaoYun':'打开猫猫云',
  'Pending':'待官网更新',
  'Current remaining':'当前剩余', 'Last known remaining':'上次剩余',
  'Last known':'上次读数', 'No data':'暂无数据',
  'Read failed':'读取失败', 'Rate limited':'查询受限',
  'Last update':'上次更新', 'Updated':'更新于',
  'Keychain unavailable':'钥匙串不可用', 'Website unavailable':'官网暂不可用',
  'Estimated remaining':'预计剩余', 'Estimated at reset':'重置时预计', 'May run out within':'可能耗尽于',
  'Est. remaining':'预计剩余', 'Est. at reset':'重置时预计',
  'At reset':'重置时剩余',
  'Before reset':'重置前用尽', 'Soon':'近期用尽',
  'At reset depletion':'重置时用尽', 'Reserve at reset':'有余量',
  'Low reserve':'余量偏低', 'History gaps':'记录有缺口',
  'Est. reserve':'预计剩余', 'Daily avg.':'日均消耗', 'Today':'今日消耗', 'Near term':'短期预测',
  'Historical scenario':'历史用量情景', 'Website estimate':'按官网记录估算', 'Recent pace estimate':'按近期速度估算',
  'At reset · historical rough estimate':'重置时余量 · 历史粗估', 'Historical rough estimate':'历史粗估',
  'More history needed':'需要更多历史记录', 'Observation gaps':'观察记录有缺口',
  'Need sustained usage':'等待持续消耗记录', 'Usage trend changed':'用量趋势发生变化',
  'Awaiting fresh data':'等待最新数据', 'Reset date unavailable':'重置日期不可用',
  'Forecast':'预测', 'Projected surplus':'预计有余量', 'May be tight':'可能吃紧', 'May run out':'可能耗尽',
  'Projected early depletion':'预计提前耗尽', 'Low reserve at reset':'重置时余量偏低',
  'Projected depletion at reset':'预计重置时耗尽', 'Awaiting report':'待官网更新',
  'Expected remaining at reset':'预计重置时有剩余',
  'Actual daily use: observing':'日均消耗：记录中', 'Actual hourly use: observing':'小时实耗：记录中',
  'May use it all':'可能用尽', 'Short-term estimate':'短期估计', 'Not enough data':'数据不足',
  'Reset unknown':'重置未知', 'History has gaps':'记录有缺口', 'Not enough usage':'消耗不足',
  'Observing again':'重新观察中', 'Paused':'已暂停', 'Exhausted':'已耗尽',
  'At reset · historical scenario':'重置时余量 · 历史情景',
  'At reset · reported estimate':'重置时余量 · 按官网记录估算',
  'Before reset · reported estimate':'重置前可能耗尽 · 按官网记录估算',
  'If recent pace holds':'假设保持近期消耗速度', 'At reset · recent pace':'重置时余量 · 按近期速度估算',
  'May run out within ':'可能在以下时段内耗尽：',
  'Expected to last until reset':'预计重置时仍有剩余',
  'May be tight before reset':'重置前可能吃紧', 'May run out before reset':'可能在重置前耗尽',
  'Only a short-term estimate':'仅能预测近期用量', 'Estimate to reset only':'按近期速度估算至重置',
  'Not enough data to predict':'数据不足，暂无法预测', 'Prediction paused':'预测已暂停',
  'History has gaps; no prediction':'记录有缺口，暂无法预测',
  'Recent use too low to predict':'近期消耗不足以预测', 'Usage changed; observing again':'消耗突变，重新观察中',
  'Quota exhausted':'额度已耗尽', 'Traffic exhausted':'流量已耗尽', 'Waiting for reset':'等待重置',
  'At reported pace: lasts to reset':'按官网记录：预计有余量',
  'At reported pace: may run out':'按官网记录：可能提前耗尽',
  'At reported pace: used up by reset':'按官网记录：重置时可能用尽',
  'Before reset · estimate only':'可能在重置前耗尽 · 仅供估计',
  'Next reset date unknown':'下次重置日期未知', 'estimate only':'仅供估计',
  'Restart Widget':'重启小组件',
  'Menu Bar Display':'菜单栏显示', 'Remaining Quota':'剩余额度', 'Codex Icon':'Codex 图标',
  'Connected':'已连接', 'Disconnected':'未连接', 'Connecting':'连接中',
  'Disconnecting':'断开中', 'Checking':'检查中', 'Unavailable':'不可用',
  'Syncing':'同步中', 'Sync failed':'同步失败', 'Sign in':'登录', 'Signing in':'登录中',
  'No resets available':'无可用重置券', 'Expiry unknown':'到期时间未知',
  'Update failed · last known value':'更新失败 · 上次有效值',
  'Update failed · retrying':'更新失败 · 重试中', 'Cached value · updating':'缓存数据 · 更新中',
  'Fetching quota…':'正在获取额度…', 'Window unavailable':'额度窗口不可用',
  'Reset time unavailable':'重置时间未知', 'Reset schedule unavailable':'重置日期未知',
  'Reset reported today':'官网报告今日已重置', 'Budget unavailable':'预算暂不可用',
  'Budget paused · traffic stale':'预算已暂停 · 流量数据已过期',
  'Website unavailable · retrying':'官网暂不可用 · 重试中',
  'Querying MaoMaoYun website':'正在查询 MaoMaoYun 官网',
  'Complete login in the official website window':'请在官网窗口完成登录',
  'Click Traffic to connect':'点击流量栏登录',
  'Keychain unavailable · click to reconnect':'钥匙串不可用 · 点击重新登录',
  'Rate limited · retrying later':'查询受限 · 稍后重试', 'Unsupported website response':'暂不支持官网返回的数据',
  'Waiting for quota':'等待额度数据', 'Paused · quota stale':'已暂停 · 额度数据已过期',
  'Quota unavailable':'额度不可用', 'Reset time unknown':'重置时间未知', 'Awaiting reset':'等待重置',
  'Exhausted · waiting for reset':'已耗尽 · 等待重置',
  'Need observation history':'需要积累用量记录', 'Need recent observations':'需要近期用量记录',
  'Need 30 minutes of recent history':'需要至少 30 分钟近期记录',
  'Recent history incomplete':'近期记录不完整', 'History incomplete':'历史记录不完整',
  'Need 3 days of history':'需要至少 3 天历史记录', 'Need more history':'需要更多历史记录',
  'No recent use':'近期未见消耗', 'No use in observed history':'已观察记录中未见消耗',
  'Recent usage jump · waiting for sustained observations':'近期消耗突增 · 等待持续观察',
  'Traffic unavailable':'流量不可用', 'Need fresh reported history':'需要最新官网历史',
  'Need 3 reported days':'需要至少 3 天官网记录', 'Need 7 consecutive reported days':'需要连续 7 天官网记录',
  'Reported days are out of date':'官网历史已过期', 'Reported history has missing days':'官网历史存在缺失日期',
  'Reported totals unavailable':'官网累计用量不可用', 'No use in reported history':'官网历史中未见消耗',
  'Need more consecutive reported history':'需要更多连续官网记录', 'History unavailable.':'历史暂不可用。',
  'Account traffic from app.maomao234.com, independent of the VPN client.':'账号流量来自 app.maomao234.com，与 VPN 客户端独立。',
  'Queries every 5 minutes; menu refreshes are at least 1 minute apart.':'每 5 分钟查询；打开菜单时刷新至少间隔 1 分钟。',
  'Website accounting may lag. Data older than 10 minutes is marked stale.':'官网计费统计可能延迟；超过 10 分钟的数据会标记为过期。',
  'Reset days come directly from the website; today does not identify the next reset.':'重置天数直接来自官网；今日已重置不代表已知下次重置时间。',
  'Budget is remaining traffic divided by website reset days. Historical completeness is unverified, so no traffic risk is inferred.':'预算为剩余流量除以官网重置天数。历史完整性未确认，不据此判断流量风险。',
  "This website login is separate from the MaoMaoYun client account. Credentials are stored only in this app's Keychain item.":'此官网登录与 MaoMaoYun 客户端账号独立。凭据仅保存在本应用自己的钥匙串条目。',
  'Budget spreads the remaining quota until the actual reset; it does not predict future use.':'预算将剩余额度分配到实际重置时间，不是未来用量预测。',
  'Scenarios, not confidence bounds. Incomplete blocks are excluded.':'这是历史情景，不是置信区间；不完整记录块已排除。',
  'Conditional duration at the higher of recent 3-day, preceding 4-day and 7-day reported daily averages.':'条件时长按最近 3 天、此前 4 天及 7 天官网日均用量中的较高值估算。',
  'No next reset date is assumed. Recent 48h are excluded for revisions; u+d are billed bytes and reports may be incomplete or delayed. No safety or risk judgment.':'不假设下次重置日期。最近 48 小时不参与计算，以容纳补报；上传和下载为计费字节，统计可能缺失或延迟。不作安全或风险判断。',
  'Reported u+d are billed bytes. Completeness is unverified and may undercount usage; this is not a safety or risk judgment.':'官网上传与下载合计为计费用量。完整性未确认，可能低估消耗；此处不作安全或风险判断。',
  'Conditional account-usage estimate. Historical variation and completed forecast errors; not a confidence guarantee.':'依据账号用量历史及已完成预测的误差作条件估计，不保证未来结果。',
  'Conditional estimate from reported account history; reporting may be delayed.':'依据官网账号历史作条件估计，统计可能延迟。'
};
var UI_ZH_KEYS = Object.keys(UI_ZH).sort(function(a,b){return b.length-a.length;});

function normalizeUILanguage(value) { return value === 'en' ? 'en' : 'zh-CN'; }
function uiText(value) {
  var text = String(value === null || value === undefined ? '' : value);
  if (uiLanguage !== 'zh-CN') return text;
  // Standalone units must not replace substrings of words or composed labels.
  if(text==='pp')return '个百分点';
  if(text==='Resets')return '手动重置';
  if(text==='7 days')return '7天';
  if(text==='30 days')return '30天';
  // Match composed headings before shorter dictionary phrases can replace
  // their prefix and prevent the numeric rule from matching.
  var resetHeading=/^(?:Estimated|Est\.) at reset in (\d+) days$/.exec(text);
  if(resetHeading)return resetHeading[1]+'天后重置时预计';
  var resetCountdown=/^Resets in (\d+[dhm](?: \d+[dhm])*)$/.exec(text);
  if(resetCountdown)return uiText(resetCountdown[1])+'后重置';
  var expiryCountdown=/^Expires in (\d+[dhm](?: \d+[dhm])*)$/.exec(text);
  if(expiryCountdown)return uiText(expiryCountdown[1])+'后到期';
  if (Object.prototype.hasOwnProperty.call(UI_ZH, text)) return UI_ZH[text];
  // Translate longest literal phrases first, including explanations composed
  // from numeric fragments. Numbers, dates, symbols and proper names stay intact.
  UI_ZH_KEYS.forEach(function(key) {
    text = text.split(key).join(UI_ZH[key]);
  });
  return text
    .replace(/Estimated empty (<1|\d+)d before reset/g, '预计重置前 $1 天用尽')
    .replace(/Est\. empty (<1|\d+)d early/g, '预计提前 $1 天用尽')
    .replace(/Empty (<1|\d+)d early/g, '重置前 $1 天用尽')
    .replace(/^In (\d+[hm](?: \d+[hm])?)$/, '$1 后预计')
    .replace(/^After (\d+)d$/, '$1天后剩余')
    .replace(/^Est\. at (\d+)d reset$/, '$1天重置预计')
    .replace(/In (.*?) · recent pace/g, '$1 后的余量 · 按近期速度估算')
    .replace(/At reset: (~?[<\d.]+[BKMGT]) left/g, '重置时预计剩余 $1')
    .replace(/May run out within /g, '可能在以下时段内耗尽：')
    .replace(/Typical \(P50\) and higher \(P90\) observed consumption from (\d+) historical blocks, rounded up to whole hours\./g, '取 $1 个历史记录块的典型（P50）及较高（P90）消耗情景，时长向上取整到小时。')
    .replace(/Conditional estimate from (.*?) of continuous recent observations, including idle time\. Projects only (.*?)\./g, '依据最近 $1 的连续观察（包含空闲）作条件估计，仅预测未来 $2。')
    .replace(/Conditional P90 scenario from (\d+) consecutive UTC 24h blocks as long as the website reset days\./g, '按 $1 个与官网剩余重置天数等长的连续 UTC 24 小时记录块，估算较高消耗情景（P90）。')
    .replace(/(\d+(?:\.\d+)?%) remaining/g, '剩余 $1')
    .replace(/([\d.]+[BKMGT]) remaining/g, '剩余 $1')
    .replace(/([\d.]+[BKMGT] \/ [\d.]+[BKMGT]) used/g, '已用 $1')
    .replace(/Resets in (\d+) days/g, '$1 天后重置')
    .replace(/Resets /g, '重置于 ').replace(/resetting soon/g, '即将重置')
    .replace(/↻ (\d+) uses?/g, '↻ $1 次').replace(/Expires /g, '到期 ')
    .replace(/Budget (~?[\d.<]+)%\/day/g, '每日预算 $1 个百分点')
    .replace(/Actual daily use: ([\d.—]+) pp/g, '日均消耗：$1 个百分点')
    .replace(/Actual hourly use: ([\d.—]+) pp/g, '小时实耗：$1 个百分点')
    .replace(/Measured over /g, '统计时段：')
    .replace(/Used today: Awaiting report/g, '今日已使用：待官网更新')
    .replace(/Used today: /g, '今日已使用：')
    .replace(/Budget (~?[\d.<]+)%\/h/g, '每小时预算 $1 个百分点')
    .replace(/Budget (~?[\d.<]+[BKMGT])\/day/g, '每日预算 $1')
    .replace(/If reported pace holds: /g, '按官网记录速度：')
    .replace(/If pace holds: /g, '若保持近期速度：')
    .replace(/Reported pace: learning/g, '官网用量：学习中')
    .replace(/On track/g, '预计够用').replace(/Tight/g, '可能吃紧').replace(/At risk/g, '可能不足')
    .replace(/(~?[\d.–]+%) at reset/g, '重置时剩余 $1')
    .replace(/~([\d.]+[BKMGT]) left/g, '预计剩余 $1')
    .replace(/([~<>]?\d+) days left/g, '约可用 $1 天')
    .replace(/empty within /g, '预计耗尽于 ').replace(/(~?\d+%) in /g, '$1（经过 ').replace(/(（经过 [^·]+)$/, '$1）')
    .replace(/\bForecast: /g, '预测：').replace(/\blearning\b/g, '学习中')
    .replace(/\bgaps\b/g, '记录有缺口').replace(/\brecent jump\b/g, '近期突增')
    .replace(/\bno recent use\b/g, '近期未见消耗')
    .replace(/Last update /g, '上次更新 ').replace(/Updated /g, '更新于 ')
    .replace(/Rate limited · /g, '查询受限 · ').replace(/Read failed · /g, '读取失败 · ')
    .replace(/\bstale\b/g, '数据过期').replace(/Codex Usage:? /g, 'Codex 额度 ')
    .replace(/History: (\d+) reported dates\./g, '历史：$1 个记录日期。')
    .replace(/(\d+)h quota/g, '$1 小时额度').replace(/(\d+)m quota/g, '$1 分钟额度')
    .replace(/(\d+)d\b/g, '$1天').replace(/(\d+)h\b/g, '$1小时').replace(/(\d+)m\b/g, '$1分钟');
}

function restoreUILanguage() {
  try { uiLanguage = normalizeUILanguage(ObjC.unwrap($.NSUserDefaults.standardUserDefaults.stringForKey(UI_LANGUAGE_KEY))); }
  catch (ignored) { uiLanguage = 'zh-CN'; }
}
function localizedMenuItem(item, source) {
  localizedMenuItems.push({item:item,source:source});
  item.title = uiText(source);
  if (item.view) item.view.title = uiText(source);
  return item;
}
function updateLanguageMenu() {
  Object.keys(languageMenuItems).forEach(function(code) {
    var view = languageMenuItems[code].view;
    view.state = code === uiLanguage ? $.NSControlStateValueOn : $.NSControlStateValueOff;
    view.needsDisplay = true;
  });
}
function redrawLanguageControls() {
  if (languageMenuItem) languageMenuItem.view.needsDisplay = true;
  updateLanguageMenu();
}
function stopLanguageAnimation() { languageAnimation.timer = stopTransientTimer(languageAnimation.timer); }
function finishLanguageAnimation(value) {
  stopLanguageAnimation(); languageReveal = value; redrawLanguageControls();
}
function stepLanguageAnimation() {
  if (!languageAnimation.timer) return;
  if (isExiting || !menuIsOpen) { finishLanguageAnimation(languageExpanded ? 1 : 0); return; }
  var elapsed = Date.now() - languageAnimation.startedAt;
  var t = Math.max(0, Math.min(1, elapsed / STATUS_DISPLAY_ANIMATION_MS));
  if (elapsed < 0 || t >= 1 || statusDisplayReducedMotion()) { finishLanguageAnimation(languageAnimation.to); return; }
  languageReveal = languageAnimation.from + (languageAnimation.to-languageAnimation.from)*(1-Math.pow(1-t,3));
  redrawLanguageControls();
}
function setLanguageOptionsExpanded(expanded, animate) {
  if (isExiting || !languageMenuItem) return;
  if (languageAnimation.timer) stepLanguageAnimation();
  stopLanguageAnimation(); languageExpanded = expanded;
  Object.keys(languageMenuItems).forEach(function(code){languageMenuItems[code].hidden=!expanded;});
  if(typeof pruneMenuRowHover==='function')pruneMenuRowHover();
  if (menu) sendVoid(menu,'update');
  var target = expanded ? 1 : 0;
  if (!animate || !menuIsOpen || statusDisplayReducedMotion() || Math.abs(target-languageReveal)<0.001) {
    finishLanguageAnimation(target); return;
  }
  languageAnimation.from=languageReveal;languageAnimation.to=target;languageAnimation.startedAt=Date.now();
  try {
    languageAnimation.timer=startTransientTimer(null,1/60,'languageAnimationTimer:');
    $.NSRunLoop.currentRunLoop.addTimerForMode(languageAnimation.timer,$.NSEventTrackingRunLoopMode);
  } catch (error) { logError('language-animation',error); finishLanguageAnimation(target); }
}
function languageButtonPressed(sender) {
  if (typeof preferencesControlsHidden === 'function' && preferencesControlsHidden()) return;
  var tag=Number(sender.tag);
  if (tag===100) { setLanguageOptionsExpanded(!languageExpanded,true); return; }
  if (tag===101 || tag===102) {
    setUILanguage(tag===101?'zh-CN':'en');updateLanguageMenu();
    if (typeof updateStatusDisplayMenu === 'function') updateStatusDisplayMenu();
  }
}
function setUILanguage(value) {
  if (isExiting || (value !== 'en' && value !== 'zh-CN') || value === uiLanguage) return;
  try { $.NSUserDefaults.standardUserDefaults.setObjectForKey($(value), $(UI_LANGUAGE_KEY)); }
  catch (error) { logError('language-save', error); return; }
  uiLanguage = value;
  localizedMenuItems.forEach(function(entry) {
    entry.item.title = uiText(entry.source);
    if (entry.control) { entry.control.title=uiText(entry.source);entry.control.needsDisplay=true; }
    if (entry.item.view) { entry.item.view.title = uiText(entry.source); entry.item.view.needsDisplay = true; }
  });
  updateLanguageMenu();
  if(typeof vpnAppButton!=='undefined'&&vpnAppButton){
    vpnAppButton.title='MaoMaoYun';
    vpnAppButton.accessibilityLabel=uiText('Open MaoMaoYun');
  }
  renderState.usageCardSnapshotKey = '';
  maomaoyunTrafficRenderKey = '';
  updateMaoMaoYunMenuItem();
  updateMaoMaoYunTrafficMenuItem();
  redrawUsageCardIfNeeded(true);
  if(typeof refreshTokenMeterMenu==='function')refreshTokenMeterMenu(true);
  updateStatusButtonTitle();
  if (menu) sendVoid(menu, 'update');
}
