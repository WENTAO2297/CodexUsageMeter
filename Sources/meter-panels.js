// Compact native NSMenu sections; only activity cells have native data hints.
function meterDateText(at) {
  var date=new Date(at*1000),year=date.getFullYear(),today=new Date();
  return (year===today.getFullYear()?'':year+'/')+(date.getMonth()+1)+'/'+('0'+date.getDate()).slice(-2);
}
function resetCardDateFont() {
  var key='reset-card-date';
  if(!renderState.fonts[key]){
    var font=null,choices=[['DINCondensed-Bold',13],['DINAlternate-Bold',11]];
    for(var i=0;i<choices.length&&!font;i++){
      try{
        var candidate=$.NSFont.fontWithNameSize(choices[i][0],choices[i][1]);
        // An Objective-C nil proxy can still be truthy in JXA.
        if(typeof ObjC.unwrap(candidate.fontName)==='string'&&Number(candidate.pointSize)>0)font=candidate;
      }catch(ignored){}
    }
    if(!font){
      try{font=$.NSFont.monospacedDigitSystemFontOfSizeWeight(11,$.NSFontWeightSemibold);}
      catch(ignored){font=$.NSFont.boldSystemFontOfSize(11);}
    }
    renderState.fonts[key]=font;
  }
  return renderState.fonts[key];
}
function resetCardDateMetrics(text) {
  var font=resetCardDateFont(),key=ObjC.unwrap(font.fontName)+':'+Number(font.pointSize)+':'+text;
  var cache=resetCardDateMetrics.cache||(resetCardDateMetrics.cache={});
  if(!cache[key]){
    var value=$(text),attributes=$({NSFont:font}),size=value.sizeWithAttributes(attributes);
    var glyph={x:0,y:0,w:Number(size.width),h:Number(font.capHeight)};
    try{
      var ink=value.boundingRectWithSizeOptionsAttributes($.NSMakeSize(1000,100),$.NSStringDrawingUsesDeviceMetrics,attributes);
      if(isFinite(Number(ink.origin.x))&&isFinite(Number(ink.origin.y))&&Number(ink.size.width)>0&&Number(ink.size.height)>0){
        glyph={x:Number(ink.origin.x),y:Number(ink.origin.y),w:Number(ink.size.width),h:Number(ink.size.height)};
      }
    }catch(ignored){}
    cache[key]={glyph:glyph,width:Number(size.width),height:Number(font.pointSize)+4,ascender:Number(font.ascender)};
  }
  return cache[key];
}
function drawResetCardDate(text,x,centerY,width,color) {
  var metrics=resetCardDateMetrics(text),glyph=metrics.glyph;
  // Center visible ink rather than the advance box: a leading 1 and the slash
  // have different side bearings even though DIN's numeric advances are equal.
  var drawX=x+(width-glyph.w)/2-glyph.x;
  var baseline=metrics.height-metrics.ascender;
  var drawY=centerY-baseline-glyph.y-glyph.h/2;
  $(text).drawInRectWithAttributes($.NSMakeRect(drawX,drawY,Math.ceil(metrics.width)+2,metrics.height),
    $({NSFont:resetCardDateFont(),NSColor:color}));
  return {x:drawX+glyph.x,y:drawY+baseline+glyph.y,w:glyph.w,h:glyph.h};
}
function resetCardDateText(at) {
  var text=meterDateText(at);
  if(resetCardDateMetrics(text).glyph.w<=resetCardDateCapsuleWidth-6)return text;
  // Keep the title-sized capsule readable; the full year stays in accessibility.
  return text.split('/').slice(-2).join('/');
}
function meterTokenText(value){
  if(uiLanguage!=='zh-CN'||!meterCount(value)||value<10000)return compactTokenCount(value);
  var scale=value>=1e12?1e12:value>=1e8?1e8:1e4,unit=scale===1e12?'万亿':scale===1e8?'亿':'万';
  return (value/scale).toFixed(2).replace(/\.?0+$/,'')+unit;
}
function resetCardsPresentation() {
  var cards=typeof resetCreditCards==='undefined'?[]:resetCreditCards;
  if(!cards.length&&resetCreditExpirations.length)cards=resetCreditExpirations.map(function(at){return {expiresAt:at,grantedAt:null};});
  return resetCardsModel(cards,availableCredits,Date.now()/1000,usageSyncState!=='ready');
}
function resetCardCaption(row) {
  if(row.state==='loading')return uiText('Awaiting quota');
  if(row.state==='empty')return uiText('No reset cards');
  if(row.state==='unknown')return uiText('Expiry unknown');
  if(row.state==='expired')return uiText('Expired · refreshing');
  return uiText('Expires in '+meterDuration(row.secondsLeft));
}
function resetCardAccessible(row) {
  var text=uiText('Reset cards')+': '+row.count+'. '+resetCardCaption(row);
  if(row.expiresAt)text+='. '+uiText('Expiry')+': '+new Date(row.expiresAt*1000).toLocaleString(uiLanguage==='zh-CN'?'zh-CN':'en-US');
  if(row.grantedAt)text+='. '+uiText('Official grant')+': '+new Date(row.grantedAt*1000).toLocaleString(uiLanguage==='zh-CN'?'zh-CN':'en-US');
  else if(row.fromObservation)text+='. '+uiText('Bar measured from first observation');
  return text;
}
registerMenuViewSubclass({name:'CodexUsageMeterResetHeaderView',superclass:'NSView',methods:{
  'drawRect:':{implementation:function(){
    var colors=cardColors(),count=resetCardsPresentation().count;
    drawCardText('Reset cards',16,3,resetCardDateCapsuleWidth,12,colors.muted,'medium');
    drawCardTextRight(count===null?'—':count+(uiLanguage==='zh-CN'?' 张':' available'),MENU_WIDTH-16,4,10,colors.muted,false);
  }}
}});
registerMenuViewSubclass({name:'CodexUsageMeterResetCardView',superclass:'NSView',methods:{
  'drawRect:':{implementation:function(){
    var row=resetCardsPresentation().rows[Number(ObjC.unwrap(this.identifier))];if(!row)return;
    var colors=cardColors(),tone=row.tone,color=tone==='critical'?colors.percentageCritical:
      tone==='warning'?colors.percentageWarning:colors.muted;
    var date=row.expiresAt?resetCardDateText(row.expiresAt):resetCardCaption(row);
    // Keep each expiry as a two-line group: one aligned information line,
    // then a full-width track with 6pt clearance below the date capsule.
    var infoFont=cardFont(10,false),centerY=Number(this.bounds.size.height)-10;
    var infoY=centerY-14+Number(infoFont.ascender)-Number(infoFont.capHeight)/2;
    if(row.expiresAt){
      var pill=$.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(16,centerY-8,resetCardDateCapsuleWidth,16),8,8);
      sendVoid($.NSColor.whiteColor.colorWithAlphaComponent(.10),'setFill');sendVoid(pill,'fill');
      drawResetCardDate(date,16,centerY,resetCardDateCapsuleWidth,colors.body);
    }else drawCardText(date,16,infoY,MENU_WIDTH-150,10,colors.body,false);
    var caption=row.expiresAt?resetCardCaption(row):row.count>1?row.count+' '+uiText('cards'):'';
    var icon=row.state==='available'?'clock':meterStatusSymbol(resetCardCaption(row));
    var captionX=16+(row.expiresAt?resetCardDateCapsuleWidth:MENU_WIDTH-150)+12;
    drawMeterStatusText(caption,captionX,infoY,MENU_WIDTH-16-captionX,10,color,false,'right',caption?icon:null,tone||'muted');
    // Match the header's Wi-Fi blue; keep warning/expiry text semantic.
    drawRoundedBar(16,6,MENU_WIDTH-32,4,row.fraction===null?0:row.fraction,colors.blue);
  }}
}});
function updateResetCardsMenu() {
  if(!resetCardsHeaderItem||!menu)return;
  var presentation=resetCardsPresentation(),desired=presentation.rows.length;
  // The localized section title defines every capsule's exact leading/trailing
  // edge. Refreshing the language remeasures the same 12pt medium title font.
  resetCardDateCapsuleWidth=Number($(uiText('Reset cards')).sizeWithAttributes(cardAttributes(12,cardColors().muted,'medium')).width);
  while(resetCardsMenuItems.length>desired){var old=resetCardsMenuItems.pop();menu.removeItem(old);}
  while(resetCardsMenuItems.length<desired){
    var item=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('',null,'');
    item.view=$.CodexUsageMeterResetCardView.alloc.initWithFrame($.NSMakeRect(0,0,MENU_WIDTH,34));
    item.enabled=false;
    menu.insertItemAtIndex(item,Number(menu.indexOfItem(resetCardsHeaderItem))+1+resetCardsMenuItems.length);
    resetCardsMenuItems.push(item);
  }
  resetCardsHeaderItem.view.needsDisplay=true;
  resetCardsHeaderItem.view.accessibilityLabel=uiText('Reset cards')+': '+(presentation.count===null?'—':presentation.count);
  resetCardsMenuItems.forEach(function(item,index){
    item.view.identifier=String(index);item.view.accessibilityElement=true;item.view.accessibilityRole='AXStaticText';
    item.view.accessibilityLabel=resetCardAccessible(presentation.rows[index]);item.view.needsDisplay=true;
  });
}

