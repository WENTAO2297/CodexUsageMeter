// Shared vertical rhythm for balances, estimates and supporting information.
// AppKit still owns the menu window, tracking and dismissal.
function dashboardMetricLayout(width,kind) {
  if(width<=200)return kind==='traffic'?{height:84,gap:8,inset:14,columnWidth:width-28,
    titleY:66,valueY:40,countdownY:42,barY:30,detailBaseline:12}:
    {height:64,gap:8,inset:14,columnWidth:width-28,titleY:46,valueY:20,countdownY:22,barY:10};
  return {stacked:true,ring:true,height:64,gap:8,inset:16,columnWidth:width-32,
    titleBaseline:50,valueBaseline:24,statusBaseline:5,
    titleSize:12,valueSize:21,ringSize:40,ringY:20,ringStroke:4};
}

function dashboardForecast(summary) {
  var row=compactForecastSummary(summary);
  var label='Estimated remaining',basis=row.note;
  if(/At reset/.test(row.note))label='Estimated at reset';
  if(/historical scenario/.test(row.note))basis='Historical scenario';
  if(/historical rough estimate/.test(row.note))basis='Historical rough estimate';
  if(/reported estimate/.test(row.note))basis='Website estimate';
  if(/recent pace/.test(row.note))basis='Recent pace estimate';
  var recent=/^In (.*?) · recent pace$/.exec(row.note);
  if(recent)label='In '+recent[1];
  // Unknown dates must not acquire an "at reset" label from a budget.
  if(row.outcome==='Reset unknown')label='Estimated remaining';
  if(row.value==='—') {
    var waiting={'Not enough data':'More history needed','History has gaps':'Observation gaps',
      'Not enough usage':'Need sustained usage','Observing again':'Usage trend changed',
      'Paused':'Awaiting fresh data','Reset unknown':'Reset date unavailable','Exhausted':'Waiting for reset'};
    basis=waiting[row.outcome]||basis;
  }
  if(row.value!=='—'||basis==='Historical rough estimate'||basis==='Website estimate')basis='';
  var outcomes={'May run out':recent?'Expected to run out soon':'Expected to run out early','May be tight':'Low reserve at reset',
    'May use it all':'Expected empty at reset'};
  var outcome=outcomes[row.outcome]||row.outcome;
  if(row.outcome==='May run out'&&typeof row.depletionLeadDays==='number'&&isFinite(row.depletionLeadDays)&&row.depletionLeadDays>0)
    outcome=trafficEarlyDepletionText(row.depletionLeadDays);
  return {label:label,value:row.value.replace(/^≈/,''),outcome:outcome,basis:basis,status:row.status};
}


function dashboardValueAttributes(size,color) {
  var attributes=cardAttributes(size,color,true).mutableCopy;
  attributes.setObjectForKey(statusQuotaFont(size),$('NSFont'));
  return attributes;
}

