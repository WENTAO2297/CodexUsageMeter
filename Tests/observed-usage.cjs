const assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('./sources.cjs');
const c=vm.createContext({});
vm.runInContext(['forecast-core','observed-usage','vpn-traffic-core','i18n','dashboard','forecast-display'].map(readSource).join('\n'),c);
const now=2000000000,w={durationMins:10080,resetAt:now+5*86400,remaining:68};
const context={now,sync:'ready',lastSuccessAt:now,accountId:'a',plan:'pro'};
const record={...w,samples:[[now-86400,90],[now-1000,69],[now,68]]};
let actual=c.observedQuotaUse(w,record,null,context);assert.equal(actual.pointsPerUnit,22);assert.equal(actual.loss,22);
assert.equal(c.observedQuotaUse(w,{...record,samples:[[now-43200,90]]},null,context).pointsPerUnit,44,'actual average uses the measured interval, not a synthetic 24h start');
for(const changes of [{sync:'error'},{accountId:null},{lastSuccessAt:now-181},{lastSuccessAt:now+1}])
 assert.equal(c.observedQuotaUse(w,record,null,{...context,...changes}),null);
for(const r of [{...record,resetAt:now+1},{...record,samples:[[now-600,90]]},{...record,samples:[[now-86400,60],[now-1000,69]]}])
 assert.equal(c.observedQuotaUse(w,r,null,context),null,'no reset/refill/short-span fabrication');
const anchor=(at,used,segment=1,plan='pro')=>({at,used,resetAt:w.resetAt,segment,plan,planSince:now-86400*7});
const history={accountId:'a',savedAt:now-60,anchors:[anchor(now-86400,10),anchor(now-3600,30)]};
actual=c.observedQuotaUse(w,null,history,context);assert.equal(actual.pointsPerUnit,22,'uses official quota anchor values, never token estimates');
for(const h of [{...history,accountId:'b'},{...history,savedAt:now-21601},{...history,anchors:[anchor(now-86400,10,0),anchor(now-3600,30)]},
 {...history,anchors:[anchor(now-86400,10,1,'plus'),anchor(now-3600,30,1,'plus')]},
 {...history,anchors:[anchor(now-86400,10),anchor(now-3600,40)]}])assert.equal(c.observedQuotaUse(w,null,h,context),null);
const session={durationMins:300,resetAt:now+3600,remaining:50};
actual=c.observedQuotaUse(session,{...session,samples:[[now-3600,70],[now,50]]},history,context);
assert.equal(actual.unit,'h');assert.equal(actual.pointsPerUnit,20);
const today=new Date(now*1000),start=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime()/1000;
const traffic={usedBytes:30*1024**3,totalBytes:400*1024**3,remainingBytes:370*1024**3,accountKey:'a'.repeat(64),
 credentialRevision:'a'.repeat(64),reportedAt:now*1000,todayState:'reported',todayUsedBytes:3*1024**3,todayStartAt:start,todayReportedAt:now*1000};
let s=c.normalizeMaoMaoYunTraffic(traffic,now*1000);
assert.equal(c.maoMaoYunTrafficPresentation(s,'ready',now*1000).todayUsage,'Used today: 3G');
s=c.normalizeMaoMaoYunTraffic({...traffic,todayUsedBytes:0},now*1000);
assert.equal(c.maoMaoYunTrafficPresentation(s,'ready',now*1000).todayUsage,'Used today: 0G');
for(const changes of [{todayStartAt:start-86400},{todayState:'pending'},{todayUsedBytes:-1},{todayReportedAt:now*1000+60001}]){
 s=c.normalizeMaoMaoYunTraffic({...traffic,...changes},now*1000);
 assert.equal(c.maoMaoYunTrafficPresentation(s,'ready',now*1000).todayUsage,'Used today: Awaiting report');
}
s=c.normalizeMaoMaoYunTraffic(traffic,now*1000);
assert.equal(c.maoMaoYunTrafficPresentation(s,'error',now*1000).todayUsage,'Used today: Awaiting report');
for(const text of ['Used today: 3G','Used today: Awaiting report','Actual daily use: 24.2 pp','Actual daily use: observing',
 'Actual hourly use: 5 pp','Expected to run out early','Low reserve at reset','Expected empty at reset']){
 c.uiLanguage='zh-CN';assert(!/[A-Za-z]{2,}/.test(c.uiText(text)),text);c.uiLanguage='en';assert.equal(c.uiText(text),text);
}
const row=c.dashboardForecast({headline:'May run out before reset',detail:'~0% at reset',roughVerdict:'risk',status:'unknown'});
assert.equal(row.outcome,'Expected to run out early');assert.equal(row.label,'Estimated at reset');assert.equal(row.value,'0%');assert.equal(row.status,'unknown');
console.log('Observed-use checks passed: real quota averages, account/plan/reset/refill/freshness gates, Session hourly scope, website today/zero/missing/midnight/stale guards and bilingual direct estimates.');

// Brief failures reuse the last observed time, never append fictional idle
// samples. Extended failures, resets and identity changes remain fail-closed.
let wall=now,currentAccount='a';
const grace=vm.createContext({Date:class extends Date{static now(){return wall*1000;}},
 usageAccountId:'a',usagePlanType:'pro',usageSyncState:'error',usageLastGoodAt:now,
 forecastLastSuccessAt:now,quotaWindows:[w],forecastHistoryRecords:[record],tokenHistorySnapshot:history,
 readUsageAccountId:()=>currentAccount});
vm.runInContext(['forecast-core','observed-usage','forecast'].map(readSource).join('\n'),grace);
const historyBefore=JSON.stringify(grace.forecastHistoryRecords);
wall=now+300;assert(grace.canUseRecentQuotaDisplay());
assert.equal(grace.quotaDisplayContext().now,now);assert.equal(grace.quotaDisplayContext().sync,'ready');
assert.equal(grace.currentObservedQuotaUse(w).pointsPerUnit,22,'grace does not dilute actual use with unobserved time');
assert(grace.currentQuotaForecasts()[0].budget,'retain the last real budget instead of showing a paused placeholder');
assert.equal(JSON.stringify(grace.forecastHistoryRecords),historyBefore);
wall=now+601;assert(!grace.canUseRecentQuotaDisplay());assert.equal(grace.quotaDisplayContext().sync,'error');
wall=now+300;currentAccount='b';assert(!grace.canUseRecentQuotaDisplay());
currentAccount='a';grace.quotaWindows=[{...w,resetAt:wall}];assert(!grace.canUseRecentQuotaDisplay());
grace.quotaWindows=[w];grace.usageLastGoodAt=wall+1;assert(!grace.canUseRecentQuotaDisplay());
console.log('Short-failure display checks passed: ten-minute grace, unchanged real observation time, preserved budget/actual consumption, no fabricated samples, expiry/account/reset/clock guards.');
