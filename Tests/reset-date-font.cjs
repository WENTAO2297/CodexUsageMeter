const assert=require('node:assert/strict'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');

// Font lookup and ink measurement happen once, not on every native redraw.
function fixtureContext(available,metricsMode='valid'){
 let lookups=[],measurements=0,draws=[];
 const font={fontName:'DINCondensed-Bold',pointSize:13,ascender:9,capHeight:9};
 const bridge=value=>typeof value==='string'?{
  sizeWithAttributes:()=>({width:22,height:13}),
  boundingRectWithSizeOptionsAttributes(){
   measurements++;
   if(metricsMode==='throw')throw Error('Unavailable ink bounds');
   return {origin:{x:metricsMode==='invalid'?NaN:1,y:0},size:{width:20,height:9}};
  },
  drawInRectWithAttributes(rect){draws.push(rect);}
 }:value;
 Object.assign(bridge,{
  NSFont:{fontWithNameSize(name,size){lookups.push(name);
   return available.includes(name)?{...font,fontName:name,pointSize:size}:{fontName:null,pointSize:0};},
   monospacedDigitSystemFontOfSizeWeight(){return {...font,fontName:'SystemTabular',pointSize:11};}},
  NSMakeSize:(width,height)=>({width,height}),
  NSMakeRect:(x,y,w,h)=>({x,y,w,h}),NSStringDrawingUsesDeviceMetrics:8,NSFontWeightSemibold:.23
 });
 const context=vm.createContext({$:bridge,ObjC:{unwrap:value=>value},renderState:{fonts:{}}});
 vm.runInContext(readSource('meter-panels').split('function meterTokenText')[0],context);
 return {context,lookups,draws,measurements:()=>measurements};
}
let mock=fixtureContext(['DINCondensed-Bold']);
const year=new Date().getFullYear();
for(const [month,day,expected] of [[11,7,'11/07'],[11,9,'11/09'],[11,10,'11/10'],[10,30,'10/30'],[1,1,'1/01']]){
 assert.equal(mock.context.meterDateText(new Date(year,month-1,day,12).getTime()/1000),expected,'reset-card days use two digits');
}
const nextYear=new Date(year+1,10,7,12).getTime()/1000;
assert.equal(mock.context.meterDateText(nextYear),(year+1)+'/11/07');
const savedMetrics=mock.context.resetCardDateMetrics;
mock.context.resetCardDateMetrics=text=>({glyph:{w:text.length*5}});
mock.context.resetCardDateCapsuleWidth=36;
assert.equal(mock.context.resetCardDateText(nextYear),'11/07','year truncation preserves the leading zero');
mock.context.resetCardDateCapsuleWidth=80;
assert.equal(mock.context.resetCardDateText(nextYear),(year+1)+'/11/07');
mock.context.resetCardDateMetrics=savedMetrics;
for(let index=0;index<4;index++){
 const ink=mock.context.drawResetCardDate('11/07',16,24,36,{});
 assert.equal(ink.x+ink.w/2,34);assert.equal(ink.y+ink.h/2,24);
}
assert.deepEqual(mock.lookups,['DINCondensed-Bold']);assert.equal(mock.measurements(),1);
mock=fixtureContext(['DINAlternate-Bold']);
assert.equal(mock.context.resetCardDateFont().fontName,'DINAlternate-Bold','truthy Objective-C nil cannot win font selection');
mock=fixtureContext([]);
assert.equal(mock.context.resetCardDateFont().fontName,'SystemTabular','a missing DIN installation has a readable native fallback');
for(const mode of ['throw','invalid']){
 mock=fixtureContext(['DINCondensed-Bold'],mode);
 const ink=mock.context.drawResetCardDate('10/30',16,24,36,{});
 assert.equal(ink.x+ink.w/2,34);assert.equal(ink.y+ink.h/2,24);
 assert(mock.draws.every(rect=>Object.values(rect).every(Number.isFinite)));
}

// Transparent offscreen AppKit fixtures verify actual glyph pixels at both
// rendering scales; no windows, account readers or desktop capture are used.
const native=`
function dateInk(image,width){
 var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),sx=Number(rep.pixelsWide)/100,sy=Number(rep.pixelsHigh)/40;
 var left=Infinity,right=-1,top=Infinity,bottom=-1;
 var x0=Math.floor(16*sx),x1=Math.ceil((16+width)*sx),y0=Math.floor(12*sy),y1=Math.ceil(35*sy);
 function row(y){for(var x=x0;x<x1;x++)if(Number(rep.colorAtXY(x,y).alphaComponent)>.2)return true;return false;}
 function column(x){for(var y=top;y<=bottom;y++)if(Number(rep.colorAtXY(x,y).alphaComponent)>.2)return true;return false;}
 for(var y=y0;y<y1;y++)if(row(y)){top=y;break;}
 for(var y=y1-1;y>=y0;y--)if(row(y)){bottom=y;break;}
 for(var x=x0;x<x1;x++)if(column(x)){left=x;break;}
 for(var x=x1-1;x>=x0;x--)if(column(x)){right=x;break;}
 return {x:(left+right+1)/2/sx,y:40-(top+bottom+1)/2/sy,w:(right-left+1)/sx,h:(bottom-top+1)/sy};
}
var rows=[],cases=[['10/30',36],['11/07',36],['1/01',36],['12/31',36],['1/11',36],['2037/11/07',68]];
[1,2].forEach(function(scale){cases.forEach(function(item){
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(100*scale,40*scale));sendVoid(image,'lockFocus');
 var transform=$.NSAffineTransform.transform;transform.scaleXByYBy(scale,scale);sendVoid(transform,'concat');
 var layout=drawResetCardDate(item[0],16,24,item[1],$.NSColor.whiteColor);sendVoid(image,'unlockFocus');
 rows.push({text:item[0],scale:scale,width:item[1],layout:layout,ink:dateInk(image,item[1])});
});});
var attributes=$({NSFont:resetCardDateFont()});
JSON.stringify({rows:rows,font:ObjC.unwrap(resetCardDateFont().fontName),size:Number(resetCardDateFont().pointSize),
 ones:Number($('1111').sizeWithAttributes(attributes).width),eights:Number($('8888').sizeWithAttributes(attributes).width)});
`;
const rendered=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',readLibrarySource()+'\n'+native],
 {encoding:'utf8',timeout:45000,maxBuffer:65536}));
assert.equal(rendered.font,'DINCondensed-Bold');assert.equal(rendered.size,13);
assert(Math.abs(rendered.ones-rendered.eights)<.01,'numeric advances remain tabular');
for(const row of rendered.rows){
 assert(row.ink.w>0&&row.ink.h>0,'date text really paints');
 assert(Math.abs(row.ink.x-(16+row.width/2))<=.75,'visible date ink is horizontally centered: '+JSON.stringify(row));
 assert(Math.abs(row.ink.y-24)<=.75,'visible date ink is vertically centered: '+JSON.stringify(row));
 assert(row.ink.w<=row.width-5&&row.ink.h<=12,'larger condensed dates keep their capsule inset');
}
console.log('Reset dates passed: cached native DIN Condensed, tabular digits, nil/fallback safety and centered 1x/2x glyph pixels.');
