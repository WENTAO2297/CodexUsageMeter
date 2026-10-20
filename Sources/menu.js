// Native menu composition and quota/traffic readout views.
// Shared row interaction, preferences and VPN controls have separate owners.
function quotaCardLayout() {
  var count=quotaWindows.length, geometry=dashboardMetricLayout(MENU_WIDTH,'quota'), rows=[];
  for (var i = 0; i < count; i++) {
    rows.push({offset:(count-i-1)*(geometry.height+geometry.gap)});
  }
  return {height:count*geometry.height+Math.max(0,count-1)*geometry.gap,rows:rows};
}

function quotaResetLabel(state) {
  if(typeof canUseRecentQuotaDisplay==='function'&&canUseRecentQuotaDisplay())return cardResetText(state.resetAt);
  if (usageSyncState === 'error' && state.remaining !== null) return 'Update failed · last known value';
  if (usageSyncState === 'error') return 'Update failed · retrying';
  if (usageSyncState === 'cached') return 'Cached value · updating';
  if (usageSyncState === 'loading') return 'Fetching quota…';
  if (state.remaining === null && usageSyncState === 'ready') return 'Window unavailable';
  return cardResetText(state.resetAt);
}

function cardResetText(resetAt) {
  if (resetAt === null || resetAt === undefined) return 'Reset time unavailable';
  var resetDate = new Date(resetAt * 1000);
  var dateText = (resetDate.getMonth() + 1) + '/' + resetDate.getDate() + ' ' +
    (resetDate.getHours() < 10 ? '0' : '') + resetDate.getHours() + ':' +
    (resetDate.getMinutes() < 10 ? '0' : '') + resetDate.getMinutes();
  var minutes = Math.max(0, Math.ceil((resetAt - Date.now() / 1000) / 60));
  if (minutes === 0) return 'Resets ' + dateText + ' · resetting soon';
  if (minutes < 60) return 'Resets ' + dateText + ' · ' + minutes + 'm';
  var hours = Math.floor(minutes / 60);
  var remainder = minutes % 60;
  if (hours < 24) return 'Resets ' + dateText + ' · ' + hours + 'h' + (remainder ? ' ' + remainder + 'm' : '');
  var days = Math.floor(hours / 24);
  var dayHours = hours % 24;
  return 'Resets ' + dateText + ' · ' + days + 'd' + (dayHours ? ' ' + dayHours + 'h' : '');
}

function resetCreditExpiryText() {
  if (availableCredits <= 0) return 'No resets available';
  if (!resetCreditExpirations.length) return 'Expiry unknown';

  var labels = [];
  var sorted = resetCreditExpirations.slice().sort(function(a, b) { return a - b; });
  for (var i = 0; i < sorted.length; i++) {
    var itemDate = new Date(sorted[i] * 1000);
    var itemKey = (itemDate.getMonth() + 1) + '/' + itemDate.getDate();
    // List every available credit directly. This avoids a technical-looking
    // “×1” suffix while still faithfully showing each expiry date.
    labels.push(itemKey);
  }
  return labels.join(', ');
}

function inlineResetCreditText() {
  if (availableCredits === null) return '';
  if (availableCredits <= 0) return '↻ No resets available';
  var useLabel = availableCredits === 1 ? 'use' : 'uses';
  if (!resetCreditExpirations.length) return '↻ ' + availableCredits + ' ' + useLabel + ' · ' + resetCreditExpiryText();
  return '↻ ' + availableCredits + ' ' + useLabel + ' · Expires ' + resetCreditExpiryText();
}

