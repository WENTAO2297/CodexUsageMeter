const assert = require('assert/strict');
const vm = require('vm');
const {spawnSync} = require('child_process');
const {readSource, readLibrarySource} = require('./sources.cjs');

// Explicit ink bounds, rather than a fixed shift for every string. Exercise
// caching and compatibility fallbacks without changing the user's settings.
let measures = 0, boundsCalls = 0, behavior = 'valid';
const points = [];
const bridge = value => typeof value === 'string' ? {
  sizeWithAttributes() { measures++; return {width:14,height:13}; },
  boundingRectWithSizeOptionsAttributes(size, options) {
    assert.equal(options,8); boundsCalls++;
    if(behavior==='throw')throw new Error('Unsupported bridge');
    const width = behavior==='empty'?0:behavior==='large'?30:11;
    return {origin:{x:behavior==='nonfinite'?NaN:.5,y:-.1},size:{width,height:7.7}};
  },
  drawAtPointWithAttributes(point) { points.push(point); }
} : value;
Object.assign(bridge,{
  NSStringDrawingUsesDeviceMetrics:8,
  NSMakeSize:(width,height)=>({width,height}), NSMakePoint:(x,y)=>({x,y})
});
const ctx=vm.createContext({
  ObjC:{unwrap:value=>value}, $:bridge, quotaWindows:[{durationMins:300,remaining:91}],
  statusQuotaFont:()=>({fontName:'TestRounded'})
});
vm.runInContext(readSource('core')+'\n'+readSource('status-icon'),ctx);
const center={x:12.5,y:12.2};
ctx.drawQuotaStatusNumber(center,{});
assert.equal(points.at(-1).x,6.5,'origin includes the glyph bearing, not only its width');
assert(Math.abs(points.at(-1).y-5.7)<1e-9,'vertical baseline is unchanged');
ctx.drawQuotaStatusNumber(center,{differentColor:true});
assert.equal(measures,1); assert.equal(boundsCalls,1,'animation/color redraws reuse the cached geometry');
ctx.quotaWindows=[{remaining:76}];ctx.drawQuotaStatusNumber(center,{});
assert.equal(measures,2,'another number receives its own measurement');
for(const fallback of ['throw','empty','large','nonfinite']) {
  behavior=fallback;ctx.drawQuotaStatusNumber.layouts={};ctx.drawQuotaStatusNumber(center,{});
  assert.equal(points.at(-1).x,5.5,'metric failure falls back safely to the existing layout');
}

