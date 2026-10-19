const assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');
const core=vm.createContext({MENU_WIDTH:288});
vm.runInContext(readSource('i18n')+'\n'+readSource('meter-panels-core')+'\n'+readSource('token-activity'),core);
core.uiLanguage='zh-CN';
assert.equal(core.uiText('7 days'),'7天');assert.equal(core.uiText('30 days'),'30天');
assert.equal(core.uiText('Resets in 30 days'),'30 天后重置','short range labels must not replace numeric phrases inside other labels');
const G=1024**3;
const days=Array.from({length:30},(_,i)=>({date:new Date(Date.UTC(2026,9,18-29+i)).toISOString().slice(0,10),
 tokens:i*15000000,bytes:i===9?null:(i%11)*G,today:i===29,tokenStale:false,vpnStale:false}));
const model={days,hasData:true};
for(const width of [260,288,320]){
 core.MENU_WIDTH=width;
 const layout=core.usageActivityColumns(model,width),cells=layout.cells;
 assert.equal(cells.length,30);assert.equal(cells.filter(c=>c.dateLabel).length,6,'monthly labels stay readable, measurements stay daily');
 assert(cells[0].dateLabel&&cells[29].dateLabel);
 for(const [index,c] of cells.entries()){
  assert(c.x>=44&&c.x+c.width<=width-44);assert(c.width>2&&c.width<c.slotWidth);
  assert.equal(core.tokenActivityHitCell(model,{x:c.center,y:80},1).index,index,'every one of the 30 dates has its own hit region');
  if(index)assert(c.x>cells[index-1].x+cells[index-1].width,'daily bars never overlap');
 }
 const before=JSON.stringify(cells);
 for(const reveal of [0,.1,.333,.5,.833,1]){
  const frames=cells.map((c,i)=>core.usageActivityColumnFrame(c,i,reveal));
  if(reveal===.5)assert.deepEqual(frames.map(c=>c.opacity),Array(15).fill(1).concat(Array(15).fill(0)),'30 dates share the same full 500ms timeline');
  for(const line of core.usageActivityLineSegments(cells,reveal)){
   assert.equal(line.progress,frames[line.to].opacity,'Token and VPN remain synchronized in monthly mode');
   assert(cells[line.from].vpnY!==null&&cells[line.to].vpnY!==null,'missing reports remain gaps');
  }
  assert(core.usageActivityLineSegments(cells,reveal).filter(s=>s.progress<1).length<=1);
 }
 assert.equal(JSON.stringify(cells),before,'range animation does not rewrite measurements');
 const groups=core.tokenActivityDetailPositions([42,59,58]);
 assert(Math.abs(groups[1].x-groups[0].x-groups[0].width-(groups[2].x-groups[1].x-groups[1].width))<1e-9,'visible groups have equal gaps');
 const range=core.usageActivityRangeRect();assert.equal(range.width,76);assert.equal(range.x+range.width,width-16);
 for(const phase of [0,.25,.5,.75,1]){
  const thumb=core.usageActivityRangeThumbRect(phase);
  assert.equal(thumb.width,36);assert.equal(thumb.height,18);assert.equal(thumb.x,range.x+1+38*phase);
  assert(thumb.x>=range.x+1&&thumb.x+thumb.width<=range.x+range.width-1);
 }
}
const preview=process.argv.includes('--preview')?fs.mkdtempSync(path.join(os.tmpdir(),'codex-activity-range-')):null;
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
const fixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
var requests=0;refreshAllSources=function(){requests++;};menuIsOpen=true;uiLanguage='zh-CN';
statusDisplayReducedMotion=function(){return false;};usageAccountId='fixture-month';tokenMeterSync='ready';
var now=Date.now(),local=new Date(now),calendar=[],tokenDays=[];
for(var i=0;i<30;i++){
 var at=new Date(local.getFullYear(),local.getMonth(),local.getDate()-29+i).getTime()/1000;
 tokenDays.push({date:vpnActivityDate(at),tokens:Math.round((.2+(Math.sin(i*.61)+1)*2)*1e8)});
 if(i!==9)calendar.push([at,Math.round((2+(Math.sin(i*.47)+1)*18)*Math.pow(1024,3))]);
}
tokenMeterSnapshot={version:3,source:'profile',accountId:usageAccountId,savedAt:now/1000,days:tokenDays};
maomaoyunTrafficSourceState='ready';maomaoyunHistorySnapshot=null;
maomaoyunTrafficSnapshot={accountKey:Array(65).join('a'),credentialRevision:Array(65).join('b'),reportedAt:now,
 calendarBasis:'local-midnight',calendarState:'ready',calendarReportedAt:now,calendarDays:calendar,
 todayState:'reported',todayStartAt:calendar[calendar.length-1][0],todayReportedAt:now,todayUsedBytes:5*Math.pow(1024,3)};
