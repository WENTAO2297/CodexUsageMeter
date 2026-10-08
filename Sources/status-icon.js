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
  // The icon communicates activity only. Quota urgency remains on the
  // percentage and progress bars, so the glyph stays visually stable.
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
  // The knot communicates activity, while the ring communicates quota health.
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
  // The quota is now encoded by the circular ring, so keep the button image
  // only. Retain the current value in accessibility and the tooltip for
  // users who need the exact percentage.
  statusButton.title = '';
  var accessibleValue = usageSyncState === 'loading' ? 'Syncing' : usageText === '!' ? 'Sync failed' : usageText;
  statusButton.toolTip = 'Codex Usage: ' + accessibleValue;


  try {
    statusButton.accessibilityLabel = 'Codex Usage ' + accessibleValue;
  } catch (error) {
    // Accessibility is best-effort on older AppKit bridges.
  }
}

function setMenuBarText(text) {
  usageText = String(text);
  updateStatusButtonTitle();
  // Move the circular gauge down by one point to align its optical center with
  // neighboring menu-bar icons.
  var frame = statusButton.frame;
  statusButton.setFrameOrigin($.NSMakePoint(frame.origin.x, -1.0));
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
  updateStatusButtonTitle();
}

function updateUsageLabel(text) {
  if (usageText === text) return;
  setMenuBarText(text);
  // The percentage is now represented by the outer ring rather than visible
  // button text. Do not reuse the old title fade here: alphaValue applies to
  // the whole status button and made the inner Codex knot flash on refresh.
}
