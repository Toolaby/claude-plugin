---
name: toolaby-extension-patterns
description: "Places Toolaby's gate() right in a Manifest V3 extension: service worker (background) vs popup vs side panel vs content script vs a page in a tab, module vs classic scripts, the client's own port, message listeners, subscription and trial states, offline answers. Use when gating in a background, content script or side panel, when a popup throws on import, when sign-in does not stick, when the paywall never shows, or when `check` reports a code."
---

# Toolaby in a Manifest V3 extension

Read `TOOLABY.md` at the project's root first: the files Toolaby owns, where `toolaby.js` is imported from in this kind of project, the tool's plans and features now, and the rules. No `TOOLABY.md`: the extension is not wired yet (the toolaby skill says how).

| Where | How |
| --- | --- |
| Background (service worker) | `toolaby.startBackground({ handlers })` at the top level, once. Gate in the handler; on a refusal return `{ permit }` to the page. `showPaywall()` throws here |
| Popup | `gate()` at the action, then `showPaywall(permit)`: the paywall, with Back |
| Side panel | The same; `<html data-toolaby-surface="sidepanel">` sizes the paywall to the panel |
| Content script | Bundled (WXT, CRXJS, Plasmo): import the client; `showPaywall()` opens the checkout page in a new tab. Not bundled: `chrome.runtime.sendMessage({ action: 'toolaby.gate', count: 1, feature })`, then `{ action: 'toolaby.open', page: 'payment', plan }` |
| A page in a tab | `showPaywall()` opens the checkout page in a new tab and leaves the page as it is |
| No page at all | `toolaby.openPaymentPage(planId)` when `gate()` refuses |

- A page script that imports `toolaby.js` is a module: `<script type="module" src="popup.js"></script>`. A classic one throws on `import` (`POPUP_NOT_MODULE`). In a classic background, `toolaby` is a global: no import.
- The client asks its background over its own port, `chrome.runtime.connect({ name: 'toolaby' })`. Never name a port of yours `toolaby`. Your `chrome.runtime.onMessage` listener answers only its own messages: `return false` for the rest.
- A background that never starts Toolaby answers nothing: pages reject with *Toolaby is not running in this extension's background* (`BACKGROUND_NOT_STARTED`). Fix it with `upgrade`, not by hand.
- `getUser()` reads the device, no request. `user.subscription.status`: only `trialing` and `active` unlock; `past_due` asks for a new card (`toolaby.openAccountPage()`). `await toolaby.refresh()` when a page opens hears of a purchase made elsewhere.
- Offline, `gate()` answers from the device's signed token, marked `offline: true`, until `user.token.offlineUntil`. A new install that never reached Toolaby is refused, with `unknown: true`.
- Sign-in does not stick, or the paywall never shows: the manifest lost Toolaby's address (`externally_connectable`), a `connect-src` left it out (`CSP_BLOCKS_TOOLABY`), or the `key`, so the extension has another id. `check` names which.
- Never add a host permission for Toolaby (`HOST_PERMISSION_LEFT`): Chrome would switch the update off until each user approves it.
- Code that calls `chrome.action.setPopup()` keeps its own popup in front: gate the paid action in code.

More: https://toolaby.app/docs/gating.md · https://toolaby.app/docs/surfaces.md · https://toolaby.app/docs/troubleshooting.md · https://toolaby.app/docs/reference/objects.md

## Verify

1. `npx -y toolaby@latest check --json` exits `0` with `ok: true`; for each `error` finding, run its `fix`, or change what its `message` says.
2. `npx -y toolaby@latest check --browser [--built <dir>]`: the background answers on the port, and the popup and side panel open without an error.
