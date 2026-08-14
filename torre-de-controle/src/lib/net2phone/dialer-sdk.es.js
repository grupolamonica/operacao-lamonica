/* 
*  @licstart The following is the entire license notice for the code in
*  this page.
*  
*  Copyright 2023 net2phone
*  
*  Licensed under the Apache License, Version 2.0 (the "License");
*  you may not use this file except in compliance with the License.
*  You may obtain a copy of the License at
*  
*      http://www.apache.org/licenses/LICENSE-2.0
*  
*  Unless required by applicable law or agreed to in writing, software
*  distributed under the License is distributed on an "AS IS" BASIS,
*  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
*  See the License for the specific language governing permissions and
*  limitations under the License.
*  
*  @licend The above is the entire license notice for the code in this page
*/ 
var N = Object.defineProperty;
var M = (i, e, r) => e in i ? N(i, e, { enumerable: !0, configurable: !0, writable: !0, value: r }) : i[e] = r;
var t = (i, e, r) => (M(i, typeof e != "symbol" ? e + "" : e, r), r);
const d = "[net2phone Dialer]";
class O {
  constructor() {
    t(this, "error");
    t(this, "warn");
    this.error = console.error.bind(console, d + " "), this.warn = console.warn.bind(console, d + " ");
  }
}
const v = "dialerInitialized", C = "n2p-dialer-embed";
class A {
  constructor({
    iFrameSourceUrl: e,
    internalNotificationHandlers: r,
    publicNotificationHandler: s,
    internalResponseHandler: o
  }) {
    t(this, "_iFrameOrigin");
    t(this, "_internalNotificationHandlers");
    t(this, "_publicNotificationHandler");
    t(this, "_internalResponseHandler");
    t(this, "_iFrameSubscription");
    this._internalNotificationHandlers = r, this._publicNotificationHandler = s, this._internalResponseHandler = o, this._iFrameOrigin = new URL(e).origin, this._iFrameSubscription = this._handleWindowMessage.bind(this), window.addEventListener("message", this._iFrameSubscription);
  }
  dispose() {
    window.removeEventListener("message", this._iFrameSubscription);
  }
  _handleWindowMessage(e) {
    if (!this._isValidOrigin(e.origin) || !this._isValidMessage(e.data))
      return;
    const r = e.data;
    this._isResponseMessage(r) && this._internalResponseHandler(r), this._isNotificationMessage(r) && (this._isInternalNotificationMessage(r) ? this._internalNotificationHandlers[r.type](r.data) : this._publicNotificationHandler(r));
  }
  _isValidOrigin(e) {
    return this._iFrameOrigin === e;
  }
  _isValidMessage(e) {
    return typeof e != "object" || !e ? !1 : "source" in e && e.source === C;
  }
  _isNotificationMessage(e) {
    return !("id" in e);
  }
  _isInternalNotificationMessage(e) {
    return e.type === v;
  }
  _isResponseMessage(e) {
    return "isResponse" in e;
  }
}
class H {
  constructor(e, r) {
    t(this, "_dialerIFrame");
    t(this, "_iFrameSourceUrl");
    this._dialerIFrame = e, this._iFrameSourceUrl = r;
  }
  send(e, r) {
    this._dialerIFrame.contentWindow.postMessage(
      {
        ...r,
        id: e,
        source: "n2p.dialer-sdk"
      },
      this._iFrameSourceUrl
    );
  }
}
class p extends Error {
  constructor(e) {
    super(`${d} ${e}`);
  }
}
class c extends Error {
  constructor(e) {
    super(`${d} ${e}`);
  }
}
class E extends c {
  constructor(e) {
    super(e);
  }
}
class y extends c {
  constructor(e) {
    super(e);
  }
}
class S extends c {
  constructor(e) {
    super(`The server timed out after ${e} milliseconds.`);
  }
}
class I extends c {
  constructor(e) {
    super(e);
  }
}
class P extends c {
  constructor(e) {
    super(e);
  }
}
const j = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AuthenticationError: I,
  InvalidPhoneNumberError: E,
  MicrophonePermissionError: P,
  Net2PhoneDialerError: c,
  OutgoingCallAlreadyRingingError: y,
  TimeoutError: S
}, Symbol.toStringTag, { value: "Module" }));
let q = (i = 21) => crypto.getRandomValues(new Uint8Array(i)).reduce((e, r) => (r &= 63, r < 36 ? e += r.toString(36) : r < 62 ? e += (r - 26).toString(36).toUpperCase() : r > 62 ? e += "-" : e += "_", e), "");
const D = [
  // Native ES errors https://262.ecma-international.org/12.0/#sec-well-known-intrinsic-objects
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  // Built-in errors
  globalThis.DOMException,
  // Node-specific errors
  // https://nodejs.org/api/errors.html
  globalThis.AssertionError,
  globalThis.SystemError
].filter(Boolean).map(
  (i) => [i.name, i]
), w = new Map(D);
class h extends Error {
  constructor(r) {
    super(h._prepareSuperMessage(r));
    t(this, "name", "NonError");
  }
  static _prepareSuperMessage(r) {
    try {
      return JSON.stringify(r);
    } catch {
      return String(r);
    }
  }
}
const T = [
  {
    property: "name",
    enumerable: !1
  },
  {
    property: "message",
    enumerable: !1
  },
  {
    property: "stack",
    enumerable: !1
  },
  {
    property: "code",
    enumerable: !0
  },
  {
    property: "cause",
    enumerable: !1
  }
], _ = /* @__PURE__ */ new WeakSet(), k = (i) => {
  _.add(i);
  const e = i.toJSON();
  return _.delete(i), e;
}, R = (i) => w.get(i) ?? Error, F = ({
  from: i,
  seen: e,
  to: r,
  forceEnumerable: s,
  maxDepth: o,
  depth: a,
  useToJSON: u,
  serialize: f
}) => {
  if (!r)
    if (Array.isArray(i))
      r = [];
    else if (!f && m(i)) {
      const n = R(i.name);
      r = new n();
    } else
      r = {};
  if (e.push(i), a >= o)
    return r;
  if (u && typeof i.toJSON == "function" && !_.has(i))
    return k(i);
  const g = (n) => F({
    from: n,
    seen: [...e],
    forceEnumerable: s,
    maxDepth: o,
    depth: a,
    useToJSON: u,
    serialize: f
  });
  for (const [n, l] of Object.entries(i)) {
    if (typeof Buffer == "function" && Buffer.isBuffer(l)) {
      r[n] = "[object Buffer]";
      continue;
    }
    if (l !== null && typeof l == "object" && typeof l.pipe == "function") {
      r[n] = "[object Stream]";
      continue;
    }
    if (typeof l != "function") {
      if (!l || typeof l != "object") {
        r[n] = l;
        continue;
      }
      if (!e.includes(i[n])) {
        a++, r[n] = g(i[n]);
        continue;
      }
      r[n] = "[Circular]";
    }
  }
  for (const { property: n, enumerable: l } of T)
    typeof i[n] < "u" && i[n] !== null && Object.defineProperty(r, n, {
      value: m(i[n]) ? g(i[n]) : i[n],
      enumerable: s ? !0 : l,
      configurable: !0,
      writable: !0
    });
  return r;
};
function x(i, e = {}) {
  const { maxDepth: r = Number.POSITIVE_INFINITY } = e;
  if (i instanceof Error)
    return i;
  if (U(i)) {
    const s = R(i.name);
    return F({
      from: i,
      seen: [],
      to: new s(),
      maxDepth: r,
      depth: 0,
      serialize: !1
    });
  }
  return new h(i);
}
function m(i) {
  return !!i && typeof i == "object" && "name" in i && "message" in i && "stack" in i;
}
function U(i) {
  return !!i && typeof i == "object" && "message" in i && !Array.isArray(i);
}
const b = {
  Net2PhoneDialerError: c,
  InvalidPhoneNumberError: E,
  OutgoingCallAlreadyRingingError: y,
  AuthenticationError: I
};
for (const i in b) {
  const e = b[i];
  w.set(i, e);
}
function B(i) {
  return x(i);
}
class z {
  constructor(e) {
    t(this, "_timeoutId", null);
    t(this, "_resolveFunc");
    t(this, "promise");
    const r = this;
    this.promise = new Promise((s, o) => {
      r._resolveFunc = s, r._timeoutId = setTimeout(() => {
        r._timeoutId ? (r._timeoutId = null, o(new S(e))) : s();
      }, e);
    });
  }
  cancel() {
    this._timeoutId && (clearTimeout(this._timeoutId), this._timeoutId = null, this._resolveFunc && this._resolveFunc());
  }
}
class L {
  constructor({
    messageSender: e,
    logger: r,
    pendingRequestStore: s
  }) {
    t(this, "_pendingRequests", /* @__PURE__ */ new Map());
    t(this, "_messageSender");
    t(this, "_logger");
    this._pendingRequests = s ?? /* @__PURE__ */ new Map(), this._messageSender = e, this._logger = r;
  }
  handleResponse(e) {
    const r = this._pendingRequests.get(e.id);
    if (r)
      if (e.isError) {
        const s = B(e.data);
        r.reject(s);
      } else
        r.resolve(e.data);
    else
      this._logger.warn(
        `No pending request found, so we could not handle your response with id: ${e.id}. Response message: ${JSON.stringify(e.data)}`
      );
  }
  async sendRequest(e) {
    const r = q(), s = new z(3e4);
    let o = {};
    o.promise = new Promise((a, u) => {
      o.resolve = a, o.reject = u;
    }), this._pendingRequests.set(r, o), this._messageSender.send(r, {
      type: e.type,
      data: e.data
    });
    try {
      return await Promise.race([
        s.promise,
        o.promise
      ]);
    } finally {
      this._pendingRequests.delete(r), s.cancel();
    }
  }
}
class $ {
  constructor(e) {
    t(this, "_dialerIFrame");
    t(this, "_eventSubscriptionCallbacks");
    t(this, "_messageSender");
    t(this, "_messageReceiver");
    t(this, "_logger");
    t(this, "_requestResponseService");
    const { rootHtmlElement: r, iFrameSourceUrl: s } = e || {};
    if (!r)
      throw new p(
        'Expected "rootHtmlElement" to be provided in options.'
      );
    const o = s ?? "https://dialer-embed.n2p.io/dialer/embed";
    this._logger = new O(), this._eventSubscriptionCallbacks = /* @__PURE__ */ new Set(), this._dialerIFrame = document.createElement("iframe"), this._dialerIFrame.allow = "microphone", this._dialerIFrame.style.display = "none", this._dialerIFrame.style.border = "none", this._dialerIFrame.src = o, r.append(this._dialerIFrame), this._messageSender = new H(
      this._dialerIFrame,
      o
    ), this._requestResponseService = new L({
      messageSender: this._messageSender,
      logger: this._logger
    }), this._messageReceiver = new A({
      iFrameSourceUrl: o,
      internalNotificationHandlers: {
        dialerInitialized: (a) => this._handleDialerInitialized(a)
      },
      publicNotificationHandler: (a) => this._handlePublicNotification(a),
      internalResponseHandler: (a) => this._requestResponseService.handleResponse(a)
    });
  }
  // This can be called multiple times to have more than one subscription.
  subscribe(e) {
    if (this._ensureIsNotDisposed(), typeof e != "function")
      throw new p(
        "Expected a function as a callback."
      );
    this._eventSubscriptionCallbacks.add(e);
    const r = this;
    return {
      dispose() {
        r._eventSubscriptionCallbacks.delete(e);
      }
    };
  }
  dispose() {
    var e;
    this._messageReceiver.dispose(), (e = this._dialerIFrame) == null || e.remove(), this._dialerIFrame = null;
  }
  _ensureIsNotDisposed() {
    if (!this._dialerIFrame)
      throw new p("Dialer is already disposed.");
  }
  _handleDialerInitialized({ containerStyle: e }) {
    this._dialerIFrame && Object.assign(this._dialerIFrame.style, {
      ...e,
      display: "block"
    });
  }
  _handlePublicNotification(e) {
    this._eventSubscriptionCallbacks.forEach((r) => {
      try {
        r({
          type: e.type,
          ...e.data
        });
      } catch (s) {
        this._logger.error(
          "An error was caught when invoking a callback for a event subscription.",
          s
        );
      }
    });
  }
  async placeCall(e) {
    const r = {
      type: "placeCall",
      data: [e]
    };
    await this._requestResponseService.sendRequest(r);
  }
}
t($, "errors", j);
export {
  $ as default
};
