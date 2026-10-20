const fs = require('fs');
const path = require('path');
const os = require('os');
const sourceDirectory = path.join(__dirname, '..', 'Sources');
const modules = fs.readFileSync(path.join(sourceDirectory, 'modules.list'), 'utf8')
  .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
const readSource = name => fs.readFileSync(path.join(sourceDirectory, name + '.js'), 'utf8');
// Use production assembly order, but never let newly added update hooks in a
// fixture inherit the real user's cache paths. A Node test owns one scratch
// root shared by its native subprocesses; explicit I/O tests may override it.
let fixtureCacheRoot;
const readLibrarySource = () => {
  if (!fixtureCacheRoot) {
    fixtureCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meter-fixture-cache-'));
    process.once('exit', () => fs.rmSync(fixtureCacheRoot, {recursive:true,force:true}));
  }
  const paths = {usageCachePath:'quota.json',forecastHistoryPath:'forecast-v2.json',
    forecastLegacyHistoryPath:'forecast-v1.json',maomaoyunHistoryPath:'vpn-history.json',
    tokenHistoryPath:'token-history.json',tokenMeterPath:'token-profile.json'};
  return modules.filter(name => name !== 'main').map(readSource).join('\n') + '\n' +
    Object.entries(paths).map(([name,file]) => name+'='+JSON.stringify(path.join(fixtureCacheRoot,file))+';').join('\n');
};
module.exports = { modules, readSource, readLibrarySource };
