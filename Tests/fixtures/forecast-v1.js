// Frozen pre-upgrade baseline; test fixture only.
// Local quota forecasting. Rates are percentage points per elapsed hour,
// including idle time; they are estimates, not a promise about future usage.
var FORECAST_RETENTION_SECONDS = 48 * 3600;
var FORECAST_BUCKET_SECONDS = 5 * 60;
var FORECAST_MAX_SAMPLES = 600;
var FORECAST_FRESHNESS_SECONDS = 180;

function forecastPolicy(durationMins) {
  // A one-hour burst is useful for Session but misleading for a whole week.
  return durationMins >= 1440 ?
    { horizon: 24 * 3600, minimum: 18 * 3600, cycleMinimum: 6 * 3600 } :
    { horizon: 3600, minimum: 15 * 60, cycleMinimum: 15 * 60 };
}

function forecastWindowKey(window) {
  return String(window.durationMins) + ':' + String(window.resetAt);
}

function validForecastWindow(window, now) {
  return window && typeof window.resetAt === 'number' && isFinite(window.resetAt) && window.resetAt > now &&
    (window.durationMins === null || (typeof window.durationMins === 'number' &&
      isFinite(window.durationMins) && window.durationMins > 0 && window.durationMins % 1 === 0));
}

function validForecastRemaining(remaining) {
  return typeof remaining === 'number' && isFinite(remaining) && remaining >= 0 && remaining <= 100;
}

function normalizeForecastSnapshot(snapshot, accountId, now) {
  if (!accountId || !snapshot || snapshot.version !== 1 || snapshot.accountId !== accountId ||
      typeof snapshot.savedAt !== 'number' || !isFinite(snapshot.savedAt) ||
      snapshot.savedAt <= 0 || snapshot.savedAt / 1000 > now + 60 ||
      !Array.isArray(snapshot.windows) || snapshot.windows.length > 2) return [];
  var records = [], keys = {};
  for (var i = 0; i < snapshot.windows.length; i++) {
    var record = snapshot.windows[i];
    if (!validForecastWindow(record, now) || !Array.isArray(record.samples) ||
        record.samples.length > FORECAST_MAX_SAMPLES) return [];
    var key = forecastWindowKey(record);
    if (keys[key]) return [];
    keys[key] = true;
    var adjustedAt = record.adjustedAt;
    var periodStart = record.durationMins === null ? 0 : record.resetAt - record.durationMins * 60;
    if (adjustedAt !== null && (typeof adjustedAt !== 'number' || !isFinite(adjustedAt) ||
        adjustedAt > now + 60 || adjustedAt < periodStart || adjustedAt <= 0)) return [];
    var samples = [], previousTime = -Infinity, previousRemaining = 100;
    for (var j = 0; j < record.samples.length; j++) {
      var point = record.samples[j];
      if (!Array.isArray(point) || point.length !== 2 || typeof point[0] !== 'number' ||
          !isFinite(point[0]) || point[0] <= previousTime || point[0] > Math.min(now, snapshot.savedAt / 1000) + 60 ||
          point[0] < periodStart || !validForecastRemaining(point[1]) || point[1] > previousRemaining + 0.05 ||
          (adjustedAt !== null && point[0] < adjustedAt)) return [];
      previousTime = point[0]; previousRemaining = point[1];
      if (point[0] >= now - FORECAST_RETENTION_SECONDS) samples.push([point[0], point[1]]);
    }
    // Expire observations after 48h, but retain a refill marker until this
    // actual cycle ends. Otherwise a long sleep would re-enable a false
    // "consumed since 100%" baseline after a mid-cycle refill.
    if (samples.length || adjustedAt !== null) records.push({ durationMins: record.durationMins, resetAt: record.resetAt,
      adjustedAt: adjustedAt, samples: samples });
  }
  return records;
}

function updateForecastHistory(records, windows, now) {
  return windows.filter(function(window) {
    return validForecastWindow(window, now) && validForecastRemaining(window.remaining);
  }).map(function(window) {
    var key = forecastWindowKey(window);
    var prior = records.filter(function(record) { return forecastWindowKey(record) === key; })[0];
    var samples = prior ? prior.samples.map(function(point) { return point.slice(); }) : [];
    var adjustedAt = prior ? prior.adjustedAt : null;
    var last = samples[samples.length - 1];
    // A refill/correction within the same cycle invalidates both old samples
    // and the assumption that 100 - remaining was consumed this cycle.
    if ((last && (window.remaining > last[1] + 0.05 || now < last[0])) ||
        (adjustedAt !== null && now < adjustedAt)) {
      samples = []; adjustedAt = now;
    }
    var point = [now, window.remaining];
    last = samples[samples.length - 1];
    if (last && (now === last[0] || (samples.length > 1 &&
        Math.floor(now / FORECAST_BUCKET_SECONDS) === Math.floor(last[0] / FORECAST_BUCKET_SECONDS)))) {
      samples[samples.length - 1] = point;
    } else {
      samples.push(point);
    }
    samples = samples.filter(function(sample) { return sample[0] >= now - FORECAST_RETENTION_SECONDS; })
      .slice(-FORECAST_MAX_SAMPLES);
    return { durationMins: window.durationMins, resetAt: window.resetAt,
      adjustedAt: adjustedAt, samples: samples };
  });
}