function drawDashboardValue(text,x,y,width,maxSize,color,align) {
  var value=typeof uiText==='function'?uiText(text):text;
  var size=/^[≈≤<\d—]/.test(value)?maxSize:Math.min(maxSize,align==='right'||align==='left'?14:12);
  var attrs=dashboardValueAttributes(size,color),styled=null;
  var smallerUnit=maxSize>11&&/^[\d.]+(?:–[\d.]+)?[%BKMGT]$/.test(value);
  function measureValue(){
    if(!smallerUnit)return Number($(value).sizeWithAttributes(attrs).width);
    // One native attributed line keeps the number and its smaller unit on the
    // same baseline. Measure that exact line before fitting it to the row.
    styled=$.NSMutableAttributedString.alloc.init;
    styled.mutableString.setString($(value));
    styled.setAttributesRange(attrs,$.NSMakeRange(0,value.length));
    styled.addAttributeValueRange($('NSFont'),cardFont(Math.max(10,Math.round(size*2/3)),false),$.NSMakeRange(value.length-1,1));
    return Number(styled.size.width);
  }
  var measured=measureValue();
  while(size>(maxSize<=11?8:11)&&measured>width){
    size--;attrs=dashboardValueAttributes(size,color);measured=measureValue();
  }
  var drawWidth=align==='right'||align==='center'?Math.min(width,Math.ceil(measured)):width;
  var drawX=align==='right'?x+width-drawWidth:align==='center'?x+(width-drawWidth)/2:x;
  var drawY=y;
  if(align==='right'&&size!==maxSize){
    var font=statusQuotaFont(size),reference=statusQuotaFont(maxSize);
    drawY+=Number(font.ascender)-Number(reference.ascender)+(Number(reference.capHeight)-Number(font.capHeight))/2;
  }else if(align==='left'&&size!==maxSize){
    // The two-line header shares a real baseline with the trailing deadline,
    // including a smaller unavailable/sign-in label or a long fitted balance.
    drawY+=Number(statusQuotaFont(size).ascender)-Number(statusQuotaFont(maxSize).ascender);
  }
  var rect=$.NSMakeRect(drawX,drawY,drawWidth,maxSize+5);
  if(styled)styled.drawInRect(rect);
  else $(value).drawInRectWithAttributes(rect,attrs);
  return {size:size,width:measured,x:drawX,y:drawY,drawWidth:drawWidth};
}

function dashboardOutcomeText(data,summary) {
  if(summary.outcome==='Projected surplus')
    return data.kind==='traffic'&&!data.stale&&summary.value!=='—'?'Expected remaining at reset':'';
  if(data.kind==='traffic') {
    if(summary.outcome==='Expected empty at reset')return 'Projected depletion at reset';
    if(summary.outcome==='Expected to run out early')return 'Projected early depletion';
  }
  return summary.outcome;
}

function drawMetricDashboard(data,width,offset) {
  return drawCompactMetric(data,width,offset);
}


function drawDashboardCenteredText(text,x,y,width,size,color,bold) {
  var measured=Number($(uiText(text)).sizeWithAttributes(cardAttributes(size,color,bold)).width);
  var textWidth=Math.min(width,Math.ceil(measured));
  drawCardText(text,x+(width-textWidth)/2,y,textWidth,size,color,bold);
}

function drawMeterStatusIcon(name,x,y,size,color,tone) {
  if(!name)return false;
  var cache=drawMeterStatusIcon.images||(drawMeterStatusIcon.images={}),key=name+':'+size+':'+tone;
  if(!cache[key]){
    var symbol=$.NSImage.imageWithSystemSymbolNameAccessibilityDescription(name,$());
    if(symbol)cache[key]=makeTintedIcon(symbol,color,size*2);
  }
  if(!cache[key])return false;
  cache[key].drawInRectFromRectOperationFractionRespectFlippedHints(
    $.NSMakeRect(x,y,size,size),$.NSZeroRect,$.NSCompositingOperationSourceOver,1,true,$());
  return true;
}

// NSString's drawing box includes ascender/descender whitespace. Align these
// small symbols to the localized glyphs, not to a fixed offset inside that box.
// Cache font geometry; menu redraws do not raster-scan images or create views.
function meterStatusIconY(symbol,text,y,textSize,bold,iconSize) {
  var value=uiText(text),font=cardFont(textSize,bold);
  var cache=meterStatusIconY.centers||(meterStatusIconY.centers={});
  var key=ObjC.unwrap(font.fontName)+':'+textSize+':'+value;
  if(cache[key]===undefined){
    var baseline=textSize+4-Number(font.ascender),center=baseline+Number(font.capHeight)/2;
    try {
      var bounds=$(value).boundingRectWithSizeOptionsAttributes($.NSMakeSize(1000,100),
        $.NSStringDrawingUsesDeviceMetrics,cardAttributes(textSize,cardColors().body,bold));
      var height=Number(bounds.size.height),origin=Number(bounds.origin.y);
      if(isFinite(origin)&&isFinite(height)&&height>0&&height<=textSize*2)
        center=baseline+origin+height/2;
    }catch(e){} // Keep a cap-height fallback if a system cannot supply ink bounds.
    cache[key]=center;
  }
  // The triangle's visible shape sits slightly below its square symbol canvas.
  var opticalLift=symbol==='exclamationmark.triangle.fill'?.25:0;
  return y+cache[key]-iconSize/2+opticalLift;
}

