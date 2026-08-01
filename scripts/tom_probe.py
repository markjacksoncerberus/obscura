#!/usr/bin/env python3
"""Evaluate a JS snippet in a fresh Obscura page over CDP.

A scratch tool for the CSS Typed OM work: `wpt_fails.py` tells you WHICH
assertion failed, this tells you what the engine actually answered.

Usage:
    python scripts/tom_probe.py <js-file>   # the file's last expression is returned
"""
import asyncio
import sys
from playwright.async_api import async_playwright

CDP = "http://127.0.0.1:9222"


async def main(src):
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto("https://wpt.live/common/blank.html", wait_until="load")
        try:
            out = await page.evaluate("() => {" + src + "}")
            print(out if isinstance(out, str) else repr(out))
        except Exception as e:  # noqa: BLE001
            print("EVAL ERROR:", e)
        for e in errs:
            print("PAGE ERROR:", e)
        await page.close()


if __name__ == "__main__":
    asyncio.run(main(open(sys.argv[1]).read()))
