const assert = require("node:assert/strict");
const test = require("node:test");
const api = require("../cc/redirect.js");

const EXAMPLE = "session_01XANLEKYHhnouszW5pTBCm6";
const APP = "claude://code/" + EXAMPLE;
const WEB = "https://claude.ai/code/" + EXAMPLE;

function fakeEl() {
  const attrs = Object.create(null);
  return {
    hidden: false,
    textContent: "",
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    removeAttribute(name) {
      delete attrs[name];
    },
  };
}

function fakeDoc() {
  const nodes = {
    status: fakeEl(),
    error: fakeEl(),
    actions: fakeEl(),
    "open-app": fakeEl(),
    "open-web": fakeEl(),
    "session-line": fakeEl(),
    "session-id": fakeEl(),
  };
  return {
    nodes,
    getElementById(id) {
      return nodes[id] || null;
    },
  };
}

function recordingLocation() {
  const calls = [];
  return {
    calls,
    assign(url) {
      calls.push(["assign", url]);
    },
    replace(url) {
      calls.push(["replace", url]);
    },
    set href(url) {
      calls.push(["href", url]);
    },
  };
}

function combinedText(doc) {
  return Object.keys(doc.nodes)
    .map((id) => doc.nodes[id].textContent)
    .join("\n");
}

test("accepts the example session id and builds only the two Claude URLs", () => {
  assert.equal(api.isValidSessionId(EXAMPLE), true);
  assert.equal(/^session_[A-Za-z0-9]+$/.test(EXAMPLE), true);
  const dest = api.destinations(EXAMPLE);
  assert.equal(dest.app, APP);
  assert.equal(dest.web, WEB);

  const appUrl = new URL(dest.app);
  assert.equal(appUrl.protocol, "claude:");
  assert.equal(appUrl.hostname, "code");
  assert.equal(appUrl.pathname, "/" + EXAMPLE);
  assert.equal(appUrl.search, "");
  assert.equal(appUrl.hash, "");
  assert.equal(appUrl.username, "");
  assert.equal(appUrl.password, "");
  assert.equal(appUrl.href, APP);

  const webUrl = new URL(dest.web);
  assert.equal(webUrl.origin, "https://claude.ai");
  assert.equal(webUrl.pathname, "/code/" + EXAMPLE);
  assert.equal(webUrl.search, "");
  assert.equal(webUrl.hash, "");
  assert.equal(webUrl.username, "");
  assert.equal(webUrl.password, "");
  assert.equal(webUrl.href, WEB);
});

test("session id character rules agree with the spec regex", () => {
  const spec = /^session_[A-Za-z0-9]+$/;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const samples = [
    "session_" + alphabet,
    "session_a",
    "session_0",
    "session_Z",
    EXAMPLE,
    "session_",
    "session_abc_def",
    "session_abc-def",
    "session_abc.def",
    "Session_abc",
    "session_abc ",
    " session_abc",
    "session_abc\n",
    "session_abc\r",
    "session_abc\r\n",
    "session_abc\nfoo",
    "session_abc/def",
    "session_abc\\def",
    "session_abcé",
    "session_abc\u0000",
    "session_abc\u2028",
  ];
  for (const sample of samples) {
    assert.equal(api.isValidSessionId(sample), spec.test(sample), JSON.stringify(sample));
  }
  assert.equal(api.isValidSessionId(undefined), false);
  assert.equal(api.isValidSessionId(null), false);
  assert.equal(api.isValidSessionId(123), false);
  assert.equal(api.isValidSessionId(["session_abc"]), false);
  assert.equal(api.isValidSessionId({ toString: () => "session_abc" }), false);
});

test("rejects missing s", () => {
  for (const search of ["", "?", "?x=1", "?S=session_abc", "?s[]=session_abc", "?session_abc"]) {
    const parsed = api.parseSessionSearch(search);
    assert.equal(parsed.ok, false, search);
    assert.equal(parsed.reason, "missing", search);
  }
  assert.equal(api.parseSessionSearch(undefined).reason, "missing");
  assert.equal(api.parseSessionSearch(null).reason, "missing");
});

