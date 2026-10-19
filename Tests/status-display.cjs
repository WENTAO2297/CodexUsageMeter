const assert = require('assert/strict');
const vm = require('vm');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {randomUUID} = require('crypto');
const {spawnSync} = require('child_process');
const {readSource:read, readLibrarySource} = require('./sources.cjs');

const mainDefinitions = read('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
let methods, saved, readFails = false, writeFails = false, redraws = 0, titleUpdates = 0;
const writes = [], errors = [];
const preferences = {
  stringForKey(key) {
    assert.equal(key,'menuBarDisplayMode');
    if(readFails)throw new Error('read unavailable');
    return saved;
  },
  setObjectForKey(value,key) {
    assert.equal(key,'menuBarDisplayMode');
    if(writeFails)throw new Error('write unavailable');
    saved=value;writes.push(value);
  }
};
const ctx = vm.createContext({
  ObjC:{unwrap:value=>value,registerSubclass:def=>{methods=def.methods;}},
  $:Object.assign(value=>value,{
    NSUserDefaults:{standardUserDefaults:preferences},
    NSControlStateValueOn:1,NSControlStateValueOff:0
  }),
  isExiting:false,statusDisplayMode:'quota',STATUS_DISPLAY_PREFERENCE_KEY:'menuBarDisplayMode',
  STATUS_DISPLAY_OPTIONS:[{mode:'quota',title:'Remaining Quota'},{mode:'icon',title:'Codex Icon'}],
  statusDisplayExpanded:false,statusDisplayDisclosureItem:{view:{setNeedsDisplay(){}}},
  statusDisplayReveal:0,statusDisplayAnimation:{timer:null},menuIsOpen:false,
  stopTransientTimer(){return null;},
  statusDisplayMenuItems:{quota:{state:0,view:{state:1}},icon:{state:0,view:{state:0}}},
  menu:{},sendVoid(object,selector){assert.equal(object,ctx.menu);assert.equal(selector,'update');},
  statusIconQuotaFraction:0.38,statusIconQuotaTargetFraction:0.76,
  quotaRingAnimationTimer:{valid:true},quotaRingAnimationStartedAt:123,
  statusIconCurrentColor:{red:0.39,green:0.85,blue:0.60,alpha:1},
  statusTransitionToMode:'active',statusTransitionStartedAt:456,
  logError:(component,error)=>errors.push([component,String(error)])
});
vm.runInContext(read('core')+'\n'+read('status-icon')+'\n'+read('menu-rows')+'\n'+read('preferences')+'\n'+mainDefinitions,ctx);
ctx.rebuildStatusIconImages=()=>{redraws++;};
ctx.updateStatusButtonTitle=()=>{titleUpdates++;};

for(const value of [undefined,null,'','quota','invalid',1])assert.equal(ctx.normalizeStatusDisplayMode(value),'quota');
assert.equal(ctx.normalizeStatusDisplayMode('icon'),'icon');
for(const value of [0,1,5,20,76,99,100]) {
  assert.equal(ctx.remainingQuotaText([{durationMins:300,remaining:value}]),String(value));
}
assert.equal(ctx.remainingQuotaText([{remaining:76.4}]),'76');
assert.equal(ctx.remainingQuotaText([{remaining:76.5}]),'77');
for(const value of [null,undefined,-1,101,NaN,Infinity,'76'])assert.equal(ctx.remainingQuotaText([{remaining:value}]),'—');
for(const windows of [null,undefined,[],{}])assert.equal(ctx.remainingQuotaText(windows),'—');
assert.equal(ctx.remainingQuotaText([{durationMins:10080,remaining:90},{durationMins:300,remaining:42}]),'42');
assert.equal(ctx.remainingQuotaText([{durationMins:60,remaining:1},{durationMins:10080,remaining:76}]),'76');

// A missing/invalid setting is numeric by default; a stored logo is retained.
ctx.restoreStatusDisplayMode();assert.equal(ctx.statusDisplayMode,'quota');
saved='icon';ctx.restoreStatusDisplayMode();assert.equal(ctx.statusDisplayMode,'icon');
saved='invalid';ctx.restoreStatusDisplayMode();assert.equal(ctx.statusDisplayMode,'quota');
readFails=true;ctx.restoreStatusDisplayMode();readFails=false;
assert.equal(ctx.statusDisplayMode,'quota');assert.equal(errors.at(-1)[0],'status-display-read');

const animationState=()=>JSON.stringify([
  ctx.statusIconQuotaFraction,ctx.statusIconQuotaTargetFraction,ctx.quotaRingAnimationTimer,
  ctx.quotaRingAnimationStartedAt,ctx.statusIconCurrentColor,
  ctx.statusTransitionToMode,ctx.statusTransitionStartedAt
]);
const animationBefore=animationState();
const press=tag=>methods['statusDisplayButton:'].implementation({tag});
const choose=mode=>press(mode==='quota'?1:mode==='icon'?2:-1);
press(0);
assert.equal(ctx.statusDisplayExpanded,true);
assert.equal(ctx.statusDisplayMenuItems.icon.hidden,false);
assert.equal(ctx.statusDisplayMenuItems.quota.hidden,false);
assert.equal(writes.length,0,'expanding must not write preferences');
choose('icon');
assert.equal(ctx.statusDisplayMode,'icon');assert.equal(saved,'icon');assert.deepEqual(writes,['icon']);
assert.equal(ctx.statusDisplayMenuItems.icon.view.state,1);assert.equal(ctx.statusDisplayMenuItems.quota.view.state,0);
assert.equal(redraws,1);assert.equal(animationState(),animationBefore);
choose('icon');choose('invalid');choose(null);
ctx.isExiting=true;choose('quota');ctx.isExiting=false;
assert.equal(redraws,1);assert.deepEqual(writes,['icon']);
writeFails=true;choose('quota');writeFails=false;
assert.equal(ctx.statusDisplayMode,'icon');assert.equal(ctx.statusDisplayMenuItems.icon.view.state,1);
assert.equal(errors.at(-1)[0],'status-display-save');assert.equal(redraws,1);
choose('quota');
assert.equal(saved,'quota');assert.equal(ctx.statusDisplayMenuItems.quota.view.state,1);
assert.equal(ctx.statusDisplayMenuItems.icon.view.state,0);assert.equal(redraws,2);
assert.equal(animationState(),animationBefore);
press(0);assert.equal(ctx.statusDisplayExpanded,false);
assert.equal(ctx.statusDisplayMenuItems.icon.hidden,true);
assert.equal(ctx.statusDisplayMenuItems.quota.hidden,true);
ctx.isExiting=true;press(0);ctx.isExiting=false;
assert.equal(ctx.statusDisplayExpanded,false,'shutdown must not change layout');

// New quota/error labels redraw the number promptly, without alpha/title fades.
ctx.setMenuBarText('Weekly 76%');assert.equal(redraws,3);assert.equal(titleUpdates,1);
ctx.setMenuBarText('Weekly 76% · stale');assert.equal(redraws,4);
ctx.statusDisplayMode='icon';ctx.setMenuBarText('Weekly 75%');assert.equal(redraws,4);
assert.equal(titleUpdates,3);
console.log('Display checks passed: quota selection, placeholders, rounding, menu callbacks, failures and animation preservation.');

// Actual AppKit font, image, inline controls and settings APIs. Preferences use an
// isolated test domain, never the installed widget's user preferences.
const suite='com.wentao.codex-usage-meter.tests.'+randomUUID();
const previewRoot=process.argv.includes('--preview')?fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-status-preview-')):null;
const previewPath=previewRoot?path.join(previewRoot,'status-display.png'):null;
function native(source) {
  const result=spawnSync('/usr/bin/osascript',['-l','JavaScript','-e',source],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stderr||result.error?.message||'Native display test failed');
  return JSON.parse(result.stdout);
}
const fixture=`
${mainDefinitions}
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
delegate=$.CodexUsageMeterDelegate.alloc.init;
var fixtureDefaults=$.NSUserDefaults.alloc.initWithSuiteName(${JSON.stringify(suite)});
statusDisplayPreferences=function(){return fixtureDefaults;};
logError=function(component,error){throw new Error(component+': '+String(error));};
restoreStatusDisplayMode();
var initialMode=statusDisplayMode;
statusItem={};buildMenu();
function menuOptions(){
  return ['quota','icon'].map(function(mode){
    var item=statusDisplayMenuItems[mode];
    return {title:ObjC.unwrap(item.title),mode:ObjC.unwrap(item.representedObject),
      checked:Number(item.state),buttonChecked:Number(item.view.state),hidden:!!item.hidden,enabled:!!item.enabled,
      action:ObjC.unwrap($.NSStringFromSelector(item.view.action)),height:Number(item.view.frame.size.height)};
  });
}
var initialOptions=menuOptions();
var hasSubmenu=ObjC.unwrap(statusDisplayDisclosureItem.submenu)!=null;
preferencesDisclosureItem.view.performClick($());
statusDisplayDisclosureItem.view.performClick($());
var expandedOptions=menuOptions();
statusIconSource=$.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(path.resolve(__dirname,'../Sources/chatgptTemplate@2x.png'))});
statusButton=$.NSButton.alloc.initWithFrame($.NSMakeRect(0,0,25,25));usageSyncState='ready';
quotaWindows=[{durationMins:10080,remaining:76}];statusIconQuotaFraction=0.38;
statusDisplayMenuItems.icon.view.performClick($());
var iconOptions=menuOptions();
statusDisplayMenuItems.quota.view.performClick($());
var numericOptions=menuOptions();
statusDisplayDisclosureItem.view.performClick($());
var collapsedOptions=menuOptions();
statusDisplayDisclosureItem.view.performClick($());
refreshAllSources=function(){};
delegate.menuWillOpen(menu);
var reopenedOptions=menuOptions();
delegate.menuDidClose(menu);
// Exercise the actual custom NSButton renderer too, not just menu metadata.
var controlImage=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,24));
sendVoid(controlImage,'lockFocus');
[statusDisplayDisclosureItem,statusDisplayMenuItems.quota,statusDisplayMenuItems.icon].forEach(function(item){
  item.view.drawRect(item.view.bounds);
});
sendVoid(controlImage,'unlockFocus');
var fixedRowHeights=[Number(statusDisplayDisclosureItem.view.frame.size.height)];
['quota','icon'].forEach(function(mode){fixedRowHeights.push(Number(statusDisplayMenuItems[mode].view.frame.size.height));});
var images=[];
var cases=[{value:91,active:false},{value:91,active:true},{value:76,active:false},{value:76,active:true},{value:100},{value:20},{value:5},{value:0},{value:null},{value:76,mode:'icon'}];
cases.forEach(function(entry){
  statusDisplayMode=entry.mode||'quota';
  quotaWindows=[{durationMins:10080,remaining:entry.value}];
  usageSyncState=entry.value===null?'loading':'ready';
  var image=makeQuotaStatusIcon(statusIconSource,entry.active?activeAccentColor():cardColors().body,
    entry.value===null?0.02:entry.value/100);
  var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
  images.push({value:entry.value,mode:statusDisplayMode,text:remainingQuotaText(quotaWindows),image:image,
    width:image.size.width,height:image.size.height,pixels:rep.pixelsWide*rep.pixelsHigh});
});
var font=statusQuotaFont(10.5),smallFont=statusQuotaFont(7.5);
function measured(text,font){return $(text).sizeWithAttributes($({NSFont:font})).width;}
var result={initialMode:initialMode,initialOptions:initialOptions,iconOptions:iconOptions,numericOptions:numericOptions,
  expandedOptions:expandedOptions,collapsedOptions:collapsedOptions,reopenedOptions:reopenedOptions,
  hasSubmenu:hasSubmenu,fixedRowHeights:fixedRowHeights,
  fontName:ObjC.unwrap(font.fontName),digit0:measured('0',font),digit8:measured('8',font),
  twoDigits:measured('76',font),threeDigits:measured('100',smallFont),
  images:images.map(function(entry){return {value:entry.value,mode:entry.mode,text:entry.text,width:entry.width,height:entry.height,pixels:entry.pixels};})};
if(${JSON.stringify(previewPath)}!==null){
  var preview=$.NSImage.alloc.initWithSize($.NSMakeSize(images.length*110,182));
  sendVoid(preview,'lockFocus');
  sendVoid(cardColor(0.12,0.13,0.14,1),'setFill');$.NSRectFill($.NSMakeRect(0,0,images.length*110,182));
  images.forEach(function(entry,index){
    var x=index*110;
    entry.image.drawInRectFromRectOperationFraction($.NSMakeRect(x+42.5,141,25,25),$.NSMakeRect(0,0,0,0),$.NSCompositingOperationSourceOver,1);
    entry.image.drawInRectFromRectOperationFraction($.NSMakeRect(x+5,26,100,100),$.NSMakeRect(0,0,0,0),$.NSCompositingOperationSourceOver,1);
    drawCardText(entry.value===null?'Loading':entry.mode==='icon'?'Codex Icon':String(entry.value)+(index===1?' active':''),x+7,5,103,11,cardColors().body,false);
  });
  sendVoid(preview,'unlockFocus');
  var previewRep=$.NSBitmapImageRep.imageRepWithData(preview.TIFFRepresentation);
  var data=previewRep.representationUsingTypeProperties($.NSPNGFileType,$.NSDictionary.dictionary);
  if(!data.writeToFileAtomically(${JSON.stringify(previewPath)},true))throw new Error('Preview write failed');
}
// Finish on a non-default selection, so a missing saved value cannot make
// the cross-process assertion pass merely through the numeric fallback.
statusDisplayMode='quota';
setStatusDisplayMode('icon');
// Yield for cfprefsd to persist normally; no production synchronize calls.
$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2));
JSON.stringify(result);
`;
try {
  const result=native(readLibrarySource()+'\n'+fixture);
  assert.equal(result.initialMode,'quota');
  assert.deepEqual(result.initialOptions.map(item=>[item.title,item.mode,item.buttonChecked,item.enabled,item.action]),[
    ['Remaining Quota','quota',1,true,'statusDisplayButton:'],['Codex Icon','icon',0,true,'statusDisplayButton:']
  ]);
  assert.equal(result.hasSubmenu,false);
  assert.deepEqual(result.initialOptions.map(item=>item.hidden),[true,true]);
  assert.deepEqual(result.expandedOptions.map(item=>item.hidden),[false,false]);
  assert.deepEqual(result.collapsedOptions.map(item=>item.hidden),[true,true]);
  assert.deepEqual(result.reopenedOptions.map(item=>item.hidden),[true,true]);
  assert.deepEqual(result.fixedRowHeights,[24,24,24]);
  assert.deepEqual(result.iconOptions.map(item=>item.checked),[0,0],'custom checks must not reserve the native gutter');
  assert.deepEqual(result.iconOptions.map(item=>item.buttonChecked),[0,1]);
  assert.deepEqual(result.numericOptions.map(item=>item.checked),[0,0]);
  assert.deepEqual(result.numericOptions.map(item=>item.buttonChecked),[1,0]);
  assert(Math.abs(result.digit0-result.digit8)<0.001,'quota digits must be tabular');
  assert(result.twoDigits<16);assert(result.threeDigits<16);
  assert(result.fontName.includes('Rounded'),'the supported system font must use the rounded design');
  assert(result.images.every(image=>image.width===25&&image.height===25&&image.pixels>0));
  assert.deepEqual(result.images.map(image=>image.text),['91','91','76','76','100','20','5','0','—','76']);
  const reloaded=native(readLibrarySource()+`
    statusDisplayPreferences=function(){return $.NSUserDefaults.alloc.initWithSuiteName(${JSON.stringify(suite)});};
    restoreStatusDisplayMode();
    JSON.stringify({mode:statusDisplayMode});
  `);
  assert.equal(reloaded.mode,'icon','another process must restore the saved selection');
  console.log('Native display checks passed: inline expansion/collapse, real buttons, rounded/tabular font, compact images and cross-process persistence.');
  if(previewPath)console.log('Native icon preview: '+previewPath);
} finally {
  const cleanup=spawnSync('/usr/bin/osascript',['-l','JavaScript','-e',`
    ObjC.import('Foundation');
    $.NSUserDefaults.standardUserDefaults.removePersistentDomainForName(${JSON.stringify(suite)});
  `],{encoding:'utf8',timeout:5000});
  assert.equal(cleanup.status,0,'Unable to remove the isolated preference test domain: '+cleanup.stderr);
}
