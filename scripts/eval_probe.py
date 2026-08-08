#!/usr/bin/env python3
"""Evaluate a JS snippet in a page and print the result.

The campaign's smallest possible edit->measure loop: no testharness, no WPT, just
"what does the engine actually say". Built for the editing arc, where nearly every
question ("what does getComputedStyle say the display of a <div> is?") is one
expression and waiting 90s for a 3000-subtest WPT file to answer it is absurd.

Usage:
    python scripts/eval_probe.py 'getComputedStyle(document.body).display'
    python scripts/eval_probe.py --file probe.js [--url about:blank] [--port 9222]

The snippet is evaluated as an expression if it is one, otherwise as a function
body (so `--file` scripts can use `return`).
"""
import argparse
import asyncio
import json
import sys
from playwright.async_api import async_playwright


async def main_async(args):
    src = open(args.file).read() if args.file else args.expr
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(f"http://127.0.0.1:{args.port}")
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await ctx.new_page()
        try:
            await page.goto(args.url, wait_until="load", timeout=args.timeout * 1000)
            # Wrap so `return` works and so a thrown error comes back as text
            # rather than as a Playwright stack we would have to read backwards.
            wrapped = (
                "() => { try { return JSON.stringify((function(){ %s })(), null, 1); }"
                " catch (e) { return 'THREW: ' + (e && e.stack || e); } }" % src
            )
            out = await page.evaluate(wrapped)
            print(out)
        finally:
            await page.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("expr", nargs="?", help="JS function body (use `return`)")
    ap.add_argument("--file", help="read the function body from a file instead")
    ap.add_argument("--url", default="https://wpt.live/common/blank.html")
    ap.add_argument("--port", type=int, default=9222)
    ap.add_argument("--timeout", type=int, default=30)
    args = ap.parse_args()
    if not args.expr and not args.file:
        ap.error("give an expression or --file")
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