test("rejects invalid s without treating it as a destination", () => {
  const searches = [
    "?s=",
    "?s",
    "?s=session_",
    "?s=Session_abc",
    "?s=session_abc-def",
    "?s=session_abc.def",
    "?s=session_abc_def",
    "?s=session_abc+def",
    "?s=session_%ZZ",
    "?s=session_%",
    "?s=javascript:alert(1)",
    "?s=data:text/html,hi",
    "?s=https://evil.example/phish",
    "?s=http://evil.example",
    "?s=//evil.example",
    "?s=claude://evil.example/x",
    "?s=claude://code/session_abc",
    "?s=https://claude.ai/code/session_abc",
    "?s=https://claude.ai.evil.example/code/session_abc",
    "?s=https://user:pass@claude.ai/code/session_abc",
    "?s=session_abc@evil.example",
    "?s=session_abc/../../etc/passwd",
    "?s=session_abc%2F..%2F..%2Flogin",
    "?s=session_abc%00.evil",
    "?s=session_abc%0d%0aLocation:%20https://evil.example",
    "?s=%3Cscript%3Ealert(1)%3C/script%3E",
    '?s=session_abc%22%3E%3Cimg%20src=x%3E',
    "?s=session_abc%5C..%5Cwindows",
    "?s=session_abc%2e%2e",
    "?s=session_%30%31%2Fetc",
  ];
  for (const search of searches) {
    const parsed = api.parseSessionSearch(search);
    assert.equal(parsed.ok, false, search);
    assert.equal(parsed.reason, "invalid", search);
    assert.equal(Object.hasOwn(parsed, "id"), false, search);
  }
});

test("rejects duplicate s even when URLSearchParams would keep the first value", () => {
  const searches = [
    "?s=session_abc&s=session_abc",
    "?s=" + EXAMPLE + "&s=" + EXAMPLE,
    "?s=session_abc&s=https://evil.example",
    "?s=https://evil.example&s=session_abc",
    "?s=session_abc&s=",
    "?s=&s=session_abc",
    "?s=session_abc&%73=session_other",
    "?s=%ZZ&s=session_abc",
    "?s=session_abc&s=session_def&s=session_ghi",
  ];
  for (const search of searches) {
    const parsed = api.parseSessionSearch(search);
    assert.equal(parsed.ok, false, search);
    assert.equal(parsed.reason, "duplicate", search);
    const first = new URLSearchParams(search).get("s");
    if (api.isValidSessionId(first)) {
      assert.equal(parsed.reason, "duplicate");
    }
  }
});

test("ignores extra parameters and uses the decoded id only", () => {
  const parsed = api.parseSessionSearch(
    "?next=https://evil.example&s=session_%30%31XANLEKYHhnouszW5pTBCm6&redirect=claude://evil",
  );
  assert.deepEqual(parsed, { ok: true, id: EXAMPLE });
  const encodedKey = api.parseSessionSearch("?%73=" + EXAMPLE);
  assert.equal(encodedKey.id, EXAMPLE);
  const withHash = api.parseSessionSearch("?s=" + EXAMPLE + "#https://evil.example");
  assert.equal(withHash.id, EXAMPLE);
  const fullUrl = api.parseSessionSearch("https://evil.example/?s=" + EXAMPLE);
  assert.equal(fullUrl.ok, false);
  assert.equal(fullUrl.reason, "missing");
});

