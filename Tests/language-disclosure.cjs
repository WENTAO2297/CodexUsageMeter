const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readSource}=require('./sources.cjs');
let now=1000,reduced=false,failTimer=false,failSave=false,active=0;
const ctx=vm.createContext({
 Date:class extends Date {static now(){return now;}},ObjC:{unwrap:v=>v},
 $:Object.assign(v=>v,{NSControlStateValueOn:1,NSControlStateValueOff:0,NSEventTrackingRunLoopMode:'tracking',
 NSRunLoop:{currentRunLoop:{addTimerForMode(t,mode){assert(t.active);assert.equal(mode,'tracking');}}},
 NSUserDefaults:{standardUserDefaults:{setObjectForKey(){if(failSave)throw Error();}}}}),
 STATUS_DISPLAY_ANIMATION_MS:180,isExiting:false,menuIsOpen:true,menu:{},renderState:{},
 maomaoyunTrafficRenderKey:'',maomaoyunView:null,maomaoyunItem:null,
 updateMaoMaoYunMenuItem(){},updateMaoMaoYunTrafficMenuItem(){},redrawUsageCardIfNeeded(){},updateStatusButtonTitle(){},
 statusDisplayReducedMotion:()=>reduced,sendVoid(){},logError(){},
 startTransientTimer(t,interval,selector){assert.equal(selector,'languageAnimationTimer:');assert.equal(interval,1/60);
  if(failTimer)throw Error();active++;return {active:true};},
 stopTransientTimer(t){if(t?.active){t.active=false;active--;}return null;}
});
vm.runInContext(readSource('i18n'),ctx);
ctx.languageMenuItem={view:{}};
ctx.languageMenuItems={'zh-CN':{hidden:true,view:{}},en:{hidden:true,view:{}}};
ctx.languageButtonPressed({tag:100});assert(ctx.languageExpanded);assert.equal(active,1);
now+=90;ctx.stepLanguageAnimation();assert(ctx.languageReveal>.8&&ctx.languageReveal<1);
const before=ctx.languageReveal;
ctx.languageButtonPressed({tag:100});assert(!ctx.languageExpanded);assert.equal(ctx.languageReveal,before);
assert(ctx.languageMenuItems.en.hidden);assert.equal(active,1);
now+=181;ctx.stepLanguageAnimation();assert.equal(ctx.languageReveal,0);assert.equal(active,0);
reduced=true;ctx.languageButtonPressed({tag:100});assert.equal(ctx.languageReveal,1);assert.equal(active,0);
ctx.languageButtonPressed({tag:101});assert.equal(ctx.uiLanguage,'zh-CN');
assert.equal(ctx.languageMenuItems['zh-CN'].view.state,1);assert(ctx.languageExpanded);
failSave=true;ctx.languageButtonPressed({tag:102});assert.equal(ctx.uiLanguage,'zh-CN');assert.equal(ctx.languageMenuItems.en.view.state,0);
failSave=false;ctx.languageButtonPressed({tag:102});assert.equal(ctx.uiLanguage,'en');assert.equal(ctx.languageMenuItems.en.view.state,1);
ctx.menuIsOpen=false;ctx.setLanguageOptionsExpanded(false,false);assert.equal(ctx.languageReveal,0);assert.equal(active,0);
ctx.menuIsOpen=true;reduced=false;failTimer=true;ctx.setLanguageOptionsExpanded(true,true);
assert.equal(ctx.languageReveal,1);assert.equal(active,0);failTimer=false;
ctx.setLanguageOptionsExpanded(false,true);ctx.stopLanguageAnimation();assert.equal(active,0);
console.log('Language disclosure checks passed: reversal, fixed visibility, selection/failed-save checks, reduced motion, close/restart cleanup and timer fallback.');
