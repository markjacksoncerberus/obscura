# 📜 Quest #490 — The Trusted Verdict

> *Trusted Types — the API that removes DOM XSS as a CLASS of bug rather than
> hunting its instances.*
> **The realm did not exist. `window.trustedTypes` was `undefined`, so every one
> of its 186 files failed on the first line of its first script.**

---

## Why this realm, and why now

The previous arc's leverage list pointed at service-worker network interception
and storage-on-disk — both real, both blocked on engine architecture rather than
on a missing API. The standing order says: **prefer the untouched realm.** So the
candidates were re-measured first, and the honest scoreboard read:

| realm | ours, measured | Chrome |
|---|---|---|
| `trusted-types` | `idlharness` **12/100**, the five largest files **could-not-run** | 3,548/3,602 |
| `websockets` | `idlharness` **10/62**, `constructor/004` **0/161** | 809/831 |
| `xhr` | `idlharness` **92/196** | 1,892/1,990 |
| `mimesniff` | `parsing.any.html` nav-error | 1,510/3,886 (38.9%) |

`trusted-types` was the largest self-contained realm on that list, it is pure JS,
and it is a **security** feature — so it went first.

### The mission case

DOM XSS is one bug written a thousand times: a string the application did not
author reaches somewhere that turns strings into code. `el.innerHTML = …`.
`script.src = …`. `eval(…)`. Every framework has an escape-hatch for it and every
large codebase has a few hundred of them.

Trusted Types does not ask developers to find those sites. It makes the sites
themselves refuse: with `require-trusted-types-for 'script'` in the page's
Content Security Policy, **every** injection sink rejects a plain string, and the
only way through is a named policy the application wrote on purpose. One
auditable place per application, instead of one per assignment.

And it is the rare defence that costs the **device** nothing. No scanner, no
extension, no background process, no megabytes. The browser simply refuses. For
the reader on a second-hand laptop — the person with the most to lose from a
stolen session and the least room to run anything extra to prevent it — that is
the only kind of protection that actually arrives.

---

## The measured baseline

28 files run before any change (`scripts/wpt-trusted-types-probe.txt`, first 28
rows). **21 PASS / 429 total; 21 of the 28 files could not run at all** — the
shared helper `support/helper.sub.js` opens with
`window.trustedTypes.createPolicy(...)`, which threw, so testharness never
received a single subtest.

> **⚠️ The realm was invisible, not failing — the SEVENTH time this campaign has
> met that shape.** A file that reports nothing is not a file that scores badly.
> The seven `trusted-types` files that *did* produce a number were the ones whose
> first script did not touch `trustedTypes`.

---

## The work

Roughly 400 lines in `crates/obscura-js/js/bootstrap.js`, plus sink hooks in the
DOM.

### The three trusted types, and where their data lives

`TrustedHTML`, `TrustedScript`, `TrustedScriptURL` — each with `toString()`,
`toJSON()`, and **no constructor a page may call**.

**⭐ The data is held OFF the instance, in a `WeakMap`.** That is the security
property, not an implementation taste. `TrustedHTML` then has no own property to
overwrite and no prototype path to forge, so a value arriving at a sink is a value
some policy really produced. An own field — even a non-writable one — would still
be forgeable with `Object.create(TrustedHTML.prototype)`, and **a forged trusted
value is worse than no Trusted Types at all: it is a guarantee that isn't one.**

### `TrustedTypePolicy` — and the two meanings of `null`

**⭐ A policy callback runs with `this` UNDEFINED.** It is application code being
asked to sanitize, not a method of the policy; handing it the policy object would
hand it the very authority it exists to mediate. (WPT proves this on purpose with
a class method that returns `String(this)` and expects `"undefined"`.)

**⭐⭐ A callback returning `null` means two different things, and the difference
is the whole gap between a convenience and a hole.**

- From an explicit `policy.createHTML(x)`, `null` means *"I produce nothing
  here"* and yields the **empty string** — safe in every sink.
- From the **default** policy, invoked because a plain string turned up at a
  sink, `null` means *"I decline to vouch for this"* — and declining must
  **block**.

