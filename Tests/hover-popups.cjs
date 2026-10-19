const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {readSource,readLibrarySource}=require('./sources.cjs');
const library=readLibrarySource(),main=readSource('main');
assert(!/\.toolTip\s*=|addToolTipRect|setMenuViewToolTip|setMenuItemToolTip|statusToolTip|menuToolTip|menuHelp|quotaHoverHint|trafficHoverHint/.test(library+main),
  'no native tooltip registration or custom popup subsystem returns');

// Actual AppKit controls, entirely offscreen. No status-bar item is created,
// no mouse is moved, and account readers/default user preferences are untouched.
const domain='com.wentao.codex-usage-meter.tests.no-hover.'+randomUUID();
const source=library.replaceAll('$.NSUserDefaults.standardUserDefaults.setObjectForKey($(value), $(UI_LANGUAGE_KEY))',
  'fixtureDefaults.setObjectForKey($(value), $(UI_LANGUAGE_KEY))');
const fixture=`
var fixtureDefaults=$.NSUserDefaults.alloc.initWithSuiteName(${JSON.stringify(domain)});
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};
statusButton=$.NSButton.alloc.initWithFrame($.NSMakeRect(0,0,28,23));
refreshAllSources=function(){};buildMenu();
var samples=[],labels=[];
currentQuotaForecasts=function(){return quotaWindows.map(function(){return {status:'unknown',text:'Forecast: Waiting for quota'};});};
function popups(){
 var tips=[];
 function walk(view){
  var text=ObjC.unwrap(view.toolTip);if(text)tips.push(text);
  var children=view.subviews;for(var j=0;j<children.count;j++)walk(children.objectAtIndex(j));
 }
 walk(statusButton);
 for(var i=0;i<menu.numberOfItems;i++){
  var item=menu.itemAtIndex(i);if(ObjC.unwrap(item.toolTip))tips.push(ObjC.unwrap(item.toolTip));
  if(item.view&&ObjC.unwrap(item.view)!=null)walk(item.view);
 }
 return tips;
}
function sample(stage){samples.push({stage:stage,popups:popups(),tracking:!!menuTrackingTimer});}
sample('initial');
['zh-CN','en','zh-CN'].forEach(function(locale){
 setUILanguage(locale);delegate.menuWillOpen(menu);var timer=menuTrackingTimer;
 delegate.menuWillOpen(menu);if(menuTrackingTimer!==timer)throw Error('Duplicate tracking timer');
 setPreferencesExpanded(true,false);setStatusDisplayOptionsExpanded(true,false);setLanguageOptionsExpanded(true,false);
 ['ready','error','cached','loading'].forEach(function(state){
  usageSyncState=state;usageText=state==='error'?'!':'Weekly 68%';
  quotaWindows=[{label:'Weekly',durationMins:10080,remaining:state==='loading'?null:68,resetAt:Date.now()/1000+6*86400}];
  maomaoyunTrafficSourceState=state==='ready'?'authRequired':state;
  updateMaoMaoYunTrafficMenuItem();redrawUsageCardIfNeeded(true);updateStatusButtonTitle();
  labels.push(ObjC.unwrap(statusButton.accessibilityLabel));
  preferencesDisclosureItem.view.mouseEntered($());delegate.menuTrackingTimer(null);
  sample(locale+':'+state);
 });
 setPreferencesExpanded(false,false);sample('collapse');
 delegate.menuDidClose(menu);sample('closed');
});
delegate.menuWillOpen(menu);sample('reopened');delegate.menuDidClose(menu);
fixtureDefaults.removePersistentDomainForName(${JSON.stringify(domain)});
JSON.stringify({samples:samples,labels:labels,stopped:menuTrackingTimer===null,
 popupState:typeof statusToolTipState,menuHints:typeof menuHelp});
`;
const out=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',source+'\n'+
  main.split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0]+'\n'+fixture],{encoding:'utf8',timeout:15000}));
assert(out.samples.every(s=>s.popups.length===0),
 'all controls stay tooltip-free, including refresh, language changes and reopen');
assert(out.samples.filter(s=>s.stage==='initial'||s.stage==='closed').every(s=>!s.tracking));
assert(out.samples.filter(s=>s.stage.includes(':')||s.stage==='collapse'||s.stage==='reopened').every(s=>s.tracking),
  'hover cleanup and paint recovery stay active while the menu is open');
assert(out.labels.length===12&&out.labels.every(Boolean),'status accessibility still updates in both languages');
assert.equal(out.stopped,true);assert.equal(out.popupState,'undefined');assert.equal(out.menuHints,'undefined');
console.log('Tooltip checks passed: icon/data/settings/client stay popup-free through bilingual refreshes and menu lifecycle.');
