function statusDisplayPreferences() {
  return $.NSUserDefaults.standardUserDefaults;
}

function restoreStatusDisplayMode() {
  try {
    statusDisplayMode = normalizeStatusDisplayMode(ObjC.unwrap(
      statusDisplayPreferences().stringForKey(STATUS_DISPLAY_PREFERENCE_KEY)
    ));
  } catch (error) {
    statusDisplayMode = 'quota';
    logError('status-display-read', error);
  }
}

function setStatusDisplayMode(mode) {
  if (isExiting || (mode !== 'quota' && mode !== 'icon') || mode === statusDisplayMode) return;
  try {
    statusDisplayPreferences().setObjectForKey($(mode), $(STATUS_DISPLAY_PREFERENCE_KEY));
  } catch (error) {
    logError('status-display-save', error);
    return;
  }
  statusDisplayMode = mode;
  updateStatusDisplayMenu();
  // Change only the center, preserving the current ring/activity animation.
  rebuildStatusIconImages();
}

function setRunningIndicator(shouldShow) {
  if (isExiting) return;
  if (hasRunningTasks === shouldShow) return;
  hasRunningTasks = shouldShow;
  if (statusButton) {
    updateStatusIcon();
    updateStatusButtonTitle();
  }
}

function desiredStatusIconMode() {
  // The center's color communicates activity only. Quota urgency remains on
  // the ring and progress bars, independently of numbers versus the logo.
  if (hasRunningTasks) return 'active';
  return 'idle';
}

function makeTintedIcon(source, color) {
  var iconSize = arguments.length > 2 ? arguments[2] : 18;
  var tinted = $.NSImage.alloc.initWithSize($.NSMakeSize(iconSize, iconSize));
  sendVoid(tinted, 'lockFocus');
  source.drawInRectFromRectOperationFraction(
    $.NSMakeRect(0, 0, iconSize, iconSize),
    $.NSMakeRect(0, 0, 0, 0),
    $.NSCompositingOperationSourceOver,
    1.0
  );
  // Use the source image as an alpha mask, then fill it with the working
  // accent. Unlike a template image, this preserves the chosen color.
  sendVoid(color, 'setFill');
  $.NSRectFillUsingOperation(
    $.NSMakeRect(0, 0, iconSize, iconSize),
    $.NSCompositingOperationSourceIn
  );
  sendVoid(tinted, 'unlockFocus');
  tinted.template = false;
  return tinted;
}

function drawQuotaStatusNumber(center, color) {
  var text = remainingQuotaText(quotaWindows);
  var fontSize = text.length > 2 ? 7.5 : 10.5;
  var font = statusQuotaFont(fontSize);
  var attributes = $({ NSFont: font, NSColor: color });
  var value = $(text);
  // Tabular advances include asymmetric side bearings (especially for 1).
  // Center the visible glyphs horizontally, not the empty layout cells. Keep
  // the established vertical baseline and font sizes so the ring is unchanged.
  // A quota has only 0..100 / —; reuse metrics during ring/color animations.
  var layouts = drawQuotaStatusNumber.layouts || (drawQuotaStatusNumber.layouts = {});
  var key = ObjC.unwrap(font.fontName) + ':' + fontSize + ':' + text;
  var layout = layouts[key];
  if (!layout) {
    var size = value.sizeWithAttributes(attributes);
    layout = { x: Number(size.width) / 2, y: Number(size.height) / 2 };
    try {
      var bounds = value.boundingRectWithSizeOptionsAttributes(
        $.NSMakeSize(25, 25), $.NSStringDrawingUsesDeviceMetrics, attributes
      );
      var x = Number(bounds.origin.x) + Number(bounds.size.width) / 2;
      if (isFinite(x) && Number(bounds.size.width) > 0 && Number(bounds.size.width) <= 25) layout.x = x;
    } catch (ignored) {
      // A missing bridge/metric on another macOS build must not break the icon.
    }
    layouts[key] = layout;
  }
  value.drawAtPointWithAttributes(
    $.NSMakePoint(center.x - layout.x, center.y - layout.y),
    attributes
  );
}

