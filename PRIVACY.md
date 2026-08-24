---
---

# NodeSnip Privacy Policy

_Effective date: August 24, 2026_

NodeSnip processes only the page element you explicitly select. It does not store that page content or send it to the NodeSnip developer, analytics services, advertising services, or any other service. Capture processing happens locally in your browser, subject to the normal page-asset requests described below.

NodeSnip's use of information received through Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## What NodeSnip does with your data

- Captured images are saved only to destinations you choose: your clipboard or a local file in your downloads folder.
- Captures are held in memory only for as long as it takes to write them to your clipboard or to disk. Nothing is written to extension storage.
- NodeSnip does not upload captured images, page content, URLs, or filenames.

## Browser image requests

When rendering a capture, the browser may re-request images already loaded on the page from their original hosts. Those hosts receive a normal resource request, which can include the image URL and standard request metadata according to the page's and browser's policies. NodeSnip does not proxy these requests or send them to the NodeSnip developer.

## Permissions

NodeSnip requests only the permissions required for capture:

- `activeTab` — temporary access to the page you click on
- `scripting` — to inject the element picker
- `clipboardWrite` — to copy a captured image after it finishes rendering

## Third-party libraries

NodeSnip bundles [html2canvas](https://html2canvas.hertzen.com/) and its open-source dependencies for DOM rendering. They run locally and include no NodeSnip telemetry or remote service. As described above, rendering can cause the browser to re-request page assets from their original hosts.

## Contact

Questions or concerns can be raised via the [GitHub repository](https://github.com/ericfurspan/NodeSnip/issues) or by emailing [eric.furspan@gmail.com](mailto:eric.furspan@gmail.com).
