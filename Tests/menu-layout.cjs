const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {readLibrarySource}=require('./sources.cjs');
// Real native views, rendered offscreen. No menu opening, credentials, VPN,
// preferences or task actions. Preview output is optional and synthetic.
const previewRoot=process.argv.includes('--preview')?fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-stacked-')):null;
const fixture=`
delegate=$.NSObject.alloc.init;statusItem={};buildMenu();
var now=Date.now(),unit=Math.pow(1024,3),mode='ready',row=null,records=[],previews=[];
maomaoyunStatus='connected';updateMaoMaoYunMenuItem();
availableCredits=2;resetCreditExpirations=[now/1000+14*86400,now/1000+21*86400];
currentMaoMaoYunForecast=function(){var risk=mode==='risk'||mode==='boundary'||/^coarse/.test(mode)||mode==='noTiming';
 return mode==='unknown'||mode==='noReset'?{status:'unknown',reason:'Need 3 reported days'}:
 {basis:'adaptive',evidence:mode==='cycle'?'limited':'supported',precision:mode==='risk'||mode==='boundary'?'day':'qualitative',
 verdict:risk?'risk':mode==='tight'?'tight':'safe',recentChange:mode==='rising'?'up':null,
 typicalConsumption:(risk?400:235.44)*unit,highConsumption:450*unit,
 crossingDays:mode==='boundary'||mode==='coarseSubday'?27.5:/^coarse/.test(mode)?23:mode==='risk'?18:29,
 crossingRange:mode==='coarseRange'?[21,25]:[12,29],horizonDays:28,
 text:'At reset: ~'+(risk?'0':'140')+'G left · estimate only'};};
currentQuotaForecasts=function(){return quotaWindows.map(function(w){
 if(mode==='stale'||mode==='unknown')return {status:'unknown',reason:'Quota unavailable'};
 if(mode==='exhausted')return {status:'exhausted'};
 if(w.durationMins===300)return {basis:'recent',projectedRemaining:-2,horizon:1800,status:'risk',text:'If pace holds: empty within 30m'};
 if(/^quota/.test(mode)){
  var h=(w.resetAt-now/1000)/86400;
  return {basis:'adaptive',evidence:mode==='quotaLimited'?'limited':'supported',verdict:'risk',
   at:now/1000-(mode==='quotaOld'?181:0),resetAt:w.resetAt+(mode==='quotaChanged'?86400:0),horizonDays:h,
   crossingDays:h-(mode==='quotaSubday'?.5:2),crossingRange:mode==='quotaRange'?[h-4,h-1]:[h-3,h+1],
   typicalConsumption:90,text:'~0% at reset'};
 }
 return {basis:'adaptive',evidence:mode==='cycle'?'limited':'supported',verdict:mode==='risk'?'risk':mode==='tight'?'tight':'safe',text:'~'+(mode==='risk'?'0':'15–30')+'% at reset'};
});};
observedQuotaUseLabel=function(w){return w.durationMins===300?'Actual hourly use: 2 pp':'Actual daily use: 24.2 pp';};
function rect(v){var f=v.frame;return {x:Number(f.origin.x),y:Number(f.origin.y),w:Number(f.size.width),h:Number(f.size.height)};}
var savedText=drawCardText,savedValue=drawDashboardValue,savedBar=drawRoundedBar,savedIcon=drawMeterStatusIcon,savedRing=drawDashboardRing;
drawDashboardRing=function(x,y,size,fraction,color,hasValue,stale){var result=savedRing(x,y,size,fraction,color,hasValue,stale);
 if(row)row.rings.push(result);return result;};
drawMeterStatusIcon=function(name,x,y,size,color,tone){var painted=savedIcon(name,x,y,size,color,tone);
 if(row)row.icons.push({name:name,x:x,y:y,size:size,tone:tone,painted:painted,accent:!!color.isEqual(activeAccentColor(1))});return painted;};
drawCardText=function(t,x,y,w,size,color,bold){if(row){row.text.push({t:t,localized:uiText(t),x:x,y:y,w:w,h:size+4,size:size,
 measured:Number($(uiText(t)).sizeWithAttributes(cardAttributes(size,color,bold)).width),muted:!!color.isEqual(cardColors().muted),accent:!!color.isEqual(activeAccentColor(1)),
 baseline:y+size+4-Number(cardFont(size,bold).ascender)});
 var icon=row.icons[row.icons.length-1];
 if(size===12&&icon&&Math.abs(icon.x+icon.size+6-x)<.01){icon.textY=y;icon.expectedY=meterStatusIconY(icon.name,t,y,size,bold,icon.size);}
 }savedText(t,x,y,w,size,color,bold);};
drawDashboardValue=function(t,x,y,w,size,color,align){var r=savedValue(t,x,y,w,size,color,align);
 if(row)row.values.push({t:t,localized:uiText(t),x:r.x,y:r.y,w:r.drawWidth,h:size+5,size:r.size,measured:r.width,
 baseline:r.y+size+5-Number(statusQuotaFont(r.size).ascender)});return r;};
drawRoundedBar=function(x,y,w,h,f,color){if(row)row.bars.push({x:x,y:y,w:w,h:h,fraction:f,muted:!!(color&&color.isEqual(cardColors().muted))});
 savedBar(x,y,w,h,f,color);};
['zh-CN','en'].forEach(function(locale){uiLanguage=locale;
 ['ready','risk','boundary','coarse','coarseRange','coarseSubday','noTiming','cycle','rising','tight','unknown','stale','login','exhausted','session','pending','todayZero','noReset','long',
  'quotaEarly','quotaRange','quotaSubday','quotaLimited','quotaOld','quotaChanged','quotaCritical'].forEach(function(next){mode=next;
  var remaining=mode==='exhausted'?0:mode==='unknown'?null:mode==='quotaCritical'?3:68;
  quotaWindows=[{label:'Weekly',durationMins:10080,remaining:remaining,resetAt:now/1000+5*86400+2*3600}];
  if(mode==='session')quotaWindows.unshift({label:'Session',durationMins:300,remaining:80,resetAt:now/1000+3*3600});
  usageSyncState=mode==='stale'||mode==='unknown'?'error':'ready';
  maomaoyunTrafficSnapshot=mode==='login'||mode==='unknown'?null:normalizeMaoMaoYunTraffic({accountKey:'a'.repeat(64),
   credentialRevision:'b'.repeat(64),reportedAt:now,resetDays:mode==='noReset'?0:28,totalBytes:mode==='long'?8000000000000000:400*unit,
   usedBytes:mode==='long'?1000000000:mode==='exhausted'?400*unit:Math.round(24.26*unit),remainingBytes:mode==='long'?7999999000000000:mode==='exhausted'?0:400*unit-Math.round(24.26*unit),
   todayState:mode==='pending'?'pending':'reported',todayUsedBytes:mode==='pending'?null:mode==='todayZero'?0:mode==='long'?3000000000000000:Math.round(3.54*unit),todayStartAt:new Date(new Date(now).getFullYear(),new Date(now).getMonth(),new Date(now).getDate()).getTime()/1000,
   todayReportedAt:now},now);
  maomaoyunTrafficSourceState=mode==='login'?'authRequired':mode==='stale'||mode==='unknown'?'error':'ready';
  redrawUsageCardIfNeeded(true);updateMaoMaoYunTrafficMenuItem();
  var sample={locale:locale,mode:mode,width:MENU_WIDTH,parent:rect(metricsPairView),quota:rect(usageCardView),vpn:rect(maomaoyunTrafficView),
   strip:rect(maomaoyunView),app:rect(vpnAppButton),rows:[]};
  sample.quotaHit=!!metricsPairView.hitTest($.NSMakePoint(20,sample.quota.h/2)).isEqual(usageCardView);
  sample.vpnHit=!!metricsPairView.hitTest($.NSMakePoint(20,sample.vpn.y+sample.vpn.h/2)).isEqual(maomaoyunTrafficView);
  var height=sample.parent.h,image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH*2,height*2));image.lockFocus;
  var scale=$.NSAffineTransform.transform;scale.scaleXByYBy(2,2);scale.concat;
  $.NSColor.colorWithCalibratedWhiteAlpha(.15,1).setFill;
  $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(0,0,MENU_WIDTH,height),12,12).fill;
  metricsPairView.drawRect(metricsPairView.bounds);
  [maomaoyunTrafficView,usageCardView,maomaoyunView,vpnAppButton].forEach(function(view){
   $.NSGraphicsContext.saveGraphicsState;var transform=$.NSAffineTransform.transform;
   transform.translateXByYBy(view.frame.origin.x,view.frame.origin.y);transform.concat;
   if(view.isEqual(maomaoyunTrafficView)||view.isEqual(usageCardView)){
    row={kind:view.isEqual(maomaoyunTrafficView)?'vpn':'quota',height:Number(view.frame.size.height),text:[],values:[],bars:[],rings:[],icons:[]};sample.rows.push(row);
   }
   view.drawRect(view.bounds);row=null;$.NSGraphicsContext.restoreGraphicsState;
  });image.unlockFocus;
  var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),pixelScale=Number(rep.pixelsWide)/MENU_WIDTH;
  function red(x,y){return Number(rep.colorAtXY(Math.floor(x*pixelScale),Math.max(0,Math.floor((height-y)*pixelScale)-1))
   .colorUsingColorSpace($.NSColorSpace.genericRGBColorSpace).redComponent);}
  sample.separatorVisible=Math.max(red(MENU_WIDTH/2,sample.quota.h+4),red(MENU_WIDTH/2,sample.quota.h+4.25))-red(MENU_WIDTH/2,sample.quota.h+6)>.01;
  var vpnTop=sample.vpn.y+sample.vpn.h;
  sample.headerSeparatorVisible=Math.max(red(MENU_WIDTH/2,vpnTop+2),red(MENU_WIDTH/2,vpnTop+2.25))-red(MENU_WIDTH/2,vpnTop+3)>.01;
  sample.transparent=[sample.quota,sample.vpn].every(function(frame){return Math.abs(red(8,frame.y+48)-red(3,frame.y+48))<.005;});
  // Probe the empty gap between the title and balance; a longer localized
  // status may legitimately cross the old header-row probe at the midpoint.
  sample.noVerticalTail=[sample.quota,sample.vpn].every(function(frame){return Math.abs(red(MENU_WIDTH/2,frame.y+45)-red(MENU_WIDTH/2+2,frame.y+45))<.005;});
  ${previewRoot?`
  if(['ready','risk','coarse','coarseRange','coarseSubday','cycle','stale','login','session','quotaEarly','quotaRange','quotaSubday','quotaLimited'].indexOf(mode)!==-1){
   var filename=${JSON.stringify(previewRoot)}+'/'+locale+'-'+mode+'.png';
   rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(filename,true);previews.push(filename);
  }`:''}
  records.push(sample);
 });
});
JSON.stringify({records:records,previews:previews});
`;
const out=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+fixture],
 {encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024}));
