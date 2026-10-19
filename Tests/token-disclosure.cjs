const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
assert.match(readSource('state'),/TOKEN_ACTIVITY_ANIMATION_MS=500;/);

function fixture(){
  let now=1000,reduced=false,failTimer=false,failTracking=false,active=0,starts=0,updates=0,writes=0,refreshes=0,terminated=0,shownReveals=[];
  const classes={},errors=[];
  const header={hidden:false,enabled:true,view:{enabled:true},isEqual(item){return item===header;}};
  let hidden=true;
  const chart={view:{}};Object.defineProperty(chart,'hidden',{get:()=>hidden,set:v=>{hidden=v;writes++;if(!v)shownReveals.push(ctx.tokenMeterReveal);}});
  const ctx=vm.createContext({
    Date:class extends Date{static now(){return now;}},
    ObjC:{registerSubclass:def=>{classes[def.name]=def.methods;}},registerMenuViewSubclass(){},uiText:s=>s,
    $:{NSEventTrackingRunLoopMode:'tracking',NSRunLoop:{currentRunLoop:{addTimerForMode(timer,mode){
      assert.equal(mode,'tracking');assert(timer.active);if(failTracking)throw Error('Tracking unavailable');
    }}},NSApplication:{sharedApplication:{terminate(){terminated++;}}}},
    isExiting:false,menuIsOpen:true,menu:{},tokenMeterDisclosureItem:header,tokenMeterItem:chart,tokenMeterView:chart.view,
    tokenMeterExpanded:false,tokenMeterReveal:0,tokenMeterAnimation:{timer:null,from:0,to:0,arrowFrom:0,arrowReveal:0,startedAt:0},TOKEN_ACTIVITY_ANIMATION_MS:500,
    usageActivityDays:7,tokenActivityRangeButtons:[],TOKEN_ACTIVITY_RANGE_ANIMATION_MS:220,
    tokenActivityRangeAnimation:{value:0,from:0,to:0,startedAt:0},
    statusDisplayReducedMotion:()=>reduced,pruneMenuRowHover(){},
    menuRowItemForControl:sender=>sender===header.view?header:null,
    sendVoid(object,selector){assert.equal(object,ctx.menu);assert.equal(selector,'update');updates++;},
    startTransientTimer(timer,interval,selector){assert.equal(interval,1/60);assert.equal(selector,'tokenMeterAnimationTimer:');
      assert.equal(timer,null);if(failTimer)throw Error('Timer unavailable');active++;starts++;return {active:true};},
    stopTransientTimer(timer){if(timer?.active){timer.active=false;active--;}return null;},
    logError:(component,error)=>errors.push(component),
    setStatusDisplayOptionsExpanded(){},setPreferencesExpanded(){},stopStatusDisplayAnimation(){},
    refreshAllSources(){refreshes++;},cancelBackgroundTask(){},stopQuotaRingAnimation(){},stopMaoMaoYunTrafficRead(){},
    usagePollTimer:null,maomaoyunPollTimer:null,maomaoyunReadState:{},maomaoyunActionState:{},refreshState:{},runningReadState:{},
    tokenHistoryPollTimer:null,tokenHistoryReadState:{}
  });
  vm.runInContext(readSource('meter-panels')+'\n'+definitions,ctx);
  const methods=classes.CodexUsageMeterDelegate;
  return {ctx,header,chart,errors,advance(ms){now+=ms;ctx.stepTokenMeterAnimation();},
    selectRange(days){
      if(ctx.tokenMeterAnimation.timer)ctx.stepTokenMeterAnimation();
      ctx.stopTokenMeterAnimation();ctx.beginTokenActivityRangeAnimation(days);ctx.usageActivityDays=days;ctx.tokenMeterReveal=0;
      ctx.setTokenMeterExpanded(true,true);
    },
    press(){methods['tokenMeterButton:'].implementation(header.view);},
    lifecycle(name){methods[name].implementation();},motion(v){reduced=v;},
    failTimer(){failTimer=true;},failTracking(){failTracking=true;},
    stats:()=>({active,starts,updates,writes,refreshes,terminated,shownReveals})};
}
function settled(f,expanded){
  assert.equal(f.ctx.tokenMeterExpanded,expanded);assert.equal(f.chart.hidden,!expanded);
  assert.equal(f.ctx.tokenMeterReveal,expanded?1:0);assert.equal(f.ctx.tokenMeterAnimation.timer,null);assert.equal(f.stats().active,0);
  assert.equal(f.ctx.tokenMeterArrowReveal(),expanded?1:0);
  assert.equal(f.ctx.tokenActivityRangePosition(),f.ctx.usageActivityDays===30?1:0);
}
{
  const f=fixture();f.press();f.advance(500);settled(f,true);
  const writes=f.stats().writes,reads=f.stats().refreshes;
  f.selectRange(30);assert.equal(f.ctx.tokenActivityRangePosition(),0,'logical selection changes before the visible thumb moves');
  assert.equal(f.stats().active,1,'range motion shares the existing chart timer');
  f.advance(55);assert.equal(f.ctx.tokenActivityRangePosition(),.15625,'220ms smoothstep, not an instant swap');
  f.advance(55);assert.equal(f.ctx.tokenActivityRangePosition(),.5);
  const before=f.ctx.tokenActivityRangePosition();f.selectRange(7);
  assert.equal(f.ctx.tokenActivityRangePosition(),before,'a rapid reverse starts from the exact current position');
  f.advance(110);assert.equal(f.ctx.tokenActivityRangePosition(),.25,'the thumb flows back instead of snapping to an endpoint');
  f.advance(110);assert.equal(f.ctx.tokenActivityRangePosition(),0);assert(f.ctx.tokenMeterReveal<1,'range thumb settles without shortening chart replay');
  f.advance(280);settled(f,true);
  assert.equal(f.stats().writes,writes+2,'only the two selection actions update row visibility, never animation frames');
  assert.equal(f.stats().refreshes,reads,'sliding never starts source reads');
  f.selectRange(30);f.advance(30);f.press();assert.equal(f.ctx.tokenActivityRangePosition(),1,'hidden controls settle to the real selection');
  f.lifecycle('menuDidClose:');settled(f,false);
}
for(const failure of ['motion','timer','tracking','clock']){
  const f=fixture();f.press();f.advance(500);
  if(failure==='motion')f.motion(true);else if(failure==='timer')f.failTimer();else if(failure==='tracking')f.failTracking();
  f.selectRange(30);if(failure==='clock')f.advance(-10);
  settled(f,true);
}
{
  const f=fixture(),duration=f.ctx.TOKEN_ACTIVITY_ANIMATION_MS;
  f.press();f.advance(duration);settled(f,true);
  f.press();f.advance(20);assert(f.ctx.tokenMeterReveal>0,'collapse is still in progress');
  const arrow=f.ctx.tokenMeterArrowReveal();
  f.press();assert.equal(f.ctx.tokenMeterReveal,0,'every reopening must replay data from the beginning, not resume the hidden collapse');
  assert.equal(f.stats().shownReveals.at(-1),0,'data resets before the native row is shown, so completed bars cannot flash first');
  assert.equal(f.ctx.tokenMeterArrowReveal(),arrow,'the arrow stays continuous while chart data restarts');
  assert.equal(f.ctx.tokenMeterAnimation.from,0);
  f.advance(duration/2);assert.equal(f.ctx.tokenMeterReveal,.5,'reopening gets the full animation duration');
  f.advance(duration/2);settled(f,true);
}
{
  const f=fixture();settled(f,false);assert.equal(f.stats().starts,0);
  f.press();assert(!f.chart.hidden);assert.equal(f.ctx.tokenMeterReveal,0);assert.equal(f.stats().active,1);
  const writes=f.stats().writes,updates=f.stats().updates;
  f.advance(250);assert.equal(f.ctx.tokenMeterReveal,.5);
  assert.equal(f.stats().writes,writes);assert.equal(f.stats().updates,updates,'animation frames only repaint');
  f.advance(250);settled(f,true);f.press();assert(f.chart.hidden,'collapse is synchronous while tracking');
  const closedWrites=f.stats().writes;f.advance(250);assert.equal(f.ctx.tokenMeterReveal,.5);
  f.advance(250);settled(f,false);assert.equal(f.stats().writes,closedWrites);
  assert.equal(f.stats().refreshes,0,'a disclosure click never starts a reader');
}
{
  const f=fixture();f.press();f.advance(50);const mid=f.ctx.tokenMeterReveal;
  f.press();assert.equal(f.ctx.tokenMeterAnimation.from,mid);assert.equal(f.stats().active,1);
  f.advance(30);const reversing=f.ctx.tokenMeterReveal;assert(reversing>0&&reversing<mid);
  f.press();assert.equal(f.ctx.tokenMeterAnimation.from,0);assert.equal(f.ctx.tokenMeterAnimation.arrowFrom,reversing);
  f.advance(500);settled(f,true);
  f.press();f.advance(30);f.lifecycle('menuDidClose:');settled(f,false);
  f.advance(300);settled(f,false);f.lifecycle('menuWillOpen:');settled(f,false);assert.equal(f.stats().refreshes,1);
  f.press();f.advance(20);f.ctx.restartMeter();assert.equal(f.stats().active,0);assert.equal(f.stats().terminated,1);
  const before=f.ctx.tokenMeterExpanded;f.press();assert.equal(f.ctx.tokenMeterExpanded,before,'no actions during shutdown');
}
for(const failure of ['motion','timer','tracking']){
  const f=fixture();if(failure==='motion')f.motion(true);else if(failure==='timer')f.failTimer();else f.failTracking();
  f.press();settled(f,true);f.press();settled(f,false);
}
{
  const f=fixture();f.press();f.advance(20);f.motion(true);f.advance(10);settled(f,true);
  f.motion(false);f.press();f.advance(-100);settled(f,false);
  f.header.view.enabled=false;f.press();settled(f,false);f.header.view.enabled=true;
  f.header.hidden=true;f.press();settled(f,false);f.header.hidden=false;
  f.ctx.menuIsOpen=false;f.press();settled(f,false);f.ctx.menuIsOpen=true;
  assert.equal(f.ctx.tokenMeterButtonPressed({enabled:true}),false,'detached controls cannot mutate this menu');
}
console.log('Token disclosure model passed: complete 500ms data replay on reopen, independently continuous arrow, no timer layout writes or reads, lifecycle cleanup, reduced motion and failure guards.');

