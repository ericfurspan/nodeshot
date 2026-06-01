---
---

# NodeShot Privacy Policy

_Effective date: June 1, 2026_

NodeShot does not collect, store, or transmit any user data. All processing happens locally in your browser.

## What NodeShot does with your data

- Captured images are saved only to destinations you choose: your clipboard or a local file via your system's save dialog.
- A temporary copy of the captured image is held in `chrome.storage.local` solely to pass it from the capture step to the preview tab. It is deleted immediately after the preview tab reads it.
- NodeShot never sends any data to any server, including captured images, page content, URLs, or filenames.

## Browser image requests

When rendering a capture, the browser may re-request images already loaded on the page in order to draw them into the canvas. This is standard browser rendering behavior and does not transmit any captured or user data externally.

## Permissions

NodeShot requests only the permissions required for capture:

- `activeTab` — temporary access to the page you click on
- `scripting` — to inject the element picker
- `storage` — for the temporary preview handoff described above

## Third-party libraries

NodeShot bundles two open-source libraries: [html2canvas](https://html2canvas.hertzen.com/) (DOM rendering) and [pdf-lib](https://pdf-lib.js.org/) (PDF export). Both run entirely on your device. Neither library contacts any external server as part of NodeShot's use of them.

## Contact

Questions or concerns can be raised via the [GitHub repository](https://github.com/ericfurspan/nodeshot/issues) or by emailing [eric.furspan@gmail.com](mailto:eric.furspan@gmail.com).