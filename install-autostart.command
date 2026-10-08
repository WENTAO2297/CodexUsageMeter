#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="${0:A:h}"
LABEL=com.wentao.codex-usage-meter-watch
DOMAIN="gui/$(/usr/bin/id -u)"
INSTALL_DIR="$HOME/Library/Application Support/CodexUsageMeter"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_PATH="$HOME/Applications/Codex Usage Meter.app"
APP_EXEC="$APP_PATH/Contents/MacOS/CodexUsageMeter"
WIDGET_EXEC="$APP_PATH/Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/MacOS/applet"
LEGACY_EXEC="$INSTALL_DIR/AppBundle/CodexUsageMeterMenuBar.app/Contents/MacOS/applet"

exact_pids() {
  /bin/ps -axo pid=,command= | /usr/bin/awk -v executable="$1" '{pid=$1; sub(/^[[:space:]]*[0-9]+[[:space:]]+/, ""); if ($0 == executable) print pid}'
}
stop_program() {
  local executable="$1" meter_pid attempt
  for meter_pid in ${(f)$(exact_pids "$executable")}; do /bin/kill -TERM "$meter_pid" 2>/dev/null || true; done
  for attempt in {1..20}; do
    [[ -z "$(exact_pids "$executable")" ]] && return 0
    /bin/sleep 0.5
  done
  print -u2 -- "Application did not stop: $executable"
  return 1
}

# Never replace an unrelated application that happens to have the same name.
if [[ -e "$APP_PATH" ]]; then
  [[ "$(/usr/bin/plutil -extract CFBundleIdentifier raw "$APP_PATH/Contents/Info.plist")" == com.wentao.codex-usage-meter ]] || exit 1
fi
/bin/zsh "$SCRIPT_DIR/verify.sh"
/bin/mkdir -p "$INSTALL_DIR" "${PLIST_PATH:h}" "${APP_PATH:h}"
STAGE=$(/usr/bin/mktemp -d "$INSTALL_DIR/.install.XXXXXX")
stopped=0
new_installed=0
committed=0
old_loaded=0
/bin/launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 && old_loaded=1
cleanup() {
  if (( stopped && ! committed )); then
    print -u2 -- 'Install failed; restoring previous version.'
    /bin/launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
    if (( new_installed )); then
      stop_program "$APP_EXEC" || { print -u2 -- "Recovery files retained: $STAGE"; return; }
      stop_program "$WIDGET_EXEC" || { print -u2 -- "Recovery files retained: $STAGE"; return; }
      /bin/mv "$APP_PATH" "$STAGE/failed.app" || return
    fi
    if [[ -d "$STAGE/old/Application.app" ]]; then /bin/mv "$STAGE/old/Application.app" "$APP_PATH" || return; fi
    for item in AppBundle keep-widget-running.zsh maomaoyun-autoconnect.zsh; do
      if [[ -e "$STAGE/old/$item" ]]; then /bin/mv "$STAGE/old/$item" "$INSTALL_DIR/$item" || return; fi
    done
    if [[ -f "$STAGE/old/agent.plist" ]]; then
      /bin/cp "$STAGE/old/agent.plist" "$PLIST_PATH" || return
      if (( old_loaded )); then /bin/launchctl bootstrap "$DOMAIN" "$PLIST_PATH" || true; fi
    else /bin/rm -f "$PLIST_PATH"; fi
  fi
  /bin/rm -rf "$STAGE"
}
trap cleanup EXIT
/bin/mkdir -p "$STAGE/old"
/bin/zsh "$SCRIPT_DIR/build.sh" "$STAGE/new.app"
node "$SCRIPT_DIR/Tests/app-bundle.cjs" "$STAGE/new.app"
if [[ -f "$PLIST_PATH" ]]; then /bin/cp "$PLIST_PATH" "$STAGE/old/agent.plist"; fi
/bin/cp "$SCRIPT_DIR/$LABEL.plist" "$STAGE/agent.plist"
/usr/bin/plutil -insert ProgramArguments.0 -string "$APP_EXEC" "$STAGE/agent.plist"
/usr/bin/plutil -lint "$STAGE/agent.plist" >/dev/null
/bin/launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
stopped=1
stop_program "$APP_EXEC"
stop_program "$WIDGET_EXEC"
stop_program "$LEGACY_EXEC"
if [[ -d "$APP_PATH" ]]; then /bin/mv "$APP_PATH" "$STAGE/old/Application.app"; fi
for item in AppBundle keep-widget-running.zsh maomaoyun-autoconnect.zsh; do
  if [[ -e "$INSTALL_DIR/$item" ]]; then /bin/mv "$INSTALL_DIR/$item" "$STAGE/old/$item"; fi
done
/bin/mv "$STAGE/new.app" "$APP_PATH"
new_installed=1
/bin/cp "$STAGE/agent.plist" "$PLIST_PATH"
/bin/chmod 644 "$PLIST_PATH"
loaded=0
for attempt in {1..5}; do
  if /bin/launchctl bootstrap "$DOMAIN" "$PLIST_PATH"; then loaded=1; break; fi
  /bin/sleep 2
done
(( loaded )) || exit 1
/bin/sleep 3
/bin/launchctl print "$DOMAIN/$LABEL" >/dev/null
[[ -n "$(exact_pids "$APP_EXEC")" && -n "$(exact_pids "$WIDGET_EXEC")" ]]
# Keep one complete previous installation, including the legacy layout.
if [[ -d "$INSTALL_DIR/Rollback" ]]; then /bin/mv "$INSTALL_DIR/Rollback" "$STAGE/older-rollback"; fi
/bin/mv "$STAGE/old" "$INSTALL_DIR/Rollback"
committed=1
print -r -- "Installed and running: $APP_PATH. Previous version retained in Rollback."
