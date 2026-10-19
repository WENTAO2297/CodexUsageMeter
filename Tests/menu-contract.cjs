const assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {readLibrarySource,readSource} = require('./sources.cjs');

// Build the actual NSMenu without opening it or launching any external reader.
// This protects the existing item order, actions and dividers during refactors.
const fixture = `
// Use the production width so compact task/settings rows are tested too.
delegate = $.NSObject.alloc.init;
statusItem = {};
buildMenu();
function snapshotMenu() {
  var items = [];
  for (var i = 0; i < menu.numberOfItems; i++) {
    var item = menu.itemAtIndex(i);
    var action = ObjC.unwrap($.NSStringFromSelector(item.action));
    items.push({
      title: ObjC.unwrap(item.title) || ObjC.unwrap(item.view.className),
      action: action === 'null' ? '' : action || '',
      enabled: !!item.enabled,
      hidden: !!item.hidden,
      submenu: ObjC.unwrap(item.submenu) != null,
      tooltip: ObjC.unwrap(item.toolTip) || '',
      represented: ObjC.unwrap(item.representedObject) || ''
    });
  }
  return items;
}
var empty = snapshotMenu();
setPreferencesExpanded(true);
var preferences = snapshotMenu();
setStatusDisplayOptionsExpanded(true);
var expanded = snapshotMenu();
setPreferencesExpanded(false);
JSON.stringify({empty:empty,preferences:preferences,expanded:expanded,cleared:snapshotMenu(),autoenablesItems:!!menu.autoenablesItems});
`;
const result = JSON.parse(execFileSync('/usr/bin/osascript', ['-l','JavaScript','-e',readLibrarySource()+'\n'+fixture],
  {encoding:'utf8',timeout:10000}));
const divider='CodexUsageMeterDividerView';
assert.deepEqual(result.empty.map(item=>item.title),[
  'CodexUsageMeterMetricsPairView',
  divider,'CodexUsageMeterResetHeaderView','CodexUsageMeterResetCardView','Usage activity',
  'CodexUsageMeterUsageActivityView',divider,
  'New Task','Ask ChatGPT',divider,'Preferences','Menu Bar Display','Remaining Quota','Codex Icon','Language','简体中文','English','Restart Widget'
]);
assert.deepEqual(result.empty.filter(item=>item.action).map(item=>[item.title,item.action,item.enabled]),[
  ['New Task','newTask:',true],['Ask ChatGPT','openChatGPTWeb:',true],
  ['Restart Widget','restartMeter:',true]
]);
assert(result.empty.every(item=>item.tooltip===''&&!/^[0-9a-fA-F-]{36}$/.test(String(item.represented))),'no hover popups or conversation IDs');
assert.equal(result.empty[1].title,divider,'a shared-style divider separates Codex quota and reset cards');
assert.equal(result.empty[2].title,'CodexUsageMeterResetHeaderView');
const tokenIndex=result.empty.findIndex(item=>item.title==='Usage activity');
assert.equal(result.empty[tokenIndex-1].title,'CodexUsageMeterResetCardView','Token activity follows reset cards without a separator row');
const visible=result.empty.filter(item=>!item.hidden);
assert(visible.every((item,index)=>item.title!==divider||visible[index+1]?.title!==divider),'no orphaned consecutive dividers');
assert.deepEqual(result.cleared,result.empty);
assert.equal(result.autoenablesItems,false);
const charts=['CodexUsageMeterUsageActivityView'];
assert.deepEqual(result.empty.filter(item=>item.hidden).map(item=>item.title),[...charts,'Menu Bar Display','Remaining Quota','Codex Icon','Language','简体中文','English']);
assert.deepEqual(result.preferences.filter(item=>item.hidden).map(item=>item.title),[...charts,'Remaining Quota','Codex Icon','简体中文','English']);
assert.deepEqual(result.expanded.filter(item=>item.hidden).map(item=>item.title),[...charts,'简体中文','English']);
assert(result.empty.every(item=>!item.submenu),'display options must stay inside the same menu');
assert.deepEqual(result.expanded.map(item=>item.title),result.empty.map(item=>item.title));
assert(!/quitCodex|Quit Codex/.test(readLibrarySource()+readSource('main')),'removed quit command must not remain in the menu, delegate or localization');
assert(!/pinned|Pinned|PINNED/.test(readLibrarySource()+readSource('main')),'removed pinned display, readers, state, actions and timers must not remain');
assert(!require('node:fs').existsSync(require('node:path').join(__dirname,'../Sources/pinned-menu.js')),'unused pinned module deleted');
assert(!/vpnWebsiteButton|openMaoMaoYunWebsite/.test(readLibrarySource()+readSource('main')),'website entry and action removed, account queries retained');
console.log('Native menu checks passed: quota/reset divider restored, Token follows cards directly, action boundaries retained, no website/pinned feature or hover popups.');