function tokenMeterPresentation() {
  var snapshot=usageAccountId&&tokenMeterSnapshot&&tokenMeterSnapshot.accountId===usageAccountId?tokenMeterSnapshot:null;
  var model=tokenMeterModel(snapshot),now=Date.now()/1000;
  var stale=!!model&&(tokenMeterSync!=='ready'||now-tokenMeterSnapshot.savedAt>900);
  var caption=!usageAccountId?'Account unavailable':tokenMeterSync==='authRequired'?'Sign in to Codex':
    tokenMeterSync==='loading'?'Updating':stale?'Last count':tokenMeterSync==='rateLimited'?'Rate limited':!model?'Read failed':'Profile data';
  return {model:model,stale:stale,caption:caption};
}
// Range controls belong to the chart's plain NSView, never the disclosure
// NSButton: AppKit can deliver the containing row's mouseDown before child hits.
registerMenuViewSubclass({name:'CodexUsageMeterActivityRangeButton',superclass:'NSButton',methods:{
  'isFlipped':{types:['bool',[]],implementation:function(){return false;}},
  'mouseDown:':{types:['void',['id']],implementation:function(){tokenActivityRangeButtonPressed(this);}},
  'performClick:':{types:['void',['id']],implementation:function(){tokenActivityRangeButtonPressed(this);}},
  'accessibilityPerformPress':{types:['bool',[]],implementation:function(){return tokenActivityRangeButtonPressed(this);}},
  'drawRect:':{implementation:function(){
    var bounds=this.bounds,colors=cardColors(),position=tokenActivityRangePosition();
    var strength=Number(this.tag)===30?position:1-position;
    var color=colors.muted.blendedColorWithFractionOfColor(strength,colors.body),size=10;
    // Fit both labels at the same size; English keeps its full accessible name.
    while(size>9&&Number($(uiText('30 days')).sizeWithAttributes(cardAttributes(size,color,'medium')).width)>bounds.size.width-2)size-=.5;
    var label=Number(this.tag)===30?'30 days':'7 days';
    var font=cardFont(size,'medium'),y=10-(size+4)+Number(font.ascender)-Number(font.capHeight)/2;
    drawDashboardCenteredText(label,1,y,bounds.size.width-2,size,color,'medium');
  }}
}});
function tokenActivityRangePosition(){
  return typeof tokenActivityRangeAnimation==='undefined'?(typeof usageActivityDays!=='undefined'&&usageActivityDays===30?1:0):tokenActivityRangeAnimation.value;
}
function settleTokenActivityRangeAnimation(){
  if(typeof tokenActivityRangeAnimation==='undefined')return;
  var target=usageActivityDays===30?1:0;
  tokenActivityRangeAnimation.value=tokenActivityRangeAnimation.from=tokenActivityRangeAnimation.to=target;
}
function stepTokenActivityRangeAnimation(now){
  if(typeof tokenActivityRangeAnimation==='undefined')return;
  var state=tokenActivityRangeAnimation,elapsed=now-state.startedAt;
  if(elapsed<0||elapsed>=TOKEN_ACTIVITY_RANGE_ANIMATION_MS||statusDisplayReducedMotion()){settleTokenActivityRangeAnimation();return;}
  var phase=Math.max(0,Math.min(1,elapsed/TOKEN_ACTIVITY_RANGE_ANIMATION_MS));
  var eased=phase*phase*(3-2*phase);
  state.value=state.from+(state.to-state.from)*eased;
}
function beginTokenActivityRangeAnimation(days){
  if(typeof tokenActivityRangeAnimation==='undefined')return;
  var now=Date.now();stepTokenActivityRangeAnimation(now);
  tokenActivityRangeAnimation.from=tokenActivityRangePosition();
  tokenActivityRangeAnimation.to=days===30?1:0;tokenActivityRangeAnimation.startedAt=now;
}
function drawTokenActivityRange(){
  var range=usageActivityRangeRect(),thumb=usageActivityRangeThumbRect(tokenActivityRangePosition());
  sendVoid($.NSColor.whiteColor.colorWithAlphaComponent(.06),'setFill');
  sendVoid($.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(range.x,range.y,range.width,range.height),10,10),'fill');
  // One shared thumb crosses the segment boundary; child buttons draw text only.
  sendVoid($.NSColor.whiteColor.colorWithAlphaComponent(.16),'setFill');
  sendVoid($.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(thumb.x,thumb.y,thumb.width,thumb.height),9,9),'fill');
}
function updateTokenActivityRangeButtons(){
  if(typeof tokenActivityRangeButtons==='undefined')return;
  tokenActivityRangeButtons.forEach(function(button){
    var days=Number(button.tag);
    var covered=typeof tokenActivityHover!=='undefined'&&tokenActivityHover&&tokenActivityHover.view===tokenMeterView;
    button.hidden=!tokenMeterExpanded||!!covered;
    button.title=uiText(days===30?'30 days':'7 days');
    button.accessibilityLabel=uiText(days===30?'Past 30 days':'Past 7 days');
    button.state=usageActivityDays===days?1:0;button.needsDisplay=true;
  });
}
function tokenActivityRangeButtonPressed(sender){
  if(isExiting||!menuIsOpen||!tokenMeterExpanded||!sender||!sender.enabled||
    !tokenMeterDisclosureItem||!tokenMeterItem||tokenMeterItem.hidden||tokenMeterDisclosureItem.hidden||!tokenMeterDisclosureItem.enabled)return false;
  var found=tokenActivityRangeButtons.some(function(button){return button.isEqual(sender);});
  var parent=sender.superview,item=menuRowItemForControl(tokenMeterView),days=Number(sender.tag);
  if(!found||!parent||ObjC.unwrap(parent)==null||!parent.isEqual(tokenMeterView)||
    !item||!item.isEqual(tokenMeterItem)||!item.enabled||sender.hidden||(days!==7&&days!==30))return false;
  if(days===usageActivityDays)return true;
  clearTokenActivityHover();
  if(tokenMeterAnimation.timer)stepTokenMeterAnimation();
  stopTokenMeterAnimation();beginTokenActivityRangeAnimation(days);usageActivityDays=days;tokenMeterReveal=0;
  // Reuse the disclosure's one 500ms timer, but keep the arrow's current angle.
  setTokenMeterExpanded(true,true);refreshTokenMeterMenu(true);return true;
}
function tokenActivityRangeContainerPressed(view,event){
  if(isExiting||!menuIsOpen||!tokenMeterExpanded||!view||!tokenMeterView||!view.isEqual(tokenMeterView)||
    !event||ObjC.unwrap(event)==null||Number(event.type)!==Number($.NSEventTypeLeftMouseDown))return false;
  var point=view.convertPointFromView(event.locationInWindow,$());
  for(var i=0;i<tokenActivityRangeButtons.length;i++){
    var button=tokenActivityRangeButtons[i];
    if($.NSPointInRect(point,button.frame)){
      // The pointer can reach this band before a mouseMoved callback. Clear
      // the readout using the real click position before resolving the button.
      refreshTokenActivityHover(view,point);
      return tokenActivityRangeButtonPressed(button);
    }
  }
  return false;
}
function addTokenActivityRangeButtons(parent){
  tokenActivityRangeButtons=[];settleTokenActivityRangeAnimation();var rect=usageActivityRangeRect(),half=rect.width/2;
  [7,30].forEach(function(days,index){
    var button=$.CodexUsageMeterActivityRangeButton.alloc.initWithFrame($.NSMakeRect(rect.x+half*index,rect.y,half,rect.height));
    button.setButtonType($.NSMomentaryChangeButton);button.bordered=false;button.tag=days;
    button.accessibilityElement=true;button.accessibilityRole='AXRadioButton';
    parent.addSubview(button);tokenActivityRangeButtons.push(button);
  });
  updateTokenActivityRangeButtons();
}
registerMenuViewSubclass({name:'CodexUsageMeterTokenDisclosureButton',superclass:'CodexUsageMeterMenuRowButton',methods:{
  'isFlipped':{types:['bool',[]],implementation:function(){return false;}},
  'accessibilityPerformPress':{types:['bool',[]],implementation:function(){return tokenMeterButtonPressed(this);}},
  'drawRect:':{implementation:function(){
    var p=usageActivityPresentation();
    var colors=cardColors(),highlighted=drawMenuRowHighlight(this,1),y=(Number(this.bounds.size.height)-16)/2;
    var color=highlighted?$.NSColor.whiteColor:colors.muted;
    drawCardText('Usage activity',16,y,MENU_WIDTH-60,12,color,'medium');
    if(p.stale){
      var titleWidth=Number($(uiText('Usage activity')).sizeWithAttributes(cardAttributes(12,color,'medium')).width);
      drawMeterStatusIcon('clock',16+titleWidth+5,meterStatusIconY('clock','Usage activity',y,12,'medium',9),9,color,highlighted?'highlighted':'muted');
    }
    drawMenuDisclosureChevron(this,1-Math.pow(1-tokenMeterArrowReveal(),3),1,highlighted);
  }}
}});

