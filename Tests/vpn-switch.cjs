const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readSource, readLibrarySource} = require('./sources.cjs');
const definitions = readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
// Offscreen native rendering and synthetic status/click events. Never runs scutil.
const fixture = `
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};buildMenu();
// Exercise the moved control in its own local coordinates, without a window.
maomaoyunView.removeFromSuperview;MENU_WIDTH=180;
maomaoyunView.setFrame($.NSMakeRect(0,0,MENU_WIDTH,32));
refreshAllSources=function(){};
var commands=[],opens=0,checks=[];
startMaoMaoYunAction=function(action,reconnect){commands.push(action);};
openMaoMaoYunApp=function(){opens++;};
var now=10000;Date.now=function(){return now;};
statusDisplayReducedMotion=function(){return false;};
maomaoyunStatus='disconnected';updateMaoMaoYunMenuItem();
menuIsOpen=true;maomaoyunStatus='connecting';updateMaoMaoYunMenuItem();
checks.push(vpnSwitchAnimation.value===0&&!!vpnSwitchAnimation.timer);
now+=28;stepVPNSwitchAnimation();checks.push(vpnSwitchAnimation.value>0&&vpnSwitchAnimation.value<0.02);
now+=112;stepVPNSwitchAnimation();var middle=vpnSwitchAnimation.value;
checks.push(Math.abs(middle-0.5)<0.0001);
var started=vpnSwitchAnimation.startedAt;updateMaoMaoYunMenuItem();
checks.push(vpnSwitchAnimation.startedAt===started);
// Rapid reversal starts at the displayed position, not an endpoint.
maomaoyunStatus='disconnecting';updateMaoMaoYunMenuItem();
checks.push(vpnSwitchAnimation.from===middle&&vpnSwitchAnimation.target===0);
now+=280;stepVPNSwitchAnimation();checks.push(vpnSwitchAnimation.value===0&&!vpnSwitchAnimation.timer);
maomaoyunStatus='connecting';updateMaoMaoYunMenuItem();
var previous=0;for(var frame=0;frame<28;frame++){
 now+=10;stepVPNSwitchAnimation();checks.push(vpnSwitchAnimation.value>=previous&&vpnSwitchAnimation.value<=1);
 previous=vpnSwitchAnimation.value;
}
checks.push(vpnSwitchAnimation.value===1);
maomaoyunStatus='error';updateMaoMaoYunMenuItem();now+=280;stepVPNSwitchAnimation();
checks.push(vpnSwitchAnimation.value===0&&!vpnSwitchAnimation.timer);
maomaoyunStatus='connected';updateMaoMaoYunMenuItem();delegate.menuDidClose(menu);
checks.push(vpnSwitchAnimation.value===1&&!vpnSwitchAnimation.timer);
menuIsOpen=true;statusDisplayReducedMotion=function(){return true;};
maomaoyunStatus='disconnected';updateMaoMaoYunMenuItem();
checks.push(vpnSwitchAnimation.value===0&&!vpnSwitchAnimation.timer);
var colors=[];
['disconnected','connecting','connected','disconnecting','unknown','error'].forEach(function(status){
 maomaoyunStatus=status;updateMaoMaoYunMenuItem();
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,32));image.lockFocus;
 $.NSColor.colorWithCalibratedWhiteAlpha(.15,1).setFill;$.NSBezierPath.fillRect(maomaoyunView.bounds);
 maomaoyunView.drawRect(maomaoyunView.bounds);image.unlockFocus;
 var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
 var pixel=rep.colorAtXY(Math.floor((MENU_WIDTH-48)*Number(rep.pixelsWide)/MENU_WIDTH),
  Math.floor(16*Number(rep.pixelsHigh)/32)).colorUsingColorSpace($.NSColorSpace.deviceRGBColorSpace);
 colors.push([Number(pixel.redComponent),Number(pixel.greenComponent),Number(pixel.blueComponent)]);
 checks.push(ObjC.unwrap(maomaoyunView.accessibilityRole)==='AXCheckBox');
 checks.push(Number(ObjC.unwrap(maomaoyunView.accessibilityValue))===(status==='connected'?1:status==='disconnected'?0:2));
});
function clickVPN(x){maomaoyunView.mouseDown($.NSEvent.mouseEventWithTypeLocationModifierFlagsTimestampWindowNumberContextEventNumberClickCountPressure(
 $.NSEventTypeLeftMouseDown,$.NSMakePoint(x,16),0,0,0,null,1,1,1));}
maomaoyunStatus='connected';clickVPN(35);checks.push(vpnSwitchPreviewValue===null);
clickVPN(MENU_WIDTH-40);
checks.push(vpnSwitchPreviewValue===0&&maomaoyunStatus==='connected');
updateMaoMaoYunMenuItem();checks.push(vpnSwitchTarget()===0);
maomaoyunStatus='disconnected';clickVPN(MENU_WIDTH-40);
checks.push(vpnSwitchPreviewValue===1&&maomaoyunStatus==='disconnected');
clickVPN(MENU_WIDTH-20);
sendVoid(maomaoyunView,'accessibilityPerformPress');
maomaoyunStatus='disconnecting';sendVoid(maomaoyunView,'accessibilityPerformPress');
isExiting=true;clickVPN(MENU_WIDTH-40);
checks.push(!maomaoyunView.accessibilityPerformPress);
delegate.menuDidClose(menu);checks.push(vpnSwitchPreviewValue===null);
stopVPNSwitchAnimation();
JSON.stringify({checks:checks,commands:commands,opens:opens,colors:colors});
`;
const result = JSON.parse(execFileSync('/usr/bin/osascript', ['-l','JavaScript','-e',
  readLibrarySource()+'\n'+definitions+'\n'+fixture], {encoding:'utf8',timeout:10000}));
result.checks.forEach((ok,i)=>assert(ok, `VPN switch check ${i}`));
assert.deepEqual(result.commands, [], 'preview must never control VPN, including accessibility presses');
assert.equal(result.opens, 0, 'the removed header arrow must no longer open the app');
const [off,pending,on] = result.colors;
assert(Math.abs(off[2]-off[0])<0.03);
assert(on[2]>on[0]+0.3, 'connected track is blue');
assert(pending[2]-pending[0]<on[2]-on[0], 'pending track differs from confirmed');
console.log('VPN switch: native rendering, transition/reversal, error rollback, reduced motion, lifecycle, clicks and accessibility passed (no network changes).');