function drawMeterStatusText(text,x,y,width,size,color,bold,align,symbol,tone) {
  var icon=symbol===undefined?meterStatusSymbol(text):symbol,gap=icon?14:0;
  var measured=Number($(uiText(text)).sizeWithAttributes(cardAttributes(size,color,bold)).width);
  var contentWidth=Math.min(width,Math.ceil(measured)+gap);
  var left=align==='right'?x+width-contentWidth:align==='center'?x+(width-contentWidth)/2:x;
  if(icon)drawMeterStatusIcon(icon,left,meterStatusIconY(icon,text,y,size,bold,10),10,color,tone||text);
  drawCardText(text,left+gap,y,contentWidth-gap,size,color,bold);
}

function dashboardMetricBadge(data) {
  if(data.kind!=='traffic')return quotaPaceModel(data.window,Date.now()/1000,data.stale);
  var label=!data.hasValue?'No data':data.stale?'Last known':compactOutcomeText(data,dashboardForecast(data.summary));
  // Colors distinguish visible states only; a green reserve badge does not
  // change the forecast's evidence/confidence or turn it into a guarantee.
  return {label:label,tone:label==='Exhausted'?'critical':/^Est\. empty .* early$/.test(label)?'warning':label==='Reserve at reset'?'normal':'muted'};
}

function dashboardBadgeLayout(title,badge,width,titleSize) {
  var icon=meterStatusSymbol(badge.label),size=titleSize;
  var titleWidth=Number($(uiText(title)).sizeWithAttributes(cardAttributes(titleSize,cardColors().muted,true)).width);
  var available=width-titleWidth-8,measured,padding;
  do {
    // Keep leading/icon spacing only; the label ends at the data area's right edge.
    padding=icon?size+11:7;
    measured=Number($(uiText(badge.label)).sizeWithAttributes(cardAttributes(size,cardColors().muted,true)).width);
    if(measured+padding<=available||size<=7)break;
    size-=.5;
  }while(true);
  return {icon:icon,size:size,iconSize:size,width:measured+padding};
}

function dashboardTrafficInline(data,timeText,maxWidth) {
  var match=/^Used today: (.+)$/.exec(data.detail||''),raw=match?match[1]:'Awaiting report';
  var value=raw==='Awaiting report'?'Pending':raw,labelSize=9,valueSize=10,labelWidth,valueWidth,timeWidth,width;
  do {
    labelWidth=Math.ceil(Number($(uiText('Today')).sizeWithAttributes(cardAttributes(labelSize,cardColors().muted,false)).width));
    valueWidth=Math.ceil(Number($(uiText(value)).sizeWithAttributes(dashboardValueAttributes(valueSize,cardColors().body)).width));
    timeWidth=timeText?Math.ceil(Number($(timeText).sizeWithAttributes(cardAttributes(labelSize,cardColors().muted,false)).width)):0;
    width=labelWidth+4+valueWidth+(timeText?12+timeWidth:0);
    if(width<=maxWidth||labelSize<=7.5)break;
    labelSize-=.5;valueSize-=.5;
  }while(true);
  return {value:value,pending:value==='Pending',labelSize:labelSize,valueSize:valueSize,
    labelWidth:labelWidth,valueWidth:valueWidth,timeWidth:timeWidth,timeText:timeText,width:width};
}

