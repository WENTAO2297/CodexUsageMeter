const assert=require('node:assert/strict'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readSource,readLibrarySource}=require('./sources.cjs');
const core=vm.createContext({MENU_WIDTH:288});
vm.runInContext(readSource('meter-panels-core')+'\n'+readSource('token-activity'),core);
const clean=value=>JSON.parse(JSON.stringify(value)),G=1024**3;
const dates=Array.from({length:7},(_,i)=>'2026-10-'+(12+i));
const token={model:{days:dates.slice().reverse().map((date,i)=>({date,tokens:i*100000000}))},stale:false,caption:'Profile data'};
const vpn={days:dates.map((date,i)=>({date,bytes:[0,2*G,null,G,3*G,5*G,4*G][i],today:i===6,stale:false})),caption:'Reported daily usage'};
const merged=clean(core.usageActivityModel(token,vpn));
assert.deepEqual(merged.days.map(day=>day.date),dates);
assert.deepEqual(merged.days.map(day=>day.tokens),[600000000,500000000,400000000,300000000,200000000,100000000,0],'join by date, never by array index');
assert.equal(merged.days[2].bytes,null);assert.equal(merged.days[0].bytes,0);assert(merged.hasData&&!merged.stale);
const tokenOnly=clean(core.usageActivityModel(token,{...vpn,days:vpn.days.map(day=>({...day,bytes:null}))}));
const vpnOnly=clean(core.usageActivityModel({model:null,stale:false,caption:'Sign in to Codex'},vpn));
assert(tokenOnly.hasData&&tokenOnly.days.every(day=>day.bytes===null));
assert(vpnOnly.hasData&&vpnOnly.days.every(day=>day.tokens===null),'one account/source failure does not erase the other series');
const missing=clean(core.usageActivityModel({model:null,stale:false},{days:vpn.days.map(day=>({...day,bytes:null}))}));
assert(!missing.hasData);
assert(core.usageActivityModel({...token,stale:true},vpn).days.every(day=>day.tokenStale&&!day.vpnStale));
for(const width of [260,288,320]){
 core.MENU_WIDTH=width;
 const layout=clean(core.usageActivityColumns(merged,width)),cells=layout.cells;
 assert.equal(cells.length,7);assert.equal(core.tokenActivityChartLayout().height,160);
 assert.equal(layout.tokenMax,1000000000);assert.equal(layout.vpnMax,5*G);
 const immutable=JSON.stringify(cells);
 for(let i=0;i<7;i++){
  const cell=cells[i];assert(cell.x>=44&&cell.x+cell.width<=width-44&&cell.tokenHeight<=90);
  assert(cell.vpnY===null||cell.vpnY>=30&&cell.vpnY<=120);
  const hit=core.tokenActivityHitCell(merged,{x:cell.center,y:80},1);assert.equal(hit.index,i);
  const hint=clean(core.tokenActivityHintRect());
  assert.deepEqual(hint,{x:16,y:135,width:width-32,height:24},'the capsule replaces the toolbar without changing chart height');
  const range=clean(core.usageActivityRangeRect());
  assert.equal(hint.y+hint.height/2,range.y+range.height/2,'overlay and range control share the exact center');
  assert.equal(hint.y-127,8,'the top axis labels retain 8pt clearance');
  const groups=clean(core.tokenActivityDetailPositions([41.5,57.9,58.4]));
  assert.equal(groups.length,3);assert.equal(groups[0].x,hint.x+12,'equal 12pt outer margins');
  assert(Math.abs(groups[2].x+groups[2].width-(hint.x+hint.width-12))<1e-9);
  assert(Math.abs((groups[1].x-groups[0].x-groups[0].width)-(groups[2].x-groups[1].x-groups[1].width))<1e-9,
    'different visible text widths get equal gaps, not equal columns');
 }
 assert.equal(cells[6].tokenHeight,2,'explicit zero has a minimum bar');assert.equal(cells[2].vpnY,null);
 for(const progress of [0,.0625,.125,.25,.5,.75,.875,1]){
  const frames=cells.map((cell,i)=>clean(core.usageActivityColumnFrame(cell,i,progress)));
  frames.forEach((frame,i)=>{
   assert.equal(frame.y,30);assert.deepEqual(frame.day,cells[i].day);assert(frame.height>=0&&frame.height<=cells[i].tokenHeight);
   assert(frame.opacity>=0&&frame.opacity<=1);if(i)assert(frame.opacity<=frames[i-1].opacity);
   if(progress===0)assert.equal(frame.opacity,0);
   if(progress===1){assert.equal(frame.opacity,1);assert.equal(frame.height,cells[i].tokenHeight);}
  });
  const segments=clean(core.usageActivityLineSegments(cells,progress));
  for(const s of segments){assert.equal(s.to-s.from,1);assert(cells[s.from].vpnY!==null&&cells[s.to].vpnY!==null);assert(s.x2>=s.x1&&s.x2<=cells[s.to].center);
   assert.equal(s.progress,frames[s.to].opacity,'each bar and incoming line share exactly the same date phase');
   assert.equal(s.opacity,1,'line length animates instead of fading the entire series');
   assert(Math.abs(s.y2-(s.y1+(cells[s.to].vpnY-s.y1)*s.progress))<1e-9);
  }
  assert(segments.filter(s=>s.progress<1).length<=1,'one traveling tip, never several concurrent growing segments');
  cells.forEach((cell,index)=>{
   const node=core.usageActivityLineNodeFrame(cells,index,progress),phase=frames[index].opacity;
   if(!phase||cell.vpnY===null){assert.equal(node,null);return;}
   assert.equal(node.progress,phase);assert(node.opacity>0&&node.opacity<=1);
   if(phase===1){assert.equal(node.x,cell.center);assert.equal(node.y,cell.vpnY);assert.equal(node.opacity,1);}
   else if(index&&cells[index-1].vpnY!==null){
    assert.equal(node.x,cells[index-1].center+(cell.center-cells[index-1].center)*phase);
    assert.equal(node.y,cells[index-1].vpnY+(cell.vpnY-cells[index-1].vpnY)*phase,'active node follows the line tip, not the future endpoint');
   }
  });
 }
 assert.deepEqual(clean(core.usageActivityLineSegments(cells,1)).map(s=>[s.from,s.to]),[[0,1],[3,4],[4,5],[5,6]],'never bridge a missing VPN date');
 assert.equal(core.tokenActivityHitCell(merged,{x:cells[6].center,y:80},.125),null,'unrevealed future columns cannot acquire hints');
 assert.equal(core.tokenActivityHitCell(vpnOnly,{x:cells[6].center,y:80},.625),null,'a VPN-only column waits for the actual line, not the Token animation');
 assert.equal(core.tokenActivityHitCell(vpnOnly,{x:cells[6].center,y:80},1).index,6);
 assert.equal(core.tokenActivityHitCell(merged,{x:cells[0].center,y:140},1),null,'legend is outside the hover plot');
 assert.equal(core.tokenActivityHitCell(missing,{x:cells[0].center,y:80},1),null);
 assert.equal(JSON.stringify(cells),immutable,'animation never mutates measurements');
 const moreTokens=clean(core.usageActivityColumns({...merged,days:merged.days.map(day=>({...day,tokens:day.tokens*10}))},width));
 const moreVPN=clean(core.usageActivityColumns({...merged,days:merged.days.map(day=>({...day,bytes:day.bytes===null?null:day.bytes*10}))},width));
 assert.deepEqual(moreTokens.cells.map(c=>c.vpnY),cells.map(c=>c.vpnY),'Token scaling cannot alter the VPN axis');
 assert.deepEqual(moreVPN.cells.map(c=>c.tokenHeight),cells.map(c=>c.tokenHeight),'VPN scaling cannot alter Token bars');
}
const continuous=core.usageActivityColumns({...merged,days:merged.days.map(day=>({...day,bytes:G}))},288).cells;
const quarter=clean(core.usageActivityLineSegments(continuous,.25));
assert.equal(quarter.length,1);assert(quarter[0].progress>0&&quarter[0].progress<1,'quarter frame contains only the first partially drawn segment');
assert.deepEqual(clean(core.usageActivityLineSegments(continuous,.5)).map(s=>s.to),[1,2,3],'midpoint has drawn only the left half');
const forward=JSON.stringify(core.usageActivityLineSegments(continuous,.375));
core.usageActivityLineSegments(continuous,.875);
assert.equal(JSON.stringify(core.usageActivityLineSegments(continuous,.375)),forward,'reversal is a pure frame, with no stale path or node state');
assert.equal(core.usageActivityCeiling(43.15),50);assert.equal(core.usageActivityCeiling(0),0);
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
const preview=process.argv.includes('--preview')?fs.mkdtempSync(path.join(os.tmpdir(),'codex-activity-hover-')):null;
const fixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
refreshAllSources=function(){throw Error('No real readers');};usageAccountId='fixture-activity';tokenMeterSync='ready';
var now=new Date(),end=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
tokenMeterSnapshot={version:3,source:'profile',accountId:usageAccountId,savedAt:Date.now()/1000,days:[]};
for(var i=0;i<30;i++)tokenMeterSnapshot.days.push({date:new Date(end-(29-i)*86400000).toISOString().slice(0,10),tokens:i*15000000});
tokenMeterSnapshot.days[23].tokens=0;menuIsOpen=true;uiLanguage='zh-CN';statusDisplayReducedMotion=function(){return false;};
var cells=usageActivityColumns(usageActivityPresentation(),MENU_WIDTH).cells,point=null;
tokenActivityPointerLocation=function(){return point;};
function select(index){point={x:cells[index].center,y:80};refreshTokenActivityHover();}
point={x:cells[0].center,y:80};setTokenMeterExpanded(true,true);
var until=Date.now()+45;while(Date.now()<until)$.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSEventTrackingRunLoopMode,$.NSDate.dateWithTimeIntervalSinceNow(.005));
var duringOpening=!!tokenActivityHover&&tokenActivityHover.index===0&&tokenMeterReveal>0&&tokenMeterReveal<1;
stopTokenMeterAnimation();tokenMeterReveal=.125;select(6);var futureHidden=tokenActivityHover===null;
tokenMeterReveal=.9;refreshTokenActivityHover();var newlyRevealed=tokenActivityHover&&tokenActivityHover.index===6;
var movingHeight=tokenActivityHover.cell.height;tokenMeterReveal=.95;refreshTokenActivityHover();var followsMotion=tokenActivityHover.cell.height>movingHeight;
tokenMeterReveal=.125;refreshTokenActivityHover();var reverseClears=tokenActivityHover===null;
setTokenMeterExpanded(true,false);refreshTokenMeterMenu(true);select(0);var first=tokenActivityHover;select(6);var last=tokenActivityHover;
var initial={first:first.text,last:last.text,tracking:Number(tokenMeterView.trackingAreas.count)};
refreshTokenMeterMenu(true);var unchanged=last===tokenActivityHover;
var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,160));sendVoid(image,'lockFocus');
sendVoid($.NSColor.colorWithCalibratedWhiteAlpha(.17,1),'setFill');$.NSRectFill($.NSMakeRect(0,0,MENU_WIDTH,160));
tokenMeterView.drawRect(tokenMeterView.bounds);sendVoid(image,'unlockFocus');
var drawIsReadOnly=last===tokenActivityHover;
${preview?`var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(${JSON.stringify(preview+'/hint.png')},true);`:''}
var details=[];
function detailCase(locale,stale,large){
 uiLanguage=locale;
 var model={hasData:true,days:cells.map(function(cell){return {date:cell.day.date,today:cell.day.today,
  tokens:large?1e14:454000000,bytes:large?1e15:43.15*Math.pow(1024,3),tokenStale:stale,vpnStale:stale};})};
 var cell=usageActivityColumns(model,MENU_WIDTH).cells[1],hover={view:tokenMeterView,index:1,cell:cell,text:tokenActivityHoverText(cell)};
 var text=[],icons=[],originalText=drawCardText,originalIcon=drawMeterStatusIcon;
 drawCardText=function(t,x,y,w,size,color,bold){if(y>=132)text.push({t:t,x:x,y:y,w:w,h:size+4,size:size,
  measured:Number($(String(t)).sizeWithAttributes(cardAttributes(size,color,bold)).width),
  ink:$(String(t)).boundingRectWithSizeOptionsAttributes($.NSMakeSize(1000,100),$.NSStringDrawingUsesDeviceMetrics,cardAttributes(size,color,bold)),
  sharedColor:String(t).indexOf('Token ')===0?!!color.isEqual(stale?cardColors().muted:cardColors().blue):
   String(t).indexOf('VPN ')===0?!!color.isEqual(stale?cardColors().muted:activeAccentColor(1)):true});
  originalText(t,x,y,w,size,color,bold);};
 drawMeterStatusIcon=function(name,x,y,size,color,tone){if(y>=132)icons.push({name:name,x:x,y:y,size:size});
  return originalIcon(name,x,y,size,color,tone);};
 var rect=null;
 function render(selected){
  var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH*2,320));sendVoid(image,'lockFocus');
  var scale=$.NSAffineTransform.transform;scale.scaleXByYBy(2,2);sendVoid(scale,'concat');
  sendVoid($.NSColor.colorWithCalibratedWhiteAlpha(.17,1),'setFill');$.NSRectFill($.NSMakeRect(0,0,MENU_WIDTH,160));
  drawUsageActivity(model,1,selected?hover:null);
  if(selected){
   text=[];icons=[];
   if(drawTokenActivityHint(tokenMeterView,model,null)!==undefined)throw Error('A late hover cannot overwrite a captured empty header');
   rect=drawTokenActivityHint(tokenMeterView,model,hover);
  }
  sendVoid(image,'unlockFocus');return $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
 }
 var ordinary=render(false);text=[];icons=[];tokenActivityHover=hover;var selected=render(true);
 drawCardText=originalText;drawMeterStatusIcon=originalIcon;
 var factor=Number(selected.pixelsWide)/MENU_WIDTH,pixels=[];
 [0,4,6].forEach(function(index){var x=Math.floor(cells[index].center*factor),y=Math.floor(100*factor);
  var a=ordinary.colorAtXY(x,y).colorUsingColorSpace($.NSColorSpace.genericRGBColorSpace);
  var b=selected.colorAtXY(x,y).colorUsingColorSpace($.NSColorSpace.genericRGBColorSpace);
  pixels.push(Math.abs(Number(a.redComponent)-Number(b.redComponent))+Math.abs(Number(a.greenComponent)-Number(b.greenComponent))+Math.abs(Number(a.blueComponent)-Number(b.blueComponent)));
 });
 details.push({locale:locale,stale:stale,large:large,rect:rect,text:text,icons:icons,pixels:pixels});
 ${preview?`if(!stale&&!large)selected.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(${JSON.stringify(preview)}+'/'+locale+'-details.png',true);`:''}
}
['zh-CN','en'].forEach(function(locale){detailCase(locale,false,false);detailCase(locale,true,false);detailCase(locale,true,true);});
uiLanguage='zh-CN';tokenActivityHover=last;
tokenMeterSnapshot.days[29].tokens=450000000;refreshTokenMeterMenu(true);var revision=tokenActivityHover!==last&&tokenActivityHover.text.indexOf('4.5亿')>=0;
uiLanguage='en';refreshTokenMeterMenu(true);var english=tokenActivityHover;var localized=english!==last&&!/[月日个]/.test(english.text)&&english.text.indexOf('VPN usage')>=0;
tokenMeterSync='error';refreshTokenMeterMenu(true);var stale=tokenActivityHover.text.indexOf('Last count')>=0;
setTokenMeterExpanded(false,false);var collapsed=tokenActivityHover===null;setTokenMeterExpanded(true,false);var expanded=tokenActivityHover.index===6;
usageAccountId='different';refreshTokenMeterMenu(true);var isolated=tokenActivityHover===null;
usageAccountId='fixture-activity';tokenMeterSync='ready';refreshTokenMeterMenu(true);
for(var n=0;n<50;n++){uiLanguage=n%2?'zh-CN':'en';refreshTokenMeterMenu(true);setTokenMeterExpanded(false,false);setTokenMeterExpanded(true,false);}
var bounded=Number(tokenMeterView.trackingAreas.count)===1&&tokenActivityHover.index===6;
var c=cells[2],event=$.NSEvent.mouseEventWithTypeLocationModifierFlagsTimestampWindowNumberContextEventNumberClickCountPressure($.NSEventTypeMouseMoved,$.NSMakePoint(c.center,80),0,0,0,null,1,0,0);
point={x:c.center,y:80};tokenMeterView.mouseMoved(event);var moved=tokenActivityHover.index===2;
point={x:-1,y:-1};tokenMeterView.mouseExited(event);var exitedCell=tokenActivityHover===null;
point={x:cells[1].center,y:80};delegate.menuTrackingTimer(null);var stationary=tokenActivityHover.index===1;
var earlier=tokenActivityHover;select(2);clearTokenActivityHover(earlier);clearTokenActivityHover(null);var staleExit=tokenActivityHover.index===2;
var originalPointer=tokenActivityPointerLocation,oldVPNState=maomaoyunTrafficSourceState;
tokenActivityPointerLocation=function(){maomaoyunTrafficSourceState='error';return point;};clearTokenActivityHover();refreshTokenActivityHover();var vpnChangedDuringGeometry=tokenActivityHover===null;
maomaoyunTrafficSourceState=oldVPNState;
tokenActivityPointerLocation=function(){menuIsOpen=false;return point;};clearTokenActivityHover();refreshTokenActivityHover();var closeDuringGeometry=tokenActivityHover===null;
tokenActivityPointerLocation=originalPointer;menuIsOpen=true;point={x:-1,y:-1};delegate.menuTrackingTimer(null);var missedExit=tokenActivityHover===null;
delegate.menuDidClose(menu);var closed=tokenActivityHover===null;menuIsOpen=true;setTokenMeterExpanded(true,false);isExiting=true;refreshTokenActivityHover();var exited=tokenActivityHover===null;
JSON.stringify({initial:initial,details:details,duringOpening:duringOpening,futureHidden:futureHidden,newlyRevealed:!!newlyRevealed,followsMotion:followsMotion,reverseClears:reverseClears,
 unchanged:unchanged,drawIsReadOnly:drawIsReadOnly,revision:revision,localized:localized,stale:stale,collapsed:collapsed,expanded:expanded,isolated:isolated,bounded:bounded,
 moved:moved,exitedCell:exitedCell,stationary:stationary,staleExit:staleExit,vpnChangedDuringGeometry:vpnChangedDuringGeometry,closeDuringGeometry:closeDuringGeometry,missedExit:missedExit,closed:closed,exited:exited});
