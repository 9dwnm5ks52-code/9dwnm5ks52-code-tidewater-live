#!/bin/bash
# start the local test server if it is not answering
if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:8766/index.html; then
  cd "$(dirname "$0")/dist" && setsid nohup python3 -m http.server 8766 --bind 127.0.0.1 >/dev/null 2>&1 < /dev/null &
  sleep 1
fi
