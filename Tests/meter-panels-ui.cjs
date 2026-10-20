const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {readLibrarySource,readSource}=require('./sources.cjs');
const now=Math.floor(Date.now()/1000),date=new Date(),today=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
const snapshot={version:3,source:'profile',accountId:'fixture-meter',savedAt:now,
 days:Array.from({length:30},(_,i)=>({date:new Date(today-(29-i)*86400000).toISOString().slice(0,10),tokens:[0,125000000,240000000,163000000,450000000,137000000,22000000][i%7]}))};
const preview=process.argv.includes('--preview')?fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-week-preview-')):null;
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
const fixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
var defaultFolded=!tokenMeterExpanded&&!!tokenMeterItem.hidden&&tokenMeterReveal===0;
usageAccountId='fixture-meter';usageSyncState='ready';maomaoyunStatus='connected';
var unit=Math.pow(1024,3),midnight=new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()).getTime()/1000;
maomaoyunTrafficSnapshot=normalizeMaoMaoYunTraffic({accountKey:'a'.repeat(64),credentialRevision:'b'.repeat(64),
 reportedAt:${now}*1000,resetDays:28,totalBytes:400*unit,usedBytes:Math.round(24.26*unit),remainingBytes:400*unit-Math.round(24.26*unit),
 todayState:'reported',todayUsedBytes:Math.round(9.49*unit),todayStartAt:midnight,todayReportedAt:${now}*1000},${now}*1000);
maomaoyunTrafficSourceState='ready';updateMaoMaoYunMenuItem();updateMaoMaoYunTrafficMenuItem();
maomaoyunHistorySnapshot={accountKey:'a'.repeat(64),credentialRevision:'b'.repeat(64),state:'ready',fetchedAt:${now}*1000,
 calendarBasis:'local-midnight',calendarState:'ready',days:[],calendarDays:[]};
for(var day=6;day>=0;day--){
 if(day===3)continue;
 var currentDate=new Date(),start=new Date(currentDate.getFullYear(),currentDate.getMonth(),currentDate.getDate()-day).getTime()/1000;
 maomaoyunHistorySnapshot.calendarDays.push([start,day===5?0:Math.round((day+2.25)*unit)]);
}
maomaoyunTrafficSnapshot.calendarBasis='local-midnight';maomaoyunTrafficSnapshot.calendarState='ready';
maomaoyunTrafficSnapshot.calendarReportedAt=${now}*1000;
maomaoyunTrafficSnapshot.calendarDays=maomaoyunHistorySnapshot.calendarDays;
currentMaoMaoYunForecast=function(){return {basis:'adaptive',evidence:'supported',precision:'qualitative',verdict:'safe',typicalConsumption:235.44*unit,
 highConsumption:250*unit,horizonDays:28,text:'At reset: ~140G left · estimate only'};};
quotaWindows=[{label:'Weekly',durationMins:10080,remaining:18,resetAt:${now}+4.4*86400}];
availableCredits=2;resetCreditExpirations=[${now}+2*86400,${now}+13*86400];
resetCreditCards=observeResetCards([{expiresAt:resetCreditExpirations[0],grantedAt:${now}-28*86400},
 {expiresAt:resetCreditExpirations[1],grantedAt:${now}-17*86400}],[],[],${now},2);
var ordinaryResetCards=resetCreditCards,nextYear=new Date().getFullYear()+1;
var yearResetCards=observeResetCards([{expiresAt:new Date(nextYear,0,11).getTime()/1000,grantedAt:${now}-28*86400},
 {expiresAt:new Date(nextYear,10,30).getTime()/1000,grantedAt:${now}-17*86400}],[],[],${now},2);
