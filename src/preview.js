// src/preview.js
import { PDFDocument } from 'pdf-lib'

let cropController = null

async function init() {
  const params = new URLSearchParams(location.hash.slice(1))
  const key = params.get('key')
  if (!key) {
    showInitError('No capture key found in URL.')
    return
  }

  try {
    const result = await chrome.storage.local.get(key)
    const dataUrl = result[key]
    if (!dataUrl) {
      showInitError('Capture data not found — it may have already been used.')
      return
    }
    await chrome.storage.local.remove(key)

    const image = new Image()
    image.src = dataUrl
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
    })

    const canvas = document.getElementById('crop-canvas')
    cropController = new CropController(canvas, image)

    document.getElementById('loading').style.display = 'none'
    document.getElementById('btn-png').disabled = false
    document.getElementById('btn-pdf').disabled = false

    const filenameEl = document.getElementById('filename')
    if (!filenameEl.value) {
      const ts = Date.now()
      filenameEl.value = `nodeshot-${ts}`
    }

    document.getElementById('btn-png').addEventListener('click', () => savePng(image))
    document.getElementById('btn-pdf').addEventListener('click', () => savePdf(image))
  } catch {
    showInitError('Failed to load capture — please close this tab and try again.')
  }
}

function showInitError(message) {
  const loading = document.getElementById('loading')
  if (!loading) return
  loading.textContent = message
  loading.style.color = '#ef4444'
}

function setStatus(message, isError = false) {
  const el = document.getElementById('status')
  if (!el) return
  el.textContent = message
  el.style.color = isError ? '#ef4444' : ''
  setTimeout(() => { if (el.textContent === message) el.textContent = '' }, 3000)
}

class CropController {
  constructor(canvas, image) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.image = image
    this.cropRect = { x: 0, y: 0, w: image.naturalWidth || image.width, h: image.naturalHeight || image.height }
    this.dragging = null
    this.handleSize = 8

    canvas.width = this.cropRect.w
    canvas.height = this.cropRect.h

    canvas.addEventListener('mousemove', this._onMouseMove.bind(this))
    canvas.addEventListener('mousedown', this._onMouseDown.bind(this))
    canvas.addEventListener('mouseup', this._onMouseUp.bind(this))
    window.addEventListener('mouseup', this._onMouseUp.bind(this))

