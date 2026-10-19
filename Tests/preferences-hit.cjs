const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');
// Exercise AppKit's real cell hit testing, not just performClick (which skips
// the hit region). No windows, mouse automation or saved user preferences.
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
const fixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
setStatusDisplayMode=function(mode){statusDisplayMode=mode;};
setUILanguage=function(code){uiLanguage=code;};
setPreferencesExpanded(true,false);setStatusDisplayOptionsExpanded(true,false);setLanguageOptionsExpanded(true,false);
var items=[preferencesDisclosureItem,statusDisplayDisclosureItem,statusDisplayMenuItems.quota,statusDisplayMenuItems.icon,
 languageMenuItem,languageMenuItems['zh-CN'],languageMenuItems.en];
var hits=[];
['zh-CN','en'].forEach(function(code){
 uiLanguage=code;
 items.forEach(function(item){
  var button=item.view;
  var source=Number(button.tag)===101?'简体中文':Number(button.tag)===102?'English':ObjC.unwrap(item.title);
  button.title=uiText(source);
  [[1,1],[34,12],[60,12],[160,12],[MENU_WIDTH-20,12],[MENU_WIDTH-1,23],[-1,12],[MENU_WIDTH+1,12],[160,-1],[160,25]].forEach(function(point){
   var event=$.NSEvent.mouseEventWithTypeLocationModifierFlagsTimestampWindowNumberContextEventNumberClickCountPressure(
    $.NSEventTypeLeftMouseDown,$.NSMakePoint(point[0],point[1]),0,0,0,null,1,1,1);
   var hit=Number(button.cell.hitTestForEventInRectOfView(event,button.bounds,button));
   hits.push({code:code,tag:Number(button.tag),x:point[0],y:point[1],width:MENU_WIDTH,hit:hit});
  });
  button.enabled=false;
  var event=$.NSEvent.mouseEventWithTypeLocationModifierFlagsTimestampWindowNumberContextEventNumberClickCountPressure(
   $.NSEventTypeLeftMouseDown,$.NSMakePoint(300,12),0,0,0,null,1,1,1);
  var before=JSON.stringify([preferencesExpanded,statusDisplayExpanded,languageExpanded,statusDisplayMode,uiLanguage]);
  button.performClick(null);
  hits.push({code:code,tag:Number(button.tag),disabled:true,enabled:!!button.enabled,
   unchanged:before===JSON.stringify([preferencesExpanded,statusDisplayExpanded,languageExpanded,statusDisplayMode,uiLanguage])});
  button.enabled=true;
 });
});
// Native target/action callbacks retain radio selection and disclosure behavior.
statusDisplayMenuItems.icon.view.performClick(null);languageMenuItems['zh-CN'].view.performClick(null);
var selected={display:statusDisplayMode,language:uiLanguage};
statusDisplayMenuItems.quota.view.performClick(null);languageMenuItems.en.view.performClick(null);
var switched={display:statusDisplayMode,language:uiLanguage};
preferencesDisclosureItem.view.performClick(null);
var hidden=items.slice(1).every(function(item){return !!item.hidden;});
// Deliver actual NSEvent mouse-down/up pairs to NSButton, not performClick.
// There is no visible window or global pointer movement. A queued release
// outside the row models pointer movement/cancellation before mouse-up.
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
function mouseEvent(type,x,y){return $.NSEvent.mouseEventWithTypeLocationModifierFlagsTimestampWindowNumberContextEventNumberClickCountPressure(
 type,$.NSMakePoint(x,y),0,0,0,null,1,1,1);}
function click(button,x,y){
 $.NSApplication.sharedApplication.postEventAtStart(mouseEvent($.NSEventTypeLeftMouseUp,500,100),true);
 button.mouseDown(mouseEvent($.NSEventTypeLeftMouseDown,x,y));
}
var actions=0;
ObjC.registerSubclass({name:'MeterPreferenceClickCounter',superclass:'NSObject',methods:{'clicked:':{
 types:['void',['id']],implementation:function(){actions++;}}}});
