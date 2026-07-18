# Quest #60 — The Recombined Verdict

> *Shorthand serialization: the inverse of #58. Where #58 split a shorthand into
> longhands for the cascade, this reconstructs a shorthand from the longhands for
> the CSSOM `cssText` getter and the shorthand-property getter.*

**Realm:** `css/cssom/` + `css/css-variables/` (CSSOM declaration-block serialization)
**Status:** SECURED — **+6**, zero regressions (session 2026-06-21)
**Banner taken:** #59's "next leverage (1)" — the standing shorthand serialization engine.

---

## The gap

The CSSOM "serialize a CSS declaration block" / "serialize a CSS value" algorithms
must reconstruct a shorthand from the longhand declarations actually present in a
declaration block. Obscura stored declarations verbatim and serialized each one
literally, so:

- `shorthand-serialization.html` 4/7 — `margin-{top,right,bottom,left}: 10px` did
  not serialize as `margin: 10px;`, and `el.style.margin` returned `""` (or the
  un-collapsed `20px 20px 20px 20px`).
- `variable-cssText.html` target9 — `margin: var(--prop); margin-top: 10px` did not
  expand into per-longhand pending-substitution values, so the block did not
  serialize as `margin-right: ; margin-bottom: ; margin-left: ; margin-top: 10px;`.
- `cssstyledeclaration-csstext.html` — the two logical-group subtests: `margin`,
  `margin-inline`, `margin-block` must be recombined **only** when no declaration of
  the same logical property group sits between their longhands.

## Key finding that made it low-risk

`serialize-values.html` (the 695/697 win from #59) sets **only longhand**
properties and reads them back via `el.style[idl]` (the longhand getter) — it never
sets a shorthand and never reads `.cssText`. So the entire engine could live in the
**`cssText` getter** and the **box-shorthand property getter**, reading the literal
`_props` on-the-fly and **never mutating stored state**. The cascade
(`_buildCascade`), `setProperty`, and longhand reads are completely untouched —
hence zero risk to serialize-values (695), the #58 cascade (`variable-substitution-shorthands`
51/51), and the whole computed-style family.

## The fix (pure JS, `bootstrap.js`, NO new Rust)

Scoped to the box-model families (the only shorthands these CSSOM tests
reconstruct): `margin`/`padding` (4-edge) and their flow-relative
`margin-inline`/`margin-block`/`padding-inline`/`padding-block` (2-edge).
`background`/`border`/`transition` stay stored verbatim (already correct for the
tests that exercise them — e.g. `shorthand-serialization` foo1/2/3 and
`variable-cssText` target3/5/6/7).

- **`_BOX_SHORTHANDS`** — box shorthand → its longhands; **`_BOX_LONGHAND_SH`**
  (reverse) and **`_BOX_LOGICAL_GROUP`** (longhand → `'margin'`|`'padding'`, the unit
  of the adjacency rule) derived from it.
- **`_expandBoxShorthand(sh, value)`** / **`_serializeBoxValue(sh, values)`** —
  split a box value into 1–4 (or 1–2) edges and collapse them back to the shortest
  equivalent form (`10px 10px 10px 10px` → `10px`).
- **`_styleLonghandList(decl)`** — expand the literal `_props` (insertion order) into
  an ordered longhand list, applying **last-write-wins** across expanded names: a
  later longhand overriding one produced by an earlier shorthand is tombstoned and
  re-appended at the end (matching CSSOM ordering — this is what makes target9's
  `margin-top` land last). A box shorthand carrying a `var()` becomes a
  **pending-substitution value** on each longhand (`pending: true`, value = the whole
  shorthand value, `sh` = the originating shorthand).
- **`_serializeDeclBlock(decl)`** — "serialize a CSS declaration block": for each
  not-yet-serialized longhand, try its shorthand; combine only if (a) all longhands
  present, (b) uniform `!important`, (c) either none pending **or** all pending with
  the same value and same originating shorthand, and (d) **logical-group adjacency** —
  no declaration of the same logical group (outside this group) sits between the
  first and last longhand. A pending longhand that can't be combined serializes as the
  empty string (`margin-right: ;`).
- **`_boxShorthandSerialization(decl, sh)`** — the shorthand-property getter
  (`el.style.margin`): gather the shorthand's longhands from the expanded list,
  reconstruct, or `''` if absent / importance-mismatched / partial-pending.
- Wired: `get cssText()` → `_serializeDeclBlock(this)`; the `_styleProxy` `get` trap
  routes a box-shorthand name through `_boxShorthandSerialization` (every other
  property still reads `getPropertyValue` directly — internal callers untouched).

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `css/cssom/shorthand-serialization.html` | 4/7 | **7/7** | +3 |
| `css/cssom/cssstyledeclaration-csstext.html` | 5/11 | **7/11** | +2 |
| `css/css-variables/variable-cssText.html` | 8/11 | **9/11** | +1 |

**+6. ZERO regressions** — swept serialize-values 695/697, variable-substitution-shorthands
51/51, variable-definition 71/73, -basic 11/13, -filters 7/7, -background 8/10,
legal-values 23/23; color-computed 16/named 455/rgb 95/opacity 30; inherit-initial 4,
css-color/inheritance 4, css-text 42, css-fonts 39, css-scroll-snap 38, css-flexbox 20;
qsa 1975, classlist-stringifier 1, matches 669, closest 29, createElement 147,
valid-invalid 30; obscura-dom unit 40/40.

## Caps (honest)

- **Unknown-property drop** — `variable-cssText` target10 (`expando: var(--prop)` →
  `""`), `cssstyledeclaration-csstext` "uppercase property" (`style.COLOR='red'`) and
  "invalid property does not appear" (`style.unknown='unknown'`). RISK: a naïve gate
  on `_CSS_KNOWN_PROPS` would regress serialize-values, which sets ~95 real props many
  of which are NOT in our registry (`orphans`, `widows`, `clip`, `caption-side`,
  `border-spacing`, `unicode-bidi`, `page-break-*`, …). Needs a **comprehensive
  valid-property registry** (a big finite data set) used purely as the set-time gate
  before serialize-values can stay green — the standing hot-path risk.
- **Per-property value validation** — `cssstyledeclaration-csstext` "overwriting with
  invalid value" (`color: red` then `color: unknown color` must keep `red`). Needs a
  `<color>` (and eventually per-grammar) validity check on the `setProperty`/cssText
  setter, dropping an invalid value so the prior survives.
- **Computed-style `cssText`/`length`** — `cssstyledeclaration-csstext` "cssText on
  computed style declaration returns the empty string" needs `getComputedStyle(el).length`
  ≠ 0 **and** `.cssText === ""` — i.e. the computed declaration must enumerate all
  longhands (length) while serializing to empty (cssText). A separate computed-style
  enumeration model, riskier (other tests assume `length === 0`).
- **In-value comment preservation** — `variable-cssText` target11 keeps an internal
  `/* kept comment */` while stripping leading/trailing ones; our parser strips all.

## Next leverage

1. **Comprehensive valid-property registry → unknown-property drop + per-property
   value validation** — the standing #2 leverage; unlocks `variable-cssText` target10,
   `cssstyledeclaration-csstext` uppercase/invalid (+~4) and is foundational for the
   `*-invalid` parsing family. MUST be regression-proofed against serialize-values
   (695) — build the registry as a superset of every property serialize-values sets.
2. **Gradient canonicalization** (standing #57 cap — `variable-substitution-background-properties`
   8/10 + foundational for `background-image`/`mask-image` computed).
3. **Fresh realm** — `fetch/`, `html/dom/` reflection.
