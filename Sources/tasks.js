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
        // A desktop conversation can retain its ID after switching to another
        // rollout. Its current turns are then keyed by the rollout's UUID,
        // not the conversation ID. Prefer that history when it exists; do
        // not combine it with an old, possibly unfinished conversation turn.
        "WITH current_threads AS (SELECT s.id, coalesce((SELECT h.thread_id " +
        "FROM thread_turns h WHERE substr(s.rollout_path,-6)='.jsonl' " +
        "AND h.thread_id=substr(s.rollout_path,-42,36) LIMIT 1),s.id) AS execution_id " +
        "FROM state_db.threads s WHERE s.archived=0) " +
        "SELECT coalesce(max(t.started_at, coalesce((SELECT max(i.created_at_ms)/1000 " +
        "FROM thread_items i WHERE i.thread_id=t.thread_id AND i.turn_id=t.turn_id),0)),0) " +
        "FROM thread_turns t JOIN current_threads s ON s.execution_id=t.thread_id " +
        "WHERE t.status='inProgress' AND t.rollout_ordinal=" +
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