var counter=$.MeterPreferenceClickCounter.alloc.init,clicks=[];
items.forEach(function(item){
 var button=item.view,savedTarget=button.target,savedAction=button.action;
 button.target=counter;button.action='clicked:';
 [[1,1],[34,12],[60,12],[160,12],[MENU_WIDTH-20,12],[MENU_WIDTH-1,23]].forEach(function(point){
  var before=actions;click(button,point[0],point[1]);
  clicks.push({tag:Number(button.tag),x:point[0],actions:actions-before});
 });
 var before=actions;button.enabled=false;click(button,MENU_WIDTH-20,12);
 clicks.push({tag:Number(button.tag),disabled:true,actions:actions-before});button.enabled=true;
 button.target=savedTarget;button.action=savedAction;
});
menuIsOpen=true;
var toggles=[];
for(var i=0;i<20;i++){
 var before=preferencesExpanded;
 click(preferencesDisclosureItem.view,i%2?MENU_WIDTH-25:20,12);
 toggles.push(preferencesExpanded!==before);
}
setPreferencesExpanded(true,false);setStatusDisplayOptionsExpanded(true,false);setLanguageOptionsExpanded(true,false);
click(statusDisplayMenuItems.icon.view,MENU_WIDTH-20,12);click(languageMenuItems['zh-CN'].view,160,12);
var mouseSelected={display:statusDisplayMode,language:uiLanguage,
 states:[statusDisplayMenuItems.quota.view,statusDisplayMenuItems.icon.view,languageMenuItems['zh-CN'].view,languageMenuItems.en.view].map(function(b){return Number(b.state);})};
click(statusDisplayMenuItems.quota.view,160,12);click(languageMenuItems.en.view,MENU_WIDTH-20,12);
var mouseSwitched={display:statusDisplayMode,language:uiLanguage,
 states:[statusDisplayMenuItems.quota.view,statusDisplayMenuItems.icon.view,languageMenuItems['zh-CN'].view,languageMenuItems.en.view].map(function(b){return Number(b.state);})};
setPreferencesExpanded(false,false);menuIsOpen=false;
var timers=[preferencesAnimation.timer,statusDisplayAnimation.timer,languageAnimation.timer].map(function(t){return !!t;});
JSON.stringify({hits:hits,selected:selected,switched:switched,hidden:hidden,clicks:clicks,toggles:toggles,
 mouseSelected:mouseSelected,mouseSwitched:mouseSwitched,timers:timers});
`;
const out=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+fixture],
 {encoding:'utf8',timeout:10000}));
for(const row of out.hits){
 // NSButton gates disabled actions itself; its cell can still report geometry.
 if(row.disabled){assert.equal(row.enabled,false);assert.equal(row.unchanged,true);continue;}
 const inside=row.x>=0&&row.x<row.width&&row.y>=0&&row.y<24;
 assert.equal(!!(row.hit&4),inside,JSON.stringify(row));
}
assert.deepEqual(out.selected,{display:'icon',language:'zh-CN'});
assert.deepEqual(out.switched,{display:'quota',language:'en'});
assert.equal(out.hidden,true);
assert(out.clicks.every(row=>row.actions===(row.disabled?0:1)),'each enabled mouse-down fires exactly once, even with an outside release');
assert(out.toggles.every(Boolean),'every rapid native mouse click toggles immediately during disclosure animation');
assert.deepEqual(out.mouseSelected,{display:'icon',language:'zh-CN',states:[0,1,1,0]});
assert.deepEqual(out.mouseSwitched,{display:'quota',language:'en',states:[1,0,0,1]});
assert.deepEqual(out.timers,[false,false,false]);
console.log('Preferences hit checks passed: bilingual whole rows, real native mouse-down/up dispatch, outside releases, rapid reversal, single actions, disabled guards and timer cleanup.');
