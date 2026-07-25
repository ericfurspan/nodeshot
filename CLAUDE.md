# NodeShot — Project Context

Chrome extension (Manifest V3) that lets users activate an element picker on any page, capture a DOM element as an image, and either copy it to the clipboard or download it as a PNG.

## Design

Follow shadcn/ui design conventions throughout. High contrast. Clean, large icons (outlined, not filled). Tight spacing, no decorative elements, no gradients, no drop shadows. UI should feel minimal and deliberate, like a tool worth shipping. When in doubt, do less.

## Commands

```bash
npm run dev      # Build in watch mode (node scripts/build.mjs --watch), then reload in chrome://extensions
npm run build    # Production bundle → dist/ (node scripts/build.mjs), then classic-script assertion
npm test         # Vitest (jsdom) — 60 tests across 3 files
npm run icons    # Regenerate src/assets/icon{16,32,48,128}.png from scripts/generate-icons.js
npm run package  # Production build → nodeshot.zip at repo root, ready for Chrome Web Store upload
```

Load the extension: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`. Requires Chrome 111+ (manifest `minimum_chrome_version`).

## Workflow

After every code change, always run `npm test && npm run build` — tests first to catch logic errors, build second to confirm the bundle compiles and `dist/` is current for local testing. Do not wait to be asked.

## Architecture

Two isolated runtime contexts.

### Service Worker (`src/background.js`)
- Listens for toolbar icon clicks
- **First click on a page**: `sendMessage` fails (no content script) → injects `content.js` via `scripting.executeScript`
- **Subsequent clicks on same page**: `sendMessage({action:'activate'})` reactivates the already-running content script in its original scope — the key mechanism that keeps the extension functional across multiple captures without a page reload
- Handles the `pickerCancelled` message (clears the badge)
- **Security**: rejects any message where `sender.id !== chrome.runtime.id`
- Gracefully ignores injection failures on restricted pages (`chrome://`, extension pages)

### Content Script (`src/content.js`)
- Injected **on demand** (not declared in manifest) — avoids loading html2canvas into every tab
- On first load: sets `window.__nodeShotInjected = true`, registers a permanent `onMessage` listener for `{action:'activate'}`, calls `activatePicker()`. The `!window.__nodeShotInjected` guard makes re-injection a no-op.
- **Picker UI**: hover highlight (`#1a73e8` border); hold **Shift** to lock onto the current element (corner-bracket reticle); **Esc** cancels. Clicking opens a floating **action dialog** with two modes:
  - **Copy** → `navigator.clipboard.write` (PNG blob)
  - **PNG** → direct download via `URL.createObjectURL` + `<a download>`
- **DOM-clobbering guard**: every injected node carries a `data-nodeshot` attribute; `cleanup()` and the hover hit-test check ownership via that attribute (never by ID alone)
- **Capture** uses `html2canvas` with `imageTimeout: 3000` (fail fast on blocked CDN assets) and an `onclone` that (1) clamps negative SVG `<rect>` width/height and (2) resolves unsupported CSS colors (see Color Handling)
- **Backdrop**: `resolveCaptureBackground()` walks ancestors for the first opaque background-color and passes it as html2canvas's `backgroundColor`, so translucent/no-background elements composite over the page's real backdrop instead of html2canvas's default white
- **Graceful limits** (detected pre-flight, surfaced as a clear message, not a crash): cross-origin iframe targets and elements detached before capture

## Color Handling (`src/color-utils.js`)

html2canvas's parser only understands `rgb/rgba/hsl/hsla`. Modern Chrome's `getComputedStyle` returns CSS Color 4 functions (`oklch()`, `color()`, `oklab()`, `color-mix()`, …) verbatim, which makes html2canvas throw and abort the capture (Tailwind v4 / shadcn sites hit this constantly).

- **Resolution is general** via a 1×1 canvas read-back (`resolveColorToRgb`): paint the value, read the pixel back as concrete rgb. Handles any syntax the browser renders.
- **Detection is general too** — keyed on the *supported* set (`SUPPORTED_COLOR_FN = rgb/rgba/hsl/hsla`), not an allowlist of unsupported names. Any function token outside it is resolved, so a brand-new CSS color function needs no code change.
- `replaceUnsupportedColors` rewrites colors in place, including inside compound values (gradients, shadows) by recursing into containers it can't resolve directly.
- The `onclone` hook applies this to solid color props (with a placeholder fallback) and compound props (rewrite only). SVG paint props are intentionally excluded — html2canvas rasterises inline SVG via the browser, which renders Color 4 natively.

