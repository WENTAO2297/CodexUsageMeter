#!/bin/zsh
set -u
SCRIPT_DIR="${0:A:h}"
METER_EXEC="$SCRIPT_DIR/AppBundle/CodexUsageMeterMenuBar.app/Contents/MacOS/applet"
VPN_HELPER="$SCRIPT_DIR/maomaoyun-autoconnect.zsh"
LOG_PATH="$SCRIPT_DIR/widget-process.log"
meter_pid=''
vpn_pid=''
stop_children() {
  for child in "$meter_pid" "$vpn_pid"; do
    if [[ -n "$child" ]]; then /bin/kill "$child" 2>/dev/null || true; fi
  done
}
trap stop_children EXIT
trap 'exit 0' INT TERM
if [[ -f "$VPN_HELPER" ]]; then
  /bin/zsh "$VPN_HELPER" >> "$LOG_PATH" 2>&1 &
  vpn_pid=$!
fi
while true; do
  if [[ ! -x "$METER_EXEC" ]]; then /bin/sleep 2; continue; fi
  if [[ -f "$LOG_PATH" ]] && (( $(/usr/bin/stat -f %z "$LOG_PATH") > 200000 )); then
    /bin/mv -f "$LOG_PATH" "$LOG_PATH.previous"
  fi
  "$METER_EXEC" >> "$LOG_PATH" 2>&1 &
  meter_pid=$!
  wait "$meter_pid"
  child_exit=$?
  print -r -- "$(/bin/date -u) widget exited: $child_exit" >> "$LOG_PATH"
  meter_pid=''
  /bin/sleep 2
done
