#!/usr/bin/env bash
# Run a probe list in SMALL CHUNKS, each against a freshly started server.
#
# ⚠️ Why this exists (measured, 2026-08-06). A single long sweep of `xhr` managed
# FIVE files in twenty-five minutes; the same file on a fresh server takes TEN
# SECONDS. The server degrades after a handful of CDP sessions — badly enough
# that everything downstream of the wedge reads as `nav-error` or
# `testharness did not load`, which is indistinguishable from a regression if you
# only look at the table. Restarting per chunk keeps every row honest and turns a
# 25-minute five-file crawl into a full list in minutes.
#
# Usage: scripts/wpt_batch.sh <tests-file> <out-file> [chunk-size] [timeout-seconds]
set -u
LIST="$1"; OUT="$2"; CHUNK="${3:-5}"; TMO="${4:-20}"
cd "$(dirname "$0")/.."

WORK="$(mktemp -d)"
grep -vE '^\s*(#|$)' "$LIST" > "$WORK/all.txt"
split -l "$CHUNK" "$WORK/all.txt" "$WORK/chunk."

: > "$OUT"
for c in "$WORK"/chunk.*; do
  pkill -f 'obscura serve' >/dev/null 2>&1
  sleep 1
  ./target/release/obscura serve --port 9222 --render-mode on-demand --stealth \
    > "$WORK/server.log" 2>&1 &
  SRV=$!
  for _ in $(seq 1 60); do
    curl -s http://127.0.0.1:9222/json/version >/dev/null 2>&1 && break
    sleep 0.5
  done
  .venv/bin/python scripts/wpt_run.py --tests-file "$c" --timeout "$TMO" 2>&1 \
    | grep -vE '^\s*$|^-+$|^\[cdp\]' >> "$OUT"
  kill "$SRV" >/dev/null 2>&1
  wait "$SRV" 2>/dev/null
done
pkill -f 'obscura serve' >/dev/null 2>&1

# Totals, recomputed from the collected rows so the summary cannot drift from them.
awk '{
  n=split($0, f, /[ \t]+/);
  for (i = 1; i <= n; i++) {
    if (f[i] ~ /^[0-9]+\/[0-9]+$/) { split(f[i], r, "/"); p += r[1]; t += r[2]; files++; found=1 }
  }
  if (!found) cnr++
  found=0
} END {
  printf "\nfiles-scored=%d could-not-run=%d  PASS %d / %d\n", files, cnr, p, t
}' "$OUT" | tee -a "$OUT"
rm -rf "$WORK"
echo "BATCH_DONE out=$OUT"
