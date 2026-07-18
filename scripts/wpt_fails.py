#!/usr/bin/env python3
"""Dump failing (and optionally timeout) subtest name + assert message for one WPT
test, for bucketing. Usage: wpt_fails.py <wpt-path-or-url> [--timeout N]"""
import argparse, asyncio, json, re, sys
from html import unescape
from playwright.async_api import async_playwright

SCRAPE_JS = """
() => {
  const r = document.getElementById('results');
  const log = document.getElementById('log');
  return JSON.stringify({
    harnessText: log ? (log.textContent || '') : '',
    resultsHTML: r ? r.outerHTML : ''
  });
}
"""
PUMP_JS = "() => new Promise(r => setTimeout(r, 4500))"

ROW_RE = re.compile(
    r'<tr[^>]*>\s*<td class="(fail|timeout|notrun)"[^>]*>(?:Fail|Timeout|Not Run)</td>\s*'
    r'<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>',
    re.IGNORECASE | re.DOTALL)

def strip_tags(s):
    # drop the stack trace (everything from the first <pre>) then strip tags
    s = re.split(r'<pre>', s, 1)[0]
    return unescape(re.sub(r'<[^>]+>', '', s)).strip()

async def main_async(args):
    url = args.test if args.test.startswith("http") else f"https://wpt.live/{args.test.lstrip('/')}"
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(args.cdp)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await ctx.new_page()
        try:
            from wpt_run import TESTDRIVER_BRIDGE_JS
            await page.add_init_script(TESTDRIVER_BRIDGE_JS)
        except Exception:  # noqa: BLE001
            pass
        await page.goto(url, wait_until="load", timeout=args.timeout * 1000)
        data = {}
        for _ in range(max(2, int(args.timeout // 4) + 1)):
            data = json.loads(await page.evaluate(SCRAPE_JS))
            if re.search(r"Found \d+ tests", data.get("harnessText", "")):
                break
            try:
                await asyncio.wait_for(page.evaluate(PUMP_JS), timeout=8)
            except Exception:
                pass
        rows = ROW_RE.findall(data.get("resultsHTML", ""))
        out = []
        for status, name, msg in rows:
            out.append((status, strip_tags(name), strip_tags(msg)))
        print(f"# {len(out)} non-pass rows for {url}")
        for status, name, msg in out:
            print(f"[{status}] {name}\n    -> {msg}")
        await page.close()
        await browser.close()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("test")
    ap.add_argument("--cdp", default="http://127.0.0.1:9222")
    ap.add_argument("--timeout", type=float, default=90.0)
    args = ap.parse_args()
    asyncio.run(main_async(args))

if __name__ == "__main__":
    main()
