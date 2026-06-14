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
| 10 | [The Traversal Labyrinth](10-the-traversal-labyrinth.md) | `dom/ranges`, `dom/traversal` | 🔓 301+/7606 | ⚔️⚔️⚔️ | ~? |
| 11 | [The Collections Armory](11-the-collections-armory.md) | `dom/collections`, getElementsBy* | 1/3+ | ⚔️⚔️ | ~? |
| 12 | [The Iframe Frontier](12-the-iframe-frontier.md) | `html/.../the-iframe-element` | mostly held | ⚔️⚔️ | ~20 |
| ~~13~~ | ✅ [The Harness Gates](13-the-harness-gates.md) | *meta* — could-not-run / no-results | **SECURED** | ⚔️⚔️ | unlocked #10 |

Difficulty: ⚔️ quick & decisive · ⚔️⚔️ a proper campaign · ⚔️⚔️⚔️ an architectural siege.

---

## 🗺️ Captain's Counsel (recommended order)

1. **The Harness Gates (13)** first — several realms report *could-not-run* / *no-results*;
   unlocking the harness reveals (and may pass) whole regions we currently can't even measure.
2. **The Selector Sorcery (01)** — highest bounty in a single realm; directly powers how
   agents find elements in real SPAs.
3. **The Attr-Node Codex (02)** and **The Element Forge (05)** — foundational DOM models
   that ripple across *many* other realms once built.
4. The smaller, self-contained realms (08–11) for steady morale and breadth.

## 📜 Lands already secured this campaign (for the chronicles)

URL realm (`constructor 1→833`, `origin →403/403`, `setters 5→226`, `searchparams 1→4/4` + family),
`Element-classlist ~0→1315/1420`, `querySelector-All 1396→1646`, `Node-appendChild 1→11/11`,
`EventListener-handleEvent 1→6/6`, iframe increments 1–4, `insertAdjacentText`, named-window access,
and a frame-window realm fallback. The engine was also **hardened against URL-triggered crashes**.