test("destinations and automatic redirect refuse arbitrary URLs", () => {
  const refused = [
    "https://evil.example",
    "https://claude.ai.evil.example/code/" + EXAMPLE,
    "https://user@claude.ai/code/" + EXAMPLE,
    "http://claude.ai/code/" + EXAMPLE,
    WEB,
    APP + "/extra",
    APP + "?next=https://evil.example",
    APP + "#https://evil.example",
    "claude://evil/" + EXAMPLE,
    "javascript:alert(1)",
    "//evil.example",
    "claude://code/session_abc\n",
    "claude://code/session_abc%2f..",
    "",
  ];
  for (const url of refused) {
    const location = recordingLocation();
    assert.throws(() => api.attemptAppRedirect(url, location), url);
    assert.deepEqual(location.calls, []);
  }
  assert.throws(() => api.destinations("https://evil.example"));
  assert.throws(() => api.destinations("session_abc/../" + EXAMPLE));
  assert.throws(() => api.destinations(EXAMPLE + "\n"));
});

test("render sets the two fallbacks and assigns only the app URL", () => {
  const doc = fakeDoc();
  const location = recordingLocation();
  const result = api.renderSessionPage(doc, "?s=" + EXAMPLE, location);
  assert.equal(result.ok, true);
  assert.equal(result.app, APP);
  assert.equal(result.web, WEB);
  assert.deepEqual(location.calls, [["assign", APP]]);
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
  assert.equal(doc.nodes["open-web"].getAttribute("href"), WEB);
  assert.equal(doc.nodes["open-app"].getAttribute("rel"), "noreferrer");
  assert.equal(doc.nodes["open-web"].getAttribute("rel"), "noreferrer noopener");
  assert.equal(doc.nodes["open-app"].textContent, "Open in Claude");
  assert.equal(doc.nodes["open-web"].textContent, "Open in browser");
  assert.equal(doc.nodes["session-id"].textContent, EXAMPLE);
  assert.equal(doc.nodes.actions.hidden, false);
  assert.equal(doc.nodes["session-line"].hidden, false);
  assert.equal(combinedText(doc).includes("evil"), false);
  assert.equal(combinedText(doc).includes("http"), false);
});

test("render keeps the same fallbacks when an extra URL parameter is present", () => {
  const doc = fakeDoc();
  const location = recordingLocation();
  api.renderSessionPage(
    doc,
    "?s=" + EXAMPLE + "&next=https://evil.example/phish&url=javascript:alert(1)",
    location,
  );
  assert.deepEqual(location.calls, [["assign", APP]]);
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
  assert.equal(doc.nodes["open-web"].getAttribute("href"), WEB);
  assert.equal(combinedText(doc).includes("evil.example"), false);
  assert.equal(combinedText(doc).includes("javascript"), false);
});

test("render does not navigate or publish links for missing, invalid, or duplicate s", () => {
  const cases = [
    ["", "missing"],
    ["?s=", "invalid"],
    ["?s=https://evil.example", "invalid"],
    ["?s=javascript:alert(1)", "invalid"],
    ["?s=%3Cscript%3Ealert(1)%3C/script%3E", "invalid"],
    ["?s=" + EXAMPLE + "&s=https://evil.example", "duplicate"],
    ["?redirect=https://evil.example", "missing"],
  ];
  for (const [search, reason] of cases) {
    const doc = fakeDoc();
    const location = recordingLocation();
    const result = api.renderSessionPage(doc, search, location);
    assert.equal(result.ok, false, search);
    assert.equal(result.reason, reason, search);
    assert.deepEqual(location.calls, [], search);
    assert.equal(doc.nodes["open-app"].getAttribute("href"), null, search);
    assert.equal(doc.nodes["open-web"].getAttribute("href"), null, search);
    assert.equal(doc.nodes.actions.hidden, true, search);
    assert.equal(doc.nodes["session-id"].textContent, "", search);
    assert.equal(doc.nodes.error.textContent, api.rejectionMessage(reason), search);
    const text = combinedText(doc);
    assert.equal(text.includes("evil"), false, search);
    assert.equal(text.includes("<script"), false, search);
    assert.equal(text.includes("javascript:"), false, search);
    assert.equal(text.includes(EXAMPLE), false, search);
  }
});