One `throwIfMissing` flag distinguishes the two callers. Getting it backwards
either makes `createHTML(s => null)` throw for no reason, or lets a default policy
that refused a value be treated as if it had approved it.

### The sink tables

`getAttributeType` / `getPropertyType` and the live checks share one pair of
lookup functions, so the API that *tells* a page what a sink needs can never
disagree with the code that *enforces* it.

**⭐ Attributes are ASCII-case-INSENSITIVE and properties are case-SENSITIVE**,
because attribute names are matched by the parser and property names are IDL
identifiers. `getAttributeType("script","SRC")` is `TrustedScriptURL`;
`getPropertyType("iframe","srcDoc")` is `null`. And `ſcript` (U+017F) is not
`script` — the folding is **ASCII-only**, which is exactly the trick a
homograph-based bypass would reach for.

**⭐ The lookup takes an attribute's LOCAL NAME and NAMESPACE, never a qualified
name.** `(xlink, href)` on an SVG `<script>` is a sink; the string `"xlink:href"`
is not. A parser that conflated them would either miss the legacy spelling that
is still live on the real web, or block an attribute that merely looks like it.

The event-handler set is built from **what this engine actually exposes**
(`_EH_ATTR_SET ∪ _BODY_WIN_REFLECT_SET` plus the two media and three
SVG-animation handlers), not from some other browser's list. A name we do not
implement is not an event handler content attribute here, and blocking a page for
a handler that could never run is a false positive with a real cost.

### The nine attribute setters, and the asymmetry between them

WPT drives one assertion through **nine** different APIs. They split into two
groups, and the split is not an oversight in the spec:

| accepts a trusted value in IDL | stringifies first |
|---|---|
| `Element.setAttribute` | `Element.setAttributeNode` / `NodeNS` |
| `Element.setAttributeNS` | `NamedNodeMap.setNamedItem` / `NS` |
| | `Attr.value`, `Node.nodeValue`, `Node.textContent` (on an Attr) |

**⭐ The right-hand column must REFUSE a trusted value**, because an `Attr`'s value
is a `DOMString` — the trust was stripped by the IDL conversion before the sink
ever saw it. That asymmetry is what stops a page laundering an untrusted string
through an `Attr` node.

Four hooks cover all nine: `setAttribute`, `setAttributeNS`, the shared
`_setAttrNode` funnel, and the `Attr` value setter. The shared low-level
`_rawSetNS` was deliberately **not** hooked — it is also the path a *clone* takes,
and cloning an element that already carries an `onclick` is not an injection.

### Enforcement, and where the policy comes from

`<meta http-equiv="Content-Security-Policy">`, read out of the DOM. 213 of the
realm's ~230 files deliver it that way.

**⚠️ And the cache could not simply be computed once**, because
`HTMLElement-generic.html` *inserts* a meta at runtime and expects the page to
become enforcing mid-life. The resolution comes from the standard: **a policy is
append-only.** CSP3 says a meta's `content` is ignored after parsing and that
*removing* the element does not withdraw the policy — otherwise an injected
script could turn a page's defences off by deleting a tag. So the cache re-scans
only while nothing is enforced yet and something meta-shaped has moved
(`appendChild`/`insertBefore` of a `<meta>` marks it dirty, one `localName`
compare on a path already crossing the bridge); **once enforcement is on it is
final and never scanned again.** 44/72 → **68/72** on that file.

### Engine-internal writes must not be re-checked

`document.write` parses through a staging `<div>`; `outerHTML` parses through a
fragment-context element; `createContextualFragment` does the same. All three go
through the very `innerHTML` setter a page uses. A `_ttUnchecked()` bracket keeps
them out of the check — **a second pass would run the default policy twice for
one assignment**, and a default policy is allowed to have side effects, so the
page can see the difference.

### Also landed on the way

- **`Element.text`** — `[CEReactions] DOMString` on five interfaces, meaning two
  different things: the legacy text-**colour** attribute on `<body>` and child
  text content on `<a>`/`<script>/<title>/<option>`. It existed on none of them.
- **`trustedTypes` is no longer hidden from workers.** It was on the worker deny
  list; it is `[Exposed=*]`, and a worker builds markup and script URLs too. *A
  defence that stops at the window boundary is a defence with a door in it.*

