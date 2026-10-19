const assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('./sources.cjs');
const methods={},errors=[];let active=0,starts=0,ticks=0,paints=0,dotPaints=0,failStart=false,failMode=false;
const nil=Symbol('native nil'),point={x:-80,y:810};
const ctx=vm.createContext({
  ObjC:{unwrap:v=>v,registerSubclass:def=>Object.assign(methods,def.methods)},
  $:Object.assign(()=>nil,{
    NSEvent:{mouseLocation:point},NSEventTrackingRunLoopMode:'tracking',
    NSRunLoop:{currentRunLoop:{addTimerForMode(timer,mode){
      assert(timer.active);assert.equal(mode,'tracking');if(failMode)throw Error('Unavailable mode');
    }}}
  }),menuIsOpen:false,isExiting:false,maomaoyunStatus:'connected',
  vpnAppButton:{set needsDisplay(value){assert.equal(value,true);dotPaints++;}},
  startTransientTimer(timer,interval,selector){
    assert.equal(interval,.15);assert.equal(selector,'menuTrackingTimer:');
    if(failStart)throw Error('Unavailable timer');assert.equal(timer,null);
    starts++;active++;return {active:true};
  },
  stopTransientTimer(timer){if(timer?.active){timer.active=false;active--;}return null;},
  reconcileMenuRowHover(){ticks++;},flushMenuViewCallbacks(){paints++;},
  logError:(component,error)=>errors.push([component,String(error)])
});
vm.runInContext(readSource('menu-tracking')+'\n'+readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0],ctx);
ctx.startMenuTracking();assert.equal(active,0,'closed menus have no pointer polling');
ctx.menuIsOpen=true;ctx.startMenuTracking();const first=ctx.menuTrackingTimer;
ctx.startMenuTracking();assert.equal(active,1);assert.equal(starts,1);assert.equal(ctx.menuTrackingTimer,first);
methods['menuTrackingTimer:'].implementation();assert.equal(ticks,1);assert.equal(paints,1);
assert.equal(dotPaints,0,'menu maintenance does not animate the static dot');
ctx.menuIsOpen=false;methods['menuTrackingTimer:'].implementation();
assert.equal(active,0);assert.equal(ctx.menuTrackingTimer,null);assert.equal(ticks,1);
assert.equal(dotPaints,0,'closed menus do not animate');
ctx.menuIsOpen=true;ctx.startMenuTracking();assert.notEqual(ctx.menuTrackingTimer,first);
methods['menuTrackingTimer:'].implementation();assert.equal(active,1);assert.equal(dotPaints,0,'reopening keeps the connected dot static');
ctx.isExiting=true;methods['menuTrackingTimer:'].implementation();assert.equal(active,0);
assert.equal(dotPaints,0);
assert.equal(ctx.vpnStatusDotTimer,undefined);assert.equal(ctx.updateVPNStatusDotAnimation,undefined);
assert.equal(methods['vpnStatusDotAnimationTimer:'],undefined,'the dedicated animation callback is removed');
ctx.startMenuTracking();assert.equal(active,0);ctx.isExiting=false;
for(const mode of ['start','registration']){
  failStart=mode==='start';failMode=mode==='registration';
  ctx.startMenuTracking();assert.equal(active,0);assert.equal(ctx.menuTrackingTimer,null);
}
assert.equal(errors.length,2);failStart=failMode=false;
ctx.startMenuTracking();ctx.stopMenuTracking();ctx.stopMenuTracking();assert.equal(active,0);
assert.equal(methods['statusToolTipTimer:'],undefined);
assert.equal(methods['menuToolTipTimer:'],undefined);

// Preserve native screen-space geometry, including monitors left of the main
// screen, without a tooltip registry or reading the real mouse in this test.
const rect={origin:{x:-100,y:800},size:{width:100,height:24}};
const view={bounds:{},hiddenOrHasHiddenAncestor:false,window:{visible:true,convertRectToScreen:r=>r},
  convertRectToView(bounds,destination){assert.equal(destination,nil);return rect;}};
assert.equal(ctx.menuTrackingViewRect(view),rect);assert.equal(ctx.menuTrackingMouseState().point,point);
view.hiddenOrHasHiddenAncestor=true;assert.equal(ctx.menuTrackingViewRect(view),null);
view.hiddenOrHasHiddenAncestor=false;view.window.visible=false;assert.equal(ctx.menuTrackingViewRect(view),null);
view.window=null;assert.equal(ctx.menuTrackingViewRect(view),null);
console.log('Menu tracking passed: static connected dot without an animation timer, unchanged 150ms maintenance, close/reopen/exit cleanup and screen geometry.');
