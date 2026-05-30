# NodeShot — Project Context

Chrome extension (Manifest V3) that lets users activate an element picker on any page, capture a DOM element as an image, and either copy it to the clipboard, download a PNG, or refine it with crop controls in a preview tab and save as PNG or PDF.

## Design

Follow shadcn/ui design conventions throughout. Black and white palette only — no color accents. High contrast. Clean, large icons (outlined, not filled). Tight spacing, no decorative elements, no gradients, no drop shadows. UI should feel minimal and deliberate, like a tool worth shipping. When in doubt, do less.

## Commands

```bash
npm run dev      # Per-entry build in watch mode (node scripts/build.mjs --watch), then reload in chrome://extensions
npm run build    # Production bundle → dist/ (node scripts/build.mjs)
npm test         # Vitest (jsdom) — 74 tests across 4 files
npm run icons    # Regenerate src/assets/icon{16,32,48,128}.png from scripts/generate-icons.js
```

Load the extension: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`. Requires Chrome 111+ (manifest `minimum_chrome_version`).

## Workflow

After every code change, always run `npm test && npm run build` — tests first to catch logic errors, build second to confirm the bundle compiles and `dist/` is current for local testing. Do not wait to be asked.

## Architecture

Three isolated runtime contexts.

### Service Worker (`src/background.js`)
- Listens for toolbar icon clicks
- **First click on a page**: `sendMessage` fails (no content script) → injects `content.js` via `scripting.executeScript`
- **Subsequent clicks on same page**: `sendMessage({action:'activate'})` reactivates the already-running content script in its original scope — the key mechanism that keeps the extension functional across multiple captures without a page reload
- Handles `pickerCancelled` and `openPreview` messages (badge management, tab creation)
- **Security**: rejects any message where `sender.id !== chrome.runtime.id`; validates `openPreview`'s `key` against `/^[\w-]+$/` before building the preview URL
- Gracefully ignores injection failures on restricted pages (`chrome://`, extension pages)

### Content Script (`src/content.js`)
- Injected **on demand** (not declared in manifest) — avoids loading html2canvas into every tab
- On first load: sets `window.__nodeShotInjected = true`, registers a permanent `onMessage` listener for `{action:'activate'}`, calls `activatePicker()`. The `!window.__nodeShotInjected` guard makes re-injection a no-op.
- **Picker UI**: hover highlight (white border); hold **Shift** to lock onto the current element (corner-bracket reticle); **Esc** cancels. Clicking opens a floating **action dialog** with three modes:
  - **Copy** → `navigator.clipboard.write` (PNG blob)
  - **PNG** → direct download via `URL.createObjectURL` + `<a download>`
  - **Crop** → stores data URL in `chrome.storage.local` under a UUID, sends `openPreview`
- **DOM-clobbering guard**: every injected node carries a `data-nodeshot` attribute; `cleanup()` and the hover hit-test check ownership via that attribute (never by ID alone)
- **Capture** uses `html2canvas` with `imageTimeout: 3000` (fail fast on blocked CDN assets) and an `onclone` that (1) clamps negative SVG `<rect>` width/height and (2) resolves unsupported CSS colors (see Color Handling)
- **Backdrop**: `resolveCaptureBackground()` walks ancestors for the first opaque background-color and passes it as html2canvas's `backgroundColor`, so translucent/no-background elements composite over the page's real backdrop instead of html2canvas's default white
- **Graceful limits** (detected pre-flight, surfaced as a clear message, not a crash): cross-origin iframe targets and elements detached before capture

### Preview Page (`src/preview.html` + `src/preview.js`)
- Opened as a new tab: `preview.html#key=<uuid>`; validates the key, reads and deletes the storage entry on load
- `CropController`: 8 drag handles (TL, TC, TR, ML, MR, BL, BC, BR), constrained to image bounds, minimum 10px
- Save PNG: `OffscreenCanvas` crop → `showSaveFilePicker`
- Save PDF: `OffscreenCanvas` → `pdf-lib` embed → `showSaveFilePicker`

## Color Handling (`src/color-utils.js`)

html2canvas's parser only understands `rgb/rgba/hsl/hsla`. Modern Chrome's `getComputedStyle` returns CSS Color 4 functions (`oklch()`, `color()`, `oklab()`, `color-mix()`, …) verbatim, which makes html2canvas throw and abort the capture (Tailwind v4 / shadcn sites hit this constantly).