const preview=process.argv.includes('--preview')?fs.mkdtempSync(path.join(os.tmpdir(),'codex-token-disclosure-')):null;
const nativeFixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
refreshAllSources=function(){};statusDisplayReducedMotion=function(){return false;};
var initial={expanded:tokenMeterExpanded,reveal:tokenMeterReveal,hidden:!!tokenMeterItem.hidden,timer:!!tokenMeterAnimation.timer,
 headerHeight:Number(tokenMeterDisclosureItem.view.frame.size.height),chartHeight:Number(tokenMeterView.frame.size.height)};
usageAccountId='token-disclosure-fixture';tokenMeterSync='ready';
var today=new Date(),end=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
tokenMeterSnapshot={version:3,source:'profile',accountId:usageAccountId,savedAt:Date.now()/1000,days:[]};
for(var d=0;d<30;d++)tokenMeterSnapshot.days.push({date:new Date(end-(29-d)*86400000).toISOString().slice(0,10),tokens:(d+1)*100000000});
refreshTokenMeterMenu(true);menuIsOpen=true;
function runTracking(seconds){var until=Date.now()+seconds*1000;while(Date.now()<until)
 $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSEventTrackingRunLoopMode,$.NSDate.dateWithTimeIntervalSinceNow(.01));}
function snapshot(){return {expanded:tokenMeterExpanded,reveal:tokenMeterReveal,hidden:!!tokenMeterItem.hidden,timer:!!tokenMeterAnimation.timer};}
var files=[],frames=[],auxiliary=[];
function recordAuxiliary(){auxiliary.push({hidden:!!tokenMeterItem.hidden,chartHeight:Number(tokenMeterView.frame.size.height)});}
recordAuxiliary();
function paint(name){
 var height=24+(tokenMeterItem.hidden?0:Number(tokenMeterView.frame.size.height)),image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH*2,height*2));sendVoid(image,'lockFocus');
 var scale=$.NSAffineTransform.transform;scale.scaleXByYBy(2,2);sendVoid(scale,'concat');
 sendVoid($.NSColor.colorWithCalibratedWhiteAlpha(.17,1),'setFill');$.NSRectFill($.NSMakeRect(0,0,MENU_WIDTH,height));
 $.NSGraphicsContext.saveGraphicsState;var move=$.NSAffineTransform.transform;move.translateXByYBy(0,height-24);sendVoid(move,'concat');
 tokenMeterDisclosureItem.view.drawRect(tokenMeterDisclosureItem.view.bounds);$.NSGraphicsContext.restoreGraphicsState;
 if(!tokenMeterItem.hidden)tokenMeterView.drawRect(tokenMeterView.bounds);sendVoid(image,'unlockFocus');
 var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),factor=Number(rep.pixelsWide)/MENU_WIDTH;
 var cells=usageActivityColumns(usageActivityPresentation(),MENU_WIDTH).cells,sample=cells[4],sampleY=height>24?sample.y+10:12;
 var color=rep.colorAtXY(Math.floor(sample.center*factor),Math.floor((height-sampleY)*factor)).colorUsingColorSpace($.NSColorSpace.genericRGBColorSpace);
 var columns=cells.map(function(cell){
  return Number(rep.colorAtXY(Math.floor(cell.center*factor),Math.floor((height>24?height-cell.y-10:12)*factor))
    .colorUsingColorSpace($.NSColorSpace.genericRGBColorSpace).blueComponent);
 });
 frames.push({name:name,height:height,ink:Number(color.redComponent)+Number(color.greenComponent)+Number(color.blueComponent),columns:columns});
 ${preview?`var file=${JSON.stringify(preview)}+'/'+name+'.png';rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(file,true);files.push(file);`:''}
}
paint('collapsed');tokenMeterDisclosureItem.view.performClick($());var opening=snapshot();recordAuxiliary();
runTracking(.05);var mid=snapshot();paint('opening');runTracking(.55);var expanded=snapshot();paint('expanded');
tokenMeterReveal=0;paint('wave-start');tokenMeterReveal=.125;paint('wave-left');
tokenMeterReveal=.5;paint('wave-middle');tokenMeterReveal=.975;paint('wave-right');tokenMeterReveal=1;
var ax=!!tokenMeterDisclosureItem.view.accessibilityPerformPress;runTracking(.05);var closing=snapshot();
runTracking(.55);var collapsed=snapshot();recordAuxiliary();
tokenMeterDisclosureItem.view.performClick($());runTracking(.03);delegate.menuDidClose(menu);var closed=snapshot();
delegate.tokenMeterAnimationTimer($());delegate.menuWillOpen(menu);var reopened=snapshot();
tokenMeterSync='error';refreshTokenMeterMenu(true);var afterRefresh=snapshot();
// Reopen the entire native menu and then rapidly reopen its disclosure twice.
// Each run gets a fresh data clock; the arrow must not jump back with the data.
tokenMeterSync='ready';refreshTokenMeterMenu(true);var replays=[];
for(var replayIndex=0;replayIndex<3;replayIndex++){
 if(replayIndex){setTokenMeterExpanded(false,true);runTracking(.02);}
 var arrowBefore=tokenMeterArrowReveal();setTokenMeterExpanded(true,true);
 var replayStart=snapshot(),arrowContinuous=Math.abs(tokenMeterArrowReveal()-arrowBefore)<.02;
 runTracking(.04);var replayMid=snapshot();if(replayIndex===1)paint('replay-opening');
 runTracking(.55);replays.push({start:replayStart,mid:replayMid,end:snapshot(),arrowContinuous:arrowContinuous});
}
// Real whole-row hit testing and NSEvent dispatch. No visible window or global
// mouse motion; the queued release outside the row must not cancel mouse-down.
function event(type,x,y){return $.NSEvent.mouseEventWithTypeLocationModifierFlagsTimestampWindowNumberContextEventNumberClickCountPressure(
 type,$.NSMakePoint(x,y),0,0,0,null,1,1,1);}
