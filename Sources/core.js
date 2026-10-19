// Pure validation shared by the widget and regression tests.
function validPercent(value) {
  if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 100)
    throw new Error('Invalid quota percentage');
  return Math.round((100 - value) * 10) / 10;
}
function normalizeWindow(window) {
  if (!window || typeof window !== 'object') throw new Error('Invalid quota window');
  var duration = window.windowDurationMins;
  if (duration !== null && duration !== undefined &&
      (typeof duration !== 'number' || !isFinite(duration) || duration <= 0 || Math.floor(duration) !== duration))
    throw new Error('Invalid quota window duration');
  duration = duration === undefined ? null : duration;
  // Positions vary with the account's limits. Never label a primary window
  // "Session" unless its actual duration is five hours.
  var label = duration === 300 ? 'Session' : duration === 10080 ? 'Weekly' :
    duration === null ? 'Quota' : duration % 60 === 0 ? duration / 60 + 'h quota' : duration + 'm quota';
  return { label: label, durationMins: duration, remaining: validPercent(window.usedPercent),
    resetAt: typeof window.resetsAt === 'number' && isFinite(window.resetsAt) && window.resetsAt > 0 ? window.resetsAt : null };
}
function normalizeUsage(response) {
  var payload = response && response.result;
  if (!payload) throw new Error('Missing quota payload');
  var limit = payload.rateLimitsByLimitId && payload.rateLimitsByLimitId.codex || payload.rateLimits;
  if (!limit) throw new Error('Missing Codex quota');
  var windows = [limit.primary, limit.secondary].filter(function(window) {
    return window !== null && window !== undefined;
  }).map(normalizeWindow);
  if (!windows.length) throw new Error('Missing quota windows');
  windows.sort(function(a, b) {
    return (a.durationMins === null ? Infinity : a.durationMins) -
      (b.durationMins === null ? Infinity : b.durationMins);
  });
  var credits = payload.rateLimitResetCredits || {};
  return { windows: windows,
    credits: typeof credits.availableCount === 'number' && isFinite(credits.availableCount)&&credits.availableCount>=0&&Math.floor(credits.availableCount)===credits.availableCount ? credits.availableCount : null,
    expirations: (Array.isArray(credits.credits) ? credits.credits : []).filter(function(c) {
      return c && c.status === 'available' && typeof c.expiresAt === 'number' && isFinite(c.expiresAt) && c.expiresAt > 0;
    }).map(function(c) { return c.expiresAt; }),
    resetCards:resetCardMetadata((Array.isArray(credits.credits)?credits.credits:[]).filter(function(c){return c&&c.status==='available';})) };
}
function resetCardMetadata(cards) {
  function valid(value){return typeof value==='number'&&isFinite(value)&&value>0&&value<=8.64e12;}
  return (Array.isArray(cards)?cards:[]).slice(0,100).map(function(card){
    var expiry=card&&valid(card.expiresAt)?card.expiresAt:null;
    return {expiresAt:expiry,grantedAt:card&&valid(card.grantedAt)&&expiry&&card.grantedAt<expiry?card.grantedAt:null,
      observedAt:card&&valid(card.observedAt)?card.observedAt:null};
  });
}
function gaugeQuotaWindow(windows) {
  // Preserve the familiar Session gauge when available; weekly-only plans
  // use Weekly instead. Unknown durations remain neutrally labelled.
  for (var i = 0; i < windows.length; i++) {
    if (windows[i].durationMins === 300) return windows[i];
  }
  for (var j = 0; j < windows.length; j++) {
    if (windows[j].durationMins === 10080) return windows[j];
  }
  return windows[0];
}
function normalizeStatusDisplayMode(value) {
  return value === 'icon' ? 'icon' : 'quota';
}
function remainingQuotaText(windows) {
  if (!Array.isArray(windows) || !windows.length) return '—';
  var gauge = gaugeQuotaWindow(windows);
  var value = gauge && gauge.remaining;
  if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 100) return '—';
  // Keep the tiny center readable; precise values remain in the menu/help.
  return String(Math.round(value));
}
function quotaValueLabel(state, sync) {
  if (state.remaining !== null && state.remaining !== undefined) return state.remaining + '% remaining' + (sync === 'error' || sync === 'cached' ? ' · stale' : '');
  return sync === 'loading' ? 'Syncing' : sync === 'error' ? 'Sync failed' : 'Unavailable';
}
function usageAccountIdFromAuth(auth) {
  // Only the opaque account ID is used. Never copy tokens, API keys or email
  // into the quota cache. Keyring-only/unknown identities disable disk reuse.
  var id = auth && auth.auth_mode === 'chatgpt' && auth.tokens && auth.tokens.account_id;
  return typeof id === 'string' && id.length > 0 && id.length <= 256 && !/[\x00-\x1f]/.test(id) ? id : null;
}
function normalizeUsageCache(cache, accountId, now) {
  if (!accountId || !cache || cache.version !== 1 || cache.accountId !== accountId ||
      typeof cache.savedAt !== 'number' || !isFinite(cache.savedAt) || cache.savedAt <= 0 ||
      cache.savedAt > now + 60000 || now - cache.savedAt > 24 * 60 * 60 * 1000)
    throw new Error('Invalid or expired quota cache');
  var usage = cache.usage;
  if (!usage || !Array.isArray(usage.windows) || usage.windows.length < 1 || usage.windows.length > 2 ||
      (usage.credits!==null&&(typeof usage.credits !== 'number' || !isFinite(usage.credits) || usage.credits < 0 || Math.floor(usage.credits) !== usage.credits)) ||
      !Array.isArray(usage.expirations) || usage.expirations.length > 100 ||
      usage.expirations.some(function(value) { return typeof value !== 'number' || !isFinite(value) || value <= 0; }))
    throw new Error('Invalid cached quota data');
  // Recompute labels using the same duration-based validation as live data.
  var windows = usage.windows.map(function(window) {
    if (!window || typeof window.remaining !== 'number' || !isFinite(window.remaining)) throw new Error('Invalid cached quota window');
    return normalizeWindow({ usedPercent: 100 - window.remaining,
      windowDurationMins: window.durationMins, resetsAt: window.resetAt });
  });
  windows.sort(function(a, b) { return (a.durationMins === null ? Infinity : a.durationMins) - (b.durationMins === null ? Infinity : b.durationMins); });
  return { windows: windows, credits: usage.credits, expirations: usage.expirations.slice(),
    resetCards:resetCardMetadata(usage.resetCards),savedAt:cache.savedAt,
    planType:typeof cache.planType==='string'&&/^[a-zA-Z0-9_-]{1,32}$/.test(cache.planType)?cache.planType:null };
}
function isExecutionFresh(timestamp, now, freshness) {
  return isFinite(timestamp) && timestamp > 0 && timestamp <= now + 60 && now - timestamp <= freshness;
}
