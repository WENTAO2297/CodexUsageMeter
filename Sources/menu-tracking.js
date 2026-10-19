// Menu-only interaction maintenance. No help text or tooltip registration.
// Keep the missed-exit guard and deferred paint recovery independent of hints.
var menuTrackingTimer=null;

function menuTrackingViewRect(view) {
  var window=view.window;
  if(!window||!window.visible||view.hiddenOrHasHiddenAncestor)return null;
  // $() is native nil; JavaScript null becomes NSNull in the JXA bridge.
  return window.convertRectToScreen(view.convertRectToView(view.bounds,$()));
}

function menuTrackingMouseState() {
  return {point:$.NSEvent.mouseLocation};
}

function startMenuTracking() {
  if(menuTrackingTimer||!menuIsOpen||isExiting)return;
  try {
    menuTrackingTimer=startTransientTimer(null,.15,'menuTrackingTimer:');
    $.NSRunLoop.currentRunLoop.addTimerForMode(menuTrackingTimer,$.NSEventTrackingRunLoopMode);
  }catch(error){stopMenuTracking();logError('menu-tracking',error);}
}

function stopMenuTracking() {
  menuTrackingTimer=stopTransientTimer(menuTrackingTimer);
}
