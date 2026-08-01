#!/usr/bin/env python3
"""Diff a sweep's results against the recorded WPT_PROGRESS.md ledger values.

The campaign's promise is zero regressions per commit, and the ledger is what
"no regression" is measured against. This turns a sweep transcript into three
lists: REGRESSED (below the recorded row), GAINED (above it), and rows the
ledger does not carry.

Usage:
    python scripts/wpt_ledger_diff.py <sweep-output.txt>
"""
import json
import re
import sys

LEDGER = "WPT_PROGRESS.md"


def ledger_map():
    rows = {}
    for line in open(LEDGER):
        m = re.match(r"\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|", line)
        if not m:
            continue
        path, _before, latest = m.groups()
        if "{" in path:
            continue
        lat = re.sub(r"\*\*|\s", "", latest)
        mm = re.match(r"^(\d+)/(\d+)$", lat)
        if mm:
            rows[path] = (int(mm.group(1)), int(mm.group(2)))
    return rows


def parse_sweep(path):
    """wpt_run.py prints an elided path + `pass/total`. Match on the tail."""
    out = []
    for line in open(path):
        m = re.match(r"^\s*(\S+)\s+(\d+)/(\d+)\s+", line)
        if m:
            out.append((m.group(1), int(m.group(2)), int(m.group(3))))
        elif "no-results" in line or "could-not-run" in line:
            frag = line.split()[0]
            out.append((frag, None, None))
    return out


def main(sweep):
    led = ledger_map()
    regressed, gained, unknown = [], [], []
    for frag, p, t in parse_sweep(sweep):
        tail = frag.lstrip("…")
        hits = [k for k in led if k.endswith(tail)]
        if len(hits) != 1:
            unknown.append((frag, p, t))
            continue
        key = hits[0]
        want = led[key][0]
        if p is None:
            regressed.append((key, "could-not-run", want))
        elif p < want:
            regressed.append((key, p, want))
        elif p > want:
            gained.append((key, p, want))
    print(f"== REGRESSED ({len(regressed)}) ==")
    for k, got, want in regressed:
        print(f"  {k}: {got} (ledger {want})")
    print(f"== GAINED ({len(gained)}) ==")
    for k, got, want in gained:
        print(f"  {k}: {got} (ledger {want})")
    print(f"== not in ledger ({len(unknown)}) ==")


if __name__ == "__main__":
    main(sys.argv[1])