    this.render()
  }

  get handles() {
    const { x, y, w, h } = this.cropRect
    return {
      tl: { x, y }, tc: { x: x + w / 2, y }, tr: { x: x + w, y },
      ml: { x, y: y + h / 2 }, mr: { x: x + w, y: y + h / 2 },
      bl: { x, y: y + h }, bc: { x: x + w / 2, y: y + h }, br: { x: x + w, y: y + h },
    }
  }

  hitTest(mx, my) {
    const hs = this.handleSize
    for (const [name, { x, y }] of Object.entries(this.handles)) {
      if (Math.abs(mx - x) <= hs && Math.abs(my - y) <= hs) return name
    }
    return null
  }

  _canvasXY(e) {
    const rect = this.canvas.getBoundingClientRect()
    const scaleX = this.canvas.width / rect.width
    const scaleY = this.canvas.height / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  _onMouseMove(e) {
    const { x, y } = this._canvasXY(e)
    const hit = this.hitTest(x, y)
    const cursors = { tl: 'nw-resize', tc: 'n-resize', tr: 'ne-resize', ml: 'w-resize', mr: 'e-resize', bl: 'sw-resize', bc: 's-resize', br: 'se-resize' }
    this.canvas.style.cursor = hit ? (cursors[hit] || 'default') : 'default'
    if (this.dragging) {
      this._applyDrag(x - this.dragging.startX, y - this.dragging.startY)
      this.render()
    }
  }

  _onMouseDown(e) {
    const { x, y } = this._canvasXY(e)
    const hit = this.hitTest(x, y)
    if (hit) this.dragging = { handle: hit, startX: x, startY: y, startRect: { ...this.cropRect } }
  }

  _onMouseUp() { this.dragging = null }

  _applyDrag(dx, dy) {
    const { startRect: s } = this.dragging
    const r = { ...s }
    const imgW = this.image.naturalWidth || this.image.width
    const imgH = this.image.naturalHeight || this.image.height
    const min = 10
    switch (this.dragging.handle) {
      case 'tl': r.x = Math.min(s.x + dx, s.x + s.w - min); r.y = Math.min(s.y + dy, s.y + s.h - min); r.w = s.w - (r.x - s.x); r.h = s.h - (r.y - s.y); break
      case 'tr': r.y = Math.min(s.y + dy, s.y + s.h - min); r.w = Math.max(s.w + dx, min); r.h = s.h - (r.y - s.y); break
      case 'bl': r.x = Math.min(s.x + dx, s.x + s.w - min); r.w = s.w - (r.x - s.x); r.h = Math.max(s.h + dy, min); break
      case 'br': r.w = Math.max(s.w + dx, min); r.h = Math.max(s.h + dy, min); break
      case 'tc': r.y = Math.min(s.y + dy, s.y + s.h - min); r.h = s.h - (r.y - s.y); break
      case 'bc': r.h = Math.max(s.h + dy, min); break
      case 'ml': r.x = Math.min(s.x + dx, s.x + s.w - min); r.w = s.w - (r.x - s.x); break
      case 'mr': r.w = Math.max(s.w + dx, min); break
    }
    r.x = Math.max(0, r.x); r.y = Math.max(0, r.y)
    r.w = Math.min(r.w, imgW - r.x); r.h = Math.min(r.h, imgH - r.y)
    this.cropRect = r
  }

  render() {
    const { ctx, canvas, image } = this
    const { x, y, w, h } = this.cropRect
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, canvas.width, y)
    ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h)
    ctx.fillRect(0, y, x, h)
    ctx.fillRect(x + w, y, canvas.width - x - w, h)
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, w, h)
    const hs = this.handleSize
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 1
    for (const { x: hx, y: hy } of Object.values(this.handles)) {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
      ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs)
    }
  }

  getCropRect() { return { ...this.cropRect } }
}

async function savePng(image) {
  try {
    const rect = cropController.getCropRect()
    const { x, y, w, h } = rect
    const offscreen = new OffscreenCanvas(w, h)
    const ctx = offscreen.getContext('2d')
    ctx.drawImage(image, x, y, w, h, 0, 0, w, h)
    const blob = await offscreen.convertToBlob({ type: 'image/png' })

    const filename = document.getElementById('filename').value || 'nodeshot'
    const handle = await window.showSaveFilePicker({
      suggestedName: `${filename}.png`,
      types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()

    setStatus('Saved PNG')
  } catch (err) {
    if (err.name !== 'AbortError') setStatus('Save failed — please try again.', true)
  }
}

function blobToArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

async function savePdf(image) {
  try {
    const { x, y, w, h } = cropController.getCropRect()
    const offscreen = new OffscreenCanvas(w, h)
    const ctx = offscreen.getContext('2d')
    ctx.drawImage(image, x, y, w, h, 0, 0, w, h)
    const pngBlob = await offscreen.convertToBlob({ type: 'image/png' })
    const pngArrayBuffer = await blobToArrayBuffer(pngBlob)

    const pdfDoc = await PDFDocument.create()
    const pngImage = await pdfDoc.embedPng(pngArrayBuffer)
    const page = pdfDoc.addPage([w, h])
    page.drawImage(pngImage, { x: 0, y: 0, width: w, height: h })

    const pdfBytes = await pdfDoc.save()
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' })

    const filename = document.getElementById('filename').value || 'nodeshot'
    const handle = await window.showSaveFilePicker({
      suggestedName: `${filename}.pdf`,
      types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(pdfBlob)
    await writable.close()

    setStatus('Saved PDF')
  } catch (err) {
    if (err.name !== 'AbortError') setStatus('Save failed — please try again.', true)
  }
}

init()