function click(button,x){$.NSApplication.sharedApplication.postEventAtStart(event($.NSEventTypeLeftMouseUp,500,100),true);
 button.mouseDown(event($.NSEventTypeLeftMouseDown,x,12));}
var hits=[],toggles=[],button=tokenMeterDisclosureItem.view;
['zh-CN','en'].forEach(function(code){uiLanguage=code;refreshTokenMeterMenu(true);
 [1,20,160,MENU_WIDTH-20,MENU_WIDTH-1,-1,MENU_WIDTH+1].forEach(function(x){
  var hit=Number(button.cell.hitTestForEventInRectOfView(event($.NSEventTypeLeftMouseDown,x,12),button.bounds,button));hits.push({x:x,hit:hit});
 });
 for(var n=0;n<10;n++){var before=tokenMeterExpanded;click(button,n%2?MENU_WIDTH-20:20);toggles.push(tokenMeterExpanded!==before);}
});
setTokenMeterExpanded(false,false);button.enabled=false;var disabled=!!button.accessibilityPerformPress;click(button,MENU_WIDTH-20);button.enabled=true;
var disabledState=snapshot(),label=ObjC.unwrap(button.accessibilityLabel);
tokenMeterDisclosureItem.hidden=true;var hiddenPress=!!button.accessibilityPerformPress;tokenMeterDisclosureItem.hidden=false;
delegate.menuDidClose(menu);recordAuxiliary();
JSON.stringify({initial:initial,opening:opening,mid:mid,expanded:expanded,ax:ax,closing:closing,collapsed:collapsed,replays:replays,
 closed:closed,reopened:reopened,afterRefresh:afterRefresh,hits:hits,toggles:toggles,disabled:disabled,disabledState:disabledState,
 hiddenPress:hiddenPress,label:label,final:snapshot(),frames:frames,files:files,auxiliary:auxiliary});