function quotaFooterParts(state,includeCredits) {
  var raw=quotaResetLabel(state),match=/^Resets (\d+\/\d+ \d+:\d+) · (.+)$/.exec(raw);
  var count=includeCredits&&availableCredits!==null?'↻ '+availableCredits+' '+(availableCredits===1?'use':'uses'):'';
  var expiry=count&&availableCredits>0?' · '+(resetCreditExpirations.length?'Expires ':'')+resetCreditExpiryText():'';
  var countdown=match?match[2]:'';
  if(typeof canUseRecentQuotaDisplay==='function'&&canUseRecentQuotaDisplay())
    countdown='Last update '+maoMaoYunTrafficTimeLabel(usageLastGoodAt*1000,Date.now());
  return {date:match?match[1]:'',message:match?'':raw,countdown:countdown,credits:count,expiry:expiry};
}

// Shared VPN action strip above transparent rows. Keep controls as
// siblings of the data views so login hit testing cannot swallow their clicks.
registerMenuViewSubclass({
  name: 'CodexUsageMeterMetricsPairView',
  superclass: 'NSView',
  methods: {
    'drawRect:': {
      implementation: function() {
        var line=$.NSBezierPath.bezierPath,geometry=dashboardMetricLayout(MENU_WIDTH,'traffic'),quotaHeight=quotaCardLayout().height;
        // Draw both boundaries inside existing gaps; do not add menu height.
        [quotaHeight+geometry.gap/2,quotaHeight+geometry.gap+geometry.height+2].forEach(function(y){
          line.moveToPoint($.NSMakePoint(16,y));
          line.lineToPoint($.NSMakePoint(MENU_WIDTH-16,y));
        });
        line.lineWidth=.5;
        sendVoid($.NSColor.whiteColor.colorWithAlphaComponent(.16),'setStroke');sendVoid(line,'stroke');
      }
    }
  }
});

registerMenuViewSubclass({
  name: 'CodexUsageMeterCardView',
  superclass: 'NSView',
  methods: {
    'drawRect:': {
      implementation: function() {
        var bounds = this.bounds;
        var width = bounds.size.width;
        
        var colors = cardColors();
        var mutedColor = colors.muted;

        var rows = quotaWindows;
        var forecasts = currentQuotaForecasts();
        var layout = quotaCardLayout();
        for (var i = 0; i < rows.length; i++) {
          var state = rows[i];
          var row = layout.rows[i];
          var hasValue = state.remaining !== null && state.remaining !== undefined;
          var remainingValue = hasValue ? state.remaining : 0;
          var recent=typeof canUseRecentQuotaDisplay==='function'&&canUseRecentQuotaDisplay();
          var stale=(usageSyncState==='cached'||usageSyncState==='error')&&!recent;
          var percentageColor = !hasValue || stale ? mutedColor :
            quotaCardColor(quotaTone(remainingValue), true);
          var summary = quotaForecastSummary(state, forecasts[i], Date.now()/1000);
          drawMetricDashboard({title:state.label,window:state,context:'',hasValue:hasValue,stale:stale,
            value:hasValue?state.remaining+'%':quotaValueLabel(state,usageSyncState),valueColor:percentageColor,
            fraction:remainingValue/100,
            actual:typeof observedQuotaUseLabel==='function'?observedQuotaUseLabel(state):'',footer:quotaResetLabel(state),
            footerParts:quotaFooterParts(state,i===rows.length-1),summary:summary,forecast:forecasts[i]},
            width,row.offset);
          if(i<rows.length-1){
            var separator=$.NSBezierPath.bezierPath;
            separator.moveToPoint($.NSMakePoint(16,row.offset-6));
            separator.lineToPoint($.NSMakePoint(width-16,row.offset-6));separator.lineWidth=.5;
            sendVoid(cardColor(.54,.55,.58,.24),'setStroke');sendVoid(separator,'stroke');
          }
        }
      }
    }
  }
});

// Native menu separators include system-controlled margins which vary with
// the surrounding item type. A compact custom divider gives every section
// the same 12pt vertical rhythm and the same 16pt horizontal inset as the
// quota card.
registerMenuViewSubclass({
  name: 'CodexUsageMeterDividerView',
  superclass: 'NSView',
  methods: {
    'drawRect:': {
      implementation: function() {
        var width = this.bounds.size.width;
        var path = $.NSBezierPath.bezierPath;
        path.moveToPoint($.NSMakePoint(16, 6));
        path.lineToPoint($.NSMakePoint(width - 16, 6));
        path.lineWidth = 0.5;
        sendVoid(cardColor(0.54, 0.55, 0.58, 0.42), 'setStroke');
        sendVoid(path, 'stroke');
      }
    }
  }
});

