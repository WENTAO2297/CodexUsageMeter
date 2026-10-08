#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="${0:A:h}"
VERIFY_ROOT=$(/usr/bin/mktemp -d /private/tmp/codex-meter-verify.XXXXXX)
trap '/bin/rm -rf "$VERIFY_ROOT"' EXIT
for script in assemble.sh build.sh install-autostart.command uninstall-autostart.command keep-widget-running.zsh maomaoyun-autoconnect.zsh Sources/usage-reader.zsh; do
  /bin/zsh -n "$SCRIPT_DIR/$script"
done
/usr/bin/plutil -lint "$SCRIPT_DIR/com.wentao.codex-usage-meter-watch.plist" >/dev/null
/usr/bin/plutil -lint "$SCRIPT_DIR/Sources/AppInfo.plist" >/dev/null
/usr/bin/xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -fsyntax-only "$SCRIPT_DIR/Sources/app-launcher.m"
/bin/zsh "$SCRIPT_DIR/assemble.sh" > "$VERIFY_ROOT/main.js"
/usr/bin/osacompile -l JavaScript -o "$VERIFY_ROOT/main.scpt" "$VERIFY_ROOT/main.js"
[[ -s "$SCRIPT_DIR/Sources/chatgptTemplate@2x.png" ]]
if /usr/bin/grep -Eq 'pinnedPanel|toggleMenuPinned|unreadCompleted|CompletedTaskView|markAllCompletedRead|autoResume|AutoResume|resumeDesktopTasksAfterSessionReset' "$VERIFY_ROOT/main.js"; then
  print -u2 -- 'Removed feature code is still referenced.'; exit 1
fi
if command -v node >/dev/null; then
  node "$SCRIPT_DIR/Tests/regression.cjs"
  node "$SCRIPT_DIR/Tests/menu-contract.cjs"
  node "$SCRIPT_DIR/Tests/usage-reader.cjs"
else
  print -u2 -- 'Node is required for regression checks.'; exit 1
fi
if [[ "${1:-}" == '--live' ]]; then
  /bin/zsh "$SCRIPT_DIR/Sources/usage-reader.zsh" | /usr/bin/jq -e '.id == 2 and (.result | type == "object")' >/dev/null
  /usr/bin/sqlite3 -readonly "$HOME/.codex/thread_history_1.sqlite" 'SELECT thread_id, turn_id, created_at_ms FROM thread_items LIMIT 0;' >/dev/null
  /usr/bin/sqlite3 -readonly "$HOME/.codex/state_5.sqlite" 'SELECT id, is_pinned, archived FROM threads LIMIT 0;' >/dev/null
fi
print -- 'Verification passed.'
