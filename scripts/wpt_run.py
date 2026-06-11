#!/usr/bin/env python3
"""Run Web Platform Tests against Obscura over CDP and print a conformance report.

Each WPT test is an HTML page that loads testharness.js and runs subtests. We
drive Obscura to the page, register an `add_completion_callback` to collect the
results once the harness finishes, and tally pass/fail/timeout per test.

Usage:
    # start a render-enabled server first, e.g.:
    #   ./target/release/obscura serve --port 9222 --render-mode on-demand
    python scripts/wpt_run.py dom/nodes/Node-appendChild.html dom/nodes/Element-matches.html
    python scripts/wpt_run.py --tests-file wpt_tests.txt --base https://wpt.live

Pass either WPT-relative paths (joined to --base) or full http(s) URLs.
"""
import argparse
import asyncio
import json
import re
import sys

from playwright.async_api import async_playwright

# testharness subtest status codes
SUB = {0: "PASS", 1: "FAIL", 2: "TIMEOUT", 3: "NOTRUN"}
# testharness harness status codes
HARNESS = {0: "OK", 1: "ERROR", 2: "TIMEOUT", 3: "PRECONDITION_FAILED"}

# Grab the rendered results table's HTML + the harness-status text. testharness
# renders results into a #results <table>; Obscura's selector engine can't query
# <tr>/<td> (a real bug), so we parse the HTML string in Python instead.
SCRAPE_JS = """
() => {
  const r = document.getElementById('results');
  const log = document.getElementById('log');
  return JSON.stringify({
    hasHarness: typeof add_completion_callback === 'function',
    harnessText: log ? (log.textContent || '') : '',
    resultsHTML: r ? r.outerHTML : ''
  });
}
"""
PUMP_JS = "() => new Promise(r => setTimeout(r, 4500))"

# Authoritative counts from testharness's summary line, e.g.
#   "… Found 11 tests 1 Pass 10 Fail" (Timeout / Not Run appear when present).
def _num(text, pat):
    m = re.search(pat, text)
    return int(m.group(1)) if m else 0


def parse_summary(text):
    found = _num(text, r"Found (\d+) tests?")
    if not found and "Found 0 tests" not in text:
        return None
    return {
        "found": found,
        "pass": _num(text, r"(\d+)\s*Pass"),
        "fail": _num(text, r"(\d+)\s*Fail"),
        "timeout": _num(text, r"(\d+)\s*Timeout"),
        "notrun": _num(text, r"(\d+)\s*Not Run"),
    }


# Best-effort failing-subtest names for --verbose (the row regex; undercounts
# when names contain markup, which is fine for a hint).
_FAIL_RE = re.compile(r'<td class="(?:fail|timeout)"[^>]*>(?:Fail|Timeout)</td>\s*<td[^>]*>([^<]+)</td>',
                      re.IGNORECASE)


async def run_one(ctx, url, timeout):
    """Run one test on a FRESH page (own page thread; no carried-over state) and
    return (ok_to_score, dict|errstr)."""
    page = await ctx.new_page()
    try:
        return await _run_on_page(page, url, timeout)
    finally:
        try:
            await page.close()
        except Exception:  # noqa: BLE001
            pass


async def _run_on_page(page, url, timeout):
    try:
        await page.goto(url, wait_until="load", timeout=timeout * 1000)
    except Exception as exc:  # noqa: BLE001
        return False, f"nav-error: {str(exc)[:60]}"

    iters = max(2, int(timeout // 4) + 1)
    for _ in range(iters):
        try:
            data = json.loads(await page.evaluate(SCRAPE_JS))
        except Exception:  # noqa: BLE001
            data = {}
        text = data.get("harnessText", "")
        summary = parse_summary(text)
        if summary is not None:
            summary["harness"] = 0 if "Harness status: OK" in text else (
                2 if "Timeout" in text else 1)
            summary["fail_names"] = [n.strip() for n in _FAIL_RE.findall(data.get("resultsHTML", ""))]
            return True, summary
        if not data.get("hasHarness") and not data.get("resultsHTML"):
            return False, "testharness did not load / run"
        try:
            await asyncio.wait_for(page.evaluate(PUMP_JS), timeout=8)
        except Exception:  # noqa: BLE001
            pass
    return False, "no-results (test ran but summary never appeared)"


async def main_async(args):
    base = args.base.rstrip("/")
    tests = list(args.tests)
    if args.tests_file:
        with open(args.tests_file, encoding="utf-8") as f:
            tests += [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
    if not tests:
        print("no tests given", file=sys.stderr)
        return 2

    total_sub = total_pass = total_fail = total_other = 0
    loaded = unloaded = 0

    async with async_playwright() as p:
        print(f"[cdp] connecting to {args.cdp}", flush=True)
        browser = await p.chromium.connect_over_cdp(args.cdp)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()

        print(f"\n{'TEST':54} {'PASS/TOTAL':>11}  HARNESS", flush=True)
        print("-" * 80, flush=True)
        for t in tests:
            url = t if t.startswith("http") else f"{base}/{t.lstrip('/')}"
            ok, data = await run_one(ctx, url, args.timeout)
            label = t if len(t) <= 54 else "…" + t[-53:]
            if not ok:
                unloaded += 1
                print(f"{label:54} {'—':>11}  {data}", flush=True)
                continue
            loaded += 1
            found = data["found"]
            p_ = data["pass"]
            f_ = data["fail"]
            o_ = data.get("timeout", 0) + data.get("notrun", 0)
            total_sub += found; total_pass += p_; total_fail += f_; total_other += o_
            hs = HARNESS.get(data["harness"], str(data["harness"]))
            print(f"{label:54} {f'{p_}/{found}':>11}  {hs}", flush=True)
            if args.verbose:
                for n in data.get("fail_names", [])[:12]:
                    print(f"      FAIL  {n}", flush=True)

        await browser.close()

    print("-" * 80, flush=True)
    print(f"Tests loaded: {loaded}   could-not-run: {unloaded}", flush=True)
    if total_sub:
        rate = 100.0 * total_pass / total_sub
        print(f"Subtests: {total_pass} PASS / {total_fail} FAIL / {total_other} other "
              f"= {total_sub} total  ({rate:.1f}% pass)", flush=True)
    return 0


def main():
    ap = argparse.ArgumentParser(description="Run WPT against Obscura over CDP.")
    ap.add_argument("tests", nargs="*", help="WPT paths (joined to --base) or full URLs")
    ap.add_argument("--tests-file", help="file with one WPT path/URL per line (# comments ok)")
    ap.add_argument("--cdp", default="http://127.0.0.1:9222")
    ap.add_argument("--base", default="https://wpt.live")
    ap.add_argument("--timeout", type=float, default=30.0, help="per-test seconds (default 30)")
    ap.add_argument("--verbose", "-v", action="store_true", help="list failing subtests")
    args = ap.parse_args()
    try:
        return asyncio.run(main_async(args))
    except Exception as exc:  # noqa: BLE001
        print(f"[error] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
