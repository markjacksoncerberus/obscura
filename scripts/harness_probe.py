#!/usr/bin/env python3
"""Diagnose WHY a WPT test fails at the harness gate.

Navigates to a test, collects console messages + uncaught page errors, and probes
the JS/DOM surface testharness.js depends on. Prints a per-test diagnosis.

Usage:
    python scripts/harness_probe.py dom/events/Event-constructors.html [more...]
"""
import argparse
import asyncio
import sys
from playwright.async_api import async_playwright

# Surface testharness.js + common tests lean on. Each entry is (label, JS-expr
# that should be truthy/not-throw). We eval in the page and report failures.
PROBES = [
    ("self === globalThis", "self === globalThis"),
    ("window === globalThis", "window === globalThis"),
    ("document.createElement", "typeof document.createElement === 'function'"),
    ("document.createElementNS", "typeof document.createElementNS === 'function'"),
    ("document.createRange", "typeof document.createRange === 'function'"),
    ("document.createTreeWalker", "typeof document.createTreeWalker === 'function'"),
    ("document.createNodeIterator", "typeof document.createNodeIterator === 'function'"),
    ("document.createDocumentFragment", "typeof document.createDocumentFragment === 'function'"),
    ("new Range()", "(()=>{try{new Range();return true}catch(e){return String(e)}})()"),
    ("document.implementation", "!!document.implementation"),
    ("document.implementation.createDocument", "typeof document.implementation?.createDocument === 'function'"),
    ("document.implementation.createHTMLDocument", "typeof document.implementation?.createHTMLDocument === 'function'"),
    ("MutationObserver", "typeof MutationObserver === 'function'"),
    ("location.href", "typeof location !== 'undefined' && typeof location.href === 'string'"),
    ("location.search", "(()=>{try{return typeof location.search==='string'}catch(e){return String(e)}})()"),
    ("GLOBAL.isWindow", "(()=>{try{return typeof GLOBAL!=='undefined'}catch(e){return false}})()"),
    ("Object.getOwnPropertyDescriptor(window,'onload')", "(()=>{try{return !!Object.getOwnPropertyDescriptor(window,'onload')||true}catch(e){return String(e)}})()"),
    ("document.title setter", "(()=>{try{document.title='x';return document.title==='x'}catch(e){return String(e)}})()"),
    ("script.textContent eval ran", "true"),
    ("Element.prototype.attachShadow", "typeof Element.prototype.attachShadow === 'function'"),
    ("performance.now", "typeof performance?.now === 'function'"),
    ("queueMicrotask", "typeof queueMicrotask === 'function'"),
    ("structuredClone", "typeof structuredClone === 'function'"),
]

SCRAPE = """
() => ({
  hasHarness: typeof add_completion_callback === 'function',
  hasTest: typeof test === 'function',
  hasAsyncTest: typeof async_test === 'function',
  hasSetup: typeof setup === 'function',
  hasAddResult: typeof add_result_callback === 'function',
  bodyLen: document.body ? document.body.innerHTML.length : -1,
  resultsTable: !!document.getElementById('results'),
  logText: (document.getElementById('log')||{}).textContent || '',
})
"""

async def probe(ctx, url, timeout):
    page = await ctx.new_page()
    msgs, errs = [], []
    page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}"[:300]))
    page.on("pageerror", lambda e: errs.append(str(e)[:400]))
    print(f"\n{'='*78}\n{url}\n{'='*78}")
    try:
        await page.goto(url, wait_until="load", timeout=timeout*1000)
    except Exception as e:
        print(f"  NAV-ERROR: {e}")
    # let microtasks/timers settle
    try:
        await page.evaluate("() => new Promise(r => setTimeout(r, 3000))")
    except Exception:
        pass
    try:
        st = await page.evaluate(SCRAPE)
        print("  harness state:")
        for k, v in st.items():
            if k == "logText":
                v = (v[:200] + "…") if len(v) > 200 else v
            print(f"    {k:18} = {v!r}")
    except Exception as e:
        print(f"  SCRAPE FAILED: {e}")
    print("  surface probes (only failures/errors shown):")
    any_fail = False
    for label, expr in PROBES:
        try:
            r = await page.evaluate(f"() => {expr}")
        except Exception as e:
            r = f"THREW: {str(e)[:120]}"
        if r is not True:
            any_fail = True
            print(f"    ✗ {label:42} -> {r!r}")
    if not any_fail:
        print("    (all surface probes passed)")
    if errs:
        print("  PAGE ERRORS (uncaught):")
        for e in errs[:8]:
            print(f"    ⚠ {e}")
    else:
        print("  PAGE ERRORS: none")
    if msgs:
        print(f"  CONSOLE ({len(msgs)} msgs, first 12):")
        for m in msgs[:12]:
            print(f"    {m}")
    await page.close()


async def main_async(args):
    base = args.base.rstrip("/")
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(args.cdp)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        for t in args.tests:
            url = t if t.startswith("http") else f"{base}/{t.lstrip('/')}"
            await probe(ctx, url, args.timeout)
        await browser.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tests", nargs="+")
    ap.add_argument("--cdp", default="http://127.0.0.1:9222")
    ap.add_argument("--base", default="https://wpt.live")
    ap.add_argument("--timeout", type=float, default=20.0)
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()
