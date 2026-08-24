# Chrome Web Store listing

## Summary

```text
Pick any element on a page and capture it as a PNG. Copy it to your clipboard or download it.
```

## Detailed description

```text
Capture exactly the part of a web page you need.

Click the NodeSnip toolbar icon, hover to select an element, then choose Copy or PNG. Hold Shift to lock a selection. Press Esc to cancel.

Features:
- Capture one page element instead of the whole page
- Copy the PNG directly to your clipboard
- Download the PNG with a page-based filename
- Activate only when you click the toolbar icon
- Handle modern CSS colors and translucent backgrounds

Privacy:
NodeSnip temporarily processes the page element you select in your browser to create the image. It does not upload or store page content, captures, URLs, or filenames. Rendering may cause Chrome to request page images from their original hosts. NodeSnip has no analytics, advertising, accounts, or tracking.
```

## Category

```text
Productivity
```

## Single purpose

```text
Let users capture one explicitly selected element from the current web page as a PNG for clipboard copy or local download.
```

## Permission justifications

### activeTab

```text
Provides temporary access to the current tab only after the user clicks the NodeSnip toolbar icon. This access is required to identify and render the page element the user selects.
```

### scripting

```text
Injects NodeSnip's bundled picker and capture code on demand into the current tab. NodeSnip does not use static content scripts or request host permissions.
```

### clipboardWrite

```text
Writes the generated PNG to the clipboard when the user chooses Copy after capture rendering finishes.
```

## Privacy practices

- Website content: Yes. NodeSnip temporarily processes only the page element the user explicitly selects. Processing is local, and the content is not stored or transmitted to the developer.
- Remote code: No.
- Selling user data: No.
- Using user data for unrelated purposes, credit decisions, or personalized advertising: No.
- Human access to user data: No.
- Privacy policy URL: `https://github.com/ericfurspan/NodeSnip/blob/master/PRIVACY.md`

## Listing links

- Homepage: `https://github.com/ericfurspan/NodeSnip`
- Support: `https://github.com/ericfurspan/NodeSnip/issues`

## Assets

- Store icon: `src/assets/icon128.png`
- Screenshot 1: `screenshots/01-stripe.png`
- Screenshot 2: `screenshots/02-linear_1280.png`
- Screenshot 3: `screenshots/03-github.png`
- Small promo tile: `screenshots/promo-small.png`
- Marquee promo tile: optional and omitted
