# 🏰 The Quest Board — Web Platform Conformance Campaign

> *Hear ye! These scrolls chart every unconquered realm of the Web Platform Tests
> still standing between Obscura and a kingdom safe for all AI-agent travellers.
> Each scroll names a region, its current hold, the beasts within, and a battle
> plan. Choose thy banner.*

Measured via `scripts/wpt_run.py` over CDP against a `--features render` server.
Live scoreboard of conquered lands: [`../WPT_PROGRESS.md`](../WPT_PROGRESS.md).

---

## ⚔️ Open Quests

| # | Scroll | Realm | Hold | Difficulty | Bounty |
|---|--------|-------|:----:|:----------:|:------:|
| 01 | [The Selector Sorcery](01-the-selector-sorcery.md) | `dom/nodes/ParentNode-querySelector-All` | 1917/1977 | ⚔️⚔️ | ~60 left |
| 02 | [The Attr-Node Codex](02-the-attr-node-codex.md) | `dom/nodes/attributes` | 11/67 | ⚔️⚔️⚔️ | ~56 |
| 03 | [The ClassList Mutation-Echo](03-the-classlist-mutation-echo.md) | `dom/nodes/Element-classlist` | 1315/1420 | ⚔️⚔️ | ~105 |
| 04 | [The URL Swamps](04-the-url-swamps.md) | `url/url-constructor`, `url/url-setters` | 833+226 | ⚔️⚔️⚔️ | ~110 |
| 05 | [The Element Forge](05-the-element-forge.md) | `dom/nodes/Document-createElement` | 0/147 | ⚔️⚔️⚔️ | ~147 |
| 06 | [The Node-Smithing Vaults](06-the-node-smithing-vaults.md) | `dom/nodes/Node-*` | mixed | ⚔️⚔️ | ~150 |
| 07 | [The Event Amphitheater](07-the-event-amphitheater.md) | `dom/events/*` | mixed | ⚔️⚔️ | ~? |
| 08 | [The Encoding Cipher](08-the-encoding-cipher.md) | `encoding/*` | 2/6+ | ⚔️⚔️ | ~? |
| 09 | [The FileAPI Vault](09-the-fileapi-vault.md) | `FileAPI/*` | 4/8+ | ⚔️⚔️ | ~? |
| 10 | [The Traversal Labyrinth](10-the-traversal-labyrinth.md) | `dom/ranges`, `dom/traversal` | ⚔️ traversal **DONE**; ranges 90%+ | ⚔️⚔️⚔️ | iframe content-ops left |
| 11 | [The Collections Armory](11-the-collections-armory.md) | `dom/collections`, getElementsBy* | 1/3+ | ⚔️⚔️ | ~? |
| 12 | [The Iframe Frontier](12-the-iframe-frontier.md) | `html/.../the-iframe-element` | mostly held | ⚔️⚔️ | ~20 |
| ~~13~~ | ✅ [The Harness Gates](13-the-harness-gates.md) | *meta* — could-not-run / no-results | **SECURED** | ⚔️⚔️ | unlocked #10 |

Difficulty: ⚔️ quick & decisive · ⚔️⚔️ a proper campaign · ⚔️⚔️⚔️ an architectural siege.

---

## 🗺️ Captain's Counsel (recommended order — updated 2026-06-14, session 2)

With **#10 traversal conquered and ranges driven to 90%+**, the field has shifted again:

1. **The Iframe Frontier (12)** — now the keystone. The remaining `dom/ranges` content-op
   tests (`Range-insertNode`, `surroundContents`, `cloneContents`, `deleteContents`,
   `extractContents` — ~6,000 subtests) are blocked NOT by Range (verified correct in
   isolation) but by their **cross-iframe comparison harness**: `actualIframe`/`expectedIframe`
   with `iframe.contentWindow.setupRangeTests()`, `contentWindow.testRange`, per-iframe JS
   realms. Unblock real iframe content-document realms and a big bounty falls. (The
   `restoreIframe` `while(contentDocument.firstChild)` loops also *hang* today — same node-
   identity class we keep hitting; fix once, cash many tests.)