registerMenuViewSubclass({name:'CodexUsageMeterUsageActivityView',superclass:'NSView',methods:{
  'mouseDown:':{types:['void',['id']],implementation:function(event){tokenActivityRangeContainerPressed(this,event);}},
  'mouseEntered:':{types:['void',['id']],implementation:function(){refreshTokenActivityHover(this);}},
  'mouseMoved:':{types:['void',['id']],implementation:function(){refreshTokenActivityHover(this);}},
  'mouseExited:':{types:['void',['id']],implementation:function(){refreshTokenActivityHover(this);}},
  'drawRect:':{implementation:function(){
    var model=usageActivityPresentation(),hover=tokenActivityHoverForModel(this,model);
    if(!hover)drawTokenActivityRange();
    var reveal=Math.max(0,Math.min(1,tokenMeterReveal));if(reveal<=0)return;
    $.NSGraphicsContext.saveGraphicsState;
    try {
      sendVoid($.NSBezierPath.bezierPathWithRect(this.bounds),'addClip');
      drawUsageActivity(model,reveal,hover);
    }finally{
      $.NSGraphicsContext.restoreGraphicsState;
    }
    if(hover){drawTokenActivityGuide(hover);drawTokenActivityHint(this,model,hover);}
  }}
}});

function stopTokenMeterAnimation(){tokenMeterAnimation.timer=stopTransientTimer(tokenMeterAnimation.timer);}
function tokenMeterArrowReveal(){
  return typeof tokenMeterAnimation.arrowReveal==='number'?tokenMeterAnimation.arrowReveal:tokenMeterReveal;
}
function redrawTokenMeterDisclosure(){
  if(tokenMeterDisclosureItem)tokenMeterDisclosureItem.view.needsDisplay=true;
  if(tokenMeterView)tokenMeterView.needsDisplay=true;
  if(typeof tokenActivityRangeButtons!=='undefined')tokenActivityRangeButtons.forEach(function(button){button.needsDisplay=true;});
}
function finishTokenMeterAnimation(progress){
  stopTokenMeterAnimation();settleTokenActivityRangeAnimation();tokenMeterReveal=progress;tokenMeterAnimation.arrowReveal=progress;redrawTokenMeterDisclosure();
  if(typeof refreshTokenActivityHover==='function')refreshTokenActivityHover();
}
function stepTokenMeterAnimation(){
  if(!tokenMeterAnimation.timer)return;
  if(isExiting||!menuIsOpen){finishTokenMeterAnimation(tokenMeterExpanded?1:0);return;}
  stepTokenActivityRangeAnimation(Date.now());
  var dataDistance=Math.abs(tokenMeterAnimation.to-tokenMeterAnimation.from);
  var arrowDistance=Math.abs(tokenMeterAnimation.to-tokenMeterAnimation.arrowFrom);
  var duration=TOKEN_ACTIVITY_ANIMATION_MS*Math.max(dataDistance,arrowDistance);
  var elapsed=Date.now()-tokenMeterAnimation.startedAt;
  if(elapsed<0||elapsed>=duration||statusDisplayReducedMotion()){finishTokenMeterAnimation(tokenMeterAnimation.to);return;}
  var dataProgress=dataDistance?Math.min(1,elapsed/(TOKEN_ACTIVITY_ANIMATION_MS*dataDistance)):1;
  var arrowProgress=arrowDistance?Math.min(1,elapsed/(TOKEN_ACTIVITY_ANIMATION_MS*arrowDistance)):1;
  tokenMeterReveal=tokenMeterAnimation.from+(tokenMeterAnimation.to-tokenMeterAnimation.from)*dataProgress;
  tokenMeterAnimation.arrowReveal=tokenMeterAnimation.arrowFrom+(tokenMeterAnimation.to-tokenMeterAnimation.arrowFrom)*arrowProgress;
  if(typeof refreshTokenActivityHover==='function')refreshTokenActivityHover();
  redrawTokenMeterDisclosure();
}
function updateTokenMeterDisclosureLabel(){
  if(tokenMeterDisclosureItem)tokenMeterDisclosureItem.view.accessibilityLabel=uiText('Usage activity')+'. '+uiText(tokenMeterExpanded?'Expanded':'Collapsed');
  updateTokenActivityRangeButtons();
}
function setTokenMeterExpanded(expanded,animate){
  if(isExiting||!tokenMeterDisclosureItem||!tokenMeterItem)return;
  expanded=!!expanded;var target=expanded?1:0,replay=expanded&&!tokenMeterExpanded;
  if(tokenMeterExpanded===expanded&&tokenMeterReveal===target&&tokenMeterArrowReveal()===target&&!tokenMeterAnimation.timer&&!!tokenMeterItem.hidden===!expanded)return;
  if(tokenMeterAnimation.timer)stepTokenMeterAnimation();
  var arrowFrom=tokenMeterArrowReveal();
  if(typeof clearTokenActivityHover==='function')clearTokenActivityHover();
  stopTokenMeterAnimation();tokenMeterExpanded=expanded;
  if(!expanded)settleTokenActivityRangeAnimation();
  // A hidden chart always gets a new full replay, even when its closing arrow
  // is still moving. Reset data before exposing the row to a native redraw.
  if(replay)tokenMeterReveal=0;
  tokenMeterAnimation.arrowFrom=arrowFrom;tokenMeterAnimation.arrowReveal=arrowFrom;
  // Native rows change visibility only inside the action/lifecycle callback.
  // Timer frames never resize a tracking menu or mutate its item visibility.
  tokenMeterItem.hidden=!expanded;updateTokenMeterDisclosureLabel();pruneMenuRowHover();
  if(menu)sendVoid(menu,'update');
  if(!animate||!menuIsOpen||statusDisplayReducedMotion()||Math.max(Math.abs(target-tokenMeterReveal),Math.abs(target-arrowFrom))<.001){finishTokenMeterAnimation(target);return;}
  tokenMeterAnimation.from=tokenMeterReveal;tokenMeterAnimation.to=target;tokenMeterAnimation.startedAt=Date.now();
  try {
    tokenMeterAnimation.timer=startTransientTimer(null,1/60,'tokenMeterAnimationTimer:');
    $.NSRunLoop.currentRunLoop.addTimerForMode(tokenMeterAnimation.timer,$.NSEventTrackingRunLoopMode);
  }catch(error){logError('token-disclosure-animation',error);finishTokenMeterAnimation(target);}
  redrawTokenMeterDisclosure();
}
function tokenMeterButtonPressed(sender){
  if(isExiting||!menuIsOpen||!sender||!tokenMeterDisclosureItem||!sender.enabled)return false;
  var item=menuRowItemForControl(sender);
  if(!item||!item.isEqual(tokenMeterDisclosureItem)||item.hidden||!item.enabled)return false;
  setTokenMeterExpanded(!tokenMeterExpanded,true);return true;
}

