const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-reader-test-'));
try {
 const cli=path.join(fixture,'codex');
 fs.copyFileSync(path.join(__dirname,'fixtures','fake-codex.cjs'),cli);fs.chmodSync(cli,0o755);
 const read=(mode,extra={})=>spawnSync('/bin/zsh',[path.join(root,'Sources','usage-reader.zsh'),'--diagnose'],
  {encoding:'utf8',timeout:18000,env:{...process.env,CODEX_USAGE_CLI:cli,FAKE_USAGE_MODE:mode,...extra}});
 for(const mode of ['noise','slow']) {
  const r=read(mode);assert.equal(r.status,0,r.stderr);
  const p=JSON.parse(r.stdout);assert.equal(p.id,2);
  assert.equal(p.result.rateLimits.primary.windowDurationMins,10080);
  assert.match(r.stderr,/usage-reader: CLI/);
 }
 for(const [mode,message,extra] of [
  ['rpc-error',/returned RPC error -32603/,{}],
  ['exit',/app-server exited/,{}],
  ['init-timeout',/initialize timed out after 1s/,{CODEX_USAGE_INITIALIZE_TIMEOUT_SECONDS:'1'}],
  ['quota-timeout',/account\/rateLimits\/read timed out after 1s/,{CODEX_USAGE_QUOTA_TIMEOUT_SECONDS:'1'}]
 ]) {
  const r=read(mode,extra);assert.equal(r.status,1,r.stderr);assert.equal(r.stdout,'');assert.match(r.stderr,message);
 }
 for(const extra of [{CODEX_USAGE_CLI:'/missing/codex'},{CODEX_USAGE_QUOTA_TIMEOUT_SECONDS:'999'},
  {CODEX_USAGE_INITIALIZE_TIMEOUT_SECONDS:'bad'}]) assert.equal(read('noise',extra).status,1);
 const source=fs.readFileSync(path.join(root,'Sources','usage-reader.zsh'),'utf8');
 assert(source.indexOf('/Applications/ChatGPT.app')<source.indexOf('/opt/homebrew/bin/codex'));
 console.log('Reader checks passed: desktop-first discovery, clean JSON, >10s success, errors/exits, phase deadlines and invalid overrides.');
} finally {fs.rmSync(fixture,{recursive:true,force:true});}
