// Explicit live test. Briefly restarts ONLY this widget, not Codex or the VPN.
// Usage after installation: node Tests/app-lifecycle.cjs --installed
const assert = require('assert/strict');
const os = require('os');
const path = require('path');
const {execFileSync, spawn} = require('child_process');
assert.equal(process.argv[2], '--installed', 'This live test requires --installed');
const app = path.join(os.homedir(), 'Applications/Codex Usage Meter.app');
const executable = path.join(app, 'Contents/MacOS/CodexUsageMeter');
const widget = path.join(app, 'Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/MacOS/applet');
const domain = `gui/${process.getuid()}`;
const label = 'com.wentao.codex-usage-meter-watch';
const agent = path.join(os.homedir(), 'Library/LaunchAgents', label + '.plist');
const run = (file, args) => execFileSync(file, args, {encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:10000});
const pids = executable => run('/bin/ps', ['-axo','pid=,command=']).split('\n').flatMap(line => {
  const match = line.match(/^\s*(\d+)\s+(.*)$/);
  return match && match[2] === executable ? [Number(match[1])] : [];
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  for (let i=0; i<40; i++) { if (predicate()) return; await sleep(250); }
  throw new Error(message);
}
async function stop(executable) {
  for (const pid of pids(executable)) { try { process.kill(pid, 'SIGTERM'); } catch(error) { if(error.code!=='ESRCH') throw error; } }
  await until(() => pids(executable).length === 0, 'Did not stop: '+executable);
}
async function main() {
  // Do not test against an unrelated or customized launch agent.
  const config = JSON.parse(run('/usr/bin/plutil', ['-convert','json','-o','-',agent]));
  assert.deepEqual(config.ProgramArguments, [executable]);
  run('/bin/launchctl', ['print', `${domain}/${label}`]);
  assert.equal(pids(executable).length,1);
  assert.equal(pids(widget).length,1);
  const owner = pids(executable)[0];
  const duplicate = spawn(executable, [], {stdio:'ignore'});
  const exit = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => { duplicate.kill('SIGTERM'); reject(new Error('Duplicate app did not exit')); },5000);
    duplicate.once('error', error => { clearTimeout(timer); reject(error); });
    duplicate.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(exit,0);
  assert.deepEqual(pids(executable),[owner]);
  assert.equal(pids(widget).length,1);
  console.log('PASS: repeated launch keeps one widget instance.');
  const oldWidget = pids(widget)[0];
  process.kill(oldWidget,'SIGTERM');
  await until(() => pids(widget).length===1 && pids(widget)[0]!==oldWidget, 'Widget did not restart');
  assert.deepEqual(pids(executable),[owner]);
  console.log('PASS: child exit restarts widget inside the same app.');
  try {
    run('/bin/launchctl',['bootout',`${domain}/${label}`]);
    await until(() => pids(executable).length===0 && pids(widget).length===0, 'App left an orphan widget');
    run('/usr/bin/open',[app]);
    await until(() => pids(executable).length===1 && pids(widget).length===1, 'Finder-style launch failed');
    run('/usr/bin/open',[app]);
    await sleep(1000);
    assert.equal(pids(executable).length,1);
    assert.equal(pids(widget).length,1);
    console.log('PASS: app opens without launch agent; opening again does not duplicate it.');
  } finally {
    // Restore normal login supervision even if the standalone checks fail.
    await stop(executable);
    await stop(widget);
    let restored=false;
    for(let i=0;i<5;i++) {
      try { run('/bin/launchctl',['bootstrap',domain,agent]); restored=true; break; }
      catch { await sleep(1000); }
    }
    assert(restored,'Could not restore login agent');
  }
  await until(() => pids(executable).length===1 && pids(widget).length===1,'Login launch failed');
  console.log('PASS: login agent restored; one app and one widget helper running.');
}
main().catch(error => { console.error(error); process.exitCode=1; });
