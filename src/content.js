// src/content.js
import html2canvas from 'html2canvas'

if (window.__nodeShotInjected) {
  activatePicker()
} else {
  window.__nodeShotInjected = true
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
    border: '2px solid #3b82f6',
    backgroundColor: 'rgba(59,130,246,0.1)',
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
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    padding: '8px 16px',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
  })
  banner.textContent =
    'NodeShot — click to capture, Shift+click for viewport crop, Esc to cancel'

  document.body.appendChild(overlay)
  document.body.appendChild(highlight)
  document.body.appendChild(banner)

  let currentTarget = null

  function onMouseMove(e) {
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
    const rect = target.getBoundingClientRect()
    const key = crypto.randomUUID()

    cleanup()

    if (e.shiftKey) {
      chrome.runtime.sendMessage({
        action: 'captureViewport',
        key,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        devicePixelRatio: window.devicePixelRatio,
      })
    } else {
      showSpinner()
      try {
        const canvas = await html2canvas(target, { useCORS: true, logging: false })
        const dataUrl = canvas.toDataURL('image/png')
        await chrome.storage.local.set({ [key]: dataUrl })
        chrome.runtime.sendMessage({ action: 'openPreview', key })
      } finally {
        removeSpinner()
      }
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup()
      chrome.runtime.sendMessage({ action: 'pickerCancelled' })
    }
  }

  overlay.addEventListener('mousemove', onMouseMove)
  overlay.addEventListener('click', onClick)
  document.addEventListener('keydown', onKeyDown)

  function cleanup() {
    document.getElementById('nodeshot-overlay')?.remove()
    document.getElementById('nodeshot-highlight')?.remove()
    document.getElementById('nodeshot-banner')?.remove()
    document.getElementById('nodeshot-spinner')?.remove()
    document.removeEventListener('keydown', onKeyDown)
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
