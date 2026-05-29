# NodeShot — Project Context

Chrome extension (Manifest V3) that lets users activate an element picker on any page, capture a DOM element as an image, refine with crop controls in a preview tab, and save as PNG or PDF.

## Design

Follow shadcn/ui design conventions throughout. Black and white palette only — no color accents. High contrast. Clean, large icons (outlined, not filled). Tight spacing, no decorative elements, no gradients, no drop shadows. UI should feel minimal and deliberate, like a tool worth shipping. When in doubt, do less.

## Commands

```bash
npm run dev      # Vite watch mode — rebuild on save, then reload extension in chrome://extensions
npm run build    # Production bundle → dist/
npm test         # Vitest (jsdom) — 29 tests across 3 files
npm run icons    # Regenerate src/assets/icon{16,48,128}.png from scripts/generate-icons.js
```

Load the extension: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

## Workflow

After every code change, always run `npm test && npm run build` — tests first to catch logic errors, build second to confirm the bundle compiles and `dist/` is current for local testing. Do not wait to be asked.

## Architecture

Three isolated runtime contexts:

### Service Worker (`src/background.js`)
- Listens for toolbar icon clicks
- **First click on a page**: `sendMessage` fails (no content script) → injects `content.js` via `scripting.executeScript`
- **Subsequent clicks on same page**: `sendMessage({action:'activate'})` reactivates the already-running content script in its original scope — this is the key mechanism that keeps the extension functional across multiple captures without requiring a page reload
- Handles `pickerCancelled` and `openPreview` messages (badge management, tab creation)
- Gracefully ignores injection failures on restricted pages (`chrome://`, extension pages)

### Content Script (`src/content.js`)
- Injected **on demand** (not declared in manifest) — avoids loading html2canvas into every tab
- On first load: sets `window.__nodeShotInjected = true`, registers a permanent `onMessage` listener for `{action:'activate'}`, calls `activatePicker()`
- On re-injection (shouldn't happen in normal use): the `!window.__nodeShotInjected` guard is a no-op
- `activatePicker()` creates the overlay, highlight, and banner; `cleanup()` closes over its own `onKeyDown` reference so listener removal is always correct
- Captures via `html2canvas`, stores data URL in `chrome.storage.local` under a UUID key, sends `openPreview` to service worker

### Preview Page (`src/preview/preview.html` + `src/preview.js`)
- Opened as a new tab: `preview.html#key=<uuid>`
- Reads and deletes the storage entry on load
- `CropController`: 8 drag handles (TL, TC, TR, ML, MR, BL, BC, BR), constrained to image bounds, minimum 10px
- Save PNG: `OffscreenCanvas` crop → `showSaveFilePicker`
- Save PDF: `OffscreenCanvas` → `pdf-lib` embed → `showSaveFilePicker`

## Build

Vite with three entry points (`background`, `content`, `preview`). Output format is `es` but since `content.js` has no exports and all imports are bundled inline, the output contains no `import`/`export` statements — required for injection via `scripting.executeScript` which runs scripts as classic scripts, not ES modules.

Static assets (`manifest.json`, `preview.html`, `src/assets/`) are copied to `dist/` by a `closeBundle` Vite plugin in `vite.config.js`.

## Test Setup

**Vitest + jsdom.** Three jsdom limitations required workarounds:

| Limitation | Workaround |
|---|---|
| `Image.onload` never fires for data URLs | `mockImage()` helper stubs `Image` with a `setTimeout(() => onload(), 0)` setter |
| `canvas.getContext('2d')` returns null | `mockCanvasContext()` stubs `HTMLCanvasElement.prototype.getContext` |
| `document.elementsFromPoint` doesn't exist | Stub added in `tests/setup.js`; tests override per-case with `vi.spyOn` |

`vi.resetModules()` before each content/preview test import ensures a clean module scope.

## Key Decisions

- **On-demand injection** over static `content_scripts` declaration — avoids html2canvas loading on every tab load
- **Message-based reactivation** (`sendMessage` → `executeScript` fallback) instead of re-running the full content script on each icon click — re-executing in a new scope caused the "extension non-functional after capture" bug
- **`chrome.storage.local`** as the cross-context image handoff — service workers and content scripts can't share memory, and data URLs are too large for message passing
- **No `captureVisibleTab`** — viewport crop was removed; full DOM render via `html2canvas` is the only capture mode
- **`blobToDataUrl` uses chunked `String.fromCharCode`** (8192-byte chunks) to avoid O(n²) string concat and stack overflow on spread of large arrays
- **pdf-lib** for PDF export — embeds the cropped PNG, sizes the page to exact pixel dimensions

## Permissions

```json
["activeTab", "scripting", "storage", "tabs"]
```

No `host_permissions`. No static `content_scripts` block.
