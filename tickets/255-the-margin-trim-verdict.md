# Quest #255 — The Margin-Trim Verdict

**Realm:** `css/css-box/parsing/` · **Property:** `margin-trim` · **+43, ZERO regressions**

## The gap

Took #254's next-leverage (a NEW `css/*/parsing/` dir). Baselined `css/css-box/parsing/`:
most files already green (clear/float/visibility/width/height/max-* valid+computed all
pass), but the newer **`margin-trim`** property was raw-store:

| File | Before | After |
|------|:------:|:-----:|
| `margin-trim.html` (valid+invalid) | 11/34 | **34/34** |
| `margin-trim-computed.html` | 0/20 | **20/20** |

## The grammar (CSS Box 4)

```
margin-trim: none | block || inline | [ block-start || inline-start || block-end || inline-end ]
```

- The two-keyword **AXIS** form (`block`/`inline`) and the four-keyword **SIDE** form
  are mutually exclusive — you cannot mix them (`block block-start` → invalid).
- `none` stands alone (`none block` → invalid).
- No keyword repeats (`block block`, `block-start block-start` → invalid).

## Serialization

An axis collapses to its keyword ONLY when the OTHER axis is fully present (both sides)
or fully absent:

- `block-start block-end` → `block`  (block axis complete, inline absent)
- all four sides → `block inline`
- `block-start block-end inline-start` → keeps its sides (inline axis only half-present)
  → specified `block-start block-end inline-start`, computed `block-start inline-start block-end`

**SPECIFIED** preserves the author's token order in the non-collapsed cases
(`inline-start block-start` stays, `inline block` stays). **COMPUTED** reorders sides to
the canonical order **block-start · inline-start · block-end · inline-end** (and the axis
form to block · inline).

## The fix (all `bootstrap.js`)

NEW `_canonMarginTrim(value, computed)`:
1. tokenize (ASCII-lowercase); `none` alone → `none`, else reject any `none`.
2. reject repeats.
3. classify all tokens as axis-only or side-only; reject unknown/mixed.
4. axis form: computed → canonical `block inline` order; specified → author order.
5. side form: apply the axis-collapse rules above; partial → computed reorders, specified
   keeps author order.

Wired at the four standard touch points: `_CSSUI_VALIDATED` (gates setProperty + the
inline parser), a `_canonCssUi` branch (specified), `_GCS_DEFAULTS['margin-trim'] = 'none'`,
and a `_normComputed` branch (computed).

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697, vertical-align-computed 23/23,
line-height-computed 13/13, ruby-overhang-valid 3/3, margin-valid 15/15, margin-computed
6/8 (pre-existing), border-spacing-computed 4/4.

## Caps / Next

More of `css/css-box/parsing/` is raw-store and worth a follow-up quest:
`margin-shorthand` 0/20, `padding-shorthand` 0/20, `margin-invalid` 0/7,
`padding-invalid` 0/10, `clear-invalid` 0/2, `float-invalid` 0/3, `visibility-invalid` 0/2.
grep `_canonMarginTrim`.
