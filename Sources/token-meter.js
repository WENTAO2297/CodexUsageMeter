// Official Profile activity is independent of quota forecasts and local logs.
function readTokenMeterCache(account) {
  if(!account)return null;
  try{
    var text=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(tokenMeterPath,$.NSUTF8StringEncoding,null));
    return text&&text.length<=64000?normalizeTokenMeter(JSON.parse(text),account,Date.now()/1000):null;
  }catch(ignored){return null;}
}
function resetTokenMeter() {
  cancelBackgroundTask(tokenMeterReadState);tokenMeterPollTimer=stopTransientTimer(tokenMeterPollTimer);
  tokenMeterSnapshot=readTokenMeterCache(usageAccountId);tokenMeterSync=tokenMeterSnapshot?'cached':'loading';
  tokenMeterNextReadAt=0;tokenMeterLastReadAt=0;
  refreshTokenMeterMenu(true);
}
function requestTokenMeterRead(force) {
  var now=Date.now();
  if(isExiting||!usageAccountId||tokenMeterReadState.task)return;
  if(tokenMeterSync==='rateLimited'&&now<tokenMeterNextReadAt)return;
  if((tokenMeterLastReadAt>0&&now-tokenMeterLastReadAt<60000)||(!force&&now<tokenMeterNextReadAt))return;
  tokenMeterLastReadAt=now;
  try{
    var root=ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('CODEX_HOME'))||codexDirectory;
    tokenMeterReadState.accountId=usageAccountId;
    launchBackgroundTask(resourcePath('TokenProfileReader'),[root,String(now/1000),'--cache'],tokenMeterReadState,false);
    tokenMeterLastReadAt=now;tokenMeterNextReadAt=now+300000;
    tokenMeterSync=tokenMeterSnapshot?'cached':'loading';
    tokenMeterPollTimer=startTransientTimer(tokenMeterPollTimer,.25,'tokenMeterTaskTimer:');
  }catch(error){
    cancelBackgroundTask(tokenMeterReadState);tokenMeterPollTimer=stopTransientTimer(tokenMeterPollTimer);
    tokenMeterSync='error';tokenMeterNextReadAt=now+300000;logError('token-meter',new Error('Profile token reader could not start.'));
  }
  refreshTokenMeterMenu(true);
}
function pollTokenMeterRead() {
  if(tokenMeterPolling)return;tokenMeterPolling=true;
  try{
    var state=tokenMeterReadState,task=state.task;if(!task)return;
    if(task.running){
      if(Date.now()-state.startedAt>35000&&!state.timedOut){state.timedOut=true;sendVoid(task,'terminate');}
      return;
    }
    if(task!==state.task)return;
    var account=state.accountId,status=Number(task.terminationStatus),failed=state.timedOut||status!==0;
    resetBackgroundTask(state);tokenMeterPollTimer=stopTransientTimer(tokenMeterPollTimer);
    if(account!==usageAccountId||account!==readUsageAccountId())return;
    var snapshot=failed?null:readTokenMeterCache(account);
    if(snapshot){tokenMeterSnapshot=snapshot;tokenMeterSync='ready';}
    else {
      tokenMeterSync=status===3?'authRequired':status===4?'rateLimited':'error';
      if(status===3)tokenMeterSnapshot=null;
      tokenMeterNextReadAt=Date.now()+(status===4?900000:300000);
      logError('token-meter',new Error('Profile statistics unavailable (status '+status+').'));
    }
    refreshTokenMeterMenu(true);
  }finally{tokenMeterPolling=false;}
}
