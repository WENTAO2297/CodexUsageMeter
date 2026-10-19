const assert=require('node:assert/strict');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');

// JXA's Objective-C getters can pump AppKit events before returning. Model
// that explicitly: an exit/new entry may run halfway through a hover query.
// No windows, installed process, real preferences, tasks or VPN are touched.
function fixture(){
  const classes={},errors=[];
  const ctx=vm.createContext({
    ObjC:{unwrap:v=>v,registerSubclass:def=>{classes[def.name]=def.methods;}},
    $:Object.assign(v=>v,{CodexUsageMeterMenuRowButton:{},NSEvent:{mouseLocation:{x:20,y:12}}}),
    menuIsOpen:true,isExiting:false,menu:null,
    logError:(component,error)=>errors.push([component,String(error)])
  });
  vm.runInContext(readSource('menu-rows'),ctx);
  function row(){
    const view={enabled:true,needsDisplay:false,superview:null,isKindOfClass:()=>true,isEqual:other=>view===other};
    const item={view,enabled:true,hidden:false};return {view,item};
  }
  ctx.menuTrackingMouseState=()=>({point:{x:20,y:12},buttons:0});
  ctx.menuTrackingViewRect=()=>({inside:true});
  ctx.$.NSPointInRect=(point,rect)=>rect.inside;
  return {ctx,classes,errors,row,
    hover(r){ctx.menuRowHover={view:r.view,item:r.item,nativeSelection:false,point:{x:20,y:12}};}};
}

{
  const f=fixture(),r=f.row();f.hover(r);
  Object.defineProperty(r.item,'hidden',{get(){f.ctx.clearMenuRowHover();return false;}});
  assert.doesNotThrow(()=>f.ctx.pruneMenuRowHover(),
    'a reentrant exit during a native hidden getter must not dereference the cleared global owner');
  assert.equal(f.ctx.menuRowHover.view,null);
}

// A delayed callback may discard only its own snapshot, never a newer row.
for(const source of ['hidden','enabled','position','exit','invalidation','entry']){
  const f=fixture(),old=f.row(),next=f.row();f.hover(old);
  f.ctx.menuRowItemForControl=view=>view===old.view?old.item:next.item;
  let fired=false;
  function enter(){if(fired)return;fired=true;f.ctx.setMenuRowHoverControl(next.view);}
  if(source==='hidden')Object.defineProperty(old.item,'hidden',{get(){enter();return true;}});
  if(source==='enabled')Object.defineProperty(old.view,'enabled',{get(){enter();return false;}});
  if(source==='position')f.ctx.menuTrackingViewRect=()=>{enter();return null;};
  if(source==='exit')old.view.isEqual=()=>{enter();return true;};
  if(source==='invalidation')Object.defineProperty(old.view,'superview',{get(){enter();return null;}});
  if(source==='entry')Object.defineProperty(old.view,'isKindOfClass',{get(){enter();return ()=>true;}});
  assert.doesNotThrow(()=>{
    if(source==='position')f.ctx.reconcileMenuRowHover();
    else if(source==='exit')f.classes.CodexUsageMeterMenuRowButton['mouseExited:'].implementation.call(old.view);
    else if(source==='invalidation')f.ctx.clearMenuRowHover();
    else if(source==='entry')f.ctx.setMenuRowHoverControl(old.view);
    else f.ctx.pruneMenuRowHover();
  },source);
  assert.equal(f.ctx.menuRowHover.view,next.view,source+' must preserve the newer owner');
}

// Paint must not perform screen/hover reconciliation or request native redraw.
{
  const f=fixture(),r=f.row();f.hover(r);let fills=0;
  f.ctx.reconcileMenuRowHover=()=>{throw new Error('Paint must be read-only');};
  f.ctx.$.NSMakeRect=(...args)=>args;
  f.ctx.$.NSBezierPath={bezierPathWithRoundedRectXRadiusYRadius:()=>({})};
  f.ctx.$.NSColor={whiteColor:{colorWithAlphaComponent:()=>({})}};
  f.ctx.sendVoid=()=>{fills++;};
  r.view.bounds={size:{width:320,height:24}};
  const owner=f.ctx.menuRowHover;
  assert.equal(f.ctx.drawMenuRowHighlight(r.view,1),true);
  assert.equal(f.ctx.menuRowHover,owner);assert.equal(r.view.needsDisplay,false);assert.equal(fills,2);
}

