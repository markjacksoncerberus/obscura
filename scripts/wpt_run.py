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

# --- test_driver input bridge (in-page) --------------------------------------
# WPT tests drive real user input through `test_driver` (click / send_keys /
# Actions). testharness leaves those calls to a vendor backend; on wpt.live the
# vendor file is empty, so the default `test_driver_internal` methods throw and
# the tests hang. This init script installs a working backend that dispatches the
# input ENTIRELY IN THE PAGE: it resolves each action to primitive events (element
# origins -> viewport-center coords via getBoundingClientRect, WebDriver key code
# points -> key/code) and synthesizes the corresponding DOM events (pointer/mouse
# down-up-click, keydown/up) plus the UA close request for Escape — the same
# behavior a real user's input would trigger (popover light-dismiss on mousedown,
# Escape closing the topmost dialog/popover).
#
# Why in-page rather than routing to real CDP Input: Obscura runs the whole async
# harness *during* Page.navigate, so the Python runner never regains control while
# the promise_tests execute — a CDP-serviced queue could never be drained in time.
# An in-page dispatch runs synchronously inside the test, exactly when it's needed.
#
# The override is installed via a get/set property so it survives testdriver.js's
# single `window.test_driver_internal = {...}` assignment (re-patching our methods
# onto whatever object is assigned, preserving all the others).
TESTDRIVER_BRIDGE_JS = r"""
(() => {
  // WebDriver key code points (PUA U+E0xx) -> CDP key/code/(text).
  const KEYS = {
    '': {key:'Backspace', code:'Backspace'},
    '': {key:'Tab', code:'Tab'},
    '': {key:'Enter', code:'Enter', text:'\r'},
    '': {key:'Enter', code:'Enter', text:'\r'},
    '': {key:'Shift', code:'ShiftLeft'},
    '': {key:'Control', code:'ControlLeft'},
    '': {key:'Alt', code:'AltLeft'},
    '': {key:'Pause', code:'Pause'},
    '': {key:'Escape', code:'Escape'},
    '': {key:' ', code:'Space', text:' '},
    '': {key:'PageUp', code:'PageUp'},
    '': {key:'PageDown', code:'PageDown'},
    '': {key:'End', code:'End'},
    '': {key:'Home', code:'Home'},
    '': {key:'ArrowLeft', code:'ArrowLeft'},
    '': {key:'ArrowUp', code:'ArrowUp'},
    '': {key:'ArrowRight', code:'ArrowRight'},
    '': {key:'ArrowDown', code:'ArrowDown'},
    '': {key:'Insert', code:'Insert'},
    '': {key:'Delete', code:'Delete'},
  };
  function mapKey(ch) {
    if (KEYS[ch]) return Object.assign({}, KEYS[ch]);
    let code = '';
    if (ch >= 'a' && ch <= 'z') code = 'Key' + ch.toUpperCase();
    else if (ch >= 'A' && ch <= 'Z') code = 'Key' + ch;
    else if (ch >= '0' && ch <= '9') code = 'Digit' + ch;
    else if (ch === ' ') return {key:' ', code:'Space', text:' '};
    return {key: ch, code: code, text: ch};
  }
  // Legacy `keyCode`/`which` values many tests still assert (e.g. Tab === 9).
  const KEYCODES = {
    'Backspace':8, 'Tab':9, 'Enter':13, 'Shift':16, 'Control':17, 'Alt':18,
    'Pause':19, 'Escape':27, ' ':32, 'PageUp':33, 'PageDown':34, 'End':35,
    'Home':36, 'ArrowLeft':37, 'ArrowUp':38, 'ArrowRight':39, 'ArrowDown':40,
    'Insert':45, 'Delete':46,
  };
  function legacyKeyCode(key) {
    if (KEYCODES[key] != null) return KEYCODES[key];
    if (key && key.length === 1) {
      const c = key.toUpperCase().charCodeAt(0);
      if ((c >= 65 && c <= 90) || (c >= 48 && c <= 57)) return c;
    }
    return 0;
  }
  // Modifier state tracked across a key command stream so Shift+Tab (and any
  // modifier a test reads off the event) reflects held modifiers.
  let _kbdMods = {shiftKey:false, ctrlKey:false, altKey:false, metaKey:false};
  const BTN = ['left', 'middle', 'right', 'back', 'forward'];
  const btnName = (b) => BTN[b] || 'left';
  const btnBit = (b) => { switch (b) { case 0: return 1; case 1: return 4; case 2: return 2;
                                       case 3: return 8; case 4: return 16; default: return 1; } };

  // Flatten a WebDriver action-source list into primitive input commands, running
  // ticks across all sources (as the spec does) and resolving pointer coordinates.
  function resolveActions(sources) {
    const cmds = [];
    let px = 0, py = 0, buttons = 0;
    let maxTicks = 0;
    for (const s of (sources || [])) if (s && s.actions) maxTicks = Math.max(maxTicks, s.actions.length);
    for (let tick = 0; tick < maxTicks; tick++) {
      for (const s of sources) {
        const a = s && s.actions && s.actions[tick];
        if (!a) continue;
        if (s.type === 'pointer') {
          if (a.type === 'pointerMove') {
            let x = a.x || 0, y = a.y || 0;
            const origin = a.origin;
            if (origin && typeof origin === 'object' && origin.getBoundingClientRect) {
              const r = origin.getBoundingClientRect();
              x = r.left + r.width / 2 + (a.x || 0);
              y = r.top + r.height / 2 + (a.y || 0);
            } else if (origin === 'pointer') { x = px + (a.x || 0); y = py + (a.y || 0); }
            px = x; py = y;
            cmds.push({kind:'mouse', type:'mouseMoved', x:Math.round(x), y:Math.round(y),
                       button:'none', buttons});
          } else if (a.type === 'pointerDown') {
            buttons |= btnBit(a.button || 0);
            cmds.push({kind:'mouse', type:'mousePressed', x:Math.round(px), y:Math.round(py),
                       button:btnName(a.button || 0), buttons, clickCount:1});
          } else if (a.type === 'pointerUp') {
            buttons &= ~btnBit(a.button || 0);
            cmds.push({kind:'mouse', type:'mouseReleased', x:Math.round(px), y:Math.round(py),
                       button:btnName(a.button || 0), buttons, clickCount:1});
          }
        } else if (s.type === 'key') {
          if (a.type === 'keyDown' || a.type === 'keyUp') {
            const m = mapKey(a.value);
            cmds.push({kind:'key', type:(a.type === 'keyDown' ? 'keyDown' : 'keyUp'),
                       key:m.key, code:m.code || '', text:m.text || ''});
          }
        }
      }
    }
    return cmds;
  }

  // ---- in-page event synthesis ----
  const btnCode = (name) => name === 'right' ? 2 : name === 'middle' ? 1 : 0;
  let _mouse = {pressTarget: null, downX: 0, downY: 0, moved: false};

  const hitTest = (x, y) => {
    var t = null;
    try { t = document.elementFromPoint(x, y); } catch (e) {}
    return t || document.body || document.documentElement;
  };
  const fireMouse = (type, target, x, y, button, buttons, detail) => {
    if (!target) return null;
    var ev;
    try {
      ev = new MouseEvent(type, {bubbles: true, cancelable: true, composed: true,
        clientX: x, clientY: y, screenX: x, screenY: y,
        button: button || 0, buttons: buttons || 0, detail: detail || 0});
    } catch (e) { return null; }
    // Mark injected input as trusted for the dispatch's duration: real WebDriver
    // actions produce isTrusted events, so UA behaviour gated on trust (e.g. popover
    // light dismiss) must fire — while a page's own dispatchEvent(new MouseEvent(...))
    // stays untrusted. Restored right after (synchronous dispatch).
    var _pt = globalThis.__obscura_trusted_input; globalThis.__obscura_trusted_input = true;
    try { target.dispatchEvent(ev); } catch (e) {}
    globalThis.__obscura_trusted_input = _pt;
    return ev;
  };
  const firePointer = (type, target, x, y, button, buttons) => {
    if (!target) return;
    var ev;
    try {
      ev = (typeof PointerEvent === 'function')
        ? new PointerEvent(type, {bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, button: button, buttons: buttons || 0,
            pointerId: 1, pointerType: 'mouse', isPrimary: true})
        : new MouseEvent(type, {bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, button: button < 0 ? 0 : button, buttons: buttons || 0});
    } catch (e) { return; }
    var _pt = globalThis.__obscura_trusted_input; globalThis.__obscura_trusted_input = true;
    try { target.dispatchEvent(ev); } catch (e) {}
    globalThis.__obscura_trusted_input = _pt;
  };
  const fireKeyCmd = (c) => {
    var target = document.activeElement || document.body || document.documentElement;
    if (!target) return;
    var type = c.type === 'keyDown' ? 'keydown' : 'keyup';
    // Track modifier key state so a subsequent Tab / other key carries it.
    if (c.key === 'Shift') _kbdMods.shiftKey = (type === 'keydown');
    else if (c.key === 'Control') _kbdMods.ctrlKey = (type === 'keydown');
    else if (c.key === 'Alt') _kbdMods.altKey = (type === 'keydown');
    else if (c.key === 'Meta') _kbdMods.metaKey = (type === 'keydown');
    var kc = legacyKeyCode(c.key);
    var ev;
    try { ev = new KeyboardEvent(type, {bubbles: true, cancelable: true, composed: true,
      key: c.key, code: c.code || '', keyCode: kc, which: kc,
      shiftKey: _kbdMods.shiftKey, ctrlKey: _kbdMods.ctrlKey,
      altKey: _kbdMods.altKey, metaKey: _kbdMods.metaKey}); }
    catch (e) { return; }
    var notPrevented = true;
    try { notPrevented = target.dispatchEvent(ev); } catch (e) {}
    if (type !== 'keydown' || !notPrevented) return;
    // A trusted Escape keydown is a "close request": run the UA algorithm unless a
    // listener (e.g. a focused text field) cancels it. Mirrors the CDP Input path.
    if (c.key === 'Escape' && typeof globalThis._processCloseRequest === 'function') {
      try { globalThis._processCloseRequest(); } catch (e) {}
    }
    // A Tab keydown that no listener cancelled runs sequential focus navigation.
    else if (c.key === 'Tab' && typeof globalThis._sequentialFocusNavigation === 'function') {
      try { globalThis._sequentialFocusNavigation(_kbdMods.shiftKey); } catch (e) {}
    }
  };
  const fireMouseCmd = (c) => {
    var x = c.x, y = c.y, b = btnCode(c.button), target = hitTest(x, y);
    if (c.type === 'mouseMoved') {
      firePointer('pointermove', target, x, y, -1, c.buttons);
      fireMouse('mousemove', target, x, y, 0, c.buttons, 0);
      if (_mouse.pressTarget && (Math.abs(x - _mouse.downX) > 1 || Math.abs(y - _mouse.downY) > 1)) _mouse.moved = true;
    } else if (c.type === 'mousePressed') {
      try { globalThis.__obscura_click_target = target; } catch (e) {}
      firePointer('pointerdown', target, x, y, b, c.buttons);
      fireMouse('mousedown', target, x, y, b, c.buttons, c.clickCount || 1);
      _mouse = {pressTarget: target, downX: x, downY: y, moved: false};
    } else if (c.type === 'mouseReleased') {
      firePointer('pointerup', target, x, y, b, c.buttons);
      fireMouse('mouseup', target, x, y, b, c.buttons, c.clickCount || 1);
      // A click fires on release if the pointer didn't drag away (left button only).
      if (_mouse.pressTarget && !_mouse.moved && b === 0) {
        fireMouse('click', target, x, y, 0, 0, c.clickCount || 1);
      }
      _mouse = {pressTarget: null, downX: 0, downY: 0, moved: false};
    }
  };
  const dispatchCmds = (cmds) => {
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (c.kind === 'mouse') fireMouseCmd(c);
      else if (c.kind === 'key') fireKeyCmd(c);
    }
  };

  function patch(impl) {
    if (!impl || impl.__obscuraPatched) return;
    impl.__obscuraPatched = true;
    impl.click = function(element, coords) {
      // Element-targeted: dispatch the pointer/mouse sequence directly on the element
      // (testdriver.js already resolved its center), so it works regardless of layout.
      var c = coords || {};
      var x = Math.round(c.x || 0), y = Math.round(c.y || 0);
      try { globalThis.__obscura_click_target = element; } catch (e) {}
      firePointer('pointerdown', element, x, y, 0, 1);
      fireMouse('mousedown', element, x, y, 0, 1, 1);
      firePointer('pointerup', element, x, y, 0, 0);
      fireMouse('mouseup', element, x, y, 0, 0, 1);
      fireMouse('click', element, x, y, 0, 0, 1);
      // A click is user activation (for the close-watcher grouping model etc.).
      try { globalThis.__obscuraUserActivation && globalThis.__obscuraUserActivation(); } catch (e) {}
      return Promise.resolve();
    };
    impl.send_keys = function(element, keys) {
      // Real test_driver.send_keys is ASYNCHRONOUS: it returns a promise and the
      // key events fire on later ticks. Tests rely on this — a focus handler that
      // calls send_keys for the *next* Tab expects its own synchronous work (e.g.
      // an `i++` counter after the call) to run BEFORE the next key is processed.
      // Dispatching synchronously would recurse the handler and skip that work, so
      // defer each key's keydown/keyup through the microtask queue.
      var p = Promise.resolve();
      for (var ch of String(keys)) {
        (function (ch) {
          p = p.then(function () {
            var m = mapKey(ch);
            fireKeyCmd({kind: 'key', type: 'keyDown', key: m.key, code: m.code || ''});
            fireKeyCmd({kind: 'key', type: 'keyUp', key: m.key, code: m.code || ''});
          });
        })(ch);
      }
      return p;
    };
    impl.action_sequence = function(actions) { dispatchCmds(resolveActions(actions)); return Promise.resolve(); };
    // bless() grants the page transient/history-action user activation (wptrunner
    // implements it as a click on an element). NOT the Esc key, which is a close
    // request, not activation.
    impl.bless = function() {
      try { globalThis.__obscuraUserActivation && globalThis.__obscuraUserActivation(); } catch (e) {}
      return Promise.resolve();
    };
  }

  // Obscura runs preload scripts *after* load, so testdriver.js has already set
  // `test_driver_internal`; seed from it and patch in place, and also trap future
  // assignments (in case ordering ever differs).
  let _impl = window.test_driver_internal || {};
  patch(_impl);
  try {
    Object.defineProperty(window, 'test_driver_internal', {
      configurable: true,
      get() { return _impl; },
      set(v) { _impl = v || {}; patch(_impl); },
    });
  } catch (e) {
    try { patch(window.test_driver_internal); } catch (e2) {}
  }
})();
"""



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
        # Install the test_driver -> CDP Input bridge init script (patches
        # test_driver_internal after the page loads testdriver.js). Best-effort: a
        # browser without init-script support still runs (test_driver calls hang, as
        # before). Draining is done inline in _run_on_page (serial, never concurrent).
        try:
            await page.add_init_script(TESTDRIVER_BRIDGE_JS)
        except Exception:  # noqa: BLE001
            pass
        return await _run_on_page(page, url, timeout)
    finally:
        try:
            await page.close()
        except Exception:  # noqa: BLE001
            pass


async def _run_on_page(page, url, timeout):
    try:
        # Navigate but return as early as possible (don't block until `load`): Obscura
        # advances the page event loop during navigation, so a wait_until="load" can run
        # (and complete) the harness's async promise_tests BEFORE the pump/drain loop
        # starts — starving every test_driver action. Returning at "commit" lets the
        # loop below service input while the harness actually runs.
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
