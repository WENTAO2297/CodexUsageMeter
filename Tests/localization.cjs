const assert=require('node:assert/strict');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {readSource,readLibrarySource}=require('./sources.cjs');
let stored,fail=false;
const ctx=vm.createContext({ObjC:{unwrap:x=>x},$:Object.assign(x=>x,{
 NSUserDefaults:{standardUserDefaults:{stringForKey:()=>stored,setObjectForKey:(v,k)=>{assert.equal(k,'CodexUsageMeterUILanguage');if(fail)throw Error();stored=v;}}}
}),isExiting:false,renderState:{},maomaoyunTrafficRenderKey:'old',maomaoyunView:null,maomaoyunItem:null,
 updateMaoMaoYunMenuItem(){},updateMaoMaoYunTrafficMenuItem(){},redrawUsageCardIfNeeded(){},updateStatusButtonTitle(){},
 menu:null,logError(){}});
vm.runInContext(readSource('i18n'),ctx);
ctx.restoreUILanguage();assert.equal(ctx.uiLanguage,'zh-CN');
for(const [en,zh] of [['Weekly','周额度'],['New Task','新建任务'],['Connected','已连接'],
 ['Est. reserve','预计剩余'],
 ['81% remaining','剩余 81%'],['Resets in 30 days','30 天后重置'],
 ['Resets in 26d','26天后重置'],['Resets in 4d 12h','4天 12小时后重置'],
 ['Expires in 12d','12天后到期'],['Expires in 1h','1小时后到期'],
 ['Est. empty 5d early','预计提前 5 天用尽'],['Est. empty <1d early','预计提前 <1 天用尽'],
 ['Estimated at reset in 30 days','30天后重置时预计'],
 ['Budget 13.2%/day · learning','每日预算 13.2 个百分点 · 学习中'],
 ['If reported pace holds: ~300G left','按官网记录速度：预计剩余 300G'],
 ['On track · ~15–30% at reset','预计够用 · 重置时剩余 ~15–30%']])assert.equal(ctx.uiText(en),zh);
ctx.setUILanguage('en');assert.equal(stored,'en');assert.equal(ctx.uiText('Weekly'),'Weekly');
ctx.restoreUILanguage();assert.equal(ctx.uiLanguage,'en');
fail=true;ctx.setUILanguage('zh-CN');assert.equal(ctx.uiLanguage,'en','failed persistence leaves language unchanged');
fail=false;ctx.setUILanguage('zh-CN');ctx.setUILanguage('garbage');assert.equal(ctx.uiLanguage,'zh-CN');
assert.equal(ctx.uiText('MaoMaoYun'),'MaoMaoYun');

