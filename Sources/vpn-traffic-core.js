// Only the account helper's sanitized byte protocol crosses into JXA. The
// website response and credentials stay inside the native Keychain helper.
var MAOMAOYUN_TRAFFIC_FRESH_MS = 10 * 60 * 1000;

function maoMaoYunTrafficInteger(value) {
  return typeof value === 'number' && isFinite(value) && value >= 0 &&
    Math.floor(value) === value && value <= 9007199254740991;
}

function formatMaoMaoYunTrafficAmount(value, index) {
  return (value / Math.pow(1024, index)).toFixed(2).replace(/\.?0+$/, '') + ['B', 'K', 'M', 'G', 'T'][index];
}

function normalizeMaoMaoYunTraffic(traffic, now) {
  if (!traffic || typeof traffic !== 'object' || Array.isArray(traffic) ||
      !maoMaoYunTrafficInteger(traffic.usedBytes) || !maoMaoYunTrafficInteger(traffic.totalBytes) ||
      !maoMaoYunTrafficInteger(traffic.remainingBytes) || traffic.totalBytes <= 0 ||
      traffic.remainingBytes !== Math.max(0, traffic.totalBytes - traffic.usedBytes)) {
    throw new Error('Invalid account traffic');
  }
  if (typeof traffic.accountKey !== 'string' || !/^[0-9a-f]{64}$/.test(traffic.accountKey) ||
      typeof traffic.credentialRevision !== 'string' || !/^[0-9a-f]{64}$/.test(traffic.credentialRevision)) {
    throw new Error('Invalid account binding');
  }
  if (!maoMaoYunTrafficInteger(now) || now <= 0 ||
      !maoMaoYunTrafficInteger(traffic.reportedAt) || traffic.reportedAt <= 0 || traffic.reportedAt > now + 60000) {
    throw new Error('Invalid account query time');
  }
  var index = Math.min(4, Math.max(0, Math.floor(Math.log(traffic.totalBytes) / Math.log(1024))));
  var todayValid=traffic.todayState==='reported'&&maoMaoYunTrafficInteger(traffic.todayUsedBytes)&&
    maoMaoYunTrafficInteger(traffic.todayStartAt)&&maoMaoYunTrafficInteger(traffic.todayReportedAt)&&
    traffic.todayStartAt*1000<=traffic.todayReportedAt&&traffic.todayReportedAt<=now+60000;
  // New login sessions replace the whole snapshot, never merge old-account
  // fields. No email, token, subscription URL or raw diagnostics are retained.
  var normalized={
    accountKey: traffic.accountKey, credentialRevision: traffic.credentialRevision,
    identityKind: 'session', usedBytes: traffic.usedBytes, totalBytes: traffic.totalBytes, remainingBytes: traffic.remainingBytes,
    resetDays: maoMaoYunTrafficInteger(traffic.resetDays) ? traffic.resetDays : null,
    resetState: maoMaoYunTrafficInteger(traffic.resetDays) ? (traffic.resetDays === 0 ? 'today' : 'days') : traffic.resetState === 'invalid' ? 'invalid' : 'unavailable',
    usedLabel: formatMaoMaoYunTrafficAmount(traffic.usedBytes, index),
    totalLabel: formatMaoMaoYunTrafficAmount(traffic.totalBytes, index),
    remainingLabel: formatMaoMaoYunTrafficAmount(traffic.remainingBytes, index),
    remainingPercent: traffic.remainingBytes / traffic.totalBytes * 100,
    reportedAt: traffic.reportedAt,
    todayState:todayValid?'reported':'pending',todayUsedBytes:todayValid?traffic.todayUsedBytes:null,
    todayStartAt:todayValid?traffic.todayStartAt:null,todayReportedAt:todayValid?traffic.todayReportedAt:null,
    todayRetryAt:maoMaoYunTrafficInteger(traffic.todayRetryAt)&&traffic.todayRetryAt<=now+15*60000?traffic.todayRetryAt:0
  };
  if(traffic.calendarBasis!==undefined){
    try{
      if(!maoMaoYunTrafficInteger(traffic.calendarReportedAt)||traffic.calendarReportedAt<=0||traffic.calendarReportedAt>now+60000)
        throw new Error('Invalid calendar query time');
      var calendar=normalizeMaoMaoYunCalendarDays(traffic,traffic.calendarReportedAt);
      normalized.calendarBasis=calendar.calendarBasis;normalized.calendarState=calendar.calendarState;
      normalized.calendarDays=calendar.calendarDays;normalized.calendarReportedAt=traffic.calendarReportedAt;
    }catch(ignoredCalendar){
      // A bad daily detail cannot discard the validated allowance balance.
      normalized.calendarBasis='local-midnight';normalized.calendarState='unsupported';normalized.calendarDays=[];
    }
  }
  return normalized;
}

