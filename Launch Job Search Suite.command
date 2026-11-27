#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

node scripts/launch.js "$@"
status=$?

if [ "$status" -ne 0 ]; then
  echo
  read -r -p "Press Enter to close..." _
fi

exit "$status"