---

## Results

Top-60 window (86% of the realm's subtests), same server, one file at a time:

| file | before | after |
|---|---|---|
| `set-attributes-require-trusted-types-no-default-policy` | could-not-run | **264/264** |
| `set-attributes-require-trusted-types-default-policy` | could-not-run | **263/264** |
| `set-attributes-no-require-trusted-types` | could-not-run | **202/202** |
| `trusted-types-event-handlers` | 9/111 | **111/111** |
| `TrustedTypePolicyFactory-getAttributeType-event-handler-content-attributes` | 0/93 | **93/93** |
| `Node-multiple-arguments` / `-tt-enforced` | could-not-run | **90/90** each |
| `trusted-types-secondary-document` | could-not-run | **91/97** |
| `HTMLElement-generic` | could-not-run | **68/72** |
| `TrustedTypePolicyFactory-metadata.tentative` | could-not-run | **64/64** |
| `idlharness.window` | 12/100 | **95/100** |
| `TrustedTypePolicy-createXXX` | 0/3 ERROR | **29/29** |
| `TrustedTypePolicyFactory-createPolicy-createXYZTests` | 0/28 | **28/28** |
| `TrustedTypePolicyFactory-getPropertyType.tentative` | 0/28 | **28/28** |
| `TrustedType-AttributeNodes` | could-not-run | **33/33** |
| `set-attributes-mutations-in-callback.tentative` | could-not-run | 143/248 |

**Window total: ~21/429 measured before → 1,917 / 2,461 run (77.9%) across 54
files, out of a 60-file window Chrome scores 3,098 on.**

---

## Caps, named honestly

**(a) `eval` and the `Function` constructor are NOT hooked** — `eval-function-
constructor` 1/65, plus four `…-function-constructor` reporting files at 0/12.
This is deliberate and it is not laziness: replacing `globalThis.eval` converts
every *direct* eval in every page into an *indirect* one, which is a real change
of scope, and replacing `Function` breaks the
`Function.prototype.constructor === Function` identity that brand checks across
the platform rest on. **The correct place is V8's own
`set_modify_code_generation_from_strings_callback`** — a Rust-side hook in
`obscura-js`, which is exactly what other browsers use. That is the single
highest-value follow-up in this realm.

**(b) `set-event-handlers-content-attributes.tentative.html` (527 subtests, the
realm's largest file) still could-not-run.** It is a `<script type="module">`
that dynamically imports an `.mjs` which imports `/resources/WebIDLParser.js`,
fetches `/interfaces/html.idl`, and needs `SVGAnimationElement`. Not a Trusted
Types gap — a module + IDL-tooling gap.

**(c) `script-enforcement-001…004` (130 subtests) TIMEOUT.** They append a
freshly built `<script>` to the document and assert on whether it *runs*. This
engine executes scripts once, at load; a dynamically inserted `<script>` never
executes. That is an engine-level gap worth its own quest — and it is not
Trusted-Types-shaped, it is "the page can add code at runtime"-shaped.

**(d) Header-delivered CSP is not plumbed into the JS realm**, so the ~17
`.headers` files (report-only, violation reporting,
`should-*-be-blocked-by-csp-*`) cannot pass. They also need
`SecurityPolicyViolation` events, which do not exist. That is the
`content-security-policy` realm (4,354 subtests, Chrome 92%) waiting its turn.

**(e) `set-attributes-mutations-in-callback.tentative` 143/248** — the remaining
half is about DOM mutations performed *inside* the default policy callback and
what the setter observes afterwards. Real spec work, self-contained, cheap for
whoever takes it next.

**(f) `trusted-types-from-literal.tentative` 24/45** — `trustedTypes.fromLiteral`
is not implemented (a template-literal escape hatch, still tentative).

---

## Next

1. **The V8 `ModifyCodeGenerationFromStrings` hook** — closes (a), ~110
   subtests, and is the last structural piece of the realm.
2. **Dynamically inserted `<script>` execution** — closes (c) here and is worth
   far more than 130 subtests everywhere else.
3. **Header CSP + `SecurityPolicyViolation`** — opens (d) here and the whole
   `content-security-policy` realm next door.
