// Inline preferences controls and their existing 180ms transitions.
registerMenuViewSubclass({
  name:'CodexUsageMeterDisplayButton',
  superclass:'CodexUsageMeterMenuRowButton',
  methods:{
    'drawRect:': {
      implementation: function() {
        var bounds = this.bounds;
        var tag = Number(this.tag);
        var isLanguage = tag === 100 || tag === 101 || tag === 102;
        var isPreferences = tag === 200;
        var isDisclosure = tag === 0 || tag === 100 || isPreferences;
        var colors = cardColors();
        var reveal = isPreferences ? preferencesReveal : isLanguage ? languageReveal : statusDisplayReveal;
        var opacity = isPreferences ? 1 : preferencesReveal * (isDisclosure ? 1 : reveal);
        var highlighted=drawMenuRowHighlight(this,opacity);
        var foreground=highlighted?$.NSColor.whiteColor:colors.body;
        var attributes = $({ NSFont: this.font, NSColor: foreground.colorWithAlphaComponent(opacity) });
        var title = this.title;
        var height = title.sizeWithAttributes(attributes).height;
        var slideReveal = isDisclosure ? preferencesReveal : reveal;
        var slideY = isPreferences ? 0 : (this.flipped ? -1 : 1) * 4 * (1 - slideReveal);
        var y = (bounds.size.height - height) / 2 + slideY;
        y = Math.max(0, Math.min(bounds.size.height-height,y));
        title.drawAtPointWithAttributes($.NSMakePoint(isPreferences ? 16 : isDisclosure ? 32 : 48, y), attributes);
        if (!isDisclosure) {
          var checked = isLanguage ? (tag===101 ? 'zh-CN' : 'en') === uiLanguage : STATUS_DISPLAY_OPTIONS[tag - 1].mode === statusDisplayMode;
          if (checked) {
            $('✓').drawAtPointWithAttributes($.NSMakePoint(30, y), attributes);
          }
          return;
        }
        drawMenuDisclosureChevron(this,reveal,opacity,highlighted,slideY);
      }
    }
  }
});

function updateStatusDisplayMenu() {
  Object.keys(statusDisplayMenuItems).forEach(function(mode) {
    var item = statusDisplayMenuItems[mode];
    if (item.view) {
      // The custom radio draws its own check. Setting NSMenuItem.state would
      // reserve a check column for every native row and shift all their text.
      item.view.state = mode === statusDisplayMode ? $.NSControlStateValueOn : $.NSControlStateValueOff;
      item.view.needsDisplay = true;
    }
  });
}

function statusDisplayReducedMotion() {
  try { return !!$.NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion; }
  catch (ignored) { return true; }
}

function stopStatusDisplayAnimation() {
  statusDisplayAnimation.timer = stopTransientTimer(statusDisplayAnimation.timer);
}

function redrawStatusDisplayControls() {
  if (statusDisplayDisclosureItem) statusDisplayDisclosureItem.view.needsDisplay = true;
  Object.keys(statusDisplayMenuItems).forEach(function(mode) {
    statusDisplayMenuItems[mode].view.needsDisplay = true;
  });
}

function finishStatusDisplayAnimation(progress) {
  stopStatusDisplayAnimation();
  statusDisplayReveal = progress;
  redrawStatusDisplayControls();
}

function stepStatusDisplayAnimation() {
  if (!statusDisplayAnimation.timer) return;
  if (isExiting || !menuIsOpen) {
    finishStatusDisplayAnimation(statusDisplayExpanded ? 1 : 0);
    return;
  }
  var elapsed = Date.now() - statusDisplayAnimation.startedAt;
  var t = Math.max(0, Math.min(1, elapsed / statusDisplayAnimation.duration));
  if (elapsed < 0 || t >= 1 || statusDisplayReducedMotion()) {
    finishStatusDisplayAnimation(statusDisplayAnimation.to);
    return;
  }
  var eased = 1 - Math.pow(1 - t, 3);
  statusDisplayReveal = statusDisplayAnimation.from + (statusDisplayAnimation.to - statusDisplayAnimation.from) * eased;
  redrawStatusDisplayControls();
}

