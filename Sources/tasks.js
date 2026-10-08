function resetRunningTasksRead() {
  resetBackgroundTask(runningReadState);
}

function startRunningTasksRead() {
  try {
    launchBackgroundTask('/usr/bin/sqlite3', [
      '-readonly',
      '-noheader',
      runningTasksPath,
      "ATTACH DATABASE '" + taskStateDatabasePath.replace(/'/g, "''") + "' AS state_db; " +
        "SELECT coalesce(max(t.started_at, coalesce((SELECT max(i.created_at_ms)/1000 " +
        "FROM thread_items i WHERE i.thread_id=t.thread_id AND i.turn_id=t.turn_id),0)),0) " +
        "FROM thread_turns t JOIN state_db.threads s ON s.id=t.thread_id " +
        "WHERE s.archived=0 AND t.status='inProgress' AND t.rollout_ordinal=" +
        "(SELECT max(n.rollout_ordinal) FROM thread_turns n WHERE n.thread_id=t.thread_id);"


    ], runningReadState, false);
  } catch (error) {
    logError('running-task-launch', error);
    resetRunningTasksRead();
  }
}

function requestRunningTasksRead(force) {
  if (!force && Date.now() - runningLastReadAt < (hasRunningTasks || menuIsOpen ? 2000 : 10000)) return;
  // A direct read every two seconds avoids stale task activity when SQLite
  // updates an already-sized WAL without changing its timestamp.
  if (runningReadState.task) {
    runningReadState.queued = true;
    return;
  }
  runningLastReadAt = Date.now();
  startRunningTasksRead();
}

function pollRunningTasksRead() {
  var task = runningReadState.task;
  if (!task) return;
  if (task.running) {
    // SQLite reads should finish almost immediately. Terminate a wedged child
    // so the next two-second check can retry instead of freezing task state.
    if (!runningReadState.timedOut &&
      Date.now() - runningReadState.startedAt > RUNNING_TASK_READ_TIMEOUT_MS) {
      runningReadState.timedOut = true;
      sendVoid(task, 'terminate');
    }
    return;
  }

  var outputPipe = runningReadState.outputPipe;
  resetRunningTasksRead();

  try {
    if (task.terminationStatus !== 0) throw new Error('The running-task reader exited unexpectedly.');
    var raw = readBackgroundTaskOutput(outputPipe);
    var activity = String(raw || '').trim().split(/\r?\n/).filter(function(row) { return row.length; });
    setRunningIndicator(activity.some(function(row) {
      return isExecutionFresh(Number(row), Date.now() / 1000, TASK_ACTIVITY_FRESHNESS_SECONDS);
    }));
    runningLastSuccessAt = Date.now();
  } catch (error) {
    logError('running-tasks', error);
    if (Date.now() - runningLastSuccessAt > 30000) setRunningIndicator(false);
  }



  if (runningReadState.queued) {
    runningReadState.queued = false;
    requestRunningTasksRead();
  }
}

// ===== Fixed threads ========================================================
// Codex stores the user's pinned conversations in the local state database.
// Read only the pinned section so this menu can follow pin/unpin changes
// without adding a second running-task section that was intentionally removed.
var pinnedTasksPath = codexDirectory + '/state_5.sqlite';
var pinnedTasksRevisionValue = null;
var PINNED_TASK_READ_TIMEOUT_MS = 5000;
var PINNED_THREADS_QUERY =
  "SELECT id || char(9) || replace(replace(replace(coalesce(nullif(name, ''), title), char(9), ' '), char(10), ' '), char(13), ' ') " +
  "FROM threads WHERE archived = 0 AND (is_pinned = 1 OR thread_section_id IN " +
  "(SELECT id FROM thread_sections WHERE name = 'Pinned')) " +
  "ORDER BY CASE WHEN section_position IS NULL THEN 2147483647 ELSE section_position END, updated_at_ms DESC;";

function resetPinnedThreadsRead() {
  resetBackgroundTask(pinnedReadState);
}

function startPinnedThreadsRead(revision) {
  try {
    launchBackgroundTask(
      '/usr/bin/sqlite3',
      ['-readonly', '-noheader', pinnedTasksPath, PINNED_THREADS_QUERY],
      pinnedReadState,
      false
    );
    pinnedReadState.revision = revision;
  } catch (error) {
    logError('pinned-task-launch', error);
    resetPinnedThreadsRead();
  }
}

function requestPinnedThreadsRead(force) {
  var revision = combinedRevision([pinnedTasksPath, pinnedTasksPath + '-wal']);
  if (!force && revision === pinnedTasksRevisionValue) return;
  if (pinnedReadState.task) {
    pinnedReadState.queued = true;
    return;
  }
  startPinnedThreadsRead(revision);
}

function pollPinnedThreadsRead() {
  var task = pinnedReadState.task;
  if (!task) return;
  if (task.running) {
    if (Date.now() - pinnedReadState.startedAt > PINNED_TASK_READ_TIMEOUT_MS) {
      sendVoid(task, 'terminate');
    }
    return;
  }

  var outputPipe = pinnedReadState.outputPipe;
  var revision = pinnedReadState.revision;
  resetPinnedThreadsRead();
  try {
    if (task.terminationStatus !== 0) throw new Error('The pinned-task reader exited unexpectedly.');
    var raw = readBackgroundTaskOutput(outputPipe);
    var threads = parsePinnedThreads(raw);
    var snapshotKey = JSON.stringify(threads);
    pinnedTasksRevisionValue = revision;
    // Do not remove/reinsert identical rows on every polling tick. Rebuilding
    // an unchanged NSMenu section is visible as a brief flicker while the
    // menu is open.
    if (snapshotKey !== pinnedTasksSnapshotKey) {
      pinnedTasksSnapshotKey = snapshotKey;
      updatePinnedTasksMenu(threads);
    }
  } catch (error) {
    logError('pinned-tasks', error);
  }

  if (pinnedReadState.queued) {
    pinnedReadState.queued = false;
    requestPinnedThreadsRead(true);
  }
}