function parseMaoMaoYunAccountResult(raw, now) {
  if (typeof raw !== 'string' || raw.length > 65536) throw new Error('Invalid account helper output');
  // Login may print a safe failure code before a later successful attempt.
  // Only the final complete line is authoritative after the helper exits.
  var lines = raw.trim().split(/\r?\n/);
  var result = JSON.parse(lines[lines.length - 1]);
  if (!result || (result.version !== 2 && result.version !== 3) || typeof result.state !== 'string') throw new Error('Invalid account protocol');
  if (result.state === 'ready') {
    if (result.version === 2 && result.traffic) { result.traffic.resetDays = null; result.traffic.resetState = 'unavailable'; }
    return { state: 'ready', snapshot: normalizeMaoMaoYunTraffic(result.traffic, now) };
  }
  var allowed = ['authRequired', 'keychainLocked', 'credentialChanged', 'rateLimited', 'error', 'invalid', 'timeout', 'cancelled'];
  if (allowed.indexOf(result.state) === -1) throw new Error('Unknown account state');
  return { state: result.state };
}

function maoMaoYunTrafficNeedsLogin(sourceState) {
  return sourceState === 'authRequired' || sourceState === 'keychainLocked';
}

function maoMaoYunTrafficTimeLabel(reportedAt, now) {
  var date = new Date(reportedAt);
  var current = new Date(now);
  var time = (date.getHours() < 10 ? '0' : '') + date.getHours() + ':' +
    (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();
  if (date.getFullYear() !== current.getFullYear() || date.getMonth() !== current.getMonth() || date.getDate() !== current.getDate()) {
    time = (date.getMonth() + 1) + '/' + date.getDate() + ' ' + time;
  }
  return time;
}

function maoMaoYunTrafficPresentation(snapshot, sourceState, now, history, forecast) {
  if (!snapshot) {
    var value = 'Unavailable';
    var detail = 'Website unavailable · retrying';
    if (sourceState === 'loading') { value = 'Checking'; detail = 'Querying MaoMaoYun website'; }
    if (sourceState === 'signingIn') { value = 'Signing in'; detail = 'Complete login in the official website window'; }
    if (maoMaoYunTrafficNeedsLogin(sourceState)) { value = 'Sign in'; detail = 'Click Traffic to connect'; }
    if (sourceState === 'keychainLocked') detail = 'Keychain unavailable · click to reconnect';
    if (sourceState === 'rateLimited') detail = 'Rate limited · retrying later';
    if (sourceState === 'invalid') detail = 'Unsupported website response';
    return { value: value, detail: detail, usage: '', todayUsage:'Used today: —', fraction: 0, stale: false, hasValue: false,
      resetText: 'Reset schedule unavailable', forecastText: 'Budget unavailable' };
  }
  var stale = sourceState !== 'ready' || now - snapshot.reportedAt > MAOMAOYUN_TRAFFIC_FRESH_MS || now < snapshot.reportedAt - 60000;
  var date=new Date(now),start=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime()/1000;
  var todayValid=!stale&&snapshot.todayState==='reported'&&snapshot.todayStartAt===start&&
    now>=snapshot.todayReportedAt&&now-snapshot.todayReportedAt<=MAOMAOYUN_TRAFFIC_FRESH_MS;
  var prefix = stale ? 'Last update ' : 'Updated ';
  if (sourceState === 'rateLimited') prefix = 'Rate limited · ';
  if (sourceState === 'error' || sourceState === 'timeout') prefix = 'Read failed · ';
  return {
    value: snapshot.remainingLabel + ' remaining' + (stale ? ' · stale' : ''),
    detail: prefix + maoMaoYunTrafficTimeLabel(snapshot.reportedAt, now),
    usage: snapshot.usedLabel + ' / ' + snapshot.totalLabel + ' used',
    todayUsage:'Used today: '+(todayValid?formatMaoMaoYunTrafficAmount(snapshot.todayUsedBytes,
      snapshot.todayUsedBytes>0?Math.min(4,Math.max(0,Math.floor(Math.log(snapshot.todayUsedBytes)/Math.log(1024)))):3):'Awaiting report'),
    fraction: snapshot.remainingPercent / 100,
    stale: stale, hasValue: true,
    resetText: snapshot.resetDays === null ? 'Reset schedule unavailable' : snapshot.resetDays === 0 ? 'Reset reported today' : 'Resets in ' + snapshot.resetDays + ' days',
    forecastText: stale ? 'Budget paused · traffic stale' : (forecast||maoMaoYunTrafficForecast(snapshot, history, now)).text || (snapshot.resetDays > 0 ?
      'Budget ~' + formatMaoMaoYunTrafficAmount(snapshot.remainingBytes / snapshot.resetDays,
        Math.min(4, Math.max(0, Math.floor(Math.log(snapshot.totalBytes) / Math.log(1024))))) + '/day · learning' : 'Budget unavailable')
  };
}

function maoMaoYunTrafficForecast(snapshot, history, now) {
  function unknown(reason) { return {status:'unknown',text:snapshot && !(snapshot.resetDays > 0) ? 'Reported pace: learning' : null,reason:reason}; }
  if (!snapshot) return unknown('Traffic unavailable');
  if (!history || history.state !== 'ready' || history.credentialRevision !== snapshot.credentialRevision ||
      now < history.fetchedAt || now-history.fetchedAt > 7*3600000) return unknown('Need fresh reported history');
  var days=history.days.filter(function(d){return (d[0]+86400)*1000<=history.fetchedAt-48*3600000;}), n=snapshot.resetDays, values=[], byTime={};
  if(days.length<3 || days[days.length-1][0]-days[0][0]<2*86400) return unknown('Need 3 reported days');
  days.forEach(function(d){byTime[d[0]]=d[1];});
  if (!(n > 0)) {
    if(days.length<7)return unknown('Need 7 consecutive reported days');
    var latest=days[days.length-1][0], sum=0, firstPart=0;
    if(now/1000-latest>4*86400)return unknown('Reported days are out of date');
    for(var k=0;k<7;k++) {
      var amount=byTime[latest-k*86400];if(amount===undefined)return unknown('Reported history has missing days');
      sum+=amount;if(k<3)firstPart+=amount;
    }
    if(!maoMaoYunTrafficInteger(sum))return unknown('Reported totals unavailable');
    var rate=Math.max(sum/7,firstPart/3,(sum-firstPart)/4);
    if(rate===0)return unknown('No use in reported history');
    var remainingDays=snapshot.remainingBytes/rate;
    return {status:'unknown',basis:'reportedHistory',rateBytesPerDay:rate,
      text:'If reported pace holds: '+(remainingDays<1?'<1':remainingDays>999?'>999':'~'+Math.floor(remainingDays))+' days left',
      reason:'Conditional duration at the higher of recent 3-day, preceding 4-day and 7-day reported daily averages. '+
        'No next reset date is assumed. Recent 48h are excluded for revisions; u+d are billed bytes and reports may be incomplete or delayed. No safety or risk judgment.'};
  }
  for(var i=0;i<days.length;i++) {
    var loss=0,okay=true;
    for(var j=0;j<n;j++) { var amount=byTime[days[i][0]+j*86400]; if(amount===undefined){okay=false;break;} loss+=amount; }
    if(okay && maoMaoYunTrafficInteger(loss))values.push(loss);
  }
  if(values.length<3)return unknown('Need more consecutive reported history');
  values.sort(function(a,b){return a-b;});
  function q(p){var x=(values.length-1)*p,k=Math.floor(x);return values[k]+(values[Math.ceil(x)]-values[k])*(x-k);}
  var typical=q(.5),high=q(.9),index=Math.min(4,Math.max(0,Math.floor(Math.log(snapshot.totalBytes)/Math.log(1024))));
  if(high===0)return unknown('No use in reported history');
  // Receipt completeness is unverified: these are conditional reported-data
  // scenarios only, never safe/risk colors or a minute-precision exhaustion ETA.
  return {status:'unknown',basis:'reportedHistory',typicalConsumption:typical,highConsumption:high,candidateCount:values.length,
    text:'If reported pace holds: ~'+formatMaoMaoYunTrafficAmount(Math.max(0,snapshot.remainingBytes-high),index)+' left',
    reason:'Conditional P90 scenario from '+values.length+' consecutive UTC 24h blocks as long as the website reset days. '+
      'Reported u+d are billed bytes. Completeness is unverified and may undercount usage; this is not a safety or risk judgment.'};
}

function normalizeMaoMaoYunCalendarDays(data,reportedAt) {
  if(data.calendarBasis===undefined)return {calendarBasis:'local-midnight',calendarState:'legacy',calendarDays:[]};
  if(data.calendarBasis!=='local-midnight'||['ready','unsupported','legacy'].indexOf(data.calendarState)===-1||
    !Array.isArray(data.calendarDays)||data.calendarDays.length>35)throw new Error('Invalid calendar history');
  var previous=0,days=[];
  data.calendarDays.forEach(function(day){
    if(!Array.isArray(day)||day.length!==2||!maoMaoYunTrafficInteger(day[0])||day[0]<=previous||
      day[0]*1000>reportedAt+60000||day[0]*1000<reportedAt-36*86400000||!maoMaoYunTrafficInteger(day[1]))throw new Error('Invalid calendar day');
    previous=day[0];days.push(day.slice());
  });
  if(data.calendarState!=='ready'&&days.length)throw new Error('Unsupported calendar history must abstain');
  return {calendarBasis:'local-midnight',calendarState:data.calendarState,calendarDays:days};
}
function normalizeMaoMaoYunHistory(history, snapshot, now) {
  if (!history || !snapshot || history.accountKey !== snapshot.accountKey || history.credentialRevision !== snapshot.credentialRevision ||
      history.identityKind !== 'session' || !maoMaoYunTrafficInteger(history.fetchedAt) || history.fetchedAt <= 0 || history.fetchedAt > now + 60000 ||
      ['ready','partial','unsupported'].indexOf(history.state) === -1 || history.completeness !== 'unverified' ||
      history.billingBasis !== 'website-u+d' || history.bucketBasis !== 'utc-24h' || !Array.isArray(history.days) || history.days.length > 35) throw new Error('Invalid history protocol');
  var days = [], previous = 0;
  history.days.forEach(function(day) {
    if (!Array.isArray(day) || day.length !== 2 || !maoMaoYunTrafficInteger(day[0]) || day[0]%86400!==0 || day[0] <= previous || day[0] * 1000 > history.fetchedAt + 60000 ||
        day[0]<Math.floor(history.fetchedAt/86400000)*86400-34*86400 ||
        !maoMaoYunTrafficInteger(day[1])) throw new Error('Invalid history day');
    previous = day[0]; days.push(day.slice());
  });
  if (history.state !== 'ready' && days.length) throw new Error('Partial history must abstain');
  var calendar=normalizeMaoMaoYunCalendarDays(history,history.fetchedAt);
  if(history.state!=='ready'&&calendar.calendarDays.length)throw new Error('Partial calendar history must abstain');
  return {accountKey:snapshot.accountKey,credentialRevision:snapshot.credentialRevision,identityKind:'session',
    state:history.state,completeness:'unverified',billingBasis:'website-u+d',bucketBasis:'utc-24h',fetchedAt:history.fetchedAt,days:days,
    rowCount:maoMaoYunTrafficInteger(history.rowCount) ? history.rowCount : 0,dayCount:days.length,
    sourceStart:days.length ? days[0][0] : null,sourceEnd:days.length ? days[days.length-1][0] : null,
    diagnostics:maoMaoYunHistoryDiagnostics(history.diagnostics),
    calendarBasis:'local-midnight',calendarState:calendar.calendarState,calendarDays:calendar.calendarDays};
}
function maoMaoYunHistoryDiagnostics(raw) {
  var out={};
  ['duplicateRows','pagination','invalidNumbers','retentionTrimmed'].forEach(function(k){if(raw&&typeof raw[k]==='boolean')out[k]=raw[k];});
  ['validRows','nonDailyRows','bucketCount','retainedBucketCount'].forEach(function(k){if(raw&&maoMaoYunTrafficInteger(raw[k]))out[k]=raw[k];});
  return out;
}
function parseMaoMaoYunHistoryResult(raw, snapshot, now) {
  if (typeof raw !== 'string' || raw.length > 8192) throw new Error('Invalid history output size');
  var result = JSON.parse(raw.trim());
  if (!result || result.version !== 3) throw new Error('Invalid history version');
  if (result.state === 'history') {
    var h = result.history;
    if (h && ['authRequired','keychainLocked','credentialChanged','rateLimited','error','invalid','timeout','outputLimited'].indexOf(h.state) !== -1) return {state:h.state};
    return {state:h.state,history:normalizeMaoMaoYunHistory(h,snapshot,now)};
  }
  if (['authRequired','keychainLocked','credentialChanged','rateLimited','error','timeout'].indexOf(result.state) !== -1) return {state:result.state};
  throw new Error('Invalid history state');
}
