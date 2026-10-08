#!/bin/zsh
# Reads the local, already-authenticated Codex app-server protocol over stdio.
# It emits only the response to account/rateLimits/read on stdout.
set -euo pipefail
zmodload zsh/datetime
diagnose_usage=0
[[ "${1:-}" == '--diagnose' ]] && diagnose_usage=1

# Prefer the CLI shipped with the desktop app: a separately installed CLI can
# lag behind its authentication and rate-limit protocol. An explicit override
# is useful for diagnostics and deterministic reader tests, not model calls.
codex_bin=''
if [[ -n "${CODEX_USAGE_CLI:-}" ]]; then
  [[ "$CODEX_USAGE_CLI" == /* && -x "$CODEX_USAGE_CLI" ]] || {
    print -u2 -- 'usage-reader: CODEX_USAGE_CLI must be an executable absolute path.'
    exit 1
  }
  codex_bin="$CODEX_USAGE_CLI"
else
  for app_path in /Applications/ChatGPT.app /Applications/Codex.app "$HOME/Applications/ChatGPT.app" "$HOME/Applications/Codex.app"; do
    for candidate in "$app_path/Contents/Resources/codex-cli/bin/codex" "$app_path/Contents/Resources/codex"; do
      if [[ -x "$candidate" ]]; then codex_bin="$candidate"; break 2; fi
    done
  done
  if [[ -z "$codex_bin" ]]; then
    for candidate in /opt/homebrew/bin/codex /usr/local/bin/codex /usr/bin/codex; do
      if [[ -x "$candidate" ]]; then codex_bin="$candidate"; break; fi
    done
  fi
fi
if [[ -z "$codex_bin" ]]; then
  print -u2 -- 'Codex CLI was not found. Install and sign in to Codex first.'
  exit 1
fi
if (( diagnose_usage )); then print -u2 -- "usage-reader: CLI $codex_bin"; fi

# Keep these below the widget's 50s outer watchdog. Shorter overrides let
# offline tests exercise failures without a long blocking wait.
initialize_timeout=${CODEX_USAGE_INITIALIZE_TIMEOUT_SECONDS:-15}
quota_timeout=${CODEX_USAGE_QUOTA_TIMEOUT_SECONDS:-30}
[[ "$initialize_timeout" == <-> && "$quota_timeout" == <-> ]] &&
  (( initialize_timeout >= 1 && initialize_timeout <= 15 && quota_timeout >= 1 && quota_timeout <= 30 )) || {
    print -u2 -- 'usage-reader: invalid phase timeout.'
    exit 1
  }

coproc "$codex_bin" app-server --stdio
coproc_pid=$!

cleanup() {
  if [[ -n "${coproc_pid:-}" ]]; then
    kill "$coproc_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# app-server normally answers in well under a second. If it is starting,
# temporarily unavailable, or waiting on a stale socket, do not leave the
# menu-bar app blocked forever. The next scheduled refresh will retry.
wait_for_id() {
  local wanted="$1"
  local timeout="$2"
  local phase="$3"
  local line
  local -F started_at=$EPOCHREALTIME

  while (( EPOCHREALTIME - started_at < timeout )); do
    if read -r -t 1 -p line 2>/dev/null; then
      if print -r -- "$line" | /usr/bin/jq -e --argjson wanted "$wanted" '.id == $wanted' >/dev/null 2>&1; then
        if print -r -- "$line" | /usr/bin/jq -e '.error != null' >/dev/null 2>&1; then
          local error_code
          error_code=$(print -r -- "$line" | /usr/bin/jq -r '.error.code // "unknown"')
          print -u2 -- "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ') usage-reader: $phase returned RPC error $error_code"
          return 1
        fi
        if (( diagnose_usage )); then
          printf >&2 'usage-reader: %s completed in %.3fs\n' "$phase" "$(( EPOCHREALTIME - started_at ))"
        fi
        print -r -- "$line"
        return 0
      fi
    elif ! kill -0 "$coproc_pid" 2>/dev/null; then
      # A failed app-server used to make zsh retry read immediately until the
      # timeout elapsed. Exit at once so an outage cannot turn into a busy loop.
      print -u2 -- "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ') usage-reader: app-server exited while waiting for $phase"
      return 1
    fi
  done
  print -u2 -- "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ') usage-reader: $phase timed out after ${timeout}s"
  return 1
}

print -p -- '{"id":1,"method":"initialize","params":{"clientInfo":{"name":"Codex Usage Meter","version":"1.0.0"},"capabilities":{"experimentalApi":true}}}'
wait_for_id 1 "$initialize_timeout" initialize >/dev/null || exit 1

print -p -- '{"method":"initialized"}'
print -p -- '{"id":2,"method":"account/rateLimits/read","params":null}'
wait_for_id 2 "$quota_timeout" account/rateLimits/read || exit 1
