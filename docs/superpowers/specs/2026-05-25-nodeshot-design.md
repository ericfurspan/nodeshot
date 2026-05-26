# NodeShot — Design Spec
_Date: 2026-05-25_

## Overview

NodeShot is a Manifest V3 Chrome extension that lets the user activate an element picker on any page, capture a DOM element as an image, refine the selection with crop controls, and save as PNG or PDF. All third-party libraries are bundled locally; no external network requests at runtime.

---

## Architecture

Three distinct runtime contexts, each with a single responsibility:

### Service Worker (`src/background.js`)
- Listens for toolbar icon click
- Injects `content.js` on demand via `chrome.scripting.executeScript()` (not statically declared — avoids loading html2canvas into every tab)
- Handles `captureVisibleTab` for the viewport-crop path (Shift+click)
- Crops the viewport screenshot to the element rect using `OffscreenCanvas`
- Stores captured image data URL in `chrome.storage.local` under a UUID key
- Opens the preview tab via `chrome.tabs.create`
- Manages extension badge state (active/inactive)

### Content Script (`src/content.js`)
- Injected on demand when the user clicks the toolbar icon
- Auto-activates picker mode on load (no separate activation message needed)
- Guards against double-injection with `window.__nodeShotInjected`; on re-injection (user clicked icon again after Escape), re-activates picker mode rather than double-initializing
- Picker mode creates two elements appended to `document.body`:
  - `#nodeshot-overlay` — full-screen transparent div (`position: fixed`, `inset: 0`, `z-index: 2147483647`, `cursor: crosshair`), captures mouse events
  - `#nodeshot-highlight` — `position: fixed`, `pointer-events: none`, 2px blue border + light blue tinted fill, snaps to hovered element bounds
- A fixed banner at top of viewport reads: _"NodeShot — click to capture, Shift+click for viewport crop, Esc to cancel"_
- Element detection: `mousemove` on overlay calls `document.elementsFromPoint(x, y)` and takes the first result that is not `#nodeshot-overlay` or `#nodeshot-highlight`
- On **click (full render)**:
  1. Tears down overlay and highlight immediately (so html2canvas sees the unmodified DOM)
  2. Shows `#nodeshot-spinner` — centered fixed element with dark semi-transparent background, white "Capturing…" text, CSS spinner animation
  3. Runs `html2canvas(targetElement)`, converts to data URL
  4. Stores data URL in `chrome.storage.local` under a UUID key
  5. Sends `{ action: 'openPreview', key }` to service worker
  6. Removes spinner
- On **Shift+click (viewport crop)**:
  1. Tears down overlay immediately
  2. Sends `{ action: 'captureViewport', key, rect, devicePixelRatio }` to service worker (rect = `getBoundingClientRect()` of target; `devicePixelRatio` = `window.devicePixelRatio`)
  3. Service worker handles the rest — `captureVisibleTab` returns an image scaled by `devicePixelRatio`, so crop rect coordinates must be multiplied by it before cropping on `OffscreenCanvas`
- On **Escape**: removes overlay, highlight, and banner; sends `{ action: 'pickerCancelled' }` to service worker; no capture

### Preview Page (`src/preview/preview.html` + `src/preview/preview.js`)
- Opened as a new tab via `chrome.tabs.create({ url: 'preview.html#key=<uuid>' })`
- On load: reads key from `location.hash`, fetches data URL from `chrome.storage.local`, deletes the entry
- Dark-themed UI: toolbar at top (filename input, Save PNG button, Save PDF button), scrollable canvas area below
- Crop UI rendered on a `<canvas>`:
  - Image drawn as background
  - Crop rect initialized to full image dimensions
  - Area outside crop rect dimmed with semi-transparent dark overlay
  - Crop boundary rendered as bright border
  - 8 drag handles: 4 corners (TL, TR, BL, BR) + 4 edge midpoints (T, R, B, L), each a small square
  - `mousemove` checks proximity to handles to set appropriate resize cursor
  - `mousedown` on handle begins drag; `mousemove` updates crop rect (constrained to image bounds); `mouseup` ends drag
- **Save PNG**: crops image to current rect on an offscreen canvas, calls `canvas.toBlob('image/png')`, opens `showSaveFilePicker({ suggestedName: '<name>.png' })`, writes blob via `FileSystemWritableFileStream`
- **Save PDF**: crops image on offscreen canvas, uses `pdf-lib` to create a `PDFDocument`, embeds PNG, sets page size to exact image pixel dimensions, saves via `showSaveFilePicker({ suggestedName: '<name>.pdf' })`
- Filename input pre-populates with `nodeshot-<timestamp>`
- Tab stays open after save

---

## Data Flow

### Full-render path (click)
1. User clicks toolbar icon
2. Service worker injects `content.js` into active tab
3. Content script auto-activates picker mode
4. User clicks element → overlay torn down, spinner shown, `html2canvas` runs
5. Content script stores data URL in `chrome.storage.local` under UUID key
6. Content script sends `{ action: 'openPreview', key }` to service worker
7. Service worker opens `preview.html#key=<uuid>` in a new tab
8. Preview page reads and deletes the storage entry, displays crop UI

### Viewport-crop path (Shift+click)
1–3. Same as above
4. User Shift+clicks element → overlay torn down
5. Content script sends `{ action: 'captureViewport', key, rect, devicePixelRatio }` to service worker
6. Service worker calls `chrome.tabs.captureVisibleTab()`, scales `rect` by `devicePixelRatio`, crops via `OffscreenCanvas`, stores data URL under `key`
7. Service worker opens `preview.html#key=<uuid>` in a new tab
8. Same as full-render step 8

### Badge state
- Service worker sets badge text `●` (blue background) when picker is active
- Clears badge on `openPreview` or `pickerCancelled` messages

---

## Permissions

```json
"permissions": ["activeTab", "scripting", "storage", "tabs"]
```

No `host_permissions` required. No `content_scripts` block in manifest (on-demand injection only).

---

## Bundled Libraries

| Library | Used in | Purpose |
|---|---|---|
| `html2canvas` | content.js | Full DOM-to-canvas rendering |
| `pdf-lib` | preview.js | PDF creation with embedded image |

No external network requests at runtime. All libraries bundled via Vite.

---

## Build Tooling & File Structure

**Build tool:** Vite with multiple entry points.

```
NodeShot/
├── manifest.json
├── package.json
├── vite.config.js
├── src/
│   ├── background.js
│   ├── content.js
│   ├── preview/
│   │   ├── preview.html
│   │   └── preview.js
│   └── assets/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-05-25-nodeshot-design.md
```

**Entry points:**
- `src/background.js` → `dist/background.js`
- `src/content.js` → `dist/content.js` (html2canvas bundled)
- `src/preview/preview.js` → `dist/preview/preview.js` (pdf-lib bundled)

`manifest.json` and `src/assets/` are copied into `dist/` as static assets.

**Dev workflow:**
- `npm run dev` — Vite watch mode; load `dist/` as unpacked extension in Chrome
- `npm run build` — production bundle

---

## Constraints

- Manifest V3
- No external network requests at runtime
- Top-level frame only (no iframe picker support)
- Picker deactivates after a single capture (one-shot per icon click)
