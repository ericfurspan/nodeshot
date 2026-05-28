// src/content.js
import html2canvas from 'html2canvas'

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
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'transparent',
  })

  // ── Reticle — visual selection indicator (not captured by html2canvas) ───

  const reticle = document.createElement('div')
  reticle.id = 'nodeshot-reticle'
  Object.assign(reticle.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    display: 'none',
    backgroundColor: 'transparent',
  })

  // Corner brackets: TL, TR, BL, BR
  const cornerDefs = [
    { top: '0', left: '0',  borderTop: '2px solid #fff', borderLeft: '2px solid #fff'   },
    { top: '0', right: '0', borderTop: '2px solid #fff', borderRight: '2px solid #fff'  },
    { bottom: '0', left: '0',  borderBottom: '2px solid #fff', borderLeft: '2px solid #fff'  },
    { bottom: '0', right: '0', borderBottom: '2px solid #fff', borderRight: '2px solid #fff' },
  ]
  const cornerSides = [
    ['borderTop', 'borderLeft'],
    ['borderTop', 'borderRight'],
    ['borderBottom', 'borderLeft'],
    ['borderBottom', 'borderRight'],
  ]
  const cornerEls = cornerDefs.map((styles) => {
    const el = document.createElement('div')
    Object.assign(el.style, { position: 'absolute', width: '12px', height: '12px', ...styles })
    reticle.appendChild(el)
    return el
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
    borderBottom: '1px solid rgba(96,165,250,0.25)',
    letterSpacing: '0.01em',
  })
  setBannerNormal()

  document.body.appendChild(overlay)
  document.body.appendChild(reticle)
  document.body.appendChild(banner)

  let currentTarget = null
  let shiftHeld = false
  let frozenTarget = null

  // ── Reticle helpers ───────────────────────────────────────────────────────

  function positionReticle(r) {
    Object.assign(reticle.style, {
      display: 'block',
      top: r.top + 'px', left: r.left + 'px',
      width: r.width + 'px', height: r.height + 'px',
    })
  }

  // ── Frozen state helpers ──────────────────────────────────────────────────

  function setFrozen(frozen) {
    const cs = frozen ? '15px' : '12px'
    const bw = frozen ? '2.5px' : '2px'
    cornerEls.forEach((el, i) => {
      el.style.width = cs
      el.style.height = cs
      cornerSides[i].forEach(side => { el.style[side] = `${bw} solid #fff` })
    })
    const alpha = frozen ? '0.85' : '0.45'
    crossH.style.background = `rgba(255,255,255,${alpha})`
    crossV.style.background = `rgba(255,255,255,${alpha})`
    centerDot.style.width  = frozen ? '8px' : '6px'
    centerDot.style.height = frozen ? '8px' : '6px'
    reticle.style.backgroundColor = frozen ? 'rgba(255,45,120,0.07)' : 'transparent'

    if (frozen) {
      banner.style.borderBottomColor = 'rgba(255,255,255,0.15)'
      banner.innerHTML = `
        <style>@keyframes ns-blink{0%,100%{opacity:1}50%{opacity:.3}}</style>
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fff;margin-right:9px;vertical-align:middle;"></span>Node locked — click to capture · release <span style="font-size:11px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);padding:1px 6px;border-radius:3px;">Shift</span> to resume
      `
    } else {
      banner.style.borderBottomColor = 'rgba(96,165,250,0.25)'
      setBannerNormal()
    }
  }

  function setBannerNormal() {
    banner.innerHTML = `
      <style>@keyframes ns-blink{0%,100%{opacity:1}50%{opacity:.3}}</style>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#60a5fa;margin-right:9px;vertical-align:middle;animation:ns-blink 2s ease-in-out infinite;"></span>NodeShot — hover to select, click to capture · <span style="font-size:11px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);padding:1px 6px;border-radius:3px;">Esc</span> to cancel
    `
  }

  // ── Capture helper ────────────────────────────────────────────────────────

  function captureElement(target) {
    return html2canvas(target, {
      useCORS: true,
      logging: false,
      scrollX: window.pageXOffset,
      scrollY: window.pageYOffset,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    })
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
    } catch {
      showError('Copy failed — clipboard access denied.')
      try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
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
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${titleToFilename(document.title)}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      showError('Download failed — please try again.')
      try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
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
      try {
        chrome.runtime.sendMessage({ action: 'openPreview', key })
      } catch {}
    } catch {
      showError('Capture failed — this page may block screenshots.')
      try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
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
        icon: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="5" width="8" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M3 11V3a1 1 0 011-1h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        handler: () => handleCopy(target),
      },
      {
        id: 'ns-btn-download',
        label: 'PNG',
        icon: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2v7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`,
        handler: () => handleDownload(target),
      },
      {
        id: 'ns-btn-crop',
        label: 'CROP',
        icon: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 1v3M1 4h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M12 1v3M9 4h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M4 15v-3M1 12h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M12 15v-3M9 12h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`,
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
      btn.innerHTML = icon
      btn.appendChild(Object.assign(document.createElement('span'), { textContent: label }))
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
    const target = els.find(
      el => el.id !== 'nodeshot-overlay' && el.id !== 'nodeshot-reticle' && el.id !== 'nodeshot-banner',
    )
    if (!target || target === document.body || target === document.documentElement) {
      reticle.style.display = 'none'
      currentTarget = null
      return
    }
    currentTarget = target
    positionReticle(target.getBoundingClientRect())
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
    document.getElementById('nodeshot-overlay')?.remove()
    document.getElementById('nodeshot-reticle')?.remove()
    document.getElementById('nodeshot-banner')?.remove()
    document.getElementById('nodeshot-dialog')?.remove()
    document.getElementById('nodeshot-spinner')?.remove()
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

function showSpinner() {
  const el = document.createElement('div')
  el.id = 'nodeshot-spinner'
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
  el.innerHTML = `
    <div style="text-align:center">
      <div style="
        width:32px;height:32px;border:3px solid rgba(255,255,255,0.3);
        border-top-color:#fff;border-radius:50%;animation:ns-spin 0.8s linear infinite;
        margin:0 auto 12px;
      "></div>
      <style>@keyframes ns-spin{to{transform:rotate(360deg)}}</style>
      Capturing…
    </div>
  `
  document.body.appendChild(el)
}

function removeSpinner() {
  document.getElementById('nodeshot-spinner')?.remove()
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
