#!/usr/bin/env node
// Run WPT's own XPath corpus against Obscura's XPath engine — in Node, offline,
// in about a second, with no browser and no CDP.
//
// WHY THIS EXISTS. `domxpath/xml_xpath_runner.html` is 1,024 subtests in one
// file: 1,024 XPath expressions, each with the exact XML tree it must match and
// the exact node it must select. That is not a browser test, it is a table of
// inputs and expected outputs for a PURE FUNCTION — and a 20-second-per-file CDP
// sweep is the wrong tool for a pure function. The same lesson paid for itself
// twice already in this campaign (`mimesniff`, quest #492; `eventsource`, #494).
//
// It works by slicing the XPath engine out of `bootstrap.js` between its two
// marker comments and evaluating it against a minimal DOM built here, so there
// is ONE source of truth: the code this exercises is the code that ships.
//
// Usage:
//   node scripts/xpath_offline_test.mjs                 # the whole corpus
//   node scripts/xpath_offline_test.mjs --limit 50      # the first 50
//   node scripts/xpath_offline_test.mjs --verbose       # show each failure
//
// The corpus is fetched once to scripts/.xpath-corpus.xml and cached.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BOOTSTRAP = path.join(ROOT, 'crates/obscura-js/js/bootstrap.js');
const CORPUS = path.join(HERE, '.xpath-corpus.xml');
const CORPUS_URL = 'https://wpt.live/domxpath/xml_xpath_tests.xml';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

// ── A minimal DOM, exactly as wide as the engine reads ────────────────────────
// Deliberately not a DOM implementation: it is the set of properties the XPath
// engine touches, and nothing else. If the engine grows a new read this file
// will throw rather than quietly answer undefined.
let uid = 0;
class MiniNode {
  constructor(type) {
    this.nodeType = type;
    this.parentNode = null;
    this.firstChild = null;
    this.lastChild = null;
    this.nextSibling = null;
    this.previousSibling = null;
    this.ownerDocument = null;
    this._uid = ++uid;
  }
  appendChild(c) {
    c.parentNode = this;
    c.previousSibling = this.lastChild;
    if (this.lastChild) this.lastChild.nextSibling = c;
    else this.firstChild = c;
    this.lastChild = c;
    return c;
  }
}
class MiniAttr extends MiniNode {
  constructor(name, value, ownerElement) {
    super(2);
    this.name = name;
    this.value = value;
    this.ownerElement = ownerElement;
    const i = name.indexOf(':');
    if (i > 0) {
      this.prefix = name.slice(0, i);
      this.localName = name.slice(i + 1);
      this.namespaceURI = this.prefix === 'xml' ? XML_NS
        : this.prefix === 'xmlns' ? XMLNS_NS : null;
    } else {
      this.prefix = null;
      this.localName = name;
      this.namespaceURI = name === 'xmlns' ? XMLNS_NS : null;
    }
    this.nodeName = name;
  }
}
class MiniElement extends MiniNode {
  constructor(name) {
    super(1);
    this.nodeName = name;
    const i = name.indexOf(':');
    this.prefix = i > 0 ? name.slice(0, i) : null;
    this.localName = i > 0 ? name.slice(i + 1) : name;
    this.namespaceURI = null;      // the corpus is a no-namespace document
    this._attrs = [];
    this.attributes = makeNamedNodeMap(this._attrs);
  }
  setAttribute(name, value) {
    const a = new MiniAttr(name, value, this);
    this._attrs.push(a);
    this.attributes = makeNamedNodeMap(this._attrs);
  }
  getAttributeNS(ns, local) {
    for (const a of this._attrs) {
      if (a.localName === local && (a.namespaceURI || null) === (ns || null)) return a.value;
    }
    return null;
  }
  lookupNamespaceURI(prefix) {
    if (prefix === 'xml') return XML_NS;
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) {
      for (const a of n._attrs) {
        if (prefix == null || prefix === '') { if (a.name === 'xmlns') return a.value || null; }
        else if (a.prefix === 'xmlns' && a.localName === prefix) return a.value || null;
      }
    }
    return null;
  }
}
function makeNamedNodeMap(arr) {
  const m = { length: arr.length };
  arr.forEach((a, i) => { m[i] = a; });
  return m;
}
class MiniText extends MiniNode {
  constructor(data) { super(3); this.data = data; this.nodeName = '#text'; }
}
class MiniComment extends MiniNode {
  constructor(data) { super(8); this.data = data; this.nodeName = '#comment'; }
}
class MiniDocument extends MiniNode {
  constructor() { super(9); this.nodeName = '#document'; this.contentType = 'application/xml'; }
  get documentElement() {
    for (let c = this.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) return c;
    return null;
  }
  getElementById(id) {
    let found = null;
    const walk = (n) => {
      if (found) return;
      if (n.nodeType === 1) {
        for (const a of n._attrs) if (a.localName === 'id' && a.namespaceURI === null && a.value === id) { found = n; return; }
      }
      for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
    };
    walk(this);
    return found;
  }
  getElementsByTagNameNS(ns, local) {
    const want = ns === '' ? null : ns;
    const out = [];
    const walk = (n) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1 && c.localName === local && (c.namespaceURI || null) === want) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}

