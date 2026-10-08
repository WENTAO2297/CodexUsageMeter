function quotaCardLayout() {
  var compactGap = QUOTA_SPACING_UNIT;
  var titleToBarGap = 1;
  var sectionGap = 5;
  var quotaGroupGap = sectionGap + 2;
  var titleLineHeight = 16;
  var barHeight = 6;
  var resetLineHeight = 13;

  var count = quotaWindows.length;
  var groupHeight = resetLineHeight + compactGap + barHeight + titleToBarGap + titleLineHeight;
  var rows = [];
  for (var i = 0; i < count; i++) {
    var resetY = sectionGap + (count - i - 1) * (groupHeight + quotaGroupGap);
    var barY = resetY + resetLineHeight + compactGap;
    rows.push({ titleY: barY + barHeight + titleToBarGap, barY: barY, resetY: resetY });
  }

  return {
    height: rows[0].titleY + titleLineHeight + sectionGap,
    barHeight: barHeight,
    rows: rows
  };
}

function quotaResetLabel(state) {
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

ObjC.registerSubclass({
  name: 'CodexUsageMeterCardView',
  superclass: 'NSView',
  methods: {
    'drawRect:': {
      implementation: function() {
        var bounds = this.bounds;
        var width = bounds.size.width;
        
        var colors = cardColors();
        var bodyColor = colors.body;
        var mutedColor = colors.muted;

        var rows = quotaWindows;
        // Each quota has one primary line (window label and remaining value),
        // then a slim bar and its reset schedule. This removes duplicate
        // percentage text while keeping the remaining amount immediately scannable.
        var layout = quotaCardLayout();
        for (var i = 0; i < rows.length; i++) {
          var state = rows[i];
          var row = layout.rows[i];
          var hasValue = state.remaining !== null && state.remaining !== undefined;
          var remainingValue = hasValue ? state.remaining : 0;
          var percentageColor = !hasValue ? mutedColor :
            quotaCardColor(quotaTone(remainingValue), true);
          drawCardText(state.label, 16, row.titleY, width - 32, 12, bodyColor, true);
          drawCardTextRight(
            quotaValueLabel(state, usageSyncState),
            width - 16, row.titleY, 12, percentageColor, true
          );
          drawRoundedBar(16, row.barY, width - 32, layout.barHeight, hasValue ? remainingValue / 100 : 0.02);
          if (i === rows.length - 1) {
            drawCardTextWithTrailingText(
              quotaResetLabel(state), inlineResetCreditText(),
              16, row.resetY, width - 32, 9, mutedColor
            );
          } else {
            drawCardText(quotaResetLabel(state), 16, row.resetY, width - 32, 9, mutedColor, false);
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
ObjC.registerSubclass({
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

// The VPN control is a secondary utility, so give it a quieter custom row
// instead of presenting it like a checked primary menu command.
ObjC.registerSubclass({
  name: 'CodexUsageMeterVPNView',
  superclass: 'NSView',
  methods: {
    'drawRect:': {
      implementation: function() {
        var bounds = this.bounds;
        var colors = cardColors();
        var dotColor = colors.muted;
        var dotDiameter = 6;
        var transitioning = maomaoyunStatus === 'connecting' || maomaoyunStatus === 'disconnecting';
        if (maomaoyunStatus === 'connected') {
          dotColor = activeAccentColor(1.0);
        } else if (transitioning) {
          // A small, bounded pulse makes the in-progress state legible
          // without shifting the row or leaving a stale dot after completion.
          var phase = (Date.now() % 900) / 900;
          var pulse = (Math.sin(phase * Math.PI * 2) + 1) / 2;
          dotDiameter = 5.2 + pulse * 1.6;
          dotColor = cardColor(0.96, 0.68, 0.25, 0.58 + pulse * 0.42);
        } else if (maomaoyunStatus === 'error') {
          dotColor = cardColor(0.95, 0.42, 0.44, 1.0);
        }

        var dot = $.NSBezierPath.bezierPathWithOvalInRect(
          $.NSMakeRect(16 + (6 - dotDiameter) / 2, Math.max(0, (bounds.size.height - dotDiameter) / 2), dotDiameter, dotDiameter)
        );
        sendVoid(dotColor, 'setFill');
        sendVoid(dot, 'fill');
        drawCardText('MaoMaoYun', 30, 5, Math.max(0, bounds.size.width - 180), 10, colors.muted, false);
        drawCardTextRight(
          maomaoyunStatusLabel(),
          bounds.size.width - 38,
          5,
          10,
          colors.muted,
          false
        );
        drawCardText('↗', bounds.size.width - 27, 5, 12, 10, colors.muted, false);
      }
    },
    'mouseDown:': {
      types: ['void', ['id']],
      implementation: function(event) {
        try {
          var localX = event.locationInWindow.x - this.frame.origin.x;
          if (localX >= this.bounds.size.width - 36) {
            openMaoMaoYunApp();
            return;
          }
        } catch (error) {
          // If AppKit supplies no usable coordinates, preserve the primary
          // row action instead of making the VPN control unresponsive.
        }
        toggleMaoMaoYun();
      }
    }
  }
});

// Keep the Pinned label on its own compact row instead of using an ordinary
// NSMenuItem. A normal item keeps the full menu-command height even when its
// text is small, which is what made the section feel too loose above and
// below. The fixed 18pt row gives the label deliberate, balanced breathing
// room while leaving the task rows at their native height.
ObjC.registerSubclass({
  name: 'CodexUsageMeterPinnedHeaderView',
  superclass: 'NSView',
  methods: {
    'drawRect:': {
      implementation: function() {
        var bounds = this.bounds;
        drawCardText(
          'Pinned',
          16,
          2,
          Math.max(0, bounds.size.width - 32),
          10,
          cardColors().muted,
          false
        );
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
    sync: usageSyncState,
    minute: Math.floor(Date.now() / 60000)
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
  renderState.usageCardSnapshotKey = key;
  if (usageCardView) usageCardView.setNeedsDisplay(true);
}

// Build the established native menu in one place, after the delegate and icon exist.
function buildMenu() {
  menu = $.NSMenu.alloc.init;
  // These actions target the local JXA delegate. Disable AppKit's automatic
  // responder validation so the menu cannot gray out while Codex is in the
  // background or while the usage reader is still loading.
  menu.autoenablesItems = false;

  // Keep the VPN switch at the top of the menu, separated from the regular
  // actions by the same native-style divider used throughout the menu.
  maomaoyunView = $.CodexUsageMeterVPNView.alloc.initWithFrame($.NSMakeRect(0, 0, MENU_WIDTH, 26));
  maomaoyunView.toolTip = 'Click the row to toggle VPN; click ↗ to open MaoMaoYun';
  maomaoyunItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('MaoMaoYun  ·  Checking', null, '');
  maomaoyunItem.view = maomaoyunView;
  maomaoyunItem.enabled = true;
  maomaoyunItem.toolTip = 'Click the row to toggle VPN; click ↗ to open MaoMaoYun';
  menu.addItem(maomaoyunItem);
  menu.addItem(menuDividerItem());

  var newTaskItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('New Task', 'newTask:', '');
  newTaskItem.target = delegate;
  newTaskItem.enabled = true;

  // Keep the action rows compact: New Task followed by the ChatGPT web shortcut.
  var openChatGPTItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('Ask ChatGPT', 'openChatGPTWeb:', '');
  openChatGPTItem.target = delegate;
  openChatGPTItem.enabled = true;

  // A custom view lets each quota window keep a small, airy hierarchy—label,
  // progress bar, then reset countdown—without adding another background layer.
  usageCardView = $.CodexUsageMeterCardView.alloc.initWithFrame($.NSMakeRect(0, 0, MENU_WIDTH, quotaCardLayout().height));
  usageCardView.setNeedsDisplay(true);
  var usageCardItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('', null, '');
  usageCardItem.view = usageCardView;
  usageCardItem.enabled = false;
  menu.addItem(usageCardItem);

  // Keep the quota block above the task shortcuts, with one divider marking the
  // boundary between the two sections.
  menu.addItem(menuDividerItem());
  menu.addItem(newTaskItem);
  menu.addItem(openChatGPTItem);

  // The Pinned area shares one anchor divider. updateTaskSectionsMenu keeps
  // this separator before Restart Widget even when there are no pinned rows.
  pinnedAnchorDividerItem = menuDividerItem();
  pinnedAnchorDividerItem.hidden = true;
  menu.addItem(pinnedAnchorDividerItem);

  var restartItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('Restart Widget', 'restartMeter:', '');
  restartItem.target = delegate;
  restartItem.enabled = true;
  menu.addItem(restartItem);

  var quitItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('Quit Codex', 'quitCodex:', '');
  quitItem.target = delegate;
  quitItem.enabled = true;
  menu.addItem(quitItem);

  menu.delegate = delegate;
  // Let AppKit own presentation, focus, and click-away dismissal.
  statusItem.menu = menu;
}
