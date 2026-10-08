#!/bin/zsh
set -euo pipefail

LABEL="com.wentao.codex-usage-meter-watch"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$AGENTS_DIR/$LABEL.plist"
INSTALL_DIR="$HOME/Library/Application Support/CodexUsageMeter"
DOMAIN="gui/$(id -u)"
APP_PATH="$HOME/Applications/Codex Usage Meter.app"

if [[ -e "$APP_PATH" ]]; then
  [[ "$(/usr/bin/plutil -extract CFBundleIdentifier raw "$APP_PATH/Contents/Info.plist")" == com.wentao.codex-usage-meter ]] || exit 1
fi

stop_meter() {
  local executable="$1" meter_pid
  while read -r meter_pid; do
    [[ -n "$meter_pid" ]] || continue
    /bin/kill "$meter_pid" >/dev/null 2>&1 || true
  done < <(/bin/ps -axo pid=,command= | /usr/bin/awk -v executable="$executable" '{pid=$1; sub(/^[[:space:]]*[0-9]+[[:space:]]+/, ""); if ($0 == executable) print pid}')
}

/bin/launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
stop_meter "$APP_PATH/Contents/MacOS/CodexUsageMeter"
/bin/sleep 1
stop_meter "$APP_PATH/Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/MacOS/applet"
stop_meter "$INSTALL_DIR/AppBundle/CodexUsageMeterMenuBar.app/Contents/MacOS/applet"
rm -f "$PLIST_PATH"
rm -rf "$APP_PATH" "$INSTALL_DIR"
echo "已卸载 Codex Usage Meter App、自启动及本地数据（包括回滚副本）。项目源码未删除。"
