// Read-only presentation models: no I/O, AppKit, billing conversion or actions.
function meterNumber(value) {
  return typeof value==='number'&&isFinite(value);
}
function meterCount(value) {
  return meterNumber(value)&&value>=0&&Math.floor(value)===value&&value<=9007199254740991;
}
// Symbols reinforce the existing status text, never replace it or introduce
// another risk judgement. Use raw status keys so both locales stay identical.
function meterStatusSymbol(label) {
  if(/^(Empty .* early|Est\. empty .* early|Estimated empty .* before reset|Before reset|At reset depletion|Low reserve)$/.test(label||''))
    return 'exclamationmark.triangle.fill';
  return {'On pace':'checkmark.circle.fill','Above pace':'exclamationmark.triangle.fill',
    'Quota low':'exclamationmark.circle.fill','Exhausted':'exclamationmark.circle.fill',
    'Resetting':'arrow.triangle.2.circlepath','Last known':'clock','No data':'questionmark.circle',
    'Reset unknown':'questionmark.circle','Expiry unknown':'questionmark.circle',
    'Awaiting quota':'arrow.triangle.2.circlepath','No reset cards':'minus.circle',
    'Expired · refreshing':'exclamationmark.circle.fill',
    'Updating':'arrow.triangle.2.circlepath','Last count':'clock','Profile data':'checkmark.circle',
    'Read failed':'exclamationmark.circle','Rate limited':'clock',
    'Account unavailable':'person.crop.circle.badge.questionmark','Sign in to Codex':'person.crop.circle.badge.questionmark',
    'Reserve at reset':'checkmark.circle.fill','Observing':'hourglass','History gaps':'info.circle',
    'Paused':'pause.circle'}[label]||null;
}
function quotaPaceModel(window,now,stale) {
  var result={fraction:null,percent:null,tone:'muted',label:'Reset unknown',gap:null};
  if(!window||!meterNumber(window.remaining)||window.remaining<0||window.remaining>100)return {fraction:null,percent:null,tone:'muted',label:'No data',gap:null};
  if(!meterNumber(window.resetAt)||!meterNumber(window.durationMins)||window.durationMins<=0)return result;
  var seconds=window.resetAt-now,duration=window.durationMins*60;
  if(seconds>duration+60)return result;
  result.fraction=Math.max(0,Math.min(1,seconds/duration));result.percent=Math.round(result.fraction*100);
  result.gap=window.remaining-result.fraction*100;
  if(stale){result.label='Last known';return result;}
  if(seconds<=0){result.label='Resetting';return result;}
  if(window.remaining<=0){result.label='Exhausted';result.tone='critical';}
  else if(window.remaining<=5){result.label='Quota low';result.tone='critical';}
  else if(result.gap < -5-1e-7){result.label='Above pace';result.tone='warning';}
  else {result.label='On pace';result.tone='normal';}
  return result;
}

function observeResetCards(cards,expirations,previous,now,count) {
  var current=resetCardMetadata(cards),old=resetCardMetadata(previous),used={};
  if(!current.length)current=(expirations||[]).slice(0,100).map(function(at){return {expiresAt:at,grantedAt:null,observedAt:null};});
  return current.slice(0,Math.max(0,count||0)).map(function(card){
    var match=-1;
    for(var i=0;i<old.length;i++)if(!used[i]&&old[i].expiresAt===card.expiresAt&&old[i].grantedAt===card.grantedAt){match=i;used[i]=true;break;}
    var observed=match>=0?old[match].observedAt:card.observedAt;
    if(!meterNumber(observed)||observed>now||observed<=0)observed=now;
    return {expiresAt:card.expiresAt,grantedAt:card.grantedAt,observedAt:observed};
  });
}
function resetCardsModel(cards,count,now,stale) {
  if(!meterCount(count))return {count:null,rows:[{state:'loading',count:0,fraction:null}]};
  if(!count)return {count:0,rows:[{state:'empty',count:0,fraction:null}]};
  var known=resetCardMetadata(cards).slice(0,count),rows=[];
  known.forEach(function(card){
    var left=card.expiresAt?card.expiresAt-now:null;
    var official=!!(card.grantedAt&&card.grantedAt<=now),start=official?card.grantedAt:card.observedAt;
    var fraction=left!==null&&start&&start<=now&&start<card.expiresAt?Math.max(0,Math.min(1,left/(card.expiresAt-start))):null;
    rows.push({state:!card.expiresAt?'unknown':left<=0?'expired':'available',count:1,
      expiresAt:card.expiresAt,grantedAt:official?card.grantedAt:null,observedAt:card.observedAt,
      fraction:fraction,secondsLeft:left,fromObservation:!official,
      tone:stale?'muted':left!==null&&left<=86400?'critical':left!==null&&left<=7*86400?'warning':'accent'});
  });
  if(count>known.length)rows.push({state:'unknown',count:count-known.length,fraction:null});
  rows.sort(function(a,b){return (a.expiresAt||Infinity)-(b.expiresAt||Infinity);});
  return {count:count,rows:rows};
}
function meterDuration(seconds) {
  if(!meterNumber(seconds)||seconds<=0)return '0m';
  var minutes=Math.max(1,Math.ceil(seconds/60));
  if(minutes<60)return minutes+'m';
  var hours=Math.ceil(minutes/60);
  if(hours<48)return hours+'h';
  return Math.ceil(hours/24)+'d';
}
function compactTokenCount(value) {
  if(!meterCount(value))return '—';
  var units=['','K','M','B','T'],index=0,number=value;
  while(number>=1000&&index<units.length-1){number/=1000;index++;}
  if(index<units.length-1&&Math.round(number)>=1000){number/=1000;index++;}
  return (index?number.toFixed(number<100?1:0).replace(/\.0$/,''):String(number))+units[index];
}
function normalizeTokenMeter(snapshot,account,now) {
  if(!snapshot||snapshot.version!==3||snapshot.source!=='profile'||!account||snapshot.accountId!==account||!meterNumber(snapshot.savedAt)||
    snapshot.savedAt<=0||snapshot.savedAt>now+60||now-snapshot.savedAt>86400||!Array.isArray(snapshot.days)||snapshot.days.length!==30)return null;
  var days=[],last=null,total=0;
  for(var i=0;i<30;i++){
    var day=snapshot.days[i];
    if(!day||typeof day.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||!meterCount(day.tokens))return null;
    var at=Date.parse(day.date+'T00:00:00.000Z');
    if(!isFinite(at)||new Date(at).toISOString().slice(0,10)!==day.date||(last!==null&&at-last!==86400000))return null;
    total+=day.tokens;if(!meterCount(total))return null;last=at;
    days.push({date:day.date,tokens:day.tokens});
  }
  var saved=new Date(snapshot.savedAt*1000),date=saved.getFullYear()+'-'+('0'+(saved.getMonth()+1)).slice(-2)+'-'+('0'+saved.getDate()).slice(-2);
  if(days[29].date!==date)return null;
  return {version:3,source:'profile',accountId:account,savedAt:snapshot.savedAt,days:days};
}
function tokenMeterModel(snapshot) {
  if(!snapshot)return null;
  var days=snapshot.days;
  return {total:days.reduce(function(sum,day){return sum+day.tokens;},0),
    startDate:days[0].date,endDate:days[days.length-1].date,days:days};
}
