# Quest #237 — The Repeat-Collapse Verdict

**Realm:** `css/css-backgrounds/parsing/background-repeat-computed.html`
**Hold before:** 12/13 → **13/13** (+1)
**Status:** ✅ SECURED — zero regressions
**Session:** 2026-07-22

## The gap

Took Quest #236's next-leverage pointer (`background-repeat-computed` 12/13). The
single failing subtest:

```
test_computed_value("background-repeat", "repeat repeat", "repeat");
```

We produced the computed value `repeat repeat` where the spec requires `repeat`.

## Root cause

Per CSS Backgrounds, `<repeat-style>` has a two-value form `[repeat|space|round|
no-repeat]{1,2}`. The **computed** value collapses a two-keyword layer to its
shortest form:

- equal pair → the single keyword (`repeat repeat` → `repeat`),
- `repeat no-repeat` → `repeat-x`,
- `no-repeat repeat` → `repeat-y`,
- otherwise the pair is kept (`repeat space`, `round no-repeat`).

This is exactly what `mask-repeat` does — and the engine already had
`_canonMaskRepeat2(a, b)` implementing precisely this collapse. The difference:
`mask-repeat` collapses at **specified** time (its `_canonMaskLayer` calls
`_canonMaskRepeat2`), whereas `background-repeat`'s **specified** canon
(`_canonBgLayer`) deliberately keeps the pair — because `background-repeat-valid`
accepts *both* serializations:

```
test_valid_value("background-repeat", "repeat repeat", ["repeat", "repeat repeat"]);
```

So the collapse must live **only** in the computed path, never in the specified
canon (or `background-repeat-valid` would regress).

## The fix

One branch added to `_normComputed` (`bootstrap.js`), before the generic
fall-through:

```js
if (kebab === 'background-repeat') {
  return _commaSplitTop(String(v)).map((layer) => {
    const toks = _wsTokens(layer.trim());
    if (toks.length === 2) return _canonMaskRepeat2(toks[0].toLowerCase(), toks[1].toLowerCase());
    return layer.trim();
  }).join(', ');
}
```

Splits the value per comma-layer, and for any two-token layer applies the
existing `_canonMaskRepeat2`. Single-keyword layers (and `repeat-x`/`repeat-y`)
pass through unchanged.

## Results

`background-repeat-computed` 12 → **13/13** (100%).

## Zero-regression sweep

qsa 1975, classlist 1420, `background-repeat-valid` 4/4 (still accepts the kept
pair), `background-computed` 39/39, `background-position-computed` 32/32,
`mask-repeat-computed` 22/22, `mask-computed` 32/32 — all held.

## Cap / Next

No cap — the file is fully green. The change is gated on the `background-repeat`
kebab and only fires for two-token layers, so every non-repeat computed value is
byte-identical.

**Next leverage:** `css/css-shapes/parsing/shape-outside-computed` 29/32 (rect→
inset right/left-edge calc SIGN fold + `sign(1em-1px)` resolving to 0 instead of
+1; `sibling-index()` likely a cap); or a NEW `css/*/parsing/` dir. grep
`_canonMaskRepeat2`.