// Read-only account traffic belongs to the VPN utility, not the Codex quotas.
// Keep a fixed height: background website refreshes must not relayout NSMenu.
registerMenuViewSubclass({
  name: 'CodexUsageMeterVPNTrafficView',
  superclass: 'NSView',
  methods: {
    'mouseDown:': {
      types: ['void', ['id']],
      implementation: function() {
        if (!maoMaoYunTrafficNeedsLogin(maomaoyunTrafficSourceState)) return;
        // End native menu tracking before opening the explicit login window.
        if (menu) sendVoid(menu, 'cancelTracking');
        signInMaoMaoYunAccount();
      }
    },
    'accessibilityPerformPress': {
      types: ['bool', []],
      implementation: function() {
        if (!maoMaoYunTrafficNeedsLogin(maomaoyunTrafficSourceState)) return false;
        if (menu) sendVoid(menu, 'cancelTracking');
        signInMaoMaoYunAccount();
        return true;
      }
    },
    'drawRect:': {
      implementation: function() {
        var width = this.bounds.size.width;
        var colors = cardColors();
        var forecast=typeof currentMaoMaoYunForecast==='function'?currentMaoMaoYunForecast(maomaoyunTrafficSnapshot,maomaoyunHistorySnapshot,Date.now()):
          maoMaoYunTrafficForecast(maomaoyunTrafficSnapshot,maomaoyunHistorySnapshot,Date.now());
        var presentation = maoMaoYunTrafficPresentation(maomaoyunTrafficSnapshot, maomaoyunTrafficSourceState, Date.now(), maomaoyunHistorySnapshot,forecast);
        var valueColor = presentation.hasValue && !presentation.stale ?
          quotaCardColor(quotaTone(presentation.fraction * 100), true) : colors.muted;
        var summary = trafficForecastSummary(maomaoyunTrafficSnapshot,presentation,
          forecast);
        drawMetricDashboard({kind:'traffic',title:'Traffic',context:'',
          resetDays:maomaoyunTrafficSnapshot?maomaoyunTrafficSnapshot.resetDays:null,hasValue:presentation.hasValue,
          stale:presentation.stale,value:maomaoyunTrafficSnapshot?maomaoyunTrafficSnapshot.remainingLabel:presentation.value,
          valueColor:valueColor,fraction:presentation.fraction,detail:presentation.todayUsage,
          footer:presentation.detail,summary:summary,forecast:forecast},width,0);
      }
    }
  }
});

function menuDividerItem() {
  var view = $.CodexUsageMeterDividerView.alloc.initWithFrame($.NSMakeRect(0, 0, MENU_WIDTH, 12));
  var item = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('', null, '');
  item.view = view;
  item.enabled = false;
  return item;
}

function usageCardSnapshotKey() {
  // Reset text changes at minute granularity, so redraw only on a real data
  // change or when the displayed minute advances.
  return JSON.stringify({
    windows: quotaWindows,
    credits: availableCredits,
    creditExpirations: resetCreditExpirations,
    resetCards:typeof resetCreditCards==='undefined'?[]:resetCreditCards,
    sync: usageSyncState,
    forecasts: currentQuotaForecasts().map(function(forecast,index) {
      return {text:forecast.text,summary:quotaForecastSummary(quotaWindows[index],forecast,Date.now()/1000)};
    }),
    minute: Math.floor(Date.now() / 60000),
    observed:typeof observedQuotaUseLabel==='function'?quotaWindows.map(observedQuotaUseLabel):[]
  });
}