var source=${JSON.stringify(snapshot)};tokenMeterSnapshot=normalizeTokenMeter(source,usageAccountId,${now});tokenMeterSync='ready';
// The collapsed README preview uses an explicitly safe demo at full balance;
// other fixture states retain the risk case. Neither reads real account data.
currentQuotaForecasts=function(){var safe=quotaWindows[0].remaining===100;
 return [{basis:'adaptive',evidence:'supported',verdict:safe?'safe':'risk',
  pointRemaining:safe?80:0,typicalConsumption:safe?20:200,highConsumption:safe?30:250,
  text:safe?'~80% at reset':'~0% at reset'}];};
observedQuotaUseLabel=function(){return 'Actual daily use: 22 pp';};
refreshAllSources=function(){throw Error('No readers during rendering');};
var failures=[];logError=function(component,error){failures.push(component+': '+String(error));};
var records=[],files=[],current=null,paintX=0,paintY=0,oldText=drawCardText,oldRight=drawCardTextRight,oldDate=drawResetCardDate,oldValue=drawDashboardValue,oldIcon=drawMeterStatusIcon,oldBar=drawRoundedBar,oldActivity=drawUsageActivity;
function record(t,x,y,w,size,bold){if(current)current.text.push({t:uiText(t),x:x+paintX,y:y+paintY,w:w,h:size+4,
 measured:Number($(uiText(t)).sizeWithAttributes(cardAttributes(size,cardColors().body,bold)).width)});}
drawCardText=function(t,x,y,w,size,color,bold){record(t,x,y,w,size,bold);oldText(t,x,y,w,size,color,bold);};
drawCardTextRight=function(t,edge,y,size,color,bold){
 var width=Number($(uiText(t)).sizeWithAttributes(cardAttributes(size,color,bold)).width);
 record(t,edge-width,y,width,size,bold);oldRight(t,edge,y,size,color,bold);
};
drawResetCardDate=function(t,x,centerY,w,color){var ink=oldDate(t,x,centerY,w,color);
 if(current)current.text.push({t:t,x:ink.x+paintX,y:ink.y+paintY,w:ink.w,h:ink.h,measured:ink.w,
  font:ObjC.unwrap(resetCardDateFont().fontName),size:Number(resetCardDateFont().pointSize)});return ink;
};
drawDashboardValue=function(t,x,y,w,size,color,align){var v=oldValue(t,x,y,w,size,color,align);
 if(current)current.values.push({t:uiText(t),x:v.x+paintX,y:v.y+paintY,w:v.drawWidth,h:size+5,measured:v.width});return v;};
drawMeterStatusIcon=function(name,x,y,size,color,tone){var painted=oldIcon(name,x,y,size,color,tone);
 if(current)current.icons.push({name:name,x:x+paintX,y:y+paintY,size:size,painted:painted});return painted;};
