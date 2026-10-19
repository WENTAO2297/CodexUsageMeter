const assert=require('assert/strict');
const vm=require('vm');
const {spawnSync}=require('child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');

let calls=0,mode='valid';
const bridge=value=>({boundingRectWithSizeOptionsAttributes(){
  calls++;
  if(mode==='throw')throw new Error('Unavailable metrics');
  return {origin:{y:mode==='invalid'?NaN:-.5},size:{height:mode==='empty'?0:8}};
}});
Object.assign(bridge,{NSMakeSize:(width,height)=>({width,height}),NSStringDrawingUsesDeviceMetrics:8});
const context=vm.createContext({$:bridge,ObjC:{unwrap:v=>v},uiText:t=>t,
  cardFont:(size,bold)=>({fontName:bold?'Bold':'Regular',ascender:8,capHeight:6}),
  cardAttributes:()=>({}),cardColors:()=>({body:{}})});
vm.runInContext(readSource('dashboard'),context);
assert.equal(context.meterStatusIconY('clock','Last known',10,9,true,11),13);
assert.equal(context.meterStatusIconY('clock','Last known',20,9,true,11),23);
assert.equal(calls,1,'redraws reuse font geometry, not native image scans');
assert.equal(context.meterStatusIconY('exclamationmark.triangle.fill','Last known',10,9,true,11),13.25);
assert.equal(calls,1,'different symbols reuse the same localized text measurement');
context.meterStatusIconY('clock','上次读数',10,9,true,11);
context.meterStatusIconY('clock','Last known',10,9,false,11);
assert.equal(calls,3,'language and font changes have separate geometry');
for(mode of ['throw','invalid','empty']){
  context.meterStatusIconY.centers={};
  assert.equal(context.meterStatusIconY('clock','Last known',10,9,true,11),12.5,'cap-height fallback');
}

// Real transparent AppKit rendering, not a screenshot or a synthetic font box.
// These fixtures do not open windows, access accounts, or alter preferences.
const fixture=`
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
function inkCenter(image,x0,x1){
  var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
  var sx=Number(rep.pixelsWide)/140,sy=Number(rep.pixelsHigh)/40,top=Infinity,bottom=-1;
  function rowHasInk(y){
    for(var x=Math.floor(x0*sx);x<Math.ceil(x1*sx);x++)if(Number(rep.colorAtXY(x,y).alphaComponent)>.2)return true;
    return false;
  }
  // Only find the two outer rows. Full per-pixel scans become unnecessarily
  // expensive on a real Retina host, especially after a 2x drawing transform.
  for(var y=Math.floor(8*sy);y<Math.ceil(26*sy);y++)if(rowHasInk(y)){top=y;break;}
  for(var y=Math.ceil(26*sy)-1;y>=Math.floor(8*sy);y--)if(rowHasInk(y)){bottom=y;break;}
  return {center:40-(top+bottom+1)/2/sy,height:(bottom-top+1)/sy};
}
var rows=[],before=[];
var cases=[['Above pace',12,12,true],['On pace',12,12,true],['Quota low',12,12,true],
  ['Last known',12,12,true],['No data',12,12,true],['Observing',12,12,true],
  ['Awaiting quota',10,9,false],['Token activity',9,12,true]];
function render(item,scale,old){
  var label=item[0],iconSize=item[1],fontSize=item[2],bold=item[3];
  var symbol=label==='Token activity'?'clock':meterStatusSymbol(label);
  var image=$.NSImage.alloc.initWithSize($.NSMakeSize(140*scale,40*scale));sendVoid(image,'lockFocus');
  var transform=$.NSAffineTransform.transform;transform.scaleXByYBy(scale,scale);sendVoid(transform,'concat');
  var iconY=old?15:meterStatusIconY(symbol,label,14,fontSize,bold,iconSize);
  drawMeterStatusIcon(symbol,3,iconY,iconSize,$.NSColor.whiteColor,'alignment');
  drawCardText(label,20,14,118,fontSize,$.NSColor.whiteColor,bold);sendVoid(image,'unlockFocus');
  var textWidth=Number($(uiText(label)).sizeWithAttributes(cardAttributes(fontSize,$.NSColor.whiteColor,bold)).width);
  return {language:uiLanguage,label:label,scale:scale,size:iconSize,
    icon:inkCenter(image,0,17),text:inkCenter(image,20,Math.min(140,21+textWidth))};
}
['zh-CN','en'].forEach(function(locale){uiLanguage=locale;
  [1,2].forEach(function(scale){cases.forEach(function(item){rows.push(render(item,scale,false));});
    if(locale==='zh-CN')before.push(render(cases[0],scale,true));
  });
});
// Both the header and reusable reset-card renderer call the same alignment
// helper; exercise the latter rather than just comparing standalone geometry.
var savedIcon=drawMeterStatusIcon,received=null;
drawMeterStatusIcon=function(name,x,y,size,color,tone){received={name:name,y:y,size:size};
  return savedIcon(name,x,y,size,color,tone);};
var image=$.NSImage.alloc.initWithSize($.NSMakeSize(140,40));sendVoid(image,'lockFocus');
drawMeterStatusText('Last known',3,14,130,9,$.NSColor.whiteColor,false,'left');sendVoid(image,'unlockFocus');
JSON.stringify({rows:rows,before:before,shared:received,
  expectedY:meterStatusIconY('clock','Last known',14,9,false,10)});
`;
const result=spawnSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+fixture],
  {encoding:'utf8',timeout:45000,maxBuffer:65536});
assert.equal(result.status,0,result.stderr||result.error?.message||'Native status symbol test failed');
const native=JSON.parse(result.stdout);
assert.equal(native.rows.length,32);
for(const row of native.rows){
  assert(row.icon.height>0&&row.icon.height<=row.size+1,'symbol size remains unchanged');
  assert(row.text.height>0,'the actual localized text was painted');
  assert(Math.abs(row.icon.center-row.text.center)<=.75,
    `${row.language}/${row.label} @${row.scale}x has a low or raised symbol: ${JSON.stringify(row)}`);
}
for(const old of native.before){
  const corrected=native.rows.find(row=>row.language===old.language&&row.label===old.label&&row.scale===old.scale);
  assert(old.text.center-old.icon.center>=.75,'fixture reproduces the reported low triangle: '+JSON.stringify(old));
  assert(corrected.icon.center>old.icon.center,'raise the icon, not the text or entire header');
  assert(Math.abs(corrected.icon.center-corrected.text.center)<Math.abs(old.icon.center-old.text.center));
}
assert.equal(native.shared.size,10);
assert.equal(native.shared.y,native.expectedY,'reset-card statuses use the same localized alignment');
console.log('Status symbols aligned: cached glyph centers/fallbacks and bilingual native 1x/2x pixels; triangle, circles, clock, hourglass and refresh keep their sizes.');
