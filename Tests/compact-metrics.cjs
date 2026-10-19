const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {readLibrarySource}=require('./sources.cjs');
// Offscreen production views: no mouse movement, real login, VPN or tasks.
const fixture=`
delegate=$.NSObject.alloc.init;statusItem={};buildMenu();
var now=Date.now()/1000;
quotaWindows=[{label:'Weekly',durationMins:10080,remaining:58,resetAt:now+5*86400}];
currentQuotaForecasts=function(){return quotaWindows.map(function(){return {status:'unknown',text:'Budget 11.3%/day',budget:'Budget 11.3%/day'};});};
redrawUsageCardIfNeeded(true);
function rect(view){var f=view.frame;return {x:Number(f.origin.x),y:Number(f.origin.y),w:Number(f.size.width),h:Number(f.size.height)};}
var single={parent:rect(metricsPairView),quota:rect(usageCardView),traffic:rect(maomaoyunTrafficView)};
var controls={status:rect(maomaoyunView),app:rect(vpnAppButton)};
var rowHeight=dashboardMetricLayout(MENU_WIDTH).height;
var leftHit=!!metricsPairView.hitTest($.NSMakePoint(50,rowHeight/2)).isEqual(usageCardView);
var rightHit=!!metricsPairView.hitTest($.NSMakePoint(50,maomaoyunTrafficView.frame.origin.y+rowHeight/2)).isEqual(maomaoyunTrafficView);
var owned=usageCardView.superview.isEqual(metricsPairView)&&maomaoyunTrafficView.superview.isEqual(metricsPairView);
var parentEnabled=!!menu.itemAtIndex(0).enabled;
availableCredits=3;resetCreditExpirations=[now+86400,now+172800,now+259200];redrawUsageCardIfNeeded(true);
var allDates=uiText(inlineResetCreditText());
var quotaAX=ObjC.unwrap(usageCardView.accessibilityLabel);
var signIns=0;signInMaoMaoYunAccount=function(){signIns++;};
maomaoyunTrafficSourceState='authRequired';updateMaoMaoYunTrafficMenuItem();
var loginPress=maomaoyunTrafficView.accessibilityPerformPress;
maomaoyunTrafficSourceState='ready';updateMaoMaoYunTrafficMenuItem();
var readyPress=maomaoyunTrafficView.accessibilityPerformPress;
quotaWindows.unshift({label:'Session',durationMins:300,remaining:80,resetAt:now+3600});
redrawUsageCardIfNeeded(true);
var double={parent:rect(metricsPairView),quota:rect(usageCardView),traffic:rect(maomaoyunTrafficView)};
quotaWindows.shift();redrawUsageCardIfNeeded(true);
var restored=rect(metricsPairView);
var text=[],values=[],unitFits=[],slices=[],bars=[],rightText=[],failureSlices=[],capture=false;
var oldText=drawCardText,oldValue=drawDashboardValue;
var oldBar=drawRoundedBar,oldRight=drawCardTextRight;
drawRoundedBar=function(x,y,w,h,fraction,color){
 if(capture)bars.push({x:x,y:y,w:w,h:h,fraction:fraction,muted:!!(color&&color.isEqual(cardColors().muted))});
 oldBar(x,y,w,h,fraction,color);
};
drawCardTextRight=function(t,edge,y,size,color,bold){
 if(capture)rightText.push({t:uiText(t),y:y,w:Number($(uiText(t)).sizeWithAttributes(cardAttributes(size,color,bold)).width)});
 oldRight(t,edge,y,size,color,bold);
};
drawCardText=function(t,x,y,w,size,color,bold){
 if(capture)text.push({t:t,localized:uiText(t),x:x,y:y,w:w,h:size+4,muted:!!color.isEqual(cardColors().muted),baseline:y+size+4-Number(cardFont(size,bold).ascender),
  measured:Number($(uiText(t)).sizeWithAttributes(cardAttributes(size,color,bold)).width)});
 oldText(t,x,y,w,size,color,bold);
};
drawDashboardValue=function(t,x,y,w,size,color,align){
 var result=oldValue(t,x,y,w,size,color,align);
 if(capture)values.push({t:t,localized:uiText(t),x:result.x,y:result.y,w:result.drawWidth,h:size+5,
  baseline:result.y+size+5-Number(statusQuotaFont(result.size).ascender),measured:result.width});return result;
};
var metricHeight=dashboardMetricLayout(180,'traffic').height;
var img=$.NSImage.alloc.initWithSize($.NSMakeSize(180,metricHeight));img.lockFocus;
['en','zh-CN'].forEach(function(locale){uiLanguage=locale;
 var summaries=[
  {headline:'Expected to last until reset',detail:'~15–30% at reset',status:'safe'},
  {headline:'Not enough data to predict',detail:'Need 3 days of history',status:'unknown'},
  {headline:'May run out before reset',detail:'Before reset · historical scenario',status:'risk'},
  {headline:'Prediction paused',detail:'Last update 10:54',status:'unknown'},
  {headline:'May be tight before reset',detail:'~0–30% at reset',status:'tight'},
  {headline:'May run out within 30m',detail:'Before reset',status:'risk'},
  {headline:'Only a short-term estimate',detail:'~20% in 30m',status:'safe'},
  {headline:'Next reset date unknown',detail:'Reset unknown',status:'unknown'},
  {headline:'History has gaps; no prediction',detail:'Missing history',status:'unknown'},
  {headline:'Recent use too low to predict',detail:'No sustained use',status:'unknown'},
  {headline:'Usage changed; observing again',detail:'Recent jump',status:'unknown'},
  {headline:'Quota exhausted',detail:'Waiting for reset',status:'exhausted'},
  {headline:'At reported pace: lasts to reset',detail:'At reset: ~88.94G left · estimate only',status:'unknown'},
  {headline:'At reported pace: used up by reset',detail:'At reset: ~0G left · estimate only',status:'unknown'},
  {headline:'At reported pace: may run out',detail:'Before reset · estimate only',status:'unknown'}
 ];
 var timingSummaries=[{days:28,crossing:18},{days:28,crossing:27},{days:28,crossing:27.5},
  {days:366,crossing:.5}].map(function(sample){return trafficForecastSummary(
   {remainingBytes:100,totalBytes:400,resetDays:sample.days},{hasValue:true,stale:false},
   {basis:'adaptive',verdict:'risk',typicalConsumption:150,highConsumption:200,crossingDays:sample.crossing,
    horizonDays:sample.days,text:'At reset: ~0G left · estimate only'});});
 ['Weekly','Session','Traffic'].forEach(function(kind){
  (kind==='Traffic'?summaries.concat(timingSummaries):summaries).forEach(function(summary){[false,true].forEach(function(stale){
   capture=true;var start=text.length,valueStart=values.length,barStart=bars.length,rightStart=rightText.length;
   drawMetricDashboard({kind:kind==='Traffic'?'traffic':undefined,title:kind,resetDays:30,
    hasValue:true,stale:stale,value:kind==='Traffic'?'999.99G':'100%',valueColor:cardColors().body,fraction:.6,
    detail:kind==='Traffic'?'Used today: 12.34G':'Budget 13.5%/day',actual:'Actual daily use: 30.2 pp',
    footer:'Read failed · 10:54',footerParts:kind==='Traffic'?null:{date:'10/20 13:09',countdown:'5d 2h',credits:'↻ 3 uses',expiry:' · Expires 10/30, 11/7, 11/14'},summary:summary},180,0);
   slices.push({locale:locale,kind:kind,stale:stale,rows:text.slice(start),values:values.slice(valueStart),
    bars:bars.slice(barStart),right:rightText.slice(rightStart)});capture=false;
  });});
 });
 ['Sign in','Signing in','Unavailable','Sync failed','—'].forEach(function(value){
  capture=true;drawMetricDashboard({kind:'traffic',title:'Traffic',hasValue:false,stale:false,value:value,
   valueColor:cardColors().muted,detail:'Used today: Awaiting report',footer:'Keychain unavailable · click to reconnect',
   summary:summaries[3]},180,0);capture=false;
 });
 ['100–100%','0–30%','0G','999.99T','100 pp'].forEach(function(value){
  unitFits.push({value:value,width:148,result:drawDashboardValue(value,16,40,148,30,cardColors().body,'left')});
 });
 // Exercise actual presentation states rather than only synthetic stale flags.
 var sampleNow=Date.now(),gib=Math.pow(1024,3),date=new Date(sampleNow);
 var sample=normalizeMaoMaoYunTraffic({accountKey:'a'.repeat(64),credentialRevision:'b'.repeat(64),
  usedBytes:80*gib,totalBytes:400*gib,remainingBytes:320*gib,resetDays:28,reportedAt:sampleNow,
  todayState:'reported',todayUsedBytes:9*gib,todayStartAt:new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime()/1000,
  todayReportedAt:sampleNow},sampleNow);
 var failureCases=[];
 ['ready','error','timeout','rateLimited','loading','signingIn'].forEach(function(state){
  failureCases.push({state:state,snapshot:sample,now:sampleNow});
  failureCases.push({state:state,snapshot:null,now:sampleNow});
 });
 ['authRequired','keychainLocked','invalid','credentialChanged','cancelled'].forEach(function(state){
  failureCases.push({state:state,snapshot:null,now:sampleNow});
 });
 failureCases.push({state:'ready',snapshot:sample,now:sampleNow+600001});
 failureCases.push({state:'ready',snapshot:sample,now:sampleNow-60001});
 var exhausted=JSON.parse(JSON.stringify(sample));exhausted.usedBytes=400*gib;exhausted.remainingBytes=0;
 exhausted.remainingLabel='0G';exhausted.remainingPercent=0;
 failureCases.push({state:'ready',snapshot:exhausted,now:sampleNow});
 failureCases.forEach(function(test){
  var forecast={basis:'adaptive',verdict:'safe',typicalConsumption:270*gib,highConsumption:300*gib,
   crossingDays:29,horizonDays:28,text:'At reset: ~50G left · estimate only'};
  var p=maoMaoYunTrafficPresentation(test.snapshot,test.state,test.now,null,forecast);
  var summary=trafficForecastSummary(test.snapshot,p,forecast);
  var start=text.length,valueStart=values.length,barStart=bars.length,rightStart=rightText.length;
  capture=true;drawMetricDashboard({kind:'traffic',title:'Traffic',resetDays:test.snapshot?test.snapshot.resetDays:null,
   hasValue:p.hasValue,stale:p.stale,value:test.snapshot?test.snapshot.remainingLabel:p.value,
   valueColor:p.hasValue&&!p.stale?cardColors().body:cardColors().muted,fraction:p.fraction,
   detail:p.todayUsage,footer:p.detail,summary:summary},180,0);capture=false;
  failureSlices.push({locale:locale,state:test.state,hasValue:p.hasValue,stale:p.stale,fraction:p.fraction,
   rows:text.slice(start),values:values.slice(valueStart),bars:bars.slice(barStart),right:rightText.slice(rightStart),
   headline:summary.headline});
 });
});
img.unlockFocus;
var unitLocalization={standalone:uiText('pp'),word:uiText('app'),composed:uiText('Actual daily use: 30.2 pp')};
var measuredCases=[dashboardTrafficInline({detail:'Used today: 0G'},'',150),dashboardTrafficInline({detail:''},'',150)]
 .map(function(row){return {value:row.value,pending:row.pending};});
JSON.stringify({rowHeight:rowHeight,metricHeight:metricHeight,single:single,controls:controls,double:double,restored:restored,leftHit:leftHit,rightHit:rightHit,owned:!!owned,
 parentEnabled:parentEnabled,allDates:allDates,quotaAX:quotaAX,
 loginPress:!!loginPress,readyPress:!!readyPress,signIns:signIns,text:text,values:values,unitFits:unitFits,measuredCases:measuredCases,unitLocalization:unitLocalization,slices:slices,failureSlices:failureSlices});
`;
let out;
try {out=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+fixture],{encoding:'utf8',timeout:15000}));}
catch(error){throw new Error(String(error.stderr||error.code||'Native compact metric test failed').trim());}
assert.equal(out.single.parent.w,288);assert.equal(out.single.parent.h,out.rowHeight+64+46);
assert.equal(out.metricHeight,84,'only the narrow fallback reserves a compact today line');
assert.deepEqual(out.controls,{status:{x:226,y:142,w:62,h:32},app:{x:8,y:146,w:128,h:24}},
 'compact VPN controls are lifted 2pt with separate native hit targets; data and parent height stay fixed');
