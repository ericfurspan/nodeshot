# NodeShot

NodeShot lets you capture any element on any web page as an image — not the
whole page, just the piece you actually want.

## Features

Click the toolbar icon to activate the element picker. Hover over the page to see
elements highlight as you move. When you find what you want, click — a small
toolbar appears with three choices:

- **Copy** — paste it straight into any app that accepts images.
- **PNG** — downloads immediately, named after the page title.
- **Crop** — opens a preview tab with drag handles so you can trim the capture,
  then save as PNG or PDF.

Hold **Shift** to lock the selection in place before you click. Press **Esc** to
cancel at any time.

## Install (unpacked)

Requires Chrome 111 or newer.

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

- **Frosted-glass (backdrop blur) effects can't be fully reproduced.** The element's
  base color is captured correctly, but the blur of content behind it is not.

- **Content inside cross-origin frames can't be captured.** Content inside
  cross-origin frames (embedded ads, videos, payment widgets) cannot be captured —
  NodeShot detects this and shows a clear message instead of a broken image.

- **Some images may be missing if they load slowly or block cross-site use.**
  Images that are still loading, or that are served from another site without
  permission to be reused, can't always be drawn into the capture, so their area
  may come out blank. NodeShot waits briefly for images and then proceeds so a
  capture never hangs.

- **Modern colours are matched as closely as the screen shows them.** Pages built
  with newer CSS colour formats (such as `oklch`, `color()`, or `color-mix()`) are
  converted to the equivalent on-screen colour during capture, including colours
  inside gradients and shadows. In the rare case a colour can't be converted, that
  one colour falls back to a neutral value; the rest of the capture is unaffected.

- **Captures are an approximation of complex layouts.** Very elaborate CSS (certain
  filters, blend modes, or custom-element internals that hide their content) may not
  reproduce pixel-for-pixel. The common case — text, images, backgrounds, borders,
  gradients, and shadows — is reproduced faithfully.

- **Restricted pages can't be captured at all.** Chrome's internal pages
  (`chrome://…` and the Chrome Web Store itself) cannot be activated.

## Permissions

Everything happens locally — NodeShot never sends data to any server. No images,
no page content, no URLs, nothing leaves your browser. The only permissions it
requests are the minimum needed to run:

- `activeTab`, `scripting` — to inject the picker when you click the icon.
- `storage` — to temporarily pass the capture to the preview tab. The entry is
  deleted immediately after it's read.

No host permissions. No access to your browsing history.

## Development

```bash
npm run dev      # Vite watch mode — rebuild on save, then reload in chrome://extensions
npm run build    # Production bundle → dist/
npm test         # Vitest test suite
npm run icons    # Regenerate the toolbar icons
```

After loading the extension from `dist/`, reload it from `chrome://extensions`
whenever you rebuild.
