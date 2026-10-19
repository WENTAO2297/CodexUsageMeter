// Calendar activity is display-only. Never reinterpret forecasting's UTC
// buckets as local days, fill missing reports, or derive use from the balance.
function vpnActivityDate(at) {
  var date=new Date(at*1000);
  return date.getFullYear()+'-'+('0'+(date.getMonth()+1)).slice(-2)+'-'+('0'+date.getDate()).slice(-2);
}
function vpnActivityAmount(bytes) {
  if(bytes===null)return '—';
  var unit=bytes>0?Math.min(4,Math.max(0,Math.floor(Math.log(bytes)/Math.log(1024)))):3;
  return formatMaoMaoYunTrafficAmount(bytes,unit);
}
function vpnActivityModel(snapshot,history,state,now,range) {
  var count=range===30?30:7;
  var current=new Date(now),days=[],bound=!!snapshot&&/^[0-9a-f]{64}$/.test(snapshot.accountKey||'')&&
    /^[0-9a-f]{64}$/.test(snapshot.credentialRevision||'')&&
    ['authRequired','credentialChanged','keychainLocked','invalid','signingIn'].indexOf(state)===-1;
  for(var i=count-1;i>=0;i--){
    var at=new Date(current.getFullYear(),current.getMonth(),current.getDate()-i).getTime()/1000;
    days.push({start:at,date:vpnActivityDate(at),bytes:null,today:i===0,stale:false});
  }
  // The ordinary balance read already fetches these same daily reports for
  // today's total. Reuse its newer calendar series with no additional request.
  if(bound&&snapshot.calendarState==='ready'&&snapshot.calendarBasis==='local-midnight'&&
    (!history||snapshot.calendarReportedAt>=history.fetchedAt)){
    history={accountKey:snapshot.accountKey,credentialRevision:snapshot.credentialRevision,state:'ready',
      fetchedAt:snapshot.calendarReportedAt,calendarBasis:snapshot.calendarBasis,calendarState:'ready',calendarDays:snapshot.calendarDays};
  }
  var valid=bound&&history&&history.accountKey===snapshot.accountKey&&history.credentialRevision===snapshot.credentialRevision&&
    history.state==='ready'&&history.calendarBasis==='local-midnight'&&history.calendarState==='ready'&&
    maoMaoYunTrafficInteger(history.fetchedAt)&&history.fetchedAt>0&&history.fetchedAt<=now+60000&&
    now-history.fetchedAt<=35*86400000&&Array.isArray(history.calendarDays)&&history.calendarDays.length<=35;
  var reported={},previous=0;
  if(valid)history.calendarDays.forEach(function(day){
    if(!Array.isArray(day)||day.length!==2||!maoMaoYunTrafficInteger(day[0])||day[0]<=previous||
      !maoMaoYunTrafficInteger(day[1])||day[0]*1000>history.fetchedAt+60000){valid=false;return;}
    var date=new Date(day[0]*1000),start=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime()/1000;
    if(start!==day[0]){valid=false;return;} // A timezone change cannot relabel cached buckets.
    previous=day[0];reported[day[0]]=day[1];
  });
  if(valid)days.slice(0,count-1).forEach(function(day){
    if(Object.prototype.hasOwnProperty.call(reported,day.start)){
      day.bytes=reported[day.start];day.stale=state!=='ready'||now-history.fetchedAt>7*3600000||snapshot.calendarState==='unsupported';
    }
  });
  var today=days[count-1];
  if(bound&&snapshot.todayState==='reported'&&snapshot.todayStartAt===today.start&&
    maoMaoYunTrafficInteger(snapshot.todayUsedBytes)&&maoMaoYunTrafficInteger(snapshot.todayReportedAt)&&
    snapshot.todayReportedAt>=today.start*1000&&snapshot.todayReportedAt<=now+60000){
    today.bytes=snapshot.todayUsedBytes;
    today.stale=state!=='ready'||now-snapshot.todayReportedAt>MAOMAOYUN_TRAFFIC_FRESH_MS;
  }
  return {days:days,hasData:days.some(function(day){return day.bytes!==null;}),
    stale:days.some(function(day){return day.bytes!==null&&day.stale;}),
    caption:!bound?'Sign in':valid?'Reported daily usage':history&&history.calendarState==='legacy'?'Updating':'No data'};
}
function vpnActivityPresentation(range) {
  return vpnActivityModel(maomaoyunTrafficSnapshot,maomaoyunHistorySnapshot,maomaoyunTrafficSourceState,Date.now(),range);
}
