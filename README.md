# claude-session-redirect

Static GitHub Pages utility. It checks one session id and opens Claude. It does not load analytics, store the id, or forward it to any other site.

## URL

`https://jfcrockett.github.io/claude-session-redirect/cc/?s=session_XXXX`

`s` must match `^session_[A-Za-z0-9]+$` and must appear once. A missing, invalid, or repeated `s` stops on this page. No other parameter is used as a destination.

Working example:

`https://jfcrockett.github.io/claude-session-redirect/cc/?s=session_01XANLEKYHhnouszW5pTBCm6`

For that id the only destinations are:

- `claude://code/session_01XANLEKYHhnouszW5pTBCm6`
- `https://claude.ai/code/session_01XANLEKYHhnouszW5pTBCm6`

The page assigns the app URL on load, then leaves **Open in Claude** and **Open in browser** in place. Those labels are the fallbacks if the app does not open.

After that valid handoff, or after a click on **Open in Claude**, the page tries to close the tab only if it was visible and then stays hidden for 1.2 seconds. It does not close while it remains visible, does not close on blur, and does not close for a missing, invalid, or duplicate id. Hiding the page is not proof the macOS app opened. Browsers usually refuse `window.close()` for a tab the user opened; the page then says "If Claude opened, you can close this tab." Both links stay.

## Checks

`npm test` covers validation, duplicate `s`, injection and arbitrary URLs, and the two fallback destinations.

Those tests run in Node. They do not launch the Claude macOS app, and a Linux browser check does not prove that the native app opened.

## Pages

The publishing source is the `main` branch, root folder. `.nojekyll` disables Jekyll. Turning the site on requires repository administration (`pages=write` and `administration=write`). The page sets `no-referrer`. GitHub Pages does not provide a custom HTTP `Referrer-Policy` header for this static site.
