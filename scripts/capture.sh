#!/usr/bin/env bash
# One reliable capture = one fresh Obscura server.
#
# Obscura serves all pages from a single shared V8/render thread (issue #19).
# In practice only the FIRST Playwright capture after a fresh start is reliable;
# later captures against the same server stall (page.content() guard fails,
# screenshot times out). So this wrapper starts a throwaway server on an
# ephemeral port, runs exactly one capture, and tears the server down.
#
# Usage:  scripts/capture.sh <URL> <PREFIX> [extra cdp_capture.py flags...]
# Examples:
#   scripts/capture.sh https://hermesdata.io out/hermes --wait 10
#   scripts/capture.sh https://hermesdata.io out/hermes --wait 5 --full-page
set -euo pipefail

USAGE="usage: capture.sh <URL> <PREFIX> [--wait N] [--full-page] [--screenshot-timeout N]"
URL="${1:?$USAGE}"
PREFIX="${2:?$USAGE}"
shift 2          # everything left is forwarded verbatim to cdp_capture.py

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/target/release/obscura"
PY="$ROOT/.venv/bin/python"
PORT=$(( (RANDOM % 1000) + 9300 ))

[ -x "$BIN" ] || { echo "missing $BIN (build with: cargo build --release --features render)"; exit 1; }

echo "[srv] starting fresh Obscura on :$PORT"
"$BIN" serve --host 127.0.0.1 --port "$PORT" \
    --render-mode on-demand --stealth --window-size 1280x2000 \
    >"/tmp/obscura_capture_$PORT.log" 2>&1 &
SRV=$!
# Always tear the server down, however we exit.
trap 'kill "$SRV" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
    curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && break
    # Bail early if the server died on startup.
    kill -0 "$SRV" 2>/dev/null || { echo "[srv] died on startup; see /tmp/obscura_capture_$PORT.log"; exit 1; }
    sleep 0.3
done

# --cdp is fixed to this throwaway server; --screenshot-timeout 25 is a default
# that any user-supplied "$@" value overrides (argparse keeps the last one).
"$PY" "$ROOT/scripts/cdp_capture.py" "$URL" "$PREFIX" \
    --cdp "http://127.0.0.1:$PORT" --screenshot-timeout 25 "$@"
