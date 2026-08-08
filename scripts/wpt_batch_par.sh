#!/usr/bin/env bash
# Shard a probe list across N independent servers and run the shards CONCURRENTLY.
#
# ⚠️ This is NOT "run tests concurrently against one server" — that is the thing
# the campaign has always warned about, and it really does corrupt results. Each
# shard here gets its OWN server on its OWN port, restarted per chunk exactly as
# wpt_batch.sh does, and never touches anybody else's. The two rules that make it
# safe are both about isolation, not speed:
#
#   1. Kill ONLY our own server PID. `pkill -f 'obscura serve'` — which
#      wpt_batch.sh uses — matches every shard's server and every other server on
#      the machine, so two batches running at once quietly murder each other's
#      chunks mid-test. Every one of those shows up as a `nav-error` row, which
#      is indistinguishable from a regression if you only read the table.
#   2. One binary, one list, one timeout for all shards, so a row means the same
#      thing whichever shard produced it.
#
# Shards are dealt ROUND-ROBIN, not in contiguous blocks: the big slow files in a
# probe list tend to cluster (all the idlharness ones together, all the gradient
# ones together), and contiguous shards would leave one worker running long after
# the rest had finished.
#
# Usage: scripts/wpt_batch_par.sh <tests-file> <out-file> [shards] [chunk] [timeout] [binary]
set -u
LIST="$1"; OUT="$2"; SHARDS="${3:-3}"; CHUNK="${4:-4}"; TMO="${5:-25}"
BIN="${6:-./target/release/obscura}"
cd "$(dirname "$0")/.."

# Pre-flight: refuse to start if any shard port is already listening. Cheaper to
# fail here than to discover it in the results table — see the FATAL check below.
for i in $(seq 0 $((SHARDS - 1))); do
  p=$((9400 + i))
  if curl -s --max-time 1 "http://127.0.0.1:$p/json/version" >/dev/null 2>&1; then
    echo "[par] FATAL: port $p is already serving. A previous run left a server behind." >&2
    echo "[par] Kill it first:  ss -ltnp | grep $p" >&2
    exit 1
  fi
done

WORK="$(mktemp -d)"
grep -vE '^\s*(#|$)' "$LIST" > "$WORK/all.txt"
TOTAL=$(wc -l < "$WORK/all.txt")
awk -v n="$SHARDS" -v w="$WORK" '{ print > (w "/shard." (NR % n)) }' "$WORK/all.txt"

echo "[par] $TOTAL tests over $SHARDS shards, chunk=$CHUNK timeout=${TMO}s binary=$BIN"

run_shard() {
  local shard="$1" idx="$2" port="$3" out="$4"
  local sdir="$WORK/w$idx"
  mkdir -p "$sdir"
  split -l "$CHUNK" "$shard" "$sdir/chunk."
  : > "$out"
  for c in "$sdir"/chunk.*; do
    "$BIN" serve --port "$port" --render-mode on-demand --stealth > "$sdir/server.log" 2>&1 &
    local srv=$!
    for _ in $(seq 1 60); do
      curl -s "http://127.0.0.1:$port/json/version" >/dev/null 2>&1 && break
      sleep 0.5
    done
    # ⚠️⚠️ THE PORT MUST BE OURS. If a server from an EARLIER run is still bound
    # to this port — orphaned by a killed parent shell, or by a chunk whose
    # `kill` raced — then our server exits with "Address already in use", the
    # ready-check curl above SUCCEEDS against the stale one, and this whole run
    # silently measures the OLD BINARY. It does not error. It produces a
    # complete, plausible, entirely wrong table, which is the worst failure a
    # measurement tool can have. (This cost the editing arc one full probe pass:
    # 43 files that all came back at exactly their pre-arc baselines.)
    if ! kill -0 "$srv" 2>/dev/null; then
      echo "[par] FATAL: server for port $port died (port already in use?) — see $sdir/server.log" >&2
      echo "[par] FATAL: port $port was not ours; rows would have measured a STALE binary" >> "$out"
      return 1
    fi
    # ⚠️ A HARD wall-clock cap on the whole chunk, on top of wpt_run's per-test
    # timeout. The per-test timeout lives INSIDE the page: it cannot fire if the
    # engine itself has stopped answering. A single `ctx.strokeRect(0, 0,
    # Infinity, 50)` used to spin the runtime forever, and one shard of this
    # runner sat on that one file for THIRTY-FOUR MINUTES with a 25-second
    # timeout set. Budget the whole chunk instead, so a wedged engine costs one
    # chunk and shows up as missing rows rather than eating the run.
    local wall=$(( (TMO + 10) * CHUNK ))
    timeout -k 10 "$wall" .venv/bin/python scripts/wpt_run.py --tests-file "$c" \
      --cdp "http://127.0.0.1:$port" --timeout "$TMO" 2>&1 \
      | grep -vE '^\s*$|^-+$|^\[cdp\]' >> "$out"
    if [ "${PIPESTATUS[0]}" = "124" ]; then
      echo "[par] chunk $c exceeded ${wall}s wall clock — engine wedged, rows dropped" >> "$out"
    fi
    # Only ever kill OUR server. See rule 1 above.
    kill "$srv" >/dev/null 2>&1
    wait "$srv" 2>/dev/null
  done
}

i=0
pids=()
for s in "$WORK"/shard.*; do
  port=$((9400 + i))
  run_shard "$s" "$i" "$port" "$WORK/out.$i" &
  pids+=($!)
  i=$((i + 1))
done
for p in "${pids[@]}"; do wait "$p"; done

cat "$WORK"/out.* > "$OUT"

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
