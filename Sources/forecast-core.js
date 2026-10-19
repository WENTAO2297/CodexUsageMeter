// Budgets use actual deadlines; estimates use observations, never cycle averages.
var FORECAST_RETENTION_SECONDS = 28 * 86400;
var FORECAST_BUCKET_SECONDS = 300;
var FORECAST_MAX_SAMPLES = 600;
var FORECAST_FRESHNESS_SECONDS = 180;
var FORECAST_ALGORITHM_VERSION = 2;
function forecastWindowKey(w) { return String(w.durationMins) + ':' + String(w.resetAt); }
function forecastNumber(v) { return typeof v === 'number' && isFinite(v); }
function validForecastRemaining(v) { return forecastNumber(v) && v >= 0 && v <= 100; }
function validForecastWindow(w, now) {
  return w && forecastNumber(w.resetAt) && w.resetAt > now &&
    (w.durationMins === null || (forecastNumber(w.durationMins) && w.durationMins > 0 && w.durationMins % 1 === 0));
}
function normalizeForecastSnapshot(s, accountId, now) {
  if (!accountId || !s || s.accountId !== accountId || !forecastNumber(s.savedAt) || s.savedAt <= 0 ||
      s.savedAt / 1000 > now + 60 || !Array.isArray(s.windows) || s.windows.length > 2 ||
      (s.version !== 1 && (s.version !== 2 || s.algorithmVersion !== 2))) return [];
  var result = [], durations = {};
  for (var i = 0; i < s.windows.length; i++) {
    var r = s.windows[i];
    if (!validForecastWindow({durationMins:r.durationMins,resetAt:now+1},now) || !forecastNumber(r.resetAt) ||
        r.resetAt <= 0 || durations[String(r.durationMins)] || !Array.isArray(r.samples) || r.samples.length > 600) return [];
    durations[String(r.durationMins)] = true;
    var samples = [], time = 0, remaining = 100;
    for (var j = 0; j < r.samples.length; j++) {
      var p = r.samples[j];
      if (!Array.isArray(p) || p.length !== 2 || !forecastNumber(p[0]) || p[0] <= time ||
          p[0] > Math.min(now,s.savedAt/1000)+60 || !validForecastRemaining(p[1]) || p[1] > remaining+0.05) return [];
      time=p[0];remaining=p[1];if(p[0]>=now-48*3600) samples.push(p.slice());
    }
    var buckets=[], hour=0, gaps=[];
    if (s.version === 2) {
      if (!forecastNumber(r.epoch) || r.epoch <= 0 || r.epoch>now+60 || !Array.isArray(r.buckets) || r.buckets.length > 674 ||
          !forecastNumber(r.segmentStart) || r.segmentStart <= 0 || r.segmentStart > now+60) return [];
      for(j=0;j<r.buckets.length;j++) {
        var b=r.buckets[j];
        if(!Array.isArray(b)||b.length!==4||!forecastNumber(b[0])||b[0]%3600!==0||b[0]<=hour||b[0]>now+60 ||
           !forecastNumber(b[1])||b[1]<0||b[1]>100*(Math.ceil(60/(r.durationMins||60))+1)||!forecastNumber(b[2])||b[2]<0||b[2]>3600 ||
           !forecastNumber(b[3])||b[3]<0||b[3]>3600) return [];
        hour=b[0];if(hour>=now-FORECAST_RETENTION_SECONDS) buckets.push(b.slice());
      }
      if(!Array.isArray(r.gaps)||r.gaps.length>200)return [];
      for(j=0;j<r.gaps.length;j++) {
        var g=r.gaps[j];
        if(!Array.isArray(g)||g.length!==3||!forecastNumber(g[0])||!forecastNumber(g[1])||g[0]<=0||g[1]<=g[0]||g[1]>now+60||
          !forecastNumber(g[2])||g[2]<0||g[2]>100)return [];
        if(g[1]>=now-FORECAST_RETENTION_SECONDS)gaps.push(g.slice());
      }
    }
    if(r.adjustedAt!==null && r.adjustedAt!==undefined && (!forecastNumber(r.adjustedAt)||r.adjustedAt<=0||r.adjustedAt>now+60)) return [];
    // v1 never imports its cycle average or asserts complete daily coverage.
    result.push({durationMins:r.durationMins,resetAt:r.resetAt,epoch:s.version===2?r.epoch:now,
      adjustedAt:r.adjustedAt||null,samples:samples,buckets:buckets,gaps:gaps,
      segmentStart:s.version===2?r.segmentStart:(samples.length?samples[0][0]:now)});
  }
  return result;
}
function updateForecastHistory(records, windows, now, breakSegment) {
  return windows.filter(function(w){return validForecastWindow(w,now)&&validForecastRemaining(w.remaining);}).map(function(w){
    var prior=records.filter(function(r){return r.durationMins===w.durationMins;})[0];
    var same=prior&&prior.resetAt===w.resetAt;
    var normal=prior&&!same&&w.durationMins!==null&&prior.resetAt<=now&&Math.abs(w.resetAt-prior.resetAt-w.durationMins*60)<=900;
    var last=prior&&prior.samples[prior.samples.length-1];
    var invalid=prior&&((!same&&!normal)||(last&&now<last[0])||(same&&last&&w.remaining>last[1]+0.05));
    var buckets=prior&&!invalid?(prior.buckets||[]).map(function(b){return b.slice();}):[];
    var gaps=prior&&!invalid?(prior.gaps||[]).map(function(g){return g.slice();}):[];
    var samples=same&&!invalid?prior.samples.map(function(p){return p.slice();}):[];
    var segment=same&&!invalid?prior.segmentStart:now;
    if(breakSegment||!same||invalid||(last&&now-last[0]>600)) segment=now;
    // Maintain a monotone anchor for rounding noise before computing loss.
    var value=same&&last&&!invalid?Math.min(last[1],w.remaining):w.remaining;
    if(same&&!invalid&&last&&now>last[0]) {
      var gap=now-last[0], loss=Math.max(0,last[1]-value), cursor=Math.max(last[0],now-FORECAST_RETENTION_SECONDS);
      if(gap>600||breakSegment)gaps.push([last[0],now,loss]); // interval-censored, excluded from predictions
      while(cursor<now) {
        var hour=Math.floor(cursor/3600)*3600, end=Math.min(now,hour+3600);
        var b=buckets.filter(function(item){return item[0]===hour;})[0];
        if(!b){b=[hour,0,0,0];buckets.push(b);}
        if(gap<=600&&!breakSegment){b[1]+=loss*(end-cursor)/gap;b[2]=Math.min(3600,b[2]+end-cursor);}
        else b[3]=Math.max(b[3],end-cursor);
        cursor=end;
      }
    }
    var tail=samples[samples.length-1], point=[now,value];
    if(tail&&(now===tail[0]||(samples.length>1&&Math.floor(now/300)===Math.floor(tail[0]/300))))samples[samples.length-1]=point;
    else samples.push(point);
    return {durationMins:w.durationMins,resetAt:w.resetAt,epoch:!prior||invalid?now:prior.epoch,
      adjustedAt:invalid?now:(same&&prior?prior.adjustedAt:null),segmentStart:segment,
      gaps:gaps.filter(function(g){return g[1]>=now-FORECAST_RETENTION_SECONDS;}).slice(-200),
      samples:samples.filter(function(p){return p[0]>=now-48*3600;}).slice(-600),
      buckets:buckets.filter(function(b){return b[0]>=now-FORECAST_RETENTION_SECONDS;}).sort(function(a,b){return a[0]-b[0];}).slice(-674)};
  });
}
function forecastDuration(seconds) {
  var m=Math.max(1,Math.round(seconds/300)*5);
  if(m<60)return m+'m';
  var h=Math.floor(m/60);
  if(h<24)return h+'h'+(m%60?' '+m%60+'m':'');
  return Math.floor(h/24)+'d'+(h%24?' '+h%24+'h':'');
}
function forecastBudget(remaining,seconds,weekly) {
  var n=remaining*(weekly?86400:3600)/seconds;
  return 'Budget '+(n<0.1?'<0.1':n.toFixed(1).replace(/\.0$/,''))+'%/'+(weekly?'day':'h');
}
function forecastQuantile(values,q) {
  var a=values.slice().sort(function(a,b){return a-b;}), x=(a.length-1)*q, lo=Math.floor(x);
  return a[lo]+(a[Math.ceil(x)]-a[lo])*(x-lo);
}
function weeklyForecastBlocks(record,horizon,now) {
  var buckets=record&&record.buckets||[], length=Math.ceil(horizon/3600), values=[];
  if(buckets.length<72||!length||buckets[buckets.length-1][0]-buckets[0][0]<71*3600)return {values:[],reason:'Need 3 days of history'};
  var map={};buckets.forEach(function(b){map[b[0]]=b;});
  for(var start=Math.ceil(buckets[0][0]/86400)*86400;start+length*3600<=now;start+=86400) {
    var loss=0,covered=0,okay=true;
    for(var h=0;h<length;h++) {
      var b=map[start+h*3600];if(!b||b[3]>900||b[2]<3528){okay=false;break;}
      loss+=b[1];covered+=b[2];
    }
    if(okay&&covered/(length*3600)>=0.98)values.push(loss);
  }
  return {values:values,reason:length*3600>now-buckets[0][0]?'Need more history':'History incomplete'};
}
function forecastQuotaWindow(w, record, context) {
  var now=context.now;
  function pending(reason){return {status:'unknown',text:'Forecast: '+reason,reason:reason,tooltip:reason};}
  if(context.sync!=='ready'||!context.lastSuccessAt||now<context.lastSuccessAt||now-context.lastSuccessAt>180)
    return pending(context.sync==='loading'?'Waiting for quota':'Paused · quota stale');
  if(!validForecastRemaining(w.remaining))return pending('Quota unavailable');
  if(!forecastNumber(w.resetAt))return pending('Reset time unknown');
  if(w.resetAt<=now)return pending('Awaiting reset');
  if(w.remaining===0)return {status:'exhausted',text:'Forecast: Exhausted · waiting for reset'};
  var horizon=w.resetAt-now, weekly=w.durationMins>=1440, budget=forecastBudget(w.remaining,horizon,weekly);
  function budgetOnly(reason){return {status:'unknown',text:budget+' · '+(/incomplete/i.test(reason)?'gaps':/jump/i.test(reason)?'recent jump':/No .*use/i.test(reason)?'no recent use':'learning'),budget:budget,reason:reason,
    tooltip:reason+'. Budget spreads the remaining quota until the actual reset; it does not predict future use.'};}
  if(context.accountKnown===false||!record)return budgetOnly('Need observation history');
  if(weekly) {
    var blocks=weeklyForecastBlocks(record,horizon,now);
    if(blocks.values.length<3)return budgetOnly(blocks.reason);
    var median=forecastQuantile(blocks.values,.5), high=forecastQuantile(blocks.values,.9);
    if(high===0)return budgetOnly('No use in observed history');
    var status=median>w.remaining?'risk':w.remaining-high<=5?'tight':'safe';
    return {status:status,basis:'history',budget:budget,typicalConsumption:median,highConsumption:high,
      text:(status==='safe'?'On track':status==='tight'?'Tight':'At risk')+' · ~'+
        Math.max(0,Math.round(w.remaining-high))+'–'+Math.max(0,Math.round(w.remaining-median))+'% at reset',
      tooltip:budget+'. Typical (P50) and higher (P90) observed consumption from '+blocks.values.length+
        ' historical blocks, rounded up to whole hours. Scenarios, not confidence bounds. Incomplete blocks are excluded.'};
  }
  if(forecastWindowKey(record)!==forecastWindowKey(w))return budgetOnly('Need recent observations');
  var cutoff=Math.max(now-3600,record.segmentStart||0), all=record.samples, index=0;
  while(index+1<all.length&&all[index+1][0]<=cutoff)index++;
  var samples=all.slice(index).filter(function(p){return p[0]>=record.segmentStart;});
  if(samples.length>1&&samples[0][0]<cutoff) {
    var a=samples[0], b=samples[1];
    if(b[0]-a[0]<=600)samples[0]=[cutoff,a[1]+(b[1]-a[1])*(cutoff-a[0])/(b[0]-a[0])];
    else samples.shift();
  }
  if(samples.length<7||now-samples[samples.length-1][0]>180)return budgetOnly('Need 30 minutes of recent history');
  for(var i=1;i<samples.length;i++)if(samples[i][0]-samples[i-1][0]>600)return budgetOnly('Recent history incomplete');
  var span=samples[samples.length-1][0]-samples[0][0];
  if(span<1800)return budgetOnly('Need 30 minutes of recent history');
  var drops=0;for(i=1;i<samples.length;i++)if(samples[i-1][1]-samples[i][1]>0.05)drops++;
  if(drops===1)return budgetOnly('Recent usage jump · waiting for sustained observations');
  var rate=Math.max(0,samples[0][1]-samples[samples.length-1][1])*3600/span;
  if(rate===0)return budgetOnly('No recent use');
  var scenario=Math.min(horizon,span>=3590?3600:1800), projected=w.remaining-rate*scenario/3600, atReset=horizon<=scenario;
  return {status:projected<0?'risk':atReset&&projected<=5?'tight':'unknown',basis:'recent',budget:budget,rate:rate,
    projectedRemaining:projected,horizon:scenario,
    text:'If pace holds: '+(projected<0?'empty within '+forecastDuration(scenario):'~'+Math.round(projected)+'% '+(atReset?'at reset':'in '+forecastDuration(scenario))),
    tooltip:budget+'. Conditional estimate from '+forecastDuration(span)+' of continuous recent observations, including idle time. Projects only '+forecastDuration(scenario)+'.'};
}