// Native build, in-place switching and correct actions.
const fixture=`
delegate=$.CodexUsageMeterDelegate.alloc.init;statusItem={};statusButton=null;buildMenu();
var appClicks=0;
openMaoMaoYunApp=function(){appClicks++;};
function clickVPNApp(){vpnAppButton.performClick(null);}
function titles(){var a=[ObjC.unwrap(vpnAppButton.accessibilityLabel)];for(var i=0;i<menu.numberOfItems;i++)a.push(ObjC.unwrap(menu.itemAtIndex(i).title));return a;}
function appDescription(){return ObjC.unwrap(vpnAppButton.accessibilityLabel);}
uiLanguage='en';setPreferencesExpanded(true);setLanguageOptionsExpanded(true);
languageMenuItems['zh-CN'].view.performClick(null);var zh=titles(),zhDescription=appDescription();
clickVPNApp();
languageMenuItems.en.view.performClick(null);var en=titles(),enDescription=appDescription();
clickVPNApp();
var languageStates=[Number(languageMenuItems.en.view.state),Number(languageMenuItems['zh-CN'].view.state)];
var displayState=Number(statusDisplayMenuItems.quota.view.state);
var text='Budget 13.2%/day · learning';uiLanguage='zh-CN';
var attrs=cardAttributes(9,cardColors().muted,false);
var width=$(uiText(text)).sizeWithAttributes(attrs).width;
var widths=[];
['zh-CN','en'].forEach(function(code){uiLanguage=code;
 ['If pace holds: empty within 1h 30m','On track · ~15–30% at reset',
 'Budget 13.2%/day · gaps','If reported pace holds: ~376.63G left',
 'Reset schedule unavailable'].forEach(function(text){widths.push($(uiText(text)).sizeWithAttributes(attrs).width);});
});
${process.argv.includes('--preview') ? `
var imageDir='${fs.mkdtempSync(path.join(os.tmpdir(),'codex-meter-i18n-'))}';
var previews=[];
['zh-CN','en'].forEach(function(code){
 uiLanguage=code;var image=$.NSImage.alloc.initWithSize($.NSMakeSize(MENU_WIDTH,245));image.lockFocus;
 $.NSColor.colorWithCalibratedWhiteAlpha(0.18,1).setFill;$.NSBezierPath.fillRect($.NSMakeRect(0,0,MENU_WIDTH,245));
 quotaWindows=[{label:'Weekly',durationMins:10080,remaining:81,resetAt:Date.now()/1000+6*86400}];
 usageSyncState='ready';forecastLastSuccessAt=Date.now()/1000;
 drawCardText('Weekly',16,218,145,12,cardColors().body,true);
 drawCardTextRight('81% remaining',MENU_WIDTH-16,218,12,cardColors().body,true);
 drawRoundedBar(16,209,MENU_WIDTH-32,6,.81);
 drawCardText('Resets 10/20 13:09 · 6d 3h',16,190,MENU_WIDTH-32,9,cardColors().muted,false);
 drawCardText('Budget 13.2%/day · learning',16,173,MENU_WIDTH-32,9,cardColors().muted,false);
 drawCardText('Traffic',16,144,70,10,cardColors().muted,false);
 drawCardTextRight('376.63G remaining',MENU_WIDTH-16,144,10,cardColors().body,false);
 drawRoundedBar(16,134,MENU_WIDTH-32,3,.94);
 drawCardText('Resets in 30 days',16,116,MENU_WIDTH-32,9,cardColors().muted,false);
 drawCardText('If reported pace holds: ~300G left',16,100,MENU_WIDTH-32,9,cardColors().muted,false);
 drawCardText('Updated 09:37',16,82,100,9,cardColors().muted);
 drawCardTextRight('23.37G / 400G used',MENU_WIDTH-16,82,9,cardColors().muted);
 drawCardText('Language',16,57,150,13,cardColors().body,false);
 drawCardText('简体中文',36,32,200,13,cardColors().body,false);
 drawCardText('English',36,8,200,13,cardColors().body,false);
 image.unlockFocus;var rep=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
 var filename=imageDir+'/'+code+'.png';rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(filename,true);
 previews.push(filename);
});
` : 'var previews=[];'}
JSON.stringify({zh:zh,en:en,width:width,widths:widths,previews:previews,languageStates:languageStates,displayState:displayState,zhDescription:zhDescription,enDescription:enDescription,appClicks:appClicks});`;
// Isolated preference suite; never modify the user's actual language.
const domain='com.wentao.codex-usage-meter-test-language-'+randomUUID();
const definitions=readSource('main').split('delegate = $.CodexUsageMeterDelegate.alloc.init;')[0];
const isolated=readLibrarySource()+'\n'+definitions+`\nvar languageDefaults=$.NSUserDefaults.alloc.initWithSuiteName('${domain}');
restoreUILanguage=function(){};
$.NSUserDefaults.standardUserDefaults;\n`;
// Replace only the localization module's default preference receiver in fixture.
const lib=isolated.replaceAll('$.NSUserDefaults.standardUserDefaults.setObjectForKey($(value), $(UI_LANGUAGE_KEY))',
 'languageDefaults.setObjectForKey($(value), $(UI_LANGUAGE_KEY))');
const out=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',lib+'\n'+fixture+
 `\n`],{encoding:'utf8',timeout:20000}));
assert(out.zh.includes('新建任务'));assert(out.zh.includes('询问 ChatGPT'));
assert(out.zh.includes('偏好设置'));assert(out.zh.includes('语言'));assert(!out.zh.includes('置顶')&&!out.en.includes('Pinned'),'removed list stays absent in both languages');
assert(out.en.includes('Preferences'));assert(out.en.includes('New Task'));assert(out.en.includes('Language'));
assert(!out.zh.includes('猫猫云官网 ↗'));assert(!out.en.includes('MaoMaoYun Website ↗'));
assert.equal(out.zhDescription,'打开猫猫云');assert.equal(out.enDescription,'Open MaoMaoYun');
assert.equal(out.appClicks,2,'app action works in both languages without opening the client');
assert(out.zh.includes('打开猫猫云'));assert(out.en.includes('Open MaoMaoYun'));
assert(out.width<288,'Chinese budget text fits existing row');
assert(out.widths.every(width=>width<298),'all representative bilingual primary rows fit the panel');
assert.deepEqual(out.languageStates,[1,0],'native language radio matches saved selection');
assert.equal(out.displayState,1,'language selection leaves the display radio group intact');
if(out.previews.length)console.log('Previews:',JSON.stringify(out.previews));
const savedNative=execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',`ObjC.import('Foundation');ObjC.unwrap($.NSUserDefaults.alloc.initWithSuiteName('${domain}').stringForKey('CodexUsageMeterUILanguage'));`],{encoding:'utf8'}).trim();
assert.equal(savedNative,'en','language selection survives across processes');
execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',`ObjC.import('Foundation');$.NSUserDefaults.alloc.initWithSuiteName('${domain}').removePersistentDomainForName('${domain}');`]);
console.log('Localization checks passed: Chinese default, reversible labels, persisted selection guards, native in-place refresh and no pinned list.');
