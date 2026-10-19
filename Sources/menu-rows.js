// JXA Objective-C calls can run AppKit events before they return (including
// another mouse-enter or drawRect). Never let a JS drawing error escape into
// JSOCForwardInvocation, which AppKit treats as an uncaught native exception.
// Reentrant paint is retried by the existing menu timer, not from drawRect.
var menuViewCallbacks={drawing:false,flushing:false,redraws:[],failures:[]};

function deferMenuViewRedraw(view) {
  if(view&&menuViewCallbacks.redraws.indexOf(view)<0&&menuViewCallbacks.redraws.length<64)
    menuViewCallbacks.redraws.push(view);
}

function noteMenuViewFailure(component,error) {
  var text='Unknown menu callback error';
  try {text=String(error).slice(0,600);}catch(ignored){}
  if(menuViewCallbacks.failures.some(function(entry){return entry.component===component&&entry.text===text;}))return;
  if(menuViewCallbacks.failures.length<16)menuViewCallbacks.failures.push({component:component,text:text});
}

function registerMenuViewSubclass(definition) {
  var draw=definition.methods['drawRect:'];
  if(draw){
    var paint=draw.implementation;
    draw.implementation=function(){
      if(menuViewCallbacks.drawing){deferMenuViewRedraw(this);return;}
      menuViewCallbacks.drawing=true;
      try {paint.apply(this,arguments);}
      catch(error){noteMenuViewFailure(definition.name,error);deferMenuViewRedraw(this);}
      finally {menuViewCallbacks.drawing=false;}
    };
  }
  ObjC.registerSubclass(definition);
}

function flushMenuViewCallbacks() {
  if(menuViewCallbacks.drawing||menuViewCallbacks.flushing)return;
  menuViewCallbacks.flushing=true;
  var failures=menuViewCallbacks.failures.splice(0),redraws=menuViewCallbacks.redraws.splice(0);
  try {
    // File I/O and invalidation stay outside native painting callbacks.
    failures.forEach(function(entry){logError('menu-view:'+entry.component,entry.text);});
    if(menuIsOpen&&!isExiting)redraws.forEach(invalidateMenuRowHighlight);
  } finally {menuViewCallbacks.flushing=false;}
}

// NSMenu supports animating custom drawing, not resizing views while tracking.
// Keep native row heights/window ownership intact; soften disclosure through
// a short fade/slide and chevron turn rather than a separate floating panel.
var menuRowHover = {view:null,item:null,nativeSelection:false,point:null};

function invalidateMenuRowHighlight(view) {
  if(!view)return;
  if(menuViewCallbacks.drawing){deferMenuViewRedraw(view);return;}
  try {
    view.needsDisplay=true;
    // Transparent rows need their backing menu region invalidated as well.
    var parent=view.superview;
    if(parent&&ObjC.unwrap(parent)!=null)parent.setNeedsDisplayInRect(view.frame);
  } catch(error){noteMenuViewFailure('hover-invalidation',error);}
}

function clearMenuRowHover(expected) {
  if(expected&&menuRowHover!==expected)return null;
  var previous=menuRowHover.view;
  // Publish a complete replacement before any Objective-C call can reenter.
  var cleared={view:null,item:null,nativeSelection:false,point:null};
  menuRowHover=cleared;
  invalidateMenuRowHighlight(previous);
  return cleared;
}

function menuRowKeyboardEvent() {
  var event=$.NSApplication.sharedApplication.currentEvent;
  return !!(event&&ObjC.unwrap(event)!=null&&Number(event.type)===$.NSEventTypeKeyDown);
}

function setMenuRowHoverControl(view,nativeSelection) {
  var cleared=clearMenuRowHover();
  if(menuRowHover!==cleared)return;
  try {
    if(!menuIsOpen||isExiting||!view||ObjC.unwrap(view)==null||
        !view.isKindOfClass($.CodexUsageMeterMenuRowButton)||!view.enabled)return;
    // Resolve the current menu's item, never a detached/previous-menu view.
    var item=menuRowItemForControl(view);
    if(!item||item.hidden||!item.enabled)return;
    var point=null;
    try {var mouse=$.NSEvent.mouseLocation;point={x:mouse.x,y:mouse.y};}catch(ignored){}
    // A newer enter/exit/close event wins over this suspended callback.
    if(menuRowHover!==cleared||!menuIsOpen||isExiting)return;
    menuRowHover={view:view,item:item,nativeSelection:!!nativeSelection,point:point};
    invalidateMenuRowHighlight(view);
  } catch(error){noteMenuViewFailure('hover-entry',error);clearMenuRowHover(cleared);}
}