`;
const result=spawnSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+nativeFixture],
  {encoding:'utf8',timeout:20000,maxBuffer:256000});
assert.equal(result.status,0,result.stderr||result.error?.message||'Native token disclosure failed');
const native=JSON.parse(result.stdout);
assert.deepEqual(native.initial,{expanded:false,reveal:0,hidden:true,timer:false,headerHeight:24,chartHeight:160});
assert(native.opening.expanded&&!native.opening.hidden&&native.opening.timer);
assert(native.mid.reveal>0&&native.mid.reveal<1,'animation advances in native menu tracking mode');
assert.equal(native.expanded.reveal,1);assert.equal(native.expanded.timer,false);assert(native.ax);
assert(native.auxiliary.every(s=>s.chartHeight===160),'the combined chart keeps one fixed native row through disclosure/lifecycle changes');
assert(native.closing.reveal>0&&native.closing.reveal<1&&native.closing.hidden);
assert.equal(native.replays.length,3);
for(const replay of native.replays){
 assert.equal(replay.start.reveal,0,'every real reopen starts at zero');assert(replay.start.timer&&!replay.start.hidden);
 assert(replay.mid.reveal>0&&replay.mid.reveal<.5,'real reopen keeps the full 500ms duration, not just the last few percent');
 assert.equal(replay.end.reveal,1);assert.equal(replay.end.timer,false);assert(replay.arrowContinuous);
}
for(const key of ['collapsed','closed','reopened','afterRefresh','disabledState','final'])
  assert.deepEqual(native[key],{expanded:false,reveal:0,hidden:true,timer:false},key);
assert(!native.disabled&&!native.hiddenPress);assert(native.toggles.every(Boolean),'all twenty real mouse-downs toggle exactly once');
for(const hit of native.hits)assert.equal(!!(hit.hit&4),hit.x>=0&&hit.x<288,'whole-row native hit test');
assert(native.label.includes('Collapsed'),'disclosure state stays localized and accessible');
assert.equal(native.frames[0].height,24);assert.equal(native.frames[1].height,184);
assert(native.frames[1].ink<native.frames[2].ink-.005,'the actual chart fades into its final pixels');
const byName=Object.fromEntries(native.frames.map(frame=>[frame.name,frame]));
const blank=byName['wave-start'].columns,full=byName.expanded.columns;
const amount=(name,column)=>(byName[name].columns[column]-blank[column])/(full[column]-blank[column]);
assert(amount('wave-left',0)>.4);assert(Math.abs(amount('wave-left',6))<.01,'rightmost bar stays absent at the start');
assert(amount('wave-middle',0)>.97,'leftmost bar nearly settles before later columns');
assert(amount('wave-middle',3)>.3&&amount('wave-middle',3)<.7,'the middle date is visibly mid-growth');
assert(Math.abs(amount('wave-middle',6))<.01,'both series wait for the final date');
assert(Math.abs(amount('wave-right',0)-1)<.01&&amount('wave-right',6)>.9&&amount('wave-right',6)<1);
assert(amount('replay-opening',0)>.1&&Math.abs(amount('replay-opening',6))<.01,'real replay pixels show the first bar again and clear the previously finished last bar');
console.log('Native combined disclosure passed: staggered bar pixels, whole-row clicks/AX, twenty reversals, tracking-mode frames, one fixed row and lifecycle cleanup; no windows or readers.');
if(native.files.length)console.log('Previews:',JSON.stringify(native.files));