function observedForecastRate(record, now, policy) {
  if (!record || record.samples.length < 3) return null;
  var samples = record.samples, cutoff = now - policy.horizon;
  var end = samples[samples.length - 1];
  if (now < end[0] || now - end[0] > FORECAST_FRESHNESS_SECONDS) return null;
  var index = 0;
  while (index + 1 < samples.length && samples[index + 1][0] <= cutoff) index++;
  var start = samples[index];
  if (start[0] < cutoff && index + 1 < samples.length) {
    var next = samples[index + 1];
    // Interpolate only over normally sampled intervals, never over sleep or
    // a long disconnect. Otherwise use the first observation after the gap.
    if (next[0] - start[0] <= 15 * 60) {
      start = [cutoff, start[1] + (next[1] - start[1]) * (cutoff - start[0]) / (next[0] - start[0])];
    } else { start = next; index++; }
  }
  var span = end[0] - start[0];
  if (span < policy.minimum || samples.length - index < 3 || end[1] > start[1]) return null;
  return Math.max(0, (start[1] - end[1]) * 3600 / span);
}

function forecastDuration(seconds) {
  var minutes = Math.max(1, Math.round(seconds / 300) * 5);
  if (minutes < 60) return minutes + 'm';
  var hours = Math.floor(minutes / 60), remainder = minutes % 60;
  if (hours < 24) return hours + 'h' + (remainder ? ' ' + remainder + 'm' : '');
  return Math.floor(hours / 24) + 'd' + (hours % 24 ? ' ' + (hours % 24) + 'h' : '');
}

function forecastQuotaWindow(window, record, context) {
  function pending(reason) { return { status: 'unknown', text: 'Forecast: ' + reason }; }
  var now = context.now;
  if (context.sync !== 'ready' || !context.lastSuccessAt || now < context.lastSuccessAt ||
      now - context.lastSuccessAt > FORECAST_FRESHNESS_SECONDS) {
    return pending(context.sync === 'loading' ? 'Waiting for quota' : 'Paused · quota stale');
  }
  if (!validForecastRemaining(window.remaining)) return pending('Quota unavailable');
  if (typeof window.resetAt !== 'number' || !isFinite(window.resetAt)) return pending('Reset time unknown');
  if (window.resetAt <= now) return pending('Awaiting reset');
  if (window.remaining === 0) return { status: 'exhausted', text: 'Forecast: Exhausted · waiting for reset' };
  if (record && forecastWindowKey(record) !== forecastWindowKey(window)) record = null;
  var policy = forecastPolicy(window.durationMins);
  var rate = observedForecastRate(record, now, policy), basis = 'recent';
  if (rate === null) {
    if (record && record.adjustedAt !== null) return pending('Learning · quota changed');
    var elapsed = window.durationMins === null ? 0 : now - (window.resetAt - window.durationMins * 60);
    if (!validForecastWindow(window, now) || elapsed < policy.cycleMinimum || elapsed > window.durationMins * 60) {
      return pending('Learning usage pace');
    }
    rate = (100 - window.remaining) * 3600 / elapsed;
    basis = 'cycle';
  }
  // A flat, rounded percentage is not evidence of indefinitely free usage.
  // Avoid a reassuring projection when no consumption rate was observed.
  if (rate === 0) return pending(basis === 'recent' ? 'No recent use' : 'No use observed yet');
  var untilReset = window.resetAt - now;
  var projected = window.remaining - rate * untilReset / 3600;
  var status = projected < 0 ? 'risk' : projected <= 5 ? 'tight' : 'safe';
  var result = { status: status, basis: basis, rate: rate, projectedRemaining: projected,
    sustainableRate: window.remaining * 3600 / untilReset, exhaustionAt: rate > 0 ? now + window.remaining * 3600 / rate : null };
  var prefix = 'At ' + basis + ' pace: ';
  if (status === 'risk') result.text = prefix + 'At risk · ~' + forecastDuration(result.exhaustionAt - now) + ' left';
  else result.text = prefix + (status === 'safe' ? 'On track' : 'Tight') + ' · ' +
    (projected < 1 ? '<1' : '~' + Math.round(projected)) + '% at reset';
  return result;
}
