---
---

# NodeShot Privacy Policy

_Effective date: July 25, 2026_

NodeShot does not collect, store, or transmit any user data. All processing happens locally in your browser.

## What NodeShot does with your data

- Captured images are saved only to destinations you choose: your clipboard or a local file in your downloads folder.
- Captures are held in memory only for as long as it takes to write them to your clipboard or to disk. Nothing is written to extension storage.
- NodeShot never sends any data to any server, including captured images, page content, URLs, or filenames.

## Browser image requests

When rendering a capture, the browser may re-request images already loaded on the page in order to draw them into the canvas. This is standard browser rendering behavior and does not transmit any captured or user data externally.

## Permissions

NodeShot requests only the permissions required for capture:

- `activeTab` — temporary access to the page you click on
- `scripting` — to inject the element picker
- `clipboardWrite` — to copy a captured image after it finishes rendering

## Third-party libraries

NodeShot bundles one open-source library: [html2canvas](https://html2canvas.hertzen.com/) (DOM rendering). It runs entirely on your device and contacts no external server as part of NodeShot's use of it.

## Contact

Questions or concerns can be raised via the [GitHub repository](https://github.com/ericfurspan/nodeshot/issues) or by emailing [eric.furspan@gmail.com](mailto:eric.furspan@gmail.com).
