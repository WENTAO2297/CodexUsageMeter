// Top connection controls; visual preview never issues VPN commands.
// The VPN control is a secondary utility, so give it a quieter custom row
// The client name owns the real connection dot; the adjacent view owns only
// the switch so the two controls have independent hit/accessibility regions.
function drawMaoMaoYunStatusDot(bounds,x) {
  var dotColor=cardColors().muted,dotDiameter=6;
  var transitioning=maomaoyunStatus==='connecting'||maomaoyunStatus==='disconnecting';
  if(maomaoyunStatus==='connected')dotColor=activeAccentColor(1);
  else if(transitioning){
    var phase=(Date.now()%900)/900,pulse=(Math.sin(phase*Math.PI*2)+1)/2;
    dotDiameter=5.2+pulse*1.6;
    dotColor=cardColor(.96,.68,.25,.58+pulse*.42);
  }else if(maomaoyunStatus==='error')dotColor=cardColor(.95,.42,.44,1);
  var dot=$.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(
    x+(6-dotDiameter)/2,(bounds.size.height-dotDiameter)/2,dotDiameter,dotDiameter));
  sendVoid(dotColor,'setFill');sendVoid(dot,'fill');
}

registerMenuViewSubclass({
  name: 'CodexUsageMeterVPNView',
  superclass: 'NSView',
  methods: {
    'drawRect:': {
      implementation: function() {
        var bounds = this.bounds;
        var transitioning = maomaoyunStatus === 'connecting' || maomaoyunStatus === 'disconnecting';
        var progress = vpnSwitchAnimation.value;
        // Wi-Fi-style capsule; keep the height, right edge and 46pt hit region.
        var switchWidth=42,switchHeight=19,thumbWidth=25,thumbHeight=15;
        var switchX = bounds.size.width - 16 - switchWidth;
        var switchY = (bounds.size.height - switchHeight) / 2;
        var track = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(
          $.NSMakeRect(switchX, switchY, switchWidth, switchHeight),switchHeight/2,switchHeight/2);
        sendVoid($.NSColor.colorWithCalibratedWhiteAlpha(0.5, 0.42), 'setFill');
        sendVoid(track, 'fill');
        var pending = transitioning && vpnSwitchPreviewValue === null;
        sendVoid(cardColors().blue.colorWithAlphaComponent(progress * (pending ? 0.55 : 1)), 'setFill');
        sendVoid(track, 'fill');
        var thumb = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(
          $.NSMakeRect(switchX+2+(switchWidth-4-thumbWidth)*progress,switchY+2,thumbWidth,thumbHeight),thumbHeight/2,thumbHeight/2);
        sendVoid($.NSColor.colorWithCalibratedWhiteAlpha(1, pending ? 0.8 : 1), 'setFill');
        sendVoid(thumb, 'fill');
      }
    },
    'mouseDown:': {
      types: ['void', ['id']],
      implementation: function(event) {
        if (isExiting) return;
        var point=this.convertPointFromView(event.locationInWindow,$());
        if(!$.NSPointInRect(point,$.NSMakeRect(this.bounds.size.width-58,0,46,this.bounds.size.height)))return;
        previewVPNSwitch();
      }
    },
    'isAccessibilityElement': {
      types: ['bool', []], implementation: function() { return true; }
    },
    'accessibilityRole': {
      types: ['id', []], implementation: function() { return 'AXCheckBox'; }
    },
    'accessibilityLabel': {
      types: ['id', []], implementation: function() {
        return uiLanguage === 'zh-CN' ? 'MaoMaoYun · 开关动画预览，不控制 VPN' : 'MaoMaoYun · Switch animation preview, no VPN control';
      }
    },
    'accessibilityValue': {
      types: ['id', []], implementation: function() {
        return $.NSNumber.numberWithInt(vpnSwitchPreviewValue !== null ? vpnSwitchPreviewValue : maomaoyunStatus === 'connected' ? 1 :
          (maomaoyunStatus === 'disconnected' ? 0 : 2));
      }
    },
    'accessibilityPerformPress': {
      types: ['bool', []], implementation: function() {
        if (isExiting) return false;
        previewVPNSwitch(); return true;
      }
    }
  }
});

// The client name keeps its full hit target, with a fitted hover background.
registerMenuViewSubclass({
  name:'CodexUsageMeterVPNFooterButton',superclass:'CodexUsageMeterMenuRowButton',
  methods:{
    'isFlipped':{types:['bool',[]],implementation:function(){return false;}},
    'drawRect:':{implementation:function(){
      var b=this.bounds;
      var width=Number($('MaoMaoYun').sizeWithAttributes(cardAttributes(11,cardColors().muted,'medium')).width);
      var color=drawMenuRowHighlight(this,1,0,width+30)?$.NSColor.whiteColor:cardColors().muted;
      // Reuse the cached visible glyph center, not the font's cap-height box.
      var y=b.size.height/2-meterStatusIconY(null,'MaoMaoYun',0,11,'medium',0);
      // Share the panel's 16pt leading edge; identity and real status form
      // one quiet group. The dot follows the measured name, not a fixed slot.
      drawCardText('MaoMaoYun',8,y,Math.ceil(width)+1,11,color,'medium');
      drawMaoMaoYunStatusDot(b,8+width+8);
    }}
  }
});

function makeVPNClientButton(x) {
  var button=$.CodexUsageMeterVPNFooterButton.alloc.initWithFrame($.NSMakeRect(x,8,128,24));
  configureMenuRowButton(button,'MaoMaoYun');button.font=cardFont(11,'medium');
  button.autoresizingMask=0;button.tag=1;
  button.setButtonType($.NSMomentaryPushInButton);
  button.sendActionOn($.NSEventMaskLeftMouseDown);
  button.target=delegate;button.action='openMaoMaoYunApp:';button.accessibilityLabel=uiText('Open MaoMaoYun');
  return button;
}