assert.deepEqual(out.single.quota,{x:0,y:0,w:288,h:out.rowHeight});
assert.deepEqual(out.single.traffic,{x:0,y:72,w:288,h:64});
assert(out.leftHit&&out.rightHit&&out.owned,'independent native children keep their hit regions');
assert(out.parentEnabled,'login child must not inherit a disabled menu item');
assert(out.quotaAX.includes(out.allDates),'all reset dates remain accessible without a hover popup');
assert(!/Budget|预算/.test(out.quotaAX),'removed daily budget must not persist in accessibility');
assert(out.loginPress&&!out.readyPress&&out.signIns===1,'only expired traffic can request login');
assert.equal(out.double.parent.w,288);assert.equal(out.double.parent.h,out.rowHeight*2+64+54);
assert.equal(out.double.traffic.y,out.double.quota.y+out.double.quota.h+8,'VPN remains above every Codex window');
assert.deepEqual(out.restored,out.single.parent,'removing Session removes its height');
assert(out.text.every(r=>r.x>=12&&r.x+r.w<=168.1&&r.y>=0&&r.y+r.h<=out.metricHeight&&r.measured<=r.w+.5),
 'compact bilingual text must fit: '+JSON.stringify(out.text.filter(r=>r.measured>r.w+.5)));