for(const s of out.records){
 assert.equal(s.width,288);assert.equal(s.parent.w,288);
 assert.equal(s.quota.w,288);assert.equal(s.vpn.w,288);assert.equal(s.vpn.h,64);
 assert.equal(s.quota.h,s.mode==='session'?136:64);
 assert.equal(s.vpn.y,s.quota.h+8,'VPN is above all quota windows with a compact 8pt group rhythm');
 assert.equal(s.strip.y,s.vpn.y+s.vpn.h+6,'the entire top control group is lifted 2pt');
 assert.equal(s.parent.h,s.vpn.y+s.vpn.h+38,'the native panel height does not grow or shrink');
 assert.equal(s.app.y,s.strip.y+4);assert.equal(s.app.w,128);assert.equal(s.app.h,24);
 assert.equal(s.app.x,8);assert.equal(s.strip.w,62);
 assert(s.app.x+s.app.w<s.strip.x,'client name and switch have independent regions');
 assert.equal(s.strip.x+s.strip.w-16,s.width-16,'the switch shares the trailing content edge');
 assert(s.quotaHit&&s.vpnHit,'independent data rows keep their own native hit and login regions');
 assert(s.separatorVisible,'a horizontal divider separates VPN from Codex');
 assert(s.headerSeparatorVisible,'the matching divider separates MaoMaoYun from VPN inside the existing 4pt gap');
 assert(s.transparent&&s.noVerticalTail,'no dark metric cards or old central divider remain');
 for(const r of s.rows){
  assert(r.text.every(t=>t.x>=16&&t.x+t.w<=272.1&&t.y>=0&&t.y+t.h<=r.height&&t.measured<=t.w+.1),
   'rendered text fits: '+JSON.stringify({mode:s.mode,locale:s.locale,bad:r.text.filter(t=>t.measured>t.w+.1||t.y<0||t.y+t.h>r.height)}));
  assert(r.values.every(v=>v.measured<=v.w+.1&&v.y>=0&&v.y+v.h<=r.height),'all actual and predicted values fit');
  const titles=r.text.filter(t=>t.t==='VPN Traffic'||t.t.startsWith('Codex '));
  assert.equal(titles.length,r.kind==='quota'&&s.mode==='session'?2:1);
  assert(titles.every(t=>t.size===12&&t.muted),'quiet readable titles preserve the light-gray palette');
  for(let i=0;i<titles.length;i++){
   const title=titles[i],main=r.values[i];
   assert.equal(title.x,16);assert.equal(title.w,200);assert(title.w>=title.measured,'the heading clears the right ring');
   assert.equal(main.x,16,'the balance starts the second line at the leading inset');
   assert(main.y+main.h<=title.y,'title and balance occupy separate lines without overlapping');
   const offset=title.baseline-50;
   const headerStatus=r.text.find(t=>t!==title&&t.x===34&&Math.abs(t.baseline-(offset+5))<.01);
   assert(headerStatus&&headerStatus.size===title.size,'VPN and Codex statuses share the 12pt lower line');
   assert.equal(headerStatus.x,34,'state labels follow the same 12pt symbol and 6pt gap');
   if(headerStatus.t==='Reserve at reset'||headerStatus.t==='On pace'){
    assert(headerStatus.accent,'VPN reserve and Codex normal labels share the green accent');
    assert(r.icons.some(icon=>Math.abs(icon.textY-headerStatus.y)<.01&&icon.accent&&icon.name==='checkmark.circle.fill'),
     'VPN and Codex use the same green filled-circle checkmark');
   }
   assert(r.icons.some(icon=>icon.size===title.size&&icon.x===16&&
    Math.abs(icon.textY-headerStatus.y)<.01&&Math.abs(icon.y-icon.expectedY)<.01),
    'status symbol keeps its title-sized, glyph-centered alignment');
   assert(Math.abs(main.baseline-(24+offset))<.01,'even fitted/missing balances retain the compact balance baseline');
   assert(Math.abs(main.baseline-headerStatus.baseline-19)<.01,'the removed metadata line leaves only 19pt between balance and status');
   const ring=r.rings[i];
   assert.deepEqual({x:ring.x,y:ring.y-offset,size:ring.size},{x:232,y:20,size:40});
   assert(main.x+main.w<=ring.x-16,'the amount cannot enter the ring');
   const deadline=r.text.find(t=>t!==title&&t!==headerStatus&&Math.abs(t.baseline-(5+offset))<.01);
   const missing=s.mode==='unknown'||(r.kind==='vpn'&&s.mode==='login');
   if(s.mode!=='stale'&&!missing&&!(r.kind==='vpn'&&s.mode==='noReset')){
    assert(deadline,'reset time occupies the bottom-right line');
    assert(Math.abs(deadline.x+deadline.w-272)<.01,'reset time ends at the common right inset');
    assert(headerStatus.x+headerStatus.w+12<=deadline.x+.01,'status layout reserves a 12pt gap before the deadline');
    assert(headerStatus.x+headerStatus.measured<=deadline.x-12+.1,'actual localized status and deadline cannot overlap');
   }
  }
  assert.equal(r.bars.length,0,'C layout replaces main bars rather than duplicating them beside rings');
  assert.equal(r.rings.length,titles.length,'one remaining-capacity ring per actual window');
  assert(!r.text.some(t=>t.t==='Time remaining'),'deleted cycle-time label must not return');
  if(s.mode==='stale'){
   assert(r.text.some(t=>t.localized===(s.locale==='zh-CN'?'上次读数':'Last known')));
   assert(r.rings.every(b=>b.stale&&b.fraction!==null),'failed reads preserve last-known capacity in muted rings');
  }else if(s.mode!=='unknown'&&!(r.kind==='vpn'&&s.mode==='login'))
   assert(!r.text.some(t=>t.t==='Last known'||t.t==='上次读数'),'fresh recovery removes the old-data marker');
  if(s.locale==='zh-CN')for(const t of [...r.text,...r.values])
   assert(!/[A-Za-z]{2,}/.test(t.localized.replace(/Codex|VPN|[BKMGT]/g,'')),`Untranslated: ${t.localized}`);
  assert(!r.text.some(t=>/Budget|Current remaining|^10\//.test(t.t)),'no deleted budget, duplicate label or exact dates return');
  if(r.kind==='quota'){
   assert.equal(r.values.length,titles.length,'only the actual balance remains for each Codex window');
   assert(!r.text.some(t=>['Est. reserve','Resets','Daily avg.','Hourly use','Forecast'].includes(t.t)),'quota statistics captions removed');
   if(s.mode==='session')assert(r.text.some(t=>t.t==='Codex Session'),'Session appears in addition to Weekly');
   if(s.mode==='session')assert(r.text.some(t=>t.t==='Near-term depletion'),'short-term risk cannot promise a full Session cycle');
   if(s.mode==='risk')assert(r.text.some(t=>t.t==='May run out'),'a supported prediction overrides apparently normal cycle pace');
   assert(!r.text.some(t=>/d early$|提前约/.test(t.t)||/提前约/.test(t.localized)),'quota reminders never display depletion days; real reset countdowns remain');
   if(['quotaEarly','quotaRange','quotaSubday','quotaOld','quotaChanged'].includes(s.mode))
    assert(r.text.some(t=>t.t==='May run out'),'supported quota risk stays qualitative regardless of path timing');
   if(s.mode==='quotaLimited')assert(r.text.some(t=>t.t==='Cycle on pace'&&t.muted),'limited quota paths restore the explicit neutral cycle reminder');
   if(s.mode==='quotaCritical')assert(r.text.some(t=>t.t==='Quota low')&&r.icons.some(i=>i.tone==='critical'),'real low quota overrides forecast timing');
   if(s.mode==='cycle')assert(r.text.some(t=>t.t==='Cycle on pace'&&t.muted&&t.localized===(s.locale==='zh-CN'?'进度正常':'Cycle on pace')),'neutral pace reminder keeps its source but drops the Chinese cycle prefix');
  }else{
   assert(!r.text.some(t=>t.t==='Today'),'today consumption belongs only in the expanded activity chart');
   assert(!r.text.some(t=>t.t==='Est. reserve'||t.t==='Forecast'),'old forecast cells and labels deleted');
   assert.equal(r.values.length,1,'only current balance remains in the main VPN panel');
   if(s.mode==='risk')assert(r.text.some(t=>t.t==='Est. empty 10d early'),'ten days BEFORE reset, not ten days from now');
   if(s.mode==='boundary')assert(r.text.some(t=>t.t==='Est. empty <1d early'));
   if(s.mode==='coarse')assert(r.text.some(t=>t.t==='May run out ~5d early')&&!r.text.some(t=>/^Est\. empty/.test(t.t)),'existing timing remains an explicitly possible approximation');
   if(s.mode==='coarseRange')assert(r.text.some(t=>t.t==='May run out 3–7d early'),'wide early-crossing scenarios use an outward-rounded range');
   if(s.mode==='coarseSubday')assert(r.text.some(t=>t.t==='May run out ~<1d early'),'sub-day rough timing cannot round to zero days');
   if(s.mode==='noTiming')assert(r.text.some(t=>t.t==='Possible depletion'),'no crossing time still means no invented days');
   if(s.mode==='cycle')assert(r.text.some(t=>t.t==='Forecast observing'&&t.muted),'limited VPN evidence remains neutral');
   if(s.mode==='rising')assert(r.text.some(t=>t.t==='Recent use rising'),'sustained recent change has an explicit warning');
   if(s.mode==='risk'||s.mode==='boundary')assert(r.icons.some(i=>i.name==='exclamationmark.triangle.fill'&&i.size===12&&i.tone==='warning'&&i.painted),'native amber alert matches the title size');
   if(s.mode==='stale')assert(r.icons.some(i=>i.name==='clock'&&i.tone==='muted'),'old data never shows a fresh prediction badge');
   if(s.mode==='noReset')assert(r.text.some(t=>t.t==='Reset unknown'),'unknown reset does not gain a deadline or at-reset claim');
   if(s.mode==='login'||s.mode==='unknown')assert(r.rings.every(b=>b.fraction===null),'missing data is an empty track, not a fabricated zero balance');
  }
  if(s.mode==='tight')assert(r.text.some(t=>t.t==='May be tight'),'both sources share the same qualitative tight warning');
 }
}
console.log('C dashboard passed: compact 64pt rows, no today/metadata row, matching dividers, native rings, bottom-right reset times and optional Session.');
if(out.previews.length)console.log('Previews:',JSON.stringify(out.previews));
