// src/content.js
import html2canvas from 'html2canvas'
import {
  replaceUnsupportedColors,
  hasUnsupportedColorFn,
  firstOpaqueBackgroundColor,
} from './color-utils.js'

// Attribute set on every element we inject so cleanup() can distinguish our nodes
// from any page element that happens to share one of our IDs (DOM clobbering guard).
const NS = 'data-nodeshot'

// The colour-bearing properties html2canvas parses per-element as colours (longhands
// only — that's what getComputedStyle exposes). These are the exact properties whose
// values reach html2canvas's colour parser and can throw on a CSS Color 4 function.
//
// Solid properties hold a single <color>; if resolution fails we can safely fall back
// to a placeholder (none of them accept url()/gradient, so a failed resolve always
// means an unresolvable colour).
const SOLID_COLOR_PROPS = [
  'color', 'background-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'text-decoration-color', '-webkit-text-stroke-color',
]
// Foreground colours fall back to black, everything else to transparent.
const FOREGROUND_COLOR_PROPS = new Set(['color', 'text-decoration-color', '-webkit-text-stroke-color'])
// Compound properties embed colours inside multi-token values (gradient stops, shadow
// colours). They can also legitimately contain url()/gradients, so we never apply a
// placeholder fallback — only in-place token rewriting.
const COMPOUND_COLOR_PROPS = ['background-image', 'box-shadow', 'text-shadow']
// (SVG paint — fill/stroke/stop-color/… — is intentionally omitted: html2canvas does
// not parse it as a colour, it rasterises inline SVG via the browser, which renders
// Color 4 natively. It can also be url(#ref), which must not be touched.)

if (!window.__nodeShotInjected) {
  window.__nodeShotInjected = true
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'activate') activatePicker()
  })
  activatePicker()
}

