const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
// Deliver native events to the containing row, not directly to the tiny child
// button. AppKit may route custom-menu input through this owner first.
const fixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();menuIsOpen=true;
refreshAllSources=function(){throw Error('No readers during input testing');};
statusDisplayReducedMotion=function(){return false;};
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
var header=tokenMeterDisclosureItem.view,buttons=tokenActivityRangeButtons,rows=[];
function event(type,view,x,y){var p=view.convertPointToView($.NSMakePoint(x,y),$());
 return $.NSEvent.mouseEventWithTypeLocationModifierFlagsTimestampWindowNumberContextEventNumberClickCountPressure(
 type,p,0,0,0,null,1,1,1);}
function click(view,x,y){
 $.NSApplication.sharedApplication.postEventAtStart(event($.NSEventTypeLeftMouseUp,view,-100,-100),true);
 view.mouseDown(event($.NSEventTypeLeftMouseDown,view,x,y));
}
setTokenMeterExpanded(true,false);
var owner=buttons[1].superview,f=buttons[1].frame;
var down=event($.NSEventTypeLeftMouseDown,owner,Number(f.origin.x)+Number(f.size.width)/2,Number(f.origin.y)+10);
var trace={type:Number(down.type),expectedType:Number($.NSEventTypeLeftMouseDown),position:down.locationInWindow,
 converted:owner.convertPointFromView(down.locationInWindow,$()),frame:f,owner:ObjC.unwrap(owner.className)};
click(owner,Number(f.origin.x)+Number(f.size.width)/2,Number(f.origin.y)+10);
var first={range:usageActivityDays,expanded:tokenMeterExpanded,hidden:!!tokenMeterItem.hidden};
['zh-CN','en'].forEach(function(locale){
 uiLanguage=locale;setTokenMeterExpanded(true,false);refreshTokenMeterMenu(true);
 [0,1,0,1].forEach(function(index){
  var button=buttons[index],frame=button.frame;
  [[2,2],[Number(frame.size.width)/2,10],[Number(frame.size.width)-2,18]].forEach(function(at){
   click(button.superview,Number(frame.origin.x)+at[0],Number(frame.origin.y)+at[1]);
   rows.push({locale:locale,index:index,range:usageActivityDays,expanded:tokenMeterExpanded,hidden:!!tokenMeterItem.hidden,open:menuIsOpen});
  });
 });
});
var range=usageActivityDays;click(header,20,12);
var titleCollapse=!tokenMeterExpanded&&!!tokenMeterItem.hidden&&usageActivityDays===range;
click(header,MENU_WIDTH-20,12);var arrowOpen=tokenMeterExpanded&&!tokenMeterItem.hidden;
var owner=buttons[0].superview,frame=buttons[0].frame;
buttons[0].enabled=false;click(owner,Number(frame.origin.x)+Number(frame.size.width)/2,Number(frame.origin.y)+10);
var disabled=usageActivityDays===range&&tokenMeterExpanded;buttons[0].enabled=true;
var buttonRange=usageActivityDays;click(owner,20,80);var plotPassive=tokenMeterExpanded&&usageActivityDays===buttonRange;
delegate.menuDidClose(menu);
var closed=!tokenMeterAnimation.timer&&!tokenMeterExpanded;
JSON.stringify({first:first,rows:rows,titleCollapse:titleCollapse,arrowOpen:arrowOpen,disabled:disabled,plotPassive:plotPassive,closed:closed,
 separate:!buttons[0].superview.isEqual(header),trace:trace});
`;
const result=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+fixture],{encoding:'utf8',timeout:15000}));
assert.deepEqual(result.first,{range:30,expanded:true,hidden:false},'30-day click received by the containing row must switch range, never collapse: '+JSON.stringify(result.trace));
assert(result.separate,'range buttons must not be nested inside the disclosure NSButton');
assert.equal(result.rows.length,24);
for(const row of result.rows)assert(row.expanded&&!row.hidden&&row.open&&row.range===(row.index?30:7),JSON.stringify(row));
for(const name of ['titleCollapse','arrowOpen','disabled','plotPassive','closed'])assert(result[name],name);
console.log('Range row input passed: bilingual container-received native down/up pairs, segment edges, no collapse, independent title/arrow, disabled/plot/close guards.');
