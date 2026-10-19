const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');
const preview=process.argv.includes('--preview')?fs.mkdtempSync(path.join(os.tmpdir(),'codex-vpn-header-')):null;
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
// Production AppKit drawing, entirely offscreen; no account, VPN or UI actions.
const fixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
refreshAllSources=function(){throw Error('No readers during header testing');};
var reduced=true,previewPhase='';statusDisplayReducedMotion=function(){return reduced;};
var commands=0;startMaoMaoYunAction=function(){commands++;};
var phase='',record=null,rows=[],oldText=drawCardText,oldDot=drawMaoMaoYunStatusDot,oldSend=sendVoid;
function plainRect(rect){return {x:Number(rect.origin.x),y:Number(rect.origin.y),w:Number(rect.size.width),h:Number(rect.size.height)};}
drawCardText=function(text,x,y,width,size,color,bold){
 if(record&&phase==='name'&&text==='MaoMaoYun'){
  var font=cardFont(size,bold);
  var ink=$(text).boundingRectWithSizeOptionsAttributes($.NSMakeSize(1000,100),$.NSStringDrawingUsesDeviceMetrics,cardAttributes(size,color,bold));
  record.name={x:x,y:y,w:width,size:size,bold:bold,
   measured:Number($(text).sizeWithAttributes(cardAttributes(size,color,bold)).width),
   inkCenter:y+size+4-Number(font.ascender)+Number(ink.origin.y)+Number(ink.size.height)/2,
   muted:!!color.isEqual(cardColors().muted),white:!!color.isEqual($.NSColor.whiteColor)};
 }
 return oldText(text,x,y,width,size,color,bold);
};
drawMaoMaoYunStatusDot=function(bounds,x){var before=phase;phase='dot';oldDot(bounds,x);phase=before;};
sendVoid=function(object,selector){
 if(record&&phase==='switch'&&selector==='setFill')
  record.fills.push(!!object.colorWithAlphaComponent(1).isEqual(cardColors().blue));
 if(record&&phase==='name'&&selector==='fill')record.highlights.push(plainRect(object.bounds));
 if(record&&selector==='fill'&&(phase==='switch'||phase==='dot')){
  if(phase==='switch')record.shapes.push(plainRect(object.bounds));else record.dot=plainRect(object.bounds);
 }
 if(record&&phase==='dot'&&selector==='setFill')record.dotColor={
  green:!!object.colorWithAlphaComponent(1).isEqual(activeAccentColor(1)),muted:!!object.isEqual(cardColors().muted),alpha:Number(object.alphaComponent)};
 return oldSend.apply(null,arguments);
};
function paint(locale,status,highlighted,progress,opened){
 uiLanguage=locale;maomaoyunStatus=status;vpnSwitchPreviewValue=null;vpnSwitchAnimation.value=progress;
 menuIsOpen=opened!==false;clearMenuRowHover();if(highlighted)setMenuRowHoverControl(vpnAppButton);
 var parent=metricsPairView,strip=maomaoyunView,client=vpnAppButton;
 var bottom=Number(maomaoyunTrafficView.frame.origin.y)+Number(maomaoyunTrafficView.frame.size.height);
 record={locale:locale,status:status,highlighted:highlighted,progress:progress,shapes:[],fills:[],highlights:[],trafficTop:bottom,
  client:plainRect(client.frame),strip:plainRect(strip.frame),parent:plainRect(parent.frame)};
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,38));oldSend(image,'lockFocus');
 oldSend($.NSColor.colorWithCalibratedWhiteAlpha(.15,1),'setFill');$.NSRectFill($.NSMakeRect(0,0,MENU_WIDTH,38));
 $.NSGraphicsContext.saveGraphicsState;var crop=$.NSAffineTransform.transform;crop.translateXByYBy(0,-bottom);oldSend(crop,'concat');
 phase='parent';parent.drawRect(parent.bounds);
 [client,strip].forEach(function(view){
  $.NSGraphicsContext.saveGraphicsState;var move=$.NSAffineTransform.transform;
  move.translateXByYBy(view.frame.origin.x,view.frame.origin.y);oldSend(move,'concat');
  phase=view.isEqual(client)?'name':'switch';view.drawRect(view.bounds);$.NSGraphicsContext.restoreGraphicsState;
 });
 $.NSGraphicsContext.restoreGraphicsState;oldSend(image,'unlockFocus');phase='';
 var captured=record;record=null;rows.push(captured);
 ${preview?`
 if(locale==='zh-CN'&&status==='connected')
  $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation).representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({}))
   .writeToFileAtomically(${JSON.stringify(preview)}+'/header-'+progress+(highlighted?'-hover':'')+previewPhase+'.png',true);
 `:''}
}
['zh-CN','en'].forEach(function(locale){
 ['connected','disconnected','connecting','disconnecting','unknown','error'].forEach(function(status){
  [false,true].forEach(function(highlighted){paint(locale,status,highlighted,status==='connected'||status==='connecting'?1:0);});
 });
});
[0,.25,.5,.75,1].forEach(function(progress){paint('zh-CN','connected',false,progress);});
// Inspect actual transparent pixels, independent of font-metric assertions.
var alignments=[];
[1,2].forEach(function(scale){
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH*scale,32*scale));oldSend(image,'lockFocus');
 $.NSGraphicsContext.saveGraphicsState;var transform=$.NSAffineTransform.transform;
 transform.scaleXByYBy(scale,scale);oldSend(transform,'concat');
 [vpnAppButton,maomaoyunView].forEach(function(view){
  $.NSGraphicsContext.saveGraphicsState;var move=$.NSAffineTransform.transform;
  move.translateXByYBy(view.frame.origin.x,Number(view.frame.origin.y)-Number(maomaoyunView.frame.origin.y));oldSend(move,'concat');
  view.drawRect(view.bounds);$.NSGraphicsContext.restoreGraphicsState;
 });
 $.NSGraphicsContext.restoreGraphicsState;oldSend(image,'unlockFocus');
 var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),factor=Number(rep.pixelsWide)/MENU_WIDTH;
 function center(x0,x1,white){
  var top=Infinity,bottom=-1,weight=0,total=0;
  for(var y=0;y<Number(rep.pixelsHigh);y++)for(var x=Math.floor(x0*factor);x<Math.ceil(x1*factor);x++){
   var color=rep.colorAtXY(x,y).colorUsingColorSpace($.NSColorSpace.genericRGBColorSpace),alpha=Number(color.alphaComponent);
   if(white&&(Number(color.redComponent)<.95||Number(color.greenComponent)<.95||Number(color.blueComponent)<.95))continue;
   if(alpha>.2){top=Math.min(top,y);bottom=Math.max(bottom,y);}
   total+=alpha;weight+=alpha*(32-(y+.5)/factor);
  }
  return {center:32-(top+bottom+1)/2/factor,mass:weight/total};
 }
 var width=Number($('MaoMaoYun').sizeWithAttributes(cardAttributes(11,cardColors().muted,'medium')).width);
 alignments.push({scale:scale,name:center(16,16+width),dot:center(16+width+7,16+width+15),
  track:center(MENU_WIDTH-58,MENU_WIDTH-16),thumb:center(MENU_WIDTH-58,MENU_WIDTH-16,true)});
 ${preview?`rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(${JSON.stringify(preview)}+'/alignment-'+scale+'.png',true);`:''}
});
var stillRows=rows;rows=[];
var oldNow=Date.now,staticTime=0;Date.now=function(){return staticTime;};
refreshAllSources=function(){};maomaoyunStatus='connected';reduced=false;delegate.menuWillOpen(menu);
var firstTimer=menuTrackingTimer;
var noDotAnimation=typeof vpnStatusDotTimer==='undefined'&&typeof updateVPNStatusDotAnimation==='undefined';
[0,800,1600,2400,3200].forEach(function(time){
 staticTime=time;previewPhase='-static-'+time;paint('zh-CN','connected',false,1);
});
reduced=true;
previewPhase='-reduced';paint('zh-CN','connected',false,1);
reduced=false;delegate.menuDidClose(menu);
var stopped=menuTrackingTimer===null;
previewPhase='-closed';paint('zh-CN','connected',false,1,false);
delegate.menuWillOpen(menu);
var reopenedTimer=menuTrackingTimer!==null&&!menuTrackingTimer.isEqual(firstTimer);
staticTime=800;previewPhase='-reopened';paint('zh-CN','connected',false,1);
isExiting=true;previewPhase='-exiting';paint('zh-CN','connected',false,1);
isExiting=false;delegate.menuDidClose(menu);
var staticFrames=rows;rows=stillRows;Date.now=oldNow;reduced=true;previewPhase='';
drawCardText=oldText;drawMaoMaoYunStatusDot=oldDot;sendVoid=oldSend;
clearMenuRowHover();maomaoyunStatus='connected';menuIsOpen=true;vpnSwitchPreviewValue=null;
function click(x){var at=maomaoyunView.convertPointToView($.NSMakePoint(x,16),$());
 maomaoyunView.mouseDown($.NSEvent.mouseEventWithTypeLocationModifierFlagsTimestampWindowNumberContextEventNumberClickCountPressure(
  $.NSEventTypeLeftMouseDown,at,0,0,0,null,1,1,1));
}
// These are outside the smaller drawing, but still inside the original hit area.
var edgeClicks=[];
[5,49].forEach(function(x){vpnSwitchPreviewValue=null;click(x);edgeClicks.push(vpnSwitchPreviewValue===0&&maomaoyunStatus==='connected');});
vpnSwitchPreviewValue=null;click(3);var outside=vpnSwitchPreviewValue===null;
delegate.menuDidClose(menu);
var blue=cardColors().blue.colorUsingColorSpace($.NSColorSpace.sRGBColorSpace);
JSON.stringify({rows:rows,staticFrames:staticFrames,stopped:stopped,reopenedTimer:reopenedTimer,noDotAnimation:noDotAnimation,
 alignments:alignments,edgeClicks:edgeClicks,outside:outside,commands:commands,
 blue:[Number(blue.redComponent),Number(blue.greenComponent),Number(blue.blueComponent)],
 noFailures:menuViewCallbacks.failures.length===0,closed:vpnSwitchPreviewValue===null&&!vpnSwitchAnimation.timer});