function setStatusDisplayOptionsExpanded(expanded, animate) {
  if (isExiting || !statusDisplayDisclosureItem) return;
  var target = expanded ? 1 : 0;
  if (statusDisplayExpanded === expanded && statusDisplayReveal === target && !statusDisplayAnimation.timer) return;
  // Retarget from the current visual position on quick repeated clicks.
  if (statusDisplayAnimation.timer) stepStatusDisplayAnimation();
  stopStatusDisplayAnimation();
  statusDisplayExpanded = expanded;
  // Mutate native layout synchronously in the button action, never from the
  // animation timer: hiding rows asynchronously can end AppKit tracking.
  // Collapse hides its rows immediately; the chevron still eases back.
  Object.keys(statusDisplayMenuItems).forEach(function(mode) {
    statusDisplayMenuItems[mode].hidden = !expanded;
  });
  pruneMenuRowHover();
  if (menu) sendVoid(menu, 'update');
  if (!animate || !menuIsOpen || statusDisplayReducedMotion() || Math.abs(target - statusDisplayReveal) < 0.001) {
    finishStatusDisplayAnimation(target);
    return;
  }
  statusDisplayAnimation.from = statusDisplayReveal;
  statusDisplayAnimation.to = target;
  statusDisplayAnimation.startedAt = Date.now();
  statusDisplayAnimation.duration = STATUS_DISPLAY_ANIMATION_MS;
  try {
    statusDisplayAnimation.timer = startTransientTimer(null, 1 / 60, 'statusDisplayAnimationTimer:');
    // AppKit tracks menus in this explicit run-loop mode. No recurring work
    // survives the transition, close or restart; no external reads are added.
    $.NSRunLoop.currentRunLoop.addTimerForMode(statusDisplayAnimation.timer, $.NSEventTrackingRunLoopMode);
  } catch (error) {
    logError('display-animation', error);
    finishStatusDisplayAnimation(target);
  }
  redrawStatusDisplayControls();
}

function statusDisplayButtonPressed(sender) {
  if (isExiting || preferencesControlsHidden()) return;
  var tag = Number(sender.tag);
  if (tag === 0) {
    setStatusDisplayOptionsExpanded(!statusDisplayExpanded, true);
    return;
  }
  var option = STATUS_DISPLAY_OPTIONS[tag - 1];
  if (option) {
    setStatusDisplayMode(option.mode);
    // Restore radio/check states even if saving failed or the user selected
    // the already-current mode; controls may update before their action fires.
    updateStatusDisplayMenu();
    if (typeof updateLanguageMenu === 'function') updateLanguageMenu();
  }
}

function makeStatusDisplayControlItem(title, tag) {
  var button = $.CodexUsageMeterDisplayButton.alloc.initWithFrame($.NSMakeRect(0, 0, MENU_WIDTH, 24));
  button.setButtonType(tag === 0 || tag === 100 || tag === 200 ? $.NSMomentaryChangeButton : $.NSRadioButton);
  // AppKit's borderless cell only tracks its native image/title rectangles,
  // which differ from our indented custom drawing. A bordered cell tracks the
  // whole row; drawRect above replaces its appearance, so no border is drawn.
  configureMenuRowButton(button,title);
  // These rows change a tracking menu's layout. Fire on mouse-down rather
  // than allowing ordinary mouse-up tracking to cancel after pointer motion
  // or a menu reflow. Keep AppKit tracking/keyboard/accessibility behavior,
  // and exclude mouse-up so one physical click never toggles twice.
  button.sendActionOn($.NSEventMaskLeftMouseDown);
  button.tag = tag;
  button.target = delegate;
  button.action = tag === 200 ? 'preferencesButton:' : tag >= 100 ? 'languageButton:' : 'statusDisplayButton:';
  var item = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent(title, null, '');
  item.enabled = true;
  item.view = button;
  // Language names are autonyms, not phrases to translate on locale changes.
  if (typeof localizedMenuItem === 'function' && tag !== 101 && tag !== 102) localizedMenuItem(item, title);
  return item;
}