function drawTrafficInline(detail,x,baseline,width,spread) {
  var colors=cardColors(),left=spread?x:x+width-detail.width;
  var labelY=baseline-(detail.labelSize+4-Number(cardFont(detail.labelSize,false).ascender));
  var valueY=baseline-(detail.valueSize+5-Number(statusQuotaFont(detail.valueSize).ascender));
  drawCardText('Today',left,labelY,detail.labelWidth,detail.labelSize,colors.muted,false);
  var valueX=spread?x+width-detail.valueWidth:left+detail.labelWidth+4;
  drawDashboardValue(detail.value,valueX,valueY,detail.valueWidth,detail.valueSize,detail.pending?colors.muted:colors.body,'right');
  if(detail.timeText)drawCardText(detail.timeText,x+width-detail.timeWidth,labelY,detail.timeWidth,detail.labelSize,colors.muted,false);
}

// Static remaining-capacity gauges share one native path with no extra timer.
// Missing readings retain an empty track; stale readings keep their true arc.
function drawDashboardRing(x,y,size,fraction,color,hasValue,stale) {
  var stroke=4,radius=(size-stroke)/2,colors=cardColors();
  var bounded=typeof fraction==='number'&&isFinite(fraction)?Math.max(0,Math.min(1,fraction)):0;
  var track=$.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(x+stroke/2,y+stroke/2,size-stroke,size-stroke));
  track.lineWidth=stroke;sendVoid(colors.track,'setStroke');sendVoid(track,'stroke');
  if(hasValue&&bounded>0){
    var arc;
    if(bounded===1)arc=$.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(x+stroke/2,y+stroke/2,size-stroke,size-stroke));
    else {
      arc=$.NSBezierPath.bezierPath;
      arc.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise(
        $.NSMakePoint(x+size/2,y+size/2),radius,90,90-bounded*360,true);
    }
    arc.lineWidth=stroke;arc.lineCapStyle=$.NSRoundLineCapStyle;
    sendVoid(stale?colors.muted:color,'setStroke');sendVoid(arc,'stroke');
  }
  return {x:x,y:y,size:size,fraction:hasValue?bounded:null,stale:!!stale};
}

function drawRingMetric(data,width,offset,g) {
  var colors=cardColors(),traffic=data.kind==='traffic',x=g.inset,w=g.columnWidth;
  var title=traffic?'VPN Traffic':data.title==='Weekly'?'Codex Weekly':
    data.title==='Session'?'Codex Session':data.title==='Quota'?'Codex Quota':data.title;
  var badge=dashboardMetricBadge(data),icon=meterStatusSymbol(badge.label),statusSize=g.titleSize;
  var tone=badge.tone,shade=tone==='critical'?colors.percentageCritical:tone==='warning'?colors.percentageWarning:
    tone==='normal'?activeAccentColor(1):colors.muted;
  var titleY=g.titleBaseline-(g.titleSize+4-Number(cardFont(g.titleSize,true).ascender));
  var valueY=g.valueBaseline-(g.valueSize+5-Number(statusQuotaFont(g.valueSize).ascender));
  var mainWidth=w-g.ringSize-16;
  drawCardText(title,x,offset+titleY,mainWidth,g.titleSize,colors.muted,true);
  drawDashboardValue(data.value,x,offset+valueY,mainWidth,g.valueSize,data.valueColor,'left');
  drawDashboardRing(x+w-g.ringSize,offset+g.ringY,g.ringSize,data.fraction,data.valueColor,data.hasValue,data.stale);

  var reset=data.footerParts||{},countdown=traffic?(data.resetDays>0?data.resetDays+'d':''):reset.countdown;
  var timeText=/^\d+[dmh]/.test(countdown||'')?uiText('Resets in '+countdown):uiText(countdown||'');
  if(!countdown&&!traffic)timeText=uiText('Reset time unavailable');
  if(data.stale||!data.hasValue)timeText=''; // State below already identifies old/missing readings.
  var metaSize=10,timeWidth=Number($(timeText).sizeWithAttributes(cardAttributes(metaSize,colors.muted,false)).width);
  while(metaSize>8.5&&timeWidth>w*.48){
    metaSize-=.5;timeWidth=Number($(timeText).sizeWithAttributes(cardAttributes(metaSize,colors.muted,false)).width);
  }
  if(timeText){
    var timeY=g.statusBaseline-(metaSize+4-Number(cardFont(metaSize,false).ascender));
    drawCardText(timeText,x+w-timeWidth,offset+timeY,timeWidth,metaSize,colors.muted,false);
  }
  // Share the bottom row: status left, reset right. Reserve the actual localized
  // deadline width so neither side can paint over the other.
  var statusWidth=w-(timeText?timeWidth+12:0);
  var textWidth=Number($(uiText(badge.label)).sizeWithAttributes(cardAttributes(statusSize,shade,true)).width);
  while(statusSize>9&&textWidth+(icon?statusSize+6:0)>statusWidth){
    statusSize-=.5;textWidth=Number($(uiText(badge.label)).sizeWithAttributes(cardAttributes(statusSize,shade,true)).width);
  }
  var statusY=offset+g.statusBaseline-(statusSize+4-Number(cardFont(statusSize,true).ascender));
  if(icon)drawMeterStatusIcon(icon,x,meterStatusIconY(icon,badge.label,statusY,statusSize,true,statusSize),statusSize,shade,tone);
  drawCardText(badge.label,x+(icon?statusSize+6:0),statusY,statusWidth-(icon?statusSize+6:0),statusSize,shade,true);
}