test("a thrown protocol navigation does not replace the fallbacks or echo the error", () => {
  const doc = fakeDoc();
  const location = {
    calls: [],
    assign() {
      throw new Error("navigate to https://evil.example");
    },
  };
  const result = api.renderSessionPage(doc, "?s=" + EXAMPLE, location);
  assert.equal(result.app, APP);
  assert.equal(result.web, WEB);
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
  assert.equal(doc.nodes["open-web"].getAttribute("href"), WEB);
  assert.equal(doc.nodes.status.textContent, "The Claude app did not open automatically. Use a link below.");
  assert.equal(combinedText(doc).includes("evil.example"), false);
});

test("page.js wires the real document search to the same fallbacks", () => {
  const doc = fakeDoc();
  const location = recordingLocation();
  location.search = "?s=" + EXAMPLE + "&s=" + EXAMPLE;
  global.document = doc;
  global.window = { location };
  const pagePath = require.resolve("../cc/page.js");
  delete require.cache[pagePath];
  require(pagePath);
  assert.deepEqual(location.calls, []);
  assert.equal(doc.nodes["open-app"].getAttribute("href"), null);
  assert.equal(doc.nodes.error.textContent, "The link contains more than one s parameter.");

  const doc2 = fakeDoc();
  const location2 = recordingLocation();
  location2.search = "?s=" + encodeURIComponent(EXAMPLE);
  global.document = doc2;
  global.window = { location: location2 };
  delete require.cache[pagePath];
  require(pagePath);
  assert.deepEqual(location2.calls, [["assign", APP]]);
  assert.equal(doc2.nodes["open-app"].getAttribute("href"), APP);
  assert.equal(doc2.nodes["open-web"].getAttribute("href"), WEB);
  assert.equal(doc2.nodes["open-app"].textContent, "Open in Claude");
  assert.equal(doc2.nodes["open-web"].textContent, "Open in browser");
});

function fakeClock() {
  const timers = [];
  let nextId = 1;
  return {
    timers,
    setTimer(fn, ms) {
      const id = nextId;
      nextId += 1;
      timers.push({ id, fn, ms, cleared: false });
      return id;
    },
    clearTimer(id) {
      const timer = timers.find((item) => item.id === id);
      if (timer) timer.cleared = true;
    },
    pending() {
      return timers.filter((timer) => !timer.cleared);
    },
  };
}

function fakeWindow() {
  const calls = [];
  const listeners = [];
  return {
    closed: false,
    calls,
    listeners,
    close() {
      calls.push("close");
    },
    addEventListener(type) {
      listeners.push(type);
    },
  };
}

function clickableDoc() {
  const doc = fakeDoc();
  const listeners = { visibilitychange: [] };
  doc.visibilityState = "visible";
  doc.listenerTypes = [];
  doc.addEventListener = (type, fn) => {
    doc.listenerTypes.push(type);
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(fn);
  };
  doc.setVisibility = (state) => {
    doc.visibilityState = state;
    for (const fn of listeners.visibilitychange) fn();
  };
  for (const id of ["open-app", "open-web"]) {
    const node = doc.nodes[id];
    const clicks = [];
    node.addEventListener = (type, fn) => {
      if (type === "click") clicks.push(fn);
    };
    node.click = () => {
      for (const fn of clicks) fn();
    };
  }
  return doc;
}

function firePending(clock) {
  const pending = clock.pending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].ms, api.HANDOFF_CLOSE_DELAY_MS);
  pending[0].fn();
}

test("close delay is between 1 and 1.5 seconds and the hint does not claim the app opened", () => {
  assert.equal(api.HANDOFF_CLOSE_DELAY_MS, 1200);
  assert.ok(api.HANDOFF_CLOSE_DELAY_MS >= 1000 && api.HANDOFF_CLOSE_DELAY_MS <= 1500);
  assert.equal(api.CLOSE_HINT, "If Claude opened, you can close this tab.");
});

