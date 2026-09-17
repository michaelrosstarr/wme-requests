# WME Requests

Submit **downlock** and **imagery** requests straight from the Waze Map Editor — no more posting screenshots in Discord and waiting for someone to notice. Select a segment, click a button, and your community's moderators get notified instantly on Slack, Discord, Telegram, or email.

## Features

### Fast, in-editor submission
- **Two request types** — 🔒 Downlock (lock level too high) and 🖼️ Imagery (needs updated satellite imagery)
- **Floating quick-submit buttons** — submit a request for whatever segment is selected without opening the sidebar panel at all. Draggable, and remembers where you put them.
- **Sidebar panel** — for full control: pick a request type, adjust the lock level, add notes, and submit
- **Multi-segment selection supported** — the generated permalink covers every selected segment

### Smart auto-detection
- **Lock level** is read directly from the selected segment
- **Country** is auto-detected from the map viewport and pre-selected — no manual lookup
- **Region / state / province** (US states, Canadian provinces, etc.) is also auto-detected where your community has configured them, with a **Country-wide fallback** if a region isn't set up or can't be detected — you're never blocked
- **Editor rank** is read from your WME session, and the script will stop you from submitting a redundant downlock request if your rank already covers the segment's current lock level

### Downlock reason picker
Quick-pick chips for common reasons (Adjust Speed Limit, Add Speed Bump, Fix Geometry, Add Junction Box, House Numbers, Turn Restrictions) plus a free-text field for anything else — captured automatically in the request notes.

### Optional viewport screenshot
On supported Chromium browsers, attach a screenshot of the current map viewport to your request with one click, so moderators can see exactly what you're seeing.

### Works with your community's setup
- Instant notifications to **Slack**, **Discord**, **Telegram**, **email**, or a custom webhook — configured by your community's admins, not you
- Notifications can be scoped by **country**, and further narrowed by **region/state** for larger communities that route different states to different channels
- Point the script at your own community's backend from the **Settings** panel (⚙) — one field, no reinstall needed

### Stays out of your way
- Lives as a tab in WME's native sidebar (falls back to a floating panel if WME's UI changes underneath it)
- Inline success/error feedback for every submission
- No account or sign-up required to use the script — submissions are tied to your Waze editor username automatically

## Requirements

- [Tampermonkey](https://www.tampermonkey.net/) or Greasemonkey
- Works on `waze.com/editor` and `beta.waze.com`
- Your community needs a WME Requests backend configured (ask your local admins for the URL, or see the [project repo](https://github.com/michaelrosstarr/wme-requests) if you're setting one up)

## Usage

1. Install the script and open WME — find the **WME Requests** tab in the sidebar (or the floating panel if the tab doesn't appear).
2. Click **Settings** once and enter your community's backend URL.
3. Select a segment on the map. Lock level, country, and region (if configured) are filled in automatically.
4. Adjust anything you need, add notes, optionally attach a screenshot, and submit — or use the floating **Downlock** / **Imagery** buttons for a one-click submit on the current selection.

## Changelog highlights

- **2.2.0** — Added region/state/province support: notifications and requests can now be scoped below the country level (e.g. per US state), with automatic detection and a country-wide fallback when a region isn't configured.

## Support

Found a bug or have a feature request? Open an issue on [GitHub](https://github.com/michaelrosstarr/wme-requests).

## Development

The script is written in TypeScript against Waze's official [`wme-sdk-typings`](https://web-assets.waze.com/wme_sdk_docs/production/latest/index.html#md:typescript-type-definitions), following the same rollup + `@rollup/plugin-typescript` setup as [bedo2991/wme-typescript](https://github.com/bedo2991/wme-typescript).

```
userscript/
  src/main.user.ts   — the script itself
  header.js          — the @-metadata block prepended to the release build
  header-dev.js       — dev-mode metadata, @requires the local compiled output
  rollup.config.mjs   — compiles src/main.user.ts → .out/main.user.js (IIFE)
  scripts/concat.mjs  — prepends header.js to the compiled output, Prettier-formats it,
                         and writes userscript/wme-requests.user.js
```

`wme-requests.user.js` at the top of this folder is a **generated file** — it's what `@updateURL`/`@downloadURL` point existing installs at, so it's committed, but it's produced by the build below rather than edited by hand.

```bash
cd userscript
npm install
npm run build       # compile + write userscript/wme-requests.user.js
npm run typecheck    # tsc --noEmit, no build output
npm run watch        # recompiles .out/main.user.js on save, for local dev — see below
```

### Local dev loop

For iterating without reinstalling the script on every change:

1. Enable ["Allow access to file URLs"](https://www.tampermonkey.net/faq.php?locale=en#Q204) for Tampermonkey.
2. Run `npm run watch` — this keeps `.out/main.user.js` up to date as you edit `src/main.user.ts`.
3. Copy `header-dev.js` into a new Tampermonkey script, and point its `@require` at the absolute path of `.out/main.user.js` on your machine.
4. Reload the WME tab to pick up each recompile — no reinstall needed.

### Releasing

Bump `@version` in both `header.js` and (for consistency) `userscript/README.md`'s changelog, then run `npm run build` and commit the result.
