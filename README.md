# NodeShot

A Chrome extension (Manifest V3) for capturing any element on a web page as an
image. Activate the picker, hover to highlight the element you want, click, and
copy it to your clipboard, save it as a PNG, or crop it and export as PNG or PDF.

## Features

- **Element picker** — hover any part of a page to highlight the element under
  your cursor, with a live outline.
- **Lock the selection** — hold **Shift** to freeze the current element so you can
  move the mouse without changing the target. Release Shift to resume.
- **Three actions on click** — a small toolbar appears with:
  - **Copy** — copies the element straight to your clipboard as a PNG.
  - **PNG** — downloads the element as a PNG file.
  - **Crop** — opens a preview tab where you can trim the capture with drag
    handles and save it as a **PNG** or **PDF**.
- **Cancel anytime** — press **Esc**.
- Filenames are pre-filled from the page title.

## Install (unpacked)

```bash
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder

Click the NodeShot toolbar icon on any page to start the picker. Click it again to
re-activate after a capture.

## Known behaviors / limitations

NodeShot renders the page's own HTML and CSS into an image. A few things follow
from how that works and from browser security rules — these are expected, not bugs:

- **See-through elements are captured over the page's real background.** NodeShot
  captures exactly the element you pick. If that element has no background of its
  own, or a semi-transparent one — for example a navigation bar, or a card with a
  translucent fill whose colour really comes from the page behind it — NodeShot
  composites it over the page's actual background colour (taken from the nearest
  parent that has a solid one). This means a translucent dark card on a dark page
  captures as dark, the way it looks on screen, rather than as a washed-out grey or
  white box. If the whole page has no solid background anywhere, the capture falls
  back to white.

- **Frosted-glass (backdrop blur) effects can't be fully reproduced.** Some elements
  use a "backdrop blur" that blurs whatever sits behind them (a frosted-glass look).
  Because NodeShot captures a single element on its own, there's nothing behind it to
  blur, so the blur itself can't be recreated. The element still captures with the
  correct base colour and tone — only the blur of the content behind it is missing.

- **Content inside cross-origin frames can't be captured.** If the element is, or
  sits inside, an embedded frame from another website (ads, embedded videos, some
  payment widgets), the browser blocks access to its contents for security reasons.
  NodeShot detects this, skips it cleanly, and shows a short message rather than
  producing a broken image. The frame's area may appear blank in a larger capture.

- **Some images may be missing if they load slowly or block cross-site use.**
  Images that are still loading, or that are served from another site without
  permission to be reused, can't always be drawn into the capture, so their area
  may come out blank. NodeShot waits briefly for images and then proceeds so a
  capture never hangs.

- **Modern colours are matched as closely as the screen shows them.** Pages built
  with newer CSS colour formats (such as `oklch`) are converted to the equivalent
  on-screen colour during capture. In rare cases where a colour can't be converted,
  that single colour falls back to a neutral value and decorative shadows/gradients
  may be dropped, but the rest of the capture is unaffected.

- **Captures are an approximation of complex layouts.** Very elaborate CSS (certain
  filters, blend modes, or custom-element internals that hide their content) may not
  reproduce pixel-for-pixel. The common case — text, images, backgrounds, borders,
  gradients, and shadows — is reproduced faithfully.

- **Restricted pages can't be captured at all.** Chrome does not allow extensions to
  run on internal pages like `chrome://…`, the Chrome Web Store, or other
  extensions' pages. The picker simply won't activate there.

## Permissions

NodeShot requests only what it needs:

- `activeTab`, `scripting` — inject the picker into the current tab when you click
  the icon.
- `storage` — hand the captured image to the crop/preview tab.
- `tabs` — open the preview tab and manage the toolbar badge.

It requests **no host permissions** and sends **no data off your device** — every
capture happens locally in your browser.

## Development

```bash
npm run dev      # Vite watch mode — rebuild on save, then reload in chrome://extensions
npm run build    # Production bundle → dist/
npm test         # Vitest test suite
npm run icons    # Regenerate the toolbar icons
```

After loading the extension from `dist/`, reload it from `chrome://extensions`
whenever you rebuild.
