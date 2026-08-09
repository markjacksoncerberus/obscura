# 📜 The Vouched-Hash Verdict — Quest #534

> **The cap Quest #519 named, closed with the machinery Quest #530 built.**
> `script-src 'sha384-…'` now authorises an **external** script — by matching the
> script's `integrity` attribute, which is the only thing it was ever supposed to match.

---

## The gap

Quest #519 shipped CSP's `script-src` and wrote this comment against it:

> ⛔ A hash source can authorise an EXTERNAL script, by matching the `integrity`
> attribute rather than the URL (CSP3 + SRI). We do not check integrity metadata yet,
> so a list containing hashes is one we cannot decide — and an undecided policy must
> not block. Named as a cap.

So any policy whose `script-src` list contained a hash was **dropped entirely** for
external scripts. `script-src 'sha384-<one exact file>'` — about as tight as a policy can
be written — permitted every `<script src>` on the page.

That was the right call at the time: an undecided policy must fail open, and there was no
digest machinery to decide with. Quest #530 built that machinery for `integrity` itself.
**This is the seam the two specifications were written to meet at**, and both halves now
exist.

## What landed

In `__cspAllowsScriptURL`, where the policy used to be dropped:

1. Collect the hash-sources from the governing list.
2. Read the element's `integrity` attribute and parse it with `_sriParseMetadata`
   (Quest #530's parser — one implementation, not two).
3. If **every** digest the element promises is one the policy permits, that policy has no
   further say and the script may load.
4. Otherwise the policy keeps its say and the URL is matched normally — which, for a list
   made only of hashes, means **blocked**.

---

## ⭐ The findings

### ⭐⭐ The rule is "every", not "any"

Each hash the element **promises** must be one the policy **permits** — not "at least one
of them matches".

A script pinned to two digests, only one of which the policy lists, is a script the policy
has not fully vouched for. And taking "any" would be an escape hatch with the shape of a
feature: an author (or an injection that can edit an attribute) could widen a policy just
by *appending* a hash the server never had to honour, since the extra digest would be
matched against a list that already contains a good one.

### ⚠️ A hash-source policy is a comment unless something verifies the response

This is why the cap could not have been closed earlier by "just comparing strings". CSP's
hash-source only ever says **which bytes are acceptable**. It says nothing about the bytes
that actually arrived. If nothing checks that the response *is* those bytes, then
`script-src 'sha384-…'` matched against an `integrity` attribute is two strings agreeing
with each other while the network delivers whatever it likes.

Quest #530's SRI check is what makes this real: the same load is separately verified
against the same digest, and a mismatch is a network error. **The policy names the file;
SRI proves it is that file.** Neither is worth much alone, which is presumably why the two
specs cross-reference each other rather than each growing their own version.

### ⭐ No promise means the hashes cannot help you

An external script with no `integrity` attribute at all gets **nothing** from the hash
sources — the policy is kept and the URL must match on its own merits. A list made only of
hashes therefore blocks it.

That is a tightening from the previous fail-open behaviour, and it is the entire point of
the directive: a policy that says "only these exact bytes" must not be satisfied by a
script that has declined to say which bytes it is.

### ⭐ One parser, two specs

`_sriParseMetadata` is now the single reader of an `integrity` attribute in this engine.
Quest #524's lesson stands: *two implementations of one thing is a bug waiting for a
delivery path* — and this attribute is read by two different specifications, which is
exactly the shape that grows a second parser if nobody stops it.

---

## ⛔ Honest caps

- **`'strict-dynamic'` is still not implemented** and still fails open on URL matching.
  It interacts with hash-sources (a hash-authorised script becomes a trusted parent for
  scripts it inserts), and that propagation is not modelled.
- `integrity` on `<link rel=stylesheet>` does not yet authorise a stylesheet against
  `style-src` hash sources; only the script side is wired.
- Redirect hops are still unchecked.

## Next

The remaining `script-src` hash work is the `scripthash-*` family for **inline** scripts,
which has been correct since #519, and `'strict-dynamic'`, which is a larger piece and now
the last big fail-open in the directive.