test("automatic handoff does not close while the page stays visible", () => {
  const doc = clickableDoc();
  const win = fakeWindow();
  const clock = fakeClock();
  api.renderSessionPage(doc, "?s=" + EXAMPLE, recordingLocation(), win, clock);
  assert.deepEqual(clock.timers, []);
  assert.deepEqual(win.calls, []);
  assert.deepEqual(win.listeners, []);
  assert.deepEqual(doc.listenerTypes, ["visibilitychange"]);
  assert.equal(doc.nodes.status.textContent, "Trying to open the Claude app. If it does not open, use a link below.");
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
  assert.equal(doc.nodes["open-web"].getAttribute("href"), WEB);
});

test("automatic handoff closes only after the page was visible and then stays hidden", () => {
  const doc = clickableDoc();
  const win = fakeWindow();
  const clock = fakeClock();
  api.renderSessionPage(doc, "?s=" + EXAMPLE, recordingLocation(), win, clock);
  doc.setVisibility("hidden");
  assert.equal(clock.pending().length, 1);
  assert.equal(win.calls.length, 0);
  doc.setVisibility("visible");
  assert.equal(clock.pending().length, 0);
  assert.equal(win.calls.length, 0);
  assert.equal(doc.nodes.status.textContent, "Trying to open the Claude app. If it does not open, use a link below.");

  doc.setVisibility("hidden");
  firePending(clock);
  assert.deepEqual(win.calls, ["close"]);
  assert.equal(doc.nodes.status.textContent, api.CLOSE_HINT);
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
  assert.equal(doc.nodes["open-web"].getAttribute("href"), WEB);
  assert.equal(doc.nodes["open-app"].textContent, "Open in Claude");
  assert.equal(doc.nodes["open-web"].textContent, "Open in browser");
  assert.equal(doc.nodes.actions.hidden, false);
});

test("a close timer that races a visible page does not close, and a successful close skips the hint", () => {
  const refused = clickableDoc();
  const refusedWin = fakeWindow();
  const refusedClock = fakeClock();
  api.renderSessionPage(refused, "?s=" + EXAMPLE, recordingLocation(), refusedWin, refusedClock);
  refused.setVisibility("hidden");
  refused.visibilityState = "visible";
  refusedClock.pending()[0].fn();
  assert.deepEqual(refusedWin.calls, []);
  assert.equal(refused.nodes.status.textContent, "Trying to open the Claude app. If it does not open, use a link below.");

  const closed = clickableDoc();
  const closedWin = fakeWindow();
  closedWin.close = function () {
    this.calls.push("close");
    this.closed = true;
  };
  const closedClock = fakeClock();
  api.renderSessionPage(closed, "?s=" + EXAMPLE, recordingLocation(), closedWin, closedClock);
  closed.setVisibility("hidden");
  firePending(closedClock);
  assert.deepEqual(closedWin.calls, ["close"]);
  assert.equal(closed.nodes.status.textContent, "Trying to open the Claude app. If it does not open, use a link below.");
});

test("explicit Open in Claude uses the same close rule and the browser link does not", () => {
  const doc = clickableDoc();
  const win = fakeWindow();
  const clock = fakeClock();
  api.renderSessionPage(doc, "?s=" + EXAMPLE, null, win, clock);
  assert.equal(clock.timers.length, 0);
  doc.nodes["open-web"].click();
  doc.setVisibility("hidden");
  assert.equal(clock.timers.length, 0);
  assert.deepEqual(win.calls, []);
  assert.equal(doc.nodes["open-web"].getAttribute("href"), WEB);

  doc.setVisibility("visible");
  doc.nodes["open-app"].click();
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
  doc.setVisibility("hidden");
  firePending(clock);
  assert.deepEqual(win.calls, ["close"]);
  assert.equal(doc.nodes.status.textContent, api.CLOSE_HINT);
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
  assert.equal(doc.nodes["open-web"].getAttribute("href"), WEB);
});

