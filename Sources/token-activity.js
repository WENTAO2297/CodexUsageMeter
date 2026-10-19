// One 7/30-date chart: Token bars and VPN line use independent zero-based
// linear axes. Only display models meet here; source readers stay independent.
function usageActivityModel(token,vpn) {
  var counts={};
  if(token.model)token.model.days.forEach(function(day){counts[day.date]=day.tokens;});
  var days=vpn.days.map(function(day){
    var value=Object.prototype.hasOwnProperty.call(counts,day.date)&&meterCount(counts[day.date])?counts[day.date]:null;
    return {date:day.date,today:day.today,tokens:value,bytes:day.bytes,
      tokenStale:value!==null&&token.stale,vpnStale:day.bytes!==null&&day.stale};
  });
  return {days:days,tokenCaption:token.caption,vpnCaption:vpn.caption,
    stale:days.some(function(day){return day.tokenStale||day.vpnStale;}),
    hasData:days.some(function(day){return day.tokens!==null||day.bytes!==null;})};
}
function usageActivityPresentation(){return usageActivityModel(tokenMeterPresentation(),vpnActivityPresentation(usageActivityDays));}
function tokenActivityChartLayout(){return {height:160,left:44,right:MENU_WIDTH-44,bottom:30,top:120};}
function usageActivityRangeRect(){return {x:MENU_WIDTH-92,y:137,width:76,height:20};}
function usageActivityRangeThumbRect(position){
  var rect=usageActivityRangeRect(),half=rect.width/2;
  return {x:rect.x+1+half*Math.max(0,Math.min(1,position)),y:rect.y+1,width:half-2,height:rect.height-2};
}
function usageActivityCeiling(value) {
  if(!(value>0))return 0;
  var power=Math.pow(10,Math.floor(Math.log(value)/Math.LN10)),fraction=value/power;
  return (fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*power;
}
function usageActivityTokenText(value) {
  // Axis ceilings may exceed the largest safe observed count. They are scale
  // labels, not new measurements; keep huge labels compact without clipping.
  if(value>=1e12)return (value/1e12).toFixed(value<1e14?1:0).replace(/\.0$/,'')+'T';
  if(value<10000)return String(value);
  if(uiLanguage!=='zh-CN')return compactTokenCount(value);
  var scale=value>=1e8?1e8:1e4,number=value/scale,digits=number>=100?0:number>=10?1:2;
  number=Number(number.toFixed(digits));
  if(scale===1e4&&number>=10000){number/=10000;scale=1e8;}
  return number+(scale===1e8?'亿':'万');
}
function usageActivityColumns(model,width) {
  var count=model.days.length,left=44,right=width-44,slot=(right-left)/Math.max(1,count),maxTokens=0,maxBytes=0;
  var ticks={};
  for(var t=0;t<Math.min(6,count);t++)ticks[Math.round(t*(count-1)/Math.max(1,Math.min(6,count)-1))]=true;
  model.days.forEach(function(day){maxTokens=Math.max(maxTokens,day.tokens||0);maxBytes=Math.max(maxBytes,day.bytes||0);});
  var tokenMax=usageActivityCeiling(maxTokens),unit=maxBytes>0?Math.min(4,Math.max(0,Math.floor(Math.log(maxBytes)/Math.log(1024)))):3;
  var byteUnit=Math.pow(1024,unit),vpnMax=usageActivityCeiling(maxBytes/byteUnit)*byteUnit;
  return {tokenMax:tokenMax,vpnMax:vpnMax,hasTokens:model.days.some(function(d){return d.tokens!==null;}),
    hasVPN:model.days.some(function(d){return d.bytes!==null;}),cells:model.days.map(function(day,index){
      var center=left+(index+.5)*slot,barWidth=Math.min(16,slot*.55);
      return {day:day,count:count,center:center,slotLeft:left+index*slot,slotWidth:slot,x:center-barWidth/2,y:30,width:barWidth,
        tokenHeight:day.tokens===null?0:day.tokens===0?2:90*day.tokens/tokenMax,
        vpnY:day.bytes===null?null:30+(vpnMax?90*day.bytes/vpnMax:0),labelWidth:count>7?30:slot-2,
        dateLabel:count<=7||!!ticks[index]};
    })};
}
function usageActivityDateProgress(index,reveal,count) {
  // Both series share each date's start, easing and finish. Either range
  // fills the same 500ms clock; no second animation can drift ahead.
  var t=Math.max(0,Math.min(1,reveal*(count||7)-index));
  return t*t*(3-2*t);
}
function usageActivityColumnFrame(cell,index,reveal) {
  var alpha=usageActivityDateProgress(index,reveal,cell.count);
  return {day:cell.day,x:cell.x,y:cell.y,width:cell.width,height:cell.tokenHeight*alpha,
    center:cell.center,vpnY:cell.vpnY,slotLeft:cell.slotLeft,slotWidth:cell.slotWidth,labelWidth:cell.labelWidth,dateLabel:cell.dateLabel,opacity:alpha};
}
function usageActivityLineNodeFrame(cells,index,reveal) {
  var cell=cells[index],p=usageActivityDateProgress(index,reveal,cells.length);
  if(cell.vpnY===null||p<=0)return null;
  var previous=index?cells[index-1]:null,connected=previous&&previous.vpnY!==null;
  return {x:connected?previous.center+(cell.center-previous.center)*p:cell.center,
    y:connected?previous.vpnY+(cell.vpnY-previous.vpnY)*p:cell.vpnY,
    opacity:connected?1:p,progress:p,stale:cell.day.vpnStale||!!(connected&&p<1&&previous.day.vpnStale)};
}
function usageActivityLineSegments(cells,reveal) {
  var segments=[];
  cells.forEach(function(cell,index){
    if(!index||cell.vpnY===null||cells[index-1].vpnY===null)return;
    var previous=cells[index-1],p=usageActivityDateProgress(index,reveal,cells.length);
    if(p>0)segments.push({from:index-1,to:index,x1:previous.center,y1:previous.vpnY,
      x2:previous.center+(cell.center-previous.center)*p,y2:previous.vpnY+(cell.vpnY-previous.vpnY)*p,
      opacity:1,progress:p,stale:previous.day.vpnStale||cell.day.vpnStale});
  });
  return segments;
}
function drawUsageActivityFitted(text,x,y,width,size,color,align,bold) {
  while(size>6.5&&Number($(String(text)).sizeWithAttributes(cardAttributes(size,color,bold)).width)>width)size-=.5;
  if(align==='right')drawCardTextRight(text,x+width,y,size,color,bold);
  else if(align==='center')drawDashboardCenteredText(text,x,y,width,size,color,bold);
  else drawCardText(text,x,y,width,size,color,bold);
}
function drawUsageActivity(model,reveal,hover) {
  // Establish the chart's context during the first date, while data keeps its
  // slower shared timeline. Labels need not stay dim for a full second.
  var opacity=1-Math.pow(1-Math.max(0,Math.min(1,reveal*7)),3);if(opacity<=0)return;
  // Reuse the reset-card track's exact blue and the prediction badge's green.
  // Only animation or stale state changes opacity, not the settled palette.
  var colors=cardColors(),blue=colors.blue,green=activeAccentColor(1),layout=usageActivityColumns(model,MENU_WIDTH);
  var oldToken=model.days.some(function(day){return day.tokenStale;}),oldVPN=model.days.some(function(day){return day.vpnStale;});
  var tokenColor=oldToken?colors.muted:blue,vpnColor=oldVPN?colors.muted:green;
  if(!hover){
    sendVoid(tokenColor.colorWithAlphaComponent(opacity),'setFill');
    sendVoid($.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(16,144,6,6),1,1),'fill');
    var tokenWidth=Number($('Token').sizeWithAttributes(cardAttributes(10,colors.muted,'medium')).width);
    drawCardText('Token',27,140,tokenWidth,10,colors.muted.colorWithAlphaComponent(opacity),'medium');
    if(oldToken)drawMeterStatusIcon('clock',60,142,9,colors.muted.colorWithAlphaComponent(opacity),'muted');
    var vpnX=96,vpnSize=10,maxWidth=usageActivityRangeRect().x-vpnX-10-(oldVPN?13:0);
    while(vpnSize>8&&Number($(uiText('VPN usage')).sizeWithAttributes(cardAttributes(vpnSize,colors.muted,'medium')).width)>maxWidth)vpnSize-=.5;
    var vpnWidth=Number($(uiText('VPN usage')).sizeWithAttributes(cardAttributes(vpnSize,colors.muted,'medium')).width);
    drawCardText('VPN usage',vpnX,140,vpnWidth,vpnSize,colors.muted.colorWithAlphaComponent(opacity),'medium');
    var legend=$.NSBezierPath.bezierPath;legend.moveToPoint($.NSMakePoint(vpnX-20,147));legend.lineToPoint($.NSMakePoint(vpnX-6,147));legend.lineWidth=1.75;
    sendVoid(vpnColor.colorWithAlphaComponent(opacity),'setStroke');sendVoid(legend,'stroke');
    sendVoid(vpnColor.colorWithAlphaComponent(opacity),'setFill');sendVoid($.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(vpnX-15,145,4,4)),'fill');
    if(oldVPN)drawMeterStatusIcon('clock',vpnX+vpnWidth+4,142,9,colors.muted.colorWithAlphaComponent(opacity),'muted');
  }
  [0,.5,1].forEach(function(fraction){
    var y=30+90*fraction,path=$.NSBezierPath.bezierPath;path.moveToPoint($.NSMakePoint(44,y));path.lineToPoint($.NSMakePoint(MENU_WIDTH-44,y));path.lineWidth=.5;
    sendVoid(colors.track.colorWithAlphaComponent(opacity*(fraction===0?.65:.3)),'setStroke');sendVoid(path,'stroke');
    drawUsageActivityFitted(layout.hasTokens?usageActivityTokenText(layout.tokenMax*fraction):'—',16,y-5,26,8,tokenColor.colorWithAlphaComponent(opacity),'right');
    drawUsageActivityFitted(layout.hasVPN?vpnActivityAmount(layout.vpnMax*fraction):'—',MENU_WIDTH-42,y-5,26,8,vpnColor.colorWithAlphaComponent(opacity),'left');
  });
  layout.cells.forEach(function(base,index){
    var cell=usageActivityColumnFrame(base,index,reveal),day=cell.day;
    if(cell.height>0){
      sendVoid((day.tokenStale?colors.muted:blue).colorWithAlphaComponent(cell.opacity*(day.tokenStale?.4:1)),'setFill');
      var radius=Math.min(2,cell.width/2,cell.height/2);
      sendVoid($.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(cell.x,cell.y,cell.width,cell.height),radius,radius),'fill');
    }
    if(model.days.length<=7&&cell.opacity>0&&day.tokens===null&&day.bytes===null&&model.hasData)
      drawDashboardCenteredText('—',cell.slotLeft+1,37,cell.labelWidth,8,colors.muted.colorWithAlphaComponent(cell.opacity),false);
    var parts=day.date.split('-');
    var selected=hover&&hover.index===index;
    // Thirty daily measurements stay independent. Only axis labels are sparse;
    // a hovered non-tick date replaces nearby labels, never overlaps them.
    var showDate=model.days.length<=7||selected||cell.dateLabel&&(!hover||Math.abs(cell.center-layout.cells[hover.index].center)>=cell.labelWidth+2);
    if(!showDate)return;
    var dateX=cell.center-cell.labelWidth/2;
    if(selected){
      sendVoid($.NSColor.whiteColor.colorWithAlphaComponent(.08),'setFill');
      sendVoid($.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(dateX-1,4,cell.labelWidth+2,16),4,4),'fill');
    }
    drawUsageActivityFitted(Number(parts[1])+'/'+Number(parts[2]),dateX,6,cell.labelWidth,8,
      (day.today||selected?colors.body:colors.muted).colorWithAlphaComponent(opacity),'center',day.today||selected);
  });
  if(!model.hasData)drawDashboardCenteredText('No data',44,73,MENU_WIDTH-88,10,colors.muted.colorWithAlphaComponent(opacity),false);
  usageActivityLineSegments(layout.cells,reveal).forEach(function(segment){
    var line=$.NSBezierPath.bezierPath;line.moveToPoint($.NSMakePoint(segment.x1,segment.y1));line.lineToPoint($.NSMakePoint(segment.x2,segment.y2));line.lineWidth=model.days.length>7?1.25:1.75;line.lineCapStyle=$.NSRoundLineCapStyle;
    sendVoid((segment.stale?colors.muted:green).colorWithAlphaComponent(segment.opacity*(segment.stale?.6:1)),'setStroke');sendVoid(line,'stroke');
  });
  layout.cells.forEach(function(cell,index){
    var node=usageActivityLineNodeFrame(layout.cells,index,reveal);if(!node)return;
    sendVoid((node.stale?colors.muted:green).colorWithAlphaComponent(node.opacity),'setFill');
    var radius=model.days.length>7?1.5:2.5;
    sendVoid($.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(node.x-radius,node.y-radius,radius*2,radius*2)),'fill');
  });
}
function tokenActivityHoverText(cell) {
  var parts=cell.day.date.split('-'),month=Number(parts[1]),day=Number(parts[2]);
  var date=uiLanguage==='zh-CN'?month+'月'+day+'日':
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]+' '+day;
  var day=cell.day;
  return date+'\nToken '+(day.tokens===null?'—':meterTokenText(day.tokens))+(day.tokenStale?' · '+uiText('Last count'):'')+
    '\n'+uiText('VPN usage')+' '+vpnActivityAmount(day.bytes)+(day.vpnStale?' · '+uiText('Last known'):'');
}
function tokenActivityHitCell(model,point,reveal) {
  if(!point||point.y<27||point.y>134)return null;
  var cells=usageActivityColumns(model,MENU_WIDTH).cells;
  for(var i=0;i<cells.length;i++){
    var c=usageActivityColumnFrame(cells[i],i,reveal);
    var node=usageActivityLineNodeFrame(cells,i,reveal);
    if(!(c.day.tokens!==null&&c.opacity>0)&&!(node&&node.opacity>0&&node.x>=c.slotLeft))continue;
    if(point.x>=c.slotLeft&&point.x<c.slotLeft+c.slotWidth)return {index:i,cell:c};
  }
  return null;
}
function tokenActivityPointerLocation(view) {
  var rect=menuTrackingViewRect(view);if(!rect)return null;
  var point=menuTrackingMouseState().point;
  return {x:point.x-rect.origin.x,y:point.y-rect.origin.y};
}
function invalidateTokenActivityHover(view){
  // Native child buttons must hide outside drawRect, so they cannot paint on
  // top of the readout. Invalidating the transparent parent clears old labels.
  if(typeof updateTokenActivityRangeButtons==='function')updateTokenActivityRangeButtons();
  invalidateMenuRowHighlight(view);
}
function clearTokenActivityHover(expected) {
  if(arguments.length&&tokenActivityHover!==expected)return;
  var previous=tokenActivityHover;tokenActivityHover=null;
  if(previous)invalidateTokenActivityHover(previous.view);
}
function refreshTokenActivityHover(view,point) {
  var previous=tokenActivityHover;
  if(isExiting||!menuIsOpen||!tokenMeterExpanded||tokenMeterReveal<=0||!tokenMeterView||!tokenMeterItem||tokenMeterItem.hidden){
    clearTokenActivityHover(previous);return;
  }
  try {
    if(view&&!view.isEqual(tokenMeterView))return;
    var target=tokenMeterView,snapshot=tokenMeterSnapshot,account=usageAccountId,language=uiLanguage,range=usageActivityDays,
      traffic=maomaoyunTrafficSnapshot,history=maomaoyunHistorySnapshot,source=maomaoyunTrafficSourceState,p=usageActivityPresentation();
    var at=point||tokenActivityPointerLocation(target),hit=tokenActivityHitCell(p,at,tokenMeterReveal);
    // Native geometry getters can dispatch newer menu events. Do not restore
    // an old cell after those events have closed/rebuilt the menu.
    if(tokenActivityHover!==previous||target!==tokenMeterView||!menuIsOpen||!tokenMeterExpanded||isExiting||
        snapshot!==tokenMeterSnapshot||account!==usageAccountId||language!==uiLanguage||range!==usageActivityDays||
        traffic!==maomaoyunTrafficSnapshot||history!==maomaoyunHistorySnapshot||source!==maomaoyunTrafficSourceState)return;
    if(!hit){clearTokenActivityHover(previous);return;}
    var text=tokenActivityHoverText(hit.cell),day=hit.cell.day;
    var key=[usageAccountId,uiLanguage,range,hit.index,day.date,day.tokens,day.bytes,day.tokenStale,day.vpnStale,hit.cell.height,hit.cell.vpnY].join(':');
    if(previous&&previous.key===key&&previous.view===target)return;
    tokenActivityHover={view:target,index:hit.index,cell:hit.cell,text:text,key:key};
    if(previous&&previous.view!==target)invalidateTokenActivityHover(previous.view);
    invalidateTokenActivityHover(target);
  }catch(error){clearTokenActivityHover(previous);noteMenuViewFailure('activity-hover',error);}
}
function configureTokenActivityTracking(view) {
  view.addTrackingArea($.NSTrackingArea.alloc.initWithRectOptionsOwnerUserInfo(
    $.NSMakeRect(0,0,0,0),$.NSTrackingMouseEnteredAndExited|$.NSTrackingMouseMoved|
      $.NSTrackingActiveAlways|$.NSTrackingInVisibleRect,view,$()));
}
function tokenActivityHintRect() {
  // Same center as the 20pt switch, with 2pt above/below: the 24pt readout
  // fully replaces the toolbar and clears the top axis labels by 8pt.
  var range=usageActivityRangeRect();
  return {x:16,y:range.y-2,width:MENU_WIDTH-32,height:range.height+4};
}
function tokenActivityDetailPositions(widths,rect){
  rect=rect||tokenActivityHintRect();
  var total=widths.reduce(function(sum,width){return sum+width;},0);
  var gap=(rect.width-24-total)/(widths.length-1),x=rect.x+12;
  return widths.map(function(width){var position={x:x,width:width};x+=width+gap;return position;});
}
function tokenActivityDetailMetrics(text,size){
  var font=cardFont(size,'medium'),value=uiText(String(text));
  var cache=tokenActivityDetailMetrics.cache||(tokenActivityDetailMetrics.cache={keys:[],values:{}});
  var key=ObjC.unwrap(font.fontName)+':'+size+':'+value;
  if(cache.values[key])return cache.values[key];
  var attributes=cardAttributes(size,cardColors().body,'medium'),string=$(value);
  var advance=Number(string.sizeWithAttributes(attributes).width),metrics={advance:advance,left:0,width:advance};
  try{
    var ink=string.boundingRectWithSizeOptionsAttributes($.NSMakeSize(1000,100),$.NSStringDrawingUsesDeviceMetrics,attributes);
    var left=Number(ink.origin.x),width=Number(ink.size.width);
    if(isFinite(left)&&isFinite(width)&&width>0&&Math.abs(left)<size&&width<=advance+size){metrics.left=left;metrics.width=width;}
  }catch(error){} // Keep advance-width centering if device metrics are unavailable.
  if(cache.keys.length>=96)delete cache.values[cache.keys.shift()];
  cache.keys.push(key);cache.values[key]=metrics;return metrics;
}
function tokenActivityDetailLayout(details,rect){
  rect=rect||tokenActivityHintRect();var size=10,metrics,widths,total;
  while(true){
    metrics=details.map(function(detail){return tokenActivityDetailMetrics(detail.text,size);});
    widths=metrics.map(function(metric,index){return metric.width+(details[index].stale?14:0);});
    total=widths.reduce(function(sum,width){return sum+width;},0);
    if(size<=7.5||total+24<=rect.width-24)break;
    size-=.5;
  }
  return tokenActivityDetailPositions(widths,rect).map(function(position,index){
    position.size=size;position.metrics=metrics[index];return position;
  });
}
function drawTokenActivityDetail(text,position,color,stale,rect){
  var size=position.size,metrics=position.metrics,gap=stale?14:0;
  // Distribute the gaps between visible groups, not equal-width text boxes.
  // Device metrics exclude SF/PingFang side bearings; stale clocks belong to
  // their value's group and do not silently consume one of the equal gaps.
  rect=rect||tokenActivityHintRect();
  var font=cardFont(size,'medium'),centerY=rect.y+rect.height/2;
  var y=centerY-(size+4)+Number(font.ascender)-Number(font.capHeight)/2;
  var left=position.x;
  if(stale)drawMeterStatusIcon('clock',left,meterStatusIconY('clock',text,y,size,'medium',10),10,color,'muted');
  drawCardText(text,left+gap-metrics.left,y,Math.ceil(metrics.advance),size,color,'medium');
}
function tokenActivityHoverForModel(view,model) {
  var hover=tokenActivityHover;
  if(!view||!hover||!hover.view.isEqual(view)||tokenActivityHover!==hover||!menuIsOpen||!tokenMeterExpanded||isExiting)return null;
  var day=model&&model.days[hover.index];
  if(!day||day.date!==hover.cell.day.date||day.tokens!==hover.cell.day.tokens||day.bytes!==hover.cell.day.bytes||
    day.tokenStale!==hover.cell.day.tokenStale||day.vpnStale!==hover.cell.day.vpnStale)return null;
  return tokenActivityHover===hover?hover:null;
}
function drawTokenActivityGuide(hover){
  var guide=$.NSBezierPath.bezierPath;guide.moveToPoint($.NSMakePoint(hover.cell.center,30));guide.lineToPoint($.NSMakePoint(hover.cell.center,120));guide.lineWidth=.5;
  sendVoid(cardColors().muted.colorWithAlphaComponent(.3),'setStroke');sendVoid(guide,'stroke');
}
function drawTokenActivityHint(view,model,expected,rect) {
  var hover=tokenActivityHoverForModel(view,model);
  if(!hover||arguments.length>2&&hover!==expected)return;
  var colors=cardColors(),day=model.days[hover.index];
  var r=rect||tokenActivityHintRect(),path=$.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(
    $.NSMakeRect(r.x,r.y,r.width,r.height),r.height/2,r.height/2);
  sendVoid($.NSColor.whiteColor.colorWithAlphaComponent(.10),'setFill');sendVoid(path,'fill');
  path.lineWidth=.5;sendVoid($.NSColor.whiteColor.colorWithAlphaComponent(.09),'setStroke');sendVoid(path,'stroke');
  var token='Token '+(day.tokens===null?'—':meterTokenText(day.tokens));
  var vpn='VPN '+vpnActivityAmount(day.bytes);
  var details=[{text:hover.text.split('\n')[0],color:colors.body,stale:false},
    {text:token,color:day.tokenStale?colors.muted:colors.blue,stale:day.tokenStale},
    {text:vpn,color:day.vpnStale?colors.muted:activeAccentColor(1),stale:day.vpnStale}];
  var positions=tokenActivityDetailLayout(details,r);
  details.forEach(function(detail,index){drawTokenActivityDetail(detail.text,positions[index],detail.color,detail.stale,r);});
  return r;
}