function drawCompactMetric(data,width,offset) {
  var g=dashboardMetricLayout(width,data.kind);
  if(g.ring)return drawRingMetric(data,width,offset,g);
  var colors=cardColors(),traffic=data.kind==='traffic';
  var x=g.inset,w=g.columnWidth;
  var title=traffic?(g.stacked?'VPN Traffic':'Traffic'):data.title==='Weekly'?'Codex Weekly':data.title==='Session'?'Codex Session':data.title==='Quota'?'Codex Quota':data.title;
  var reset=data.footerParts||{},countdown=traffic?(data.resetDays>0?data.resetDays+'d':''):reset.countdown;
  if(!data.hasValue)countdown='No data';
  else if(data.stale)countdown='Last known';
  var timeText=/^\d+[dmh]/.test(countdown||'')?uiText('Resets in '+countdown):uiText(countdown||'');
  var badge=dashboardMetricBadge(data),titleSize=g.stacked?g.titleSize:10.5;
  var badgeLayout=dashboardBadgeLayout(title,badge,w,titleSize);
  var headerSize=titleSize;
  if(!g.stacked)while(titleSize>7.5&&Number($(uiText(title)).sizeWithAttributes(cardAttributes(titleSize,colors.muted,true)).width)>w-badgeLayout.width-8)titleSize-=.5;
  var titleY=g.stacked?g.titleBaseline-(titleSize+4-Number(cardFont(titleSize,true).ascender)):g.titleY;
  if(!g.stacked)titleY+=headerSize-titleSize;
  var badgeColor=badge.tone==='critical'?colors.percentageCritical:badge.tone==='warning'?colors.percentageWarning:
    badge.tone==='normal'?activeAccentColor(1):colors.muted;
  // A half-point optical drop keeps the trailing, saturated status group from
  // appearing raised next to the muted mixed Latin/CJK title. Move text and
  // symbol together; preserve the title, balances, font sizes and row height.
  var badgeY=offset+titleY+titleSize-badgeLayout.size+
    Number(cardFont(badgeLayout.size,true).ascender)-Number(cardFont(titleSize,true).ascender)-.5;
  var badgeTextOffset=badgeLayout.icon?badgeLayout.iconSize+11:7;
  drawCardText(title,x,offset+titleY,w-badgeLayout.width-8,titleSize,colors.muted,true);
  if(badgeLayout.icon)drawMeterStatusIcon(badgeLayout.icon,x+w-badgeLayout.width+7,
    meterStatusIconY(badgeLayout.icon,badge.label,badgeY,badgeLayout.size,true,badgeLayout.iconSize),badgeLayout.iconSize,badgeColor,badge.tone);
  drawCardText(badge.label,x+w-badgeLayout.width+badgeTextOffset,badgeY,
    badgeLayout.width-badgeTextOffset,badgeLayout.size,badgeColor,true);
  if(g.stacked){
    var valueY=g.valueBaseline-(g.valueSize+5-Number(statusQuotaFont(g.valueSize).ascender));
    var timeWidth=countdown?Math.min(w*.45,Math.ceil(Number($(timeText).sizeWithAttributes(cardAttributes(9,colors.muted,false)).width))):0;
    var inline=traffic?dashboardTrafficInline(data,countdown?timeText:'',w*.6):null;
    var detailWidth=inline?inline.width:timeWidth;
    drawDashboardValue(data.value,x,offset+valueY,w-(detailWidth?detailWidth+12:0),g.valueSize,data.valueColor,'left');
    if(inline)drawTrafficInline(inline,x,offset+g.valueBaseline,w,false);
    else if(countdown){
      // Title alone above; balance and deadline below. Reserve the deadline
      // before fitting the balance so neither locale can overlap the other.
      var timeY=g.valueBaseline-(13-Number(cardFont(9,false).ascender));
      drawCardText(timeText,x+w-timeWidth,offset+timeY,timeWidth,9,colors.muted,false);
    }
  }else{
    drawDashboardValue(data.value,x,offset+g.valueY,traffic?99:78,traffic?18:21,data.valueColor);
    if(countdown&&Number($(timeText).sizeWithAttributes(cardAttributes(8,colors.muted,false)).width)<=(traffic?49:70))
      drawCardTextRight(timeText,x+w,offset+g.countdownY,8,colors.muted,false);
    else if(countdown&&Number($(uiText(countdown)).sizeWithAttributes(cardAttributes(8,colors.muted,false)).width)<=(traffic?49:70))
      drawCardTextRight(uiText(countdown),x+w,offset+g.countdownY,8,colors.muted,false);
  }
  // A failed refresh does not erase a validated balance. Keep its progress
  // muted and explicitly marked; no prior balance gets an empty track only.
  // Detailed errors/timestamps remain in accessibility, never a hover popup.
  var paceFill=g.stacked&&!traffic&&badge.tone==='critical'?colors.critical:
    g.stacked&&!traffic&&badge.tone==='warning'?colors.warning:null;
  drawRoundedBar(x,offset+g.barY,w,g.barHeight||5,data.hasValue?data.fraction:0,data.stale?colors.muted:paceFill);
  if(traffic&&!g.stacked)drawTrafficInline(dashboardTrafficInline(data,'',w),x,offset+g.detailBaseline,w,true);
}

function compactOutcomeText(data,summary) {
  var text=dashboardOutcomeText(data,summary);
  if(summary.value==='—'&&summary.basis&&/^(Not enough data|History has gaps|Not enough usage|Observing again|Reset unknown)$/.test(summary.outcome))text=summary.basis;
  return compactOutcomeLabel(text);
}

function compactOutcomeLabel(outcome) {
  var early=/^Estimated empty (<1|\d+)d before reset$/.exec(outcome||'');
  if(early)return 'Est. empty '+early[1]+'d early';
  return {'Expected to run out early':'Before reset','Expected to run out soon':'Soon',
    'Projected early depletion':'Before reset','Expected empty at reset':'At reset depletion',
    'Projected depletion at reset':'At reset depletion','Expected remaining at reset':'Reserve at reset',
    'Projected surplus':'Reserve at reset','Low reserve at reset':'Low reserve',
    'More history needed':'Observing','Observation gaps':'History gaps',
    'Need sustained usage':'Observing','Usage trend changed':'Observing',
    'Short-term estimate':'Near term',
    'Awaiting fresh data':'Paused','Reset date unavailable':'Reset unknown'}[outcome]||outcome||'Reserve at reset';
}