drawRoundedBar=function(x,y,w,h,fraction,color){
 if(current)current.bars.push({x:x+paintX,y:y+paintY,w:w,h:h,fraction:fraction,switchBlue:!!color.isEqual(cardColors().blue)});
 oldBar(x,y,w,h,fraction,color);
};
drawUsageActivity=function(model,reveal,hover){
 if(current){current.columns=usageActivityColumns(model,MENU_WIDTH);current.segments=usageActivityLineSegments(current.columns.cells,reveal);}
 oldActivity(model,reveal,hover);
};
function paintTree(view){
 if(view.hidden)return;
 view.drawRect(view.bounds);var children=view.subviews;
 for(var i=0;i<children.count;i++){
  var child=children.objectAtIndex(i);$.NSGraphicsContext.saveGraphicsState;
  var transform=$.NSAffineTransform.transform;transform.translateXByYBy(child.frame.origin.x,child.frame.origin.y);transform.concat;
  var previousX=paintX,previousY=paintY;paintX+=Number(child.frame.origin.x);paintY+=Number(child.frame.origin.y);
  paintTree(child);$.NSGraphicsContext.restoreGraphicsState;
  paintX=previousX;paintY=previousY;
 }
}
function render(locale,state){
 uiLanguage=locale;tokenMeterSnapshot=(state==='missing'||state==='auth'||state==='allMissing')?null:JSON.parse(JSON.stringify(source));
 resetCreditCards=state==='year'?yearResetCards:ordinaryResetCards;
 if(state==='zero')tokenMeterSnapshot.days.forEach(function(day){day.tokens=0;});
 if(state==='large')tokenMeterSnapshot.days.forEach(function(day,index){day.tokens=[0,9999,10000,99995000,100000000,1000000000000,100000000000000][index%7];});
 quotaWindows[0].remaining=state==='overview'?100:state==='normal'?85:state==='critical'?3:state==='exhausted'?0:state==='missing'?null:18;
 quotaWindows[0].resetAt=state==='resetting'?${now}-1:state==='unknown'?null:${now}+4.4*86400;
 usageSyncState=state==='stale'?'error':'ready';
 maomaoyunTrafficSourceState=state==='stale'?'error':state==='vpnMissing'||state==='allMissing'?'authRequired':'ready';
 tokenMeterSync=state==='stale'?'error':state==='missing'?'loading':state==='auth'?'authRequired':state==='limited'?'rateLimited':'ready';
 localizedMenuItems.forEach(function(entry){entry.item.title=uiText(entry.source);if(entry.item.view)entry.item.view.title=uiText(entry.source);});
 redrawUsageCardIfNeeded(true);refreshTokenMeterMenu(true);setTokenMeterExpanded(state!=='overview',false);
 var views=[];
 for(var i=0;i<menu.numberOfItems;i++){
  var item=menu.itemAtIndex(i);if(!item.hidden&&item.view)views.push(item.view);
 }
 var height=views.reduce(function(sum,view){return sum+Number(view.frame.size.height);},0);
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH*2,height*2));image.lockFocus;
 var scale=$.NSAffineTransform.transform;scale.scaleXByYBy(2,2);scale.concat;
 $.NSColor.colorWithCalibratedWhiteAlpha(.17,1).setFill;$.NSRectFill($.NSMakeRect(0,0,MENU_WIDTH,height));
 var y=height;
 views.forEach(function(view,index){
  y-=Number(view.frame.size.height);
  current={locale:locale,state:state,name:ObjC.unwrap(view.className),height:Number(view.frame.size.height),dateCapsuleWidth:resetCardDateCapsuleWidth,text:[],values:[],icons:[],bars:[]};
  view.appearance=$.NSAppearance.appearanceNamed($.NSAppearanceNameDarkAqua);
  if(view.isFlipped){
   // NSString and native disclosure paths both need the view's focus direction,
   // not just a flipped affine transform on the enclosing image.
   var rowHeight=Number(view.frame.size.height),rowImage=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH*2,rowHeight*2));
   rowImage.lockFocusFlipped(true);var rowScale=$.NSAffineTransform.transform;rowScale.scaleXByYBy(2,2);rowScale.concat;
   paintTree(view);rowImage.unlockFocus;
   rowImage.drawInRectFromRectOperationFraction($.NSMakeRect(0,y,MENU_WIDTH,rowHeight),$.NSZeroRect,$.NSCompositingOperationSourceOver,1);
  }else{
   $.NSGraphicsContext.saveGraphicsState;var transform=$.NSAffineTransform.transform;transform.translateXByYBy(0,y);transform.concat;
   paintTree(view);$.NSGraphicsContext.restoreGraphicsState;
  }
  records.push(current);current=null;
 });image.unlockFocus;flushMenuViewCallbacks();
 ${preview?`if(state==='ready'||state==='stale'||state==='large'||state==='overview'){
  var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),file=${JSON.stringify(preview)}+'/'+locale+'-'+state+'.png';
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(file,true);files.push(file);
 }`:''}
}
['zh-CN','en'].forEach(function(locale){['ready','stale','missing','normal','critical','exhausted','resetting','unknown','zero','auth','limited','large','overview','year','vpnMissing','allMissing'].forEach(function(state){render(locale,state);});});
// Exercise the actual native bar pixels at the foot and near the final top.
// Equal synthetic values make growing height distinct from a whole-chart fade.
maomaoyunTrafficSourceState='ready';
var vpnFrames=[],waveModel={stale:false,hasData:true,days:vpnActivityPresentation().days.map(function(day){
 return {date:day.date,tokens:100000000,bytes:0,today:day.today,tokenStale:false,vpnStale:false};
})};
function nativeRGB(color){var rgb=color.colorUsingColorSpace($.NSColorSpace.genericRGBColorSpace);
 return [Number(rgb.redComponent),Number(rgb.greenComponent),Number(rgb.blueComponent)];}