// All production menu draw callbacks share the boundary, not only preference
// buttons. Transient errors are bounded/deferred; the next paint can recover.
{
  const f=fixture(),r=f.row();
  for(const methods of Object.values(f.classes)){
    if(!methods['drawRect:'])continue;
    assert.doesNotThrow(()=>methods['drawRect:'].implementation.call(r.view));
  }
  assert(f.ctx.menuViewCallbacks.failures.length>0);
  assert.equal(f.errors.length,0,'diagnostic file I/O must be deferred out of drawRect');
  assert.equal(f.ctx.menuViewCallbacks.drawing,false);
  f.ctx.flushMenuViewCallbacks();
  assert(f.errors.length>0);assert.equal(f.ctx.menuViewCallbacks.failures.length,0);
  assert.equal(r.view.needsDisplay,true);
  let paints=0;
  f.ctx.registerMenuViewSubclass({name:'FixturePaint',methods:{'drawRect:':{implementation(){paints++;}}}});
  f.classes.FixturePaint['drawRect:'].implementation.call(r.view);
  assert.equal(paints,1,'previous callback failure must release the painting guard');
}

{
  const f=fixture(),outer=f.row(),inner=f.row();let paints=0,nestedPaints=0;
  f.ctx.registerMenuViewSubclass({name:'NestedPaint',methods:{'drawRect:':{implementation(){nestedPaints++;}}}});
  f.ctx.registerMenuViewSubclass({name:'OuterPaint',methods:{'drawRect:':{implementation(){
    paints++;f.classes.NestedPaint['drawRect:'].implementation.call(inner.view);
    f.ctx.clearMenuRowHover();
    assert.equal(inner.view.needsDisplay,false,'nested drawing does not invalidate native views');
    assert.equal(outer.view.needsDisplay,false,'hover changes during painting defer invalidation');
  }}}});
  f.hover(outer);
  f.classes.OuterPaint['drawRect:'].implementation.call(outer.view);
  assert.equal(paints,1);assert.equal(nestedPaints,0);
  assert.equal(f.ctx.menuRowHover.view,null);
  f.ctx.flushMenuViewCallbacks();
  assert.equal(inner.view.needsDisplay,true);assert.equal(outer.view.needsDisplay,true);
  f.classes.NestedPaint['drawRect:'].implementation.call(inner.view);
  assert.equal(nestedPaints,1);assert.equal(f.errors.length,0);
  // Cancelled/closed menus drop pending paints; no orphan native work survives.
  f.ctx.deferMenuViewRedraw(inner.view);inner.view.needsDisplay=false;f.ctx.menuIsOpen=false;
  f.ctx.flushMenuViewCallbacks();assert.equal(inner.view.needsDisplay,false);
  assert.equal(f.ctx.menuViewCallbacks.redraws.length,0);
}

// Detached native views / failed geometry cannot escape a tracking callback.
{
  const f=fixture(),r=f.row();f.hover(r);
  Object.defineProperty(r.view,'superview',{get(){throw new Error('Detached view');}});
  assert.doesNotThrow(()=>f.ctx.clearMenuRowHover());
  assert.equal(f.ctx.menuRowHover.view,null);
  f.ctx.menuViewCallbacks.drawing=true;
  for(let i=0;i<100;i++){
    f.ctx.deferMenuViewRedraw(f.row().view);
    f.ctx.noteMenuViewFailure('fixture',new Error('Paint '+i));
  }
  assert(f.ctx.menuViewCallbacks.redraws.length<=64);
  assert(f.ctx.menuViewCallbacks.failures.length<=16);
}
console.log('Menu callback safety checks passed: getter reentrancy, stale snapshots, read-only paint, deferred redraw and error containment.');

