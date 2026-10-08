const fs = require('fs');
const path = require('path');
const sourceDirectory = path.join(__dirname, '..', 'Sources');
const modules = fs.readFileSync(path.join(sourceDirectory, 'modules.list'), 'utf8')
  .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
const readSource = name => fs.readFileSync(path.join(sourceDirectory, name + '.js'), 'utf8');
// Use production assembly order while excluding the app's startup side effects.
const readLibrarySource = () => modules.filter(name => name !== 'main').map(readSource).join('\n');
module.exports = { modules, readSource, readLibrarySource };