var buttons=tokenActivityRangeButtons,header=tokenMeterDisclosureItem.view,parent=tokenMeterView;
var initialHidden=buttons.length===2&&buttons.every(function(b){return !!b.hidden;});
var point={x:-1,y:-1};tokenActivityPointerLocation=function(){return point;};
setTokenMeterExpanded(true,false);refreshTokenMeterMenu(true);
var visible=buttons.every(function(b){return !b.hidden;})&&usageActivityPresentation().days.length===7;
var frame=JSON.stringify({view:tokenMeterView.frame,header:header.frame});
var hitRegions=buttons.every(function(b){var f=b.frame;
 var hit=parent.hitTest($.NSMakePoint(f.origin.x+f.size.width/2,f.origin.y+f.size.height/2));return !!hit&&hit.isEqual(b);});
var c=usageActivityColumns(usageActivityPresentation(),MENU_WIDTH).cells[3];point={x:c.center,y:80};refreshTokenActivityHover();
var hadHint=!!tokenActivityHover;point={x:-1,y:-1};refreshTokenActivityHover();buttons[1].mouseDown($());
var monthlyStart=usageActivityDays===30&&tokenMeterReveal===0&&!tokenActivityHover&&!!tokenMeterAnimation.timer&&tokenMeterExpanded&&!tokenMeterItem.hidden&&tokenActivityRangePosition()===0;
function track(ms){var until=Date.now()+ms;while(Date.now()<until)$.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSEventTrackingRunLoopMode,$.NSDate.dateWithTimeIntervalSinceNow(.005));}
track(100);var mid=tokenMeterReveal>0&&tokenMeterReveal<1&&tokenActivityRangePosition()>0&&tokenActivityRangePosition()<1;
buttons[0].performClick($());var reverseFrom=tokenActivityRangeAnimation.from;
var reverseContinuous=reverseFrom>0&&reverseFrom<1&&tokenActivityRangePosition()<=reverseFrom&&tokenActivityRangeAnimation.to===0;
track(60);var reverseMoves=tokenActivityRangePosition()<reverseFrom&&tokenActivityRangePosition()>=0;
buttons[1].performClick($());track(250);
var rangeSettled=tokenActivityRangePosition()===1&&!!tokenMeterAnimation.timer&&tokenMeterReveal<1;finishTokenMeterAnimation(1);
var p=usageActivityPresentation(),cells=usageActivityColumns(p,MENU_WIDTH).cells;
var values=p.days.length===30&&p.days[0].tokens===tokenDays[0].tokens&&p.days[9].bytes===null&&p.days[29].bytes===5*Math.pow(1024,3);
var everyDate=cells.every(function(cell,index){point={x:cell.center,y:80};refreshTokenActivityHover();return tokenActivityHover&&tokenActivityHover.index===index&&tokenActivityHover.cell.day.date===tokenDays[index].date;});
var states=Number(buttons[0].state)===0&&Number(buttons[1].state)===1;
var ax=ObjC.unwrap(tokenMeterView.accessibilityLabel).indexOf('过去30天')>=0;
point={x:cells[14].center,y:80};refreshTokenActivityHover();
var hintRect=null,originalHint=drawTokenActivityHint,originalText=drawCardText,underlay=[],stage='title',titleKept=false;
drawTokenActivityHint=function(view,model,expected,rect){var result=originalHint(view,model,expected,rect);if(result)hintRect=result;return result;};
drawCardText=function(text,x,y,w,size,color,bold){
 if(stage==='title'&&text==='Usage activity')titleKept=true;
 if(stage==='chart'&&(text==='Token'||text==='VPN usage'))underlay.push(text);
 return originalText(text,x,y,w,size,color,bold);
};
var headerImage=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,24));sendVoid(headerImage,'lockFocus');header.drawRect(header.bounds);sendVoid(headerImage,'unlockFocus');
var noTitleOverlay=hintRect===null&&titleKept;
stage='chart';var chartImage=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,160));sendVoid(chartImage,'lockFocus');tokenMeterView.drawRect(tokenMeterView.bounds);sendVoid(chartImage,'unlockFocus');
drawTokenActivityHint=originalHint;drawCardText=originalText;
var toolbarHint=noTitleOverlay&&!!hintRect&&hintRect.y===135&&hintRect.height===24&&hintRect.width===256&&underlay.length===0&&buttons.every(function(b){return !!b.hidden&&b.superview.isEqual(tokenMeterView);});
${preview?`
function capture(name,selected){
 if(selected!==null){point={x:cells[selected].center,y:80};refreshTokenActivityHover();}else{point={x:-1,y:-1};refreshTokenActivityHover();}
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH*2,368));sendVoid(image,'lockFocus');
 var scale=$.NSAffineTransform.transform;scale.scaleXByYBy(2,2);sendVoid(scale,'concat');
 sendVoid($.NSColor.colorWithCalibratedWhiteAlpha(.17,1),'setFill');$.NSRectFill($.NSMakeRect(0,0,MENU_WIDTH,184));
 tokenMeterView.drawRect(tokenMeterView.bounds);
 buttons.forEach(function(b){if(b.hidden)return;$.NSGraphicsContext.saveGraphicsState;var shift=$.NSAffineTransform.transform;
 shift.translateXByYBy(b.frame.origin.x,b.frame.origin.y);sendVoid(shift,'concat');b.drawRect(b.bounds);$.NSGraphicsContext.restoreGraphicsState;});
 $.NSGraphicsContext.saveGraphicsState;
 var move=$.NSAffineTransform.transform;move.translateXByYBy(0,160);sendVoid(move,'concat');header.drawRect(header.bounds);
 $.NSGraphicsContext.restoreGraphicsState;sendVoid(image,'unlockFocus');
 $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation).representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(${JSON.stringify(preview)}+'/'+name+'.png',true);
}
capture('30-days',null);capture('30-days-hint',14);
[0,.5,1].forEach(function(phase){tokenActivityRangeAnimation.value=phase;capture('range-'+phase,null);});
`:''}
point={x:cells[14].center,y:80};refreshTokenActivityHover();
var hiddenReject=!tokenActivityRangeButtonPressed(buttons[0]);
var control=buttons[0].frame,at=tokenMeterView.convertPointToView($.NSMakePoint(control.origin.x+control.size.width/2,control.origin.y+10),$());
var down=$.NSEvent.mouseEventWithTypeLocationModifierFlagsTimestampWindowNumberContextEventNumberClickCountPressure($.NSEventTypeLeftMouseDown,at,0,0,0,null,1,1,1);
tokenMeterView.mouseDown(down);
var coveredClick=hiddenReject&&usageActivityDays===7&&tokenMeterExpanded&&!tokenMeterItem.hidden&&!tokenActivityHover&&buttons.every(function(b){return !b.hidden;});
point={x:-1,y:-1};buttons[1].performClick($());finishTokenMeterAnimation(1);refreshTokenActivityHover();
var timer=tokenMeterAnimation.timer;buttons[1].performClick($());var same=tokenMeterReveal===1&&tokenMeterAnimation.timer===timer;
buttons[0].performClick($());var keyboard=usageActivityDays===7&&tokenMeterReveal===0;finishTokenMeterAnimation(1);
${preview?`cells=usageActivityColumns(usageActivityPresentation(),MENU_WIDTH).cells;capture('7-days',null);`:''}
var accessibility=!!buttons[1].accessibilityPerformPress&&usageActivityDays===30&&tokenMeterReveal===0;
for(var i=0;i<12;i++)buttons[i%2].mouseDown($());
var rapid=tokenMeterExpanded&&!tokenMeterItem.hidden&&!!tokenMeterAnimation.timer;
finishTokenMeterAnimation(1);var noReads=requests===0;
var detached=$.CodexUsageMeterActivityRangeButton.alloc.initWithFrame($.NSMakeRect(0,0,42,20));detached.tag=7;
var rejectDetached=!tokenActivityRangeButtonPressed(detached);
uiLanguage='en';refreshTokenMeterMenu(true);
var english=ObjC.unwrap(buttons[0].title)==='7 days'&&ObjC.unwrap(buttons[1].title)==='30 days'&&ObjC.unwrap(tokenMeterView.accessibilityLabel).indexOf('Past 30 days')>=0;
var range=usageActivityDays;tokenActivityPointerLocation=function(){usageActivityDays=7;return {x:cells[0].center,y:80};};
clearTokenActivityHover();refreshTokenActivityHover();var reentrant=tokenActivityHover===null;usageActivityDays=range;
tokenActivityPointerLocation=function(){return {x:-1,y:-1};};
var unchangedSize=frame===JSON.stringify({view:tokenMeterView.frame,header:header.frame});
setTokenMeterExpanded(false,false);var hiddenPress=!tokenActivityRangeButtonPressed(buttons[0])&&buttons.every(function(b){return !!b.hidden;});
setTokenMeterExpanded(true,false);statusDisplayReducedMotion=function(){return true;};buttons[0].performClick($());
var reduced=usageActivityDays===7&&tokenMeterReveal===1&&!tokenMeterAnimation.timer&&tokenActivityRangePosition()===0;
delegate.menuDidClose(menu);var closed=!tokenMeterAnimation.timer&&!tokenActivityHover&&!tokenMeterExpanded&&buttons.every(function(b){return !!b.hidden;});
var afterClose=!tokenActivityRangeButtonPressed(buttons[1]);
JSON.stringify({initialHidden:initialHidden,visible:visible,hitRegions:hitRegions,hadHint:hadHint,monthlyStart:monthlyStart,mid:mid,reverseContinuous:reverseContinuous,reverseMoves:reverseMoves,rangeSettled:rangeSettled,values:values,everyDate:everyDate,
 states:states,ax:ax,toolbarHint:toolbarHint,coveredClick:coveredClick,same:same,keyboard:keyboard,accessibility:accessibility,rapid:rapid,noReads:noReads,rejectDetached:rejectDetached,
 english:english,reentrant:reentrant,unchangedSize:unchangedSize,hiddenPress:hiddenPress,reduced:reduced,closed:closed,afterClose:afterClose});
`;
const result=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+fixture],{encoding:'utf8',timeout:20000}));
for(const [name,value] of Object.entries(result))assert.equal(value,true,name);
console.log('Activity range passed: 7/30 daily data, all 30 hit cells, sparse date labels, equal readout gaps, native child clicks/AX, flowing 220ms thumb with shared 500ms plot timer, no extra reads or layout changes.');
if(preview)console.log('Preview: '+preview);