function makeQuotaStatusIcon(source, color, fraction) {
  var iconSize = 22;
  // Keep the circular gauge centered in a compact status-bar canvas.
  var canvasWidth = 25;
  var canvasHeight = 25;
  var gaugeOffsetX = 1.5;
  var gaugeOffsetY = 1.2;
  var logoSize = 14;
  var image = $.NSImage.alloc.initWithSize($.NSMakeSize(canvasWidth, canvasHeight));
  var boundedFraction = Math.max(0, Math.min(1.0, fraction || 0));
  var trackColor = cardColor(0.38, 0.39, 0.43, 0.78);
  // The center communicates activity, while the ring communicates quota health.
  // Keep these channels independent so a running task does not make a healthy
  // quota look critical merely because the icon is in its active state.
  // Use red for the short startup placeholder. Once synced, the visible
  // arc follows the same 5% / 20% quota thresholds as the quota card.
  var ringColor = usageSyncState === 'loading'
    ? cardColors().critical
    : quotaRingColorForFraction(boundedFraction);
  var ringRect = $.NSMakeRect(
    gaugeOffsetX + 1.6, gaugeOffsetY + 1.6, iconSize - 3.2, iconSize - 3.2
  );
  var center = $.NSMakePoint(
    gaugeOffsetX + iconSize / 2, gaugeOffsetY + iconSize / 2
  );
  var radius = (iconSize - 3.2) / 2;

  sendVoid(image, 'lockFocus');
  var track = $.NSBezierPath.bezierPathWithOvalInRect(ringRect);
  track.lineWidth = 1.7;
  sendVoid(trackColor, 'setStroke');
  sendVoid(track, 'stroke');

  var progress = $.NSBezierPath.bezierPath;
  progress.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise(
    center, radius, 90, 90 - boundedFraction * 360, true
  );
  progress.lineWidth = 1.9;
  progress.lineCapStyle = $.NSRoundLineCapStyle;
  sendVoid(ringColor, 'setStroke');
  if (boundedFraction > 0) sendVoid(progress, 'stroke');

  if (statusDisplayMode === 'icon') {
    var tintedLogo = makeTintedIcon(source, color, logoSize);
    tintedLogo.drawInRectFromRectOperationFraction(
      $.NSMakeRect(
        gaugeOffsetX + (iconSize - logoSize) / 2,
        gaugeOffsetY + (iconSize - logoSize) / 2,
        logoSize,
        logoSize
      ),
      $.NSMakeRect(0, 0, 0, 0),
      $.NSCompositingOperationSourceOver,
      1.0
    );
  } else {
    // Use the actual quota, never the animated arc's intermediate value or
    // its 2% startup placeholder. A stale known quota remains readable.
    drawQuotaStatusNumber(center, color);
  }

  sendVoid(image, 'unlockFocus');
  image.template = false;
  return image;
}

function rebuildStatusIconImages() {
  if (!statusIconSource || !statusButton) return;
  statusButton.image = makeQuotaStatusIcon(statusIconSource, cardColor(
    statusIconCurrentColor.red, statusIconCurrentColor.green,
    statusIconCurrentColor.blue, statusIconCurrentColor.alpha), statusIconQuotaFraction);
}

function ensureIconAnimation() {
  quotaRingAnimationTimer = startTransientTimer(quotaRingAnimationTimer, 0.035, 'stepQuotaRingAnimation:');
}

function animateStatusIconQuota(targetFraction) {
  statusIconQuotaTargetFraction = Math.max(0, Math.min(1, targetFraction));
  quotaRingAnimationFromFraction = statusIconQuotaFraction;
  quotaRingAnimationStartedAt = Date.now();
  ensureIconAnimation();
}

