const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function walk(dir, found) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "test" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

test("published pages do not load third parties or collect data", () => {
  const files = walk(root, []).filter((file) => {
    const rel = path.relative(root, file);
    return !rel.startsWith(".git") && rel !== "README.md" && rel !== "package.json" && !rel.startsWith(".github" + path.sep);
  });
  const forbidden = [
    "innerHTML",
    "outerHTML",
    "insertAdjacentHTML",
    "document.write",
    "eval(",
    "new Function",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "document.cookie",
    "fetch(",
    "XMLHttpRequest",
    "sendBeacon",
    "WebSocket",
    "gtag",
    "google-analytics",
    "googletagmanager",
    "posthog",
    "segment.com",
    "mixpanel",
    "facebook.net",
    "doubleclick",
    "hotjar",
    "console.",
    "window.open",
    "location.replace",
    "location.href",
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const token of forbidden) {
      assert.equal(text.includes(token), false, path.relative(root, file) + " contains " + token);
    }
  }
});

test("redirect script hard-codes only the two Claude destinations", () => {
  const js = read("cc/redirect.js");
  const urls = js.match(/[a-z][a-z0-9+.-]*:\/\/[^\s'"`)]+/gi);
  assert.deepEqual(urls, ["claude://code/", "https://claude.ai/code/"]);
  assert.equal(js.includes("${"), false);
  assert.equal((js.match(/\.assign\(/g) || []).length, 1);
  assert.equal(read("cc/page.js").includes("http"), false);
  assert.equal(read("cc/page.js").includes("assign"), false);
  assert.equal(read("cc/page.js").includes("location.href"), false);
  assert.equal(
    read("cc/page.js").includes("renderSessionPage(document, window.location.search, window.location, window)"),
    true,
  );
});

test("utility page keeps referrer protection, fallbacks, and relative assets", () => {
  const html = read("cc/index.html");
  assert.equal(html.includes('name="referrer" content="no-referrer"'), true);
  assert.equal(html.includes(CSP), true);
  assert.ok(html.indexOf('name="referrer"') < html.indexOf("<script"));
  assert.equal(html.includes("Open in Claude"), true);
  assert.equal(html.includes("Open in browser"), true);
  assert.equal(html.includes('rel="noreferrer"'), true);
  assert.equal(html.includes('rel="noreferrer noopener"'), true);
  assert.equal(html.includes("<base"), false);
  assert.equal(/<script(?![^>]*\bsrc=)/.test(html), false);
  assert.equal(/\son[a-z]+=/i.test(html), false);
  assert.equal(html.includes("claude://"), false);
  assert.equal(html.includes("https://"), false);
  assert.equal(html.includes("session_01XANLEKYHhnouszW5pTBCm6"), false);
  const refs = [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(refs, ["../site.css", "redirect.js", "page.js"]);
  for (const ref of refs) {
    assert.equal(ref.startsWith("/"), false, ref);
    assert.equal(ref.includes("://"), false, ref);
  }
});

test("root page explains the path and does not redirect by itself", () => {
  const html = read("index.html");
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("claude://"), false);
  assert.equal(html.includes("https://"), false);
  assert.equal(html.includes(CSP), true);
  assert.equal(html.includes('name="referrer" content="no-referrer"'), true);
  assert.equal(html.includes('href="cc/?s=session_01XANLEKYHhnouszW5pTBCm6"'), true);
  assert.equal(html.includes("/claude-session-redirect/cc/?s=session_"), true);
});

test("Jekyll is disabled and tests are wired", () => {
  assert.equal(fs.existsSync(path.join(root, ".nojekyll")), true);
  assert.equal(read("package.json").includes('"test": "node --test"'), true);
  assert.equal(read(".github/workflows/test.yml").includes("npm test"), true);
  assert.equal(read("site.css").includes("url("), false);
  assert.equal(read("site.css").includes("@import"), false);
});
