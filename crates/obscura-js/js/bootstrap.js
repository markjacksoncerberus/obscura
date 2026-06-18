"use strict";

const __obscura_errors = [];

globalThis.addEventListener = globalThis.addEventListener || function(){};
globalThis.onunhandledrejection = function(e) { if (e?.preventDefault) e.preventDefault(); };

globalThis.onerror = function(msg, src, line, col, error) {
  __obscura_errors.push({msg: String(msg), src: String(src||""), line, error: String(error||"")});
};
// The window is an EventTarget like any other: its listeners live in the shared
// _eventRegistry (key 'window') and it dispatches through the unified spec path,
// so a window listener participates in capturing/bubbling for events dispatched
// on descendant nodes. The core (_addListener/_dispatchSpec) is defined later but
// only referenced when these are CALLED (at runtime, after bootstrap loads).
globalThis.addEventListener = function(type, fn, opts) { _addListener(globalThis, type, fn, opts); };
globalThis.removeEventListener = function(type, fn, opts) { _removeListener(globalThis, type, fn, opts); };
globalThis.dispatchEvent = function(event) { return _dispatchPublic(globalThis, event); };

// Report an uncaught listener exception the way the platform does: fire an
// `error` event on the window (EventWatcher/onerror observe this), then fall
// back to onerror(message, ...). Used by event dispatch per the DOM spec.
const _reportError = function(err) {
  try { console.error(err); } catch (e) {}
  let ev;
  try {
    ev = (typeof ErrorEvent === 'function')
      ? new ErrorEvent('error', { error: err, message: (err && err.message) || String(err), cancelable: true })
      : null;
  } catch (e) { ev = null; }
  if (!ev) ev = { type: 'error', error: err, message: (err && err.message) || String(err),
                  defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  try {
    // Deliver to the window's 'error' listeners directly (not via dispatchEvent —
    // this is called from inside a dispatch's catch, and re-entering dispatch on
    // the same event object would throw). The window is the whole path for a
    // window-targeted error event, so capture/bubble listeners both apply.
    const entries = ((_eventRegistry['window'] || {})['error'] || []).slice();
    for (const e of entries) {
      const h = e && e.handler;
      try { (typeof h === 'function' ? h : h && h.handleEvent).call(globalThis, ev); } catch (_) {}
    }
  } catch (e) {}
  try {
    if (typeof globalThis.onerror === 'function' && !ev.defaultPrevented)
      globalThis.onerror(ev.message, '', 0, 0, err);
  } catch (e) {}
};

const _dom = (cmd, a1, a2) => Deno.core.ops.op_dom(cmd, String(a1 ?? ""), String(a2 ?? ""));

// ASCII-only case folding — HTML element/attribute names are lowercased/uppercased
// over the ASCII range ONLY (so e.g. U+212A KELVIN SIGN and U+0130 İ are NOT touched,
// unlike String.prototype.toLowerCase which does full Unicode case folding).
const _asciiLower = function(s) { return String(s).replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32)); };
const _asciiUpper = function(s) { return String(s).replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32)); };
// Element-name validity for Document.createElement (DOM §"create an element").
// Empirically matches the WPT Document-createElement valid/invalid partition: a name
// is valid iff it is non-empty, contains no ASCII whitespace or '>', and its first
// code point is an ASCII name-start ([A-Za-z:_]) or any non-ASCII (>= U+0080) code point.
const _isValidElementName = function(s) {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x09 || c === 0x0A || c === 0x0C || c === 0x0D || c === 0x20 || c === 0x3E) return false;
  }
  const f = s.codePointAt(0);
  if (f >= 0x80) return true;
  return (f >= 0x41 && f <= 0x5A) || (f >= 0x61 && f <= 0x7A) || f === 0x3A || f === 0x5F;
};

const _nativeFns = new Set();
const _origToString = Function.prototype.toString;
Function.prototype.toString = function() {
  if (_nativeFns.has(this)) {
    return `function ${this.name || ''}() { [native code] }`;
  }
  return _origToString.call(this);
};
const _markNative = function(fn) { if (typeof fn === 'function') _nativeFns.add(fn); return fn; };
_nativeFns.add(Function.prototype.toString);

// WHATWG DOMException — a real standard global (was previously undefined, so any
// `throw new DOMException(...)` raised a ReferenceError instead of the right error).
class DOMException extends Error {
  constructor(message = "", name = "Error") {
    super(message);
    this.name = name;
    this.message = message == null ? "" : String(message);
  }
  get code() { return DOMException._codes[this.name] || 0; }
}
DOMException._codes = {
  IndexSizeError: 1, HierarchyRequestError: 3, WrongDocumentError: 4,
  InvalidCharacterError: 5, NoModificationAllowedError: 7, NotFoundError: 8,
  NotSupportedError: 9, InUseAttributeError: 10, InvalidStateError: 11,
  SyntaxError: 12, InvalidModificationError: 13, NamespaceError: 14,
  InvalidAccessError: 15, TypeMismatchError: 17, SecurityError: 18, NetworkError: 19, AbortError: 20,
  URLMismatchError: 21, QuotaExceededError: 22, TimeoutError: 23,
  InvalidNodeTypeError: 24, DataCloneError: 25,
};
// Legacy numeric code constants live on the interface object.
Object.assign(DOMException, {
  INDEX_SIZE_ERR: 1, DOMSTRING_SIZE_ERR: 2, HIERARCHY_REQUEST_ERR: 3,
  WRONG_DOCUMENT_ERR: 4, INVALID_CHARACTER_ERR: 5, NO_DATA_ALLOWED_ERR: 6,
  NO_MODIFICATION_ALLOWED_ERR: 7, NOT_FOUND_ERR: 8, NOT_SUPPORTED_ERR: 9,
  INUSE_ATTRIBUTE_ERR: 10, INVALID_STATE_ERR: 11, SYNTAX_ERR: 12,
  INVALID_MODIFICATION_ERR: 13, NAMESPACE_ERR: 14, INVALID_ACCESS_ERR: 15,
  VALIDATION_ERR: 16, TYPE_MISMATCH_ERR: 17, SECURITY_ERR: 18, NETWORK_ERR: 19,
  ABORT_ERR: 20, URL_MISMATCH_ERR: 21, QUOTA_EXCEEDED_ERR: 22, TIMEOUT_ERR: 23,
  INVALID_NODE_TYPE_ERR: 24, DATA_CLONE_ERR: 25,
});
globalThis.DOMException = _markNative(DOMException);

// QuotaExceededError — the modern WHATWG interface (a DOMException subclass with
// nullable `quota`/`requested`), distinct from a bare `new DOMException(…,
// "QuotaExceededError")`. WPT's assert_throws_quotaexceedederror requires both
// the extra accessors and `e.constructor === self.QuotaExceededError`.
class QuotaExceededError extends DOMException {
  constructor(message = "", options = undefined) {
    super(message, "QuotaExceededError");
    const o = (options == null) ? {} : options;
    this._quota = (o.quota === undefined) ? null : o.quota;
    this._requested = (o.requested === undefined) ? null : o.requested;
  }
  get quota() { return this._quota; }
  get requested() { return this._requested; }
}
globalThis.QuotaExceededError = _markNative(QuotaExceededError);

// Engine internals must not pollute the page's `window`. ALL runtime plumbing —
// including the Rust<->JS eval bridge state — is now declared as top-level
// lexical bindings (let/const). Those live in the global *lexical* environment,
// which is shared across every script run in this realm, so Rust's separately-
// executed eval scripts reach them by BARE name (no `globalThis.` prefix), yet
// they are absent from BOTH Object.keys(window)/for-in AND
// Object.getOwnPropertyNames(window). Legitimate Web API constructors stay on
// `window` (real browsers expose those).
let __obscura_focused = null;
let __obscura_click_target = null;

// Rust<->JS eval bridge scratchpad / object registry. `__obscura_objects` is a
// persistent map of CDP objectId -> live JS value (so callFunctionOn can re-
// reference a handle returned by an earlier evaluate). Rust mutates these by
// bare name from its eval scripts (e.g. `__obscura_objects['oid'] = v`).
let __obscura_objects = {};
let __obscura_await_meta = null;
let __obscura_await_rejected = false;
let __obscura_ua = '';

[Error, TypeError, ReferenceError, SyntaxError, RangeError, URIError, EvalError].forEach(E => {
  try {
    Object.defineProperty(E.prototype, 'name', {
      value: E.name, writable: true, enumerable: false, configurable: false,
    });
  } catch(e) {}
});

const _stackCache = new WeakMap();
const _origStackDesc = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
if (_origStackDesc && _origStackDesc.get) {
  Object.defineProperty(Error.prototype, 'stack', {
    configurable: false, enumerable: false,
    get: function() {
      if (!_stackCache.has(this)) _stackCache.set(this, _origStackDesc.get.call(this));
      return _stackCache.get(this);
    }
  });
}

let _fpSeed = 0;
const _fpRand = function(salt) {
  let h = (_fpSeed ^ (salt || 0)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0xFFFFFFFF;
};
const _fpNoise = function(x, y, channel) {
  return (_fpRand(x * 7919 + y * 6271 + channel * 8923) - 0.5) * 4;
};

let _fpCache = null;
const _getFp = function() {
  if (_fpCache) return _fpCache;
  const gpuPool = [
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 2070 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ];
  const gpuVendorPool = [
    'Google Inc. (NVIDIA)','Google Inc. (NVIDIA)','Google Inc. (NVIDIA)',
    'Google Inc. (Intel)','Google Inc. (Intel)',
    'Google Inc. (AMD)','Google Inc. (AMD)',
    'Google Inc. (NVIDIA)','Google Inc. (NVIDIA)',
    'Google Inc. (Intel)','Google Inc. (AMD)','Google Inc. (NVIDIA)',
  ];
  const idx = Math.floor(_fpRand(42) * gpuPool.length);
  const screenPool = [[1920,1080],[2560,1440],[1366,768],[1536,864],[1440,900],[1680,1050],[1280,720],[3840,2160]];
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let cfp = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg';
  for (let i = 0; i < 40; i++) cfp += chars[Math.floor(_fpRand(500 + i) * 64)];
  cfp += '==';
  _fpCache = {
    gpu: gpuPool[idx], gpuVendor: gpuVendorPool[idx],
    audioBaseLatency: 0.002 + _fpRand(100) * 0.008,
    audioSampleRate: [44100, 48000][Math.floor(_fpRand(101) * 2)],
    compThreshold: -24 + (_fpRand(102) - 0.5) * 4,
    compKnee: 30 + (_fpRand(103) - 0.5) * 4,
    compRatio: 12 + (_fpRand(104) - 0.5) * 4,
    batteryLevel: 0.5 + _fpRand(200) * 0.5,
    batteryCharging: _fpRand(201) > 0.3,
    screen: screenPool[Math.floor(_fpRand(300) * screenPool.length)],
    canvasFingerprint: cfp,
  };
  return _fpCache;
};
const _fp = function(key) { return _getFp()[key]; };
// Module-local internal state — not exposed on window (the code below uses
// these bare bindings; a fresh per-navigation runtime starts them empty).
const _eventRegistry = {};
const _formValues = {};
const _formChecked = {};
const _domParse = (cmd, a1, a2) => { try { return JSON.parse(_dom(cmd, a1, a2)); } catch { return null; } };
// The selector ops return "ERR" for an invalid selector (vs "-1"/"[]" for no
// match) so querySelector/All can throw SyntaxError per spec.
const _qsThrow = (sel) => { throw new DOMException("'" + sel + "' is not a valid selector.", "SyntaxError"); };
const _qsOne = (raw, sel) => { if (raw === 'ERR') _qsThrow(sel); const n = +raw; return n >= 0 ? _wrapEl(n) : null; };
const _qsIds = (raw, sel) => { if (raw === 'ERR') _qsThrow(sel); try { return JSON.parse(raw) || []; } catch (e) { return []; } };
// :target matches the element whose id equals the queried document's URL fragment.
// Prime the Rust matcher with that fragment just before a query — gated on the
// selector mentioning "target" (its only consumer), so the common path stays free.
// Staleness is harmless: only :target reads it and every :target query re-primes.
const _primeTarget = (s, node) => {
  if (s.indexOf('target') < 0) return;
  let frag = '';
  try {
    // Resolve the node's document by walking to its root — an in-iframe element's
    // ownerDocument can resolve to the main document, so don't trust it directly.
    let doc = node;
    while (doc && doc.nodeType !== 9 && doc.parentNode) doc = doc.parentNode;
    const u = (doc && doc.nodeType === 9 && doc.URL) || '';
    const i = u.indexOf('#'); if (i >= 0) frag = decodeURIComponent(u.slice(i + 1));
  } catch (e) {}
  _dom('set_target_id', frag);
};
const _consoleFn = (level, args) => {
  try { Deno.core.ops.op_console_msg(level, args.map(a => {
    if (a === null) return "null";
    if (a === undefined) return "undefined";
    if (a instanceof Error) return a.stack || a.message || String(a);
    if (typeof a === "object") {
      try {
        const s = JSON.stringify(a);
        return s === "{}" && a.message ? a.message : s;
      } catch { return String(a); }
    }
    return String(a);
  }).join(" ")); } catch {}
};

globalThis.console = {
  log: (...a) => _consoleFn("log", a), warn: (...a) => _consoleFn("warn", a),
  error: (...a) => _consoleFn("error", a), info: (...a) => _consoleFn("log", a),
  debug: () => {}, dir: () => {}, trace: () => {}, table: () => {}, group: () => {},
  groupEnd: () => {}, groupCollapsed: () => {}, time: () => {}, timeEnd: () => {},
  timeLog: () => {}, count: () => {}, countReset: () => {}, clear: () => {},
  assert: (c, ...a) => { if (!c) _consoleFn("error", ["Assertion failed:", ...a]); },
};

let _tid = 0;
const _clearedTimers = new Set();
const _intervals = new Set();

const _scheduleAfter = (delay, fn) => {
  const d = Math.max(0, Number(delay) || 0);
  if (d === 0) Promise.resolve().then(fn);
  else Deno.core.ops.op_sleep(d).then(fn);
};

globalThis.setTimeout = (fn, delay = 0, ...args) => {
  if (typeof fn !== "function") return ++_tid;
  const id = ++_tid;
  _scheduleAfter(delay, () => {
    if (_clearedTimers.has(id)) return;
    try { fn(...args); } catch(e) { console.error("Timer error:", e); }
  });
  return id;
};

globalThis.clearTimeout = (id) => { _clearedTimers.add(id); };

globalThis.setInterval = (fn, delay = 0, ...args) => {
  if (typeof fn !== "function") return ++_tid;
  const id = ++_tid;
  _intervals.add(id);
  const tick = () => {
    if (!_intervals.has(id)) return;
    try { fn(...args); } catch(e) { console.error("Interval error:", e); }
    if (!_intervals.has(id)) return;
    _scheduleAfter(delay, tick);
  };
  _scheduleAfter(delay, tick);
  return id;
};

globalThis.clearInterval = (id) => { _intervals.delete(id); _clearedTimers.add(id); };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = globalThis.clearTimeout;
globalThis.queueMicrotask = globalThis.queueMicrotask || ((fn) => Promise.resolve().then(fn));

class MessageChannel {
  constructor() {
    this.port1 = { onmessage: null, postMessage: () => {}, close() {}, addEventListener() {}, removeEventListener() {} };
    this.port2 = { onmessage: null, postMessage: () => {}, close() {}, addEventListener() {}, removeEventListener() {} };
    this.port1.postMessage = (data) => {
      Promise.resolve().then(() => { if (this.port2.onmessage) this.port2.onmessage({ data }); });
    };
    this.port2.postMessage = (data) => {
      Promise.resolve().then(() => { if (this.port1.onmessage) this.port1.onmessage({ data }); });
    };
  }
}
globalThis.MessageChannel = MessageChannel;
globalThis.MessagePort = class MessagePort { constructor(){} postMessage(){} close(){} addEventListener(){} removeEventListener(){} };

class CSSStyleDeclaration {
  constructor() { this._props = {}; }
  setProperty(name, value) { this._props[name] = String(value); }
  removeProperty(name) { const old = this._props[name]; delete this._props[name]; return old || ""; }
  getPropertyValue(name) { return this._props[name] || ""; }
  get cssText() { return Object.entries(this._props).map(([k,v]) => `${k}: ${v}`).join("; "); }
  set cssText(v) { this._props = {}; if(v) v.split(";").forEach(p => { const [k,...rest]=p.split(":"); if(k&&rest.length) this._props[k.trim()]=rest.join(":").trim(); }); }
  get length() { return Object.keys(this._props).length; }
  item(i) { return Object.keys(this._props)[i] || ""; }
}

const _styleProxy = (decl) => new Proxy(decl, {
  get(t, p) {
    if (typeof p === "symbol" || p in t) return t[p];
    if (typeof p === "string") return t._props[p] || "";
    return undefined;
  },
  set(t, p, v) {
    if (typeof p === "string") { t._props[p] = String(v); return true; }
    t[p] = v; return true;
  }
});

class Node {
  static ELEMENT_NODE = 1;
  static ATTRIBUTE_NODE = 2;
  static TEXT_NODE = 3;
  static CDATA_SECTION_NODE = 4;
  static PROCESSING_INSTRUCTION_NODE = 7;
  static COMMENT_NODE = 8;
  static DOCUMENT_NODE = 9;
  static DOCUMENT_TYPE_NODE = 10;
  static DOCUMENT_FRAGMENT_NODE = 11;
  static NOTATION_NODE = 12;
  static DOCUMENT_POSITION_DISCONNECTED = 0x01;
  static DOCUMENT_POSITION_PRECEDING = 0x02;
  static DOCUMENT_POSITION_FOLLOWING = 0x04;
  static DOCUMENT_POSITION_CONTAINS = 0x08;
  static DOCUMENT_POSITION_CONTAINED_BY = 0x10;
  static DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = 0x20;

  constructor(nid) { this._nid = nid; }
  // EventTarget surface — shared by every node kind (Element, Document, Text,
  // CharacterData, DocumentFragment, DocumentType). All route through the unified
  // spec dispatch keyed by the node's _nid.
  addEventListener(type, handler, opts) { _addListener(this, type, handler, opts); }
  removeEventListener(type, handler, opts) { _removeListener(this, type, handler, opts); }
  dispatchEvent(event) { return _dispatchPublic(this, event); }
  get nodeType() { return +_dom("node_type", this._nid); }
  get nodeName() { return _domParse("node_name", this._nid) || ""; }
  // A node's owner is the main document unless it was created by / adopted into
  // another document (e.g. an iframe's contentDocument), which tags `_ownerDoc`.
  get ownerDocument() { return this._ownerDoc || globalThis.document; }
  get textContent() {
    // Per spec, textContent is null for Document(9) and DocumentType(10);
    // for everything else it's the concatenated descendant text data.
    const t = this.nodeType;
    if (t === 9 || t === 10) return null;
    return _domParse("text_content", this._nid) ?? "";
  }
  set textContent(v) {
    const _watching = __mutationObservers?.length;
    const t = this.nodeType;
    if (t === 9 || t === 10) return; // no-op for Document / DocumentType
    if (t === 3 || t === 4 || t === 7 || t === 8) {
      // Character data node: setting textContent replaces its data.
      const _old = _watching ? (_domParse("text_content", this._nid) ?? "") : null;
      _dom("set_text_content", this._nid, String(v ?? ""));
      if (_watching) __notifyMutation('characterData', this._nid, [], [], null, { oldValue: _old });
      return;
    }
    const children = _domParse("child_nodes", this._nid) || [];
    for (const c of children) _dom("remove_child", c);
    let added = [];
    if (v != null && v !== "") {
      const tn = +_dom("create_text_node", String(v));
      _dom("append_child", this._nid, tn);
      added = [tn];
    }
    if (_watching) __notifyMutation('childList', this._nid, added, children);
  }
  get nodeValue() {
    // nodeValue is the data for every CharacterData kind: Text(3), CDATASection(4),
    // ProcessingInstruction(7), Comment(8). For all other nodes it is null.
    const t = this.nodeType;
    if (t === 3 || t === 4 || t === 7 || t === 8) return _domParse("text_content", this._nid) ?? "";
    return null;
  }
  set nodeValue(v) {
    const t = this.nodeType;
    if (t === 3 || t === 4 || t === 7 || t === 8) {
      const _old = __mutationObservers?.length ? (_domParse("text_content", this._nid) ?? "") : null;
      _dom("set_text_content", this._nid, String(v ?? ""));
      if (__mutationObservers?.length) __notifyMutation('characterData', this._nid, [], [], null, { oldValue: _old });
    }
  }
  get parentNode() { return _wrap(+_dom("parent_node", this._nid)); }
  get parentElement() { const p = this.parentNode; return p && p.nodeType === 1 ? p : null; }
  get childNodes() {
    const ids = _domParse("child_nodes", this._nid) || [];
    const list = ids.map(_wrap).filter(Boolean);
    list.item = (i) => list[i] || null;
    return list;
  }
  get firstChild() { return _wrap(+_dom("first_child", this._nid)); }
  get lastChild() { return _wrap(+_dom("last_child", this._nid)); }
  get nextSibling() { return _wrap(+_dom("next_sibling", this._nid)); }
  get previousSibling() { return _wrap(+_dom("prev_sibling", this._nid)); }
  appendChild(c) {
    // WebIDL: the argument must be a Node — null/undefined/plain objects throw
    // TypeError. A Node has either a tree id (_nid) or a numeric nodeType
    // (synthetic Document wrappers like an iframe's contentDocument).
    if (c == null || typeof c !== 'object' || (typeof c._nid !== 'number' && typeof c.nodeType !== 'number'))
      throw new TypeError("Failed to execute 'appendChild': parameter 1 is not of type 'Node'");
    // DOM "ensure pre-insertion validity": the parent must be a Document,
    // DocumentFragment, or Element — not a Text/Comment/etc.
    if (this.nodeType !== 1 && this.nodeType !== 9 && this.nodeType !== 11)
      throw new DOMException("Cannot append a child to this node type", "HierarchyRequestError");
    // The node must not be an inclusive ancestor of the parent.
    if (c._nid === this._nid || (typeof c.contains === 'function' && c.contains(this)))
      throw new DOMException("The new child is an ancestor of the parent", "HierarchyRequestError");
    // A Document is not a valid child of any node.
    if (c.nodeType === 9)
      throw new DOMException("A Document cannot be inserted into the tree", "HierarchyRequestError");
    // A DocumentFragment is inserted by moving each of its children, leaving it empty.
    if (c.nodeType === 11) {
      const kids = Array.prototype.slice.call(c.childNodes);
      for (let i = 0; i < kids.length; i++) this.appendChild(kids[i]);
      return c;
    }
    const _prev = __mutationObservers?.length ? +_dom("last_child", this._nid) : -1;
    _dom("append_child", this._nid, c._nid);
    // Adopt the node into this parent's node document (updates ownerDocument).
    c._ownerDoc = this.nodeType === 9 ? this : (this.ownerDocument || globalThis.document);
    if (__mutationObservers?.length) __notifyMutation('childList', this._nid, [c._nid], [], null, { previousSibling: _prev >= 0 ? _prev : null });
    if (c instanceof Element && c.tagName === 'SCRIPT') {
      const scriptType = c.getAttribute('type') || '';
      if (scriptType && scriptType !== 'text/javascript' && scriptType !== 'application/javascript') {
        return c;
      }
      const src = c.getAttribute('src');
      if (src) {
        // Fetch + execute the external script, record a Resource Timing entry
        // (initiatorType "script"), and fire its load/error event.
        _loadElementResource(c, src, 'script', { eval: true });
      } else {
        const code = c.textContent;
        if (code) { try { (0, eval)(code); } catch(e) { console.error('Dynamic inline script error:', e.message); } }
      }
    }
    if (c instanceof Element && c.localName === 'iframe') _connectIframe(c);
    if (c instanceof Element) _connectResourceElement(c);
    if (c instanceof Element && c.id) __defineNamedGlobal(c.id);
    return c;
  }
  removeChild(c) {
    if (!c) return c;
    __obscura_runNodeIteratorPreRemove(c);
    let _prev = -1, _next = -1;
    if (__mutationObservers?.length) {
      _prev = +_dom("prev_sibling", c._nid);
      _next = +_dom("next_sibling", c._nid);
    }
    _dom("remove_child", c._nid);
    if (__mutationObservers?.length) __notifyMutation('childList', this._nid, [], [c._nid], null, { previousSibling: _prev >= 0 ? _prev : null, nextSibling: _next >= 0 ? _next : null });
    return c;
  }
  // DOM "replace" (§4.2.3): replace `child` with `node`, returning `child`.
  replaceChild(node, child) {
    const _isNode = (x) => x != null && typeof x === 'object' && (typeof x._nid === 'number' || typeof x.nodeType === 'number');
    if (!_isNode(node)) throw new TypeError("Failed to execute 'replaceChild': parameter 1 is not of type 'Node'");
    if (!_isNode(child)) throw new TypeError("Failed to execute 'replaceChild': parameter 2 is not of type 'Node'");
    const pt = this.nodeType;
    // 1. Parent must be a Document, DocumentFragment, or Element.
    if (pt !== 1 && pt !== 9 && pt !== 11)
      throw new DOMException("Cannot replace a child in this node type", "HierarchyRequestError");
    // 2. node must not be an inclusive ancestor of parent.
    if (node._nid === this._nid || (typeof node.contains === 'function' && node.contains(this)))
      throw new DOMException("The new child is an ancestor of the parent", "HierarchyRequestError");
    // 3. child must be a child of parent.
    const cp = child.parentNode;
    if (!cp || cp._nid !== this._nid)
      throw new DOMException("The node to be replaced is not a child of this node", "NotFoundError");
    // 4. node must be a DocumentFragment, DocumentType, Element, or CharacterData.
    const nt = node.nodeType;
    if (nt !== 1 && nt !== 3 && nt !== 4 && nt !== 7 && nt !== 8 && nt !== 10 && nt !== 11)
      throw new DOMException("The new child is not a valid node", "HierarchyRequestError");
    // 5. Text in a Document, or a doctype outside a Document, is invalid.
    if ((nt === 3 && pt === 9) || (nt === 10 && pt !== 9))
      throw new DOMException("Invalid child for this parent", "HierarchyRequestError");
    // 6. Document-parent constraints (evaluated excluding `child`).
    if (pt === 9) {
      const kids = Array.prototype.slice.call(this.childNodes);
      const idx = (n) => kids.findIndex(k => k._nid === n._nid);
      const childIdx = idx(child);
      const elemChildren = kids.filter(k => k.nodeType === 1);
      const doctypeChild = kids.find(k => k.nodeType === 10) || null;
      const doctypeIdx = doctypeChild ? idx(doctypeChild) : -1;
      const otherElement = elemChildren.some(e => e._nid !== child._nid);
      const doctypeFollows = doctypeChild && childIdx < doctypeIdx;
      const HRE = (m) => { throw new DOMException(m, "HierarchyRequestError"); };
      if (nt === 11) {
        const fk = Array.prototype.slice.call(node.childNodes);
        const fe = fk.filter(k => k.nodeType === 1).length;
        if (fe > 1 || fk.some(k => k.nodeType === 3 || k.nodeType === 4)) HRE("Invalid fragment for a document");
        if (fe === 1 && (otherElement || doctypeFollows)) HRE("Document may have only one element child");
      } else if (nt === 1) {
        if (otherElement || doctypeFollows) HRE("Document may have only one element child");
      } else if (nt === 10) {
        if ((doctypeChild && doctypeChild._nid !== child._nid) ||
            elemChildren.some(e => idx(e) < childIdx)) HRE("Misplaced doctype");
      }
    }
    // 7. referenceChild = child's next sibling, unless that is node (then node's next sibling).
    let ref = child.nextSibling;
    if (ref && ref._nid === node._nid) ref = node.nextSibling;
    // Replace: remove child, then insert node (a fragment inserts its children).
    this.removeChild(child);
    // Removing child may already leave node correctly positioned (the
    // replace-with-adjacent-sibling case); only (re)insert when it isn't.
    const inParent = node.parentNode && node.parentNode._nid === this._nid;
    const alreadyPlaced = inParent &&
      (ref ? (node.nextSibling && node.nextSibling._nid === ref._nid) : node.nextSibling == null);
    if (!alreadyPlaced) {
      if (ref && ref.parentNode && ref.parentNode._nid === this._nid) this.insertBefore(node, ref);
      else this.appendChild(node);
    }
    return child;
  }
  insertBefore(n, ref) {
    // WebIDL: the node must be a Node (the reference child may be null).
    if (n == null || typeof n !== 'object' || (typeof n._nid !== 'number' && typeof n.nodeType !== 'number'))
      throw new TypeError("Failed to execute 'insertBefore': parameter 1 is not of type 'Node'");
    if (!ref) { this.appendChild(n); return n; }
    // Same pre-insertion validity as appendChild.
    if (this.nodeType !== 1 && this.nodeType !== 9 && this.nodeType !== 11)
      throw new DOMException("Cannot insert a child into this node type", "HierarchyRequestError");
    if (n._nid === this._nid || (typeof n.contains === 'function' && n.contains(this)))
      throw new DOMException("The new child is an ancestor of the parent", "HierarchyRequestError");
    // The reference child must actually be a child of this node.
    const _refParent = ref.parentNode;
    if (!_refParent || _refParent._nid !== this._nid)
      throw new DOMException("The reference child is not a child of this node", "NotFoundError");
    // A DocumentFragment inserts each of its children before the reference, then empties.
    if (n.nodeType === 11) {
      const kids = Array.prototype.slice.call(n.childNodes);
      for (let i = 0; i < kids.length; i++) this.insertBefore(kids[i], ref);
      return n;
    }
    _dom("insert_before", n._nid, ref._nid);
    n._ownerDoc = this.nodeType === 9 ? this : (this.ownerDocument || globalThis.document);
    if (__mutationObservers?.length) {
      const _prev = +_dom("prev_sibling", n._nid);
      __notifyMutation('childList', this._nid, [n._nid], [], null, { previousSibling: _prev >= 0 ? _prev : null, nextSibling: ref._nid });
    }
    if (n instanceof Element && n.localName === 'iframe') _connectIframe(n);
    if (n instanceof Element) _connectResourceElement(n);
    return n;
  }
  contains(o) { return o ? _dom("contains", this._nid, o._nid) === "true" : false; }
  hasChildNodes() { return _dom("has_child_nodes", this._nid) === "true"; }
  // _targetDoc (internal): the document the clone is created in. Defaults to the
  // source's ownerDocument; importNode passes the importing document so the
  // clone's ownerDocument — and thus tagName casing — reflects the new document.
  cloneNode(deep, _targetDoc) {
    const t = this.nodeType;
    if (t === 1) {
      const doc = _targetDoc || this.ownerDocument || document;
      const ns = this.namespaceURI;
      // Foreign/null-namespace elements, and HTML elements created via
      // createElementNS (which may be case-preserved), are recreated with their
      // real namespace/prefix/case; plain HTML elements take the fast path.
      let el;
      if (ns !== _HTML_NS || this._localName !== undefined) {
        const px = this.prefix;
        el = doc.createElementNS(ns, px ? px + ":" + this.localName : this.localName);
      } else {
        el = doc.createElement(this.nodeName.toLowerCase());
        el._ownerDoc = doc;
      }
      // Copy attributes directly (O(attrs)) rather than serializing+reparsing
      // outerHTML per element — the latter made a deep clone O(N²) and stalled
      // the Range cloneContents/extractContents harness.
      const attrs = this.attributes;
      if (attrs) for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i];
        // Preserve the namespace/prefix of namespaced attributes on the clone.
        if (a.namespaceURI != null) el._rawSetNS(a.namespaceURI, a.prefix, a.localName, a.value);
        else el.setAttribute(a.name, a.value);
      }
      if (deep) {
        // Recurse over real children rather than parsing outerHTML into a <div>:
        // a <div>'s fragment parser DROPS <html>/<head>/<body> wrappers (they are
        // not valid in a div context) and hoists their contents, so cloning a
        // document's documentElement used to collapse to its first descendant.
        const kids = this.childNodes;
        for (let i = 0; i < kids.length; i++) {
          const c = (kids[i] && kids[i].cloneNode) ? kids[i].cloneNode(true, _targetDoc) : null;
          if (c) el.appendChild(c);
        }
      }
      return el;
    }
    if (t === 3) return (_targetDoc || document).createTextNode(this.textContent);
    if (t === 8) return (_targetDoc || document).createComment(this.nodeValue || "");
    return null;
  }
  compareDocumentPosition(other) {
    if (this === other) return 0;
    // Disconnected (different roots): DISCONNECTED | IMPLEMENTATION_SPECIFIC plus a
    // consistent PRECEDING/FOLLOWING tiebreak (stable per node pair).
    if (__obscura_furthestAncestor(this) !== __obscura_furthestAncestor(other)) {
      return 1 | 32 | (this._nid < other._nid ? 4 : 2);
    }
    // other is an ancestor of this -> other CONTAINS this and PRECEDES it.
    if (__obscura_isInclusiveAncestor(other, this)) return 8 | 2;
    // other is a descendant of this -> other is CONTAINED_BY this and FOLLOWS it.
    if (__obscura_isInclusiveAncestor(this, other)) return 16 | 4;
    // Siblings/cousins: if this follows other in tree order, other PRECEDES this.
    return __obscura_isFollowing(this, other) ? 2 : 4;
  }
  getRootNode() { return globalThis.document; }
  // DOM: baseURI returns the node document's document base URL, serialized. A
  // document node is its own node document.
  get baseURI() {
    const doc = this.nodeType === 9 ? this : (this.ownerDocument || globalThis.document);
    return _documentBaseURL(doc);
  }
  // DOM §4.5 normalize(): for each descendant exclusive Text node, drop it if
  // empty, else absorb its following contiguous exclusive Text siblings and
  // remove them. CDATASection (nodeType 4) is NOT an exclusive Text node, so the
  // nodeType === 3 test skips it correctly. (We don't model live Range endpoint
  // adjustment here; the WPT normalize test doesn't exercise it.)
  normalize() {
    const texts = [];
    const collect = (n) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) texts.push(c);
        else collect(c);
      }
    };
    collect(this);
    for (const node of texts) {
      const parent = node.parentNode;
      if (!parent) continue; // already removed as part of an earlier run
      if (node.data.length === 0) { parent.removeChild(node); continue; }
      let merged = "";
      const toRemove = [];
      for (let sib = node.nextSibling; sib && sib.nodeType === 3; sib = sib.nextSibling) {
        merged += sib.data;
        toRemove.push(sib);
      }
      if (merged) node.data = node.data + merged;
      for (const r of toRemove) r.parentNode.removeChild(r);
    }
  }
  // DOM §4.5 isEqualNode(): "A and B are equal" — same interface, the
  // type-specific data below equal, then recursively equal children in order.
  // Note the spec compares Elements on namespace/prefix/localName (NOT nodeName)
  // and compares attributes by namespace+localName+value, ignoring prefix.
  isEqualNode(other) {
    if (!other) return false;
    if (this._nid === other._nid) return true;
    if (this.nodeType !== other.nodeType) return false;
    switch (this.nodeType) {
      case 10: // DocumentType
        if (this.name !== other.name || this.publicId !== other.publicId
            || this.systemId !== other.systemId) return false;
        break;
      case 1: { // Element
        if ((this.namespaceURI ?? null) !== (other.namespaceURI ?? null)) return false;
        if ((this.prefix ?? null) !== (other.prefix ?? null)) return false;
        if (this.localName !== other.localName) return false;
        const a = this.attributes, b = other.attributes;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          const at = a[i];
          let found = false;
          for (let j = 0; j < b.length; j++) {
            const bt = b[j];
            if ((at.namespaceURI ?? null) === (bt.namespaceURI ?? null)
                && at.localName === bt.localName && at.value === bt.value) { found = true; break; }
          }
          if (!found) return false;
        }
        break;
      }
      case 7: // ProcessingInstruction — target + data
        if (this.target !== other.target || this.data !== other.data) return false;
        break;
      case 2: // Attr — namespace + localName + value (prefix ignored)
        if ((this.namespaceURI ?? null) !== (other.namespaceURI ?? null)
            || this.localName !== other.localName || this.value !== other.value) return false;
        break;
      case 3: case 4: case 8: // Text / CDATASection / Comment — data
        if (this.data !== other.data) return false;
        break;
    }
    const cA = this.childNodes || [];
    const cB = other.childNodes || [];
    if (cA.length !== cB.length) return false;
    for (let i = 0; i < cA.length; i++) {
      if (!cA[i].isEqualNode(cB[i])) return false;
    }
    return true;
  }
  isSameNode(other) { return other && this._nid === other._nid; }
  // DOM namespace resolution (§4.4). An empty-string prefix means the default
  // namespace (null prefix). See _locateNamespace / _locatePrefix below.
  lookupNamespaceURI(prefix) {
    return _locateNamespace(this, (prefix == null || prefix === '') ? null : String(prefix));
  }
  lookupPrefix(namespace) {
    if (namespace == null || namespace === '') return null;
    return _locatePrefix(this, String(namespace));
  }
  isDefaultNamespace(namespace) {
    const ns = (namespace == null || namespace === '') ? null : String(namespace);
    return _locateNamespace(this, null) === ns;
  }
}
// "Locate a namespace" (DOM §4.4): resolve `prefix` (null = default) to a
// namespace URI by walking up the element chain. The element's own namespace (when
// its prefix matches) wins over its xmlns attributes; "xml"/"xmlns" are built-in.
const _locateNamespace = function(node, prefix) {
  if (!node) return null;
  const t = node.nodeType;
  if (t === 1) { // Element
    if (prefix === 'xml') return _XML_NS;
    if (prefix === 'xmlns') return _XMLNS_NS;
    if (node.namespaceURI != null && node.prefix === prefix) return node.namespaceURI;
    const attrs = node.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (a.namespaceURI === _XMLNS_NS && a.prefix === 'xmlns' && a.localName === prefix) return a.value || null;
      if (a.namespaceURI === _XMLNS_NS && a.prefix === null && a.localName === 'xmlns' && prefix === null) return a.value || null;
    }
    const p = node.parentNode;
    return (p && p.nodeType === 1) ? _locateNamespace(p, prefix) : null;
  }
  if (t === 9) { const de = node.documentElement; return de ? _locateNamespace(de, prefix) : null; }
  if (t === 2) { return node.ownerElement ? _locateNamespace(node.ownerElement, prefix) : null; }
  if (t === 10 || t === 11) return null; // DocumentType, DocumentFragment
  const p = node.parentNode; // Text/Comment/PI: use the parent element
  return (p && p.nodeType === 1) ? _locateNamespace(p, prefix) : null;
};
// "Locate a prefix" (DOM §4.4): find a prefix bound to `namespace`.
const _locatePrefix = function(node, namespace) {
  if (!node) return null;
  const t = node.nodeType;
  if (t === 1) {
    if (node.namespaceURI === namespace && node.prefix != null) return node.prefix;
    const attrs = node.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (a.prefix === 'xmlns' && a.value === namespace) return a.localName;
    }
    const p = node.parentNode;
    return (p && p.nodeType === 1) ? _locatePrefix(p, namespace) : null;
  }
  if (t === 9) { const de = node.documentElement; return de ? _locatePrefix(de, namespace) : null; }
  if (t === 2) { return node.ownerElement ? _locatePrefix(node.ownerElement, namespace) : null; }
  if (t === 10 || t === 11) return null;
  const p = node.parentNode;
  return (p && p.nodeType === 1) ? _locatePrefix(p, namespace) : null;
};
// HTML "document base URL": the frozen base URL of the first <base> element with
// an href attribute (resolved against the document's URL), or — absent any such
// element — the document's own URL (the fallback base URL). Backs Node/Attr
// .baseURI. We don't model preceding-base chaining; resolving each href against
// the document URL matches browsers for every realistic single/zero <base> case.
const _documentBaseURL = function(doc) {
  const fallback = (doc && typeof doc.URL === 'string' && doc.URL)
    ? doc.URL : (globalThis.document.URL || "about:blank");
  try {
    const bases = doc.getElementsByTagName('base');
    for (let i = 0; i < bases.length; i++) {
      const href = bases[i].getAttribute('href');
      if (href != null) {
        try { return new URL(href, fallback).href; } catch (e) { return fallback; }
      }
    }
  } catch (e) {}
  return fallback;
};

class CharacterData extends Node {
  get data() {
    return _domParse("text_content", this._nid) ?? "";
  }
  set data(v) {
    const _old = __mutationObservers?.length ? (_domParse("text_content", this._nid) ?? "") : null;
    _dom("set_text_content", this._nid, String(v ?? ""));
    if (__mutationObservers?.length) __notifyMutation('characterData', this._nid, [], [], null, { oldValue: _old });
  }
  get length() { return this.data.length; }
  substringData(offset, count) {
    return this.data.substring(offset, offset + count);
  }
  appendData(s) { this.data += s; }
  insertData(offset, s) {
    const d = this.data;
    this.data = d.slice(0, offset) + s + d.slice(offset);
  }
  deleteData(offset, count) {
    const d = this.data;
    this.data = d.slice(0, offset) + d.slice(offset + count);
  }
  replaceData(offset, count, s) {
    const d = this.data;
    this.data = d.slice(0, offset) + s + d.slice(offset + count);
  }
}

class Text extends CharacterData {
  get nodeName() { return "#text"; }
  get nodeType() { return 3; }
  get wholeText() { return this.data; }
  splitText(offset) {
    const d = this.data;
    const tail = d.substring(offset);
    this.data = d.substring(0, offset);
    const newNid = +_dom("create_text_node", tail);
    const parent = this.parentNode;
    if (parent) {
      const ref = this.nextSibling;
      parent.insertBefore(_wrap(newNid), ref);
    }
    return _wrap(newNid);
  }
  cloneNode() { return document.createTextNode(this.data); }
}

class Comment extends CharacterData {
  get nodeName() { return "#comment"; }
  get nodeType() { return 8; }
  cloneNode() { return document.createComment(this.data); }
}

// CDATASection is a Text subtype (valid only inside XML documents). We back it
// with a real text node so tree ops (appendChild, ranges, traversal) work; the
// wrapper just reports nodeType 4 / "#cdata-section".
class CDATASection extends Text {
  get nodeName() { return "#cdata-section"; }
  get nodeType() { return 4; }
  cloneNode() { return _makeCDATA(this.data); }
}

// ProcessingInstruction is CharacterData with a target. Backed by a real comment
// node for tree storage; reports nodeType 7 and nodeName === target.
class ProcessingInstruction extends CharacterData {
  constructor(nid, target) { super(nid); this._target = String(target); }
  get nodeName() { return this._target; }
  get nodeType() { return 7; }
  get target() { return this._target; }
  cloneNode() { return _makePI(this._target, this.data); }
}

const _makeCDATA = function(data) {
  const nid = +_dom("create_text_node", String(data ?? ""));
  const n = new CDATASection(nid);
  _cache.set(nid, n);
  return n;
};
const _makePI = function(target, data) {
  const nid = +_dom("create_comment_node", String(data ?? ""));
  const n = new ProcessingInstruction(nid, target);
  _cache.set(nid, n);
  return n;
};
// Document.createProcessingInstruction works in any document but validates its
// target (XML Name) and data (must not contain "?>") per the DOM spec.
const _createPIValidated = function(target, data) {
  target = String(target); data = String(data ?? "");
  if (!_XML_NAME.test(target))
    throw new DOMException("The string '" + target + "' is not a valid name.", "InvalidCharacterError");
  if (data.indexOf("?>") !== -1)
    throw new DOMException("The data provided ('" + data + "') contains '?>'.", "InvalidCharacterError");
  return _makePI(target, data);
};

// An attribute qualifiedName must match the XML Name production, else
// InvalidCharacterError (DOM spec). Covers ASCII + common Unicode name chars.
const _XML_NAME = /^[A-Za-z_:À-ÖØ-öø-˿Ͱ-￿][A-Za-z0-9_:.\-·À-ÖØ-öø-ͽͿ-￿]*$/;
// --- DOM attribute / Attr model --------------------------------------------
const _HTML_NS  = "http://www.w3.org/1999/xhtml";
const _XML_NS   = "http://www.w3.org/XML/1998/namespace";
const _XMLNS_NS = "http://www.w3.org/2000/xmlns/";

// setAttribute / toggleAttribute validate the qualified name against the Name
// production. We reject the empty string and names containing ASCII whitespace
// or a NUL (the cases real content actually hits); the DOM/WPT name productions
// treat the rest — ":", "0", "~", "'", etc. — as valid attribute names.
const _validateAttrName = function(n) {
  if (n === '' || /[\0 \t\r\n\f]/.test(n))
    throw new DOMException("'" + n + "' is not a valid attribute name.", "InvalidCharacterError");
};
// DOM "validate and extract" of a (namespace, qualifiedName), as browsers
// actually implement it (matching the WPT createElementNS / attributes tables):
// split on the FIRST colon; the local part must be a valid element name (first
// char a name-start char; no ASCII whitespace or ">"), and a colon requires a
// non-empty prefix. Used by createElementNS, setAttributeNS, createAttributeNS.
// Returns {namespace, prefix, local} or throws InvalidCharacterError/NamespaceError.
const _validateAndExtract = function(namespace, qname) {
  const ns = (namespace === '' || namespace === undefined || namespace === null) ? null : String(namespace);
  qname = (qname === undefined) ? 'undefined' : String(qname);
  let prefix = null, local = qname;
  const ci = qname.indexOf(':');
  if (ci !== -1) { prefix = qname.slice(0, ci); local = qname.slice(ci + 1); }
  if (local === '' || prefix === '' || !_isValidElementName(local))
    throw new DOMException("'" + qname + "' is not a valid qualified name.", "InvalidCharacterError");
  if (prefix !== null && ns === null)
    throw new DOMException("A namespace is required to use a prefix.", "NamespaceError");
  if (prefix === 'xml' && ns !== _XML_NS)
    throw new DOMException("The 'xml' prefix may only be used with the XML namespace.", "NamespaceError");
  if ((qname === 'xmlns' || prefix === 'xmlns') && ns !== _XMLNS_NS)
    throw new DOMException("The 'xmlns' qualified name/prefix requires the XMLNS namespace.", "NamespaceError");
  if (ns === _XMLNS_NS && qname !== 'xmlns' && prefix !== 'xmlns')
    throw new DOMException("The XMLNS namespace requires the 'xmlns' qualified name or prefix.", "NamespaceError");
  return { namespace: ns, prefix, local };
};

// A real Attr node (nodeType 2). When attached to an element its value reads/
// writes through the element's namespace-aware DOM ops (so it stays live);
// while detached (createAttribute, or after removal) it holds its own value.
globalThis.Attr = class Attr {
  constructor(ns, prefix, local, value) {
    this._ownerEl = null;
    this._ns = ns == null ? null : String(ns);
    this._prefix = prefix == null ? null : String(prefix);
    this._local = String(local);
    this._detachedValue = value == null ? "" : String(value);
  }
  get [Symbol.toStringTag]() { return 'Attr'; }
  get nodeType() { return 2; }
  get ownerElement() { return this._ownerEl; }
  get namespaceURI() { return this._ns; }
  get prefix() { return this._prefix; }
  get localName() { return this._local; }
  get name() { return this._prefix ? this._prefix + ":" + this._local : this._local; }
  get nodeName() { return this.name; }
  get specified() { return true; }
  get value() {
    if (this._ownerEl) { const v = this._ownerEl._rawGetNS(this._ns, this._local); return v == null ? "" : v; }
    return this._detachedValue;
  }
  set value(v) {
    v = (v == null) ? "" : String(v);
    if (this._ownerEl) this._ownerEl._rawSetNS(this._ns, this._prefix, this._local, v);
    else this._detachedValue = v;
  }
  get nodeValue() { return this.value; }
  set nodeValue(v) { this.value = v; }
  get textContent() { return this.value; }
  set textContent(v) { this.value = v; }
  get ownerDocument() { return this._ownerEl ? this._ownerEl.ownerDocument : (this.__ownerDoc || globalThis.document); }
  get baseURI() { return _documentBaseURL(this.ownerDocument); }
  get childNodes() { return []; }
  get firstChild() { return null; }
  get parentNode() { return null; }
  cloneNode() { return new Attr(this._ns, this._prefix, this._local, this.value); }
  // Attr is not a Node subclass here, so mirror the namespace-resolution API
  // (it resolves through the owner element — see _locateNamespace, nodeType 2).
  lookupNamespaceURI(prefix) { return _locateNamespace(this, (prefix == null || prefix === '') ? null : String(prefix)); }
  lookupPrefix(namespace) { return (namespace == null || namespace === '') ? null : _locatePrefix(this, String(namespace)); }
  isDefaultNamespace(namespace) { return _locateNamespace(this, null) === ((namespace == null || namespace === '') ? null : String(namespace)); }
};
// Detach an Attr from its element, snapshotting the live value first.
const _detachAttr = function(a) { if (a._ownerEl) { a._detachedValue = a.value; a._ownerEl = null; } };

// A real NamedNodeMap (el.attributes). All state lives off-instance (in a
// WeakMap) so the ONLY own properties are the numeric indices (enumerable) and
// the qualified-name keys (non-enumerable) — `length`/`item`/`getNamedItem` are
// prototype members, matching real browsers' getOwnPropertyNames output.
const _nnmData = new WeakMap();
globalThis.NamedNodeMap = class NamedNodeMap {
  get [Symbol.toStringTag]() { return 'NamedNodeMap'; }
  get length() { return _nnmData.get(this).items.length; }
  item(i) { const items = _nnmData.get(this).items; i = i >>> 0; return i < items.length ? items[i] : null; }
  getNamedItem(qname) {
    const d = _nnmData.get(this);
    qname = String(qname);
    if (d.ownerEl && d.ownerEl._htmlAttr) qname = _asciiLower(qname);
    for (const a of d.items) if (a.name === qname) return a;
    return null;
  }
  getNamedItemNS(ns, local) {
    ns = (ns === '' || ns == null) ? null : String(ns); local = String(local);
    for (const a of _nnmData.get(this).items) if (a._ns === ns && a._local === local) return a;
    return null;
  }
  setNamedItem(attr) { return _nnmData.get(this).ownerEl.setAttributeNode(attr); }
  setNamedItemNS(attr) { return _nnmData.get(this).ownerEl.setAttributeNodeNS(attr); }
  removeNamedItem(qname) {
    const a = this.getNamedItem(qname);
    if (!a) throw new DOMException("No attribute named '" + qname + "'.", "NotFoundError");
    return _nnmData.get(this).ownerEl.removeAttributeNode(a);
  }
  removeNamedItemNS(ns, local) {
    const a = this.getNamedItemNS(ns, local);
    if (!a) throw new DOMException("No such attribute.", "NotFoundError");
    return _nnmData.get(this).ownerEl.removeAttributeNode(a);
  }
};
// Snapshot an element's attributes into a fresh NamedNodeMap. The Attr objects
// come from the element's identity cache (so el.attributes[i] === getAttributeNode).
const _buildNamedNodeMap = function(el) {
  const items = el._syncAttrNodes();
  const map = new NamedNodeMap();
  _nnmData.set(map, { ownerEl: el, items });
  for (let i = 0; i < items.length; i++)
    Object.defineProperty(map, i, { value: items[i], enumerable: true, configurable: true });
  // Qualified-name own props are non-enumerable and come after the indices. For
  // an HTML element in an HTML document only all-lowercase qnames get one.
  const htmlLower = el._htmlAttr, seen = new Set();
  for (const a of items) {
    const qn = a.name;
    if (seen.has(qn)) continue;
    seen.add(qn);
    if (htmlLower && qn !== _asciiLower(qn)) continue;
    Object.defineProperty(map, qn, { value: a, enumerable: false, configurable: true });
  }
  return map;
};

// --- HTMLCollection (live) --------------------------------------------------
// A real (static) NodeList — the type querySelectorAll returns. It extends Array
// so results keep working with indexing, length, iteration, spread and array
// methods (lots of internal callers rely on that) while `x instanceof NodeList`
// now holds. Derived operations (map/filter/slice) yield plain Arrays via
// Symbol.species, matching the spec's non-Array NodeList.
globalThis.NodeList = class NodeList extends Array {
  static get [Symbol.species]() { return Array; }
  item(i) { i = i >>> 0; return i < this.length ? this[i] : null; }
};
// Build a NodeList from an array of nodes (Array's variadic/number-arg constructor
// is unsafe for this, so assign indices explicitly).
const _makeNodeList = (nodes) => {
  const nl = new globalThis.NodeList();
  for (let i = 0; i < nodes.length; i++) nl[i] = nodes[i];
  return nl;
};

// A live HTMLCollection. Contents come from a refresh() thunk re-evaluated on
// every access (so the collection stays live); the page sees a Proxy giving the
// WebIDL semantics: live indexed access, supported-property-name (named) access,
// expandos, index-set protection, and spec own-property behaviour.
globalThis.HTMLCollection = class HTMLCollection {
  get [Symbol.toStringTag]() { return 'HTMLCollection'; }
};
const _hcRefresh = new WeakMap(); // proxy -> refresh thunk (returns Element[])
const _hcItems = (c) => _hcRefresh.get(c)();
// An HTMLCollection's supported property names are, in a single tree-order pass:
// the non-empty `id` of any element, then the non-empty `name` of any element in
// the HTML namespace. (The restricted a/applet/img/… tag list is Document's rule,
// not HTMLCollection's.) namedItem returns the first element matching by id or name.
const _hcNamedItem = function(items, key) {
  if (key === '') return null;
  for (const el of items) {
    if (el.id === key) return el;
    if (el.namespaceURI === _HTML_NS && el.getAttribute('name') === key) return el;
  }
  return null;
};
const _hcSupportedNames = function(items) {
  const names = [], seen = new Set();
  for (const el of items) {
    const id = el.id;
    if (id && !seen.has(id)) { seen.add(id); names.push(id); }
    if (el.namespaceURI === _HTML_NS) {
      const nm = el.getAttribute('name');
      if (nm && !seen.has(nm)) { seen.add(nm); names.push(nm); }
    }
  }
  return names;
};
HTMLCollection.prototype.item = function(i) {
  const items = _hcItems(this); i = i >>> 0; return i < items.length ? items[i] : null;
};
HTMLCollection.prototype.namedItem = function(key) { return _hcNamedItem(_hcItems(this), String(key)); };
HTMLCollection.prototype[Symbol.iterator] = function* () { for (const el of _hcItems(this)) yield el; };
Object.defineProperty(HTMLCollection.prototype, 'length', {
  configurable: true, enumerable: false, get() { return _hcItems(this).length; },
});
const _hcIsIndex = (p) => typeof p === 'string' && /^(0|[1-9][0-9]*)$/.test(p);
const _makeHTMLCollection = function(refresh) {
  const target = Object.create(HTMLCollection.prototype);
  const supportedNames = () => _hcSupportedNames(refresh());
  const namedGet = (key) => _hcNamedItem(refresh(), key) ?? undefined;
  const proxy = new Proxy(target, {
    get(t, p, r) {
      if (_hcIsIndex(p)) { const items = refresh(), i = +p; return i < items.length ? items[i] : undefined; }
      // Named (supported-property-name) access only when not an expando or proto member.
      if (typeof p === 'string' && !Reflect.has(t, p)) { const el = namedGet(p); if (el !== undefined) return el; }
      return Reflect.get(t, p, r);
    },
    set(t, p, v) {
      if (_hcIsIndex(p)) return false;       // indexed properties are read-only
      return Reflect.set(t, p, v);           // expandos (receiver = target, no recursion)
    },
    has(t, p) {
      if (_hcIsIndex(p)) return +p < refresh().length;
      if (Reflect.has(t, p)) return true;
      return typeof p === 'string' && namedGet(p) !== undefined;
    },
    ownKeys(t) {
      const keys = [], n = refresh().length;
      for (let i = 0; i < n; i++) keys.push(String(i));
      for (const nm of supportedNames()) if (!keys.includes(nm)) keys.push(nm);
      for (const k of Reflect.ownKeys(t)) if (!keys.includes(k)) keys.push(k); // expandos
      return keys;
    },
    getOwnPropertyDescriptor(t, p) {
      if (_hcIsIndex(p)) {
        const items = refresh(), i = +p;
        if (i < items.length) return { value: items[i], writable: false, enumerable: true, configurable: true };
        return undefined;
      }
      if (typeof p === 'string' && !Reflect.getOwnPropertyDescriptor(t, p)) {
        const el = namedGet(p);
        if (el !== undefined) return { value: el, writable: false, enumerable: false, configurable: true };
      }
      return Reflect.getOwnPropertyDescriptor(t, p);
    },
  });
  _hcRefresh.set(proxy, refresh);
  return proxy;
};
// Shared getElementsBy* builders (live HTMLCollections over a root node id).
const _gebTagName = (nid, qname, htmlDoc) =>
  _makeHTMLCollection(() => (_domParse("get_elements_by_tag_name", nid, String(qname) + "\0" + (htmlDoc ? "1" : "0")) || []).map(_wrapEl).filter(Boolean));
const _gebTagNameNS = (nid, ns, local) => {
  const nsArg = ns === "*" ? "*" : (ns == null || ns === "" ? "" : String(ns));
  return _makeHTMLCollection(() => (_domParse("get_elements_by_tag_name_ns", nid, nsArg + "\0" + String(local)) || []).map(_wrapEl).filter(Boolean));
};
const _gebClassName = (nid, names) =>
  _makeHTMLCollection(() => (_domParse("get_elements_by_class_name", nid, String(names)) || []).map(_wrapEl).filter(Boolean));

// A token must be non-empty and contain no ASCII whitespace (DOM spec).
const _validateToken = function(t) {
  t = String(t);
  if (t === '') throw new DOMException("The token provided must not be empty.", "SyntaxError");
  if (/[ \t\r\n\f]/.test(t)) throw new DOMException("The token provided ('" + t + "') contains HTML space characters, which are not valid in tokens.", "InvalidCharacterError");
};
// Live DOMTokenList backed by an element attribute (class for classList, etc.).
globalThis.DOMTokenList = class DOMTokenList {
  constructor(el, attr) { this._el = el; this._attr = attr; }
  get [Symbol.toStringTag]() { return 'DOMTokenList'; }
  _ordered() {
    const seen = new Set(), out = [];
    for (const t of (this._el.getAttribute(this._attr) || '').split(/[ \t\r\n\f]+/)) {
      if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out;
  }
  _write(tokens) {
    // DOMTokenList update steps: if the attribute is absent and the token set is
    // empty, do nothing — don't materialize an empty attribute (WPT: remove() on a
    // node with a null class attribute must leave it null).
    if (tokens.length === 0 && this._el.getAttribute(this._attr) === null) return;
    this._el.setAttribute(this._attr, tokens.join(' '));
  }
  get value() { return this._el.getAttribute(this._attr) || ''; }
  set value(v) { this._el.setAttribute(this._attr, String(v)); }
  get length() { return this._ordered().length; }
  item(i) { i = i >>> 0; const t = this._ordered(); return i < t.length ? t[i] : null; }
  contains(t) { return this._ordered().includes(String(t)); }
  add(...tokens) { tokens.forEach(_validateToken); const o = this._ordered(); for (const t of tokens) if (!o.includes(String(t))) o.push(String(t)); this._write(o); }
  remove(...tokens) { tokens.forEach(_validateToken); const rm = new Set(tokens.map(String)); this._write(this._ordered().filter(t => !rm.has(t))); }
  toggle(token, force) {
    token = String(token); _validateToken(token);
    if (this.contains(token)) { if (force === true) return true; this.remove(token); return false; }
    if (force === false) return false; this.add(token); return true;
  }
  replace(oldT, newT) {
    oldT = String(oldT); newT = String(newT);
    // Per spec the empty-token check (SyntaxError) runs for BOTH tokens before the
    // whitespace check (InvalidCharacterError) for either, so replace(" ", "")
    // throws SyntaxError (the empty newToken), not InvalidCharacterError.
    if (oldT === '' || newT === '')
      throw new DOMException("The token provided must not be empty.", "SyntaxError");
    if (/[ \t\r\n\f]/.test(oldT) || /[ \t\r\n\f]/.test(newT))
      throw new DOMException("The token provided contains HTML space characters, which are not valid in tokens.", "InvalidCharacterError");
    const o = this._ordered(); const i = o.indexOf(oldT);
    if (i < 0) return false;
    o[i] = newT;
    const seen = new Set(), out = [];
    for (const t of o) if (!seen.has(t)) { seen.add(t); out.push(t); }
    this._write(out); return true;
  }
  supports() { throw new TypeError("DOMTokenList has no supported tokens."); }
  forEach(cb, thisArg) { this._ordered().forEach((t, i) => cb.call(thisArg, t, i, this)); }
  *keys() { const t = this._ordered(); for (let i = 0; i < t.length; i++) yield i; }
  *values() { yield* this._ordered(); }
  *entries() { const t = this._ordered(); for (let i = 0; i < t.length; i++) yield [i, t[i]]; }
  [Symbol.iterator]() { return this.values(); }
  toString() { return this._el.getAttribute(this._attr) || ''; }
};
// Wrap so integer-indexed access (classList[0]) works alongside the methods.
const _makeTokenList = function(el, attr) {
  const list = new DOMTokenList(el, attr);
  return new Proxy(list, {
    get(target, prop, recv) {
      if (typeof prop === 'string' && /^[0-9]+$/.test(prop)) {
        const i = parseInt(prop, 10);
        return i < target.length ? target.item(i) : undefined; // out of range -> undefined
      }
      return Reflect.get(target, prop, recv);
    },
    has(target, prop) {
      if (typeof prop === 'string' && /^[0-9]+$/.test(prop)) return parseInt(prop, 10) < target.length;
      return Reflect.has(target, prop);
    },
  });
};

// HTML "reflect a content attribute as a URL" getter (used by `img.src`,
// `a.href`, etc.). Per the spec the IDL getter does NOT return the raw attribute:
// an absent attribute reads as "", and a present one is parsed against the
// element's base URL and returned as a serialized ABSOLUTE URL. Only if parsing
// fails is the raw value returned. Resolving here is what lets
// `performance.getEntriesByName(img.src)` match the absolute entry name recorded
// by `_loadElementResource`.
const _reflectURL = function (el, attr) {
  const v = el.getAttribute(attr);
  if (v == null) return "";
  let base;
  try { base = el.baseURI; } catch (e) {}
  try { return new URL(v, base || undefined).href; } catch (e) { return v; }
};
// Elements whose `src`/`href` IDL attributes are URL-reflecting (resolve on get).
// Scoped deliberately tight: every OTHER element keeps the raw-attribute getter,
// so this change can't perturb non-URL `src`/`href` reads elsewhere.
const _URL_REFLECT_SRC = new Set(['img', 'script', 'iframe', 'audio', 'video', 'source', 'track', 'embed', 'input', 'frame']);
const _URL_REFLECT_HREF = new Set(['a', 'area', 'link']);

class Element extends Node {
  constructor(nid) {
    super(nid);
    this._style = _styleProxy(new CSSStyleDeclaration());
  }
  get tagName() {
    // createElementNS pins a case-preserved identity: the tagName is the qualified
    // name, ASCII-uppercased only for HTML-namespace elements in an HTML document.
    if (this._localName !== undefined) {
      const qual = this._prefix ? this._prefix + ":" + this._localName : this._localName;
      const doc = this._ownerDoc;
      const htmlDoc = doc ? doc._isHTMLDoc !== false : true;
      return (this._ns === _HTML_NS && htmlDoc) ? _asciiUpper(qual) : qual;
    }
    return _domParse("tag_name", this._nid) || "";
  }
  get localName() {
    if (this._localName !== undefined) return this._localName;
    return _asciiLower(this.tagName || "");
  }
  // An element's nodeName is its tagName (qualified name, HTML-uppercased).
  get nodeName() { return this.tagName; }
  get id() { return this.getAttribute("id") || ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.getAttribute("class") || ""; }
  set className(v) { this.setAttribute("class", v); }
  // Namespace prefix — null for elements created via createElement / parsed HTML;
  // createElementNS may pin one (this._prefix). Spec requires null, not undefined.
  get prefix() { return this._prefix ?? null; }
  get namespaceURI() {
    // createElementNS pins an explicit namespace (which may legitimately be null).
    if (this._nsSet) return this._ns;
    // cloneNode etc. may pin a non-null namespace.
    if (this._ns !== undefined && this._ns !== null) return this._ns;
    // Otherwise read the element's REAL namespace from the Rust DOM, so an element
    // *named* "svg" created via createElement (HTML namespace) is not mistaken for a
    // parsed <svg> (SVG namespace). Falls back to the HTML namespace.
    const ns = _domParse("namespace_uri", this._nid);
    return (typeof ns === "string" && ns) ? ns : "http://www.w3.org/1999/xhtml";
  }
  get innerHTML() { return _domParse("inner_html", this._nid) ?? ""; }
  set innerHTML(v) {
    if (this.localName === 'template') {
      this.content.innerHTML = v;
      return;
    }
    const _watching = __mutationObservers?.length;
    const _old = _watching ? (_domParse("child_nodes", this._nid) || []) : null;
    _dom("set_inner_html", this._nid, String(v ?? ""));
    if (_watching) {
      const _new = _domParse("child_nodes", this._nid) || [];
      __notifyMutation('childList', this._nid, _new, _old);
    }
  }
  get outerHTML() { return _domParse("outer_html", this._nid) ?? ""; }
  get innerText() { return this.textContent; }
  set innerText(v) { this.textContent = v; }
  get children() {
    return _makeHTMLCollection(() => (_domParse("element_children", this._nid) || []).map(_wrapEl).filter(Boolean));
  }
  get content() {
    if (this.localName !== 'template') return undefined;
    if (!this._templateContent) this._templateContent = document.createDocumentFragment();
    return this._templateContent;
  }
  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const ch = this.children; return ch[ch.length-1] || null; }
  get nextElementSibling() { let s = this.nextSibling; while(s && s.nodeType !== 1) s = s.nextSibling; return s; }
  get previousElementSibling() { let s = this.previousSibling; while(s && s.nodeType !== 1) s = s.previousSibling; return s; }
  get classList() {
    if (!this._classList) this._classList = _makeTokenList(this, 'class');
    return this._classList;
  }
  // classList is [PutForwards=value]: `el.classList = 'x'` sets the class attr.
  set classList(v) { this.classList.value = v == null ? '' : String(v); }
  get style() { return this._style; }
  // [PutForwards=cssText]: also reflect to the `style` content attribute so it is
  // observable via getAttribute/hasAttribute/toggleAttribute and rendered.
  set style(v) { v = (v == null) ? "" : String(v); this._style.cssText = v; this.setAttribute("style", v); }
  // Should attribute names be ASCII-lowercased for this element? Only for an
  // element in the HTML namespace inside an HTML document. Cached (immutable).
  get _htmlAttr() {
    if (this.__htmlAttr === undefined) {
      const doc = this._ownerDoc;
      const docIsHtml = doc ? (doc._isHTMLDoc !== false) : true;
      this.__htmlAttr = (this.namespaceURI === _HTML_NS) && docIsHtml;
    }
    return this.__htmlAttr;
  }
  // Low-level namespace-keyed get/set/remove used by Attr nodes and the NS APIs.
  _rawGetNS(ns, local) { return _domParse("get_attribute_ns", this._nid, (ns || '') + "\0" + local); }
  _rawSetNS(ns, prefix, local, value) {
    _dom("set_attribute_ns", this._nid, (ns || '') + "\0" + (prefix || '') + "\0" + local + "\0" + String(value));
    __notifyMutation();
  }
  _rawRemoveNS(ns, local) {
    _dom("remove_attribute_ns", this._nid, (ns || '') + "\0" + local);
    __notifyMutation();
  }
  // Reconcile the per-element Attr identity cache against the live attribute
  // list, minting wrappers for new attributes and detaching removed ones.
  // Returns the ordered array of live Attr nodes.
  _syncAttrNodes() {
    const raw = _domParse("attribute_list", this._nid) || [];
    const cache = this._attrNodes || (this._attrNodes = new Map());
    const live = new Set(), out = [];
    for (const r of raw) {
      const key = (r.ns || '') + '|' + r.local;
      live.add(key);
      let a = cache.get(key);
      if (!a || a._ownerEl !== this) {
        a = new Attr(r.ns, r.prefix, r.local, r.value);
        a._ownerEl = this;
        cache.set(key, a);
      }
      out.push(a);
    }
    for (const [key, a] of cache) if (!live.has(key)) { _detachAttr(a); cache.delete(key); }
    return out;
  }
  getAttribute(qname) {
    qname = String(qname);
    if (this._htmlAttr) qname = _asciiLower(qname);
    return _domParse("get_attribute", this._nid, qname);
  }
  getAttributeNS(ns, local) {
    return this._rawGetNS((ns === '' || ns == null) ? '' : String(ns), String(local));
  }
  setAttribute(qname, v) {
    qname = String(qname);
    _validateAttrName(qname);
    if (this._htmlAttr) qname = _asciiLower(qname);
    _dom("set_attribute", this._nid, qname + "\0" + String(v));
    __notifyMutation();
    // Changing srcdoc on an iframe reprocesses the frame (src goes through the
    // src property setter's own load path).
    if (qname === 'srcdoc' && this.localName === 'iframe') _reprocessIframe(this);
    // An id'd element is reachable as a Window-named global.
    if (qname === 'id' && v) __defineNamedGlobal(String(v));
  }
  setAttributeNS(namespace, qname, v) {
    const { namespace: ns, prefix, local } = _validateAndExtract(namespace, qname);
    this._rawSetNS(ns, prefix, local, String(v));
    if (ns === null && local === 'id' && v) __defineNamedGlobal(String(v));
  }
  toggleAttribute(qname, force) {
    qname = String(qname);
    _validateAttrName(qname);
    if (this._htmlAttr) qname = _asciiLower(qname);
    const has = _domParse("get_attribute", this._nid, qname) !== null;
    if (!has) {
      if (force === undefined || force === true) { this.setAttribute(qname, ''); return true; }
      return false;
    }
    if (force === undefined || force === false) { this.removeAttribute(qname); return false; }
    return true;
  }
  removeAttribute(qname) {
    qname = String(qname);
    if (this._htmlAttr) qname = _asciiLower(qname);
    // Detach the cached Attr (snapshotting its live value) BEFORE the removal,
    // so a node later re-attached elsewhere keeps its value.
    const doomed = this.getAttributeNode(qname);
    const val = doomed ? doomed.value : null;
    _dom("remove_attribute", this._nid, qname);
    if (doomed) {
      doomed._ownerEl = null; doomed._detachedValue = val;
      this._attrNodes.delete((doomed._ns || '') + '|' + doomed._local);
    }
    __notifyMutation();
    // Removing srcdoc reprocesses: the frame falls back to src or about:blank.
    if (qname === 'srcdoc' && this.localName === 'iframe') _reprocessIframe(this);
  }
  removeAttributeNS(ns, local) {
    ns = (ns === '' || ns == null) ? '' : String(ns); local = String(local);
    const doomed = this.getAttributeNodeNS(ns, local);
    const val = doomed ? doomed.value : null;
    this._rawRemoveNS(ns, local);
    if (doomed) {
      doomed._ownerEl = null; doomed._detachedValue = val;
      this._attrNodes.delete((doomed._ns || '') + '|' + doomed._local);
    }
  }
  hasAttribute(qname) { return this.getAttribute(qname) !== null; }
  hasAttributeNS(ns, local) { return this.getAttributeNS(ns, local) !== null; }
  toggleAttributeNS(ns, n, force) { return this.toggleAttribute(n, force); } // simplified
  hasAttributes() { return (_domParse("attribute_list", this._nid) || []).length > 0; }
  getAttributeNames() { return _domParse("attribute_names", this._nid) || []; }
  getAttributeNode(qname) {
    qname = String(qname);
    if (this._htmlAttr) qname = _asciiLower(qname);
    for (const a of this._syncAttrNodes()) if (a.name === qname) return a;
    return null;
  }
  getAttributeNodeNS(ns, local) {
    ns = (ns === '' || ns == null) ? null : String(ns); local = String(local);
    for (const a of this._syncAttrNodes()) if (a._ns === ns && a._local === local) return a;
    return null;
  }
  // The "set an attribute" algorithm shared by setAttributeNode/NS.
  _setAttrNode(attr) {
    if (!(attr instanceof Attr)) throw new TypeError("Argument is not an Attr");
    if (attr._ownerEl !== null && attr._ownerEl !== this)
      throw new DOMException("The attribute is in use by another element.", "InUseAttributeError");
    const oldAttr = this.getAttributeNodeNS(attr._ns, attr._local);
    if (oldAttr === attr) return attr; // replacing an attr by itself
    const oldVal = oldAttr ? oldAttr.value : null;
    this._rawSetNS(attr._ns, attr._prefix, attr._local, attr.value);
    if (oldAttr) { oldAttr._ownerEl = null; oldAttr._detachedValue = oldVal; }
    attr._ownerEl = this;
    this._attrNodes.set((attr._ns || '') + '|' + attr._local, attr);
    return oldAttr || null;
  }
  setAttributeNode(attr) { this._attrNodes || (this._attrNodes = new Map()); return this._setAttrNode(attr); }
  setAttributeNodeNS(attr) { this._attrNodes || (this._attrNodes = new Map()); return this._setAttrNode(attr); }
  removeAttributeNode(attr) {
    if (!(attr instanceof Attr) || attr._ownerEl !== this)
      throw new DOMException("The attribute is not owned by this element.", "NotFoundError");
    const val = attr.value;
    this._rawRemoveNS(attr._ns, attr._local);
    (this._attrNodes || (this._attrNodes = new Map())).delete((attr._ns || '') + '|' + attr._local);
    attr._ownerEl = null; attr._detachedValue = val;
    return attr;
  }
  get attributes() { return _buildNamedNodeMap(this); }
  querySelector(s) { _primeTarget(s, this); return _qsOne(_dom("query_selector_scoped", this._nid, s), s); }
  querySelectorAll(s) {
    _primeTarget(s, this);
    const ids = _qsIds(_dom("query_selector_all_scoped", this._nid, s), s);
    return _makeNodeList(ids.map(_wrapEl).filter(Boolean));
  }
  getElementsByTagName(t) { return _gebTagName(this._nid, t, this.ownerDocument ? this.ownerDocument._isHTMLDoc !== false : true); }
  getElementsByTagNameNS(ns, local) { return _gebTagNameNS(this._nid, ns, local); }
  getElementsByClassName(c) { return _gebClassName(this._nid, c); }
  matches(s) {
    const parent = this.parentNode;
    if (!parent || !parent.querySelectorAll) return false;
    const matches = parent.querySelectorAll(s);
    for (let i = 0; i < matches.length; i++) {
      if (matches[i]._nid === this._nid) return true;
    }
    return false;
  }
  closest(s) {
    let el = this;
    while (el) {
      if (el.nodeType === 1 && el.matches && el.matches(s)) return el;
      el = el.parentNode;
    }
    return null;
  }
  insertAdjacentHTML(position, html) {
    const parent = this.parentNode;
    switch (position) {
      case 'beforebegin':
        if (parent) { const tmp = document.createElement('div'); tmp.innerHTML = html; const children = tmp.childNodes; for (let i = 0; i < children.length; i++) parent.insertBefore(children[i], this); }
        break;
      case 'afterbegin':
        { const tmp = document.createElement('div'); tmp.innerHTML = html; const children = tmp.childNodes; const first = this.firstChild; for (let i = children.length - 1; i >= 0; i--) this.insertBefore(children[i], first); }
        break;
      case 'beforeend':
        { const tmp = document.createElement('div'); tmp.innerHTML = html; const children = tmp.childNodes; for (let i = 0; i < children.length; i++) this.appendChild(children[i]); }
        break;
      case 'afterend':
        if (parent) { const tmp = document.createElement('div'); tmp.innerHTML = html; const children = tmp.childNodes; const next = this.nextSibling; for (let i = 0; i < children.length; i++) parent.insertBefore(children[i], next); }
        break;
    }
  }
  // Shared placement for insertAdjacentElement/Text. Position is case-insensitive;
  // beforebegin/afterend return null when there's no parent (per spec).
  _insertAdjacentNode(position, node) {
    const parent = this.parentNode;
    switch (String(position).toLowerCase()) {
      case 'beforebegin': if (!parent) return null; parent.insertBefore(node, this); return node;
      case 'afterbegin': this.insertBefore(node, this.firstChild); return node;
      case 'beforeend': this.appendChild(node); return node;
      case 'afterend': if (!parent) return null; parent.insertBefore(node, this.nextSibling); return node;
      default:
        throw new DOMException("Failed to execute 'insertAdjacentElement' on 'Element': The value provided ('" + position + "') is not one of 'beforeBegin', 'afterBegin', 'beforeEnd', or 'afterEnd'.", "SyntaxError");
    }
  }
  insertAdjacentElement(position, element) { return this._insertAdjacentNode(position, element); }
  insertAdjacentText(position, text) { this._insertAdjacentNode(position, document.createTextNode(String(text))); }
  click() {
    const cancelled = !this.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}));
    if (!cancelled) {
      const link = this.tagName === 'A' ? this : (this.closest ? this.closest('a[href]') : null);
      if (link) {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          location.assign(href);
          return;
        }
      }
      const type = (this.getAttribute('type') || '').toLowerCase();
      if (type === 'submit' || (this.localName === 'button' && type !== 'button' && type !== 'reset')) {
        const form = this.closest ? this.closest('form') : null;
        if (form && typeof form.submit === 'function') {
          form.submit(this);
        }
      }
    }
  }
  focus() {
    const prev = __obscura_focused;
    if (prev === this) return;
    if (prev) {
      try { prev.dispatchEvent(new Event('blur', { bubbles: false })); } catch(e) {}
      try { prev.dispatchEvent(new Event('focusout', { bubbles: true })); } catch(e) {}
    }
    __obscura_focused = this;
    __obscura_click_target = this;
    _dom("set_focus", this._nid, ""); // Phase 0b: Rust focus state for :focus
    // focus/blur do not bubble; focusin/focusout do.
    try { this.dispatchEvent(new Event('focus', { bubbles: false })); } catch(e) {}
    try { this.dispatchEvent(new Event('focusin', { bubbles: true })); } catch(e) {}
  }
  blur() {
    if (__obscura_focused !== this) return;
    __obscura_focused = null;
    _dom("set_focus", "", ""); // Phase 0b: clear Rust focus state
    try { this.dispatchEvent(new Event('blur', { bubbles: false })); } catch(e) {}
    try { this.dispatchEvent(new Event('focusout', { bubbles: true })); } catch(e) {}
  }
  get value() {
    if (_formValues[this._nid] !== undefined) return _formValues[this._nid];
    const tag = this.localName;
    if (tag === 'textarea') return this.textContent;
    return this.getAttribute("value") || "";
  }
  set value(v) {
    _formValues[this._nid] = String(v);
    const tag = this.localName;
    if (tag === 'textarea') {
      this.textContent = String(v);
    }
  }
  // Phase 0b: checked state lives in the Rust DOM so it's visible to the
  // selector engine (:checked) and consistent across all access paths.
  get checked() { return _dom("get_checked", this._nid, "") === "1"; }
  set checked(v) { _dom("set_checked", this._nid, v ? "1" : "0"); }
  get selected() {
    if (this._selected !== undefined) return this._selected;
    return this.hasAttribute("selected");
  }
  set selected(v) { this._selected = !!v; }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(v) { if (v) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }
  get type() { return this.getAttribute("type") || (this.localName === "input" ? "text" : ""); }
  set type(v) { this.setAttribute("type", v); }
  get name() { return this.getAttribute("name") || ""; }
  set name(v) { this.setAttribute("name", v); }
  get placeholder() { return this.getAttribute("placeholder") || ""; }
  set placeholder(v) { this.setAttribute("placeholder", v); }
  get href() {
    if (_URL_REFLECT_HREF.has(this.localName)) return _reflectURL(this, "href");
    return this.getAttribute("href") || "";
  }
  set href(v) { this.setAttribute("href", v); }
  get rel() { return this.getAttribute("rel") || ""; }
  set rel(v) { this.setAttribute("rel", v); }
  // iframe srcdoc reflects the attribute; setting it reprocesses via setAttribute.
  get srcdoc() { return this.getAttribute("srcdoc") || ""; }
  set srcdoc(v) { this.setAttribute("srcdoc", v == null ? "" : String(v)); }
  get src() {
    if (_URL_REFLECT_SRC.has(this.localName)) return _reflectURL(this, "src");
    return this.getAttribute("src") || "";
  }
  set src(v) {
    this.setAttribute("src", v);
    // <img>: setting src starts a fetch (whether or not the element is
    // connected) which records a Resource Timing entry and fires load/error.
    if (this.localName === 'img') {
      if (v) _loadElementResource(this, v, 'img');
      return;
    }
    if (this.localName === 'iframe') {
      if (v && v !== 'about:blank') {
        this._loadIframeSrc(v);
      } else {
        // about:blank (or empty): ensure a blank document exists and fire load,
        // mirroring how real browsers load the initial about:blank document.
        this.contentDocument; // side effect: creates _iframeDoc + _iframeWin
        _registerIframe(this);
        _scheduleFrameElementLoad(this);
      }
    }
  }
  _loadIframeSrc(url) {
    this._srcLoadStarted = true; // markup-src auto-load (below) won't double-fire
    this._loadEventFired = false; // a (re)load fires a fresh element load event
    const _gen = _bumpFrameLoadGen(this); // supersede any pending about:blank load
    const _self = this;
    let fullUrl = url;
    // Resolve only RELATIVE urls against the document base. A url that already has
    // a scheme (blob:, data:, about:, http(s):) is absolute — resolving blob: vs an
    // https base would rewrite it to https and lose the blob: protocol.
    if (!url.includes('://') && !/^[a-z][a-z0-9+.\-]*:/i.test(url)) {
      try { fullUrl = new URL(url, _domParse("document_url") || "about:blank").href; } catch(e) {}
    }
    const el = this;
    fetch(fullUrl, {mode: 'no-cors', _initiatorType: 'iframe'}).then(async resp => {
      // Superseded by a newer load (e.g. srcdoc set while this was in flight)?
      // Don't clobber the current document or fire a stale load.
      if (_self._loadGen !== _gen) return;
      if (resp.ok || resp.type === 'opaque') {
        const html = await resp.text();
        if (_self._loadGen !== _gen) return; // re-check after the awaited body
        el._iframeDoc = new _IframeDocument(html, fullUrl, el, undefined, _iframeDocKind(fullUrl, resp));
        el._iframeWin = new _IframeWindow(el._iframeDoc, fullUrl);
      } else {
        el._iframeDoc = new _IframeDocument('<!DOCTYPE html><html><head></head><body></body></html>', fullUrl, el);
        el._iframeWin = new _IframeWindow(el._iframeDoc, fullUrl);
      }
      _registerIframe(el);
      await _executeFrameScripts(el); // run same-origin frame scripts before load
      if (_self._loadGen === _gen) _fireIframeElementLoad(el);
    }).catch(() => {
      if (_self._loadGen !== _gen) return; // superseded — leave the current doc intact
      el._iframeDoc = new _IframeDocument('<!DOCTYPE html><html><head></head><body></body></html>', fullUrl, el);
      el._iframeWin = new _IframeWindow(el._iframeDoc, fullUrl);
      _registerIframe(el);
      _fireIframeElementLoad(el);
    });
  }
  get contentDocument() {
    if (this.localName !== 'iframe') return undefined;
    if (this._iframeDoc) {
      const pageOrigin = (function(){ try { return new URL(_domParse("document_url")).origin; } catch(e) { return ''; } })();
      const iframeOrigin = (function(url){ try { return new URL(url).origin; } catch(e) { return ''; } })(this.src);
      if (pageOrigin === iframeOrigin || this.src === '' || this.src === 'about:blank' || !this.src.includes('://')) {
        return this._iframeDoc;
      }
      return null; // Cross-origin: blocked
    }
    if (!this._iframeDoc) {
      // `srcdoc` documents are same-origin with the host page, so their scripts
      // run. A bare/blank iframe builds an empty about:blank doc (no scripts).
      const srcdoc = this.getAttribute('srcdoc');
      const srcAttr = this.getAttribute('src');
      if (srcdoc) {
        // srcdoc: document.URL is 'about:srcdoc'; the base URL (for relative
        // <script src> + baseURI) and the window's location/origin come from the
        // parent (the srcdoc document is same-origin with its host).
        const parentUrl = _domParse("document_url") || 'about:blank';
        this._iframeDoc = new _IframeDocument(srcdoc, 'about:srcdoc', this, parentUrl);
        // location.href === 'about:srcdoc', but origin inherited from the parent.
        this._iframeWin = new _IframeWindow(this._iframeDoc, 'about:srcdoc', parentUrl);
        _registerIframe(this);
        _executeFrameScripts(this); // async; frame scripts run against the frame win
      } else if (srcAttr && srcAttr !== 'about:blank' && !this._srcLoadStarted) {
        // Markup `<iframe src>`: the `set src` setter only fires on JS assignment,
        // not during parse, so a markup-loaded frame never started loading. Return
        // a provisional blank doc synchronously, then load the real src async via
        // the same path as an assigned src (cross-origin reads still blocked by the
        // origin check above once the real doc lands).
        this._iframeDoc = new _IframeDocument('<!DOCTYPE html><html><head></head><body></body></html>', 'about:blank', this);
        this._iframeWin = new _IframeWindow(this._iframeDoc, 'about:blank');
        this._loadIframeSrc(srcAttr);
      } else {
        this._iframeDoc = new _IframeDocument('<!DOCTYPE html><html><head></head><body></body></html>', 'about:blank', this);
        this._iframeWin = new _IframeWindow(this._iframeDoc, 'about:blank');
      }
    }
    return this._iframeDoc;
  }
  get contentWindow() {
    if (this.localName !== 'iframe') return undefined;
    if (!this._iframeWin) {
      this.contentDocument; // side effect: creates _iframeDoc + _iframeWin
    }
    // Back-link frameElement so code inside the frame can find its host element.
    if (this._iframeWin && !this._iframeWin.frameElement) this._iframeWin.frameElement = this;
    return this._iframeWin;
  }
  get action() {
    const action = this.getAttribute("action") || _domParse("document_url") || "";
    try { return new URL(action, _domParse("document_url") || "about:blank").href; } catch(e) { return action; }
  }
  set action(v) { this.setAttribute("action", v); }
  get method() { return this.getAttribute("method") || "get"; }
  set method(v) { this.setAttribute("method", v); }
  get form() {
    let p = this.parentNode;
    while (p && p.localName !== 'form') p = p.parentNode;
    return p;
  }
  get options() {
    if (this.localName !== 'select') return [];
    return this.querySelectorAll('option');
  }
  get selectedIndex() {
    const opts = this.options;
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].selected || opts[i].hasAttribute('selected')) return i;
    }
    return -1;
  }
  set selectedIndex(v) {
    const opts = this.options;
    for (let i = 0; i < opts.length; i++) {
      opts[i]._selected = (i === v);
    }
  }
  submit(submitter) {
    const cancelled = !this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    if (cancelled) return;

    const pairs = [];
    const fields = this.querySelectorAll('input, select, textarea');
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const name = f.getAttribute('name');
      if (!name) continue;
      if (f.getAttribute('disabled') !== null) continue;
      const tag = f.localName;
      const type = (f.getAttribute('type') || '').toLowerCase();
      if ((type === 'checkbox' || type === 'radio') && !f.checked) continue;
      if (type === 'file' || type === 'reset') continue;
      if (type === 'button') continue;
      if (type === 'submit' || tag === 'button') {
        if (submitter && f !== submitter) continue;
        if (!submitter) continue; // default submit: don't include submit button value
      }

      let val;
      if (tag === 'select') {
        const opt = f.querySelector('option[selected]') || f.querySelector('option');
        val = opt ? (opt.getAttribute('value') !== null ? opt.getAttribute('value') : opt.textContent) : '';
      } else if (tag === 'textarea') {
        val = f.value || f.textContent || '';
      } else {
        val = f.value !== undefined ? f.value : (f.getAttribute('value') || '');
      }
      const enc = (s) => encodeURIComponent(s).replace(/%20/g, '+').replace(/!/g, '%21');
      pairs.push(enc(name) + '=' + enc(val));
    }

    const action = this.getAttribute('action') || '';
    const method = (this.getAttribute('method') || 'GET').toUpperCase();
    const baseUrl = globalThis.location?.href || 'about:blank';
    let targetUrl;
    try { targetUrl = new URL(action, baseUrl).href; } catch(e) { targetUrl = action; }

    const encoded = pairs.join('&');
    if (method === 'POST') {
      Deno.core.ops.op_navigate(targetUrl, 'POST', encoded);
    } else {
      const sep = targetUrl.includes('?') ? '&' : '?';
      Deno.core.ops.op_navigate(targetUrl + (encoded ? sep + encoded : ''), 'GET', '');
    }
  }
  reset() {
    this.dispatchEvent(new Event('reset', { bubbles: true }));
  }
  get dataset() {
    const el = this;
    return new Proxy({}, {
      get(_, k) { if(typeof k!=="string")return undefined; return el.getAttribute("data-"+k.replace(/([A-Z])/g,"-$1").toLowerCase()); },
      set(_, k, v) { el.setAttribute("data-"+k.replace(/([A-Z])/g,"-$1").toLowerCase(), v); return true; },
    });
  }
  get offsetWidth() { return 100; } get offsetHeight() { return 20; }
  get offsetTop() { return 0; } get offsetLeft() { return 0; }
  get clientWidth() { return 100; } get clientHeight() { return 20; }
  get scrollWidth() { return 100; } get scrollHeight() { return 20; }
  get scrollTop() { return 0; } set scrollTop(v) {}
  get scrollLeft() { return 0; } set scrollLeft(v) {}
  getBoundingClientRect() {
    __obscura_click_target = this;
    // No layout engine, but Playwright's actionability polling needs each
    // element to occupy a stable, distinct rect so hit-testing can pick the
    // right one (issue #45). Synthesize a deterministic position from the
    // node id: every nid maps to a unique cell in a 12-column grid, sized
    // to fit a 1280x720 viewport. Stable across reads, different per node.
    const VW = 1280, VH = 720, COLS = 12, CW = 100, CH = 20, GX = 110, GY = 30;
    const rowsPerScreen = Math.max(1, Math.floor((VH - 10) / GY));
    const cell = this._nid | 0;
    const col = ((cell * 7) | 0) % COLS;
    const row = (((cell * 13) | 0) >> 0) % rowsPerScreen;
    const x = 10 + col * GX;
    const y = 10 + row * GY;
    return {
      x, y, width: CW, height: CH,
      top: y, right: x + CW, bottom: y + CH, left: x,
      toJSON() { return this; },
    };
  }
  getClientRects() { return [this.getBoundingClientRect()]; }
  // No layout engine: a stub that always returns true unblocks Playwright's
  // actionability polling. With a real layout we'd check display, visibility,
  // opacity and rect dimensions per spec.
  checkVisibility(opts) { return true; }
  // ARIA reflection properties. Without an accessibility tree we expose the
  // raw aria-* attributes so Playwright's getByRole / getByLabel locators can
  // at least find elements that author them explicitly.
  get role() { return this.getAttribute('role'); }
  set role(v) { if (v == null) this.removeAttribute('role'); else this.setAttribute('role', String(v)); }
  get ariaLabel() { return this.getAttribute('aria-label'); }
  set ariaLabel(v) { if (v == null) this.removeAttribute('aria-label'); else this.setAttribute('aria-label', String(v)); }
  get ariaRoleDescription() { return this.getAttribute('aria-roledescription'); }
  set ariaRoleDescription(v) { if (v == null) this.removeAttribute('aria-roledescription'); else this.setAttribute('aria-roledescription', String(v)); }
  get ariaChecked() { return this.getAttribute('aria-checked'); }
  set ariaChecked(v) { if (v == null) this.removeAttribute('aria-checked'); else this.setAttribute('aria-checked', String(v)); }
  get ariaDisabled() { return this.getAttribute('aria-disabled'); }
  set ariaDisabled(v) { if (v == null) this.removeAttribute('aria-disabled'); else this.setAttribute('aria-disabled', String(v)); }
  get ariaExpanded() { return this.getAttribute('aria-expanded'); }
  set ariaExpanded(v) { if (v == null) this.removeAttribute('aria-expanded'); else this.setAttribute('aria-expanded', String(v)); }
  get ariaHidden() { return this.getAttribute('aria-hidden'); }
  set ariaHidden(v) { if (v == null) this.removeAttribute('aria-hidden'); else this.setAttribute('aria-hidden', String(v)); }
  get ariaSelected() { return this.getAttribute('aria-selected'); }
  set ariaSelected(v) { if (v == null) this.removeAttribute('aria-selected'); else this.setAttribute('aria-selected', String(v)); }
  scrollIntoView() { __obscura_click_target = this; }
  animate(keyframes, options) {
    const duration = typeof options === 'number' ? options : (options?.duration || 0);
    return {
      finished: Promise.resolve(), currentTime: 0, playState: 'finished',
      effect: { getComputedTiming() { return { duration }; } },
      cancel(){}, finish(){}, play(){}, pause(){}, reverse(){},
      addEventListener(){}, removeEventListener(){},
      onfinish: null, oncancel: null,
    };
  }
  getAnimations() { return []; }
  get isConnected() {
    var node = this;
    while (node) {
      if (node.nodeType === 9) return true;
      node = node.parentNode;
    }
    return false;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  append(...nodes) { for (const n of nodes) { if (typeof n === "string") this.appendChild(document.createTextNode(n)); else this.appendChild(n); } }
  prepend(...nodes) {
    const ref = this.firstChild;
    for (const n of nodes) {
      const node = (typeof n === "string") ? document.createTextNode(n) : n;
      if (ref) this.insertBefore(node, ref);
      else this.appendChild(node);
    }
  }
}

class Document extends Node {
  // `new Document(nid)` (numeric) wraps a real document node (the main document,
  // or a node-type-9 node from the tree). `new Document()` with no id creates a
  // fresh, empty XML document per the DOM spec (used by WPT range/traversal setup).
  constructor(nid) {
    super(typeof nid === 'number' ? nid : -1);
    if (typeof nid !== 'number') return new DetachedDocument('xml');
  }
  get documentElement() { return _wrapEl(+_dom("document_element")); }
  get head() { return this.querySelector("head"); }
  get body() { return this.querySelector("body"); }
  get doctype() {
    if (this._doctype !== undefined) return this._doctype;
    const info = _domParse("document_doctype");
    if (info && info.name) {
      this._doctype = new DocumentType(info.nodeId, info.name, info.publicId || "", info.systemId || "");
    } else {
      this._doctype = null;
    }
    return this._doctype;
  }
  get title() { return _domParse("document_title") ?? ""; }
  set title(v) {}
  get URL() { return _domParse("document_url") ?? ""; }
  get documentURI() { return this.URL; }
  get location() { return globalThis.location; }
  set location(url) { Deno.core.ops.op_navigate(_resolveUrl(String(url)), 'GET', ''); }
  get defaultView() { return globalThis; }
  get nodeType() { return 9; }
  get nodeName() { return "#document"; }
  get ownerDocument() { return null; } // Document has no ownerDocument
  get compatMode() { return this._compatMode || "CSS1Compat"; }
  get characterSet() { return "UTF-8"; }
  get charset() { return this.characterSet; }        // legacy alias of characterSet
  get inputEncoding() { return this.characterSet; }  // legacy alias of characterSet
  get contentType() { return "text/html"; }
  // Whether this is an HTML document (drives attribute-name lowercasing).
  get _isHTMLDoc() { return true; }
  get readyState() { return globalThis.__documentReadyState__ || 'complete'; }
  get hidden() { return false; }
  get visibilityState() { return "visible"; }
  getElementById(id) { return _wrapEl(+_dom("get_element_by_id", id)); }
  querySelector(s) { _primeTarget(s, this); return _qsOne(_dom("query_selector", s), s); }
  querySelectorAll(s) {
    _primeTarget(s, this);
    const ids = _qsIds(_dom("query_selector_all", s), s);
    return _makeNodeList(ids.map(_wrapEl).filter(Boolean));
  }
  getElementsByTagName(t) { return _gebTagName(this._nid, t, this._isHTMLDoc); }
  getElementsByTagNameNS(ns, local) { return _gebTagNameNS(this._nid, ns, local); }
  getElementsByClassName(c) { return _gebClassName(this._nid, c); }
  getElementsByName(name) { return this.querySelectorAll('[name="' + String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]'); }
  createElement(t) {
    // WebIDL: localName is a (non-nullable) DOMString — undefined -> "undefined",
    // null -> "null". Then validate against the element-name production, throwing
    // InvalidCharacterError; finally ASCII-lowercase (this is an HTML document).
    const name = (t === undefined) ? "undefined" : String(t);
    if (!_isValidElementName(name)) {
      throw new DOMException("The string '" + name + "' is not a valid element name.", "InvalidCharacterError");
    }
    const local = _asciiLower(name);
    const el = _wrapEl(+_dom("create_element", local));
    if (el && local === 'template') {
      el._templateContent = this.createDocumentFragment();
    }
    return el;
  }
  createElementNS(namespace, qualifiedName) {
    // Validate+extract, then create a REAL foreign-namespace node (case-preserved
    // local + prefix) so the selector engine / getElementsByTagName / serializer
    // all see the true namespace — not a faked HTML node.
    const { namespace: nsv, prefix, local } = _validateAndExtract(namespace, qualifiedName);
    const nid = +_dom("create_element_ns", (nsv || '') + "\0" + (prefix || '') + "\0" + local);
    if (nid < 0 || isNaN(nid)) return null;
    // Only HTML-namespace elements get an HTMLElement-based interface; the local
    // name is matched case-sensitively (so "SPAN" → HTMLUnknownElement).
    const C = (nsv === _HTML_NS) ? _htmlClassForLocal(local) : Element;
    let el = _cache.get(nid);
    if (!el) { el = new C(nid); _cache.set(nid, el); }
    el._ns = nsv; el._nsSet = true; el._prefix = prefix; el._localName = local;
    el._ownerDoc = this;
    if (nsv === _HTML_NS && local === 'template') el._templateContent = this.createDocumentFragment();
    return el;
  }
  createTextNode(t) { return _wrap(+_dom("create_text_node", String(t))); }
  createComment(t) {
    const nid = +_dom("create_comment_node", String(t ?? ""));
    const n = new Comment(nid);
    _cache.set(nid, n);
    return n;
  }
  // Per DOM spec, createCDATASection throws on an HTML document; XML documents
  // (DetachedDocument with kind 'xml') override this to actually create one.
  createCDATASection(data) {
    throw new DOMException("This operation is not supported for HTML documents.", "NotSupportedError");
  }
  createProcessingInstruction(target, data) { return _createPIValidated(target, data); }
  // Create a detached Attr node. createAttribute lowercases for HTML documents;
  // createAttributeNS validates+extracts the qualified name (case-preserving).
  createAttribute(localName) {
    localName = (localName === undefined) ? "undefined" : String(localName);
    _validateAttrName(localName);
    if (this._isHTMLDoc) localName = _asciiLower(localName);
    const a = new Attr(null, null, localName, ""); a.__ownerDoc = this; return a;
  }
  createAttributeNS(namespace, qualifiedName) {
    const { namespace: ns, prefix, local } =
      _validateAndExtract(namespace, (qualifiedName === undefined) ? "undefined" : String(qualifiedName));
    const a = new Attr(ns, prefix, local, ""); a.__ownerDoc = this; return a;
  }
  createDocumentFragment() {
    const nid = +_dom("create_document_fragment");
    const frag = new DocumentFragment(nid);
    _cache.set(nid, frag);
    return frag;
  }
  // Legacy DOM Level 2 event factory. Spec returns an event of the requested
  // class with an empty type until init*Event() is called. We previously
  // returned a generic Event for every type, which broke libraries that call
  // createEvent('CustomEvent').initCustomEvent(...) — see issue #41.
  createEvent(type) {
    const map = {
      'customevent': CustomEvent, 'customevents': CustomEvent,
      'mouseevent': MouseEvent,   'mouseevents': MouseEvent,
      'keyboardevent': KeyboardEvent, 'keyboardevents': KeyboardEvent,
      'focusevent': FocusEvent,
      'inputevent': InputEvent,
      'uievent': UIEvent, 'uievents': UIEvent,
      'compositionevent': CompositionEvent,
      'wheelevent': WheelEvent,
      'pointerevent': PointerEvent,
      'errorevent': ErrorEvent,
      'popstateevent': PopStateEvent,
      'animationevent': AnimationEvent,
      'transitionevent': TransitionEvent,
    };
    const Cls = map[String(type || '').toLowerCase()] || Event;
    const e = new Cls('');
    e._initialized = false; // createEvent yields an uninitialized event (needs initEvent)
    return e;
  }
  createRange() {
    const r = new Range();
    r.setStart(this, 0); r.setEnd(this, 0);
    return r;
  }
  createTreeWalker(root, whatToShow, filter) {
    if (!(root instanceof Node)) throw new TypeError("createTreeWalker: root must be a Node");
    return new TreeWalker(root, __obscura_whatToShow(whatToShow), __obscura_nodeFilterArg(filter));
  }
  createNodeIterator(root, whatToShow, filter) {
    if (!(root instanceof Node)) throw new TypeError("createNodeIterator: root must be a Node");
    return new NodeIterator(root, __obscura_whatToShow(whatToShow), __obscura_nodeFilterArg(filter));
  }
  getSelection() { return globalThis.getSelection(); }
  get activeElement() { return __obscura_focused || this.body; }
  get implementation() {
    return {
      createHTMLDocument(title) {
        const doc = new DetachedDocument('html');
        // Spec: createHTMLDocument prepends a <!DOCTYPE html> before <html>.
        const dt = this.createDocumentType('html', '', '');
        dt._ownerDoc = doc;
        doc.insertBefore(dt, doc.documentElement);
        doc._doctype = dt;
        if (title !== undefined) {
          const t = doc.createElement('title');
          t.textContent = String(title);
          doc.head.appendChild(t);
        }
        return doc;
      },
      createDocument(namespace, qualifiedName, doctype) {
        const doc = new DetachedDocument('xml');
        // DOM §createDocument: the document's content type derives from `namespace`,
        // and createElement's element namespace follows from the content type. The
        // XHTML namespace yields application/xhtml+xml, in which createElement makes
        // HTML-namespace elements (so this matches createHTMLDocument structurally);
        // SVG → image/svg+xml; anything else → application/xml.
        if (namespace === "http://www.w3.org/1999/xhtml") {
          doc._createMode = 'xhtml'; doc._contentType = "application/xhtml+xml";
        } else if (namespace === "http://www.w3.org/2000/svg") {
          doc._contentType = "image/svg+xml";
        }
        if (doctype) { doctype._ownerDoc = doc; doc.appendChild(doctype); doc._doctype = doctype; }
        if (qualifiedName) {
          const el = doc.createElementNS(namespace || null, qualifiedName);
          doc.appendChild(el);
          doc._docEl = el;
        }
        return doc;
      },
      createDocumentType(qualifiedName, publicId, systemId) {
        const nid = +_dom("create_comment_node", "");
        return new DocumentType(nid, String(qualifiedName), String(publicId ?? ""), String(systemId ?? ""));
      },
      hasFeature() { return true; },
    };
  }
  get styleSheets() { return []; }
  get forms() { return this.querySelectorAll("form"); }
  get images() { return this.querySelectorAll("img"); }
  get links() { return this.querySelectorAll("a[href], area[href]"); }
  get scripts() { return this.querySelectorAll("script"); }
  get cookie() {
    return Deno.core.ops.op_get_cookies();
  }
  set cookie(v) {
    if (!v) return;
    Deno.core.ops.op_set_cookie(v);
  }
  write(...args) {
    var html = args.join('');
    if (!html) return;
    var body = this.body;
    if (!body) return;
    var temp = this.createElement('div');
    temp.innerHTML = html;
    var children = temp.childNodes;
    for (var i = 0; i < children.length; i++) {
      body.appendChild(children[i]);
    }
  }
  writeln(...args) {
    this.write(args.join('') + '\n');
  }
  open() {
    var body = this.body;
    if (body) body.innerHTML = '';
    return this;
  }
  close() {
    return;
  }
  hasFocus() { return true; }
  execCommand() { return false; }
}

class DocumentFragment extends Node {
  // The web-facing `new DocumentFragment()` must allocate a REAL backing node;
  // without one, `_nid` is undefined and Rust tree ops fall back to node 0 (the
  // live page document) — the same footgun the old DOMParser stub had.
  // document.createDocumentFragment() still passes a real nid.
  constructor(nid) {
    if (nid === undefined) nid = +_dom("create_document_fragment");
    super(nid);
    _cache.set(nid, this);
  }
  get nodeType() { return 11; }
  get nodeName() { return "#document-fragment"; }
  get innerHTML() { return _domParse("inner_html", this._nid) ?? ""; }
  set innerHTML(v) { _dom("set_inner_html", this._nid, String(v ?? "")); }
  querySelector(s) { _primeTarget(s, this); return _qsOne(_dom("query_selector_scoped", this._nid, s), s); }
  querySelectorAll(s) {
    _primeTarget(s, this);
    const ids = _qsIds(_dom("query_selector_all_scoped", this._nid, s), s);
    return _makeNodeList(ids.map(_wrapEl).filter(Boolean));
  }
  get children() {
    const ids = _domParse("element_children", this._nid) || [];
    return ids.map(_wrapEl).filter(Boolean);
  }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const ch = this.children; return ch[ch.length - 1] || null; }
  get childElementCount() { return this.children.length; }
  getElementById(id) { return null; }
  // ParentNode mixin (Element defines these too; DocumentFragment extends Node
  // directly, so it needs its own copy).
  append(...nodes) { for (const n of nodes) this.appendChild(typeof n === "string" ? document.createTextNode(n) : n); }
  prepend(...nodes) {
    const ref = this.firstChild;
    for (const n of nodes) {
      const node = (typeof n === "string") ? document.createTextNode(n) : n;
      if (ref) this.insertBefore(node, ref); else this.appendChild(node);
    }
  }
  cloneNode(deep) {
    const frag = document.createDocumentFragment();
    if (deep) frag.innerHTML = this.innerHTML;
    return frag;
  }
}

class DocumentType extends Node {
  constructor(nid, name, publicId, systemId) {
    super(nid);
    this._name = name;
    this._publicId = publicId;
    this._systemId = systemId;
    // Canonical wrapper for this node id, so document.doctype and
    // document.childNodes[i] (resolved via _wrap) are the SAME object — node
    // identity that the DOM ranges/traversal tests rely on.
    if (!isNaN(nid) && nid >= 0) _cache.set(nid, this);
  }
  get nodeType() { return 10; }
  get nodeName() { return this._name; }
  get name() { return this._name; }
  get publicId() { return this._publicId; }
  get systemId() { return this._systemId; }
  // A doctype's node document is the doc it was created in or appended into
  // (createHTMLDocument / createDocument set _ownerDoc); defaults to the page.
  get ownerDocument() { return this._ownerDoc || globalThis.document; }
  // §clone a node: a fresh detached doctype with the same name/publicId/systemId.
  cloneNode() {
    const dt = new DocumentType(+_dom("create_comment_node", ""), this._name, this._publicId, this._systemId);
    dt._ownerDoc = this._ownerDoc;
    return dt;
  }
}

// A standalone document not attached to the page (from `new Document()`,
// implementation.createDocument / createHTMLDocument). Backed by a real
// DocumentFragment node so tree operations (appendChild, childNodes, ranges,
// traversal) all flow through the existing Rust tree ops; it merely reports
// nodeType 9 and scopes its queries/factories to its own subtree, so nodes it
// owns never pollute the main page. `nodeType`/`nodeName` are inherited from
// Document (9 / "#document").
class DetachedDocument extends Document {
  constructor(kind) {
    super(+_dom("create_document_fragment"));
    // Make THIS object the canonical wrapper for its backing node, so that a
    // child's `.parentNode` (which resolves via _wrap) returns this same
    // DetachedDocument rather than a fresh plain Document wrapper. Required for
    // node-identity (isInclusiveDescendant) over foreign/xml document roots.
    _cache.set(this._nid, this);
    // This fragment-backed node is a real document, not a plain DocumentFragment;
    // tell the matcher so `:root` matches its document element (but not a fragment's).
    _dom('mark_real_document', this._nid);
    this._kind = kind === 'html' ? 'html' : 'xml';
    // createElement semantics: 'html' (ASCII-lowercase + HTML namespace) vs XML-family
    // ('xml' → namespaceURI null, 'xhtml' → HTMLNS), both case-preserving. _IframeDocument
    // promotes this to 'xhtml' for application/xhtml+xml documents.
    this._createMode = this._kind === 'html' ? 'html' : 'xml';
    this._doctype = null;
    this._docEl = null;
    this._headEl = null;
    this._bodyEl = null;
    this._title = '';
    if (this._kind === 'html') {
      const html = this.createElement('html');
      const head = this.createElement('head');
      const body = this.createElement('body');
      html.appendChild(head);
      html.appendChild(body);
      this.appendChild(html);
      this._docEl = html; this._headEl = head; this._bodyEl = body;
    }
  }
  get ownerDocument() { return null; }
  get contentType() { return this._contentType || (this._kind === 'html' ? "text/html" : "application/xml"); }
  get _isHTMLDoc() { return this._kind === 'html'; }
  get compatMode() { return this._compatMode || "CSS1Compat"; }
  get characterSet() { return "UTF-8"; }
  get charset() { return this.characterSet; }        // legacy alias of characterSet
  get inputEncoding() { return this.characterSet; }  // legacy alias of characterSet
  get title() { const t = this.querySelector('title'); return t ? t.textContent : (this._title || ""); }
  set title(v) { this._title = String(v); }
  get URL() { return "about:blank"; }
  get documentURI() { return "about:blank"; }
  get defaultView() { return null; }
  get location() { return null; }
  get doctype() {
    // Live: reflect the actual doctype child rather than a value cached at
    // construction — the WPT Range tests append/move a doctype after the fact.
    for (let c = this.firstChild; c; c = c.nextSibling) if (c.nodeType === 10) return c;
    return null;
  }
  get implementation() { return globalThis.document.implementation; }
  // §clone a node (document): a new document of the same kind carrying the same
  // encoding/content type/URL/mode; children are copied only for a deep clone.
  cloneNode(deep) {
    const copy = new DetachedDocument(this._kind);
    // A clone starts empty — drop the kind-'html' auto-built <html><head><body>.
    for (let c = copy.firstChild; c; ) { const n = c.nextSibling; copy.removeChild(c); c = n; }
    copy._contentType = this._contentType;
    copy._compatMode  = this._compatMode;
    copy._createMode  = this._createMode;
    copy._title       = this._title;
    if (deep) for (const k of this.childNodes) {
      const c = (k && k.cloneNode) ? k.cloneNode(true) : null;
      if (c) copy.appendChild(c);
    }
    return copy;
  }
  // Live getters: a DetachedDocument's tree can be mutated after construction
  // (the WPT range harness does `removeChild(documentElement)` then appends a
  // cloned root), so these must reflect the CURRENT children rather than the
  // nodes cached at construction. _docEl/_headEl/_bodyEl remain only as build-
  // time scaffolding.
  get documentElement() {
    const kids = this.childNodes;
    for (let i = 0; i < kids.length; i++) if (kids[i] && kids[i].nodeType === 1) return kids[i];
    return null;
  }
  get head() { return this._kind === 'html' ? this.querySelector('head') : null; }
  get body() { return this._kind === 'html' ? this.querySelector('body') : null; }
  querySelector(s) { _primeTarget(s, this); return _qsOne(_dom("query_selector_scoped", this._nid, s), s); }
  querySelectorAll(s) {
    _primeTarget(s, this);
    const ids = _qsIds(_dom("query_selector_all_scoped", this._nid, s), s);
    return _makeNodeList(ids.map(_wrapEl).filter(Boolean));
  }
  getElementById(id) { return this.querySelector('#' + String(id).replace(/["\\]/g, '\\$&')); }
  // getElementsByTagName/NS/ClassName inherited from Document (live HTMLCollections).
  // Factories: create real nodes via the main document's ops, then tag this doc
  // as their owner.
  createElement(t) {
    // XML/XHTML documents create elements case-sensitively: localName === tagName ===
    // the given name (no ASCII-lowercasing), prefix null, namespace null (XML) or the
    // HTML namespace (XHTML). HTML documents keep the inherited (lowercasing) path.
    if (this._createMode && this._createMode !== 'html') {
      return this._createElementXML(t, this._createMode === 'xhtml' ? "http://www.w3.org/1999/xhtml" : null);
    }
    const n = super.createElement(t); if (n) n._ownerDoc = this; return n;
  }
  _createElementXML(t, ns) {
    const name = (t === undefined) ? "undefined" : String(t);
    if (!_isValidElementName(name)) {
      throw new DOMException("The string '" + name + "' is not a valid element name.", "InvalidCharacterError");
    }
    const el = _wrapEl(+_dom("create_element", name));
    if (el) {
      // Pin the case-sensitive identity directly on the wrapper, shadowing the
      // ASCII-casing prototype getters used for HTML elements.
      Object.defineProperty(el, 'localName',    { value: name, configurable: true });
      Object.defineProperty(el, 'tagName',      { value: name, configurable: true });
      Object.defineProperty(el, 'prefix',       { value: null, configurable: true });
      Object.defineProperty(el, 'namespaceURI', { value: ns,   configurable: true });
      el._ownerDoc = this;
    }
    return el;
  }
  createElementNS(ns, t) { const n = super.createElementNS(ns, t); if (n) n._ownerDoc = this; return n; }
  createTextNode(t) { const n = super.createTextNode(t); n._ownerDoc = this; return n; }
  createComment(t) { const n = super.createComment(t); n._ownerDoc = this; return n; }
  createDocumentFragment() { const n = super.createDocumentFragment(); n._ownerDoc = this; return n; }
  createProcessingInstruction(target, data) { const n = _createPIValidated(target, data); n._ownerDoc = this; return n; }
  createCDATASection(data) {
    if (this._kind === 'html')
      throw new DOMException("This operation is not supported for HTML documents.", "NotSupportedError");
    const n = _makeCDATA(data); n._ownerDoc = this; return n;
  }
}

const _cache = new Map();
// Map an HTML element's canonical lowercase tag to its interface class. Distinct
// interfaces resolve to their class; recognized-but-generic tags to HTMLElement;
// anything unrecognized (or non-lowercase, via createElementNS) to
// HTMLUnknownElement. Classes are looked up on globalThis at call time so this is
// independent of definition order.
const _KNOWN_HTML_TAGS = new Set(('a abbr address area article aside audio b base bdi bdo blockquote body br ' +
  'button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed ' +
  'fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins ' +
  'kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p ' +
  'param picture pre progress q rp rt ruby s samp script section select slot small source span strong style ' +
  'sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr').split(' '));
// Canonical HTML tag → interface-object name (HTML spec element index). Tags not
// listed but recognized (in _KNOWN_HTML_TAGS) use the generic HTMLElement; any
// other name → HTMLUnknownElement. Interface objects resolve on globalThis at
// call time, so this stays independent of the definition-order block far below.
const _HTML_IFACE_BY_TAG = {
  a:'HTMLAnchorElement', area:'HTMLAreaElement', audio:'HTMLAudioElement',
  base:'HTMLBaseElement', blockquote:'HTMLQuoteElement', q:'HTMLQuoteElement',
  body:'HTMLBodyElement', br:'HTMLBRElement', button:'HTMLButtonElement',
  canvas:'HTMLCanvasElement', caption:'HTMLTableCaptionElement',
  col:'HTMLTableColElement', colgroup:'HTMLTableColElement', data:'HTMLDataElement',
  datalist:'HTMLDataListElement', del:'HTMLModElement', ins:'HTMLModElement',
  details:'HTMLDetailsElement', dialog:'HTMLDialogElement', dir:'HTMLDirectoryElement',
  div:'HTMLDivElement', dl:'HTMLDListElement', embed:'HTMLEmbedElement',
  fieldset:'HTMLFieldSetElement', font:'HTMLFontElement', form:'HTMLFormElement',
  frame:'HTMLFrameElement', frameset:'HTMLFrameSetElement', h1:'HTMLHeadingElement',
  h2:'HTMLHeadingElement', h3:'HTMLHeadingElement', h4:'HTMLHeadingElement',
  h5:'HTMLHeadingElement', h6:'HTMLHeadingElement', head:'HTMLHeadElement',
  hr:'HTMLHRElement', html:'HTMLHtmlElement', iframe:'HTMLIFrameElement',
  img:'HTMLImageElement', input:'HTMLInputElement', label:'HTMLLabelElement',
  legend:'HTMLLegendElement', li:'HTMLLIElement', link:'HTMLLinkElement',
  listing:'HTMLPreElement', map:'HTMLMapElement', marquee:'HTMLMarqueeElement',
  menu:'HTMLMenuElement', meta:'HTMLMetaElement', meter:'HTMLMeterElement',
  object:'HTMLObjectElement', ol:'HTMLOListElement', optgroup:'HTMLOptGroupElement',
  option:'HTMLOptionElement', output:'HTMLOutputElement', p:'HTMLParagraphElement',
  param:'HTMLParamElement', picture:'HTMLPictureElement', pre:'HTMLPreElement',
  progress:'HTMLProgressElement', script:'HTMLScriptElement', select:'HTMLSelectElement',
  slot:'HTMLSlotElement', source:'HTMLSourceElement', span:'HTMLSpanElement',
  style:'HTMLStyleElement', table:'HTMLTableElement', tbody:'HTMLTableSectionElement',
  td:'HTMLTableCellElement', template:'HTMLTemplateElement', textarea:'HTMLTextAreaElement',
  tfoot:'HTMLTableSectionElement', th:'HTMLTableCellElement', thead:'HTMLTableSectionElement',
  time:'HTMLTimeElement', title:'HTMLTitleElement', tr:'HTMLTableRowElement',
  track:'HTMLTrackElement', ul:'HTMLUListElement', video:'HTMLVideoElement',
  xmp:'HTMLPreElement',
};
const _htmlClassForLocal = function(local) {
  const ifaceName = _HTML_IFACE_BY_TAG[local];
  if (ifaceName) return globalThis[ifaceName] || globalThis.HTMLElement;
  return _KNOWN_HTML_TAGS.has(local) ? globalThis.HTMLElement : globalThis.HTMLUnknownElement;
};
// Default wrap path (parsed elements + createElement): elements are HTML, so map
// by their canonical (lowercased) tag name.
const _elementClassFor = function(nid) {
  const tag = _domParse("tag_name", nid);
  return tag ? _htmlClassForLocal(_asciiLower(tag)) : (globalThis.HTMLElement || Element);
};
const _wrap = function(nid) {
  if (nid < 0 || nid === null || nid === undefined || isNaN(nid)) return null;
  if (_cache.has(nid)) return _cache.get(nid);
  const t = +_dom("node_type", nid);
  let n;
  if (t === 1) { const C = _elementClassFor(nid); n = new C(nid); }
  else if (t === 3) n = new Text(nid);
  else if (t === 8) n = new Comment(nid);
  else if (t === 9) n = new Document(nid);
  else if (t === 10) {
    // DocumentType: its constructor seeds the cache itself, so return directly.
    const info = _domParse("document_doctype");
    return new DocumentType(nid, _domParse("node_name", nid) || (info && info.name) || "",
                            (info && info.publicId) || "", (info && info.systemId) || "");
  }
  else n = new Node(nid);
  _cache.set(nid, n);
  return n;
};
const _wrapEl = function(nid) {
  if (nid < 0 || nid === null || nid === undefined || isNaN(nid)) return null;
  if (_cache.has(nid)) return _cache.get(nid);
  const C = _elementClassFor(nid);
  const n = new C(nid);
  _cache.set(nid, n);
  return n;
};

// _wrap / _cache are module-local (declared above); no need to expose them on
// the page's window — page scripts can neither see nor clobber them.
globalThis.self = globalThis;

globalThis.document = null;
const _resolveUrl = function(url) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('about:')) return url;
  try { return new URL(url, _domParse("document_url") || "about:blank").href; } catch(e) { return url; }
};
globalThis.location = {
  get href() { return _domParse("document_url") ?? "about:blank"; },
  set href(url) { Deno.core.ops.op_navigate(_resolveUrl(url), 'GET', ''); },
  get origin() { try { return new URL(this.href).origin; } catch { return ""; } },
  get protocol() { try { return new URL(this.href).protocol; } catch { return ""; } },
  get host() { try { return new URL(this.href).host; } catch { return ""; } },
  get hostname() { try { return new URL(this.href).hostname; } catch { return ""; } },
  get pathname() { try { return new URL(this.href).pathname; } catch { return "/"; } },
  get search() { try { return new URL(this.href).search; } catch { return ""; } },
  get hash() { try { return new URL(this.href).hash; } catch { return ""; } },
  get port() { try { return new URL(this.href).port; } catch { return ""; } },
  toString() { return this.href; },
  assign(url) { Deno.core.ops.op_navigate(_resolveUrl(url), 'GET', ''); },
  reload() {},
  replace(url) { Deno.core.ops.op_navigate(_resolveUrl(url), 'GET', ''); },
};
const _locationObj = globalThis.location;
Object.defineProperty(globalThis, 'location', {
  get() { return _locationObj; },
  set(url) { Deno.core.ops.op_navigate(_resolveUrl(String(url)), 'GET', ''); },
  configurable: false,
  enumerable: true,
});

globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.top = globalThis;
globalThis.parent = globalThis;
globalThis.frames = globalThis;
globalThis.frameElement = null;
globalThis.length = 0;

// HTML spec exposes on* event handler IDL attributes on Window. Libraries like
// jQuery feature-detect bubbling via `("on" + ev) in window` and fall back to
// a legacy IE path that crashes on missing DOM APIs when the check returns
// false. Initialising them to null makes the check match real browsers.
for (const _ev of [
  "abort","beforeprint","beforeunload","blur","cancel","canplay","canplaythrough",
  "change","click","close","contextmenu","cuechange","dblclick","drag","dragend",
  "dragenter","dragleave","dragover","dragstart","drop","durationchange","emptied",
  "ended","error","focus","focusin","focusout","formdata","gotpointercapture",
  "hashchange","input","invalid","keydown","keypress","keyup","languagechange",
  "load","loadeddata","loadedmetadata","loadstart","lostpointercapture","message",
  "mousedown","mouseenter","mouseleave","mousemove","mouseout","mouseover","mouseup",
  "offline","online","pagehide","pageshow","paste","pause","play","playing",
  "pointercancel","pointerdown","pointerenter","pointerleave","pointermove",
  "pointerout","pointerover","pointerup","popstate","progress","ratechange",
  "rejectionhandled","reset","resize","scroll","seeked","seeking","select",
  "stalled","storage","submit","suspend","timeupdate","toggle","unhandledrejection",
  "unload","volumechange","waiting","wheel",
]) {
  if (!(("on" + _ev) in globalThis)) globalThis["on" + _ev] = null;
}

globalThis.Window = globalThis.Window || function Window() {};
Object.defineProperty(globalThis.Window, Symbol.hasInstance, {
  value(obj) { return obj === globalThis || (obj && obj.window === obj); },
  configurable: true,
});


// Child browsing contexts. Per HTML, `window.frames === window`, and `window[i]`
// / `window.length` reflect the <iframe> elements in the document. We compute
// these live from the tree so EVERY creation path works (markup, innerHTML,
// createElement+append, or src assignment) — not just `el.src = "..."`.
const _frameWindowAt = function(i) {
  let list;
  try { list = document.querySelectorAll('iframe'); } catch (e) { return undefined; }
  const el = list && list[i];
  return el ? el.contentWindow : undefined;
};
Object.defineProperty(globalThis, 'length', {
  get() { try { return document.querySelectorAll('iframe').length; } catch (e) { return 0; } },
  configurable: true,
});
// window[0..N] index into the child frames. A fixed window of getters covers the
// realistic case (pages essentially never exceed this many frames).
for (let _i = 0; _i < 64; _i++) {
  Object.defineProperty(globalThis, _i, {
    get() { return _frameWindowAt(_i); },
    configurable: true,
    enumerable: false,
  });
}
// Registration is now live; this just back-links frameElement for any caller.
const _registerIframe = function(iframeEl) {
  if (iframeEl && iframeEl._iframeWin) iframeEl._iframeWin.frameElement = iframeEl;
};

// ---- Event-listener core keyed by an arbitrary registry key (iframe inc 4 step 2) ----
// Mirrors the Element addEventListener/removeEventListener/dispatchEvent logic
// (capture/once/passive, boolean-or-options, spec dedupe, handleEvent objects,
// dispatch snapshot) but keyed by an explicit value instead of `this._nid`, so
// synthetic targets that have no node id — the iframe document and window — can
// reuse the same spec-correct behavior. Elements keep their own _nid-keyed copy.
let _syntheticKeyCounter = 0;
const _nextSyntheticKey = function() { return 'syn:' + (++_syntheticKeyCounter); };
const _addListenerByKey = function(key, type, handler, opts) {
  // §"flatten more" — read capture/once/passive (may be getters) BEFORE the
  // null-callback check, and treat a non-dictionary options value as the capture
  // boolean (so e.g. addEventListener(t, fn, 2.3) captures).
  const o = (typeof opts === 'object' && opts !== null) ? opts : { capture: !!opts };
  const cap = !!o.capture, once = !!o.once, passive = !!o.passive;
  if (handler == null) return; // a null callback is ignored (after flattening)
  if (!_eventRegistry[key]) _eventRegistry[key] = {};
  if (!_eventRegistry[key][type]) _eventRegistry[key][type] = [];
  const list = _eventRegistry[key][type];
  if (list.some(e => e.handler === handler && e.capture === cap)) return;
  list.push({ handler, capture: cap, once, passive });
};
const _removeListenerByKey = function(key, type, handler, opts) {
  const cap = !!((typeof opts === 'object' && opts !== null) ? opts.capture : opts);
  if (_eventRegistry[key] && _eventRegistry[key][type]) {
    _eventRegistry[key][type] =
      _eventRegistry[key][type].filter(e => !(e.handler === handler && e.capture === cap));
  }
};
// ---- Unified spec-compliant event dispatch (DOM §2.9) ----
// Every EventTarget — element/text node, Document, the window, and synthetic
// iframe window/document targets — stores listeners in the one _eventRegistry,
// keyed below, and dispatches through the same capturing/target/bubbling path.
//
// Registry key for any EventTarget: the window, a node (by _nid), or any other
// target by a lazily-assigned synthetic _evtKey.
const _evtRegKey = function(t) {
  if (t === globalThis) return 'window';
  if (t && typeof t._nid === 'number') return t._nid;
  if (t && t._evtKey) return t._evtKey;
  if (t) {
    const k = _nextSyntheticKey();
    try { Object.defineProperty(t, '_evtKey', { value: k, enumerable: false, configurable: true }); }
    catch (e) { t._evtKey = k; }
    return k;
  }
  return null;
};
// The parent in the event-propagation tree: a node's parentNode, a document's
// browsing-context window (defaultView), and nothing above a window.
const _eventParent = function(node) {
  if (!node || node === globalThis) return null;
  if (node.nodeType === 9) return node.defaultView || null;
  if (typeof node.nodeType !== 'number') return null; // window-like target
  return node.parentNode || null;
};
// DOM §2.9 "inner invoke" for one struct of the event path: run the target's
// listeners that match the current phase, honoring once / stopImmediatePropagation
// and re-checking removal against the live list.
const _invokeListeners = function(target, event, phase) {
  // §2.9 invoke step: if propagation was stopped, this struct is skipped entirely.
  if (event._propagationStopped) return;
  event.currentTarget = target;
  const key = _evtRegKey(target);
  const reg = _eventRegistry[key];
  if (!reg) return;
  const listeners = (reg[event.type] || []).slice();
  for (const e of listeners) {
    if (event._immediatePropagationStopped) break;
    const live = (_eventRegistry[key] || {})[event.type];
    if (!live || live.indexOf(e) === -1) continue; // removed since the snapshot
    if (phase === 'capturing' && !e.capture) continue;
    if (phase === 'bubbling' && e.capture) continue;
    if (e.once) _removeListenerByKey(key, event.type, e.handler, { capture: e.capture });
    const h = e.handler;
    try {
      if (typeof h === 'function') {
        h.call(target, event);
      } else {
        const he = h && h.handleEvent;
        if (typeof he !== 'function')
          throw new TypeError("Failed to invoke event listener: 'handleEvent' is not a function");
        he.call(h, event);
      }
    } catch (err) { _reportError(err); }
  }
};
// DOM §2.9 dispatch: build the propagation path (target -> ancestors -> document
// -> window), then run the capturing pass (root..target), then the bubbling pass
// (target..root). Returns false iff the event was canceled. The stop-propagation
// and canceled flags are NOT reset here (the constructor / initEvent own that), so
// an event whose propagation was stopped before dispatch invokes no listeners.
const _dispatchSpec = function(target, event, fromPublic) {
  // WebIDL: dispatchEvent's argument is a non-nullable Event.
  if (!(event instanceof Event))
    throw new TypeError("Failed to execute 'dispatchEvent': parameter 1 is not of type 'Event'.");
  // §2.8 dispatchEvent step 1: in-flight or uninitialized events cannot be dispatched.
  if (event._dispatchFlag || event._initialized === false)
    throw new DOMException("The event is already being dispatched, or has not been initialized.", "InvalidStateError");
  // §2.8 step 2: a public dispatchEvent makes the event untrusted — AFTER the
  // state check above, so a throwing re-dispatch leaves isTrusted intact.
  if (fromPublic) event._isTrusted = false;
  event._dispatchFlag = true;
  if (!event.target) event.target = target;
  // Legacy window.event: reflects the event currently being dispatched (some
  // scripts read the global `event` instead of the listener parameter).
  const _prevWindowEvent = globalThis.event;
  try { globalThis.event = event; } catch (e) {}

  const path = [];
  for (let n = target; n; n = _eventParent(n)) path.push(n);
  event._composedPath = path;

  // Capturing pass: root -> target (inclusive). The target struct is AT_TARGET.
  for (let i = path.length - 1; i >= 0; i--) {
    const item = path[i];
    event.eventPhase = (item === target) ? 2 : 1;
    _invokeListeners(item, event, 'capturing');
  }
  // Bubbling pass: target -> root. Non-target structs only when the event bubbles.
  for (let i = 0; i < path.length; i++) {
    const item = path[i];
    if (item === target) event.eventPhase = 2;
    else if (event.bubbles) event.eventPhase = 3;
    else continue;
    _invokeListeners(item, event, 'bubbling');
  }

  // §2.9 clean-up: clear the stop-propagation flags so the event can be dispatched
  // again (the canceled / defaultPrevented flag intentionally persists).
  event.eventPhase = 0;
  event.currentTarget = null;
  event._composedPath = null;
  event._propagationStopped = false;
  event._immediatePropagationStopped = false;
  event._dispatchFlag = false;
  try { globalThis.event = _prevWindowEvent; } catch (e) {}
  return !event.defaultPrevented;
};
// The public EventTarget.dispatchEvent: §2.8 sets isTrusted to false, then runs
// the dispatch algorithm. UA-originated events (a frame's load, DOMContentLoaded)
// instead call _dispatchSpec directly so their trusted flag survives.
const _dispatchPublic = function(target, event) {
  return _dispatchSpec(target, event, true);
};
const _addListener = function(target, type, handler, opts) {
  _addListenerByKey(_evtRegKey(target), String(type), handler, opts);
};
const _removeListener = function(target, type, handler, opts) {
  _removeListenerByKey(_evtRegKey(target), String(type), handler, opts);
};

// ---- Same-origin iframe script execution (iframe increment 4, Option C) ----
// We have ONE V8 context per page (deno_core 0.350 removed the public realm API),
// so a frame is not a true separate realm. Instead we run each frame <script> by
// compiling it with new Function() and shadowing the frame's globals as params —
// the script sees its OWN window/document/location/parent/top. NOT real isolation
// (shared intrinsics; bare globals like setTimeout and undeclared assignments still
// resolve to the top window), but enough for same-origin frame scripts to drive
// their own document. Classic scripts stay sloppy-mode to match real semantics.
// Report an error raised by an iframe's own script. In a real browser such an
// error fires the FRAME window's `error` event, NOT the parent's — so it must
// not reach the host page's global error handlers (e.g. testharness's window
// 'error' listener, which would otherwise flag the whole harness as Errored even
// though every subtest ran). We dispatch to the frame window's own listeners and
// log; we deliberately do not touch globalThis or win.onerror (the latter would
// fall through to the parent's onerror via the _IframeWindow proxy).
const _reportFrameError = function(err, win) {
  try { console.error(err); } catch (e) {}
  if (!win || typeof win.dispatchEvent !== 'function') return;
  let ev;
  try {
    ev = (typeof ErrorEvent === 'function')
      ? new ErrorEvent('error', { error: err, message: (err && err.message) || String(err), cancelable: true })
      : null;
  } catch (e) { ev = null; }
  if (!ev) ev = { type: 'error', error: err, message: (err && err.message) || String(err),
                  defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  try { win.dispatchEvent(ev); } catch (e) {}
};

const _runFrameScript = function(code, win, url) {
  if (!code || !win) return;
  try {
    const fn = new Function(
      'window', 'self', 'document', 'location', 'parent', 'top', 'frames',
      'frameElement', 'globalThis',
      code + '\n//# sourceURL=' + (url || 'about:blank-frame')
    );
    fn.call(win, win, win, win.document, win.location, win.parent, win.top,
            win.frames, win.frameElement, win);
  } catch (e) {
    _reportFrameError(e, win);
  }
};

// Best-effort scan of a script's TOP-LEVEL declarations (function/var/let/const/
// class) at line starts. Covers the WPT pattern of one declaration per line; not
// a parser, so it can miss comma-list `var a, b` tails (harmless: those stay
// frame-local, which is all the frame's own code needs — only names the PARENT
// reads off contentWindow, like run()/setupRangeTests, must be hoisted).
const _scanTopLevelDecls = function(code) {
  const names = new Set();
  const re = /(?:^|\n)[ \t]*(?:async[ \t]+)?(?:function[ \t]*\*?|var|let|const|class)[ \t]+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(code))) names.add(m[1]);
  return names;
};

// Run a frame's classic scripts as ONE concatenated program so they share a
// single variable environment — exactly like a real frame's scripts sharing one
// global. Then attach each top-level declaration to the frame window, so the
// parent realm can reach `iframe.contentWindow.run()` / `.setupRangeTests` etc.
// (Under Option C, top-level decls in a `new Function` body are function-locals
// that never touch the window — this hoist is what bridges that gap.) Reads of
// those names from within the frame resolve through the shared scope, and direct
// `eval()` inside the frame's functions still sees the frame's variables (the WPT
// range/traversal iframes rely on `eval(window.testRangeInput)`).
const _runFrameProgram = function(parts, win, baseUrl) {
  if (!parts || !parts.length || !win) return;
  const names = new Set();
  let body = '';
  for (const p of parts) {
    body += '\n' + (p.code || '') + '\n//# sourceURL=' + (p.url || baseUrl || 'about:blank-frame') + '\n';
    for (const n of _scanTopLevelDecls(p.code || '')) names.add(n);
  }
  let tail = '';
  for (const n of names) tail += 'try{window[' + JSON.stringify(n) + ']=' + n + ';}catch(__e){}';
  try {
    // Wrap the body in try/finally: even if a frame script throws part-way, the
    // top-level declarations (function declarations are hoisted to the top of the
    // wrapper) are still attached to the frame window. The parent realm drives the
    // frame through contentWindow.run()/setupRangeTests(), so dropping those on a
    // mid-script throw would silently break the entire frame.
    const fn = new Function(
      'window', 'self', 'document', 'location', 'parent', 'top', 'frames',
      'frameElement', 'globalThis',
      'try {\n' + body + '\n} finally {\n' + tail + '\n}'
    );
    fn.call(win, win, win, win.document, win.location, win.parent, win.top,
            win.frames, win.frameElement, win);
  } catch (e) {
    _reportFrameError(e, win);
  }
};

// Run all <script>s in a freshly-built frame document, in document order. Inline
// scripts run synchronously; same-origin <script src> is fetched then run. Skips
// module scripts (increment 4 step 4) and non-JS types. Idempotent per frame.
// Returns a promise that resolves once every script has run, so callers can fire
// the frame's `load` after scripts (matching browser ordering).
const _executeFrameScripts = async function(iframeEl) {
  if (!iframeEl || iframeEl._frameScriptsRan) return;
  const win = iframeEl._iframeWin, doc = iframeEl._iframeDoc;
  if (!win || !doc) return;
  iframeEl._frameScriptsRan = true;
  const base = doc._baseUrl || doc._url || win._url; // relative <script src> base
  let scripts = [];
  try { scripts = Array.from(doc.querySelectorAll('script')); } catch (e) {}
  // Classic scripts are collected and run as ONE concatenated program (shared
  // frame scope); modules run individually (best-effort), flushing any pending
  // classic parts first so execution order is preserved.
  const parts = [];
  for (const s of scripts) {
    const type = (s.getAttribute('type') || '').toLowerCase();
    const isModule = type === 'module';
    if (type && type !== 'text/javascript' && type !== 'application/javascript' && !isModule) {
      continue; // non-JS type (application/json, importmap, speculationrules, ...)
    }
    const src = s.getAttribute('src');
    if (isModule) {
      if (parts.length) _runFrameProgram(parts.splice(0), win, base);
      // Faithful ES module execution needs a per-frame realm + module map to bind
      // `import`/`export` and a frame-scoped `document` — unavailable under Option C
      // (one page realm; new Function can't host import/export). Best effort: run an
      // INLINE module with no static import/export as strict-mode code against the
      // frame window; skip (with a clear warning, never a silent no-op) a module
      // that has a src or top-level import/export.
      const code = s.textContent || '';
      if (src || /(^|[\n;{}])\s*(?:import|export)\b/.test(code)) {
        console.warn('[obscura] iframe <script type=module> with src or import/export is not supported (no per-frame realm): ' + (src || 'inline'));
        continue;
      }
      _runFrameScript('"use strict";\n' + code, win, base);
      continue;
    }
    if (src) {
      let full = src;
      try { full = new URL(src, base).href; } catch (e) {}
      try {
        const resp = await fetch(full, { mode: 'no-cors' });
        if (resp.ok || resp.type === 'opaque') {
          parts.push({ code: await resp.text(), url: full });
        }
      } catch (e) { _reportError(e); }
    } else {
      parts.push({ code: s.textContent || '', url: base });
    }
  }
  if (parts.length) _runFrameProgram(parts, win, base);
  // Frame lifecycle: DOMContentLoaded fires at the frame document and bubbles to
  // the frame window (real Document -> Window path); then `load` fires at the
  // frame window. Both reach document.addEventListener / window.addEventListener
  // inside the frame now that those are real (increment 4 step 2).
  try {
    doc.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
    if (typeof win.onload === 'function') { try { win.onload(new Event('load')); } catch (e) {} }
    win.dispatchEvent(new Event('load'));
  } catch (e) {}
};

// Fire the `load` event on the iframe ELEMENT (the parent-side event, distinct
// from the frame window's load). Per spec it's a trusted, non-bubbling,
// non-cancelable Event targeted at the iframe element. Guarded so one load fires
// at most once per load pass (reset by _loadIframeSrc / src reassignment).
const _fireIframeElementLoad = function(el) {
  if (!el || el._loadEventFired) return;
  el._loadEventFired = true;
  const ev = new Event('load'); // bubbles=false, cancelable=false
  ev.isTrusted = true; // UA-originated load event
  ev.target = el;
  // Dispatch directly (not the public dispatchEvent, which would clear isTrusted).
  try { _dispatchSpec(el, ev); } catch (e) {}
  if (typeof el.onload === 'function') { try { el.onload(ev); } catch (e) {} }
  else { const a = el.getAttribute && el.getAttribute('onload'); if (a) { try { (0, eval)(a); } catch (e) {} } }
};

// Fire a trusted `error` event on an element whose subresource failed to load.
const _fireElementError = function(el) {
  if (!el || el._loadEventFired) return;
  el._loadEventFired = true;
  const ev = new Event('error'); // bubbles=false, cancelable=false
  ev.isTrusted = true;
  ev.target = el;
  try { _dispatchSpec(el, ev); } catch (e) {}
  if (typeof el.onerror === 'function') { try { el.onerror(ev); } catch (e) {} }
  else { const a = el.getAttribute && el.getAttribute('onerror'); if (a) { try { (0, eval)(a); } catch (e) {} } }
};

// Load a subresource referenced by an element (<img src>, <link href>,
// <script src>, <object data>): fetch the bytes, record a
// PerformanceResourceTiming entry on the timeline, then fire the element's
// `load` (or `error`) event. `initiatorType` is the Resource Timing value for
// the element ("img"/"link"/"script"/"object"). For scripts, the fetched body
// is executed before the load event. Each call bumps a per-element generation
// token so a superseding src/href reassignment doesn't fire a stale event.
// The MIME "essence" (type/subtype, parameters stripped, lowercased) of a
// response's Content-Type header, for PerformanceResourceTiming.contentType.
// `headers` is the lowercased-key map from op_fetch_url.
const _mimeEssence = function(headers) {
  if (!headers) return "";
  const ct = headers['content-type'] || headers['Content-Type'] || "";
  return String(ct).split(';')[0].trim().toLowerCase();
};
// contentType is exposed only when the resource is same-origin with the document
// (a TAO opt-in would also qualify cross-origin, but we don't read TAO yet).
const _entryContentType = function(resourceUrl, headers, pageOrigin) {
  try { if (new URL(resourceUrl).origin === pageOrigin) return _mimeEssence(headers); } catch (e) {}
  return "";
};

const _loadElementResource = function(el, url, initiatorType, opts) {
  opts = opts || {};
  if (!el || !url) return;
  let fullUrl = url;
  // Resolve relative URLs against the document base (absolute URLs untouched).
  if (!/^[a-z][a-z0-9+.\-]*:/i.test(url)) {
    try { fullUrl = new URL(url, _domParse("document_url") || "about:blank").href; } catch (e) {}
  }
  const gen = (el._resLoadGen = (el._resLoadGen || 0) + 1);
  el._loadEventFired = false;
  const start = (globalThis.performance && performance.now) ? performance.now() : 0;
  const pageOrigin = (function () { try { return new URL(_domParse("document_url") || "about:blank").origin; } catch (e) { return ""; } })();
  // A crossorigin element (`img.crossOrigin = "anonymous"` etc.) makes a CORS
  // request; the response is then non-opaque when the access-control check passes,
  // which exposes contentType (Resource Timing) even cross-origin.
  const _useCors = !!(el && (el.crossOrigin === 'anonymous' || el.crossOrigin === 'use-credentials'));
  (async () => {
    try {
      const raw = await Deno.core.ops.op_fetch_url(fullUrl, "GET", "{}", "", pageOrigin, _useCors ? "cors" : "no-cors");
      if (el._resLoadGen !== gen) return; // superseded by a newer load
      const parsed = JSON.parse(raw);
      // Hard network failure (blocked / CORS) → no entry, fire error.
      if (parsed.blocked || parsed.corsBlocked) { _fireElementError(el); return; }
      // We got an HTTP response (any status): record a resource entry with the
      // honest body size from the response, then fire load (2xx/3xx) or error.
      const status = parsed.status || 0;
      try {
        if (globalThis.performance && performance._addResourceEntry) {
          const body = parsed.bodyBase64 ? _base64ToUint8Array(parsed.bodyBase64) : (parsed.body || "");
          const sz = (body && (body.byteLength != null ? body.byteLength : body.length)) || 0;
          // Non-opaque response → expose contentType: same-origin, or a CORS
          // request that passed (we only reach here when not corsBlocked).
          let _ct = "";
          try { if (_useCors || new URL(parsed.url || fullUrl).origin === pageOrigin) _ct = _mimeEssence(parsed.headers); } catch (e) {}
          performance._addResourceEntry(parsed.url || fullUrl, initiatorType, start, performance.now(), { enc: sz, dec: sz, status: status, contentType: _ct });
        }
      } catch (e) {}
      if (opts.eval && parsed.body) {
        try { (0, eval)(parsed.body); } catch (e) { console.error('Dynamic script error (' + fullUrl + '):', e.message); }
      }
      if (status === 0 || status >= 400) _fireElementError(el);
      else _fireIframeElementLoad(el);
    } catch (e) {
      if (el._resLoadGen !== gen) return;
      _fireElementError(el);
    }
  })();
};

// Begin loading a non-iframe subresource element when it becomes connected
// (<link rel=stylesheet/preload/...>, <object data>). <img>/<script> load on
// src assignment / appendChild respectively, so they are handled elsewhere.
const _connectResourceElement = function(el) {
  if (!el || !(el instanceof Element) || el._resConnected) return;
  const ln = el.localName;
  if (ln === 'link') {
    const rel = String(el.getAttribute('rel') || el.rel || '').toLowerCase();
    const href = el.getAttribute('href');
    // Resource-fetching link relations report initiatorType "link", except
    // modulepreload (a module graph fetch) which reports "other".
    if (href && /(^|\s)(stylesheet|preload|prefetch|icon|manifest|modulepreload)(\s|$)/.test(rel)) {
      el._resConnected = true;
      _loadElementResource(el, href, /(^|\s)modulepreload(\s|$)/.test(rel) ? 'other' : 'link');
    }
  } else if (ln === 'object') {
    const data = el.getAttribute('data') || el.data;
    if (data) { el._resConnected = true; _loadElementResource(el, data, 'object'); }
  }
};

// Schedule a deferred element load and return its generation token. Each new load
// (e.g. a src navigation) bumps el._loadGen; a pending deferred load only fires if
// its generation is still current — so the initial about:blank load of a srcless
// frame is correctly SUPERSEDED when `src` is set synchronously afterwards (HTML's
// "the load event must not fire until the load has matured" — see WPT
// content_document_changes_only_after_load_matures).
// Classify a loaded frame document as 'html', 'xhtml' (application/xhtml+xml) or
// 'xml' (text/xml, application/xml, *+xml) from the response content-type, falling
// back to the URL extension. Drives whether _IframeDocument builds an HTML scaffold
// and how its createElement behaves (case-folding + namespace).
const _iframeDocKind = function(url, resp) {
  let ct = '';
  try { ct = String(resp && resp.headers && resp.headers.get('content-type') || '').toLowerCase(); } catch (e) {}
  const path = String(url || '').toLowerCase().split('#')[0].split('?')[0];
  if (ct.indexOf('application/xhtml+xml') !== -1 || path.endsWith('.xhtml')) return 'xhtml';
  if (ct.indexOf('/xml') !== -1 || ct.indexOf('+xml') !== -1 || path.endsWith('.xml')) return 'xml';
  return 'html';
};

const _bumpFrameLoadGen = function(el) { return (el._loadGen = (el._loadGen || 0) + 1); };
const _scheduleFrameElementLoad = function(el) {
  const gen = _bumpFrameLoadGen(el);
  el._loadEventFired = false;
  Promise.resolve().then(() => { if (el._loadGen === gen) _fireIframeElementLoad(el); });
};

// Begin loading a frame when its <iframe> is inserted into the document (HTML's
// "browsing-context connected" hook). Real browsers start loading on insertion,
// not lazily on contentDocument access — so a bare/srcdoc/markup-src frame fires
// its `load` after being appended. Idempotent per element; only when connected.
// Load the frame document per the element's current src/srcdoc attributes
// (HTML "process the iframe attributes": srcdoc takes precedence over src;
// neither → about:blank). Schedules the element load event.
const _loadFrameFromAttributes = function(el) {
  const srcdoc = el.getAttribute('srcdoc');
  const src = el.getAttribute('src');
  if (srcdoc != null) {
    el.contentDocument; // builds the srcdoc doc + runs frame scripts (idempotent)
    _scheduleFrameElementLoad(el);
  } else if (src && src !== 'about:blank' && !src.startsWith('about:')) {
    if (!el._srcLoadStarted) el._loadIframeSrc(src); // fires element load on completion
  } else {
    el.contentDocument; // initial about:blank document
    _scheduleFrameElementLoad(el);
  }
};
const _connectIframe = function(el) {
  if (!el || el.localName !== 'iframe') return;
  if (el._frameConnected || !el.isConnected) return;
  el._frameConnected = true;
  _loadFrameFromAttributes(el);
};
// Begin loading every markup <iframe> already present in the document. Markup
// frames aren't inserted via the JS appendChild hook, so they otherwise only start
// loading lazily on contentDocument access. Driven from the Rust load sequence at
// DOMContentLoaded so frames are fetched (and their fetches counted in-flight)
// BEFORE the parent `load` event fires — a connected iframe delays the load event.
globalThis.__startFrameLoads = function() {
  try {
    const frames = document.querySelectorAll('iframe');
    for (let i = 0; i < frames.length; i++) { try { _connectIframe(frames[i]); } catch (e) {} }
  } catch (e) {}
};
// Begin loading markup subresource elements present in the static document
// (<img src>, <link rel=stylesheet/...>, <object data>) — like markup iframes,
// these are parsed in Rust and never travel through the JS appendChild/setter
// hooks, so they would otherwise emit no Resource Timing entry and never fire a
// load event. Driven from the Rust load sequence at DOMContentLoaded so the
// fetches are counted in-flight before the load event (subresources delay load).
// Markup <script src> is handled separately by page.rs. Idempotent per element.
globalThis.__startResourceLoads = function() {
  try {
    const imgs = document.querySelectorAll('img[src]');
    for (let i = 0; i < imgs.length; i++) {
      const el = imgs[i];
      if (el._resLoadGen) continue; // already loading (e.g. via the src setter)
      const src = el.getAttribute('src');
      if (src) { try { _loadElementResource(el, src, 'img'); } catch (e) {} }
    }
    const others = document.querySelectorAll('link, object');
    for (let i = 0; i < others.length; i++) { try { _connectResourceElement(others[i]); } catch (e) {} }
  } catch (e) {}
};
// Re-run the load process after a src/srcdoc attribute changes on an already-
// processed frame (HTML reprocesses the iframe attributes on mutation). Discards
// the old document + script/load state, then reloads from the current attributes
// and fires a fresh load. The gen guard in _scheduleFrameElementLoad/_loadIframeSrc
// supersedes any still-pending load from the previous document.
const _reprocessIframe = function(el) {
  if (!el || el.localName !== 'iframe') return;
  el._iframeDoc = null; el._iframeWin = null;
  el._frameScriptsRan = false; el._srcLoadStarted = false; el._loadEventFired = false;
  _loadFrameFromAttributes(el);
};

// ---- Named property access on Window (HTML: <el id=foo> -> window.foo) ----
// Real browsers expose an element's id (and certain elements' name) as a global,
// so legacy scripts reach `myframe` directly. We model it with a non-enumerable,
// configurable LIVE getter on globalThis: it stays off Object.keys/for-in (the
// engine-hygiene stance is about hiding internals, not standard web content), it
// NEVER shadows a real global/Web API (spec: named access doesn't override
// existing properties), and assigning to it replaces it with a normal property
// (so `var foo`/`foo = x` still work). _namedGlobals (a lexical Set, itself off
// getOwnPropertyNames) tracks which names we defined so re-scans stay idempotent.
const _namedGlobals = new Set();
const __defineNamedGlobal = function(name) {
  if (!name || typeof name !== 'string') return;
  if (_namedGlobals.has(name)) return;   // already exposed by us
  if (name in globalThis) return;        // don't shadow a real global / Web API
  _namedGlobals.add(name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: false,
    get() { return document.getElementById(name) || null; },
    set(v) {
      _namedGlobals.delete(name);
      Object.defineProperty(globalThis, name, { value: v, writable: true, configurable: true, enumerable: true });
    },
  });
};
// Scan the current document for id'd elements and expose them. Called from Rust
// right before page scripts run (covers markup), and on dynamic id changes.
const __exposeNamedGlobals = function() {
  try {
    const els = document.querySelectorAll('[id]');
    for (let i = 0; i < els.length; i++) {
      const id = els[i].getAttribute && els[i].getAttribute('id');
      if (id) __defineNamedGlobal(id);
    }
  } catch (e) {}
};

// HTML "Window-reflecting body element event handler set" + the body/frameset
// window event handlers: an on* content attribute on <body> (or <frameset>) is
// an event handler for the WINDOW, not the element (e.g. `<body onload=...>` ===
// `window.onload`). We compile each such attribute and install it as
// window.on<name>. This runs before parser-discovered scripts execute, so a
// later `window.onload = fn` in a page script overrides it (the safe ordering).
// The <load-event> step then invokes window.onload. `onerror` is intentionally
// excluded to preserve the engine's default window.onerror reporting bridge.
const _BODY_WINDOW_HANDLERS = ['onload', 'onresize', 'onscroll', 'onblur', 'onfocus',
  'onhashchange', 'onlanguagechange', 'onmessage', 'onmessageerror', 'onoffline',
  'ononline', 'onpagehide', 'onpageshow', 'onpopstate', 'onrejectionhandled',
  'onstorage', 'onunhandledrejection', 'onunload', 'onbeforeunload',
  'onafterprint', 'onbeforeprint'];
const __installBodyWindowHandlers = function() {
  try {
    const sources = [];
    if (document.body) sources.push(document.body);
    const root = document.documentElement;
    if (root && root.querySelector) { const fs = root.querySelector('frameset'); if (fs) sources.push(fs); }
    for (const el of sources) {
      if (!el || !el.getAttribute) continue;
      for (const on of _BODY_WINDOW_HANDLERS) {
        const attr = el.getAttribute(on);
        if (attr == null) continue;
        try { globalThis[on] = new Function('event', attr); } catch (e) {}
      }
    }
  } catch (e) {}
};
globalThis.navigator = {
  get userAgent() { return __obscura_ua || "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"; },
  get appVersion() { return this.userAgent.replace('Mozilla/', ''); },
  language: "en-US", languages: ["en-US","en"], platform: "Linux x86_64",
  onLine: true, cookieEnabled: true, hardwareConcurrency: 8,
  maxTouchPoints: 0,
  vendor: "Google Inc.", product: "Gecko", productSub: "20030107",
  doNotTrack: null,
  deviceMemory: 8,
  connection: { effectiveType: "4g", rtt: 50, downlink: 10, saveData: false },
  // A real, non-automated Chrome exposes navigator.webdriver === false (the
  // property is present and false). Returning `undefined` is itself an
  // automation tell — detectors flag `webdriver !== false` / `!('webdriver' in
  // navigator)`. Match real Chrome.
  get webdriver() { return false; },
  pdfViewerEnabled: true,
  get plugins() {
    const p = [
      { name: "PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 },
      { name: "Chrome PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 },
      { name: "Chromium PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 },
      { name: "Microsoft Edge PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 },
      { name: "WebKit built-in PDF", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 },
    ];
    p.item = (i) => p[i] || null;
    p.namedItem = (name) => p.find(x => x.name === name) || null;
    p.refresh = () => {};
    return p;
  },
  get mimeTypes() {
    const m = [
      { type: "application/pdf", description: "Portable Document Format", suffixes: "pdf", enabledPlugin: null },
      { type: "text/pdf", description: "Portable Document Format", suffixes: "pdf", enabledPlugin: null },
    ];
    m.item = (i) => m[i] || null;
    m.namedItem = (name) => m.find(x => x.type === name) || null;
    return m;
  },
  userAgentData: {
    brands: [
      {brand: "Google Chrome", version: "145"},
      {brand: "Chromium", version: "145"},
      {brand: "Not=A?Brand", version: "24"},
    ],
    mobile: false,
    platform: "Linux",
    getHighEntropyValues(hints) {
      return Promise.resolve({
        architecture: "x86",
        bitness: "64",
        brands: [{brand:"Google Chrome",version:"145"},{brand:"Chromium",version:"145"},{brand:"Not=A?Brand",version:"24"}],
        fullVersionList: [{brand:"Google Chrome",version:"145.0.0.0"},{brand:"Chromium",version:"145.0.0.0"},{brand:"Not=A?Brand",version:"24.0.0.0"}],
        mobile: false,
        model: "",
        platform: "Linux",
        platformVersion: "6.8.0",
        uaFullVersion: "145.0.0.0",
      });
    },
    toJSON() { return {brands:this.brands,mobile:this.mobile,platform:this.platform}; },
  },
  serviceWorker: { ready: Promise.resolve(), register(){return Promise.resolve();}, getRegistrations(){return Promise.resolve([]);}, controller: null },
  mediaDevices: {
    enumerateDevices() {
      return Promise.resolve([
        {deviceId:"default",kind:"audioinput",label:"",groupId:"default"},
        {deviceId:"comms",kind:"audioinput",label:"",groupId:"comms"},
        {deviceId:"default",kind:"audiooutput",label:"",groupId:"default"},
        {deviceId:"",kind:"videoinput",label:"",groupId:""},
      ]);
    },
    getUserMedia() { return Promise.reject(new DOMException("NotAllowedError")); },
    getDisplayMedia() { return Promise.reject(new DOMException("NotAllowedError")); },
    addEventListener(){}, removeEventListener(){},
  },
  clipboard: { writeText(){return Promise.resolve();}, readText(){return Promise.resolve("");} },
  permissions: { query(params){
    if (params?.name === 'notifications') return Promise.resolve({state:"prompt",onchange:null});
    return Promise.resolve({state:"granted"});
  } },
  getBattery() { return Promise.resolve({ charging: _fp('batteryCharging'), chargingTime: _fp('batteryCharging') ? 0 : Infinity, dischargingTime: _fp('batteryCharging') ? Infinity : Math.floor(3600 + _fpRand(250) * 7200), level: _fp('batteryLevel'), addEventListener(){} }); },
  getGamepads() { return []; },
  sendBeacon() { return true; },
  javaEnabled() { return false; },
};

globalThis.chrome = {
  app: { isInstalled: false, InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" }, RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" } },
  runtime: { OnInstalledReason: {}, OnRestartRequiredReason: {}, PlatformArch: {}, PlatformNaclArch: {}, PlatformOs: {}, RequestUpdateCheckStatus: {}, connect() { return {}; }, sendMessage() {} },
  csi() { return {}; },
  loadTimes() { return {}; },
};

globalThis.Notification = class Notification {
  static permission = "default";
  static requestPermission() { return Promise.resolve("default"); }
  constructor() {}
};

globalThis.WebGLRenderingContext = class WebGLRenderingContext {};
globalThis.WebGL2RenderingContext = class WebGL2RenderingContext {};

globalThis.screen = { width:1920, height:1080, availWidth:1920, availHeight:1040, colorDepth:24, pixelDepth:24, availTop:0, availLeft:0, orientation:{type:"landscape-primary",angle:0,addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}} };
globalThis.visualViewport = { width:1920, height:1000, offsetLeft:0, offsetTop:0, scale:1, addEventListener(){}, removeEventListener(){} };
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 1920; globalThis.innerHeight = 1000;
globalThis.outerWidth = 1920; globalThis.outerHeight = 1080;
globalThis.scrollX = 0; globalThis.scrollY = 0;
globalThis.pageXOffset = 0; globalThis.pageYOffset = 0;

globalThis.__fetchInterceptEnabled = false;
globalThis.__fetchInterceptCallback = null; // Set by CDP to handle paused requests

const _base64ToUint8Array = function(b64) {
  const clean = String(b64 || '').replace(/[\r\n\s]/g, '');
  if (!clean) return new Uint8Array();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const padding = clean.endsWith('==') ? 2 : (clean.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array((clean.length * 3 >> 2) - padding);
  let out = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = alphabet.indexOf(clean[i]);
    const b = alphabet.indexOf(clean[i + 1]);
    const c = clean[i + 2] === '=' ? 0 : alphabet.indexOf(clean[i + 2]);
    const d = clean[i + 3] === '=' ? 0 : alphabet.indexOf(clean[i + 3]);
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (out < bytes.length) bytes[out++] = (n >> 16) & 0xff;
    if (out < bytes.length) bytes[out++] = (n >> 8) & 0xff;
    if (out < bytes.length) bytes[out++] = n & 0xff;
  }
  return bytes;
};

const _bodyToUint8Array = function(body) {
  if (body == null) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  return new TextEncoder().encode(String(body));
};

const _arrayBufferFromBytes = function(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

// WHATWG "extract a body" (Fetch §body) + the XHR send() request Content-Type
// rules (XHR §the-send()-method). `send(body)` was coercing every body type
// with String(body) and never deriving a Content-Type, so a String/Document/
// Blob/FormData/URLSearchParams request sent the wrong (or no) Content-Type.
// _extractRequestBody returns { text, type, kind } where `text` is the serialized
// request body for the op, `type` is the body's computed Content-Type (null when
// the body type implies none), and `kind` ∈ {string,document,urlsearchparams,
// blob,buffersource,formdata} (selects the charset-adjustment rule below). null
// body → null.
const _XHR_CHARSET_ADJUST = new Set(['string', 'document', 'urlsearchparams']);
function _extractRequestBody(body) {
  if (body == null) return null;
  // Document (nodeType 9): serialize; an HTML document → text/html, else XML.
  if (typeof body === 'object' && body.nodeType === 9) {
    let text = '';
    try { text = new XMLSerializer().serializeToString(body.documentElement || body); } catch (e) {}
    const isHTML = ((body.contentType || '').toLowerCase() === 'text/html');
    return { text, type: isHTML ? 'text/html;charset=UTF-8' : 'application/xml;charset=UTF-8', kind: 'document' };
  }
  // Blob/File: the blob's own type (none when the blob has no type).
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    let text = '';
    try { text = new TextDecoder().decode(body._bytes || new Uint8Array()); } catch (e) {}
    return { text, type: body.type ? body.type : null, kind: 'blob' };
  }
  // BufferSource (ArrayBuffer or any ArrayBufferView): no Content-Type.
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    const u8 = (body instanceof ArrayBuffer)
      ? new Uint8Array(body)
      : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    let text = '';
    try { text = new TextDecoder().decode(u8); } catch (e) {}
    return { text, type: null, kind: 'buffersource' };
  }
  // FormData → multipart/form-data with a generated boundary.
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const boundary = '----ObscuraFormBoundary' + _uuidV4().replace(/-/g, '');
    let text = '';
    try {
      for (const [k, v] of (body._d || [])) {
        text += '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n';
      }
      text += '--' + boundary + '--\r\n';
    } catch (e) {}
    return { text, type: 'multipart/form-data; boundary=' + boundary, kind: 'formdata' };
  }
  // URLSearchParams → application/x-www-form-urlencoded.
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return { text: body.toString(), type: 'application/x-www-form-urlencoded;charset=UTF-8', kind: 'urlsearchparams' };
  }
  // Anything else is converted to a USVString → text/plain.
  return { text: String(body), type: 'text/plain;charset=UTF-8', kind: 'string' };
}

// XHR §send() step: given the extracted body, set the request Content-Type on the
// author headers map (mutated in place). If the author set no Content-Type, use the
// body's. If the author DID set one, then for Document/string/URLSearchParams bodies
// only, adjust an existing `charset` parameter to UTF-8 (Blob/BufferSource/FormData
// keep the author value verbatim — see the WPT setrequestheader-content-type cases).
function _applyRequestContentType(headers, extracted) {
  if (!extracted || extracted.type == null) return;
  let ctKey = null;
  for (const k of Object.keys(headers)) { if (k.toLowerCase() === 'content-type') { ctKey = k; break; } }
  if (ctKey === null) { headers['Content-Type'] = extracted.type; return; }
  if (_XHR_CHARSET_ADJUST.has(extracted.kind)) {
    const adjusted = _adjustCharsetToUTF8(headers[ctKey]);
    if (adjusted !== null) headers[ctKey] = adjusted;
  }
}

// WHATWG MIME Sniffing §"parse a MIME type". Returns {type, subtype, params}
// (params an ordered array of [name, value] with lowercased names, deduplicated,
// values verbatim) or null on failure (no valid type/subtype essence).
function _parseMimeType(input) {
  if (typeof input !== 'string') return null;
  const s = input.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');
  let i = 0;
  let type = '';
  while (i < s.length && s[i] !== '/') type += s[i++];
  if (type === '' || i >= s.length || !_isHTTPToken(type)) return null;
  i++; // '/'
  let subtype = '';
  while (i < s.length && s[i] !== ';') subtype += s[i++];
  subtype = subtype.replace(/[ \t\n\r]+$/, '');
  if (subtype === '' || !_isHTTPToken(subtype)) return null;
  const rec = { type: type.toLowerCase(), subtype: subtype.toLowerCase(), params: [] };
  const isQSChar = (c) => { const x = c.charCodeAt(0); return x === 0x09 || (x >= 0x20 && x <= 0x7e) || x >= 0x80; };
  while (i < s.length) {
    i++; // ';'
    while (i < s.length && /[ \t\n\r]/.test(s[i])) i++;
    let name = '';
    while (i < s.length && s[i] !== ';' && s[i] !== '=') name += s[i++];
    name = name.toLowerCase();
    if (i < s.length && s[i] === ';') continue; // bare token, no value
    if (i >= s.length) break;
    i++; // '='
    let value = '';
    if (s[i] === '"') {
      i++;
      while (i < s.length) {
        if (s[i] === '\\') { if (i + 1 < s.length) { value += s[i + 1]; i += 2; } else { value += '\\'; i++; } continue; }
        if (s[i] === '"') { i++; break; }
        value += s[i++];
      }
      while (i < s.length && s[i] !== ';') i++; // skip to next ';'
    } else {
      while (i < s.length && s[i] !== ';') value += s[i++];
      value = value.replace(/[ \t\n\r]+$/, '');
    }
    if (name !== '' && _isHTTPToken(name) && value !== '' &&
        [...value].every(isQSChar) && !rec.params.some(p => p[0] === name)) {
      rec.params.push([name, value]);
    }
  }
  return rec;
}

// WHATWG MIME "serialize a MIME type": type/subtype + each param (value quoted
// only when it is not a non-empty HTTP token).
function _serializeMimeType(rec) {
  let out = rec.type + '/' + rec.subtype;
  for (const [k, v] of rec.params) {
    out += ';' + k + '=';
    if (v !== '' && _isHTTPToken(v)) out += v;
    else out += '"' + v.replace(/(["\\])/g, '\\$1') + '"';
  }
  return out;
}

// XHR §send(): adjust a Content-Type's `charset` to UTF-8. Per spec this happens
// ONLY when the type parses, has a `charset` parameter, and that charset is not
// already an ASCII-case-insensitive match for "utf-8". Otherwise the author value
// is left untouched (return null = no change).
function _adjustCharsetToUTF8(value) {
  const rec = _parseMimeType(value);
  if (rec === null) return null;
  const cs = rec.params.find(p => p[0] === 'charset');
  if (!cs || cs[1].toLowerCase() === 'utf-8') return null;
  cs[1] = 'UTF-8';
  return _serializeMimeType(rec);
}

const _installWasmStreamingFallback = function() {
  if (typeof WebAssembly === 'undefined') return;
  if (WebAssembly.instantiateStreaming && WebAssembly.instantiateStreaming.__obscuraFallback) return;
  const nativeInstantiateStreaming = WebAssembly.instantiateStreaming;
  const fallback = async function instantiateStreaming(source, imports) {
    const response = await source;
    if (response && typeof response.arrayBuffer === 'function') {
      return WebAssembly.instantiate(await response.arrayBuffer(), imports);
    }
    if (typeof nativeInstantiateStreaming === 'function') {
      return nativeInstantiateStreaming.call(WebAssembly, response, imports);
    }
    return WebAssembly.instantiate(response, imports);
  };
  fallback.__obscuraFallback = true;
  WebAssembly.instantiateStreaming = fallback;
};
_installWasmStreamingFallback();

// Percent-decode a byte string (WHATWG Infra "percent-decode"). The input is the
// URL-serialized data: path, which is ASCII; any non-ASCII / unsafe byte is
// already %-encoded, so we walk code units and decode %XX runs to raw bytes.
const _percentDecodeBytes = function(str) {
  const s = String(str);
  const out = [];
  const _isHex = (ch) => (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '%' && i + 2 < s.length && _isHex(s[i + 1]) && _isHex(s[i + 2])) {
      out.push(parseInt(s.substr(i + 1, 2), 16));
      i += 2;
    } else {
      out.push(s.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(out);
};

// WHATWG "data: URL processor" (https://fetch.spec.whatwg.org/#data-url-processor).
// Returns { mimeType, bytes } or null on failure (no comma / bad base64).
const _processDataURL = function(url) {
  let input = String(url).slice(5); // strip "data:"
  const hashIdx = input.indexOf('#'); // exclude the fragment
  if (hashIdx !== -1) input = input.slice(0, hashIdx);
  const comma = input.indexOf(',');
  if (comma === -1) return null;
  let mimeType = input.slice(0, comma).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
  let bytes = _percentDecodeBytes(input.slice(comma + 1));
  if (/;[ ]*base64$/i.test(mimeType)) {
    // isomorphic-decode the %-decoded bytes, then forgiving-base64 decode.
    let stringBody = '';
    for (let i = 0; i < bytes.length; i++) stringBody += String.fromCharCode(bytes[i]);
    bytes = _base64ToUint8Array(stringBody.replace(/[\t\n\f\r ]+/g, ''));
    mimeType = mimeType.slice(0, mimeType.length - 6).replace(/[ ]+$/, '').replace(/;$/, '');
  }
  if (mimeType.startsWith(';')) mimeType = 'text/plain' + mimeType;
  if (mimeType === '') mimeType = 'text/plain;charset=US-ASCII';
  return { mimeType, bytes };
};

globalThis.fetch = async (input, init = {}) => {
  const _signal = init.signal || (input instanceof Request ? input.signal : null);
  if (_signal && _signal.aborted) {
    return Promise.reject(_signal.reason !== undefined ? _signal.reason : _abortError('AbortError', 'The operation was aborted'));
  }
  let url = typeof input === "string"
    ? input
    : (input instanceof Request
      ? input.url
      : ((typeof URL === 'function' && input instanceof URL) ? input.href : (input?.url || input?.href || String(input || ""))));
  // blob: object URLs resolve from the in-page object-URL store (no network). A
  // Request constructed from a blob: URL snapshots its bytes, so it still fetches
  // after the URL is revoked. Per spec: only GET; the fragment is ignored for
  // identity, but a query/path/anything-else mismatch (or a revoked URL) must
  // make fetch REJECT (TypeError), not resolve with an error response.
  const _blobSnap = (input instanceof Request) ? input._blobSnapshot : null;
  if (_blobSnap || (typeof url === 'string' && url.startsWith('blob:'))) {
    const method = (init.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    const key = (typeof url === 'string') ? url.split('#')[0] : '';
    let bytes, type;
    if (Object.prototype.hasOwnProperty.call(__blobStore, key)) { bytes = __blobStore[key]; type = __blobTypes[key] || ''; }
    else if (_blobSnap) { bytes = _blobSnap.bytes; type = _blobSnap.type; }
    if (method === 'GET' && bytes !== undefined) {
      return new Response(bytes, {
        status: 200, statusText: 'OK',
        headers: type ? { 'content-type': type } : {},
      });
    }
    throw new TypeError("Failed to fetch: blob URL not found, revoked, or non-GET method");
  }
  // data: URLs are resolved in-process (no network). reqwest can't fetch them,
  // so handle the WHATWG "data: URL processor" here and synthesize the Response.
  if (typeof url === 'string' && url.startsWith('data:')) {
    const dataResult = _processDataURL(url);
    if (dataResult === null) throw new TypeError('Failed to fetch: invalid data: URL');
    const _m = (init.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    // A HEAD request yields the headers but an empty body.
    const _bytes = _m === 'HEAD' ? new Uint8Array() : dataResult.bytes;
    return new Response(_bytes, {
      status: 200, statusText: 'OK',
      headers: { 'content-type': dataResult.mimeType },
      url,
    });
  }
  if (url && !url.includes('://')) {
    try {
      const base = _domParse("document_url") || "about:blank";
      url = new URL(url, base).href;
    } catch(e) { /* keep as-is if URL resolution fails */ }
  }
  const method = init.method || (input instanceof Request ? input.method : "GET");
  const hdrs = JSON.stringify(init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers || {});
  const body = init.body ? String(init.body) : "";
  const fetchMode = init.mode || (input instanceof Request ? input.mode : "cors");
  const pageOrigin = (function() { try { const u = new URL(_domParse("document_url") || "about:blank"); return u.origin; } catch(e) { return ""; } })();
  const _resStart = (globalThis.performance && performance.now) ? performance.now() : 0;
  const _fetchPromise = Deno.core.ops.op_fetch_url(url, method, hdrs, body, pageOrigin, fetchMode);
  const raw = _signal
    ? await Promise.race([_fetchPromise, new Promise((_, reject) => { _signal.addEventListener('abort', () => { reject(_signal.reason !== undefined ? _signal.reason : _abortError('AbortError', 'The operation was aborted')); }); })])
    : await _fetchPromise;
  const parsed = JSON.parse(raw);
  if (parsed.blocked) {
    const err = new TypeError('net::ERR_FAILED');
    err.name = 'AbortError';
    err.__aborted = true;
    throw err;
  }
  if (parsed.corsBlocked) {
    throw new TypeError('Failed to fetch: ' + (parsed.corsError || 'CORS error'));
  }
  const respType = parsed.status === 0 ? "opaque" : (fetchMode === "no-cors" ? "opaque" : "basic");
  const responseBody = parsed.bodyBase64 ? _base64ToUint8Array(parsed.bodyBase64) : (parsed.body || "");
  // Resource Timing: record the completed network fetch on the performance
  // timeline (entryType "resource"). Opaque cross-origin responses still get an
  // entry, with body sizes left at 0 (no TAO opt-in).
  try {
    if (globalThis.performance && performance._addResourceEntry) {
      const _sz = (respType === "opaque") ? 0 : (responseBody && (responseBody.byteLength != null ? responseBody.byteLength : responseBody.length)) || 0;
      // Internal callers (XHR, iframe navigation) pass `_initiatorType` so the
      // entry reports the right element type; the public fetch() default is "fetch".
      const _it = (init && init._initiatorType) || "fetch";
      const _ct = _entryContentType(parsed.url || url, parsed.headers, pageOrigin);
      performance._addResourceEntry(parsed.url || url, _it, _resStart, performance.now(), { enc: _sz, dec: _sz, status: parsed.status, contentType: _ct });
    }
  } catch (e) {}
  return new Response(responseBody, {
    status: parsed.status,
    statusText: "",
    headers: parsed.headers || {},
    type: respType,
    url: parsed.url || url,
    redirected: false,
  });
};

if (typeof Headers === "undefined") {
  globalThis.Headers = class Headers {
    constructor(init={}) { this._h={}; if(init) { if(init instanceof Headers) { init.forEach((v,k)=>{this._h[k]=v;}); } else if(typeof init==="object") { for(const[k,v]of Object.entries(init)) this._h[k.toLowerCase()]=String(v); } } }
    get(n) { return this._h[n.toLowerCase()]??null; } set(n,v) { this._h[n.toLowerCase()]=String(v); }
    has(n) { return n.toLowerCase() in this._h; } delete(n) { delete this._h[n.toLowerCase()]; }
    append(n,v) { this._h[n.toLowerCase()]=String(v); }
    forEach(cb) { for(const[k,v] of Object.entries(this._h)) cb(v,k,this); }
    entries() { return Object.entries(this._h)[Symbol.iterator](); }
    keys() { return Object.keys(this._h)[Symbol.iterator](); }
    values() { return Object.values(this._h)[Symbol.iterator](); }
    [Symbol.iterator]() { return this.entries(); }
  };
}

// RFC 7230 token (a.k.a. a "method"/"header name"): one or more `tchar`s, where
// tchar = ALPHA / DIGIT / "!#$%&'*+-.^_`|~". Used by XHR open()/setRequestHeader().
const _HTTP_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const _isHTTPToken = (s) => _HTTP_TOKEN_RE.test(s);
// WebIDL ByteString coercion: every code unit must be ≤ 0xFF, else TypeError.
const _toByteString = (v, what) => {
  const s = String(v);
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0xff) throw new TypeError("Failed to execute on 'XMLHttpRequest': " + (what || 'argument') + " is not a valid ByteString.");
  }
  return s;
};
// A "header value" has no 0x00/0x0A/0x0D and no leading/trailing HTTP whitespace.
const _isHeaderValue = (s) => !/[\0\r\n]/.test(s) && !/^[\t\n\r ]|[\t\n\r ]$/.test(s);
// "Normalize" a header value: strip leading & trailing HTTP whitespace bytes.
const _normalizeHeaderValue = (s) => s.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, '');
// Methods byte-uppercased on normalization, and the forbidden (SecurityError) set.
const _XHR_NORMALIZE_METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT']);
const _XHR_FORBIDDEN_METHODS = new Set(['CONNECT', 'TRACE', 'TRACK']);

// ── XHR response decoding (XHR §"text response" + §"document response") ──────
// The fetch core hands JS the RAW response bytes (`bodyBase64`), never a charset-
// chosen string, so charset selection happens here per the Encoding/XHR specs.

// "Get a final MIME type" → a parsed MIME record. The override MIME type wins;
// otherwise the response Content-Type; a missing/unparseable value defaults to
// text/xml (per "get a response MIME type").
function _xhrFinalMimeRec(xhr) {
  let rec = null;
  if (xhr._overrideMime) rec = _parseMimeType(xhr._overrideMime);
  else { const ct = xhr.getResponseHeader('content-type'); if (ct != null) rec = _parseMimeType(ct); }
  if (rec === null) rec = { type: 'text', subtype: 'xml', params: [] };
  return rec;
}

// "Get a final encoding": the charset of the override MIME type, else of the
// final MIME type, mapped through "get an encoding". Returns a canonical
// encoding name or null (no/unknown charset).
function _xhrFinalEncoding(xhr) {
  let label = null;
  if (xhr._overrideMime) {
    const r = _parseMimeType(xhr._overrideMime);
    if (r) { const c = r.params.find((p) => p[0] === 'charset'); if (c) label = c[1]; }
  }
  if (label == null) {
    const ct = xhr.getResponseHeader('content-type');
    if (ct != null) { const r = _parseMimeType(ct); if (r) { const c = r.params.find((p) => p[0] === 'charset'); if (c) label = c[1]; } }
  }
  if (label == null) return null;
  return _getEncodingName(label); // null if the label is unknown
}

// "Decode" (Encoding §decode): BOM-sniff to pick the encoding — a BOM overrides
// the fallback — then decode. TextDecoder strips a leading matching BOM for the
// Unicode encodings, so feeding it the whole buffer yields the right result.
function _xhrDecode(bytes, fallbackEnc) {
  let enc = fallbackEnc || 'utf-8';
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) enc = 'utf-8';
  else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) enc = 'utf-16be';
  else if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) enc = 'utf-16le';
  try { return new TextDecoder(enc).decode(bytes); }
  catch (e) { try { return new TextDecoder('utf-8').decode(bytes); } catch (e2) { return ''; } }
}

// XML encoding sniff: read the (ASCII) XML declaration for an `encoding=` pseudo-
// attribute. Returns a canonical encoding name or null.
function _sniffXMLEncoding(bytes) {
  const n = Math.min(bytes.length, 1024);
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[i]);
  const m = /^\s*<\?xml\s[^>]*?encoding\s*=\s*("([^"]*)"|'([^']*)')/.exec(s);
  if (m) return _getEncodingName(m[2] !== undefined ? m[2] : m[3]);
  return null;
}

// HTML prescan (simplified "prescan a byte stream to determine its encoding"):
// find a <meta charset=…> (or http-equiv content-type) declaration in the first
// 1024 bytes. utf-16 → utf-8 and x-user-defined → windows-1252 per the algorithm.
function _prescanMetaCharset(bytes) {
  const n = Math.min(bytes.length, 1024);
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[i]);
  let enc = null;
  let m = /<meta[^>]+charset\s*=\s*["']?\s*([^"'\s/>;]+)/i.exec(s);
  if (m) enc = _getEncodingName(m[1]);
  if (!enc) return null;
  if (enc === 'utf-16be' || enc === 'utf-16le') return 'utf-8';
  if (enc === 'x-user-defined') return 'windows-1252';
  return enc;
}

// §"text response" — decode the received bytes to xhr.responseText. The default
// ("") responseType additionally sniffs an XML-ish response's declared encoding;
// the explicit "text" type never does.
function _xhrResponseText(xhr) {
  const bytes = xhr._responseBytes;
  if (!bytes || bytes.length === 0) return '';
  let charset = _xhrFinalEncoding(xhr);
  if (xhr.responseType === '' && charset === null) {
    const rec = _xhrFinalMimeRec(xhr);
    const isXML = rec.subtype.endsWith('+xml')
      || (rec.type === 'text' && rec.subtype === 'xml')
      || (rec.type === 'application' && rec.subtype === 'xml');
    if (isXML) charset = _sniffXMLEncoding(bytes);
  }
  return _xhrDecode(bytes, charset);
}

globalThis.XMLHttpRequest = class XMLHttpRequest {
  static UNSENT = 0;
  static OPENED = 1;
  static HEADERS_RECEIVED = 2;
  static LOADING = 3;
  static DONE = 4;
  UNSENT = 0; OPENED = 1; HEADERS_RECEIVED = 2; LOADING = 3; DONE = 4;

  constructor() {
    this.readyState = 0;
    this.status = 0;
    this.statusText = "";
    this._responseText = "";
    this.responseURL = "";
    this.responseType = "";
    this.response = null;
    this.timeout = 0;
    this.withCredentials = false;
    this.upload = { addEventListener(){}, removeEventListener(){} };
    this._method = "GET";
    this._url = "";
    this._headers = {};
    this._responseHeaders = {};
    this._aborted = false;
    this._listeners = {};
    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.onabort = null;
    this.onprogress = null;
    this.ontimeout = null;
    this.onloadstart = null;
    this.onloadend = null;
  }

  open(method, url, async_) {
    // §open: method is a ByteString. Coerce (>0xFF → TypeError), validate it is
    // a token (else SyntaxError), reject forbidden methods (SecurityError), then
    // byte-uppercase the well-known methods. (`open-method-bogus` etc.)
    method = _toByteString(method, "method");
    if (!_isHTTPToken(method)) throw new DOMException("'" + method + "' is not a valid HTTP method.", 'SyntaxError');
    if (_XHR_FORBIDDEN_METHODS.has(method.toUpperCase())) throw new DOMException("'" + method + "' HTTP method is unsupported.", 'SecurityError');
    if (_XHR_NORMALIZE_METHODS.has(method.toUpperCase())) method = method.toUpperCase();
    this._method = method;
    // §open async flag: WebIDL `optional boolean async = true` — absent or
    // explicit `undefined` → async; an explicit `false` → synchronous send().
    this._async = (async_ === undefined) ? true : !!async_;
    this._sendFlag = false;
    // §open: a synchronous request in a Window context is forbidden once a
    // non-default timeout or a responseType has been set → InvalidAccessError
    // (open-method-responsetype-set-sync). Thrown before any state change so no
    // readystatechange fires.
    if (this._async === false && (this.timeout !== 0 || this.responseType !== '')) {
      throw new DOMException("Synchronous XHR requests must not have a timeout or responseType set.", 'InvalidAccessError');
    }
    // The url argument may be a URL object (the resource-timing loaders pass
    // `new URL(path, origin)`); the spec parses it to a string. Coerce so the
    // string ops below (.startsWith / .includes) work.
    if (url != null && typeof url !== 'string') url = String(url);
    this._url = url;
    // Snapshot a blob: URL's bytes at open() (spec: the request references the
    // blob now) so a revokeObjectURL before send() doesn't break the fetch.
    this._blobSnapshot = null;
    if (typeof url === 'string' && url.startsWith('blob:')) {
      const _bk = url.split('#')[0];
      if (Object.prototype.hasOwnProperty.call(__blobStore, _bk))
        this._blobSnapshot = { bytes: __blobStore[_bk], type: __blobTypes[_bk] || '' };
    }
    this._headers = {};
    this._responseHeaders = {};
    this._aborted = false;
    this.status = 0;
    this.statusText = "";
    this._responseText = "";
    this.response = null;
    // Invalidate any cached "document response" + raw bytes from a previous cycle.
    this._responseDocComputed = false;
    this._responseDocCache = null;
    this._responseBytes = null;
    // open() moves the object to OPENED; per spec readystatechange only fires
    // when the state actually changes, so a redundant open() on an
    // already-OPENED object is silent (open-open-sync-send).
    if (this.readyState !== 1) { this._setReadyState(1); }
    else { this.readyState = 1; }
  }

  setRequestHeader(name, value) {
    // §setRequestHeader. WebIDL: both args are required ByteStrings.
    if (arguments.length < 2) throw new TypeError("Failed to execute 'setRequestHeader' on 'XMLHttpRequest': 2 arguments required.");
    name = _toByteString(name, "name");
    value = _toByteString(value, "value");
    if (this.readyState !== 1) throw new DOMException("The object's state must be OPENED.", 'InvalidStateError');
    if (this._sendFlag) throw new DOMException("The object is in the wrong state.", 'InvalidStateError');
    value = _normalizeHeaderValue(value);
    if (!_isHTTPToken(name) || !_isHeaderValue(value)) throw new DOMException("Invalid header name or value.", 'SyntaxError');
    // Combine with any existing value for a case-insensitive name match.
    const lower = name.toLowerCase();
    for (const k of Object.keys(this._headers)) {
      if (k.toLowerCase() === lower) { this._headers[k] = this._headers[k] + ', ' + value; return; }
    }
    this._headers[name] = value;
  }

  getResponseHeader(name) {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(this._responseHeaders)) {
      if (k.toLowerCase() === lower) return v;
    }
    return null;
  }

  getAllResponseHeaders() {
    return Object.entries(this._responseHeaders)
      .map(([k, v]) => k + ': ' + v)
      .join('\r\n');
  }

  overrideMimeType(mime) { this._overrideMime = mime; }

  send(body) {
    if (this.readyState !== 1) return;
    if (this._aborted) return;

    // Synchronous mode (`open(..., false)`) blocks until the response arrives.
    if (this._async === false) { this._sendSync(body); return; }

    const xhr = this;
    this._fireEvent('loadstart');

    let url = this._url;
    if (url && !url.includes('://')) {
      try {
        const base = _domParse("document_url") || "about:blank";
        url = new URL(url, base).href;
      } catch(e) {}
    }

    // Extract the request body + derive/adjust its Content-Type (XHR §send()).
    // GET/HEAD never carry a body (the spec discards send()'s argument).
    const _extracted = (this._method === 'GET' || this._method === 'HEAD') ? null : _extractRequestBody(body);
    _applyRequestContentType(this._headers, _extracted);
    const _reqBody = _extracted ? _extracted.text : undefined;

    // Carry an open()-time blob snapshot through to fetch via a Request.
    let _input = url;
    if (this._blobSnapshot) { _input = new Request(url, { method: this._method }); _input._blobSnapshot = this._blobSnapshot; }
    fetch(_input, {
      method: this._method,
      headers: this._headers,
      body: _reqBody,
      mode: 'cors',
      _initiatorType: 'xmlhttprequest',
    }).then(async (resp) => {
      if (xhr._aborted) return;

      xhr.status = resp.status;
      xhr.statusText = resp.statusText || '';
      xhr.responseURL = resp.url || url;

      if (resp.headers) {
        resp.headers.forEach((v, k) => { xhr._responseHeaders[k] = v; });
      }

      xhr._setReadyState(2); // HEADERS_RECEIVED

      // Charset-aware decoding works off the RAW response bytes, not resp.text()
      // (which is utf-8-only) — see _xhrResponseText / _getDocumentResponse.
      const bytes = (resp._bodyBytes instanceof Uint8Array) ? resp._bodyBytes : new Uint8Array();
      if (xhr._aborted) return;

      xhr._responseBytes = bytes;
      const _text = _xhrResponseText(xhr);
      xhr._responseText = _text;
      xhr._setReadyState(3); // LOADING

      switch (xhr.responseType) {
        case 'json':
          try { xhr.response = JSON.parse(new TextDecoder().decode(bytes)); } catch(e) { xhr.response = null; }
          break;
        case 'text':
        case '':
          xhr.response = _text;
          break;
        case 'arraybuffer':
          xhr.response = bytes.slice().buffer;
          break;
        case 'blob':
          xhr.response = new Blob([bytes]);
          break;
        case 'document':
          // §"document response": parse the body per its final MIME type into a
          // Document (or null). Cached so `.response` and `.responseXML` return
          // the SAME object (responsexml-get-twice).
          xhr.response = xhr._getDocumentResponse();
          break;
        default:
          xhr.response = _text;
      }

      xhr._setReadyState(4); // DONE
      xhr._fireEvent('load');
      xhr._fireEvent('loadend');
    }).catch((err) => {
      if (xhr._aborted) return;
      xhr.status = 0;
      xhr._setReadyState(4); // sets readyState + fires readystatechange AND onreadystatechange
      if (err && err.__aborted) {
        xhr._aborted = true;
        xhr._fireEvent('abort');
        xhr._fireEvent('loadend');
        if (xhr.onabort) xhr.onabort(err);
      } else {
        xhr._fireEvent('error');
        xhr._fireEvent('loadend');
        if (xhr.onerror) xhr.onerror(err);
      }
    });
  }

  _sendSync(body) {
    // Synchronous send: block on the response via op_fetch_url_sync, populate
    // state, then fire the DONE transition + load/loadend. Per §send, a sync
    // request fires no loadstart/progress, and a network error throws a
    // NetworkError DOMException after moving to DONE.
    this._sendFlag = true;
    const _resStart = (globalThis.performance && performance.now) ? performance.now() : 0;
    let url = this._url;
    const isData = typeof url === 'string' && url.startsWith('data:');
    const isBlob = (typeof url === 'string' && url.startsWith('blob:')) || !!this._blobSnapshot;
    if (typeof url === 'string' && url && !url.includes('://') && !isData && !isBlob) {
      try { url = new URL(url, _domParse("document_url") || "about:blank").href; } catch (e) {}
    }
    let status, statusText, respHeaders, respBytes = null, respText = null, finalUrl;
    try {
      if (isData) {
        const d = _processDataURL(url);
        if (d === null) throw new Error('invalid data URL');
        respBytes = (this._method === 'HEAD') ? new Uint8Array() : d.bytes;
        status = 200; statusText = 'OK'; respHeaders = { 'content-type': d.mimeType }; finalUrl = url;
      } else if (isBlob) {
        const key = (typeof url === 'string') ? url.split('#')[0] : '';
        let bytes, type;
        if (Object.prototype.hasOwnProperty.call(__blobStore, key)) { bytes = __blobStore[key]; type = __blobTypes[key] || ''; }
        else if (this._blobSnapshot) { bytes = this._blobSnapshot.bytes; type = this._blobSnapshot.type; }
        if (this._method !== 'GET' || bytes === undefined) throw new Error('blob URL not found');
        respBytes = bytes; status = 200; statusText = 'OK'; respHeaders = type ? { 'content-type': type } : {}; finalUrl = url;
      } else {
        // Extract the request body + derive/adjust its Content-Type (XHR §send()).
        // GET/HEAD never carry a body (the spec discards send()'s argument).
        const _extracted = (this._method === 'GET' || this._method === 'HEAD') ? null : _extractRequestBody(body);
        _applyRequestContentType(this._headers, _extracted);
        const _reqBody = _extracted ? _extracted.text : "";
        const pageOrigin = (function () { try { return new URL(_domParse("document_url") || "about:blank").origin; } catch (e) { return ""; } })();
        const raw = Deno.core.ops.op_fetch_url_sync(url, this._method, JSON.stringify(this._headers), _reqBody, pageOrigin, 'cors');
        const p = JSON.parse(raw);
        if (p.blocked || p.corsBlocked || (p.status === 0 && p.error)) throw new Error(p.error || p.corsError || 'network error');
        status = p.status; statusText = ''; respHeaders = p.headers || {};
        respBytes = p.bodyBase64 ? _base64ToUint8Array(p.bodyBase64) : null;
        respText = (respBytes == null) ? (p.body || '') : null;
        finalUrl = p.url || url;
      }
    } catch (err) {
      this._sendFlag = false;
      this.status = 0; this.statusText = '';
      this._responseText = ''; this.response = null;
      this._setReadyState(4);
      throw new DOMException('Network request failed', 'NetworkError');
    }
    this.status = status;
    this.statusText = statusText || '';
    this.responseURL = (typeof finalUrl === 'string' ? finalUrl.split('#')[0] : '') || '';
    this._responseHeaders = {};
    for (const [k, v] of Object.entries(respHeaders || {})) this._responseHeaders[k] = v;
    // Charset-aware decoding works off the raw response bytes (utf-8-decoded
    // p.body is only a fallback when the envelope carried no base64 body).
    this._responseBytes = (respBytes != null) ? respBytes
      : (respText != null ? new TextEncoder().encode(respText) : new Uint8Array());
    const text = _xhrResponseText(this);
    this._responseText = text;
    switch (this.responseType) {
      case 'json': try { this.response = JSON.parse(new TextDecoder().decode(this._responseBytes)); } catch (e) { this.response = null; } break;
      case 'arraybuffer': this.response = this._responseBytes.slice().buffer; break;
      case 'blob': this.response = new Blob([this._responseBytes]); break;
      case 'document': this.response = this._getDocumentResponse(); break;
      case 'text': case '': default: this.response = text;
    }
    // Resource Timing: a synchronous XHR records a completed "resource" entry
    // on the performance timeline just like the async path (fetch()). WPT's
    // buffer-full suite drives the buffer purely through load.xhr_sync().
    try {
      if (globalThis.performance && performance._addResourceEntry) {
        const _sz = (respBytes && (respBytes.byteLength != null ? respBytes.byteLength : respBytes.length))
          || (respText ? respText.length : 0) || 0;
        const _pageOrigin = (function () { try { return new URL(_domParse("document_url") || "about:blank").origin; } catch (e) { return ""; } })();
        const _ct = _entryContentType(this.responseURL || finalUrl || url, respHeaders, _pageOrigin);
        performance._addResourceEntry(this.responseURL || finalUrl || url, 'xmlhttprequest', _resStart, performance.now(), { enc: _sz, dec: _sz, status: status, contentType: _ct });
      }
    } catch (e) {}
    this._sendFlag = false;
    this._setReadyState(4);
    this._fireEvent('load');
    this._fireEvent('loadend');
  }

  // §the responseText attribute. Only valid for responseType "" or "text"
  // (else InvalidStateError); the empty string until LOADING/DONE, then the
  // decoded text response (responsexml-non-document-types). Backed by
  // `_responseText` — the send paths assign that field, not this getter.
  get responseText() {
    if (this.responseType !== '' && this.responseType !== 'text')
      throw new DOMException("responseText is only available if responseType is '' or 'text'.", 'InvalidStateError');
    if (this.readyState !== 3 && this.readyState !== 4) return '';
    return this._responseText || '';
  }

  // §the responseXML attribute. Only valid for responseType "" or "document";
  // returns null until DONE, then the (cached) document response.
  get responseXML() {
    if (this.responseType !== '' && this.responseType !== 'document')
      throw new DOMException("responseXML is only available if responseType is '' or 'document'.", 'InvalidStateError');
    if (this.readyState !== 4) return null;
    return this._getDocumentResponse();
  }

  // §"document response": parse the response body into a Document per its final
  // MIME type, or null. Cached so repeated reads — and `.response` for a
  // "document" responseType — return the very same object (object identity is
  // asserted by responsexml-get-twice).
  _getDocumentResponse() {
    if (this._responseDocComputed) return this._responseDocCache;
    this._responseDocComputed = true;
    this._responseDocCache = null;

    // 1. If the response's body is null, return (→ null).
    const bytes = this._responseBytes;
    if (!bytes || bytes.length === 0) return null;

    // Final MIME type = override MIME type if set, else the response MIME type;
    // "get a response MIME type" defaults a missing/unparseable Content-Type to
    // text/xml — which is why "", "bogus", "application", "bogus+xml" all parse.
    const rec = _xhrFinalMimeRec(this);

    const isHTML = (rec.type === 'text' && rec.subtype === 'html');
    const isXML = rec.subtype.endsWith('+xml')
      || (rec.type === 'text' && rec.subtype === 'xml')
      || (rec.type === 'application' && rec.subtype === 'xml');
    // If the final MIME type is neither HTML nor XML, return (→ null). And the
    // default ("") responseType never parses HTML — only an explicit "document".
    if (!isHTML && !isXML) return null;
    if (this.responseType === '' && isHTML) return null;

    // Decode the bytes for the DOCUMENT (distinct from §text response): the
    // override/Content-Type charset wins; otherwise an HTML response is meta-
    // prescanned and an XML response reads its declaration; else UTF-8. A BOM
    // still wins inside _xhrDecode.
    let docCharset = _xhrFinalEncoding(this);
    if (docCharset === null) docCharset = isHTML ? _prescanMetaCharset(bytes) : _sniffXMLEncoding(bytes);
    const text = _xhrDecode(bytes, docCharset);
    if (text === '') return null;

    const pageURL = this.responseURL || (_domParse('document_url') || 'about:blank');
    let doc = null;
    try {
      if (isHTML) {
        doc = new _IframeDocument(text, pageURL, null, pageURL, 'html');
        doc._contentType = 'text/html';
      } else {
        doc = new _IframeDocument(text, pageURL, null, pageURL, 'xml');
        doc._contentType = _serializeMimeType(rec);
        // If the XML is not well-formed the parser yields a Gecko parsererror
        // root; the document response is null in that case.
        const de = doc.documentElement;
        if (de && de.namespaceURI === _PARSERERROR_NS) doc = null;
      }
    } catch (e) { doc = null; }
    this._responseDocCache = doc;
    return doc;
  }

  abort() {
    this._aborted = true;
    if (this.readyState > 0 && this.readyState < 4) {
      this._setReadyState(4);
      this._fireEvent('abort');
      this._fireEvent('loadend');
    }
    this.readyState = 0;
  }

  addEventListener(type, handler) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter(h => h !== handler);
    }
  }

  _setReadyState(state) {
    this.readyState = state;
    this._fireEvent('readystatechange');
    if (this.onreadystatechange) {
      try { this.onreadystatechange(); } catch(e) {}
    }
  }

  _fireEvent(type) {
    // readystatechange is a plain Event; the rest (loadstart/progress/load/
    // loadend/error/abort/timeout) are ProgressEvents, so handlers that test
    // `e instanceof ProgressEvent` see the right type.
    let event;
    if (type === 'readystatechange') {
      event = { type, target: this, currentTarget: this, bubbles: false };
    } else {
      try { event = new ProgressEvent(type, { lengthComputable: false, loaded: 0, total: 0 }); }
      catch (e) { event = { type, target: this, currentTarget: this, bubbles: false }; }
      try { Object.defineProperty(event, 'target', { value: this, configurable: true }); } catch (e) {}
      try { Object.defineProperty(event, 'currentTarget', { value: this, configurable: true }); } catch (e) {}
    }
    const handlers = this._listeners[type] || [];
    for (const h of handlers) { try { h.call(this, event); } catch(e) {} }
    const prop = 'on' + type;
    if (type !== 'readystatechange' && typeof this[prop] === 'function') {
      try { this[prop](event); } catch(e) {}
    }
  }
};
_markNative(XMLHttpRequest);
_markNative(XMLHttpRequest.prototype.open);
_markNative(XMLHttpRequest.prototype.send);
_markNative(XMLHttpRequest.prototype.abort);
_markNative(XMLHttpRequest.prototype.setRequestHeader);
_markNative(XMLHttpRequest.prototype.getResponseHeader);
_markNative(XMLHttpRequest.prototype.getAllResponseHeaders);

if (typeof URL === 'undefined' || !URL.prototype) {
  globalThis.URL = class URL {
    constructor(url, base) {
      // Real WHATWG parsing via the Rust `url` crate (op), not a regex. Throws
      // TypeError on invalid input (with the given base), matching the spec.
      const res = JSON.parse(Deno.core.ops.op_url_parse(
        url == null ? '' : String(url),
        base == null ? '' : String(base)
      ));
      if (!res.valid) throw new TypeError("Failed to construct 'URL': Invalid URL");
      this._c = res;   // current components
      this._sp = null; // cached URLSearchParams
    }
    // Setting a component re-applies it through the url crate (op_url_set); a
    // setter the spec rejects is a no-op (op returns the unchanged components).
    _apply(part, value) {
      const res = JSON.parse(Deno.core.ops.op_url_set(this._c.href, part, value == null ? '' : String(value)));
      // Refresh (not replace) any live searchParams from the new query.
      if (res.valid) { this._c = res; if (this._sp) this._sp._setList(this._c.search); }
    }
    // Called by the owning searchParams when its list mutates (two-way sync).
    _setSearchFromParams(str) {
      const res = JSON.parse(Deno.core.ops.op_url_set(this._c.href, 'search', str));
      if (res.valid) this._c = res;
    }
    get href() { return this._c.href; }
    set href(v) {
      const res = JSON.parse(Deno.core.ops.op_url_parse(v == null ? '' : String(v), ''));
      if (!res.valid) throw new TypeError("Failed to set the 'href' property on 'URL': Invalid URL");
      this._c = res; if (this._sp) this._sp._setList(this._c.search);
    }
    get origin() { return this._c.origin; }
    get protocol() { return this._c.protocol; } set protocol(v) { this._apply('protocol', v); }
    get username() { return this._c.username; } set username(v) { this._apply('username', v); }
    get password() { return this._c.password; } set password(v) { this._apply('password', v); }
    get host() { return this._c.host; }         set host(v) { this._apply('host', v); }
    get hostname() { return this._c.hostname; } set hostname(v) { this._apply('hostname', v); }
    get port() { return this._c.port; }         set port(v) { this._apply('port', v); }
    get pathname() { return this._c.pathname; } set pathname(v) { this._apply('pathname', v); }
    get search() { return this._c.search; }     set search(v) { this._apply('search', v); }
    get hash() { return this._c.hash; }         set hash(v) { this._apply('hash', v); }
    get searchParams() {
      if (!this._sp) { this._sp = new URLSearchParams(this._c.search); this._sp._url = this; }
      return this._sp;
    }
    toString() { return this._c.href; }
    toJSON() { return this._c.href; }
    // WHATWG static methods: parse() returns a URL or null (never throws);
    // canParse() returns whether the input parses (with the optional base).
    static parse(url, base) {
      try { return new URL(url, base); } catch (e) { return null; }
    }
    static canParse(url, base) {
      try { new URL(url, base); return true; } catch (e) { return false; }
    }
  };
}

globalThis.requestIdleCallback = globalThis.requestIdleCallback || function requestIdleCallback(cb, opts) {
  const start = Date.now();
  return setTimeout(() => {
    cb({
      didTimeout: false,
      timeRemaining() { return Math.max(0, 50 - (Date.now() - start)); },
    });
  }, 1);
};
globalThis.cancelIdleCallback = globalThis.cancelIdleCallback || function cancelIdleCallback(id) { clearTimeout(id); };
_markNative(globalThis.requestIdleCallback);
_markNative(globalThis.cancelIdleCallback);

if (typeof Request === 'undefined') {
  globalThis.Request = class Request {
    constructor(input, init = {}) {
      if (typeof input === 'string') { this.url = input; }
      else if (input instanceof Request) { this.url = input.url; if (input._blobSnapshot) this._blobSnapshot = input._blobSnapshot; init = { ...input, ...init }; }
      else if (typeof URL === 'function' && input instanceof URL) { this.url = input.href; }
      else { this.url = input?.url || input?.href || String(input); }
      // Snapshot blob: contents now (spec: a request takes a reference to the blob
      // when created) so a later revokeObjectURL doesn't break the fetch.
      if (!this._blobSnapshot && typeof this.url === 'string' && this.url.startsWith('blob:')) {
        const _bk = this.url.split('#')[0];
        if (Object.prototype.hasOwnProperty.call(__blobStore, _bk))
          this._blobSnapshot = { bytes: __blobStore[_bk], type: __blobTypes[_bk] || '' };
      }
      this.method = (init.method || 'GET').toUpperCase();
      this.headers = new Headers(init.headers);
      this.body = init.body || null;
      this.mode = init.mode || 'cors';
      this.credentials = init.credentials || 'same-origin';
      this.redirect = init.redirect || 'follow';
      this.referrer = init.referrer || '';
      this.signal = init.signal || { aborted: false, addEventListener(){}, removeEventListener(){} };
      this.cache = init.cache || 'default';
    }
    clone() { const r = new Request(this.url, { method: this.method, headers: this.headers, body: this.body }); if (this._blobSnapshot) r._blobSnapshot = this._blobSnapshot; return r; }
    async text() { return this.body ? String(this.body) : ''; }
    async json() { return JSON.parse(await this.text()); }
    async arrayBuffer() { return new TextEncoder().encode(await this.text()).buffer; }
  };
}

if (typeof Response === 'undefined') {
  globalThis.Response = class Response {
    constructor(body, init = {}) {
      this._bodyBytes = _bodyToUint8Array(body); this.status = init.status || 200; this.statusText = init.statusText || '';
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = new Headers(init.headers);
      this.type = init.type || 'basic'; this.url = init.url || ''; this.redirected = !!init.redirected;
    }
    async text() { return new TextDecoder().decode(this._bodyBytes); }
    async json() { return JSON.parse(await this.text()); }
    async arrayBuffer() { return _arrayBufferFromBytes(this._bodyBytes); }
    async blob() { return new Blob([this._bodyBytes]); }
    clone() { return new Response(this._bodyBytes, { status: this.status, statusText: this.statusText, headers: this.headers, type: this.type, url: this.url, redirected: this.redirected }); }
    static error() { return new Response(null, { status: 0 }); }
    static redirect(url, status) { return new Response(null, { status: status || 302, headers: { Location: url } }); }
    static json(data, init) { return new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } }); }
  };
}

if (!Element.prototype.replaceWith) {
  Element.prototype.replaceWith = function(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    for (const n of nodes) {
      if (typeof n === 'string') parent.insertBefore(document.createTextNode(n), this);
      else parent.insertBefore(n, this);
    }
    parent.removeChild(this);
  };
  _markNative(Element.prototype.replaceWith);
}
if (!Element.prototype.before) {
  Element.prototype.before = function(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    for (const n of nodes) {
      if (typeof n === 'string') parent.insertBefore(document.createTextNode(n), this);
      else parent.insertBefore(n, this);
    }
  };
  _markNative(Element.prototype.before);
}
if (!Element.prototype.after) {
  Element.prototype.after = function(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const ref = this.nextSibling;
    for (const n of nodes) {
      if (typeof n === 'string') parent.insertBefore(document.createTextNode(n), ref);
      else parent.insertBefore(n, ref);
    }
  };
  _markNative(Element.prototype.after);
}

// ChildNode mixin: also mix before/after/replaceWith/remove into
// CharacterData.prototype (covers Text, Comment, ProcessingInstruction).
// These are the same implementations as Element.prototype — frameworks
// (Svelte 5, Vue, Lit) anchor on Comment/Text nodes and call these methods.
if (!CharacterData.prototype.before) CharacterData.prototype.before = Element.prototype.before;
if (!CharacterData.prototype.after) CharacterData.prototype.after = Element.prototype.after;
if (!CharacterData.prototype.replaceWith) CharacterData.prototype.replaceWith = Element.prototype.replaceWith;
if (!CharacterData.prototype.remove) CharacterData.prototype.remove = Element.prototype.remove;

if (!('isConnected' in Node.prototype)) {
  Object.defineProperty(Node.prototype, 'isConnected', {
    get() {
      let node = this;
      while (node) {
        if (node.nodeType === 9) return true; // Document node
        node = node.parentNode;
      }
      return false;
    }
  });
}

globalThis.ResizeObserver = class ResizeObserver {
  constructor(callback) { this._callback = callback; this._targets = []; }
  observe(el) {
    this._targets.push(el);
    Promise.resolve().then(() => {
      this._callback([{
        target: el, contentRect: { x:0, y:0, width:100, height:20, top:0, left:0, bottom:20, right:100 },
        borderBoxSize: [{ blockSize: 20, inlineSize: 100 }],
        contentBoxSize: [{ blockSize: 20, inlineSize: 100 }],
      }], this);
    });
  }
  unobserve(el) { this._targets = this._targets.filter(t => t !== el); }
  disconnect() { this._targets = []; }
};

// ---- Encoding API (TextEncoder / TextDecoder) ----
// WHATWG encoding label table (canonical name -> labels), straight from
// https://encoding.spec.whatwg.org/encodings.json. Powers label validation and
// the `encoding` attribute. We fully decode utf-8 / utf-16le / utf-16be /
// windows-1252; other (legacy multi-byte) encodings carry the correct name and
// decode best-effort.
const _ENCODING_LABELS = {
  "utf-8": ["unicode-1-1-utf-8","unicode11utf8","unicode20utf8","utf-8","utf8","x-unicode20utf8"],
  "ibm866": ["866","cp866","csibm866","ibm866"],
  "iso-8859-2": ["csisolatin2","iso-8859-2","iso-ir-101","iso8859-2","iso88592","iso_8859-2","iso_8859-2:1987","l2","latin2"],
  "iso-8859-3": ["csisolatin3","iso-8859-3","iso-ir-109","iso8859-3","iso88593","iso_8859-3","iso_8859-3:1988","l3","latin3"],
  "iso-8859-4": ["csisolatin4","iso-8859-4","iso-ir-110","iso8859-4","iso88594","iso_8859-4","iso_8859-4:1988","l4","latin4"],
  "iso-8859-5": ["csisolatincyrillic","cyrillic","iso-8859-5","iso-ir-144","iso8859-5","iso88595","iso_8859-5","iso_8859-5:1988"],
  "iso-8859-6": ["arabic","asmo-708","csiso88596e","csiso88596i","csisolatinarabic","ecma-114","iso-8859-6","iso-8859-6-e","iso-8859-6-i","iso-ir-127","iso8859-6","iso88596","iso_8859-6","iso_8859-6:1987"],
  "iso-8859-7": ["csisolatingreek","ecma-118","elot_928","greek","greek8","iso-8859-7","iso-ir-126","iso8859-7","iso88597","iso_8859-7","iso_8859-7:1987","sun_eu_greek"],
  "iso-8859-8": ["csiso88598e","csisolatinhebrew","hebrew","iso-8859-8","iso-8859-8-e","iso-ir-138","iso8859-8","iso88598","iso_8859-8","iso_8859-8:1988","visual"],
  "iso-8859-8-i": ["csiso88598i","iso-8859-8-i","logical"],
  "iso-8859-10": ["csisolatin6","iso-8859-10","iso-ir-157","iso8859-10","iso885910","l6","latin6"],
  "iso-8859-13": ["iso-8859-13","iso8859-13","iso885913"],
  "iso-8859-14": ["iso-8859-14","iso8859-14","iso885914"],
  "iso-8859-15": ["csisolatin9","iso-8859-15","iso8859-15","iso885915","iso_8859-15","l9"],
  "iso-8859-16": ["iso-8859-16"],
  "koi8-r": ["cskoi8r","koi","koi8","koi8-r","koi8_r"],
  "koi8-u": ["koi8-ru","koi8-u"],
  "macintosh": ["csmacintosh","mac","macintosh","x-mac-roman"],
  "windows-874": ["dos-874","iso-8859-11","iso8859-11","iso885911","tis-620","windows-874"],
  "windows-1250": ["cp1250","windows-1250","x-cp1250"],
  "windows-1251": ["cp1251","windows-1251","x-cp1251"],
  "windows-1252": ["ansi_x3.4-1968","ascii","cp1252","cp819","csisolatin1","ibm819","iso-8859-1","iso-ir-100","iso8859-1","iso88591","iso_8859-1","iso_8859-1:1987","l1","latin1","us-ascii","windows-1252","x-cp1252"],
  "windows-1253": ["cp1253","windows-1253","x-cp1253"],
  "windows-1254": ["cp1254","csisolatin5","iso-8859-9","iso-ir-148","iso8859-9","iso88599","iso_8859-9","iso_8859-9:1989","l5","latin5","windows-1254","x-cp1254"],
  "windows-1255": ["cp1255","windows-1255","x-cp1255"],
  "windows-1256": ["cp1256","windows-1256","x-cp1256"],
  "windows-1257": ["cp1257","windows-1257","x-cp1257"],
  "windows-1258": ["cp1258","windows-1258","x-cp1258"],
  "x-mac-cyrillic": ["x-mac-cyrillic","x-mac-ukrainian"],
  "gbk": ["chinese","csgb2312","csiso58gb231280","gb2312","gb_2312","gb_2312-80","gbk","iso-ir-58","x-gbk"],
  "gb18030": ["gb18030"],
  "big5": ["big5","big5-hkscs","cn-big5","csbig5","x-x-big5"],
  "euc-jp": ["cseucpkdfmtjapanese","euc-jp","x-euc-jp"],
  "iso-2022-jp": ["csiso2022jp","iso-2022-jp"],
  "shift_jis": ["csshiftjis","ms932","ms_kanji","shift-jis","shift_jis","sjis","windows-31j","x-sjis"],
  "euc-kr": ["cseuckr","csksc56011987","euc-kr","iso-ir-149","korean","ks_c_5601-1987","ks_c_5601-1989","ksc5601","ksc_5601","windows-949"],
  "replacement": ["csiso2022kr","hz-gb-2312","iso-2022-cn","iso-2022-cn-ext","iso-2022-kr","replacement"],
  "utf-16be": ["unicodefffe","utf-16be"],
  "utf-16le": ["csunicode","iso-10646-ucs-2","ucs-2","unicode","unicodefeff","utf-16","utf-16le"],
  "x-user-defined": ["x-user-defined"],
};
const _LABEL_TO_NAME = (function() {
  const m = Object.create(null);
  for (const name in _ENCODING_LABELS) for (const l of _ENCODING_LABELS[name]) m[l] = name;
  return m;
})();
// "Get an encoding" (WHATWG): trim leading/trailing ASCII whitespace, ASCII
// lowercase, look up. Returns the canonical name or null on failure.
const _getEncodingName = function(label) {
  // ASCII lowercase only — JS .toLowerCase() is Unicode-aware and would fold
  // e.g. U+212A (KELVIN SIGN) to 'k', wrongly validating 'Koi8-r'.
  const s = String(label).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '')
    .replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
  return _LABEL_TO_NAME[s] || null;
};
// windows-1252 bytes 0x80-0x9F -> code point (0x00-0x7F and 0xA0-0xFF are identity).
const _WIN1252 = [0x20AC,0x81,0x201A,0x0192,0x201E,0x2026,0x2020,0x2021,0x02C6,0x2030,0x0160,0x2039,0x0152,0x8D,0x017D,0x8F,0x90,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x02DC,0x2122,0x0161,0x203A,0x0153,0x9D,0x017E,0x0178];
const _encFatal = function() { throw new TypeError("The encoded data was not valid."); };
// WHATWG utf-8 decoder (per-byte lower/upper bounds; fatal -> throw, else U+FFFD).
// `st` carries decoder state across streaming calls; `flush` emits a final U+FFFD
// for a truncated sequence and resets the state.
const _decodeUtf8 = function(bytes, fatal, st, flush) {
  let out = '', i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (st.needed === 0) {
      if (b <= 0x7F) out += String.fromCharCode(b);
      else if (b >= 0xC2 && b <= 0xDF) { st.needed = 1; st.cp = b & 0x1F; }
      else if (b >= 0xE0 && b <= 0xEF) { st.needed = 2; st.cp = b & 0x0F; if (b === 0xE0) st.lower = 0xA0; if (b === 0xED) st.upper = 0x9F; }
      else if (b >= 0xF0 && b <= 0xF4) { st.needed = 3; st.cp = b & 0x07; if (b === 0xF0) st.lower = 0x90; if (b === 0xF4) st.upper = 0x8F; }
      else { if (fatal) _encFatal(); out += '�'; }
      i++;
      continue;
    }
    if (b < st.lower || b > st.upper) { // invalid continuation: reset, reprocess b
      st.cp = 0; st.needed = 0; st.seen = 0; st.lower = 0x80; st.upper = 0xBF;
      if (fatal) _encFatal(); out += '�';
      continue; // do NOT advance i — reprocess this byte as a fresh lead
    }
    st.lower = 0x80; st.upper = 0xBF;
    st.cp = (st.cp << 6) | (b & 0x3F);
    i++; st.seen++;
    if (st.seen === st.needed) {
      const cp = st.cp;
      if (cp > 0xFFFF) { const s = cp - 0x10000; out += String.fromCharCode(0xD800 + (s >> 10), 0xDC00 + (s & 0x3FF)); }
      else out += String.fromCharCode(cp);
      st.cp = 0; st.needed = 0; st.seen = 0;
    }
  }
  if (flush && st.needed !== 0) {
    st.cp = 0; st.needed = 0; st.seen = 0; st.lower = 0x80; st.upper = 0xBF;
    if (fatal) _encFatal(); out += '�';
  }
  return out;
};
// utf-16 decoder (le/be) with unpaired-surrogate handling; `st` retains a pending
// odd byte and a pending lead surrogate across streaming calls.
const _decodeUtf16 = function(bytes, le, fatal, st, flush) {
  let out = '', i = 0;
  const nextUnit = function() {
    let b1;
    if (st.pend >= 0) { b1 = st.pend; st.pend = -1; }
    else { if (i >= bytes.length) return -1; b1 = bytes[i++]; }
    if (i >= bytes.length) { st.pend = b1; return -1; } // no second byte yet
    const b2 = bytes[i++];
    return le ? (b2 << 8) | b1 : (b1 << 8) | b2;
  };
  let unit;
  while ((unit = nextUnit()) >= 0) {
    if (st.lead !== null) {
      const l = st.lead; st.lead = null;
      if (unit >= 0xDC00 && unit <= 0xDFFF) { out += String.fromCharCode(l, unit); continue; }
      if (fatal) _encFatal(); out += '�'; // unpaired lead; reprocess unit below
    }
    if (unit >= 0xD800 && unit <= 0xDBFF) { st.lead = unit; continue; }
    if (unit >= 0xDC00 && unit <= 0xDFFF) { if (fatal) _encFatal(); out += '�'; continue; }
    out += String.fromCharCode(unit);
  }
  if (flush) {
    // WHATWG utf-16 decoder, end-of-queue: if EITHER a lead surrogate or a lead
    // (odd) byte is still pending, that is a SINGLE error — not one per pending
    // item ("does not produce more chars than truncated").
    if (st.lead !== null || st.pend >= 0) { st.lead = null; st.pend = -1; if (fatal) _encFatal(); out += '�'; }
  }
  return out;
};
const _decodeWin1252 = function(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += String.fromCharCode(b < 0x80 || b >= 0xA0 ? b : _WIN1252[b - 0x80]);
  }
  return out;
};

// Decode legacy encodings via encoding_rs (Rust op_text_decode). On a fatal
// malformed input the op throws a generic Error; surface it as the spec's
// TypeError. `name` is the already-resolved WHATWG encoding name.
const _decodeLegacy = function(name, bytes, fatal, stream) {
  try {
    return Deno.core.ops.op_text_decode(name, bytes, !!fatal, !!stream);
  } catch (e) {
    throw new TypeError("Failed to execute 'decode' on 'TextDecoder': The encoded data was not valid for encoding " + name + ".");
  }
};

if (typeof TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    get encoding() { return 'utf-8'; }
    encode(input) {
      const str = (input === undefined) ? '' : String(input);
      const buf = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF) {
          const next = str.charCodeAt(i + 1);
          if (next >= 0xDC00 && next <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (next - 0xDC00); i++; }
          else c = 0xFFFD; // unpaired high surrogate
        } else if (c >= 0xDC00 && c <= 0xDFFF) c = 0xFFFD; // unpaired low surrogate
        if (c < 0x80) buf.push(c);
        else if (c < 0x800) buf.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
        else if (c < 0x10000) buf.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
        else buf.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
      return new Uint8Array(buf);
    }
    encodeInto(source, dest) {
      source = (source === undefined) ? '' : String(source);
      if (!(dest instanceof Uint8Array)) throw new TypeError("Failed to execute 'encodeInto' on 'TextEncoder': argument 2 is not a Uint8Array.");
      const cap = dest.length;
      let read = 0, written = 0;
      for (let i = 0; i < source.length; i++) {
        let c = source.charCodeAt(i), units = 1;
        if (c >= 0xD800 && c <= 0xDBFF) {
          const next = source.charCodeAt(i + 1);
          if (next >= 0xDC00 && next <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (next - 0xDC00); units = 2; }
          else c = 0xFFFD;
        } else if (c >= 0xDC00 && c <= 0xDFFF) c = 0xFFFD;
        const need = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
        if (written + need > cap) break;
        if (c < 0x80) dest[written++] = c;
        else if (c < 0x800) { dest[written++] = 0xC0 | (c >> 6); dest[written++] = 0x80 | (c & 0x3F); }
        else if (c < 0x10000) { dest[written++] = 0xE0 | (c >> 12); dest[written++] = 0x80 | ((c >> 6) & 0x3F); dest[written++] = 0x80 | (c & 0x3F); }
        else { dest[written++] = 0xF0 | (c >> 18); dest[written++] = 0x80 | ((c >> 12) & 0x3F); dest[written++] = 0x80 | ((c >> 6) & 0x3F); dest[written++] = 0x80 | (c & 0x3F); }
        read += units;
        i += units - 1;
      }
      return { read, written };
    }
  };
  _markNative(TextEncoder); _markNative(TextEncoder.prototype.encode); _markNative(TextEncoder.prototype.encodeInto);
}
if (typeof TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    constructor(label, options) {
      const name = _getEncodingName(label === undefined ? 'utf-8' : label);
      // WHATWG: failure or the replacement encoding -> RangeError.
      if (!name || name === 'replacement')
        throw new RangeError("Failed to construct 'TextDecoder': The encoding label provided ('" + label + "') is invalid.");
      this._name = name;
      const o = (options == null) ? {} : options;
      this._fatal = !!o.fatal;
      this._ignoreBOM = !!o.ignoreBOM;
    }
    get encoding() { return this._name; }
    get fatal() { return this._fatal; }
    get ignoreBOM() { return this._ignoreBOM; }
    decode(input, options) {
      let bytes;
      if (input === undefined) bytes = new Uint8Array(0);
      else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
      else throw new TypeError("Failed to execute 'decode' on 'TextDecoder': The provided value is not of type '(ArrayBuffer or ArrayBufferView)'.");
      const stream = !!(options && options.stream);
      const name = this._name;
      // Reset decoder state when not continuing a previous streaming call.
      if (!this._doNotFlush) {
        this._u8 = { cp: 0, needed: 0, seen: 0, lower: 0x80, upper: 0xBF };
        this._u16 = { lead: null, pend: -1 };
        this._bomSeen = false;
        this._legacyBuf = null;
        this._legacyEmitted = 0;
      }
      this._doNotFlush = stream;
      const flush = !stream;
      // Legacy single-/multi-byte encodings: decode through encoding_rs (Rust op).
      // Streaming is stateless: accumulate the whole buffer and re-decode it each
      // call with last=!stream. With last=false encoding_rs holds back incomplete
      // trailing sequences, so the decode of a growing prefix only extends prior
      // output — we slice off the newly-emitted suffix to honour incremental
      // streaming (matches textdecoder-eof's stream:true Big5 cases).
      if (name !== 'utf-8' && name !== 'utf-16le' && name !== 'utf-16be' && name !== 'x-user-defined') {
        let buf;
        if (this._legacyBuf && this._legacyBuf.length) {
          buf = new Uint8Array(this._legacyBuf.length + bytes.length);
          buf.set(this._legacyBuf, 0); buf.set(bytes, this._legacyBuf.length);
        } else buf = bytes;
        this._legacyBuf = buf;
        const full = _decodeLegacy(name, buf, this._fatal, stream);
        const suffix = full.slice(this._legacyEmitted);
        if (stream) { this._legacyEmitted = full.length; return suffix; }
        this._legacyBuf = null; this._legacyEmitted = 0;
        return suffix;
      }
      let out;
      if (name === 'utf-16le') out = _decodeUtf16(bytes, true, this._fatal, this._u16, flush);
      else if (name === 'utf-16be') out = _decodeUtf16(bytes, false, this._fatal, this._u16, flush);
      else if (name === 'x-user-defined') { out = ''; for (let i = 0; i < bytes.length; i++) { const b = bytes[i]; out += String.fromCharCode(b < 0x80 ? b : 0xF780 + (b - 0x80)); } }
      else out = _decodeUtf8(bytes, this._fatal, this._u8, flush); // utf-8
      // BOM removal (utf-8 / utf-16): once, at the start of the stream, unless ignoreBOM.
      if (!this._ignoreBOM && (name === 'utf-8' || name === 'utf-16le' || name === 'utf-16be') && !this._bomSeen && out.length > 0) {
        if (out.charCodeAt(0) === 0xFEFF) out = out.slice(1);
        this._bomSeen = true;
      }
      return out;
    }
  };
  _markNative(TextDecoder); _markNative(TextDecoder.prototype.decode);
}

globalThis.matchMedia = _markNative(function matchMedia(q) { return { matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true;} }; });
globalThis.getComputedStyle = (el) => {
  if (!el) el = document.body || {};
  const style = el?.style || el?._style || new CSSStyleDeclaration();
  return new Proxy(style, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive || prop === Symbol.toStringTag) return undefined;
      if (prop in target) return target[prop];
      if (typeof prop === 'string') {
        const v = target.getPropertyValue ? target.getPropertyValue(prop) : '';
        if (v) return v;
        const defaults = {
          display: 'block', visibility: 'visible', opacity: '1',
          position: 'static', overflow: 'visible',
          transform: 'none', transition: 'none', animation: 'none',
          float: 'none', clear: 'none',
          width: 'auto', height: 'auto',
          top: 'auto', left: 'auto', right: 'auto', bottom: 'auto',
          margin: '0px', padding: '0px',
          'margin-top': '0px', 'margin-right': '0px', 'margin-bottom': '0px', 'margin-left': '0px',
          'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px',
          'font-size': '16px', 'line-height': 'normal', 'font-weight': '400',
          color: 'rgb(0, 0, 0)', 'background-color': 'rgba(0, 0, 0, 0)',
          'border-width': '0px', 'border-style': 'none', 'border-color': 'rgb(0, 0, 0)',
          'z-index': 'auto', 'pointer-events': 'auto',
          'box-sizing': 'content-box', cursor: 'auto',
        };
        const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        if (defaults[prop]) return defaults[prop];
        if (defaults[kebabProp]) return defaults[kebabProp];
        return '';
      }
      if (prop === 'getPropertyValue') {
        return (name) => {
          const v = target.getPropertyValue ? target.getPropertyValue(name) : '';
          if (v) return v;
          const defaults = {transform:'none',opacity:'1',display:'block',visibility:'visible'};
          return defaults[name] || defaults[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] || '';
        };
      }
      if (prop === 'length') return 0;
      return undefined;
    }
  });
};
globalThis.getSelection = _markNative(function getSelection() {
  return {
    rangeCount: 0,
    anchorNode: null, anchorOffset: 0,
    focusNode: null, focusOffset: 0,
    isCollapsed: true, type: 'None',
    removeAllRanges() { this.rangeCount = 0; },
    addRange(range) { this.rangeCount = 1; this._range = range; },
    getRangeAt(i) { return this._range || null; },
    collapse(node, offset) { this.anchorNode = node; this.anchorOffset = offset || 0; this.isCollapsed = true; },
    extend(node, offset) { this.focusNode = node; this.focusOffset = offset || 0; },
    selectAllChildren(node) {},
    deleteFromDocument() {},
    containsNode(node) { return false; },
    toString() { return ''; },
  };
});

globalThis.CSSStyleSheet = class CSSStyleSheet {
  constructor(options) {
    this.cssRules = [];
    this.ownerRule = null;
    this.disabled = false;
    this._rules = [];
  }
  insertRule(rule, index) {
    const idx = index ?? this._rules.length;
    this._rules.splice(idx, 0, { cssText: rule, type: 1 });
    this.cssRules = this._rules;
    return idx;
  }
  deleteRule(index) {
    this._rules.splice(index, 1);
    this.cssRules = this._rules;
  }
  addRule(selector, style, index) {
    return this.insertRule(selector + '{' + style + '}', index);
  }
  removeRule(index) { this.deleteRule(index); }
  replace(text) {
    this._rules = [{ cssText: text, type: 1 }];
    this.cssRules = this._rules;
    return Promise.resolve(this);
  }
  replaceSync(text) {
    this._rules = [{ cssText: text, type: 1 }];
    this.cssRules = this._rules;
  }
};

Object.defineProperty(Document.prototype, 'adoptedStyleSheets', {
  get() { return this._adoptedStyleSheets || []; },
  set(sheets) { this._adoptedStyleSheets = sheets; },
});

const __mutationObservers = [];
globalThis.MutationObserver = class MutationObserver {
  constructor(callback) {
    this._callback = callback;
    this._targets = [];   // [{target, options}]
    this._records = [];   // queued MutationRecords pending delivery
  }
  observe(target, options) {
    if (!target) return;
    const opts = options || {};
    // Normalise: characterData/attributes implied when *OldValue/attributeFilter set.
    if (opts.attributeOldValue || opts.attributeFilter) opts.attributes = true;
    if (opts.characterDataOldValue) opts.characterData = true;
    // Replace any existing registration for the same target node.
    this._targets = this._targets.filter(t => t.target._nid !== target._nid);
    this._targets.push({ target, options: opts });
    if (!__mutationObservers.includes(this)) __mutationObservers.push(this);
    // Phase 0c: turn on the Rust-authoritative mutation queue while observed
    // (idempotent). The Rust DOM now records every mutation regardless of which
    // code path made it; we drain it on delivery.
    _dom("set_mutation_recording", "1");
  }
  disconnect() {
    this._targets = [];
    this._records = [];
    const idx = __mutationObservers.indexOf(this);
    if (idx >= 0) __mutationObservers.splice(idx, 1);
    // Stop recording (and clear the queue) once nothing is observing.
    if (__mutationObservers.length === 0) _dom("set_mutation_recording", "0");
  }
  takeRecords() {
    const r = this._records.slice();
    this._records.length = 0;
    return r;
  }
  // Does record `rec` apply to any of this observer's registered targets?
  _matches(rec) {
    for (const t of this._targets) {
      const o = t.options;
      if (rec.type === 'childList' && !o.childList) continue;
      if (rec.type === 'attributes' && !o.attributes) continue;
      if (rec.type === 'characterData' && !o.characterData) continue;
      if (rec.type === 'attributes' && o.attributeFilter &&
          !o.attributeFilter.includes(rec.attributeName)) continue;
      if (t.target._nid === rec.target._nid) return t;
      if (o.subtree && t.target.contains && t.target.contains(rec.target)) return t;
    }
    return null;
  }
  _enqueue(rec) {
    const t = this._matches(rec);
    if (!t) return;
    const o = t.options;
    // Tailor record to what this observer asked for (oldValue is opt-in).
    const out = {
      type: rec.type,
      target: rec.target,
      addedNodes: rec.addedNodes,
      removedNodes: rec.removedNodes,
      previousSibling: rec.previousSibling,
      nextSibling: rec.nextSibling,
      attributeName: rec.type === 'attributes' ? rec.attributeName : null,
      attributeNamespace: null,
      oldValue: null,
    };
    if (rec.type === 'attributes' && o.attributeOldValue) out.oldValue = rec.oldValue ?? null;
    if (rec.type === 'characterData' && o.characterDataOldValue) out.oldValue = rec.oldValue ?? null;
    this._records.push(out);
    __scheduleMutationDelivery();
  }
};

// Deliver every observer's queued records on a microtask. Callbacks may mutate
// the DOM and produce new records, so loop (with a cap) until quiescent.
// Drain the Rust-authoritative mutation queue and fan each record out to the
// matching observers' pending queues. The Rust DOM is the single source of
// truth (Phase 0c), so this fires for mutations from ANY path — JS wrappers,
// CDP DOM-domain ops, fragment imports — not just JS-instrumented ones.
const __drainMutations = function() {
  if (!__mutationObservers.length) return;
  let raw;
  try { raw = JSON.parse(_dom("drain_mutations", "", "")); } catch (e) { return; }
  if (!raw || !raw.length) return;
  for (const m of raw) {
    const target = _wrap(m.target);
    if (!target) continue;
    const rec = {
      type: m.type, // 'childList' | 'attributes' | 'characterData'
      target: target,
      addedNodes: (m.addedNodes || []).map(nid => _wrap(nid)).filter(Boolean),
      removedNodes: (m.removedNodes || []).map(nid => _wrap(nid)).filter(Boolean),
      attributeName: m.attributeName ?? null,
      oldValue: m.oldValue ?? null,
      previousSibling: m.previousSibling != null ? _wrap(m.previousSibling) : null,
      nextSibling: m.nextSibling != null ? _wrap(m.nextSibling) : null,
    };
    for (const obs of __mutationObservers) obs._enqueue(rec);
  }
};

// Deliver every observer's queued records on a microtask. Drains the Rust queue
// first; callbacks may mutate the DOM (producing new records), so loop — with a
// cap — re-draining until quiescent.
let __mutationDeliveryScheduled = false;
const __scheduleMutationDelivery = function() {
  if (__mutationDeliveryScheduled) return;
  __mutationDeliveryScheduled = true;
  Promise.resolve().then(() => {
    __mutationDeliveryScheduled = false;
    let iterations = 0;
    let delivered;
    do {
      delivered = false;
      __drainMutations();
      for (const obs of __mutationObservers.slice()) {
        if (obs._records.length === 0) continue;
        const batch = obs._records.splice(0);
        delivered = true;
        try { obs._callback(batch, obs); } catch(e) { /* observer errors shouldn't propagate */ }
      }
    } while (delivered && ++iterations < 64);
  });
};

// A JS DOM mutation happened (the Rust tree already recorded it); just schedule
// a delivery tick, which drains the Rust queue. The (type, ...) args are kept
// for call-site compatibility but no longer used — Rust is the record source.
const __notifyMutation = function() {
  if (!__mutationObservers.length) return;
  // Drain the Rust queue NOW, while each observer's target list still reflects the
  // moment of this mutation, then schedule async delivery. Eager draining is what
  // lets a synchronous takeRecords() (as the classList tests do right after an op)
  // observe the record, and it discards mutations that no current observer targets
  // (e.g. a setAttribute before observe()) instead of leaking them later.
  __drainMutations();
  __scheduleMutationDelivery();
};

globalThis.ShadowRoot = class ShadowRoot {};
globalThis.customElements = {
  _registry: new Map(),
  define(name, cls, opts) { this._registry.set(name, cls); },
  get(name) { return this._registry.get(name); },
  whenDefined(name) { return Promise.resolve(this._registry.get(name)); },
  upgrade() {},
};
globalThis.NodeFilter = {
  SHOW_ALL: 0xFFFFFFFF,
  SHOW_ELEMENT: 0x1,
  SHOW_ATTRIBUTE: 0x2,
  SHOW_TEXT: 0x4,
  SHOW_CDATA_SECTION: 0x8,
  SHOW_ENTITY_REFERENCE: 0x10,
  SHOW_ENTITY: 0x20,
  SHOW_PROCESSING_INSTRUCTION: 0x40,
  SHOW_COMMENT: 0x80,
  SHOW_DOCUMENT: 0x100,
  SHOW_DOCUMENT_TYPE: 0x200,
  SHOW_DOCUMENT_FRAGMENT: 0x400,
  SHOW_NOTATION: 0x800,
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
};
globalThis.ResizeObserver = class { constructor(){} observe(){} unobserve(){} disconnect(){} };
globalThis.IntersectionObserver = class {
  constructor(callback) { this._callback = callback; }
  observe(el) {
    Promise.resolve().then(() => {
      this._callback([{
        target: el,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: el.getBoundingClientRect ? el.getBoundingClientRect() : {x:0,y:0,width:100,height:20},
        intersectionRect: el.getBoundingClientRect ? el.getBoundingClientRect() : {x:0,y:0,width:100,height:20},
        rootBounds: {x:0,y:0,width:1280,height:720},
      }], this);
    });
  }
  unobserve() {}
  disconnect() {}
};
// PerformanceObserver — the real implementation lives just after the `Performance`
// class + `globalThis.performance` are defined (it needs the entry buffer to read
// buffered entries and to be notified on mark()/measure()).

globalThis.Event = class Event {
  constructor(t,o) {
    o = (o == null) ? {} : o; // a null/undefined dictionary is the empty dictionary
    this.type = (t === undefined) ? "" : String(t);
    this.bubbles=!!o.bubbles;this.cancelable=!!o.cancelable;this.composed=!!o.composed;
    this.defaultPrevented=false;this.target=null;this.currentTarget=null;this.eventPhase=0;
    this.timeStamp=Date.now();
    this._propagationStopped=false;this._immediatePropagationStopped=false;
    this._isTrusted=false;this._dispatchFlag=false;this._composedPath=null;
    this._initialized=true; // constructed events are initialized; createEvent unsets this
  }
  // isTrusted is false for script-dispatched events; the engine marks UA-originated
  // events (e.g. a frame's load) trusted via the internal setter.
  get isTrusted() { return this._isTrusted === true; }
  set isTrusted(v) { this._isTrusted = !!v; }
  get srcElement() { return this.target; } // legacy alias for target
  // The frozen propagation path during dispatch; [] when not dispatching.
  composedPath() { return (this.currentTarget && this._composedPath) ? this._composedPath.slice() : []; }
  // Legacy aliases backed by the stop-propagation / canceled state.
  get cancelBubble() { return this._propagationStopped; }
  set cancelBubble(v) { if (v) this._propagationStopped = true; }
  get returnValue() { return !this.defaultPrevented; }
  set returnValue(v) { if (v === false && this.cancelable) this.defaultPrevented = true; }
  preventDefault() { if (this.cancelable) this.defaultPrevented=true; }
  stopPropagation(){ this._propagationStopped=true; }
  stopImmediatePropagation(){ this._propagationStopped=true; this._immediatePropagationStopped=true; }
  initEvent(type,bubbles,cancelable) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'initEvent': 1 argument required, but only 0 present.");
    if (this._dispatchFlag) return; // no-op while dispatching
    this._initialized=true;
    this.type = (type === undefined) ? "" : String(type);
    this.bubbles=!!bubbles;this.cancelable=!!cancelable;
    this.defaultPrevented=false;this._propagationStopped=false;this._immediatePropagationStopped=false;
    this._isTrusted=false;this.target=null;
  }
};
// eventPhase constants — on the interface object AND the prototype (so instances
// see them through the chain); testharness's `name in object` accepts inherited.
for (const [k, v] of [["NONE",0],["CAPTURING_PHASE",1],["AT_TARGET",2],["BUBBLING_PHASE",3]]) {
  Object.defineProperty(Event, k, { value: v, enumerable: true, writable: false, configurable: false });
  Object.defineProperty(Event.prototype, k, { value: v, enumerable: true, writable: false, configurable: false });
}
globalThis.CustomEvent = class extends Event {
  constructor(t,o={}) { super(t,o);this.detail=(o.detail !== undefined ? o.detail : null); }
  // Legacy DOM Level 2 init; some libraries (Starbucks China bundle, older
  // analytics shims) still call createEvent('CustomEvent') + initCustomEvent
  // instead of new CustomEvent(...). See issue #41.
  initCustomEvent(type,bubbles,cancelable,detail) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'initCustomEvent': 1 argument required, but only 0 present.");
    if (this._dispatchFlag) return;
    this._initialized = true;
    this.type = (type === undefined) ? "" : String(type);
    this.bubbles = !!bubbles;
    this.cancelable = !!cancelable;
    this.defaultPrevented = false;
    this._propagationStopped = false; this._immediatePropagationStopped = false;
    this._isTrusted = false; this.target = null;
    this.detail = (detail !== undefined ? detail : null);
  }
};
// Shared EventModifierInit getModifierState (Mouse/Keyboard).
const _modifierState = function(ev, key) {
  switch (key) {
    case 'Control': return !!ev.ctrlKey;
    case 'Shift': return !!ev.shiftKey;
    case 'Alt': return !!ev.altKey;
    case 'Meta': return !!ev.metaKey;
    case 'AltGraph': return !!ev.modifierAltGraph;
    case 'CapsLock': return !!ev.modifierCapsLock;
    case 'NumLock': return !!ev.modifierNumLock;
    default: return false;
  }
};
// UIEvent — base for the visual/input event interfaces (view, detail). Defined
// before its subclasses (MouseEvent etc.) so `extends UIEvent` resolves.
globalThis.UIEvent = class UIEvent extends Event {
  constructor(t,o) {
    o = (o == null) ? {} : o;
    super(t,o);
    let view = (o.view !== undefined) ? o.view : null;
    // WebIDL: view is Window? — a non-object, non-null value can't convert.
    if (view !== null && typeof view !== 'object')
      throw new TypeError("Failed to construct 'UIEvent': member view is not a Window.");
    this.view = view;
    this.detail = (o.detail != null) ? o.detail : 0;
  }
  initUIEvent(type, bubbles, cancelable, view, detail) {
    this.initEvent(type, bubbles, cancelable);
    this.view = view !== undefined ? view : null;
    this.detail = detail !== undefined ? detail : 0;
  }
};
globalThis.MouseEvent = class MouseEvent extends UIEvent {
  constructor(t,o) {
    o = (o == null) ? {} : o;
    super(t,o);
    this.screenX = o.screenX ?? 0;
    this.screenY = o.screenY ?? 0;
    this.clientX = o.clientX ?? 0;
    this.clientY = o.clientY ?? 0;
    this.ctrlKey = !!o.ctrlKey;
    this.shiftKey = !!o.shiftKey;
    this.altKey = !!o.altKey;
    this.metaKey = !!o.metaKey;
    this.button = o.button ?? 0;
    this.buttons = o.buttons ?? 0;
    this.relatedTarget = o.relatedTarget ?? null;
    // Legacy/derived coordinates (best-effort; no layout box here).
    this.pageX = this.clientX; this.pageY = this.clientY;
    this.x = this.clientX; this.y = this.clientY;
    this.offsetX = 0; this.offsetY = 0;
    this.movementX = o.movementX ?? 0; this.movementY = o.movementY ?? 0;
  }
  getModifierState(k) { return _modifierState(this, k); }
};
globalThis.WheelEvent = class WheelEvent extends MouseEvent {
  constructor(t,o) {
    o = (o == null) ? {} : o;
    super(t,o);
    this.deltaX = o.deltaX ?? 0;
    this.deltaY = o.deltaY ?? 0;
    this.deltaZ = o.deltaZ ?? 0;
    this.deltaMode = o.deltaMode ?? 0;
  }
};
globalThis.KeyboardEvent = class KeyboardEvent extends UIEvent {
  constructor(t,o) {
    o = (o == null) ? {} : o;
    super(t,o);
    this.ctrlKey = !!o.ctrlKey;
    this.shiftKey = !!o.shiftKey;
    this.altKey = !!o.altKey;
    this.metaKey = !!o.metaKey;
    this.key = o.key !== undefined ? String(o.key) : "";
    this.code = o.code !== undefined ? String(o.code) : "";
    this.location = o.location ?? 0;
    this.repeat = !!o.repeat;
    this.isComposing = !!o.isComposing;
    this.charCode = o.charCode ?? 0;
    this.keyCode = o.keyCode ?? 0;
    this.which = o.which ?? 0;
  }
  getModifierState(k) { return _modifierState(this, k); }
};
globalThis.FocusEvent = class FocusEvent extends UIEvent {
  constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.relatedTarget = o.relatedTarget ?? null; }
};
globalThis.CompositionEvent = class CompositionEvent extends UIEvent {
  constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.data = o.data !== undefined ? String(o.data) : ""; }
};
globalThis.InputEvent = class InputEvent extends UIEvent {
  constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.data = o.data !== undefined ? o.data : null; this.inputType = o.inputType || ""; this.isComposing = !!o.isComposing; }
};
globalThis.ErrorEvent = class extends Event { constructor(t,o) { o = (o == null) ? {} : o; super(t,o);this.message=o.message||"";this.filename=o.filename||"";this.lineno=o.lineno||0;this.colno=o.colno||0;this.error=o.error??null; } };
globalThis.PointerEvent = class PointerEvent extends MouseEvent {
  constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.pointerId=o.pointerId??0; this.pointerType=o.pointerType||""; this.isPrimary=!!o.isPrimary; this.pressure=o.pressure??0; this.width=o.width??1; this.height=o.height??1; }
};
globalThis.AnimationEvent = class extends Event { constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.animationName=o.animationName||""; this.elapsedTime=o.elapsedTime??0; this.pseudoElement=o.pseudoElement||""; } };
globalThis.TransitionEvent = class extends Event { constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.propertyName=o.propertyName||""; this.elapsedTime=o.elapsedTime??0; this.pseudoElement=o.pseudoElement||""; } };
globalThis.PopStateEvent = class extends Event { constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.state=o.state??null; } };
globalThis.HashChangeEvent = class extends Event { constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.oldURL=o.oldURL||""; this.newURL=o.newURL||""; } };
globalThis.MessageEvent = class extends Event { constructor(t,o) { o = (o == null) ? {} : o; super(t,o);this.data=o.data??null;this.origin=o.origin||"";this.lastEventId=o.lastEventId||"";this.source=o.source??null;this.ports=o.ports||[]; } };
globalThis.ClipboardEvent = class extends Event { constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.clipboardData=o.clipboardData??null; } };
globalThis.SubmitEvent = class extends Event { constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.submitter=o.submitter??null; } };
globalThis.ProgressEvent = class ProgressEvent extends Event { constructor(t,o) { o = (o == null) ? {} : o; super(t,o); this.lengthComputable=!!o.lengthComputable; this.loaded=o.loaded??0; this.total=o.total??0; } };

const _abortError = function(name, msg) { if (typeof DOMException === 'function') return new DOMException(msg, name); const e = new Error(msg); e.name = name; return e; };
globalThis.AbortSignal = class AbortSignal {
  constructor() { this.aborted = false; this.reason = undefined; this.onabort = null; this._listeners = []; }
  addEventListener(type, fn) { if (type === 'abort' && typeof fn === 'function') this._listeners.push(fn); }
  removeEventListener(type, fn) { if (type === 'abort') { const i = this._listeners.indexOf(fn); if (i >= 0) this._listeners.splice(i, 1); } }
  dispatchEvent(ev) { const type = ev && ev.type; if (type === 'abort') { const list = this._listeners.slice(); for (const fn of list) { try { fn.call(this, ev); } catch (e) {} } if (typeof this.onabort === 'function') { try { this.onabort.call(this, ev); } catch (e) {} } } return true; }
  throwIfAborted() { if (this.aborted) throw (this.reason !== undefined ? this.reason : _abortError('AbortError', 'The operation was aborted')); }
  _fireAbort() { const ev = (typeof Event === 'function') ? new Event('abort') : { type: 'abort' }; this.dispatchEvent(ev); }
  static abort(reason) { const s = new AbortSignal(); s.aborted = true; s.reason = (reason !== undefined ? reason : _abortError('AbortError', 'The operation was aborted')); return s; }
  static timeout(ms) { const s = new AbortSignal(); setTimeout(() => { if (!s.aborted) { s.aborted = true; s.reason = _abortError('TimeoutError', 'The operation timed out'); s._fireAbort(); } }, ms); return s; }
  static any(signals) { const s = new AbortSignal(); const arr = Array.from(signals || []); for (const inp of arr) { if (inp && inp.aborted) { s.aborted = true; s.reason = inp.reason; return s; } } const onAbort = function() { if (!s.aborted) { s.aborted = true; s.reason = this.reason; s._fireAbort(); } }; for (const inp of arr) { if (inp && typeof inp.addEventListener === 'function') inp.addEventListener('abort', onAbort); } return s; }
};
globalThis.AbortController = class AbortController {
  constructor() { this.signal = new AbortSignal(); }
  abort(reason) { if (this.signal.aborted) return; this.signal.aborted = true; this.signal.reason = (reason !== undefined ? reason : _abortError('AbortError', 'The operation was aborted')); this.signal._fireAbort(); }
};
_markNative(AbortSignal); _markNative(AbortSignal.abort); _markNative(AbortSignal.timeout); _markNative(AbortSignal.any);
_markNative(AbortSignal.prototype.addEventListener); _markNative(AbortSignal.prototype.removeEventListener); _markNative(AbortSignal.prototype.dispatchEvent); _markNative(AbortSignal.prototype.throwIfAborted);
_markNative(AbortController); _markNative(AbortController.prototype.abort);
// Base64 over raw bytes (for FileReader.readAsDataURL).
const _B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const _b64FromBytes = function(b) {
  let r = "";
  for (let i = 0; i < b.length; i += 3) {
    const a = b[i], bb = b[i + 1], cc = b[i + 2];
    r += _B64[a >> 2] + _B64[((a & 3) << 4) | ((bb ?? 0) >> 4)] +
         (i + 1 < b.length ? _B64[((bb & 15) << 2) | ((cc ?? 0) >> 6)] : "=") +
         (i + 2 < b.length ? _B64[cc & 63] : "=");
  }
  return r;
};
// Platform-native line ending, matching what the page would compute from navigator.platform.
const _nativeEOL = (typeof navigator !== 'undefined' && navigator.platform && String(navigator.platform).startsWith('Win')) ? '\r\n' : '\n';
// A blob/file type string is normalized: blanked if it contains a non-printable-ASCII
// char, then ASCII-lowercased.
const _normalizeBlobType = function(t) {
  if (t === undefined) return '';
  t = String(t);
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c < 0x20 || c > 0x7E) return ''; }
  return t.toLowerCase();
};
const _blobPartsToBytes = function(parts, endings) {
  const chunks = [];
  let total = 0;
  for (const part of parts) {
    let chunk;
    if (part instanceof Blob) chunk = part._bytes;
    else if (ArrayBuffer.isView(part)) chunk = new Uint8Array(part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength));
    else if (part instanceof ArrayBuffer) chunk = new Uint8Array(part.slice(0));
    else { let s = String(part); if (endings === 'native') s = s.replace(/\r\n|\r|\n/g, _nativeEOL); chunk = new TextEncoder().encode(s); }
    chunks.push(chunk); total += chunk.length;
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return merged;
};
if (typeof Blob === "undefined") {
  globalThis.Blob = class Blob {
    // Rest param so Blob.length === 0 (all WebIDL arguments are optional).
    constructor(...args) {
      let blobParts = args.length > 0 ? args[0] : undefined;
      const options = args[1];
      if (blobParts === undefined) blobParts = [];
      // WebIDL sequence: the value must be an Object (a primitive string is iterable
      // but still rejected), and it must be iterable.
      else if (Object(blobParts) !== blobParts || typeof blobParts[Symbol.iterator] !== 'function')
        throw new TypeError("Failed to construct 'Blob': The provided value cannot be converted to a sequence.");
      // WebIDL dictionary: a non-nullish, non-object options value is a TypeError.
      if (options !== undefined && options !== null && Object(options) !== options)
        throw new TypeError("Failed to construct 'Blob': The provided value is not of type 'BlobPropertyBag'.");
      const opts = (options == null) ? {} : options;
      let endings = opts.endings === undefined ? 'transparent' : String(opts.endings);
      if (endings !== 'transparent' && endings !== 'native')
        throw new TypeError("Failed to construct 'Blob': The provided value '" + endings + "' is not a valid enum value of type EndingType.");
      this._bytes = _blobPartsToBytes(Array.from(blobParts), endings);
      this._type = _normalizeBlobType(opts.type);
    }
    get size() { return this._bytes.length; }
    get type() { return this._type; }
    get [Symbol.toStringTag]() { return 'Blob'; }
    slice(start, end, contentType) {
      const len = this._bytes.length;
      let s = start === undefined ? 0 : Math.trunc(start) || 0;
      let e = end === undefined ? len : Math.trunc(end) || 0;
      s = s < 0 ? Math.max(len + s, 0) : Math.min(s, len);
      e = e < 0 ? Math.max(len + e, 0) : Math.min(e, len);
      const out = new Blob([]);
      out._bytes = this._bytes.slice(s, Math.max(e, s));
      out._type = _normalizeBlobType(contentType);
      return out;
    }
    async text() { return new TextDecoder('utf-8').decode(this._bytes); }
    async arrayBuffer() { return this._bytes.buffer.slice(this._bytes.byteOffset, this._bytes.byteOffset + this._bytes.byteLength); }
    async bytes() { return this._bytes.slice(); }
    stream() {
      const bytes = this._bytes;
      if (typeof ReadableStream === 'function') {
        return new ReadableStream({ start(c) { if (bytes.length) c.enqueue(bytes.slice()); c.close(); } });
      }
      return undefined;
    }
  };
  _markNative(Blob); _markNative(Blob.prototype.slice); _markNative(Blob.prototype.text);
  _markNative(Blob.prototype.arrayBuffer); _markNative(Blob.prototype.bytes);
}
if (typeof File === "undefined") {
  globalThis.File = class File extends Blob {
    // ...rest keeps File.length === 2 (fileBits + fileName required).
    constructor(fileBits, fileName, ...rest) {
      if (arguments.length < 2)
        throw new TypeError("Failed to construct 'File': 2 arguments required, but only " + arguments.length + " present.");
      const options = rest[0];
      super(fileBits, options);
      this._name = String(fileName);
      const opts = (options == null) ? {} : options;
      this._lastModified = opts.lastModified !== undefined ? Number(opts.lastModified) : Date.now();
    }
    get name() { return this._name; }
    get lastModified() { return this._lastModified; }
    get [Symbol.toStringTag]() { return 'File'; }
  };
  _markNative(File);
}
if (typeof FormData === "undefined") globalThis.FormData = class FormData { constructor(){this._d=[];} append(k,v){this._d.push([String(k),String(v)]);} get(k){const e=this._d.find(([a])=>a===String(k));return e?e[1]:null;} getAll(k){return this._d.filter(([a])=>a===String(k)).map(([,v])=>v);} has(k){return this._d.some(([a])=>a===String(k));} set(k,v){this.delete(k);this.append(k,v);} delete(k){this._d=this._d.filter(([a])=>a!==String(k));} keys(){return this._d.map(([k])=>k)[Symbol.iterator]();} values(){return this._d.map(([,v])=>v)[Symbol.iterator]();} entries(){return this._d.map(([k,v])=>[k,v])[Symbol.iterator]();} [Symbol.iterator](){return this.entries();} forEach(cb){this._d.forEach(([k,v])=>cb(v,k,this));} };
// decodeURIComponent throws on a malformed % sequence; WHATWG form/percent
// decoding keeps invalid sequences literal. Best-effort + never throws.
const _safeDecodeURIComponent = function(s) {
  try { return decodeURIComponent(s); }
  catch (e) {
    return String(s).replace(/%[0-9A-Fa-f]{2}/g, m => { try { return decodeURIComponent(m); } catch (_) { return m; } });
  }
};
// application/x-www-form-urlencoded byte serializer (WHATWG): space -> '+', the
// set *-._0-9A-Za-z stays literal, everything else is %XX (uppercase).
const _formEncode = function(s) {
  const bytes = unescape(encodeURIComponent(String(s)));
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes.charCodeAt(i);
    if (c === 0x20) out += '+';
    else if (c === 0x2A || c === 0x2D || c === 0x2E || c === 0x5F ||
             (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A))
      out += String.fromCharCode(c);
    else out += '%' + c.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
};
// Form decode: '+' -> space, then percent-decode (best-effort, never throws).
const _formDecode = function(s) { return _safeDecodeURIComponent(String(s).replace(/\+/g, ' ')); };

if (typeof URLSearchParams === "undefined") globalThis.URLSearchParams = class URLSearchParams {
  constructor(init = "") {
    this._p = [];   // list of [name, value]
    this._url = null; // back-ref to an owning URL for two-way sync (set by URL)
    if (typeof init === 'string') {
      this._parseString(init);
    } else if (init instanceof URLSearchParams) {
      this._p = init._p.map(([k, v]) => [k, v]);
    } else if (init && typeof init[Symbol.iterator] === 'function') {
      for (const pair of init) {
        const a = Array.from(pair);
        if (a.length !== 2) throw new TypeError("Failed to construct 'URLSearchParams': Invalid tuple");
        this._p.push([String(a[0]), String(a[1])]);
      }
    } else if (init && (typeof init === 'object' || typeof init === 'function')) {
      // Record init: own enumerable string keys (functions are objects too).
      for (const k of Object.keys(init)) this._p.push([String(k), String(init[k])]);
    }
  }
  // application/x-www-form-urlencoded parser.
  _parseString(s) {
    s = String(s).replace(/^\?/, '');
    if (!s) return;
    for (const piece of s.split('&')) {
      if (!piece) continue;
      const eq = piece.indexOf('=');
      const name = eq === -1 ? piece : piece.slice(0, eq);
      const value = eq === -1 ? '' : piece.slice(eq + 1);
      this._p.push([_formDecode(name), _formDecode(value)]);
    }
  }
  _setList(s) { this._p = []; this._parseString(s); }       // refresh w/o back-update
  _update() { if (this._url) this._url._setSearchFromParams(this.toString()); }
  get size() { return this._p.length; }
  append(k, v) { this._p.push([String(k), String(v)]); this._update(); }
  delete(k, v) {
    k = String(k);
    this._p = (v === undefined)
      ? this._p.filter(([key]) => key !== k)
      : this._p.filter(([key, val]) => !(key === k && val === String(v)));
    this._update();
  }
  get(k) { k = String(k); const p = this._p.find(([key]) => key === k); return p ? p[1] : null; }
  getAll(k) { k = String(k); return this._p.filter(([key]) => key === k).map(([, v]) => v); }
  has(k, v) {
    k = String(k);
    return v === undefined ? this._p.some(([key]) => key === k)
                           : this._p.some(([key, val]) => key === k && val === String(v));
  }
  set(k, v) {
    k = String(k); v = String(v);
    let done = false; const next = [];
    for (const [key, val] of this._p) {
      if (key === k) { if (!done) { next.push([k, v]); done = true; } }
      else next.push([key, val]);
    }
    if (!done) next.push([k, v]);
    this._p = next; this._update();
  }
  sort() {
    this._p = this._p
      .map((pair, i) => [pair, i])
      .sort((a, b) => (a[0][0] < b[0][0] ? -1 : a[0][0] > b[0][0] ? 1 : a[1] - b[1]))
      .map(([pair]) => pair);
    this._update();
  }
  forEach(cb, thisArg) {
    // Spec: a live index walk — entries appended during iteration are visited,
    // and deletions shift subsequent indices (not a snapshot).
    for (let i = 0; i < this._p.length; i++) { const [k, v] = this._p[i]; cb.call(thisArg, v, k, this); }
  }
  *keys() { for (let i = 0; i < this._p.length; i++) yield this._p[i][0]; }
  *values() { for (let i = 0; i < this._p.length; i++) yield this._p[i][1]; }
  *entries() { for (let i = 0; i < this._p.length; i++) { const p = this._p[i]; yield [p[0], p[1]]; } }
  [Symbol.iterator]() { return this.entries(); }
  toString() { return this._p.map(([k, v]) => _formEncode(k) + '=' + _formEncode(v)).join('&'); }
};

// Namespace of the error document Gecko/Blink build for non-well-formed XML; the
// WPT DOMParser-parseFromString-xml tests assert on it by name.
const _PARSERERROR_NS = "http://www.mozilla.org/newlayout/xml/parsererror.xml";

// ===========================================================================
// A real, namespace-aware XML parser (DOMParser text/xml & friends).
//
// html5ever is an HTML parser — it lowercases tag names and forces the HTML
// namespace, so `<foo/>` could never get namespaceURI===null through it. This
// hand-rolled parser tokenizes XML, tracks xmlns scope, and builds the DOM via
// the real createElementNS / setAttributeNS machinery (so the selector engine,
// getElementsByTagName and the XMLSerializer all see true namespaces). On a
// well-formedness error it reports failure so the caller can build a
// `parsererror` document, matching browsers.
//
// Returns { ok:true, nodes:[...] } (document-level children, in order) or
// { ok:false, message }.
// ===========================================================================
function _parseXMLDocument(src, doc) {
  const s = String(src);
  const N = s.length;
  let i = 0;
  const out = [];
  // Namespace scope stack: each frame maps prefix -> namespace URI ('' = the
  // default namespace). The base frame carries the two built-in prefixes.
  const NSStack = [Object.assign(Object.create(null), { '': null, xml: _XML_NS, xmlns: _XMLNS_NS })];
  const resolve = (prefix) => {
    for (let k = NSStack.length - 1; k >= 0; k--) if (prefix in NSStack[k]) return NSStack[k][prefix];
    return undefined;
  };
  const fail = (msg) => { throw { __xmlwf: true, message: msg || 'not well-formed' }; };
  const isWS = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const isNameStart = (c) => /[A-Za-z_:]/.test(c) || c.charCodeAt(0) >= 0x80;
  const isNameChar = (c) => isNameStart(c) || c === '-' || c === '.' || (c >= '0' && c <= '9') || c === '·';
  const skipWS = () => { while (i < N && isWS(s[i])) i++; };
  const readName = () => {
    if (i >= N || !isNameStart(s[i])) fail('expected name');
    const start = i; i++;
    while (i < N && isNameChar(s[i])) i++;
    return s.slice(start, i);
  };
  const splitQName = (qn) => { const c = qn.indexOf(':'); return c < 0 ? { prefix: null, local: qn } : { prefix: qn.slice(0, c), local: qn.slice(c + 1) }; };
  const decode = (str) => {
    if (str.indexOf('&') < 0) return str;
    return str.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, e) => {
      if (e[0] === '#') {
        const cp = (e[1] === 'x' || e[1] === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(cp); } catch (_) { return m; }
      }
      switch (e) { case 'amp': return '&'; case 'lt': return '<'; case 'gt': return '>'; case 'quot': return '"'; case 'apos': return "'"; }
      return m; // unknown entity — leave literal (lenient)
    });
  };

  const parsePI = (parent) => {
    i += 2; // '<?'
    const target = readName();
    skipWS();
    const e = s.indexOf('?>', i);
    if (e < 0) fail('unterminated processing instruction');
    const data = s.slice(i, e);
    i = e + 2;
    try { parent.appendChild(doc.createProcessingInstruction(target, data)); } catch (_) { /* invalid PI target — drop */ }
  };

  const parseElement = () => {
    i++; // '<'
    const qname = readName();
    const rawAttrs = [];
    const seen = Object.create(null);
    let selfClose = false;
    while (true) {
      const hadWS = i < N && isWS(s[i]);
      skipWS();
      if (i >= N) fail('eof in start tag');
      const c = s[i];
      if (c === '>') { i++; break; }
      if (c === '/') { i++; if (s[i] !== '>') fail('expected >'); i++; selfClose = true; break; }
      if (!hadWS) fail('expected whitespace before attribute');
      const an = readName();
      if (an in seen) fail('duplicate attribute');
      seen[an] = true;
      skipWS();
      if (s[i] !== '=') fail('expected =');
      i++; skipWS();
      const q = s[i];
      if (q !== '"' && q !== "'") fail('expected quote');
      i++;
      const vs = i;
      while (i < N && s[i] !== q) { if (s[i] === '<') fail('< in attribute value'); i++; }
      if (i >= N) fail('unterminated attribute value');
      const rv = s.slice(vs, i);
      i++; // closing quote
      rawAttrs.push([an, decode(rv)]);
    }
    // The element's own xmlns declarations are in scope for itself and its attrs.
    const frame = Object.create(null);
    for (const [an, av] of rawAttrs) {
      if (an === 'xmlns') frame[''] = (av === '' ? null : av);
      else if (an.lastIndexOf('xmlns:', 0) === 0) { const p = an.slice(6); if (p) frame[p] = (av === '' ? null : av); }
    }
    NSStack.push(frame);
    const eq = splitQName(qname);
    let ens;
    if (eq.prefix === null) ens = resolve('');
    else { ens = resolve(eq.prefix); if (ens === undefined || ens === null) fail('undeclared prefix ' + eq.prefix); }
    if (ens === undefined) ens = null;
    const el = doc.createElementNS(ens, qname);
    for (const [an, av] of rawAttrs) {
      if (an === 'xmlns') el.setAttributeNS(_XMLNS_NS, 'xmlns', av);
      else if (an.lastIndexOf('xmlns:', 0) === 0) el.setAttributeNS(_XMLNS_NS, an, av);
      else {
        const aq = splitQName(an);
        if (aq.prefix === null) el.setAttributeNS(null, an, av); // unprefixed attrs are in no namespace
        else { const ans = resolve(aq.prefix); if (ans === undefined || ans === null) fail('undeclared attribute prefix ' + aq.prefix); el.setAttributeNS(ans, an, av); }
      }
    }
    if (!selfClose) parseContent(el, qname);
    NSStack.pop();
    return el;
  };

  function parseContent(el, qname) {
    let text = '';
    const flush = () => { if (text.length) { el.appendChild(doc.createTextNode(decode(text))); text = ''; } };
    while (i < N) {
      if (s[i] === '<') {
        if (s.startsWith('<!--', i)) { flush(); const e = s.indexOf('-->', i + 4); if (e < 0) fail('unterminated comment'); el.appendChild(doc.createComment(s.slice(i + 4, e))); i = e + 3; continue; }
        if (s.startsWith('<![CDATA[', i)) { flush(); const e = s.indexOf(']]>', i + 9); if (e < 0) fail('unterminated CDATA section'); el.appendChild(doc.createCDATASection(s.slice(i + 9, e))); i = e + 3; continue; }
        if (s.startsWith('<?', i)) { flush(); parsePI(el); continue; }
        if (s.startsWith('</', i)) {
          flush(); i += 2;
          const en = readName(); skipWS();
          if (s[i] !== '>') fail('malformed end tag'); i++;
          if (en !== qname) fail('mismatched end tag');
          return;
        }
        flush(); el.appendChild(parseElement()); continue;
      }
      text += s[i]; i++;
    }
    fail('unexpected end of input, expected </' + qname + '>');
  }

  try {
    if (s[i] === '﻿') i++;
    skipWS();
    // XML declaration (not a node).
    if (s.startsWith('<?xml', i) && (i + 5 >= N || isWS(s[i + 5]) || s[i + 5] === '?')) {
      const e = s.indexOf('?>', i);
      if (e < 0) fail('unterminated XML declaration');
      i = e + 2;
    }
    let root = null;
    while (i < N) {
      skipWS();
      if (i >= N) break;
      if (s[i] !== '<') fail(root ? 'text after document element' : 'content before document element');
      if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i + 4); if (e < 0) fail('unterminated comment'); out.push(doc.createComment(s.slice(i + 4, e))); i = e + 3; continue; }
      if (s.startsWith('<!DOCTYPE', i)) { const e = s.indexOf('>', i); if (e < 0) fail('unterminated doctype'); i = e + 1; continue; }
      if (s.startsWith('<?', i)) { parsePI({ appendChild: (n) => out.push(n) }); continue; }
      if (s.startsWith('</', i)) fail('unexpected end tag');
      if (root) fail('more than one document element');
      root = parseElement();
      out.push(root);
    }
    if (!root) fail('no document element');
    return { ok: true, nodes: out };
  } catch (err) {
    // A real well-formedness error OR a DOMException from createElementNS /
    // setAttributeNS (e.g. an invalid name) → not well-formed.
    return { ok: false, message: (err && err.message) || 'not well-formed' };
  }
}

// ===========================================================================
// XMLSerializer — the W3C "DOM Parsing and Serialization" XML serialization
// algorithm (namespace prefix map, prefix generation, xmlns reset/redundancy).
// ===========================================================================
const _XML_VOID = new Set('area base basefont bgsound br col embed frame hr img input keygen link menuitem meta param source track wbr'.split(' '));
const _xmlAttrList = (node) => {
  if (node == null || node._nid == null) return [];
  return (_domParse('attribute_list', node._nid) || []).map((r) => ({
    namespaceURI: (r.ns == null || r.ns === '') ? null : r.ns,
    prefix: (r.prefix == null || r.prefix === '') ? null : r.prefix,
    localName: r.local,
    value: r.value == null ? '' : r.value,
  }));
};
const _xmlMapCopy = (m) => { const n = new Map(); for (const [k, v] of m) n.set(k, v.slice()); return n; };
const _xmlMapAdd = (m, ns, prefix) => { const l = m.get(ns); if (l) l.push(prefix); else m.set(ns, [prefix]); };
const _xmlMapFound = (m, ns, prefix) => { const l = m.get(ns); return !!l && l.indexOf(prefix) >= 0; };
const _xmlRetrievePrefix = (m, preferred, ns) => {
  const l = m.get(ns);
  if (!l) return null;
  let cand = null;
  for (const p of l) { cand = p; if (p === preferred) return p; }
  return cand;
};
const _xmlGenPrefix = (m, ns, idx) => { const gp = 'ns' + idx.value; idx.value += 1; _xmlMapAdd(m, ns, gp); return gp; };
const _xmlEscText = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const _xmlEscAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');

const _xmlRecordNS = (node, map, localPrefixesMap) => {
  let dflt = null;
  for (const a of _xmlAttrList(node)) {
    if (a.namespaceURI !== _XMLNS_NS) continue;
    if (a.prefix === null) { dflt = a.value; continue; } // xmlns="..."
    const prefixDef = a.localName;
    let nsDef = a.value;
    if (nsDef === _XML_NS) continue;
    if (nsDef === '') nsDef = null;
    if (_xmlMapFound(map, nsDef, prefixDef)) continue;
    _xmlMapAdd(map, nsDef, prefixDef);
    localPrefixesMap[prefixDef] = (nsDef === null ? '' : nsDef);
  }
  return dflt;
};

const _xmlSerAttrs = (node, map, idx, localPrefixesMap, ignoreNsDefAttr) => {
  let result = '';
  const elNs = node.namespaceURI == null ? null : node.namespaceURI;
  for (const attr of _xmlAttrList(node)) {
    const attributeNamespace = attr.namespaceURI;
    // A no-namespace attribute literally named "xmlns" acts as a default-namespace
    // declaration; browsers drop it when it disagrees with the element's real
    // namespace ("Drop inconsistent xmlns by matching on local name").
    if (attributeNamespace === null && attr.prefix === null && attr.localName === 'xmlns') {
      const declVal = attr.value === '' ? null : attr.value;
      if (elNs !== declVal) continue;
    }
    let candidatePrefix = null;
    if (attributeNamespace !== null) {
      candidatePrefix = _xmlRetrievePrefix(map, attr.prefix, attributeNamespace);
      if (attributeNamespace === _XMLNS_NS) {
        if (attr.value === _XML_NS ||
            (attr.prefix === null && ignoreNsDefAttr) ||
            (attr.prefix !== null &&
              (!(attr.localName in localPrefixesMap) || localPrefixesMap[attr.localName] !== attr.value) &&
              _xmlMapFound(map, attr.value, attr.localName))) {
          continue;
        }
        if (attr.prefix === 'xmlns') candidatePrefix = 'xmlns';
      } else if (candidatePrefix === null) {
        candidatePrefix = _xmlGenPrefix(map, attributeNamespace, idx);
        result += ' xmlns:' + candidatePrefix + '="' + _xmlEscAttr(attributeNamespace) + '"';
      }
    }
    result += ' ';
    if (candidatePrefix !== null) result += candidatePrefix + ':';
    result += attr.localName + '="' + _xmlEscAttr(attr.value) + '"';
  }
  return result;
};

const _xmlSerElement = (node, namespace, prefixMap, idx) => {
  let markup = '<';
  let qualifiedName = '';
  let skipEndTag = false;
  let ignoreNsDefAttr = false;
  const map = _xmlMapCopy(prefixMap);
  const localPrefixesMap = Object.create(null);
  const localDefaultNamespace = _xmlRecordNS(node, map, localPrefixesMap);
  let inheritedNs = namespace;
  const ns = node.namespaceURI == null ? null : node.namespaceURI;

  if (inheritedNs === ns) {
    if (localDefaultNamespace !== null) ignoreNsDefAttr = true;
    qualifiedName = (ns === _XML_NS) ? 'xml:' + node.localName : node.localName;
    markup += qualifiedName;
  } else {
    let prefix = node.prefix;
    let candidatePrefix = _xmlRetrievePrefix(map, prefix, ns);
    if (prefix === 'xmlns') candidatePrefix = 'xmlns';
    if (candidatePrefix !== null) {
      qualifiedName = candidatePrefix + ':' + node.localName;
      if (localDefaultNamespace !== null && localDefaultNamespace !== _XML_NS) {
        inheritedNs = localDefaultNamespace === '' ? null : localDefaultNamespace;
      }
      markup += qualifiedName;
    } else if (prefix !== null) {
      if (prefix in localPrefixesMap) prefix = _xmlGenPrefix(map, ns, idx);
      else _xmlMapAdd(map, ns, prefix);
      qualifiedName = prefix + ':' + node.localName;
      markup += qualifiedName + ' xmlns:' + prefix + '="' + _xmlEscAttr(ns == null ? '' : ns) + '"';
      if (localDefaultNamespace !== null) inheritedNs = localDefaultNamespace === '' ? null : localDefaultNamespace;
    } else if (localDefaultNamespace === null || localDefaultNamespace !== ns) {
      ignoreNsDefAttr = true;
      qualifiedName = node.localName;
      inheritedNs = ns;
      markup += qualifiedName + ' xmlns="' + _xmlEscAttr(ns == null ? '' : ns) + '"';
    } else {
      qualifiedName = node.localName;
      inheritedNs = ns;
      markup += qualifiedName;
    }
  }

  markup += _xmlSerAttrs(node, map, idx, localPrefixesMap, ignoreNsDefAttr);

  const isHTML = ns === _HTML_NS;
  const kids = node.childNodes;
  const empty = !kids || kids.length === 0;
  if (isHTML && empty && _XML_VOID.has(node.localName)) { markup += ' /'; skipEndTag = true; }
  else if (!isHTML && empty) { markup += '/'; skipEndTag = true; }
  markup += '>';
  if (skipEndTag) return markup;
  for (let k = 0; k < kids.length; k++) markup += _xmlSerNode(kids[k], inheritedNs, map, idx);
  markup += '</' + qualifiedName + '>';
  return markup;
};

const _xmlSerDoctype = (node) => {
  let s = '<!DOCTYPE ' + (node.name || '');
  if (node.publicId) s += ' PUBLIC "' + node.publicId + '"';
  else if (node.systemId) s += ' SYSTEM';
  if (node.systemId) s += ' "' + node.systemId + '"';
  return s + '>';
};

function _xmlSerNode(node, namespace, map, idx) {
  if (!node) return '';
  switch (node.nodeType) {
    case 1: return _xmlSerElement(node, namespace, map, idx);
    case 3: return _xmlEscText(node.data != null ? node.data : (node.textContent || ''));
    case 4: return '<![CDATA[' + (node.data != null ? node.data : (node.textContent || '')) + ']]>';
    case 7: return '<?' + node.target + ' ' + (node.data || '') + '?>';
    case 8: return '<!--' + (node.data != null ? node.data : (node.textContent || '')) + '-->';
    case 9:
    case 11: {
      const kids = node.childNodes; let out = '';
      for (let k = 0; k < kids.length; k++) out += _xmlSerNode(kids[k], namespace, map, idx);
      return out;
    }
    case 10: return _xmlSerDoctype(node);
    default: return '';
  }
}

// Per the HTML spec, DOMParser's XML branch returns a Document (NOT an
// XMLDocument — unlike createDocument / XHR.responseXML); the WPT tests assert
// `!(doc instanceof XMLDocument)`. Defining the interface lets that evaluate.
globalThis.XMLDocument = class XMLDocument extends Document {};

globalThis.DOMParser = class DOMParser {
  parseFromString(str, type) {
    str = (str == null) ? '' : String(str);
    type = String(type);
    const XML_TYPES = ['text/xml', 'application/xml', 'application/xhtml+xml', 'image/svg+xml'];
    if (type === 'text/html') {
      // Parse into a REAL detached HTML document (was a stub returning the live
      // page — a footgun: mutating the "parsed" doc mutated the real page).
      const doc = new _IframeDocument(str, 'about:blank', null, 'about:blank', 'html');
      doc._contentType = 'text/html';
      // Quirks: no-quirks (CSS1Compat) iff a `<!DOCTYPE html>` leads the input,
      // else quirks (BackCompat). (Full quirks-mode table is out of scope here.)
      doc._compatMode = /^[﻿\s]*<!doctype\s+html\s*>/i.test(str) ? 'CSS1Compat' : 'BackCompat';
      return doc;
    }
    if (XML_TYPES.includes(type)) {
      // All XML-family types are parsed by the namespace-aware XML parser (XHTML
      // and SVG are XML). Builds a detached doc — never the live page — carrying
      // the spec metadata the WPT tests check.
      const pageURL = (_domParse('document_url') || 'about:blank');
      const doc = new _IframeDocument(str, pageURL, null, pageURL, 'xml');
      doc._contentType = type;
      return doc;
    }
    throw new TypeError("Failed to execute 'parseFromString' on 'DOMParser': "
      + "The provided value '" + type + "' is not a valid enum value of type SupportedType.");
  }
};
globalThis.XMLSerializer = class XMLSerializer {
  serializeToString(node) {
    const map = new Map();
    map.set(_XML_NS, ['xml']);
    return _xmlSerNode(node, null, map, { value: 1 });
  }
};
// Performance + User Timing (Level 3). The old `performance` was a bag of
// no-ops: mark()/measure() did nothing and getEntries* always returned []. This
// is the real thing — a PerformanceEntry buffer with mark/measure/clear, the
// PerformanceEntry/Mark/Measure classes, a high-res now() relative to timeOrigin,
// PerformanceTiming.toJSON, and a minimal EventTarget surface (performance fires
// events like `resourcetimingbufferfull`).
class PerformanceEntry {
  constructor(name, entryType, startTime, duration) {
    this._name = String(name); this._entryType = entryType;
    this._startTime = startTime; this._duration = duration;
  }
  get name() { return this._name; }
  get entryType() { return this._entryType; }
  get startTime() { return this._startTime; }
  get duration() { return this._duration; }
  toJSON() { return { name: this.name, entryType: this.entryType, startTime: this.startTime, duration: this.duration }; }
}
globalThis.PerformanceEntry = _markNative(PerformanceEntry);

class PerformanceMark extends PerformanceEntry {
  constructor(markName, markOptions) {
    // markOptions is an optional WebIDL dictionary: a non-nullish, non-object
    // value (Number, NaN, Infinity, String, …) is a TypeError.
    if (markOptions !== undefined && markOptions !== null && (typeof markOptions !== "object"))
      throw new TypeError("Failed to construct 'PerformanceMark': The provided value is not of type 'PerformanceMarkOptions'.");
    const opts = (markOptions == null) ? {} : markOptions;
    let startTime;
    if (opts.startTime !== undefined) {
      startTime = Number(opts.startTime);
      if (startTime < 0)
        throw new TypeError("Failed to construct 'PerformanceMark': 'startTime' cannot be negative.");
    } else {
      startTime = globalThis.performance ? globalThis.performance.now() : 0;
    }
    super(markName, "mark", startTime, 0);
    this._detail = (opts.detail === undefined) ? null : opts.detail;
  }
  get detail() { return this._detail; }
  toJSON() { const j = super.toJSON(); j.detail = this.detail; return j; }
}
globalThis.PerformanceMark = _markNative(PerformanceMark);

class PerformanceMeasure extends PerformanceEntry {
  constructor(measureName, startTime, duration, detail) {
    super(measureName, "measure", startTime, duration);
    this._detail = (detail === undefined) ? null : detail;
  }
  get detail() { return this._detail; }
  toJSON() { const j = super.toJSON(); j.detail = this.detail; return j; }
}
globalThis.PerformanceMeasure = _markNative(PerformanceMeasure);

// Resource Timing: the network-phase timing attributes shared by resource and
// navigation entries. All are settable plain properties (filled in as timing
// becomes known); the document itself is fetched by the Rust layer, so the main
// navigation entry leaves the network phases at 0 (they occurred before
// timeOrigin) and only fills the document-lifecycle phases below.
class PerformanceResourceTiming extends PerformanceEntry {
  constructor(name, entryType, startTime) {
    super(name, entryType || "resource", startTime || 0, 0);
    this.initiatorType = "";
    this.deliveryType = "";
    this.nextHopProtocol = "";
    // Resource Timing 2 §contentType — the essence (type/subtype, params stripped)
    // of the response's Content-Type. Exposed only for same-origin (or TAO-passed)
    // responses; "" for opaque cross-origin ones.
    this.contentType = "";
    this.workerStart = 0;
    this.redirectStart = 0;
    this.redirectEnd = 0;
    this.fetchStart = 0;
    this.domainLookupStart = 0;
    this.domainLookupEnd = 0;
    this.connectStart = 0;
    this.connectEnd = 0;
    this.secureConnectionStart = 0;
    this.requestStart = 0;
    this.responseStart = 0;
    this.firstInterimResponseStart = 0;
    this.responseEnd = 0;
    this.responseStatus = 0;
    this.transferSize = 0;
    this.encodedBodySize = 0;
    this.decodedBodySize = 0;
    this.serverTiming = [];
  }
  toJSON() {
    const j = super.toJSON();
    for (const k of ['initiatorType', 'deliveryType', 'nextHopProtocol', 'contentType', 'workerStart',
      'redirectStart', 'redirectEnd', 'fetchStart', 'domainLookupStart', 'domainLookupEnd',
      'connectStart', 'connectEnd', 'secureConnectionStart', 'requestStart', 'responseStart',
      'responseEnd', 'responseStatus', 'transferSize', 'encodedBodySize', 'decodedBodySize'])
      j[k] = this[k];
    j.serverTiming = this.serverTiming;
    return j;
  }
}
globalThis.PerformanceResourceTiming = _markNative(PerformanceResourceTiming);

// Navigation Timing Level 2: the single PerformanceNavigationTiming entry for the
// document. Created at startup so getEntriesByType('navigation') is populated from
// the start; the document-lifecycle phases (domInteractive … loadEventEnd) are
// filled in by __navTimingDCL / __navTimingLoad as the load progresses, and the
// entry is queued to observers at loadEventEnd.
class PerformanceNavigationTiming extends PerformanceResourceTiming {
  constructor(name) {
    super(name, "navigation", 0);
    this.initiatorType = "navigation";
    this.nextHopProtocol = "http/1.1";
    this.unloadEventStart = 0;
    this.unloadEventEnd = 0;
    this.domInteractive = 0;
    this.domContentLoadedEventStart = 0;
    this.domContentLoadedEventEnd = 0;
    this.domComplete = 0;
    this.loadEventStart = 0;
    this.loadEventEnd = 0;
    this.type = "navigate";
    this.redirectCount = 0;
    this.activationStart = 0;
    this.criticalCHRestart = 0;
    this.notRestoredReasons = null;
  }
  toJSON() {
    const j = super.toJSON();
    for (const k of ['unloadEventStart', 'unloadEventEnd', 'domInteractive',
      'domContentLoadedEventStart', 'domContentLoadedEventEnd', 'domComplete',
      'loadEventStart', 'loadEventEnd', 'type', 'redirectCount'])
      j[k] = this[k];
    return j;
  }
}
globalThis.PerformanceNavigationTiming = _markNative(PerformanceNavigationTiming);

class PerformanceTiming {
  constructor(t0) {
    // Attributes for phases that have happened by the time user script runs carry
    // t0; ones that have NOT yet occurred during page load (DOMContentLoaded/load)
    // or never apply here (unload/redirect/TLS-on-http) are 0 — which is also what
    // User Timing's "convert a mark to a timestamp" treats as empty (InvalidAccessError).
    this.navigationStart = t0; this.unloadEventStart = 0; this.unloadEventEnd = 0;
    this.redirectStart = 0; this.redirectEnd = 0; this.fetchStart = t0;
    this.domainLookupStart = t0; this.domainLookupEnd = t0; this.connectStart = t0;
    this.connectEnd = t0; this.secureConnectionStart = 0; this.requestStart = t0;
    this.responseStart = t0; this.responseEnd = t0; this.domLoading = t0;
    this.domInteractive = 0; this.domContentLoadedEventStart = 0;
    this.domContentLoadedEventEnd = 0; this.domComplete = 0;
    this.loadEventStart = 0; this.loadEventEnd = 0;
  }
  toJSON() { const o = {}; for (const k of Object.keys(this)) o[k] = this[k]; return o; }
}
// The PerformanceTiming attribute names a mark name may legacy-resolve against.
const _PERF_TIMING_ATTRS = {
  navigationStart: 1, unloadEventStart: 1, unloadEventEnd: 1, redirectStart: 1,
  redirectEnd: 1, fetchStart: 1, domainLookupStart: 1, domainLookupEnd: 1,
  connectStart: 1, connectEnd: 1, secureConnectionStart: 1, requestStart: 1,
  responseStart: 1, responseEnd: 1, domLoading: 1, domInteractive: 1,
  domContentLoadedEventStart: 1, domContentLoadedEventEnd: 1, domComplete: 1,
  loadEventStart: 1, loadEventEnd: 1,
};
globalThis.PerformanceTiming = _markNative(PerformanceTiming);

class Performance {
  constructor() {
    this._entries = [];
    this._listeners = [];
    // Resource Timing buffer (Resource Timing Level 2 §"resource timing buffer"):
    // primary resource entries live in `_entries` (entryType "resource"); the
    // secondary buffer holds entries that overflowed while the primary is full,
    // pending a `fire a buffer full event` task. Default size limit is 250.
    this._resourceBufferSize = 250;
    this._resourceSecondary = [];
    this._bufferFullPending = false;
    this._onresourcetimingbufferfull = null;
    this.timeOrigin = 0;
    this.timing = new PerformanceTiming(0);
    this.navigation = { type: 0, redirectCount: 0, toJSON() { return { type: 0, redirectCount: 0 }; } };
    this.memory = { jsHeapSizeLimit: 2172649472, totalJSHeapSize: 19321856, usedJSHeapSize: 16781520 };
  }
  now() {
    const t = Date.now() - this.timeOrigin;
    return t < 0 ? 0 : t;
  }
  mark(markName, markOptions) {
    if (arguments.length < 1)
      throw new TypeError("Failed to execute 'mark' on 'Performance': 1 argument required, but only 0 present.");
    const m = new PerformanceMark(markName, markOptions);
    this._entries.push(m);
    _queuePerformanceEntry(m);
    return m;
  }
  // Resolve a mark NAME (always string-coerced): a PerformanceTiming attribute
  // (0 → InvalidAccessError), else the most-recent mark entry, else SyntaxError.
  _resolveMarkName(mark) {
    const name = String(mark);
    if (_PERF_TIMING_ATTRS[name] === 1) {
      const v = this.timing ? this.timing[name] : 0;
      if (!v) throw new DOMException("Failed to execute 'measure' on 'Performance': '" + name +
        "' cannot have a timing value of 0.", "InvalidAccessError");
      return v - this.timeOrigin;
    }
    for (let i = this._entries.length - 1; i >= 0; i--)
      if (this._entries[i].entryType === "mark" && this._entries[i].name === name) return this._entries[i].startTime;
    throw new DOMException("Failed to execute 'measure' on 'Performance': The mark '" + name + "' does not exist.", "SyntaxError");
  }
  // Resolve an options start/end value: a number is a raw timestamp; otherwise
  // it is treated as a mark name.
  _resolveTimestamp(value) {
    if (typeof value === "number") return value;
    return this._resolveMarkName(value);
  }
  measure(measureName, startOrOptions, endMark) {
    if (arguments.length < 1)
      throw new TypeError("Failed to execute 'measure' on 'Performance': 1 argument required, but only 0 present.");
    let startTime = 0, endTime, detail = null;
    if (startOrOptions !== null && startOrOptions !== undefined && typeof startOrOptions === "object") {
      if (endMark !== undefined)
        throw new TypeError("Failed to execute 'measure' on 'Performance': An end mark must not be supplied alongside a MeasureOptions object.");
      const o = startOrOptions;
      detail = (o.detail === undefined) ? null : o.detail;
      const hasStart = o.start !== undefined, hasEnd = o.end !== undefined, hasDur = o.duration !== undefined;
      if (hasStart && hasEnd && hasDur)
        throw new TypeError("Failed to execute 'measure' on 'Performance': Cannot supply start, end, and duration together.");
      if (hasStart) startTime = this._resolveTimestamp(o.start);
      if (hasEnd) endTime = this._resolveTimestamp(o.end);
      if (hasDur) {
        const d = Number(o.duration);
        if (hasStart && !hasEnd) endTime = startTime + d;
        else if (hasEnd && !hasStart) startTime = endTime - d;
      }
      if (endTime === undefined) endTime = this.now();
    } else {
      // Positional form: startMark/endMark are DOMStrings (a number is coerced to
      // a string and looked up as a mark name, not used as a raw timestamp).
      startTime = (startOrOptions !== undefined) ? this._resolveMarkName(startOrOptions) : 0;
      endTime = (endMark !== undefined) ? this._resolveMarkName(endMark) : this.now();
    }
    const m = new PerformanceMeasure(measureName, startTime, endTime - startTime, detail);
    this._entries.push(m);
    _queuePerformanceEntry(m);
    return m;
  }
  getEntries() { return this._entries.slice().sort((a, b) => a.startTime - b.startTime); }
  getEntriesByType(type) { return this.getEntries().filter((e) => e.entryType === String(type)); }
  getEntriesByName(name, type) {
    const n = String(name);
    return this.getEntries().filter((e) => e.name === n && (type === undefined || e.entryType === String(type)));
  }
  clearMarks(name) {
    this._entries = this._entries.filter((e) => !(e.entryType === "mark" && (name === undefined || e.name === String(name))));
  }
  clearMeasures(name) {
    this._entries = this._entries.filter((e) => !(e.entryType === "measure" && (name === undefined || e.name === String(name))));
  }
  // Resource Timing Level 2 §"clear resource timings": remove every resource
  // entry from the primary buffer and reset the current size to 0. The secondary
  // buffer is deliberately NOT touched (a pending buffer-full task may still copy
  // those entries into the freshly-cleared primary buffer).
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource");
  }
  // §"set resource timing buffer size": just update the limit. Coerced to an
  // unsigned long (NaN/negative → 0); does not fire events or copy buffers.
  setResourceTimingBufferSize(n) {
    let v = Math.trunc(Number(n));
    if (!isFinite(v) || v < 0) v = 0;
    this._resourceBufferSize = v;
  }
  // Number of resource entries currently in the primary buffer === the spec's
  // "resource timing buffer current size" (the two move together).
  _resourceCount() {
    let c = 0;
    for (const e of this._entries) if (e.entryType === "resource") c++;
    return c;
  }
  // §"can add resource timing entry": true iff the primary buffer has room.
  _canAddResource() { return this._resourceCount() < this._resourceBufferSize; }
  // Build a resource entry. Network sub-phases are collapsed (fetchStart ===
  // request phases === startTime); responseStart/End carry the completion time so
  // duration > 0 for any real network round-trip.
  _makeResourceEntry(name, initiatorType, startTime, endTime, sizes) {
    if (endTime < startTime) endTime = startTime;
    const e = new PerformanceResourceTiming(name, "resource", startTime);
    e.initiatorType = initiatorType || "";
    e.nextHopProtocol = "http/1.1";
    e.fetchStart = startTime;
    e.domainLookupStart = startTime; e.domainLookupEnd = startTime;
    e.connectStart = startTime; e.connectEnd = startTime;
    e.requestStart = startTime; e.responseStart = endTime; e.responseEnd = endTime;
    e._duration = endTime - startTime;
    if (sizes) {
      e.encodedBodySize = sizes.enc || 0;
      e.decodedBodySize = (sizes.dec != null ? sizes.dec : sizes.enc) || 0;
      e.transferSize = (sizes.enc || 0) + 300;
      if (sizes.status) e.responseStatus = sizes.status;
      if (sizes.contentType != null) e.contentType = sizes.contentType;
    }
    return e;
  }
  // Record a fetched resource on the timeline and notify observers. Called by
  // fetch()/XHR/element loads when a request completes. Runs the §"add a
  // PerformanceResourceTiming entry" algorithm: straight into the primary buffer
  // when there is room and no buffer-full task is pending, otherwise into the
  // secondary buffer (scheduling a `fire a buffer full event` task).
  _addResourceEntry(name, initiatorType, startTime, endTime, sizes) {
    if (typeof PerformanceResourceTiming !== "function") return null;
    const e = this._makeResourceEntry(name, initiatorType, startTime, endTime, sizes);
    this._storeResourceEntry(e);
    return e;
  }
  // §"add a PerformanceResourceTiming entry".
  _storeResourceEntry(e) {
    if (this._canAddResource() && !this._bufferFullPending) {
      this._entries.push(e);
      try { _queuePerformanceEntry(e); } catch (ex) {}
      return;
    }
    if (!this._bufferFullPending) {
      this._bufferFullPending = true;
      // Queue on a macrotask (the performance timeline task source) so that any
      // synchronous code following the overflowing load — e.g. a
      // setResourceTimingBufferSize() — runs before the buffer-full event fires.
      setTimeout(() => { try { this._fireResourceBufferFull(); } catch (ex) {} }, 0);
    }
    this._resourceSecondary.push(e);
  }
  // §"fire a buffer full event": move entries from the secondary buffer into the
  // primary one, firing `resourcetimingbufferfull` whenever the primary is full,
  // and dropping the remainder if no progress can be made (overflow guard).
  _fireResourceBufferFull() {
    while (this._resourceSecondary.length > 0) {
      const excessBefore = this._resourceSecondary.length;
      if (!this._canAddResource()) {
        this.dispatchEvent(new Event("resourcetimingbufferfull"));
      }
      // Copy secondary buffer: drain into the primary while there is room.
      while (this._resourceSecondary.length > 0 && this._canAddResource()) {
        const entry = this._resourceSecondary.shift();
        this._entries.push(entry);
        try { _queuePerformanceEntry(entry); } catch (ex) {}
      }
      const excessAfter = this._resourceSecondary.length;
      // No progress (the event didn't make room) → drop everything and stop, so
      // the loop can never spin forever.
      if (excessBefore <= excessAfter) {
        this._resourceSecondary = [];
        break;
      }
    }
    this._bufferFullPending = false;
  }
  toJSON() {
    return { timeOrigin: this.timeOrigin, timing: this.timing ? this.timing.toJSON() : undefined, navigation: this.navigation };
  }
  // Minimal self-contained EventTarget surface (so `performance` can dispatch).
  addEventListener(type, cb, opts) {
    if (cb == null) return;
    const once = (typeof opts === "object" && opts) ? !!opts.once : false;
    this._listeners.push({ type: String(type), cb, once });
  }
  removeEventListener(type, cb) {
    this._listeners = this._listeners.filter((l) => !(l.type === String(type) && l.cb === cb));
  }
  dispatchEvent(event) {
    const type = event && event.type;
    // The `on<type>` content-attribute handler fires alongside the listeners (it
    // behaves as a listener registered when first assigned).
    const onHandler = this["on" + type];
    if (typeof onHandler === "function") {
      try { onHandler.call(this, event); } catch (e) {}
    }
    const matched = this._listeners.filter((l) => l.type === type);
    for (const l of matched) {
      if (l.once) this._listeners = this._listeners.filter((x) => x !== l);
      try { (typeof l.cb === "function" ? l.cb : l.cb.handleEvent).call(this, event); } catch (e) {}
    }
    return !(event && event.defaultPrevented);
  }
  get onresourcetimingbufferfull() { return this._onresourcetimingbufferfull; }
  set onresourcetimingbufferfull(fn) { this._onresourcetimingbufferfull = (typeof fn === "function") ? fn : null; }
}
globalThis.Performance = _markNative(Performance);
globalThis.performance = globalThis.performance || new Performance();

// ---- PerformanceObserver (Performance Timeline Level 2) ----------------------
// The entry types Obscura can actually generate timeline entries for. Must be in
// strict alphabetical order (supportedEntryTypes asserts types[i-1] < types[i])
// and frozen+cached (the attribute must return the same array each access).
const _PERF_SUPPORTED_ENTRY_TYPES = Object.freeze(['mark', 'measure', 'navigation', 'resource']);

// Registered observers + the single pending-delivery task (HTML "queue a
// PerformanceObserver task": one task flushes every observer with a non-empty
// buffer). _perfTaskScheduled is cleared at the start of a flush so an observer
// queued *from within* a callback schedules a fresh task.
const _perfObservers = [];
let _perfTaskScheduled = false;
const _flushPerfObservers = function () {
  _perfTaskScheduled = false;
  // Snapshot: a callback may observe()/disconnect() mid-flush.
  const snapshot = _perfObservers.slice();
  for (const obs of snapshot) {
    if (!obs._buffer.length) continue;
    const records = obs._buffer;
    obs._buffer = [];
    const list = new PerformanceObserverEntryList(records);
    try { obs._callback.call(obs, list, obs); } catch (e) { _reportError(e); }
  }
};
const _schedulePerfTask = function () {
  if (_perfTaskScheduled) return;
  _perfTaskScheduled = true;
  setTimeout(_flushPerfObservers, 0);
};
// Called by performance.mark()/measure() once an entry joins the timeline:
// append it to every observer watching that entryType, then queue delivery.
const _queuePerformanceEntry = function (entry) {
  for (const obs of _perfObservers) {
    if (obs._types[entry.entryType]) {
      obs._buffer.push(entry);
      _schedulePerfTask();
    }
  }
};

class PerformanceObserverEntryList {
  // WebIDL: PerformanceObserverEntryList has no constructor, so its interface
  // object length must be 0 — read the entries from arguments instead of a
  // declared parameter.
  constructor() { this._entries = (arguments[0] || []).slice(); }
  getEntries() { return this._entries.slice().sort((a, b) => a.startTime - b.startTime); }
  getEntriesByType(type) { return this.getEntries().filter((e) => e.entryType === String(type)); }
  getEntriesByName(name, type) {
    const n = String(name);
    return this.getEntries().filter((e) => e.name === n && (type === undefined || e.entryType === String(type)));
  }
}
Object.defineProperty(PerformanceObserverEntryList.prototype, Symbol.toStringTag,
  { value: 'PerformanceObserverEntryList', configurable: true });
// Interface objects are non-enumerable on the global (matches real browsers +
// WebIDL; idlharness asserts `self`'s interface properties are not enumerable).
Object.defineProperty(globalThis, 'PerformanceObserverEntryList',
  { value: _markNative(PerformanceObserverEntryList), writable: true, enumerable: false, configurable: true });

class PerformanceObserver {
  constructor(callback) {
    if (typeof callback !== 'function')
      throw new TypeError("Failed to construct 'PerformanceObserver': parameter 1 is not of type 'Function'.");
    this._callback = callback;
    this._buffer = [];
    this._types = Object.create(null); // entryType -> true (currently observed)
    this._mode = null;                  // 'multiple' (entryTypes) | 'single' (type)
  }
  observe(options) {
    options = options || {};
    const hasEntryTypes = options.entryTypes !== undefined;
    const hasType = options.type !== undefined;
    if (hasEntryTypes && hasType)
      throw new SyntaxError("Failed to execute 'observe' on 'PerformanceObserver': entryTypes and type cannot both be provided.");
    if (!hasEntryTypes && !hasType)
      throw new SyntaxError("Failed to execute 'observe' on 'PerformanceObserver': either entryTypes or type must be provided.");

    if (hasEntryTypes) {
      // entryTypes form: REPLACES the observed set. Cannot follow a type-form observe().
      if (this._mode === 'single')
        throw new DOMException("Failed to execute 'observe' on 'PerformanceObserver': This observer has performed observe({type:...}) in the past.", "InvalidModificationError");
      this._mode = 'multiple';
      const list = Array.from(options.entryTypes || []).map(String)
        .filter((t) => _PERF_SUPPORTED_ENTRY_TYPES.indexOf(t) !== -1);
      // (Unsupported types are dropped per spec; an all-unsupported list leaves
      // nothing observed and never fires.)
      this._types = Object.create(null);
      for (const t of list) this._types[t] = true;
    } else {
      // type form: ACCUMULATES. Cannot follow an entryTypes-form observe().
      if (this._mode === 'multiple')
        throw new DOMException("Failed to execute 'observe' on 'PerformanceObserver': This observer has performed observe({entryTypes:...}) in the past.", "InvalidModificationError");
      this._mode = 'single';
      const t = String(options.type);
      if (_PERF_SUPPORTED_ENTRY_TYPES.indexOf(t) === -1) return; // unsupported → ignore (with a warning, per spec)
      this._types[t] = true;
      // buffered flag: seed the observer buffer with already-recorded entries of
      // this type from the global timeline, then queue a delivery task.
      if (options.buffered) {
        for (const e of performance._entries)
          if (e.entryType === t) this._buffer.push(e);
        if (this._buffer.length) _schedulePerfTask();
      }
    }
    if (_perfObservers.indexOf(this) === -1) _perfObservers.push(this);
  }
  disconnect() {
    const i = _perfObservers.indexOf(this);
    if (i !== -1) _perfObservers.splice(i, 1);
    this._buffer = [];
    this._types = Object.create(null);
    this._mode = null;
  }
  takeRecords() {
    const records = this._buffer;
    this._buffer = [];
    return records.slice().sort((a, b) => a.startTime - b.startTime);
  }
  static get supportedEntryTypes() { return _PERF_SUPPORTED_ENTRY_TYPES; }
}
Object.defineProperty(PerformanceObserver.prototype, Symbol.toStringTag,
  { value: 'PerformanceObserver', configurable: true });
Object.defineProperty(globalThis, 'PerformanceObserver',
  { value: _markNative(PerformanceObserver), writable: true, enumerable: false, configurable: true });

// ---- Navigation Timing lifecycle hooks (called from page.rs) -----------------
// The single navigation entry is created at startup (see __obscura_init). These
// fill its document-lifecycle phases at the real DOMContentLoaded / load moments
// and (at load) queue it to observers registered during parsing.
const __navTimingDCL = function () {
  const p = globalThis.performance, nav = p && p._navEntry;
  if (!nav) return;
  // The document URL isn't finalized at __obscura_init (the entry is created with
  // a provisional "about:blank"); refresh it now that the page has parsed.
  try { const u = _domParse("document_url"); if (u) nav._name = u; } catch (e) {}
  const t = p.now();
  if (!nav.domInteractive) nav.domInteractive = t;
  if (!nav.domContentLoadedEventStart) nav.domContentLoadedEventStart = t;
  nav.domContentLoadedEventEnd = p.now();
};
const __navTimingLoad = function () {
  const p = globalThis.performance, nav = p && p._navEntry;
  if (!nav) return;
  try { const u = _domParse("document_url"); if (u) nav._name = u; } catch (e) {}
  const t = p.now();
  if (!nav.domComplete) nav.domComplete = t;
  if (!nav.loadEventStart) nav.loadEventStart = t;
  nav.loadEventEnd = p.now();
  nav._duration = nav.loadEventEnd; // duration === loadEventEnd per spec
  try { _queuePerformanceEntry(nav); } catch (e) {} // notify observers (registered during parse)
};

Object.defineProperty(Document.prototype, 'fonts', {
  get() {
    return {
      ready: Promise.resolve(),
      check() { return true; },
      load() { return Promise.resolve([]); },
      add() {},
      delete() { return false; },
      clear() {},
      has() { return false; },
      forEach() {},
      get size() { return 0; },
      get status() { return 'loaded'; },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      [Symbol.iterator]() { return [][Symbol.iterator](); },
    };
  },
  configurable: true,
});
// crypto.getRandomValues / randomUUID — Web Crypto "Crypto" surface. The old
// stub ignored the WebIDL/spec contract entirely (no type check, no quota, and
// it mutated non-integer views). This enforces the real semantics:
//   - non-ArrayBufferView arg            → TypeError
//   - a non-integer view (Float*, DataView) → TypeMismatchError
//   - byteLength > 65536                 → QuotaExceededError
//   - otherwise fill the bytes and return the SAME view.
// NOTE: entropy is still Math.random (not a CSPRNG) — a known follow-up; this
// change is conformance only and does not weaken anything vs. the prior stub.
globalThis.crypto = globalThis.crypto || (function () {
  const _toStr = Object.prototype.toString;
  const _intViews = {
    "[object Int8Array]": 1, "[object Uint8Array]": 1, "[object Uint8ClampedArray]": 1,
    "[object Int16Array]": 1, "[object Uint16Array]": 1,
    "[object Int32Array]": 1, "[object Uint32Array]": 1,
    "[object BigInt64Array]": 1, "[object BigUint64Array]": 1,
  };
  function _fillRandomBytes(u8) {
    for (let i = 0; i < u8.length; i++) u8[i] = (Math.random() * 256) | 0;
  }
  const _hex = new Array(256);
  for (let i = 0; i < 256; i++) _hex[i] = (i + 0x100).toString(16).slice(1);
  return {
    getRandomValues(view) {
      if (!ArrayBuffer.isView(view))
        throw new TypeError("Failed to execute 'getRandomValues' on 'Crypto': parameter 1 is not of type 'ArrayBufferView'.");
      const brand = _toStr.call(view);
      if (!_intViews[brand])
        throw new DOMException("The provided ArrayBufferView is of type '" + brand.slice(8, -1) +
          "', which is not an integer array type.", "TypeMismatchError");
      if (view.byteLength > 65536)
        throw new QuotaExceededError("The ArrayBufferView's byte length (" + view.byteLength +
          ") exceeds the number of bytes of entropy available via this API (65536).");
      _fillRandomBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return view;
    },
    randomUUID() {
      const b = new Uint8Array(16);
      _fillRandomBytes(b);
      b[6] = (b[6] & 0x0f) | 0x40; // version 4
      b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
      const h = _hex;
      return h[b[0]] + h[b[1]] + h[b[2]] + h[b[3]] + "-" + h[b[4]] + h[b[5]] + "-" +
        h[b[6]] + h[b[7]] + "-" + h[b[8]] + h[b[9]] + "-" +
        h[b[10]] + h[b[11]] + h[b[12]] + h[b[13]] + h[b[14]] + h[b[15]];
    },
  };
})();
// structuredClone — a real WHATWG StructuredSerialize/StructuredDeserialize.
// Replaces the old `JSON.parse(JSON.stringify(v))` footgun (which dropped
// undefined/NaN/Infinity, corrupted -0, threw on BigInt and cyclic refs, and
// lost every platform type). Pure JS, recursive, with a `memory` Map that
// preserves identity and cycles (insert the new container BEFORE recursing).
globalThis.structuredClone = globalThis.structuredClone || (function () {
  // Capture interface objects at load time so a clone still works (and stays
  // `instanceof` the right type) after a page deletes the global — see the
  // "interface deleted from the global … must still deserialize" WPT subtests.
  const _Blob = globalThis.Blob, _File = globalThis.File;
  const _Response = globalThis.Response, _Request = globalThis.Request;
  const _toStr = Object.prototype.toString;
  const _hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const _ErrorCtors = { Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError };
  const _dataClone = (msg) => new DOMException(msg, "DataCloneError");

  // Clone (or, when in transferSet, MOVE) an ArrayBuffer, preserving resizable
  // buffers' maxByteLength. Bytes are copied out before any transfer-detach.
  function _cloneArrayBuffer(buf, transferSet) {
    if (buf.detached) throw _dataClone("An ArrayBuffer is detached and could not be cloned.");
    const len = buf.byteLength;
    const resizable = buf.resizable === true;
    const maxByteLength = resizable ? buf.maxByteLength : undefined;
    const bytes = new Uint8Array(len); bytes.set(new Uint8Array(buf, 0, len));
    if (transferSet && transferSet.has(buf)) { try { buf.transfer(); } catch (e) {} } // detach the source
    const out = resizable ? new ArrayBuffer(len, { maxByteLength }) : new ArrayBuffer(len);
    new Uint8Array(out).set(bytes);
    return out;
  }

  function _clone(value, memory, transferSet) {
    // Primitives survive verbatim — including undefined, ±0, NaN, ±Infinity, BigInt.
    if (value === null) return null;
    const t = typeof value;
    if (t === "undefined" || t === "boolean" || t === "number" || t === "string" || t === "bigint") return value;
    if (t === "symbol") throw _dataClone("A Symbol value could not be cloned.");
    if (t === "function") throw _dataClone("A function could not be cloned.");

    // Object — preserve identity / break cycles.
    if (memory.has(value)) return memory.get(value);
    const brand = _toStr.call(value);

    // Boxed primitives.
    if (brand === "[object Boolean]") { const o = new Boolean(value.valueOf()); memory.set(value, o); return o; }
    if (brand === "[object Number]")  { const o = new Number(value.valueOf());  memory.set(value, o); return o; }
    if (brand === "[object String]")  { const o = new String(value.valueOf());  memory.set(value, o); return o; }
    if (brand === "[object BigInt]")  { const o = Object(value.valueOf());       memory.set(value, o); return o; }
    if (brand === "[object Symbol]")  throw _dataClone("A Symbol value could not be cloned.");

    // Date / RegExp (RegExp lastIndex resets to 0 — the constructor does that).
    if (brand === "[object Date]")   { const o = new Date(value.getTime());           memory.set(value, o); return o; }
    if (brand === "[object RegExp]") { const o = new RegExp(value.source, value.flags); memory.set(value, o); return o; }

    // Error family — name (mapped to a standard constructor), own message, and
    // own cause only. Custom own properties are deliberately NOT carried over.
    if (brand === "[object Error]" || value instanceof Error) {
      const Ctor = _hasOwn(_ErrorCtors, value.name) ? _ErrorCtors[value.name] : Error;
      const msg = _hasOwn(value, "message") ? String(value.message) : undefined;
      let o;
      if (_hasOwn(value, "cause")) {
        o = new Ctor(msg, { cause: undefined }); memory.set(value, o);
        try { o.cause = _clone(value.cause, memory, transferSet); } catch (e) {}
      } else {
        o = new Ctor(msg); memory.set(value, o);
      }
      return o;
    }

    // Buffers & views.
    if (brand === "[object ArrayBuffer]") { const o = _cloneArrayBuffer(value, transferSet); memory.set(value, o); return o; }
    if (brand === "[object SharedArrayBuffer]") {
      // SABs are only cloneable in a cross-origin-isolated agent; we are not one.
      throw _dataClone("A SharedArrayBuffer could not be cloned.");
    }
    if (brand === "[object DataView]") {
      let byteOffset, byteLength;
      try { byteOffset = value.byteOffset; byteLength = value.byteLength; }
      catch (e) { throw _dataClone("A DataView is out of bounds and could not be cloned."); }
      const tracking = value.buffer.resizable === true && (byteOffset + byteLength === value.buffer.byteLength);
      const buf = _clone(value.buffer, memory, transferSet);
      const o = tracking ? new DataView(buf, byteOffset) : new DataView(buf, byteOffset, byteLength);
      memory.set(value, o); return o;
    }
    if (ArrayBuffer.isView(value)) { // a TypedArray (DataView handled above)
      const Ctor = globalThis[brand.slice(8, -1)] || value.constructor;
      const byteOffset = value.byteOffset, length = value.length;
      const tracking = value.buffer.resizable === true && (byteOffset + value.byteLength === value.buffer.byteLength);
      const buf = _clone(value.buffer, memory, transferSet);
      const o = tracking ? new Ctor(buf, byteOffset) : new Ctor(buf, byteOffset, length);
      memory.set(value, o); return o;
    }

    // Map / Set (not in the WPT battery, but part of the algorithm).
    if (brand === "[object Map]") {
      const o = new Map(); memory.set(value, o);
      value.forEach((v, k) => o.set(_clone(k, memory, transferSet), _clone(v, memory, transferSet)));
      return o;
    }
    if (brand === "[object Set]") {
      const o = new Set(); memory.set(value, o);
      value.forEach((v) => o.add(_clone(v, memory, transferSet)));
      return o;
    }

    // File before Blob (File extends Blob). Object.create(proto) collapses any
    // subclass to its closest serializable interface and copies the byte store
    // directly (no re-encoding — keeps invalid-UTF-8 blobs byte-exact).
    if (_File && value instanceof _File) {
      const o = Object.create(_File.prototype);
      o._bytes = value._bytes.slice(); o._type = value._type;
      o._name = value._name; o._lastModified = value._lastModified;
      memory.set(value, o); return o;
    }
    if (_Blob && value instanceof _Blob) {
      const o = Object.create(_Blob.prototype);
      o._bytes = value._bytes.slice(); o._type = value._type;
      memory.set(value, o); return o;
    }

    // Non-serializable platform objects (no serialization steps) → DataCloneError.
    if ((_Response && value instanceof _Response) || (_Request && value instanceof _Request))
      throw _dataClone("An object could not be cloned.");

    // Arrays — preserve length (holes), copy own enumerable string keys (which
    // skips holes and symbol keys); shared/cyclic refs resolve via `memory`.
    if (Array.isArray(value)) {
      const o = new Array(value.length); memory.set(value, o);
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) o[keys[i]] = _clone(value[keys[i]], memory, transferSet);
      return o;
    }

    // Ordinary objects — the clone's prototype is %Object.prototype% (so an
    // exotic input like Object.prototype itself loses its exotic-ness), only own
    // enumerable string-keyed properties are carried (a throwing getter rejects).
    const o = {}; memory.set(value, o);
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) o[keys[i]] = _clone(value[keys[i]], memory, transferSet);
    return o;
  }

  return function structuredClone(value, options) {
    const transferList = (options && options.transfer != null) ? options.transfer : [];
    const transferSet = new Set();
    for (const item of transferList) {
      // Only ArrayBuffers are transferable in this engine; everything else
      // (Blob, MessagePort, …) is non-transferable here → DataCloneError.
      if (_toStr.call(item) !== "[object ArrayBuffer]")
        throw _dataClone("Value in transfer list could not be transferred.");
      if (item.detached) throw _dataClone("A detached ArrayBuffer could not be transferred.");
      transferSet.add(item);
    }
    return _clone(value, new Map(), transferSet);
  };
})();
// We are not a cross-origin-isolated agent (no COOP+COEP), so SharedArrayBuffer
// is not cloneable — code (and the structured-clone WPT SAB subtest) checks this.
if (typeof globalThis.crossOriginIsolated === "undefined") globalThis.crossOriginIsolated = false;
globalThis.reportError = globalThis.reportError || ((e) => console.error(e));

globalThis.Storage = function Storage() {};
Storage.prototype.getItem = function(k) { return (this._data && this._data[k]) ?? null; };
Storage.prototype.setItem = function(k, v) { if (this._data) this._data[k] = String(v); };
Storage.prototype.removeItem = function(k) { if (this._data) delete this._data[k]; };
Storage.prototype.clear = function() { if (this._data) for (var k in this._data) delete this._data[k]; };
Object.defineProperty(Storage.prototype, 'length', { get: function() { return this._data ? Object.keys(this._data).length : 0; } });
Storage.prototype.key = function(i) { return this._data ? Object.keys(this._data)[i] ?? null : null; };

const _mkStore = () => { var s = Object.create(Storage.prototype); s._data = {}; return s; };
globalThis.localStorage = _mkStore();
globalThis.sessionStorage = _mkStore();

// btoa / atob — HTML spec base64 over a BYTE string (NOT UTF-8: the old stub
// TextEncoder-encoded, so btoa("\x80") gave "woA=" instead of "gA==").
const _B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const _B64_LOOKUP = (() => { const m = Object.create(null); for (let i = 0; i < _B64_ALPHABET.length; i++) m[_B64_ALPHABET[i]] = i; return m; })();
globalThis.btoa = function btoa(data) {
  data = String(data);
  for (let i = 0; i < data.length; i++) {
    if (data.charCodeAt(i) > 0xFF)
      throw new DOMException("The string to be encoded contains characters outside of the Latin1 range.", "InvalidCharacterError");
  }
  let out = "";
  for (let i = 0; i < data.length; i += 3) {
    const a = data.charCodeAt(i);
    const b = i + 1 < data.length ? data.charCodeAt(i + 1) : 0;
    const c = i + 2 < data.length ? data.charCodeAt(i + 2) : 0;
    out += _B64_ALPHABET[a >> 2];
    out += _B64_ALPHABET[((a & 0x03) << 4) | (b >> 4)];
    out += (i + 1 < data.length) ? _B64_ALPHABET[((b & 0x0F) << 2) | (c >> 6)] : "=";
    out += (i + 2 < data.length) ? _B64_ALPHABET[c & 0x3F] : "=";
  }
  return out;
};
globalThis.atob = function atob(data) {
  // WHATWG Infra "forgiving-base64 decode".
  data = String(data).replace(/[\t\n\f\r ]/g, "");      // strip ASCII whitespace
  if (data.length % 4 === 0) data = data.replace(/==?$/, ""); // strip ≤2 trailing '='
  if (data.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(data)) // bad length / stray '=' / junk
    throw new DOMException("The string to be decoded is not correctly encoded.", "InvalidCharacterError");
  let out = "", buffer = 0, bits = 0;
  for (let i = 0; i < data.length; i++) {
    buffer = (buffer << 6) | _B64_LOOKUP[data[i]];
    bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buffer >> bits) & 0xFF); }
  }
  return out;
};

globalThis.history = { length:1, state:null, pushState(){}, replaceState(){}, go(){}, back(){}, forward(){}, scrollRestoration:"auto" };
globalThis.screenX = 0; globalThis.screenY = 0;
globalThis.screenLeft = 0; globalThis.screenTop = 0;
globalThis.pageXOffset = 0; globalThis.pageYOffset = 0;
globalThis.scrollX = 0; globalThis.scrollY = 0;

globalThis.CSS = { supports(){return false;}, escape(s){return s;} };

// HTMLElement is a real subclass of Element: only elements in the HTML namespace
// are HTMLElement instances (foreign / non-HTML elements stay plain Element).
globalThis.HTMLElement = class HTMLElement extends Element {};
// Unknown / non-conforming HTML tag names (e.g. uppercase via createElementNS).
globalThis.HTMLUnknownElement = class HTMLUnknownElement extends globalThis.HTMLElement {};
globalThis.HTMLSpanElement = class HTMLSpanElement extends globalThis.HTMLElement {};
globalThis.HTMLFormElement = class HTMLFormElement extends globalThis.HTMLElement {
  get elements() { return this.querySelectorAll("input, select, textarea, button, fieldset, output, object"); }
  get length() { return this.elements.length; }
  // Inherit submit() from Element.prototype: it dispatches the cancelable
  // 'submit' event and (if not prevented) builds form data and navigates.
  reset() { for (const f of this.elements) { if ('value' in f) f.value = ''; } }
};
// The remaining specific interfaces are distinct constructors (each a real
// subclass of HTMLElement) — per WebIDL the platform exposes a separate interface
// object per element family, and `HTMLAreaElement !== HTMLDivElement`. Behaviour
// (src/href reflection, etc.) lives on Element.prototype and is shared, so an
// empty subclass body loses nothing while making `createElement(t) instanceof
// HTMLXxxElement` honest. HTMLForm/HTMLSpan above already carry behaviour.
// HTMLMediaElement is the shared base of audio/video.
globalThis.HTMLMediaElement = class HTMLMediaElement extends globalThis.HTMLElement {};
const _defIface = (name, base) => {
  if (globalThis[name]) return;                       // keep already-defined (form/span)
  const C = { [name]: class extends (base || globalThis.HTMLElement) {} }[name];
  globalThis[name] = C;
};
[ 'HTMLDivElement','HTMLParagraphElement','HTMLAnchorElement','HTMLImageElement',
  'HTMLInputElement','HTMLButtonElement','HTMLSelectElement','HTMLTextAreaElement',
  'HTMLLabelElement','HTMLTableElement','HTMLIFrameElement','HTMLCanvasElement',
  'HTMLScriptElement','HTMLStyleElement','HTMLLinkElement','HTMLMetaElement',
  'HTMLHeadElement','HTMLBodyElement','HTMLHtmlElement','HTMLBRElement',
  'HTMLHRElement','HTMLUListElement','HTMLOListElement','HTMLLIElement',
  'HTMLPreElement','HTMLHeadingElement','HTMLTemplateElement','HTMLSlotElement',
  'HTMLOptionElement','HTMLDataListElement','HTMLFieldSetElement','HTMLLegendElement',
  'HTMLProgressElement','HTMLDetailsElement','HTMLDialogElement',
  // Previously-missing interfaces (the cloneNode/idlharness tail):
  'HTMLAreaElement','HTMLBaseElement','HTMLQuoteElement','HTMLTableCaptionElement',
  'HTMLTableColElement','HTMLDataElement','HTMLModElement','HTMLDirectoryElement',
  'HTMLDListElement','HTMLEmbedElement','HTMLFontElement','HTMLFrameElement',
  'HTMLFrameSetElement','HTMLMapElement','HTMLMarqueeElement','HTMLMenuElement',
  'HTMLMeterElement','HTMLObjectElement','HTMLOptGroupElement','HTMLOutputElement',
  'HTMLParamElement','HTMLPictureElement','HTMLSourceElement','HTMLTableSectionElement',
  'HTMLTableCellElement','HTMLTimeElement','HTMLTitleElement','HTMLTableRowElement',
  'HTMLTrackElement',
].forEach(n => _defIface(n));
globalThis.HTMLAudioElement = class HTMLAudioElement extends globalThis.HTMLMediaElement {};
globalThis.HTMLVideoElement = class HTMLVideoElement extends globalThis.HTMLMediaElement {};
globalThis.SVGElement = Element;
globalThis.SVGSVGElement = Element;
globalThis.CharacterData = CharacterData;
globalThis.Text = Text;
globalThis.Comment = Comment;
globalThis.CDATASection = CDATASection;
globalThis.ProcessingInstruction = ProcessingInstruction;
globalThis.DocumentFragment = DocumentFragment;
globalThis.DocumentType = DocumentType;
globalThis.Node = Node;
// WebIDL constants are exposed on BOTH the interface object and instances, so
// mirror Node's static constants onto the prototype (node.ELEMENT_NODE, etc.).
for (const k of Object.getOwnPropertyNames(Node)) {
  if (/^[A-Z_]+$/.test(k) && typeof Node[k] === "number") Node.prototype[k] = Node[k];
}
globalThis.Element = Element;
globalThis.Document = Document;
globalThis.EventTarget = Node;
// ---------------------------------------------------------------------------
// Tree traversal primitives shared by NodeIterator + TreeWalker (DOM §6).
// "following/preceding node within root" = standard tree-order step, bounded so
// we never escape the traverser's root subtree.
// ---------------------------------------------------------------------------
function __obscura_followingNode(node, root) {
  if (node.firstChild) return node.firstChild;
  let n = node;
  while (n && n !== root) {
    if (n.nextSibling) return n.nextSibling;
    n = n.parentNode;
  }
  return null;
}
function __obscura_precedingNode(node, root) {
  if (node === root) return null;
  if (node.previousSibling) {
    let n = node.previousSibling;
    while (n.lastChild) n = n.lastChild;
    return n;
  }
  return node.parentNode;
}
// "filter a node" (DOM §6.1): guards the active flag, applies whatToShow, then
// invokes the NodeFilter callback. Returns FILTER_ACCEPT/REJECT/SKIP.
function __obscura_filterNode(traverser, node) {
  if (traverser._active) {
    throw new DOMException("NodeFilter is already in use", "InvalidStateError");
  }
  const bit = 1 << (node.nodeType - 1);
  if (!(bit & traverser._whatToShow)) return 3; // FILTER_SKIP
  const filter = traverser._filter;
  if (!filter) return 1; // FILTER_ACCEPT
  traverser._active = true;
  let result;
  try {
    result = (typeof filter === "function") ? filter(node) : filter.acceptNode(node);
  } finally {
    traverser._active = false;
  }
  return Number(result);
}
// WebIDL coercion for the whatToShow argument (unsigned long, default SHOW_ALL).
function __obscura_whatToShow(v) {
  return v === undefined ? 0xFFFFFFFF : (v >>> 0);
}
function __obscura_nodeFilterArg(f) {
  return (f === undefined || f === null) ? null : f;
}
function __obscura_isInclusiveAncestor(ancestor, descendant) {
  for (let n = descendant; n; n = n.parentNode) if (n === ancestor) return true;
  return false;
}
// "First node following the last inclusive descendant of node" — i.e. the next
// node in tree order that is outside node's subtree (or null).
function __obscura_nextNodeDescendants(node) {
  while (node && !node.nextSibling) node = node.parentNode;
  return node ? node.nextSibling : null;
}

// Live NodeIterator registry (WeakRefs, pruned lazily) for the DOM "removing
// steps": when a node is removed, every NodeIterator must adjust its reference.
const __obscura_liveNodeIterators = [];
function __obscura_runNodeIteratorPreRemove(toBeRemoved) {
  const list = __obscura_liveNodeIterators;
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i].deref();
    if (!it) { list.splice(i, 1); continue; }
    it._preRemove(toBeRemoved);
  }
}

globalThis.NodeIterator = class NodeIterator {
  constructor(root, whatToShow, filter) {
    this._root = root;
    this._reference = root;
    this._beforeReference = true;
    this._whatToShow = whatToShow >>> 0;
    this._filter = filter || null;
    this._active = false;
    __obscura_liveNodeIterators.push(new WeakRef(this));
  }
  // DOM "NodeIterator pre-removing steps" — run BEFORE toBeRemoved detaches.
  _preRemove(node) {
    // No-op unless node is a strict descendant of root that contains reference.
    if (__obscura_isInclusiveAncestor(node, this._root)) return;
    if (!__obscura_isInclusiveAncestor(node, this._reference)) return;
    if (!this._beforeReference) {
      this._reference = __obscura_precedingNode(node, null);
      return;
    }
    const next = __obscura_nextNodeDescendants(node);
    if (next) { this._reference = next; return; }
    this._reference = __obscura_precedingNode(node, null);
    this._beforeReference = false;
  }
  get root() { return this._root; }
  get referenceNode() { return this._reference; }
  get pointerBeforeReferenceNode() { return this._beforeReference; }
  get whatToShow() { return this._whatToShow; }
  get filter() { return this._filter; }
  get [Symbol.toStringTag]() { return "NodeIterator"; }

  _traverse(forward) {
    let node = this._reference;
    let before = this._beforeReference;
    for (;;) {
      if (forward) {
        if (before) {
          before = false;
        } else {
          const next = __obscura_followingNode(node, this._root);
          if (!next) return null;
          node = next;
        }
      } else {
        if (!before) {
          before = true;
        } else {
          const prev = __obscura_precedingNode(node, this._root);
          if (!prev) return null;
          node = prev;
        }
      }
      if (__obscura_filterNode(this, node) === 1) {
        this._reference = node;
        this._beforeReference = before;
        return node;
      }
    }
  }
  nextNode() { return this._traverse(true); }
  previousNode() { return this._traverse(false); }
  detach() { /* no-op per DOM spec */ }
};

globalThis.TreeWalker = class TreeWalker {
  constructor(root, whatToShow, filter) {
    this._root = root;
    this._currentNode = root;
    this._whatToShow = whatToShow >>> 0;
    this._filter = filter || null;
    this._active = false;
  }
  get root() { return this._root; }
  get whatToShow() { return this._whatToShow; }
  get filter() { return this._filter; }
  get currentNode() { return this._currentNode; }
  set currentNode(value) {
    // currentNode is a non-nullable Node attribute: non-Node values throw.
    if (!(value instanceof Node)) throw new TypeError("currentNode must be a Node");
    this._currentNode = value;
  }
  get [Symbol.toStringTag]() { return "TreeWalker"; }

  // DOM §6.2 "traverse children" (type: true = first, false = last).
  _traverseChildren(first) {
    let node = first ? this.currentNode.firstChild : this.currentNode.lastChild;
    while (node) {
      const result = __obscura_filterNode(this, node);
      if (result === 1) { this.currentNode = node; return node; }
      if (result === 3) {
        const child = first ? node.firstChild : node.lastChild;
        if (child) { node = child; continue; }
      }
      // FILTER_REJECT, or FILTER_SKIP with no children: move to a sibling,
      // climbing out until we find one (without escaping root/currentNode).
      while (node) {
        const sibling = first ? node.nextSibling : node.previousSibling;
        if (sibling) { node = sibling; break; }
        const parent = node.parentNode;
        if (!parent || parent === this._root || parent === this.currentNode) return null;
        node = parent;
      }
    }
    return null;
  }
  // DOM §6.2 "traverse siblings" (type: true = next, false = previous).
  _traverseSiblings(next) {
    let node = this.currentNode;
    if (node === this._root) return null;
    for (;;) {
      let sibling = next ? node.nextSibling : node.previousSibling;
      while (sibling) {
        node = sibling;
        const result = __obscura_filterNode(this, node);
        if (result === 1) { this.currentNode = node; return node; }
        sibling = next ? node.firstChild : node.lastChild;
        if (result === 2 || !sibling) {
          sibling = next ? node.nextSibling : node.previousSibling;
        }
      }
      node = node.parentNode;
      if (!node || node === this._root) return null;
      if (__obscura_filterNode(this, node) === 1) return null;
    }
  }
  firstChild() { return this._traverseChildren(true); }
  lastChild() { return this._traverseChildren(false); }
  nextSibling() { return this._traverseSiblings(true); }
  previousSibling() { return this._traverseSiblings(false); }
  parentNode() {
    let node = this.currentNode;
    while (node && node !== this._root) {
      node = node.parentNode;
      if (node && __obscura_filterNode(this, node) === 1) {
        this.currentNode = node;
        return node;
      }
    }
    return null;
  }
  nextNode() {
    let node = this.currentNode;
    let result = 1; // FILTER_ACCEPT
    for (;;) {
      while (result !== 2 && node.firstChild) {
        node = node.firstChild;
        result = __obscura_filterNode(this, node);
        if (result === 1) { this.currentNode = node; return node; }
      }
      let sibling = null;
      let temporary = node;
      while (temporary) {
        if (temporary === this._root) return null;
        sibling = temporary.nextSibling;
        if (sibling) { node = sibling; break; }
        temporary = temporary.parentNode;
      }
      if (!sibling) return null;
      result = __obscura_filterNode(this, node);
      if (result === 1) { this.currentNode = node; return node; }
    }
  }
  previousNode() {
    let node = this.currentNode;
    while (node !== this._root) {
      let sibling = node.previousSibling;
      while (sibling) {
        node = sibling;
        let result = __obscura_filterNode(this, node);
        while (result !== 2 && node.lastChild) {
          node = node.lastChild;
          result = __obscura_filterNode(this, node);
        }
        if (result === 1) { this.currentNode = node; return node; }
        sibling = node.previousSibling;
      }
      if (node === this._root || !node.parentNode) return null;
      node = node.parentNode;
      if (__obscura_filterNode(this, node) === 1) { this.currentNode = node; return node; }
    }
    return null;
  }
};

// ---------------------------------------------------------------------------
// Range (DOM §5). Backed by two boundary points (container, offset). All the
// comparison/positioning/mutation algorithms below follow the DOM Standard.
// ---------------------------------------------------------------------------
function __obscura_furthestAncestor(node) {
  let root = node;
  while (root.parentNode != null) root = root.parentNode;
  return root;
}
function __obscura_nodeLength(node) {
  const t = node.nodeType;
  if (t === 10) return 0;                       // DocumentType
  if (t === 3 || t === 8 || t === 7) return node.data.length; // CharacterData / PI
  return node.childNodes.length;
}
function __obscura_nodeIndex(node) {
  let i = 0;
  for (let n = node.previousSibling; n; n = n.previousSibling) i++;
  return i;
}
// True iff `a` follows `b` in tree order (preorder), within the same tree.
function __obscura_isFollowing(a, b) {
  if (a === b) return false;
  const aAnc = []; for (let n = a; n; n = n.parentNode) aAnc.push(n);
  const bAnc = []; for (let n = b; n; n = n.parentNode) bAnc.push(n);
  if (aAnc[aAnc.length - 1] !== bAnc[bAnc.length - 1]) return false; // different roots
  aAnc.reverse(); bAnc.reverse();
  let i = 0;
  while (i < aAnc.length && i < bAnc.length && aAnc[i] === bAnc[i]) i++;
  if (i >= aAnc.length) return false; // a is an ancestor of b -> a precedes b
  if (i >= bAnc.length) return true;  // b is an ancestor of a -> a follows b
  for (let n = bAnc[i].nextSibling; n; n = n.nextSibling) if (n === aAnc[i]) return true;
  return false;
}
// Position of boundary point (nodeA,offsetA) relative to (nodeB,offsetB):
// -1 before, 0 equal, 1 after.
function __obscura_bpCompare(nodeA, offsetA, nodeB, offsetB) {
  if (nodeA === nodeB) return offsetA < offsetB ? -1 : (offsetA > offsetB ? 1 : 0);
  if (__obscura_isFollowing(nodeA, nodeB)) return -__obscura_bpCompare(nodeB, offsetB, nodeA, offsetA);
  if (__obscura_isInclusiveAncestor(nodeA, nodeB)) {
    let child = nodeB;
    while (child.parentNode !== nodeA) child = child.parentNode;
    if (__obscura_nodeIndex(child) < offsetA) return 1;
  }
  return -1;
}
function __obscura_nodeDocument(n) {
  return n.nodeType === 9 ? n : (n.ownerDocument || globalThis.document);
}

// DOM "ensure pre-insertion validity" of `node` into `parent` before `child` —
// the throw-only half (no mutation), so Range.insertNode can validate before it
// splits text. Covers the parent/ancestor/reference checks plus the node-type
// rules that reject inserting a Document, a misplaced doctype, or Text into a
// Document. (Document-parent cardinality rules are handled by insertBefore.)
function __obscura_ensurePreInsertionValidity(node, parent, child) {
  const pt = parent.nodeType;
  if (pt !== 1 && pt !== 9 && pt !== 11)
    throw new DOMException("Cannot insert into this node type", "HierarchyRequestError");
  if (node._nid === parent._nid || (typeof node.contains === 'function' && node.contains(parent)))
    throw new DOMException("The node is an inclusive ancestor of the insertion parent", "HierarchyRequestError");
  if (child != null && (!child.parentNode || child.parentNode._nid !== parent._nid))
    throw new DOMException("The reference child is not a child of the parent", "NotFoundError");
  const nt = node.nodeType;
  if (nt !== 1 && nt !== 3 && nt !== 4 && nt !== 7 && nt !== 8 && nt !== 10 && nt !== 11)
    throw new DOMException("The node is not a valid child (e.g. a Document)", "HierarchyRequestError");
  if (((nt === 3 || nt === 4) && pt === 9) || (nt === 10 && pt !== 9))
    throw new DOMException("Invalid node/parent combination", "HierarchyRequestError");
}

globalThis.Range = class Range {
  constructor() {
    this._sc = globalThis.document; this._so = 0;
    this._ec = globalThis.document; this._eo = 0;
  }
  get startContainer() { return this._sc; }
  get startOffset() { return this._so; }
  get endContainer() { return this._ec; }
  get endOffset() { return this._eo; }
  get collapsed() { return this._sc === this._ec && this._so === this._eo; }
  get commonAncestorContainer() {
    let c = this._sc;
    while (!__obscura_isInclusiveAncestor(c, this._ec)) c = c.parentNode;
    return c;
  }
  get [Symbol.toStringTag]() { return "Range"; }
  _root() { return __obscura_furthestAncestor(this._sc); }

  // --- setting boundary points -------------------------------------------
  setStart(node, offset) {
    if (node.nodeType === 10) throw new DOMException("Range start cannot be a doctype", "InvalidNodeTypeError");
    offset = offset >>> 0;
    if (offset > __obscura_nodeLength(node)) throw new DOMException("Range offset out of bounds", "IndexSizeError");
    if (__obscura_furthestAncestor(node) !== this._root() || __obscura_bpCompare(node, offset, this._ec, this._eo) === 1) {
      this._ec = node; this._eo = offset;
    }
    this._sc = node; this._so = offset;
  }
  setEnd(node, offset) {
    if (node.nodeType === 10) throw new DOMException("Range end cannot be a doctype", "InvalidNodeTypeError");
    offset = offset >>> 0;
    if (offset > __obscura_nodeLength(node)) throw new DOMException("Range offset out of bounds", "IndexSizeError");
    if (__obscura_furthestAncestor(node) !== this._root() || __obscura_bpCompare(node, offset, this._sc, this._so) === -1) {
      this._sc = node; this._so = offset;
    }
    this._ec = node; this._eo = offset;
  }
  setStartBefore(node) { const p = node.parentNode; if (!p) throw new DOMException("node has no parent", "InvalidNodeTypeError"); this.setStart(p, __obscura_nodeIndex(node)); }
  setStartAfter(node) { const p = node.parentNode; if (!p) throw new DOMException("node has no parent", "InvalidNodeTypeError"); this.setStart(p, __obscura_nodeIndex(node) + 1); }
  setEndBefore(node) { const p = node.parentNode; if (!p) throw new DOMException("node has no parent", "InvalidNodeTypeError"); this.setEnd(p, __obscura_nodeIndex(node)); }
  setEndAfter(node) { const p = node.parentNode; if (!p) throw new DOMException("node has no parent", "InvalidNodeTypeError"); this.setEnd(p, __obscura_nodeIndex(node) + 1); }
  collapse(toStart) {
    if (toStart) { this._ec = this._sc; this._eo = this._so; }
    else { this._sc = this._ec; this._so = this._eo; }
  }
  selectNode(node) {
    const parent = node.parentNode;
    if (!parent) throw new DOMException("node has no parent", "InvalidNodeTypeError");
    const index = __obscura_nodeIndex(node);
    this._sc = parent; this._so = index;
    this._ec = parent; this._eo = index + 1;
  }
  selectNodeContents(node) {
    if (node.nodeType === 10) throw new DOMException("cannot select a doctype's contents", "InvalidNodeTypeError");
    this._sc = node; this._so = 0;
    this._ec = node; this._eo = __obscura_nodeLength(node);
  }

  // --- comparisons -------------------------------------------------------
  compareBoundaryPoints(how, sourceRange) {
    how = (how >>> 0) & 0xFFFF; // WebIDL: how is an unsigned short
    if (how !== 0 && how !== 1 && how !== 2 && how !== 3)
      throw new DOMException("invalid comparison type", "NotSupportedError");
    if (this._root() !== sourceRange._root())
      throw new DOMException("ranges are in different trees", "WrongDocumentError");
    let tc, to, oc, oo;
    if (how === 0) { tc = this._sc; to = this._so; oc = sourceRange._sc; oo = sourceRange._so; }       // START_TO_START
    else if (how === 1) { tc = this._ec; to = this._eo; oc = sourceRange._sc; oo = sourceRange._so; }   // START_TO_END
    else if (how === 2) { tc = this._ec; to = this._eo; oc = sourceRange._ec; oo = sourceRange._eo; }   // END_TO_END
    else { tc = this._sc; to = this._so; oc = sourceRange._ec; oo = sourceRange._eo; }                  // END_TO_START
    return __obscura_bpCompare(tc, to, oc, oo);
  }
  comparePoint(node, offset) {
    if (__obscura_furthestAncestor(node) !== this._root())
      throw new DOMException("node is in a different tree", "WrongDocumentError");
    if (node.nodeType === 10) throw new DOMException("node is a doctype", "InvalidNodeTypeError");
    offset = offset >>> 0;
    if (offset > __obscura_nodeLength(node)) throw new DOMException("offset out of bounds", "IndexSizeError");
    if (__obscura_bpCompare(node, offset, this._sc, this._so) === -1) return -1;
    if (__obscura_bpCompare(node, offset, this._ec, this._eo) === 1) return 1;
    return 0;
  }
  isPointInRange(node, offset) {
    if (__obscura_furthestAncestor(node) !== this._root()) return false;
    if (node.nodeType === 10) throw new DOMException("node is a doctype", "InvalidNodeTypeError");
    offset = offset >>> 0;
    if (offset > __obscura_nodeLength(node)) throw new DOMException("offset out of bounds", "IndexSizeError");
    if (__obscura_bpCompare(node, offset, this._sc, this._so) === -1) return false;
    if (__obscura_bpCompare(node, offset, this._ec, this._eo) === 1) return false;
    return true;
  }
  intersectsNode(node) {
    if (__obscura_furthestAncestor(node) !== this._root()) return false;
    const parent = node.parentNode;
    if (!parent) return true;
    const offset = __obscura_nodeIndex(node);
    return __obscura_bpCompare(parent, offset, this._ec, this._eo) === -1
        && __obscura_bpCompare(parent, offset + 1, this._sc, this._so) === 1;
  }

  // --- contained / partially-contained helpers ---------------------------
  _contains(node) {
    return __obscura_furthestAncestor(node) === this._root()
        && __obscura_bpCompare(node, 0, this._sc, this._so) === 1
        && __obscura_bpCompare(node, __obscura_nodeLength(node), this._ec, this._eo) === -1;
  }
  _partiallyContains(node) {
    return __obscura_isInclusiveAncestor(node, this._sc) !== __obscura_isInclusiveAncestor(node, this._ec);
  }

  // --- content operations ------------------------------------------------
  cloneRange() {
    const r = new Range();
    r._sc = this._sc; r._so = this._so; r._ec = this._ec; r._eo = this._eo;
    return r;
  }
  detach() { /* no-op per DOM spec */ }

  toString() {
    let s = "";
    const sc = this._sc, so = this._so, ec = this._ec, eo = this._eo;
    if (sc === ec && sc.nodeType === 3) return sc.data.slice(so, eo);
    if (sc.nodeType === 3) s += sc.data.slice(so);
    const common = this.commonAncestorContainer;
    const self = this;
    (function rec(n) {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3
            && __obscura_bpCompare(c, 0, sc, so) === 1
            && __obscura_bpCompare(c, c.data.length, ec, eo) === -1) {
          s += c.data;
        }
        rec(c);
      }
    })(common);
    if (ec.nodeType === 3) s += ec.data.slice(0, eo);
    return s;
  }

  _firstPartiallyContainedChild(common) {
    if (__obscura_isInclusiveAncestor(this._sc, this._ec)) return null;
    for (let c = common.firstChild; c; c = c.nextSibling) if (this._partiallyContains(c)) return c;
    return null;
  }
  _lastPartiallyContainedChild(common) {
    if (__obscura_isInclusiveAncestor(this._ec, this._sc)) return null;
    for (let c = common.lastChild; c; c = c.previousSibling) if (this._partiallyContains(c)) return c;
    return null;
  }
  _containedChildren(common) {
    const out = [];
    for (let c = common.firstChild; c; c = c.nextSibling) if (this._contains(c)) out.push(c);
    return out;
  }

  cloneContents() {
    const frag = __obscura_nodeDocument(this._sc).createDocumentFragment();
    if (this.collapsed) return frag;
    const sc = this._sc, so = this._so, ec = this._ec, eo = this._eo;
    if (sc === ec && (sc.nodeType === 3 || sc.nodeType === 8 || sc.nodeType === 7)) {
      const clone = sc.cloneNode(false);
      clone.data = sc.substringData(so, eo - so);
      frag.appendChild(clone);
      return frag;
    }
    const common = this.commonAncestorContainer;
    const first = this._firstPartiallyContainedChild(common);
    const last = this._lastPartiallyContainedChild(common);
    const contained = this._containedChildren(common);
    if (first && (first.nodeType === 3 || first.nodeType === 8 || first.nodeType === 7)) {
      const clone = sc.cloneNode(false);
      clone.data = sc.substringData(so, __obscura_nodeLength(sc) - so);
      frag.appendChild(clone);
    } else if (first) {
      const clone = first.cloneNode(false);
      frag.appendChild(clone);
      const sub = new Range(); sub._sc = sc; sub._so = so; sub._ec = first; sub._eo = __obscura_nodeLength(first);
      clone.appendChild(sub.cloneContents());
    }
    for (const child of contained) frag.appendChild(child.cloneNode(true));
    if (last && (last.nodeType === 3 || last.nodeType === 8 || last.nodeType === 7)) {
      const clone = ec.cloneNode(false);
      clone.data = ec.substringData(0, eo);
      frag.appendChild(clone);
    } else if (last) {
      const clone = last.cloneNode(false);
      frag.appendChild(clone);
      const sub = new Range(); sub._sc = last; sub._so = 0; sub._ec = ec; sub._eo = eo;
      clone.appendChild(sub.cloneContents());
    }
    return frag;
  }

  extractContents() {
    const frag = __obscura_nodeDocument(this._sc).createDocumentFragment();
    if (this.collapsed) return frag;
    const sc = this._sc, so = this._so, ec = this._ec, eo = this._eo;
    if (sc === ec && (sc.nodeType === 3 || sc.nodeType === 8 || sc.nodeType === 7)) {
      const clone = sc.cloneNode(false);
      clone.data = sc.substringData(so, eo - so);
      frag.appendChild(clone);
      sc.deleteData(so, eo - so);
      return frag;
    }
    const common = this.commonAncestorContainer;
    const first = this._firstPartiallyContainedChild(common);
    const last = this._lastPartiallyContainedChild(common);
    const contained = this._containedChildren(common);
    // Where the range collapses to after extraction.
    let newNode, newOffset;
    if (__obscura_isInclusiveAncestor(sc, ec)) { newNode = sc; newOffset = so; }
    else {
      let reference = sc;
      while (reference.parentNode && !__obscura_isInclusiveAncestor(reference.parentNode, ec)) reference = reference.parentNode;
      newNode = reference.parentNode; newOffset = __obscura_nodeIndex(reference) + 1;
    }
    if (first && (first.nodeType === 3 || first.nodeType === 8 || first.nodeType === 7)) {
      const clone = sc.cloneNode(false);
      clone.data = sc.substringData(so, __obscura_nodeLength(sc) - so);
      frag.appendChild(clone);
      sc.deleteData(so, __obscura_nodeLength(sc) - so);
    } else if (first) {
      const clone = first.cloneNode(false);
      frag.appendChild(clone);
      const sub = new Range(); sub._sc = sc; sub._so = so; sub._ec = first; sub._eo = __obscura_nodeLength(first);
      clone.appendChild(sub.extractContents());
    }
    for (const child of contained) frag.appendChild(child);
    if (last && (last.nodeType === 3 || last.nodeType === 8 || last.nodeType === 7)) {
      const clone = ec.cloneNode(false);
      clone.data = ec.substringData(0, eo);
      frag.appendChild(clone);
      ec.deleteData(0, eo);
    } else if (last) {
      const clone = last.cloneNode(false);
      frag.appendChild(clone);
      const sub = new Range(); sub._sc = last; sub._so = 0; sub._ec = ec; sub._eo = eo;
      clone.appendChild(sub.extractContents());
    }
    this._sc = newNode; this._so = newOffset; this._ec = newNode; this._eo = newOffset;
    return frag;
  }

  deleteContents() {
    if (this.collapsed) return;
    const sc = this._sc, so = this._so, ec = this._ec, eo = this._eo;
    if (sc === ec && (sc.nodeType === 3 || sc.nodeType === 8 || sc.nodeType === 7)) {
      sc.deleteData(so, eo - so);
      return;
    }
    // Top-level contained nodes (omit those whose parent is also contained).
    const toRemove = [];
    const self = this;
    (function rec(n) {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (self._contains(c)) toRemove.push(c);
        else rec(c);
      }
    })(this.commonAncestorContainer);
    let newNode, newOffset;
    if (__obscura_isInclusiveAncestor(sc, ec)) { newNode = sc; newOffset = so; }
    else {
      let reference = sc;
      while (reference.parentNode && !__obscura_isInclusiveAncestor(reference.parentNode, ec)) reference = reference.parentNode;
      newNode = reference.parentNode; newOffset = __obscura_nodeIndex(reference) + 1;
    }
    if (sc.nodeType === 3 || sc.nodeType === 8 || sc.nodeType === 7) sc.deleteData(so, __obscura_nodeLength(sc) - so);
    for (const n of toRemove) n.parentNode && n.parentNode.removeChild(n);
    if (ec.nodeType === 3 || ec.nodeType === 8 || ec.nodeType === 7) ec.deleteData(0, eo);
    this._sc = newNode; this._so = newOffset; this._ec = newNode; this._eo = newOffset;
  }

  insertNode(node) {
    const sc = this._sc;
    if (sc.nodeType === 7 || sc.nodeType === 8 || (sc.nodeType === 3 && !sc.parentNode) || node === sc)
      throw new DOMException("cannot insert at this boundary", "HierarchyRequestError");
    let referenceNode = (sc.nodeType === 3) ? sc : (sc.childNodes[this._so] || null);
    const parent = referenceNode === null ? sc : referenceNode.parentNode;
    // Spec step: ensure pre-insertion validity BEFORE any mutation (the text split
    // below), so an invalid node (Document, misplaced doctype, ancestor, …) throws
    // with the DOM left untouched.
    __obscura_ensurePreInsertionValidity(node, parent, referenceNode);
    if (sc.nodeType === 3) referenceNode = sc.splitText(this._so);
    if (node === referenceNode) referenceNode = node.nextSibling;
    if (node.parentNode) node.parentNode.removeChild(node);
    let newOffset = referenceNode === null ? __obscura_nodeLength(parent) : __obscura_nodeIndex(referenceNode);
    newOffset += (node.nodeType === 11) ? __obscura_nodeLength(node) : 1;
    parent.insertBefore(node, referenceNode);
    if (this.collapsed) { this._ec = parent; this._eo = newOffset; }
  }

  surroundContents(newParent) {
    // No non-Text node may be partially contained.
    for (let n = this._sc; n && n !== this.commonAncestorContainer; n = n.parentNode)
      if (this._partiallyContains(n) && n.nodeType !== 3) throw new DOMException("partially contained non-Text node", "InvalidStateError");
    for (let n = this._ec; n && n !== this.commonAncestorContainer; n = n.parentNode)
      if (this._partiallyContains(n) && n.nodeType !== 3) throw new DOMException("partially contained non-Text node", "InvalidStateError");
    const t = newParent.nodeType;
    if (t === 9 || t === 10 || t === 11) throw new DOMException("invalid newParent", "InvalidNodeTypeError");
    const fragment = this.extractContents();
    while (newParent.firstChild) newParent.removeChild(newParent.firstChild);
    this.insertNode(newParent);
    newParent.appendChild(fragment);
    this.selectNode(newParent);
  }

  getBoundingClientRect() { return new DOMRect(); }
  getClientRects() { const l = []; l.item = () => null; return l; }
};
Range.START_TO_START = 0; Range.START_TO_END = 1; Range.END_TO_END = 2; Range.END_TO_START = 3;
Range.prototype.START_TO_START = 0; Range.prototype.START_TO_END = 1;
Range.prototype.END_TO_END = 2; Range.prototype.END_TO_START = 3;

// WebIDL conformance for querySelector(All): the selector is a DOMString, so it
// must be stringified (null -> "null", undefined -> "undefined"), and calling
// with no argument is a TypeError (arity). Centralized here over every ParentNode
// implementation rather than duplicated in each method body.
for (const Cls of [Element, Document, DocumentFragment, DetachedDocument]) {
  for (const m of ['querySelector', 'querySelectorAll']) {
    const orig = Cls.prototype[m];
    if (typeof orig !== 'function') continue;
    Cls.prototype[m] = function(s) {
      if (arguments.length < 1)
        throw new TypeError("Failed to execute '" + m + "': 1 argument required, but only 0 present.");
      return orig.call(this, String(s));
    };
  }
}

[
  navigator.getBattery, navigator.getGamepads, navigator.sendBeacon,
  navigator.javaEnabled, navigator.serviceWorker?.register,
  navigator.permissions?.query, navigator.credentials?.get,
  globalThis.fetch, globalThis.matchMedia, globalThis.getComputedStyle,
  globalThis.getSelection, globalThis.requestAnimationFrame,
  globalThis.cancelAnimationFrame, globalThis.setTimeout, globalThis.clearTimeout,
  globalThis.setInterval, globalThis.clearInterval, globalThis.queueMicrotask,
  globalThis.structuredClone, globalThis.reportError,
  globalThis.btoa, globalThis.atob,
  console.log, console.warn, console.error, console.info, console.debug,
  console.dir, console.assert,
  Element.prototype.getAttribute, Element.prototype.setAttribute,
  Element.prototype.removeAttribute, Element.prototype.hasAttribute,
  Element.prototype.querySelector, Element.prototype.querySelectorAll,
  Element.prototype.getElementsByTagName, Element.prototype.getElementsByClassName,
  Element.prototype.matches, Element.prototype.closest,
  Element.prototype.getBoundingClientRect, Element.prototype.getClientRects,
  Element.prototype.checkVisibility,
  Element.prototype.addEventListener, Element.prototype.removeEventListener,
  Element.prototype.dispatchEvent, Element.prototype.click,
  Element.prototype.focus, Element.prototype.blur,
  Element.prototype.cloneNode, Element.prototype.attachShadow,
  Element.prototype.insertAdjacentHTML, Element.prototype.scrollIntoView,
  Element.prototype.insertAdjacentElement, Element.prototype.insertAdjacentText,
  Element.prototype.append, Element.prototype.prepend, Element.prototype.remove,
  Element.prototype.before, Element.prototype.after, Element.prototype.replaceWith,
  HTMLFormElement.prototype.reset,
  Element.prototype.getContext, Element.prototype.toDataURL, Element.prototype.toBlob,
  Node.prototype.appendChild, Node.prototype.removeChild,
  Node.prototype.replaceChild, Node.prototype.insertBefore,
  Node.prototype.contains, Node.prototype.hasChildNodes, Node.prototype.cloneNode,
  CharacterData.prototype.before, CharacterData.prototype.after,
  CharacterData.prototype.replaceWith, CharacterData.prototype.remove,
  Document.prototype.getElementById, Document.prototype.querySelector,
  Document.prototype.querySelectorAll, Document.prototype.getElementsByTagName,
  Document.prototype.createElement, Document.prototype.createElementNS,
  Document.prototype.createTextNode, Document.prototype.createComment,
  Document.prototype.createDocumentFragment, Document.prototype.createEvent,
  Document.prototype.hasFocus,
  Storage, Storage.prototype.getItem, Storage.prototype.setItem,
  Storage.prototype.removeItem, Storage.prototype.clear, Storage.prototype.key,
  Notification, Notification.requestPermission,
  window.chrome?.csi, window.chrome?.loadTimes,
  MutationObserver, ResizeObserver, IntersectionObserver, PerformanceObserver,
  XMLSerializer, XMLSerializer.prototype.serializeToString,
].forEach(fn => { if (typeof fn === 'function') _markNative(fn); });

// A frame's content document is a REAL node-backed document (extends
// DetachedDocument → Document → Node), so it answers childNodes / firstChild /
// appendChild / removeChild / insertBefore / doctype with true tree semantics.
// The WPT range content-op harness depends on this (`restoreIframe` mutates the
// document directly). Earlier this was a hand-rolled shim that only exposed
// documentElement/head/body, so document-as-Node operations threw or returned
// undefined and the harness could not run.
class _IframeDocument extends DetachedDocument {
  constructor(html, url, iframeEl, baseUrl, kind) {
    // An XML document (application/xml) has NO synthetic html/head/body scaffold —
    // its documentElement is the parsed root element. XHTML scaffolds like HTML but
    // creates elements case-sensitively (promoted via _createMode below).
    super(kind === 'xml' ? 'xml' : 'html');
    if (kind === 'xhtml') this._createMode = 'xhtml';
    this._url = url;
    // Base URL for resolving relative resources / baseURI. Usually === url, but
    // for an about:srcdoc document document.URL is 'about:srcdoc' while the base
    // (and relative <script src> resolution) is the parent's URL (HTML spec).
    this._baseUrl = baseUrl || url;
    this._iframeEl = iframeEl;
    this._evtKey = _nextSyntheticKey();
    if (kind === 'xml') {
      // XML document: the parsed root element IS the documentElement (no synthetic
      // <html>/<head>/<body>). A REAL namespace-aware XML parser (not html5ever)
      // builds the tree so `<foo/>` yields namespaceURI===null and prefixes resolve
      // to their declared URIs. Non-well-formed input → a Gecko-style parsererror.
      const r = _parseXMLDocument(String(html || ''), this);
      if (r.ok) {
        for (let k = 0; k < r.nodes.length; k++) this.appendChild(r.nodes[k]);
      } else {
        const pe = this.createElementNS(_PARSERERROR_NS, 'parsererror');
        try { pe.appendChild(this.createTextNode('This page contains the following errors:' + (r.message ? '\nerror: ' + r.message : ''))); } catch (e) {}
        this.appendChild(pe);
      }
      return;
    }
    // The explicit <html>/<head>/<body> start tags get stripped below (we parse
    // into a synthetic scaffold), which would discard any attributes on them.
    // Real parsers merge those attributes onto the implicit html/head/body, and
    // WPT relies on it (e.g. <html id=html lang=en>, <body id=body>), so copy
    // them onto the scaffold elements first — reusing the real attribute parser.
    const _copyStartTagAttrs = (tagName, target) => {
      if (!target) return;
      const m = String(html || '').match(new RegExp('<' + tagName + '\\b([^>]*)>', 'i'));
      if (!m || !m[1] || !m[1].trim()) return;
      try {
        const tmp = globalThis.document.createElement('div');
        tmp.innerHTML = '<div' + m[1] + '></div>';
        const probe = tmp.firstElementChild;
        if (probe) { const at = probe.attributes; for (let i = 0; i < at.length; i++) target.setAttribute(at[i].name, at[i].value); }
      } catch (e) {}
    };
    _copyStartTagAttrs('html', this.documentElement);
    _copyStartTagAttrs('head', this.head);
    _copyStartTagAttrs('body', this.body);
    // Parse the markup into <body> (one html5ever fragment parse, which handles
    // pages with OR without explicit <head>/<body> — WPT pages often omit them),
    // then lift the metadata elements into <head>, mirroring the parser's
    // implicit head construction. <script> is left in the tree and executed
    // later by _executeFrameScripts (innerHTML never runs scripts).
    var inner = String(html || '')
      .replace(/^﻿?\s*<!DOCTYPE[^>]*>/i, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<\/?head[^>]*>/gi, '')
      .replace(/<\/?body[^>]*>/gi, '')
      .replace(/^\s+/, '');
    // XHTML: trailing whitespace after </html> would otherwise land as a stray text
    // node in <body>, polluting documentElement.textContent (XML has no such node).
    if (kind === 'xhtml') inner = inner.replace(/\s+$/, '');
    if (inner) {
      try {
        const body = this.body;
        if (body) {
          body.innerHTML = inner;
          const head = this.head;
          const metas = body.querySelectorAll('title, meta, link, base, style');
          if (head) for (let i = 0; i < metas.length; i++) head.appendChild(metas[i]);
        }
      } catch (e) {}
    }
  }

  // Live structural getters: restoreIframe() rebuilds the tree (removes <html>,
  // appends a fresh clone), so these MUST reflect the current children rather
  // than nodes captured at construction.
  get documentElement() {
    const kids = this.childNodes;
    for (let i = 0; i < kids.length; i++) if (kids[i] && kids[i].nodeType === 1) return kids[i];
    return null;
  }
  get head() { return this.querySelector('head'); }
  get body() { return this.querySelector('body'); }
  get title() { const t = this.querySelector('title'); return t ? t.textContent : ''; }
  set title(v) {
    let t = this.querySelector('title');
    if (!t) { const h = this.head; if (h) { t = this.createElement('title'); h.appendChild(t); } }
    if (t) t.textContent = String(v);
  }
  get URL() { return this._url; }
  get documentURI() { return this._url; }
  get baseURI() { return this._baseUrl; }
  // A DOMParser-built document has no iframe element → location is null (spec).
  get location() { return this._iframeEl ? (this._iframeEl.contentWindow?.location ?? null) : null; }
  get defaultView() { return this._iframeEl?.contentWindow || null; }
  get ownerDocument() { return null; }
  get compatMode() { return this._compatMode || 'CSS1Compat'; }
  get contentType() { return this._contentType || 'text/html'; }
  get characterSet() { return 'UTF-8'; }
  get charset() { return this.characterSet; }        // legacy alias of characterSet
  get inputEncoding() { return this.characterSet; }  // legacy alias of characterSet
  get readyState() { return 'complete'; }
  get visibilityState() { return 'visible'; }
  get hidden() { return false; }
  get activeElement() { return this.body; }
  get cookie() { return ''; }
  set cookie(v) {}
  get implementation() { return globalThis.document.implementation; }
  get styleSheets() { return []; }
  hasFocus() { return false; }

  addEventListener(type, handler, opts) { _addListenerByKey(this._evtKey, type, handler, opts); }
  removeEventListener(type, handler, opts) { _removeListenerByKey(this._evtKey, type, handler, opts); }
  dispatchEvent(event) {
    // Document events bubble to the frame's window via the unified path
    // (_eventParent follows this document's defaultView -> contentWindow).
    return _dispatchPublic(this, event);
  }

  write(html) { const b = this.body; if (b) b.innerHTML += html; }
  writeln(html) { this.write(html + '\n'); }
  open() { const b = this.body; if (b) b.innerHTML = ''; }
  close() {}
}

class _IframeWindow {
  constructor(doc, url, originUrl) {
    this.document = doc;
    this._url = url;
    this.self = this;
    this.top = globalThis;
    this.parent = globalThis;
    this.window = this;
    this.frames = this;
    this.frameElement = null;
    this._evtKey = _nextSyntheticKey();
    this.length = 0;
    this.name = '';
    this.closed = false;
    this.navigator = globalThis.navigator;
    this.screen = globalThis.screen;
    this.innerWidth = 300;
    this.innerHeight = 150;
    this.outerWidth = 300;
    this.outerHeight = 150;
    this.devicePixelRatio = globalThis.devicePixelRatio;
    this.localStorage = globalThis.localStorage;
    this.sessionStorage = globalThis.sessionStorage;
    this.performance = globalThis.performance;
    this.crypto = globalThis.crypto;
    this.console = globalThis.console;
    this.chrome = globalThis.chrome;

    try {
      const u = new URL(url);
      this.location = {
        href: url, origin: u.origin, protocol: u.protocol,
        host: u.host, hostname: u.hostname, port: u.port,
        pathname: u.pathname, search: u.search, hash: u.hash,
        toString() { return url; }, assign(){}, reload(){}, replace(){},
      };
    } catch(e) {
      this.location = { href: url, origin: '', protocol: '', host: '', hostname: '', port: '', pathname: '/', search: '', hash: '', toString() { return url; }, assign(){}, reload(){}, replace(){} };
    }
    // For an about:srcdoc frame, location.href is 'about:srcdoc' but the origin is
    // the parent's (the srcdoc document is same-origin with its host) — pass the
    // parent URL as originUrl to override just the origin (HTML spec).
    if (originUrl) {
      try { this.location.origin = new URL(originUrl).origin; } catch(e) {}
    }
    // Same-origin frames share the page's single JS realm, so anything the frame
    // window doesn't define itself (global constructors like DOMException/Node/
    // Event, etc.) falls through to globalThis. Frame-specific props (document,
    // location, parent, top, frames, self, window) are defined above and win.
    return new Proxy(this, {
      get(t, p, r) { return (p in t) ? Reflect.get(t, p, r) : globalThis[p]; },
      has(t, p) { return (p in t) || (p in globalThis); },
    });
  }

  postMessage(data, origin) {
    // Per spec, targetWindow.postMessage delivers `message` to targetWindow —
    // here the frame's own window (`this`), which now has real event dispatch.
    const event = new MessageEvent('message', {
      data: data,
      origin: this.location.origin,
      source: globalThis,
    });
    Promise.resolve().then(() => {
      this.dispatchEvent?.(event);
      if (typeof this.onmessage === 'function') { try { this.onmessage(event); } catch (e) {} }
    });
  }

  setTimeout(fn, ms) { return globalThis.setTimeout(fn, ms); }
  clearTimeout(id) { globalThis.clearTimeout(id); }
  setInterval(fn, ms) { return globalThis.setInterval(fn, ms); }
  clearInterval(id) { globalThis.clearInterval(id); }
  requestAnimationFrame(fn) { return globalThis.requestAnimationFrame(fn); }

  addEventListener(type, handler, opts) { _addListenerByKey(this._evtKey, type, handler, opts); }
  removeEventListener(type, handler, opts) { _removeListenerByKey(this._evtKey, type, handler, opts); }
  dispatchEvent(event) {
    // Frame window is the top of the frame's propagation tree — no further bubble.
    return _dispatchPublic(this, event);
  }

  getComputedStyle(el) { return globalThis.getComputedStyle(el); }
  matchMedia(q) { return globalThis.matchMedia(q); }
  getSelection() { return globalThis.getSelection(); }
  fetch(input, init) { return globalThis.fetch(input, init); }
  close() { this.closed = true; }
  focus() {}
  blur() {}
}

const __ariaQuerySelector = function(root, selector) { return null; };
const __ariaQuerySelectorAll = async function*(root, selector) { /* yields nothing */ };
class _Canvas2D {
  constructor(canvas) {
    this.canvas = canvas;
    this._w = canvas.width || 300;
    this._h = canvas.height || 150;
    this._buf = new Uint8ClampedArray(this._w * this._h * 4);
    for (let i = 0; i < this._w * this._h; i++) {
      this._buf[i*4+0] = 255 + Math.floor(_fpNoise(i % this._w, Math.floor(i / this._w), 0));
      this._buf[i*4+1] = 255 + Math.floor(_fpNoise(i % this._w, Math.floor(i / this._w), 1));
      this._buf[i*4+2] = 255 + Math.floor(_fpNoise(i % this._w, Math.floor(i / this._w), 2));
      this._buf[i*4+3] = 255;
    }
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this._stateStack = [];
  }
  _parseColor(css) {
    if (!css || css === 'none') return [0,0,0,0];
    if (css.startsWith('#')) {
      const hex = css.slice(1);
      if (hex.length === 3) return [parseInt(hex[0]+hex[0],16),parseInt(hex[1]+hex[1],16),parseInt(hex[2]+hex[2],16),255];
      if (hex.length === 6) return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),255];
      if (hex.length === 8) return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),parseInt(hex.slice(6,8),16)];
    }
    const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m) return [+m[1],+m[2],+m[3],m[4]!==undefined?Math.round(+m[4]*255):255];
    const named = {red:[255,0,0,255],green:[0,128,0,255],blue:[0,0,255,255],white:[255,255,255,255],black:[0,0,0,255],yellow:[255,255,0,255],orange:[255,165,0,255],gray:[128,128,128,255],transparent:[0,0,0,0]};
    return named[css] || [0,0,0,255];
  }
  _setPixel(x, y, r, g, b, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= this._w || y < 0 || y >= this._h) return;
    const idx = (y * this._w + x) * 4;
    const alpha = (a / 255) * this.globalAlpha;
    this._buf[idx+0] = Math.round(r * alpha + this._buf[idx+0] * (1 - alpha));
    this._buf[idx+1] = Math.round(g * alpha + this._buf[idx+1] * (1 - alpha));
    this._buf[idx+2] = Math.round(b * alpha + this._buf[idx+2] * (1 - alpha));
    this._buf[idx+3] = Math.min(255, Math.round(a * alpha + this._buf[idx+3] * (1 - alpha)));
  }
  fillRect(x, y, w, h) {
    const [r,g,b,a] = this._parseColor(this.fillStyle);
    x=Math.round(x); y=Math.round(y); w=Math.round(w); h=Math.round(h);
    for (let py = Math.max(0,y); py < Math.min(this._h, y+h); py++) {
      for (let px = Math.max(0,x); px < Math.min(this._w, x+w); px++) {
        this._setPixel(px, py, r, g, b, a);
      }
    }
  }
  clearRect(x, y, w, h) {
    x=Math.round(x); y=Math.round(y); w=Math.round(w); h=Math.round(h);
    for (let py = Math.max(0,y); py < Math.min(this._h, y+h); py++) {
      for (let px = Math.max(0,x); px < Math.min(this._w, x+w); px++) {
        const idx = (py * this._w + px) * 4;
        this._buf[idx] = this._buf[idx+1] = this._buf[idx+2] = this._buf[idx+3] = 0;
      }
    }
  }
  strokeRect(x, y, w, h) {
    const [r,g,b,a] = this._parseColor(this.strokeStyle);
    const lw = this.lineWidth;
    for (let px = Math.round(x); px < Math.round(x+w); px++) {
      for (let l = 0; l < lw; l++) { this._setPixel(px, Math.round(y)+l, r,g,b,a); this._setPixel(px, Math.round(y+h)-1-l, r,g,b,a); }
    }
    for (let py = Math.round(y); py < Math.round(y+h); py++) {
      for (let l = 0; l < lw; l++) { this._setPixel(Math.round(x)+l, py, r,g,b,a); this._setPixel(Math.round(x+w)-1-l, py, r,g,b,a); }
    }
  }
  fillText(text, x, y) {
    const [r,g,b,a] = this._parseColor(this.fillStyle);
    const fontSize = parseInt(this.font) || 10;
    const scale = Math.max(1, Math.round(fontSize / 10));
    const str = String(text);
    let cx = Math.round(x);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          const on = ((_fpRand(code * 100 + row * 10 + col) > 0.45) &&
                      (row > 0 && row < 6 && col > 0 && col < 4)) ||
                     (_fpRand(code * 200 + row * 7 + col) > 0.7);
          if (on) {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                this._setPixel(cx + col*scale + sx, Math.round(y) - 7*scale + row*scale + sy, r, g, b, a);
              }
            }
          }
        }
      }
      cx += 6 * scale;
    }
  }
  strokeText(text, x, y) { this.fillText(text, x, y); }
  measureText(t) {
    const fontSize = parseInt(this.font) || 10;
    const scale = Math.max(1, Math.round(fontSize / 10));
    return { width: String(t).length * 6 * scale, actualBoundingBoxAscent: 7*scale, actualBoundingBoxDescent: 2*scale };
  }
  getImageData(x, y, w, h) {
    x=Math.round(x); y=Math.round(y); w=Math.round(w); h=Math.round(h);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const srcX = x + px, srcY = y + py;
        const dstIdx = (py * w + px) * 4;
        if (srcX >= 0 && srcX < this._w && srcY >= 0 && srcY < this._h) {
          const srcIdx = (srcY * this._w + srcX) * 4;
          data[dstIdx] = this._buf[srcIdx];
          data[dstIdx+1] = this._buf[srcIdx+1];
          data[dstIdx+2] = this._buf[srcIdx+2];
          data[dstIdx+3] = this._buf[srcIdx+3];
        }
      }
    }
    return { data, width: w, height: h };
  }
  putImageData(imageData, dx, dy) {
    dx=Math.round(dx); dy=Math.round(dy);
    const {data, width: w, height: h} = imageData;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const srcIdx = (py * w + px) * 4;
        const x = dx + px, y = dy + py;
        if (x >= 0 && x < this._w && y >= 0 && y < this._h) {
          const dstIdx = (y * this._w + x) * 4;
          this._buf[dstIdx] = data[srcIdx];
          this._buf[dstIdx+1] = data[srcIdx+1];
          this._buf[dstIdx+2] = data[srcIdx+2];
          this._buf[dstIdx+3] = data[srcIdx+3];
        }
      }
    }
  }
  createImageData(w, h) { return { data: new Uint8ClampedArray(w*h*4), width: w, height: h }; }
  drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (img && img._ctx && img._ctx._buf) {
      const src = img._ctx;
      dx = dx ?? sx; dy = dy ?? sy; dw = dw ?? (sw ?? src._w); dh = dh ?? (sh ?? src._h);
      for (let py = 0; py < dh; py++) {
        for (let px = 0; px < dw; px++) {
          const srcX = Math.floor((sx||0) + px * (sw||src._w) / dw);
          const srcY = Math.floor((sy||0) + py * (sh||src._h) / dh);
          if (srcX >= 0 && srcX < src._w && srcY >= 0 && srcY < src._h) {
            const srcIdx = (srcY * src._w + srcX) * 4;
            this._setPixel(dx+px, dy+py, src._buf[srcIdx], src._buf[srcIdx+1], src._buf[srcIdx+2], src._buf[srcIdx+3]);
          }
        }
      }
    }
  }
  beginPath() { this._path = []; }
  closePath() {}
  moveTo(x, y) { if (this._path) this._path.push({t:'M',x,y}); }
  lineTo(x, y) { if (this._path) this._path.push({t:'L',x,y}); }
  bezierCurveTo() {} quadraticCurveTo() {}
  arc(x, y, r, s, e) { if (this._path) this._path.push({t:'A',x,y,r}); }
  arcTo() {}
  rect(x, y, w, h) { this.fillRect(x, y, w, h); }
  fill() {}
  stroke() {}
  clip() {}
  save() { this._stateStack.push({fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha, font: this.font, lineWidth: this.lineWidth}); }
  restore() { const s = this._stateStack.pop(); if (s) Object.assign(this, s); }
  translate() {} rotate() {} scale() {}
  setTransform() {} resetTransform() {} transform() {}
  createLinearGradient(x0,y0,x1,y1) { return { addColorStop(){}, _x0:x0,_y0:y0,_x1:x1,_y1:y1 }; }
  createRadialGradient() { return { addColorStop(){} }; }
  createPattern() { return {}; }
  isPointInPath() { return false; }
  isPointInStroke() { return false; }
}

Element.prototype.getContext = function getContext(type) {
  if (type === '2d') {
    if (!this._ctx) {
      this._ctx = new _Canvas2D(this);
    }
    return this._ctx;
  }
  if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
    return {
      canvas: this,
      getExtension(name) {
        if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
        return null;
      },
      getParameter(pname) {
        if (pname === 0x9245) return _fp('gpuVendor');
        if (pname === 0x9246) return _fp('gpu');
        if (pname === 0x1F01) return 'WebKit WebGL';  // GL_RENDERER
        if (pname === 0x1F00) return 'WebKit';          // GL_VENDOR
        if (pname === 0x1F02) return 'OpenGL ES 3.0 (ANGLE)'; // GL_VERSION
        if (pname === 0x8B8C) return 'WebGL GLSL ES 3.00 (ANGLE)'; // GL_SHADING_LANGUAGE_VERSION
        return 0;
      },
      getSupportedExtensions() { return ['WEBGL_debug_renderer_info','EXT_texture_filter_anisotropic','WEBGL_compressed_texture_s3tc','WEBGL_lose_context']; },
      getShaderPrecisionFormat() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; },
      createBuffer() { return {}; }, createShader() { return {}; }, createProgram() { return {}; },
      shaderSource() {}, compileShader() {}, attachShader() {}, linkProgram() {},
      getProgramParameter() { return true; }, useProgram() {}, deleteShader() {},
      bindBuffer() {}, bufferData() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
      drawArrays() {}, drawElements() {}, viewport() {}, clear() {}, clearColor() {},
      enable() {}, disable() {}, blendFunc() {}, depthFunc() {},
      getUniformLocation() { return {}; }, getAttribLocation() { return 0; },
      uniform1f() {}, uniform1i() {}, uniformMatrix4fv() {},
      createTexture() { return {}; }, bindTexture() {}, texImage2D() {}, texParameteri() {},
      activeTexture() {}, pixelStorei() {}, generateMipmap() {},
      createFramebuffer() { return {}; }, bindFramebuffer() {}, framebufferTexture2D() {},
      readPixels(x,y,w,h,f,t,d) { if(d) for(let i=0;i<d.length;i++) d[i]=Math.floor(Math.random()*256); },
      VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30, LINK_STATUS: 0x8B82,
      ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88E4, FLOAT: 0x1406,
      TRIANGLES: 0x0004, COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x100,
      TEXTURE_2D: 0x0DE1, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401,
    };
  }
  return null;
};
Element.prototype.toDataURL = function(type) {
  if (this._ctx && this._ctx._buf) {
    const ctx = this._ctx;
    const w = ctx._w, h = ctx._h, buf = ctx._buf;
    let hash = _fpSeed;
    for (let i = 0; i < buf.length; i += 37) {
      hash = ((hash << 5) - hash + buf[i]) | 0;
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let b64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg';
    for (let i = 0; i < 60; i++) {
      hash = ((hash << 5) - hash + i) | 0;
      b64 += chars[(hash >>> 0) % 64];
    }
    return b64 + '==';
  }
  return _fp('canvasFingerprint');
};
Element.prototype.toBlob = function(cb, type, q) { cb(new Blob([''])); };

_markNative(Element.prototype.getContext);
_markNative(Element.prototype.toDataURL);
_markNative(Element.prototype.toBlob);

Element.prototype.attachShadow = function attachShadow(opts) {
  const host = this;
  const children = [];
  const shadow = {
    mode: opts?.mode || 'open',
    host: host,
    get innerHTML() { return children.map(c => c.outerHTML || c.textContent || '').join(''); },
    set innerHTML(v) {
      children.length = 0;
      if (v) {
        const tmp = document.createElement('div');
        tmp.innerHTML = v;
        for (let i = 0; i < tmp.childNodes.length; i++) children.push(tmp.childNodes[i]);
      }
    },
    get childNodes() { return children; },
    get firstChild() { return children[0] || null; },
    get lastChild() { return children[children.length - 1] || null; },
    get firstElementChild() { return children.find(c => c.nodeType === 1) || null; },
    get children() { return children.filter(c => c.nodeType === 1); },
    appendChild(c) {
      if (c) {
        children.push(c);
        try { c.parentNode = shadow; } catch (_) { /* parentNode is getter-only on Node, ignore */ }
      }
      return c;
    },
    insertBefore(n, ref) {
      if (!n) return n;
      if (!ref) { shadow.appendChild(n); return n; }
      const idx = children.indexOf(ref);
      if (idx >= 0) {
        children.splice(idx, 0, n);
        try { n.parentNode = shadow; } catch (_) {}
      }
      else shadow.appendChild(n);
      return n;
    },
    removeChild(c) { const idx = children.indexOf(c); if (idx >= 0) children.splice(idx, 1); return c; },
    replaceChild(n, o) {
      const idx = children.indexOf(o);
      if (idx >= 0) {
        children[idx] = n;
        try { n.parentNode = shadow; } catch (_) {}
      }
      return o;
    },
    querySelector(s) {
      for (const c of children) {
        if (c.matches && c.matches(s)) return c;
        if (c.querySelector) { const r = c.querySelector(s); if (r) return r; }
      }
      return null;
    },
    querySelectorAll(s) {
      const results = [];
      for (const c of children) {
        if (c.matches && c.matches(s)) results.push(c);
        if (c.querySelectorAll) results.push(...c.querySelectorAll(s));
      }
      return results;
    },
    getElementById(id) { return shadow.querySelector('#' + id); },
    contains(n) { return children.includes(n); },
    getRootNode() { return shadow; },
    get ownerDocument() { return document; },
    get nodeType() { return 11; }, // DOCUMENT_FRAGMENT_NODE
    get nodeName() { return '#document-fragment'; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    cloneNode() { return shadow; },
  };
  this.shadowRoot = shadow;
  return shadow;
};

_markNative(Element.prototype.attachShadow);

globalThis.AudioContext = class AudioContext {
  constructor() { this.sampleRate=_fp('audioSampleRate'); this.state='running'; this.currentTime=0; this.baseLatency=_fp('audioBaseLatency'); this.destination={maxChannelCount:2,numberOfInputs:1,numberOfOutputs:0,channelCount:2}; }
  createOscillator() { return {type:'sine',frequency:{value:440,setValueAtTime(){}},connect(){},start(){},stop(){},disconnect(){},addEventListener(){}}; }
  createDynamicsCompressor() { return {threshold:{value:_fp('compThreshold')},knee:{value:_fp('compKnee')},ratio:{value:_fp('compRatio')},attack:{value:0.003},release:{value:0.25},reduction:0,connect(){},disconnect(){}}; }
  createAnalyser() {
    return {fftSize:2048,frequencyBinCount:1024,connect(){},disconnect(){},
      getByteFrequencyData(a){for(let i=0;i<a.length;i++)a[i]=Math.floor(_fpRand(600+i)*10);},
      getFloatFrequencyData(a){for(let i=0;i<a.length;i++)a[i]=-100+_fpRand(700+i)*5;}
    };
  }
  createGain() { return {gain:{value:1,setValueAtTime(){}},connect(){},disconnect(){}}; }
  createBiquadFilter() { return {type:'lowpass',frequency:{value:350},Q:{value:1},connect(){},disconnect(){}}; }
  createBufferSource() { return {buffer:null,connect(){},start(){},stop(){},disconnect(){},loop:false}; }
  createBuffer(ch,len,rate) { return {length:len,sampleRate:rate,numberOfChannels:ch,getChannelData(c){return new Float32Array(len);},duration:len/rate}; }
  createScriptProcessor() { return {connect(){},disconnect(){},onaudioprocess:null}; }
  decodeAudioData(buf) { return Promise.resolve(this.createBuffer(2,44100,44100)); }
  resume() { this.state='running'; return Promise.resolve(); }
  suspend() { this.state='suspended'; return Promise.resolve(); }
  close() { this.state='closed'; return Promise.resolve(); }
};
globalThis.OfflineAudioContext = class OfflineAudioContext extends AudioContext {
  constructor(ch,len,rate) { super(); this.length=len||44100; }
  startRendering() { return Promise.resolve(this.createBuffer(2,this.length,44100)); }
};
globalThis.webkitAudioContext = globalThis.AudioContext;

globalThis.speechSynthesis = {
  speaking: false, pending: false, paused: false,
  getVoices() { return [{ name:'Google US English', lang:'en-US', default:true, localService:true, voiceURI:'Google US English' }]; },
  speak() {}, cancel() {}, pause() {}, resume() {},
  addEventListener() {}, removeEventListener() {},
  onvoiceschanged: null,
};
globalThis.SpeechSynthesisUtterance = class SpeechSynthesisUtterance { constructor(t){this.text=t;this.lang='en-US';this.rate=1;this.pitch=1;this.volume=1;} };

globalThis.MediaStream = class MediaStream { constructor(){this.id='';this.active=true;} getTracks(){return [];} getAudioTracks(){return [];} getVideoTracks(){return [];} addTrack(){} removeTrack(){} clone(){return new MediaStream();} };
globalThis.MediaStreamTrack = class MediaStreamTrack { constructor(){this.kind='';this.enabled=true;this.readyState='live';} stop(){} clone(){return new MediaStreamTrack();} };
globalThis.RTCPeerConnection = class RTCPeerConnection {
  constructor(){this.localDescription=null;this.remoteDescription=null;this.iceConnectionState='new';this.iceGatheringState='new';this.signalingState='stable';this.connectionState='new';}
  createOffer(){return Promise.resolve({type:'offer',sdp:''});}
  createAnswer(){return Promise.resolve({type:'answer',sdp:''});}
  setLocalDescription(){return Promise.resolve();}
  setRemoteDescription(){return Promise.resolve();}
  addIceCandidate(){return Promise.resolve();}
  close(){}
  createDataChannel(){return {close(){},send(){},addEventListener(){},removeEventListener(){}};}
  addEventListener(){} removeEventListener(){}
  getStats(){return Promise.resolve(new Map());}
};
globalThis.RTCSessionDescription = class RTCSessionDescription { constructor(d){this.type=d?.type;this.sdp=d?.sdp;} };
globalThis.RTCIceCandidate = class RTCIceCandidate { constructor(d){this.candidate=d?.candidate||'';} };

globalThis.indexedDB = {
  open(name, version) {
    const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    Promise.resolve().then(() => {
      req.result = { name, version: version||1, objectStoreNames: { contains(){return false;}, length:0 }, createObjectStore(){return {createIndex(){}}; }, transaction(){return {objectStore(){return {get(){return {onsuccess:null,onerror:null};},put(){return {onsuccess:null};},delete(){return {onsuccess:null};}};}}; }, close(){} };
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  },
  deleteDatabase() { return { onsuccess: null, onerror: null }; },
};
globalThis.IDBKeyRange = { only(v){return v;}, lowerBound(v){return v;}, upperBound(v){return v;}, bound(l,u){return [l,u];} };

globalThis.caches = {
  open() { return Promise.resolve({ match(){return Promise.resolve(undefined);}, put(){return Promise.resolve();}, delete(){return Promise.resolve(false);}, keys(){return Promise.resolve([]);} }); },
  match() { return Promise.resolve(undefined); },
  has() { return Promise.resolve(false); },
  delete() { return Promise.resolve(false); },
  keys() { return Promise.resolve([]); },
};

_markNative(AudioContext); _markNative(OfflineAudioContext);
_markNative(SpeechSynthesisUtterance);
_markNative(MediaStream); _markNative(MediaStreamTrack);
_markNative(RTCPeerConnection); _markNative(RTCSessionDescription); _markNative(RTCIceCandidate);

const _OrigDateTimeFormat = Intl.DateTimeFormat;
const _defaultTZ = 'America/New_York';
Intl.DateTimeFormat = function(locales, options) {
  if (!options) options = {};
  if (!options.timeZone) options.timeZone = _defaultTZ;
  return new _OrigDateTimeFormat(locales, options);
};
Intl.DateTimeFormat.prototype = _OrigDateTimeFormat.prototype;
Intl.DateTimeFormat.supportedLocalesOf = _OrigDateTimeFormat.supportedLocalesOf;
const _origResolved = _OrigDateTimeFormat.prototype.resolvedOptions;
_OrigDateTimeFormat.prototype.resolvedOptions = function() {
  const r = _origResolved.call(this);
  if (r.timeZone === 'UTC') r.timeZone = _defaultTZ;
  return r;
};

if (typeof PointerEvent === 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, opts={}) { super(type, opts); this.pointerId = opts.pointerId || 0; this.width = opts.width || 1; this.height = opts.height || 1; this.pressure = opts.pressure || 0; this.pointerType = opts.pointerType || 'mouse'; }
  };
}

if (typeof navigator.credentials === 'undefined') {
  navigator.credentials = { get(){return Promise.resolve(null);}, create(){return Promise.resolve(null);}, store(){return Promise.resolve();}, preventSilentAccess(){return Promise.resolve();} };
}

globalThis.opener = null;

globalThis.Worker = class Worker {
  constructor(url) {
    this.onmessage = null;
    this.onerror = null;
    this._terminated = false;
    this._listeners = {};
    const worker = this;

    if (typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('http'))) {
      const blobContent = __blobStore?.[url.split('#')[0]];
      if (blobContent != null) {
        // Blob store now holds bytes; worker source must be text.
        this._code = (blobContent instanceof Uint8Array) ? new TextDecoder().decode(blobContent) : blobContent;
      } else {
        (async () => {
          try {
            const resp = await fetch(url);
            worker._code = await resp.text();
          } catch(e) { if (worker.onerror) worker.onerror(e); }
        })();
      }
    }
  }
  postMessage(data) {
    if (this._terminated) return;
    const worker = this;
    setTimeout(() => {
      if (worker._terminated || !worker._code) return;
      try {
        const workerSelf = {
          onmessage: null,
          postMessage: (msg) => {
            const evt = { data: msg };
            if (worker.onmessage) worker.onmessage(evt);
            const handlers = worker._listeners['message'] || [];
            for (const h of handlers) h(evt);
          },
          addEventListener: (type, fn) => { workerSelf['on' + type] = fn; },
          close: () => { worker._terminated = true; },
          crypto: globalThis.crypto,
          TextEncoder: globalThis.TextEncoder,
          TextDecoder: globalThis.TextDecoder,
          atob: globalThis.atob,
          btoa: globalThis.btoa,
          setTimeout: globalThis.setTimeout,
          setInterval: globalThis.setInterval,
          clearTimeout: globalThis.clearTimeout,
          clearInterval: globalThis.clearInterval,
          fetch: globalThis.fetch,
          console: globalThis.console,
        };
        const fn = new Function('self', 'postMessage', 'addEventListener', 'close', worker._code);
        fn(workerSelf, workerSelf.postMessage, workerSelf.addEventListener, workerSelf.close);
        if (workerSelf.onmessage) workerSelf.onmessage({ data });
      } catch(e) {
        console.error('Worker error:', e.message);
        if (worker.onerror) worker.onerror(e);
      }
    }, 0);
  }
  terminate() { this._terminated = true; }
  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }
  removeEventListener(type, fn) {
    if (this._listeners[type]) this._listeners[type] = this._listeners[type].filter(h => h !== fn);
  }
};

const __blobStore = {};
const __blobTypes = {};
// A v4 UUID (8-4-4-4-12 with version nibble 4 and the 8/9/a/b variant) — the
// FileAPI spec requires a blob: URL's path to be a valid UUID.
const _uuidV4 = function() {
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += (8 + Math.floor(Math.random() * 4)).toString(16);
    else s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
};
const _origCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = function(blob) {
  // Spec format: "blob:" + serialized origin + "/" + UUID (e.g.
  // blob:https://host/<uuid>); origin "null" pages get blob:null/<uuid>.
  const origin = (function() {
    try { return new URL(_domParse("document_url") || "about:blank").origin; }
    catch (e) { return 'null'; }
  })();
  const id = 'blob:' + (origin && origin !== 'null' ? origin : 'null') + '/' + _uuidV4();
  if (blob) {
    __blobTypes[id] = blob.type || '';
    // Store the BYTES synchronously (byte-backed Blob) so a consumer fetching on
    // the next tick sees exact binary content; fall back for other blob-likes.
    if (blob._bytes instanceof Uint8Array) __blobStore[id] = blob._bytes.slice();
    else if (typeof blob._data === 'string') __blobStore[id] = blob._data;
    else if (typeof blob.text === 'function') blob.text().then(text => { __blobStore[id] = text; });
  }
  return id;
};
URL.revokeObjectURL = function(url) {
  delete __blobStore[url];
  delete __blobTypes[url];
};

globalThis.scrollTo = function(x, y) {};
globalThis.scrollBy = function(x, y) {};
globalThis.scroll = function(x, y) {};
globalThis.focus = function() {};
globalThis.blur = function() {};
globalThis.print = function() {};
globalThis.alert = function() {};
globalThis.confirm = function() { return true; };
globalThis.prompt = function() { return null; };
globalThis.open = function() { return null; };
globalThis.close = function() {};
globalThis.stop = function() {};
globalThis.postMessage = function() {};
globalThis.requestIdleCallback = globalThis.requestIdleCallback || function(cb) { return setTimeout(cb, 0); };
globalThis.cancelIdleCallback = globalThis.cancelIdleCallback || function(id) { clearTimeout(id); };
if (typeof ReadableStream === 'undefined') {
  globalThis.ReadableStream = class ReadableStream {
    constructor(source = {}, strategy = {}) {
      this._source = source; this._queue = []; this._closed = false;
      this.locked = false;
      if (source.start) source.start({ enqueue: (chunk) => this._queue.push(chunk), close: () => { this._closed = true; }, error: () => {} });
    }
    getReader() {
      this.locked = true;
      const stream = this;
      return {
        read() {
          if (stream._queue.length > 0) return Promise.resolve({ value: stream._queue.shift(), done: false });
          if (stream._closed) return Promise.resolve({ value: undefined, done: true });
          return Promise.resolve({ value: undefined, done: true });
        },
        releaseLock() { stream.locked = false; },
        cancel() { stream._closed = true; return Promise.resolve(); },
        get closed() { return stream._closed ? Promise.resolve() : new Promise(() => {}); },
      };
    }
    cancel() { this._closed = true; return Promise.resolve(); }
    pipeTo(dest) { return Promise.resolve(); }
    pipeThrough(transform) { return transform.readable || new ReadableStream(); }
    tee() { return [new ReadableStream(), new ReadableStream()]; }
    [Symbol.asyncIterator]() {
      const reader = this.getReader();
      return { next: () => reader.read(), return: () => { reader.releaseLock(); return Promise.resolve({done:true}); } };
    }
  };
}
if (typeof WritableStream === 'undefined') {
  globalThis.WritableStream = class WritableStream {
    constructor(sink = {}) { this._sink = sink; this.locked = false; }
    getWriter() {
      this.locked = true;
      const stream = this;
      return {
        write(chunk) { if (stream._sink.write) stream._sink.write(chunk); return Promise.resolve(); },
        close() { if (stream._sink.close) stream._sink.close(); return Promise.resolve(); },
        abort() { return Promise.resolve(); },
        releaseLock() { stream.locked = false; },
        get ready() { return Promise.resolve(); },
        get closed() { return Promise.resolve(); },
        get desiredSize() { return 1; },
      };
    }
    close() { return Promise.resolve(); }
    abort() { return Promise.resolve(); }
  };
}
if (typeof TransformStream === 'undefined') {
  globalThis.TransformStream = class TransformStream {
    constructor(transformer = {}) {
      this.readable = new ReadableStream();
      this.writable = new WritableStream();
    }
  };
}

if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.subtle) {
  globalThis.crypto.subtle = {
    async digest(algorithm, data) {
      const name = typeof algorithm === 'string' ? algorithm : algorithm?.name || 'SHA-256';
      const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer || data);
      let hash = 0x811c9dc5;
      for (let i = 0; i < bytes.length; i++) { hash ^= bytes[i]; hash = Math.imul(hash, 0x01000193); }
      const size = name.includes('512') ? 64 : name.includes('384') ? 48 : 32;
      const result = new Uint8Array(size);
      for (let i = 0; i < size; i++) { hash = Math.imul(hash ^ i, 0x45d9f3b); result[i] = (hash >>> 0) & 0xff; }
      return result.buffer;
    },
    async encrypt() { throw new DOMException('NotSupportedError'); },
    async decrypt() { throw new DOMException('NotSupportedError'); },
    async sign() { return new ArrayBuffer(32); },
    async verify() { return true; },
    async generateKey() { return { type: 'secret', algorithm: {}, extractable: false, usages: [] }; },
    async importKey() { return { type: 'secret', algorithm: {}, extractable: false, usages: [] }; },
    async exportKey() { return new ArrayBuffer(32); },
    async deriveBits() { return new ArrayBuffer(32); },
    async deriveKey() { return { type: 'secret', algorithm: {}, extractable: false, usages: [] }; },
    async wrapKey() { return new ArrayBuffer(32); },
    async unwrapKey() { return { type: 'secret', algorithm: {}, extractable: false, usages: [] }; },
  };
}

if (typeof DOMRect === 'undefined') {
  globalThis.DOMRect = class DOMRect {
    constructor(x=0,y=0,w=0,h=0) { this.x=x;this.y=y;this.width=w;this.height=h;this.top=y;this.right=x+w;this.bottom=y+h;this.left=x; }
    toJSON() { return {x:this.x,y:this.y,width:this.width,height:this.height,top:this.top,right:this.right,bottom:this.bottom,left:this.left}; }
    static fromRect(r={}) { return new DOMRect(r.x,r.y,r.width,r.height); }
  };
}
if (typeof DOMPoint === 'undefined') {
  globalThis.DOMPoint = class DOMPoint {
    constructor(x=0,y=0,z=0,w=1) { this.x=x;this.y=y;this.z=z;this.w=w; }
    static fromPoint(p={}) { return new DOMPoint(p.x,p.y,p.z,p.w); }
  };
}
if (typeof DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() { this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;this.is2D=true;this.isIdentity=true; }
    static fromMatrix() { return new DOMMatrix(); }
    static fromFloat32Array() { return new DOMMatrix(); }
    static fromFloat64Array() { return new DOMMatrix(); }
    multiply() { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    rotate() { return new DOMMatrix(); }
    transformPoint(p) { return new DOMPoint(p?.x||0,p?.y||0); }
  };
}

if (typeof Image === 'undefined') {
  // Legacy Image() factory: produce a real <img> element so setting .src flows
  // through the element resource-load path (fetch → Resource Timing entry →
  // load/error event), exactly like a created or parsed <img>.
  globalThis.Image = function Image(w, h) {
    const img = document.createElement('img');
    if (w !== undefined && w !== null) img.width = w;
    if (h !== undefined && h !== null) img.height = h;
    return img;
  };
}

if (typeof Audio === 'undefined') {
  globalThis.Audio = class Audio {
    constructor(src) { this.src = src || ''; this.paused = true; this.volume = 1; this.currentTime = 0; this.duration = 0; }
    play() { return Promise.resolve(); } pause() { this.paused = true; } load() {}
    addEventListener() {} removeEventListener() {}
  };
}

if (typeof FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null; this.readyState = 0; this.error = null;
      this._evtKey = _nextSyntheticKey();
      this._aborted = false;
    }
    get [Symbol.toStringTag]() { return 'FileReader'; }
    addEventListener(t, h, o) { _addListenerByKey(this._evtKey, String(t), h, o); }
    removeEventListener(t, h, o) { _removeListenerByKey(this._evtKey, String(t), h, o); }
    dispatchEvent(ev) { return _dispatchPublic(this, ev); }
    _fire(type) {
      let ev;
      try { ev = new ProgressEvent(type, { lengthComputable: false, loaded: 0, total: 0 }); }
      catch (e) { ev = new Event(type); }
      ev.isTrusted = true;
      _dispatchSpec(this, ev);
    }
    _read(blob, kind, encoding) {
      if (this.readyState === 1) throw new DOMException("The object is already busy reading Blobs.", "InvalidStateError");
      if (!(blob instanceof Blob)) throw new TypeError("Failed to execute 'read' on 'FileReader': parameter 1 is not of type 'Blob'.");
      this.readyState = 1; this.result = null; this.error = null; this._aborted = false;
      const bytes = blob._bytes ? blob._bytes.slice() : new Uint8Array(0);
      const type = blob.type || '';
      const self = this;
      // Each event fires in its OWN task (chained setTimeout), so microtasks —
      // EventWatcher re-arming, promise_test completion — drain between events.
      // loadstart is never synchronous; an empty blob emits no progress event.
      const steps = [
        () => self._fire('loadstart'),
        () => { if (bytes.length > 0) self._fire('progress'); },
        () => {
          try {
            let result;
            if (kind === 'text') result = new TextDecoder(encoding && _getEncodingName(encoding) ? encoding : 'utf-8').decode(bytes);
            else if (kind === 'arraybuffer') result = bytes.buffer.slice(0);
            else if (kind === 'binary') { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); result = s; }
            else if (kind === 'dataurl') result = 'data:' + (type || 'application/octet-stream') + ';base64,' + _b64FromBytes(bytes);
            self.result = result; self.readyState = 2;
            self._fire('load');
          } catch (e) {
            self.result = null; self.error = e; self.readyState = 2;
            self._fire('error');
          }
        },
        () => self._fire('loadend'),
      ];
      let idx = 0;
      const run = function() {
        if (self._aborted) return;
        steps[idx++]();
        if (idx < steps.length) setTimeout(run, 0);
      };
      setTimeout(run, 0);
    }
    readAsText(blob, encoding) { this._read(blob, 'text', encoding); }
    readAsArrayBuffer(blob) { this._read(blob, 'arraybuffer'); }
    readAsBinaryString(blob) { this._read(blob, 'binary'); }
    readAsDataURL(blob) { this._read(blob, 'dataurl'); }
    abort() {
      // EMPTY or DONE: clear result, leave readyState unchanged.
      if (this.readyState === 0 || this.readyState === 2) { this.result = null; return; }
      // LOADING: terminate the read, then fire abort + loadend.
      this._aborted = true; this.result = null; this.readyState = 2;
      this._fire('abort'); this._fire('loadend');
    }
  };
  FileReader.EMPTY = 0; FileReader.LOADING = 1; FileReader.DONE = 2;
  FileReader.prototype.EMPTY = 0; FileReader.prototype.LOADING = 1; FileReader.prototype.DONE = 2;
  // Event-handler IDL attributes (onload, onerror, …) registered as listeners so
  // they participate in dispatch like any other listener.
  for (const h of ['loadstart', 'progress', 'load', 'abort', 'error', 'loadend']) {
    Object.defineProperty(FileReader.prototype, 'on' + h, {
      configurable: true, enumerable: true,
      get() { return this['_on' + h] || null; },
      set(fn) {
        const cur = this['_on' + h];
        if (cur) this.removeEventListener(h, cur);
        this['_on' + h] = (typeof fn === 'function') ? fn : null;
        if (this['_on' + h]) this.addEventListener(h, this['_on' + h]);
      },
    });
  }
  _markNative(FileReader); _markNative(FileReader.prototype.readAsText); _markNative(FileReader.prototype.readAsArrayBuffer);
  _markNative(FileReader.prototype.readAsDataURL); _markNative(FileReader.prototype.readAsBinaryString); _markNative(FileReader.prototype.abort);
}

if (typeof EventSource === 'undefined') {
  globalThis.EventSource = class EventSource {
    constructor(url) { this.url = url; this.readyState = 0; this.onopen = null; this.onmessage = null; this.onerror = null; }
    close() { this.readyState = 2; }
    addEventListener() {} removeEventListener() {}
    static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
  };
}

if (typeof WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {
    constructor(url, protocols) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null; this.protocol = ''; }
    send(data) {} close(code, reason) { this.readyState = 3; if (this.onclose) this.onclose({code:code||1000,reason:reason||'',wasClean:true}); }
    addEventListener() {} removeEventListener() {}
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  };
}

if (typeof BroadcastChannel === 'undefined') {
  globalThis.BroadcastChannel = class BroadcastChannel {
    constructor(name) { this.name = name; this.onmessage = null; }
    postMessage(msg) {} close() {}
    addEventListener() {} removeEventListener() {}
  };
}

if (typeof MediaQueryList === 'undefined') {
  globalThis.MediaQueryList = class MediaQueryList {
    constructor(q) { this.media = q || ''; this.matches = false; }
    addListener() {} removeListener() {} addEventListener() {} removeEventListener() {}
  };
}

if (typeof ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(w, h) {
      if (w instanceof Uint8ClampedArray) { this.data = w; this.width = h; this.height = w.length / (4 * h); }
      else { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
    }
  };
}

if (typeof CanvasRenderingContext2D === 'undefined') {
  globalThis.CanvasRenderingContext2D = class CanvasRenderingContext2D {};
}

if (typeof OffscreenCanvas === 'undefined') {
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext(type) { return globalThis.document?.createElement('canvas')?.getContext(type) || null; }
    convertToBlob() { return Promise.resolve(new Blob([''])); }
    transferToImageBitmap() { return {}; }
  };
}

if (typeof Path2D === 'undefined') {
  globalThis.Path2D = class Path2D { constructor(){} moveTo(){} lineTo(){} arc(){} rect(){} closePath(){} addPath(){} };
}

if (typeof ImageBitmap === 'undefined') {
  globalThis.ImageBitmap = class ImageBitmap { constructor(){this.width=0;this.height=0;} close(){} };
  globalThis.createImageBitmap = function() { return Promise.resolve(new ImageBitmap()); };
}

if (typeof Selection === 'undefined') {
  globalThis.Selection = class Selection {
    constructor(){this.anchorNode=null;this.focusNode=null;this.rangeCount=0;this.isCollapsed=true;this.type='None';}
    getRangeAt(){return null;} collapse(){} extend(){} selectAllChildren(){} deleteFromDocument(){}
    addRange(){} removeRange(){} removeAllRanges(){} toString(){return '';}
  };
}

if (typeof NodeFilter === 'undefined') {
  globalThis.NodeFilter = { SHOW_ALL:0xFFFFFFFF, SHOW_ELEMENT:1, SHOW_TEXT:4, SHOW_COMMENT:128,
    FILTER_ACCEPT:1, FILTER_REJECT:2, FILTER_SKIP:3 };
}

if (typeof TreeWalker === 'undefined') {
  globalThis.TreeWalker = class TreeWalker {
    constructor(root){this.root=root;this.currentNode=root;this.whatToShow=0xFFFFFFFF;this.filter=null;}
    parentNode(){return this.currentNode?.parentNode||null;}
    firstChild(){return this.currentNode?.firstChild||null;}
    lastChild(){return this.currentNode?.lastChild||null;}
    previousSibling(){return this.currentNode?.previousSibling||null;}
    nextSibling(){return this.currentNode?.nextSibling||null;}
    nextNode(){return null;} previousNode(){return null;}
  };
}

if (typeof Range === 'undefined') {
  globalThis.Range = class Range {
    constructor(){this.startContainer=null;this.startOffset=0;this.endContainer=null;this.endOffset=0;this.collapsed=true;this.commonAncestorContainer=null;}
    setStart(n,o){this.startContainer=n;this.startOffset=o;} setEnd(n,o){this.endContainer=n;this.endOffset=o;}
    collapse(){} selectNode(){} selectNodeContents(){} cloneContents(){return document?.createDocumentFragment();}
    deleteContents(){} insertNode(){} getBoundingClientRect(){return new DOMRect();}
    getClientRects(){return [];} cloneRange(){return new Range();} toString(){return '';}
  };
}

if (typeof SharedWorker === 'undefined') {
  globalThis.SharedWorker = class SharedWorker {
    constructor() { this.port = { postMessage(){}, onmessage:null, start(){}, close(){}, addEventListener(){}, removeEventListener(){} }; this.onerror = null; }
  };
}
if (typeof ServiceWorkerContainer === 'undefined') {
  globalThis.ServiceWorkerContainer = class { register(){return Promise.resolve();} getRegistrations(){return Promise.resolve([]);} };
}

if (typeof URLPattern === 'undefined') {
  globalThis.URLPattern = class URLPattern {
    constructor(pattern){this._pattern=pattern||{};} test(){return false;} exec(){return null;}
  };
}

if (typeof Document !== 'undefined' && !Document.prototype.importNode) {
  // Clone `node` INTO this document, so the copy's ownerDocument (and tagName
  // casing) reflects the importing document, not the source's.
  Document.prototype.importNode = function(node, deep) { return node ? node.cloneNode(!!deep, this) : null; };
}

// Document.elementFromPoint / elementsFromPoint — no layout engine, so this is a stub:
// in-viewport coords return <body> (or <html> as fallback), out-of-viewport returns null.
// Wrong-but-non-throwing beats "undefined", which traps ad/analytics bootstraps in retry loops
// (see issue #63).
if (typeof Document !== 'undefined' && !Document.prototype.elementFromPoint) {
  Document.prototype.elementFromPoint = function(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
      return null;
    }
    var w = (typeof window !== 'undefined' && window.innerWidth) || 0;
    var h = (typeof window !== 'undefined' && window.innerHeight) || 0;
    if (x < 0 || y < 0 || x > w || y > h) {
      return null;
    }
    return this.body || this.documentElement || null;
  };
  Document.prototype.elementsFromPoint = function(x, y) {
    var el = this.elementFromPoint(x, y);
    return el ? [el] : [];
  };
}
if (typeof ShadowRoot !== 'undefined' && !ShadowRoot.prototype.elementFromPoint) {
  ShadowRoot.prototype.elementFromPoint = function(x, y) {
    return Document.prototype.elementFromPoint.call(globalThis.document || this, x, y);
  };
  ShadowRoot.prototype.elementsFromPoint = function(x, y) {
    return Document.prototype.elementsFromPoint.call(globalThis.document || this, x, y);
  };
}

globalThis.__obscura_init = function() {
  _fpSeed = Date.now() ^ (Math.random() * 0xFFFFFFFF >>> 0);
  _fpCache = null;
  _installWasmStreamingFallback();

  // __obscura_init runs at runtime construction, BEFORE any DOM is loaded, so
  // op_dom("document_node_id") returns "null" (NaN). The main document is the
  // tree root (node 0) — and every per-node op already coerces the document's
  // missing id to 0 (unwrap_or(0) on the Rust side), so 0 is the correct nid.
  let _docNid = +_dom("document_node_id");
  if (!Number.isInteger(_docNid) || _docNid < 0) _docNid = 0;
  globalThis.document = new Document(_docNid);
  // Seed the wrapper cache so `_wrap(_docNid)` (documentElement.parentNode,
  // getRootNode, range containers, ...) returns the SAME object as the global
  // `document`. Without this the document node has two distinct wrappers and
  // node-identity checks like isInclusiveDescendant(node, document) break.
  _cache.set(_docNid, globalThis.document);

  const scr = _fp('screen');
  const sw = scr[0], sh = scr[1];
  globalThis.screen = { width:sw, height:sh, availWidth:sw, availHeight:sh-40, colorDepth:24, pixelDepth:24, availTop:0, availLeft:0, orientation:{type:"landscape-primary",angle:0,addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}} };
  globalThis.visualViewport = { width:sw, height:sh-80, offsetLeft:0, offsetTop:0, scale:1, addEventListener(){}, removeEventListener(){} };
  globalThis.devicePixelRatio = sw >= 2560 ? 2 : 1;
  globalThis.innerWidth = sw; globalThis.innerHeight = sh - 80;
  globalThis.outerWidth = sw; globalThis.outerHeight = sh;

  const t0 = Date.now();
  globalThis.performance.timeOrigin = t0;
  globalThis.performance.timing = (typeof PerformanceTiming === "function")
    ? new PerformanceTiming(t0)
    : { navigationStart: t0, domContentLoadedEventEnd: t0, loadEventEnd: t0 };

  // Create the single PerformanceNavigationTiming entry up-front so
  // getEntriesByType('navigation') is populated for the document's whole lifetime
  // (the spec exposes it from the start); document-lifecycle phases are filled in
  // by __navTimingDCL / __navTimingLoad as the load progresses.
  try {
    if (typeof PerformanceNavigationTiming === "function" && globalThis.performance && !globalThis.performance._navEntry) {
      const navUrl = _domParse("document_url") || (globalThis.location && location.href) || "";
      const nav = new PerformanceNavigationTiming(navUrl);
      globalThis.performance._navEntry = nav;
      globalThis.performance._entries.push(nav);
    }
  } catch (e) {}

  const hide = (obj, props) => {
    for (const p of props) {
      if (p in obj) {
        try { Object.defineProperty(obj, p, { enumerable: false, configurable: true }); } catch(e) {}
      }
    }
  };
  const toHide = Object.keys(globalThis).filter(k =>
    k.startsWith('_') || k.includes('obscura') || k.includes('Obscura')
  );
  for (const p of toHide) {
    try { Object.defineProperty(globalThis, p, { enumerable: false }); } catch(e) {
    }
  }
  delete globalThis.__obscura_init;
};
