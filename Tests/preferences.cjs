const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');
const mainDefinitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
const previewRoot=process.argv.includes('--preview')?fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-preferences-')):null;

function fixture(){
  let now=1000,reduced=false,fail=false,active=0,layout=0;
  const methods={};
  const child=()=>({hidden:true,view:{}});
  const context=vm.createContext({
    Date:class extends Date{static now(){return now;}},
    ObjC:{registerSubclass(def){methods[def.name]=def.methods;}},
    $:{NSWorkspace:{sharedWorkspace:{get accessibilityDisplayShouldReduceMotion(){return reduced;}}},
      NSEventTrackingRunLoopMode:'tracking',NSRunLoop:{currentRunLoop:{addTimerForMode(t,m){assert(t.active);assert.equal(m,'tracking');}}},
      NSApplication:{sharedApplication:{terminate(){}}}},
    preferencesDisclosureItem:child(),preferencesExpanded:false,preferencesReveal:0,
    preferencesAnimation:{timer:null,from:0,to:0,startedAt:0},STATUS_DISPLAY_ANIMATION_MS:180,
    statusDisplayDisclosureItem:child(),statusDisplayMenuItems:{quota:child(),icon:child()},
    statusDisplayExpanded:false,statusDisplayAnimation:{timer:null},
    languageMenuItem:child(),languageMenuItems:{en:child(),'zh-CN':child()},languageExpanded:false,
    menu:{},menuIsOpen:true,isExiting:false,
    sendVoid(){layout++;},logError(){},
    startTransientTimer(t,interval,selector){assert.equal(selector,'preferencesAnimationTimer:');assert.equal(interval,1/60);
      if(fail)throw Error('timer unavailable');active++;return {active:true};},
    stopTransientTimer(t){if(t?.active){t.active=false;active--;}return null;},
    refreshAllSources(){},
    cancelBackgroundTask(){},stopQuotaRingAnimation(){},stopMaoMaoYunTrafficRead(){},
    usagePollTimer:null,maomaoyunPollTimer:null,tokenHistoryPollTimer:null,tokenHistoryReadState:{},
    maomaoyunReadState:{},maomaoyunActionState:{},refreshState:{},runningReadState:{}
  });
  vm.runInContext(readSource('menu-rows')+'\n'+readSource('preferences')+'\n'+mainDefinitions,context);
  // Children are tested separately; isolate the parent's ownership/cleanup.
  context.setStatusDisplayOptionsExpanded=expanded=>{
    context.statusDisplayExpanded=expanded;
    Object.values(context.statusDisplayMenuItems).forEach(item=>{item.hidden=!expanded;});
    context.stopStatusDisplayAnimation();
  };
  context.setLanguageOptionsExpanded=expanded=>{
    context.languageExpanded=expanded;
    Object.values(context.languageMenuItems).forEach(item=>{item.hidden=!expanded;});
  };
  context.redrawLanguageControls=()=>{};
  const delegate=methods.CodexUsageMeterDelegate;
  return {context,press:()=>delegate['preferencesButton:'].implementation(),
    advance(ms){now+=ms;context.stepPreferencesAnimation();},
    lifecycle(name){delegate[name].implementation();},
    motion(value){reduced=value;},fail(value){fail=value;},active:()=>active,layout:()=>layout};
}
{
  const f=fixture(),c=f.context;
  f.press();assert(c.preferencesExpanded);assert(!c.statusDisplayDisclosureItem.hidden);assert(!c.languageMenuItem.hidden);
  assert.equal(f.active(),1);const writes=f.layout();f.advance(60);
  assert(c.preferencesReveal>0&&c.preferencesReveal<1);assert.equal(f.layout(),writes,'timer only redraws; no asynchronous menu layout');
  const reveal=c.preferencesReveal;f.press();assert.equal(c.preferencesAnimation.from,reveal);assert.equal(f.active(),1);
  assert(c.statusDisplayDisclosureItem.hidden);assert(c.languageMenuItem.hidden);
  f.advance(25);f.press();assert.equal(f.active(),1);f.advance(200);assert.equal(c.preferencesReveal,1);assert.equal(f.active(),0);
  c.setStatusDisplayOptionsExpanded(true);c.setLanguageOptionsExpanded(true);
  f.press();assert(!c.statusDisplayExpanded&&!c.languageExpanded);
  assert(Object.values(c.statusDisplayMenuItems).every(item=>item.hidden));assert(Object.values(c.languageMenuItems).every(item=>item.hidden));
  f.lifecycle('menuDidClose:');assert.equal(c.preferencesReveal,0);assert.equal(f.active(),0);
  f.advance(500);assert(c.languageMenuItem.hidden);f.lifecycle('menuWillOpen:');assert(!c.preferencesExpanded);
  f.press();assert.equal(f.active(),1);c.restartMeter();assert.equal(f.active(),0);assert(c.isExiting);
  f.press();assert.equal(f.active(),0,'restart blocks new control work');
}
for(const mode of ['reduced','timer-failed','clock-backwards']){
  const f=fixture(),c=f.context;
  if(mode==='reduced')f.motion(true);if(mode==='timer-failed')f.fail(true);
  f.press();if(mode==='clock-backwards')f.advance(-50);
  assert.equal(c.preferencesReveal,1);assert.equal(f.active(),0);f.press();
  if(mode==='clock-backwards')f.advance(200);
  assert.equal(c.preferencesReveal,0);assert.equal(f.active(),0);
}