- **Resolution is general** via a 1×1 canvas read-back (`resolveColorToRgb`): paint the value, read the pixel back as concrete rgb. Handles any syntax the browser renders.
- **Detection is general too** — keyed on the *supported* set (`SUPPORTED_COLOR_FN = rgb/rgba/hsl/hsla`), not an allowlist of unsupported names. Any function token outside it is resolved, so a brand-new CSS color function needs no code change.
- `replaceUnsupportedColors` rewrites colors in place, including inside compound values (gradients, shadows) by recursing into containers it can't resolve directly.
- The `onclone` hook applies this to solid color props (with a placeholder fallback) and compound props (rewrite only). SVG paint props are intentionally excluded — html2canvas rasterises inline SVG via the browser, which renders Color 4 natively.

## Build

Vite 8 (which uses **Rolldown**, not Rollup/esbuild). Build is orchestrated by **`scripts/build.mjs`**, which runs Vite's `build()` API once per entry (`background`, `content`, `preview`) with a **single input each**.

Why per-entry isolation: a single multi-entry build makes Rolldown extract code shared across entries — here the CJS-interop runtime pulled in by html2canvas (content) and pdf-lib (preview) — into a chunk and rewrite entries to `import` it. Every NodeShot entry runs as a **classic script** (content via `executeScript`, preview via `<script src>`, background as a non-module service worker), where an `import` statement is a fatal syntax error. Building each entry alone leaves nothing to share, so all helpers inline and no chunk is emitted. Output also sets `codeSplitting: false` as a belt-and-suspenders guarantee.

`vite.config.js` holds only the Vitest config and exports `sharedOutput` (the output options the build script reuses). Static assets (`manifest.json`, `preview.html`, `src/assets/`) are copied to `dist/` by a `closeBundle` plugin defined in `scripts/build.mjs`.

**Invariant to preserve:** `dist/content.js`, `dist/background.js`, and `dist/preview.js` must contain no `import`/`export` statements and no `dist/chunks/` directory may be emitted. Verify after build changes.

## Test Setup

**Vitest + jsdom.** Three jsdom limitations required workarounds:

| Limitation | Workaround |
|---|---|
| `Image.onload` never fires for data URLs | `mockImage()` helper stubs `Image` with a `setTimeout(() => onload(), 0)` setter |
| `canvas.getContext('2d')` returns null | `mockCanvasContext()` stubs `HTMLCanvasElement.prototype.getContext` |
| `document.elementsFromPoint` doesn't exist | Stub added in `tests/setup.js`; tests override per-case with `vi.spyOn` |

`vi.resetModules()` before each content/preview test import ensures a clean module scope. `color-utils.js` is unit-tested directly with an injectable resolver, so the scanner is covered without a real canvas. The Web Animations API (`element.animate`, used for the banner dot / spinner) is absent in jsdom — calls are guarded with `typeof el.animate === 'function'`.

## Key Decisions

- **On-demand injection** over static `content_scripts` — avoids html2canvas loading on every tab load
- **Message-based reactivation** (`sendMessage` → `executeScript` fallback) instead of re-running the full content script per click — re-executing in a new scope caused the "extension non-functional after capture" bug
- **`chrome.storage.local`** as the cross-context image handoff — service workers and content scripts can't share memory, and data URLs are too large for message passing
- **No `captureVisibleTab`** — full DOM render via `html2canvas` is the only capture mode
- **Per-entry isolated builds** — required for classic-script-safe output under Vite 8/Rolldown (see Build)
- **General color resolution + detection** — canvas read-back, keyed on the supported set, so new CSS color functions don't reintroduce the crash
- **UI built with DOM APIs, no `innerHTML`** — injected elements are constructed with `createElement`/`createElementNS` (preempts reviewer questions; all content was static anyway)
- **pdf-lib** for PDF export — embeds the cropped PNG, sizes the page to exact pixel dimensions

## Permissions

```json
["activeTab", "scripting", "storage"]
```

No `host_permissions`. No static `content_scripts` block. (`tabs` was removed — unused, and it triggers a "read your browsing history" install warning.)

## Other Files

`README.md`, `LICENSE` (MIT), and `PRIVACY.md` (no data leaves the device) exist at the repo root. Design/planning docs live under `docs/superpowers/`.