function referencePalette(){
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(32,8));image.lockFocus;
 drawRoundedBar(0,0,16,8,1,cardColors().blue);
 sendVoid(activeAccentColor(1),'setFill');$.NSRectFill($.NSMakeRect(16,0,16,8));image.unlockFocus;
 var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),factor=Number(rep.pixelsWide)/32;
 return {blue:nativeRGB(rep.colorAtXY(Math.floor(8*factor),Math.floor(4*factor))),
  green:nativeRGB(rep.colorAtXY(Math.floor(24*factor),Math.floor(4*factor)))};
}
var palette=referencePalette();
function renderVPNFrame(name,progress){
 var height=160,image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH*2,height*2));image.lockFocus;
 var scale=$.NSAffineTransform.transform;scale.scaleXByYBy(2,2);scale.concat;
 $.NSColor.colorWithCalibratedWhiteAlpha(.17,1).setFill;$.NSRectFill($.NSMakeRect(0,0,MENU_WIDTH,height));
 drawUsageActivity(waveModel,progress);image.unlockFocus;
 var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),factor=Number(rep.pixelsWide)/MENU_WIDTH;
 var cells=usageActivityColumns(waveModel,MENU_WIDTH).cells,columns=cells.map(function(bar,index){
  function color(y,x){return rep.colorAtXY(Math.floor((x===undefined?bar.center:x)*factor),Math.floor((height-y)*factor))
   .colorUsingColorSpace($.NSColorSpace.genericRGBColorSpace);}
  var line=color(bar.y),middle=color(bar.y,bar.center+bar.slotWidth/2),node=usageActivityLineNodeFrame(cells,index,progress);
  var tip=node?color(node.y,node.x):null;
  // Follow the final bar height: adaptive ceilings change its geometry, not
  // the shared reveal phase this native pixel check is intended to measure.
  return {foot:Number(color(bar.y+10).blueComponent),top:Number(color(bar.y+bar.tokenHeight*.8).blueComponent),lineGreen:Number(line.greenComponent),lineBlue:Number(line.blueComponent),
   middleGreen:Number(middle.greenComponent),middleBlue:Number(middle.blueComponent),nodeX:node?node.x:null,
   tipGreen:tip?Number(tip.greenComponent):null,tipBlue:tip?Number(tip.blueComponent):null,
   barRGB:nativeRGB(color(bar.y+10)),nodeRGB:nativeRGB(line)};
 });
 vpnFrames.push({name:name,columns:columns});
 ${preview?`if(name==='left'||name==='middle'||name==='complete'){
  var file=${JSON.stringify(preview)}+'/vpn-wave-'+name+'.png';
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(file,true);files.push(file);
 }`:''}
}
[['start',0],['left',1/14],['quarter',.25],['middle',.5],['right',.975],['complete',1]].forEach(function(frame){renderVPNFrame(frame[0],frame[1]);});
uiLanguage='zh-CN';tokenMeterSnapshot=source;usageAccountId=source.accountId;tokenMeterSync='ready';refreshTokenMeterMenu(true);
var label=ObjC.unwrap(tokenMeterView.accessibilityLabel),rangeControls=Number(tokenMeterView.subviews.count)===2;
var toolbarEnabled=false;for(var m=0;m<menu.numberOfItems;m++){
 var candidate=menu.itemAtIndex(m);
 if(candidate.view&&ObjC.unwrap(candidate.view.className)==='CodexUsageMeterUsageActivityView')toolbarEnabled=!!candidate.enabled;
}
usageAccountId='other';refreshTokenMeterMenu(true);var isolated=tokenMeterPresentation().model===null;
var noPopups=true;for(var n=0;n<menu.numberOfItems;n++)if(ObjC.unwrap(menu.itemAtIndex(n).toolTip))noPopups=false;
JSON.stringify({records:records,files:files,failures:failures,toolbarEnabled:toolbarEnabled,vpnFrames:vpnFrames,palette:palette,
 isolated:isolated,noPopups:noPopups,rangeControls:rangeControls,label:label,defaultFolded:defaultFolded});