function stopQuotaRingAnimation() {
  quotaRingAnimationTimer = stopTransientTimer(quotaRingAnimationTimer);
  quotaRingAnimationStartedAt = 0;
  statusTransitionStartedAt = 0;
  statusIconCurrentColor = statusIconPalette[statusTransitionToMode];
}

function updateStatusIcon() {
  var mode = desiredStatusIconMode();
  if (mode === statusTransitionToMode) return;
  statusTransitionFromColor = statusIconCurrentColor;
  statusTransitionToMode = mode;
  statusTransitionStartedAt = Date.now();
  ensureIconAnimation();
}

function stepIconAnimation() {
  var now = Date.now();
  if (quotaRingAnimationStartedAt) {
    var p = Math.min(1, (now - quotaRingAnimationStartedAt) / QUOTA_RING_ANIMATION_DURATION_MS);
    statusIconQuotaFraction = quotaRingAnimationFromFraction +
      (statusIconQuotaTargetFraction - quotaRingAnimationFromFraction) * (1 - Math.pow(1 - p, 3));
    if (p >= 1) quotaRingAnimationStartedAt = 0;
  }
  if (statusTransitionStartedAt) {
    var t = Math.min(1, (now - statusTransitionStartedAt) / 280);
    var to = statusIconPalette[statusTransitionToMode];
    var from = statusTransitionFromColor;
    statusIconCurrentColor = {
      red: from.red + (to.red - from.red) * t,
      green: from.green + (to.green - from.green) * t,
      blue: from.blue + (to.blue - from.blue) * t, alpha: 1
    };
    if (t >= 1) statusTransitionStartedAt = 0;
  }
  rebuildStatusIconImages();
  if (!quotaRingAnimationStartedAt && !statusTransitionStartedAt) {
    quotaRingAnimationTimer = stopTransientTimer(quotaRingAnimationTimer);
  }
}

function updateStatusButtonTitle() {
  if (!statusButton) return;
  // Both center styles are rendered inside the circular ring, so keep the
  // button image-only. Retain the exact percentage in accessibility.
  if (ObjC.unwrap(statusButton.title)) statusButton.title = '';
  var accessibleValue = usageSyncState === 'loading' ? 'Syncing' : usageText === '!' ? 'Sync failed' : usageText;
  try {
    statusButton.accessibilityLabel = 'Codex Usage ' + accessibleValue;
    if (typeof uiText === 'function') statusButton.accessibilityLabel = uiText(ObjC.unwrap(statusButton.accessibilityLabel));
  } catch (error) {
    // Accessibility is best-effort on older AppKit bridges.
  }
}

function setMenuBarText(text) {
  usageText = String(text);
  if (statusDisplayMode === 'quota') rebuildStatusIconImages();
  updateStatusButtonTitle();
}

function configureMenuBarIcon() {
  // ChatGPT ships a 2x monochrome knot matching the native Codex menu-bar
  // item. Wrap it in one circular quota gauge so the remaining amount and
  // activity state read as a single compact symbol.
  var icon = $.NSImage.alloc.initWithContentsOfFile($(resourcePath('chatgptTemplate@2x.png')));
  if (!icon) return;
  icon.template = false;
  statusIconSource = icon;
  rebuildStatusIconImages();

  statusButton.imagePosition = $.NSImageOnly;
  statusButton.imageScaling = $.NSImageScaleProportionallyDown;
  // Position once; quota updates do not move the native status view.
  var frame = statusButton.frame;
  statusButton.setFrameOrigin($.NSMakePoint(frame.origin.x, -1.0));
  updateStatusButtonTitle();
}

function updateUsageLabel(text) {
  if (usageText === text) return;
  setMenuBarText(text);
  // The percentage is now represented by the outer ring rather than visible
  // button text. Do not reuse the old title fade here: alphaValue applies to
  // the whole status button and made the inner Codex knot flash on refresh.
}
