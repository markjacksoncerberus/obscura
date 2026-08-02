#!/usr/bin/env python3
"""Screenshot one or more pages with Obscura, so you can SEE what it renders.

Start a render-capable server first:
    cargo build --release --features render
    pkill -f 'obscura serve'
    ./target/release/obscura serve --port 9222 --render-mode on-demand --stealth &

Then:
    .venv/bin/python scripts/shot.py https://example.com https://news.ycombinator.com
    .venv/bin/python scripts/shot.py --out ~/shots https://en.wikipedia.org/wiki/Browser

Writes <out>/<host>.png per URL and prints the title, a JS-error count and the
elapsed time — the errors line is usually the fastest read on whether the page's
scripts actually ran.
"""
import argparse, asyncio, re, sys, time
from pathlib import Path
from playwright.async_api import async_playwright


async def shoot(ctx, url, outdir, full_page, wait):
    page = await ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e).split("\n")[0][:120]))
    t0 = time.time()
    title = status = "?"
    try:
        await page.goto(url, wait_until="load", timeout=45000)
        # Give late scripts a moment; many pages paint their real content here.
        await page.wait_for_timeout(int(wait * 1000))
        title = (await page.title()) or "(no title)"
        name = re.sub(r"[^\w.-]", "_", url.split("//", 1)[-1])[:80] or "page"
        path = Path(outdir) / f"{name}.png"
        await page.screenshot(path=str(path), full_page=full_page)
        status = str(path)
    except Exception as e:  # noqa: BLE001
        status = f"FAILED: {str(e).splitlines()[0][:120]}"
    print(f"{url}\n  title  : {title}\n  errors : {len(errors)}"
          + ("".join(f"\n           - {e}" for e in errors[:5]) if errors else "")
          + f"\n  shot   : {status}\n  took   : {time.time() - t0:.1f}s\n")
    await page.close()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--cdp", default="http://127.0.0.1:9222")
    ap.add_argument("--out", default="/tmp/obscura-shots")
    ap.add_argument("--wait", type=float, default=2.0, help="extra settle seconds after load")
    ap.add_argument("--full-page", action="store_true")
    a = ap.parse_args()
    Path(a.out).mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp(a.cdp)
        ctx = b.contexts[0] if b.contexts else await b.new_context()
        # One page at a time — concurrent CDP sessions muddy results.
        for u in a.urls:
            await shoot(ctx, u, a.out, a.full_page, a.wait)
        await b.close()
    print(f"Screenshots in {a.out}")


asyncio.run(main())
