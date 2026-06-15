"use strict";

const __obscura_errors = [];

globalThis.addEventListener = globalThis.addEventListener || function(){};
globalThis.onunhandledrejection = function(e) { if (e?.preventDefault) e.preventDefault(); };

globalThis.onerror = function(msg, src, line, col, error) {
  __obscura_errors.push({msg: String(msg), src: String(src||""), line, error: String(error||"")});
};
const __windowListeners = {};
globalThis.addEventListener = function(type, fn) {
  if (!__windowListeners[type]) __windowListeners[type] = [];
  __windowListeners[type].push(fn);
};
globalThis.removeEventListener = function(type, fn) {
  if (__windowListeners[type]) {
    __windowListeners[type] = __windowListeners[type].filter(h => h !== fn);
  }
};
globalThis.dispatchEvent = function(event) {
  if (!event) return true;
  const handlers = __windowListeners[event.type] || [];
  for (const h of handlers) { try { h.call(globalThis, event); } catch(e) { console.error(e); } }
  return !event.defaultPrevented;
};

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
    const handlers = (__windowListeners['error'] || []).slice();
    for (const h of handlers) {
      try { (typeof h === 'function' ? h : h.handleEvent).call(globalThis, ev); } catch (e) {}
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
  InvalidAccessError: 15, SecurityError: 18, NetworkError: 19, AbortError: 20,
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
  get nodeType() { return +_dom("node_type", this._nid); }
  get nodeName() { return _domParse("node_name", this._nid) || ""; }
  // A node's owner is the main document unless it was created by / adopted into
  // another document (e.g. an iframe's contentDocument), which tags `_ownerDoc`.
  get ownerDocument() { return this._ownerDoc || globalThis.document; }
  get textContent() { return _domParse("text_content", this._nid) ?? ""; }
  set textContent(v) {
    const _watching = __mutationObservers?.length;
    const t = this.nodeType;
    if (t === 3 || t === 8) {
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
    const t = this.nodeType;
    if (t === 3 || t === 8) return _domParse("text_content", this._nid) ?? "";
    return null;
  }
  set nodeValue(v) {
    const t = this.nodeType;
    if (t === 3 || t === 8) {
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
        const fullUrl = src.startsWith('http') ? src : new URL(src, globalThis.location?.href || 'http://localhost/').href;
        const pageOrigin = (function() { try { return new URL(globalThis.location?.href || "about:blank").origin; } catch(e) { return ""; } })();
        (async () => {
          try {
            const raw = await Deno.core.ops.op_fetch_url(fullUrl, "GET", "{}", "", pageOrigin, "no-cors");
            const parsed = JSON.parse(raw);
            if (parsed.body) {
              try { (0, eval)(parsed.body); } catch(e) { console.error('Dynamic script error (' + fullUrl + '):', e.message); }
            }
            if (typeof c.onload === 'function') try { c.onload(new Event('load')); } catch(e) {}
              try { c.dispatchEvent(new Event('load')); } catch(e) {}
          } catch(e) {
            console.error('Dynamic script fetch error:', e.message);
            if (typeof c.onerror === 'function') try { c.onerror(e); } catch(ex) {}
          }
        })();
      } else {
        const code = c.textContent;
        if (code) { try { (0, eval)(code); } catch(e) { console.error('Dynamic inline script error:', e.message); } }
      }
    }
    if (c instanceof Element && c.localName === 'iframe') _connectIframe(c);
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
  replaceChild(newChild, oldChild) {
    if (!oldChild || !newChild) return oldChild;
    __obscura_runNodeIteratorPreRemove(oldChild);
    let _prev = -1, _next = -1;
    if (__mutationObservers?.length) {
      _prev = +_dom("prev_sibling", oldChild._nid);
      _next = +_dom("next_sibling", oldChild._nid);
    }
    _dom("insert_before", newChild._nid, oldChild._nid);
    _dom("remove_child", oldChild._nid);
    if (__mutationObservers?.length) __notifyMutation('childList', this._nid, [newChild._nid], [oldChild._nid], null, { previousSibling: _prev >= 0 ? _prev : null, nextSibling: _next >= 0 ? _next : null });
    return oldChild;
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
    return n;
  }
  contains(o) { return o ? _dom("contains", this._nid, o._nid) === "true" : false; }
  hasChildNodes() { return _dom("has_child_nodes", this._nid) === "true"; }
  cloneNode(deep) {
    const t = this.nodeType;
    if (t === 1) {
      const el = document.createElement(this.nodeName.toLowerCase());
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
      if (this._ns) el._ns = this._ns;
      if (deep) {
        // Recurse over real children rather than parsing outerHTML into a <div>:
        // a <div>'s fragment parser DROPS <html>/<head>/<body> wrappers (they are
        // not valid in a div context) and hoists their contents, so cloning a
        // document's documentElement used to collapse to its first descendant.
        const kids = this.childNodes;
        for (let i = 0; i < kids.length; i++) {
          const c = (kids[i] && kids[i].cloneNode) ? kids[i].cloneNode(true) : null;
          if (c) el.appendChild(c);
        }
      }
      return el;
    }
    if (t === 3) return document.createTextNode(this.textContent);
    if (t === 8) return document.createComment(this.nodeValue || "");
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
  normalize() {} // no-op
  isEqualNode(other) {
    if (!other) return false;
    if (this._nid === other._nid) return true;
    if (this.nodeType !== other.nodeType) return false;
    if (this.nodeName !== other.nodeName) return false;
    if (this.nodeValue !== other.nodeValue) return false;
    const a = this.attributes ? this.attributes : null;
    const b = other.attributes ? other.attributes : null;
    if ((a && a.length) || (b && b.length)) {
      if (!a || !b || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (other.getAttribute(a[i].name) !== a[i].value) return false;
      }
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
  addEventListener() {} removeEventListener() {} dispatchEvent() { return true; }
}
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
// setAttributeNS additionally validates against the QName production: an NCName,
// or prefix:local with both parts non-empty and exactly one colon.
const _validateQName = function(qname) {
  _validateAttrName(qname);
  const parts = qname.split(':');
  if (parts.length > 2 || parts.some(p => p === ''))
    throw new DOMException("'" + qname + "' is not a valid qualified name.", "InvalidCharacterError");
};
// DOM "validate and extract" for setAttributeNS / createAttributeNS. Returns
// {namespace, prefix, local} or throws InvalidCharacterError / NamespaceError.
const _validateAndExtract = function(namespace, qname) {
  const ns = (namespace === '' || namespace === undefined || namespace === null) ? null : String(namespace);
  qname = String(qname);
  _validateQName(qname);
  let prefix = null, local = qname;
  const ci = qname.indexOf(':');
  if (ci !== -1) { prefix = qname.slice(0, ci); local = qname.slice(ci + 1); }
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
  get childNodes() { return []; }
  get firstChild() { return null; }
  get parentNode() { return null; }
  cloneNode() { return new Attr(this._ns, this._prefix, this._local, this.value); }
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
// Minimal NodeList global so `x instanceof NodeList` is answerable (our static
// query results are plain arrays, deliberately NOT NodeList instances).
globalThis.NodeList = class NodeList {};

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
  _write(tokens) { this._el.setAttribute(this._attr, tokens.join(' ')); }
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
    oldT = String(oldT); newT = String(newT); _validateToken(oldT); _validateToken(newT);
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

class Element extends Node {
  constructor(nid) {
    super(nid);
    this._style = _styleProxy(new CSSStyleDeclaration());
  }
  get tagName() { return _domParse("tag_name", this._nid) || ""; }
  get localName() { return _asciiLower(this.tagName || ""); }
  get id() { return this.getAttribute("id") || ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.getAttribute("class") || ""; }
  set className(v) { this.setAttribute("class", v); }
  // Namespace prefix — null for elements created via createElement / parsed HTML;
  // createElementNS may pin one (this._prefix). Spec requires null, not undefined.
  get prefix() { return this._prefix ?? null; }
  get namespaceURI() {
    // createElementNS / cloneNode pin an explicit namespace on the wrapper.
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
  querySelector(s) { return _qsOne(_dom("query_selector_scoped", this._nid, s), s); }
  querySelectorAll(s) {
    const ids = _qsIds(_dom("query_selector_all_scoped", this._nid, s), s);
    const list = ids.map(_wrapEl).filter(Boolean);
    list.item = (i) => list[i] || null;
    list.forEach = Array.prototype.forEach.bind(list);
    return list;
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
  addEventListener(type, handler, opts) {
    if (!handler) return;
    // opts may be a boolean (capture) or { capture, once, passive }.
    const o = (typeof opts === 'boolean') ? { capture: opts } : (opts || {});
    const cap = !!o.capture;
    const key = this._nid;
    if (!_eventRegistry[key]) _eventRegistry[key] = {};
    if (!_eventRegistry[key][type]) _eventRegistry[key][type] = [];
    const list = _eventRegistry[key][type];
    // Per spec, a duplicate (type, handler, capture) registration is ignored.
    if (list.some(e => e.handler === handler && e.capture === cap)) return;
    list.push({ handler, capture: cap, once: !!o.once, passive: !!o.passive });
  }
  removeEventListener(type, handler, opts) {
    const key = this._nid;
    const cap = (typeof opts === 'boolean') ? opts : !!(opts && opts.capture);
    if (_eventRegistry[key] && _eventRegistry[key][type]) {
      _eventRegistry[key][type] =
        _eventRegistry[key][type].filter(e => !(e.handler === handler && e.capture === cap));
    }
  }
  dispatchEvent(event) {
    if (!event) return true;
    if (!event.target) event.target = this;
    event.currentTarget = this;
    // Snapshot: listeners added during this dispatch must not run for it.
    const entries = ((_eventRegistry[this._nid] || {})[event.type] || []).slice();
    for (const e of entries) {
      const h = e.handler;
      // `once` listeners are removed before invocation (per spec).
      if (e.once) this.removeEventListener(event.type, h, { capture: e.capture });
      try {
        if (typeof h === 'function') {
          // A callable listener is called directly; its `handleEvent` (if any) is ignored.
          h.call(this, event);
        } else {
          // Object listener: Get `handleEvent` ONCE per dispatch (may be a getter),
          // and it must be callable — otherwise this is a TypeError.
          const he = h && h.handleEvent;
          if (typeof he !== 'function')
            throw new TypeError("Failed to invoke event listener: 'handleEvent' is not a function");
          he.call(h, event);
        }
      } catch(err) { _reportError(err); }
      if (event._immediatePropagationStopped) break;
    }
    if (event.bubbles && !event._propagationStopped && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }
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
  get href() { return this.getAttribute("href") || ""; }
  set href(v) { this.setAttribute("href", v); }
  // iframe srcdoc reflects the attribute; setting it reprocesses via setAttribute.
  get srcdoc() { return this.getAttribute("srcdoc") || ""; }
  set srcdoc(v) { this.setAttribute("srcdoc", v == null ? "" : String(v)); }
  get src() { return this.getAttribute("src") || ""; }
  set src(v) {
    this.setAttribute("src", v);
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
    fetch(fullUrl, {mode: 'no-cors'}).then(async resp => {
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
  get compatMode() { return "CSS1Compat"; }
  get characterSet() { return "UTF-8"; }
  get contentType() { return "text/html"; }
  // Whether this is an HTML document (drives attribute-name lowercasing).
  get _isHTMLDoc() { return true; }
  get readyState() { return globalThis.__documentReadyState__ || 'complete'; }
  get hidden() { return false; }
  get visibilityState() { return "visible"; }
  getElementById(id) { return _wrapEl(+_dom("get_element_by_id", id)); }
  querySelector(s) { return _qsOne(_dom("query_selector", s), s); }
  querySelectorAll(s) {
    const ids = _qsIds(_dom("query_selector_all", s), s);
    const list = ids.map(_wrapEl).filter(Boolean);
    list.item = (i) => list[i] || null;
    list.forEach = Array.prototype.forEach.bind(list);
    return list;
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
  createElementNS(ns, t) {
    const el = this.createElement(t);
    if (el) el._ns = ns;
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
      'wheelevent': WheelEvent,
      'pointerevent': PointerEvent,
      'errorevent': ErrorEvent,
      'popstateevent': PopStateEvent,
      'animationevent': AnimationEvent,
      'transitionevent': TransitionEvent,
    };
    const Cls = map[String(type || '').toLowerCase()] || Event;
    return new Cls('');
  }
  createRange() {
    const r = new Range();
    r.setStart(this, 0); r.setEnd(this, 0);
    return r;
  }
  addEventListener(type, fn, opts) {
    if (typeof fn !== 'function') return;
    if (!this._listeners) this._listeners = {};
    if (!this._listeners[type]) this._listeners[type] = [];
    if (!this._listeners[type].includes(fn)) this._listeners[type].push(fn);
  }
  removeEventListener(type, fn) {
    if (this._listeners?.[type]) {
      this._listeners[type] = this._listeners[type].filter(h => h !== fn);
    }
  }
  dispatchEvent(event) {
    if (!event) return true;
    const handlers = (this._listeners?.[event.type] || []).slice();
    for (const h of handlers) { try { h.call(this, event); } catch(e) { console.error('document event error:', e); } }
    return !event.defaultPrevented;
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
        if (doctype) { doc.appendChild(doctype); doc._doctype = doctype; }
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
  get nodeType() { return 11; }
  get nodeName() { return "#document-fragment"; }
  get innerHTML() { return _domParse("inner_html", this._nid) ?? ""; }
  set innerHTML(v) { _dom("set_inner_html", this._nid, String(v ?? "")); }
  querySelector(s) { return _qsOne(_dom("query_selector_scoped", this._nid, s), s); }
  querySelectorAll(s) {
    const ids = _qsIds(_dom("query_selector_all_scoped", this._nid, s), s);
    const list = ids.map(_wrapEl).filter(Boolean);
    list.item = (i) => list[i] || null;
    return list;
  }
  get children() {
    const ids = _domParse("element_children", this._nid) || [];
    return ids.map(_wrapEl).filter(Boolean);
  }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const ch = this.children; return ch[ch.length - 1] || null; }
  getElementById(id) { return null; }
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
  get ownerDocument() { return globalThis.document; }
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
  get contentType() { return this._kind === 'html' ? "text/html" : "application/xml"; }
  get _isHTMLDoc() { return this._kind === 'html'; }
  get compatMode() { return "CSS1Compat"; }
  get characterSet() { return "UTF-8"; }
  get title() { const t = this.querySelector('title'); return t ? t.textContent : (this._title || ""); }
  set title(v) { this._title = String(v); }
  get URL() { return "about:blank"; }
  get documentURI() { return "about:blank"; }
  get defaultView() { return null; }
  get location() { return null; }
  get doctype() { return this._doctype || null; }
  get implementation() { return globalThis.document.implementation; }
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
  querySelector(s) { return _qsOne(_dom("query_selector_scoped", this._nid, s), s); }
  querySelectorAll(s) {
    const ids = _qsIds(_dom("query_selector_all_scoped", this._nid, s), s);
    const list = ids.map(_wrapEl).filter(Boolean);
    list.item = (i) => list[i] || null;
    return list;
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
const _elementClassFor = function(nid) {
  const tag = _domParse("tag_name", nid);
  if (tag === "FORM" && globalThis.HTMLFormElement) return globalThis.HTMLFormElement;
  return Element;
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
  if (!handler) return;
  const o = (typeof opts === 'boolean') ? { capture: opts } : (opts || {});
  const cap = !!o.capture;
  if (!_eventRegistry[key]) _eventRegistry[key] = {};
  if (!_eventRegistry[key][type]) _eventRegistry[key][type] = [];
  const list = _eventRegistry[key][type];
  if (list.some(e => e.handler === handler && e.capture === cap)) return;
  list.push({ handler, capture: cap, once: !!o.once, passive: !!o.passive });
};
const _removeListenerByKey = function(key, type, handler, opts) {
  const cap = (typeof opts === 'boolean') ? opts : !!(opts && opts.capture);
  if (_eventRegistry[key] && _eventRegistry[key][type]) {
    _eventRegistry[key][type] =
      _eventRegistry[key][type].filter(e => !(e.handler === handler && e.capture === cap));
  }
};
// Dispatch `event` on `target` using registry `key`. If the event bubbles and
// `bubbleTo` is given, it propagates there next (frame document -> frame window,
// matching the real Document -> Window event path for DOMContentLoaded etc.).
const _dispatchByKey = function(target, key, event, bubbleTo) {
  if (!event) return true;
  if (!event.target) event.target = target;
  event.currentTarget = target;
  const entries = ((_eventRegistry[key] || {})[event.type] || []).slice();
  for (const e of entries) {
    const h = e.handler;
    if (e.once) _removeListenerByKey(key, event.type, h, { capture: e.capture });
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
    if (event._immediatePropagationStopped) break;
  }
  if (event.bubbles && !event._propagationStopped && bubbleTo) {
    bubbleTo.dispatchEvent(event);
  }
  return !event.defaultPrevented;
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
  const ev = new Event('load'); // isTrusted=true, bubbles=false, cancelable=false
  ev.target = el;
  try { el.dispatchEvent(ev); } catch (e) {}
  if (typeof el.onload === 'function') { try { el.onload(ev); } catch (e) {} }
  else { const a = el.getAttribute && el.getAttribute('onload'); if (a) { try { (0, eval)(a); } catch (e) {} } }
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
  // blob: object URLs resolve from the in-page object-URL store (no network).
  if (typeof url === 'string' && url.startsWith('blob:')) {
    if (Object.prototype.hasOwnProperty.call(__blobStore, url)) {
      return new Response(__blobStore[url], {
        status: 200, statusText: '',
        headers: { 'content-type': __blobTypes[url] || 'text/plain' },
      });
    }
    return new Response('', { status: 404, statusText: '' });
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
    this.responseText = "";
    this.responseXML = null;
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
    this._method = method;
    this._url = url;
    this._headers = {};
    this._responseHeaders = {};
    this._aborted = false;
    this.status = 0;
    this.statusText = "";
    this.responseText = "";
    this.response = null;
    this._setReadyState(1);
  }

  setRequestHeader(name, value) {
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

    const xhr = this;
    this._fireEvent('loadstart');

    let url = this._url;
    if (url && !url.includes('://')) {
      try {
        const base = _domParse("document_url") || "about:blank";
        url = new URL(url, base).href;
      } catch(e) {}
    }

    fetch(url, {
      method: this._method,
      headers: this._headers,
      body: body || undefined,
      mode: 'cors',
    }).then(async (resp) => {
      if (xhr._aborted) return;

      xhr.status = resp.status;
      xhr.statusText = resp.statusText || '';
      xhr.responseURL = resp.url || url;

      if (resp.headers) {
        resp.headers.forEach((v, k) => { xhr._responseHeaders[k] = v; });
      }

      xhr._setReadyState(2); // HEADERS_RECEIVED

      const text = await resp.text();
      if (xhr._aborted) return;

      xhr.responseText = text;
      xhr._setReadyState(3); // LOADING

      switch (xhr.responseType) {
        case 'json':
          try { xhr.response = JSON.parse(text); } catch(e) { xhr.response = null; }
          break;
        case 'text':
        case '':
          xhr.response = text;
          break;
        case 'arraybuffer':
          xhr.response = new TextEncoder().encode(text).buffer;
          break;
        case 'blob':
          xhr.response = new Blob([text]);
          break;
        case 'document':
          xhr.response = text; // simplified
          break;
        default:
          xhr.response = text;
      }

      xhr._setReadyState(4); // DONE
      xhr._fireEvent('load');
      xhr._fireEvent('loadend');
    }).catch((err) => {
      if (xhr._aborted) return;
      xhr.status = 0;
      xhr.readyState = 4;
      xhr._fireEvent('readystatechange');
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
    const event = { type, target: this, currentTarget: this, bubbles: false };
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
      else if (input instanceof Request) { this.url = input.url; init = { ...input, ...init }; }
      else if (typeof URL === 'function' && input instanceof URL) { this.url = input.href; }
      else { this.url = input?.url || input?.href || String(input); }
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
    clone() { return new Request(this.url, { method: this.method, headers: this.headers, body: this.body }); }
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

if (typeof TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    get encoding() { return 'utf-8'; }
    encode(str) {
      str = String(str);
      const buf = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) buf.push(c);
        else if (c < 0x800) { buf.push(0xC0|(c>>6), 0x80|(c&0x3F)); }
        else if (c < 0xD800 || c >= 0xE000) { buf.push(0xE0|(c>>12), 0x80|((c>>6)&0x3F), 0x80|(c&0x3F)); }
        else { c = 0x10000 + (((c & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF)); buf.push(0xF0|(c>>18), 0x80|((c>>12)&0x3F), 0x80|((c>>6)&0x3F), 0x80|(c&0x3F)); }
      }
      return new Uint8Array(buf);
    }
    encodeInto(str, dest) { const enc = this.encode(str); dest.set(enc.slice(0, dest.length)); return { read: str.length, written: Math.min(enc.length, dest.length) }; }
  };
}
if (typeof TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    constructor(label) { this.encoding = label || 'utf-8'; }
    decode(buf) {
      if (!buf) return '';
      const bytes = ArrayBuffer.isView(buf)
        ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        : new Uint8Array(buf);
      let str = '', i = 0;
      while (i < bytes.length) {
        let c = bytes[i++];
        if (c < 0x80) str += String.fromCharCode(c);
        else if (c < 0xE0) str += String.fromCharCode(((c&0x1F)<<6)|(bytes[i++]&0x3F));
        else if (c < 0xF0) { const b1=bytes[i++], b2=bytes[i++]; str += String.fromCharCode(((c&0x0F)<<12)|((b1&0x3F)<<6)|(b2&0x3F)); }
        else { const b1=bytes[i++], b2=bytes[i++], b3=bytes[i++]; const cp=((c&0x07)<<18)|((b1&0x3F)<<12)|((b2&0x3F)<<6)|(b3&0x3F); if(cp>0xFFFF){const s=cp-0x10000;str+=String.fromCharCode(0xD800+(s>>10),0xDC00+(s&0x3FF));}else str+=String.fromCharCode(cp); }
      }
      return str;
    }
  };
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
  if (__mutationObservers.length) __scheduleMutationDelivery();
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
globalThis.PerformanceObserver = class { constructor(){} observe(){} disconnect(){} };

globalThis.Event = class Event {
  constructor(t,o={}) { this.type=t;this.bubbles=!!o.bubbles;this.cancelable=!!o.cancelable;this.composed=!!o.composed;this.defaultPrevented=false;this.target=null;this.currentTarget=null;this.eventPhase=0;this.timeStamp=Date.now();this._propagationStopped=false;this._immediatePropagationStopped=false; }
  get isTrusted() { return true; }
  get srcElement() { return this.target; } // legacy alias for target
  preventDefault() { if (this.cancelable) this.defaultPrevented=true; } stopPropagation(){ this._propagationStopped=true; } stopImmediatePropagation(){ this._propagationStopped=true; this._immediatePropagationStopped=true; }
  initEvent(type,bubbles,cancelable) { this.type=type;this.bubbles=!!bubbles;this.cancelable=!!cancelable;this.defaultPrevented=false;this._propagationStopped=false;this._immediatePropagationStopped=false; }
};
globalThis.CustomEvent = class extends Event {
  constructor(t,o={}) { super(t,o);this.detail=o.detail; }
  // Legacy DOM Level 2 init; some libraries (Starbucks China bundle, older
  // analytics shims) still call createEvent('CustomEvent') + initCustomEvent
  // instead of new CustomEvent(...). See issue #41.
  initCustomEvent(type,bubbles,cancelable,detail) {
    this.type = type;
    this.bubbles = !!bubbles;
    this.cancelable = !!cancelable;
    this.detail = detail;
  }
};
globalThis.MouseEvent = class extends Event {
  constructor(t,o={}) {
    super(t,o);
    this.screenX = o.screenX || 0;
    this.screenY = o.screenY || 0;
    this.clientX = o.clientX || 0;
    this.clientY = o.clientY || 0;
    this.ctrlKey = !!o.ctrlKey;
    this.shiftKey = !!o.shiftKey;
    this.altKey = !!o.altKey;
    this.metaKey = !!o.metaKey;
    this.button = o.button ?? 0;
    this.buttons = o.buttons ?? 0;
    this.relatedTarget = o.relatedTarget || null;
    this.detail = o.detail || 0;
  }
};
globalThis.KeyboardEvent = class extends Event { constructor(t,o={}) { super(t,o);this.key=o.key||"";this.code=o.code||""; } };
globalThis.FocusEvent = class extends Event {};
globalThis.InputEvent = class extends Event { constructor(t,o={}) { super(t,o);this.data=o.data||null;this.inputType=o.inputType||""; } };
globalThis.ErrorEvent = class extends Event { constructor(t,o={}) { super(t,o);this.message=o.message||"";this.error=o.error||null; } };
globalThis.PointerEvent = class extends Event { constructor(t,o={}) { super(t,o); } };
globalThis.AnimationEvent = class extends Event {};
globalThis.TransitionEvent = class extends Event {};
globalThis.UIEvent = class extends Event {};
globalThis.WheelEvent = class extends MouseEvent {
  constructor(t,o={}) {
    super(t,o);
    this.deltaX = o.deltaX || 0;
    this.deltaY = o.deltaY || 0;
    this.deltaZ = o.deltaZ || 0;
    this.deltaMode = o.deltaMode || 0;
  }
};
globalThis.PopStateEvent = class extends Event {};
globalThis.HashChangeEvent = class extends Event {};
globalThis.MessageEvent = class extends Event { constructor(t,o={}) { super(t,o);this.data=o.data; } };
globalThis.ClipboardEvent = class extends Event {};
globalThis.SubmitEvent = class extends Event {};

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
if (typeof Blob === "undefined") globalThis.Blob = class Blob { constructor(parts=[],opts={}){this._data=parts.join("");this.size=this._data.length;this.type=opts.type||"";} async text(){return this._data;} };
if (typeof File === "undefined") globalThis.File = class extends Blob { constructor(parts,name,opts){super(parts,opts);this.name=name;} };
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

globalThis.DOMParser = class { parseFromString(s,t) { return globalThis.document; } };
globalThis.XMLSerializer = class XMLSerializer {
  serializeToString(node) {
    if (!node) return "";
    if (node.nodeType === 10) {
      let s = "<!DOCTYPE " + (node.name || "html");
      if (node.publicId) s += ' PUBLIC "' + node.publicId + '"';
      if (node.systemId) {
        if (!node.publicId) s += " SYSTEM";
        s += ' "' + node.systemId + '"';
      }
      s += ">";
      return s;
    }
    if (node.outerHTML !== undefined) return node.outerHTML;
    if (node.nodeType === 9) {
      let s = "";
      if (node.doctype) s += this.serializeToString(node.doctype);
      if (node.documentElement) s += node.documentElement.outerHTML;
      return s;
    }
    if (node.nodeType === 3) return node.textContent || "";
    if (node.nodeType === 8) return "<!--" + (node.textContent || "") + "-->";
    return "";
  }
};
globalThis.performance = globalThis.performance || {
  now: () => Date.now(),
  mark(){}, measure(){},
  clearMarks(){}, clearMeasures(){}, clearResourceTimings(){},
  getEntries(){return [];}, getEntriesByName(){return [];}, getEntriesByType(){return [];},
  setResourceTimingBufferSize(){},
  timeOrigin: 0,
  timing: { navigationStart: 0, domContentLoadedEventEnd: 0, loadEventEnd: 0 },
  navigation: { type: 0, redirectCount: 0 },
  memory: {
    jsHeapSizeLimit: 2172649472,
    totalJSHeapSize: 19321856,
    usedJSHeapSize: 16781520,
  },
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
globalThis.crypto = globalThis.crypto || { getRandomValues(arr) { for(let i=0;i<arr.length;i++) arr[i]=Math.floor(Math.random()*256); return arr; }, randomUUID(){ return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16);}); } };
globalThis.structuredClone = globalThis.structuredClone || ((v) => JSON.parse(JSON.stringify(v)));
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

globalThis.btoa = globalThis.btoa || ((s) => { const b = new TextEncoder().encode(s); const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; let r=""; for(let i=0;i<b.length;i+=3){const a=b[i],bb=b[i+1]??0,cc=b[i+2]??0; r+=c[a>>2]+c[((a&3)<<4)|(bb>>4)]+(i+1<b.length?c[((bb&15)<<2)|(cc>>6)]:"=")+(i+2<b.length?c[cc&63]:"=");} return r; });
globalThis.atob = globalThis.atob || ((s) => { const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; let r=[]; for(let i=0;i<s.length;i+=4){const a=c.indexOf(s[i]),b=c.indexOf(s[i+1]),cc=c.indexOf(s[i+2]),d=c.indexOf(s[i+3]); r.push((a<<2)|(b>>4)); if(cc>=0)r.push(((b&15)<<4)|(cc>>2)); if(d>=0)r.push(((cc&3)<<6)|d);} return String.fromCharCode(...r); });

globalThis.history = { length:1, state:null, pushState(){}, replaceState(){}, go(){}, back(){}, forward(){}, scrollRestoration:"auto" };
globalThis.screenX = 0; globalThis.screenY = 0;
globalThis.screenLeft = 0; globalThis.screenTop = 0;
globalThis.pageXOffset = 0; globalThis.pageYOffset = 0;
globalThis.scrollX = 0; globalThis.scrollY = 0;

globalThis.CSS = { supports(){return false;}, escape(s){return s;} };

globalThis.HTMLElement = Element;
globalThis.HTMLDivElement = Element;
globalThis.HTMLSpanElement = Element;
globalThis.HTMLParagraphElement = Element;
globalThis.HTMLAnchorElement = Element;
globalThis.HTMLImageElement = Element;
globalThis.HTMLInputElement = Element;
globalThis.HTMLButtonElement = Element;
globalThis.HTMLFormElement = class HTMLFormElement extends Element {
  get elements() { return this.querySelectorAll("input, select, textarea, button, fieldset, output, object"); }
  get length() { return this.elements.length; }
  // Inherit submit() from Element.prototype: it dispatches the cancelable
  // 'submit' event and (if not prevented) builds form data and navigates.
  reset() { for (const f of this.elements) { if ('value' in f) f.value = ''; } }
};
globalThis.HTMLSelectElement = Element;
globalThis.HTMLTextAreaElement = Element;
globalThis.HTMLLabelElement = Element;
globalThis.HTMLTableElement = Element;
globalThis.HTMLIFrameElement = Element;
globalThis.HTMLCanvasElement = Element;
globalThis.HTMLVideoElement = Element;
globalThis.HTMLAudioElement = Element;
globalThis.HTMLScriptElement = Element;
globalThis.HTMLStyleElement = Element;
globalThis.HTMLLinkElement = Element;
globalThis.HTMLMetaElement = Element;
globalThis.HTMLHeadElement = Element;
globalThis.HTMLBodyElement = Element;
globalThis.HTMLHtmlElement = Element;
globalThis.HTMLBRElement = Element;
globalThis.HTMLHRElement = Element;
globalThis.HTMLUListElement = Element;
globalThis.HTMLOListElement = Element;
globalThis.HTMLLIElement = Element;
globalThis.HTMLPreElement = Element;
globalThis.HTMLHeadingElement = Element;
globalThis.HTMLTemplateElement = Element;
globalThis.HTMLSlotElement = Element;
globalThis.HTMLOptionElement = Element;
globalThis.HTMLDataListElement = Element;
globalThis.HTMLFieldSetElement = Element;
globalThis.HTMLLegendElement = Element;
globalThis.HTMLProgressElement = Element;
globalThis.HTMLDetailsElement = Element;
globalThis.HTMLDialogElement = Element;
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
      // <html>/<head>/<body>). Parse the markup, drop any XML prolog / doctype, and
      // append the resulting top-level nodes straight onto the document node.
      const xmlSrc = String(html || '')
        .replace(/^﻿/, '')
        .replace(/^\s*<\?xml[^>]*\?>\s*/i, '')
        .replace(/^\s*<!DOCTYPE[^>]*>\s*/i, '')
        .replace(/^\s+/, '');
      try {
        const tmp = globalThis.document.createElement('div');
        tmp.innerHTML = xmlSrc;
        const kids = Array.prototype.slice.call(tmp.childNodes);
        for (let i = 0; i < kids.length; i++) this.appendChild(kids[i]);
      } catch (e) {}
      return;
    }
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
  get location() { return this._iframeEl?.contentWindow?.location; }
  get defaultView() { return this._iframeEl?.contentWindow || null; }
  get ownerDocument() { return null; }
  get compatMode() { return 'CSS1Compat'; }
  get contentType() { return 'text/html'; }
  get characterSet() { return 'UTF-8'; }
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
    // Document events bubble to the frame's window (real Document -> Window path).
    return _dispatchByKey(this, this._evtKey, event, this._iframeEl?.contentWindow);
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
    return _dispatchByKey(this, this._evtKey, event);
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
      const blobContent = __blobStore?.[url];
      if (blobContent) {
        this._code = blobContent;
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
const _origCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = function(blob) {
  const id = 'blob:obscura/' + Math.random().toString(36).substring(2);
  if (blob) {
    __blobTypes[id] = blob.type || '';
    // Store the content SYNCHRONOUSLY when available (our Blob keeps _data), so a
    // consumer that fetches the URL on the next tick (e.g. an iframe src load)
    // sees the content. Fall back to async text() for other blob-likes.
    if (typeof blob._data === 'string') {
      __blobStore[id] = blob._data;
    } else if (typeof blob.text === 'function') {
      blob.text().then(text => { __blobStore[id] = text; });
    }
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
  globalThis.Image = class Image {
    constructor(w, h) { this.width = w || 0; this.height = h || 0; this.src = ''; this.onload = null; this.onerror = null; this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
    addEventListener() {} removeEventListener() {}
    setAttribute(k, v) { this[k] = v; if (k === 'src' && this.onload) setTimeout(() => { this.complete = true; this.onload(); }, 0); }
    getAttribute(k) { return this[k]; }
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
    constructor() { this.result = null; this.readyState = 0; this.onload = null; this.onerror = null; }
    readAsText(blob) { if (blob?.text) blob.text().then(t => { this.result = t; this.readyState = 2; if (this.onload) this.onload({target:this}); }); }
    readAsDataURL(blob) { this.result = 'data:;base64,'; this.readyState = 2; if (this.onload) setTimeout(() => this.onload({target:this}), 0); }
    readAsArrayBuffer(blob) { this.result = new ArrayBuffer(0); this.readyState = 2; if (this.onload) setTimeout(() => this.onload({target:this}), 0); }
    abort() { this.readyState = 0; }
    addEventListener(t, fn) { if (t === 'load') this.onload = fn; }
    removeEventListener() {}
  };
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
  Document.prototype.importNode = function(node, deep) { return node?.cloneNode(!!deep) || null; };
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
  globalThis.performance.timing = { navigationStart: t0, domContentLoadedEventEnd: t0, loadEventEnd: t0 };

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
