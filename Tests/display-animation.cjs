const assert = require('assert/strict');
const vm = require('vm');
const {spawnSync} = require('child_process');
const {readSource:read, readLibrarySource} = require('./sources.cjs');

const mainDefinitions = read('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];

function makeFixture() {
  let now = 1000, reducedMotion = false, motionReadFails = false;
  let timerSetupFails = false, trackingRegistrationFails = false;
  let menuUpdates = 0, visibilityWrites = 0, activeTimers = 0, timerStarts = 0, terminated = 0, refreshes = 0;
  const classes = {}, registrations = [], errors = [], selections = [];
  function option(checked) {
    let hidden=true;
    const item={state:0,enabled:true,view:{state:checked,
      frame:{size:{width:330,height:24}},setFrameSize(){throw new Error('Do not resize a tracking menu row');}}};
    Object.defineProperty(item,'hidden',{get:()=>hidden,set:value=>{hidden=value;visibilityWrites++;}});
    return item;
  }
  const workspace = {};
  Object.defineProperty(workspace,'accessibilityDisplayShouldReduceMotion',{
    get() { if(motionReadFails)throw new Error('Motion setting unavailable');return reducedMotion; }
  });
  const context = vm.createContext({
    Date:class extends Date {static now(){return now;}},
    ObjC:{unwrap:value=>value,registerSubclass:def=>{classes[def.name]=def.methods;}},
    $:Object.assign(value=>value,{
      NSWorkspace:{sharedWorkspace:workspace},
      NSControlStateValueOn:1,NSControlStateValueOff:0,
      NSEventTrackingRunLoopMode:'NSEventTrackingRunLoopMode',
      NSRunLoop:{currentRunLoop:{addTimerForMode(timer,mode){
        assert(timer.active);assert.equal(mode,'NSEventTrackingRunLoopMode');
        if(trackingRegistrationFails)throw new Error('Tracking timer unavailable');
        registrations.push(mode);
      }}},
      NSApplication:{sharedApplication:{terminate(){terminated++;}}}
    }),
    isExiting:false,menuIsOpen:true,statusDisplayMode:'quota',statusDisplayExpanded:false,
    statusDisplayReveal:0,statusDisplayAnimation:{timer:null,from:0,to:0,startedAt:0,duration:0},
    STATUS_DISPLAY_ANIMATION_MS:180,
    STATUS_DISPLAY_OPTIONS:[{mode:'quota',title:'Remaining Quota'},{mode:'icon',title:'Codex Icon'}],
    statusDisplayDisclosureItem:{view:{frame:{size:{width:330,height:24}}}},
    statusDisplayMenuItems:{quota:option(1),icon:option(0)},menu:{},
    delegate:{},
    sendVoid(object,selector){assert.equal(object,context.menu);assert.equal(selector,'update');menuUpdates++;},
    startTransientTimer(timer,interval,selector){
      assert(Math.abs(interval-1/60)<1e-9);assert.equal(selector,'statusDisplayAnimationTimer:');
      if(timer)return timer;
      if(timerSetupFails)throw new Error('Timer setup unavailable');
      timerStarts++;activeTimers++;return {active:true};
    },
    stopTransientTimer(timer){if(timer&&timer.active){timer.active=false;activeTimers--;}return null;},
    setStatusDisplayMode(mode){selections.push(mode);context.statusDisplayMode=mode;},
    logError(component,error){errors.push([component,String(error)]);},
    refreshAllSources(){refreshes++;},
    cancelBackgroundTask(){},stopQuotaRingAnimation(){},stopMaoMaoYunTrafficRead(){},
    usagePollTimer:null,maomaoyunPollTimer:null,maomaoyunReadState:{},maomaoyunActionState:{},
    refreshState:{},runningReadState:{},
    statusIconQuotaFraction:.47,statusIconQuotaTargetFraction:.47,
    quotaRingAnimationTimer:{active:true},quotaRingAnimationStartedAt:123,
    statusIconCurrentColor:{red:.39,green:.85,blue:.60,alpha:1},statusTransitionStartedAt:456
  });
  vm.runInContext(read('menu-rows')+'\n'+read('preferences')+'\n'+mainDefinitions,context);
  const methods=classes.CodexUsageMeterDelegate;
  return {context,methods,selections,errors,registrations,
    advance(ms){now+=ms;context.stepStatusDisplayAnimation();},
    setMotion(value){reducedMotion=value;},failMotion(value){motionReadFails=value;},
    failTimer(value){timerSetupFails=value;},failTracking(value){trackingRegistrationFails=value;},
    stats(){return {activeTimers,timerStarts,menuUpdates,visibilityWrites,terminated,refreshes};},
    press(tag=0){methods['statusDisplayButton:'].implementation({tag});},
    lifecycle(name){methods[name].implementation();}
  };
}

function assertOptions(fixture,hidden) {
  for(const item of Object.values(fixture.context.statusDisplayMenuItems)) {
    assert.equal(item.hidden,hidden);
    assert.equal(item.frame,undefined);
    assert.equal(item.view.frame.size.height,24,'tracking-menu row height stays fixed');
    assert.equal(item.state,0,'custom checks must not create a global native check gutter');
  }
}
function assertSettled(fixture,reveal) {
  assert.equal(fixture.context.statusDisplayReveal,reveal);
  assert.equal(fixture.context.statusDisplayAnimation.timer,null);
  assert.equal(fixture.stats().activeTimers,0);
  assertOptions(fixture,reveal===0);
}
function layoutWrites(fixture) {
  const {menuUpdates,visibilityWrites}=fixture.stats();return {menuUpdates,visibilityWrites};
}

// Existing programmatic menu calls remain immediate. Only a user disclosure
// click starts an animation; no extra timer exists while the section is idle.
{
  const fixture=makeFixture(),ctx=fixture.context;
  assert.equal(ctx.statusDisplayReducedMotion(),false);
  ctx.setStatusDisplayOptionsExpanded(true);
  assertSettled(fixture,1);assert.equal(fixture.stats().timerStarts,0);
  ctx.setStatusDisplayOptionsExpanded(false,false);
  assertSettled(fixture,0);
  fixture.press();
  assert.equal(ctx.statusDisplayExpanded,true);assert.equal(ctx.statusDisplayReveal,0);
  assertOptions(fixture,false);
  assert.equal(fixture.stats().activeTimers,1);
  assert.deepEqual(fixture.registrations,['NSEventTrackingRunLoopMode']);
  const openingLayout=layoutWrites(fixture);
  fixture.advance(90);
  assert(Math.abs(ctx.statusDisplayReveal-.875)<1e-9,'half-time uses cubic ease-out');
  fixture.advance(90);assertSettled(fixture,1);
  assert.deepEqual(layoutWrites(fixture),openingLayout,'timer must only draw, not mutate tracking-menu layout');
  fixture.press();assert.equal(ctx.statusDisplayExpanded,false);assertOptions(fixture,true);
  const closingLayout=layoutWrites(fixture);
  fixture.advance(90);assert(Math.abs(ctx.statusDisplayReveal-.125)<1e-9);
  assertOptions(fixture,true);
  fixture.advance(90);assertSettled(fixture,0);
  assert.deepEqual(layoutWrites(fixture),closingLayout,'collapse hides synchronously; timer animates only the header');
  assert.equal(fixture.stats().timerStarts,2);
}

// Rapid reversal continues from the current visual state, without a flash,
// duplicate timers, preference mutation, or changes to quota/activity animation.
{
  const fixture=makeFixture(),ctx=fixture.context;
  const ring=()=>JSON.stringify([ctx.statusIconQuotaFraction,ctx.statusIconQuotaTargetFraction,
    ctx.quotaRingAnimationTimer,ctx.quotaRingAnimationStartedAt,ctx.statusIconCurrentColor,ctx.statusTransitionStartedAt]);
  const initialRing=ring();
  fixture.press();fixture.advance(70);
  const openingReveal=ctx.statusDisplayReveal;
  fixture.press();assert.equal(ctx.statusDisplayReveal,openingReveal);
  assert.equal(ctx.statusDisplayAnimation.from,openingReveal);assert.equal(ctx.statusDisplayAnimation.to,0);
  assert.equal(fixture.stats().activeTimers,1);assertOptions(fixture,true);
  fixture.advance(35);
  const closingReveal=ctx.statusDisplayReveal;
  assert(closingReveal<openingReveal&&closingReveal>0);
  fixture.press();assert.equal(ctx.statusDisplayReveal,closingReveal);
  assert.equal(ctx.statusDisplayAnimation.from,closingReveal);assert.equal(ctx.statusDisplayAnimation.to,1);
  assert.equal(fixture.stats().activeTimers,1);
  const timer=ctx.statusDisplayAnimation.timer,reveal=ctx.statusDisplayReveal;
  fixture.press(2);
  assert.deepEqual(fixture.selections,['icon']);assert.equal(ctx.statusDisplayMode,'icon');
  assert.equal(ctx.statusDisplayAnimation.timer,timer);assert.equal(ctx.statusDisplayReveal,reveal);
  assert.equal(ctx.statusDisplayMenuItems.icon.view.state,1);assert.equal(ctx.statusDisplayMenuItems.quota.view.state,0);
  fixture.press(2);fixture.press(-1);fixture.press(99);
  assert.deepEqual(fixture.selections,['icon','icon']);
  fixture.advance(360);assertSettled(fixture,1);
  assert.equal(ring(),initialRing);assert.equal(fixture.stats().timerStarts,3);
}

// A click-away close cancels in-flight work. Reopening starts collapsed and
// old callbacks cannot resurrect the options or create orphan timers.
{
  const fixture=makeFixture(),ctx=fixture.context;
  fixture.press();fixture.advance(60);
  fixture.lifecycle('menuDidClose:');assert.equal(ctx.menuIsOpen,false);assertSettled(fixture,0);
  fixture.advance(300);assertSettled(fixture,0);
  fixture.lifecycle('menuWillOpen:');assert.equal(ctx.menuIsOpen,true);assertSettled(fixture,0);
  assert.equal(fixture.stats().refreshes,1);
  fixture.press();fixture.advance(60);
  ctx.tokenHistoryPollTimer=null;ctx.tokenHistoryReadState={task:null};
  ctx.restartMeter();assert.equal(ctx.isExiting,true);assert.equal(fixture.stats().activeTimers,0);
  assert.equal(fixture.stats().terminated,1);
  const reveal=ctx.statusDisplayReveal;fixture.press();
  assert.equal(ctx.statusDisplayReveal,reveal);assert.equal(fixture.stats().activeTimers,0);
}

// Respect system reduced motion. When the setting cannot be read, prefer a
// safe immediate transition rather than making menu controls unusable.
for(const failRead of [false,true]) {
  const fixture=makeFixture();fixture.setMotion(!failRead);fixture.failMotion(failRead);
  assert.equal(fixture.context.statusDisplayReducedMotion(),true);
  fixture.press();assertSettled(fixture,1);
  fixture.press();assertSettled(fixture,0);
  assert.equal(fixture.stats().timerStarts,0);
}

// A system preference change or a clock correction during a transition must
// settle cleanly instead of leaving partially visible options indefinitely.
{
  const fixture=makeFixture();
  fixture.press();fixture.advance(45);fixture.setMotion(true);
  fixture.advance(5);assertSettled(fixture,1);
  fixture.setMotion(false);fixture.press();fixture.advance(45);
  fixture.advance(-100);assertSettled(fixture,0);
}

// Timer creation or explicit tracking-mode registration may fail on another
// macOS bridge. Both cases settle on the requested layout and clean up fully.
for(const failTracking of [false,true]) {
  const fixture=makeFixture();
  if(failTracking)fixture.failTracking(true);else fixture.failTimer(true);
  fixture.press();assert.equal(fixture.context.statusDisplayExpanded,true);assertSettled(fixture,1);
  fixture.press();assert.equal(fixture.context.statusDisplayExpanded,false);assertSettled(fixture,0);
}
console.log('Disclosure animation checks passed: easing, reversal, selection, lifecycle, reduced motion and timer failures.');

// Exercise the actual JXA/AppKit timer in NSEventTrackingRunLoopMode. This
// fixture never opens a real app menu or reads/mutates the user's preferences,
// quota, VPN, tasks, or currently running installed widget.
const nativeFixture=`
${mainDefinitions}
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
delegate=$.CodexUsageMeterDelegate.alloc.init;
statusItem={};buildMenu();menuIsOpen=true;
statusDisplayReducedMotion=function(){return false;};
setPreferencesExpanded(true, false);
setStatusDisplayMode=function(mode){statusDisplayMode=mode;updateStatusDisplayMenu();};
function rows(){return ['quota','icon'].map(function(mode){
  var item=statusDisplayMenuItems[mode];return {hidden:!!item.hidden,state:Number(item.state),
    buttonState:Number(item.view.state),height:Number(item.view.frame.size.height)};
});}
function runTracking(seconds){var end=Date.now()+seconds*1000;
  while(Date.now()<end)$.NSRunLoop.currentRunLoop.runModeBeforeDate(
    $.NSEventTrackingRunLoopMode,$.NSDate.dateWithTimeIntervalSinceNow(0.02));
}
statusDisplayDisclosureItem.view.performClick($());
var started={reveal:statusDisplayReveal,timer:!!statusDisplayAnimation.timer,rows:rows()};
runTracking(0.07);var mid=statusDisplayReveal;
statusDisplayMenuItems.icon.view.performClick($());
var selected={mode:statusDisplayMode,rows:rows()};
runTracking(0.22);var expanded={reveal:statusDisplayReveal,timer:!!statusDisplayAnimation.timer,rows:rows()};
statusDisplayDisclosureItem.view.performClick($());
runTracking(0.07);var closing=statusDisplayReveal;
runTracking(0.22);var collapsed={reveal:statusDisplayReveal,timer:!!statusDisplayAnimation.timer,rows:rows()};
var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,24));
sendVoid(image,'lockFocus');
[0,0.5,1].forEach(function(reveal){statusDisplayReveal=reveal;
  [statusDisplayDisclosureItem,statusDisplayMenuItems.quota,statusDisplayMenuItems.icon].forEach(function(item){
    item.view.drawRect(item.view.bounds);
  });
});sendVoid(image,'unlockFocus');finishStatusDisplayAnimation(0);
JSON.stringify({started:started,mid:mid,selected:selected,expanded:expanded,closing:closing,collapsed:collapsed,
  imageSize:{width:Number(image.size.width),height:Number(image.size.height)}});
`;
const result=spawnSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+nativeFixture],
  {encoding:'utf8',timeout:15000});
assert.equal(result.status,0,result.stderr||result.error?.message||'Native disclosure animation test failed');
const native=JSON.parse(result.stdout);
assert.equal(native.started.reveal,0);assert.equal(native.started.timer,true);
assert(native.started.rows.every(row=>!row.hidden));
assert(native.mid>0&&native.mid<1,'timer must advance inside native menu tracking mode');
assert.equal(native.selected.mode,'icon');assert.deepEqual(native.selected.rows.map(row=>row.buttonState),[0,1]);
assert.equal(native.expanded.reveal,1);assert.equal(native.expanded.timer,false);
assert(native.expanded.rows.every(row=>!row.hidden));
assert(native.closing>0&&native.closing<1);
assert.equal(native.collapsed.reveal,0);assert.equal(native.collapsed.timer,false);
assert(native.collapsed.rows.every(row=>row.hidden));
for(const snapshot of [native.started,native.selected,native.expanded,native.collapsed]) {
  assert(snapshot.rows.every(row=>row.height===24&&row.state===0));
}
assert.deepEqual(native.imageSize,{width:288,height:24});
console.log('Native disclosure animation checks passed: tracking-loop timer, real radio clicks, fixed rows and interpolated rendering.');