function refreshTokenMeterMenu(force) {
  if(!tokenMeterView)return;
  var traffic=typeof maomaoyunTrafficSnapshot==='undefined'?null:maomaoyunTrafficSnapshot;
  var history=typeof maomaoyunHistorySnapshot==='undefined'?null:maomaoyunHistorySnapshot;
  var key=[uiLanguage,usageActivityDays,tokenMeterSync,usageAccountId,
    tokenMeterSnapshot?tokenMeterSnapshot.savedAt:0,traffic?traffic.accountKey:'',traffic?traffic.credentialRevision:'',
    traffic?traffic.todayReportedAt:0,traffic?traffic.calendarReportedAt:0,traffic?traffic.reportedAt:0,history?history.fetchedAt:0,
    typeof maomaoyunTrafficSourceState==='undefined'?'':maomaoyunTrafficSourceState,Math.floor(Date.now()/60000)].join(':');
  if(!force&&refreshTokenMeterMenu.key===key)return;refreshTokenMeterMenu.key=key;
  var p=usageActivityPresentation();
  tokenMeterView.accessibilityLabel=uiText('Usage activity')+'. '+uiText(usageActivityDays===30?'Past 30 days':'Past 7 days')+'. '+uiText('Independent scales')+'. '+
    uiText(p.tokenCaption)+'. '+uiText(p.vpnCaption)+'. '+p.days.map(function(day){return day.date+': Token '+
      (day.tokens===null?'—':day.tokens)+(day.tokenStale?' '+uiText('Last count'):'')+'; '+uiText('VPN usage')+' '+
      vpnActivityAmount(day.bytes)+(day.vpnStale?' '+uiText('Last known'):'')+(day.today?' '+uiText('Today so far'):'');}).join('. ');
  updateTokenMeterDisclosureLabel();redrawTokenMeterDisclosure();
  if(typeof refreshTokenActivityHover==='function')refreshTokenActivityHover();
}
function addMeterPanelsMenu() {
  resetCardsMenuItems=[];
  menu.addItem(menuDividerItem());
  resetCardsHeaderItem=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('',null,'');
  // Reset cards get a section boundary; Token activity still follows directly.
  resetCardsHeaderItem.view=$.CodexUsageMeterResetHeaderView.alloc.initWithFrame($.NSMakeRect(0,0,MENU_WIDTH,22));
  resetCardsHeaderItem.view.accessibilityElement=true;resetCardsHeaderItem.view.accessibilityRole='AXStaticText';
  resetCardsHeaderItem.enabled=false;menu.addItem(resetCardsHeaderItem);updateResetCardsMenu();
  stopTokenMeterAnimation();tokenMeterExpanded=false;tokenMeterReveal=0;
  var button=$.CodexUsageMeterTokenDisclosureButton.alloc.initWithFrame($.NSMakeRect(0,0,MENU_WIDTH,24));
  button.setButtonType($.NSMomentaryChangeButton);configureMenuRowButton(button,uiText('Usage activity'));button.font=cardFont(12,'medium');
  button.sendActionOn($.NSEventMaskLeftMouseDown);button.target=delegate;button.action='tokenMeterButton:';
  tokenMeterDisclosureItem=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('',null,'');
  tokenMeterDisclosureItem.enabled=true;tokenMeterDisclosureItem.view=button;
  localizedMenuItem(tokenMeterDisclosureItem,'Usage activity');menu.addItem(tokenMeterDisclosureItem);
  tokenMeterItem=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('',null,'');tokenMeterItem.enabled=true;
  tokenMeterView=$.CodexUsageMeterUsageActivityView.alloc.initWithFrame($.NSMakeRect(0,0,MENU_WIDTH,tokenActivityChartLayout().height));
  configureTokenActivityTracking(tokenMeterView);
  tokenMeterView.accessibilityElement=true;tokenMeterView.accessibilityRole='AXGroup';
  tokenMeterItem.view=tokenMeterView;tokenMeterItem.hidden=true;menu.addItem(tokenMeterItem);
  addTokenActivityRangeButtons(tokenMeterView);
  refreshTokenMeterMenu(true);menu.addItem(menuDividerItem());
}