// Real Objective-C callbacks, including a native getter -> mouse-exit -> JS
// reentry. Entirely offscreen; the native application event loop is isolated
// in osascript, with account readers/log writes replaced by test counters.
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
const nativeFixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
refreshAllSources=function(){};
var failures=[];logError=function(component,error){failures.push(component+': '+String(error));};
var hook=null;
ObjC.registerSubclass({name:'MeterReentrantItem',superclass:'NSMenuItem',methods:{
 'isHidden':{types:['bool',[]],implementation:function(){
   if(hook){var callback=hook;hook=null;callback();}return false;
 }}
}});
var item=$.MeterReentrantItem.alloc.initWithTitleActionKeyEquivalent('Fixture',null,'');
item.enabled=true;item.view=$.CodexUsageMeterActionButton.alloc.initWithFrame($.NSMakeRect(0,0,MENU_WIDTH,24));
configureMenuRowButton(item.view,'Fixture');menu.addItem(item);menuIsOpen=true;
var exits=0,handoffs=0;
for(var i=0;i<300;i++){
 item.view.mouseEntered($());
 hook=function(){item.view.mouseExited($());};
 pruneMenuRowHover();if(menuRowHover.view===null)exits++;
 item.view.mouseEntered($());
 hook=function(){preferencesDisclosureItem.view.mouseEntered($());};
 pruneMenuRowHover();
 if(menuRowHover.view&&menuRowHover.view.isEqual(preferencesDisclosureItem.view))handoffs++;
}
menu.removeItem(item);clearMenuRowHover();
var normalViews=[metricsPairView,usageCardView,maomaoyunTrafficView,maomaoyunView,vpnAppButton];
setPreferencesExpanded(true,false);setStatusDisplayOptionsExpanded(true,false);setLanguageOptionsExpanded(true,false);
for(var n=0;n<menu.numberOfItems;n++){
 var view=menu.itemAtIndex(n).view;
 if(view&&ObjC.unwrap(view)!=null&&normalViews.indexOf(view)<0)normalViews.push(view);
}
function paint(view){
 var image=$.NSImage.alloc.initWithSize(view.bounds.size);image.lockFocus;
 try{view.drawRect(view.bounds);}finally{image.unlockFocus;}
}
for(var pass=0;pass<4;pass++){
 uiLanguage=pass%2?'en':'zh-CN';
 normalViews.forEach(paint);flushMenuViewCallbacks();
}
var ordinaryFailures=failures.length;
var failOnce=true,recovered=0;
registerMenuViewSubclass({name:'MeterContainedPaint',superclass:'NSView',methods:{'drawRect:':{implementation:function(){
 if(failOnce){failOnce=false;throw new Error('Injected isolated paint failure');}recovered++;
}}}});
var faulty=$.MeterContainedPaint.alloc.initWithFrame($.NSMakeRect(0,0,30,20));
paint(faulty);var beforeFlush=failures.length;flushMenuViewCallbacks();paint(faulty);
var nested=0;
registerMenuViewSubclass({name:'MeterNestedPaint',superclass:'NSView',methods:{'drawRect:':{implementation:function(){nested++;}}}});
var child=$.MeterNestedPaint.alloc.initWithFrame($.NSMakeRect(0,0,30,20));
registerMenuViewSubclass({name:'MeterOuterPaint',superclass:'NSView',methods:{'drawRect:':{implementation:function(){child.drawRect(child.bounds);}}}});
var outer=$.MeterOuterPaint.alloc.initWithFrame($.NSMakeRect(0,0,30,20));
paint(outer);var beforeRetry=nested;flushMenuViewCallbacks();paint(child);
delegate.menuDidClose(menu);
JSON.stringify({exits:exits,handoffs:handoffs,ordinaryFailures:ordinaryFailures,beforeFlush:beforeFlush,
 failures:failures,recovered:recovered,beforeRetry:beforeRetry,nested:nested,
 drawing:menuViewCallbacks.drawing,pending:menuViewCallbacks.redraws.length,closed:menuRowHover.view===null});
`;
const native=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',
  readLibrarySource()+'\n'+definitions+'\n'+nativeFixture],{encoding:'utf8',timeout:20000}));
assert.equal(native.exits,300);assert.equal(native.handoffs,300);
assert.equal(native.ordinaryFailures,0,JSON.stringify(native.failures));
assert.equal(native.beforeFlush,0,'native paint must defer logging');
assert.equal(native.failures.length,1);assert.match(native.failures[0],/Injected isolated paint failure/);
assert.equal(native.recovered,1);assert.equal(native.beforeRetry,0);assert.equal(native.nested,1);
assert.equal(native.drawing,false);assert.equal(native.pending,0);assert.equal(native.closed,true);
console.log('Native menu callback checks passed: 600 reentrant hover queries, bilingual offscreen painting, injected paint failure and nested-paint recovery.');