function addStatusDisplayMenuItems() {
  statusDisplayExpanded = false;
  statusDisplayReveal = 0;
  statusDisplayMenuItems = {};
  statusDisplayDisclosureItem = makeStatusDisplayControlItem('Menu Bar Display', 0);
  statusDisplayDisclosureItem.hidden = true;
  menu.addItem(statusDisplayDisclosureItem);
  STATUS_DISPLAY_OPTIONS.forEach(function(option, index) {
    var item = makeStatusDisplayControlItem(option.title, index + 1);
    item.representedObject = $(option.mode);
    item.hidden = true;
    menu.addItem(item);
    statusDisplayMenuItems[option.mode] = item;
  });
  updateStatusDisplayMenu();
}

function preferencesControlsHidden() {
  return typeof preferencesDisclosureItem !== 'undefined' && !!preferencesDisclosureItem && !preferencesExpanded;
}

function stopPreferencesAnimation() {
  if (typeof preferencesAnimation === 'undefined') return;
  preferencesAnimation.timer = stopTransientTimer(preferencesAnimation.timer);
}

function redrawPreferencesControls() {
  if (preferencesDisclosureItem) preferencesDisclosureItem.view.needsDisplay = true;
  redrawStatusDisplayControls();
  if (typeof redrawLanguageControls === 'function') redrawLanguageControls();
}

function finishPreferencesAnimation(progress) {
  stopPreferencesAnimation();
  preferencesReveal = progress;
  redrawPreferencesControls();
}

function stepPreferencesAnimation() {
  if (!preferencesAnimation.timer) return;
  if (isExiting || !menuIsOpen) {
    finishPreferencesAnimation(preferencesExpanded ? 1 : 0);
    return;
  }
  var elapsed = Date.now() - preferencesAnimation.startedAt;
  var t = Math.max(0, Math.min(1, elapsed / STATUS_DISPLAY_ANIMATION_MS));
  if (elapsed < 0 || t >= 1 || statusDisplayReducedMotion()) {
    finishPreferencesAnimation(preferencesAnimation.to);
    return;
  }
  preferencesReveal = preferencesAnimation.from + (preferencesAnimation.to - preferencesAnimation.from) * (1 - Math.pow(1-t,3));
  redrawPreferencesControls();
}

function setPreferencesExpanded(expanded, animate) {
  if (isExiting || typeof preferencesDisclosureItem === 'undefined' || !preferencesDisclosureItem) return;
  var target = expanded ? 1 : 0;
  if (preferencesAnimation.timer) stepPreferencesAnimation();
  stopPreferencesAnimation();
  preferencesExpanded = !!expanded;
  if (!expanded) {
    // Collapsing the parent also cancels both child transitions. Late timer
    // callbacks must never reveal hidden settings after closing the menu.
    setStatusDisplayOptionsExpanded(false, false);
    if (typeof setLanguageOptionsExpanded === 'function') setLanguageOptionsExpanded(false, false);
  }
  statusDisplayDisclosureItem.hidden = !expanded;
  if (typeof languageMenuItem !== 'undefined' && languageMenuItem) languageMenuItem.hidden = !expanded;
  pruneMenuRowHover();
  if (menu) sendVoid(menu, 'update');
  if (!animate || !menuIsOpen || statusDisplayReducedMotion() || Math.abs(target-preferencesReveal) < 0.001) {
    finishPreferencesAnimation(target);
    return;
  }
  preferencesAnimation.from = preferencesReveal;
  preferencesAnimation.to = target;
  preferencesAnimation.startedAt = Date.now();
  try {
    preferencesAnimation.timer = startTransientTimer(null, 1/60, 'preferencesAnimationTimer:');
    $.NSRunLoop.currentRunLoop.addTimerForMode(preferencesAnimation.timer, $.NSEventTrackingRunLoopMode);
  } catch (error) {
    logError('preferences-animation', error);
    finishPreferencesAnimation(target);
  }
  redrawPreferencesControls();
}

function preferencesButtonPressed() {
  if (!isExiting) setPreferencesExpanded(!preferencesExpanded, true);
}
