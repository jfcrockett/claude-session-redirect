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

## Checks

`npm test` covers validation, duplicate `s`, injection and arbitrary URLs, and the two fallback destinations.

Those tests run in Node. They do not launch the Claude macOS app, and a Linux browser check does not prove that the native app opened.

## Pages

Published from the `main` branch, root folder, with Jekyll disabled (`.nojekyll`). The document sets `no-referrer`. GitHub Pages does not provide a custom HTTP `Referrer-Policy` header for this static site.
