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
  cleanup()

  const overlay = document.createElement('div')
  overlay.id = 'nodeshot-overlay'
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'transparent',
  })

  const highlight = document.createElement('div')
  highlight.id = 'nodeshot-highlight'
  Object.assign(highlight.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    border: '2px solid #fff',
    backgroundColor: 'transparent',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.7)',
    display: 'none',
  })

  const banner = document.createElement('div')
  banner.id = 'nodeshot-banner'
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
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
  document.body.appendChild(highlight)
  document.body.appendChild(banner)

  let currentTarget = null
  let shiftHeld = false
  let frozenTarget = null

  // ── Frozen state helpers ──────────────────────────────────────────────────

  function setFrozen(frozen) {
    if (frozen) {
      Object.assign(highlight.style, {
        border: '2px dashed #fff',
        backgroundColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.7)',
      })
      banner.style.borderBottomColor = 'rgba(255,255,255,0.15)'
      banner.innerHTML = `
        <style>@keyframes ns-blink{0%,100%{opacity:1}50%{opacity:.3}}</style>
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fff;margin-right:9px;vertical-align:middle;"></span>Node locked — click to capture · release <span style="font-size:11px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);padding:1px 6px;border-radius:3px;">Shift</span> to resume
      `
    } else {
      Object.assign(highlight.style, {
        border: '2px solid #fff',
        backgroundColor: 'transparent',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.7)',
      })
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

  // ── Event handlers ────────────────────────────────────────────────────────

  function onMouseMove(e) {
    if (shiftHeld) return  // frozen — don't change the selection

    const els = document.elementsFromPoint(e.clientX, e.clientY)
    const target = els.find(
      (el) => el.id !== 'nodeshot-overlay' && el.id !== 'nodeshot-highlight' && el.id !== 'nodeshot-banner',
    )
    if (!target || target === document.body || target === document.documentElement) {
      highlight.style.display = 'none'
      currentTarget = null
      return
    }
    currentTarget = target
    const r = target.getBoundingClientRect()
    Object.assign(highlight.style, {
      display: 'block',
      top: r.top + 'px',
      left: r.left + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
    })
  }

  async function onClick(e) {
    if (!currentTarget) return
    e.preventDefault()
    e.stopPropagation()

    const target = currentTarget
    const key = crypto.randomUUID()

    cleanup()
    showSpinner()
    // Yield to the browser so the spinner paints before html2canvas starts its
    // synchronous DOM traversal — otherwise the spinner never appears until after
    // the heavy work is already done.
    await new Promise((resolve) => setTimeout(resolve, 0))
    try {
      const canvas = await html2canvas(target, { useCORS: true, logging: false })
      const dataUrl = canvas.toDataURL('image/png')
      await chrome.storage.local.set({ [key]: { dataUrl, title: document.title } })
      try {
        chrome.runtime.sendMessage({ action: 'openPreview', key })
      } catch {
        // Extension context may have been invalidated; storage entry is orphaned but harmless
      }
    } catch {
      showError('Capture failed — this page may block screenshots.')
      try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
    } finally {
      removeSpinner()
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup()
      try { chrome.runtime.sendMessage({ action: 'pickerCancelled' }) } catch {}
      return
    }
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

  // Tracks the frozen node's screen position as the page scrolls beneath it.
  function onScroll() {
    if (!frozenTarget) return
    const r = frozenTarget.getBoundingClientRect()
    Object.assign(highlight.style, {
      top: r.top + 'px',
      left: r.left + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
    })
  }

  // Reset frozen state if the window loses focus while Shift is held (e.g. alt-tab).
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
    document.getElementById('nodeshot-highlight')?.remove()
    document.getElementById('nodeshot-banner')?.remove()
    document.getElementById('nodeshot-spinner')?.remove()
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('scroll', onScroll, { capture: true })
    window.removeEventListener('blur', onBlur)
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
