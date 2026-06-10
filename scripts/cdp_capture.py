#!/usr/bin/env python3
"""Drive an Obscura CDP server with Playwright: navigate, settle, capture.

Connects to a running Obscura server over CDP, navigates to a target URL,
waits a fixed dwell (good for long-lived / JS-driven pages to settle), then
saves a screenshot (.png) and the rendered HTML (.html) using a shared prefix.

Example:
    python scripts/cdp_capture.py https://hermesdata.io out/hermes
    python scripts/cdp_capture.py https://hermesdata.io out/hermes \\
        --cdp http://127.0.0.1:9222 --wait 10
"""
import argparse
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright


async def get_html(page) -> str:
    """Return the page's HTML, tolerant of a perpetually-"navigating" page.

    `page.content()` has a navigation guard and raises "page is navigating and
    changing the content" on sites (e.g. google.com) whose lifecycle never fully
    settles under Obscura's CDP. Reading the live DOM via evaluate bypasses that
    guard, so we try content() first (cleanest) and fall back to outerHTML.
    """
    try:
        return await page.content()
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] page.content() failed ({exc}); reading live DOM instead", flush=True)
        return await page.evaluate(
            "'<!DOCTYPE html>\\n' + document.documentElement.outerHTML"
        )


async def capture(url: str, prefix: str, cdp: str, wait: float,
                  full_page: bool, shot_timeout: float) -> bool:
    """Capture HTML + screenshot. Returns True if at least one artifact saved.

    HTML is captured before the screenshot because on JS-heavy pages Obscura's
    single-threaded V8 model (issue #19) can abort the whole server during the
    dwell; grabbing HTML first salvages something. The screenshot is bounded and
    non-fatal for the same reason.
    """
    png_path = Path(f"{prefix}.png")
    html_path = Path(f"{prefix}.html")
    png_path.parent.mkdir(parents=True, exist_ok=True)
    saved = False

    async with async_playwright() as p:
        print(f"[cdp] connecting to {cdp} ...", flush=True)
        browser = await p.chromium.connect_over_cdp(cdp)

        # Reuse the server's default context/page if present, else create one.
        context = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = context.pages[0] if context.pages else await context.new_page()

        print(f"[nav] {url}", flush=True)
        await page.goto(url, wait_until="load")

        print(f"[wait] settling for {wait:.0f}s ...", flush=True)
        await page.wait_for_timeout(wait * 1000)

        print(f"[save] {html_path}", flush=True)
        html_path.write_text(await get_html(page), encoding="utf-8")
        saved = True

        # Default to a viewport screenshot: Obscura's Blitz layout can report a
        # collapsed document height for client-hydrated (e.g. Next.js) pages,
        # which makes Playwright's full_page clip degenerate. For a taller
        # capture, start the server with a larger `--window-size WxH`.
        # Bounded + non-fatal: on JS-heavy pages the capture can stall (the page
        # never reaches a stable lifecycle) — we keep the HTML rather than hang.
        print(f"[save] {png_path} (full_page={full_page}, timeout={shot_timeout:.0f}s)", flush=True)
        try:
            await page.screenshot(path=str(png_path), full_page=full_page,
                                  timeout=shot_timeout * 1000)
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] screenshot failed ({exc}); HTML was still saved", flush=True)

        await browser.close()
    print("[done] capture complete", flush=True)
    return saved


def main() -> int:
    ap = argparse.ArgumentParser(description="Capture a page from an Obscura CDP server.")
    ap.add_argument("url", help="Target URL to navigate to")
    ap.add_argument("prefix", help="Output file path prefix (writes <prefix>.png and <prefix>.html)")
    ap.add_argument("--cdp", default="http://127.0.0.1:9222",
                    help="Obscura CDP HTTP endpoint (default: http://127.0.0.1:9222)")
    ap.add_argument("--wait", type=float, default=10.0,
                    help="Seconds to wait after load before capturing (default: 10)")
    ap.add_argument("--full-page", action="store_true",
                    help="Capture the full scrollable page instead of just the viewport. "
                         "Unreliable on Obscura for client-rendered pages (collapsed scroll "
                         "height); prefer a larger server --window-size for tall captures.")
    ap.add_argument("--screenshot-timeout", type=float, default=20.0,
                    help="Max seconds to wait for the screenshot before giving up (default: 20). "
                         "Kept bounded so a wedged page doesn't hang the run.")
    args = ap.parse_args()

    try:
        asyncio.run(capture(args.url, args.prefix, args.cdp, args.wait,
                            args.full_page, args.screenshot_timeout))
    except Exception as exc:  # noqa: BLE001 - surface any failure to the shell
        msg = str(exc)
        if "closed" in msg.lower() or "disconnected" in msg.lower() or "websocket" in msg.lower():
            print(f"[error] connection lost: {msg}", file=sys.stderr, flush=True)
            print("[hint] The Obscura server likely aborted (V8 issue #19: isolate collision on "
                  "JS-heavy/long-lived pages). Check the server log for "
                  "'Check failed: heap->isolate() == Isolate::TryGetCurrent()'.",
                  file=sys.stderr, flush=True)
        else:
            print(f"[error] {msg}", file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
