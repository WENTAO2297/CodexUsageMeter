const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {readLibrarySource,readSource}=require('./sources.cjs');
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
const fixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
var calls=[];
newTask=function(){calls.push('new');};openChatGPTWeb=function(){calls.push('chatgpt');};
restartMeter=function(){calls.push('restart');};
openMaoMaoYunApp=function(){calls.push('app');};
openCodexURL=function(path){calls.push(path);};
var native=[];
var geometry=[];
var b=vpnAppButton;native.push(true);b.performClick(null);
var footerLayout=dashboardMetricLayout(180,'traffic');
var footerSpacing={linksTop:Number(b.frame.origin.y)+Number(b.frame.size.height),
 rowBottom:Number(maomaoyunView.frame.origin.y),rowTop:Number(maomaoyunView.frame.origin.y)+Number(maomaoyunView.frame.size.height),
 dataTop:Number(maomaoyunTrafficView.frame.origin.y)+Number(maomaoyunTrafficView.frame.size.height),
 panelTop:Number(metricsPairView.frame.size.height),panelWidth:Number(metricsPairView.frame.size.width),
 switchX:Number(maomaoyunView.frame.origin.x)+Number(maomaoyunView.frame.size.width)-50};
var previewUnchanged=vpnSwitchPreviewValue===null;
var clientHit=!!metricsPairView.hitTest($.NSMakePoint(b.frame.origin.x+12,b.frame.origin.y+8)).isEqual(b);
var footerHits=[];
[vpnAppButton,maomaoyunView].forEach(function(control){
 var width=Number(control.frame.size.width);
 (control===maomaoyunView?[2,60,width-35]:[2,width/2,width-2]).forEach(function(dx){
  var hit=metricsPairView.hitTest($.NSMakePoint(Number(control.frame.origin.x)+dx,Number(control.frame.origin.y)+16));
  footerHits.push(!!hit.isEqual(control));
 });
});
var accessibilityOK=ObjC.unwrap(b.accessibilityLabel)===uiText('Open MaoMaoYun');
geometry.push({x:Number(b.frame.origin.x),width:Number(b.frame.size.width),height:Number(b.frame.size.height)});
for(var i=0;i<menu.numberOfItems;i++){
 var item=menu.itemAtIndex(i),action=ObjC.unwrap($.NSStringFromSelector(item.action));
 if(!action||action==='null')continue;
 native.push(ObjC.unwrap(item.view)!=null);item.view.performClick(null);
}
var nativeMenu=!!statusItem.menu.isEqual(menu);
// Nested toolbar links use the same single hover owner as ordinary menu rows.
// Exercise parent-item callbacks, missed exits and a stale pressed cell without
// opening a real menu or moving the pointer.
var hoverChecks=[],point={x:20,y:12},other=null;menuIsOpen=true;
for(var k=0;k<menu.numberOfItems;k++)if(ObjC.unwrap(menu.itemAtIndex(k).title)==='New Task')other=menu.itemAtIndex(k).view;
menuRowKeyboardEvent=function(){return false;};
menuTrackingMouseState=function(){return {point:point};};
menuTrackingViewRect=function(view){return $.NSMakeRect(0,0,Number(view.frame.size.width),24);};
function pixel(button){
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(Number(button.frame.size.width),24));image.lockFocus;
 $.NSColor.colorWithCalibratedWhiteAlpha(.15,1).setFill;$.NSRectFill(button.bounds);button.drawRect(button.bounds);image.unlockFocus;
 var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),scale=Number(rep.pixelsWide)/Number(button.frame.size.width);
 var color=rep.colorAtXY(Math.floor((button.isEqual(vpnAppButton)?2:8)*scale),Math.floor(12*scale)).colorUsingColorSpace($.NSColorSpace.deviceRGBColorSpace);
 return Number(color.redComponent);
}
clearMenuRowHover();var idleClient=pixel(vpnAppButton),idleOther=pixel(other);
vpnAppButton.mouseEntered($());var parent=menuRowItemForControl(vpnAppButton);
hoverChecks.push(!!parent&&parent.view.isEqual(metricsPairView));
delegate.menuWillHighlightItem(menu,parent);
hoverChecks.push(!!menuRowHover.view&&menuRowHover.view.isEqual(vpnAppButton)&&pixel(vpnAppButton)>idleClient+.01);
other.mouseEntered($());vpnAppButton.mouseExited($());
hoverChecks.push(!!menuRowHover.view&&menuRowHover.view.isEqual(other)&&Math.abs(pixel(vpnAppButton)-idleClient)<.005&&pixel(other)>idleOther+.01);
point={x:2000,y:2000};delegate.menuWillHighlightItem(menu,parent);
other.cell.highlighted=true;delegate.menuWillHighlightItem(menu,parent);
hoverChecks.push(menuRowHover.view===null&&Math.abs(pixel(other)-idleOther)<.005);
other.cell.highlighted=false;delegate.menuDidClose(menu);vpnAppButton.mouseEntered($());
hoverChecks.push(menuRowHover.view===null);
menuIsOpen=true;vpnAppButton.removeFromSuperview;vpnAppButton.mouseEntered($());
hoverChecks.push(menuRowHover.view===null&&menuRowItemForControl(vpnAppButton)===null);
menuIsOpen=false;
// The four bottom entries are text-only, aligned with the data's 16pt edge.
// Draw real native controls: a removed symbol must not leave its text gutter.
var footer=[],symbols=0,arrows=0,originalSymbol=drawMeterStatusIcon,originalArrow=drawMenuDisclosureChevron;
drawMeterStatusIcon=function(){symbols++;return originalSymbol.apply(null,arguments);};
drawMenuDisclosureChevron=function(){arrows++;return originalArrow.apply(null,arguments);};
['zh-CN','en'].forEach(function(locale){
 uiLanguage=locale;
 ['New Task','Ask ChatGPT','Preferences','Restart Widget'].forEach(function(source){
  var button=source==='Preferences'?preferencesDisclosureItem.view:null;
  if(!button)for(var j=0;j<menu.numberOfItems;j++){
   var item=menu.itemAtIndex(j);if(ObjC.unwrap(item.title)===source)button=item.view;
  }
  button.title=uiText(source);symbols=0;arrows=0;
  var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,24));sendVoid(image,'lockFocus');
  sendVoid($.NSColor.colorWithCalibratedWhiteAlpha(.15,1),'setFill');$.NSRectFill(button.bounds);
  button.drawRect(button.bounds);sendVoid(image,'unlockFocus');
  var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),scale=Number(rep.pixelsWide)/MENU_WIDTH,ink=0;
  for(var y=6;y<18;y++)for(var x=16;x<34;x++){
   var pixel=rep.colorAtXY(Math.floor(x*scale),Math.floor(y*scale)).colorUsingColorSpace($.NSColorSpace.deviceRGBColorSpace);
   if(Number(pixel.redComponent)>.55)ink++;
  }
  footer.push({source:source,locale:locale,symbols:symbols,arrows:arrows,ink:ink,height:Number(button.frame.size.height),
   fontUnchanged:Number(button.font.pointSize)===Number($.NSFont.menuFontOfSize(0).pointSize)});
 });
});
drawMeterStatusIcon=originalSymbol;drawMenuDisclosureChevron=originalArrow;
JSON.stringify({native:native,calls:calls,nativeMenu:nativeMenu,geometry:geometry,previewUnchanged:previewUnchanged,clientHit:clientHit,accessibilityOK:accessibilityOK,footerHits:footerHits,footerSpacing:footerSpacing,hoverChecks:hoverChecks,clientTitle:ObjC.unwrap(b.title),footer:footer});`;
const out=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+fixture],{encoding:'utf8',timeout:10000}));
assert.equal(out.native.length,4);assert(out.native.every(Boolean));
assert(out.previewUnchanged&&out.clientHit&&out.accessibilityOK,'client name retains its hit target/accessibility and does not toggle the switch');
assert(out.footerHits.every(Boolean),'the entire footer buttons and switch row remain separate from account login');
assert.equal(out.footerSpacing.linksTop,out.footerSpacing.rowTop-4,'link buttons share the strip baseline');
assert.equal(out.footerSpacing.rowTop,out.footerSpacing.panelTop);
assert.equal(out.footerSpacing.rowBottom,out.footerSpacing.dataTop+6,
 'VPN controls are lifted 2pt within the unchanged header, with their hit regions');
assert(out.nativeMenu,'AppKit retains the real menu instead of a manual popup action');
assert.deepEqual(out.calls,['app','new','chatgpt','restart']);
assert.equal(out.geometry[0].width,128);assert.equal(out.geometry[0].height,24);
assert.equal(out.geometry[0].x,8);assert.equal(out.clientTitle,'MaoMaoYun','client entry is the name, with no separate App label');
assert(out.geometry[0].x+out.geometry[0].width<out.footerSpacing.switchX,'name and switch cannot intercept one another');
assert(out.hoverChecks.every(Boolean),'nested toolbar hover survives its native parent callback, switches exclusively, clears on exit/close and rejects detached controls: '+JSON.stringify(out.hoverChecks));
assert.equal(out.footer.length,8);
for(const row of out.footer){
 assert.equal(row.symbols,0,'no left symbol on '+row.source+' ('+row.locale+')');
 assert.equal(row.arrows,row.source==='Preferences'?1:0,'only the preferences disclosure arrow stays');
 assert(row.ink>5,'text starts at the 16pt content edge, without an empty icon gutter: '+JSON.stringify(row));
 assert.equal(row.height,24);assert(row.fontUnchanged,'existing menu font stays unchanged');
}
assert(!readSource('vpn').includes('https://app.maomao234.com/index.php#/dashboard'),'removed website shortcut cannot open a browser');
console.log('Native commands passed: original routing, four text-only footer entries at 16pt, bilingual glyph pixels, unchanged fonts/hits and preferences chevron.');