// ── A small XML parser, enough for the corpus ────────────────────────────────
// Whitespace between elements is KEPT as text nodes, because that is what a real
// parser produces and the corpus asks `not(child::node())` about it.
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9A-Fa-f]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[body] !== undefined ? ENTITIES[body] : m;
  });
}
function parseXML(src) {
  const doc = new MiniDocument();
  let cur = doc;
  let i = 0;
  const n = src.length;
  const attach = (node) => { node.ownerDocument = doc; cur.appendChild(node); };
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { const t = src.slice(i); if (t) attach(new MiniText(decodeEntities(t))); break; }
    if (lt > i) attach(new MiniText(decodeEntities(src.slice(i, lt))));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      attach(new MiniComment(src.slice(lt + 4, end)));
      i = end + 3; continue;
    }
    if (src.startsWith('<?', lt)) { i = src.indexOf('?>', lt) + 2; continue; }
    if (src.startsWith('<!', lt)) { i = src.indexOf('>', lt) + 1; continue; }
    if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      cur = cur.parentNode;
      i = end + 1; continue;
    }
    // Start tag: scan to the matching '>' that is not inside an attribute value.
    let j = lt + 1, inQ = null;
    while (j < n) {
      const c = src[j];
      if (inQ) { if (c === inQ) inQ = null; }
      else if (c === '"' || c === "'") inQ = c;
      else if (c === '>') break;
      j++;
    }
    let inner = src.slice(lt + 1, j);
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1);
    const m = /^([^\s/>]+)/.exec(inner);
    const el = new MiniElement(m[1]);
    el.ownerDocument = doc;
    const attrRe = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let am;
    const rest = inner.slice(m[1].length);
    while ((am = attrRe.exec(rest))) {
      el.setAttribute(am[1], decodeEntities(am[3] !== undefined ? am[3] : am[4]));
    }
    cur.appendChild(el);
    if (!selfClose) cur = el;
    i = j + 1;
  }
  return doc;
}

// ── Slice the engine out of bootstrap.js ─────────────────────────────────────
const BEGIN = '// ===== XPATH-ENGINE-BEGIN =====';
const END = '// ===== XPATH-ENGINE-END =====';
function loadEngine() {
  let src;
  if (process.env.XPATH_ENGINE_FILE) {
    src = fs.readFileSync(process.env.XPATH_ENGINE_FILE, 'utf8');
  } else {
    const boot = fs.readFileSync(BOOTSTRAP, 'utf8');
    const a = boot.indexOf(BEGIN), b = boot.indexOf(END);
    if (a < 0 || b < 0) {
      console.error('Could not find the XPath engine markers in bootstrap.js.\n' +
        'Expected ' + JSON.stringify(BEGIN) + ' and ' + JSON.stringify(END) + '.');
      process.exit(2);
    }
    src = boot.slice(a, b);
  }
  // The engine needs three globals from the page: DOMException, Document (it
  // installs createExpression/evaluate onto its prototype) and globalThis.
  const sandbox = {
    DOMException: class DOMException extends Error {
      constructor(message, name) { super(message); this.name = name || 'Error'; }
    },
    Document: class Document {},
  };
  const fn = new Function('globalThis', 'DOMException', 'Document', src + '\nreturn globalThis;');
  const g = {};
  fn(g, sandbox.DOMException, sandbox.Document);
  if (!g.__xpathInternals) {
    // The engine hangs its interfaces off globalThis; Document.prototype writes
    // land on the stub, which is fine — we drive the internals directly.
    console.error('engine loaded but __xpathInternals is missing');
    process.exit(2);
  }
  return { g, DOMException: sandbox.DOMException };
}