// Real AppKit controls, offscreen only: no menu popup, readers, VPN or real preferences.
const nativeFixture=`
${mainDefinitions}
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
statusDisplayReducedMotion=function(){return false;};
setStatusDisplayMode=function(mode){statusDisplayMode=mode;updateStatusDisplayMenu();};
// Keep locale switching local to this fixture (no write to user preferences).
setUILanguage=function(code){
 uiLanguage=code;localizedMenuItems.forEach(function(entry){entry.item.title=uiText(entry.source);if(entry.item.view)entry.item.view.title=uiText(entry.source);});
 updateLanguageMenu();sendVoid(menu,'update');
};
function rows(){return [preferencesDisclosureItem,statusDisplayDisclosureItem,statusDisplayMenuItems.quota,statusDisplayMenuItems.icon,
 languageMenuItem,languageMenuItems['zh-CN'],languageMenuItems.en].map(function(item){return {
 title:ObjC.unwrap(item.title),hidden:!!item.hidden,height:Number(item.view.frame.size.height),
 action:ObjC.unwrap($.NSStringFromSelector(item.view.action)),state:Number(item.state),
 submenu:ObjC.unwrap(item.submenu)!=null};});}
var initial=rows();
// Invisible controls cannot reopen a child or switch saved choices.
statusDisplayDisclosureItem.view.performClick($());languageMenuItem.view.performClick($());
statusDisplayMenuItems.icon.view.performClick($());languageMenuItems['zh-CN'].view.performClick($());
var ignored={display:statusDisplayMode,language:uiLanguage,displayExpanded:statusDisplayExpanded,languageExpanded:languageExpanded};
menuIsOpen=true;preferencesDisclosureItem.view.performClick($());
function runTracking(seconds){var end=Date.now()+seconds*1000;while(Date.now()<end)
 $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSEventTrackingRunLoopMode,$.NSDate.dateWithTimeIntervalSinceNow(0.01));}
runTracking(0.06);var mid=preferencesReveal;runTracking(0.2);var parent=rows();
statusDisplayDisclosureItem.view.performClick($());languageMenuItem.view.performClick($());
runTracking(0.22);statusDisplayMenuItems.icon.view.performClick($());languageMenuItems['zh-CN'].view.performClick($());
var zh=rows(),selected={display:statusDisplayMode,language:uiLanguage};
${previewRoot?`
['zh-CN','en'].forEach(function(code){
 setUILanguage(code);var controls=[preferencesDisclosureItem,statusDisplayDisclosureItem,statusDisplayMenuItems.quota,
 statusDisplayMenuItems.icon,languageMenuItem,languageMenuItems['zh-CN'],languageMenuItems.en];
 var preview=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,controls.length*24+16));preview.lockFocus;
 $.NSColor.colorWithCalibratedWhiteAlpha(.15,1).setFill;
 $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(0,0,MENU_WIDTH,controls.length*24+16),12,12).fill;
 controls.forEach(function(item,index){
  $.NSGraphicsContext.saveGraphicsState;var transform=$.NSAffineTransform.transform;
  transform.translateXByYBy(0,8+(controls.length-index-1)*24);transform.concat;
  item.view.drawRect(item.view.bounds);$.NSGraphicsContext.restoreGraphicsState;
 });preview.unlockFocus;
 var rep=$.NSBitmapImageRep.imageRepWithData(preview.TIFFRepresentation);
 rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(${JSON.stringify(previewRoot)}+'/'+code+'.png',true);
});setUILanguage('zh-CN');
`:''}
var indents=[];
['zh-CN','en'].forEach(function(code){
 setUILanguage(code);
 [preferencesDisclosureItem,statusDisplayDisclosureItem,statusDisplayMenuItems.quota,statusDisplayMenuItems.icon,
  languageMenuItem,languageMenuItems['zh-CN'],languageMenuItems.en].forEach(function(item){
  var button=item.view,tag=Number(button.tag),option=tag===1||tag===2||tag===101||tag===102;
  var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,24));image.lockFocus;
  $.NSColor.colorWithCalibratedWhiteAlpha(.15,1).setFill;$.NSRectFill(button.bounds);
  button.drawRect(button.bounds);image.unlockFocus;
  var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),scale=Number(rep.pixelsWide)/MENU_WIDTH;
  var labelX=MENU_WIDTH,checkX=MENU_WIDTH;
  for(var y=0;y<24;y++)for(var x=0;x<100;x++){
   var pixel=rep.colorAtXY(Math.floor(x*scale),Math.floor(y*scale)).colorUsingColorSpace($.NSColorSpace.deviceRGBColorSpace);
   if(Number(pixel.redComponent)<.6)continue;
   if(!option||x>=46)labelX=Math.min(labelX,x);
   if(option&&x>=28&&x<46)checkX=Math.min(checkX,x);
  }
  var checked=option&&(tag>=100?(tag===101?'zh-CN':'en')===uiLanguage:STATUS_DISPLAY_OPTIONS[tag-1].mode===statusDisplayMode);
  indents.push({locale:code,tag:tag,labelX:labelX,checkX:checkX,checked:checked});
 });
});setUILanguage('zh-CN');
var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,24));image.lockFocus;
[preferencesDisclosureItem,statusDisplayDisclosureItem,statusDisplayMenuItems.quota,statusDisplayMenuItems.icon,languageMenuItem,
 languageMenuItems['zh-CN'],languageMenuItems.en].forEach(function(item){item.view.drawRect(item.view.bounds);});image.unlockFocus;
// Collapse while both children are animating, then pump stale callbacks.
statusDisplayDisclosureItem.view.performClick($());languageMenuItem.view.performClick($());
preferencesDisclosureItem.view.performClick($());runTracking(0.25);var collapsed=rows();
preferencesDisclosureItem.view.performClick($());runTracking(0.25);var reopened=rows();
refreshAllSources=function(){};delegate.menuDidClose(menu);delegate.menuWillOpen(menu);
var closed=rows(),timers=[preferencesAnimation.timer,statusDisplayAnimation.timer,languageAnimation.timer].map(function(t){return !!t;});
JSON.stringify({initial:initial,ignored:ignored,mid:mid,parent:parent,zh:zh,selected:selected,indents:indents,collapsed:collapsed,reopened:reopened,closed:closed,timers:timers});
`;
const result=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+nativeFixture],{encoding:'utf8',timeout:15000}));
assert.deepEqual(result.initial.map(row=>row.hidden),[false,true,true,true,true,true,true]);
assert.equal(result.initial[0].action,'preferencesButton:');
assert.deepEqual(result.ignored,{display:'quota',language:'en',displayExpanded:false,languageExpanded:false});
assert(result.mid>0&&result.mid<1,'parent animation runs in native tracking mode');
assert.deepEqual(result.parent.map(row=>row.hidden),[false,false,true,true,false,true,true]);
assert.deepEqual(result.zh.map(row=>row.title),['偏好设置','菜单栏显示','剩余额度','Codex 图标','语言','简体中文','English']);
assert.deepEqual(result.selected,{display:'icon',language:'zh-CN'});
assert(result.zh.every(row=>!row.hidden&&row.height===24&&row.state===0&&!row.submenu));
for(const row of result.indents){
  const expected=row.tag===200?16:row.tag===0||row.tag===100?32:48;
  assert(row.labelX>=expected&&row.labelX<=expected+4,`${row.locale} tag ${row.tag}: text follows 16/32/48pt hierarchy, got ${row.labelX}`);
  if(row.checked)assert(row.checkX>=30&&row.checkX<=34,'check follows the option text leftward');
  else assert.equal(row.checkX,288,'unselected options have no check');
}
assert.deepEqual(result.collapsed.map(row=>row.hidden),result.initial.map(row=>row.hidden));
assert.deepEqual(result.reopened.map(row=>row.hidden),result.parent.map(row=>row.hidden));
assert.deepEqual(result.closed.map(row=>row.hidden),result.initial.map(row=>row.hidden));
assert.deepEqual(result.timers,[false,false,false]);
if(previewRoot)console.log('Previews:',previewRoot);
console.log('Preferences checks passed: bilingual native 16/32/48pt text and 30pt checks, inline hierarchy, actions/localization, animation reversal, hidden-control guards, child cleanup, close/reopen/restart and fallback.');
