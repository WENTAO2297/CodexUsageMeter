const assert = require('assert/strict');
const vm = require('vm');
const {execFileSync} = require('child_process');
const {readSource:read} = require('./sources.cjs');

// Run the production SQLite query and polling/rendering decisions against
// isolated databases. No real conversation is started, stopped or modified.
let sql, now = 2000000;
const iconModes = [];
const ctx = vm.createContext({
  Date:{now:()=>now},
  codexDirectory:':memory:', taskStateDatabasePath:':memory:', runningTasksPath:':memory:',
  runningReadState:{queued:false}, runningLastSuccessAt:0,
  TASK_ACTIVITY_FRESHNESS_SECONDS:900, RUNNING_TASK_READ_TIMEOUT_MS:5000,
  hasRunningTasks:false, isExiting:false, statusButton:{},
  launchBackgroundTask(exe,args){assert.equal(exe,'/usr/bin/sqlite3');assert(args.includes('-readonly'));sql=args.at(-1);},
  resetBackgroundTask(state){state.task=null;state.outputPipe=null;state.startedAt=0;},
  readBackgroundTaskOutput(pipe){return pipe;},
  logError(){throw new Error('Unexpected reader failure');}
});
vm.runInContext(read('core')+'\n'+read('status-icon')+'\n'+read('tasks'),ctx);
ctx.updateStatusIcon=()=>iconModes.push(ctx.desiredStatusIconMode());
ctx.updateStatusButtonTitle=()=>{};
ctx.startRunningTasksRead();
assert(sql);

const ids = {
  desktop:'10000000-0000-4000-8000-000000000001',
  runtime:'20000000-0000-4000-8000-000000000002',
  vscode:'30000000-0000-4000-8000-000000000003',
  abandoned:'40000000-0000-4000-8000-000000000004',
  next:'50000000-0000-4000-8000-000000000005'
};
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
const rollout=id=>'/fixtures/rollout-2026-10-12T17-00-00-'+id+'.jsonl';
const fixture = `
ATTACH DATABASE ':memory:' AS state_db;
CREATE TABLE state_db.threads(id TEXT PRIMARY KEY,archived INTEGER,rollout_path TEXT,source TEXT,originator TEXT);
CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,status TEXT,started_at INTEGER,rollout_ordinal INTEGER,
  PRIMARY KEY(thread_id,turn_id));
CREATE UNIQUE INDEX turns_page ON thread_turns(thread_id,rollout_ordinal);
CREATE TABLE thread_items(thread_id TEXT,turn_id TEXT,created_at_ms INTEGER);
INSERT INTO state_db.threads VALUES
  (${quote(ids.desktop)},0,${quote(rollout(ids.runtime))},'vscode','Codex Desktop'),
  (${quote(ids.vscode)},0,${quote(rollout(ids.vscode))},'vscode','codex_vscode'),
  (${quote(ids.abandoned)},0,${quote(rollout(ids.abandoned))},'vscode','Codex Desktop');
INSERT INTO thread_turns VALUES
  (${quote(ids.desktop)},'old-desktop','completed',1900,1),
  (${quote(ids.runtime)},'earlier-runtime','completed',100,1),
  (${quote(ids.runtime)},'current-runtime','inProgress',100,2),
  (${quote(ids.vscode)},'editor-turn','inProgress',1960,1),
  (${quote(ids.abandoned)},'abandoned-turn','inProgress',100,1);
INSERT INTO thread_items VALUES (${quote(ids.runtime)},'current-runtime',1980000);
`;
const select = sql.replace(/^ATTACH DATABASE[^;]+;/,'');
function query(extra='') {
  return execFileSync('/usr/bin/sqlite3',[':memory:'],{input:fixture+extra+'\n'+select,encoding:'utf8'});
}
function values(raw) {return raw.trim().split('\n').filter(Boolean).map(Number);}
function freshValues(raw) {return values(raw).filter(t=>ctx.isExecutionFresh(t,now/1000,900));}
function poll(raw) {
  ctx.runningReadState.task={running:false,terminationStatus:0};
  ctx.runningReadState.outputPipe=raw;
  ctx.pollRunningTasksRead();
  return ctx.hasRunningTasks;
}
const editorDone = `UPDATE thread_turns SET status='completed' WHERE thread_id=${quote(ids.vscode)};`;
const desktopDone = `UPDATE thread_turns SET status='completed' WHERE thread_id=${quote(ids.runtime)};`;
const bothDone = editorDone+desktopDone;

// Same source label does not imply the same producer. The desktop's current
// runtime must be found even though its conversation ID has older idle history.
const bothRunning=query();
assert.deepEqual(freshValues(bothRunning).sort((a,b)=>a-b),[1960,1980]);
assert(poll(bothRunning));
assert.deepEqual(iconModes,['active']);

// An editor turn finishing must not overwrite the remaining desktop activity.
const onlyDesktop=query(editorDone);
assert.deepEqual(freshValues(onlyDesktop),[1980]);
for(let i=0;i<3;i++)assert(poll(onlyDesktop));
assert.deepEqual(iconModes,['active'],'other task completion must not reset the icon');
assert.equal(poll(query(bothDone)),false);
assert.deepEqual(iconModes,['active','idle']);

// Symmetric case: finishing the desktop leaves a running editor turn active.
assert.deepEqual(freshValues(query(desktopDone)),[1960]);
assert(poll(query(desktopDone)));

// An old conversation-ID turn must never resurrect a finished current rollout.
const oldStillRunning = `UPDATE thread_turns SET status='inProgress' WHERE thread_id=${quote(ids.desktop)};`;
assert.equal(poll(query(bothDone+oldStillRunning)),false);
// The latest rollout ordinal wins, even if an older inProgress turn is fresh.
const newerCompleted = `INSERT INTO thread_turns VALUES (${quote(ids.runtime)},'newest','completed',1990,3);`;
assert.equal(poll(query(editorDone+newerCompleted)),false);
// Archiving the conversation excludes its current runtime, not just its old ID.
assert.equal(poll(query(editorDone+`UPDATE state_db.threads SET archived=1 WHERE id=${quote(ids.desktop)};`)),false);
// Preserve the stale-row guard; moving the conversation is not an execution heartbeat.
assert.equal(poll(query(editorDone+'DELETE FROM thread_items;')),false);

// Missing/unprojected paths fall back to the conversation's own history.
for(const path of [null,rollout(ids.next),'/fixtures/unknown-format']) {
  const pathSql=path===null?'NULL':quote(path);
  const raw=query(editorDone+oldStillRunning+`UPDATE state_db.threads SET rollout_path=${pathSql} WHERE id=${quote(ids.desktop)};`);
  assert.deepEqual(freshValues(raw),[1900]);
  assert(poll(raw));
}
// JSONL metadata paths with apostrophes remain data, never part of the query.
const quotedPath="/fixtures/it's-a-directory/rollout-"+ids.runtime+'.jsonl';
assert.deepEqual(freshValues(query(editorDone+`UPDATE state_db.threads SET rollout_path=${quote(quotedPath)} WHERE id=${quote(ids.desktop)};`)),[1980]);

console.log('Activity checks passed: current rollout mapping, desktop/editor concurrency, terminal states, stale rows, archive and projection fallback.');
