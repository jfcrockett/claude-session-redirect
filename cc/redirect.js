(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.ClaudeSessionRedirect = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Whole-string session id: session_ then one or more ASCII letters or digits.
  var SESSION_PREFIX = "session_";
  var APP_PREFIX = "claude://code/";
  var WEB_PREFIX = "https://claude.ai/code/";
  var HANDOFF_CLOSE_DELAY_MS = 1200;
  var CLOSE_HINT = "If Claude opened, you can close this tab.";

  function isValidSessionId(value) {
    if (typeof value !== "string") return false;
    if (value.length <= SESSION_PREFIX.length) return false;
    if (value.slice(0, SESSION_PREFIX.length) !== SESSION_PREFIX) return false;
    for (var i = SESSION_PREFIX.length; i < value.length; i += 1) {
      var code = value.charCodeAt(i);
      var isDigit = code >= 48 && code <= 57;
      var isUpper = code >= 65 && code <= 90;
      var isLower = code >= 97 && code <= 122;
      if (!isDigit && !isUpper && !isLower) return false;
    }
    return true;
  }

  function decodeQueryComponent(raw) {
    try {
      return decodeURIComponent(String(raw).replace(/\+/g, "%20"));
    } catch (err) {
      return null;
    }
  }

  function fail(reason) {
    return Object.freeze({ ok: false, reason: reason });
  }

  function parseSessionSearch(search) {
    if (typeof search !== "string" || search === "" || search === "?") {
      return fail("missing");
    }

    var query = search.charAt(0) === "?" ? search.slice(1) : search;
    var hashAt = query.indexOf("#");
    if (hashAt !== -1) query = query.slice(0, hashAt);
    if (query === "") return fail("missing");

    var count = 0;
    var first = null;
    var parts = query.split("&");
    for (var i = 0; i < parts.length; i += 1) {
      var part = parts[i];
      if (part === "") continue;
      var eq = part.indexOf("=");
      var rawKey = eq === -1 ? part : part.slice(0, eq);
      var rawValue = eq === -1 ? "" : part.slice(eq + 1);
      var key = decodeQueryComponent(rawKey);
      if (key !== "s") continue;
      count += 1;
      if (count === 1) first = decodeQueryComponent(rawValue);
    }

    if (count === 0) return fail("missing");
    if (count > 1) return fail("duplicate");
    if (first === null || !isValidSessionId(first)) return fail("invalid");
    return Object.freeze({ ok: true, id: first });
  }

  function rejectionMessage(reason) {
    if (reason === "missing") return "The link is missing the s parameter.";
    if (reason === "duplicate") return "The link contains more than one s parameter.";
    if (reason === "invalid") {
      return "The s parameter must be one session id: session_ followed by letters and digits only.";
    }
    return "The session link could not be checked.";
  }

  function assertSafeDestinations(id, app, web) {
    if (!isValidSessionId(id)) throw new Error("invalid session id");
    if (app !== APP_PREFIX + id) throw new Error("refusing app url");
    if (web !== WEB_PREFIX + id) throw new Error("refusing web url");

    var appUrl;
    var webUrl;
    try {
      appUrl = new URL(app);
      webUrl = new URL(web);
    } catch (err) {
      throw new Error("refusing unparsable url");
    }

    if (appUrl.protocol !== "claude:") throw new Error("refusing app url");
    if (appUrl.hostname !== "code") throw new Error("refusing app url");
    if (appUrl.port !== "") throw new Error("refusing app url");
    if (appUrl.pathname !== "/" + id) throw new Error("refusing app url");
    if (appUrl.search !== "" || appUrl.hash !== "") throw new Error("refusing app url");
    if (appUrl.username !== "" || appUrl.password !== "") throw new Error("refusing app url");
    if (appUrl.href !== app) throw new Error("refusing app url");

    if (webUrl.protocol !== "https:") throw new Error("refusing web url");
    if (webUrl.hostname !== "claude.ai") throw new Error("refusing web url");
    if (webUrl.port !== "") throw new Error("refusing web url");
    if (webUrl.pathname !== "/code/" + id) throw new Error("refusing web url");
    if (webUrl.search !== "" || webUrl.hash !== "") throw new Error("refusing web url");
    if (webUrl.username !== "" || webUrl.password !== "") throw new Error("refusing web url");
    if (webUrl.href !== web) throw new Error("refusing web url");
  }

  function destinations(id) {
    var app = APP_PREFIX + id;
    var web = WEB_PREFIX + id;
    assertSafeDestinations(id, app, web);
    return Object.freeze({ app: app, web: web });
  }

  function attemptAppRedirect(appUrl, locationObject) {
    var id = "";
    if (typeof appUrl === "string" && appUrl.indexOf(APP_PREFIX) === 0) {
      id = appUrl.slice(APP_PREFIX.length);
    }
    assertSafeDestinations(id, appUrl, WEB_PREFIX + id);
    if (locationObject == null || typeof locationObject.assign !== "function") {
      throw new Error("refusing redirect");
    }
    locationObject.assign(appUrl);
  }

  function element(doc, id) {
    var node = doc.getElementById(id);
    if (!node) throw new Error("page is missing #" + id);
    return node;
  }

  // After a valid claude:// handoff, try to close only if this page was visible
// and then stayed hidden. A protocol prompt leaves the page visible, so this
// does not close while that prompt is up. Blur is not a signal. A hidden page
// is not proof the native app opened. Browsers often refuse close() unless
// script opened the tab; the hint covers that refusal.
function createTabCloser(doc, win, options) {
  if (!doc || typeof doc.addEventListener !== "function" || !win) {
    return { arm: function () {} };
  }
  var setTimer = options && typeof options.setTimer === "function"
    ? options.setTimer
    : function (fn, ms) { return setTimeout(fn, ms); };
  var clearTimer = options && typeof options.clearTimer === "function"
    ? options.clearTimer
    : function (id) { clearTimeout(id); };
  var status = typeof doc.getElementById === "function" ? doc.getElementById("status") : null;
  var armed = false;
  var sawVisible = false;
  var timer = null;

  function cancelTimer() {
    if (timer == null) return;
    clearTimer(timer);
    timer = null;
  }

  function tryClose() {
    timer = null;
    if (!armed || doc.visibilityState !== "hidden") return;
    try {
      if (typeof win.close === "function") win.close();
    } catch (err) {
      // The page stays open and the hint explains that.
    }
    if (win.closed === true) return;
    if (status) status.textContent = CLOSE_HINT;
  }

  function onVisibility() {
    if (doc.visibilityState === "visible") {
      sawVisible = true;
      cancelTimer();
      return;
    }
    if (doc.visibilityState !== "hidden" || !armed || !sawVisible) return;
    cancelTimer();
    timer = setTimer(tryClose, HANDOFF_CLOSE_DELAY_MS);
  }

  doc.addEventListener("visibilitychange", onVisibility);

  return {
    arm: function () {
      armed = true;
      sawVisible = doc.visibilityState === "visible";
      cancelTimer();
    },
  };
}

function hideDestinations(actions, sessionLine, sessionId, openApp, openWeb) {
    actions.hidden = true;
    sessionLine.hidden = true;
    sessionId.textContent = "";
    openApp.removeAttribute("href");
    openWeb.removeAttribute("href");
  }

  function renderSessionPage(doc, search, locationObject, win, options) {
    var status = element(doc, "status");
    var error = element(doc, "error");
    var actions = element(doc, "actions");
    var openApp = element(doc, "open-app");
    var openWeb = element(doc, "open-web");
    var sessionLine = element(doc, "session-line");
    var sessionId = element(doc, "session-id");

    var parsed = parseSessionSearch(search);
    if (!parsed.ok) {
      status.textContent = "This link cannot be opened.";
      error.hidden = false;
      error.textContent = rejectionMessage(parsed.reason);
      hideDestinations(actions, sessionLine, sessionId, openApp, openWeb);
      return Object.freeze({ ok: false, reason: parsed.reason });
    }

    var dest = destinations(parsed.id);
    openApp.setAttribute("href", dest.app);
    openApp.setAttribute("rel", "noreferrer");
    openApp.textContent = "Open in Claude";
    openWeb.setAttribute("href", dest.web);
    openWeb.setAttribute("rel", "noreferrer noopener");
    openWeb.textContent = "Open in browser";
    if (openApp.getAttribute("href") !== dest.app || openWeb.getAttribute("href") !== dest.web) {
      hideDestinations(actions, sessionLine, sessionId, openApp, openWeb);
      throw new Error("refusing to publish unexpected link");
    }
    if (openApp.getAttribute("rel") !== "noreferrer" || openWeb.getAttribute("rel") !== "noreferrer noopener") {
      hideDestinations(actions, sessionLine, sessionId, openApp, openWeb);
      throw new Error("refusing to publish link without referrer protection");
    }

    error.hidden = true;
    error.textContent = "";
    sessionId.textContent = parsed.id;
    sessionLine.hidden = false;
    actions.hidden = false;
    status.textContent = "Trying to open the Claude app. If it does not open, use a link below.";

    var closer = createTabCloser(doc, win, options);
    if (typeof openApp.addEventListener === "function") {
      openApp.addEventListener("click", function () {
        if (openApp.getAttribute("href") !== dest.app) return;
        closer.arm();
      });
    }

    if (locationObject != null) {
      try {
        attemptAppRedirect(dest.app, locationObject);
        closer.arm();
      } catch (err) {
        status.textContent = "The Claude app did not open automatically. Use a link below.";
      }
    }

    return Object.freeze({ ok: true, id: parsed.id, app: dest.app, web: dest.web });
  }

  return Object.freeze({
    isValidSessionId: isValidSessionId,
    parseSessionSearch: parseSessionSearch,
    rejectionMessage: rejectionMessage,
    destinations: destinations,
    attemptAppRedirect: attemptAppRedirect,
    renderSessionPage: renderSessionPage,
    HANDOFF_CLOSE_DELAY_MS: HANDOFF_CLOSE_DELAY_MS,
    CLOSE_HINT: CLOSE_HINT,
  });
});
