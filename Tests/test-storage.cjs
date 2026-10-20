// Test-only default persistence must not touch the installed app's journals.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{readLibrarySource}=require('./sources.cjs');
const source=readLibrarySource();
const result=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',source+`
var now=Date.now()/1000,state=afNew('vpn','fixture-only',now);
adaptiveSave(state);
JSON.stringify({paths:[usageCachePath,forecastHistoryPath,forecastLegacyHistoryPath,maomaoyunHistoryPath,tokenHistoryPath,tokenMeterPath],
 vpn:adaptivePath('vpn'),quota:adaptivePath('quota')});`],{encoding:'utf8',timeout:10000}));
const root=path.dirname(result.vpn);
assert(path.basename(root).startsWith('meter-fixture-cache-'));
assert(root.startsWith(os.tmpdir()+'/'));
for(const file of [...result.paths,result.vpn,result.quota])assert.equal(path.dirname(file),root);
assert(!root.startsWith(path.join(os.homedir(),'Library/Application Support')));
assert.equal(fs.statSync(result.vpn).mode&0o777,0o600);
assert.equal(fs.statSync(root).mode&0o777,0o700);
assert.equal(JSON.parse(fs.readFileSync(result.vpn,'utf8')).scope,'fixture-only');
console.log('Test storage passed: all default native cache and prediction paths share an isolated private scratch root.');