test("a tampered Open in Claude href does not arm closing", () => {
  const doc = clickableDoc();
  const win = fakeWindow();
  const clock = fakeClock();
  api.renderSessionPage(doc, "?s=" + EXAMPLE, null, win, clock);
  doc.nodes["open-app"].setAttribute("href", "https://evil.example");
  doc.nodes["open-app"].click();
  doc.setVisibility("hidden");
  assert.equal(clock.timers.length, 0);
  assert.deepEqual(win.calls, []);
});

test("invalid, missing, and duplicate ids never schedule a close", () => {
  const searches = [
    "",
    "?s=",
    "?s=https://evil.example",
    "?s=javascript:alert(1)",
    "?s=" + EXAMPLE + "&s=" + EXAMPLE,
    "?s=" + EXAMPLE + "&s=https://evil.example",
  ];
  for (const search of searches) {
    const doc = clickableDoc();
    const win = fakeWindow();
    const clock = fakeClock();
    const result = api.renderSessionPage(doc, search, recordingLocation(), win, clock);
    assert.equal(result.ok, false, search);
    doc.setVisibility("hidden");
    doc.nodes["open-app"].click();
    assert.equal(clock.timers.length, 0, search);
    assert.deepEqual(win.calls, [], search);
    assert.equal(doc.nodes.status.textContent.includes(api.CLOSE_HINT), false, search);
    assert.equal(doc.nodes["open-app"].getAttribute("href"), null, search);
  }
});

test("a failed automatic handoff does not close, and a later explicit click can", () => {
  const doc = clickableDoc();
  const win = fakeWindow();
  const clock = fakeClock();
  const location = {
    assign() {
      throw new Error("protocol blocked");
    },
  };
  api.renderSessionPage(doc, "?s=" + EXAMPLE, location, win, clock);
  doc.setVisibility("hidden");
  assert.equal(clock.timers.length, 0);
  assert.deepEqual(win.calls, []);
  assert.equal(doc.nodes.status.textContent, "The Claude app did not open automatically. Use a link below.");
  doc.setVisibility("visible");
  doc.nodes["open-app"].click();
  doc.setVisibility("hidden");
  firePending(clock);
  assert.deepEqual(win.calls, ["close"]);
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
});

test("a page that loads hidden does not close until it has been visible", () => {
  const doc = clickableDoc();
  doc.visibilityState = "hidden";
  const win = fakeWindow();
  const clock = fakeClock();
  api.renderSessionPage(doc, "?s=" + EXAMPLE, recordingLocation(), win, clock);
  doc.setVisibility("hidden");
  assert.equal(clock.timers.length, 0);
  doc.setVisibility("visible");
  assert.equal(clock.timers.length, 0);
  doc.setVisibility("hidden");
  assert.equal(clock.pending().length, 1);
  assert.equal(clock.pending()[0].ms, 1200);
});

test("an extra parameter does not change destinations or the close rule", () => {
  const doc = clickableDoc();
  const win = fakeWindow();
  const clock = fakeClock();
  api.renderSessionPage(
    doc,
    "?s=" + EXAMPLE + "&next=https://evil.example&url=javascript:alert(1)",
    recordingLocation(),
    win,
    clock,
  );
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
  assert.equal(doc.nodes["open-web"].getAttribute("href"), WEB);
  assert.equal(combinedText(doc).includes("evil.example"), false);
  doc.setVisibility("hidden");
  firePending(clock);
  assert.deepEqual(win.calls, ["close"]);
  assert.equal(doc.nodes["open-app"].getAttribute("href"), APP);
  assert.equal(doc.nodes["open-web"].getAttribute("href"), WEB);
});