// Reuse the menu-only guard timer. Missed exits and geometry changes must not
// strand a hover; native keyboard selection survives until the pointer moves.
function reconcileMenuRowHover() {
  pruneMenuRowHover();
  var owner=menuRowHover;
  if(!owner.view)return;
  try {
    var point=menuTrackingMouseState().point,previous=owner.point;
    if(menuRowHover!==owner)return;
    if(owner.nativeSelection&&previous&&point.x===previous.x&&point.y===previous.y)return;
    var rect=menuTrackingViewRect(owner.view);
    var inside=rect&&$.NSPointInRect(point,rect);
    if(menuRowHover!==owner)return;
    if(!inside)clearMenuRowHover(owner);
    else if(owner.nativeSelection)menuRowHover={view:owner.view,item:owner.item,nativeSelection:false,point:owner.point};
  }catch(error){noteMenuViewFailure('hover-position',error);clearMenuRowHover(owner);}
}

function pruneMenuRowHover() {
  var owner=menuRowHover;
  if(!owner.item)return;
  try {
    // Capture once: native property getters may dispatch a newer callback
    // that clears/replaces menuRowHover while this expression is evaluating.
    if(!menuIsOpen||isExiting||owner.item.hidden||!owner.item.enabled||
        !owner.view||!owner.view.enabled||!menuRowItemForControl(owner.view))clearMenuRowHover(owner);
  } catch(error){noteMenuViewFailure('hover-pruning',error);clearMenuRowHover(owner);}
}

function menuRowItemForControl(view) {
  if(!menu||!view)return null;
  var activeMenu=menu,toolbarRoot=null;
  var toolbar=typeof vpnAppButton!=='undefined'&&vpnAppButton&&view.isEqual(vpnAppButton);
  if(toolbar){
    toolbarRoot=typeof metricsPairView==='undefined'?null:metricsPairView;
    var parent=view.superview;
    if(!toolbarRoot||!parent||ObjC.unwrap(parent)==null||!parent.isEqual(toolbarRoot))return null;
  }
  for(var i=0;i<activeMenu.numberOfItems;i++) {
    var item=activeMenu.itemAtIndex(i),candidate=item.view;
    if(candidate&&ObjC.unwrap(candidate)!=null&&view.isEqual(candidate))return item;
    if(toolbarRoot&&candidate&&ObjC.unwrap(candidate)!=null&&toolbarRoot.isEqual(candidate))
      return menu===activeMenu&&metricsPairView===toolbarRoot?item:null;
  }
  return null;
}

function drawMenuRowHighlight(view,opacity,inset,contentWidth) {
  // Painting is read-only. Geometry checks and missed-exit cleanup belong to
  // the tracking callbacks/menu timer, never draw -> reconcile -> invalidate.
  var owner=menuRowHover;
  if(!menuIsOpen||isExiting||!owner.item||!owner.view)return false;
  var hovered=view.isEqual(owner.view);
  // NSButtonCell.highlighted belongs to native press tracking, which can
  // outlive a hover during menu reflow. Only our shared owner paints gray.
  if(!hovered||menuRowHover!==owner||!menuIsOpen||isExiting)return false;
  var bounds=view.bounds;
  if(menuRowHover!==owner||!menuIsOpen||isExiting)return false;
  var edge=inset===undefined?5:Number(inset);
  var width=contentWidth===undefined?Number(bounds.size.width):Number(contentWidth);
  var highlight=$.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(
    $.NSMakeRect(edge,0,width-edge*2,bounds.size.height),5,5);
  sendVoid($.NSColor.whiteColor.colorWithAlphaComponent(.12*opacity),'setFill');
  sendVoid(highlight,'fill');
  return true;
}

