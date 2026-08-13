#!/usr/bin/env python3
"""Stratified WPT baseline sweep: run a list of testharness tests ONE AT A TIME
(concurrent CDP pages corrupt results) and emit a per-realm + global scorecard.

Measures testharness (scripted-assertion) tests only — it CANNOT score CSS
reftests (visual screenshot comparisons), which are most of css/. A 'could-not-run'
means the testharness never completed (feature missing / setup throw / timeout),
which is itself an honest signal: the engine can't even run that test.

Usage: wpt_baseline.py --list <file> [--timeout 30] [--out baseline.json]
"""
import argparse, asyncio, json, os, re, sys, time
from collections import defaultdict
from playwright.async_api import async_playwright

# The test_driver → in-page input bridge from wpt_run: without it every test
# that drives real input (test_driver.click / send_keys / Actions) sits waiting
# for a driver that never answers and reads as a TIMEOUT — which silently
# under-counts whole realms (focus, pointer, accesskey…) in every sweep.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wpt_run import TESTDRIVER_BRIDGE_JS

SCRAPE_JS = """
() => {
  const log = document.getElementById('log');
  return JSON.stringify({
    hasHarness: typeof add_completion_callback === 'function',
    harnessText: log ? (log.textContent || '') : '',
    hasResults: !!document.getElementById('results')
  });
}
"""
PUMP_JS = "() => new Promise(r => setTimeout(r, 4500))"

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

def realm_of(path):
    parts = path.split("/")
    if parts[0] in ("dom", "css", "html") and len(parts) > 1:
        return f"{parts[0]}/{parts[1]}"
    return parts[0]

async def run_one(ctx, url, timeout):
    page = await ctx.new_page()
    try:
        try:
            await page.add_init_script(TESTDRIVER_BRIDGE_JS)
        except Exception:
            pass
        try:
            await page.goto(url, wait_until="load", timeout=timeout * 1000)
        except Exception as exc:
            return {"ok": False, "why": f"nav-error: {str(exc)[:40]}"}
        for _ in range(max(2, int(timeout // 4) + 1)):
            try:
                data = json.loads(await page.evaluate(SCRAPE_JS))
            except Exception:
                data = {}
            summary = parse_summary(data.get("harnessText", ""))
            if summary is not None:
                summary["ok"] = True
                summary["harness"] = "OK" if "Harness status: OK" in data.get("harnessText","") else "ERROR/TIMEOUT"
                return summary
            if not data.get("hasHarness") and not data.get("hasResults"):
                return {"ok": False, "why": "testharness did not load/run"}
            try:
                await asyncio.wait_for(page.evaluate(PUMP_JS), timeout=8)
            except Exception:
                pass
        return {"ok": False, "why": "no-results (ran, summary never appeared)"}
    finally:
        try: await page.close()
        except Exception: pass

async def main_async(args):
    with open(args.list) as f:
        tests = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
    base = args.base.rstrip("/")
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(args.cdp)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        for i, t in enumerate(tests, 1):
            url = f"{base}/{t}"
            t0 = time.time()
            r = await run_one(ctx, url, args.timeout)
            r["path"] = t; r["realm"] = realm_of(t); r["secs"] = round(time.time()-t0,1)
            results.append(r)
            tag = (f"{r['pass']}/{r['found']} {r['harness']}" if r.get("ok")
                   else f"— {r['why']}")
            print(f"[{i:2}/{len(tests)}] {t[:60]:60} {tag}", flush=True)
        await browser.close()

    # ---- aggregate ----
    by_realm = defaultdict(lambda: {"pass":0,"total":0,"loaded":0,"cnr":0,"tests":0})
    g = {"pass":0,"total":0,"loaded":0,"cnr":0}
    for r in results:
        rr = by_realm[r["realm"]]; rr["tests"] += 1
        if r.get("ok"):
            rr["pass"] += r["pass"]; rr["total"] += r["found"]; rr["loaded"] += 1
            g["pass"] += r["pass"]; g["total"] += r["found"]; g["loaded"] += 1
        else:
            rr["cnr"] += 1; g["cnr"] += 1

    print("\n" + "="*74)
    print(f"{'REALM':24} {'TESTS':>5} {'LOADED':>6} {'CNR':>4} {'SUBTESTS':>14} {'PASS%':>6}")
    print("-"*74)
    for realm in sorted(by_realm):
        d = by_realm[realm]
        rate = (100.0*d['pass']/d['total']) if d['total'] else 0.0
        sub = f"{d['pass']}/{d['total']}"
        print(f"{realm:24} {d['tests']:>5} {d['loaded']:>6} {d['cnr']:>4} {sub:>14} {rate:>5.1f}%")
    print("-"*74)
    grate = (100.0*g['pass']/g['total']) if g['total'] else 0.0
    gsub = f"{g['pass']}/{g['total']}"
    print(f"{'GLOBAL':24} {len(results):>5} {g['loaded']:>6} {g['cnr']:>4} {gsub:>14} {grate:>5.1f}%")
    print("="*74)
    print(f"Note: PASS% is over subtests of LOADED tests only. {g['cnr']} tests "
          f"could-not-run (feature missing / harness incomplete) and contribute 0 measured subtests.")
    if args.out:
        with open(args.out, "w") as f:
            json.dump({"results": results, "by_realm": by_realm, "global": g}, f, indent=2)
        print(f"Saved {args.out}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", required=True)
    ap.add_argument("--cdp", default="http://127.0.0.1:9222")
    ap.add_argument("--base", default="https://wpt.live")
    ap.add_argument("--timeout", type=float, default=30.0)
    ap.add_argument("--out", default="/tmp/wpt_baseline.json")
    asyncio.run(main_async(ap.parse_args()))

if __name__ == "__main__":
    main()
