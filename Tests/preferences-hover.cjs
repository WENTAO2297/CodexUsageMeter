const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');
// Native tracking callbacks + actual pixel rendering, entirely offscreen.
// No visible window, pointer movement, account reads or preference writes.
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
const fixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
refreshAllSources=function(){};menuIsOpen=true;
var keyboardEvent=false;
menuRowKeyboardEvent=function(){return keyboardEvent;};
menuTrackingMouseState=function(){return {point:{x:20,y:12},buttons:0};};
menuTrackingViewRect=function(){return $.NSMakeRect(0,0,MENU_WIDTH,24);};
setPreferencesExpanded(true,false);setStatusDisplayOptionsExpanded(true,false);setLanguageOptionsExpanded(true,false);
var items=[preferencesDisclosureItem,statusDisplayDisclosureItem,statusDisplayMenuItems.quota,statusDisplayMenuItems.icon,
 languageMenuItem,languageMenuItems['zh-CN'],languageMenuItems.en],tracking=[],samples=[];
for(var i=0;i<menu.numberOfItems;i++){
 var command=menu.itemAtIndex(i),view=command.view;
 if(view&&ObjC.unwrap(view)!=null&&view.isKindOfClass($.CodexUsageMeterActionButton))items.push(command);
}
function pixel(button){
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,24));image.lockFocus;
 $.NSColor.colorWithCalibratedWhiteAlpha(.15,1).setFill;$.NSBezierPath.fillRect(button.bounds);
 button.drawRect(button.bounds);image.unlockFocus;
 var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
 // NSImage lockFocus can select a Retina backing in a desktop session.
 // Convert the logical interior point to bitmap pixels, not the 5pt margin.
 var color=rep.colorAtXY(Math.floor(8*Number(rep.pixelsWide)/MENU_WIDTH),Math.floor(12*Number(rep.pixelsHigh)/24))
  .colorUsingColorSpace($.NSColorSpace.deviceRGBColorSpace);
 return [Number(color.redComponent),Number(color.greenComponent),Number(color.blueComponent)];
}
['zh-CN','en'].forEach(function(code){
 uiLanguage=code;
 items.forEach(function(item){
  var button=item.view;clearMenuRowHover();var plain=pixel(button);
  var before=Number(button.trackingAreas.count);sendVoid(button,'updateTrackingAreas');
  var areas=button.trackingAreas,owned=0;
  for(var j=0;j<areas.count;j++){
   var area=areas.objectAtIndex(j);if(area.owner&&button.isEqual(area.owner)){
    var options=Number(area.options);if((options&$.NSTrackingMouseEnteredAndExited)&&
     (options&$.NSTrackingInVisibleRect)&&(options&$.NSTrackingActiveAlways))owned++;
   }
  }
  tracking.push({before:before,after:Number(areas.count),owned:owned});
  button.mouseEntered($());var entered=pixel(button);
  var active=menuRowHover.view&&button.isEqual(menuRowHover.view);
  button.mouseExited($());var exited=pixel(button);
  samples.push({code:code,tag:Number(button.tag),plain:plain,entered:entered,exited:exited,active:!!active});
 });
});
preferencesDisclosureItem.view.mouseEntered($());statusDisplayDisclosureItem.view.mouseEntered($());
var single=menuRowHover.view&&statusDisplayDisclosureItem.view.isEqual(menuRowHover.view);
// AppKit can retain a pressed cell while native menu tracking moves elsewhere.
// It must not act as a second, independent highlight owner.
preferencesDisclosureItem.view.cell.highlighted=true;
var staleCell=pixel(preferencesDisclosureItem.view);
var activeCell=pixel(statusDisplayDisclosureItem.view);
preferencesDisclosureItem.view.cell.highlighted=false;
// A delayed exit from the previous row cannot clear the new hovered row.
preferencesDisclosureItem.view.mouseExited($());var delayed=!!menuRowHover.view;
// Mirror native keyboard selection, then clear when a regular command wins.
delegate.menuWillHighlightItem(menu,languageMenuItem);
var keyboard=menuRowHover.view&&languageMenuItem.view.isEqual(menuRowHover.view);
delegate.menuWillHighlightItem(menu,menu.itemAtIndex(menu.numberOfItems-1));
var normal=menuRowHover.view&&menuRowHover.view.isEqual(menu.itemAtIndex(menu.numberOfItems-1).view);
delegate.menuWillHighlightItem(menu,$());var nil=menuRowHover.view===null;
// Deterministic screen geometry: do not move the user's pointer or show UI.
var savedMouse=menuTrackingMouseState,savedRect=menuTrackingViewRect;
var point={x:20,y:20},rect=$.NSMakeRect(0,0,100,24),stationaryKeyboard=false;
menuTrackingMouseState=function(){return {point:stationaryKeyboard&&menuRowHover.point?menuRowHover.point:point,buttons:0};};
menuTrackingViewRect=function(){return rect;};
preferencesDisclosureItem.view.mouseEntered($());reconcileMenuRowHover();
var inside=!!menuRowHover.view;
point={x:200,y:20};reconcileMenuRowHover();var missedExit=menuRowHover.view===null;
preferencesDisclosureItem.view.mouseEntered($());point={x:20,y:20};rect=$.NSMakeRect(0,40,100,24);
reconcileMenuRowHover();var reflow=menuRowHover.view===null;
keyboardEvent=true;
// Both the delegate's immediate reconciliation and the next simulated sample
// use its captured point. Two physical reads can differ while the user moves
// their mouse, which is not this deliberately stationary keyboard case.
stationaryKeyboard=true;
delegate.menuWillHighlightItem(menu,languageMenuItem);
var captured=menuRowHover.point;point={x:captured.x,y:captured.y};
stationaryKeyboard=false;
reconcileMenuRowHover();
var keyboardStationary=!!menuRowHover.view;
point={x:point.x+10000,y:point.y+10000};reconcileMenuRowHover();var keyboardMoved=menuRowHover.view===null;
keyboardEvent=false;
// Late mouse/native callbacks arriving after exit, with the pointer stationary.
var outside=true;
for(var n=0;n<20;n++){
 delegate.menuWillHighlightItem(menu,languageMenuItem);
 reconcileMenuRowHover();
 outside=outside&&menuRowHover.view===null&&pixel(languageMenuItem.view)[2]<.3;
}
menuTrackingMouseState=savedMouse;menuTrackingViewRect=savedRect;
// Rapid cross-row movement with delayed exits and latched native cells.
var rapid=true;
clearMenuRowHover();var idlePixel=pixel(items[0].view);
for(var k=0;k<40;k++){
 var old=items[k%items.length].view,next=items[(k+1)%items.length].view;
 old.mouseEntered($());old.cell.highlighted=true;
 next.mouseEntered($());old.mouseExited($());
 var oldPixel=pixel(old),nextPixel=pixel(next);
 rapid=rapid&&Math.abs(oldPixel[0]-idlePixel[0])<.02&&nextPixel[0]>oldPixel[0]+.05&&Math.max.apply(null,nextPixel)-Math.min.apply(null,nextPixel)<.02;
 old.cell.highlighted=false;
}
statusDisplayMenuItems.icon.view.mouseEntered($());setStatusDisplayOptionsExpanded(false,false);
var collapsed=menuRowHover.view===null;
statusDisplayMenuItems.icon.view.mouseEntered($());var hidden=menuRowHover.view===null;
languageMenuItems.en.view.mouseEntered($());setPreferencesExpanded(false,false);var parent=menuRowHover.view===null;
preferencesDisclosureItem.view.mouseEntered($());delegate.menuDidClose(menu);var closed=menuRowHover.view===null;
preferencesDisclosureItem.view.mouseEntered($());var late=menuRowHover.view===null;
delegate.menuWillOpen(menu);var reopened=menuRowHover.view===null;
preferencesDisclosureItem.view.enabled=false;preferencesDisclosureItem.view.mouseEntered($());var disabled=menuRowHover.view===null;
preferencesDisclosureItem.view.enabled=true;isExiting=true;preferencesDisclosureItem.view.mouseEntered($());var exiting=menuRowHover.view===null;
JSON.stringify({tracking:tracking,samples:samples,single:!!single,staleCell:staleCell,activeCell:activeCell,delayed:delayed,keyboard:!!keyboard,
 normal:normal,nil:nil,inside:inside,missedExit:missedExit,reflow:reflow,keyboardStationary:keyboardStationary,keyboardMoved:keyboardMoved,rapid:rapid,outside:outside,
 collapsed:collapsed,hidden:hidden,parent:parent,closed:closed,late:late,reopened:reopened,disabled:disabled,exiting:exiting});
