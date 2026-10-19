const assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync,spawn}=require('node:child_process');
const {readSource,readLibrarySource}=require('./sources.cjs');
const mainSource=readSource('main');
const definitions=mainSource.split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];

// The removed controller can get permanently stuck after an aborted popup:
// every later click cancels an invisible menu. Keep this failure reproducible.
{
  let opens=0,cancels=0;
  const old=vm.createContext({menuIsOpen:true,isExiting:false,menu:{},
    statusItem:{popUpStatusItemMenu(){opens++;}},sendVoid(){cancels++;}});
  vm.runInContext(`function click(){
    if(isExiting)return;
    if(menuIsOpen){sendVoid(menu,'cancelTracking');return;}
    statusItem.popUpStatusItemMenu(menu);
  }click();click();click();`,old);
  assert.equal(opens,0);assert.equal(cancels,3);
}

// Run production startup, not a replacement click handler. A leftover
// observer flag must not detach the native menu or install a manual action.
// Full native menu construction is also checked by menu-actions.
for(const leftover of [false,true]){
  const methods={},nativeMenu={},item={button:{}},nil=Symbol('nil'),timers=[];
  const ctx=vm.createContext({ObjC:{registerSubclass:def=>Object.assign(methods,def.methods)},
    $:Object.assign(()=>nil,{
      CodexUsageMeterDelegate:{alloc:{init:{}}},
      NSWorkspace:{sharedWorkspace:{notificationCenter:{addObserverSelectorNameObject(){}}}},
      NSApplication:{sharedApplication:{setActivationPolicy(){}}},
      NSStatusBar:{systemStatusBar:{statusItemWithLength(){return item;}}},
      NSRunLoop:{currentRunLoop:{run:undefined}}
    }),menuIsOpen:leftover,isExiting:false,usageText:'Fixture',MAOMAOYUN_STABLE_REFRESH_MS:5000,
    restoreUILanguage(){},restoreStatusDisplayMode(){},syncUsageAccount(){},configureMenuBarIcon(){},
    setMenuBarText(){},buildMenu(){ctx.menu=nativeMenu;item.menu=nativeMenu;},
    rebuildStatusIconImages(){},updateStatusButtonTitle(){},
    redrawUsageCardIfNeeded(){},refreshAllSources(){},scheduleCommonModeTimer(...args){timers.push(args);}});
  vm.runInContext(mainSource,ctx);
  assert.equal(item.menu,nativeMenu,'startup must retain AppKit menu binding');
  assert.equal(item.button.action,undefined,'do not open a popup inside a mouse-down action');
  assert.equal(methods['toggleStatusMenu:'],undefined,'obsolete state-based controller must stay removed');
  assert.equal(timers.length,4,'pinned timer is removed; no replacement polling for opening the menu');
  assert.equal(ctx.menuIsOpen,leftover,'this is an observer flag, not opening authority');
}
assert(!/statusItem\.menu\s*=\s*\$\(|\.popUpStatusItemMenu\s*\(/.test(mainSource));
assert(!/\$\.NSRunLoop\.currentRunLoop\.run\s*;/.test(mainSource),'startup must return to the native applet event loop');
assert(/osacompile -l JavaScript -s -o/.test(fs.readFileSync(path.join(__dirname,'..','build.sh'),'utf8')),
  'returning startup requires a stay-open applet, not a transient script');
console.log('Status menu startup passed: native binding retained, stale observer flag cannot veto opening, no manual popup action or extra polling.');

// Explicit UI fixture only: one short-lived isolated native menu, production
// views/delegates, no account, preferences, installed app restart, URLs or VPN.
async function fixture(legacy){
  const dir=fs.mkdtempSync('/private/tmp/codex-meter-status-');
  const app=path.join(dir,'Status Menu Fixture.app');
  const source=readLibrarySource()+`
var trace=[];
function registerFixtureDelegate(definition){
 ${legacy?`definition.methods['toggleStatusMenu:']={types:['void',['id']],implementation:function(){
   if(isExiting)return;
   if(menuIsOpen){sendVoid(menu,'cancelTracking');return;}
   statusItem.popUpStatusItemMenu(menu);
 }};`:''}
 ['toggleStatusMenu:','menuWillOpen:','menuDidClose:'].forEach(function(key){
  if(!definition.methods[key])return;
  var implementation=definition.methods[key].implementation;
  definition.methods[key].implementation=function(){
   trace.push(key+' begin');
   try{return implementation.apply(this,arguments);}
   catch(error){trace.push('ERROR '+String(error));throw error;}
   finally{trace.push(key+' end');statusButton.accessibilityLabel=trace.slice(-16).join(' | ');}
  };
 });ObjC.registerSubclass(definition);
}
`+definitions.replace('ObjC.registerSubclass({','registerFixtureDelegate({')+`
logError=function(component,error){trace.push(component+': '+String(error));};
refreshAllSources=function(){};
pollRunningTasksRead=requestRunningTasksRead=function(){};
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
delegate=$.CodexUsageMeterDelegate.alloc.init;
statusItem=$.NSStatusBar.systemStatusBar.statusItemWithLength(-1);statusButton=statusItem.button;
statusButton.title='Test';statusButton.accessibilityLabel='Production fixture ready';buildMenu();
${legacy?`statusItem.menu=$();statusButton.target=delegate;statusButton.action='toggleStatusMenu:';statusButton.sendActionOn($.NSEventMaskLeftMouseDown);`:''}
// Reproduce the stale observer flag from an aborted/missed close.
menuIsOpen=true;
scheduleCommonModeTimer(2,'runningStatusTimer:',true);
${legacy?'$.NSRunLoop.currentRunLoop.run;':'void 0;'}
`;
  new vm.Script(source);
  let child,pid;
  const executable=path.join(app,'Contents/MacOS/applet');
  try{
    execFileSync('/usr/bin/osacompile',['-l','JavaScript',...(legacy?[]:['-s']),'-o',app,'-e',source],{stdio:'pipe'});
    execFileSync('/usr/bin/plutil',['-insert','CFBundleIdentifier','-string',
      'com.wentao.codex-usage-meter.tests.status.'+path.basename(dir),path.join(app,'Contents/Info.plist')]);
    execFileSync('/usr/bin/plutil',['-insert','LSUIElement','-bool','true',path.join(app,'Contents/Info.plist')]);
    execFileSync('/usr/bin/codesign',['--force','--sign','-',app],{stdio:'pipe'});
    child=spawn('/usr/bin/open',['-n','-W',app],{stdio:'pipe'});
    let launchError='';child.stderr.on('data',chunk=>{launchError+=chunk;});
    await new Promise((resolve,reject)=>{
      const began=Date.now(),timer=setInterval(()=>{
        const rows=execFileSync('/bin/ps',['-axo','pid=,command='],{encoding:'utf8'}).split('\n');
        const row=rows.map(s=>s.match(/^\s*(\d+)\s+(.*)$/)).find(m=>m&&(m[2]===executable||m[2].startsWith(executable+' ')));
        if(row)pid=Number(row[1]);
        if(pid&&Date.now()-began>900){clearInterval(timer);resolve();}
        else if(child.exitCode!==null||Date.now()-began>5000){clearInterval(timer);reject(Error('Fixture startup: '+launchError));}
      },50);
    });
    const probe=()=>JSON.parse(execFileSync('/usr/bin/swift',[path.join(__dirname,'status-menu-probe.swift'),String(pid)],
      {encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']}));
    const results=probe();
    assert(results.length>0);
    if(legacy)assert(results.every(row=>!row.opened),'legacy stale state must reproduce the failure');
    else assert(results.length===3&&results.every(row=>row.opened&&row.closed),
      'production native binding must reopen/close despite stale flag: '+JSON.stringify(results));
    if(!legacy){
      console.log('First native open/close round passed; checking again after the applet idle interval.');
      await new Promise(resolve=>setTimeout(resolve,35000));
      const afterIdle=probe();
      assert(afterIdle.length===3&&afterIdle.every(row=>row.opened&&row.closed),
        'native menu remains responsive after applet idle: '+JSON.stringify(afterIdle));
      return {legacy,results,afterIdle};
    }
    return {legacy,results};
  }finally{
    if(pid)try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
    if(child){child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',resolve);});}
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
if(process.argv[2]==='--fixture'){
  (async()=>{
    console.log(JSON.stringify(await fixture(true)));
    console.log(JSON.stringify(await fixture(false)));
    console.log('Native status menu integration passed: legacy failure reproduced; production opened/closed six times including after applet idle.');
  })().catch(error=>{console.error(error.message);process.exitCode=1;});
}else assert.equal(process.argv.length,2,'Use --fixture explicitly to run native UI interaction');
