#!/usr/bin/env bash
# Run one WPT probe list against a FRESH obscura server and write the report to a file.
#
# Why a script: the campaign's dev loop has three sharp edges and this file blunts
# all three at once.
#   1. `pkill -f 'obscura serve'` exits 144, which aborts a chained `&&` — so it
#      gets its own line, and its exit status is discarded.
#   2. A script whose own command line contains the pattern it greps for kills
#      itself. The server is therefore killed by PID, recorded here.
#   3. The server degrades after many CDP sessions, so every sweep starts a new
#      one. A could-not-run that clears on a fresh server is degradation, not a
#      regression.
#
# Usage: scripts/wpt_sweep.sh <tests-file> <out-file> [timeout-seconds]
set -u
LIST="$1"; OUT="$2"; TMO="${3:-25}"
cd "$(dirname "$0")/.."

pkill -f 'obscura serve' >/dev/null 2>&1
sleep 1

./target/release/obscura serve --port 9222 --render-mode on-demand --stealth \
  > "${OUT}.server.log" 2>&1 &
SRV=$!
# Ready-check rather than a fixed sleep: the first CDP connect against a server
# that is still binding reads as a dead browser.
for _ in $(seq 1 60); do
  curl -s http://127.0.0.1:9222/json/version >/dev/null 2>&1 && break
  sleep 0.5
done

.venv/bin/python scripts/wpt_run.py --tests-file "$LIST" --timeout "$TMO" > "$OUT" 2>&1
RC=$?

kill "$SRV" >/dev/null 2>&1
echo "SWEEP_DONE rc=$RC list=$LIST out=$OUT"
