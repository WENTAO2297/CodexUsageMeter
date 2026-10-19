// Shared AppKit drawing primitives and the existing color/font palette.
function cardColor(red, green, blue, alpha) {
  return $.NSColor.colorWithCalibratedRedGreenBlueAlpha(red, green, blue, alpha);
}

function cardFont(size, bold) {
  var weight = bold === 'medium' ? 'medium' : bold ? 'bold' : 'regular';
  var key = size + ':' + weight;
  if (!renderState.fonts[key]) {
    renderState.fonts[key] = weight === 'medium' ? $.NSFont.systemFontOfSizeWeight(size, $.NSFontWeightMedium) :
      bold ? $.NSFont.boldSystemFontOfSize(size) : $.NSFont.systemFontOfSize(size);
  }
  return renderState.fonts[key];
}

function statusQuotaFont(size) {
  var key = 'status-quota:' + size;
  if (!renderState.fonts[key]) {
    var font;
    try {
      font = $.NSFont.monospacedDigitSystemFontOfSizeWeight(size, $.NSFontWeightSemibold);
      var descriptor = font.fontDescriptor.fontDescriptorWithDesign($.NSFontDescriptorSystemDesignRounded);
      if (descriptor) font = $.NSFont.fontWithDescriptorSize(descriptor, size) || font;
    } catch (ignored) {
      // Keep tabular digits when the rounded design is unavailable.
      if (!font) font = $.NSFont.boldSystemFontOfSize(size);
    }
    renderState.fonts[key] = font;
  }
  return renderState.fonts[key];
}

function cardColors() {
  if (!renderState.cardColors) {
    renderState.cardColors = {
      // Wi-Fi reference switch, sampled in Display P3 and converted to sRGB.
      blue: $.NSColor.colorWithSRGBRedGreenBlueAlpha(15/255, 126/255, 1, 1),
      body: cardColor(0.91, 0.91, 0.93, 1.0),
      muted: cardColor(0.66, 0.67, 0.70, 1.0),
      track: cardColor(0.38, 0.39, 0.43, 0.58),
      normal: cardColor(0.91, 0.91, 0.93, 1.0),
      warning: cardColor(0.96, 0.58, 0.18, 0.95),
      critical: cardColor(0.95, 0.28, 0.30, 0.95),
      percentageWarning: cardColor(0.98, 0.68, 0.25, 1.0),
      percentageCritical: cardColor(0.98, 0.42, 0.44, 1.0)
    };
  }
  return renderState.cardColors;
}

function quotaTone(remainingPercent) {
  if (remainingPercent <= QUOTA_CRITICAL_THRESHOLD) return 'critical';
  if (remainingPercent <= QUOTA_WARNING_THRESHOLD) return 'warning';
  return 'normal';
}

function quotaCardColor(tone, percentageLabel) {
  var colors = cardColors();
  if (!percentageLabel) return colors[tone] || colors.normal;
  if (tone === 'critical') return colors.percentageCritical;
  if (tone === 'warning') return colors.percentageWarning;
  return colors.body;
}

function activeAccentColor(alpha) {
  return cardColor(
    ACTIVE_ACCENT.red, ACTIVE_ACCENT.green, ACTIVE_ACCENT.blue,
    alpha === undefined ? ACTIVE_ACCENT.alpha : alpha
  );
}

function quotaRingColorForFraction(fraction) {
  var tone = quotaTone(Math.max(0, Math.min(1.0, fraction || 0)) * 100);
  if (tone === 'critical') return cardColors().critical;
  if (tone === 'warning') return cardColors().warning;
  return activeAccentColor(1.0);
}

function cardAttributes(size, color, bold) {
  // `$({ ... })` creates a real NSDictionary. Passing JavaScript arrays to
  // dictionaryWithObjectsForKeys can produce a nested NSDictionary on some
  // macOS versions, which then fails when NSString asks for `pointSize`.
  var paragraph = $.NSMutableParagraphStyle.alloc.init;
  paragraph.lineBreakMode = $.NSLineBreakByTruncatingTail;
  return $({
    NSFont: cardFont(size, bold),
    NSColor: color,
    NSParagraphStyle: paragraph
  });
}

function drawCardText(text, x, y, width, size, color, bold) {
  if (typeof uiText === 'function') text = uiText(text);
  $(String(text)).drawInRectWithAttributes(
    $.NSMakeRect(x, y, width, size + 4),
    cardAttributes(size, color, bold)
  );
}

function drawCardTextRight(text, rightEdge, y, size, color, bold) {
  if (typeof uiText === 'function') text = uiText(text);
  var value = $(String(text));
  var attributes = cardAttributes(size, color, bold);
  var measured = value.sizeWithAttributes(attributes);
  var width = Math.max(0, Math.min(rightEdge-16,measured.width));
  value.drawInRectWithAttributes(
    $.NSMakeRect(Math.max(16, rightEdge - width), y, width, size + 4),
    attributes
  );
}

function drawRoundedBar(x, y, width, height, fraction, fillColor) {
  var colors = cardColors();
  var track = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(
    $.NSMakeRect(x, y, width, height), height / 2, height / 2
  );
  sendVoid(colors.track, 'setFill');
  sendVoid(track, 'fill');

  var fillWidth = width * Math.max(0, Math.min(1, fraction));
  if (fillWidth <= 0) return;
  // Preserve rounded caps for small non-zero values without displaying a
  // misleading dot when the quota is genuinely exhausted.
  fillWidth = Math.max(height, fillWidth);
  var fill = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(
    $.NSMakeRect(x, y, fillWidth, height), height / 2, height / 2
  );
  var remainingPercent = fraction * 100;
  fillColor = fillColor || quotaCardColor(quotaTone(remainingPercent), false);
  sendVoid(fillColor, 'setFill');
  sendVoid(fill, 'fill');
}
