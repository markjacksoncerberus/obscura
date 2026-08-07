#!/usr/bin/env python3
"""Diff two `wpt_batch.sh` output files PER FILE.

The zero-regression promise is only checkable if the comparison is per file, not
per total: a sweep can hold its overall count while one realm drops and another
rises. This reads the two collected row-sets, matches on test path, and prints
every row that moved — plus the rows present in one run and not the other, which
is where a could-not-run hides.

    scripts/wpt_batch_diff.py <before.txt> <after.txt>

Exit status is 1 if anything REGRESSED, so it can gate a commit.
"""
import re
import sys

ROW = re.compile(r"^(\S+)\s+(?:(\d+)/(\d+)|(—))\s+(\S.*)?$")


def load(path):
    """path -> (pass, total) or None for a row that could not be scored."""
    rows = {}
    with open(path) as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith(("TEST", "Tests loaded", "Subtests", "files-scored")):
                continue
            m = ROW.match(line)
            if not m:
                continue
            name = m.group(1)
            # wpt_run.py elides a long path with a leading ellipsis; those rows
            # cannot be matched reliably, so they are reported rather than dropped.
            rows[name] = None if m.group(4) else (int(m.group(2)), int(m.group(3)))
    return rows


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    before, after = load(sys.argv[1]), load(sys.argv[2])

    down, up, appeared, vanished = [], [], [], []
    for name in sorted(set(before) | set(after)):
        b, a = before.get(name, "absent"), after.get(name, "absent")
        if b == "absent":
            appeared.append((name, a))
            continue
        if a == "absent":
            vanished.append((name, b))
            continue
        if b == a:
            continue
        # A row that stopped scoring is a regression until proven otherwise —
        # late-run server degradation looks exactly like one, so it must be
        # re-run on a fresh server rather than waved through here.
        if a is None or (b is not None and a[0] < b[0]):
            down.append((name, b, a))
        else:
            up.append((name, b, a))

    def fmt(v):
        return "could-not-run" if v is None else "%d/%d" % v

    for label, items in (("REGRESSED", down), ("improved", up)):
        if items:
            print("\n== %s (%d) ==" % (label, len(items)))
            for name, b, a in items:
                print("  %-62s %s -> %s" % (name, fmt(b), fmt(a)))
    for label, items in (("only in AFTER", appeared), ("only in BEFORE", vanished)):
        if items:
            print("\n== %s (%d) ==" % (label, len(items)))
            for name, v in items:
                print("  %-62s %s" % (name, fmt(v)))

    tot = lambda rows: (sum(v[0] for v in rows.values() if v),
                        sum(v[1] for v in rows.values() if v),
                        sum(1 for v in rows.values() if v is None))
    print("\nbefore: %d/%d  (%d could-not-run, %d rows)" % (*tot(before), len(before)))
    print("after:  %d/%d  (%d could-not-run, %d rows)" % (*tot(after), len(after)))
    print("\n%s" % ("REGRESSIONS PRESENT" if down else "0 regressions"))
    return 1 if down else 0


if __name__ == "__main__":
    sys.exit(main())