`;
const native=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+fixture],{encoding:'utf8',timeout:15000}));
assert.equal(native.initial.tracking,1);assert.match(native.initial.first,/\nToken 0\nVPN 用量 —$/);assert.match(native.initial.last,/\nToken 4\.35亿\nVPN 用量 —$/);
for(const [name,value] of Object.entries(native))if(name!=='initial'&&name!=='details')assert(value,name);
assert.equal(native.details.length,6);
for(const detail of native.details){
 assert.deepEqual(detail.rect,{x:16,y:135,width:256,height:24});assert.equal(detail.text.length,3,'date and both series fit one toolbar capsule');
 const visible=[];
 for(const [index,text] of detail.text.entries()){
  const icon=index&&detail.stale?detail.icons[index-1]:null;
  assert(text.x>=detail.rect.x+2&&text.x+text.w<=detail.rect.x+detail.rect.width-2&&text.y>=135&&text.y+text.h<=159,
    'detail stays inside the capsule: '+JSON.stringify(text));
  assert(text.measured<=text.w+.1,'detail is not clipped: '+JSON.stringify(text));assert(text.size>=8,'readout remains readable even with stale and large values: '+JSON.stringify(text));assert(text.sharedColor,'readout reuses reset/prediction colors or the stale gray');
  const inkLeft=text.x+text.ink.origin.x,inkRight=inkLeft+text.ink.size.width;
  visible.push({left:icon?icon.x:inkLeft,right:inkRight});
 }
 assert(Math.abs(visible[0].left-(detail.rect.x+12))<.01&&Math.abs(visible[2].right-(detail.rect.x+detail.rect.width-12))<.01,'both visible outer margins are 12pt');
 const gaps=[visible[1].left-visible[0].right,visible[2].left-visible[1].right];
 assert(gaps.every(gap=>gap>=12)&&Math.abs(gaps[0]-gaps[1])<.01,'visible spaces between date, Token and VPN groups are identical: '+JSON.stringify(gaps));
 assert(detail.text.every(text=>text.size===detail.text[0].size),'all three groups keep one consistent type size');
 assert.equal(detail.icons.length,detail.stale?2:0,'each stale source retains its clock, instead of a long suffix');
 assert(detail.pixels.every(change=>change<.001),'hover never covers other columns of the plot');
 assert(detail.text[1].t.startsWith('Token ')&&detail.text[2].t.startsWith('VPN '));
}
assert(!/addToolTipRect|NSPanel|NSPopover|addGlobalMonitor|startTransientTimer|NSInitialToolTipDelay/.test(readSource('token-activity')));
console.log('Combined activity passed: shared date phases, missing/zero, immutable bar/line reveal, unobstructed bilingual header details and 50 lifecycle handoffs.');
if(preview)console.log('Preview: '+preview+'/hint.png');