function activatePicker() {
  // Declared before cleanup() to avoid temporal dead zone
  let onDocumentMousedown = null
  cleanup()

  // ── Overlay — captures pointer events ────────────────────────────────────

  const overlay = document.createElement('div')
  overlay.id = 'nodeshot-overlay'
  overlay.setAttribute(NS, '')
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'transparent',
  })

  // ── Highlight — hover indicator (white border, visible on any bg) ─────────

  const highlight = document.createElement('div')
  highlight.id = 'nodeshot-highlight'
  highlight.setAttribute(NS, '')
  Object.assign(highlight.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    border: '2px solid #fff',
    backgroundColor: 'transparent',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.7)',
    display: 'none',
  })

  // ── Reticle — locked-state indicator (corner brackets + crosshair + dot) ──

  const reticle = document.createElement('div')
  reticle.id = 'nodeshot-reticle'
  reticle.setAttribute(NS, '')
  Object.assign(reticle.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    display: 'none',
    backgroundColor: 'rgba(255,45,120,0.07)',
  })

  // Corner brackets: TL, TR, BL, BR
  ;[
    { top: '0',    left: '0',  borderTop: '2px solid #fff', borderLeft: '2px solid #fff'  },
    { top: '0',    right: '0', borderTop: '2px solid #fff', borderRight: '2px solid #fff' },
    { bottom: '0', left: '0',  borderBottom: '2px solid #fff', borderLeft: '2px solid #fff'  },
    { bottom: '0', right: '0', borderBottom: '2px solid #fff', borderRight: '2px solid #fff' },
  ].forEach(styles => {
    const el = document.createElement('div')
    Object.assign(el.style, { position: 'absolute', width: '12px', height: '12px', ...styles })
    reticle.appendChild(el)
  })

  const crossH = document.createElement('div')
  Object.assign(crossH.style, {
    position: 'absolute', top: '50%', left: '0',
    width: '100%', height: '1px',
    background: 'rgba(255,255,255,0.45)',
    transform: 'translateY(-50%)',
  })
  reticle.appendChild(crossH)

  const crossV = document.createElement('div')
  Object.assign(crossV.style, {
    position: 'absolute', left: '50%', top: '0',
    width: '1px', height: '100%',
    background: 'rgba(255,255,255,0.45)',
    transform: 'translateX(-50%)',
  })
  reticle.appendChild(crossV)

  const centerDot = document.createElement('div')
  Object.assign(centerDot.style, {
    position: 'absolute', top: '50%', left: '50%',
    width: '6px', height: '6px',
    borderRadius: '50%',
    background: '#ff2d78',
    transform: 'translate(-50%, -50%)',
  })
  reticle.appendChild(centerDot)

  // ── Banner ────────────────────────────────────────────────────────────────

  const banner = document.createElement('div')
  banner.id = 'nodeshot-banner'
  banner.setAttribute(NS, '')
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0', left: '0', right: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
    backgroundColor: 'rgba(0,0,0,0.92)',
    color: '#fff',
    padding: '9px 20px',
    fontSize: '13px',
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    letterSpacing: '0.01em',
  })
  renderBanner(false)

  document.body.appendChild(overlay)
  document.body.appendChild(highlight)
  document.body.appendChild(reticle)
  document.body.appendChild(banner)

  let currentTarget = null
  let shiftHeld = false
  let frozenTarget = null

  // ── Position helpers ──────────────────────────────────────────────────────

  function positionHighlight(r) {
    Object.assign(highlight.style, {
      display: 'block',
      top: r.top + 'px', left: r.left + 'px',
      width: r.width + 'px', height: r.height + 'px',
    })
  }

  function positionReticle(r) {
    Object.assign(reticle.style, {
      display: 'block',
      top: r.top + 'px', left: r.left + 'px',
      width: r.width + 'px', height: r.height + 'px',
    })
  }

  // ── Frozen state helpers ──────────────────────────────────────────────────

  function setFrozen(frozen) {
    if (frozen) {
      highlight.style.display = 'none'
      reticle.style.borderRadius = getComputedStyle(frozenTarget).borderRadius
      positionReticle(frozenTarget.getBoundingClientRect())
      banner.style.borderBottomColor = 'rgba(255,255,255,0.15)'
      renderBanner(true)
    } else {
      reticle.style.display = 'none'
      banner.style.borderBottomColor = 'rgba(255,255,255,0.1)'
      renderBanner(false)
    }
  }

  // Builds the banner content with DOM APIs (no innerHTML). The unlocked-state dot
  // pulses via the Web Animations API rather than an injected @keyframes stylesheet.
  function renderBanner(locked) {
    banner.replaceChildren()

    const dot = document.createElement('span')
    Object.assign(dot.style, {
      display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
      background: '#fff', marginRight: '9px', verticalAlign: 'middle',
    })
    if (!locked && typeof dot.animate === 'function') {
      dot.animate(
        [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }],
        { duration: 2000, iterations: Infinity, easing: 'ease-in-out' },
      )
    }

    const kbd = document.createElement('span')
    Object.assign(kbd.style, {
      fontSize: '11px', background: 'rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.18)', padding: '1px 6px', borderRadius: '3px',
    })
    kbd.textContent = locked ? 'Shift' : 'Esc'

    banner.append(
      dot,
      locked
        ? 'Node locked — click to capture · release '
        : 'NodeShot — hover to select, click to capture · ',
      kbd,
      locked ? ' to resume' : ' to cancel',
    )
  }

  // ── Capture helper ────────────────────────────────────────────────────────

  // Determines the backdrop to capture a node-scoped element against. html2canvas
  // otherwise defaults to opaque WHITE, which makes a translucent element (e.g. a
  // shadcn card with a semi-transparent fill, or any element with no background of
  // its own) composite over white and render as a washed-out grey box. Instead we
  // walk from the target up through its ancestors (and on to body/html) and use the
  // first fully opaque background colour we find — the page's real backdrop — so
  // translucent fills composite over the colour they actually sit on. Falls back to
  // white when nothing opaque is found (e.g. a genuinely transparent page).
  function resolveCaptureBackground(target) {
    const view = target.ownerDocument.defaultView || window
    const colors = []
    for (let el = target; el; el = el.parentElement) {
      colors.push(view.getComputedStyle(el).backgroundColor)
    }
    return firstOpaqueBackgroundColor(colors) ?? '#ffffff'
  }

  function captureElement(target) {
    // Pre-flight: reject detached elements before paying the cost of html2canvas.
    // A fast-updating page can remove the selected node between click and capture.
    if (!target.isConnected) {
      const err = new Error('Element is no longer in the document.')
      err.expected = true
      err.userMessage = 'Can\'t capture — the element was removed before the screenshot was taken.'
      throw err
    }

    // Pre-flight: cross-origin iframes cannot be cloned by html2canvas.
    // elementsFromPoint returns the <iframe> element itself for cross-origin frames,
    // and html2canvas will reject with "Unable to find element in cloned iframe".
    if (target.tagName === 'IFRAME') {
      try { void target.contentWindow?.location?.href }
      catch {
        const err = new Error('Cross-origin iframe cannot be captured.')
        err.expected = true
        err.userMessage = 'Can\'t capture — this element is inside a cross-origin frame.'
        throw err
      }
    }

    return html2canvas(target, {
      useCORS: true,
      logging: false,
      // Capture against the page's real background instead of html2canvas's default
      // white, so translucent backgrounds keep their true tone (see helper above).
      backgroundColor: resolveCaptureBackground(target),
      // Fail fast on slow/blocked resources instead of waiting the 15 s default.
      // Complex SPAs (e.g. Cloudflare-protected pages) can have CDN assets that
      // hang on CORS preflight for a long time before the browser gives up.
      imageTimeout: 3000,
      scrollX: window.pageXOffset,
      scrollY: window.pageYOffset,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      onclone(doc) {
        const view = doc.defaultView
        if (!view) return

        // Guard 1 — negative SVG <rect> dimensions.
        // Sub-pixel layout and CSS transforms can produce negative width/height.
        // These cause browser SVG validation errors and may abort html2canvas.
        // Check both the HTML presentation attribute AND the CSS-applied value.
        doc.querySelectorAll('rect').forEach(rect => {
          const aw = parseFloat(rect.getAttribute('width'))
          const ah = parseFloat(rect.getAttribute('height'))
          if (!isNaN(aw) && aw < 0) rect.setAttribute('width', '0')
          if (!isNaN(ah) && ah < 0) rect.setAttribute('height', '0')
          const cs = view.getComputedStyle(rect)
          const cw = parseFloat(cs.width)
          const ch = parseFloat(cs.height)
          if (!isNaN(cw) && cw < 0) rect.style.setProperty('width', '0px', 'important')
          if (!isNaN(ch) && ch < 0) rect.style.setProperty('height', '0px', 'important')
        })

        // Guard 2 — colour functions html2canvas can't parse (oklch(), color(),
        // color-mix(), and any future CSS colour syntax). html2canvas only knows
        // rgb/rgba/hsl/hsla; anything else throws and aborts the whole capture.
        // Modern Chrome's getComputedStyle returns these functions verbatim,
        // including inside compound values like gradient stops and shadows. We
        // rewrite each unsupported function — in place — to the rgb the browser
        // renders. Detection is generic (see color-utils): no per-function list.
        doc.querySelectorAll('*').forEach(el => {
          const cs = view.getComputedStyle(el)

          // Solid colours: rewrite, and if a token still can't be resolved fall back
          // to a placeholder so html2canvas never receives an unsupported function.
          for (const prop of SOLID_COLOR_PROPS) {
            const val = cs.getPropertyValue(prop)
            const replaced = replaceUnsupportedColors(val)
            if (replaced === null) continue // already html2canvas-safe
            el.style.setProperty(
              prop,
              hasUnsupportedColorFn(replaced)
                ? (FOREGROUND_COLOR_PROPS.has(prop) ? '#000000' : 'transparent')
                : replaced,
              'important',
            )
          }

          // Compound values: rewrite resolvable colour tokens in place, preserving
          // gradients/shadows (and any url()). No placeholder fallback — anything
          // left unresolved is handled by the capture-level error path.
          for (const prop of COMPOUND_COLOR_PROPS) {
            const replaced = replaceUnsupportedColors(cs.getPropertyValue(prop))
            if (replaced !== null) el.style.setProperty(prop, replaced, 'important')
          }
        })
      },
    })
  }

  // ── Capture error reporting ───────────────────────────────────────────────

  // Determines whether an error from html2canvas represents an expected browser
  // limitation (cross-origin frame, detached element) vs. a genuine defect.
  function isExpectedCaptureLimit(err) {
    if (err?.expected === true) return true
    const msg = err?.message ?? String(err ?? '')
    return msg.includes('Unable to find element in cloned iframe') ||
           msg.includes('cross-origin') ||
           msg.includes('no longer in the document')
  }

  function reportCaptureError(err, action) {
    if (isExpectedCaptureLimit(err)) {
      const userMsg = err?.userMessage ?? 'Can\'t capture — the element may be inside a protected or cross-origin frame.'
      console.warn('[NodeShot] Capture skipped (expected limitation):', err?.message ?? String(err))
      showError(userMsg)
    } else {
      console.error(`[NodeShot] ${action} failed:`, err)
      const fallbacks = {
        Copy: 'Copy failed — capture or clipboard error.',
        Download: 'Download failed — please try again.',
        Crop: 'Capture failed — this page may block screenshots.',
      }
      showError(fallbacks[action] ?? 'Capture failed.')
    }
    try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
  }

  // ── Action handlers ───────────────────────────────────────────────────────

  async function handleCopy(target) {
    cleanup()
    showSpinner()
    await new Promise(r => setTimeout(r, 0))
    try {
      const canvas = await captureElement(target)
      const blob = await new Promise((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png')
      )
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
    } catch (err) {
      reportCaptureError(err, 'Copy')
    } finally {
      removeSpinner()
    }
  }

  async function handleDownload(target) {
    cleanup()
    showSpinner()
    await new Promise(r => setTimeout(r, 0))
    try {
      const canvas = await captureElement(target)
      const blob = await new Promise((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png')
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${titleToFilename(document.title)}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
    } catch (err) {
      reportCaptureError(err, 'Download')
    } finally {
      removeSpinner()
    }
  }

  async function handleCrop(target) {
    const key = crypto.randomUUID()
    cleanup()
    showSpinner()
    await new Promise(r => setTimeout(r, 0))
    try {
      const canvas = await captureElement(target)
      const dataUrl = canvas.toDataURL('image/png')
      await chrome.storage.local.set({ [key]: { dataUrl, title: document.title } })
      try { chrome.runtime.sendMessage({ action: 'openPreview', key }) } catch {}
    } catch (err) {
      reportCaptureError(err, 'Crop')
    } finally {
      removeSpinner()
    }
  }

  // ── Action dialog ─────────────────────────────────────────────────────────

  function showActionDialog(x, y, target) {
    // Dismantle the picker controls; reticle stays visible over the selection
    overlay.remove()
    banner.remove()
    document.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('scroll', onScroll, { capture: true })
    window.removeEventListener('blur', onBlur)

    const dialog = document.createElement('div')
    dialog.id = 'nodeshot-dialog'
    dialog.setAttribute(NS, '')
    Object.assign(dialog.style, {
      position: 'fixed',
      zIndex: '2147483647',
      backgroundColor: 'rgba(0,0,0,0.92)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px',
      padding: '6px',
      display: 'flex',
      gap: '2px',
      fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    })

    const btnDefs = [
      {
        id: 'ns-btn-copy',
        label: 'COPY',
        icon: [
          ['rect', { x: 5, y: 5, width: 8, height: 9, rx: 1, stroke: 'currentColor', 'stroke-width': 1.5 }],
          ['path', { d: 'M3 11V3a1 1 0 011-1h6', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
        ],
        handler: () => handleCopy(target),
      },
      {
        id: 'ns-btn-download',
        label: 'PNG',
        icon: [
          ['path', { d: 'M8 2v7', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }],
          ['path', { d: 'M5 7l3 3 3-3', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
          ['path', { d: 'M3 13h10', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }],
        ],
        handler: () => handleDownload(target),
      },
      {
        id: 'ns-btn-crop',
        label: 'CROP',
        icon: [
          ['path', { d: 'M4 1v3M1 4h3', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }],
          ['path', { d: 'M12 1v3M9 4h3', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }],
          ['path', { d: 'M4 15v-3M1 12h3', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }],
          ['path', { d: 'M12 15v-3M9 12h3', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }],
        ],
        handler: () => handleCrop(target),
      },
    ]

    for (const { id, label, icon, handler } of btnDefs) {
      const btn = document.createElement('button')
      btn.id = id
      Object.assign(btn.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        padding: '8px 12px',
        border: 'none',
        background: 'transparent',
        color: '#fff',
        cursor: 'pointer',
        borderRadius: '5px',
        fontSize: '10px',
        fontWeight: '700',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        lineHeight: '1',
        fontFamily: 'inherit',
      })
      const labelEl = document.createElement('span')
      labelEl.textContent = label
      btn.append(makeSvgIcon(icon), labelEl)
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.08)' })
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent' })
      btn.addEventListener('click', handler)
      dialog.appendChild(btn)
    }

    document.body.appendChild(dialog)

    // Position: centered below cursor, clamped to viewport
    const dw = dialog.offsetWidth
    const dh = dialog.offsetHeight
    const margin = 8
    let left = Math.round(x - dw / 2)
    let top  = Math.round(y + 16)
    if (left < margin) left = margin
    if (left + dw > window.innerWidth  - margin) left = window.innerWidth  - dw - margin
    if (top  + dh > window.innerHeight - margin) top  = y - dh - 8
    if (top  < margin) top = margin
    dialog.style.left = left + 'px'
    dialog.style.top  = top  + 'px'

    // Dismiss on outside click (deferred so this click event doesn't immediately fire it)
    onDocumentMousedown = (e) => {
      if (!dialog.contains(e.target)) {
        cleanup()
        try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
      }
    }
    setTimeout(() => {
      document.addEventListener('mousedown', onDocumentMousedown, { capture: true })
    }, 0)
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function onMouseMove(e) {
    if (shiftHeld) return

    const els = document.elementsFromPoint(e.clientX, e.clientY)
    // Exclude our own injected elements; page elements never carry NS attribute.
    const target = els.find(el => !el.hasAttribute(NS))
    if (!target || target === document.body || target === document.documentElement) {
      highlight.style.display = 'none'
      currentTarget = null
      return
    }
    currentTarget = target
    positionHighlight(target.getBoundingClientRect())
  }

  function onClick(e) {
    if (!currentTarget) return
    e.preventDefault()
    e.stopPropagation()
    showActionDialog(e.clientX, e.clientY, currentTarget)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup()
      try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
      return
    }
    if (document.getElementById('nodeshot-dialog')) return
    if (e.key === 'Shift' && !shiftHeld && currentTarget) {
      shiftHeld = true
      frozenTarget = currentTarget
      setFrozen(true)
    }
  }

  function onKeyUp(e) {
    if (e.key === 'Shift' && shiftHeld) {
      shiftHeld = false
      frozenTarget = null
      setFrozen(false)
    }
  }

  function onScroll() {
    if (!frozenTarget) return
    positionReticle(frozenTarget.getBoundingClientRect())
  }

  function onBlur() {
    if (!shiftHeld) return
    shiftHeld = false
    frozenTarget = null
    setFrozen(false)
  }

  overlay.addEventListener('mousemove', onMouseMove)
  overlay.addEventListener('click', onClick)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('blur', onBlur)

  function cleanup() {
    // Only remove elements we own (have NS attribute). If a page element coincidentally
    // shares one of our IDs, getElementById would find it — we must not remove it.
    for (const id of ['nodeshot-overlay', 'nodeshot-highlight', 'nodeshot-reticle',
      'nodeshot-banner', 'nodeshot-dialog', 'nodeshot-spinner']) {
      const el = document.getElementById(id)
      if (el?.hasAttribute(NS)) el.remove()
    }
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('scroll', onScroll, { capture: true })
    window.removeEventListener('blur', onBlur)
    if (onDocumentMousedown) {
      document.removeEventListener('mousedown', onDocumentMousedown, { capture: true })
      onDocumentMousedown = null
    }
  }
}

// Builds an 18×18 SVG icon from a spec of [tagName, attributes] entries, using
// createElementNS (no innerHTML). Markup is fully static — defined in the call site.
const SVG_NS = 'http://www.w3.org/2000/svg'
function makeSvgIcon(nodes) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  for (const [tag, attrs] of nodes) {
    const node = document.createElementNS(SVG_NS, tag)
    for (const k in attrs) node.setAttribute(k, attrs[k])
    svg.appendChild(node)
  }
  return svg
}

function showSpinner() {
  const el = document.createElement('div')
  el.id = 'nodeshot-spinner'
  el.setAttribute(NS, '')
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: '#fff',
    fontSize: '16px',
    fontFamily: 'system-ui, sans-serif',
  })
  const box = document.createElement('div')
  box.style.textAlign = 'center'

  const ring = document.createElement('div')
  Object.assign(ring.style, {
    width: '32px', height: '32px',
    border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
    borderRadius: '50%', margin: '0 auto 12px',
  })
  if (typeof ring.animate === 'function') {
    ring.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: 800, iterations: Infinity, easing: 'linear' },
    )
  }

  box.append(ring, 'Capturing…')
  el.appendChild(box)
  document.body.appendChild(el)
}

function removeSpinner() {
  const el = document.getElementById('nodeshot-spinner')
  if (el?.hasAttribute(NS)) el.remove()
}

function showError(message) {
  const el = document.createElement('div')
  el.id = 'nodeshot-error'
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    backgroundColor: 'rgba(220,38,38,0.95)',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
    pointerEvents: 'none',
    maxWidth: '420px',
    textAlign: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  })
  el.textContent = `NodeShot: ${message}`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 4000)
}

function titleToFilename(title) {
  return (title || '')
    .toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'nodeshot'
}