// Rasterize the production draw function at 1x and 2x, without opening any
// window/menu, starting readers, touching accounts, or changing preferences.
const fixture=`
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
function visibleBounds(image, scale) {
  var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
  var w=Number(rep.pixelsWide),h=Number(rep.pixelsHigh),left=w,right=-1,top=h,bottom=-1;
  // lockFocus can supply a Retina representation on a graphical host. Convert
  // actual bitmap pixels to the original 25pt coordinate system, not an
  // assumed backing scale. Scan only the padded glyph region, not empty space.
  var sx=w/25,sy=h/25;
  for(var y=Math.floor(6.8*sy);y<Math.ceil(18.8*sy);y++)for(var x=Math.floor(2.5*sx);x<Math.ceil(22.5*sx);x++) {
    if(Number(rep.colorAtXY(x,y).alphaComponent)>.2) {
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
  }
  return {cx:(left+right+1)/2/sx,cy:25-(top+bottom+1)/2/sy,
    width:(right-left+1)/sx,height:(bottom-top+1)/sy,backingScale:sx};
}
var results=[],before=[],metrics=[];
// Check the entire quota vocabulary using actual AppKit glyph measurements;
// raster-check representative narrow/wide values separately. Calling colorAt
// for every pixel of 204 Retina images is unnecessarily expensive in CI.
for(var number=0;number<=101;number++) {
  var quota=number===101?null:number;
  quotaWindows=[{durationMins:10080,remaining:quota}];
  var text=remainingQuotaText(quotaWindows),fontSize=text.length>2?7.5:10.5,font=statusQuotaFont(fontSize);
  var attributes=$({NSFont:font,NSColor:cardColor(1,1,1,1)}),value=$(text);
  var image=$.NSImage.alloc.initWithSize($.NSMakeSize(25,25));
  sendVoid(image,'lockFocus');drawQuotaStatusNumber($.NSMakePoint(12.5,12.2),cardColor(1,1,1,1));
  var bounds=value.boundingRectWithSizeOptionsAttributes($.NSMakeSize(25,25),$.NSStringDrawingUsesDeviceMetrics,attributes);
  var size=value.sizeWithAttributes(attributes);
  var layout=drawQuotaStatusNumber.layouts[ObjC.unwrap(font.fontName)+':'+fontSize+':'+text];
  metrics.push({text:text,width:Number(bounds.size.width),
    cx:12.5-layout.x+Number(bounds.origin.x)+Number(bounds.size.width)/2,
    baselinePreserved:layout.y===Number(size.height)/2});
  sendVoid(image,'unlockFocus');
}
[1,2].forEach(function(scale) {
  [1,5,9,11,76,88,91,100,null].forEach(function(quota) {
    quotaWindows=[{durationMins:10080,remaining:quota}];
    var image=$.NSImage.alloc.initWithSize($.NSMakeSize(25*scale,25*scale));
    sendVoid(image,'lockFocus');
    var transform=$.NSAffineTransform.transform;transform.scaleXByYBy(scale,scale);sendVoid(transform,'concat');
    drawQuotaStatusNumber($.NSMakePoint(12.5,12.2),cardColor(1,1,1,1));
    sendVoid(image,'unlockFocus');
    results.push({text:remainingQuotaText(quotaWindows),scale:scale,bounds:visibleBounds(image,scale)});
  });
  // The previous algorithm is retained only as a test oracle for this bug.
  var old=$.NSImage.alloc.initWithSize($.NSMakeSize(25*scale,25*scale));
  sendVoid(old,'lockFocus');
  var transform=$.NSAffineTransform.transform;transform.scaleXByYBy(scale,scale);sendVoid(transform,'concat');
  var attributes=$({NSFont:statusQuotaFont(10.5),NSColor:cardColor(1,1,1,1)}),value=$('91');
  var size=value.sizeWithAttributes(attributes);
  value.drawAtPointWithAttributes($.NSMakePoint(12.5-size.width/2,12.2-size.height/2),attributes);
  sendVoid(old,'unlockFocus');before.push({scale:scale,bounds:visibleBounds(old,scale)});
});
JSON.stringify({results:results,before:before,metrics:metrics,cacheEntries:Object.keys(drawQuotaStatusNumber.layouts).length});
`;
const run=spawnSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+fixture],
  {encoding:'utf8',timeout:30000,maxBuffer:65536});
assert.equal(run.status,0,run.stderr||run.error?.message||'Native alignment test failed');
const native=JSON.parse(run.stdout);
assert.equal(native.metrics.length,102);
assert.equal(native.results.length,18);
assert.equal(native.cacheEntries,102,'the quota vocabulary bounds the in-memory metric cache');
for(const entry of native.metrics) {
  assert(entry.width>0&&entry.width<18,'all glyph outlines fit inside the existing ring');
  assert(Math.abs(entry.cx-12.5)<1e-9,entry.text+' must include its real side bearing');
  assert(entry.baselinePreserved,'baseline metrics must not change');
}
for(const entry of native.results) {
  assert(entry.bounds.width>0&&entry.bounds.width<18,'glyphs fit inside the existing ring');
  assert(Math.abs(entry.bounds.cx-12.5)<=.5+1e-9,entry.text+' @'+entry.scale+'x is visually off center');
  if(entry.text!=='—')assert(Math.abs(entry.bounds.cy-12.2)<=.5+1e-9,'keep the original digit baseline');
}
for(const entry of native.before) {
  const after=native.results.find(item=>item.text==='91'&&item.scale===entry.scale);
  assert(Math.abs(entry.bounds.cx-12.5)>=1,'the oracle must reproduce the reported 91 bug');
  const halfPixel=.5/after.bounds.backingScale;
  assert(Math.abs(after.bounds.cx-12.5)<=halfPixel+1e-9,'91 must center within half a rendered pixel');
  assert(Math.abs(after.bounds.cx-12.5)<Math.abs(entry.bounds.cx-12.5),'correct the original left shift');
  assert(Math.abs(after.bounds.cy-entry.bounds.cy)<=halfPixel+1e-9,'preserve the baseline, allowing edge antialiasing');
}
console.log('Alignment checks passed: cached bearings/fallbacks, all 0–100/unknown glyph bounds, native pixel samples at two scales; 91 centered, baseline and size preserved.');
