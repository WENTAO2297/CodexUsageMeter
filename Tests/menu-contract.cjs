const assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {readLibrarySource} = require('./sources.cjs');

// Build the actual NSMenu without opening it or launching any external reader.
// This protects the existing item order, actions and dividers during refactors.
const fixture = `
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
      tooltip: ObjC.unwrap(item.toolTip) || '',
      threadId: ObjC.unwrap(item.representedObject) || ''
    });
  }
  return items;
}
updateTaskSectionsMenu();
var empty = snapshotMenu();
updatePinnedTasksMenu([
  {threadId:'11111111-1111-1111-1111-111111111111',title:'First pinned task'},
  {threadId:'22222222-2222-2222-2222-222222222222',title:'A very long pinned task title that needs truncation'}
]);
var pinned = snapshotMenu();
updatePinnedTasksMenu([]);
JSON.stringify({empty:empty,pinned:pinned,cleared:snapshotMenu(),autoenablesItems:!!menu.autoenablesItems});
`;
const result = JSON.parse(execFileSync('/usr/bin/osascript', ['-l','JavaScript','-e',readLibrarySource()+'\n'+fixture],
  {encoding:'utf8',timeout:10000}));
const divider='CodexUsageMeterDividerView';
assert.deepEqual(result.empty.map(item=>item.title),[
  'MaoMaoYun  ·  Checking',divider,'CodexUsageMeterCardView',divider,
  'New Task','Ask ChatGPT',divider,'Restart Widget','Quit Codex'
]);
assert.deepEqual(result.empty.filter(item=>item.action).map(item=>[item.title,item.action,item.enabled]),[
  ['New Task','newTask:',true],['Ask ChatGPT','openChatGPTWeb:',true],
  ['Restart Widget','restartMeter:',true],['Quit Codex','quitCodex:',true]
]);
assert.deepEqual(result.pinned.map(item=>item.title),[
  ...result.empty.slice(0,7).map(item=>item.title), 'CodexUsageMeterPinnedHeaderView',
  'First pinned task','A very long pinned task t…',divider,'Restart Widget','Quit Codex'
]);
assert.equal(result.pinned[9].tooltip,'A very long pinned task title that needs truncation');
assert.equal(result.pinned[9].threadId,'22222222-2222-2222-2222-222222222222');
assert.equal(result.pinned[9].action,'openPinnedThread:');
assert.deepEqual(result.cleared,result.empty);
assert.equal(result.autoenablesItems,false);
assert(result.empty.every(item=>!item.hidden));
console.log('Native menu checks passed: existing order, actions, divider placement, pinned add/remove and full-title tooltips.');
