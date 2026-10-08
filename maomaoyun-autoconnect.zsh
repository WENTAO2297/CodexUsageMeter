#!/bin/zsh

# Connect MaoMaoYun's registered macOS VPN service after the Codex widget
# watcher invokes this helper. It intentionally does not open MaoMaoYun.app.

set -u

service_name="MaoMaoYun"
log_path="/tmp/maomaoyun-autoconnect-v2.log"

# Keep only the current login attempt so this diagnostic file cannot grow
# without bound across repeated watcher restarts.
: > "$log_path"
print -r -- "$(/bin/date '+%Y-%m-%d %H:%M:%S') start" >> "$log_path"

# Give the widget and the Network Extension time to settle after login.
/bin/sleep 8

# The Network Extension can take a few seconds to register after login.
# Retry briefly so the VPN is connected even when the app starts slowly.
connected_checks=0
for attempt in {1..12}; do
  vpn_state="$(/usr/sbin/scutil --nc status "$service_name" 2>/dev/null | /usr/bin/sed -n '1p')"
  print -r -- "$(/bin/date '+%Y-%m-%d %H:%M:%S') attempt=$attempt state=$vpn_state" >> "$log_path"
  if [[ "$vpn_state" == "Connected" ]]; then
    (( connected_checks += 1 ))
    if (( connected_checks >= 2 )); then
      print -r -- "$(/bin/date '+%Y-%m-%d %H:%M:%S') connected-stable" >> "$log_path"
      exit 0
    fi
    /bin/sleep 2
    continue
  fi

  connected_checks=0
  if [[ "$vpn_state" != "Connecting" && "$vpn_state" != "Disconnecting" ]]; then
    /usr/sbin/scutil --nc start "$service_name" >> "$log_path" 2>&1 || true
  fi
  /bin/sleep 6
done

print -r -- "$(/bin/date '+%Y-%m-%d %H:%M:%S') gave up" >> "$log_path"
exit 1