## Build

Vite 8 (which uses **Rolldown**, not Rollup/esbuild). Build is orchestrated by **`scripts/build.mjs`**: one multi-entry build (`background`, `content`), then an assertion that both outputs are valid classic scripts.

Both entries run as **classic scripts** — content via `executeScript`, background as a non-module service worker — where an `import` statement is a fatal syntax error at load time. Rolldown extracts code shared across entries into a chunk and rewrites the entries to `import` it, so a shared chunk breaks the extension. Nothing is shared today (html2canvas is content-only), so no chunk is emitted.

That is a property of the current dependency graph, not a guarantee, so `assertClassicScripts()` in the build script enforces it: it fails if `dist/chunks/` exists, and compiles each entry with `new vm.Script(...)`, which parses as a classic script and throws on `import`/`export`. Add a dependency both entries pull in and the build fails there rather than at extension load.

This replaced an earlier per-entry isolated build (one Vite `build()` call per entry, plus `codeSplitting: false`), which existed because html2canvas and pdf-lib each pulled in a CJS-interop runtime that got hoisted into a shared chunk. With pdf-lib and the preview entry gone there is nothing left to share. Note `codeSplitting: false` is not available as a fallback here — Rolldown rejects it for multi-entry builds.

`vite.config.js` holds only the Vitest config and exports `sharedOutput` (the output options the build script reuses). Static assets (`manifest.json`, `src/assets/`) are copied to `dist/` by a `closeBundle` plugin defined in `scripts/build.mjs`.

**Invariant to preserve:** `dist/content.js` and `dist/background.js` must contain no `import`/`export` statements and no `dist/chunks/` directory may be emitted. Enforced automatically at the end of `npm run build` (skipped in `--watch`).

## Test Setup

**Vitest + jsdom.** Two jsdom limitations required workarounds, both handled in `tests/setup.js`:

| Limitation | Workaround |
|---|---|
| `document.elementsFromPoint` doesn't exist | Stub added in `tests/setup.js`; tests override per-case with `vi.spyOn` |
| `canvas.getContext('2d')` returns null | `HTMLCanvasElement.prototype.getContext` stubbed with the minimum surface the color read-back uses |

`vi.resetModules()` before each content test import ensures a clean module scope. The PNG download test stubs `HTMLAnchorElement.prototype.click` — jsdom logs a "not implemented: navigation" error otherwise. `color-utils.js` is unit-tested directly with an injectable resolver, so the scanner is covered without a real canvas. The Web Animations API (`element.animate`, used for the banner dot / spinner) is absent in jsdom — calls are guarded with `typeof el.animate === 'function'`.

## Key Decisions

- **On-demand injection** over static `content_scripts` — avoids html2canvas loading on every tab load
- **Message-based reactivation** (`sendMessage` → `executeScript` fallback) instead of re-running the full content script per click — re-executing in a new scope caused the "extension non-functional after capture" bug
- **No `captureVisibleTab`** — full DOM render via `html2canvas` is the only capture mode
- **Crop and PDF export removed in 2.0.0** — the preview tab, its 8-handle crop controller, `pdf-lib`, and the `chrome.storage.local` handoff (with its `storage`/`unlimitedStorage` permissions) are gone. The crop tests asserted against a hand-copied duplicate of the shipped controller, so the real one was never exercised and a reliability bug shipped through the gap. Captures now go straight to clipboard or disk.
- **Asserted classic-script output** — the invariant is checked by the build rather than documented as a manual step (see Build)
- **General color resolution + detection** — canvas read-back, keyed on the supported set, so new CSS color functions don't reintroduce the crash
- **UI built with DOM APIs, no `innerHTML`** — injected elements are constructed with `createElement`/`createElementNS` (preempts reviewer questions; all content was static anyway)

## Permissions

```json
["activeTab", "scripting", "clipboardWrite"]
```

No `host_permissions`. No static `content_scripts` block. (`tabs` was removed — unused, and it triggers a "read your browsing history" install warning.)

## Other Files

`README.md`, `LICENSE` (MIT), and `PRIVACY.md` (no data leaves the device) exist at the repo root.

## Open release task for 2.0.0

`screenshots/02-linear_1280.png` and `screenshots/03-linear.png` still show the old three-button action dialog with CROP. They are Chrome Web Store listing assets, not referenced by any code or doc, and regenerating them requires a manual capture run — so they were deliberately left stale. Before publishing 2.0.0, recapture both and update the Web Store listing description, which also still describes crop and PDF export.
