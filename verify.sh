#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="${0:A:h}"
VERIFY_ROOT=$(/usr/bin/mktemp -d /private/tmp/codex-meter-verify.XXXXXX)
trap '/bin/rm -rf "$VERIFY_ROOT"' EXIT
for script in assemble.sh build.sh install-autostart.command uninstall-autostart.command maomaoyun-autoconnect.zsh Sources/usage-reader.zsh; do
  /bin/zsh -n "$SCRIPT_DIR/$script"
done
/usr/bin/plutil -lint "$SCRIPT_DIR/com.wentao.codex-usage-meter-watch.plist" >/dev/null
/usr/bin/plutil -lint "$SCRIPT_DIR/Sources/AppInfo.plist" >/dev/null
/usr/bin/plutil -lint "$SCRIPT_DIR/Sources/VPNAccountInfo.plist" >/dev/null
/usr/bin/xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -fsyntax-only "$SCRIPT_DIR/Sources/app-launcher.m"
/usr/bin/xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -fsyntax-only "$SCRIPT_DIR/Sources/vpn-account.m"
/usr/bin/xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -fsyntax-only "$SCRIPT_DIR/Sources/token-history-reader.m"
/usr/bin/xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -fsyntax-only "$SCRIPT_DIR/Sources/token-profile-reader.m"
/usr/bin/xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -Wno-unused-function \
  -framework Cocoa -framework WebKit -framework Security -framework LocalAuthentication \
  "$SCRIPT_DIR/Tests/vpn-account.m" -o "$VERIFY_ROOT/vpn-account-test"
"$VERIFY_ROOT/vpn-account-test"
/bin/zsh "$SCRIPT_DIR/assemble.sh" > "$VERIFY_ROOT/main.js"
/usr/bin/osacompile -l JavaScript -o "$VERIFY_ROOT/main.scpt" "$VERIFY_ROOT/main.js"
[[ -s "$SCRIPT_DIR/Sources/chatgptTemplate@2x.png" ]]
if /usr/bin/grep -Eq 'pinned|Pinned|PINNED|unreadCompleted|CompletedTaskView|markAllCompletedRead|autoResume|AutoResume|resumeDesktopTasksAfterSessionReset|statusToolTip|menuToolTip|menuHelp|\.toolTip[[:space:]]*=' "$VERIFY_ROOT/main.js"; then
  print -u2 -- 'Removed feature code is still referenced.'; exit 1
fi
if command -v node >/dev/null; then
  node "$SCRIPT_DIR/Tests/architecture.cjs"
  node "$SCRIPT_DIR/Tests/regression.cjs"
  node "$SCRIPT_DIR/Tests/forecast.cjs"
  node "$SCRIPT_DIR/Tests/adaptive-forecast.cjs"
  node "$SCRIPT_DIR/Tests/forecast-display.cjs"
  node "$SCRIPT_DIR/Tests/observed-usage.cjs"
  node "$SCRIPT_DIR/Tests/token-forecast.cjs"
  node "$SCRIPT_DIR/Tests/token-meter.cjs"
  node "$SCRIPT_DIR/Tests/token-activity.cjs"
  node "$SCRIPT_DIR/Tests/activity-range.cjs"
  node "$SCRIPT_DIR/Tests/activity-range-hit.cjs"
  node "$SCRIPT_DIR/Tests/vpn-activity.cjs"
  node "$SCRIPT_DIR/Tests/meter-panels.cjs"
  node "$SCRIPT_DIR/Tests/meter-panels-ui.cjs"
  node "$SCRIPT_DIR/Tests/reset-date-font.cjs"
  node "$SCRIPT_DIR/Tests/token-disclosure.cjs"
  node "$SCRIPT_DIR/Tests/forecast-backtest.cjs"
  node "$SCRIPT_DIR/Tests/task-activity.cjs"
  node "$SCRIPT_DIR/Tests/vpn-traffic.cjs"
  node "$SCRIPT_DIR/Tests/vpn-wake.cjs"
  node "$SCRIPT_DIR/Tests/vpn-switch.cjs"
  node "$SCRIPT_DIR/Tests/vpn-header.cjs"
  node "$SCRIPT_DIR/Tests/status-display.cjs"
  node "$SCRIPT_DIR/Tests/status-alignment.cjs"
  node "$SCRIPT_DIR/Tests/status-symbol-alignment.cjs"
  node "$SCRIPT_DIR/Tests/display-animation.cjs"
  node "$SCRIPT_DIR/Tests/menu-contract.cjs"
  node "$SCRIPT_DIR/Tests/menu-actions.cjs"
  node "$SCRIPT_DIR/Tests/status-menu.cjs"
  node "$SCRIPT_DIR/Tests/menu-layout.cjs"
  node "$SCRIPT_DIR/Tests/menu-layout.cjs" --cards-only
  node "$SCRIPT_DIR/Tests/compact-metrics.cjs"
  node "$SCRIPT_DIR/Tests/localization.cjs"
  node "$SCRIPT_DIR/Tests/localization-audit.cjs"
  node "$SCRIPT_DIR/Tests/language-disclosure.cjs"
  node "$SCRIPT_DIR/Tests/preferences.cjs"
  node "$SCRIPT_DIR/Tests/preferences-hit.cjs"
  node "$SCRIPT_DIR/Tests/preferences-hover.cjs"
  node "$SCRIPT_DIR/Tests/menu-callback-safety.cjs"
  node "$SCRIPT_DIR/Tests/menu-tracking.cjs"
  node "$SCRIPT_DIR/Tests/hover-popups.cjs"
  node "$SCRIPT_DIR/Tests/usage-reader.cjs"
else
  print -u2 -- 'Node is required for regression checks.'; exit 1
fi
if [[ "${1:-}" == '--live' ]]; then
  /bin/zsh "$SCRIPT_DIR/Sources/usage-reader.zsh" | /usr/bin/jq -e '.id == 2 and (.result | type == "object")' >/dev/null
  /usr/bin/sqlite3 -readonly "$HOME/.codex/thread_history_1.sqlite" 'SELECT thread_id, turn_id, created_at_ms FROM thread_items LIMIT 0;' >/dev/null
  /usr/bin/sqlite3 -readonly "$HOME/.codex/state_5.sqlite" 'SELECT id, archived FROM threads LIMIT 0;' >/dev/null
fi
print -- 'Verification passed.'
