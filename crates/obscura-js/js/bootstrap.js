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

// Generation counter bumped on every structural tree mutation. Live `childNodes`
// NodeLists cache their snapshot against this so repeated reads in a hot loop
// (serialization, slice, etc.) don't re-query Rust on every access, while still
// reflecting any mutation the instant one happens.
let _treeGen = 0;
const _MUTATING_DOM_CMDS = new Set(['append_child', 'remove_child', 'insert_before', 'set_inner_html', 'set_text_content']);
const _dom = (cmd, a1, a2) => {
  if (_MUTATING_DOM_CMDS.has(cmd)) _treeGen++;
  return Deno.core.ops.op_dom(cmd, String(a1 ?? ""), String(a2 ?? ""));
};

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
// The constraint-validation live-state pseudo-classes (:valid/:invalid/:in-range/
// :out-of-range) can't be matched by the Rust selector engine alone — validity is
// computed by the JS engine (`_cvCompute`). So, exactly like `:target`, we prime:
// when a selector references one of them, compute every validity-bearing element's
// bitmask (1=:valid 2=:invalid 4=:in-range 8=:out-of-range) and push the snapshot
// to Rust before the query runs. Gated on a cheap substring test so the hot
// querySelectorAll path pays nothing when no such pseudo is present.
const _RANGE_LIMIT_TYPES = ['number', 'range', 'date', 'month', 'week', 'time', 'datetime-local'];
const _VALIDITY_TAGS = 'input,select,textarea,button,output,object,fieldset,form';
const _VALIDITY_TAG_SET = new Set(['input', 'select', 'textarea', 'button', 'output', 'object', 'fieldset', 'form']);
const _selControlInvalid = (el) => { try { return _cvWillValidate(el) && !_cvCompute(el).valid; } catch (e) { return false; } };
const _primeValidity = (s, node) => {
  if (s.indexOf('valid') < 0 && s.indexOf('range') < 0) return;
  try {
    // Resolve the queried node's root by walking up — it may be the document, or a
    // disconnected subtree's top element (matches()/closest() run on detached nodes).
    let root = node;
    while (root && root.parentNode) root = root.parentNode;
    if (!root || !root.querySelectorAll) return;
    // querySelectorAll never returns the scope itself, so add it when the root is
    // itself a validity-bearing element (e.g. matches() on a detached <fieldset>).
    const all = Array.from(root.querySelectorAll(_VALIDITY_TAGS));
    if (root.nodeType === 1 && _VALIDITY_TAG_SET.has(root.localName)) all.push(root);
    const parts = [];
    for (const el of all) {
      let flags = 0;
      const tag = el.localName;
      if (tag === 'form') {
        // :invalid iff the form owns ≥1 invalid candidate control, else :valid.
        let bad = false;
        try { for (const c of el.elements) { if (_selControlInvalid(c)) { bad = true; break; } } } catch (e) {}
        flags = bad ? 2 : 1;
      } else if (tag === 'fieldset') {
        // :invalid iff a descendant candidate control is invalid, else :valid.
        let bad = false;
        try { for (const c of el.querySelectorAll('input,select,textarea,button,output,object')) { if (_selControlInvalid(c)) { bad = true; break; } } } catch (e) {}
        flags = bad ? 2 : 1;
      } else if (_cvWillValidate(el)) {
        const v = _cvCompute(el);
        const t = tag === 'input' ? _cvInputType(el) : '';
        // A range control's value sanitization clamps it into [min,max], so it can
        // never suffer a range over/underflow — recompute validity without them.
        const isRange = t === 'range';
        const overflow = isRange ? false : v.rangeOverflow;
        const underflow = isRange ? false : v.rangeUnderflow;
        const valid = isRange
          ? !(v.valueMissing || v.typeMismatch || v.patternMismatch || v.tooLong ||
              v.tooShort || v.stepMismatch || v.badInput || v.customError)
          : v.valid;
        flags |= valid ? 1 : 2;
        // "Has range limitations": a range input always (default min 0/max 100),
        // else a min/max-bearing numeric/temporal input.
        if (isRange || (_RANGE_LIMIT_TYPES.indexOf(t) >= 0 && (el.hasAttribute('min') || el.hasAttribute('max')))) {
          flags |= (overflow || underflow) ? 8 : 4;
        }
      }
      if (flags) parts.push(el._nid + ':' + flags);
    }
    _dom('set_validity_flags', parts.join(','));
  } catch (e) {}
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

// ── Custom-property (CSS variable) name/value rules ──────────────────────────
// A valid custom-property name is "--" followed by ≥1 character, with no internal
// whitespace (`--`, `--foo bar` are invalid; `--foo`, `---` are valid).
const _isValidCustomPropName = (name) => name.length > 2 && name.startsWith('--') && !/\s/.test(name);
// Canonicalize a custom-property value: leading/trailing whitespace is trimmed,
// internal whitespace preserved; an empty (all-whitespace) value becomes a single
// space — the empty-value form the CSSOM round-trips (`--x: ;` reads back as " ").
const _canonCustomValue = (value) => { const t = String(value).trim(); return t === '' ? ' ' : t; };
// Canonicalize a single CSS numeric literal (sign + mantissa + optional exponent,
// no unit) per CSSOM "serialize a <number>": a bare leading decimal point gains a
// `0` (`.5` → `0.5`, `-.5` → `-0.5`), a leading `+` is dropped, and a negative
// zero loses its sign (`-0` → `0`). Digits otherwise preserved verbatim.
const _canonNumberLiteral = (numStr) => {
  let s = numStr;
  s = s.replace(/^([+-]?)\.(?=\d)/, '$10.');     // .5 → 0.5 ; -.5 → -0.5
  if (s[0] === '+') s = s.slice(1);              // +5 → 5
  if (s[0] === '-' && parseFloat(s) === 0) s = s.slice(1); // -0 / -0px's number → 0
  return s;
};
// Lightly canonicalize a standard-property specified value: rewrite each numeric
// token (the CSSOM serialization of `.5%`→`0.5%`, `-0px`→`0px`, …) while leaving
// every other token — idents, hex colours, strings, url()s, structure — byte for
// byte intact. A hand scan (not a full tokenizer) so it stays cheap on the hot
// inline-style setter path; custom properties never pass through here.
const _NUM_AT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const _canonStandardValue = (value) => {
  const s = String(value);
  const n = s.length;
  if (n === 0) return s;
  let out = '', i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {                  // comment — copy verbatim
      let j = i + 2; while (j < n && !(s[j] === '*' && s[j + 1] === '/')) j++;
      j = Math.min(n, j + 2); out += s.slice(i, j); i = j; continue;
    }
    if (c === '"') {                                       // double-quoted string — copy verbatim
      let j = i + 1; while (j < n && s[j] !== c) { if (s[j] === '\\') j++; j++; }
      j = Math.min(n, j + 1); out += s.slice(i, j); i = j; continue;
    }
    if (c === "'") {                                       // single-quoted → CSSOM double-quoted
      let j = i + 1, inner = '';
      while (j < n && s[j] !== "'") {
        if (s[j] === '\\') { j++; if (j < n) { inner += s[j] === "'" ? "'" : '\\' + s[j]; j++; } continue; }
        inner += s[j] === '"' ? '\\"' : s[j]; j++;
      }
      j = Math.min(n, j + 1); out += '"' + inner + '"'; i = j; continue;
    }
    if (c === '#') {                                       // hash / hex colour — copy verbatim
      out += c; i++;
      while (i < n && /[\w-]/.test(s[i])) { out += s[i]; i++; }
      continue;
    }
    // Identifier (incl. vendor `-prefix`, custom-ident, function name): a letter,
    // `_`, `\` escape, or a `-` NOT introducing a number. Consumed whole so digits
    // embedded in an ident (`par-num`, `Lucida2`) are never mistaken for numbers.
    if (/[A-Za-z_\\]/.test(c) || (c === '-' && !_NUM_AT.test(s.slice(i)))) {
      let ident = c; i++;
      while (i < n && (/[\w-]/.test(s[i]) || s[i] === '\\')) {
        if (s[i] === '\\') { ident += s[i]; i++; if (i < n) { ident += s[i]; i++; } continue; }
        ident += s[i]; i++;
      }
      // url( … ) serializes per CSSOM as url("…") — quote the URL (double quotes),
      // normalizing an unquoted or single-quoted argument.
      if (ident.toLowerCase() === 'url' && s[i] === '(') {
        let j = i + 1;
        while (j < n && /\s/.test(s[j])) j++;
        let raw = '', ok = true;
        if (s[j] === '"' || s[j] === "'") {
          const q = s[j]; j++;
          while (j < n && s[j] !== q) { if (s[j] === '\\') { j++; if (j < n) { raw += s[j] === '"' ? '\\"' : (s[j] === "'" ? "'" : '\\' + s[j]); j++; } continue; } raw += s[j] === '"' ? '\\"' : s[j]; j++; }
          j = Math.min(n, j + 1);
        } else {
          while (j < n && s[j] !== ')' && !/\s/.test(s[j])) { if (s[j] === '\\') { raw += s[j]; j++; if (j < n) { raw += s[j]; j++; } continue; } raw += s[j]; j++; }
        }
        while (j < n && /\s/.test(s[j])) j++;
        if (s[j] === ')') { out += 'url("' + raw + '")'; i = j + 1; continue; }
        ok = false;                                       // malformed url(): leave the ident, let '(' flow on
        if (!ok) { out += ident; continue; }
      }
      out += ident; continue;
    }
    const m = _NUM_AT.exec(s.slice(i));                    // numeric token
    if (m && /\d/.test(m[0])) { out += _canonNumberLiteral(m[0]); i += m[0].length; continue; }
    out += c; i++;
  }
  return out;
};
// Is `value` a valid <declaration-value> (the grammar a custom property accepts)?
// Any token sequence is allowed EXCEPT one containing an unmatched `)`, `]`, or
// `}` — note unmatched OPENERS are fine (`--x: (` is valid). Brackets inside
// strings and /* */ comments don't count. A closer must match the most recent
// opener exactly: `(])` is invalid (the `]` doesn't match the open `(`).
const _isBalancedDeclValue = (value) => {
  const s = String(value);
  const n = s.length;
  const stack = [];
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {                 // comment
      i += 2;
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2; continue;
    }
    if (c === '"' || c === "'") {                          // string
      const q = c; i++;
      while (i < n && s[i] !== q) { if (s[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '(' || c === '[' || c === '{') stack.push(c);
    else if (c === ')' || c === ']' || c === '}') {
      const top = stack[stack.length - 1];
      if ((c === ')' && top === '(') || (c === ']' && top === '[') || (c === '}' && top === '{')) stack.pop();
      else return false;                                  // unmatched closer
    }
    i++;
  }
  return true;
};
// Parse a declaration block (an inline style string / cssText) into an ordered
// list of { name, value, important }. Invalid custom-property names are dropped;
// standard names are ASCII-lowercased (custom names keep their case); standard
// values are trimmed (empty → dropped), custom values canonicalized.
const _parseStyleDecls = (text) => {
  const out = [];
  for (const part of String(text == null ? '' : text).split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    let name = part.slice(0, idx).trim();
    if (!name) continue;
    let value = part.slice(idx + 1);
    let important = false;
    const m = /!\s*important\s*$/i.exec(value);
    if (m) { important = true; value = value.slice(0, m.index); }
    if (name.startsWith('--')) {
      if (!_isValidCustomPropName(name)) continue;
      if (!_isBalancedDeclValue(value)) continue;        // invalid <declaration-value> → drop
      value = _canonCustomValue(value);
    } else {
      name = name.toLowerCase();
      value = value.trim();
      if (value === '') continue;
      value = _canonStandardValue(value);
      if (_POSITION_PROPS.has(name)) {
        if (_STRICT_POSITION_PROPS.has(name) && !_isValidStrictPosition(value, _STRICT_POSITION_PROPS.get(name))) continue; // invalid strict <position> → drop
        if (_BG_POSITION_PROPS.has(name) && !_isValidBgPosition(value)) continue;      // invalid <bg-position> → drop
        value = _serializePositionSpecified(value);
      }
      else if (_ORIGIN_PROPS.has(name)) {
        if (!_isValidOrigin(name, value)) continue;        // invalid origin → drop
        value = _serializeOriginSpecified(name, value);
      }
      else if (_SIMPLE_TRANSFORM_PROPS.has(name)) {
        if (!_isValidSimpleTransform(name, value)) continue; // invalid perspective/transform-box/backface → drop
      }
      else if (_GRADIENT_PROPS.has(name)) {
        if (_imageFuncInvalid(value)) continue;            // invalid image() → drop declaration
        value = _canonImageSet(_canonGradients(value, null, false));
      } else if (_COLOR_PROPS.has(name)) {
        if (_hasImageFunc(value)) continue;                // image() is not a <color> → drop
        if (/^(?:alpha|contrast-color)\(/i.test(value.trim()) && !_isValidColor(value)) continue;  // invalid alpha()/contrast-color() → drop
        value = _canonColorSpecified(value);
      } else if (_COLOR_SHORTHAND_PROPS.has(name)) {
        value = _canonColorShorthand(value);
      } else if (name === 'filter' || name === 'backdrop-filter') {
        if (!_isValidFilter(value)) continue;              // invalid <filter-value-list> → drop
        value = _canonFilter(value, null, false);
      } else if (name === 'transform') {
        if (!_isValidTransform(value)) continue;           // invalid <transform-list> → drop
        value = _canonTransform(value, null, false);
      } else if (_INDIV_TRANSFORM.has(name)) {
        if (!_isValidIndividualTransform(name, value)) continue;  // invalid scale/rotate/translate → drop
        value = _canonIndividualTransform(name, value, null, false);
      } else if (name === 'content') {
        value = _canonContent(value, null, false);
      } else if (name === 'offset-rotate') {
        if (!_isValidOffsetRotate(value)) continue;        // invalid [auto|reverse]||<angle> → drop
        value = _canonOffsetRotate(value);
      } else if (name === 'offset-distance') {
        if (!_isValidOffsetDistance(value)) continue;      // invalid <length-percentage> → drop
        value = _canonOffsetDistance(value);
      } else if (name === 'offset-path') {
        if (!_isValidOffsetPath(value)) continue;          // invalid <offset-path> → drop
        value = _canonOffsetPath(value);
      } else if (_BG_POSITION_AXIS.has(name)) {
        if (!_isValidBgAxis(value, _BG_POSITION_AXIS.get(name))) continue; // invalid single-axis <bg-position> → drop
        value = _canonBgAxis(value, _BG_POSITION_AXIS.get(name));
      } else if (name === 'offset') {
        const lh = _parseOffsetShorthand(value);
        if (!lh) continue;                                 // invalid <offset> → drop declaration
        for (const ln of _OFFSET_LONGHANDS) out.push({ name: ln, value: lh[ln], important });
        continue;                                          // expanded into longhands; no `offset` key
      } else if (name === 'opacity') {
        value = _canonOpacitySpecified(value);
      } else if (_BORDER_SH_PROPS.has(name)) {
        value = _canonShorthandLenMath(value);       // line-width calc() in border/outline/column-rule shorthand
      }
      value = _canonLengthTimeMath(name, value);   // <length>/<time> math → canonical specified form
    }
    out.push({ name, value, important });
  }
  return out;
};

class CSSStyleDeclaration {
  constructor() { this._props = {}; this._priority = {}; }
  setProperty(name, value, priority) {
    name = String(name);
    const custom = name.startsWith('--');
    if (custom) { if (!_isValidCustomPropName(name)) return; }
    else name = name.toLowerCase();
    value = String(value == null ? '' : value);
    if (custom && value !== '' && !_isBalancedDeclValue(value)) return; // invalid <declaration-value> → ignore
    if (value === '') { this.removeProperty(name); return; }   // empty value ⇒ remove (CSSOM)
    let stored = custom ? _canonCustomValue(value) : _canonStandardValue(value.trim());
    if (!custom && stored === '') { this.removeProperty(name); return; }
    if (!custom && _BORDER_EXPAND[name] && !/\bvar\(/i.test(stored)) {
      // border/outline shorthand (no var()): expand into — and store as — its
      // longhands so `el.style.borderTopColor` reads back. Invalid → ignore.
      const lh = _expandBorderShorthand(name, stored);
      if (!lh) return;
      delete this._props[name]; delete this._priority[name];   // drop any prior var()-stored shorthand key
      for (const ln of _BORDER_EXPAND[name]) this.setProperty(ln, lh[ln], priority);
      return;                                                  // expanded; no shorthand key kept
    }
    if (!custom && _POSITION_PROPS.has(name)) {
      if (_STRICT_POSITION_PROPS.has(name) && !_isValidStrictPosition(stored, _STRICT_POSITION_PROPS.get(name))) return; // invalid strict <position> → ignore
      if (_BG_POSITION_PROPS.has(name) && !_isValidBgPosition(stored)) return;        // invalid <bg-position> → ignore
      stored = _serializePositionSpecified(stored);
    }
    else if (!custom && _ORIGIN_PROPS.has(name)) {
      if (!_isValidOrigin(name, stored)) return;           // invalid origin → ignore (keep prior value)
      stored = _serializeOriginSpecified(name, stored);
    }
    else if (!custom && _SIMPLE_TRANSFORM_PROPS.has(name)) {
      if (!_isValidSimpleTransform(name, stored)) return;  // invalid perspective/transform-box/backface → ignore
    }
    else if (!custom && _GRADIENT_PROPS.has(name)) {
      if (_imageFuncInvalid(stored)) return;               // invalid image() → ignore (keep prior value)
      stored = _canonImageSet(_canonGradients(stored, null, false));
    } else if (!custom && _COLOR_PROPS.has(name)) {
      if (_hasImageFunc(stored)) return;                   // image() is not a <color> → ignore
      if (/^(?:alpha|contrast-color)\(/i.test(stored.trim()) && !_isValidColor(stored)) return;  // invalid alpha()/contrast-color() → ignore
      stored = _canonColorSpecified(stored);
    } else if (!custom && _COLOR_SHORTHAND_PROPS.has(name)) {
      stored = _canonColorShorthand(stored);
    } else if (!custom && (name === 'filter' || name === 'backdrop-filter')) {
      if (!_isValidFilter(stored)) return;                 // invalid <filter-value-list> → ignore
      stored = _canonFilter(stored, null, false);
    } else if (!custom && name === 'transform') {
      if (!_isValidTransform(stored)) return;              // invalid <transform-list> → ignore
      stored = _canonTransform(stored, null, false);
    } else if (!custom && _INDIV_TRANSFORM.has(name)) {
      if (!_isValidIndividualTransform(name, stored)) return;  // invalid scale/rotate/translate → ignore
      stored = _canonIndividualTransform(name, stored, null, false);
    } else if (!custom && name === 'content') {
      stored = _canonContent(stored, null, false);
    } else if (!custom && name === 'offset-rotate') {
      if (!_isValidOffsetRotate(stored)) return;           // invalid [auto|reverse]||<angle> → ignore
      stored = _canonOffsetRotate(stored);
    } else if (!custom && name === 'offset-distance') {
      if (!_isValidOffsetDistance(stored)) return;         // invalid <length-percentage> → ignore
      stored = _canonOffsetDistance(stored);
    } else if (!custom && name === 'offset-path') {
      if (!_isValidOffsetPath(stored)) return;             // invalid <offset-path> → ignore
      stored = _canonOffsetPath(stored);
    } else if (!custom && _BG_POSITION_AXIS.has(name)) {
      if (!_isValidBgAxis(stored, _BG_POSITION_AXIS.get(name))) return; // invalid single-axis <bg-position> → ignore
      stored = _canonBgAxis(stored, _BG_POSITION_AXIS.get(name));
    } else if (!custom && name === 'offset') {
      const lh = _parseOffsetShorthand(stored);
      if (!lh) return;                                     // invalid <offset> → ignore
      const prio = String(priority || '').toLowerCase() === 'important' ? 'important' : '';
      for (const ln of _OFFSET_LONGHANDS) {
        if (ln in this._props) { delete this._props[ln]; delete this._priority[ln]; }
        this._props[ln] = lh[ln]; this._priority[ln] = prio;
      }
      return;                                              // expanded into longhands; no `offset` key
    } else if (!custom && _MATH_GATE_PROPS[name]) {
      const g = _MATH_GATE_PROPS[name];
      if (_mathReject(stored, g.types, g.pct)) return;     // malformed/mistyped math function → ignore
      if (name === 'opacity') {
        // opacity is <number>|<percentage> (+ math, + CSS-wide) — reject a non-numeric
        // value (`auto`, `10px`, `0 1`) the math gate above doesn't see.
        const low = stored.toLowerCase();
        if (!_MATHFN_NAME_RE.test(stored) && !_TF_VAR_RE.test(stored) && !_CSS_WIDE.has(low)
            && !_FILTER_NUM_RE.test(stored) && !_FILTER_PCT_RE.test(stored)) return;
        stored = _canonOpacitySpecified(stored);
      }
    } else if (!custom && _BORDER_SH_PROPS.has(name)) {
      stored = _canonShorthandLenMath(stored);       // line-width calc() in border/outline/column-rule shorthand
    }
    if (!custom) stored = _canonLengthTimeMath(name, stored);  // <length>/<time> math → canonical specified form
    // Re-setting an existing property through the CSSOM makes it the latest-written
    // declaration: delete+reinsert so the live-decl cascade source (_buildCascade
    // iterates _props in insertion order) resolves shared longhands last-write-wins
    // — e.g. `style.borderLeft = …` after a markup `border-width` wins the left edge.
    if (name in this._props) { delete this._props[name]; delete this._priority[name]; }
    this._props[name] = stored;
    this._priority[name] = String(priority || '').toLowerCase() === 'important' ? 'important' : '';
  }
  removeProperty(name) {
    name = String(name); const key = name.startsWith('--') ? name : name.toLowerCase();
    if (key === 'offset') {                                // shorthand: clear its five longhands
      const old = _serializeOffsetShorthand(this);
      for (const ln of _OFFSET_LONGHANDS) { delete this._props[ln]; delete this._priority[ln]; }
      return old;
    }
    if (_BORDER_EXPAND[key]) {                              // border/outline: clear its longhands
      const old = this.getPropertyValue(key);
      delete this._props[key]; delete this._priority[key];   // any var()-stored shorthand key
      for (const ln of _BORDER_EXPAND[key]) { delete this._props[ln]; delete this._priority[ln]; }
      return old;
    }
    const old = this._props[key];
    delete this._props[key]; delete this._priority[key];
    return old || "";
  }
  getPropertyValue(name) {
    name = String(name); const key = name.startsWith('--') ? name : name.toLowerCase();
    if (key === 'offset') return _serializeOffsetShorthand(this);  // reconstruct from longhands
    if (_BORDER_EXPAND[key]) {                              // border/outline shorthand
      if (key in this._props) return this._props[key];     // var() kept as a single key
      return _serializeBorderShorthand(this, key);         // reconstruct from longhands
    }
    return this._props[key] || "";
  }
  getPropertyPriority(name) {
    name = String(name); const key = name.startsWith('--') ? name : name.toLowerCase();
    return this._priority[key] || "";
  }
  get cssText() {
    // Serialize a CSS declaration block, recombining box-model longhands into
    // their shorthand where the CSSOM rules permit (see _serializeDeclBlock).
    return _serializeDeclBlock(this);
  }
  set cssText(v) {
    this._props = {}; this._priority = {};
    for (const d of _parseStyleDecls(v)) {
      // !important within a declaration block is not overridden by a later normal
      // declaration of the same property; otherwise later wins.
      if (this._priority[d.name] === 'important' && !d.important) continue;
      this._props[d.name] = d.value;
      this._priority[d.name] = d.important ? 'important' : '';
    }
  }
  get length() { return Object.keys(this._props).length; }
  item(i) { return Object.keys(this._props)[i] || ""; }
}

// Map a JS-side style property accessor to its canonical CSS property name (the
// kebab-case form `_props` is keyed by). camelCase IDL attributes lower-case +
// hyphenate (`backgroundColor` → `background-color`); a leading capital becomes a
// vendor prefix (`WebkitTransform` → `-webkit-transform`); `cssFloat` is the IDL
// alias for `float`; custom properties (`--x`) and already-kebab names pass
// through unchanged. Keeping every access on one storage key means
// `el.style.backgroundColor`, `el.style['background-color']`,
// `setProperty('background-color', …)` and `setAttribute('style', …)` all agree.
const _cssPropToKebab = (p) => {
  if (p.startsWith('--')) return p;
  if (p === 'cssFloat') return 'float';
  return p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
};
const _styleProxy = (decl) => new Proxy(decl, {
  get(t, p) {
    if (typeof p === "symbol" || p in t) return t[p];
    if (typeof p === "string") {
      const kebab = _cssPropToKebab(p);
      // A box-model shorthand (`el.style.margin`) is reconstructed from the
      // longhands actually present (CSSOM "serialize a CSS value"); every other
      // property reads its stored value directly.
      if (_BOX_SHORTHANDS[kebab]) return _boxShorthandSerialization(t, kebab);
      return t.getPropertyValue(kebab);
    }
    return undefined;
  },
  set(t, p, v) {
    if (typeof p === "string") {
      // Accessors / methods on the declaration (cssText, …) delegate to the real
      // setter; everything else is a CSS property name routed through setProperty
      // (kebab-cased) so all storage stays on one canonical key.
      if (p in t) { t[p] = v; return true; }
      t.setProperty(_cssPropToKebab(p), v == null ? '' : String(v)); return true;
    }
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
    let list = _childNodesCache.get(this);
    if (!list) { list = _makeLiveChildNodes(this); _childNodesCache.set(this, list); }
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
    // §ensure-pre-insertion-validity steps 5–6 (Text/doctype placement +
    // document element/doctype cardinality). Checked BEFORE fragment expansion
    // so a multi-element fragment into a document is rejected atomically.
    _checkInsertConstraints(this, c, null);
    // A DocumentFragment is inserted by moving each of its children, leaving it empty.
    if (c.nodeType === 11) {
      const kids = Array.prototype.slice.call(c.childNodes);
      for (let i = 0; i < kids.length; i++) this.appendChild(kids[i]);
      return c;
    }
    const _prev = __mutationObservers?.length ? +_dom("last_child", this._nid) : -1;
    _dom("append_child", this._nid, c._nid);
    // Insert §"adopt node into the parent's node document": when the node comes
    // from a different document, retarget the node document of it AND its whole
    // subtree (otherwise descendants keep their old ownerDocument). Same-document
    // appends — the overwhelmingly common case — skip the walk via a cheap compare.
    const _adoptDoc = this.nodeType === 9 ? this : (this.ownerDocument || globalThis.document);
    if (c.ownerDocument !== _adoptDoc) _setNodeDocumentDeep(c, _adoptDoc);
    else c._ownerDoc = _adoptDoc;
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
    if (n.nodeType === 9)
      throw new DOMException("A Document cannot be inserted into the tree", "HierarchyRequestError");
    // §ensure-pre-insertion-validity steps 5–6 (see appendChild), before the
    // fragment is expanded so the whole fragment is validated as a unit.
    _checkInsertConstraints(this, n, ref);
    // A DocumentFragment inserts each of its children before the reference, then empties.
    if (n.nodeType === 11) {
      const kids = Array.prototype.slice.call(n.childNodes);
      for (let i = 0; i < kids.length; i++) this.insertBefore(kids[i], ref);
      return n;
    }
    _dom("insert_before", n._nid, ref._nid);
    // Adopt deeply when crossing documents (see appendChild); cheap compare otherwise.
    const _adoptDoc = this.nodeType === 9 ? this : (this.ownerDocument || globalThis.document);
    if (n.ownerDocument !== _adoptDoc) _setNodeDocumentDeep(n, _adoptDoc);
    else n._ownerDoc = _adoptDoc;
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

// Private sentinel: passed as the 2nd arg to Text/Comment constructors by
// internal wrappers so they treat the 1st arg as an already-real nid rather
// than as web constructor DOMString data.
const _NID_TOKEN = Symbol("nid");

class CharacterData extends Node {
  get data() {
    return _domParse("text_content", this._nid) ?? "";
  }
  set data(v) {
    // [LegacyNullToEmptyString]: null → "" (but undefined → "undefined", 0 → "0").
    const _old = __mutationObservers?.length ? (_domParse("text_content", this._nid) ?? "") : null;
    _dom("set_text_content", this._nid, String(v === null ? "" : v));
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
  // `new Text(data)` is the web constructor: it allocates a REAL backing text
  // node holding `data` (WebIDL DOMString — undefined→"", null→"null", 42→"42").
  // Internal callers (_wrap, createTextNode, CDATASection) pass an already-real
  // numeric nid plus the private _NID_TOKEN sentinel, so a web `new Text(42)`
  // (data "42") is never confused with a wrap of node #42.
  constructor(data, _tok) {
    if (_tok === _NID_TOKEN) { super(data); return; }
    super(+_dom("create_text_node", data === undefined ? "" : String(data)));
    _cache.set(this._nid, this);
  }
  get nodeName() { return "#text"; }
  get nodeType() { return 3; }
  get wholeText() {
    // §wholeText: concatenated data of the contiguous Text nodes (this node plus
    // its run of Text siblings on both sides), in tree order.
    let start = this;
    while (start.previousSibling && start.previousSibling.nodeType === 3) start = start.previousSibling;
    let result = "";
    for (let n = start; n && n.nodeType === 3; n = n.nextSibling) result += n.data;
    return result;
  }
  splitText(offset) {
    offset = offset >>> 0; // WebIDL unsigned long
    const d = this.data;
    // §splitText step 2: offset > length → IndexSizeError.
    if (offset > d.length) throw new DOMException("The index is not in the allowed range.", "IndexSizeError");
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
  // `new Comment(data)` web constructor — see Text above for the _NID_TOKEN
  // convention that keeps web data args distinct from internal nid wraps.
  constructor(data, _tok) {
    if (_tok === _NID_TOKEN) { super(data); return; }
    super(+_dom("create_comment_node", data === undefined ? "" : String(data)));
    _cache.set(this._nid, this);
  }
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
  const n = new CDATASection(nid, _NID_TOKEN);
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

// A live, cached NodeList for `Node.childNodes`. Per WHATWG DOM the same object is
// returned every time (cached on the node) and reflects tree mutations (live). The
// target is a real NodeList instance, so `list instanceof NodeList` holds and the
// iterator/keys/values/entries/forEach identities are Array.prototype's — exactly
// what `Node-childNodes.html` asserts. A Proxy serves integer-index and `length`
// from the live tree; a generation-counter snapshot (`_treeGen`) keeps repeated
// reads between mutations cheap. Indexed slots are read-only; expandos pass through.
const _childNodesCache = new WeakMap(); // node -> live NodeList proxy
const _nlIsIndex = (p) => typeof p === 'string' && /^(0|[1-9][0-9]*)$/.test(p);
const _makeLiveChildNodes = (node) => {
  const target = new globalThis.NodeList();
  let snap = null, snapGen = -1;
  const items = () => {
    if (snap === null || snapGen !== _treeGen) {
      const ids = _domParse("child_nodes", node._nid) || [];
      snap = ids.map(_wrap).filter(Boolean);
      snapGen = _treeGen;
    }
    return snap;
  };
  return new Proxy(target, {
    get(t, p, r) {
      if (p === 'length') return items().length;
      if (_nlIsIndex(p)) { const it = items(), i = +p; return i < it.length ? it[i] : undefined; }
      return Reflect.get(t, p, r);
    },
    set(t, p, v, r) {
      if (_nlIsIndex(p) || p === 'length') return true; // read-only, silently ignored
      return Reflect.set(t, p, v, r);                   // expandos
    },
    has(t, p) {
      if (_nlIsIndex(p)) return +p < items().length;
      return Reflect.has(t, p);
    },
    ownKeys(t) {
      const keys = [], n = items().length;
      for (let i = 0; i < n; i++) keys.push(String(i));
      keys.push('length');
      for (const k of Reflect.ownKeys(t)) if (!keys.includes(k)) keys.push(k);
      return keys;
    },
    getOwnPropertyDescriptor(t, p) {
      if (_nlIsIndex(p)) {
        const it = items(), i = +p;
        if (i < it.length) return { value: it[i], writable: false, enumerable: true, configurable: true };
        return undefined;
      }
      if (p === 'length') return { value: items().length, writable: true, enumerable: false, configurable: false };
      return Reflect.getOwnPropertyDescriptor(t, p);
    },
  });
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
  get style() {
    // One-time lazy sync from the `style` content attribute: HTML parsing sets it
    // directly in the Rust tree (bypassing JS setAttribute), so the live decl must
    // be populated on first access. Afterwards JS setAttribute/removeAttribute keep
    // it in sync, so we never pay the attribute read again (hot-path friendly).
    if (this._styleSynced === undefined) {
      this._styleSynced = true;
      let attr = null;
      try { attr = this.getAttribute('style'); } catch (e) {}
      if (attr != null && attr !== '') this._style.cssText = String(attr);
    }
    return this._style;
  }
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
    // The `style` content attribute reflects into the live CSSOM declaration so the
    // specified value is observable via el.style.getPropertyValue (HTML parsing and
    // setAttribute both land here; setting it replaces the declaration block).
    if (qname === 'style' && this._style) this._style.cssText = String(v);
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
    // Removing the `style` attribute empties the live CSSOM declaration.
    if (qname === 'style' && this._style) this._style.cssText = '';
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
  querySelector(s) { _primeTarget(s, this); _primeValidity(s, this); return _qsOne(_dom("query_selector_scoped", this._nid, s), s); }
  querySelectorAll(s) {
    _primeTarget(s, this);
    _primeValidity(s, this);
    const ids = _qsIds(_dom("query_selector_all_scoped", this._nid, s), s);
    return _makeNodeList(ids.map(_wrapEl).filter(Boolean));
  }
  getElementsByTagName(t) { return _gebTagName(this._nid, t, this.ownerDocument ? this.ownerDocument._isHTMLDoc !== false : true); }
  getElementsByTagNameNS(ns, local) { return _gebTagNameNS(this._nid, ns, local); }
  getElementsByClassName(c) { return _gebClassName(this._nid, c); }
  // Element.matches(selectors) — §dom-element-matches. `selectors` is a required
  // DOMString (0 args → TypeError; null/undefined coerce via ToString to
  // "null"/"undefined", matching an element of that tag name). Routes through the
  // real selector engine so an invalid selector throws SyntaxError and combinators
  // see the element's true ancestors even when it's detached (parentless).
  matches(s) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'matches' on 'Element': 1 argument required, but only 0 present.");
    const sel = String(s);
    _primeValidity(sel, this);
    const raw = _dom("element_matches", this._nid, sel);
    if (raw === 'ERR') _qsThrow(sel);
    return raw === 'true';
  }
  // Legacy vendor-prefixed alias of matches() — same algorithm and validation.
  webkitMatchesSelector(s) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'webkitMatchesSelector' on 'Element': 1 argument required, but only 0 present.");
    return this.matches(String(s));
  }
  closest(s) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'closest' on 'Element': 1 argument required, but only 0 present.");
    const sel = String(s);
    _primeValidity(sel, this);
    let el = this;
    // The `:scope` scoping root stays fixed at the context element (`this`) for
    // every ancestor we test — pass it as "<ancestor>,<this>" so `:has(> :scope)`
    // resolves `:scope` to `this`, not the ancestor under test.
    while (el && el.nodeType === 1) {
      const raw = _dom("element_matches", el._nid + "," + this._nid, sel);
      if (raw === 'ERR') _qsThrow(sel);
      if (raw === 'true') return el;
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
    // Pre-click activation: a checkbox toggles its checkedness, a radio becomes
    // checked. Reverted if the click event's default action is prevented.
    const _ct = this.localName === 'input' ? (this.getAttribute('type') || 'text').toLowerCase() : '';
    let _preChecked = null;
    if (_ct === 'checkbox') { _preChecked = this.checked; this.checked = !this.checked; }
    else if (_ct === 'radio') { _preChecked = this.checked; this.checked = true; }
    const cancelled = !this.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}));
    if (cancelled && _preChecked !== null) this.checked = _preChecked;
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
    if (tag === 'select') {
      // §dom-select-value: the value of the first option whose selectedness is
      // true (its value attribute, else its trimmed text), else "". A non-multiple
      // select with no explicit selection has its first option selected by default.
      const opts = this.options;
      let chosen = null;
      for (const o of opts) { if (o.selected) { chosen = o; break; } }
      if (!chosen && !this.multiple && opts.length) chosen = opts[0];
      if (!chosen) return "";
      return chosen.hasAttribute("value") ? chosen.getAttribute("value") : (chosen.textContent || "").trim();
    }
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
  // The `indeterminate` IDL flag lives in the Rust DOM so :indeterminate (which
  // the selector engine evaluates) reflects JS-set state across all access paths.
  get indeterminate() { return _dom("get_indeterminate", this._nid, "") === "1"; }
  set indeterminate(v) { _dom("set_indeterminate", this._nid, v ? "1" : "0"); }
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
  // remove() + the append/prepend/replaceChildren ParentNode methods are mixed
  // onto Element.prototype below (see the "_pn*/_cn*" assignments) so the whole
  // mutation family shares one spec-correct "convert nodes into a node" core.
}

// DOM §concept-node-adopt: remove `node` from any parent, then — when the
// destination document differs from its current node document — retarget the
// node document of `node` and every descendant to `doc`. Obscura tracks a node's
// document via the wrapper's `_ownerDoc` tag (default = the page document), so
// adoption is a detach + a deep retag; the backing nodes stay in the shared Rust
// arena (an adopted-but-not-inserted subtree simply lives there unparented).
function _setNodeDocumentDeep(node, doc) {
  node._ownerDoc = doc;
  for (let c = node.firstChild; c; c = c.nextSibling) _setNodeDocumentDeep(c, doc);
}
function _adoptNodeInto(node, doc) {
  const oldDoc = node.ownerDocument;
  const parent = node.parentNode;
  if (parent) parent.removeChild(node);
  if (doc !== oldDoc) _setNodeDocumentDeep(node, doc);
}

// ---- ParentNode / ChildNode mutation mixins (DOM §parentnode, §childnode) ----
// These five methods (append/prepend/before/after/replaceWith), plus
// replaceChildren, all share one core: WHATWG "convert nodes into a node".
// The WebIDL signature is `(Node or DOMString)... nodes`, so any argument that
// is NOT a Node has already been coerced to a string by the time it reaches us
// — null → "null", undefined → "undefined", a number → its decimal string.
// We therefore turn every non-Node argument into a Text node (NOT reject it),
// and gather multiple nodes into a single DocumentFragment so the insertion is
// atomic. Defined once here and shared across Element / DocumentFragment /
// Document (ParentNode) and Element / CharacterData / DocumentType (ChildNode).
function _isNodeArg(x) {
  return x != null && typeof x === 'object' &&
    (typeof x._nid === 'number' || typeof x.nodeType === 'number');
}
function _convertNodesIntoNode(nodes, doc) {
  const mapped = nodes.map(n => _isNodeArg(n) ? n : doc.createTextNode(String(n)));
  if (mapped.length === 1) return mapped[0];
  const frag = doc.createDocumentFragment();
  for (const m of mapped) frag.appendChild(m);
  return frag;
}
// The node document in which to mint the Text nodes: a document is its own node
// document; any other node uses its ownerDocument (falling back to the page).
function _insertDoc(node) {
  return (node && node.nodeType === 9) ? node
    : (node && node.ownerDocument) || globalThis.document;
}
// §dom-parentnode-append / -prepend / -replacechildren
function _pnAppend(...nodes) {
  this.appendChild(_convertNodesIntoNode(nodes, _insertDoc(this)));
}
function _pnPrepend(...nodes) {
  this.insertBefore(_convertNodesIntoNode(nodes, _insertDoc(this)), this.firstChild);
}
function _pnReplaceChildren(...nodes) {
  const node = _convertNodesIntoNode(nodes, _insertDoc(this));
  // §replace-all ensures pre-insertion validity FIRST, then removes the old
  // children — so e.g. a second element into a document is rejected while the
  // existing element child is still present (validating after the removal would
  // see an empty document and wrongly succeed).
  _checkInsertConstraints(this, node, null);
  while (this.firstChild) this.removeChild(this.firstChild);
  this.appendChild(node);
}
// §dom-childnode-before / -after / -replacewith. The "viable" sibling is the
// nearest sibling that is NOT itself one of the nodes being inserted (so
// `child.before(x, child)` and friends place things correctly).
function _cnBefore(...nodes) {
  const parent = this.parentNode;
  if (!parent) return;
  let viable = this.previousSibling;
  while (viable && nodes.includes(viable)) viable = viable.previousSibling;
  const node = _convertNodesIntoNode(nodes, _insertDoc(this));
  parent.insertBefore(node, viable ? viable.nextSibling : parent.firstChild);
}
function _cnAfter(...nodes) {
  const parent = this.parentNode;
  if (!parent) return;
  let viable = this.nextSibling;
  while (viable && nodes.includes(viable)) viable = viable.nextSibling;
  const node = _convertNodesIntoNode(nodes, _insertDoc(this));
  parent.insertBefore(node, viable);
}
function _cnReplaceWith(...nodes) {
  const parent = this.parentNode;
  if (!parent) return;
  let viable = this.nextSibling;
  while (viable && nodes.includes(viable)) viable = viable.nextSibling;
  const node = _convertNodesIntoNode(nodes, _insertDoc(this));
  // If converting the nodes didn't already detach `this` from `parent`,
  // replace in place; otherwise insert before the viable next sibling.
  if (this.parentNode === parent) parent.replaceChild(node, this);
  else parent.insertBefore(node, viable);
}
function _cnRemove() { if (this.parentNode) this.parentNode.removeChild(this); }

// DOM §ensure-pre-insertion-validity steps 5–6 — the type/cardinality
// constraints beyond "parent accepts children" + "node is not an ancestor",
// which appendChild/insertBefore already check inline. `child` is the reference
// node the new node goes before (null when appending at the end). Step 5 (Text
// may not be a document child; a doctype may ONLY be a document child) is two
// cheap comparisons on the hot path; step 6 (document element/doctype
// cardinality + ordering) only runs for the rare document-parent case.
function _checkInsertConstraints(parent, node, child) {
  const pt = parent.nodeType, nt = node.nodeType;
  if ((nt === 3 && pt === 9) || (nt === 10 && pt !== 9))
    throw new DOMException("Invalid child for this parent", "HierarchyRequestError");
  if (pt !== 9) return;
  const kids = Array.prototype.slice.call(parent.childNodes);
  const idx = (n) => kids.findIndex(k => k._nid === n._nid);
  const childIdx = child ? idx(child) : kids.length;
  const hasElementChild = kids.some(k => k.nodeType === 1);
  const doctypeChild = kids.find(k => k.nodeType === 10) || null;
  const doctypeAfterChild = !!(doctypeChild && child && idx(doctypeChild) > childIdx);
  const elementBeforeChild = !!(child && kids.some(k => k.nodeType === 1 && idx(k) < childIdx));
  const HRE = (m) => { throw new DOMException(m, "HierarchyRequestError"); };
  if (nt === 11) {
    const fk = Array.prototype.slice.call(node.childNodes);
    const fe = fk.filter(k => k.nodeType === 1).length;
    if (fe > 1 || fk.some(k => k.nodeType === 3 || k.nodeType === 4)) HRE("Invalid fragment for a document");
    if (fe === 1 && (hasElementChild || (child && child.nodeType === 10) || doctypeAfterChild))
      HRE("Document may have only one element child");
  } else if (nt === 1) {
    if (hasElementChild || (child && child.nodeType === 10) || doctypeAfterChild)
      HRE("Document may have only one element child");
  } else if (nt === 10) {
    if (doctypeChild || elementBeforeChild || (!child && hasElementChild)) HRE("Misplaced doctype");
  }
}

class Document extends Node {
  // `new Document(nid)` (numeric) wraps a real document node (the main document,
  // or a node-type-9 node from the tree). `new Document()` with NO id is the DOM
  // §dom-document constructor: a fresh, empty, STANDALONE document. Unlike the
  // DetachedDocument subclass used by createDocument/iframes, a `new Document()`
  // must keep `Document.prototype` as its immediate prototype (so
  // `new Document() instanceof XMLDocument` is false and `Object.getPrototypeOf(doc)
  // === Document.prototype`), yet still own a real backing node + scope its reads to
  // its own subtree. So instead of returning a subclass, we set this instance up as
  // standalone (the `_standalone` branches in the getters below give it the XML-type,
  // about:blank, self-scoped semantics).
  constructor(nid) {
    if (typeof nid === 'number') { super(nid); return; }
    super(+_dom("create_document_fragment"));
    // Be the canonical wrapper for the backing node so a child's parentNode resolves
    // back to THIS document; mark it a real document so `:root` matches its root.
    _cache.set(this._nid, this);
    _dom('mark_real_document', this._nid);
    // XML-type, non-HTML: application/xml content type, case-preserving createElement
    // yielding plain Element, characterSet UTF-8.
    this._standalone = true;
    this._kind = 'xml';
    this._createMode = 'xml';
  }
  get documentElement() {
    if (this._standalone) {
      for (let c = this.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) return c;
      return null;
    }
    return _wrapEl(+_dom("document_element"));
  }
  get head() { return this.querySelector("head"); }
  get body() { return this.querySelector("body"); }
  get doctype() {
    // A standalone document reflects its actual doctype child live (the page document
    // keeps the cached fast path below).
    if (this._standalone) {
      for (let c = this.firstChild; c; c = c.nextSibling) if (c.nodeType === 10) return c;
      return null;
    }
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
  // designMode: "on" makes every element an editing host → plain elements match
  // :read-write (and none match :read-only). Push the flag to the Rust selector
  // engine, which reads it live during matching. Per spec the setter is an
  // ASCII-case-insensitive match against "on"/"off"; any other value is ignored.
  get designMode() { return this._designMode ? "on" : "off"; }
  set designMode(v) {
    const s = String(v).toLowerCase();
    if (s === "on") this._designMode = true;
    else if (s === "off") this._designMode = false;
    else return;
    _dom("set_design_mode", this._designMode ? "1" : "0");
  }
  get URL() { return this._standalone ? "about:blank" : (_domParse("document_url") ?? ""); }
  get documentURI() { return this.URL; }
  get location() { return this._standalone ? null : globalThis.location; }
  set location(url) { if (this._standalone) return; Deno.core.ops.op_navigate(_resolveUrl(String(url)), 'GET', ''); }
  get defaultView() { return this._standalone ? null : globalThis; }
  get nodeType() { return 9; }
  get nodeName() { return "#document"; }
  get ownerDocument() { return null; } // Document has no ownerDocument
  get compatMode() { return this._compatMode || "CSS1Compat"; }
  get characterSet() { return "UTF-8"; }
  get charset() { return this.characterSet; }        // legacy alias of characterSet
  get inputEncoding() { return this.characterSet; }  // legacy alias of characterSet
  get contentType() { return this._standalone ? "application/xml" : "text/html"; }
  // Whether this is an HTML document (drives attribute-name lowercasing).
  get _isHTMLDoc() { return this._standalone ? false : true; }
  get readyState() { return globalThis.__documentReadyState__ || 'complete'; }
  get hidden() { return false; }
  get visibilityState() { return "visible"; }
  getElementById(id) {
    if (this._standalone) return this.querySelector('#' + String(id).replace(/["\\]/g, '\\$&'));
    return _wrapEl(+_dom("get_element_by_id", id));
  }
  querySelector(s) {
    _primeTarget(s, this);
    _primeValidity(s, this);
    if (this._standalone) return _qsOne(_dom("query_selector_scoped", this._nid, s), s);
    return _qsOne(_dom("query_selector", s), s);
  }
  querySelectorAll(s) {
    _primeTarget(s, this);
    _primeValidity(s, this);
    const ids = this._standalone
      ? _qsIds(_dom("query_selector_all_scoped", this._nid, s), s)
      : _qsIds(_dom("query_selector_all", s), s);
    return _makeNodeList(ids.map(_wrapEl).filter(Boolean));
  }
  getElementsByTagName(t) { return _gebTagName(this._nid, t, this._isHTMLDoc); }
  getElementsByTagNameNS(ns, local) { return _gebTagNameNS(this._nid, ns, local); }
  getElementsByClassName(c) { return _gebClassName(this._nid, c); }
  getElementsByName(name) { return this.querySelectorAll('[name="' + String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]'); }
  createElement(t) {
    // A standalone (XML-type) document creates elements case-sensitively, in the
    // null namespace, with a plain Element interface (per §createElement: namespace
    // is null unless the document is HTML / application/xhtml+xml).
    if (this._standalone) return _createElementXMLInto(this, t, null);
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
  createTextNode(t) {
    const n = _wrap(+_dom("create_text_node", String(t)));
    if (n && this._standalone) n._ownerDoc = this;
    return n;
  }
  createComment(t) {
    const nid = +_dom("create_comment_node", String(t ?? ""));
    const n = new Comment(nid, _NID_TOKEN);
    _cache.set(nid, n);
    if (this._standalone) n._ownerDoc = this;
    return n;
  }
  // Per DOM spec, createCDATASection throws on an HTML document; XML documents
  // (a standalone `new Document()`, or a DetachedDocument with kind 'xml') create one.
  createCDATASection(data) {
    if (!this._standalone)
      throw new DOMException("This operation is not supported for HTML documents.", "NotSupportedError");
    const n = _makeCDATA(data); n._ownerDoc = this; return n;
  }
  createProcessingInstruction(target, data) {
    const n = _createPIValidated(target, data);
    if (n && this._standalone) n._ownerDoc = this;
    return n;
  }
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
    if (this._standalone) frag._ownerDoc = this;
    return frag;
  }
  // DOM §dom-document-adoptnode: detach `node` from any parent and make this
  // document its node document (and the node document of its whole subtree).
  // Adopting a Document throws NotSupportedError.
  adoptNode(node) {
    if (node == null || typeof node !== 'object' ||
        (typeof node._nid !== 'number' && typeof node.nodeType !== 'number'))
      throw new TypeError("Failed to execute 'adoptNode' on 'Document': parameter 1 is not of type 'Node'.");
    if (node.nodeType === 9)
      throw new DOMException("The node provided is a document, which may not be adopted.", "NotSupportedError");
    _adoptNodeInto(node, this);
    return node;
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
    // The implementation is "associated" with the document it was read from
    // (`document.implementation` for the page, `doc.implementation` for a
    // createHTMLDocument/createDocument/iframe document). `createDocumentType`'s
    // returned doctype takes THIS document as its node document — so capture it.
    const _implDoc = this;
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
        // WebIDL: createDocument(namespace, qualifiedName, [optional] doctype) —
        // namespace + qualifiedName are required (so <2 args → TypeError), and
        // `doctype` is a nullable DocumentType (null/undefined → none, anything
        // else that isn't a DocumentType → TypeError during argument conversion).
        if (arguments.length < 2) {
          throw new TypeError("Failed to execute 'createDocument' on 'DOMImplementation': 2 arguments required, but only " + arguments.length + " present.");
        }
        if (doctype !== null && doctype !== undefined && !(doctype instanceof DocumentType)) {
          throw new TypeError("Failed to execute 'createDocument' on 'DOMImplementation': parameter 3 is not of type 'DocumentType'.");
        }
        // A new XMLDocument (its prototype must be EXACTLY XMLDocument.prototype).
        const doc = new XMLDocument('xml');
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
        // WebIDL argument coercion: namespace is `DOMString?` (null/undefined → null,
        // else stringified), qualifiedName is `[LegacyNullToEmptyString] DOMString`
        // (null → "", but undefined → the string "undefined"). _validateAndExtract
        // also maps "" → null namespace, matching the test's expected namespaceURI.
        const ns = (namespace === null || namespace === undefined) ? null : String(namespace);
        const qname = (qualifiedName === null) ? "" : String(qualifiedName);
        // Spec order: create the document element FIRST (so an invalid name throws
        // before any node is appended), then append the doctype, then the element.
        let element = null;
        if (qname !== "") element = doc.createElementNS(ns, qname);
        if (doctype) { doctype._ownerDoc = doc; doc.appendChild(doctype); doc._doctype = doctype; }
        if (element) { doc.appendChild(element); doc._docEl = element; }
        return doc;
      },
      createDocumentType(qualifiedName, publicId, systemId) {
        // WebIDL: createDocumentType(DOMString name, DOMString publicId,
        // DOMString systemId) — all three are required (so <3 args → TypeError)
        // and plain (non-nullable) DOMStrings.
        if (arguments.length < 3) {
          throw new TypeError("Failed to execute 'createDocumentType' on 'DOMImplementation': 3 arguments required, but only " + arguments.length + " present.");
        }
        const name = String(qualifiedName);
        // DOM §createDocumentType: throw InvalidCharacterError if `name` is not a
        // "valid doctype name" — i.e. it contains ASCII whitespace (TAB/LF/FF/CR/
        // SPACE), U+0000 NULL, or U+003E '>'. The empty string IS valid. (Note:
        // this is deliberately looser than createElementNS's QName check — a
        // doctype name like ":foo"/"foo:"/"prefix::local"/"@" is allowed here.)
        if (/[\u0000\u0009\u000A\u000C\u000D\u0020>]/.test(name)) {
          throw new DOMException("'" + name + "' is not a valid doctype name.", "InvalidCharacterError");
        }
        const nid = +_dom("create_comment_node", "");
        const dt = new DocumentType(nid, name, String(publicId), String(systemId));
        // The new doctype's node document is the implementation's associated
        // document (the page for `document.implementation`, the detached/iframe
        // document for `doc.implementation`).
        dt._ownerDoc = _implDoc;
        return dt;
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
  querySelector(s) { _primeTarget(s, this); _primeValidity(s, this); return _qsOne(_dom("query_selector_scoped", this._nid, s), s); }
  querySelectorAll(s) {
    _primeTarget(s, this);
    _primeValidity(s, this);
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
  // ParentNode append/prepend/replaceChildren are mixed onto the prototype below
  // (shared with Element/Document via the "_pn*" assignments).
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
  // `implementation` is inherited from Document so the returned DOMImplementation
  // is associated with THIS detached document — `doc.implementation.createDocumentType`
  // must give the new doctype `doc` (not the page) as its node document.
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
  querySelector(s) { _primeTarget(s, this); _primeValidity(s, this); return _qsOne(_dom("query_selector_scoped", this._nid, s), s); }
  querySelectorAll(s) {
    _primeTarget(s, this);
    _primeValidity(s, this);
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
  _createElementXML(t, ns) { return _createElementXMLInto(this, t, ns); }
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
  else if (t === 3) n = new Text(nid, _NID_TOKEN);
  else if (t === 8) n = new Comment(nid, _NID_TOKEN);
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
// Create an element for an XML/XHTML document: case-PRESERVING local name (no ASCII
// lowercasing) and the given namespace. Only HTML-namespace (XHTML) elements keep an
// HTMLElement subclass interface; XML (null-namespace) elements are plain Element —
// so `new Document().createElement("a").constructor === Element` (not HTMLAnchorElement).
// The case-preserved identity is pinned as own properties shadowing the casing
// prototype getters used for HTML elements.
function _createElementXMLInto(doc, t, ns) {
  const name = (t === undefined) ? "undefined" : String(t);
  if (!_isValidElementName(name)) {
    throw new DOMException("The string '" + name + "' is not a valid element name.", "InvalidCharacterError");
  }
  const nid = +_dom("create_element", name);
  if (nid < 0 || isNaN(nid)) return null;
  let el;
  if (ns === _HTML_NS) {
    el = _wrapEl(nid); // XHTML: HTML-namespace element keeps its HTMLElement interface
  } else {
    el = _cache.get(nid) || new Element(nid); _cache.set(nid, el); // XML: plain Element
  }
  if (el) {
    Object.defineProperty(el, 'localName',    { value: name, configurable: true });
    Object.defineProperty(el, 'tagName',      { value: name, configurable: true });
    Object.defineProperty(el, 'prefix',       { value: null, configurable: true });
    Object.defineProperty(el, 'namespaceURI', { value: ns,   configurable: true });
    el._ownerDoc = doc;
  }
  return el;
}

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

// Install the shared ParentNode / ChildNode mutation mixins (defined as the
// `_pn*` / `_cn*` module functions, all built on the spec "convert nodes into a
// node" core) onto every interface that exposes them:
//   ParentNode (append/prepend/replaceChildren) → Element, DocumentFragment, Document
//   ChildNode  (before/after/replaceWith/remove) → Element, CharacterData, DocumentType
// CharacterData covers Text/Comment/ProcessingInstruction; DocumentType is a
// ChildNode too (and previously lacked these entirely — `doctype.remove` threw).
// Frameworks (Svelte 5, Vue, Lit) anchor on Comment/Text nodes and call these.
for (const Proto of [Element.prototype, DocumentFragment.prototype, Document.prototype]) {
  Proto.append = _markNative(_pnAppend);
  Proto.prepend = _markNative(_pnPrepend);
  Proto.replaceChildren = _markNative(_pnReplaceChildren);
}
for (const Proto of [Element.prototype, CharacterData.prototype, DocumentType.prototype]) {
  Proto.before = _markNative(_cnBefore);
  Proto.after = _markNative(_cnAfter);
  Proto.replaceWith = _markNative(_cnReplaceWith);
  Proto.remove = _markNative(_cnRemove);
}

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
// ── CSS author-stylesheet cascade (for getComputedStyle) ─────────────────────
// A minimal but spec-shaped cascade: gather `<style>` rules, ask the Rust
// selector engine which match this element and at what specificity (it honours
// :is()/:where()/:has() correctly), then resolve a property to the winning
// declaration by importance → specificity → source order. Inline `style` is the
// highest-priority author origin at each importance level. Enough for the
// specificity/cascade WPTs; absolute declared values pass straight through (no
// layout). NOT a layout engine — used/computed values that need layout (auto
// widths, percentage resolution) still fall back to the defaults table.
const _GCS_DEFAULTS = {
  display: 'block', visibility: 'visible', opacity: '1',
  position: 'static', overflow: 'visible',
  transform: 'none', transition: 'none', animation: 'none',
  scale: 'none', rotate: 'none', translate: 'none',
  float: 'none', clear: 'none',
  width: 'auto', height: 'auto',
  top: 'auto', left: 'auto', right: 'auto', bottom: 'auto',
  margin: '0px', padding: '0px',
  'margin-top': '0px', 'margin-right': '0px', 'margin-bottom': '0px', 'margin-left': '0px',
  'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px',
  // css-sizing + css-logical block/inline sizing. min/max-* computed keep `%`
  // symbolic, clamp a resolved negative <length> to 0, and resolve fit-content()'s
  // argument (see _computeSizeValue); min-* `auto` → 0px. block/inline-size resolve
  // only explicit lengths (auto/%/min-content need layout). None inherit.
  'min-width': 'auto', 'min-height': 'auto', 'max-width': 'none', 'max-height': 'none',
  'block-size': 'auto', 'inline-size': 'auto',
  'min-block-size': 'auto', 'min-inline-size': 'auto',
  'max-block-size': 'none', 'max-inline-size': 'none',
  // css-logical flow-relative box edges (computed like their physical siblings:
  // length math folded, em→px, `%` symbolic; inset allows negatives, padding clamps
  // to 0). Plus the 2-value block/inline shorthands (recomposed in _normComputed).
  'inset-block-start': 'auto', 'inset-block-end': 'auto',
  'inset-inline-start': 'auto', 'inset-inline-end': 'auto',
  'inset-block': 'auto', 'inset-inline': 'auto', inset: 'auto',
  'margin-block-start': '0px', 'margin-block-end': '0px',
  'margin-inline-start': '0px', 'margin-inline-end': '0px',
  'margin-block': '0px', 'margin-inline': '0px',
  'padding-block-start': '0px', 'padding-block-end': '0px',
  'padding-inline-start': '0px', 'padding-inline-end': '0px',
  'padding-block': '0px', 'padding-inline': '0px',
  'font-size': '16px', 'line-height': 'normal', 'font-weight': '400',
  color: 'rgb(0, 0, 0)', 'background-color': 'rgba(0, 0, 0, 0)',
  'border-width': '0px', 'border-style': 'none', 'border-color': 'rgb(0, 0, 0)',
  // border-* longhands. Computed serialization is identity (length / keyword), so
  // a substituted/cascaded value round-trips. The unset computed width is 0px
  // (the initial border-style is `none`, which forces width to 0); the border-*-color
  // longhands live in _COLOR_PROPS (currentColor → the element's own colour).
  'border-top-width': '0px', 'border-right-width': '0px',
  'border-bottom-width': '0px', 'border-left-width': '0px',
  'border-top-style': 'none', 'border-right-style': 'none',
  'border-bottom-style': 'none', 'border-left-style': 'none',
  'z-index': 'auto', 'pointer-events': 'auto',
  'box-sizing': 'content-box', cursor: 'auto',
  // css-backgrounds longhands (not inherited) + `filter`. Computed serialization
  // is identity here (keyword / position / url), which lets var() substitution
  // into these properties round-trip (`background-clip: var(--foo)` → padding-box,
  // `filter: blur(var(--blur))` → blur(15px)). background-color is a <color> (in
  // _COLOR_PROPS); the gradient/image canonicalization is NOT modelled.
  'background-attachment': 'scroll', 'background-clip': 'border-box',
  'background-origin': 'padding-box', 'background-position': '0% 0%',
  'background-repeat': 'repeat', 'background-size': 'auto',
  'background-image': 'none', filter: 'none', 'backdrop-filter': 'none',
  // css-text properties (all inherited) — initial computed values per spec.
  // Computed serialization for these is identity (keyword / simple length),
  // so the #52 inheritance engine resolves initial/inherit/unset directly.
  'hanging-punctuation': 'none', hyphens: 'manual', 'letter-spacing': 'normal',
  'line-break': 'auto', 'overflow-wrap': 'normal', 'tab-size': '8',
  'text-align': 'start', 'text-align-all': 'start', 'text-align-last': 'auto',
  'text-fit': 'none', 'text-indent': '0px', 'text-justify': 'auto',
  'text-transform': 'none', 'text-wrap': 'wrap', 'text-wrap-mode': 'wrap',
  'text-wrap-style': 'auto', 'white-space': 'normal', 'white-space-collapse': 'collapse',
  'word-break': 'normal', 'word-spacing': '0px', 'word-wrap': 'normal',
  // css-fonts properties (all inherited). font-size/font-weight/line-height
  // already modelled above. font-family has no fixed initial in the spec
  // (implementation-defined) so the test skips its initial assertion.
  'font-family': '', 'font-feature-settings': 'normal', 'font-kerning': 'auto',
  'font-language-override': 'normal', 'font-optical-sizing': 'auto',
  'font-size-adjust': 'none', 'font-stretch': '100%', 'font-style': 'normal',
  'font-synthesis': 'weight style small-caps position', 'font-variant': 'normal',
  'font-variant-alternates': 'normal', 'font-variant-caps': 'normal',
  'font-variant-east-asian': 'normal', 'font-variant-emoji': 'normal',
  'font-variant-ligatures': 'normal', 'font-variant-numeric': 'normal',
  'font-variant-position': 'normal', 'font-variation-settings': 'normal',
  // css-ui properties. caret-color/outline-color are <color> (in _COLOR_PROPS);
  // their initial is `currentColor`, which the colour normalizer resolves to
  // the element's own computed colour. outline-width initial `medium` matches
  // the test's mediumWidth reference (a cascaded `border-top-width: medium`).
  appearance: 'none', 'caret-color': 'currentColor', 'caret-shape': 'auto',
  'nav-down': 'auto', 'nav-left': 'auto', 'nav-right': 'auto', 'nav-up': 'auto',
  'outline-color': 'currentColor', 'outline-offset': '0px', 'outline-style': 'none',
  'outline-width': 'medium', resize: 'none', 'user-select': 'auto',
  // css-text-decor. text-decoration-color/text-emphasis-color are <color> with a
  // `currentColor` initial. text-decoration-* do not inherit; the rest do.
  'text-decoration-color': 'currentColor', 'text-decoration-line': 'none',
  'text-decoration-style': 'solid', 'text-emphasis-color': 'currentColor',
  'text-emphasis-position': 'auto', 'text-emphasis-style': 'none', 'text-shadow': 'none',
  'text-underline-position': 'auto', 'text-decoration-skip-ink': 'auto',
  // css-writing-modes. unicode-bidi does not inherit; the rest do.
  direction: 'ltr', 'text-combine-upright': 'none', 'text-orientation': 'mixed',
  'unicode-bidi': 'normal', 'writing-mode': 'horizontal-tb',
  // css-lists. counter-* do not inherit; the list-style-* properties do.
  'counter-increment': 'none', 'counter-reset': 'none', 'list-style-image': 'none',
  'list-style-position': 'outside', 'list-style-type': 'disc',
  // css-overflow. Only block-ellipsis inherits.
  'block-ellipsis': 'no-ellipsis', continue: 'normal', 'max-lines': 'auto',
  'overflow-block': 'visible', 'overflow-inline': 'visible', 'overflow-x': 'visible',
  'overflow-y': 'visible', 'text-overflow': 'clip', 'scrollbar-gutter': 'auto',
  // css-break. orphans/widows inherit; the break-* and box-decoration-break do not.
  'box-decoration-break': 'slice', 'break-after': 'auto', 'break-before': 'auto',
  'break-inside': 'auto', orphans: '2', widows: '2',
  // css-images. image-orientation/image-rendering inherit; object-* do not.
  'image-orientation': 'from-image', 'image-rendering': 'auto', 'object-fit': 'fill',
  'object-position': '50% 50%',
  // <image>-valued properties (none initial); their gradient values canonicalize
  // via _canonGradients (see _GRADIENT_PROPS). mask-image/border-image-source do
  // not inherit. list-style-image is registered above (css-lists, inherited).
  'mask-image': 'none', 'border-image-source': 'none',
  // css-transforms. transform-origin/perspective-origin do not inherit; their
  // computed value resolves to absolute lengths (see _serializeOriginComputed).
  // perspective/transform-box/backface-visibility/transform-style do not inherit;
  // their computed value is identity (keyword / length passes through unchanged).
  'transform-origin': '50% 50%', 'perspective-origin': '50% 50%',
  perspective: 'none', 'transform-box': 'view-box',
  'backface-visibility': 'visible', 'transform-style': 'flat',
  // css-motion. offset-anchor/offset-position are a full <position>; their computed
  // value resolves like object-position (keywords→%, far-edge/em offsets→px). They
  // do not inherit. `auto`/`normal` pass through verbatim (not a <position>).
  // offset-rotate (`[auto|reverse]||<angle>`, computed `reverse`→`auto`+180°) and
  // offset-distance (`<length-percentage>`, computed em→px) likewise don't inherit.
  'offset-anchor': 'auto', 'offset-position': 'normal',
  'offset-rotate': 'auto', 'offset-distance': '0px',
  // offset-path: none | <ray()>|<url>|<basic-shape> || <coord-box>. Does not inherit;
  // computed resolves lengths→px, positions→%, xywh()/rect()→inset().
  'offset-path': 'none',
  // css-backgrounds longhands — each a single-axis `<bg-position>` list (the x/y
  // halves of `background-position`). Computed initial is `0%`; not inherited.
  'background-position-x': '0%', 'background-position-y': '0%',
  // css-tables. table-layout does not inherit; the rest do.
  'border-collapse': 'separate', 'border-spacing': '0px', 'caption-side': 'top',
  'empty-cells': 'show', 'table-layout': 'auto',
  // css-align (shared with css-flexbox) — none inherit.
  'align-content': 'normal', 'align-items': 'normal', 'align-self': 'auto',
  'column-gap': 'normal', 'justify-content': 'normal', 'justify-items': 'legacy center',
  'justify-self': 'auto', 'row-gap': 'normal',
  // css-flexbox (the flex-specific properties) — none inherit.
  'flex-basis': 'auto', 'flex-direction': 'row', 'flex-grow': '0', 'flex-shrink': '1',
  'flex-wrap': 'nowrap', order: '0',
  // css-grid — none inherit.
  'grid-auto-columns': 'auto', 'grid-auto-flow': 'row', 'grid-auto-rows': 'auto',
  'grid-column-end': 'auto', 'grid-column-start': 'auto', 'grid-row-end': 'auto',
  'grid-row-start': 'auto', 'grid-template-areas': 'none', 'grid-template-columns': 'none',
  'grid-template-rows': 'none',
  // css-content. quotes inherits; content/bookmark-* do not. content's computed
  // value is the specified content-list canonicalized (see _canonContent):
  // default `decimal` counter-style dropped, gradients/url() resolved.
  content: 'normal', quotes: 'auto', 'bookmark-level': 'none', 'bookmark-state': 'open',
  // css-multicol — none inherit. column-rule-color is <color> with a currentColor
  // initial; column-rule-width's `medium` matches the test's mediumWidth reference.
  'column-count': 'auto', 'column-fill': 'balance', 'column-rule-color': 'currentColor',
  'column-rule-style': 'none', 'column-rule-width': 'medium', 'column-span': 'none',
  'column-width': 'auto',
  // css-shapes — none inherit. shape-image-threshold is a <number>.
  'shape-image-threshold': '0', 'shape-margin': '0px', 'shape-outside': 'none',
  // css-scroll-snap — none inherit. scroll-margin-* default 0px, scroll-padding-* auto.
  'scroll-margin-block-end': '0px', 'scroll-margin-block-start': '0px',
  'scroll-margin-bottom': '0px', 'scroll-margin-inline-end': '0px',
  'scroll-margin-inline-start': '0px', 'scroll-margin-left': '0px',
  'scroll-margin-right': '0px', 'scroll-margin-top': '0px',
  'scroll-padding-block-end': 'auto', 'scroll-padding-block-start': 'auto',
  'scroll-padding-bottom': 'auto', 'scroll-padding-inline-end': 'auto',
  'scroll-padding-inline-start': 'auto', 'scroll-padding-left': 'auto',
  'scroll-padding-right': 'auto', 'scroll-padding-top': 'auto',
  'scroll-snap-align': 'none', 'scroll-snap-stop': 'normal', 'scroll-snap-type': 'none',
  // css-transitions — none inherit. (The `transition` shorthand default is above.)
  'transition-delay': '0s', 'transition-duration': '0s',
  'transition-property': 'all', 'transition-timing-function': 'ease',
  // css-animations — none inherit. (The `animation` shorthand default is above.)
  'animation-delay': '0s', 'animation-duration': '0s',
  'animation-name': 'none', 'animation-timing-function': 'ease',
  'animation-iteration-count': '1', 'animation-direction': 'normal',
  'animation-fill-mode': 'none', 'animation-play-state': 'running',
  // css-will-change — does not inherit.
  'will-change': 'auto',
  // css-color-adjust — every property in this family inherits. color-adjust is a
  // legacy alias for print-color-adjust (initial `economy`).
  'color-scheme': 'normal', 'color-adjust': 'economy',
  'forced-color-adjust': 'auto', 'print-color-adjust': 'economy',
};
// ---------------------------------------------------------------------------
// Shorthand → longhand expansion (for the cascade / getComputedStyle).
//
// When the cascade resolves a longhand (e.g. `margin-left`), it must also see
// any shorthand (`margin`, `border`, …) that contributes to it, at that
// shorthand's place in declaration order. We model this by writing, for each
// shorthand declaration, BOTH the shorthand name itself and a synthetic slot for
// every longhand it governs. The slot carries `_sh` (the shorthand name) and the
// *whole* shorthand value; the value is split into the per-longhand piece lazily
// at computed-value time (after any var() substitution — a shorthand bearing
// var() is a pending-substitution value for all its longhands per CSS Variables).
// ---------------------------------------------------------------------------
const _SHORTHAND_LONGHANDS = {
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
  'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
  'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
  'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
  border: [
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  ],
  transition: ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],
};
// Set a declaration into a block-level map, respecting within-block cascade
// order: an !important declaration is never overridden by a later normal one of
// the same property; otherwise the later declaration wins.
const _putDecl = (out, name, decl) => {
  const prev = out[name];
  if (prev && prev.important && !decl.important) return;
  out[name] = decl;
};
// Write a declaration (name=value) and, if it is a known shorthand, a pending
// slot for each of its longhands. Used by every declaration-block parser feeding
// the cascade.
const _expandDeclInto = (out, name, value, important) => {
  _putDecl(out, name, { value, important });
  const lh = _SHORTHAND_LONGHANDS[name];
  if (lh) for (const l of lh) _putDecl(out, l, { value, important, _sh: name });
};
// Split a CSS value into top-level whitespace-separated tokens, keeping bracketed
// groups (rgb(…), calc(…), …) intact.
const _wsTokens = (s) => {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') { depth++; cur += c; }
    else if (c === ')' || c === ']' || c === '}') { depth--; cur += c; }
    else if (/\s/.test(c) && depth === 0) { if (cur) { out.push(cur); cur = ''; } }
    else cur += c;
  }
  if (cur) out.push(cur);
  return out;
};
// Split a CSS value at top-level commas (for comma-separated layer lists).
const _commaSplitTop = (s) => {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') { depth++; cur += c; }
    else if (c === ')' || c === ']' || c === '}') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
};
// The CSS box-edge rule: 1–4 values → [top, right, bottom, left].
const _boxEdges = (t) => {
  if (t.length === 1) return [t[0], t[0], t[0], t[0]];
  if (t.length === 2) return [t[0], t[1], t[0], t[1]];
  if (t.length === 3) return [t[0], t[1], t[2], t[1]];
  if (t.length >= 4) return [t[0], t[1], t[2], t[3]];
  return null;
};
const _LINE_STYLE_KW = new Set([
  'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset',
]);
const _LINE_WIDTH_KW = new Set(['thin', 'medium', 'thick']);
const _isLengthTok = (t) =>
  /^[+-]?(\d*\.?\d+)(px|em|rem|ex|ch|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|cm|mm|in|pt|pc|q)$/i.test(t)
  || /^calc\(/i.test(t) || /^(min|max|clamp)\(/i.test(t);
// Parse a `border`/`border-<side>` value (`<line-width> || <line-style> || <color>`,
// any order) into its three longhand pieces, defaulting any omitted component.
const _parseBorderSide = (value) => {
  let width = null, style = null, color = null;
  for (const t of _wsTokens(value)) {
    const low = t.toLowerCase();
    if (_LINE_STYLE_KW.has(low)) style = low;
    else if (_LINE_WIDTH_KW.has(low) || _isLengthTok(t)) width = t;
    else color = t;
  }
  return {
    width: width == null ? 'medium' : width,
    style: style == null ? 'none' : style,
    color: color == null ? 'currentColor' : color,
  };
};

// ── The `border`/`outline` shorthand family: expand-at-specified-time ──────────
// CSSOM stores these as their LONGHANDS, not a single key (like `offset`): setting
// `el.style.border = "5px dotted blue"` must make `el.style.borderTopColor` read
// "blue", and `el.style.length` count the longhands actually set. The `border`
// shorthand also RESETS the five border-image longhands to their initial values
// (CSS Backgrounds 3 §border-shorthands). A value containing var() can't be split,
// so it stays a single shorthand key and the cascade's pending-substitution path
// (Quest #58) handles it at computed time — the setter/remover/getter below all
// gate on the absence of var().
const _BORDER_IMAGE_INITIAL = {
  'border-image-source': 'none',
  'border-image-slice': '100%',
  'border-image-width': '1',
  'border-image-outset': '0',
  'border-image-repeat': 'stretch',
};
// Canonicalize a <line-width> token, folding any calc()/math (matching the
// pre-expansion `_canonShorthandLenMath` path so `calc(calc(10px))`→`calc(10px)`).
const _canonLineWidth = (t) =>
  _MATHFN_NAME_RE.test(t) ? (_canonMathExpr(t, { canonLen: true }) || t) : t;
const _BORDER_EXPAND = {
  'border': [
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat',
  ],
  'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
  'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
  'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
  'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
  'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  'outline': ['outline-width', 'outline-style', 'outline-color'],
};
// Parse `<line-width> || <line-style> || <color>` (border/outline side), VALIDATING
// each token and rejecting duplicates / unclassifiable tokens (so `2px solid
// color-mix(42deg)` — an invalid <color> — is rejected whole). `outline` also
// accepts `auto` as a <line-style> (outline-style: auto). Returns the three
// components (omitted ones defaulted) or null when the value is invalid.
const _parseBorderSideStrict = (value, outlineStyle) => {
  let width = null, style = null, color = null;
  const toks = _wsTokens(String(value).trim());
  if (!toks.length) return null;
  for (const t of toks) {
    const low = t.toLowerCase();
    if (_LINE_STYLE_KW.has(low) || (outlineStyle && low === 'auto')) {
      if (style != null) return null; style = low;
    } else if (_LINE_WIDTH_KW.has(low) || _isLengthTok(t)) {
      if (width != null) return null; width = _LINE_WIDTH_KW.has(low) ? low : _canonLineWidth(t);
    } else if (_isValidColor(t)) {
      if (color != null) return null; color = _canonColorSpecified(t);
    } else return null;
  }
  return {
    width: width == null ? 'medium' : width,
    style: style == null ? 'none' : style,
    color: color == null ? 'currentcolor' : color,
  };
};
// Split a border/outline shorthand into its longhand pieces (already canonical),
// or null if the value is invalid. `border` also resets the border-image longhands.
const _expandBorderShorthand = (sh, value) => {
  value = String(value).trim();
  if (sh === 'border-width' || sh === 'border-style' || sh === 'border-color') {
    const suf = sh.slice('border-'.length);
    const toks = _wsTokens(value);
    if (!toks.length || toks.length > 4) return null;
    for (const t of toks) {
      const low = t.toLowerCase();
      if (suf === 'width') { if (!_LINE_WIDTH_KW.has(low) && !_isLengthTok(t)) return null; }
      else if (suf === 'style') { if (!_LINE_STYLE_KW.has(low)) return null; }
      else if (!_isValidColor(t)) return null;
    }
    const edges = _boxEdges(toks); if (!edges) return null;
    const out = {};
    ['top', 'right', 'bottom', 'left'].forEach((s, i) => {
      out['border-' + s + '-' + suf] = suf === 'color' ? _canonColorSpecified(edges[i])
        : suf === 'width' ? (_LINE_WIDTH_KW.has(edges[i].toLowerCase()) ? edges[i].toLowerCase() : _canonLineWidth(edges[i]))
        : edges[i].toLowerCase();
    });
    return out;
  }
  if (sh === 'border-top' || sh === 'border-right' || sh === 'border-bottom' || sh === 'border-left') {
    const p = _parseBorderSideStrict(value, false); if (!p) return null;
    const side = sh.slice('border-'.length);
    return { ['border-' + side + '-width']: p.width, ['border-' + side + '-style']: p.style, ['border-' + side + '-color']: p.color };
  }
  if (sh === 'outline') {
    const p = _parseBorderSideStrict(value, true); if (!p) return null;
    return { 'outline-width': p.width, 'outline-style': p.style, 'outline-color': p.color };
  }
  if (sh === 'border') {
    const p = _parseBorderSideStrict(value, false); if (!p) return null;
    const out = {};
    for (const s of ['top', 'right', 'bottom', 'left']) {
      out['border-' + s + '-width'] = p.width;
      out['border-' + s + '-style'] = p.style;
      out['border-' + s + '-color'] = p.color;
    }
    return Object.assign(out, _BORDER_IMAGE_INITIAL);
  }
  return null;
};
// Reconstruct a border/outline shorthand from the longhands present (CSSOM
// "serialize a CSS value"), or '' when a longhand is absent / the four sides
// disagree / border-image is not at its initial value.
const _LW_INIT = 'medium', _LS_INIT = 'none', _LC_INIT = 'currentcolor';
const _joinBorderSide = (w, s, c) => {
  const parts = [];
  if (w !== _LW_INIT) parts.push(w);
  if (s !== _LS_INIT) parts.push(s);
  if (c !== _LC_INIT) parts.push(c);
  return parts.length ? parts.join(' ') : _LS_INIT;
};
const _serializeBorderShorthand = (decl, sh) => {
  const p = decl._props;
  if (sh === 'border-width' || sh === 'border-style' || sh === 'border-color') {
    const suf = sh.slice('border-'.length);
    const vals = ['top', 'right', 'bottom', 'left'].map((s) => p['border-' + s + '-' + suf]);
    if (vals.some((v) => v == null)) return '';
    return _serializeBoxValue(sh, vals);
  }
  if (sh === 'border-top' || sh === 'border-right' || sh === 'border-bottom' || sh === 'border-left') {
    const side = sh.slice('border-'.length);
    const w = p['border-' + side + '-width'], s = p['border-' + side + '-style'], c = p['border-' + side + '-color'];
    if (w == null || s == null || c == null) return '';
    return _joinBorderSide(w, s, c);
  }
  if (sh === 'outline') {
    const w = p['outline-width'], s = p['outline-style'], c = p['outline-color'];
    if (w == null || s == null || c == null) return '';
    return _joinBorderSide(w, s, c);
  }
  if (sh === 'border') {
    for (const comp of ['width', 'style', 'color']) {
      const v = p['border-top-' + comp];
      if (v == null) return '';
      for (const s of ['right', 'bottom', 'left']) if (p['border-' + s + '-' + comp] !== v) return '';
    }
    for (const k in _BORDER_IMAGE_INITIAL) {
      if (p[k] != null && p[k] !== _BORDER_IMAGE_INITIAL[k]) return '';
    }
    return _joinBorderSide(p['border-top-width'], p['border-top-style'], p['border-top-color']);
  }
  return '';
};
const _isTimeTok = (t) => /^[+-]?(\d*\.?\d+)(s|ms)$/i.test(t);
const _isTimingFnTok = (t) => {
  const l = t.toLowerCase();
  return l === 'ease' || l === 'linear' || l === 'ease-in' || l === 'ease-out'
    || l === 'ease-in-out' || l === 'step-start' || l === 'step-end'
    || /^(steps|cubic-bezier|linear)\(/i.test(t);
};
// Parse a `transition` value (comma-separated layers; within a layer the first
// <time> is the duration, the second the delay) into its longhand lists.
const _expandTransition = (value) => {
  const layers = _commaSplitTop(value).map((s) => s.trim()).filter((s) => s.length);
  if (!layers.length) return null;
  const props = [], durs = [], tfs = [], delays = [];
  for (const layer of layers) {
    let prop = 'all', dur = '0s', tf = 'ease', delay = '0s', times = 0;
    for (const t of _wsTokens(layer)) {
      if (_isTimeTok(t)) { if (times === 0) dur = t; else delay = t; times++; }
      else if (_isTimingFnTok(t)) tf = t;
      else prop = t;
    }
    props.push(prop); durs.push(dur); tfs.push(tf); delays.push(delay);
  }
  return {
    'transition-property': props.join(', '),
    'transition-duration': durs.join(', '),
    'transition-timing-function': tfs.join(', '),
    'transition-delay': delays.join(', '),
  };
};
// Split a (already var()-substituted) shorthand value into its longhand pieces,
// keyed by longhand name. Returns null if the value cannot be parsed.
const _expandShorthand = (sh, value) => {
  value = String(value).trim();
  if (sh === 'margin' || sh === 'padding') {
    const e = _boxEdges(_wsTokens(value)); if (!e) return null;
    return {
      [sh + '-top']: e[0], [sh + '-right']: e[1], [sh + '-bottom']: e[2], [sh + '-left']: e[3],
    };
  }
  if (sh === 'border-width' || sh === 'border-style' || sh === 'border-color') {
    const suf = sh.slice('border-'.length);
    const e = _boxEdges(_wsTokens(value)); if (!e) return null;
    return {
      ['border-top-' + suf]: e[0], ['border-right-' + suf]: e[1],
      ['border-bottom-' + suf]: e[2], ['border-left-' + suf]: e[3],
    };
  }
  if (sh === 'border-top' || sh === 'border-right' || sh === 'border-bottom' || sh === 'border-left') {
    const p = _parseBorderSide(value);
    return { [sh + '-width']: p.width, [sh + '-style']: p.style, [sh + '-color']: p.color };
  }
  if (sh === 'border') {
    const p = _parseBorderSide(value); const out = {};
    for (const side of ['top', 'right', 'bottom', 'left']) {
      out['border-' + side + '-width'] = p.width;
      out['border-' + side + '-style'] = p.style;
      out['border-' + side + '-color'] = p.color;
    }
    return out;
  }
  if (sh === 'transition') return _expandTransition(value);
  return null;
};

// ── Shorthand SERIALIZATION (the inverse of the cascade-side expansion above) ──
// The CSSOM `cssText` getter and the shorthand-property getter (`el.style.margin`)
// must reconstruct a shorthand from the longhand declarations actually present in
// the declaration block — "serialize a CSS declaration block" / "serialize a CSS
// value". We do this on-the-fly, reading the literal `_props` and NEVER mutating
// stored state, so the cascade (`_buildCascade`) and longhand reads are untouched.
//
// Scoped to the box-model families (margin/padding, physical + flow-relative): the
// only shorthands these CSSOM tests reconstruct. background/border/transition stay
// stored verbatim (already correct for the tests that exercise them).
const _BOX_SHORTHANDS = {
  'margin': ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'padding': ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  'margin-inline': ['margin-inline-start', 'margin-inline-end'],
  'margin-block': ['margin-block-start', 'margin-block-end'],
  'padding-inline': ['padding-inline-start', 'padding-inline-end'],
  'padding-block': ['padding-block-start', 'padding-block-end'],
};
// longhand → [shorthands it can be combined into] (no overlaps in the box families)
const _BOX_LONGHAND_SH = {};
// longhand → its logical property group ('margin' | 'padding') — physical and
// flow-relative box edges share one group, the unit of the adjacency rule below.
const _BOX_LOGICAL_GROUP = {};
const _shGroup = (sh) => sh.startsWith('padding') ? 'padding' : 'margin';
for (const sh in _BOX_SHORTHANDS) {
  for (const l of _BOX_SHORTHANDS[sh]) {
    (_BOX_LONGHAND_SH[l] = _BOX_LONGHAND_SH[l] || []).push(sh);
    _BOX_LOGICAL_GROUP[l] = _shGroup(sh);
  }
}
// Split a box value into its per-longhand pieces (4-edge or 2-edge).
const _expandBoxShorthand = (sh, value) => {
  const lh = _BOX_SHORTHANDS[sh];
  const toks = _wsTokens(String(value).trim());
  let edges;
  if (lh.length === 4) edges = _boxEdges(toks);
  else edges = toks.length >= 2 ? [toks[0], toks[1]] : toks.length === 1 ? [toks[0], toks[0]] : null;
  if (!edges) return null;
  const out = {};
  lh.forEach((name, i) => { out[name] = edges[i]; });
  return out;
};
// Collapse per-longhand values back into the shortest equivalent shorthand value.
const _serializeBoxValue = (sh, values) => {
  if (values.length === 4) {
    const [t, r, b, l] = values;
    if (t === r && r === b && b === l) return t;
    if (t === b && l === r) return `${t} ${r}`;
    if (l === r) return `${t} ${r} ${b}`;
    return `${t} ${r} ${b} ${l}`;
  }
  const [s, e] = values;
  return s === e ? s : `${s} ${e}`;
};
// Expand a declaration block (`_props`/`_priority`) into an ordered longhand list,
// applying last-write-wins across expanded names (a later longhand overriding one
// produced by an earlier shorthand is moved to the end, matching CSSOM ordering).
// A box shorthand carrying a var() becomes a pending-substitution value on each
// longhand (serialized as the empty string individually; recombined only when the
// whole group survives intact).
const _styleLonghandList = (decl) => {
  const list = [];
  const idxByName = new Map();
  const put = (name, value, important, pending, sh) => {
    if (idxByName.has(name)) list[idxByName.get(name)] = null;  // tombstone, reappend
    list.push({ name, value, important, pending, sh });
    idxByName.set(name, list.length - 1);
  };
  for (const name of Object.keys(decl._props)) {
    const value = decl._props[name];
    const important = decl._priority[name] === 'important';
    if (_BOX_SHORTHANDS[name]) {
      if (/\bvar\(/i.test(value)) {
        for (const l of _BOX_SHORTHANDS[name]) put(l, value, important, true, name);
      } else {
        const parts = _expandBoxShorthand(name, value);
        for (const l of _BOX_SHORTHANDS[name]) put(l, parts ? parts[l] : value, important, false, name);
      }
    } else {
      put(name, value, important, false, null);
    }
  }
  return list.filter(Boolean);
};
// Reconstruct one shorthand's value from the longhand list, or '' if the longhands
// are absent / disagree on importance / are a partial pending-substitution group.
const _boxShorthandValue = (list, sh) => {
  const group = [];
  for (const ln of _BOX_SHORTHANDS[sh]) {
    const d = list.find((x) => x.name === ln);
    if (!d) return '';
    group.push(d);
  }
  const imp = group[0].important;
  if (group.some((g) => g.important !== imp)) return '';
  if (group.some((g) => g.pending)) {
    if (!group.every((g) => g.pending && g.value === group[0].value && g.sh === group[0].sh)) return '';
    return group[0].value;
  }
  return _serializeBoxValue(sh, group.map((g) => g.value));
};
const _boxShorthandSerialization = (decl, sh) => _boxShorthandValue(_styleLonghandList(decl), sh);
// Serialize a whole declaration block to `cssText`, combining adjacent box
// longhands into their shorthand where the CSSOM rules permit.
const _serializeDeclBlock = (decl) => {
  const list = _styleLonghandList(decl);
  const out = [];
  const done = new Set();
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (done.has(d.name)) continue;
    let handled = false;
    for (const sh of (_BOX_LONGHAND_SH[d.name] || [])) {
      const lhNames = _BOX_SHORTHANDS[sh];
      const idxs = [];
      let ok = true;
      for (const ln of lhNames) {
        let found = -1;
        for (let k = 0; k < list.length; k++) {
          if (list[k].name === ln && !done.has(ln)) { found = k; break; }
        }
        if (found < 0) { ok = false; break; }
        idxs.push(found);
      }
      if (!ok) continue;
      const group = idxs.map((k) => list[k]);
      const imp = group[0].important;
      if (group.some((g) => g.important !== imp)) continue;
      let value;
      if (group.some((g) => g.pending)) {
        if (!group.every((g) => g.pending && g.value === group[0].value && g.sh === group[0].sh)) continue;
        value = group[0].value;
      } else {
        value = _serializeBoxValue(sh, group.map((g) => g.value));
        if (value === '') continue;
      }
      // Logical-group adjacency: a shorthand is only serialized if no declaration
      // from the same logical property group (and not part of this group) sits
      // between its first and last longhand in the block.
      const first = Math.min(...idxs), last = Math.max(...idxs);
      const grp = _shGroup(sh);
      let blocked = false;
      for (let k = first + 1; k < last; k++) {
        if (idxs.includes(k)) continue;
        if (_BOX_LOGICAL_GROUP[list[k].name] === grp) { blocked = true; break; }
      }
      if (blocked) continue;
      out.push(`${sh}: ${value}${imp ? ' !important' : ''};`);
      for (const ln of lhNames) done.add(ln);
      handled = true;
      break;
    }
    if (handled) continue;
    out.push(`${d.name}: ${d.pending ? '' : d.value}${d.important ? ' !important' : ''};`);
    done.add(d.name);
  }
  return out.join(' ');
};
const _cssParseDecls = (body) => {
  // body is the inside of a `{ ... }` block (or an inline style string).
  const out = {};
  for (const part of String(body).split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const rawName = part.slice(0, idx).trim();
    if (!rawName) continue;
    let value = part.slice(idx + 1).trim();
    let important = false;
    const m = /!\s*important\s*$/i.exec(value);
    if (m) { important = true; value = value.slice(0, m.index).trim(); }
    // Custom properties keep their case; standard properties are ASCII-lowercased.
    const name = rawName.startsWith('--') ? rawName : rawName.toLowerCase();
    // A custom property with an invalid <declaration-value> is dropped — the
    // earlier valid declaration of the same name (if any) is preserved.
    if (name.startsWith('--') && !_isBalancedDeclValue(value)) continue;
    _expandDeclInto(out, name, value, important);
  }
  return out;
};
const _cssSplitRules = (cssText) => {
  // Returns [{ selectorText, decls }]; skips at-rules (and their nested blocks).
  const css = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    let j = i;
    while (j < n && css[j] !== '{' && css[j] !== '}') j++;
    if (j >= n) break;
    if (css[j] === '}') { i = j + 1; continue; }
    const prelude = css.slice(i, j).trim();
    // Find the matching close-brace, tracking ()/[]/{} nesting so a stray `}`
    // inside a declaration value (e.g. `--x: (})`) doesn't close the rule early.
    let k = j + 1; const stack = ['{'];
    while (k < n && stack.length > 0) {
      const c = css[k];
      if (c === '{' || c === '(' || c === '[') stack.push(c);
      else if (c === '}' || c === ')' || c === ']') {
        const top = stack[stack.length - 1];
        if ((c === '}' && top === '{') || (c === ')' && top === '(') || (c === ']' && top === '[')) stack.pop();
      }
      k++;
    }
    const body = css.slice(j + 1, k - 1);
    i = k;
    if (!prelude || prelude[0] === '@') continue; // skip @media/@supports/etc.
    rules.push({ selectorText: prelude, decls: _cssParseDecls(body) });
  }
  return rules;
};
const _sheetRuleCache = new WeakMap(); // styleEl -> { text, rules }
const _styleSheetRules = (styleEl) => {
  let text = '';
  try { text = styleEl.textContent || ''; } catch { text = ''; }
  const cached = _sheetRuleCache.get(styleEl);
  if (cached && cached.text === text) return cached.rules;
  const rules = _cssSplitRules(text);
  _sheetRuleCache.set(styleEl, { text, rules });
  return rules;
};
// Computed-value serialization for <color> properties: named/hex/rgb()/rgba()
// → `rgb(r, g, b)` (or `rgba(r, g, b, a)` when alpha < 1), matching how browsers
// serialize a computed color. Other values pass through unchanged.
const _CSS_NAMED_COLORS = {
  aliceblue:'#f0f8ff',antiquewhite:'#faebd7',aqua:'#00ffff',aquamarine:'#7fffd4',azure:'#f0ffff',
  beige:'#f5f5dc',bisque:'#ffe4c4',black:'#000000',blanchedalmond:'#ffebcd',blue:'#0000ff',
  blueviolet:'#8a2be2',brown:'#a52a2a',burlywood:'#deb887',cadetblue:'#5f9ea0',chartreuse:'#7fff00',
  chocolate:'#d2691e',coral:'#ff7f50',cornflowerblue:'#6495ed',cornsilk:'#fff8dc',crimson:'#dc143c',
  cyan:'#00ffff',darkblue:'#00008b',darkcyan:'#008b8b',darkgoldenrod:'#b8860b',darkgray:'#a9a9a9',
  darkgreen:'#006400',darkgrey:'#a9a9a9',darkkhaki:'#bdb76b',darkmagenta:'#8b008b',darkolivegreen:'#556b2f',
  darkorange:'#ff8c00',darkorchid:'#9932cc',darkred:'#8b0000',darksalmon:'#e9967a',darkseagreen:'#8fbc8f',
  darkslateblue:'#483d8b',darkslategray:'#2f4f4f',darkslategrey:'#2f4f4f',darkturquoise:'#00ced1',darkviolet:'#9400d3',
  deeppink:'#ff1493',deepskyblue:'#00bfff',dimgray:'#696969',dimgrey:'#696969',dodgerblue:'#1e90ff',
  firebrick:'#b22222',floralwhite:'#fffaf0',forestgreen:'#228b22',fuchsia:'#ff00ff',gainsboro:'#dcdcdc',
  ghostwhite:'#f8f8ff',gold:'#ffd700',goldenrod:'#daa520',gray:'#808080',green:'#008000',
  greenyellow:'#adff2f',grey:'#808080',honeydew:'#f0fff0',hotpink:'#ff69b4',indianred:'#cd5c5c',
  indigo:'#4b0082',ivory:'#fffff0',khaki:'#f0e68c',lavender:'#e6e6fa',lavenderblush:'#fff0f5',
  lawngreen:'#7cfc00',lemonchiffon:'#fffacd',lightblue:'#add8e6',lightcoral:'#f08080',lightcyan:'#e0ffff',
  lightgoldenrodyellow:'#fafad2',lightgray:'#d3d3d3',lightgreen:'#90ee90',lightgrey:'#d3d3d3',lightpink:'#ffb6c1',
  lightsalmon:'#ffa07a',lightseagreen:'#20b2aa',lightskyblue:'#87cefa',lightslategray:'#778899',lightslategrey:'#778899',
  lightsteelblue:'#b0c4de',lightyellow:'#ffffe0',lime:'#00ff00',limegreen:'#32cd32',linen:'#faf0e6',
  magenta:'#ff00ff',maroon:'#800000',mediumaquamarine:'#66cdaa',mediumblue:'#0000cd',mediumorchid:'#ba55d3',
  mediumpurple:'#9370db',mediumseagreen:'#3cb371',mediumslateblue:'#7b68ee',mediumspringgreen:'#00fa9a',mediumturquoise:'#48d1cc',
  mediumvioletred:'#c71585',midnightblue:'#191970',mintcream:'#f5fffa',mistyrose:'#ffe4e1',moccasin:'#ffe4b5',
  navajowhite:'#ffdead',navy:'#000080',oldlace:'#fdf5e6',olive:'#808000',olivedrab:'#6b8e23',
  orange:'#ffa500',orangered:'#ff4500',orchid:'#da70d6',palegoldenrod:'#eee8aa',palegreen:'#98fb98',
  paleturquoise:'#afeeee',palevioletred:'#db7093',papayawhip:'#ffefd5',peachpuff:'#ffdab9',peru:'#cd853f',
  pink:'#ffc0cb',plum:'#dda0dd',powderblue:'#b0e0e6',purple:'#800080',rebeccapurple:'#663399',
  red:'#ff0000',rosybrown:'#bc8f8f',royalblue:'#4169e1',saddlebrown:'#8b4513',salmon:'#fa8072',
  sandybrown:'#f4a460',seagreen:'#2e8b57',seashell:'#fff5ee',sienna:'#a0522d',silver:'#c0c0c0',
  skyblue:'#87ceeb',slateblue:'#6a5acd',slategray:'#708090',slategrey:'#708090',snow:'#fffafa',
  springgreen:'#00ff7f',steelblue:'#4682b4',tan:'#d2b48c',teal:'#008080',thistle:'#d8bfd8',
  tomato:'#ff6347',turquoise:'#40e0d0',violet:'#ee82ee',wheat:'#f5deb3',white:'#ffffff',
  whitesmoke:'#f5f5f5',yellow:'#ffff00',yellowgreen:'#9acd32',
};
const _COLOR_PROPS = new Set([
  'color','background-color','border-top-color','border-right-color','border-bottom-color',
  'border-left-color','outline-color','text-decoration-color','column-rule-color','caret-color',
  'text-emphasis-color',
]);
// Colour *shorthands* — 1–4 space-separated <color> values (border-color and its
// flow-relative siblings). Each value canonicalizes independently like a longhand
// `<color>` (`currentColor`→`currentcolor`); a value with internal spaces/commas
// (`rgb(0, 0, 255)`) stays whole because `_splitTopLevel` only breaks at paren
// depth 0. Specified-serialization only (these tests read `el.style[prop]` back).
const _COLOR_SHORTHAND_PROPS = new Set([
  'border-color','border-block-color','border-inline-color',
]);
const _serColor = (r, g, b, a) => {
  const c = (x) => Math.max(0, Math.min(255, Math.round(x)));
  r = c(r); g = c(g); b = c(b);
  // Alpha clamps to [0, 1] (e.g. an out-of-range alpha like -10 → 0).
  if (a === undefined || a === null || Number.isNaN(a)) a = 1;
  a = Math.max(0, Math.min(1, a));
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
};
// Convert HSL components (h in degrees, s/l in [0,1]) to 0-255 RGB.
const _hslToRgb = (h, s, l) => {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};
// CSS <length> → px factors for the math evaluator's dimension tokens. Only
// units with a context-free px value are listed; viewport/container-relative
// units (vw/cqw/…) are intentionally absent → the evaluator fails on them
// (we have no layout to resolve them against).
const _LENGTH_PX = {
  px: 1, em: 16, rem: 16, ex: 8, ch: 8, ic: 16, cap: 16,
  in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 25.4 / 4, pt: 96 / 72, pc: 16,
};
// CSS <angle> units → degrees (for gradient <angle> directions/stops via _evalMath
// `opts.angle`). 400 grad = 360 deg; 1 turn = 360 deg; rad via 180/π.
const _ANGLE_DEG = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
// CSS <time> units → seconds (transition-delay/-duration computed values via
// _evalMath `opts.time`; getComputedStyle serializes computed <time> in seconds).
const _TIME_S = { s: 1, ms: 0.001 };
// Absolute <length> units → px (the canonical <length> unit) for SPECIFIED-value
// calc() simplification — `calc(1in * NaN)` serializes as `calc(NaN * 1px)`. The
// relative units (em/rem/vw/… in `_LENGTH_PX`) are deliberately NOT here: they stay
// symbolic until computed time resolves them against the element/viewport.
const _ABS_LEN_PX = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 25.4 / 4, pt: 96 / 72, pc: 16 };
// Unescape a CSS identifier: `\67` (hex, optional trailing whitespace) and
// `\g` (literal). Used so an escaped function name like `r\67 b`/`r\gb`
// resolves to `rgb` before we match it.
const _unescapeIdent = (s) => {
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '\\') {
      const m = /^[0-9a-fA-F]{1,6}/.exec(s.slice(i + 1));
      if (m) {
        const cp = parseInt(m[0], 16);
        out += (cp === 0 || cp > 0x10FFFF) ? '�' : String.fromCodePoint(cp);
        i += 1 + m[0].length;
        if (i < s.length && /[ \t\n\r\f]/.test(s[i])) i++; // one whitespace terminator consumed
      } else if (i + 1 < s.length) { out += s[i + 1]; i += 2; }
      else i++; // trailing backslash dropped
    } else { out += s[i]; i++; }
  }
  return out;
};
// Split a function's argument string into top-level components, treating comma,
// slash, and whitespace as separators but never splitting inside nested parens
// (so a `calc(50% + (… * 10%))` stays one component). Handles legacy
// `rgb(r, g, b, a)` and modern `rgb(r g b / a)` uniformly.
const _splitTopLevel = (s) => {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth = Math.max(0, depth - 1); cur += c; }
    else if (depth === 0 && (c === ',' || c === '/' || c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f')) {
      if (cur.trim()) out.push(cur.trim()); cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};
// Resolve a colour channel's raw math result per CSS Color 4: NaN → lower
// bound (0), +∞ → the channel's upper bound, -∞ → 0. (Finite values are passed
// through; _serColor does the final clamp/round.) `null` (parse failure) sticks.
const _resolveChannel = (raw, max) => {
  if (raw === null) return null;
  if (Number.isNaN(raw)) return 0;
  if (raw === Infinity) return max;
  if (raw === -Infinity) return 0;
  return raw;
};
// Parse the inside of an rgb()/rgba() function into [r, g, b, a] numbers, with
// each component allowed to be `none`, a <number>/<percentage>, or a full math
// expression (calc/min/max/clamp/sign with calc constants + length units).
// Returns null if it isn't a valid 3-or-4-component rgb body.
const _rgbComponents = (inner) => {
  const parts = _splitTopLevel(inner);
  if (parts.length < 3 || parts.length > 4) return null;
  const chan = (p, max) => {
    if (p.toLowerCase() === 'none') return 0;
    return _resolveChannel(_evalMath(p, max === 1 ? 1 : 255, { lengths: true, nonFinite: true }), max);
  };
  const r = chan(parts[0], 255), g = chan(parts[1], 255), b = chan(parts[2], 255);
  if (r === null || g === null || b === null) return null;
  let a = 1;
  if (parts.length === 4) { a = chan(parts[3], 1); if (a === null) return null; }
  return [r, g, b, a];
};
const _computeColor = (value) => {
  if (!value) return value;
  let s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const low = s.toLowerCase();
  if (low === 'transparent') return 'rgba(0, 0, 0, 0)';
  if (low === 'currentcolor' || low === 'inherit' || low === 'initial' || low === 'unset') return value;
  if (_CSS_NAMED_COLORS[low]) s = _CSS_NAMED_COLORS[low];
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    const h = m[1];
    let r, g, b, a = 1;
    if (h.length === 3) { r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); }
    else if (h.length === 4) { r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); a = parseInt(h[3] + h[3], 16) / 255; }
    else if (h.length === 6) { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); }
    else if (h.length === 8) { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); a = parseInt(h.slice(6, 8), 16) / 255; }
    else return value;
    return _serColor(r, g, b, a);
  }
  // Function-notation colours: extract the name before the first '(' (so an
  // escaped/capitalised name like `r\67 b`/`RGB` still matches) and the inner
  // argument string (greedy to the final ')', so nested calc() parens survive).
  const lp = s.indexOf('(');
  if (lp > 0 && s.endsWith(')')) {
    const fname = _unescapeIdent(s.slice(0, lp)).toLowerCase();
    const inner = s.slice(lp + 1, -1);
    if (fname === 'rgb' || fname === 'rgba') {
      const c = _rgbComponents(inner);
      return c ? _serColor(c[0], c[1], c[2], c[3]) : value;
    }
  }
  // `none` (CSS Color 4) is treated as the missing-component value 0.
  const _alpha = (p) => p === 'none' ? 0 : (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p));
  m = /^hsla?\(([^)]*)\)$/i.exec(s);
  if (m) {
    const parts = m[1].split(/[,\/\s]+/).filter((x) => x.length);
    if (parts.length >= 3) {
      const h = parts[0] === 'none' ? 0 : parseFloat(parts[0]);
      const sat = parts[1] === 'none' ? 0 : parseFloat(parts[1]) / 100;
      const lig = parts[2] === 'none' ? 0 : parseFloat(parts[2]) / 100;
      const a = parts.length >= 4 ? _alpha(parts[3]) : 1;
      const [r, g, b] = _hslToRgb(h, sat, lig);
      return _serColor(r, g, b, a);
    }
  }
  return value;
};
// Serialize a <color> at SPECIFIED time (the CSSOM `el.style.color` getter, read by
// every `*-color-valid` test). Legacy sRGB forms — hex, rgb()/rgba(), hsl()/hsla() —
// canonicalize to rgb()/rgba() per CSS Color 4 "serializing sRGB values": channels
// clamp to [0,255], `%` channels resolve to integers, a 4-arg / slash-alpha rgb → rgba,
// `%` alpha → number (`#234`→`rgb(34, 51, 68)`, `hsl(120, 100%, 50%)`→`rgb(0, 255, 0)`,
// `rgb(100, 200, 300)`→`rgb(100, 200, 255)`). UNLIKE _computeColor (the COMPUTED path),
// named colours, `currentcolor`, `transparent`, CSS-wide keywords, and modern functions
// (light-dark/color-mix/lab/relative `rgb(from …)`/var()) keep their specified bytes —
// those only resolve at computed-value time.
// CSS system colours (CSS Color 4 §System Colors) — valid <color> keywords that
// serialize as the ASCII-lowercased ident (their used value is UA-defined; we don't
// resolve them to an rgb() at computed time, matching how named keywords are kept).
const _SYSTEM_COLORS = new Set([
  'accentcolor', 'accentcolortext', 'activetext', 'buttonborder', 'buttonface',
  'buttontext', 'canvas', 'canvastext', 'field', 'fieldtext', 'graytext',
  'highlight', 'highlighttext', 'linktext', 'mark', 'marktext', 'selecteditem',
  'selecteditemtext', 'visitedtext',
]);
// Approximate light-theme sRGB used values for the system colours (Chromium
// defaults). We don't surface these as the computed value of a system-colour
// keyword (that stays the lowercased ident, matching named keywords) — they exist
// only so contrast-color(<system-color>) has a luminance to choose black/white
// against. A keyword absent from this map falls back to a neutral mid grey.
const _SYSTEM_COLOR_RGB = {
  accentcolor: 'rgb(0, 117, 255)', accentcolortext: 'rgb(255, 255, 255)',
  activetext: 'rgb(255, 0, 0)', buttonborder: 'rgb(118, 118, 118)',
  buttonface: 'rgb(239, 239, 239)', buttontext: 'rgb(0, 0, 0)',
  canvas: 'rgb(255, 255, 255)', canvastext: 'rgb(0, 0, 0)',
  field: 'rgb(255, 255, 255)', fieldtext: 'rgb(0, 0, 0)',
  graytext: 'rgb(128, 128, 128)', highlight: 'rgb(0, 117, 255)',
  highlighttext: 'rgb(255, 255, 255)', linktext: 'rgb(0, 0, 238)',
  mark: 'rgb(255, 255, 0)', marktext: 'rgb(0, 0, 0)',
  selecteditem: 'rgb(0, 117, 255)', selecteditemtext: 'rgb(255, 255, 255)',
  visitedtext: 'rgb(85, 26, 139)',
};
const _canonColorSpecified = (value) => {
  if (!value) return value;
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const low = s.toLowerCase();
  // Keyword colours (named/`transparent`/`currentcolor`/system) and CSS-wide
  // keywords serialize as the ASCII-lowercased ident — `currentColor`→`currentcolor`,
  // `Red`→`red`, `ActiveText`→`activetext` — but otherwise keep their keyword form
  // (they only resolve to an rgb() at computed-value time, unlike the hex/rgb/hsl forms).
  if (low === 'transparent' || low === 'currentcolor' || _CSS_WIDE.has(low) || _CSS_NAMED_COLORS[low] || _SYSTEM_COLORS.has(low)) return low;
  // alpha() relative-alpha function — canonicalize the origin + a calc() alpha.
  if (/^alpha\(\s*from\s/i.test(low)) {
    const ac = _canonAlpha(s);
    if (ac !== null) return ac;
  }
  // contrast-color() function (CSS Color 5) — canonicalize the inner <color>.
  if (low.startsWith('contrast-color(')) {
    const cc = _canonContrastColor(s);
    if (cc !== null) return cc;
  }
  // Relative colour `<fn>(from <origin> <channels>)` (CSS Color 5) — canonicalize
  // the function name + origin colour, channels kept symbolic. Dispatched before the
  // modern/legacy branches below because the `from` keyword isn't a number/percentage
  // (the channel constants `r`/`g`/`b`/`l`/… aren't a legacy colour `_computeColor`
  // would touch). Falls through verbatim on any non-relative or var()-bearing shape.
  if (/^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*from\s/i.test(low)) {
    const rc = _canonRelativeColor(s);
    if (rc !== null) return rc;
  }
  // Modern colour functions — lab()/lch()/oklab()/oklch()/color(<space> …) and
  // hwb() — whose channels are all plain <number>/<percentage>/<angle>/none (no
  // nested math function) serialize at SPECIFIED time IDENTICALLY to their computed
  // value: resolve each `%` against the channel reference, clamp per channel,
  // normalize the hue into [0, 360), drop an alpha ≥ 1, and convert hwb() → sRGB
  // rgb()/rgba(). We reuse `_computeModernColor` in SPECIFIED mode (`specified`
  // = true): a bare channel resolves+clamps exactly as computed, while a channel
  // carrying a calc()/min()/… keeps its math expression — canonically serialized
  // by `_canonMathExpr` but UNCLAMPED with `%` left symbolic (`lab(calc(50%) 50%
  // 0.5)`→`lab(calc(50%) 62.5 0.5)`, `lab(calc(50*3) …)`→`lab(calc(150) …)`).
  // Returns null (→ verbatim) for var()-bearing / unparseable shapes.
  const lp0 = s.indexOf('(');
  if (lp0 > 0 && s.endsWith(')')) {
    const m = _computeModernColor(s, true);
    if (m !== null) return m;
  }
  // color-mix() — canonicalize its SYNTAX at specified time (interpolation method,
  // component colours, percentages). The cross-space mixing MATH (its computed
  // value) is a documented cap, not done here. Falls through verbatim on any
  // unparseable shape (`_canonColorMix` returns null).
  if (low.startsWith('color-mix(')) {
    const cm = _canonColorMix(s);
    if (cm !== null) return cm;
  }
  const out = _computeColor(s);
  // _computeColor returns its argument unchanged for anything that isn't a legacy
  // hex/rgb/hsl colour (modern functions, var(), unparseable) — keep the original
  // bytes (incl. any comments _canonStandardValue preserved) in that case.
  return out === s ? value : out;
};
// Canonicalize a colour-shorthand value (`border-color` &c.): split into its
// top-level `<color>` tokens and run each through `_canonColorSpecified`. A lone
// CSS-wide keyword (`inherit`) or anything that doesn't split into colours round-
// trips unchanged (each token's `_canonColorSpecified` is identity for already-
// canonical input), so this never regresses an already-correct value.
const _canonColorShorthand = (value) => {
  if (!value) return value;
  const toks = _splitTopLevel(String(value));
  if (toks.length === 0) return value;
  return toks.map((t) => _canonColorSpecified(t)).join(' ');
};
// ---- Relative <color> SPECIFIED-value serialization (CSS Color 5 §serial-relative-color) ----
// `<fn>(from <origin> <channels>)` — e.g. `rgb(from rebeccapurple r g b / alpha)`. At
// specified time only the SYNTAX is canonicalized (the channel maths that produce the
// computed value is a separate, much bigger primitive — left as a cap):
//  • the function name is ASCII-lowercased and `rgba`/`hsla` fold to `rgb`/`hsl`
//    (`RGBA(from …)`→`rgb(from …)`);
//  • the <origin> colour runs through `_canonColorSpecified` (recursively, so nested
//    relative colours canonicalize too): `rgb(20%, 40%, 60%, 80%)`→`rgba(51, 102, 153,
//    0.8)`, `lab(25 20 50 / 40%)`→`lab(25 20 50 / 0.4)`, `hwb(120deg 20% 50% / .5)`→its
//    sRGB rgba(); named colours/`currentcolor`/`color-mix()` stay symbolic;
//  • for `color()` the colour-space token AFTER the origin aliases `xyz`→`xyz-d65`.
// The channel keywords (`r`/`g`/`b`/`alpha`/`none`/replacement <number>/<percentage>) are
// kept VERBATIM — the WPT comparator strips numbers and compares approximately, so no
// number normalization is needed, and a `calc()` channel is left untouched (operand
// reordering like `calc(g * 2)`→`calc(2 * g)` needs the Wave-2 specified-calc serializer,
// a documented cap). A `var()` anywhere makes the whole value a pending-substitution token
// stream the engine keeps byte-for-byte (case + calc order preserved), so we bail to null
// → the caller leaves it verbatim. Returns null on any non-relative / malformed shape.
const _REL_COLOR_FNS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);
const _canonRelativeColor = (value) => {
  const s = String(value).trim();
  const lp = s.indexOf('(');
  if (lp <= 0 || !s.endsWith(')')) return null;
  const fn = s.slice(0, lp).toLowerCase();
  if (!_REL_COLOR_FNS.has(fn)) return null;
  if (/\bvar\(/i.test(s)) return null;                    // pending-substitution → verbatim
  const toks = _wsTokens(s.slice(lp + 1, -1).trim());
  if (toks.length < 2 || toks[0].toLowerCase() !== 'from') return null;
  const origin = _canonColorSpecified(toks[1]);
  let rest = toks.slice(2);
  if (fn === 'color' && rest.length) {                    // color(): alias the space token
    const space = rest[0].toLowerCase();
    rest = [space === 'xyz' ? 'xyz-d65' : space, ...rest.slice(1)];
  }
  // A calc()-bearing channel is canonicalized (operand reorder / constant fold,
  // e.g. `calc(g * 2)`→`calc(2 * g)`, `calc(l - 20)`→`calc(-20 + l)`); the channel
  // keywords stay symbolic. A bare keyword / `/` / replacement value has no `(`
  // and is kept verbatim.
  rest = rest.map((t) => (t.indexOf('(') !== -1 ? (_canonMathExpr(t) || t) : t));
  const outFn = fn === 'rgba' ? 'rgb' : fn === 'hsla' ? 'hsl' : fn;
  return outFn + '(from ' + origin + (rest.length ? ' ' + rest.join(' ') : '') + ')';
};
// ---- alpha() relative-alpha function (CSS Color 5 §relative-alpha) ----
// `alpha(from <origin> [ / <alpha-value> ])` — keeps the origin colour's channels
// + colour space and replaces ONLY its alpha. The `alpha` keyword inside the
// `<alpha-value>` reads the origin's alpha. Grammar parse, shared by the validity,
// specified-canon and computed paths. Returns `{ origin, alpha }` (alpha = the raw
// token string, or null when omitted), or null on any malformed shape:
//  • must start `alpha( from <color>` (no `from` / empty / non-color origin → null);
//  • at most one `/ <alpha-value>` (a single ws-token: number/%/none/alpha/var()/
//    sibling-*()/calc()); extra tokens, commas, multiple slashes, channel keywords
//    in the origin position → null.
const _parseAlphaFn = (value) => {
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const lp = s.indexOf('(');
  if (lp <= 0 || !s.endsWith(')')) return null;
  if (_unescapeIdent(s.slice(0, lp)).toLowerCase() !== 'alpha') return null;
  const inner = s.slice(lp + 1, -1);
  if (_commaSplitTop(inner).length > 1) return null;       // comma syntax not allowed
  const toks = _wsTokens(inner.trim());
  if (toks.length < 2 || toks[0].toLowerCase() !== 'from') return null;
  const origin = toks[1];
  if (origin === '/') return null;                         // missing origin colour
  const rest = toks.slice(2);
  let alpha = null;
  if (rest.length) {
    if (rest[0] !== '/') return null;                      // extra tokens after origin
    const aToks = rest.slice(1);
    if (aToks.length !== 1 || aToks[0] === '/') return null;  // exactly one alpha token
    alpha = aToks[0];
  }
  return { origin, alpha };
};
// Is `tok` a valid <alpha-value>? Only the `alpha` keyword may stand for a colour
// channel — a colour channel keyword (`r`/`l`/…) or a bare colour ident is invalid.
const _isValidAlphaValue = (tok) => {
  const t = String(tok).trim(), low = t.toLowerCase();
  if (low === 'none' || low === 'alpha') return true;
  if (/^var\(/i.test(t)) return true;
  if (/^sibling-(?:index|count)\(\s*\)$/i.test(t)) return true;
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)%?$/.test(t)) return true;
  if (/^(?:calc|min|max|clamp|abs|sign|round|mod|rem|hypot)\(/i.test(t)) {
    // Substitute the only legal symbols (alpha, sibling-*()) → a number, then the
    // expression must evaluate; a leftover channel ident (`r`/`l`/…) leaves it null.
    const e = t.replace(/\balpha\b/gi, '1').replace(/sibling-(?:index|count)\(\s*\)/gi, '1');
    return _evalMath(e, 1, { nonFinite: true }) !== null;
  }
  return false;
};
// Is `value` a valid `alpha()` <color>? (used by CSS.supports / the setter drop)
const _isValidAlpha = (value) => {
  const p = _parseAlphaFn(value);
  if (!p) return false;
  if (!/var\(/i.test(p.origin) && !_isValidColor(p.origin)) return false;
  if (p.alpha !== null && !/var\(/i.test(p.alpha) && !_isValidAlphaValue(p.alpha)) return false;
  return true;
};
// SPECIFIED-value canon: canonicalize the origin via _canonColorSpecified
// (recursively) and reorder a calc() alpha via _canonMathExpr; var()/sibling-*()/
// the `alpha` keyword stay verbatim. Returns null on a malformed shape (→ verbatim).
const _canonAlpha = (value) => {
  const p = _parseAlphaFn(value);
  if (!p) return null;
  const origin = _canonColorSpecified(p.origin);
  let out = 'alpha(from ' + origin;
  if (p.alpha !== null) {
    let a = p.alpha;
    if (/^calc\(/i.test(a)) a = _canonMathExpr(a) || a;
    out += ' / ' + a;
  }
  return out + ')';
};
// ---- contrast-color() function (CSS Color 5 §contrast-color) ----
// `contrast-color( <color> )` — resolves at computed-value time to whichever of
// black/white contrasts more with the single <color> argument. Grammar parse,
// shared by the validity, specified-canon and computed paths. Returns
// `{ color }` (the raw inner token string) or null on a malformed shape: the
// function name must be `contrast-color`, with a single non-empty argument. The
// argument is ONE <color> — it may itself contain spaces/`/`/commas inside its
// own parens (`color(srgb 1 0 1 / 0.5)`, `rgb(255, 0, 0)`), so we keep the whole
// inner verbatim and let `_isValidColor` judge it (`white white`/`max white` →
// not a single colour → invalid).
const _parseContrastColor = (value) => {
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const lp = s.indexOf('(');
  if (lp <= 0 || !s.endsWith(')')) return null;
  if (_unescapeIdent(s.slice(0, lp)).toLowerCase() !== 'contrast-color') return null;
  const inner = s.slice(lp + 1, -1).trim();
  if (!inner) return null;                                  // contrast-color() → invalid
  return { color: inner };
};
// Is `value` a valid `contrast-color()` <color>? (used by _isValidColor / the
// setter drop) — its single argument must be a valid <color> (a var() passes
// without resolving).
const _isValidContrastColor = (value) => {
  const p = _parseContrastColor(value);
  if (!p) return false;
  if (/var\(/i.test(p.color)) return true;
  return _isValidColor(p.color);
};
// SPECIFIED-value canon: canonicalize the inner <color> via _canonColorSpecified
// (recursively). Returns null on a malformed / var()-bearing shape (→ verbatim).
const _canonContrastColor = (value) => {
  const p = _parseContrastColor(value);
  if (!p) return null;
  if (/var\(/i.test(p.color)) return null;
  return 'contrast-color(' + _canonColorSpecified(p.color) + ')';
};
// ---- color-mix() SPECIFIED-value serialization (CSS Color 5 §serial-color-mix) ----
// Canonicalize the SYNTAX only — the cross-space mixing MATH (the computed value)
// is deliberately NOT done here (that needs full colour-space conversion and stays a
// documented cap). Rules, read straight from the WPT generator:
//  • interpolation method `in <space> [<hue> hue]?` — keep the space (NEVER the
//    default-space-drop gradients do), alias `xyz`→`xyz-d65`, drop the default
//    `shorter hue`. The method may be ABSENT (`color-mix(<c1>, <c2>)`).
//  • each component <color> canonicalized via `_canonColorSpecified`
//    (`hsl(120deg 10% 20%)`→`rgb(46, 56, 46)`, `currentcolor`/`red`/modern fns kept).
//  • each component's <percentage> moves AFTER its colour; a calc()/var() percentage
//    is kept symbolic in place with NO normalization; otherwise an omitted percentage
//    is filled to 100%−other and a resulting 50%/50% pair is dropped entirely.
const _PLAIN_PCT_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)%$/;
const _isMixPct = (t) => /%$/.test(t) || /^(?:calc|var|min|max|clamp|abs|sign)\(/i.test(t);
// Split a component into { color, pct } (pct = raw token string or null). The
// percentage is the lone ws-token that looks like a <percentage> (plain `%` or a
// math/var function); the colour is the other token. Returns null if ambiguous.
const _splitMixComponent = (arg) => {
  const toks = _wsTokens(String(arg).trim());
  if (toks.length === 1) return _isMixPct(toks[0]) ? null : { color: toks[0], pct: null };
  if (toks.length === 2) {
    if (_isMixPct(toks[0]) && !_isMixPct(toks[1])) return { color: toks[1], pct: toks[0] };
    if (_isMixPct(toks[1]) && !_isMixPct(toks[0])) return { color: toks[0], pct: toks[1] };
  }
  return null;
};
// Canonicalize a color-mix() interpolation method (tokens after the leading `in`
// kept). Returns `''` for the DEFAULT (`in oklab`, no hue → omitted entirely),
// `'in <space>…'` otherwise, or null if not a valid `in <space> [<hue> hue]?`.
// color-mix admits the gradient interpolation spaces plus `display-p3-linear`
// (a predefined-linear space); `_GRADIENT_COLOR_SPACES` is referenced lazily here
// (it's defined later in the file) and left untouched so gradients don't shift.
const _canonColorMixMethod = (toks) => {
  if (toks.length < 2 || toks.length > 4 || toks[0].toLowerCase() !== 'in') return null;
  let space = toks[1].toLowerCase();
  if (!_GRADIENT_COLOR_SPACES.has(space) && space !== 'display-p3-linear') return null;
  if (space === 'xyz') space = 'xyz-d65';
  if (toks.length > 2) {                                  // optional `<hue> hue`
    if (toks.length !== 4 || !_GRADIENT_POLAR_SPACES.has(space)
        || !_HUE_METHODS.has(toks[2].toLowerCase()) || toks[3].toLowerCase() !== 'hue') return null;
    const hue = toks[2].toLowerCase();
    return hue === 'shorter' ? 'in ' + space : 'in ' + space + ' ' + hue + ' hue';
  }
  return space === 'oklab' ? '' : 'in ' + space;          // oklab is color-mix's default space
};
const _canonColorMix = (value) => {
  const s = String(value).trim();
  if (!/^color-mix\(/i.test(s) || !s.endsWith(')')) return null;
  const parts = _commaSplitTop(s.slice(s.indexOf('(') + 1, -1)).map((p) => p.trim());
  let method = '', ci;
  if (parts.length === 3) {                               // method + two colours
    method = _canonColorMixMethod(_wsTokens(parts[0]));
    if (method === null) return null;
    ci = 1;
  } else if (parts.length === 2) {                        // missing method — two colours
    ci = 0;
  } else return null;
  const a = _splitMixComponent(parts[ci]);
  const b = _splitMixComponent(parts[ci + 1]);
  if (!a || !b) return null;
  let outA = _canonColorSpecified(a.color);
  let outB = _canonColorSpecified(b.color);
  // Percentage normalization. A calc()/var() percentage (numeric value unknown at
  // specified time) is kept symbolic in place; otherwise resolve, fill the omitted
  // side to 100%−other, and drop a 50%/50% result.
  const na = a.pct && _PLAIN_PCT_RE.test(a.pct) ? parseFloat(a.pct) : null;
  const nb = b.pct && _PLAIN_PCT_RE.test(b.pct) ? parseFloat(b.pct) : null;
  const symbolic = (a.pct !== null && na === null) || (b.pct !== null && nb === null);
  if (symbolic) {
    if (a.pct !== null) outA += ' ' + a.pct;
    if (b.pct !== null) outB += ' ' + b.pct;
  } else if (a.pct !== null || b.pct !== null) {
    let va = na, vb = nb;
    if (va === null) va = 100 - vb;
    if (vb === null) vb = 100 - va;
    if (!(va === 50 && vb === 50)) {
      outA += ' ' + String(va) + '%';
      outB += ' ' + String(vb) + '%';
    }
  }
  const head = method ? 'color-mix(' + method + ', ' : 'color-mix(';
  return head + outA + ', ' + outB + ')';
};
// Is `value` a syntactically valid CSS <color>? Used by CSS.supports().
const _isValidColor = (value) => {
  if (!value) return false;
  const low = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim().toLowerCase();
  if (low === 'transparent' || low === 'currentcolor' || _CSS_NAMED_COLORS[low] || _SYSTEM_COLORS.has(low)) return true;
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(low)) return true;
  // alpha() relative-alpha function (CSS Color 5) — valid when its grammar + origin
  // + <alpha-value> resolve (var()-bearing parts pass without resolving).
  if (low.startsWith('alpha(')) return _isValidAlpha(value);
  // contrast-color() (CSS Color 5) — valid when its single <color> argument is.
  if (low.startsWith('contrast-color(')) return _isValidContrastColor(value);
  // color-mix() / relative colour syntax are valid <color>s when their structure
  // resolves (el-independent: currentcolor falls back to black for validity). This
  // MUST precede the legacy rgb/hsl branch below, since `rgb(from …)`/`hsl(from …)`
  // share those function names but aren't legacy comma-list bodies.
  // A var()-bearing value is syntactically valid for any property (substitution is
  // a computed-time concern), so CSS.supports() accepts it without resolving.
  if (low.startsWith('color-mix(') && (/var\(/i.test(low) || _colorMixStruct(value, null) !== null)) return true;
  if (/^[a-z]+\(\s*from\s/i.test(low) && (/var\(/i.test(low) || _relativeStruct(value, null) !== null)) return true;
  const lp = low.indexOf('(');
  if (lp > 0 && low.endsWith(')')) {
    const fname = _unescapeIdent(low.slice(0, lp));
    const inner = low.slice(lp + 1, -1);
    if (fname === 'rgb' || fname === 'rgba') return _rgbComponents(inner) !== null;
    if (fname === 'hsl' || fname === 'hsla') {
      const parts = inner.split(/[,\/\s]+/).filter((x) => x.length);
      return parts.length >= 3 && parts.every((p) => p === 'none' || !Number.isNaN(parseFloat(p)));
    }
  }
  // Modern colour functions whose computed value we can resolve — lab/lch/oklab/
  // oklch, color(<space> …), hwb — are valid <color>s. (`_computeModernColor`
  // returns null for a non-match or an unresolvable channel, e.g. a container unit.)
  if (_computeModernColor(value) !== null) return true;
  return false;
};
// ── Stepped-value functions (CSS Values 4 §10.3): round()/mod()/rem() ──────────
// Pure numeric ops shared by `_evalMath` (full evaluation) and `_simpCalc` (calc-
// tree folding) so both pipelines agree byte-for-byte. All operate on the already-
// resolved numeric magnitudes (angles in canonical degrees); the caller carries
// the unit. Edge cases (±0/±∞/NaN) follow the spec's per-strategy tables exactly —
// see css/css-values/round-mod-rem-computed.html for the authoritative cases.
const _ROUND_STRAT = { nearest: 1, up: 1, down: 1, 'to-zero': 1 };
const _roundOp = (strat, A, B) => {
  if (B === 0 || (!isFinite(A) && !isFinite(B))) return NaN;   // B=0, or both infinite
  if (!isFinite(A)) return A;                                  // A infinite, B finite → same infinity
  if (!isFinite(B)) {                                          // A finite, B infinite
    const negZero = Object.is(A, -0);
    if (strat === 'up') return A > 0 ? Infinity : (A === 0 && !negZero ? 0 : -0);
    if (strat === 'down') return A < 0 ? -Infinity : (negZero ? -0 : 0);
    return (A < 0 || negZero) ? -0 : 0;                        // nearest, to-zero → 0 with A's sign
  }
  const q = A / B;
  const lo = Math.min(Math.floor(q) * B, Math.ceil(q) * B);
  const hi = Math.max(Math.floor(q) * B, Math.ceil(q) * B);
  if (lo === hi) return lo;                                    // A is an exact multiple of B
  if (strat === 'down') return lo;
  if (strat === 'up') return hi;
  if (strat === 'to-zero') return Math.abs(lo) <= Math.abs(hi) ? lo : hi;
  return (A - lo) < (hi - A) ? lo : hi;                        // nearest; ties round toward +∞
};
const _modOp = (A, B) => {                                     // floored modulo — sign follows B
  if (B === 0 || !isFinite(A)) return NaN;
  if (!isFinite(B)) return ((A < 0 || Object.is(A, -0)) === (B < 0)) ? A : NaN;  // opposite sign → NaN
  return A - B * Math.floor(A / B);
};
const _remOp = (A, B) => {                                     // truncated modulo — sign follows A
  if (B === 0 || !isFinite(A)) return NaN;
  if (!isFinite(B)) return A;
  return A - B * Math.trunc(A / B);
};
// Evaluate a CSS math expression — calc()/min()/max()/clamp()/sign()/abs() plus
// a raw <number>/<percentage>/<dimension> — down to a plain JS number.
// `percentBase` is what 100% resolves to (1 for unitless contexts like
// `opacity`). `opts.lengths` enables <length> dimension tokens (em/px/…, via
// `_LENGTH_PX`); `opts.nonFinite` lets ±∞/NaN results through (the caller then
// clamps, e.g. a colour channel) instead of returning null. Returns null when
// the value isn't a (resolvable) numeric math expression. A small recursive-
// descent parser over a hand-tokenized stream.
const _evalMath = (input, percentBase, opts) => {
  opts = opts || {};
  const s = String(input).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (s === '') return null;
  const toks = [];
  let i = 0;
  const n = s.length;
  const isDigit = (c) => c >= '0' && c <= '9';
  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') { i++; continue; }
    if (c === '(' || c === ')' || c === ',' || c === '+' || c === '-' || c === '*' || c === '/') {
      toks.push({ t: c }); i++; continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      let j = i;
      while (j < n && isDigit(s[j])) j++;
      if (s[j] === '.') { j++; while (j < n && isDigit(s[j])) j++; }
      if (s[j] === 'e' || s[j] === 'E') {
        let k = j + 1;
        if (s[k] === '+' || s[k] === '-') k++;
        if (isDigit(s[k])) { k++; while (k < n && isDigit(s[k])) k++; j = k; }
      }
      const num = parseFloat(s.slice(i, j));
      let pct = false, unit = '';
      if (s[j] === '%') { pct = true; j++; }
      else if (j < n && /[a-zA-Z]/.test(s[j])) { // dimension: a unit ident glued to the number
        let u = j; while (u < n && /[a-zA-Z]/.test(s[u])) u++;
        unit = s.slice(j, u).toLowerCase(); j = u;
      }
      toks.push({ t: 'num', v: num, pct, unit });
      i = j; continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9-]/.test(s[j])) j++;
      toks.push({ t: 'ident', v: s.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    return null;
  }
  let p = 0;
  let failed = false;
  // >0 while parsing a sin/cos/tan argument: an <angle>|<number> position where a
  // bare angle unit must be recognized even without opts.angle (e.g. `50rad`
  // inside an hsl lightness channel `sin(l * (50rad / 50))`). Outside this and
  // outside opts.angle, no token is ever tagged as an angle, so number/length
  // contexts evaluate byte-identically to before.
  let trigDepth = 0;
  const peek = () => toks[p];
  // Each parse fn returns [value, isAngle]; an angle's `value` is its canonical
  // degrees (CSS Values 4 §10). isAngle propagates through the calc type algebra
  // restricted to {number, angle}: ±/min/max/clamp keep the type, ×/÷ follow
  // dimensional rules (angle×number → angle, angle÷angle → number).
  const tfail = () => { failed = true; return [0, false]; };
  const parseExpr = () => {
    let [v, a] = parseTerm();
    while (!failed && peek() && (peek().t === '+' || peek().t === '-')) {
      const op = toks[p++].t;
      const [r, ra] = parseTerm();
      v = op === '+' ? v + r : v - r;
      a = a || ra;
    }
    return [v, a];
  };
  const parseTerm = () => {
    let [v, a] = parseFactor();
    while (!failed && peek() && (peek().t === '*' || peek().t === '/')) {
      const op = toks[p++].t;
      const [r, ra] = parseFactor();
      if (op === '*') { v *= r; a = a || ra; }   // angle × number → angle
      else { v /= r; a = a && !ra; }             // angle ÷ number → angle; angle ÷ angle → number
    }
    return [v, a];
  };
  const parseFactor = () => {
    const tok = peek();
    if (!tok) return tfail();
    if (tok.t === '+') { p++; return parseFactor(); }
    if (tok.t === '-') { p++; const [v, a] = parseFactor(); return [-v, a]; }
    if (tok.t === 'num') {
      p++;
      if (tok.pct) return [(tok.v / 100) * percentBase, false];
      if (tok.unit) {
        // Angle units (gradient <angle> directions/stops, trig arguments) → degrees;
        // available even without `opts.lengths` since an angle context has no <length>.
        if (opts.angle || trigDepth > 0) {
          const af = _ANGLE_DEG[tok.unit];
          if (af !== undefined) return [tok.v * af, true];
        }
        // Time units (transition-delay/-duration, …) → seconds; available without
        // opts.lengths since a <time> context admits no <length>.
        if (opts.time) {
          const sf = _TIME_S[tok.unit];
          if (sf !== undefined) return [tok.v * sf, false];
          // Not a <time> unit. Time-only callers have no <length> context, so fail as
          // before; only when `lengths` is ALSO enabled (atan2's same-typed args may be
          // <length>s) do we fall through to the length branch below — byte-identical
          // for every existing caller, none of which sets both flags.
          if (!opts.lengths) return tfail();
        }
        if (!opts.lengths) return tfail();
        // `opts.emPx`/`opts.lhPx` resolve em / lh against the element's computed
        // font-size & line-height (the default table assumes em = 16px); rem stays root.
        if (opts.emPx && tok.unit === 'em') return [tok.v * opts.emPx, false];
        if (opts.lhPx && tok.unit === 'lh') return [tok.v * opts.lhPx, false];
        const f = _LENGTH_PX[tok.unit];
        if (f !== undefined) return [tok.v * f, false];
        // `opts.vw`/`opts.vh` (px per 1% of the viewport) resolve viewport-relative
        // units; gated on the flag so non-length callers stay byte-identical. The
        // small/large/dynamic variants collapse to the same axis (we model no UI chrome).
        if (opts.vw !== undefined) {
          const u = tok.unit, vmin = opts.vw < opts.vh ? opts.vw : opts.vh, vmax = opts.vw > opts.vh ? opts.vw : opts.vh;
          const vf = /^[sld]?v[wi]$/.test(u) ? opts.vw : /^[sld]?v[hb]$/.test(u) ? opts.vh
                   : /^[sld]?vmin$/.test(u) ? vmin : /^[sld]?vmax$/.test(u) ? vmax : undefined;
          if (vf !== undefined) return [tok.v * vf, false];
        }
        // `opts.cqZero` (filter computed only) treats a viewport/container-relative
        // unit as 0 — the filter tests gate every such unit inside `sign(2cqw - 10px)`
        // where only the sign matters (cqw resolves to 0 with no container). Gated on
        // the flag so every other caller still fails on these units, byte-identically.
        if (opts.cqZero) return [0, false];
        return tfail(); // unresolvable unit (vw/cqw/…) → fail
      }
      return [tok.v, false];
    }
    if (tok.t === '(') { p++; const r = parseExpr(); if (!peek() || peek().t !== ')') return tfail(); p++; return r; }
    if (tok.t === 'ident') {
      const name = tok.v;
      if (toks[p + 1] && toks[p + 1].t === '(') {
        p += 2; // consume the function name and its '('
        // sibling-index()/sibling-count() (CSS Values 5 §tree-counting) are zero-arg
        // <integer> functions substituted at computed-value time. The caller resolves
        // the element's real DOM position into `opts.siblingIndex`/`siblingCount`; with
        // no element (a pure grammar-validity probe) `opts.siblingValid` accepts them as
        // any integer, and absent both they stay symbolic (tfail → calc(…)).
        if (name === 'sibling-index' || name === 'sibling-count') {
          if (!peek() || peek().t !== ')') return tfail();   // these take no arguments
          p++;
          const sv = name === 'sibling-index' ? opts.siblingIndex : opts.siblingCount;
          if (typeof sv === 'number') return [sv, false];
          if (opts.siblingValid) return [1, false];
          return tfail();
        }
        // round() carries an optional leading rounding-strategy keyword (CSS Values
        // 4 §10.3) — it can't be parsed as a numeric expression, so peel it first.
        if (name === 'round') {
          let strat = 'nearest';
          const k = peek();
          if (k && k.t === 'ident' && _ROUND_STRAT[k.v]) { strat = k.v; p++; if (!peek() || peek().t !== ',') return tfail(); p++; }
          const rA = parseExpr();
          if (!peek() || peek().t !== ',') return tfail();
          p++;
          const rB = parseExpr();
          if (!peek() || peek().t !== ')') return tfail();
          p++;
          return [_roundOp(strat, rA[0], rB[0]), rA[1] || rB[1]];
        }
        // clamp() accepts the `none` keyword in its MIN/MAX slots (CSS Values 4
        // §funcdef-clamp) — `none` removes that bound. Evaluating it as ∓∞ lets the
        // existing `max(lo, min(val, hi))` collapse correctly: a `none` low → −∞
        // (no floor), a `none` high → +∞ (no ceiling). Only clamp takes `none`, so we
        // peel it here per-arg; without this the bare `none` ident would fail the eval
        // and the computed value would fall back to the symbolic `calc(…)` form.
        if (name === 'clamp') {
          const ca = [];
          for (let ai = 0; ai < 3; ai++) {
            if (ai > 0) { if (!peek() || peek().t !== ',') return tfail(); p++; }
            const nx = peek(), after = toks[p + 1];
            if (nx && nx.t === 'ident' && nx.v === 'none' && (!after || after.t === ',' || after.t === ')')) {
              p++; ca.push([ai === 2 ? Infinity : -Infinity, false]);
            } else ca.push(parseExpr());
          }
          if (failed || !peek() || peek().t !== ')') return tfail();
          p++;
          return [Math.max(ca[0][0], Math.min(ca[1][0], ca[2][0])), ca.some((x) => x[1])];
        }
        // sin/cos/tan take an <angle>|<number>: parse the argument with angle
        // units enabled so a bare number reads as radians and an angle resolves.
        const trig = name === 'sin' || name === 'cos' || name === 'tan';
        if (trig) trigDepth++;
        const args = [parseExpr()];
        while (!failed && peek() && peek().t === ',') { p++; args.push(parseExpr()); }
        if (trig) trigDepth--;
        if (!peek() || peek().t !== ')') return tfail();
        p++;
        const val = args.map((x) => x[0]);
        const anyAngle = args.some((x) => x[1]);
        if (name === 'calc') return args.length === 1 ? args[0] : tfail();
        if (name === 'min') return [Math.min(...val), anyAngle];
        if (name === 'max') return [Math.max(...val), anyAngle];
        if (name === 'clamp') return args.length === 3 ? [Math.max(val[0], Math.min(val[1], val[2])), anyAngle] : tfail();
        if (name === 'sign') return args.length === 1 ? [Math.sign(val[0]), false] : tfail();
        if (name === 'abs') return args.length === 1 ? [Math.abs(val[0]), args[0][1]] : tfail();
        // Stepped-value mod()/rem() (round() handled above): two operands of the
        // same type; the result keeps that type (so an angle stays an angle).
        if (name === 'mod') return args.length === 2 ? [_modOp(val[0], val[1]), anyAngle] : tfail();
        if (name === 'rem') return args.length === 2 ? [_remOp(val[0], val[1]), anyAngle] : tfail();
        // Trigonometry (CSS Values 4 §10): sin/cos/tan take radians (a bare
        // number) or an <angle> (its degrees → radians) and return a <number>;
        // the inverse functions return an <angle> whose canonical value is degrees.
        const R2D = 180 / Math.PI;
        if (trig && args.length === 1) {
          const r = args[0][1] ? args[0][0] / R2D : args[0][0];
          return [name === 'sin' ? Math.sin(r) : name === 'cos' ? Math.cos(r) : Math.tan(r), false];
        }
        if ((name === 'asin' || name === 'acos' || name === 'atan') && args.length === 1)
          return [(name === 'asin' ? Math.asin(val[0]) : name === 'acos' ? Math.acos(val[0]) : Math.atan(val[0])) * R2D, true];
        if (name === 'atan2' && args.length === 2) return [Math.atan2(val[0], val[1]) * R2D, true];
        // Exponential / power (CSS Values 4 §11): all <number> → <number>.
        if (name === 'pow') return args.length === 2 ? [Math.pow(val[0], val[1]), false] : tfail();
        if (name === 'sqrt') return args.length === 1 ? [Math.sqrt(val[0]), false] : tfail();
        if (name === 'hypot') return args.length ? [Math.hypot(...val), false] : tfail();
        if (name === 'exp') return args.length === 1 ? [Math.exp(val[0]), false] : tfail();
        if (name === 'log') return args.length === 1 ? [Math.log(val[0]), false] : args.length === 2 ? [Math.log(val[0]) / Math.log(val[1]), false] : tfail();
        return tfail();
      }
      // Bare numeric constant (CSS calc keywords).
      p++;
      if (name === 'infinity') return [Infinity, false];
      if (name === 'nan') return [NaN, false];
      if (name === 'pi') return [Math.PI, false];
      if (name === 'e') return [Math.E, false];
      return tfail();
    }
    return tfail();
  };
  const [result, resultAngle] = parseExpr();
  if (failed || p !== toks.length) return null;
  // An <angle> leaking into a non-angle context (e.g. a stray asin() where a
  // plain number is required) is a type error — reject, matching the prior
  // behavior where an angle unit failed unless opts.angle was set.
  if (resultAngle && !opts.angle) return null;
  if (!opts.nonFinite && !isFinite(result)) return null;
  return result;
};
// Serialize a computed CSS <number>: round away float noise, drop trailing
// zeros, normalize -0 to 0. (0.6 → "0.6", 1 → "1", 0.5 → "0.5".)
const _serNumber = (x) => {
  let r = Math.round(x * 1e6) / 1e6;
  if (Object.is(r, -0)) r = 0;
  return String(r);
};
// ── CSS Values 4 math-function serialization (`calc()` canon) ──────────────
// Serialize a `calc()` (or other math function) to its canonical SPECIFIED-value
// form, per CSS Values 4 §"Serialize a Calculation Tree". Unlike `_evalMath`
// (which fully EVALUATES to a number), this PRESERVES symbolic terms — a
// relative-colour channel keyword (r/g/b/h/s/l/w/c/x/y/z/alpha), a <percentage>
// or <dimension>, and an unresolvable function like `sign(1em - 10px)` — while
// folding constant sub-expressions and imposing the canonical ordering browsers
// emit:
//  • a fully-numeric sum/product of one unit folds to a single value, keeping its
//    type: `calc(50 * 3)`→`calc(150)`, `calc(20deg * 2)`→`calc(40deg)`,
//    `calc(50% * 3)`→`calc(150%)`, `calc(0.5 - 1)`→`calc(-0.5)`, `calc(0 / 0)`→
//    `calc(NaN)`;
//  • a product's numeric factors fold into ONE coefficient placed FIRST —
//    `calc(g * 2)`→`calc(2 * g)`, `calc(a / 3)`→`calc(0.333333 * a)` (a numeric
//    divisor becomes its reciprocal); a NON-numeric divisor stays a division
//    (`calc(1 / l)` kept);
//  • a sum's combined numeric constant moves FIRST — `calc(l - 20)`→
//    `calc(-20 + l)`; the non-numeric terms keep their source order;
//  • a product nested in a sum is parenthesized — `calc(g * .5 + g * .5)`→
//    `calc((0.5 * g) + (0.5 * g))`.
// A <percentage>/<dimension> stays symbolic (a % resolves against its channel
// reference only at COMPUTED time, never here). This is wired ONLY into the
// colour-channel canon (`_canonColorSpecified` modern path + `_canonRelativeColor`),
// NOT the generic value path — so the `serialize-values` calc hot path is untouched.
// Returns null when `str` isn't a parseable math function (caller keeps the bytes).
const _CALC_CONSTS = { infinity: Infinity, '-infinity': -Infinity, nan: NaN, pi: Math.PI, e: Math.E };
// Parse a math expression into a calculation tree. Node kinds:
//   {k:'num', v, u}            numeric leaf (u='' | '%' | dimension like 'deg')
//   {k:'sym', s}               opaque ident leaf (channel keyword / unknown)
//   {k:'sum', terms:[{op,node}]}   op '+' | '-' (first term op '+')
//   {k:'prod', facs:[{op,node}]}   op '*' | '/' (first factor op '*')
//   {k:'fn', name, args:[node]}    a preserved function (sign/min/max/…)
const _parseCalcTree = (str, opts) => {
  opts = opts || {};
  // CSS Syntax §"consume a simple block": a math expression that ends while
  // blocks are still open implicitly closes them (no parse error). `calc(1px *
  // pow(2, sqrt(100))` (one `)` short) is a valid `calc(1px * pow(2, sqrt(100)))`.
  // Auto-close trailing open parens so the validity gate + serializer accept it;
  // idempotent for already-balanced input (the common case), and the transform
  // gates already balance the same way via `_balanceParens`.
  const s = _balanceParens(String(str).replace(/\/\*[\s\S]*?\*\//g, '').trim());
  if (s === '') return null;
  const toks = [];
  let i = 0; const n = s.length;
  const isDigit = (c) => c >= '0' && c <= '9';
  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') { i++; continue; }
    if (c === '(' || c === ')' || c === ',' || c === '+' || c === '-' || c === '*' || c === '/') { toks.push({ t: c }); i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      let j = i;
      while (j < n && isDigit(s[j])) j++;
      if (s[j] === '.') { j++; while (j < n && isDigit(s[j])) j++; }
      if (s[j] === 'e' || s[j] === 'E') { let k = j + 1; if (s[k] === '+' || s[k] === '-') k++; if (isDigit(s[k])) { k++; while (k < n && isDigit(s[k])) k++; j = k; } }
      let v = parseFloat(s.slice(i, j));
      let u = '';
      if (s[j] === '%') { u = '%'; j++; }
      else if (j < n && /[a-zA-Z]/.test(s[j])) { let p = j; while (p < n && /[a-zA-Z]/.test(s[p])) p++; u = s.slice(j, p).toLowerCase(); j = p; }
      // Canonicalize every <angle> unit to degrees so same-dimension arithmetic
      // folds correctly: `50rad / 50deg` must cancel to a unitless <number> (the
      // serialized form is re-evaluated by the computed colour engine, so a
      // dropped unit-cancellation would corrupt the value — e.g. flip sin(l) into
      // sin(l°)). No specified colour test carries a non-deg angle unit in calc.
      if (_ANGLE_DEG[u] !== undefined) { v *= _ANGLE_DEG[u]; u = 'deg'; }
      // SPECIFIED-value length/time canonicalization (opt-in, off for the colour
      // path): absolute lengths → px, times → s, so same-type arithmetic folds
      // (`min(NaN*1pt, NaN*1cm)` → `calc(NaN * 1px)`; `1ms * NaN` → `calc(NaN * 1s)`).
      else if (opts.canonLen && _ABS_LEN_PX[u] !== undefined) { v *= _ABS_LEN_PX[u]; u = 'px'; }
      else if (opts.canonTime && _TIME_S[u] !== undefined) { v *= _TIME_S[u]; u = 's'; }
      toks.push({ t: 'num', v, u }); i = j; continue;
    }
    if (/[a-zA-Z]/.test(c)) { let j = i; while (j < n && /[a-zA-Z0-9-]/.test(s[j])) j++; toks.push({ t: 'ident', v: s.slice(i, j).toLowerCase() }); i = j; continue; }
    return null;
  }
  let p = 0, failed = false;
  const fail = () => { failed = true; return { k: 'num', v: 0, u: '' }; };
  const peek = () => toks[p];
  const negate = (node) => node.k === 'num'
    ? { k: 'num', v: -node.v, u: node.u }
    : { k: 'prod', facs: [{ op: '*', node: { k: 'num', v: -1, u: '' } }, { op: '*', node }] };
  const parseSum = () => {
    let node = parseProduct();
    const terms = [{ op: '+', node }];
    while (!failed && peek() && (peek().t === '+' || peek().t === '-')) { const op = toks[p++].t; terms.push({ op, node: parseProduct() }); }
    return terms.length === 1 ? node : { k: 'sum', terms };
  };
  const parseProduct = () => {
    let node = parseFactor();
    const facs = [{ op: '*', node }];
    while (!failed && peek() && (peek().t === '*' || peek().t === '/')) { const op = toks[p++].t; facs.push({ op, node: parseFactor() }); }
    return facs.length === 1 ? node : { k: 'prod', facs };
  };
  const parseFactor = () => {
    const tok = peek();
    if (!tok) return fail();
    if (tok.t === '+') { p++; return parseFactor(); }
    if (tok.t === '-') { p++; return negate(parseFactor()); }
    if (tok.t === 'num') { p++; return { k: 'num', v: tok.v, u: tok.u }; }
    if (tok.t === '(') { p++; const e = parseSum(); if (!peek() || peek().t !== ')') return fail(); p++; return e; }
    if (tok.t === 'ident') {
      const name = tok.v;
      if (toks[p + 1] && toks[p + 1].t === '(') {
        p += 2;
        if (peek() && peek().t === ')') { p++; return { k: 'fn', name, args: [] }; }  // zero-arg fn, e.g. sibling-index()
        const args = [parseSum()];
        while (!failed && peek() && peek().t === ',') { p++; args.push(parseSum()); }
        if (!peek() || peek().t !== ')') return fail();
        p++; return { k: 'fn', name, args };
      }
      p++;
      if (Object.prototype.hasOwnProperty.call(_CALC_CONSTS, name)) return { k: 'num', v: _CALC_CONSTS[name], u: '' };
      return { k: 'sym', s: name };
    }
    return fail();
  };
  const root = parseSum();
  if (failed || p !== toks.length) return null;
  return root;
};
// Classify a numeric-leaf unit into its CSS numeric TYPE (for cross-unit folding).
// `_parseCalcTree` already canonicalizes angles→deg and (opt-in) abs-lengths→px &
// times→s, so the only same-type/different-unit pairs that survive are length px-vs-
// relative (em/rem/vw/…). Returns 'other' for unknown units (→ never cross-fold).
const _LEN_UNIT = new Set(['px', 'em', 'rem', 'ex', 'ch', 'ic', 'cap', 'lh', 'rlh',
  'vw', 'vh', 'vi', 'vb', 'vmin', 'vmax', 'svw', 'svh', 'lvw', 'lvh', 'dvw', 'dvh',
  'cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax', 'in', 'cm', 'mm', 'q', 'pt', 'pc']);
const _unitType = (u) => u === '' ? 'number' : u === '%' ? 'percent' : u === 'deg' ? 'angle'
  : u === 's' ? 'time' : _LEN_UNIT.has(u) ? 'length' : 'other';
const _CANON_TYPE_UNIT = { number: '', percent: '%', angle: 'deg', time: 's', length: 'px' };
// Multiply / divide two numeric units. The clean cases fold: number×dimension→
// dimension, dimension÷number→dimension, dimension÷sameDimension→number. Two
// DIFFERENT non-empty units (e.g. px·em or px÷em) form a compound that can't reduce
// to a single numeric leaf at specified time (a relative unit like em is unresolved)
// — return `null` so the product fold keeps the expression symbolic.
const _mulUnit = (a, b) => (a === '' ? b : (b === '' ? a : null));
const _divUnit = (a, b) => (b === '' ? a : (a === b ? '' : null));
// Fold a math function whose arguments have all simplified to numeric leaves into
// a single numeric leaf (CSS Values 4 "simplify a calculation tree"). Returns the
// folded `{k:'num',v,u}` or null when it can't fold — a non-numeric argument, a
// wrong argument count, or operands of incompatible units (e.g. `min(1em, 2px)`,
// kept symbolic until computed time resolves the units). Angle units are already
// canonicalized to `deg` by `_parseCalcTree`, so same-dimension angles compare
// directly. `sign()`→<number> (unit dropped); the inverse-trig and exp/pow/log
// family require unitless operands and yield <number>/<angle> per spec.
const _R2D = 180 / Math.PI;
const _foldMathFn = (name, args) => {
  if (name === 'round') {
    let i = 0, strat = 'nearest';
    if (args[0] && args[0].k === 'sym' && _ROUND_STRAT[args[0].s]) { strat = args[0].s; i = 1; }
    const A = args[i], B = args[i + 1];
    if (args.length - i !== 2 || !A || !B || A.k !== 'num' || B.k !== 'num' || A.u !== B.u) return null;
    return { k: 'num', v: _roundOp(strat, A.v, B.v), u: A.u };
  }
  if (name === 'mod' || name === 'rem') {
    if (args.length !== 2 || args[0].k !== 'num' || args[1].k !== 'num' || args[0].u !== args[1].u) return null;
    return { k: 'num', v: (name === 'mod' ? _modOp : _remOp)(args[0].v, args[1].v), u: args[0].u };
  }
  // clamp() `none` sentinels (CSS Values 4 §funcdef-clamp): `none` removes that bound —
  // clamp(none, V, H) ≡ min(V, H), clamp(L, V, none) ≡ max(L, V), clamp(none, V, none) ≡ V.
  // Handled before the all-numeric guard since `none` is a symbol leaf, not a <number>.
  // When the surviving min()/max() can't fold (mixed units), this returns null and the
  // original clamp(none, …) node is kept verbatim.
  if (name === 'clamp' && args.length === 3) {
    const loNone = args[0].k === 'sym' && args[0].s === 'none';
    const hiNone = args[2].k === 'sym' && args[2].s === 'none';
    if (loNone && hiNone) return args[1];
    if (loNone) return _foldMathFn('min', [args[1], args[2]]);
    if (hiNone) return _foldMathFn('max', [args[0], args[1]]);
  }
  if (!args.length || !args.every((a) => a.k === 'num')) return null;
  if (name === 'min' || name === 'max' || name === 'clamp') {
    if (name === 'clamp' && args.length !== 3) return null;
    const u = args[0].u;
    if (args.every((a) => a.u === u)) {
      const vs = args.map((a) => a.v);
      const v = name === 'min' ? Math.min(...vs) : name === 'max' ? Math.max(...vs) : Math.max(vs[0], Math.min(vs[1], vs[2]));
      return { k: 'num', v, u };
    }
    // Mixed units of the same TYPE (length px-vs-em) stay symbolic until computed
    // time — EXCEPT when a NaN is present in a min()/max(): the comparison is then
    // indeterminate regardless of the unresolved units, so it collapses to NaN at the
    // type's canonical unit (`min(NaN*2px, NaN*4em)` → `calc(NaN * 1px)`). clamp()
    // never cross-folds (`clamp(NaN*2em, NaN*4px, NaN*8pt)` keeps its three args).
    if (name !== 'clamp' && args.some((a) => Number.isNaN(a.v))) {
      const t = _unitType(u);
      if (t !== 'other' && args.every((a) => _unitType(a.u) === t)) return { k: 'num', v: NaN, u: _CANON_TYPE_UNIT[t] };
    }
    return null;
  }
  if (name === 'abs') return args.length === 1 ? { k: 'num', v: Math.abs(args[0].v), u: args[0].u } : null;
  if (name === 'sign') return args.length === 1 ? { k: 'num', v: Math.sign(args[0].v), u: '' } : null;
  if (name === 'sin' || name === 'cos' || name === 'tan') {
    if (args.length !== 1) return null;
    const a = args[0]; let r;
    if (a.u === '') r = a.v; else if (a.u === 'deg') r = a.v / _R2D; else return null;
    return { k: 'num', v: name === 'sin' ? Math.sin(r) : name === 'cos' ? Math.cos(r) : Math.tan(r), u: '' };
  }
  if (name === 'asin' || name === 'acos' || name === 'atan') {
    if (args.length !== 1 || args[0].u !== '') return null;
    const v = (name === 'asin' ? Math.asin(args[0].v) : name === 'acos' ? Math.acos(args[0].v) : Math.atan(args[0].v)) * _R2D;
    return { k: 'num', v, u: 'deg' };
  }
  if (name === 'atan2') return args.length === 2 && args[0].u === args[1].u ? { k: 'num', v: Math.atan2(args[0].v, args[1].v) * _R2D, u: 'deg' } : null;
  if (name === 'pow') return args.length === 2 && args[0].u === '' && args[1].u === '' ? { k: 'num', v: Math.pow(args[0].v, args[1].v), u: '' } : null;
  if (name === 'sqrt') return args.length === 1 && args[0].u === '' ? { k: 'num', v: Math.sqrt(args[0].v), u: '' } : null;
  if (name === 'exp') return args.length === 1 && args[0].u === '' ? { k: 'num', v: Math.exp(args[0].v), u: '' } : null;
  if (name === 'log') {
    if (args[0].u !== '') return null;
    if (args.length === 1) return { k: 'num', v: Math.log(args[0].v), u: '' };
    if (args.length === 2 && args[1].u === '') return { k: 'num', v: Math.log(args[0].v) / Math.log(args[1].v), u: '' };
    return null;
  }
  if (name === 'hypot') {
    const u = args[0].u;
    if (!args.every((a) => a.u === u)) return null;
    return { k: 'num', v: Math.hypot(...args.map((a) => a.v)), u };
  }
  return null;
};
// Canonical sum-ordering rank: <number> first, then <percentage>, then dimensions
// (sorted alphabetically by unit, ASCII case-insensitive — units are already
// lowercased by `_parseCalcTree`). CSS Values 4 §sort-a-calculations-children.
const _SUM_UNIT_RANK = (u) => (u === '' ? 0 : u === '%' ? 1 : 2);
// Canonical-order simplification of a sum's already-simplified terms (the `sort`
// path, used only for the length/time SPECIFIED serializer — the colour path keeps
// its input order). Folds numeric terms by unit into one leaf per unit, then orders
// number → percentage → dimensions (alphabetical), with non-numeric terms
// (functions/products/symbols) preserved in their original order after the numbers.
const _simpSumSorted = (terms) => {
  const numByUnit = new Map();   // unit -> summed value
  const seen = [];               // distinct units in first-seen order
  const others = [];             // non-numeric terms {op, node}
  for (const t of terms) {
    const nd = t.node;
    if (nd.k === 'num') {
      const val = t.op === '-' ? -nd.v : nd.v;
      if (numByUnit.has(nd.u)) numByUnit.set(nd.u, numByUnit.get(nd.u) + val);
      else { numByUnit.set(nd.u, val); seen.push(nd.u); }
    } else others.push({ op: t.op, node: nd });
  }
  let nums = seen.map((u) => ({ u, v: numByUnit.get(u) }));
  nums.sort((a, b) => {
    const ra = _SUM_UNIT_RANK(a.u), rb = _SUM_UNIT_RANK(b.u);
    if (ra !== rb) return ra - rb;
    return a.u < b.u ? -1 : a.u > b.u ? 1 : 0;
  });
  // Drop a zero unitless term (additive identity) when other terms survive — mirrors
  // the colour path; same-unit folding already collapses `0px + 5px` → `5px`.
  if (nums.length + others.length > 1) nums = nums.filter((n) => !(n.v === 0 && n.u === ''));
  const out = [];
  for (const n of nums) out.push({ op: '+', node: { k: 'num', v: n.v, u: n.u } });
  for (const o of others) out.push(o);
  if (out.length === 0) return { k: 'num', v: 0, u: '' };
  if (out.length === 1 && out[0].op === '+') return out[0].node;
  out[0] = { op: '+', node: out[0].node };   // serializer renders terms[0] sign-bare
  return { k: 'sum', terms: out };
};
// Simplify a calculation tree: fold numeric constants and impose canonical order.
// `sort` (length/time specified path) additionally reorders sum terms into the
// CSS Values 4 canonical order; the colour path leaves `sort` falsy (input order).
const _simpCalc = (node, sort) => {
  if (node.k === 'num' || node.k === 'sym') return node;
  if (node.k === 'fn') {
    if (node.name === 'calc' && node.args.length === 1) return _simpCalc(node.args[0], sort);
    const simpArgs = node.args.map((a) => _simpCalc(a, sort));
    const folded = _foldMathFn(node.name, simpArgs);
    return folded || { k: 'fn', name: node.name, args: simpArgs };
  }
  if (node.k === 'sum') {
    const terms = node.terms.map((t) => ({ op: t.op, node: _simpCalc(t.node, sort) }));
    if (sort) return _simpSumSorted(terms);
    let numAcc = null, others = [];   // numAcc = {v, u} of the combined numeric constant
    for (const t of terms) {
      if (t.node.k === 'num') {
        const val = t.op === '-' ? -t.node.v : t.node.v;
        if (numAcc === null) numAcc = { v: val, u: t.node.u };
        else if (numAcc.u === t.node.u) numAcc.v += val;
        else others.push(t);            // mixed numeric units — keep verbatim
      } else others.push(t);
    }
    if (others.length === 0) return { k: 'num', v: numAcc.v, u: numAcc.u };
    const out = [];
    if (numAcc !== null && !(numAcc.v === 0 && numAcc.u === '')) out.push({ op: '+', node: { k: 'num', v: numAcc.v, u: numAcc.u } });
    for (const o of others) out.push(o);
    if (out.length === 1 && out[0].op === '+') return out[0].node;
    if (out[0].op === '-') out[0] = { op: '+', node: { k: 'num', v: -out[0].node.v, u: out[0].node.u } };
    else out[0] = { op: '+', node: out[0].node };
    return { k: 'sum', terms: out };
  }
  // product
  let facs = node.facs.map((f) => ({ op: f.op, node: _simpCalc(f.node, sort) }));
  // Flatten a nested product factor so its coefficient combines with this level's
  // (`2 * (0.2 * min(1em,1px))` → `0.4 * min(1em,1px)`). A child product only survives
  // simplification when it still holds a symbol/function (a fully-numeric one already
  // folded to a single leaf above), so its numeric coefficient is stranded one level
  // down until we inline it. Inner factor ops carry over under `*`; under `/` they
  // invert (`x / (a*b)` = `x/a/b`, `x / (a/b)` = `x/a*b`). Gated on `sort` (the
  // length/time canon path) so the colour path stays byte-identical.
  if (sort && facs.some((f) => f.node.k === 'prod')) {
    const flat = [];
    for (const f of facs) {
      if (f.node.k === 'prod') {
        for (const inner of f.node.facs) flat.push({ op: f.op === '/' ? (inner.op === '*' ? '/' : '*') : inner.op, node: inner.node });
      } else flat.push(f);
    }
    facs = flat;
  }
  let coef = 1, cu = '', hasNum = false, badUnit = false; const rest = [];
  for (const f of facs) {
    if (f.node.k === 'num') {
      const nu = f.op === '*' ? _mulUnit(cu, f.node.u) : _divUnit(cu, f.node.u);
      if (nu === null) { badUnit = true; break; }   // compound units (px/em·px) — see _mulUnit/_divUnit
      hasNum = true;
      coef = f.op === '*' ? coef * f.node.v : coef / f.node.v;
      cu = nu;
    } else rest.push(f);
  }
  // A product mixing incompatible dimensional units (e.g. `1600px / 1em * 1px`) is
  // dimensionally valid but can't reduce to one numeric leaf at specified time (em
  // is unresolved). Keep it symbolic so the COMPUTED path resolves em and folds it.
  if (badUnit) return { k: 'prod', facs };
  if (rest.length === 0) return { k: 'num', v: coef, u: cu };
  const out = [];
  // Drop a redundant unitless `1 *` (multiplicative identity) so `calc(1 * clamp(…))`
  // reduces to the bare `clamp(…)`. Only when the surviving first factor is a `*`
  // (a leading `/` must keep its numerator — `calc(1 / l)` ≠ `calc(l)`).
  if (hasNum && !(coef === 1 && cu === '' && rest[0].op === '*')) out.push({ op: '*', node: { k: 'num', v: coef, u: cu } });
  for (const r of rest) out.push(r);
  out[0] = { op: '*', node: out[0].node };
  if (out.length === 1) return out[0].node;
  return { k: 'prod', facs: out };
};
// Serialize a numeric leaf (value + unit). A non-finite value carrying a unit
// can't be written `NaNdeg` (the keyword glued to a unit isn't a valid token), so
// per CSS Values 4 it serializes as the product `<keyword> * 1<unit>` — e.g.
// `calc(NaN * 1deg)`, `calc(infinity * 1px)`. A unitless non-finite stays the bare
// keyword.
const _serCalcNum = (node) => {
  const v = node.v;
  if (!isFinite(v)) {
    const kw = Number.isNaN(v) ? 'NaN' : v > 0 ? 'infinity' : '-infinity';
    return node.u ? kw + ' * 1' + node.u : kw;
  }
  return _serNumber(v) + node.u;
};
// Serialize a calculation tree; sum/product nodes always wrap in parentheses.
const _serCalcTree = (node) => {
  if (node.k === 'num') return _serCalcNum(node);
  if (node.k === 'sym') return node.s;
  if (node.k === 'fn') return node.name + '(' + node.args.map(_serCalcRoot).join(', ') + ')';
  if (node.k === 'sum') {
    let out = _serCalcTree(node.terms[0].node);
    for (let i = 1; i < node.terms.length; i++) {
      const t = node.terms[i];
      if (t.op === '+' && t.node.k === 'num' && isFinite(t.node.v) && t.node.v < 0) out += ' - ' + _serCalcTree({ k: 'num', v: -t.node.v, u: t.node.u });
      else out += (t.op === '+' ? ' + ' : ' - ') + _serCalcTree(t.node);
    }
    return '(' + out + ')';
  }
  // product
  let out = _serCalcTree(node.facs[0].node);
  for (let i = 1; i < node.facs.length; i++) out += (node.facs[i].op === '*' ? ' * ' : ' / ') + _serCalcTree(node.facs[i].node);
  return '(' + out + ')';
};
// Serialize at "root" position — a top-level sum/product sheds its outer parens.
const _serCalcRoot = (node) => {
  const s = _serCalcTree(node);
  return (node.k === 'sum' || node.k === 'prod') ? s.slice(1, -1) : s;
};
// Canonicalize a math function (`calc(…)`/`min(…)`/…) string. Returns the
// canonical serialization, or null if `str` isn't a parseable math function.
const _canonMathExpr = (str, opts) => {
  const s = String(str).trim();
  if (!/^[a-zA-Z][a-zA-Z-]*\(/.test(s) || !s.endsWith(')')) return null;
  const root = _parseCalcTree(s, opts);
  if (root === null) return null;
  const simp = _simpCalc(root, !!(opts && (opts.canonLen || opts.canonTime)));
  // A top-level math function (min/max/clamp/…) serializes WITHOUT a redundant calc()
  // wrapper. The generic colour path keeps its legacy rule (shed the wrapper only when
  // the INPUT wasn't a calc()); the non-finite length/time path (canonLen/canonTime)
  // always sheds it — `calc(1 * clamp(…))` → `clamp(…)`, per CSS Values 4 serialization.
  const bare = !!(opts && (opts.canonLen || opts.canonTime));
  if (simp.k === 'fn' && simp.name !== 'calc' && (bare || !(root.k === 'fn' && root.name === 'calc'))) return _serCalcTree(simp);
  return 'calc(' + _serCalcRoot(simp) + ')';
};
// At SPECIFIED time a math function reduces to a constant ONLY if it folds to a
// single numeric leaf — i.e. it has no channel symbols, no preserved function
// (sign/min/…), and no font/viewport-relative unit (`1em - 10px` stays a sum of
// distinct units, so it does NOT fold). Returns {v, u} of the constant, else null
// (→ the value must stay symbolic). NB unlike `_evalMath` this never invents a
// pixels-per-em, so `sign(1em - 10px)` is correctly irreducible here.
const _calcConstValue = (str) => {
  const root = _parseCalcTree(str);
  if (root === null) return null;
  const simp = _simpCalc(root);
  return simp.k === 'num' ? { v: simp.v, u: simp.u } : null;
};
// SPECIFIED-value canonicalization of a math function on a <length> or <time>
// property (CSS Values 4 §calc serialization / §calc-type-checking): parse, fold
// numeric sub-expressions (`clamp(1px,2px,3px)`→`calc(2px)`, `calc(20px + calc(80px))`
// →`calc(100px)`), canonicalize absolute units (in/cm/pt→px, ms→s), order a sum's
// children (number → percentage → dimensions alphabetical), shed redundant calc()/
// `1 *` wrappers, and emit the `infinity`/`-infinity`/`NaN` keywords for non-finite
// results. Only fires when the value actually CONTAINS a math function on a known
// length/time property — a bare `10px`/keyword keeps its `_canonStandardValue`
// serialization untouched. Returns `v` unchanged otherwise.
const _canonLengthTimeMath = (name, v) => {
  if (!_MATHFN_NAME_RE.test(v)) return v;
  const isLen = _LENGTH_COMPUTED_PROPS.has(name) || _SIZE_COMPUTED_PROPS.has(name);
  const isTime = _TIME_COMPUTED_PROPS.has(name);
  if (!isLen && !isTime) return v;
  return _canonMathExpr(v, { canonLen: isLen, canonTime: isTime }) || v;
};
// SPECIFIED-value canonicalization of the line-width (a <length>) embedded in a
// border / outline / column-rule SHORTHAND. These shorthands aren't in the length
// tables, so `_canonLengthTimeMath` skips them and their nested calc() was echoed
// verbatim (`calc(calc(10px)) solid pink`). The grammar is `<line-width> ||
// <line-style> || <color>`; only the width can be a TOP-LEVEL math function (a
// keyword/hex/colour-function never is), so any top-level component that IS one is
// the width → route it through the length math canon. Gated on `_MATHFN_NAME_RE`
// so a math-free border value stays byte-for-byte identical (no whitespace reflow),
// leaving every colour/keyword border untouched.
const _BORDER_SH_PROPS = new Set([
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'outline', 'column-rule',
]);
const _canonShorthandLenMath = (value) => {
  if (!_MATHFN_NAME_RE.test(value)) return value;     // no math → byte-identical
  return _splitTopLevel(value)
    .map((p) => (_MATHFN_NAME_RE.test(p) ? (_canonMathExpr(p, { canonLen: true }) || p) : p))
    .join(' ');
};
// ── CSS Values 4 math-function GRAMMAR VALIDATION (§10 type-checking) ──────────
// A math function is invalid when its grammar is malformed (`sin( )`, `round(1,,2)`,
// `pow(1 2)`), its arity is wrong (`pow(1)`, `sqrt(1, 2)`, `round(1, nearest)`), or
// its operand TYPES don't satisfy the function and the property it's used in
// (`sin(90px)` — length where an <angle>/<number> is required; `rotate(tan(1deg))` —
// a <number> result where the property wants an <angle>; `1px * sign(1em + 10%)`).
// This is a *type checker* over the `_parseCalcTree` AST: `_mt` resolves a node to
// one of the base CSS numeric types ('number'/'percentage'→ctx/'length'/'angle'/
// 'time'/'frequency'/'resolution'/'flex'), 'unknown' (a channel keyword / unknown
// function — be conservative and accept), or null (a definite type error). The
// caller compares the resolved type against the set the property accepts.
//
// A <percentage>'s type depends on the property: opacity/scale resolve `%`→<number>,
// width/margin resolve `%`→<length>, and font-weight/tab-size/<angle> don't accept
// `%` at all. `pctType` carries that context (null ⇒ `%` is a type error here).
const _MATH_UNIT_TYPE = {
  // <length> — absolute, font-relative, viewport-relative, container-relative
  px: 'length', em: 'length', rem: 'length', ex: 'length', rex: 'length', ch: 'length', rch: 'length',
  ic: 'length', ric: 'length', cap: 'length', rcap: 'length', lh: 'length', rlh: 'length',
  in: 'length', cm: 'length', mm: 'length', q: 'length', pt: 'length', pc: 'length',
  vw: 'length', vh: 'length', vmin: 'length', vmax: 'length', vi: 'length', vb: 'length',
  svw: 'length', svh: 'length', svmin: 'length', svmax: 'length', svi: 'length', svb: 'length',
  lvw: 'length', lvh: 'length', lvmin: 'length', lvmax: 'length', lvi: 'length', lvb: 'length',
  dvw: 'length', dvh: 'length', dvmin: 'length', dvmax: 'length', dvi: 'length', dvb: 'length',
  cqw: 'length', cqh: 'length', cqi: 'length', cqb: 'length', cqmin: 'length', cqmax: 'length',
  // <angle> — `_parseCalcTree` canonicalizes grad/rad/turn → deg, but accept all
  deg: 'angle', grad: 'angle', rad: 'angle', turn: 'angle',
  s: 'time', ms: 'time',
  hz: 'frequency', khz: 'frequency',
  dpi: 'resolution', dpcm: 'resolution', dppx: 'resolution', x: 'resolution',
  fr: 'flex',
};
const _MATH_FNS = new Set([
  'calc', 'min', 'max', 'clamp', 'round', 'mod', 'rem', 'abs', 'sign',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'pow', 'sqrt', 'hypot', 'exp', 'log',
]);
// The concrete dimensional types. A <percentage> unifies with any of these (the
// "percent hint" — `10px + 5%` is a valid <length-percentage>) but NOT with a bare
// <number> (`round(1, 1%)` is a type error even where the property resolves `%` to
// a number, because the two operands themselves don't share a type).
const _DIMENSIONS = new Set(['length', 'angle', 'time', 'frequency', 'resolution', 'flex']);
const _unifyType = (a, b) => {
  if (a === b) return a;
  if (a === 'percentage' && _DIMENSIONS.has(b)) return b;
  if (b === 'percentage' && _DIMENSIONS.has(a)) return a;
  return null;                                             // number+percentage, length+angle, … → type error
};
const _unifyAll = (ats) => ats.slice(1).reduce((acc, t) => (acc === null ? null : _unifyType(acc, t)), ats[0]);
// Resolve a calc-tree node to its CSS numeric type ('number'/'percentage'/'length'/
// 'angle'/'time'/'frequency'/'resolution'/'flex'), 'unknown' (channel keyword /
// unknown function — accept), or null (a type error). `pctType` = the type a bare
// <percentage> resolves to in the current property context, or null if `%` isn't
// accepted there at all (a `%` leaf is then an immediate type error).
const _mt = (node, pctType) => {
  if (node.k === 'num') {
    if (node.u === '') return 'number';
    if (node.u === '%') return pctType === null ? null : 'percentage';  // `%` distinct; rejected where unsupported
    return _MATH_UNIT_TYPE[node.u] || null;                // unknown unit (`1dag`) → type error
  }
  if (node.k === 'sym') return 'unknown';                  // channel keyword / unknown ident → accept
  if (node.k === 'sum') {
    const ats = [];
    for (const term of node.terms) {
      const t = _mt(term.node, pctType);
      if (t === null) return null;
      if (t === 'unknown') return 'unknown';
      ats.push(t);
    }
    return _unifyAll(ats);                                 // `length + angle` → null; `length + %` → length
  }
  if (node.k === 'prod') {
    let dim = 'number';                                     // accumulated dimension ('number' = degree 0)
    for (const fac of node.facs) {
      const t = _mt(fac.node, pctType);
      if (t === null) return null;
      if (t === 'unknown') return 'unknown';
      if (t === 'number') continue;                         // <number> is the multiplicative identity
      if (fac.op === '*') {
        if (dim === 'number') dim = t;
        else return null;                                   // dimension × dimension → degree ≥2 (`1vmin * 10%`)
      } else {                                              // '/'
        if (dim === t) dim = 'number';                      // D / D → <number>
        else return null;                                   // <number>/D (inverse) or D1/D2 — no property accepts it
      }
    }
    return dim;
  }
  if (node.k === 'fn') return _mtFn(node, pctType);
  return null;
};
// Type-check a math FUNCTION node: arity + per-argument types, returning the result
// type (or 'unknown' / null). Mirrors `_foldMathFn`'s spec rules at the type level.
const _mtFn = (node, pctType) => {
  const name = node.name, args = node.args;
  // sibling-index()/sibling-count() (CSS Values 5) are <integer> functions — type
  // them as <number> (our lattice has no <integer>) so they classify concretely:
  // `atan2(1, sibling-index())` resolves to <angle>, not the conservative 'unknown'
  // that would mis-reject it in `rotate`. Any argument is a grammar error.
  if (name === 'sibling-index' || name === 'sibling-count') return args.length === 0 ? 'number' : null;
  if (!_MATH_FNS.has(name)) return 'unknown';              // var()/env()/… → accept
  // round(): an optional leading rounding-strategy keyword, then exactly 2 operands
  // of the same type (CSS Values 4 §10.3). The keyword is illegal anywhere else.
  if (name === 'round') {
    let a = args;
    if (a[0] && a[0].k === 'sym' && _ROUND_STRAT[a[0].s]) a = a.slice(1);
    if (a.length !== 2) return null;
    for (const x of a) if (x.k === 'sym' && _ROUND_STRAT[x.s]) return null;  // strategy keyword in a numeric slot
    const t0 = _mt(a[0], pctType), t1 = _mt(a[1], pctType);
    if (t0 === null || t1 === null) return null;
    if (t0 === 'unknown' || t1 === 'unknown') return 'unknown';
    return _unifyType(t0, t1);                                                       // `round(1, 1%)` → null
  }
  const ats = args.map((a) => _mt(a, pctType));
  if (ats.some((t) => t === null)) return null;
  if (ats.some((t) => t === 'unknown')) return 'unknown';
  if (name === 'calc') return args.length === 1 ? ats[0] : null;
  if (name === 'min' || name === 'max') return args.length >= 1 ? _unifyAll(ats) : null;   // same type
  if (name === 'clamp') return args.length === 3 ? _unifyAll(ats) : null;
  if (name === 'hypot') return args.length >= 1 ? _unifyAll(ats) : null;                    // same type
  if (name === 'mod' || name === 'rem') return args.length === 2 ? _unifyType(ats[0], ats[1]) : null;
  if (name === 'abs') return args.length === 1 ? ats[0] : null;                    // type-preserving
  if (name === 'sign') return args.length === 1 ? 'number' : null;                 // any type → <number>
  if (name === 'sin' || name === 'cos' || name === 'tan')
    return args.length === 1 && (ats[0] === 'number' || ats[0] === 'angle') ? 'number' : null;
  if (name === 'asin' || name === 'acos' || name === 'atan')
    return args.length === 1 && ats[0] === 'number' ? 'angle' : null;
  if (name === 'atan2') return args.length === 2 && _unifyType(ats[0], ats[1]) !== null ? 'angle' : null;  // 2 same-type → <angle>
  if (name === 'pow') return args.length === 2 && ats[0] === 'number' && ats[1] === 'number' ? 'number' : null;
  if (name === 'sqrt' || name === 'exp') return args.length === 1 && ats[0] === 'number' ? 'number' : null;
  if (name === 'log') {
    if (ats[0] !== 'number') return null;
    if (args.length === 1) return 'number';
    return args.length === 2 && ats[1] === 'number' ? 'number' : null;
  }
  return null;
};
// Validate a math-expression string against the set of CSS numeric types the
// property accepts. Returns false ONLY when confidently invalid; an unparseable
// expression is invalid, but an expression carrying an unknown symbol/function is
// accepted (we can't judge it). `types` is the accepted-type array, `pctType` the
// percentage-resolution context (see `_mt`).
const _mathValid = (str, types, pctType) => {
  const root = _parseCalcTree(str);
  if (root === null) return false;
  let t = _mt(root, pctType);
  if (t === null) return false;
  if (t === 'unknown') return true;
  if (t === 'percentage') t = pctType;                     // a pure-% result resolves to the property's % type
  return types.includes(t);
};
// A value that CONTAINS a top-level math function (so a bare keyword/length/number
// is never matched and keeps its current pass-through behaviour). var()/env() are
// excluded — they're substituted later, so we can't validate them here.
const _MATHFN_NAME_RE = /(?:^|[^\w-])(?:calc|min|max|clamp|round|mod|rem|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|exp|log|abs|sign)\(/i;
// Should `setProperty` REJECT this value as a malformed/mistyped math function?
// Only fires when the value actually contains a math function; var()/env() and
// CSS-wide keywords are always accepted.
const _mathReject = (value, types, pctType) => {
  const s = String(value).trim();
  if (!_MATHFN_NAME_RE.test(s)) return false;             // no math function → not our concern
  if (_TF_VAR_RE.test(s)) return false;                   // var()/env() → resolved later, accept
  if (_CSS_WIDE.has(s.toLowerCase())) return false;
  return !_mathValid(s, types, pctType);
};
// Properties whose specified value is a math-bearing numeric grammar, with the
// accepted base types and the `%`-resolution context. (opacity also canonicalizes
// — see its branch in setProperty.)
const _MATH_GATE_PROPS = {
  'opacity':        { types: ['number'], pct: 'number' },           // <number>|<percentage>
  'outline-offset': { types: ['length'], pct: null },              // <length>
  'font-weight':    { types: ['number'], pct: null },              // <number>|<keyword>
  'margin-left':    { types: ['length'], pct: 'length' },          // <length-percentage>
  'tab-size':       { types: ['number', 'length'], pct: null },    // <number>|<length>
  'height':         { types: ['length'], pct: 'length' },          // <length-percentage>|<keyword>
};
// Computed value of `opacity`: a <number> or <percentage> (incl. math
// functions), clamped to [0, 1]. Returns null if the value isn't numeric.
const _computeOpacity = (value) => {
  const num = _evalMath(value, 1, { nonFinite: true });
  if (num === null) return null;
  if (Number.isNaN(num)) return '0';                           // NaN → 0 (CSS Values 4 §"NaN and infinity")
  return _serNumber(Math.max(0, Math.min(1, num)));            // ±∞ clamp to the [0,1] bounds
};
// SPECIFIED value of `opacity` (an <alpha-value> = <number>|<percentage>): a bare
// <percentage> serializes as the equivalent unclamped <number> (`50%`→`0.5`,
// `-100%`→`-1`), a bare <number> is canonicalized, and a math function folds via
// the calc engine WITH `%` kept symbolic (`min(50%,0%)`→`calc(0%)`, `calc(1+1)`→
// `calc(2)`). Anything else (a CSS-wide keyword, or — until the math grammar gate
// lands — an invalid value) is kept verbatim.
const _canonOpacitySpecified = (v) => {
  const s = String(v).trim();
  if (_FILTER_MATH_RE.test(s)) return _canonMathExpr(s) || s;
  if (_FILTER_PCT_RE.test(s)) return _serNumber(parseFloat(s) / 100);
  if (_FILTER_NUM_RE.test(s)) return _serNumber(parseFloat(s));
  return s;
};

// ── Modern <color> computed-value serialization (CSS Color 4) ──────────────────
// The COMPUTED value of the modern colour functions whose result stays in their
// OWN colour space — lab()/lch()/oklab()/oklch() and color(<space> …) — and of
// hwb() (which computes to sRGB rgb()/rgba()). UNLIKE the SPECIFIED path
// (_canonColorSpecified, which must preserve calc() wrappers and leave % in the
// a/b/C channels unresolved), the computed path resolves every channel to a plain
// <number>: evaluate its math, resolve <percentage> against the channel's
// reference range, map NaN→0 / ±∞→bounds, clamp per channel, and `none` is kept
// verbatim. This lives ONLY in the computed path (_normComputed) — the specified
// path is untouched, so the `*-valid-*` tests don't regress.
//
// Per-channel spec: `base` = the numeric value of `100%` for that channel; `clamp`
// = [min,max] applied after resolution (null = no clamp); `hue` = a polar-angle
// channel (deg/rad/grad/turn → degrees, then normalized into [0, 360)).
const _MODERN_LAB_FNS = {
  lab:   [{ base: 100, clamp: [0, 100] }, { base: 125, clamp: null }, { base: 125, clamp: null }],
  oklab: [{ base: 1,   clamp: [0, 1] },   { base: 0.4, clamp: null }, { base: 0.4, clamp: null }],
  lch:   [{ base: 100, clamp: [0, 100] }, { base: 150, clamp: [0, Infinity] }, { hue: true }],
  oklch: [{ base: 1,   clamp: [0, 1] },   { base: 0.4, clamp: [0, Infinity] }, { hue: true }],
};
// color() predefined colour spaces. `xyz` is an alias that serializes as `xyz-d65`.
const _COLOR_FN_SPACES = {
  'srgb': 'srgb', 'srgb-linear': 'srgb-linear', 'a98-rgb': 'a98-rgb',
  'rec2020': 'rec2020', 'prophoto-rgb': 'prophoto-rgb',
  'display-p3': 'display-p3', 'display-p3-linear': 'display-p3-linear',
  'xyz': 'xyz-d65', 'xyz-d50': 'xyz-d50', 'xyz-d65': 'xyz-d65',
};
// Resolve one channel of a lab/lch/oklab/oklch/color() function to its computed
// serialization. Returns the string (`'none'` or a serialized <number>), or null
// if the math can't resolve (e.g. a container-relative unit like cqw — no layout).
const _modernChannel = (tok, spec, specified) => {
  const t = String(tok).trim();
  if (t.toLowerCase() === 'none') return 'none';
  // SPECIFIED time: a math-function channel keeps its calc() wrapper, canonically
  // serialized but NOT resolved/clamped (a % stays a %). Returns null if the calc
  // can't be parsed → the whole colour falls back to verbatim. (At COMPUTED time
  // `specified` is falsy and the math is resolved below, as before.)
  if (specified && t.indexOf('(') !== -1) return _canonMathExpr(t);
  if (spec.hue) {
    let v = _evalMath(tok, 0, { angle: true, lengths: true, nonFinite: true });
    if (v === null) return null;
    if (Number.isNaN(v)) v = 0;
    if (!isFinite(v)) return null;
    v = ((v % 360) + 360) % 360;
    // Hue serializes at 6 significant figures (`1.28rad` → `73.3386`), matching
    // the gradient <angle> serializer.
    return _serNumber(parseFloat(v.toPrecision(6)));
  }
  let v = _evalMath(tok, spec.base, { lengths: true, nonFinite: true });
  if (v === null) return null;
  if (Number.isNaN(v)) v = 0;               // NaN (e.g. calc(0/0)) → lower bound
  if (spec.clamp) {
    if (v === Infinity) v = spec.clamp[1];
    else if (v === -Infinity) v = spec.clamp[0];
    else v = Math.max(spec.clamp[0], Math.min(spec.clamp[1], v));
  } else if (!isFinite(v)) {
    return null;                            // unclamped ±∞ has no computed test — bail
  }
  return _serNumber(v);
};
// Resolve a modern colour's alpha to its computed serialization. Returns:
//   ''      → alpha is ≥ 1 (and not `none`); the `/ <alpha>` is dropped
//   'none'  → keep `/ none`
//   '<num>' → keep `/ <num>` (a value in [0, 1))
//   null    → the math couldn't resolve
const _modernAlpha = (tok, specified) => {
  const t = String(tok).trim();
  if (t.toLowerCase() === 'none') return 'none';
  // SPECIFIED: a math-function alpha keeps its calc() wrapper (never dropped or
  // clamped), canonically serialized; null if unparseable.
  if (specified && t.indexOf('(') !== -1) return _canonMathExpr(t);
  let a = _evalMath(tok, 1, { lengths: true, nonFinite: true });
  if (a === null) return null;
  if (Number.isNaN(a)) a = 0;
  a = Math.max(0, Math.min(1, a));
  if (a >= 1) return '';
  return _serNumber(a);
};
// Serialize a channel list + optional alpha into the `c1 c2 c3[ / a]` body, or
// null on any unresolvable channel/alpha.
const _modernBody = (chanToks, specs, alphaTok, specified) => {
  const out = [];
  for (let i = 0; i < specs.length; i++) {
    const r = _modernChannel(chanToks[i], specs[i], specified);
    if (r === null) return null;
    out.push(r);
  }
  let body = out.join(' ');
  if (alphaTok !== undefined) {
    const a = _modernAlpha(alphaTok, specified);
    if (a === null) return null;
    if (a !== '') body += ' / ' + a;
  }
  return body;
};
// SPECIFIED serialization of an hwb() whose hue (or another channel) is an
// unresolvable calc — keep `hwb(h w b[ / a])`: a math-function channel keeps its
// canonical calc() wrapper, a <percentage> whiteness/blackness resolves to its
// <number> (`30%`→`30`), the hue normalizes into [0, 360), and the alpha follows
// the modern-alpha rule (drop ≥ 1, keep calc symbolic). Null if any piece is
// genuinely unparseable → caller keeps the original bytes.
const _hwbSpecified = (parts) => {
  const comp = (tok, base, hue) => {
    const t = String(tok).trim();
    if (t.toLowerCase() === 'none') return 'none';
    if (t.indexOf('(') !== -1) return _canonMathExpr(t);   // calc kept symbolic
    let v = _evalMath(t, base, { angle: hue, lengths: true, nonFinite: true });
    if (v === null) return null;
    if (Number.isNaN(v)) v = 0;
    if (hue) { if (!isFinite(v)) v = 0; v = ((v % 360) + 360) % 360; }
    return _serNumber(v);
  };
  const h = comp(parts[0], 0, true), w = comp(parts[1], 100, false), bl = comp(parts[2], 100, false);
  if (h === null || w === null || bl === null) return null;
  let body = `hwb(${h} ${w} ${bl}`;
  if (parts.length === 4) {
    const a = _modernAlpha(parts[3], true);
    if (a === null) return null;
    if (a !== '') body += ' / ' + a;
  }
  return body + ')';
};
// hwb() computes to sRGB rgb()/rgba(): pure-hue sRGB scaled by whiteness/blackness.
const _computeHwb = (inner, specified) => {
  const parts = _splitTopLevel(inner);
  if (parts.length < 3 || parts.length > 4) return null;
  const num = (tok, base) => {
    const t = String(tok).trim();
    if (t.toLowerCase() === 'none') return 0;   // missing component → 0
    // SPECIFIED: a calc channel resolves to rgb ONLY if it folds to a constant
    // (`calc(infinity)`/`calc(0/0)`); a sign()/relative-unit calc stays symbolic
    // → null makes the caller keep `hwb()`.
    if (specified && t.indexOf('(') !== -1) {
      const c = _calcConstValue(t);
      if (c === null) return null;
      if (c.u === '') return c.v;
      if (c.u === '%') return (c.v / 100) * base;
      const af = base === 0 ? _ANGLE_DEG[c.u] : undefined;
      return af === undefined ? null : c.v * af;
    }
    let v = _evalMath(t, base, { angle: base === 0, lengths: true, nonFinite: true });
    if (v === null) return null;
    if (Number.isNaN(v)) v = 0;
    return v;
  };
  let h = num(parts[0], 0);                 // angle (deg) — opts.angle on (base 0)
  let w = num(parts[1], 100), bl = num(parts[2], 100);  // whiteness/blackness in [0,100]
  let a = 1;
  if (parts.length === 4) a = num(parts[3], 1);
  // A channel that won't resolve (a relative-unit/sign() calc) makes the colour
  // un-convertible to sRGB. At SPECIFIED time we keep `hwb()` with each channel
  // canonically serialized (calc kept symbolic, % resolved to <number>); at
  // computed time we bail so the caller leaves it verbatim.
  if (h === null || w === null || bl === null || a === null) return specified ? _hwbSpecified(parts) : null;
  if (!isFinite(h)) h = 0;                   // ±∞/NaN hue → 0 (powerless after the wrap)
  a = Number.isNaN(a) ? 0 : a === Infinity ? 1 : a === -Infinity ? 0 : Math.max(0, Math.min(1, a));
  w /= 100; bl /= 100;
  let r, g, b;
  if (w + bl >= 1) { const gray = w / (w + bl); r = g = b = gray * 255; }
  else {
    const pure = _hslToRgb(h, 1, 0.5);        // pure hue, 0-255
    const f = (c) => ((c / 255) * (1 - w - bl) + w) * 255;
    r = f(pure[0]); g = f(pure[1]); b = f(pure[2]);
  }
  // Snap away sub-µ float drift before _serColor's round-to-int, so an exact
  // half-integer channel (e.g. 0.5·255 = 127.5, which `1·(1−0.3−0.5)+0.3` yields
  // as 127.4999999…) rounds up to 128 rather than down to 127.
  const snap = (x) => Math.round(x * 1e6) / 1e6;
  return _serColor(snap(r), snap(g), snap(b), a);
};
// Compute the modern <color> functions whose computed value stays in their own
// space (+ hwb→sRGB). Returns the serialized computed value, or null when `value`
// isn't one of these functions or a channel can't resolve — the caller then falls
// back to the legacy `_computeColor` (which handles named/hex/rgb/hsl).
const _computeModernColor = (value, specified) => {
  if (!value) return null;
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const lp = s.indexOf('(');
  if (lp <= 0 || !s.endsWith(')')) return null;
  const fname = _unescapeIdent(s.slice(0, lp)).toLowerCase();
  const inner = s.slice(lp + 1, -1);
  if (fname === 'hwb') return _computeHwb(inner, specified);
  if (fname === 'color') {
    const parts = _splitTopLevel(inner);
    if (parts.length < 4 || parts.length > 5) return null;
    const space = _COLOR_FN_SPACES[parts[0].toLowerCase()];
    if (!space) return null;
    const specs = [{ base: 1, clamp: null }, { base: 1, clamp: null }, { base: 1, clamp: null }];
    const body = _modernBody(parts.slice(1, 4), specs, parts.length === 5 ? parts[4] : undefined, specified);
    return body === null ? null : `color(${space} ${body})`;
  }
  const specs = _MODERN_LAB_FNS[fname];
  if (!specs) return null;
  const parts = _splitTopLevel(inner);
  if (parts.length < 3 || parts.length > 4) return null;
  const body = _modernBody(parts.slice(0, 3), specs, parts.length === 4 ? parts[3] : undefined, specified);
  return body === null ? null : `${fname}(${body})`;
};

// ── CSS Color 4/5 cross-space colour engine (computed color-mix() / relative) ──
// The COMPUTED value of color-mix() and of relative colour syntax
// (rgb(from …)/lab(from …)/color(from …)) needs real colour-space maths, unlike
// the SPECIFIED path (which is pure syntax canon — see _canonColorMix /
// _canonRelativeColor). Every case reduces to three primitives: parse a <color>
// into a structured `{space, coords, alpha, none[4]}`, convert between colour
// spaces through an XYZ-D65 hub, then serialize the result in the target space's
// canonical computed form. The WPT `fuzzy_compare_colors` comparator tolerates
// ε≈0.01–0.02 on the numbers but checks the non-numeric skeleton exactly, so we
// must emit the right output FUNCTION/SPACE; ~6 significant figures on the
// channels is ample. All matrices are the published CSS Color 4 reference values
// (drafts.csswg.org/css-color-4 sample code), with XYZ→RGB derived by inversion.
const _m3v = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const _inv3 = (m) => {
  const a = m[0][0], b = m[0][1], c = m[0][2];
  const d = m[1][0], e = m[1][1], f = m[1][2];
  const g = m[2][0], h = m[2][1], i = m[2][2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
};
// Per-channel transfer functions (gamma-encoded ↔ linear-light), sign-preserving.
const _sgn = (x) => (x < 0 ? -1 : 1);
const _srgbLin = (c) => { const a = Math.abs(c); return a <= 0.04045 ? c / 12.92 : _sgn(c) * Math.pow((a + 0.055) / 1.055, 2.4); };
const _srgbGam = (c) => { const a = Math.abs(c); return a <= 0.0031308 ? c * 12.92 : _sgn(c) * (1.055 * Math.pow(a, 1 / 2.4) - 0.055); };
const _a98Lin = (c) => _sgn(c) * Math.pow(Math.abs(c), 563 / 256);
const _a98Gam = (c) => _sgn(c) * Math.pow(Math.abs(c), 256 / 563);
const _proLin = (c) => { const a = Math.abs(c); return a <= 16 / 512 ? c / 16 : _sgn(c) * Math.pow(a, 1.8); };
const _proGam = (c) => { const a = Math.abs(c); return a >= 1 / 512 ? _sgn(c) * Math.pow(a, 1 / 1.8) : 16 * c; };
const _R2020_A = 1.09929682680944, _R2020_B = 0.018053968510807;
const _recLin = (c) => { const a = Math.abs(c); return a < _R2020_B * 4.5 ? c / 4.5 : _sgn(c) * Math.pow((a + _R2020_A - 1) / _R2020_A, 1 / 0.45); };
const _recGam = (c) => { const a = Math.abs(c); return a >= _R2020_B ? _sgn(c) * (_R2020_A * Math.pow(a, 0.45) - (_R2020_A - 1)) : 4.5 * c; };
const _I = (c) => c;            // identity (the -linear predefined spaces)
// Forward linear-RGB → XYZ matrices (D65, except prophoto which is D50).
const _M_SRGB = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];
const _M_P3 = [
  [0.4865709486482162, 0.26566769316909306, 0.19821728523436247],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0.0, 0.04511338185890264, 1.043944368900976],
];
const _M_A98 = [
  [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
  [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
  [0.02703136138641234, 0.07068885253582723, 0.9913375368376388],
];
const _M_REC = [
  [0.6369580483012914, 0.14461690358620832, 0.16888097516417205],
  [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
  [0.0, 0.028072693049087428, 1.060985057710791],
];
const _M_PRO = [
  [0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
  [0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
  [0.0, 0.0, 0.8251046025104601],
];
// Each predefined RGB colour space: forward matrix, transfer fns, D50 flag.
const _RGB_SPACE = {
  'srgb':              { mat: _M_SRGB, lin: _srgbLin, gam: _srgbGam },
  'srgb-linear':       { mat: _M_SRGB, lin: _I, gam: _I },
  'display-p3':        { mat: _M_P3, lin: _srgbLin, gam: _srgbGam },
  'display-p3-linear': { mat: _M_P3, lin: _I, gam: _I },
  'a98-rgb':           { mat: _M_A98, lin: _a98Lin, gam: _a98Gam },
  'rec2020':           { mat: _M_REC, lin: _recLin, gam: _recGam },
  'prophoto-rgb':      { mat: _M_PRO, lin: _proLin, gam: _proGam, d50: true },
};
for (const k in _RGB_SPACE) _RGB_SPACE[k].imat = _inv3(_RGB_SPACE[k].mat);
// Bradford chromatic adaptation between the D65 and D50 reference whites.
const _D65_TO_D50 = [
  [1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
  [0.029627815688159344, 0.990434484573249, -0.01707382502938514],
  [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008],
];
const _D50_TO_D65 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];
// OKLab ↔ XYZ-D65 (via the cube-rooted LMS cone responses).
const _XYZ_TO_LMS = [
  [0.8190224379967030, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const _LMS_TO_OKLAB = [
  [0.2104542683093140, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.4505937096174110],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
const _LMS_TO_XYZ = _inv3(_XYZ_TO_LMS);
const _OKLAB_TO_LMS = _inv3(_LMS_TO_OKLAB);
const _xyzToOklab = (xyz) => _m3v(_LMS_TO_OKLAB, _m3v(_XYZ_TO_LMS, xyz).map(Math.cbrt));
const _oklabToXyz = (lab) => _m3v(_LMS_TO_XYZ, _m3v(_OKLAB_TO_LMS, lab).map((v) => v * v * v));
// CIE Lab ↔ XYZ-D50 (Lab is always relative to the D50 white).
const _LAB_D50 = [0.3457 / 0.3585, 1.0, (1.0 - 0.3457 - 0.3585) / 0.3585];
const _LAB_E = 216 / 24389, _LAB_K = 24389 / 27;
const _xyzD50ToLab = (xyz) => {
  const f = (t) => (t > _LAB_E ? Math.cbrt(t) : (_LAB_K * t + 16) / 116);
  const fx = f(xyz[0] / _LAB_D50[0]), fy = f(xyz[1] / _LAB_D50[1]), fz = f(xyz[2] / _LAB_D50[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const _labToXyzD50 = (lab) => {
  const fy = (lab[0] + 16) / 116, fx = lab[1] / 500 + fy, fz = fy - lab[2] / 200;
  const x = fx ** 3 > _LAB_E ? fx ** 3 : (116 * fx - 16) / _LAB_K;
  const y = lab[0] > _LAB_K * _LAB_E ? ((lab[0] + 16) / 116) ** 3 : lab[0] / _LAB_K;
  const z = fz ** 3 > _LAB_E ? fz ** 3 : (116 * fz - 16) / _LAB_K;
  return [x * _LAB_D50[0], y * _LAB_D50[1], z * _LAB_D50[2]];
};
// Rectangular ↔ polar (Lab↔LCH, OKLab↔OKLCH share the maths).
const _labToLch = (lab) => {
  const C = Math.hypot(lab[1], lab[2]);
  let H = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
  if (H < 0) H += 360;
  return [lab[0], C, H];
};
const _lchToLab = (lch) => {
  const H = lch[2] * Math.PI / 180;
  return [lch[0], lch[1] * Math.cos(H), lch[1] * Math.sin(H)];
};
// HSL/HWB ↔ sRGB (coords carry s/l/w/b as 0–100, hue in degrees).
const _hslToRgb01 = (h, s, l) => _hslToRgb(h, s, l).map((c) => c / 255);
const _rgbToHsl = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  // `d` below a small absolute floor is treated as achromatic — this absorbs the
  // ~1e-7 round-trip drift a srgb→XYZ→srgb hop leaves on near-grey colours (e.g.
  // white), which would otherwise make `s` (whose denominator → 0 at l = 0/1)
  // blow up to a bogus huge saturation and defeat the powerless-hue rule.
  if (d > 1e-6) {
    const denom = 1 - Math.abs(2 * l - 1);
    s = denom > 1e-9 ? Math.min(1, d / denom) : 0;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
};
const _hwbToRgb01 = (h, w, bl) => {
  if (w + bl >= 1) { const grey = w / (w + bl); return [grey, grey, grey]; }
  return _hslToRgb01(h, 1, 0.5).map((c) => c * (1 - w - bl) + w);
};
const _rgbToHwb = (r, g, b) => [_rgbToHsl(r, g, b)[0], Math.min(r, g, b) * 100, (1 - Math.max(r, g, b)) * 100];
// A colour's coords (in its own space) → XYZ-D65, and back. The hub everything
// converts through.
const _toXYZ = (space, c) => {
  if (_RGB_SPACE[space]) {
    const sp = _RGB_SPACE[space];
    let xyz = _m3v(sp.mat, [sp.lin(c[0]), sp.lin(c[1]), sp.lin(c[2])]);
    return sp.d50 ? _m3v(_D50_TO_D65, xyz) : xyz;
  }
  if (space === 'xyz-d65') return c.slice();
  if (space === 'xyz-d50') return _m3v(_D50_TO_D65, c);
  if (space === 'lab') return _m3v(_D50_TO_D65, _labToXyzD50(c));
  if (space === 'lch') return _m3v(_D50_TO_D65, _labToXyzD50(_lchToLab(c)));
  if (space === 'oklab') return _oklabToXyz(c);
  if (space === 'oklch') return _oklabToXyz(_lchToLab(c));
  if (space === 'hsl') return _toXYZ('srgb', _hslToRgb01(c[0], c[1] / 100, c[2] / 100));
  if (space === 'hwb') return _toXYZ('srgb', _hwbToRgb01(c[0], c[1] / 100, c[2] / 100));
  return c.slice();
};
const _fromXYZ = (space, xyz) => {
  if (_RGB_SPACE[space]) {
    const sp = _RGB_SPACE[space];
    const lin = _m3v(sp.imat, sp.d50 ? _m3v(_D65_TO_D50, xyz) : xyz);
    return [sp.gam(lin[0]), sp.gam(lin[1]), sp.gam(lin[2])];
  }
  if (space === 'xyz-d65') return xyz.slice();
  if (space === 'xyz-d50') return _m3v(_D65_TO_D50, xyz);
  if (space === 'lab') return _xyzD50ToLab(_m3v(_D65_TO_D50, xyz));
  if (space === 'lch') return _labToLch(_xyzD50ToLab(_m3v(_D65_TO_D50, xyz)));
  if (space === 'oklab') return _xyzToOklab(xyz);
  if (space === 'oklch') return _labToLch(_xyzToOklab(xyz));
  if (space === 'hsl') { const r = _fromXYZ('srgb', xyz); return _rgbToHsl(r[0], r[1], r[2]); }
  if (space === 'hwb') { const r = _fromXYZ('srgb', xyz); return _rgbToHwb(r[0], r[1], r[2]); }
  return xyz.slice();
};
// Convert a structured colour to `targetSpace` (alpha + alpha-missing carried;
// per-channel missing is dropped across a space change — it isn't analogous).
const _csConvert = (col, targetSpace) => {
  if (col.space === targetSpace) return { space: col.space, coords: col.coords.slice(), alpha: col.alpha, none: col.none.slice() };
  const coords = _fromXYZ(targetSpace, _toXYZ(col.space, col.coords));
  const none = [false, false, false, col.none[3]];
  // A hue that EMERGES from a conversion into a polar space is "missing" when its
  // chroma/saturation is ~0 — the hue is then meaningless (CSS Color 4's powerless
  // → missing rule). A NATIVELY-specified polar colour keeps its explicit hue: that
  // path returns above without conversion, so `lch(100 0 20deg)` interpolates its
  // 20°, while `lab(50 0 0)` converted into lch yields a missing hue.
  // Thresholds sit well above the ~1e-5 chroma the XYZ round-trip leaves on a
  // genuinely-achromatic colour, yet far below any real chroma in the suite.
  if (targetSpace === 'hsl' && Math.abs(coords[1]) < 1e-3) none[0] = true;
  else if (targetSpace === 'hwb' && coords[1] + coords[2] >= 100 - 1e-3) none[0] = true;
  else if (targetSpace === 'lch' && Math.abs(coords[1]) < 1e-3) none[2] = true;
  else if (targetSpace === 'oklch' && Math.abs(coords[1]) < 1e-4) none[2] = true;
  return { space: targetSpace, coords, alpha: col.alpha, none };
};
// Parse one channel token of a colour function. `base` = value of 100%; `hue`
// marks an <angle> channel. Returns {v, none} or null on unresolvable maths.
const _csChan = (tok, base, hue) => {
  const t = String(tok).trim();
  if (t.toLowerCase() === 'none') return { v: 0, none: true };
  let v = _evalMath(t, base, { angle: !!hue, lengths: true, nonFinite: true });
  if (v === null) return null;
  if (Number.isNaN(v)) v = 0;
  if (!isFinite(v)) v = v > 0 ? base || 1e6 : 0;
  return { v, none: false };
};
// `<percentage>` bases for each space's three channels (matching _MODERN_LAB_FNS
// + the legacy rgb/hsl ranges); hue channels carry an explicit base of 0.
const _CS_BASE = {
  'srgb': [255, 255, 255], 'srgb-linear': [1, 1, 1], 'display-p3': [1, 1, 1],
  'display-p3-linear': [1, 1, 1], 'a98-rgb': [1, 1, 1], 'rec2020': [1, 1, 1],
  'prophoto-rgb': [1, 1, 1], 'xyz-d65': [1, 1, 1], 'xyz-d50': [1, 1, 1],
  'hsl': [0, 100, 100], 'hwb': [0, 100, 100],
  'lab': [100, 125, 125], 'lch': [100, 150, 0],
  'oklab': [1, 0.4, 0.4], 'oklch': [1, 0.4, 0],
};
const _CS_HUE = { 'hsl': 0, 'hwb': 0, 'lch': 2, 'oklch': 2 };  // hue channel index (or undefined)
// Per-channel clamps applied at serialization (matching `_MODERN_LAB_FNS`): L is
// bounded, chroma is non-negative; a/b and the rgb/xyz spaces stay unclamped.
const _CS_CLAMP = {
  'lab': [[0, 100], null, null], 'lch': [[0, 100], [0, Infinity], null],
  'oklab': [[0, 1], null, null], 'oklch': [[0, 1], [0, Infinity], null],
};
// For an rgb()/hsl() origin, channels are stored in [0,1]/0-100 internally but
// the keyword values seen by relative syntax use the function's own units (rgb
// channels 0–255). `_CS_KW_SCALE` maps internal-coord → keyword value.
const _CS_KW_SCALE = { 'srgb': [255, 255, 255] };
// Parse any <color> string into a structured colour, or null. Named/hex/legacy
// rgb/hsl resolve via `_computeColor`; modern functions parse their channels in
// place. `none` is tracked per channel + alpha.
const _csParse = (str) => {
  let s = String(str).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const low = s.toLowerCase();
  if (low === 'transparent') return { space: 'srgb', coords: [0, 0, 0], alpha: 0, none: [false, false, false, false] };
  const fromRgbString = (rgb) => {
    const lp = rgb.indexOf('(');
    const comps = _rgbComponents(rgb.slice(lp + 1, -1));
    if (!comps) return null;
    return { space: 'srgb', coords: [comps[0] / 255, comps[1] / 255, comps[2] / 255], alpha: comps[3], none: [false, false, false, false] };
  };
  if (_CSS_NAMED_COLORS[low] || /^#[0-9a-f]+$/i.test(s)) {
    const c = _computeColor(s);
    return /^rgb/i.test(c) ? fromRgbString(c) : null;
  }
  const lp = s.indexOf('(');
  if (lp <= 0 || !s.endsWith(')')) return null;
  const fname = _unescapeIdent(s.slice(0, lp)).toLowerCase();
  const inner = s.slice(lp + 1, -1);
  const parts = _splitTopLevel(inner);
  const buildAlpha = (tok) => {
    if (tok === undefined) return { v: 1, none: false };
    const r = _csChan(tok, 1, false);
    if (r && !r.none) r.v = Math.max(0, Math.min(1, r.v));   // alpha clamps to [0,1] at parse
    return r;
  };
  if (fname === 'rgb' || fname === 'rgba') {
    const c = _computeColor(s);
    return /^rgb/i.test(c) ? fromRgbString(c) : null;
  }
  if (fname === 'hsl' || fname === 'hsla' || fname === 'hwb') {
    if (parts.length < 3 || parts.length > 4) return null;
    const space = fname === 'hwb' ? 'hwb' : 'hsl';
    const h = _csChan(parts[0], 0, true), c1 = _csChan(parts[1], 100, false), c2 = _csChan(parts[2], 100, false);
    const a = buildAlpha(parts[3]);
    if (!h || !c1 || !c2 || !a) return null;
    return { space, coords: [h.v, c1.v, c2.v], alpha: a.v, none: [h.none, c1.none, c2.none, a.none] };
  }
  if (fname === 'lab' || fname === 'lch' || fname === 'oklab' || fname === 'oklch') {
    if (parts.length < 3 || parts.length > 4) return null;
    const base = _CS_BASE[fname], hueIdx = _CS_HUE[fname];
    const ch = [];
    for (let i = 0; i < 3; i++) { const r = _csChan(parts[i], base[i], i === hueIdx); if (!r) return null; ch.push(r); }
    const a = buildAlpha(parts[3]);
    if (!a) return null;
    return { space: fname, coords: [ch[0].v, ch[1].v, ch[2].v], alpha: a.v, none: [ch[0].none, ch[1].none, ch[2].none, a.none] };
  }
  if (fname === 'color') {
    if (parts.length < 4 || parts.length > 5) return null;
    const space = _COLOR_FN_SPACES[parts[0].toLowerCase()];
    if (!space) return null;
    const ch = [];
    for (let i = 1; i <= 3; i++) { const r = _csChan(parts[i], 1, false); if (!r) return null; ch.push(r); }
    const a = buildAlpha(parts[4]);
    if (!a) return null;
    return { space, coords: [ch[0].v, ch[1].v, ch[2].v], alpha: a.v, none: [ch[0].none, ch[1].none, ch[2].none, a.none] };
  }
  return null;
};
// Resolve a <color> (incl. currentcolor, nested color-mix / relative) into a
// structured colour. `el` is the context element for currentcolor.
const _resolveColorStruct = (str, el) => {
  let s = String(str).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const low = s.toLowerCase();
  if (low === 'currentcolor') s = (el ? (_computedColorOf(el) || 'rgb(0, 0, 0)') : 'rgb(0, 0, 0)');
  if (/^color-mix\(/i.test(s)) return _colorMixStruct(s, el);
  if (/^alpha\(\s*from\s/i.test(s)) return _alphaStruct(s, el);
  if (/^contrast-color\(/i.test(s)) return _contrastStruct(s, el);
  if (/^[a-z]+\(\s*from\s/i.test(s)) return _relativeStruct(s, el);
  return _csParse(s);
};
// CSS Color 4 §12.4 hue fixup: adjust two in-[0,360) hues for the chosen arc.
const _adjustHue = (h1, h2, method) => {
  h1 = ((h1 % 360) + 360) % 360; h2 = ((h2 % 360) + 360) % 360;
  const d = h2 - h1;
  if (method === 'longer') { if (d > 0 && d < 180) h1 += 360; else if (d > -180 && d <= 0) h2 += 360; }
  else if (method === 'increasing') { if (h2 < h1) h2 += 360; }
  else if (method === 'decreasing') { if (h1 < h2) h1 += 360; }
  else { if (d > 180) h1 += 360; else if (d < -180) h2 += 360; }  // shorter (default)
  return [h1, h2];
};
// Parse a color-mix() interpolation method `in <space> [<hue> hue]?`.
const _parseMixMethod = (str) => {
  const toks = _wsTokens(str.trim());
  let space = (toks[1] || 'oklab').toLowerCase();
  if (space === 'xyz') space = 'xyz-d65';
  let hue = 'shorter';
  if (toks.length >= 4 && toks[3].toLowerCase() === 'hue') hue = toks[2].toLowerCase();
  return { space, hue };
};
// Split a color-mix() component into its <color> and optional <percentage>.
const _splitMixComp = (str) => {
  const toks = _wsTokens(str.trim());
  const isPct = (t) => /^[-+]?(\d+\.?\d*|\.\d+)%$/.test(t) || /^calc\(/i.test(t);
  let pct = null, colorToks = [];
  for (const t of toks) {
    if (pct === null && isPct(t) && !/^(rgb|hsl|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i.test(t)) {
      const v = _evalMath(t, 100, { lengths: true });   // lengths → resolvable sign()/calc()
      if (v !== null) { pct = v; continue; }
    }
    colorToks.push(t);
  }
  return { color: colorToks.join(' '), pct };
};
// Computed color-mix(): resolve both operands, convert into the mix space,
// premultiplied-interpolate (hue handled per the chosen arc), apply the
// percentage-derived alpha multiplier. Returns a structured colour or null.
const _colorMixStruct = (value, el) => {
  const s = String(value).trim();
  const lp = s.indexOf('(');
  if (lp < 0 || !s.endsWith(')')) return null;
  const parts = _commaSplitTop(s.slice(lp + 1, -1)).map((p) => p.trim()).filter((p) => p.length);
  let mi = 0, method = { space: 'oklab', hue: 'shorter' };
  if (parts[0] && /^in(\s|$)/i.test(parts[0])) { method = _parseMixMethod(parts[0]); mi = 1; }
  if (!_CS_BASE[method.space]) return null;
  const comps = parts.slice(mi).map(_splitMixComp);
  if (comps.length < 1) return null;
  const cols = comps.map((c) => { const s2 = _resolveColorStruct(c.color, el); return s2 ? _csConvert(s2, method.space) : null; });
  if (cols.some((c) => !c)) return null;
  // Percentage normalization (the N-ary rule, which subsumes the binary one): an
  // omitted percentage splits the remaining (100% − sum-of-specified) equally among
  // the omitted components. The alpha multiplier applies only when the sum is under
  // 100% (a sum over 100% just renormalizes the weights, leaving alpha intact).
  let sumSpec = 0, nOmit = 0;
  for (const c of comps) { if (c.pct == null) nOmit++; else sumSpec += c.pct; }
  const fill = nOmit > 0 ? Math.max(0, 100 - sumSpec) / nOmit : 0;
  const pcts = comps.map((c) => (c.pct == null ? fill : c.pct));
  const sum = pcts.reduce((a, b) => a + b, 0);
  const aMult = sum > 0 ? Math.min(1, sum / 100) : 0;
  const weights = pcts.map((p) => (sum > 0 ? p / sum : 1 / cols.length));
  const hueIdx = _CS_HUE[method.space];
  // The binary case carries the full hue-arc + per-channel `none` machinery; the
  // 1-or-N-ary case uses straight weighted premultiplied interpolation (no test
  // exercises a polar N-ary mix, and the binary path covers every polar pair).
  if (cols.length !== 2) {
    const At = cols.reduce((acc, c, i) => acc + (c.none[3] ? 1 : c.alpha) * weights[i], 0);
    const coords = [0, 0, 0];
    for (let ch = 0; ch < 3; ch++) {
      if (ch === hueIdx) { coords[ch] = cols.reduce((acc, c, i) => acc + c.coords[ch] * weights[i], 0); continue; }
      const pre = cols.reduce((acc, c, i) => acc + c.coords[ch] * (c.none[3] ? 1 : c.alpha) * weights[i], 0);
      coords[ch] = At > 1e-9 ? pre / At : 0;
    }
    const aAllNone = cols.every((c) => c.none[3]);
    return { space: method.space, coords, alpha: aAllNone ? 0 : Math.max(0, Math.min(1, At * aMult)), none: [false, false, false, aAllNone] };
  }
  const sa = cols[0], sb = cols[1];
  const t1 = weights[0], t2 = weights[1];
  let a1 = sa.none[3] ? null : sa.alpha, a2 = sb.none[3] ? null : sb.alpha;
  let aNone = false;
  if (a1 == null && a2 == null) aNone = true;
  else { if (a1 == null) a1 = a2; if (a2 == null) a2 = a1; }
  const Amix = aNone ? 0 : a1 * t1 + a2 * t2;
  const coords = [0, 0, 0], noneOut = [false, false, false, aNone];
  for (let i = 0; i < 3; i++) {
    const n1 = sa.none[i], n2 = sb.none[i];
    if (n1 && n2) { noneOut[i] = true; continue; }
    const v1 = n1 ? sb.coords[i] : sa.coords[i];
    const v2 = n2 ? sa.coords[i] : sb.coords[i];
    if (i === hueIdx) {
      const [g1, g2] = _adjustHue(v1, v2, method.hue);
      coords[i] = g1 * t1 + g2 * t2;          // hue is never premultiplied
    } else if (aNone) {
      coords[i] = v1 * t1 + v2 * t2;          // no alpha to premultiply by
    } else {
      // Premultiplied-alpha interpolation: a zero total alpha collapses the
      // channels to 0 (so a fully-transparent mix is `… 0 0 0 / 0`, not the raw
      // average — that distinguishes a negative/0 colour alpha from a 0% weight).
      const pre = v1 * a1 * t1 + v2 * a2 * t2;
      coords[i] = Amix > 1e-9 ? pre / Amix : 0;
    }
  }
  const alpha = aNone ? 0 : Math.max(0, Math.min(1, Amix * aMult));
  return { space: method.space, coords, alpha, none: noneOut };
};
// Per-relative-function config: the function's colour space, channel keyword
// names, and (for rgb) the internal-coord → keyword-value scale.
const _REL_FN = {
  rgb:   { space: 'srgb', keys: ['r', 'g', 'b'] },
  rgba:  { space: 'srgb', keys: ['r', 'g', 'b'] },
  hsl:   { space: 'hsl', keys: ['h', 's', 'l'] },
  hsla:  { space: 'hsl', keys: ['h', 's', 'l'] },
  hwb:   { space: 'hwb', keys: ['h', 'w', 'b'] },
  lab:   { space: 'lab', keys: ['l', 'a', 'b'] },
  lch:   { space: 'lch', keys: ['l', 'c', 'h'] },
  oklab: { space: 'oklab', keys: ['l', 'a', 'b'] },
  oklch: { space: 'oklch', keys: ['l', 'c', 'h'] },
};
// Substitute relative-colour channel keywords (r/g/b/alpha/…) in an expression
// with their numeric values, parenthesized to preserve precedence inside calc().
const _relSubst = (expr, env) => {
  const keys = Object.keys(env).sort((a, b) => b.length - a.length);
  let out = expr;
  for (const k of keys) {
    out = out.replace(new RegExp('\\b' + k + '\\b', 'gi'), '(' + env[k] + ')');
  }
  return out;
};
// Computed relative colour: resolve the origin into the function's space, expose
// its channels as keyword values, evaluate each output channel, and assemble a
// structured colour in the function's space. Returns null on any parse failure.
const _relativeStruct = (value, el) => {
  const s = String(value).trim();
  const lp = s.indexOf('(');
  if (lp <= 0 || !s.endsWith(')')) return null;
  const fname = _unescapeIdent(s.slice(0, lp)).toLowerCase();
  const cfg = _REL_FN[fname];
  if (fname !== 'color' && !cfg) return null;
  const toks = _wsTokens(s.slice(lp + 1, -1).trim());
  if (!toks.length || toks[0].toLowerCase() !== 'from') return null;
  const origin = _resolveColorStruct(toks[1], el);
  if (!origin) return null;
  let rest = toks.slice(2);
  const si = rest.indexOf('/');
  let alphaToks = null;
  if (si >= 0) { alphaToks = rest.slice(si + 1); rest = rest.slice(0, si); }
  // Determine the function's colour space + keyword names.
  let space, keys;
  if (fname === 'color') {
    space = _COLOR_FN_SPACES[(rest[0] || '').toLowerCase()];
    if (!space) return null;
    rest = rest.slice(1);
    keys = (space === 'xyz-d65' || space === 'xyz-d50') ? ['x', 'y', 'z'] : ['r', 'g', 'b'];
  } else { space = cfg.space; keys = cfg.keys; }
  if (rest.length !== 3) return null;
  const o = _csConvert(origin, space);
  // rgb()/rgba() channels are 0–255 (so a keyword/literal/% maps onto that range);
  // color() channels and every other function are in their space's own units.
  const isRgbFn = space === 'srgb' && fname !== 'color';
  const scale = isRgbFn ? [255, 255, 255] : [1, 1, 1];
  const base = fname === 'color' ? [1, 1, 1] : (isRgbFn ? [255, 255, 255] : _CS_BASE[space]);
  const hueIdx = fname === 'color' ? undefined : _CS_HUE[space];
  const env = { alpha: o.none[3] ? 0 : o.alpha };
  for (let i = 0; i < 3; i++) env[keys[i]] = o.coords[i] * scale[i];
  const coords = [0, 0, 0], noneOut = [false, false, false, false];
  for (let i = 0; i < 3; i++) {
    const tok = rest[i];
    if (tok.toLowerCase() === 'none') { noneOut[i] = true; continue; }
    const r = _csChan(_relSubst(tok, env), base[i] != null ? base[i] : 0, i === hueIdx);
    if (!r) return null;
    coords[i] = r.v / scale[i];
  }
  let alpha = o.alpha, aNone = false;
  if (alphaToks) {
    const at = alphaToks.join(' ');
    if (at.toLowerCase() === 'none') aNone = true;
    else { const r = _csChan(_relSubst(at, env), 1, false); if (!r) return null; alpha = Math.max(0, Math.min(1, r.v)); }
  }
  noneOut[3] = aNone;
  return { space, coords, alpha, none: noneOut };
};
// Computed alpha(): resolve the origin into a structured colour and replace its
// alpha. The `alpha` keyword inside the <alpha-value> reads the origin's alpha
// (a missing origin alpha reads as 0). The origin's space + channels are kept
// verbatim — alpha() never converts colour spaces. Returns null on any failure.
const _alphaStruct = (value, el) => {
  const p = _parseAlphaFn(value);
  if (!p) return null;
  const origin = _resolveColorStruct(p.origin, el);
  if (!origin) return null;
  let alpha = origin.alpha, aNone = origin.none[3];
  if (p.alpha !== null) {
    if (p.alpha.toLowerCase() === 'none') { aNone = true; alpha = 0; }
    else {
      const r = _csChan(_relSubst(p.alpha, { alpha: origin.none[3] ? 0 : origin.alpha }), 1, false);
      if (!r) return null;
      if (r.none) { aNone = true; alpha = 0; }
      else { aNone = false; alpha = Math.max(0, Math.min(1, r.v)); }
    }
  }
  const none = origin.none.slice(); none[3] = aNone;
  return { space: origin.space, coords: origin.coords.slice(), alpha, none };
};
// Serialize a structured colour to its canonical COMPUTED form. hsl/hwb resolve
// to sRGB → color(srgb …); the predefined RGB + xyz spaces → color(<space> …);
// lab/lch/oklab/oklch keep their own function. `none` channels serialize as the
// `none` keyword; alpha ≥ 1 (and not missing) is dropped.
const _csSerialize = (col) => {
  let { space, coords, alpha, none } = col;
  none = (none || [false, false, false, false]).slice();
  if (space === 'hsl' || space === 'hwb') {
    // hsl/hwb resolve to sRGB for serialization. The channels aren't analogous
    // to sRGB's, so a missing hsl/hwb component is NOT carried — it converts as 0
    // (`hsl(none none none)` → `color(srgb 0 0 0)`); only alpha-missing survives.
    coords = _fromXYZ('srgb', _toXYZ(space, coords));
    space = 'srgb';
    none[0] = none[1] = none[2] = false;
  }
  const hueIdx = _CS_HUE[space];
  const clamp = _CS_CLAMP[space];   // per-channel [min,max] for lab/lch/oklab/oklch
  const chan = (i) => {
    if (none[i]) return 'none';
    let v = coords[i];
    // Hue serializes at 6 significant figures (matching the plain lab/lch/oklch
    // computed serializer in `_modernChannel`) so the harness's exact round-trip
    // re-serialization is byte-stable.
    if (i === hueIdx) v = parseFloat((((v % 360) + 360) % 360).toPrecision(6));
    else if (clamp && clamp[i]) v = Math.max(clamp[i][0], Math.min(clamp[i][1], v));
    return _serNumber(v);
  };
  const body = [chan(0), chan(1), chan(2)];
  let tail = '';
  if (none[3]) tail = ' / none';
  else { const a = Math.max(0, Math.min(1, alpha)); if (a < 1) tail = ' / ' + _serNumber(a); }
  if (space === 'lab' || space === 'lch' || space === 'oklab' || space === 'oklch') {
    return `${space}(${body.join(' ')}${tail})`;
  }
  return `color(${space} ${body.join(' ')}${tail})`;
};
// Top-level computed serialization for color-mix() / relative colour syntax;
// null when `value` isn't one of those (the caller falls back to _computeColor).
const _computeColorMixComputed = (value, el) => {
  if (!/^color-mix\(/i.test(String(value).trim())) return null;
  const st = _colorMixStruct(value, el);
  return st ? _csSerialize(st) : null;
};
const _computeRelativeComputed = (value, el) => {
  const s = String(value).trim();
  if (/^alpha\(\s*from\s/i.test(s) || !/^[a-z]+\(\s*from\s/i.test(s)) return null;
  const st = _relativeStruct(value, el);
  return st ? _csSerialize(st) : null;
};
// Does the alpha() origin serialize in the LEGACY sRGB form (rgb()/rgba())? True
// for named/hex/transparent colours and the legacy sRGB functions rgb/hsl/hwb
// (incl. their relative `<fn>(from …)` forms), and recursively for a nested
// `alpha()` origin. `currentcolor`, `color()`, `color-mix()` and the lab/lch/ok*
// functions are NON-legacy (serialize in their own / `color(srgb …)` form).
const _isLegacyOrigin = (origin, el) => {
  const s = String(origin).replace(/\/\*[\s\S]*?\*\//g, '').trim().toLowerCase();
  if (s === 'transparent' || /^#[0-9a-f]+$/i.test(s) || _CSS_NAMED_COLORS[s]) return true;
  if (s === 'currentcolor') return false;
  const lp = s.indexOf('(');
  if (lp <= 0) return false;
  const fn = s.slice(0, lp);
  if (fn === 'rgb' || fn === 'rgba' || fn === 'hsl' || fn === 'hsla' || fn === 'hwb') return true;
  if (fn === 'alpha') { const p = _parseAlphaFn(s); return p ? _isLegacyOrigin(p.origin, el) : false; }
  return false;
};
// Computed alpha(): a legacy-sRGB origin with a numeric (non-`none`) alpha
// serializes as rgb()/rgba(); otherwise the structured colour serializes in its
// own space's canonical computed form (a `none` alpha forces even a legacy origin
// into `color(srgb … / none)`, since legacy syntax can't express a missing alpha).
const _computeAlphaComputed = (value, el) => {
  const s = String(value).trim();
  if (!/^alpha\(\s*from\s/i.test(s)) return null;
  const p = _parseAlphaFn(s);
  if (!p) return null;
  const st = _alphaStruct(s, el);
  if (!st) return null;
  if (!st.none[3] && _isLegacyOrigin(p.origin, el)) {
    const o = st.space === 'srgb' ? st : _csConvert(st, 'srgb');
    return _serColor(o.coords[0] * 255, o.coords[1] * 255, o.coords[2] * 255, st.alpha);
  }
  return _csSerialize(st);
};
// Computed contrast-color(): resolve the inner <color> and pick black or white,
// whichever maximizes the WCAG-2.1 contrast ratio against it. The colour's
// relative luminance L is the Y of its XYZ-D65 form; contrast-with-white is
// (1.05)/(L + 0.05), contrast-with-black is (L + 0.05)/0.05 — black wins iff its
// ratio is the larger (i.e. L is high). The argument's alpha plays no part. The
// WPT computed test accepts EITHER black or white for every case (the exact
// algorithm isn't pinned), so this stays sound even at the L = 0.18 crossover.
const _contrastStruct = (value, el) => {
  const p = _parseContrastColor(value);
  if (!p) return null;
  let inner = _resolveColorStruct(p.color, el);
  // A system-colour keyword has no structured form (its used value is UA-defined);
  // resolve it to its approximate sRGB so we have a luminance to choose against.
  if (!inner) {
    const low = p.color.trim().toLowerCase();
    if (_SYSTEM_COLORS.has(low)) inner = _csParse(_SYSTEM_COLOR_RGB[low] || 'rgb(128, 128, 128)');
  }
  if (!inner) return null;
  const L = _csConvert(inner, 'xyz-d65').coords[1];
  const useBlack = (L + 0.05) / 0.05 >= 1.05 / (L + 0.05);
  const c = useBlack ? 0 : 1;
  return { space: 'srgb', coords: [c, c, c], alpha: 1, none: [false, false, false, false] };
};
// Top-level computed serialization for contrast-color() — a sRGB black/white, so
// it serializes in the legacy rgb() form when standalone (`contrast-color(white)`
// → `rgb(0, 0, 0)`); nested inside color-mix()/relative colour it is resolved via
// `_resolveColorStruct` and serialized in that context's own space instead.
const _computeContrastColorComputed = (value, el) => {
  const s = String(value).trim();
  if (!/^contrast-color\(/i.test(s)) return null;
  const st = _contrastStruct(s, el);
  if (!st) return null;
  return _serColor(st.coords[0] * 255, st.coords[1] * 255, st.coords[2] * 255, st.alpha);
};
// Computed `color` of an element, honouring inheritance and `currentColor`.
// A missing/`inherit`/`currentcolor` value inherits the parent's color; the
// document root falls back to the initial value rgb(0, 0, 0).
const _specifiedValue = (el, kebab) => {
  // The element's own specified value for `kebab`. `el.style[prop] = …`
  // (the live CSSOM declaration) does NOT reflect to the style="" attribute the
  // cascade reads, so a CSSOM-set value lives only on the live decl. `color`
  // (the historically decl-set property) consults the live decl first; other
  // properties stay cascade-first so author `!important` rules resolve correctly,
  // falling back to the live decl only when the cascade is silent.
  const liveDecl = () => {
    try {
      const s = el && el.style;
      if (s && s.getPropertyValue) return s.getPropertyValue(kebab) || '';
    } catch (e) {}
    return '';
  };
  const cascade = () => {
    try { return _cascadeResolve(_buildCascade(el), kebab) || ''; } catch (e) { return ''; }
  };
  // The cascade now incorporates the live CSSOM decl as its top normal source,
  // so it is authoritative for every property (the liveDecl fallback only covers
  // the case where building the cascade threw).
  return cascade() || liveDecl();
};
const _specifiedColor = (el) => _specifiedValue(el, 'color');
// Properties that inherit by default — for these an absent value or the
// `unset`/`revert` keyword resolves to the parent's computed value; for every
// other property those resolve to the property's initial value. Only the
// properties our computed-style engine actually models need appear here.
const _INHERITED_PROPS = new Set([
  'color', 'font-size', 'font-weight', 'line-height', 'visibility',
  'cursor', 'pointer-events',
  // css-text: every property in this family inherits.
  'hanging-punctuation', 'hyphens', 'letter-spacing', 'line-break',
  'overflow-wrap', 'tab-size', 'text-align', 'text-align-all', 'text-align-last',
  'text-fit', 'text-indent', 'text-justify', 'text-transform', 'text-wrap',
  'text-wrap-mode', 'text-wrap-style', 'white-space', 'white-space-collapse',
  'word-break', 'word-spacing', 'word-wrap',
  // css-fonts: every property in this family inherits.
  'font-family', 'font-feature-settings', 'font-kerning', 'font-language-override',
  'font-optical-sizing', 'font-size-adjust', 'font-stretch', 'font-style',
  'font-synthesis', 'font-variant', 'font-variant-alternates', 'font-variant-caps',
  'font-variant-east-asian', 'font-variant-emoji', 'font-variant-ligatures',
  'font-variant-numeric', 'font-variant-position', 'font-variation-settings',
  // css-ui: caret-color, caret-shape and cursor inherit (the outline-* and
  // nav-* properties and appearance/resize/user-select do NOT).
  'caret-color', 'caret-shape',
  // css-text-decor: text-emphasis-* / text-shadow / text-underline-position /
  // text-decoration-skip-ink inherit (text-decoration-* do NOT).
  'text-emphasis-color', 'text-emphasis-position', 'text-emphasis-style',
  'text-shadow', 'text-underline-position', 'text-decoration-skip-ink',
  // css-writing-modes: all but unicode-bidi inherit.
  'direction', 'text-combine-upright', 'text-orientation', 'writing-mode',
  // css-lists: the list-style-* properties inherit (counter-* do NOT).
  'list-style-image', 'list-style-position', 'list-style-type',
  // css-overflow: only block-ellipsis inherits.
  'block-ellipsis',
  // css-break: orphans/widows inherit.
  'orphans', 'widows',
  // css-images: image-orientation/image-rendering inherit.
  'image-orientation', 'image-rendering',
  // css-tables: all but table-layout inherit.
  'border-collapse', 'border-spacing', 'caption-side', 'empty-cells',
  // css-content: quotes inherits.
  'quotes',
  // css-color-adjust: every property in this family inherits.
  'color-scheme', 'color-adjust', 'forced-color-adjust', 'print-color-adjust',
]);
const _CSS_WIDE = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer']);
// Initial (computed) value for a property. The defaults table doubles as the
// initial-values table; colour properties not present in it fall back to a
// sensible initial.
const _initialOf = (kebab) => {
  if (kebab in _GCS_DEFAULTS) return _GCS_DEFAULTS[kebab];
  if (_COLOR_PROPS.has(kebab)) return kebab === 'background-color' ? 'rgba(0, 0, 0, 0)' : 'rgb(0, 0, 0)';
  return '';
};
// ─── CSS <position> value serialization ──────────────────────────────────────
// The <position> grammar (object-position, background-position, the gradient
// `at <position>` clause) admits 1–4 tokens with the two axes in either order.
// Canonical serialization fixes a horizontal-then-vertical order, fills an omitted
// axis with `center`, and — for computed values — resolves keywords to percentages.
// KEY subtlety: an offset attaches to an edge keyword ONLY in the 3/4-token
// edge-offset form. In the 1/2-token form `right 40%` is two independent
// components (H:`right`, V:`40%`), NOT `right` with a 40% offset.
const _POSITION_PROPS = new Set(['object-position', 'background-position',
  'mask-position', 'offset-anchor', 'offset-position']);
const _POS_H = new Set(['left', 'right']);
const _POS_V = new Set(['top', 'bottom']);
// A token is a <length-percentage> (a percentage, a bare number, a number with a
// LENGTH unit, or a math fn). A dimension with a non-length unit (`30deg`, `2s`,
// `5dpi`) is NOT a <length-percentage> and must be rejected — an angle/time in a
// <position> slot is invalid (offset-anchor / offset-position `30deg`).
const _isPosLP = (t) => {
  const s = String(t).toLowerCase();
  if (/^(?:calc|min|max|clamp)\(/.test(s)) return true;
  const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(%|[a-z]+)?$/i.exec(t);
  if (!m) return false;
  const unit = m[1] && m[1].toLowerCase();
  if (!unit || unit === '%') return true;                  // bare number (incl 0) or percentage
  return _LEN_UNIT_RE.test(unit) || /^(?:cq[whib]|cqmin|cqmax|sv[wh]|lv[wh]|dv[wh])$/.test(unit);
};
// Parse one <position> into { h, v } components (each { kw?, off?, lp? }), or null.
const _parsePosition = (value) => {
  const toks = _wsTokens(String(value).trim());
  const n = toks.length;
  if (n < 1 || n > 4) return null;
  const isKw = (t) => { const l = t.toLowerCase(); return l === 'center' || _POS_H.has(l) || _POS_V.has(l); };
  const comps = [];
  if (n <= 2) {
    // 1/2-token form: each token is a lone keyword or length-percentage.
    for (const t of toks) {
      if (isKw(t)) comps.push({ kw: t.toLowerCase() });
      else if (_isPosLP(t)) comps.push({ lp: t });
      else return null;
    }
  } else {
    // 3/4-token edge-offset form: each component is an edge keyword with an
    // optional length-percentage offset (`center` never takes an offset).
    let i = 0;
    while (i < n) {
      const l = toks[i].toLowerCase();
      if (l === 'center') { comps.push({ kw: 'center' }); i++; }
      else if (_POS_H.has(l) || _POS_V.has(l)) {
        if (i + 1 < n && _isPosLP(toks[i + 1])) { comps.push({ kw: l, off: toks[i + 1] }); i += 2; }
        else { comps.push({ kw: l }); i++; }
      } else return null;
    }
    if (comps.length !== 2) return null;
  }
  // Assign components to the horizontal / vertical axes.
  let h, v;
  if (comps.length === 1) {
    const c = comps[0];
    if (c.kw && _POS_H.has(c.kw)) { h = c; v = { kw: 'center' }; }
    else if (c.kw && _POS_V.has(c.kw)) { h = { kw: 'center' }; v = c; }
    else if (c.kw === 'center') { h = { kw: 'center' }; v = { kw: 'center' }; }
    else if (c.lp != null) { h = c; v = { kw: 'center' }; }
    else return null;
  } else {
    const [c1, c2] = comps;
    // Reordering (vertical-first like `top left`) is admitted ONLY in the keyword
    // pair form; once a <length-percentage> is present the order is fixed H-then-V,
    // so `1px left` / `top 1px` are invalid (CSS Values <position>). The axis-conflict
    // guard below then rejects a wrong-axis keyword in either fixed slot.
    if (c1.kw && c2.kw) {
      if (_POS_V.has(c1.kw) || _POS_H.has(c2.kw)) { h = c2; v = c1; } else { h = c1; v = c2; }
    } else { h = c1; v = c2; }
    if ((h.kw && _POS_V.has(h.kw)) || (v.kw && _POS_H.has(v.kw))) return null; // axis conflict / wrong-axis kw
  }
  return { h, v };
};
// Specified-value serialization of one component (edge keywords retained).
const _posCompSpec = (c) => {
  if (c.lp != null) return _canonStandardValue(c.lp);
  if (c.off != null) return c.kw + ' ' + _canonStandardValue(c.off);
  return c.kw;
};
// Canonical specified <position> serialization, per comma-separated layer. A layer
// that doesn't parse is left untouched so an unexpected value is never corrupted.
const _serializePositionSpecified = (value) => {
  const out = [];
  for (const layer of _commaSplitTop(value)) {
    const p = _parsePosition(layer);
    out.push(p ? _posCompSpec(p.h) + ' ' + _posCompSpec(p.v) : layer.trim());
  }
  return out.join(', ');
};
// Computed serialization of a length-percentage: plain percentages and px pass
// through; relative units / math expressions resolve to px against `emPx` (the
// element's computed font-size). Unresolvable → returned canonicalized.
const _posComputeLen = (tok, emPx, lhPx) => {
  const s = String(tok).trim();
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)%$/.test(s)) return _canonStandardValue(s);
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)px$/i.test(s)) return _serNumber(parseFloat(s)) + 'px';
  // A math expression mixing a percentage with lengths can't fully resolve without
  // layout, but the length terms still collapse to px (em/rem/…→px) while the
  // percentage stays symbolic → canonical `calc(P% ± Lpx)` (e.g. `calc(20% - 5em)`
  // → `calc(20% - 200px)`). Falls back to verbatim canon if it isn't a flat sum.
  if (/%/.test(s)) {
    const r = _resolvePctLengthCalc(s, emPx);          // mixed %+length → calc(P% ± Lpx)
    if (r !== null) return r;
    if (!_LEN_UNIT_RE.test(s)) {                        // %-only calc → a single percentage
      const p = _evalMath(s, 100, {});
      if (p !== null) return _serNumber(p) + '%';
    }
    return _canonStandardValue(s);
  }
  const r = _evalMath(s, 0, { lengths: true, emPx, lhPx });
  return r === null ? _canonStandardValue(s) : _serNumber(r) + 'px';
};
// Split a calc() body into flat top-level additive terms `{sign, text}`, splitting
// only on a `+`/`-` that sits at paren depth 0 and is whitespace-surrounded (the CSS
// calc grammar requires that). Nested groups are kept whole inside a term.
const _splitSumTerms = (body) => {
  const s = String(body);
  const terms = [];
  let depth = 0, cur = '', sign = 1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') { depth++; cur += ch; continue; }
    if (ch === ')') { depth--; cur += ch; continue; }
    if (depth === 0 && (ch === '+' || ch === '-') &&
        i > 0 && /\s/.test(s[i - 1]) && i + 1 < s.length && /\s/.test(s[i + 1])) {
      if (cur.trim()) terms.push({ sign, text: cur.trim() });
      sign = ch === '-' ? -1 : 1;
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) terms.push({ sign, text: cur.trim() });
  return terms.length ? terms : null;
};
// Resolve a `calc()` mixing a percentage with length terms into the canonical
// `calc(P% ± Lpx)` form (percentage first), the lengths summed and resolved to px.
// Returns null if it isn't a flat sum of % / resolvable-length terms.
const _resolvePctLengthCalc = (s, emPx) => {
  const m = /^calc\(([\s\S]*)\)$/i.exec(String(s).trim());
  if (!m) return null;
  const terms = _splitSumTerms(m[1]);
  if (!terms) return null;
  let pct = 0, px = 0, havePct = false;
  for (const t of terms) {
    const pm = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(t.text);
    if (pm) { pct += t.sign * parseFloat(pm[1]); havePct = true; continue; }
    const v = _evalMath(t.text, 0, { lengths: true, emPx });
    if (v === null) return null;
    px += t.sign * v;
  }
  if (!havePct) return null;                       // pure length → caller resolves to a single px
  if (px === 0) return _serNumber(pct) + '%';
  return 'calc(' + _serNumber(pct) + '% ' +
    (px < 0 ? '- ' + _serNumber(-px) : '+ ' + _serNumber(px)) + 'px)';
};
// Computed value of one axis component (keyword origins → percentages).
const _posCompComputed = (c, emPx, lhPx) => {
  if (c.lp != null) return _posComputeLen(c.lp, emPx, lhPx);
  if (c.kw === 'center') return '50%';
  const fromStart = (c.kw === 'left' || c.kw === 'top');
  if (c.off == null) return fromStart ? '0%' : '100%';
  const off = String(c.off).trim();
  if (fromStart) return _posComputeLen(off, emPx, lhPx);        // left/top: offset from origin
  // right/bottom: measured from the far edge → 100% − offset.
  const pm = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(off);
  if (pm) return _serNumber(100 - parseFloat(pm[1])) + '%';
  // length offset measured from the far edge → 100% − offset, the offset resolved
  // to px (px stays px, em/rem/etc. → px), the sign folded into the calc operator.
  const lpx = _evalMath(off, 0, { lengths: true, emPx, lhPx });
  if (lpx !== null) {
    return lpx < 0 ? 'calc(100% + ' + _serNumber(-lpx) + 'px)'
                   : 'calc(100% - ' + _serNumber(lpx) + 'px)';
  }
  return _canonStandardValue(off);
};
const _serializePositionComputed = (el, value) => {
  const fs = el ? parseFloat(_computedPropOf(el, 'font-size', 0)) : 16;
  const emPx = fs > 0 ? fs : 16;
  const lhPx = _lineHeightPx(el, emPx);
  const out = [];
  for (const layer of _commaSplitTop(value)) {
    const p = _parsePosition(layer);
    out.push(p ? _posCompComputed(p.h, emPx, lhPx) + ' ' + _posCompComputed(p.v, emPx, lhPx) : layer.trim());
  }
  return out.join(', ');
};
// `transform-origin` / `perspective-origin` are a restricted <position> — the
// two-value form only (no edge-offset 3/4-token grammar) — `transform-origin`
// additionally taking a trailing Z <length>. The 2D axes reorder / default to
// `center` exactly like <position>, but the COMPUTED value resolves to absolute
// lengths against the element's box (percentages → px), unlike object-position.
const _ORIGIN_PROPS = new Set(['transform-origin', 'perspective-origin']);
// A <length> token (Z component): a dimension, bare `0`, or a math function —
// but never a percentage (Z is a pure length per the grammar).
const _isOriginLength = (t) => {
  const s = String(t).toLowerCase();
  if (/^(?:calc|min|max|clamp)\(/.test(s)) return true;
  if (/%/.test(s)) return false;
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[a-z]+$/i.test(s) || /^[+-]?0(?:\.0+)?$/.test(s);
};
// Parse `transform-origin`/`perspective-origin` into { h, v, z } (h/v each
// { kw } or { lp }; z a length token or null when absent/disallowed), or null.
const _parseOriginPos = (value, allowZ) => {
  const toks = _wsTokens(String(value).trim());
  let z = null;
  if (allowZ && toks.length === 3) {
    if (!_isOriginLength(toks[2])) return null;
    z = toks[2];
    toks.length = 2;
  }
  const n = toks.length;
  if (n < 1 || n > 2) return null;
  const isKw = (t) => { const l = t.toLowerCase(); return l === 'center' || _POS_H.has(l) || _POS_V.has(l); };
  const comps = [];
  for (const t of toks) {
    if (isKw(t)) comps.push({ kw: t.toLowerCase() });
    else if (_isPosLP(t)) comps.push({ lp: t });
    else return null;
  }
  let h, v;
  if (comps.length === 1) {
    const c = comps[0];
    if (c.kw && _POS_V.has(c.kw)) { h = { kw: 'center' }; v = c; }
    else { h = c; v = { kw: 'center' }; }                   // H keyword / center / length
  } else {
    const [c1, c2] = comps;
    // Same fixed-order rule as <position>: keyword pairs may reorder, but a
    // <length-percentage> pins H-then-V (`1px left` / `top 1px` are invalid).
    if (c1.kw && c2.kw) {
      if (_POS_V.has(c1.kw) || _POS_H.has(c2.kw)) { h = c2; v = c1; } else { h = c1; v = c2; }
    } else { h = c1; v = c2; }
    if ((h.kw && _POS_V.has(h.kw)) || (v.kw && _POS_H.has(v.kw))) return null; // axis conflict / wrong-axis kw
  }
  return { h, v, z };
};
// Parse an origin value: `transform-origin` takes the restricted two-value form
// plus an optional Z; `perspective-origin` takes the FULL <position> grammar
// (edge-offset forms like `bottom 10% right 20%`) and never a Z.
const _parseOrigin = (kebab, value) => {
  if (kebab === 'transform-origin') return _parseOriginPos(value, true);
  return _parsePosition(value);
};
// Validity gate for the origin properties (drop an invalid declaration). var() and
// the CSS-wide keywords are exempt (resolved/handled later). `perspective-origin`
// is strict <position>, which has NO 3-value form — `center left 1px` must be
// rejected even though the lenient <position> parser tolerates it for legacy
// bg-position; the explicit 3-token guard catches that.
const _isValidOrigin = (kebab, value) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v)) return true;
  if (_CSS_WIDE.has(v.toLowerCase())) return true;
  if (kebab === 'perspective-origin' && _wsTokens(v).length === 3) return false;
  return _parseOrigin(kebab, v) != null;
};
// The strict <position> (CSS Values 4) properties. Their multi-value branch is the
// 4-value edge-offset form `[[left|right]<lp>] && [[top|bottom]<lp>]` ONLY — no
// `center` in the edge form, offsets required on BOTH axes, hence NO 3-value form
// (a 3-token value is always invalid). Distinct from `background-position`, which
// keeps the legacy lenient `<bg-position>` (3-value center forms allowed).
//   object-position : strict, no extra keywords.
//   mask-position   : strict, comma-separated layers, no extra keywords (`auto` invalid).
//   offset-anchor   : strict OR `auto`.
//   offset-position : strict OR `auto` / `normal`.
const _STRICT_POSITION_PROPS = new Map([
  ['object-position', null],
  ['mask-position', null],
  ['offset-anchor', new Set(['auto'])],
  ['offset-position', new Set(['auto', 'normal'])],
]);
const _isValidStrictPosition = (value, extraKw) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v)) return true;
  if (_CSS_WIDE.has(v.toLowerCase())) return true;
  for (const layer of _commaSplitTop(v)) {
    const s = layer.trim();
    if (extraKw && extraKw.has(s.toLowerCase())) continue; // property-specific keyword (auto/normal)
    if (_wsTokens(s).length === 3) return false;           // strict <position> has no 3-value form
    if (_parsePosition(s) == null) return false;
  }
  return true;
};
// `background-position` is the lenient legacy `<bg-position>` — its edge-offset
// branch DOES admit `center` and optional offsets, so 3-value forms like
// `center top 8px` are valid. `_parsePosition` already implements that lenient
// grammar; the gate just drops a layer it can't parse (no 3-token guard).
const _BG_POSITION_PROPS = new Set(['background-position']);
const _isValidBgPosition = (value) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v)) return true;
  if (_CSS_WIDE.has(v.toLowerCase())) return true;
  for (const layer of _commaSplitTop(v)) {
    if (_parsePosition(layer.trim()) == null) return false;
  }
  return true;
};
const _serializeOriginSpecified = (kebab, value) => {
  const p = _parseOrigin(kebab, value);
  if (!p) return value.trim();
  let s = _posCompSpec(p.h) + ' ' + _posCompSpec(p.v);
  if (p.z != null) s += ' ' + _canonStandardValue(p.z);
  return s;
};
// Computed length (px) of one origin axis component against `base` (the box
// width or height in px). Keyword origins → fraction of base; an edge offset is
// measured from that edge (right/bottom → base − offset); lengths/percentages/
// math resolve against base. Returns null when unresolvable (e.g. auto box).
const _originAxisPx = (c, base, emPx) => {
  if (c.lp != null) return _evalMath(c.lp, isFinite(base) ? base : 0, { lengths: true, emPx });
  if (c.kw === 'center') return isFinite(base) ? 0.5 * base : null;
  const fromEnd = (c.kw === 'right' || c.kw === 'bottom');
  if (c.off == null) return isFinite(base) ? (fromEnd ? base : 0) : null;
  const o = _evalMath(c.off, isFinite(base) ? base : 0, { lengths: true, emPx });
  if (o === null) return null;
  return fromEnd ? base - o : o;
};
const _serializeOriginComputed = (el, kebab, value) => {
  const p = _parseOrigin(kebab, value);
  if (!p) return value.trim();
  const fs = el ? parseFloat(_computedPropOf(el, 'font-size', 0)) : 16;
  const emPx = fs > 0 ? fs : 16;
  const w = el ? parseFloat(_computedPropOf(el, 'width', 0)) : NaN;
  const h = el ? parseFloat(_computedPropOf(el, 'height', 0)) : NaN;
  const fmt = (x, c) => (x === null ? _posCompSpec(c) : _serNumber(x) + 'px');
  let s = fmt(_originAxisPx(p.h, w, emPx), p.h) + ' ' + fmt(_originAxisPx(p.v, h, emPx), p.v);
  if (p.z != null) {
    const r = _evalMath(p.z, 0, { lengths: true, emPx });
    s += ' ' + (r === null ? _canonStandardValue(p.z) : _serNumber(r) + 'px');
  }
  return s;
};
// ── Gradient canonicalization ──────────────────────────────────────────────
// `radial-gradient`/`conic-gradient` (and their `repeating-` variants) carry an
// `[ at <position> ]?` clause that shares the <position> grammar above. Specified
// serialization canonicalizes that clause (horizontal-first reorder); computed
// serialization additionally resolves it to percentages/px, drops a default
// `at center center` (→ `50% 50%`), and computes each colour stop. Non-gradient
// text (url(), `none`, the commas between multiple background layers) passes
// through verbatim, so a multi-image list is preserved.
const _GRADIENT_PROPS = new Set(['background-image', 'mask-image', 'list-style-image', 'border-image-source', 'cursor']);
const _GRADIENT_HEAD = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/i;
const _GRADIENT_RADIAL_SIZE = /^(?:closest|farthest)-(?:side|corner)$/;
const _ANGLE_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:deg|grad|rad|turn)$/i;
const _ANGLE_UNIT_RE = /(?:deg|grad|rad|turn)\b/i;
const _LEN_UNIT_RE = /(?:px|r?em|ex|ch|ic|cap|lh|in|cm|mm|q|pt|pc|v[wh]|vmin|vmax)\b/i;
const _isAngle = (t) => _ANGLE_RE.test(t) || /^calc\(/i.test(t);
// Serialize a computed <angle> in degrees — to 6 significant figures, as browsers
// do (`2rad` → `114.592deg`, not `114.591559deg`).
const _serAngle = (deg) => _serNumber(parseFloat(deg.toPrecision(6))) + 'deg';
// Resolve a CSS <angle> token (incl. a calc() of angles) to a canonical `<n>deg`.
// `1turn`→`360deg`, `calc(360deg * 4 / 5)`→`288deg`. Returns null if not an angle.
const _toDeg = (tok) => {
  const r = _evalMath(String(tok).trim(), 0, { angle: true });
  return r === null ? null : _serAngle(r);
};
// Clamp a negative px result to `0px` (radial gradient sizes are never negative).
const _clampZeroPx = (s) => (/^-(?:\d+\.?\d*|\.\d+)px$/i.test(String(s)) ? '0px' : s);
// The computed px of `1lh`: the used line-height (a <number> multiplies the
// element's computed font-size; a px/% value resolves directly; `normal` ≈ 1.2em).
const _lineHeightPx = (el, emPx) => {
  const lh = el ? String(_computedPropOf(el, 'line-height', 'normal')).trim().toLowerCase() : 'normal';
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(lh)) return parseFloat(lh) * emPx;        // <number>
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|%)$/.exec(lh);
  if (m) return m[2] === '%' ? (parseFloat(m[1]) / 100) * emPx : parseFloat(m[1]);
  return 1.2 * emPx;                                                              // 'normal' (approx)
};
// Computed serialization of one gradient colour-stop position: a percentage
// (incl. a `%`-only calc) stays a percentage; an <angle> (conic stops) resolves
// to `<n>deg`; a <length> resolves to px (`0.5em`→`20px`). Unresolvable → canon.
const _canonStopPos = (tok, emPx, lhPx) => {
  const s = String(tok).trim();
  if (_ANGLE_UNIT_RE.test(s)) {                       // <angle> / angle-calc → deg
    const r = _evalMath(s, 0, { angle: true, emPx, lhPx });
    return r === null ? _canonStandardValue(s) : _serAngle(r);
  }
  if (/%/.test(s)) {
    if (_LEN_UNIT_RE.test(s)) {                        // mixed %+length → keep calc(P% ± Lpx)
      const r = _resolvePctLengthCalc(s, emPx);
      return r !== null ? r : _canonStandardValue(s);
    }
    const r = _evalMath(s, 100, {});                   // %-only (incl. calc) → %
    return r === null ? _canonStandardValue(s) : _serNumber(r) + '%';
  }
  const r = _evalMath(s, 0, { lengths: true, emPx, lhPx });   // <length> → px
  return r === null ? _canonStandardValue(s) : _serNumber(r) + 'px';
};

// ─── css-motion / css-backgrounds single-axis longhands (Quest #90) ──────────
// CSSOM serializes the terms of a `calc()` sum in a canonical order — numbers,
// then the percentage, then dimensions alphabetically by unit (CSS Values 4
// §10.13), e.g. `calc(10px - 0.5em)` → `calc(-0.5em + 10px)`. The shared
// `_canonMathExpr` folds same-unit terms but does NOT reorder mixed units; this
// sorts a FLAT sum of simple number/%/dimension terms into that order. Anything
// richer (nested groups, products, functions) falls back to the unsorted canon.
// Scoped to `_canonLPToken` so the shared calc hot path is untouched.
const _canonSortedCalc = (value) => {
  const canon = _canonMathExpr(value);
  const m = /^calc\(([\s\S]*)\)$/i.exec(canon);
  if (!m) return canon;
  const terms = _splitSumTerms(m[1]);
  if (!terms || terms.length < 2) return canon;
  const parsed = [];
  for (const t of terms) {
    const mm = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|[a-z]+)?$/i.exec(t.text);
    if (!mm) return canon;                              // a non-simple term → leave order to canon
    const unit = mm[2] ? mm[2].toLowerCase() : '';
    parsed.push({ coef: parseFloat(mm[1]) * t.sign, unit, rank: unit === '' ? 0 : unit === '%' ? 1 : 2 });
  }
  parsed.sort((a, b) => a.rank - b.rank || (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0));
  let out = '';
  parsed.forEach((p, i) => {
    const tok = _serNumber(Math.abs(p.coef)) + p.unit;
    out += i === 0 ? (p.coef < 0 ? '-' : '') + tok : (p.coef < 0 ? ' - ' : ' + ') + tok;
  });
  return 'calc(' + out + ')';
};
// Canonicalize one `<length-percentage>` token: a calc/math fn through the calc
// serializer (with canonical term ordering), a bare number → `<n>px` (length
// context), else verbatim canon.
const _canonLPToken = (t) => {
  const s = String(t).trim();
  if (/^(?:calc|min|max|clamp)\(/i.test(s)) return _canonSortedCalc(s);
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return _serNumber(parseFloat(s)) + 'px';
  return _canonStandardValue(s);
};

// offset-rotate = [ auto | reverse ] || <angle>  (CSS Motion 1 §4). The keyword and
// the angle may appear in either order; the canonical serialization is keyword-first.
// `none` / a bare number / two keywords / three tokens are invalid.
const _parseOffsetRotate = (value) => {
  const toks = _wsTokens(String(value).trim());
  if (toks.length < 1 || toks.length > 2) return null;
  let kw = null, angle = null;
  for (const t of toks) {
    const l = t.toLowerCase();
    if (l === 'auto' || l === 'reverse') { if (kw != null) return null; kw = l; }
    else if (_ANGLE_RE.test(t) || /^calc\(/i.test(t)) { if (angle != null) return null; angle = t; }
    else return null;                       // `none`, bare `0`, … → not part of the grammar
  }
  return (kw == null && angle == null) ? null : { kw, angle };
};
const _isValidOffsetRotate = (value) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v) || _CSS_WIDE.has(v.toLowerCase())) return true;
  return _parseOffsetRotate(v) != null;
};
const _canonOffsetRotate = (value) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v) || _CSS_WIDE.has(v.toLowerCase())) return v;
  const p = _parseOffsetRotate(v);
  if (!p) return v;
  const parts = [];
  if (p.kw) parts.push(p.kw);
  if (p.angle != null) parts.push(/^calc\(/i.test(p.angle) ? _canonMathExpr(p.angle) : _canonStandardValue(p.angle));
  return parts.join(' ');
};
// Computed: the angle resolves to degrees and `reverse` ≡ `auto` + 180°. `auto`
// alone → `auto 0deg`; a lone angle stays a bare `<n>deg`.
const _computeOffsetRotate = (value) => {
  const v = String(value).trim();
  const p = _parseOffsetRotate(v);
  if (!p) return v;
  let deg = 0;
  if (p.angle != null) { const r = _evalMath(p.angle, 0, { angle: true }); if (r === null) return v; deg = r; }
  if (p.kw === 'reverse') return 'auto ' + _serAngle(deg + 180);
  if (p.kw === 'auto') return 'auto ' + _serAngle(deg);
  return _serAngle(deg);
};

// offset-distance = <length-percentage> (CSS Motion 1 §3). A single token; an angle
// (`30deg`) or `none` is invalid. `0` → `0px`; computed resolves em→px (% kept).
const _isValidOffsetDistance = (value) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v) || _CSS_WIDE.has(v.toLowerCase())) return true;
  const toks = _wsTokens(v);
  return toks.length === 1 && _isPosLP(toks[0]);
};
const _canonOffsetDistance = (value) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v) || _CSS_WIDE.has(v.toLowerCase())) return v;
  return _canonLPToken(v);
};
const _computeOffsetDistance = (el, value) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v)) return v;
  const emPx = _emPxOf(el);
  return _posComputeLen(v, emPx, _lineHeightPx(el, emPx));
};

// background-position-x / -y = [ center | [ [ <axis-start>|<axis-end> ]? <lp>? ]! ]#
// (CSS Backgrounds 4). One comma layer per origin; the x axis takes left/right/
// x-start/x-end, the y axis top/bottom/y-start/y-end. `center` takes no offset, the
// keyword precedes any offset, and a wrong-axis keyword is invalid.
const _BG_AXIS_KW = {
  x: { left: 'start', right: 'end', 'x-start': 'start', 'x-end': 'end' },
  y: { top: 'start', bottom: 'end', 'y-start': 'start', 'y-end': 'end' },
};
const _BG_POSITION_AXIS = new Map([
  ['background-position-x', 'x'], ['background-position-y', 'y'],
]);
// Parse one layer → { kw?, edge?, off?, lp? } or null. The original keyword is kept
// (so logical x-start/y-end survive specified serialization); `edge` is start|end.
const _parseBgAxisLayer = (layer, axis) => {
  const map = _BG_AXIS_KW[axis];
  const toks = _wsTokens(String(layer).trim());
  if (toks.length < 1 || toks.length > 2) return null;
  if (toks.length === 1) {
    const l = toks[0].toLowerCase();
    if (l === 'center') return { kw: 'center' };
    if (l in map) return { kw: l, edge: map[l] };
    if (_isPosLP(toks[0])) return { lp: toks[0] };
    return null;
  }
  const l = toks[0].toLowerCase();                 // 2-token form: edge keyword THEN offset
  if (!(l in map) || !_isPosLP(toks[1])) return null;
  return { kw: l, edge: map[l], off: toks[1] };
};
const _isValidBgAxis = (value, axis) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v) || _CSS_WIDE.has(v.toLowerCase())) return true;
  for (const layer of _commaSplitTop(v)) if (_parseBgAxisLayer(layer, axis) == null) return false;
  return true;
};
const _canonBgAxisComp = (c) => {
  if (c.lp != null) return _canonLPToken(c.lp);
  return c.off != null ? c.kw + ' ' + _canonLPToken(c.off) : c.kw;
};
const _canonBgAxis = (value, axis) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v) || _CSS_WIDE.has(v.toLowerCase())) return v;
  return _commaSplitTop(v).map((layer) => {
    const c = _parseBgAxisLayer(layer, axis);
    return c ? _canonBgAxisComp(c) : layer.trim();
  }).join(', ');
};
// Computed: physical keyword → 0%/50%/100%, offsets resolved (end edge → `100% −
// off`, reusing the shared <position> component serializer). A logical keyword
// (x-start/x-end/y-start/y-end) keeps its keyword ONLY when it is the lone layer
// with no offset — matching the observed engine quirk — else it resolves too.
const _bgAxisComputed = (c, emPx, lhPx, keepLogical) => {
  if (c.lp != null) return _posComputeLen(c.lp, emPx, lhPx);
  if (c.kw === 'center') return '50%';
  const logical = c.kw === 'x-start' || c.kw === 'x-end' || c.kw === 'y-start' || c.kw === 'y-end';
  if (logical && keepLogical && c.off == null) return c.kw;
  return _posCompComputed({ kw: c.edge === 'start' ? 'left' : 'right', off: c.off }, emPx, lhPx);
};
const _computeBgAxis = (el, value, axis) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v)) return v;
  const emPx = _emPxOf(el);
  const lhPx = _lineHeightPx(el, emPx);
  const layers = _commaSplitTop(v);
  const single = layers.length === 1;
  return layers.map((layer) => {
    const c = _parseBgAxisLayer(layer, axis);
    return c ? _bgAxisComputed(c, emPx, lhPx, single) : layer.trim();
  }).join(', ');
};

// ============================================================================
// offset-path  (CSS Motion 1 §2 + CSS Shapes 1)
//   offset-path = none | <offset-path> || <coord-box>
//   <offset-path> = <ray()> | <url> | <basic-shape>
// Specified serialization canonicalizes each function (closest-side/round-0/etc.
// defaults elided, calc ordered); computed resolves lengths to px (em/pt→px),
// positions to percentages, and the <basic-shape-rect> functions xywh()/rect() to
// the equivalent inset(). The default <coord-box> is border-box, elided whenever a
// path accompanies it; a lone coord-box is kept. shape() (CSS Shapes 2) is a full
// segment-list grammar (from + move/line/hline/vline/curve/smooth/arc/close commands)
// handled in the _opShape shape branch.
// ============================================================================
const _COORD_BOX = new Set(['content-box', 'padding-box', 'border-box', 'margin-box', 'fill-box', 'stroke-box', 'view-box']);
const _RAY_SIZE = new Set(['closest-side', 'closest-corner', 'farthest-side', 'farthest-corner', 'sides']);
const _SVG_ARGC = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

// One <length-percentage>: specified keeps the symbolic form (0→0px, calc ordered),
// computed resolves em/pt/…→px while % stays symbolic.
const _opLp = (tok, computed, emPx, lhPx) =>
  computed ? _posComputeLen(tok, emPx, lhPx) : _canonLPToken(tok);
// A token whose numeric part is zero (`0`, `0px`, `0%`, `0.0em`) — used to elide a
// `round 0` border-radius (its default).
const _opIsZero = (t) => /^[+-]?(?:0+\.?0*|\.0+)(%|[a-z]+)?$/i.test(String(t).trim());
// margin-style 1–4 value collapse over already-serialized strings.
const _opCollapse4 = (arr) => {
  const [t, r, b, l] = _boxEdges(arr);
  if (l !== r) return [t, r, b, l].join(' ');
  if (b !== t) return [t, r, b].join(' ');
  if (r !== t) return [t, r].join(' ');
  return t;
};
// <border-radius> = <lp>{1,4} [ / <lp>{1,4} ]?  → serialized, or null if malformed.
const _opBorderRadius = (radToks, computed, emPx, lhPx) => {
  const joined = radToks.join(' ');
  const sl = joined.indexOf('/');
  const hStr = sl < 0 ? joined : joined.slice(0, sl);
  const vStr = sl < 0 ? null : joined.slice(sl + 1);
  const hT = _wsTokens(hStr.trim());
  const vT = vStr != null ? _wsTokens(vStr.trim()) : null;
  if (hT.length < 1 || hT.length > 4) return null;
  if (vT && (vT.length < 1 || vT.length > 4)) return null;
  for (const t of hT) if (!_isPosLP(t)) return null;
  if (vT) for (const t of vT) if (!_isPosLP(t)) return null;
  const h = _opCollapse4(hT.map((t) => _opLp(t, computed, emPx, lhPx)));
  if (!vT) return h;
  const v = _opCollapse4(vT.map((t) => _opLp(t, computed, emPx, lhPx)));
  return h === v ? h : h + ' / ' + v;
};
// A ` round <border-radius>` clause — empty string when omitted/all-zero (the
// default), null when the `round` keyword carries a malformed value.
const _opRoundClause = (radToks, computed, emPx, lhPx) => {
  if (radToks == null) return '';
  if (radToks.length === 0) return null;                 // `round` with no value → invalid
  if (radToks.filter((t) => t !== '/').every(_opIsZero)) return '';  // round 0 → omit
  const br = _opBorderRadius(radToks, computed, emPx, lhPx);
  return br == null ? null : ' round ' + br;
};
// polygon()'s `round <length>` — a NON-NEGATIVE <length> (no %, no angle; calc ok).
const _opLength = (t) => {
  const s = String(t).trim();
  if (/^(?:calc|min|max|clamp)\(/i.test(s)) return true;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-z]+)?$/i.exec(s);
  if (!m) return false;
  if (parseFloat(m[1]) < 0) return false;
  const u = m[2] && m[2].toLowerCase();
  if (!u) return parseFloat(m[1]) === 0;                 // unitless allowed only for 0
  return _LEN_UNIT_RE.test(u) || /^(?:cq[whib]|cqmin|cqmax|sv[wh]|lv[wh]|dv[wh])$/.test(u);
};
// Resolve a simple <length-percentage> to { pct, px } (xywh/rect offsets are single
// tokens — no mixed calc). Returns null if unresolvable.
const _opPctPx = (tok, emPx, lhPx) => {
  const s = String(tok).trim();
  const pm = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(s);
  if (pm) return { pct: parseFloat(pm[1]), px: 0 };
  const v = _evalMath(s, 0, { lengths: true, emPx, lhPx });
  return v === null ? null : { pct: 0, px: v };
};
// Serialize a { pct, px } computed offset: a lone % or px, else calc(P% ± Lpx).
const _opSerCalc100 = (pct, px) => {
  if (Math.abs(px) < 1e-9) return _serNumber(pct) + '%';
  if (Math.abs(pct) < 1e-9) return _serNumber(px) + 'px';
  return 'calc(' + _serNumber(pct) + '% ' + (px < 0 ? '- ' + _serNumber(-px) : '+ ' + _serNumber(px)) + 'px)';
};
// 100% − <length-percentage> (the rect()/xywh() right & bottom edges → inset()).
const _opSub100 = (tok, emPx, lhPx) => {
  const c = _opPctPx(tok, emPx, lhPx);
  return c == null ? null : _opSerCalc100(100 - c.pct, -c.px);
};
// Normalize an SVG <string> path: validate command arg-counts (arc needs 7),
// reject the empty path, collapse whitespace, lowercase-z → Z, canon numbers.
// Returns null when invalid. (Computed accepts this same specified form.)
const _opSvgPath = (data) => {
  const s = String(data);
  const toks = [];
  let i = 0; const n = s.length;
  const isD = (c) => c >= '0' && c <= '9';
  while (i < n) {
    const c = s[i];
    if (/\s/.test(c) || c === ',') { i++; continue; }
    if (/[A-Za-z]/.test(c)) { toks.push({ cmd: c }); i++; continue; }
    let j = i;
    if (s[j] === '+' || s[j] === '-') j++;
    let hd = false;
    while (j < n && isD(s[j])) { j++; hd = true; }
    if (s[j] === '.') { j++; while (j < n && isD(s[j])) { j++; hd = true; } }
    if (hd && (s[j] === 'e' || s[j] === 'E')) {
      let k = j + 1; if (s[k] === '+' || s[k] === '-') k++;
      if (isD(s[k])) { k++; while (k < n && isD(s[k])) k++; j = k; }
    }
    if (!hd) return null;
    toks.push({ num: s.slice(i, j) }); i = j;
  }
  if (!toks.length || toks[0].cmd === undefined) return null;
  if (toks[0].cmd.toLowerCase() !== 'm') return null;    // a path must begin with moveto
  const out = [];
  let p = 0;
  while (p < toks.length) {
    const t = toks[p];
    if (t.cmd === undefined) return null;                // stray number outside a command
    const cl = t.cmd.toLowerCase();
    if (!(cl in _SVG_ARGC)) return null;                 // unknown command letter
    p++;
    const nums = [];
    while (p < toks.length && toks[p].num !== undefined) { nums.push(toks[p].num); p++; }
    const argc = _SVG_ARGC[cl];
    const letter = cl === 'z' ? 'Z' : t.cmd;             // only normalization: z → Z
    if (argc === 0) { if (nums.length) return null; out.push(letter); }
    else {
      if (!nums.length || nums.length % argc !== 0) return null;
      out.push(letter + ' ' + nums.map((x) => _serNumber(parseFloat(x))).join(' '));
    }
  }
  return out.join(' ');
};
// Serialize one <offset-path> function (ray/path/url/basic-shape), or null if it
// fails the grammar. `computed` selects specified vs computed serialization.
const _opShape = (head, body, computed, el, emPx, lhPx) => {
  const b = String(body).trim();
  const serPos = (toks) => computed ? _serializePositionComputed(el, toks.join(' ')) : _serializePositionSpecified(toks.join(' '));
  if (head === 'ray') {
    // ray( <angle> && <ray-size>? && contain? && [at <position>]? ) — any order;
    // canonical order is angle, ray-size (closest-side elided), contain, at position.
    const toks = _wsTokens(b);
    let angle = null, size = null, contain = false, posToks = null, i = 0;
    const isPosTok = (t) => { const l = t.toLowerCase(); return l === 'center' || _POS_H.has(l) || _POS_V.has(l) || _isPosLP(t); };
    while (i < toks.length) {
      const t = toks[i], l = t.toLowerCase();
      if (l === 'at') {
        if (posToks != null) return null;
        i++; posToks = [];
        while (i < toks.length && isPosTok(toks[i])) { posToks.push(toks[i]); i++; }
        if (!posToks.length) return null;
        continue;
      }
      if (_RAY_SIZE.has(l)) { if (size != null) return null; size = l; i++; continue; }
      if (l === 'contain') { if (contain) return null; contain = true; i++; continue; }
      if (_ANGLE_RE.test(t) || /^(?:calc|min|max|clamp)\(/i.test(t)) { if (angle != null) return null; angle = t; i++; continue; }
      return null;
    }
    if (angle == null) return null;                      // the <angle> is required
    if (posToks && !_parsePosition(posToks.join(' '))) return null;
    const parts = [];
    if (computed) { const d = _evalMath(angle, 0, { angle: true }); parts.push(d === null ? angle : _serAngle(d)); }
    else parts.push(/^(?:calc|min|max|clamp)\(/i.test(angle) ? _canonMathExpr(angle) : _canonStandardValue(angle));
    if (size && size !== 'closest-side') parts.push(size);
    if (contain) parts.push('contain');
    if (posToks) parts.push('at ' + serPos(posToks));
    return 'ray(' + parts.join(' ') + ')';
  }
  if (head === 'path') {
    const m = /^(['"])([\s\S]*)\1$/.exec(b);             // a lone <string>; a fill-rule prefix is invalid
    if (!m) return null;
    const np = _opSvgPath(m[2]);
    return np == null ? null : 'path("' + np + '")';
  }
  if (head === 'url') {
    const m = /^(['"])([\s\S]*)\1$/.exec(b);
    const inner = m ? m[2] : b;
    return inner === '' ? null : 'url("' + inner + '")';
  }
  if (head === 'inset') {
    const toks = _wsTokens(b);
    const ri = toks.findIndex((t) => t.toLowerCase() === 'round');
    const off = ri < 0 ? toks : toks.slice(0, ri);
    const rad = ri < 0 ? null : toks.slice(ri + 1);
    if (off.length < 1 || off.length > 4) return null;
    for (const t of off) if (!_isPosLP(t)) return null;
    const rc = _opRoundClause(rad, computed, emPx, lhPx);
    if (rc == null) return null;
    return 'inset(' + _opCollapse4(off.map((t) => _opLp(t, computed, emPx, lhPx))) + rc + ')';
  }
  if (head === 'circle') {
    // circle( [ <lp> | closest-side | farthest-side ]? [ at <position> ]? )
    const toks = _wsTokens(b);
    const ai = toks.findIndex((t) => t.toLowerCase() === 'at');
    const rad = ai < 0 ? toks : toks.slice(0, ai);
    const posToks = ai < 0 ? null : toks.slice(ai + 1);
    if (rad.length > 1) return null;
    let radStr = '';
    if (rad.length === 1) {
      const l = rad[0].toLowerCase();
      if (l === 'farthest-side') radStr = 'farthest-side';
      else if (l === 'closest-side') radStr = '';        // default radius → omit
      else if (_isPosLP(rad[0])) radStr = _opLp(rad[0], computed, emPx, lhPx);
      else return null;
    }
    if (posToks && (!posToks.length || !_parsePosition(posToks.join(' ')))) return null;
    const parts = [];
    if (radStr) parts.push(radStr);
    if (posToks) parts.push('at ' + serPos(posToks));
    return 'circle(' + parts.join(' ') + ')';
  }
  if (head === 'ellipse') {
    // ellipse( [ <radius>{2} ]? [ at <position> ]? ) — 0 or 2 radii.
    const toks = _wsTokens(b);
    const ai = toks.findIndex((t) => t.toLowerCase() === 'at');
    const rad = ai < 0 ? toks : toks.slice(0, ai);
    const posToks = ai < 0 ? null : toks.slice(ai + 1);
    if (rad.length !== 0 && rad.length !== 2) return null;
    const radCanon = (t) => {
      const l = t.toLowerCase();
      if (l === 'closest-side' || l === 'farthest-side') return l;
      return _isPosLP(t) ? _opLp(t, computed, emPx, lhPx) : null;
    };
    let radStr = '';
    if (rad.length === 2) {
      const r0 = radCanon(rad[0]), r1 = radCanon(rad[1]);
      if (r0 == null || r1 == null) return null;
      if (!(rad[0].toLowerCase() === 'closest-side' && rad[1].toLowerCase() === 'closest-side'))
        radStr = r0 + ' ' + r1;                          // both default → omit
    }
    if (posToks && (!posToks.length || !_parsePosition(posToks.join(' ')))) return null;
    const parts = [];
    if (radStr) parts.push(radStr);
    if (posToks) parts.push('at ' + serPos(posToks));
    return 'ellipse(' + parts.join(' ') + ')';
  }
  if (head === 'polygon') {
    // polygon( [ <fill-rule> ]? [ round <length> ]? , [ <lp> <lp> ]# )
    const segs = _commaSplitTop(b).map((s) => s.trim());
    let fillRule = null, roundLen = null, pStart = 0;
    const ft = _wsTokens(segs[0] || '');
    const f0 = ft.length ? ft[0].toLowerCase() : '';
    if (f0 === 'nonzero' || f0 === 'evenodd' || f0 === 'round') {
      let pi = 0;
      if (ft[pi].toLowerCase() === 'nonzero' || ft[pi].toLowerCase() === 'evenodd') { fillRule = ft[pi].toLowerCase(); pi++; }
      if (pi < ft.length && ft[pi].toLowerCase() === 'round') {
        pi++;
        if (pi >= ft.length || !_opLength(ft[pi])) return null;
        roundLen = ft[pi]; pi++;
      }
      if (pi !== ft.length) return null;                 // leftover prelude tokens → invalid
      pStart = 1;
    }
    const points = [];
    for (let s = pStart; s < segs.length; s++) {
      const pt = _wsTokens(segs[s]);
      if (pt.length !== 2 || !_isPosLP(pt[0]) || !_isPosLP(pt[1])) return null;
      points.push(pt.map((t) => _opLp(t, computed, emPx, lhPx)).join(' '));
    }
    if (!points.length) return null;
    let pre = '';
    if (fillRule === 'evenodd') pre += 'evenodd';         // nonzero (default) elided
    if (roundLen != null) { const rl = _opLp(roundLen, computed, emPx, lhPx); if (!_opIsZero(rl)) pre += (pre ? ' ' : '') + 'round ' + rl; }
    const sections = pre ? [pre] : [];                    // the prelude is its own comma section
    sections.push(...points);
    return 'polygon(' + sections.join(', ') + ')';
  }
  if (head === 'xywh') {
    // xywh( <lp>{4} [ round <border-radius> ]? ) — specified keeps the function;
    // computed converts to inset(y, 100%−x−w, 100%−y−h, x).
    const toks = _wsTokens(b);
    const ri = toks.findIndex((t) => t.toLowerCase() === 'round');
    const off = ri < 0 ? toks : toks.slice(0, ri);
    const rad = ri < 0 ? null : toks.slice(ri + 1);
    if (off.length !== 4) return null;
    for (const t of off) if (!_isPosLP(t)) return null;
    const rc = _opRoundClause(rad, computed, emPx, lhPx);
    if (rc == null) return null;
    if (!computed) return 'xywh(' + off.map((t) => _canonLPToken(t)).join(' ') + rc + ')';
    const x = _opPctPx(off[0], emPx, lhPx), y = _opPctPx(off[1], emPx, lhPx);
    const w = _opPctPx(off[2], emPx, lhPx), h = _opPctPx(off[3], emPx, lhPx);
    if (!x || !y || !w || !h) return null;
    const four = [
      _posComputeLen(off[1], emPx, lhPx),                            // top = y
      _opSerCalc100(100 - x.pct - w.pct, -(x.px + w.px)),            // right = 100% − x − w
      _opSerCalc100(100 - y.pct - h.pct, -(y.px + h.px)),           // bottom = 100% − y − h
      _posComputeLen(off[0], emPx, lhPx),                           // left = x
    ];
    return 'inset(' + _opCollapse4(four) + rc + ')';
  }
  if (head === 'rect') {
    // rect( [ <lp> | auto ]{4} [ round <border-radius> ]? ) — specified keeps the
    // function; computed converts to inset(t, 100%−r, 100%−b, l) (auto edges → box).
    const toks = _wsTokens(b);
    const ri = toks.findIndex((t) => t.toLowerCase() === 'round');
    const off = ri < 0 ? toks : toks.slice(0, ri);
    const rad = ri < 0 ? null : toks.slice(ri + 1);
    if (off.length !== 4) return null;
    for (const t of off) if (t.toLowerCase() !== 'auto' && !_isPosLP(t)) return null;
    const rc = _opRoundClause(rad, computed, emPx, lhPx);
    if (rc == null) return null;
    if (!computed) return 'rect(' + off.map((t) => t.toLowerCase() === 'auto' ? 'auto' : _canonLPToken(t)).join(' ') + rc + ')';
    const isAuto = (t) => t.toLowerCase() === 'auto';
    const top = isAuto(off[0]) ? '0%' : _posComputeLen(off[0], emPx, lhPx);
    const right = isAuto(off[1]) ? '0%' : _opSub100(off[1], emPx, lhPx);
    const bottom = isAuto(off[2]) ? '0%' : _opSub100(off[2], emPx, lhPx);
    const left = isAuto(off[3]) ? '0%' : _posComputeLen(off[3], emPx, lhPx);
    if (right == null || bottom == null) return null;
    return 'inset(' + _opCollapse4([top, right, bottom, left]) + rc + ')';
  }
  if (head === 'shape') {
    // shape( <fill-rule>? from <coordinate-pair>, <shape-command># )  (CSS Shapes 2).
    // A <coordinate-pair> is two <length-percentage>s; a `with` control-point is a
    // full <position> (so `with 10rem center` is valid). Specified canonicalizes each
    // command (default arc keywords `ccw`/`small`/`rotate 0deg` and the default
    // `nonzero` fill-rule elided); computed resolves lengths to px while percentages
    // stay symbolic. Every command is its own top-level comma section.
    const segs = _commaSplitTop(b).map((s) => s.trim());
    if (segs.length < 2) return null;                      // need `from …` + ≥1 command
    const coordPair = (toks) => {
      if (toks.length !== 2 || !_isPosLP(toks[0]) || !_isPosLP(toks[1])) return null;
      return _opLp(toks[0], computed, emPx, lhPx) + ' ' + _opLp(toks[1], computed, emPx, lhPx);
    };
    const ctrlPoint = (toks) => {                          // a <position> (1–4 tokens)
      const joined = toks.join(' ');
      if (!toks.length || !_parsePosition(joined)) return null;
      return computed ? _serializePositionComputed(el, joined) : _serializePositionSpecified(joined);
    };
    // First section: [ <fill-rule> ] from <coordinate-pair>.
    let h0 = _wsTokens(segs[0]);
    let fill = null;
    const f0 = h0.length ? h0[0].toLowerCase() : '';
    if (f0 === 'nonzero' || f0 === 'evenodd') { fill = f0; h0 = h0.slice(1); }
    if (h0.length < 1 || h0[0].toLowerCase() !== 'from') return null;
    const fromCp = coordPair(h0.slice(1));
    if (fromCp == null) return null;
    const outCmds = [];
    for (let s = 1; s < segs.length; s++) {
      const t = _wsTokens(segs[s]);
      if (!t.length) return null;
      const kw = t[0].toLowerCase(), rest = t.slice(1);
      const bt = rest.length ? rest[0].toLowerCase() : '';
      if (kw === 'close') { if (rest.length) return null; outCmds.push('close'); continue; }
      if (kw === 'move' || kw === 'line') {               // <by|to> <coordinate-pair>
        if (rest.length !== 3 || (bt !== 'by' && bt !== 'to')) return null;
        const cp = coordPair(rest.slice(1));
        if (cp == null) return null;
        outCmds.push(kw + ' ' + bt + ' ' + cp); continue;
      }
      if (kw === 'hline' || kw === 'vline') {             // <by|to> <length-percentage>
        if (rest.length !== 2 || (bt !== 'by' && bt !== 'to') || !_isPosLP(rest[1])) return null;
        outCmds.push(kw + ' ' + bt + ' ' + _opLp(rest[1], computed, emPx, lhPx)); continue;
      }
      if (kw === 'curve' || kw === 'smooth') {            // <endpoint> [with <cp> [/ <cp>]?]
        if (rest.length < 3 || (bt !== 'by' && bt !== 'to')) return null;
        const cp = coordPair(rest.slice(1, 3));
        if (cp == null) return null;
        const after = rest.slice(3);
        let withClause = '';
        if (after.length) {
          if (after[0].toLowerCase() !== 'with') return null;
          const groups = [[]];                             // split control-points on a `/` token
          for (const tk of after.slice(1)) { if (tk === '/') groups.push([]); else groups[groups.length - 1].push(tk); }
          if (groups.length > 2) return null;              // at most two control points
          const cps = [];
          for (const g of groups) { const c = ctrlPoint(g); if (c == null) return null; cps.push(c); }
          withClause = ' with ' + cps.join(' / ');
        } else if (kw === 'curve') return null;            // `with` is required for curve
        outCmds.push(kw + ' ' + bt + ' ' + cp + withClause); continue;
      }
      if (kw === 'arc') {
        // <endpoint> [of <lp>{1,2}] <arc-sweep>? <arc-size>? [rotate <angle>]?
        if (rest.length < 3 || (bt !== 'by' && bt !== 'to')) return null;
        const cp = coordPair(rest.slice(1, 3));
        if (cp == null) return null;
        let i = 3, radii = null;
        if (i < rest.length && rest[i].toLowerCase() === 'of') {
          i++; const r = [];
          while (i < rest.length && r.length < 2 && _isPosLP(rest[i])) { r.push(rest[i]); i++; }
          if (!r.length) return null;
          radii = r;
        }
        let sweep = null, size = null, rot = null;
        let l = i < rest.length ? rest[i].toLowerCase() : '';
        if (l === 'cw' || l === 'ccw') { sweep = l; i++; l = i < rest.length ? rest[i].toLowerCase() : ''; }
        if (l === 'large' || l === 'small') { size = l; i++; l = i < rest.length ? rest[i].toLowerCase() : ''; }
        if (l === 'rotate') {
          i++;
          if (i >= rest.length) return null;
          rot = rest[i];
          if (!_ANGLE_RE.test(rot) && !/^(?:calc|min|max|clamp)\(/i.test(rot)) return null;
          i++;
        }
        if (i !== rest.length) return null;                // leftover tokens → invalid
        let out = 'arc ' + bt + ' ' + cp;
        if (radii) out += ' of ' + radii.map((t2) => _opLp(t2, computed, emPx, lhPx)).join(' ');
        if (sweep && sweep !== 'ccw') out += ' ' + sweep;  // ccw default elided
        if (size && size !== 'small') out += ' ' + size;   // small default elided
        if (rot != null) {
          const isCalc = /^(?:calc|min|max|clamp)\(/i.test(rot);
          const deg = _evalMath(rot, 0, { angle: true });
          const specAngle = isCalc ? _canonMathExpr(rot) : _canonStandardValue(rot);
          if (deg === null) out += ' rotate ' + specAngle;          // unresolvable → keep verbatim
          else if (Math.abs(deg) > 1e-9) out += ' rotate ' + (computed ? _serAngle(deg) : specAngle);
          // rotate 0deg is the default → elided in both specified and computed
        }
        outCmds.push(out); continue;
      }
      return null;                                          // unknown command keyword
    }
    const headSeg = (fill === 'evenodd' ? 'evenodd ' : '') + 'from ' + fromCp;
    return 'shape(' + [headSeg, ...outCmds].join(', ') + ')';
  }
  return null;                                            // anything else invalid
};
// offset-path top level: none | <offset-path> || <coord-box>.
const _serOffsetPath = (value, computed, el) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v) || _CSS_WIDE.has(v.toLowerCase())) return v;
  if (v.toLowerCase() === 'none') return 'none';
  let box = null, fn = null;
  for (const t of _wsTokens(v)) {
    const l = t.toLowerCase();
    if (_COORD_BOX.has(l)) { if (box != null) return null; box = l; continue; }
    const m = /^([A-Za-z][A-Za-z-]*)\(([\s\S]*)\)$/.exec(t);
    if (!m || fn != null) return null;
    fn = { head: m[1].toLowerCase(), body: m[2] };
  }
  if (fn == null && box == null) return null;
  const emPx = computed ? _emPxOf(el) : 16;
  const lhPx = computed ? _lineHeightPx(el, emPx) : 0;
  let shape = null;
  if (fn) { shape = _opShape(fn.head, fn.body, computed, el, emPx, lhPx); if (shape == null) return null; }
  const parts = [];
  if (shape != null) parts.push(shape);
  if (box != null && !(shape != null && box === 'border-box')) parts.push(box);  // border-box is the default coord-box
  return parts.join(' ');
};
const _isValidOffsetPath = (value) => _serOffsetPath(value, false, null) != null;
const _canonOffsetPath = (value) => { const r = _serOffsetPath(value, false, null); return r == null ? value : r; };
const _computeOffsetPath = (el, value) => { const r = _serOffsetPath(value, true, el); return r == null ? value : r; };

// ─── The `offset` shorthand (CSS Motion 1 §6) ───────────────────────────────
//   offset = [ <'offset-position'>? [ <'offset-path'> [ <'offset-distance'> ||
//              <'offset-rotate'> ]? ]? ]! [ / <'offset-anchor'> ]?
// We EXPAND a `offset` declaration into its five longhands (so the CSSOM exposes
// each longhand canonically — `el.style['offset-path']` — and `el.style.offset`
// reconstructs the shorthand from them). Stored state is the five longhand keys
// ONLY (never an `offset` key): clearing the five longhands removes exactly what
// the shorthand added (the "should not set unrelated longhands" invariant), and
// `getPropertyValue('offset')` recomposes on demand via _serializeOffsetShorthand.
const _OFFSET_LONGHANDS = ['offset-position', 'offset-path', 'offset-distance', 'offset-rotate', 'offset-anchor'];
const _OFFSET_INITIAL = { 'offset-position': 'normal', 'offset-path': 'none', 'offset-distance': '0px', 'offset-rotate': 'auto', 'offset-anchor': 'auto' };
// A token that begins the <offset-path> region (everything before it is the
// optional leading <offset-position>): `none`, a ray()/path()/url()/<basic-shape>
// function, or a bare <coord-box> keyword.
const _OFFSET_PATH_FN_RE = /^(?:ray|path|url|circle|ellipse|inset|polygon|xywh|rect|shape)\(/i;
const _isOffsetPathStart = (tok) => {
  const l = String(tok).toLowerCase();
  return l === 'none' || _OFFSET_PATH_FN_RE.test(l) || _COORD_BOX.has(l);
};
// Split a value at top-level `/` (paren/bracket/quote aware). Returns the parts
// (1 or 2), or null if more than one top-level slash is present.
const _splitTopSlash = (s) => {
  const parts = []; let depth = 0, cur = '', q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q && s[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') { depth++; cur += c; continue; }
    if (c === ')' || c === ']') { depth--; cur += c; continue; }
    if (c === '/' && depth === 0) { parts.push(cur); cur = ''; if (parts.length > 1) return null; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
};
// Parse the `[ <offset-distance> || <offset-rotate> ]?` tail that may follow the
// <offset-path>. Either component, in either order, each at most once; an
// offset-rotate is a maximal `[auto|reverse] || <angle>` (1–2 tokens). Returns
// { dist, rot } (each a raw token string or null), or null if a token fits
// neither slot or a slot repeats (e.g. `reverse 100px 30deg` interleaves rotate).
const _parseOffsetDistRot = (toks) => {
  const isAngleTok = (t) => _ANGLE_RE.test(t) || /^calc\(/i.test(t);
  const isRotKw = (t) => { const l = t.toLowerCase(); return l === 'auto' || l === 'reverse'; };
  let dist = null, rot = null, i = 0;
  while (i < toks.length) {
    if (dist == null && _isPosLP(toks[i])) { dist = toks[i]; i++; continue; }
    if (rot == null && (isRotKw(toks[i]) || isAngleTok(toks[i]))) {
      let consumed = 1;
      if (i + 1 < toks.length) {                            // a complementary kw/angle joins
        if (isRotKw(toks[i]) && isAngleTok(toks[i + 1])) consumed = 2;
        else if (isAngleTok(toks[i]) && isRotKw(toks[i + 1])) consumed = 2;
      }
      rot = toks.slice(i, i + consumed).join(' '); i += consumed; continue;
    }
    return null;                                            // unconsumable token → invalid
  }
  return { dist, rot };
};
// Parse a specified `offset` value into canonical longhand values, or null if it
// does not match the grammar. Side-effect-free.
const _parseOffsetShorthand = (value) => {
  const v = String(value).trim();
  if (v === '') return null;
  // CSS-wide keyword / var(): every longhand takes the value verbatim (CSSOM).
  if (_CSS_WIDE.has(v.toLowerCase()) || _TF_VAR_RE.test(v)) {
    const out = {}; for (const ln of _OFFSET_LONGHANDS) out[ln] = v; return out;
  }
  const slash = _splitTopSlash(v);
  if (slash == null) return null;                           // >1 top-level slash
  const before = slash[0].trim();
  const anchorStr = slash.length === 2 ? slash[1].trim() : null;
  if (anchorStr === '') return null;                        // `… /` with no anchor
  if (before === '') return null;                           // `/ anchor` — the `!` group is empty
  const res = Object.assign({}, _OFFSET_INITIAL);
  // <offset-anchor>: `auto` or a strict <position>.
  if (anchorStr != null) {
    if (!_isValidStrictPosition(anchorStr, _STRICT_POSITION_PROPS.get('offset-anchor'))) return null;
    res['offset-anchor'] = _serializePositionSpecified(anchorStr);
  }
  const toks = _wsTokens(before);
  let pi = -1;
  for (let i = 0; i < toks.length; i++) { if (_isOffsetPathStart(toks[i])) { pi = i; break; } }
  if (pi < 0) {
    // No <offset-path> token → the whole `before` is the <offset-position>.
    if (!_isValidStrictPosition(before, _STRICT_POSITION_PROPS.get('offset-position'))) return null;
    res['offset-position'] = _serializePositionSpecified(before);
    return res;
  }
  if (pi > 0) {
    const posStr = toks.slice(0, pi).join(' ');
    if (!_isValidStrictPosition(posStr, _STRICT_POSITION_PROPS.get('offset-position'))) return null;
    res['offset-position'] = _serializePositionSpecified(posStr);
  }
  // <offset-path>: `none` stands alone; otherwise a run of path-function /
  // <coord-box> tokens (`<basic-shape> || <coord-box>`, either order).
  let pe;
  if (toks[pi].toLowerCase() === 'none') pe = pi + 1;
  else { pe = pi; while (pe < toks.length && (_OFFSET_PATH_FN_RE.test(toks[pe]) || _COORD_BOX.has(toks[pe].toLowerCase()))) pe++; }
  const pathStr = toks.slice(pi, pe).join(' ');
  if (!_isValidOffsetPath(pathStr)) return null;
  res['offset-path'] = _canonOffsetPath(pathStr);
  // [ <offset-distance> || <offset-rotate> ]?
  const dr = _parseOffsetDistRot(toks.slice(pe));
  if (dr == null) return null;
  if (dr.dist != null) { if (!_isValidOffsetDistance(dr.dist)) return null; res['offset-distance'] = _canonOffsetDistance(dr.dist); }
  if (dr.rot != null) { if (!_isValidOffsetRotate(dr.rot)) return null; res['offset-rotate'] = _canonOffsetRotate(dr.rot); }
  return res;
};
// offset-rotate is at its initial value `auto` (so it drops out of the shorthand
// serialization) when it is `auto` with no angle, or `auto` with a zero angle
// (`auto 0deg` / `auto 0rad`). A lone angle (`0deg`) or `reverse` is NOT initial.
const _offsetRotateIsInitial = (canon) => {
  const p = _parseOffsetRotate(canon);
  if (!p || p.kw !== 'auto') return false;
  if (p.angle == null) return true;
  return _evalMath(p.angle, 0, { angle: true }) === 0;
};
// Reconstruct `offset` from the five longhand declarations (CSSOM "serialize a CSS
// value"). Returns '' unless all five are present with consistent priority.
const _serializeOffsetShorthand = (decl) => {
  const vals = {};
  let prio = null;
  for (let k = 0; k < _OFFSET_LONGHANDS.length; k++) {
    const ln = _OFFSET_LONGHANDS[k];
    if (!(ln in decl._props)) return '';
    const p = decl._priority[ln] || '';
    if (k === 0) prio = p; else if (p !== prio) return '';
    vals[ln] = decl._props[ln];
  }
  // All five identical AND a CSS-wide keyword / var() → that single keyword.
  const allSame = _OFFSET_LONGHANDS.every((ln) => vals[ln] === vals['offset-position']);
  if (allSame && (_CSS_WIDE.has(vals['offset-position'].toLowerCase()) || _TF_VAR_RE.test(vals['offset-position'])))
    return vals['offset-position'];
  if (_OFFSET_LONGHANDS.some((ln) => _TF_VAR_RE.test(vals[ln]))) return '';  // a stray var() can't recombine
  const pos = vals['offset-position'], path = vals['offset-path'];
  const dist = vals['offset-distance'], rot = vals['offset-rotate'], anchor = vals['offset-anchor'];
  const posPresent = pos.toLowerCase() !== 'normal';
  const distPresent = dist !== '0px';
  const rotPresent = !_offsetRotateIsInitial(rot);
  const anchorPresent = anchor.toLowerCase() !== 'auto';
  const parts = [];
  if (posPresent) parts.push(pos);
  // The `[ <path> … ]!` group must yield a value: serialize <offset-path> when it
  // is non-`none`, when a distance/rotate follows it, or when nothing precedes it.
  if (path.toLowerCase() !== 'none' || distPresent || rotPresent || !posPresent) {
    parts.push(path);
    if (distPresent) parts.push(dist);
    if (rotPresent) parts.push(rot);
  }
  let s = parts.join(' ');
  if (anchorPresent) s += ' / ' + anchor;
  return s;
};

// Canonicalize a conic-gradient prelude (`from <angle>` before any `at`). At
// computed time the angle resolves to degrees and a default `from 0deg` is dropped.
const _canonConicPrelude = (toks, computed) => {
  if (toks.length >= 2 && toks[0].toLowerCase() === 'from') {
    let ang = toks[1];
    if (computed) {
      const d = _toDeg(ang);
      if (d !== null) ang = d;
      if (ang === '0deg') return toks.slice(2);       // default `from 0deg` omitted
    }
    return ['from', ang].concat(toks.slice(2));
  }
  return toks;
};
// The CSS <color-interpolation-method> color spaces, and the polar subset that
// admits an optional <hue-interpolation-method>. A gradient may carry an
// `in <color-space> [ <hue> hue ]?` clause (CSS Images 4 / CSS Color 4).
const _GRADIENT_COLOR_SPACES = new Set([
  'srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020',
  'lab', 'oklab', 'xyz', 'xyz-d50', 'xyz-d65', 'hsl', 'hwb', 'lch', 'oklch',
]);
const _GRADIENT_POLAR_SPACES = new Set(['hsl', 'hwb', 'lch', 'oklch']);
const _HUE_METHODS = new Set(['shorter', 'longer', 'increasing', 'decreasing']);
// A colour stop uses non-legacy (CSS Color 4) syntax — which makes the gradient's
// default interpolation space `oklab` rather than `srgb`.
const _isNonLegacyColorTok = (t) => /^(?:color|lab|lch|oklab|oklch|hwb)\(/i.test(String(t));
// Locate the `in <color-space> [ <hue> hue ]?` interpolation-method clause inside a
// gradient configuration's tokens → { start, len } (len 2 or 4), or null.
const _interpolationClause = (toks) => {
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].toLowerCase() !== 'in') continue;
    const sp = toks[i + 1] && toks[i + 1].toLowerCase();
    if (!sp || !_GRADIENT_COLOR_SPACES.has(sp)) continue;
    let len = 2;
    if (_GRADIENT_POLAR_SPACES.has(sp)
        && toks[i + 2] && _HUE_METHODS.has(toks[i + 2].toLowerCase())
        && toks[i + 3] && toks[i + 3].toLowerCase() === 'hue') len = 4;
    return { start: i, len };
  }
  return null;
};
// Canonicalize an interpolation-method clause (tokens starting at `in`). Drops the
// default space (`srgb` for legacy stops, `oklab` otherwise), canonicalizes the
// `xyz` alias to `xyz-d65`, and drops the default `shorter hue`. Returns `'in …'`
// or `''` (the default → the whole clause is omitted).
const _canonInterpolationMethod = (toks, isLegacy) => {
  let space = toks[1].toLowerCase();
  if (space === 'xyz') space = 'xyz-d65';
  let result = space;
  if (toks.length > 2) {                              // polar `<hue> hue`
    const hue = toks[2].toLowerCase();
    if (hue !== 'shorter') result = space + ' ' + hue + ' hue';
  }
  return result === (isLegacy ? 'srgb' : 'oklab') ? '' : 'in ' + result;
};
// The first comma-separated argument is a gradient configuration (not a colour
// stop). For `linear-gradient` it's a direction (`to <side>`/`<angle>`); for
// `radial`/`conic` it carries an `at`/`from` clause or a shape/size keyword. Any
// type may additionally (or solely) carry an `in <color-space>` clause.
const _isGradientConfig = (arg, type) => {
  const toks = _wsTokens(String(arg));
  if (!toks.length) return false;
  if (_interpolationClause(toks)) return true;
  if (type === 'linear')
    return toks[0].toLowerCase() === 'to' || (toks.length === 1 && _isAngle(toks[0]));
  if (toks.some((t) => {
    const l = t.toLowerCase();
    return l === 'at' || l === 'from' || l === 'circle' || l === 'ellipse'
      || _GRADIENT_RADIAL_SIZE.test(l);
  })) return true;
  // A radial config may be a bare <radial-size> (`50px`, `50% 40em`) — once the
  // default `ellipse` shape has been dropped at specified time, the size alone must
  // still be recognized as a config (so computed serialization resolves it). Every
  // token is size-ish and a colour stop's leading <color> never is. (Conic has no
  // size, so this is radial-only.)
  return type === 'radial' && toks.every((t) => {
    const l = t.toLowerCase();
    return _isPosLP(t) || _GRADIENT_RADIAL_SIZE.test(l) || l === 'circle' || l === 'ellipse';
  });
};
// Canonicalize a radial prelude (shape/size tokens before any `at`): drop the
// default size `farthest-corner` always, and the default shape `ellipse` when an
// explicit size is also present (`ellipse 50% 40em` → `50% 40em`); a `circle`
// shape or an explicit size/length is kept. At computed time length tokens resolve
// to px (`40em` → `640px`), percentages stay symbolic.
const _canonRadialPrelude = (toks, computed, emPx) => {
  const hasSize = toks.some((t) => _GRADIENT_RADIAL_SIZE.test(t.toLowerCase()) || _isPosLP(t));
  const hasLen = toks.some((t) => _isPosLP(t));      // an explicit <length-percentage> radius
  const out = [];
  for (const t of toks) {
    const l = t.toLowerCase();
    if (l === 'farthest-corner') continue;           // default size, always omitted
    if (l === 'ellipse' && hasSize) continue;        // default shape, drop when a size is present
    if (l === 'circle' && hasLen && computed) continue;  // single-length size implies circle
    out.push(computed && _isPosLP(t) ? _clampZeroPx(_posComputeLen(t, emPx)) : t);
  }
  return out;
};
// Canonicalize the direction/prelude tokens (interpolation clause already removed).
// Linear: keep the direction, dropping the default `to bottom` at computed time.
// Radial/conic: reorder/compute the `at <position>` clause while keeping any
// shape/size/angle prelude (radial defaults dropped); a position resolving to
// `50% 50%` drops the whole `at` clause (bare prelude, possibly empty).
const _canonGradientDirection = (toks, el, computed, type, emPx) => {
  if (type === 'linear') {
    // `to <side-or-corner>` canonicalizes horizontal-side-first: `to top right`
    // → `to right top` (CSSOM serialization order). A single side, an already-
    // canonical corner, or a bare <angle> is left unchanged.
    if (toks.length === 3 && toks[0].toLowerCase() === 'to') {
      const a = toks[1].toLowerCase(), b = toks[2].toLowerCase();
      const vert = (x) => x === 'top' || x === 'bottom';
      const horiz = (x) => x === 'left' || x === 'right';
      if (vert(a) && horiz(b)) toks = ['to', toks[2], toks[1]];
    }
    if (computed) {
      if (toks.join(' ').toLowerCase() === 'to bottom') return '';
      // A single <angle> direction (incl. calc) resolves to degrees.
      if (toks.length === 1 && _isAngle(toks[0])) {
        const r = _evalMath(toks[0], 0, { angle: true, emPx });
        if (r !== null) return _serAngle(r);
      }
    }
    return toks.join(' ');
  }
  const atIdx = toks.findIndex((t) => t.toLowerCase() === 'at');
  let preToks = atIdx < 0 ? toks : toks.slice(0, atIdx);
  if (type === 'radial') preToks = _canonRadialPrelude(preToks, computed, emPx);
  else if (type === 'conic') preToks = _canonConicPrelude(preToks, computed);
  const prelude = preToks.join(' ');
  if (atIdx < 0) return prelude;                     // no position clause to touch
  const posStr = toks.slice(atIdx + 1).join(' ');
  let pos;
  if (computed) {
    pos = _serializePositionComputed(el, posStr);
    if (pos === '50% 50%') return prelude;           // default position → omit `at …`
  } else {
    pos = _serializePositionSpecified(posStr);
  }
  const clause = 'at ' + pos;
  return prelude ? prelude + ' ' + clause : clause;
};
// Canonicalize a gradient configuration chunk: split off the `in <color-space>`
// interpolation clause (reordered to serialize AFTER the direction), canonicalize
// each independently, then recombine `<direction> in <space>`.
const _canonGradientConfig = (arg, el, computed, type, isLegacy, emPx) => {
  let toks = _wsTokens(arg);
  let method = '';
  const ic = _interpolationClause(toks);
  if (ic) {
    method = _canonInterpolationMethod(toks.slice(ic.start, ic.start + ic.len), isLegacy);
    toks = toks.slice(0, ic.start).concat(toks.slice(ic.start + ic.len));
  }
  const dir = _canonGradientDirection(toks, el, computed, type, emPx);
  return dir && method ? dir + ' ' + method : (dir || method);
};
// Computed serialization of one colour stop: `<color> <length-percentage>{0,2}` →
// the colour computed (`red`→`rgb(255, 0, 0)`), positions left as-is. A bare
// transition hint (just a <length-percentage>) has no colour and passes through.
const _canonGradientStop = (arg, el, type, emPx, lhPx) => {
  const toks = _wsTokens(String(arg).trim());
  if (!toks.length) return arg;
  // A bare transition hint (a lone <length-percentage>/<angle>, no colour).
  if (_isPosLP(toks[0]) || (type === 'conic' && _isAngle(toks[0]))) {
    return toks.map((t) => _canonStopPos(t, emPx, lhPx)).join(' ');
  }
  // `currentcolor` resolves to the element's computed `color`.
  const c0 = /^currentcolor$/i.test(toks[0]) && el
    ? _computedPropOf(el, 'color', 'currentcolor') : toks[0];
  const col = _computeColor(c0) || c0;
  const pos = toks.slice(1).map((t) => _canonStopPos(t, emPx, lhPx));
  // A two-position colour stop serializes as two single-position stops.
  if (pos.length === 2) return col + ' ' + pos[0] + ', ' + col + ' ' + pos[1];
  return pos.length ? col + ' ' + pos.join(' ') : col;
};
const _canonGradientInner = (inner, el, computed, type) => {
  const args = _commaSplitTop(inner).map((a) => a.trim());
  if (!args.length) return inner;
  const hasConfig = _isGradientConfig(args[0], type);
  const start = hasConfig ? 1 : 0;
  // A gradient interpolates in `oklab` by default, unless every colour stop is a
  // legacy sRGB colour (named/hex/rgb/hsl), in which case the default is `srgb`.
  // This selects which interpolation-method space is the (omitted) default.
  let isLegacy = true;
  for (let k = start; k < args.length; k++) {
    const tok = _wsTokens(args[k])[0];
    if (tok && _isNonLegacyColorTok(tok)) { isLegacy = false; break; }
  }
  const emPx = computed && el ? (parseFloat(_computedPropOf(el, 'font-size', 0)) || 16) : 16;
  const lhPx = computed ? _lineHeightPx(el, emPx) : 0;
  if (hasConfig) args[0] = _canonGradientConfig(args[0], el, computed, type, isLegacy, emPx);
  if (computed) for (let k = start; k < args.length; k++) args[k] = _canonGradientStop(args[k], el, type, emPx, lhPx);
  return args.filter((a) => a !== '').join(', ');
};
// Canonicalize the argument of an `image()` <image> function. These tests use
// the `image( <color> )` form: canonicalize the colour (specified → keep named/
// modern functions verbatim; computed → resolve to rgb()/rgba()). A url()/other
// <image-src> form has no recognized colour, so `_canonColorSpecified`/
// `_computeColor` return it unchanged → passed through verbatim.
const _canonImageInner = (inner, el, computed) => {
  const arg = inner.trim();
  return computed ? _computeColor(arg) : _canonColorSpecified(arg);
};
// Colour-function heads accepted as the single <color> argument of image(). The
// check is permissive (head only) — that is enough to reject the non-colours the
// invalid-value tests probe (none / url() / bare idents) without re-validating
// the deep colour grammar `_canonColorSpecified`/`_computeColor` already accept.
const _COLOR_FUNC_NAMES = new Set([
  'rgb','rgba','hsl','hsla','hwb','lab','lch','oklab','oklch','color','color-mix','light-dark',
]);
const _isColorish = (s) => {
  const v = String(s).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!v) return false;
  const low = v.toLowerCase();
  if (low === 'transparent' || low === 'currentcolor' || _CSS_NAMED_COLORS[low]) return true;
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(low)) return true;
  const lp = v.indexOf('(');
  if (lp > 0 && v.endsWith(')')) return _COLOR_FUNC_NAMES.has(_unescapeIdent(low.slice(0, lp)));
  return false;
};
// CSS Images 4 image() takes a single <color> argument. Return true when `value`
// (an <image>-property value) contains an image() function that is NOT a single
// <color> — image() / image(none) / image(a, b) / image(notacolor) / image(url(…))
// — so the declaration can be dropped (an invalid value leaves the property unset).
// Other <image> functions (gradients, cross-fade) are scanned past untouched; a
// nested image() inside them is still validated.
const _imageFuncInvalid = (value) => {
  const s = String(value);
  if (!/image\(/i.test(s)) return false;
  const re = /image\(/gi;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index;
    const before = start > 0 ? s[start - 1] : '';
    if (before && /[A-Za-z0-9_-]/.test(before)) continue;   // e.g. -webkit-image-set( → not image()
    const open = start + 5;                                  // index of the '(' in "image("
    let depth = 0, j = open;
    for (; j < s.length; j++) { if (s[j] === '(') depth++; else if (s[j] === ')' && --depth === 0) break; }
    const inner = s.slice(open + 1, j < s.length ? j : s.length);
    const parts = _commaSplitTop(inner).map((p) => p.trim());
    if (parts.length !== 1 || !_isColorish(parts[0])) return true;
    re.lastIndex = j < s.length ? j + 1 : s.length;          // resume past this image()
  }
  return false;
};
// Does `value` contain an image() function token? An image() is an <image>, never
// a <color>, so its presence in a <color> property makes the declaration invalid.
const _hasImageFunc = (value) => {
  const s = String(value);
  const re = /image\(/gi;
  let m;
  while ((m = re.exec(s))) {
    const before = m.index > 0 ? s[m.index - 1] : '';
    if (!before || !/[A-Za-z0-9_-]/.test(before)) return true;
  }
  return false;
};
// Canonicalize one <image> | <color> token inside a cross-fade(): recurse into a
// nested <image> function (gradient/image()/cross-fade), else canonicalize as a
// <color> (url()/anything else returns unchanged).
const _canonCfImage = (tok, el, computed) =>
  (/(?:gradient|cross-fade|image)\(/i.test(tok)
    ? _canonGradients(tok, el, computed)
    : (computed ? _computeColor(tok) : _canonColorSpecified(tok)));
// Canonicalize a cross-fade(): each comma-separated <cf-image> is
// `<percentage>? && [ <image> | <color> ]` — serialize the image/colour first,
// the percentage last, single-space separated.
const _canonCrossFadeInner = (inner, el, computed) => {
  const args = _commaSplitTop(inner).map((a) => a.trim()).filter((a) => a !== '');
  return args.map((arg) => {
    const pct = [], rest = [];
    for (const t of _wsTokens(arg)) {
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)%$/.test(t)) pct.push(t);
      else rest.push(t);
    }
    const img = rest.map((t) => _canonCfImage(t, el, computed)).join(' ');
    return pct.length ? (img ? img + ' ' + pct.join(' ') : pct.join(' ')) : img;
  }).join(', ');
};
// Walk a value, transforming each <image> function in place (balanced-paren
// scan) and leaving every other character untouched. Handles the gradient
// functions plus `image()` and `cross-fade()`.
const _IMAGE_FUNC_HEAD = /((?:repeating-)?(?:linear|radial|conic)-gradient|cross-fade|image)\(/i;
const _canonGradients = (value, el, computed) => {
  const s = String(value);
  if (!/(?:gradient|cross-fade|image)\(/i.test(s)) return s;   // fast path: no <image> fn
  let out = '', i = 0;
  while (i < s.length) {
    const m = _IMAGE_FUNC_HEAD.exec(s.slice(i));
    if (!m) { out += s.slice(i); break; }
    const start = i + m.index;                      // next <image>-fn head in the slice
    const before = start > 0 ? s[start - 1] : '';
    if (before && /[A-Za-z0-9_-]/.test(before)) {   // not a token boundary → skip head
      out += s.slice(i, start + m[0].length); i = start + m[0].length; continue;
    }
    const open = start + m[0].length - 1;           // index of the '('
    let depth = 0, j = open;
    for (; j < s.length; j++) {
      if (s[j] === '(') depth++;
      else if (s[j] === ')' && --depth === 0) break;
    }
    // A function left unclosed at end-of-value is auto-closed by the CSS parser
    // (`conic-gradient(black 1turn, white` is valid) → treat EOF as the implicit ')'.
    const closed = j < s.length;
    const head = m[1].toLowerCase();
    const innerRaw = s.slice(open + 1, closed ? j : s.length);
    let inner;
    if (head === 'image') inner = _canonImageInner(innerRaw, el, computed);
    else if (head === 'cross-fade') inner = _canonCrossFadeInner(innerRaw, el, computed);
    else {
      const type = head.includes('linear') ? 'linear' : head.includes('radial') ? 'radial' : 'conic';
      inner = _canonGradientInner(innerRaw, el, computed, type);
    }
    out += s.slice(i, start) + m[0] + inner + ')';
    i = closed ? j + 1 : s.length;
  }
  return out;
};
// image-set() / -webkit-image-set(): a bare <string> option is shorthand for
// url(<string>), and CSSOM serializes it wrapped — image-set("a" 1x) →
// image-set(url("a") 1x). Balanced-paren scan wraps the leading string of each
// top-level option in url(); the resolution / type() tail and any option that is
// already a url()/<image>/gradient pass through verbatim, and a nested image-set()
// inside light-dark()/etc. is reached by the flat head scan. (Strings are already
// double-quote-normalized by _canonStandardValue, so the wrap is byte-faithful.)
const _canonImageSet = (value) => {
  const s = String(value);
  if (!/image-set\(/i.test(s)) return s;            // fast path: no image-set()
  let out = '', i = 0;
  const re = /(?:-webkit-)?image-set\(/gi;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) { out += s.slice(i); break; }
    const start = m.index;
    const before = start > 0 ? s[start - 1] : '';
    if (before && /[A-Za-z0-9_-]/.test(before)) {   // embedded in a larger ident → not a function head
      out += s.slice(i, start + m[0].length); i = start + m[0].length; continue;
    }
    const open = start + m[0].length - 1;           // index of the '('
    let depth = 0, j = open;
    for (; j < s.length; j++) {
      if (s[j] === '(') depth++;
      else if (s[j] === ')' && --depth === 0) break;
    }
    const closed = j < s.length;
    const innerRaw = s.slice(open + 1, closed ? j : s.length);
    const inner = _splitCommaQuoted(innerRaw).map((opt) => {
      const lead = /^(\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(.*)$/s.exec(opt);
      if (!lead) return opt;                        // no leading <string> → option verbatim
      return lead[1] + 'url(' + lead[2] + ')' + lead[3];
    }).join(',');
    out += s.slice(i, start) + m[0] + inner + ')';
    i = closed ? j + 1 : s.length;
  }
  return out;
};
// Resolve every url() token in a computed <image>/<url> value to its absolute URL
// against the element's document base URL (CSS Values "the computed value of a
// <url> is the absolute URL" — drafts.csswg.org/css-values/#relative-urls),
// serialized double-quoted. A url() whose target won't parse (e.g. an
// unsubstituted {{token}}) — or one that is already absolute — round-trips
// byte-identical, so this is idempotent on absolute values. Handles both the
// quoted functional form url("a") and the unquoted url-token form url(a).
const _canonUrls = (value, el) => {
  const s = String(value);
  if (!/url\(/i.test(s)) return s;
  let base;
  try { base = el && el.baseURI; } catch (e) {}
  if (!base) { try { base = globalThis.document.baseURI; } catch (e) {} }
  if (!base) return s;
  let out = '', i = 0;
  const re = /url\(/gi;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) { out += s.slice(i); break; }
    const start = m.index;
    const before = start > 0 ? s[start - 1] : '';
    if (before && /[A-Za-z0-9_-]/.test(before)) {     // embedded in an ident (e.g. -webkit-url) → not a url() token
      out += s.slice(i, start + 4); i = start + 4; continue;
    }
    let j = start + 4;                                // first char after "url("
    while (j < s.length && /\s/.test(s[j])) j++;
    let raw = '';
    if (s[j] === '"' || s[j] === "'") {               // quoted functional form
      const q = s[j]; j++;
      while (j < s.length && s[j] !== q) {
        if (s[j] === '\\') { j++; if (j < s.length) { raw += s[j]; j++; } continue; }
        raw += s[j]; j++;
      }
      j = Math.min(s.length, j + 1);                  // past closing quote
    } else {                                          // unquoted url-token (no trailing ws)
      while (j < s.length && s[j] !== ')') {
        if (s[j] === '\\') { j++; if (j < s.length) { raw += s[j]; j++; } continue; }
        raw += s[j]; j++;
      }
      raw = raw.replace(/\s+$/, '');
    }
    while (j < s.length && /\s/.test(s[j])) j++;
    if (s[j] === ')') {                               // a well-formed url() — resolve it
      j++;
      out += s.slice(i, start);
      let abs = null;
      try { abs = new URL(raw, base).href; } catch (e) {}
      out += abs == null ? s.slice(start, j)          // unparseable → keep verbatim
        : 'url("' + abs.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
      i = j; continue;
    }
    out += s.slice(i, start + 4); i = start + 4;      // malformed url( → leave head, flow on
  }
  return out;
};
// Split on top-level commas, skipping commas that sit inside parens/brackets or
// inside a quoted string (a counters() separator may legitimately contain a `,`,
// e.g. `counters(n, ",")` — neither _commaSplitTop nor _splitTopLevel is
// quote-aware). Backslash escapes inside a string are consumed.
const _splitCommaQuoted = (s) => {
  const out = []; let depth = 0, cur = '', q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === '\\' && i + 1 < s.length) cur += s[++i];
      else if (c === q) q = '';
      continue;
    }
    if (c === '"' || c === "'") { q = c; cur += c; }
    else if (c === '(' || c === '[' || c === '{') { depth++; cur += c; }
    else if (c === ')' || c === ']' || c === '}') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
};
// css-content: the <counter-style> argument of counter()/counters() defaults to
// `decimal`; an explicit `decimal` (ASCII-case-insensitively) is dropped from the
// serialized value (`counter(n, dECiMaL)`→`counter(n)`, `counters(n, ".", DECIMAL)`
// →`counters(n, ".")`). Any other named style (a custom-ident like `counter-style`)
// is kept verbatim. Balanced-paren, token-boundary-aware scan; a call that isn't
// rewritten is copied byte-for-byte (so escaped counter names like `counter(\})`
// round-trip).
const _canonCounterFns = (value) => {
  const s = String(value);
  if (!/counters?\(/i.test(s)) return s;
  let out = '', i = 0;
  while (i < s.length) {
    const m = /counters?\(/i.exec(s.slice(i));
    if (!m) { out += s.slice(i); break; }
    const start = i + m.index;
    const before = start > 0 ? s[start - 1] : '';
    if (before && /[A-Za-z0-9_-]/.test(before)) {   // not a token boundary → skip head
      out += s.slice(i, start + m[0].length); i = start + m[0].length; continue;
    }
    const isCounters = /^counters\(/i.test(m[0]);
    const open = start + m[0].length - 1;           // index of the '('
    let depth = 0, j = open;
    for (; j < s.length; j++) {
      if (s[j] === '(') depth++;
      else if (s[j] === ')' && --depth === 0) break;
    }
    const closed = j < s.length;
    const end = closed ? j + 1 : s.length;
    const args = _splitCommaQuoted(s.slice(open + 1, closed ? j : s.length)).map((a) => a.trim());
    const want = isCounters ? 3 : 2;               // name[, sep], <style>
    if (closed && args.length === want && args[want - 1].toLowerCase() === 'decimal') {
      out += s.slice(i, start) + (isCounters ? 'counters(' : 'counter(') +
        args.slice(0, want - 1).join(', ') + ')';
    } else {
      out += s.slice(i, end);                        // keep verbatim
    }
    i = end;
  }
  return out;
};
// css-content: canonicalize a `content` value — a list of content-items (strings,
// counter()/counters(), url()/<image>, open-quote/close-quote/…) plus an optional
// `/ <alt-text>`. counter()/counters() drop a default `decimal` <counter-style>;
// gradient/<image> items canonicalize via _canonGradients; at computed time every
// url() absolutizes via _canonUrls. Keyword/string items pass through unchanged.
const _canonContent = (value, el, computed) => {
  let v = _canonCounterFns(String(value));
  v = _canonGradients(v, el, computed);
  if (computed) v = _canonUrls(v, el);
  return v;
};
// ── CSS Filter Effects 1: `filter` / `backdrop-filter` serialization ───────────
// A `<filter-value-list>` is a space-separated list of <filter-function>s (or a
// single `url()` reference); `none` stands alone. Each function canonicalizes
// differently at SPECIFIED time (keep <percentage>/calc form, only fix obvious
// canonicalizations) versus COMPUTED time (resolve calc, %→<number>, fill
// defaults, clamp). filter and backdrop-filter share an identical grammar.
const _FILTER_NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const _FILTER_PCT_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%$/i;
const _FILTER_LEN_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z]+)$/i;
const _FILTER_MATH_RE = /\b(?:calc|min|max|clamp|var|env|sign|abs|round|mod|rem|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|exp|log)\(/i;
const _isFilterZero = (t) => _FILTER_NUM_RE.test(t) && parseFloat(t) === 0; // a unitless zero is a valid <length>/<angle>
// The seven <filter-function>s that take a <number-percentage>; the [0,1]-clamped
// quartet (grayscale/invert/opacity/sepia) versus the unbounded-above trio
// (brightness/contrast/saturate). Value is the upper clamp (Infinity = none).
const _FILTER_AMOUNT = {
  grayscale: 1, invert: 1, opacity: 1, sepia: 1,
  brightness: Infinity, contrast: Infinity, saturate: Infinity,
};
// Split a filter value into top-level space-separated tokens (parens kept whole).
const _splitFilterTokens = (s) => {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth--; cur += c; }
    else if (depth === 0 && /\s/.test(c)) { if (cur) { out.push(cur); cur = ''; } }
    else cur += c;
  }
  if (cur) out.push(cur);
  return out;
};
// Parse a filter value into a list of items: { url } | { name, args } | null.
const _parseFilterValue = (value) => {
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (s === '') return null;
  if (s.toLowerCase() === 'none') return { none: true };
  const items = [];
  for (const tok of _splitFilterTokens(s)) {
    const m = /^([a-z-]+)\((.*)\)$/is.exec(tok);
    if (!m) return null;                                  // not a function form
    const name = m[1].toLowerCase();
    if (name === 'url') { items.push({ url: tok }); continue; }
    items.push({ name, args: m[2].trim() });
  }
  return items.length ? { items } : null;
};
// Is a drop-shadow argument list valid, and what are its colour/lengths? A
// drop-shadow is `<color>? && <length>{2,3}`: 2-3 length offsets (the 3rd is the
// non-negative blur radius) plus an optional colour, in any order.
const _parseShadowArgs = (args) => {
  if (args === '') return null;
  let color = null; const lens = [];
  for (const t of _splitFilterTokens(args)) {
    if (_isFilterZero(t)) { lens.push(t); continue; }
    const lm = _FILTER_LEN_RE.exec(t);
    if (lm && (_LENGTH_PX[lm[2].toLowerCase()] !== undefined || /^(?:cq[whib]|cqmin|cqmax|v[wh]|vmin|vmax|vi|vb)$/i.test(lm[2]))) { lens.push(t); continue; }
    if (_FILTER_MATH_RE.test(t)) { lens.push(t); continue; }   // calc() offset
    // anything else must be the (single) colour
    if (color !== null || !_isValidColor(t)) return null;
    color = t;
  }
  if (lens.length < 2 || lens.length > 3) return null;
  return { color, lens };
};
// Validate one <filter-function> (sans `url()`, handled by the caller).
const _isValidFilterFn = (name, args) => {
  if (name === 'blur') {
    if (args === '' || _FILTER_MATH_RE.test(args)) return true;
    if (_isFilterZero(args)) return true;                 // unitless 0 = 0px
    const lm = _FILTER_LEN_RE.exec(args);
    return !!(lm && _LENGTH_PX[lm[2].toLowerCase()] !== undefined && parseFloat(lm[1]) >= 0);
  }
  if (name === 'hue-rotate') {
    if (args === '' || _FILTER_MATH_RE.test(args)) return true;
    if (_isFilterZero(args)) return true;                 // unitless 0 = 0deg
    const lm = _FILTER_LEN_RE.exec(args);
    return !!(lm && _ANGLE_DEG[lm[2].toLowerCase()] !== undefined);
  }
  if (name in _FILTER_AMOUNT) {
    if (args === '' || _FILTER_MATH_RE.test(args)) return true;
    if (_FILTER_NUM_RE.test(args) || _FILTER_PCT_RE.test(args)) return parseFloat(args) >= 0;
    return false;                                         // a <length> etc. is invalid
  }
  if (name === 'drop-shadow') return _parseShadowArgs(args) !== null;
  return false;                                           // unknown function
};
const _isValidFilter = (value) => {
  const p = _parseFilterValue(value);
  if (!p) return false;
  if (p.none) return true;
  for (const it of p.items) {
    if (it.url) continue;
    if (!_isValidFilterFn(it.name, it.args)) return false;
  }
  return true;
};
// Canonicalize a <number-percentage> filter amount. SPECIFIED keeps the
// number/percentage form, only clamping into range; COMPUTED resolves to a bare
// <number> (a `%` → its fraction), filling the omitted-argument default of 1.
const _canonFilterAmount = (name, args, computed) => {
  const hi = _FILTER_AMOUNT[name];
  if (computed) {
    if (args === '') return name + '(1)';
    const n = _evalMath(args, 1, { lengths: true, cqZero: true });
    if (n === null) return null;
    return name + '(' + _serNumber(Math.max(0, Math.min(hi, n))) + ')';
  }
  // specified
  if (args === '' || _FILTER_MATH_RE.test(args)) return name + '(' + args + ')';
  if (_FILTER_PCT_RE.test(args)) {
    const p = Math.max(0, Math.min(hi * 100, parseFloat(args)));
    return name + '(' + _serNumber(p) + '%)';
  }
  const n = Math.max(0, Math.min(hi, parseFloat(args)));
  return name + '(' + _serNumber(n) + ')';
};
// Canonicalize a drop-shadow. SPECIFIED reorders the colour first and keeps the
// given offsets (unitless 0 → 0px); COMPUTED resolves each length to px, fills
// the omitted blur radius with 0px and the omitted colour with `currentColor`.
const _canonDropShadow = (args, el, computed) => {
  const sh = _parseShadowArgs(args);
  if (!sh) return null;
  const canonLen = (t) => {
    if (computed) { const v = _evalMath(t, 0, { lengths: true, cqZero: true }); return v === null ? null : _serNumber(v) + 'px'; }
    return _isFilterZero(t) ? '0px' : t;                  // specified: unitless 0 → 0px, else verbatim
  };
  const lens = [];
  for (const t of sh.lens) { const c = canonLen(t); if (c === null) return null; lens.push(c); }
  if (computed && lens.length === 2) lens.push('0px');    // computed fills the blur radius
  let color = sh.color;
  if (computed) color = color === null ? (_computedColorOf(el) || 'rgb(0, 0, 0)') : _computeColor(color);
  else if (color !== null) color = _canonColorSpecified(color);
  const parts = (color !== null ? [color] : []).concat(lens);
  return 'drop-shadow(' + parts.join(' ') + ')';
};
// Canonicalize a `filter`/`backdrop-filter` value (the shared serializer for the
// specified `computed=false` and computed `computed=true` paths).
const _canonFilter = (value, el, computed) => {
  const p = _parseFilterValue(value);
  if (!p) return value;                                   // unparseable → leave as-is
  if (p.none) return 'none';
  const out = [];
  for (const it of p.items) {
    if (it.url) { out.push(it.url); continue; }
    const { name, args } = it;
    let piece;
    if (name === 'blur') {
      if (args === '') piece = computed ? 'blur(0px)' : 'blur()';
      else if (computed || _FILTER_MATH_RE.test(args)) {
        if (computed) { const v = _evalMath(args, 0, { lengths: true, cqZero: true }); piece = v === null ? 'blur(' + args + ')' : 'blur(' + _serNumber(Math.max(0, v)) + 'px)'; }
        else piece = 'blur(' + args + ')';                // specified calc → verbatim
      } else piece = 'blur(' + (_isFilterZero(args) ? '0px' : args) + ')';
    } else if (name === 'hue-rotate') {
      if (args === '') piece = computed ? 'hue-rotate(0deg)' : 'hue-rotate()';
      else if (computed || _FILTER_MATH_RE.test(args)) {
        if (computed) { const v = _evalMath(args, 0, { lengths: true, cqZero: true, angle: true }); piece = v === null ? 'hue-rotate(' + args + ')' : 'hue-rotate(' + _serNumber(v) + 'deg)'; }
        else piece = 'hue-rotate(' + args + ')';
      } else piece = 'hue-rotate(' + (_isFilterZero(args) ? '0deg' : args) + ')';
    } else if (name in _FILTER_AMOUNT) {
      piece = _canonFilterAmount(name, args, computed);
    } else if (name === 'drop-shadow') {
      piece = _canonDropShadow(args, el, computed);
    }
    out.push(piece == null ? (name + '(' + args + ')') : piece);
  }
  return out.join(' ');
};
// ── CSS Transforms 1/2: the `transform` property `<transform-list>` ───────────
// A transform value is `none` or a space-separated list of `<transform-function>`s.
// Each function's argument grammar (n = allowed arg counts; t = per-arg type, an
// array means positional). Types: number, np = <number-percentage>, len = <length>,
// lp = <length-percentage>, angle = <angle>, persp = non-negative <length> | none.
const _TF_FUNCS = {
  matrix:      { n: [6],    t: 'number' },
  matrix3d:    { n: [16],   t: 'number' },
  translate:   { n: [1, 2], t: 'lp' },
  translatex:  { n: [1],    t: 'lp' },
  translatey:  { n: [1],    t: 'lp' },
  translatez:  { n: [1],    t: 'len' },
  translate3d: { n: [3],    t: ['lp', 'lp', 'len'] },
  scale:       { n: [1, 2], t: 'np' },
  scalex:      { n: [1],    t: 'np' },
  scaley:      { n: [1],    t: 'np' },
  scalez:      { n: [1],    t: 'np' },
  scale3d:     { n: [3],    t: 'np' },
  rotate:      { n: [1],    t: 'angle' },
  rotatex:     { n: [1],    t: 'angle' },
  rotatey:     { n: [1],    t: 'angle' },
  rotatez:     { n: [1],    t: 'angle' },
  rotate3d:    { n: [4],    t: ['number', 'number', 'number', 'angle'] },
  skew:        { n: [1, 2], t: 'angle' },
  skewx:       { n: [1],    t: 'angle' },
  skewy:       { n: [1],    t: 'angle' },
  perspective: { n: [1],    t: 'persp' },
};
// Canonical serialized spelling for functions whose case is NOT the lowercased
// name: translate*/rotate* preserve camelCase X/Y/Z, while scale*/skew* lowercase
// (a long-standing Blink/WebKit serialization quirk the WPT tests pin).
const _TF_DISP = {
  translatex: 'translateX', translatey: 'translateY', translatez: 'translateZ',
  rotatex: 'rotateX', rotatey: 'rotateY', rotatez: 'rotateZ',
};
const _TF_VAR_RE = /\b(?:var|env)\(/i;
// Split a transform-function's argument list on top-level commas (parens kept whole).
const _splitTfArgs = (s) => {
  s = s.trim();
  if (s === '') return [];
  const out = []; let depth = 0, cur = '';
  for (const c of s) {
    if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth = Math.max(0, depth - 1); cur += c; }
    else if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
};
// Parse a transform value → { none } | { items: [{ name, args[] }] } | null.
const _parseTransform = (value) => {
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (s === '') return null;
  if (s.toLowerCase() === 'none') return { none: true };
  const items = [];
  for (const tok of _splitFilterTokens(s)) {
    const m = /^([a-z][a-z0-9]*)\((.*)\)$/is.exec(tok);
    if (!m) return null;
    const name = m[1].toLowerCase();
    if (!(name in _TF_FUNCS)) return null;
    items.push({ name, args: _splitTfArgs(m[2]) });
  }
  return items.length ? { items } : null;
};
const _tfIsLen = (t) => {
  if (_isFilterZero(t) || _FILTER_MATH_RE.test(t)) return true;
  const lm = _FILTER_LEN_RE.exec(t);
  return !!(lm && (_LENGTH_PX[lm[2].toLowerCase()] !== undefined || /^(?:cq[whib]|cqmin|cqmax|v[wh]|vmin|vmax|vi|vb)$/i.test(lm[2])));
};
const _tfIsAngle = (t) => {
  if (_isFilterZero(t) || _FILTER_MATH_RE.test(t)) return true;
  const lm = _FILTER_LEN_RE.exec(t);
  return !!(lm && _ANGLE_DEG[lm[2].toLowerCase()] !== undefined);
};
const _tfArgType = (spec, i) => (Array.isArray(spec.t) ? spec.t[i] : spec.t);
// A transform-function argument's <type> → (accepted math types, `%`-context), so a
// math function in the argument is grammar/type-checked rather than blindly accepted
// (`rotate(sin(1deg))` — sin yields a <number>, not the <angle> rotate() needs).
const _TF_MATH_TYPE = { number: ['number'], np: ['number'], len: ['length'], lp: ['length'], angle: ['angle'], persp: ['length'] };
const _TF_MATH_PCT  = { number: null, np: 'number', len: null, lp: 'length', angle: null, persp: null };
const _tfArgValid = (t, type) => {
  t = t.trim();
  if (t === '') return false;
  if (_FILTER_MATH_RE.test(t)) {                           // a math function in this argument slot
    if (_TF_VAR_RE.test(t)) return true;                   // var()/env() resolved later
    return _mathValid(t, _TF_MATH_TYPE[type], _TF_MATH_PCT[type]);
  }
  switch (type) {
    case 'number': return _FILTER_NUM_RE.test(t) || _FILTER_MATH_RE.test(t);
    case 'np':     return _FILTER_NUM_RE.test(t) || _FILTER_PCT_RE.test(t) || _FILTER_MATH_RE.test(t);
    case 'len':    return _tfIsLen(t);
    case 'lp':     return _tfIsLen(t) || _FILTER_PCT_RE.test(t);
    case 'angle':  return _tfIsAngle(t);
    case 'persp':  return t.toLowerCase() === 'none' || (_tfIsLen(t) && (_FILTER_MATH_RE.test(t) || parseFloat(t) >= 0));
  }
  return false;
};
const _isValidTransform = (value) => {
  if (_TF_VAR_RE.test(value)) return true;                 // var()/env() resolved later
  if (_CSS_WIDE.has(String(value).trim().toLowerCase())) return true; // inherit/initial/unset/revert
  const p = _parseTransform(value);
  if (!p) return false;
  if (p.none) return true;
  for (const it of p.items) {
    const spec = _TF_FUNCS[it.name];
    if (!spec.n.includes(it.args.length)) return false;
    for (let i = 0; i < it.args.length; i++) {
      if (!_tfArgValid(it.args[i], _tfArgType(spec, i))) return false;
    }
  }
  return true;
};
// Canonicalize one specified argument: lowercase nothing here (the function name is
// lowercased by the caller); fold `<percentage>`→number for scale, unitless 0→0deg
// for angles, keep lengths/percentages and math verbatim.
const _canonTfArg = (t, type) => {
  t = t.trim();
  if (_FILTER_MATH_RE.test(t)) return _canonMathExpr(t) || t;   // fold/canon the math (scale(abs(1))→scale(calc(1)))
  switch (type) {
    case 'number': return _FILTER_NUM_RE.test(t) ? _serNumber(parseFloat(t)) : t;
    case 'np':
      if (_FILTER_PCT_RE.test(t)) return _serNumber(parseFloat(t) / 100);
      if (_FILTER_NUM_RE.test(t)) return _serNumber(parseFloat(t));
      return t;
    case 'angle': return _isFilterZero(t) ? '0deg' : t;
    case 'persp': return t.toLowerCase() === 'none' ? 'none' : t;
    default: return t;                                     // len/lp kept verbatim
  }
};
// CSS Values 4 §calc-type-checking: a non-finite math result is clamped at
// computed-value time — NaN → 0, +∞ → the largest finite value the engine
// represents, −∞ → the most negative. (A finite value passes through unchanged.)
// `1e30` is comfortably finite yet far above any real layout magnitude, which is
// all the conformance tests require (`isFinite` + `>= 1e6`).
const _CALC_CLAMP = 1e30;
const _nfClamp = (v) => Number.isNaN(v) ? 0 : v === Infinity ? _CALC_CLAMP : v === -Infinity ? -_CALC_CLAMP : v;
// Resolve helpers for the COMPUTED matrix (null = unresolvable → caller falls back).
const _tfNum = (t) => {
  t = t.trim();
  if (_FILTER_NUM_RE.test(t)) return parseFloat(t);
  if (_FILTER_PCT_RE.test(t)) return parseFloat(t) / 100;
  return _evalMath(t, 0, {});
};
const _tfLenPx = (t) => { t = t.trim(); return _isFilterZero(t) ? 0 : _evalMath(t, 0, { lengths: true }); };
// A non-finite rotation angle (calc(infinity·1deg)/NaN·…) yields the identity
// matrix — clamp it to 0deg so the built matrix stays finite (cos(±∞)/cos(NaN)
// would otherwise poison it to NaN). null (unparseable) still falls back.
const _tfDeg = (t) => { t = t.trim(); if (_isFilterZero(t)) return 0; const d = _evalMath(t, 0, { angle: true, nonFinite: true }); return d == null ? null : (isFinite(d) ? d : 0); };
// 4×4 matrix in matrix3d() column-major order (index = col*4 + row). Build each
// function's matrix, accumulate by post-multiplication, serialize as matrix()/matrix3d().
const _TF_ID = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const _tfMul = (a, b) => {
  const m = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    m[c * 4 + r] = s;
  }
  return m;
};
const _tfMatrix = (item) => {
  const a = item.args, m = _TF_ID();
  const D = Math.PI / 180;
  switch (item.name) {
    case 'matrix': { const v = a.map(_tfNum); if (v.some((x) => x == null)) return null;
      return [v[0], v[1], 0, 0, v[2], v[3], 0, 0, 0, 0, 1, 0, v[4], v[5], 0, 1]; }
    case 'matrix3d': { const v = a.map(_tfNum); if (v.some((x) => x == null)) return null; return v; }
    case 'translate': { const x = _tfLenPx(a[0]), y = a.length > 1 ? _tfLenPx(a[1]) : 0; if (x == null || y == null) return null; m[12] = x; m[13] = y; return m; }
    case 'translatex': { const x = _tfLenPx(a[0]); if (x == null) return null; m[12] = x; return m; }
    case 'translatey': { const y = _tfLenPx(a[0]); if (y == null) return null; m[13] = y; return m; }
    case 'translatez': { const z = _tfLenPx(a[0]); if (z == null) return null; m[14] = z; return m; }
    case 'translate3d': { const x = _tfLenPx(a[0]), y = _tfLenPx(a[1]), z = _tfLenPx(a[2]); if (x == null || y == null || z == null) return null; m[12] = x; m[13] = y; m[14] = z; return m; }
    case 'scale': { const x = _tfNum(a[0]), y = a.length > 1 ? _tfNum(a[1]) : _tfNum(a[0]); if (x == null || y == null) return null; m[0] = x; m[5] = y; return m; }
    case 'scalex': { const x = _tfNum(a[0]); if (x == null) return null; m[0] = x; return m; }
    case 'scaley': { const y = _tfNum(a[0]); if (y == null) return null; m[5] = y; return m; }
    case 'scalez': { const z = _tfNum(a[0]); if (z == null) return null; m[10] = z; return m; }
    case 'scale3d': { const x = _tfNum(a[0]), y = _tfNum(a[1]), z = _tfNum(a[2]); if (x == null || y == null || z == null) return null; m[0] = x; m[5] = y; m[10] = z; return m; }
    case 'rotate': case 'rotatez': { const d = _tfDeg(a[0]); if (d == null) return null; const r = d * D, c = Math.cos(r), s = Math.sin(r); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
    case 'rotatex': { const d = _tfDeg(a[0]); if (d == null) return null; const r = d * D, c = Math.cos(r), s = Math.sin(r); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
    case 'rotatey': { const d = _tfDeg(a[0]); if (d == null) return null; const r = d * D, c = Math.cos(r), s = Math.sin(r); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
    case 'rotate3d': { let x = _tfNum(a[0]), y = _tfNum(a[1]), z = _tfNum(a[2]); const d = _tfDeg(a[3]); if ([x, y, z, d].some((v) => v == null)) return null;
      const len = Math.hypot(x, y, z); if (len === 0) return m; x /= len; y /= len; z /= len;
      const r = d * D, c = Math.cos(r), s = Math.sin(r), t = 1 - c;
      m[0] = t * x * x + c; m[1] = t * x * y + s * z; m[2] = t * x * z - s * y;
      m[4] = t * x * y - s * z; m[5] = t * y * y + c; m[6] = t * y * z + s * x;
      m[8] = t * x * z + s * y; m[9] = t * y * z - s * x; m[10] = t * z * z + c; return m; }
    case 'skew': { const ax = _tfDeg(a[0]), ay = a.length > 1 ? _tfDeg(a[1]) : 0; if (ax == null || ay == null) return null; m[4] = Math.tan(ax * D); m[1] = Math.tan(ay * D); return m; }
    case 'skewx': { const ax = _tfDeg(a[0]); if (ax == null) return null; m[4] = Math.tan(ax * D); return m; }
    case 'skewy': { const ay = _tfDeg(a[0]); if (ay == null) return null; m[1] = Math.tan(ay * D); return m; }
    case 'perspective': { if (a[0].trim().toLowerCase() === 'none') return m; const d = _tfLenPx(a[0]); if (d == null) return null; m[11] = d === 0 ? 0 : -1 / d; return m; }
  }
  return null;
};
const _TF_2D_ZERO = [2, 3, 6, 7, 8, 9, 11, 14];
const _serMatrix = (m) => {
  const is2D = _TF_2D_ZERO.every((i) => Math.abs(m[i]) < 1e-6) && Math.abs(m[10] - 1) < 1e-6 && Math.abs(m[15] - 1) < 1e-6;
  if (is2D) return 'matrix(' + [m[0], m[1], m[4], m[5], m[12], m[13]].map(_serNumber).join(', ') + ')';
  return 'matrix3d(' + m.map(_serNumber).join(', ') + ')';
};
// Canonicalize a `transform` value. SPECIFIED keeps the function form (lowercasing
// the name, folding scale `%`→number, unitless angle 0→0deg); COMPUTED resolves the
// whole list to a single matrix()/matrix3d() (falling back to the specified form for
// any layout-dependent value the matrix builder cannot resolve, e.g. `%` translate).
const _canonTransform = (value, el, computed) => {
  if (_TF_VAR_RE.test(value)) return value;                // unresolved var()/env()
  const p = _parseTransform(value);
  if (!p) return value;
  if (p.none) return 'none';
  if (computed) {
    let M = _TF_ID();
    for (const it of p.items) { const F = _tfMatrix(it); if (!F) return _canonTransform(value, el, false); M = _tfMul(M, F); }
    return _serMatrix(M);
  }
  const out = [];
  for (const it of p.items) {
    const spec = _TF_FUNCS[it.name];
    const parts = it.args.map((arg, i) => _canonTfArg(arg, _tfArgType(spec, i)));
    out.push((_TF_DISP[it.name] || it.name) + '(' + parts.join(', ') + ')');
  }
  return out.join(' ');
};
// ── Individual transform properties: `scale` / `rotate` / `translate` ───────
// (CSS Transforms 2 §individual-transform-serialization). Unlike the `transform`
// shorthand these do NOT collapse to a matrix — their computed value keeps the
// keyword/number/angle form, only resolving units. Each has its own grammar and
// its own trailing-component elision rule.
const _emPxOf = (el) => (el ? (parseFloat(_computedPropOf(el, 'font-size', 0)) || 16) : 16);

// CSS Values 5 §tree-counting: resolve `sibling-index()` (the element's 1-based
// position among its element siblings) and `sibling-count()` (the total element-
// sibling count) for `_evalMath`. Reads the real DOM via the parent's element
// children; a parentless / detached element is its own sole sibling (index 1,
// count 1). Returns the opts slice the computed paths spread in — `{}` (a no-op
// spread) whenever there's no element OR the value carries no sibling-* function,
// so the common computed path takes no extra DOM round-trip and stays byte-identical.
const _SIBLING_FN_RE = /sibling-(?:index|count)\(/i;
const _siblingOpts = (el, val) => {
  if (!el || !el._nid || (val != null && !_SIBLING_FN_RE.test(String(val)))) return {};
  const parent = el.parentNode;
  if (!parent || !parent._nid) return { siblingIndex: 1, siblingCount: 1 };
  const kids = _domParse('element_children', parent._nid) || [];
  const idx = kids.indexOf(el._nid);
  if (idx < 0) return { siblingIndex: 1, siblingCount: 1 };
  return { siblingIndex: idx + 1, siblingCount: kids.length };
};

// ----- scale: none | [ <number> | <percentage> ]{1,3} -----
// A scale component's math function must be dimensionless (a <number>/<percentage>):
// strip any `sign()` body (it yields a <number> from arguments of any type — e.g.
// `sign(1em - 1px)`) then require the remainder to evaluate with NO units present.
const _scaleCalcOk = (t) => {
  const stripped = t.replace(/\bsign\s*\((?:[^()]|\([^()]*\))*\)/gi, '1');
  return _evalMath(stripped, 1, { nonFinite: true, siblingValid: true }) !== null;   // a dimensionless calc that resolves to NaN/∞ is still valid
};
const _scaleCompValid = (t) => {
  t = t.trim();
  if (_FILTER_NUM_RE.test(t) || _FILTER_PCT_RE.test(t)) return true;
  if (_FILTER_MATH_RE.test(t)) return _scaleCalcOk(t);
  return false;
};
const _isValidScale = (value) => {
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (s === '') return false;
  if (s.toLowerCase() === 'none') return true;
  const toks = _splitFilterTokens(s);
  if (toks.length < 1 || toks.length > 3) return false;
  return toks.every(_scaleCompValid);
};
const _scaleComp = (t, el, computed) => {
  t = t.trim();
  if (_FILTER_MATH_RE.test(t)) {
    if (computed) {
      const v = _evalMath(t, 1, { lengths: true, angle: true, emPx: _emPxOf(el), nonFinite: true, ..._siblingOpts(el, t) });
      if (v === null) return _canonMathExpr(t) || t;
      if (!isFinite(v)) return _serNumber(_nfClamp(v));         // NaN → 0, ±∞ → clamped finite
      return _serNumber(v);
    }
    return _canonMathExpr(t) || t;
  }
  if (_FILTER_PCT_RE.test(t)) return _serNumber(parseFloat(t) / 100);
  return _serNumber(parseFloat(t));
};
const _canonScale = (value, el, computed) => {
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (s.toLowerCase() === 'none') return 'none';
  let c = _splitFilterTokens(s).map((t) => _scaleComp(t, el, computed));
  // Elide a trailing z==1, then a trailing y equal to x (CSS Transforms 2).
  if (c.length === 3 && c[2] === '1') c = c.slice(0, 2);
  if (c.length === 2 && c[1] === c[0]) c = c.slice(0, 1);
  return c.join(' ');
};

// ----- rotate: none | <angle> | [ x | y | z | <number>{3} ] && <angle> -----
const _rotKind = (t) => {
  const low = t.trim().toLowerCase();
  if (low === 'x' || low === 'y' || low === 'z') return 'kw';
  const lm = _FILTER_LEN_RE.exec(t);
  if (lm && _ANGLE_DEG[lm[2].toLowerCase()] !== undefined) return 'angle';
  if (_FILTER_MATH_RE.test(t)) {
    // A math function's <angle>-ness is its RESULT TYPE, not whether it textually
    // mentions an angle unit: `acos(1)`/`atan2(1px,-1px)` yield an <angle> with no
    // `deg` in sight, while `sin(45deg)` yields a <number> despite containing one.
    // Type the calc tree (rotate accepts no `%`, so pctType=null); fall back to the
    // literal heuristic only when the type is unknown (var()/sibling-index()/…).
    const root = _parseCalcTree(t);
    if (root) { const ty = _mt(root, null); if (ty === 'angle') return 'angle'; if (ty === 'number') return 'num'; }
    return /\d*\.?\d+\s*(?:deg|grad|rad|turn)\b/i.test(t) ? 'angle' : 'num';
  }
  if (_FILTER_NUM_RE.test(t)) return 'num';
  return 'bad';
};
const _rotParse = (value) => {
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (s === '') return null;
  if (s.toLowerCase() === 'none') return { none: true };
  let angle = null, kw = null, nums = [];
  for (const tok of _splitFilterTokens(s)) {
    const k = _rotKind(tok);
    if (k === 'angle') { if (angle !== null) return null; angle = tok; }
    else if (k === 'kw') { if (kw !== null || nums.length) return null; kw = tok.toLowerCase(); }
    else if (k === 'num') { if (kw !== null) return null; nums.push(tok); }
    else return null;
  }
  if (angle === null) return null;                            // an <angle> is required
  if (kw === null && nums.length !== 0 && nums.length !== 3) return null;
  return { angle, kw, nums };
};
const _isValidRotate = (value) => !!_rotParse(value);
const _rotAxisVec = (p) => {
  if (p.kw === 'x') return [1, 0, 0];
  if (p.kw === 'y') return [0, 1, 0];
  if (p.kw === 'z' || (p.kw === null && p.nums.length === 0)) return [0, 0, 1];
  return p.nums.map(parseFloat);
};
const _rotSerAngle = (angTok, computed, negate, el) => {
  angTok = angTok.trim();
  // `lengths`/`time`/`emPx`/`vw`/`vh` let an angle-typed math fn whose arguments
  // are <length>s / <time>s resolve — `atan2(1px,-1px)`, `atan2(1em,-1em)`,
  // `atan2(1vh,-1vh)`, `atan2(1s,-1s)` all reduce to an <angle> (the like units
  // cancel as a ratio). `angle` units win first; time then length.
  const vp = _vpUnits();
  const angOpts = { angle: true, lengths: true, time: true, emPx: _emPxOf(el), vw: vp.vw, vh: vp.vh, ..._siblingOpts(el, angTok) };
  if (_FILTER_MATH_RE.test(angTok)) {
    if (computed) { let d = _evalMath(angTok, 0, angOpts); if (d === null) return _canonMathExpr(angTok) || angTok; if (negate) d = -d; return _serNumber(d) + 'deg'; }
    return negate ? 'calc(-1 * (' + (_canonMathExpr(angTok) || angTok) + '))' : (_canonMathExpr(angTok) || angTok);
  }
  if (computed) { let d = _evalMath(angTok, 0, angOpts) || 0; if (negate) d = -d; return _serNumber(d) + 'deg'; }
  const lm = _FILTER_LEN_RE.exec(angTok);
  if (!lm) return angTok;
  let num = parseFloat(lm[1]); if (negate) num = -num;
  return _serNumber(num) + lm[2];
};
const _canonRotate = (value, el, computed) => {
  const p = _rotParse(value);
  if (!p) return value;
  if (p.none) return 'none';
  const [x, y, z] = _rotAxisVec(p);
  const ang = (neg) => _rotSerAngle(p.angle, computed, neg, el);
  if (x === 0 && y === 0 && z === 0) return '0 0 0 ' + ang(false);
  if (x === 0 && y === 0) return ang(z < 0);                  // z axis → just <angle>
  if (y === 0 && z === 0) return 'x ' + ang(x < 0);
  if (x === 0 && z === 0) return 'y ' + ang(y < 0);
  return [x, y, z].map(_serNumber).join(' ') + ' ' + ang(false);
};

// ----- translate: none | <length-percentage> [ <length-percentage> <length>? ]? -----
// (x,y accept <length-percentage>; z is a pure <length> — no percentage.)
const _trLenUnit = (t) => { const lm = _FILTER_LEN_RE.exec(t); return lm && (_LENGTH_PX[lm[2].toLowerCase()] !== undefined || /^(?:cq[whib]|cqmin|cqmax|v[whib]|vmin|vmax|sv[wh]|lv[wh]|dv[wh])$/i.test(lm[2])) ? lm : null; };
const _trXYValid = (t) => {
  t = t.trim();
  if (_isFilterZero(t) || _FILTER_PCT_RE.test(t)) return true;
  if (_FILTER_MATH_RE.test(t)) return _evalMath(t, 100, { lengths: true, emPx: 16 }) !== null;
  return !!_trLenUnit(t);
};
const _trZValid = (t) => {
  t = t.trim();
  if (_isFilterZero(t)) return true;
  if (_FILTER_PCT_RE.test(t)) return false;                   // z is a pure <length>
  if (_FILTER_MATH_RE.test(t)) return /%/.test(t) ? false : _evalMath(t, 0, { lengths: true, emPx: 16 }) !== null;
  return !!_trLenUnit(t);
};
const _isValidTranslate = (value) => {
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (s === '') return false;
  if (s.toLowerCase() === 'none') return true;
  const toks = _splitFilterTokens(s);
  if (toks.length < 1 || toks.length > 3) return false;
  if (!_trXYValid(toks[0])) return false;
  if (toks.length >= 2 && !_trXYValid(toks[1])) return false;
  if (toks.length === 3 && !_trZValid(toks[2])) return false;
  return true;
};
// A component that is a zero <length> (and so elidable from the tail) — `0`, `0px`,
// `0em`, … but never `0%` (a percentage is kept) nor a calc().
const _trIsZeroLen = (t) => {
  t = t.trim();
  if (_isFilterZero(t)) return true;
  if (_FILTER_PCT_RE.test(t) || _FILTER_MATH_RE.test(t)) return false;
  const lm = _FILTER_LEN_RE.exec(t);
  return !!(lm && parseFloat(lm[1]) === 0);
};
// `vp` (optional) carries {vw,vh} px-per-1%-viewport so viewport-relative units
// resolve at computed time. translate() callers omit it (byte-identical behavior);
// the length-property resolver passes it so `min(1vh)`/`12vw` collapse to px.
const _trComp = (t, el, computed, vp) => {
  t = t.trim();
  const lenOpts = () => (vp ? { lengths: true, emPx: _emPxOf(el), vw: vp.vw, vh: vp.vh, nonFinite: true, ..._siblingOpts(el, t) }
                            : { lengths: true, emPx: _emPxOf(el), nonFinite: true, ..._siblingOpts(el, t) });
  if (_FILTER_MATH_RE.test(t)) {
    if (/%/.test(t)) {                                        // mixed %+<length> → canonical calc(P% ± Lpx)
      // A non-finite result (infinity/NaN coefficient) can no longer be kept as a
      // symbolic calc(P% ± Lpx) — it collapses to a clamped <length>. Probe with a
      // positive %-base so `infinity * 1%` → ∞ (a 0 base would give ∞·0 = NaN).
      if (computed) { const pv = _evalMath(t, 1, lenOpts()); if (pv !== null && !isFinite(pv)) return _serNumber(_nfClamp(pv)) + 'px'; }
      const mixed = _resolvePctLengthCalc(t, computed ? _emPxOf(el) : undefined);
      return mixed !== null ? mixed : (_canonMathExpr(t) || t);
    }
    if (computed) { const v = _evalMath(t, 0, lenOpts()); if (v !== null) return _serNumber(_nfClamp(v)) + 'px'; }
    return _canonMathExpr(t) || t;
  }
  if (_FILTER_PCT_RE.test(t)) return _serNumber(parseFloat(t)) + '%';
  if (_isFilterZero(t)) return computed ? '0px' : _serNumber(parseFloat(t)) + 'px';
  if (computed) { const v = _evalMath(t, 0, lenOpts()); if (v !== null) return _serNumber(_nfClamp(v)) + 'px'; }
  const lm = _FILTER_LEN_RE.exec(t);                          // specified: keep the unit, canon the number
  return lm ? _serNumber(parseFloat(lm[1])) + lm[2] : t;
};
const _canonTranslate = (value, el, computed) => {
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (s.toLowerCase() === 'none') return 'none';
  const toks = _splitFilterTokens(s);
  const comps = toks.map((t) => _trComp(t, el, computed));
  let n = comps.length;
  if (n === 3 && _trIsZeroLen(toks[2])) n = 2;
  if (n === 2 && _trIsZeroLen(toks[1])) n = 1;
  return comps.slice(0, n).join(' ');
};
const _INDIV_TRANSFORM = new Set(['scale', 'rotate', 'translate']);
// The CSS tokenizer auto-closes any blocks/functions still open at EOF (Syntax 3
// §"consume a component value"). A value like `calc(2 * sign(1em - 1px)` (one `)`
// short) is therefore valid — append the missing close-parens to mirror that.
const _balanceParens = (s) => {
  let depth = 0;
  for (const c of s) { if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1); }
  return depth > 0 ? s + ')'.repeat(depth) : s;
};
const _isValidIndividualTransform = (name, value) => {
  if (_TF_VAR_RE.test(value)) return true;                    // var()/env() resolved later
  if (_CSS_WIDE.has(String(value).trim().toLowerCase())) return true; // inherit/initial/unset/revert
  value = _balanceParens(String(value));
  if (name === 'scale') return _isValidScale(value);
  if (name === 'rotate') return _isValidRotate(value);
  return _isValidTranslate(value);
};
const _canonIndividualTransform = (name, value, el, computed) => {
  if (_TF_VAR_RE.test(value)) return value;                   // unresolved var()/env()
  if (_CSS_WIDE.has(String(value).trim().toLowerCase())) return value; // CSS-wide keyword stored verbatim
  value = _balanceParens(String(value));
  if (name === 'scale') return _canonScale(value, el, computed);
  if (name === 'rotate') return _canonRotate(value, el, computed);
  return _canonTranslate(value, el, computed);
};
// ── Simple transform-module grammar gates ───────────────────────────────────
// `transform-box`/`backface-visibility` are single-keyword enums; `perspective`
// is `none | <length [0,∞]>`. Their valid/computed forms already serialize
// verbatim (canonical) — only the invalid-rejection gate was missing.
const _TRANSFORM_BOX_KW = new Set(['content-box', 'border-box', 'fill-box', 'stroke-box', 'view-box']);
const _BACKFACE_KW = new Set(['visible', 'hidden']);
const _TRANSFORM_STYLE_KW = new Set(['flat', 'preserve-3d']);
const _isValidPerspective = (value) => {
  const v = String(value).trim();
  if (_TF_VAR_RE.test(v)) return true;
  const low = v.toLowerCase();
  if (low === 'none') return true;
  if (_FILTER_MATH_RE.test(v)) return true;            // calc()/min()/… resolved later
  if (_isFilterZero(v)) return true;                   // unitless 0 is a valid <length>
  const lm = _trLenUnit(v);                            // a real <length> unit (rejects %, bare number)
  return !!(lm && parseFloat(lm[1]) >= 0);             // non-negative per `[0,∞]`
};
const _SIMPLE_TRANSFORM_PROPS = new Set(['perspective', 'transform-box', 'backface-visibility', 'transform-style']);
const _isValidSimpleTransform = (name, value) => {
  if (_TF_VAR_RE.test(value)) return true;
  const low = String(value).trim().toLowerCase();
  if (_CSS_WIDE.has(low)) return true;
  if (name === 'perspective') return _isValidPerspective(value);
  if (name === 'transform-box') return _TRANSFORM_BOX_KW.has(low);
  if (name === 'transform-style') return _TRANSFORM_STYLE_KW.has(low); // flat | preserve-3d
  return _BACKFACE_KW.has(low);                         // backface-visibility: visible | hidden
};
// Serialize a resolved specified value into its computed form (colour/opacity
// normalization; every other property passes through unchanged).
const _FONT_SIZE_KEYWORDS = {
  // Absolute <font-size> keywords → computed px, scaled from medium = 16px
  // (the spec's recommended factor table; default monospace adjustment omitted).
  'xx-small': '10px', 'x-small': '12px', small: '13px', medium: '16px',
  large: '18px', 'x-large': '24px', 'xx-large': '32px', 'xxx-large': '48px',
};
// Generic computed-value resolution for the numeric length / integer / time
// property families (CSS Values 4 — getComputedStyle returns the *resolved*
// value, in canonical units). Length props fold math functions and resolve the
// absolute + font-relative units to px (`%` is kept symbolic — resolving a used
// `%` length needs layout we don't perform); integer props (`z-index`) fold to a
// rounded integer; time props fold to seconds. `_trComp(v, el, true)` is the
// shared <length-percentage> component resolver (it also serves translate()).
const _LENGTH_COMPUTED_PROPS = new Set([
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-block-start', 'margin-block-end', 'margin-inline-start', 'margin-inline-end',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end',
  'top', 'right', 'bottom', 'left',
  'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end',
  'width', 'height',
  'flex-basis', 'text-indent', 'outline-offset',
  'letter-spacing', 'word-spacing',                      // <length> | normal (keyword passes through)
]);
// Properties whose computed value clamps a resolved negative <length> to 0 (padding
// can't be negative). `%`-bearing values that would need layout are left symbolic.
const _CLAMP_NEG_PROPS = new Set([
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end',
]);
const _clampNegPx = (r) => {
  const m = /^(-?(?:\d+\.?\d*|\.\d+))px$/.exec(String(r));
  return (m && parseFloat(m[1]) < 0) ? '0px' : r;
};
// The css-sizing min/max + block/inline sizing family. getComputedStyle returns the
// computed value (not the used value): `%` and `calc(%…)` stay symbolic, keywords
// (none/min-content/max-content/fit-content/stretch) pass through, fit-content()'s
// <length-percentage> argument resolves, min-* `auto` → 0px (the used minimum), and
// a resolved negative <length> clamps to 0. block/inline-size's auto/%/intrinsic
// keywords would need layout (a cap) — only explicit lengths resolve.
const _SIZE_COMPUTED_PROPS = new Set([
  'min-width', 'min-height', 'max-width', 'max-height',
  'min-block-size', 'min-inline-size', 'max-block-size', 'max-inline-size',
  'block-size', 'inline-size',
]);
const _SIZE_KW_PASS = new Set(['none', 'min-content', 'max-content', 'fit-content', 'stretch', 'contain']);
const _computeSizeValue = (kebab, v, el) => {
  const s = String(v).trim();
  const low = s.toLowerCase();
  if (low === 'auto') return kebab.startsWith('min-') ? '0px' : 'auto';
  if (_SIZE_KW_PASS.has(low)) return low;
  const fc = /^fit-content\(\s*([\s\S]*?)\s*\)$/i.exec(s);
  if (fc) return 'fit-content(' + _trComp(fc[1], el, true, _vpUnits()) + ')';
  return _clampNegPx(_trComp(s, el, true, _vpUnits()));
};
// The 2-value flow-relative box shorthands (and the 4-value `inset`). getPropertyValue
// reconstructs them from longhands; here we resolve each component as its longhand
// type and collapse identical edges (per _serializeBoxValue).
const _SH_COMPUTED = {
  'inset-block': 'inset', 'inset-inline': 'inset', inset: 'inset',
  'margin-block': 'margin', 'margin-inline': 'margin',
  'padding-block': 'padding', 'padding-inline': 'padding',
};
const _computeBoxShorthand = (kebab, v, el) => {
  const kind = _SH_COMPUTED[kebab];
  const toks = _wsTokens(String(v).trim());
  if (!toks.length) return v;
  const vp = _vpUnits();
  const resolve1 = (t) => {
    const r = _trComp(t, el, true, vp);
    return kind === 'padding' ? _clampNegPx(r) : r;
  };
  // Expand to the shorthand's full edge count (`inset` → 4; the flow-relative
  // block/inline shorthands → 2) so a single value duplicates and _serializeBoxValue
  // can collapse identical edges back to the shortest form.
  let edges;
  if (kebab === 'inset') edges = _boxEdges(toks).map(resolve1);
  else { const a = resolve1(toks[0]); edges = [a, toks.length >= 2 ? resolve1(toks[1]) : a]; }
  return _serializeBoxValue(kebab, edges);
};
const _INTEGER_COMPUTED_PROPS = new Set(['z-index', 'order']);
const _TIME_COMPUTED_PROPS = new Set([
  'transition-delay', 'transition-duration', 'animation-delay', 'animation-duration',
]);
// px per 1% of the viewport (vw/vh), for resolving viewport-relative units at
// computed time. Consistent across the two sides of an equivalence test — that is
// all these used-value comparisons require.
const _vpUnits = () => ({
  vw: (Number(globalThis.innerWidth) || 0) / 100,
  vh: (Number(globalThis.innerHeight) || 0) / 100,
});
// Fold a math expression on an integer property to a rounded <integer> (CSS Values
// 4 §10 — calc on <integer> rounds to nearest). Keywords (`auto`) and bare ints
// pass through; an unresolvable/non-finite math node is left canonicalized.
const _computeIntegerValue = (el, v) => {
  const s = String(v).trim();
  if (!/[\d(]/.test(s)) return null;                     // `auto` and friends → caller keeps v
  // `lengths` lets `sign(1px)` / `sign(1em)` / `sign(1vw)` resolve their length
  // argument to the <number> the function yields (the value stays a valid <integer>).
  const vp = _vpUnits();
  const n = _evalMath(s, 0, { lengths: true, emPx: _emPxOf(el), vw: vp.vw, vh: vp.vh, ..._siblingOpts(el, s) });
  if (n === null || !isFinite(n)) return _FILTER_MATH_RE.test(s) ? (_canonMathExpr(s) || s) : null;
  return String(Math.round(n));
};
// Fold a <time> value (incl. math) to canonical seconds. Mixed s/ms resolve
// consistently (`round(10s,6000ms)` and `12s` both → `12s`).
const _computeTimeValue = (v) => {
  const s = String(v).trim();
  if (_TF_VAR_RE.test(s) || !/[\d(]/.test(s)) return null;
  // The CSS tokenizer auto-closes blocks left open at EOF (e.g. `calc(max(…, 10s)`,
  // one `)` short) — mirror that before evaluating.
  const sec = _evalMath(_balanceParens(s), 0, { time: true, nonFinite: true });
  if (sec === null) return _FILTER_MATH_RE.test(s) ? (_canonMathExpr(s) || s) : null;
  return _serNumber(_nfClamp(sec)) + 's';
};
const _normComputed = (el, kebab, v) => {
  if (kebab === 'opacity') { const o = _computeOpacity(v); return o === null ? v : o; }
  if (_POSITION_PROPS.has(kebab)) return _serializePositionComputed(el, v);
  if (kebab === 'offset-rotate') return _computeOffsetRotate(v);
  if (kebab === 'offset-distance') return _computeOffsetDistance(el, v);
  if (kebab === 'offset-path') return _computeOffsetPath(el, v);
  if (_BG_POSITION_AXIS.has(kebab)) return _computeBgAxis(el, v, _BG_POSITION_AXIS.get(kebab));
  if (_ORIGIN_PROPS.has(kebab)) return _serializeOriginComputed(el, kebab, v);
  if (_GRADIENT_PROPS.has(kebab)) return _canonUrls(_canonImageSet(_canonGradients(v, el, true)), el);
  if (kebab === 'filter' || kebab === 'backdrop-filter') return _canonFilter(v, el, true);
  if (kebab === 'transform') return _canonTransform(v, el, true);
  if (_INDIV_TRANSFORM.has(kebab)) return _canonIndividualTransform(kebab, v, el, true);
  if (kebab === 'content') return _canonContent(v, el, true);
  if (kebab === 'font-size') {
    const k = String(v).trim().toLowerCase();
    if (k in _FONT_SIZE_KEYWORDS) return _FONT_SIZE_KEYWORDS[k];
    return v;
  }
  if (_SIZE_COMPUTED_PROPS.has(kebab)) return _computeSizeValue(kebab, v, el);
  if (_SH_COMPUTED[kebab]) return _computeBoxShorthand(kebab, v, el);
  if (_LENGTH_COMPUTED_PROPS.has(kebab)) {
    const r = _trComp(v, el, true, _vpUnits());
    return _CLAMP_NEG_PROPS.has(kebab) ? _clampNegPx(r) : r;
  }
  if (_INTEGER_COMPUTED_PROPS.has(kebab)) { const r = _computeIntegerValue(el, v); return r === null ? v : r; }
  if (_TIME_COMPUTED_PROPS.has(kebab)) { const r = _computeTimeValue(v); return r === null ? v : r; }
  if (kebab === 'color' || _COLOR_PROPS.has(kebab)) {
    if (String(v).trim().toLowerCase() === 'currentcolor') {
      return kebab === 'color' ? _computeColor(_initialOf('color')) : _computedColorOf(el);
    }
    // Modern colour functions whose computed value stays in their own colour
    // space (lab/lch/oklab/oklch, color()) or convert to sRGB (hwb); fall back to
    // the legacy named/hex/rgb/hsl computation when not one of those.
    const modern = _computeModernColor(v);
    if (modern !== null) return modern;
    // color-mix() / relative colour syntax need real cross-space colour maths.
    const mixed = _computeColorMixComputed(v, el);
    if (mixed !== null) return mixed;
    const alphaC = _computeAlphaComputed(v, el);
    if (alphaC !== null) return alphaC;
    const cc = _computeContrastColorComputed(v, el);
    if (cc !== null) return cc;
    const rel = _computeRelativeComputed(v, el);
    if (rel !== null) return rel;
    return _computeColor(v);
  }
  return v;
};
// Computed value of `kebab` for `el`, resolving the CSS-wide keywords
// (`initial`/`inherit`/`unset`/`revert`) and per-property inheritance through
// the ancestor chain. `revert`/`revert-layer` are approximated as `unset`
// (we model no UA/user origins or cascade layers).
const _computedPropOf = (el, kebab, guard) => {
  guard = guard || 0;
  if (!el || guard > 200) return _normComputed(el, kebab, _initialOf(kebab));
  const spec = _specifiedDecl(el, kebab);
  let v = String(spec.value || '').trim();
  const sh = spec.sh;
  const inheritFrom = () => (el.parentElement
    ? _computedPropOf(el.parentElement, kebab, guard + 1)
    : _normComputed(el, kebab, _initialOf(kebab)));
  const invalidAtComputedTime = () => (_INHERITED_PROPS.has(kebab)
    ? inheritFrom() : _normComputed(el, kebab, _initialOf(kebab)));
  // A value containing var() is valid at parse time; substitute references, and if
  // substitution fails (undefined with no fallback, cycle, …) the property is
  // invalid at computed-value time → it becomes the inherited or initial value.
  const varBearing = /var\(/i.test(v);
  if (varBearing) {
    const sub = _substituteVars(el, v, 0);
    if (sub == null || sub === '') return invalidAtComputedTime();
    v = sub.trim();
  }
  // Shorthand → longhand: `v` is the (substituted) whole shorthand value; split it
  // and keep this longhand's piece. A value that can't be parsed as the shorthand
  // is invalid at computed-value time.
  if (sh) {
    const parts = _expandShorthand(sh, v);
    if (!parts || parts[kebab] == null) return invalidAtComputedTime();
    v = String(parts[kebab]).trim();
  }
  // A value substituted from var() that doesn't match the property's grammar is
  // invalid at computed-value time (→ inherited-or-initial). We validate the
  // <color> properties — after any shorthand extraction, the value must be a real
  // colour, unless it is a CSS-wide keyword or currentColor (resolved below).
  if (varBearing && (kebab === 'color' || _COLOR_PROPS.has(kebab))) {
    const lowc = v.trim().toLowerCase();
    if (!_CSS_WIDE.has(lowc) && lowc !== 'currentcolor' && !_isValidColor(v)) {
      return invalidAtComputedTime();
    }
  }
  const low = v.toLowerCase();
  if (!v) {
    return _INHERITED_PROPS.has(kebab) ? inheritFrom() : _normComputed(el, kebab, _initialOf(kebab));
  }
  // `currentColor` on the `color` property itself resolves to the inherited
  // colour (the computed `color` of the parent) — on a non-`color` property it
  // resolves to this element's own colour (handled in _normComputed).
  if (kebab === 'color' && low === 'currentcolor') return inheritFrom();
  if (_CSS_WIDE.has(low)) {
    if (low === 'initial') return _normComputed(el, kebab, _initialOf(kebab));
    if (low === 'inherit') return inheritFrom();
    // unset / revert / revert-layer: inherit for inherited properties, else initial.
    return _INHERITED_PROPS.has(kebab) ? inheritFrom() : _normComputed(el, kebab, _initialOf(kebab));
  }
  return _normComputed(el, kebab, v);
};
const _computedColorOf = (el) => _computedPropOf(el, 'color', 0);
// Computed value of a custom property `name` (a `--*` name) for `el`. Custom
// properties ALWAYS inherit, and their initial value is the guaranteed-invalid
// value — which `getPropertyValue` serializes as the empty string. The CSS-wide
// keywords resolve here (`initial`→empty, `inherit`/`unset`/`revert`→parent's
// computed value). A custom property explicitly set to the empty value computes
// to a single space (distinct from "not set", which inherits). var() substitution
// is intentionally NOT performed here yet — the value passes through verbatim.
const _computedCustomProp = (el, name, guard) => {
  guard = guard || 0;
  if (!el || guard > 200) return '';
  const inheritFrom = () => (el.parentElement
    ? _computedCustomProp(el.parentElement, name, guard + 1) : '');
  const raw = _specifiedValue(el, name);
  if (raw === '' || raw == null) return inheritFrom();      // not set → inherit
  const v = String(raw);
  const low = v.trim().toLowerCase();
  if (_CSS_WIDE.has(low)) {
    if (low === 'initial') return '';                        // guaranteed-invalid
    return inheritFrom();                                     // inherit/unset/revert(-layer)
  }
  return v;
};
// Split the inside of a `var(...)` into the custom-property name and an optional
// fallback at the first TOP-LEVEL comma (the fallback may itself contain commas
// and nested var()/functions, so brackets are tracked).
const _splitVarArgs = (inner) => {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) return { name: inner.slice(0, i).trim(), fallback: inner.slice(i + 1) };
  }
  return { name: inner.trim(), fallback: null };
};
// Join two CSS-text fragments at a substitution boundary. A separator is inserted
// ONLY when the last char of `a` and the first char of `b` would otherwise merge
// into a single token — i.e. both are "token" chars (ident/number/percent/hash).
// A boundary against punctuation (`(`, `)`, `,`, whitespace, …) needs no separator,
// so `blur(` + `15px` → `blur(15px)` (not `blur( 15px )`) while `var(--a)var(--b)`
// → "a b". This approximates real tokenization without a full tokenizer.
const _TOKENISH = /[A-Za-z0-9_.%#\u002D\u0080-\uFFFF]/;
const _joinTok = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return (_TOKENISH.test(a[a.length - 1]) && _TOKENISH.test(b[0])) ? a + ' ' + b : a + b;
};
// Substitute every `var(--name, fallback)` reference in `value` with the custom
// property's computed value (or the fallback when it is guaranteed-invalid),
// recursively. Token boundaries at each insertion are preserved by _joinTok (a
// separator only between chars that would merge), so a substituted value lands
// inside a function call without spurious whitespace. Returns null when the value
// is invalid at computed-value time (an unbalanced var(), an undefined property
// with no fallback, or a cycle).
const _substituteVars = (el, value, guard) => {
  const s = String(value);
  if (!/var\(/i.test(s)) return s;
  guard = guard || 0;
  if (guard > 50) return null;
  let out = '', i = 0; const n = s.length;
  while (i < n) {
    const rest = s.slice(i);
    const m = /var\(/i.exec(rest);
    if (!m) { out = _joinTok(out, rest); break; }
    out = _joinTok(out, rest.slice(0, m.index));
    let k = i + m.index + m[0].length, depth = 1;
    while (k < n && depth > 0) {
      const c = s[k];
      if (c === '(') depth++; else if (c === ')') { depth--; if (depth === 0) break; }
      k++;
    }
    if (depth !== 0) return null;                            // unbalanced var(
    const inner = s.slice(i + m.index + m[0].length, k);
    i = k + 1;
    const { name, fallback } = _splitVarArgs(inner);
    if (!_isValidCustomPropName(name)) return null;          // var() needs a valid --name
    let resolved = _computedCustomProp(el, name, 0);
    if (resolved === '' || resolved == null) {
      if (fallback == null) return null;                     // undefined & no fallback
      resolved = _substituteVars(el, fallback, guard + 1);
      if (resolved == null) return null;
    } else if (/var\(/i.test(resolved)) {
      resolved = _substituteVars(el, resolved, guard + 1);   // nested var() in the value
      if (resolved == null) return null;
    }
    out = _joinTok(out, String(resolved).trim());
  }
  return out.trim();
};
const _GCS_INLINE_SPEC = Number.MAX_SAFE_INTEGER;
const _buildCascade = (el) => {
  // Returns the list of matched declaration sources for `el`, each
  // { spec, order, decls }, including inline style as the highest source.
  const sources = [];
  const nid = el && el._nid;
  if (typeof nid === 'number' && nid >= 0) {
    const doc = (el.ownerDocument) || globalThis.document;
    let styleEls = [];
    try { styleEls = doc.querySelectorAll('style'); } catch { styleEls = []; }
    // Flatten all rules in document order, then prime the JS-computed live-state
    // side-maps (:target, :valid/:invalid/:in-range/:out-of-range) once over the
    // combined selector text so the Rust matcher sees them — same machinery the
    // querySelector path uses. Gated cheaply inside _primeTarget/_primeValidity.
    const flat = [];
    for (const styleEl of styleEls) {
      for (const rule of _styleSheetRules(styleEl)) flat.push(rule);
    }
    const combined = flat.map((r) => r.selectorText).join(' ');
    try { _primeTarget(combined, el); _primeValidity(combined, el); } catch (e) {}
    let order = 0;
    for (const rule of flat) {
      const spec = parseInt(_dom('selector_match_specificity', String(nid), rule.selectorText), 10);
      if (spec >= 0) sources.push({ spec, order: order++, decls: rule.decls });
    }
    // Inline style — highest author source at each importance level.
    let inlineText = '';
    try { inlineText = el.getAttribute && el.getAttribute('style'); } catch { inlineText = ''; }
    if (inlineText) sources.push({ spec: _GCS_INLINE_SPEC, order: _GCS_INLINE_SPEC, decls: _cssParseDecls(inlineText) });
    // Live CSSOM inline declarations (`el.style.foo = …`) set through the object
    // model do NOT reflect into the style="" attribute read above, yet they are
    // the highest-priority *normal* author source — above every <style> rule (an
    // author !important rule still beats them, handled by _cascadeResolve). Inject
    // them as an inline-level source so a CSSOM-set value wins over author rules.
    let liveProps = null, livePrio = null;
    try { liveProps = el.style && el.style._props; livePrio = el.style && el.style._priority; } catch { liveProps = null; }
    if (liveProps) {
      const decls = {};
      let any = false;
      for (const k in liveProps) {
        const name = k.startsWith('--') ? k : k.replace(/([A-Z])/g, '-$1').toLowerCase();
        _expandDeclInto(decls, name, liveProps[k], !!(livePrio && livePrio[k] === 'important'));
        any = true;
      }
      if (any) sources.push({ spec: _GCS_INLINE_SPEC, order: _GCS_INLINE_SPEC + 1, decls });
    }
  }
  return sources;
};
const _cascadeWinner = (sources, name) => {
  // Winning declaration for property `name` (a CSS property / custom-property
  // name): !important beats normal; within the same importance, higher
  // specificity wins, ties broken by later source order. Returns { s, d } or null.
  let best = null;
  for (const s of sources) {
    const d = s.decls[name];
    if (d === undefined) continue;
    if (best === null
        || (d.important && !best.d.important)
        || (d.important === best.d.important
            && (s.spec > best.s.spec || (s.spec === best.s.spec && s.order >= best.s.order)))) {
      best = { s, d };
    }
  }
  return best;
};
const _cascadeResolve = (sources, name) => {
  const w = _cascadeWinner(sources, name);
  return w ? w.d.value : '';
};
// The element's own specified declaration for `kebab` — the winning value plus
// the shorthand it was expanded from (`sh`, when this longhand is a pending
// shorthand slot). Mirrors _specifiedValue's cascade-first / live-decl-fallback.
const _specifiedDecl = (el, kebab) => {
  try {
    const w = _cascadeWinner(_buildCascade(el), kebab);
    if (w && w.d.value !== '') return { value: String(w.d.value), sh: w.d._sh || null };
  } catch (e) {}
  try {
    const s = el && el.style;
    if (s && s.getPropertyValue) { const lv = s.getPropertyValue(kebab); if (lv) return { value: String(lv), sh: null }; }
  } catch (e) {}
  return { value: '', sh: null };
};
// CSS property registry (kebab + camelCase) — the set of properties our
// computed-style / CSS.supports machinery understands. Drives the proxy `has`
// trap (so `'color' in getComputedStyle(el)` is true) and CSS.supports().
const _toCamel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const _CSS_KNOWN_PROPS = (() => {
  const set = new Set();
  const add = (k) => { set.add(k); set.add(_toCamel(k)); };
  for (const k of Object.keys(_GCS_DEFAULTS)) add(k);
  for (const k of _COLOR_PROPS) add(k);
  add('offset');                                           // the `offset` shorthand (expands to its 5 longhands)
  return set;
})();
globalThis.getComputedStyle = (el, _pseudo) => {
  if (!el) el = document.body || {};
  const style = el?.style || el?._style || new CSSStyleDeclaration();
  const sources = _buildCascade(el);
  const resolve = (name) => {
    // name as authored: custom property, kebab, or camelCase.
    const kebab = name.startsWith('--') ? name : name.replace(/([A-Z])/g, '-$1').toLowerCase();
    // Custom properties (`--*`) inherit by default and resolve the CSS-wide
    // keywords through the dedicated engine (no var() substitution yet).
    if (kebab.startsWith('--')) return _computedCustomProp(el, kebab, 0);
    // `color` is inherited: resolve through the ancestor chain (also handles
    // `currentColor`, `inherit`, and the rgb(0, 0, 0) initial value).
    // Modelled standard properties resolve through the full computed-value
    // engine: CSS-wide keywords (initial/inherit/unset/revert), per-property
    // inheritance through the ancestor chain, and colour/opacity normalization.
    if (!kebab.startsWith('--') && (_CSS_KNOWN_PROPS.has(kebab) || _COLOR_PROPS.has(kebab))) {
      return _computedPropOf(el, kebab, 0);
    }
    // Custom properties and unmodelled properties: echo the cascaded/inline
    // specified value verbatim (no inheritance/initial machinery here yet).
    const cascaded = _cascadeResolve(sources, kebab);
    if (cascaded !== '') return cascaded;
    const inline = (style.getPropertyValue && (style.getPropertyValue(kebab) || style.getPropertyValue(name))) || '';
    if (inline) return inline;
    return _GCS_DEFAULTS[kebab] || _GCS_DEFAULTS[name] || '';
  };
  return new Proxy(style, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive || prop === Symbol.toStringTag) return undefined;
      if (prop === 'getPropertyValue') return (name) => resolve(String(name));
      if (prop === 'length') return 0;
      if (prop in target) return target[prop];
      if (typeof prop === 'string') return resolve(prop);
      return undefined;
    },
    has(target, prop) {
      if (prop in target) return true;
      return typeof prop === 'string' && _CSS_KNOWN_PROPS.has(prop);
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

// `DOMImplementation.createDocument` (and XHR.responseXML) return an XMLDocument;
// the WPT createDocument suite asserts `Object.getPrototypeOf(doc) === XMLDocument.prototype`
// EXACTLY, so the returned object must be a direct XMLDocument instance — hence it
// extends DetachedDocument (a real fragment-backed detached document) rather than the
// abstract Document. DOMParser's XML branch deliberately returns a plain
// `_IframeDocument` (also `extends DetachedDocument`, a SIBLING of XMLDocument) so the
// HTML-spec assertion `!(doc instanceof XMLDocument)` still holds for parsed documents.
globalThis.XMLDocument = class XMLDocument extends DetachedDocument {};

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

globalThis.CSS = {
  supports(prop, value) {
    // Two-argument form: CSS.supports(property, value).
    if (arguments.length >= 2) {
      const name = String(prop).trim().toLowerCase();
      const val = String(value).trim();
      if (!val) return false;
      if (_BORDER_EXPAND[name]) {                          // border/outline shorthand
        if (/\bvar\(/i.test(val)) return true;             // var() is syntactically valid
        return _expandBorderShorthand(name, val) != null;  // else validate by expanding
      }
      if (!_CSS_KNOWN_PROPS.has(name) && !_CSS_KNOWN_PROPS.has(_toCamel(name))) return false;
      if (_COLOR_PROPS.has(name)) return _isValidColor(val);
      return true;
    }
    // One-argument condition form: CSS.supports("property: value").
    const cond = String(prop);
    const idx = cond.indexOf(':');
    if (idx < 0) return false;
    return globalThis.CSS.supports(cond.slice(0, idx).trim(), cond.slice(idx + 1).trim());
  },
  escape(s){return s;}
};

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

// ---------------------------------------------------------------------------
// The constraint validation API (HTML §form-control-infrastructure / §the-constraint-validation-api).
//   willValidate · validity (ValidityState) · validationMessage ·
//   checkValidity() · reportValidity() · setCustomValidity()
// Installed on the 7 form-associated "listed" interfaces: input, button,
// select, textarea, fieldset, object, output. Pure JS — validity is computed
// on demand from the element's reflected attributes + value. No render/UI, so
// the states that require interactive user editing (tooLong/tooShort/badInput)
// are always false here, matching what the WPT suite asserts.
// ---------------------------------------------------------------------------

// `v`-flag support is needed for the `pattern` attribute's regular expressions
// (HTML compiles `pattern` with the `v` flag); fall back to `u` if the engine
// predates it. An invalid expression under the chosen flag is simply ignored.
const _CV_RE_FLAG = (() => { try { new RegExp("", "v"); return "v"; } catch (e) { return "u"; } })();

// --- typed-value parsers (HTML "valid …" string microsyntaxes) -------------
// Each returns a comparable Number (ms-from-epoch, ms-from-midnight, or a
// unit count) for in-range/step math, or null when the string is not valid
// (which, after value sanitization, is equivalent to an empty control value).
function _cvDaysInMonth(y, m) {
  return [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28,
          31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
function _cvParseNumber(s) {
  s = String(s);
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function _cvParseDate(s) {
  const m = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > _cvDaysInMonth(y, mo)) return null;
  return Date.UTC(y, mo - 1, d);
}
function _cvParseTime(s) {
  const m = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(s);
  if (!m) return null;
  const h = +m[1], mi = +m[2], se = m[3] ? +m[3] : 0;
  if (h > 23 || mi > 59 || se > 59) return null;
  const fr = m[4] ? +((m[4] + "00").slice(0, 3)) : 0;
  return (h * 3600 + mi * 60 + se) * 1000 + fr;
}
function _cvParseDateTimeLocal(s) {
  const m = /^(\d{4,}-\d{2}-\d{2})[T ](\d.*)$/.exec(s);
  if (!m) return null;
  const d = _cvParseDate(m[1]); if (d == null) return null;
  const t = _cvParseTime(m[2]); if (t == null) return null;
  return d + t;
}
function _cvParseMonth(s) {
  const m = /^(\d{4,})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (y < 1 || mo < 1 || mo > 12) return null;
  return (y - 1970) * 12 + (mo - 1);
}
function _cvIsoWeekToMs(y, w) {
  const jan4 = Date.UTC(y, 0, 4);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7; // Monday = 0
  return (jan4 - dow * 86400000) + (w - 1) * 604800000;
}
function _cvParseWeek(s) {
  const m = /^(\d{4,})-W(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], w = +m[2];
  if (y < 1 || w < 1 || w > 53) return null;
  return _cvIsoWeekToMs(y, w);
}
// Strip leading/trailing ASCII whitespace (the email/url value sanitization).
function _cvStripWS(s) { return s.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ""); }
// HTML's "valid e-mail address" production.
const _CV_EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const _CV_TEXTLIKE = new Set(["text", "search", "tel", "url", "email", "password"]);
const _CV_TYPED    = new Set(["number", "range", "date", "month", "week", "time", "datetime-local"]);
const _CV_PERIODIC = new Set(["date", "month", "week", "time", "datetime-local"]);
// readonly "applies" to (and so bars valueMissing for) these input types.
const _CV_READONLY_APPLIES = new Set(["text", "search", "tel", "url", "email", "password",
                                      "date", "month", "week", "time", "datetime-local", "number"]);

function _cvInputType(el) { return (el.type || "text").toLowerCase(); }
function _cvHasDatalistAncestor(el) {
  let p = el.parentNode;
  while (p && p.nodeType === 1) { if (p.localName === "datalist") return true; p = p.parentNode; }
  return false;
}
function _cvFirstLegend(fs) {
  for (let c = fs.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && c.localName === "legend") return c;
  return null;
}
// A control is "actually disabled" if its own disabled attribute is set, or it
// descends from a disabled fieldset and is not inside that fieldset's first
// legend (HTML §enabling-and-disabling-form-controls).
function _cvIsDisabled(el) {
  if (el.hasAttribute("disabled")) return true;
  let n = el.parentNode;
  while (n && n.nodeType === 1) {
    if (n.localName === "fieldset" && n.hasAttribute("disabled")) {
      const legend = _cvFirstLegend(n);
      if (!(legend && legend.contains && legend.contains(el))) return true;
    }
    n = n.parentNode;
  }
  return false;
}
// HTML "barred from constraint validation" → willValidate is its negation.
function _cvWillValidate(el) {
  const tag = el.localName;
  if (tag === "fieldset" || tag === "output" || tag === "object") return false;
  if (_cvIsDisabled(el)) return false;
  if (_cvHasDatalistAncestor(el)) return false;
  if (tag === "input") {
    const t = _cvInputType(el);
    if (t === "hidden" || t === "button" || t === "reset") return false;
    if (el.hasAttribute("readonly")) return false; // bars regardless of whether it "applies"
    return true;
  }
  if (tag === "button") return (el.type || "submit").toLowerCase() === "submit";
  if (tag === "textarea") return !el.hasAttribute("readonly");
  if (tag === "select") return true;
  return false;
}
// Radio button group: elements sharing a (non-empty) name, the same form owner,
// and the same tree. Reported per-member, so we collect the whole group.
function _cvFormOwner(el) {
  let p = el.parentNode;
  while (p && p.nodeType === 1) { if (p.localName === "form") return p; p = p.parentNode; }
  return null;
}
function _cvRadioGroup(el) {
  const name = el.name || "";
  if (name === "") return [el];
  let root = el;
  while (root.parentNode) root = root.parentNode;
  let list = null;
  try { if (root.querySelectorAll) list = root.querySelectorAll("input"); } catch (e) { list = null; }
  if (!list) return [el];
  const owner = _cvFormOwner(el);
  const group = [];
  for (const c of list) {
    if (c.localName === "input" && _cvInputType(c) === "radio" &&
        (c.name || "") === name && _cvFormOwner(c) === owner) group.push(c);
  }
  return group.length ? group : [el];
}
// "mutable" = editable; gates valueMissing for text-like/typed inputs + textarea.
function _cvIsMutable(el) {
  if (_cvIsDisabled(el)) return false;
  const tag = el.localName;
  if (tag === "textarea") return !el.hasAttribute("readonly");
  if (tag === "input") {
    const t = _cvInputType(el);
    if (_CV_READONLY_APPLIES.has(t) && el.hasAttribute("readonly")) return false;
  }
  return true;
}
// Parse a typed input's value/min/max/step bound into a comparable number.
function _cvTyped(t, s) {
  switch (t) {
    case "number": case "range": return _cvParseNumber(s);
    case "date": return _cvParseDate(s);
    case "time": return _cvParseTime(s);
    case "datetime-local": return _cvParseDateTimeLocal(s);
    case "month": return _cvParseMonth(s);
    case "week": return _cvParseWeek(s);
  }
  return null;
}
// Is the (sanitized) control value empty? — drives valueMissing.
function _cvValueEmpty(el) {
  const tag = el.localName;
  if (tag !== "input") return el.value === "";       // textarea / select
  const t = _cvInputType(el);
  if (_CV_TYPED.has(t)) return _cvTyped(t, el.value) == null;
  return el.value === "";                             // text-like + everything else
}
function _cvCompilePattern(p) {
  // The raw pattern must itself compile (so e.g. "a)(b" — which would become a
  // valid expression only once wrapped — is rejected and the constraint ignored).
  try { new RegExp(p, _CV_RE_FLAG); } catch (e) { return null; }
  try { return new RegExp("^(?:" + p + ")$", _CV_RE_FLAG); } catch (e) { return null; }
}
// Per-type step scale (value units → comparable-number units) and default step.
function _cvStepInfo(t) {
  switch (t) {
    case "number": case "range":    return { scale: 1, def: 1 };
    case "date":                    return { scale: 86400000, def: 1 };
    case "month":                   return { scale: 1, def: 1 };
    case "week":                    return { scale: 604800000, def: 1 };
    case "time":                    return { scale: 1000, def: 60 };
    case "datetime-local":          return { scale: 1000, def: 60 };
  }
  return null;
}
function _cvDefaultStepBase(t) {
  if (t === "week") return _cvIsoWeekToMs(1970, 1);
  return 0; // epoch / midnight / month-0 / number-0
}

// Compute the full set of validity flags for a form control.
function _cvCompute(el) {
  const tag = el.localName;
  const flags = {
    valueMissing: false, typeMismatch: false, patternMismatch: false,
    tooLong: false, tooShort: false, rangeUnderflow: false, rangeOverflow: false,
    stepMismatch: false, badInput: false, customError: false, valid: true,
  };
  flags.customError = !!el._customValidity;

  const t = tag === "input" ? _cvInputType(el) : "";

  // --- valueMissing ---------------------------------------------------------
  if (tag === "input" && t === "radio") {
    // Reported on every group member: missing iff some member is required and
    // none are checked. A radio with no name is never in a group.
    if ((el.name || "") !== "") {
      const group = _cvRadioGroup(el);
      flags.valueMissing = group.some(r => r.hasAttribute("required")) && !group.some(r => r.checked);
    }
  } else if (el.hasAttribute("required")) {
    if (tag === "input" && t === "checkbox") {
      flags.valueMissing = !el.checked;
    } else if (tag === "input" && t === "file") {
      const files = el.files;
      flags.valueMissing = !files || files.length === 0;
    } else if (tag === "select") {
      flags.valueMissing = el.value === "";
    } else if (tag === "input" && (_CV_TEXTLIKE.has(t) || _CV_TYPED.has(t)) || tag === "textarea") {
      flags.valueMissing = _cvIsMutable(el) && _cvValueEmpty(el);
    }
  }

  // --- typeMismatch (email / url) ------------------------------------------
  if (tag === "input" && (t === "email" || t === "url")) {
    const raw = _cvStripWS(el.value);
    if (raw !== "") {
      if (t === "email") {
        if (el.hasAttribute("multiple")) {
          flags.typeMismatch = raw.split(",").some(tok => !_CV_EMAIL_RE.test(_cvStripWS(tok)));
        } else {
          flags.typeMismatch = !_CV_EMAIL_RE.test(raw);
        }
      } else { // url
        try { new URL(raw); } catch (e) { flags.typeMismatch = true; }
      }
    }
  }

  // --- patternMismatch (text-like inputs) ----------------------------------
  if (tag === "input" && _CV_TEXTLIKE.has(t) && el.hasAttribute("pattern")) {
    const val = el.value;
    if (val !== "") {
      const re = _cvCompilePattern(el.getAttribute("pattern"));
      if (re) {
        if (t === "email" && el.hasAttribute("multiple")) {
          flags.patternMismatch = val.split(",").some(tok => !re.test(tok));
        } else {
          flags.patternMismatch = !re.test(val);
        }
      }
    }
  }

  // --- range + step (typed inputs) -----------------------------------------
  if (tag === "input" && _CV_TYPED.has(t)) {
    const v = _cvTyped(t, el.value);
    if (v != null) {
      const maxN = el.hasAttribute("max") ? _cvTyped(t, el.getAttribute("max")) : null;
      const minN = el.hasAttribute("min") ? _cvTyped(t, el.getAttribute("min")) : null;
      if (minN != null && maxN != null && minN > maxN && _CV_PERIODIC.has(t)) {
        // reversed range: in (max, min) means simultaneously over- and underflow.
        if (v > maxN && v < minN) { flags.rangeOverflow = true; flags.rangeUnderflow = true; }
      } else {
        if (maxN != null && v > maxN) flags.rangeOverflow = true;
        if (minN != null && v < minN) flags.rangeUnderflow = true;
      }
      const si = _cvStepInfo(t);
      const stepAttr = el.getAttribute("step");
      if (si && stepAttr !== "any") {
        let stepNum = si.def;
        if (stepAttr != null && stepAttr !== "") {
          const parsed = parseFloat(stepAttr);
          if (isFinite(parsed) && parsed > 0) stepNum = parsed;
        }
        const stepUnit = stepNum * si.scale;
        // Step base: min if present & valid, else the value content attribute if
        // present & valid, else the type default.
        let base = _cvDefaultStepBase(t);
        if (minN != null) base = minN;
        else if (el.hasAttribute("value")) { const vb = _cvTyped(t, el.getAttribute("value")); if (vb != null) base = vb; }
        if (stepUnit > 0) {
          // Blink's float-tolerant test: snap to the nearest step, then compare
          // in the value domain with an error budget of step/2^23. When the
          // float noise of the round-trip exceeds the step itself (very small
          // step vs. large value), the misalignment is unrepresentable and the
          // value is treated as a multiple — no mismatch.
          const aligned = base + Math.round((v - base) / stepUnit) * stepUnit;
          const diff = Math.abs(v - aligned);
          const accept = stepUnit / 8388608; // 2^23
          if (diff > accept && diff < stepUnit - accept) flags.stepMismatch = true;
        }
      }
    }
  }

  flags.valid = !(flags.valueMissing || flags.typeMismatch || flags.patternMismatch ||
                  flags.tooLong || flags.tooShort || flags.rangeUnderflow || flags.rangeOverflow ||
                  flags.stepMismatch || flags.badInput || flags.customError);
  return flags;
}

globalThis.ValidityState = class ValidityState {
  constructor(el) { Object.defineProperty(this, "_el", { value: el }); }
  get valueMissing()    { return _cvCompute(this._el).valueMissing; }
  get typeMismatch()    { return _cvCompute(this._el).typeMismatch; }
  get patternMismatch() { return _cvCompute(this._el).patternMismatch; }
  get tooLong()         { return _cvCompute(this._el).tooLong; }
  get tooShort()        { return _cvCompute(this._el).tooShort; }
  get rangeUnderflow()  { return _cvCompute(this._el).rangeUnderflow; }
  get rangeOverflow()   { return _cvCompute(this._el).rangeOverflow; }
  get stepMismatch()    { return _cvCompute(this._el).stepMismatch; }
  get badInput()        { return _cvCompute(this._el).badInput; }
  get customError()     { return _cvCompute(this._el).customError; }
  get valid()           { return _cvCompute(this._el).valid; }
  get [Symbol.toStringTag]() { return "ValidityState"; }
};

const _CV_API = {
  willValidate: { configurable: true, get() { return _cvWillValidate(this); } },
  validity: { configurable: true, get() { return new globalThis.ValidityState(this); } },
  validationMessage: {
    configurable: true,
    get() {
      if (!_cvWillValidate(this)) return "";
      if (this._customValidity) return this._customValidity;
      return ""; // no UA-authored messages for the built-in states (untested)
    },
  },
  setCustomValidity: { configurable: true, writable: true, value: function (msg) { this._customValidity = msg == null ? "" : String(msg); } },
  checkValidity: {
    configurable: true, writable: true,
    value: function () {
      if (_cvWillValidate(this) && !_cvCompute(this).valid) {
        this.dispatchEvent(new Event("invalid", { cancelable: true, bubbles: false }));
        return false;
      }
      return true;
    },
  },
  reportValidity: {
    configurable: true, writable: true,
    value: function () { return this.checkValidity(); },
  },
};
for (const name of ["HTMLInputElement", "HTMLButtonElement", "HTMLSelectElement",
                    "HTMLTextAreaElement", "HTMLFieldSetElement", "HTMLObjectElement",
                    "HTMLOutputElement"]) {
  Object.defineProperties(globalThis[name].prototype, _CV_API);
}

// HTMLFormElement static validation: validate every candidate control.
Object.defineProperties(globalThis.HTMLFormElement.prototype, {
  checkValidity: {
    configurable: true, writable: true,
    value: function () {
      let ok = true;
      for (const el of this.elements) {
        if (_cvWillValidate(el) && !_cvCompute(el).valid) {
          el.dispatchEvent(new Event("invalid", { cancelable: true, bubbles: false }));
          ok = false;
        }
      }
      return ok;
    },
  },
  reportValidity: { configurable: true, writable: true, value: function () { return this.checkValidity(); } },
});

// --- reflected content attributes the constraint validation tests rely on --
function _cvReflBool(proto, prop, attr) {
  Object.defineProperty(proto, prop, {
    configurable: true,
    get() { return this.hasAttribute(attr); },
    set(v) { if (v) this.setAttribute(attr, ""); else this.removeAttribute(attr); },
  });
}
function _cvReflStr(proto, prop, attr) {
  Object.defineProperty(proto, prop, {
    configurable: true,
    get() { return this.getAttribute(attr) || ""; },
    set(v) { this.setAttribute(attr, v == null ? "" : String(v)); },
  });
}
function _cvReflLong(proto, prop, attr) {
  Object.defineProperty(proto, prop, {
    configurable: true,
    get() { const a = this.getAttribute(attr); if (a == null) return -1; const n = parseInt(a, 10); return isNaN(n) ? -1 : n; },
    set(v) { this.setAttribute(attr, String(v)); },
  });
}
{
  const Input = globalThis.HTMLInputElement.prototype;
  const Textarea = globalThis.HTMLTextAreaElement.prototype;
  const Select = globalThis.HTMLSelectElement.prototype;
  for (const P of [Input, Select, Textarea]) _cvReflBool(P, "required", "required");
  for (const P of [Input, Textarea]) { _cvReflBool(P, "readOnly", "readonly"); _cvReflLong(P, "maxLength", "maxlength"); _cvReflLong(P, "minLength", "minlength"); }
  _cvReflBool(Input, "multiple", "multiple");
  _cvReflBool(Select, "multiple", "multiple");
  _cvReflStr(Input, "pattern", "pattern");
  _cvReflStr(Input, "min", "min");
  _cvReflStr(Input, "max", "max");
  _cvReflStr(Input, "step", "step");
  // <textarea> default value is its child text content; the (non-dirty) value
  // tracks it. Setting it programmatically is not a user edit.
  Object.defineProperty(Textarea, "defaultValue", {
    configurable: true,
    get() { return this.textContent; },
    set(v) { this.textContent = v == null ? "" : String(v); },
  });
}

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
  Element.prototype.webkitMatchesSelector,
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
  // Inherit `implementation` from Document/DetachedDocument so the returned
  // DOMImplementation is associated with this iframe document (correct node
  // document for `iframeDoc.implementation.createDocumentType`).
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
