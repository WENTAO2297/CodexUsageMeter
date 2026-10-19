// Run against a built artifact: node Tests/app-bundle.cjs /path/to/App.app
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const app = process.argv[2];
assert(app && app.endsWith('.app'), 'Pass the built .app path');
const plist = bundle => JSON.parse(execFileSync('/usr/bin/plutil', [
  '-convert', 'json', '-o', '-', path.join(bundle, 'Contents/Info.plist')
], {encoding: 'utf8'}));
const outer = plist(app);
const helper = path.join(app, 'Contents/Helpers/CodexUsageMeterMenuBar.app');
const inner = plist(helper);
const account = path.join(helper, 'Contents/Resources/MaoMaoYunAccount.app');
const accountInfo = plist(account);
assert.equal(outer.CFBundleIdentifier, 'com.wentao.codex-usage-meter');
assert.equal(inner.CFBundleIdentifier, 'com.wentao.codex-usage-meter.widget');
assert.equal(outer.CFBundleExecutable, 'CodexUsageMeter');
assert.equal(inner.CFBundleExecutable, 'applet');
assert.equal(outer.LSUIElement, true);
assert.equal(inner.LSUIElement, true);
assert.equal(inner.OSAAppletStayOpen, true, 'native applet event loop owns UI dispatch after startup returns');
assert.equal(accountInfo.CFBundleIdentifier, 'com.wentao.codex-usage-meter.maomaoyun-account');
assert.equal(accountInfo.CFBundleExecutable, 'MaoMaoYunAccount');
assert.equal(accountInfo.LSUIElement, true);
for (const file of [
  'Contents/MacOS/CodexUsageMeter', 'Contents/Resources/applet.icns',
  'Contents/Resources/maomaoyun-autoconnect.zsh',
  'Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/MacOS/applet',
  'Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/Resources/Scripts/main.scpt',
  'Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/Resources/usage-reader.zsh',
  'Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/Resources/TokenHistoryReader',
  'Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/Resources/TokenProfileReader',
  'Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/Resources/chatgptTemplate@2x.png',
  'Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/Resources/MaoMaoYunAccount.app/Contents/MacOS/MaoMaoYunAccount'
]) assert(fs.statSync(path.join(app, file)).size > 0, file);
fs.accessSync(path.join(app, 'Contents/MacOS/CodexUsageMeter'), fs.constants.X_OK);
const archs = execFileSync('/usr/bin/lipo', ['-archs', path.join(app, 'Contents/MacOS/CodexUsageMeter')], {encoding:'utf8'});
assert(archs.includes('arm64') && archs.includes('x86_64'));
const accountArchs = execFileSync('/usr/bin/lipo', ['-archs', path.join(account, 'Contents/MacOS/MaoMaoYunAccount')], {encoding:'utf8'});
assert(accountArchs.includes('arm64') && accountArchs.includes('x86_64'));
const tokenReader=path.join(helper,'Contents/Resources/TokenHistoryReader');
fs.accessSync(tokenReader,fs.constants.X_OK);
const readerArchs=execFileSync('/usr/bin/lipo',['-archs',tokenReader],{encoding:'utf8'});
assert(readerArchs.includes('arm64')&&readerArchs.includes('x86_64'));
const profileReader=path.join(helper,'Contents/Resources/TokenProfileReader');
fs.accessSync(profileReader,fs.constants.X_OK);
const profileArchs=execFileSync('/usr/bin/lipo',['-archs',profileReader],{encoding:'utf8'});
assert(profileArchs.includes('arm64')&&profileArchs.includes('x86_64'));
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
console.log('App bundle checks passed: identities, accessory mode, bundled resources, universal launcher and signature.');