function configureMenuRowButton(button,title) {
  button.bordered=true;
  button.font=$.NSFont.menuFontOfSize(0);
  button.title=title;
  button.autoresizingMask=$.NSViewWidthSizable;
  button.addTrackingArea($.NSTrackingArea.alloc.initWithRectOptionsOwnerUserInfo(
    $.NSMakeRect(0,0,0,0),$.NSTrackingMouseEnteredAndExited|$.NSTrackingActiveAlways|$.NSTrackingInVisibleRect,button,$()));
}

registerMenuViewSubclass({
  name: 'CodexUsageMeterMenuRowButton',
  superclass: 'NSButton',
  methods: {
    'mouseEntered:': {
      types:['void',['id']],
      implementation:function(){setMenuRowHoverControl(this);}
    },
    'mouseExited:': {
      types:['void',['id']],
      implementation:function(){
        var owner=menuRowHover;
        try {if(owner.view&&this.isEqual(owner.view))clearMenuRowHover(owner);}
        catch(error){noteMenuViewFailure('hover-exit',error);}
      }
    }
  }
});

registerMenuViewSubclass({
  name:'CodexUsageMeterActionButton',
  superclass:'CodexUsageMeterMenuRowButton',
  methods:{
    'accessibilityPerformPress':{
      types:['bool',[]],
      implementation:function(){
        var item=menuRowItemForControl(this);
        if(isExiting||!this.enabled||!item||!item.enabled||item.hidden)return false;
        menuActionButtonPressed(this);return true;
      }
    },
    'drawRect:':{
      implementation:function(){
        var highlighted=drawMenuRowHighlight(this,1);
        var attrs=cardAttributes(Number(this.font.pointSize),highlighted?$.NSColor.whiteColor:cardColors().body,false).mutableCopy;
        attrs.setObjectForKey(this.font,$('NSFont'));
        var height=Number(this.title.sizeWithAttributes(attrs).height),bounds=this.bounds;
        var y=(bounds.size.height-height)/2;
        // Text-only footer, aligned to the data's 16pt edge. Titles are already
        // localized by the item factory; no empty icon gutter is reserved.
        this.title.drawInRectWithAttributes($.NSMakeRect(16,y,bounds.size.width-32,height+1),attrs);
      }
    }
  }
});

function makeMenuActionItem(title,action) {
  var item=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent(title,action,'');
  item.target=delegate;item.enabled=true;
  var button=$.CodexUsageMeterActionButton.alloc.initWithFrame($.NSMakeRect(0,0,MENU_WIDTH,24));
  button.setButtonType($.NSMomentaryChangeButton);
  button.tag=action==='newTask:'?1:action==='openChatGPTWeb:'?2:action==='restartMeter:'?3:0;
  configureMenuRowButton(button,title);
  button.sendActionOn($.NSEventMaskLeftMouseDown);
  button.target=delegate;button.action='menuActionButton:';
  item.view=button;
  if(typeof localizedMenuItem==='function')localizedMenuItem(item,title);
  return item;
}

function menuActionButtonPressed(sender) {
  if(isExiting||!sender.enabled)return;
  var item=menuRowItemForControl(sender);
  if(!item||!item.enabled||item.hidden)return;
  // Close native tracking before a browser/chat/app action and pass its item.
  clearMenuRowHover();
  sendVoid(menu,'cancelTracking');
  $.NSApplication.sharedApplication.sendActionToFrom(item.action,item.target,item);
}


function drawMenuDisclosureChevron(view,reveal,opacity,highlighted,offsetY) {
  var bounds=view.bounds,x=bounds.size.width-23,midY=bounds.size.height/2+(offsetY||0);
  var arrow=$.NSBezierPath.bezierPath;
  var angle=Math.PI*reveal,cos=Math.cos(angle),sin=Math.sin(angle),flip=view.flipped?-1:1;
  [[-4,2],[0,-2],[4,2]].forEach(function(point,index){
    var target=$.NSMakePoint(x+point[0]*cos-point[1]*sin,
      midY+flip*(point[0]*sin+point[1]*cos));
    if(index===0)arrow.moveToPoint(target);else arrow.lineToPoint(target);
  });
  arrow.lineWidth=1.4;arrow.lineCapStyle=$.NSRoundLineCapStyle;arrow.lineJoinStyle=$.NSRoundLineJoinStyle;
  sendVoid((highlighted?$.NSColor.whiteColor:cardColors().muted).colorWithAlphaComponent(opacity),'setStroke');
  sendVoid(arrow,'stroke');
}