function redrawUsageCardIfNeeded(force) {
  if (!usageCardView) return;
  var key = usageCardSnapshotKey();
  if (!force && key === renderState.usageCardSnapshotKey) return;
  var height = quotaCardLayout().height;
  if (Number(usageCardView.frame.size.height) !== height) {
    // Resize the existing custom view when limits change; do not rebuild the
    // menu or leave a blank row where an absent Session used to be.
    usageCardView.setFrameSize($.NSMakeSize(MENU_WIDTH, height));
  }
  layoutMetricsPair();
  renderState.usageCardSnapshotKey = key;
  var forecasts = currentQuotaForecasts();
  var creditText = inlineResetCreditText();
  usageCardView.accessibilityLabel = quotaWindows.map(function(window, index) {
    var summary = quotaForecastSummary(window,forecasts[index],Date.now()/1000);
    var detail=/^Budget\b/.test(summary.detail||'')?(forecasts[index].reason||''):summary.detail;
    var forecastText=/^Budget\b/.test(forecasts[index].text||'')?'':forecasts[index].text||'';
    var text = window.label + ': ' + quotaValueLabel(window, usageSyncState) + '. ' + summary.headline + '. ' + detail + '. ' + quotaResetLabel(window) + '. ' + forecastText + '. ' + (forecasts[index].reason || '');
    if(typeof quotaPaceModel==='function'){
      var pace=quotaPaceModel(window,Date.now()/1000,usageSyncState!=='ready');
      var localize=typeof uiText==='function'?uiText:function(value){return value;};
      text+='. '+localize(pace.label);
    }
    if(typeof currentObservedQuotaUse==='function') {
      var observed=currentObservedQuotaUse(window);
      text+='. '+observedQuotaUseLabel(window)+(observed?'. Measured over '+forecastDuration(observed.observedSeconds):'');
    }
    return typeof uiText === 'function' ? uiText(text) : text;
  }).join('. ');
  if (creditText) usageCardView.accessibilityLabel = ObjC.unwrap(usageCardView.accessibilityLabel) + '. ' +
    (typeof uiText === 'function' ? uiText(creditText) : creditText);
  if (usageCardView) usageCardView.setNeedsDisplay(true);
  if(typeof updateResetCardsMenu==='function')updateResetCardsMenu();
}

// Keep both real child views: their hit regions, account-login action and
// accessibility remain independent even though NSMenu owns one row.
function layoutMetricsPair() {
  if(typeof metricsPairView==='undefined'||!metricsPairView||!usageCardView||!maomaoyunTrafficView)return;
  var geometry=dashboardMetricLayout(MENU_WIDTH,'traffic'),quotaHeight=quotaCardLayout().height;
  var trafficY=quotaHeight+geometry.gap,stripY=trafficY+geometry.height+4,height=stripY+32+2;
  usageCardView.setFrame($.NSMakeRect(0,0,MENU_WIDTH,quotaHeight));
  maomaoyunTrafficView.setFrame($.NSMakeRect(0,trafficY,MENU_WIDTH,geometry.height));
  // Compensate for NSMenu's extra top air: lift the whole control group 2pt,
  // including hover/hit regions, without moving the divider or changing height.
  maomaoyunView.setFrame($.NSMakeRect(MENU_WIDTH-62,stripY+2,62,32));
  vpnAppButton.setFrameOrigin($.NSMakePoint(8,stripY+6));
  metricsPairView.setFrameSize($.NSMakeSize(MENU_WIDTH,height));
  metricsPairView.needsDisplay=true;
}

