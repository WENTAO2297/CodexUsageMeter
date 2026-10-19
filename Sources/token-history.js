// Infrequent, read-only metadata scans run outside AppKit's UI process. The
// native helper is bundled; installed users do not need Node or Python.
function readTokenHistoryCache(account) {
  if(!account)return null;
  try {
    var text=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(tokenHistoryPath,$.NSUTF8StringEncoding,null));
    return text&&text.length<=48000?normalizeTokenHistory(JSON.parse(text),account,Date.now()/1000):null;
  } catch(ignored){return null;}
}
function resetTokenHistory() {
  cancelBackgroundTask(tokenHistoryReadState);
  tokenHistoryPollTimer=stopTransientTimer(tokenHistoryPollTimer);
  tokenHistorySnapshot=readTokenHistoryCache(usageAccountId);
  tokenHistoryNextReadAt=0;
  tokenHistoryLastReadAt=0;
}
function requestTokenHistoryRead() {
  var now=Date.now();
  if(!usageAccountId||usageSyncState!=='ready'||tokenHistoryReadState.task)return;
  if(!quotaWindows.some(function(w){return w.durationMins===10080;}))return;
  var weekly=quotaWindows.filter(function(w){return w.durationMins===10080;})[0];
  var latest=tokenHistorySnapshot&&tokenHistorySnapshot.anchors[tokenHistorySnapshot.anchors.length-1];
  // A refill/changed plan invalidates the old estimate immediately. Refresh
  // early, but rate-limit scans even if quota events repeat.
  if(latest&&(Math.abs(latest.resetAt-weekly.resetAt)>600||100-weekly.remaining<latest.used-1||usagePlanType&&usagePlanType!==latest.plan)&&now-tokenHistoryLastReadAt>=600000)
    tokenHistoryNextReadAt=0;
  if(now<tokenHistoryNextReadAt)return;
  try {
    tokenHistoryReadState.accountId=usageAccountId;
    var root=ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('CODEX_HOME'))||codexDirectory;
    launchBackgroundTask(resourcePath('TokenHistoryReader'),[root,String(now/1000),'--cache'],tokenHistoryReadState,false);
    tokenHistoryLastReadAt=now;
    tokenHistoryNextReadAt=now+6*3600000;
    tokenHistoryPollTimer=startTransientTimer(tokenHistoryPollTimer,.25,'tokenHistoryTaskTimer:');
  } catch(ignored){cancelBackgroundTask(tokenHistoryReadState);tokenHistoryPollTimer=stopTransientTimer(tokenHistoryPollTimer);tokenHistoryNextReadAt=now+600000;}
}
function pollTokenHistoryRead() {
  var state=tokenHistoryReadState,task=state.task;if(!task)return;
  if(task.running){if(Date.now()-state.startedAt>30000&&!state.timedOut){state.timedOut=true;sendVoid(task,'terminate');}return;}
  var account=state.accountId,failed=state.timedOut||task.terminationStatus!==0;
  resetBackgroundTask(state);tokenHistoryPollTimer=stopTransientTimer(tokenHistoryPollTimer);
  if(account!==usageAccountId||account!==readUsageAccountId())return;
  if(!failed)tokenHistorySnapshot=readTokenHistoryCache(account);
  else {tokenHistorySnapshot=null;tokenHistoryNextReadAt=Date.now()+600000;}
  if(!failed&&typeof recordAdaptiveQuota==='function'&&usageSyncState==='ready')recordAdaptiveQuota(quotaWindows);
  redrawUsageCardIfNeeded(true);
}