// ── The corpus ───────────────────────────────────────────────────────────────
async function ensureCorpus() {
  if (fs.existsSync(CORPUS)) return fs.readFileSync(CORPUS, 'utf8');
  process.stderr.write('fetching ' + CORPUS_URL + ' …\n');
  const res = await fetch(CORPUS_URL);
  if (!res.ok) { console.error('fetch failed: ' + res.status); process.exit(2); }
  const txt = await res.text();
  fs.writeFileSync(CORPUS, txt);
  return txt;
}

function childElement(el, name) {
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.nodeName === name) return c;
  }
  return null;
}
function textOf(el) {
  let s = '';
  const walk = (n) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) s += c.data;
      else if (c.nodeType === 1) walk(c);
    }
  };
  if (el) walk(el);
  return s;
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? parseInt(args[li + 1], 10) : Infinity;

  const { g } = loadEngine();
  const { parse, Ctx, eval: xpEval, bindPrefixes } = g.__xpathInternals;

  const corpusText = await ensureCorpus();
  const corpus = parseXML(corpusText);
  const tests = [];
  for (let c = corpus.documentElement.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1) tests.push(c);
  }

  let pass = 0, fail = 0;
  const failures = [];
  const t0 = Date.now();

  for (let idx = 0; idx < Math.min(tests.length, limit); idx++) {
    const testEl = tests[idx];
    const expr = textOf(childElement(testEl, 'xpath'));
    const resultEl = childElement(testEl, 'result');
    const wantNS = textOf(childElement(resultEl, 'namespace'));
    const wantLocal = textOf(childElement(resultEl, 'localname'));
    const wantNth = parseInt(textOf(childElement(resultEl, 'nth')), 10);
    const treeEl = childElement(testEl, 'tree');

    // Rebuild the subtree in a fresh XML document, exactly as the WPT runner's
    // adoptNode() does — the context node is the tree's root element.
    const doc = new MiniDocument();
    let rootEl = null;
    for (let c = treeEl.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) { rootEl = c; break; }
    const cloned = cloneInto(rootEl, doc);
    doc.appendChild(cloned);
    cloned.parentNode = doc;

    try {
      const ast = parse(expr);
      const ctx = bindPrefixes(new Ctx(doc, cloned, null), ast);  // resolver = the context element
      const got = xpEval(ast, cloned, 1, 1, ctx);
      if (!Array.isArray(got)) throw new Error('result is not a node-set (' + typeof got + ')');
      if (got.length !== 1) throw new Error('matched ' + got.length + ' nodes, want 1');
      const similar = doc.getElementsByTagNameNS(wantNS, wantLocal);
      const want = similar[wantNth];
      if (got[0] !== want) {
        throw new Error('matched the wrong node: got <' + got[0].nodeName +
          '> want ' + wantNS + ':' + wantLocal + '[' + wantNth + ']' +
          (want ? ' <' + want.nodeName + '>' : ' (which does not exist)'));
      }
      pass++;
    } catch (e) {
      fail++;
      failures.push({ idx, expr, err: String(e && e.message || e) });
    }
  }

  const ms = Date.now() - t0;
  if (verbose) {
    for (const f of failures.slice(0, 40)) {
      console.log('--- test #' + f.idx + ': ' + f.err);
      console.log('    ' + f.expr.slice(0, 300));
    }
    if (failures.length > 40) console.log('… and ' + (failures.length - 40) + ' more');
  } else if (failures.length) {
    const byErr = new Map();
    for (const f of failures) {
      const key = f.err.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').slice(0, 90);
      byErr.set(key, (byErr.get(key) || 0) + 1);
    }
    console.log('failure shapes:');
    for (const [k, v] of [...byErr].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log('  ' + String(v).padStart(5) + '  ' + k);
    }
  }
  console.log('\nXPath corpus: ' + pass + ' PASS / ' + fail + ' FAIL of ' +
    (pass + fail) + '  (' + ms + ' ms)');
  process.exit(fail ? 1 : 0);
}

function cloneInto(node, doc) {
  if (node.nodeType === 1) {
    const el = new MiniElement(node.nodeName);
    el.ownerDocument = doc;
    for (const a of node._attrs) el.setAttribute(a.name, a.value);
    for (let c = node.firstChild; c; c = c.nextSibling) el.appendChild(cloneInto(c, doc));
    return el;
  }
  if (node.nodeType === 3) { const t = new MiniText(node.data); t.ownerDocument = doc; return t; }
  if (node.nodeType === 8) { const t = new MiniComment(node.data); t.ownerDocument = doc; return t; }
  const t = new MiniText(''); t.ownerDocument = doc; return t;
}

main();
