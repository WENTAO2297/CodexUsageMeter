const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {modules,readSource}=require('./sources.cjs');
const sourceDirectory=path.join(__dirname,'..','Sources');

// Production and tests share one explicit assembly manifest. A forgotten or
// duplicate file must fail here instead of silently becoming dead source.
assert.equal(new Set(modules).size,modules.length,'modules.list must not repeat a module');
assert.deepEqual([...modules].sort(),fs.readdirSync(sourceDirectory)
  .filter(name=>name.endsWith('.js')).map(name=>name.slice(0,-3)).sort(),
  'every runtime JS file is assembled exactly once');
assert.equal(modules.at(-1),'main','startup runs only after all feature definitions');
for(const [dependency,consumer] of [['runtime','state'],['state','menu-rows'],
 ['menu-rows','preferences'],['menu-rows','vpn-header'],['preferences','menu'],['vpn-header','menu']]){
 assert(modules.indexOf(dependency)<modules.indexOf(consumer),`${consumer} needs ${dependency} first`);
}

const functions=new Map();
for(const name of modules){
 const source=readSource(name);new vm.Script(source,{filename:name+'.js'});
 for(const match of source.matchAll(/^function\s+(\w+)\s*\(/gm)){
  assert(!functions.has(match[1]),`global function ${match[1]} is duplicated in ${functions.get(match[1])} and ${name}`);
  functions.set(match[1],name);
 }
}
for(const name of ['core','meter-panels-core','forecast-core','token-forecast-core',
 'observed-usage','vpn-traffic-core','adaptive-forecast-core','quota-reconstruction-core','forecast-learning-core','vpn-forecast-models','vpn-forecast-core','forecast-display','vpn-activity']){
 assert(!/\bObjC\b|\$\./.test(readSource(name)),`${name} must remain a pure model without native I/O`);
}
console.log(`Architecture passed: ${modules.length} complete ordered modules, ${functions.size} unique functions, pure model boundaries.`);