`;
let out;
try {out=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+fixture],
  {encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024}));}
catch(error){throw new Error(String(error.stderr||error.code||'Native meter test failed').trim());}
assert.deepEqual(out.failures,[]);
for(const r of out.records){
 for(const icon of r.icons){assert(icon.painted,'native symbol exists: '+icon.name);
  assert(icon.x>=15.9&&icon.x+icon.size<=272.1&&icon.y>=0&&icon.y+icon.size<=r.height+.1);}
 for(const text of [...r.text,...r.values]){
  assert(text.x>=15.9&&text.x+text.w<=272.1&&text.y>=0&&text.y+text.h<=r.height+.1,'within native row: '+JSON.stringify(text));
  assert(text.measured<=text.w+.5,'no truncation: '+JSON.stringify(text));
  if(r.locale==='zh-CN')assert(!/[A-Za-z]{2,}/.test(text.t.replace(/MaoMaoYun|Token|Codex|VPN|App|[BKMGT]/g,'')),'untranslated: '+text.t);
  assert(!/Uncached input|Cached input|24h|30d|未缓存输入|缓存输入|周期剩余|Time remaining/.test(text.t));
 }
 if(r.name==='CodexUsageMeterResetCardView'){
  assert.equal(r.height,34,'compact reset rows retain readable capsules and 4pt bars');
  assert.equal(r.bars.length,1);
  const bar=r.bars[0];
  assert.deepEqual([bar.x,bar.y,bar.w,bar.h],[16,6,256,4]);
  assert(bar.switchBlue,'expiry bars use the exact native header-switch blue');
  assert.equal(r.height-10-8-(bar.y+bar.h),6,'6pt capsule-to-bar clearance');
  const header=out.records.find(h=>h.locale===r.locale&&h.state===r.state&&h.name==='CodexUsageMeterResetHeaderView');
  const title=header.text.find(t=>/^(重置卡|Reset cards)$/.test(t.t));
  assert(Math.abs(r.dateCapsuleWidth-title.measured)<.01,'all date capsules match the localized section title width');
  const date=r.text.find(t=>/^\d+\/\d+(?:\/\d+)?$/.test(t.t));
  if(date){
   assert(/\/\d{2}$/.test(date.t),'reset-card days retain their leading zero');
   assert(Math.abs(date.x+date.w/2-(16+r.dateCapsuleWidth/2))<.01,'expiry dates are centered in equal-width capsules');
   assert(Math.abs(date.y+date.h/2-(r.height-10))<.01,'the distinctive date glyphs stay vertically centered');
   assert.equal(date.font,'DINCondensed-Bold');assert.equal(date.size,13);
   assert(date.x>=16+2.5&&date.x+date.w<=16+r.dateCapsuleWidth-2.5,'dates retain capsule inset, including year-boundary dates');
   const expiry=r.text.find(t=>t!==date),clock=r.icons.find(i=>i.name==='clock');
   assert(expiry&&clock,'expiry text and its native clock stay together');
   assert(Math.abs(expiry.x+expiry.w-272)<.01,'expiry countdown ends at the common trailing edge');
   assert(clock.x>=16+r.dateCapsuleWidth+12,'the right-aligned countdown clears the date capsule');
   assert(Math.abs(expiry.x-clock.x-clock.size-4)<.01,'clock and countdown retain their shared 4pt gap');
  }
 }else if(r.name==='CodexUsageMeterResetHeaderView'){
  assert.equal(r.height,22,'the related reset section needs no extra separator padding');
  const title=r.text.find(t=>/^(重置卡|Reset cards)$/.test(t.t));
  assert.equal(title.w,r.dateCapsuleWidth,'title and date capsules share the exact same layout width');
 }else if(r.name==='CodexUsageMeterUsageActivityView'){
  assert.equal(r.height,160);assert.equal(r.values.length,0,'no aggregate total is restored');
  assert(!r.text.some(t=>/过去7天|Past 7 days|截至当前|Today so far|过去30天|Past 30 days|官方统计|Profile data/.test(t.t)),'no separate source/range caption');
  assert(r.text.some(t=>t.t==='Token')&&r.text.some(t=>/^(VPN 用量|VPN usage)$/.test(t.t)),'both legends identify the independent axes');
  const tokenLegend=r.text.find(t=>t.t==='Token'),vpnLegend=r.text.find(t=>/^(VPN 用量|VPN usage)$/.test(t.t));
  const rangeLabels=r.text.filter(t=>/^(7天|30天|7 days|30 days)$/.test(t.t));
  assert.equal(rangeLabels.length,2,'range controls are in the chart toolbar, not the disclosure button');
  assert(vpnLegend.x>tokenLegend.x+tokenLegend.w&&vpnLegend.x+vpnLegend.w+10<=rangeLabels[0].x,'both left legends clear the right-hand range capsule');
  assert.equal(r.columns.cells.length,7);
  assert(!r.text.some(t=>t.y===123),'per-day Token amounts no longer clutter the top of the chart');
  for(const cell of r.columns.cells){
   assert(cell.x>=44&&cell.x+cell.width<=244&&cell.tokenHeight>=0&&cell.tokenHeight<=90);
   assert(cell.vpnY===null||cell.vpnY>=30&&cell.vpnY<=120);
  }
  assert(r.columns.cells.some(cell=>cell.day.bytes===null&&cell.vpnY===null));
  for(const segment of r.segments){assert.equal(segment.to-segment.from,1);assert(r.columns.cells[segment.from].day.bytes!==null&&r.columns.cells[segment.to].day.bytes!==null,'line cannot bridge a missing day');}
  if(r.state==='zero')assert(r.columns.cells.every(cell=>cell.tokenHeight===2),'true token zero remains visible');
  if(r.state==='missing'||r.state==='auth')assert(r.columns.cells.every(cell=>cell.day.tokens===null)&&r.columns.hasVPN,'VPN still draws when Token source is unavailable');
  if(r.state==='vpnMissing')assert(r.columns.hasTokens&&!r.columns.hasVPN,'Token still draws when VPN needs login');
  if(r.state==='allMissing')assert(!r.columns.hasTokens&&!r.columns.hasVPN&&r.text.some(t=>/^(暂无数据|No data)$/.test(t.t)),'both missing sources retain a localized empty state');
 }else if(r.name==='CodexUsageMeterTokenDisclosureButton'){
  assert.equal(r.height,24);assert.equal(r.values.length,0,'the trailing aggregate total is removed');
  assert.equal(r.text.length,1,'range controls no longer live inside the disclosure button');
  assert(/^(用量活动|Usage activity)$/.test(r.text[0].t),'the parent disclosure describes both kinds of usage');
  assert.equal(r.text[0].h,16,'Token title matches the shared 12pt metric/reset title font');
  if(r.state==='stale'||r.state==='limited')assert(r.icons.some(i=>i.name==='clock'),'collapsed and expanded headers mark old counts');
 }
}
assert(out.defaultFolded,'Token chart is initially hidden without an idle animation timer');
assert(out.rangeControls&&out.toolbarEnabled&&out.isolated&&out.noPopups,JSON.stringify({rangeControls:out.rangeControls,toolbarEnabled:out.toolbarEnabled,isolated:out.isolated,noPopups:out.noPopups}));
const chartView=readSource('meter-panels').split("name:'CodexUsageMeterUsageActivityView'")[1].split('function stopTokenMeterAnimation')[0];
assert(chartView.includes('tokenActivityRangeContainerPressed(this,event)'),'the plain chart row routes only range hits, without falling through to disclosure');
assert(out.label.includes('过去7天')&&out.label.includes('独立刻度')&&out.label.includes('VPN 用量'));
assert(!out.label.includes('输入')&&!out.label.includes('输出'));
assert(out.records.some(r=>r.icons.some(i=>i.name==='exclamationmark.triangle.fill')));
const wave=Object.fromEntries(out.vpnFrames.map(frame=>[frame.name,frame.columns]));
const reveal=(name,column,level)=>(wave[name][column][level]-wave.start[column][level])/
 (wave.complete[column][level]-wave.start[column][level]);
assert(wave.complete.every((column,index)=>column.foot-wave.start[index].foot>.15&&column.top-wave.start[index].top>.15));
assert(wave.complete.every(column=>column.lineGreen-column.lineBlue>.12),'VPN line nodes are native green and draw above the Token bars');
for(const column of wave.complete){
 assert(column.barRGB.every((value,index)=>Math.abs(value-out.palette.blue[index])<.01),'settled bars exactly match the reset-card blue without an extra opacity tint');
 assert(column.nodeRGB.every((value,index)=>Math.abs(value-out.palette.green[index])<.01),'settled line nodes exactly match the prediction green');
}
assert(wave.quarter[0].middleGreen-wave.quarter[0].middleBlue>.12,'the line tip paints part of the first actual segment');
assert(wave.quarter.slice(1).every(column=>column.lineGreen-column.lineBlue<.08),'future VPN nodes are not revealed with the growing Token bars');
assert(wave.middle.slice(4).every(column=>column.lineGreen-column.lineBlue<.08),'right-half line pixels stay absent until the tip reaches them');
assert(reveal('left',0,'foot')>.3&&reveal('left',0,'foot')<.7,'first real column grows and fades into native pixels');
assert(Math.abs(reveal('left',6,'foot'))<.01,'rightmost column has not entered yet');
assert(reveal('middle',0,'foot')>.97&&reveal('middle',3,'foot')>.3&&reveal('middle',3,'foot')<.7);
assert(reveal('middle',0,'top')>.97&&Math.abs(reveal('middle',3,'top'))<.01,'height grows from the baseline, not only opacity');
assert(Math.abs(reveal('middle',6,'foot'))<.01,'the last bar waits for the same final-date stage as the line');
assert(Math.abs((wave.middle[3].nodeX-wave.complete[2].nodeX)/(wave.complete[3].nodeX-wave.complete[2].nodeX)-.5)<.01,'real tip is halfway to the same half-grown bar');
assert(wave.middle[3].tipGreen-wave.middle[3].tipBlue>.12,'the synchronized moving tip really paints at its interpolated position');
assert(reveal('right',6,'top')>.8&&reveal('right',6,'top')<1);
assert(!out.records.some(r=>/TokenActivityHeaderView|VPNActivityView/.test(r.name)),'no duplicate chart rows or empty placeholders remain');
console.log('Native combined activity passed: single 160pt view, bilingual dual axes, missing/zero/source isolation and real staggered Token bar pixels.');
if(out.files.length)console.log('Previews:',JSON.stringify(out.files));