assert(out.values.every(r=>r.measured<=r.w+.1&&r.y>=0&&r.y+r.h<=out.metricHeight),'balances and estimates fit: '+JSON.stringify(out.values.filter(r=>r.measured>r.w+.1||r.y<0||r.y+r.h>out.metricHeight)));
assert.equal(out.unitFits.length,10,'both locales exercise the production attributed-value renderer');
assert(out.unitFits.every(r=>r.result.width<=r.width+.1),'the actual number/unit renderer fits long values as one measured line');
assert.deepEqual(out.measuredCases,[{value:'0G',pending:false},{value:'Pending',pending:true}],
 'unknown today readings stay pending, never fabricated zero');
assert.deepEqual(out.unitLocalization,{standalone:'个百分点',word:'app',composed:'日均消耗：30.2 个百分点'},
 'standalone units must not corrupt existing translations or app names');
assert(out.text.some(r=>r.t==='Est. empty 10d early')&&out.text.some(r=>r.t==='Est. empty <1d early'),
 'native bilingual draw paths include day counts and the sub-day boundary');
for(const s of out.failureSlices){
 assert.equal(s.bars.length,1,'every failure/loading/login state retains exactly one progress track');
 const bar=s.bars[0];assert.deepEqual({x:bar.x,y:bar.y,w:bar.w,h:bar.h},{x:14,y:30,w:152,h:5});
 assert.equal(bar.fraction,s.hasValue?s.fraction:0,'unknown is empty; stale keeps the actual last fraction');
 assert.equal(bar.muted,s.stale,'stale progress cannot keep a fresh warning/normal color');
 assert(!s.rows.some(r=>r.y>=27&&r.y<35),'error text never replaces or overlaps the progress track');
 if(s.stale||!s.hasValue){
  const marker=s.right.find(r=>r.y===42);
  assert(marker,'old or missing balances have a visible marker');
  assert.equal(marker.t,s.locale==='zh-CN'?(s.hasValue?'上次读数':'暂无数据'):(s.hasValue?'Last known':'No data'));
  assert(marker.w<=49,'status fits the existing countdown space without changing geometry');
  assert.equal(s.values[1].t,s.hasValue?'Pending':'—','stale or missing today readings never become zero');
  assert.equal(s.headline,'Prediction paused');
 }else assert(!s.right.some(r=>/上次读数|暂无数据|Last known|No data/.test(r.t)),
  'successful recovery clears the last-read marker');
 if(s.locale==='zh-CN')for(const text of [...s.rows.map(r=>r.localized),...s.values.map(r=>r.localized),...s.right.map(r=>r.t)])
  assert(!/[A-Za-z]{2,}/.test(text.replace(/VPN|Codex|[BKMGT]/g,'')),`Untranslated rendered failure field: ${text}`);
}
for(const s of out.slices){
 assert.equal(s.bars.length,1,'both quota and traffic keep their progress track when stale');
 assert.equal(s.bars[0].fraction,.6);assert.equal(s.bars[0].muted,s.stale);
 assert.equal(s.right.some(r=>r.t===(s.locale==='zh-CN'?'上次读数':'Last known')),s.stale,
  'both columns mark old values and clear the marker on recovery');
 assert(!s.rows.some(r=>/^Budget|每日预算/.test(r.t)),'daily budget must not be rendered');
 const title=s.rows.find(r=>r.t.startsWith('Codex')||r.t==='Traffic');assert(title);
 assert.equal(title.x,14,'icon-free header aligns with the balance and progress bar');
 assert(title.muted,'both headers use the supporting light-gray color');
 if(s.kind!=='Traffic'){
  assert.equal(s.values.length,1,'quota retains only its balance');
  assert(!s.rows.some(r=>['Daily avg.','Hourly use','Est. reserve','Resets','Forecast'].includes(r.t)),'all quota statistic captions removed');
  assert(!s.rows.some(r=>r.t.includes('10/20 13:09')),'exact reset timestamp stays removed');
  assert.equal(s.bars[0].y,10,'narrow quota also gives back the removed 36pt');
  assert(64-title.y-title.h>=3&&64-title.y-title.h<=4,'compact quota top inset stays consistent');
  continue;
 }
 const use=s.rows.find(r=>r.t==='Today'),useValue=s.values[1],main=s.values[0];
 assert.equal(s.values.length,2,'no predicted remaining amount');
 assert(use&&use.x===14&&Math.abs(use.baseline-12)<.01,'narrow fallback keeps a single today caption');
 assert.equal(useValue.x+useValue.w,166,'today number aligns to the trailing content edge');
 assert(Math.abs(use.baseline-useValue.baseline)<.01,'today caption and amount share a baseline');
 assert(main.h>useValue.h&&main.y+main.h<=title.y,'balance remains primary and below the header');
 assert(!s.rows.some(r=>['Est. reserve','Forecast','Used'].includes(r.t)),'old forecast cells and duplicate use removed');
 const badge=s.rows.find(r=>r!==title&&Math.abs(r.baseline-title.baseline+.5)<.01);
 assert(badge,'forecast reminder belongs beside the title, never below the progress bar');
 assert(use.y+use.h<=s.bars[0].y-4&&useValue.y+useValue.h<=s.bars[0].y-4,'narrow today line clears the progress bar');
 assert(out.metricHeight-title.y-title.h>=3&&out.metricHeight-title.y-title.h<=4,'compact consistent top inset');
 const lowest=Math.min(...s.rows.filter(r=>r.y<30).map(r=>r.y),...s.values.map(r=>r.y));
 assert(lowest>=0&&lowest<=14,'no empty date row below the statistics; two-line outcomes remain inside the view');
 const footer=s.rows.filter(r=>r.y<30);
 for(const row of footer)for(const other of footer){
  if(row===other||Math.abs(row.y-other.y)<.01)continue;
  assert(row.y+row.h<=other.y||other.y+other.h<=row.y,'footer lines cannot overlap');
 }
}
console.log('Compact metrics passed: equal slim metric rows, independent login/hits, shared header alerts, narrow today fallback, no forecast amount, bilingual stale/zero states and Session add/remove.');