2. **The Selector Sorcery (01)** — finish the tail (see Scroll 01 for the bucketed 60).
   The cheap remaining strikes are gone; what's left is namespace selectors, shadow-DOM
   pseudo-elements, a real `NodeList` type, and a harness node-identity mystery.
3. **The Attr-Node Codex (02)** and **The Element Forge (05)** — foundational DOM models
   that ripple across *many* other realms once built.
4. The smaller, self-contained realms (08–11) for steady morale and breadth.

## 📜 Lands already secured this campaign (for the chronicles)

URL realm (`constructor 1→833`, `origin →403/403`, `setters 5→226`, `searchparams 1→4/4` + family),
`Element-classlist ~0→1315/1420`, `Node-appendChild 1→11/11`, `EventListener-handleEvent 1→6/6`,
iframe increments 1–4, `insertAdjacentText`, named-window access, frame-window realm fallback, and the
engine **hardened against URL-triggered crashes**.

**Session 2026-06-14 (knight Claudius):**
- **#13 Harness Gates — SECURED.** `createCDATASection`/`createProcessingInstruction` +
  real `DetachedDocument` (for `new Document()`, `implementation.createDocument`/
  `createHTMLDocument`/`createDocumentType`) replacing stubs that returned the live page;
  fixed a latent `Comment`/`PI` `textContent` bug. Unblocked all of `dom/ranges` +
  `dom/traversal` (no-results → ~7,600 measurable; `TreeWalker` 0→300/761).
  Bonus: `Node-cloneNode` 98→99. Tool added: `scripts/harness_probe.py`.
- **#01 Selector Sorcery — 1646 → 1917/1977 (97.0%).** Stable `Element::opaque()` identity
  (the keystone — un-corrupted the selectors-crate NthIndexCache, fixing all `:nth-*` /
  `*-of-type`, +151); CSS2 pseudo-elements parse-but-never-match (+80); `querySelector`
  WebIDL coercion (+~6); `:lang()` with ancestor inheritance (+26); `:link`/`:any-link`/
  `:visited` (+8). Commits `1342890`, `a6d8257`, `bc515c1`, `60b138d`.

**Session 2026-06-14 #2 (Quest #10 The Traversal Labyrinth):**
- **Traversal — CONQUERED.** Real `NodeIterator` (1→766/766, was a TreeWalker alias),
  spec `TreeWalker` (300→761/761, real FILTER_REJECT subtree-pruning vs SKIP, active
  flag, validating currentNode), `NodeIterator-removal` 0→23/23 (pre-removing steps +
  WeakRef live-iterator registry), full `NodeFilter` constant set, `createHTMLDocument`
  now prepends `<!DOCTYPE html>`. Commits `070ab6f`, `1f7a428`.
- **Range — built from a no-op stub.** Boundary-point model + all comparison/positioning/
  selection/mutation algorithms (content ops verified correct in isolation):
  `comparePoint` 0→5518/5580, `Range-set` 0→10838/10920, `compareBoundaryPoints`
  0→8665/9313, `isPointInRange` 0→5521/5733, `intersectsNode` 0→2356/2356,
  `stringifier` 5/5, + selectNode/collapse/cloneRange/commonAncestor 96–100%. `828ee41`.
- **Node identity — the keystone bug, fixed.** The global `document`, `DetachedDocument`
  fragments, and `DocumentType` nodes now each have ONE canonical wrapper (seeded into
  `_cache`), so `documentElement.parentNode === document`, `doctype === childNodes[i]`,
  etc. This was the long-standing "harness node-identity mystery" — it gated traversal,
  un-hung `Range-set`, and as a bonus made `compareDocumentPosition` real (hardcoded `4`
  → true tree order; +DOCUMENT_POSITION_* consts) → `Node-compareDocumentPosition`
  →1444/1444. Zero regressions; 143 unit tests green.
- **Left for #12:** the iframe-harness ranges content-op tests (~6k subtests) and the
  CDATA-in-HTML fixture (`paras[5]`, ~few hundred subtests, needs real CDATA nodes in
  the Rust DOM rather than coalescing text nodes).