`;
const native=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+definitions+'\n'+fixture],
 {encoding:'utf8',timeout:30000,maxBuffer:256000}));
assert.equal(native.rows.length,29);
assert.deepEqual(native.blue.map(value=>Math.round(value*255)),[15,126,255],'shared blue matches the Wi-Fi reference in sRGB');
const frames=native.staticFrames;
assert.equal(frames.length,9);assert(native.stopped&&native.reopenedTimer,'native close/reopen owns just the existing tracking timer');
assert(native.noDotAnimation,'the connected dot has no dedicated animation machinery');
for(const sample of native.alignments){
 for(const key of ['name','dot','thumb'])assert(Math.abs(sample[key].center-sample.track.center)<=.5,
  'Actual visible centers at '+sample.scale+'x: '+JSON.stringify(sample));
}
for(const frame of frames){
 assert.equal(frame.dot.w,6);assert.equal(frame.dot.h,6);assert.equal(frame.dotColor.alpha,1,'the dot remains static across time, motion preference and close/reopen');
 assert(frame.dotColor.green,'the static dot retains the original connected green');
 assert(Math.abs(frame.dot.x+frame.dot.w/2-(frames[0].dot.x+frames[0].dot.w/2))<.001,'the dot center never shifts');
 assert.deepEqual(frame.client,frames[0].client);assert.deepEqual(frame.strip,frames[0].strip);
}
for(const row of native.rows){
 const {name,dot,client,strip,shapes}=row;
 assert.equal(client.x+name.x,16,'the name aligns with all panel titles');
 assert.equal(name.size,11);assert.equal(name.bold,'medium');assert(name.measured<=name.w);
 assert(row.highlighted?name.white&&!name.muted:name.muted&&!name.white,'only the hovered name becomes white');
 assert.equal(row.highlights.length,row.highlighted?1:0,'one fitted hover background, none when idle');
 if(row.highlighted){
  const background=row.highlights[0];
  assert.equal(background.x,0);assert.equal(background.y,0);assert.equal(background.h,client.h);
  assert(Math.abs(background.w-(name.measured+30))<.001,'background fits the name, dot and padding');
  assert.equal(name.x-background.x,8);
  assert(Math.abs(background.x+background.w-(dot.x+dot.w/2+3)-8)<.001,'equal 8pt padding around the 6pt status slot');
  assert(background.w<client.w,'hover does not fill the unused right side of the hit target');
 }
 assert(Math.abs(dot.x+dot.w/2-(name.x+name.measured+8+3))<.001,'real-status dot follows the measured name with an 8pt gap');
 assert(dot.x+dot.w<client.w-8,'status stays inside the unchanged client hit area');
 assert.equal(client.w,128);assert.equal(client.h,24);assert.equal(strip.w,62);assert.equal(strip.h,32);
 assert.equal(shapes.length,3,'same base, blue overlay and single thumb');
 const [base,blue,thumb]=shapes;assert.deepEqual(blue,base);
 assert.equal(base.w,42);assert.equal(base.h,19);assert.equal(strip.x+base.x+base.w,272);
 assert.equal(thumb.w,25);assert.equal(thumb.h,15,'wide white capsule instead of a circular knob');
 assert.equal(thumb.x,base.x+2+13*row.progress);assert.equal(thumb.y,base.y+2);
 assert.deepEqual(row.fills,[false,true,false],'only the blue overlay uses the shared Wi-Fi accent, in every state and animation phase');
 const center=strip.y+base.y+base.h/2;
 assert(Math.abs(client.y+name.inkCenter-center)<.001,'actual glyph center matches the switch, not a cap-height estimate');
 assert(Math.abs(client.y+dot.y+dot.h/2-center)<.001);
 assert.equal(strip.y,row.trafficTop+6,'both the switch drawing and its full hit view move up 2pt');
 assert.equal(client.y,strip.y+4,'name, status dot and hover target move as one group');
 assert.equal(row.parent.h,row.trafficTop+38,'data and native row height stay unchanged');
 assert.equal(row.parent.h-(strip.y+base.y+base.h),6.5,'2pt less upper drawing whitespace, before system menu inset');
 assert.equal(strip.y+base.y-(row.trafficTop+2),10.5,'2pt more clearance above the unchanged divider');
 if(row.status==='connected')assert(row.dotColor.green,'real connected state keeps prediction green');
 if(row.status==='disconnected'||row.status==='unknown')assert(row.dotColor.muted);
}
assert(native.edgeClicks.every(Boolean)&&native.outside,'the original switch hit region is not reduced');
assert.equal(native.commands,0,'visual changes must not connect/disconnect VPN');
assert(native.noFailures&&native.closed);
console.log('VPN header passed: static 6pt green dot across time/close/reopen, no animation timer, actual glyph alignment, unchanged hits/layout and no VPN commands.');
if(preview)console.log('Preview: '+preview);