`;
let out;
try {out=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+fixture],
 {encoding:'utf8',timeout:10000}));}
catch(error){throw new Error(String(error.stderr||error.code||'Native hover test failed').trim());}
assert(out.tracking.every(row=>row.owned===1&&row.before===row.after),'one native visible-rect hover area survives updates');
assert(Math.abs(out.staleCell[0]-out.samples[0].plain[0])<.02,'stale native pressed cell must not paint a second highlighted row');
assert(out.activeCell[0]>out.staleCell[0]+.05,'current hover owner remains highlighted');
for(const row of out.samples){
 assert(row.active,JSON.stringify(row));
 assert(row.entered[0]>row.plain[0]+.05&&Math.max(...row.entered)-Math.min(...row.entered)<.02,'every settings row uses the shared light-gray highlight');
 assert(row.exited.every((channel,i)=>Math.abs(channel-row.plain[i])<.02),'exiting removes the whole highlight');
}
for(const key of ['single','delayed','keyboard','normal','nil','inside','missedExit','reflow','keyboardStationary','keyboardMoved','rapid','outside','collapsed','hidden','parent','closed','late','reopened','disabled','exiting'])
 assert.equal(out[key],true,key);
console.log('Preferences hover checks passed: bilingual native pixels, stale pressed cells, 40 rapid handoffs, missed exits/reflow, keyboard handoff and close/reopen cleanup.');
