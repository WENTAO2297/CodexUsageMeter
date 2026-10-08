#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="${0:A:h}"
while IFS= read -r source_name || [[ -n "$source_name" ]]; do
  [[ -z "$source_name" || "$source_name" == \#* ]] && continue
  /bin/cat "$SCRIPT_DIR/Sources/$source_name.js"
  print
done < "$SCRIPT_DIR/Sources/modules.list"
