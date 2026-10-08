// Pinned menu presentation; tasks.js supplies validated thread snapshots.
function compactPinnedTitle(title) {
  var text = String(title || '').trim();
  // Keep long conversation titles from making the compact menu excessively
  // wide while preserving enough text to identify the fixed task.
  if (text.length > 26) return text.slice(0, 25) + '…';
  return text;
}

function removePinnedMenuItems() {
  if (!menu) return;
  for (var i = pinnedMenuItems.length - 1; i >= 0; i--) {
    var item = pinnedMenuItems[i];
    try {
      var index = menu.indexOfItem(item);
      if (index >= 0) menu.removeItemAtIndex(index);
    } catch (error) {
      // A menu can be in the middle of tracking when a database update lands.
    }
  }
  pinnedMenuItems = [];
}

function makePinnedHeaderItem() {
  var headerView = $.CodexUsageMeterPinnedHeaderView.alloc.initWithFrame(
    $.NSMakeRect(0, 0, MENU_WIDTH, 18)
  );
  var item = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent('', null, '');
  item.enabled = false;
  item.view = headerView;
  return item;
}

function updateTaskSectionsMenu() {
  if (!menu || !pinnedAnchorDividerItem) return;
  removePinnedMenuItems();

  var hasPinned = pinnedThreadsSnapshot && pinnedThreadsSnapshot.length;
  pinnedAnchorDividerItem.hidden = false;
  if (!hasPinned) return;

  var insertionIndex = menu.indexOfItem(pinnedAnchorDividerItem);
  if (insertionIndex < 0) return;
  insertionIndex++;

  var pinnedHeader = makePinnedHeaderItem();
  menu.insertItemAtIndex(pinnedHeader, insertionIndex++);
  pinnedMenuItems.push(pinnedHeader);

  for (var i = 0; i < pinnedThreadsSnapshot.length; i++) {
    var thread = pinnedThreadsSnapshot[i];
    var pinnedItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent(
      compactPinnedTitle(thread.title), 'openPinnedThread:', ''
    );
    pinnedItem.target = delegate;
    pinnedItem.enabled = true;
    pinnedItem.representedObject = $(thread.threadId);
    pinnedItem.toolTip = thread.title;
    menu.insertItemAtIndex(pinnedItem, insertionIndex++);
    pinnedMenuItems.push(pinnedItem);
  }

  var trailingDivider = menuDividerItem();
  menu.insertItemAtIndex(trailingDivider, insertionIndex);
  pinnedMenuItems.push(trailingDivider);
}

function updatePinnedTasksMenu(threads) {
  pinnedThreadsSnapshot = threads || [];
  updateTaskSectionsMenu();
}