// Build the established native menu in one place, after the delegate and icon exist.
function buildMenu() {
  clearMenuRowHover();
  metricsPairView=null;
  if (typeof localizedMenuItems !== 'undefined') localizedMenuItems = [];
  menu = $.NSMenu.alloc.init;
  // These actions target the local JXA delegate. Disable AppKit's automatic
  // responder validation so the menu cannot gray out while Codex is in the
  // background or while the usage reader is still loading.
  menu.autoenablesItems = false;

  // Transparent toolbar: client name on the left and switch on the
  // right. Each control remains a separate sibling above the account views.
  maomaoyunView = $.CodexUsageMeterVPNView.alloc.initWithFrame($.NSMakeRect(MENU_WIDTH-62,4,62,32));
  maomaoyunItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('MaoMaoYun  ·  Checking', null, '');
  maomaoyunItem.enabled = true;
  if (typeof uiText === 'function') {
    maomaoyunItem.title = uiText('MaoMaoYun  ·  Checking');
  }
  var metricWidth=MENU_WIDTH;
  maomaoyunTrafficView = $.CodexUsageMeterVPNTrafficView.alloc.initWithFrame($.NSMakeRect(0, 0, metricWidth, dashboardMetricLayout(metricWidth,'traffic').height));
  maomaoyunTrafficView.accessibilityElement = true;
  maomaoyunTrafficView.accessibilityRole = 'AXGroup';
  vpnAppButton=makeVPNClientButton(8);
  maomaoyunTrafficItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('Traffic · Checking', null, '');
  maomaoyunTrafficItem.enabled = false;
  updateMaoMaoYunTrafficMenuItem();

  var newTaskItem = makeMenuActionItem('New Task','newTask:');

  // Keep the action rows compact: New Task followed by the ChatGPT web shortcut.
  var openChatGPTItem = makeMenuActionItem('Ask ChatGPT','openChatGPTWeb:');

  // Independent children preserve each row's drawing, help and login hit
  // region while the native menu continues to own tracking and dismissal.
  usageCardView = $.CodexUsageMeterCardView.alloc.initWithFrame($.NSMakeRect(0, 0, metricWidth, quotaCardLayout().height));
  usageCardView.accessibilityElement = true;
  usageCardView.accessibilityRole = 'AXStaticText';
  usageCardView.setNeedsDisplay(true);
  metricsPairView=$.CodexUsageMeterMetricsPairView.alloc.initWithFrame($.NSMakeRect(0,0,MENU_WIDTH,quotaCardLayout().height));
  metricsPairView.addSubview(usageCardView);
  metricsPairView.addSubview(maomaoyunTrafficView);
  metricsPairView.addSubview(maomaoyunView);
  metricsPairView.addSubview(vpnAppButton);
  layoutMetricsPair();
  var usageCardItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('', null, '');
  usageCardItem.view = metricsPairView;
  // The traffic child can open account login; do not disable its enclosing row.
  usageCardItem.enabled = true;
  menu.addItem(usageCardItem);
  if(typeof addMeterPanelsMenu==='function')addMeterPanelsMenu();

  // Keep the quota block above the task shortcuts, with one divider marking the
  // boundary between the two sections.
  menu.addItem(newTaskItem);
  menu.addItem(openChatGPTItem);

  menu.addItem(menuDividerItem());

  preferencesExpanded = false;
  preferencesReveal = 0;
  preferencesDisclosureItem = makeStatusDisplayControlItem('Preferences', 200);
  menu.addItem(preferencesDisclosureItem);
  addStatusDisplayMenuItems();

  if (typeof updateLanguageMenu === 'function') {
    languageExpanded=false;languageReveal=0;languageMenuItems={};
    languageMenuItem = makeStatusDisplayControlItem('Language',100);
    languageMenuItem.hidden = true;
    menu.addItem(languageMenuItem);
    [['zh-CN','简体中文',101],['en','English',102]].forEach(function(option) {
      var item=makeStatusDisplayControlItem(option[1],option[2]);
      item.hidden=true;menu.addItem(item);languageMenuItems[option[0]]=item;
    });
    updateLanguageMenu();
  }

  var restartItem = makeMenuActionItem('Restart Widget','restartMeter:');
  menu.addItem(restartItem);

  menu.delegate = delegate;
  // Let AppKit own presentation, focus, and click-away dismissal.
  statusItem.menu = menu;
}
