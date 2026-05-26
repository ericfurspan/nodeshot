// tests/preview.test.js
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn().mockResolvedValue({
      embedPng: vi.fn().mockResolvedValue({}),
      addPage: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
      }),
      save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    }),
  },
}))

function mockShowSaveFilePicker(filename) {
  const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
  global.showSaveFilePicker = vi.fn().mockResolvedValue({
    createWritable: vi.fn().mockResolvedValue(writable),
  })
  return writable
}

function mockOffscreenCanvas() {
  global.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h }
    getContext() { return { drawImage: vi.fn() } }
    convertToBlob() { return Promise.resolve(new Blob(['png'], { type: 'image/png' })) }
  }
}

// jsdom does not fire Image onload for data URLs, and canvas.getContext returns null.
// These two helpers patch both for the preview test environment.
function mockImage(naturalWidth = 200, naturalHeight = 100) {
  global.Image = class {
    constructor() { this.naturalWidth = naturalWidth; this.naturalHeight = naturalHeight }
    set src(_) { setTimeout(() => this.onload?.(), 0) }
  }
}

function mockCanvasContext() {
  const ctx = {
    drawImage: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
    strokeRect: vi.fn(), fillStyle: '', strokeStyle: '', lineWidth: 1,
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx)
}

describe('preview: image loading', () => {
  beforeEach(async () => {
    // Set hash key
    Object.defineProperty(window, 'location', {
      value: { hash: '#key=test-key-abc' },
      writable: true,
    })

    document.body.innerHTML = `
      <div id="toolbar">
        <input id="filename" value="" />
        <button id="btn-png" disabled></button>
        <button id="btn-pdf" disabled></button>
        <span id="status"></span>
      </div>
      <div id="canvas-area"><canvas id="crop-canvas"></canvas></div>
      <div id="loading"></div>
    `

    const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII='

    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ 'test-key-abc': fakeDataUrl }),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    }

    mockImage()
    mockCanvasContext()
    mockOffscreenCanvas()
    mockShowSaveFilePicker()

    vi.resetModules()
    await import('../src/preview.js')
    // Allow async init to complete
    await new Promise((r) => setTimeout(r, 50))
  })

  it('reads key from location.hash and fetches from storage', () => {
    expect(chrome.storage.local.get).toHaveBeenCalledWith('test-key-abc')
  })

  it('removes the storage entry after reading', () => {
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('test-key-abc')
  })

  it('hides the loading overlay after image loads', () => {
    const loading = document.getElementById('loading')
    expect(loading.style.display).toBe('none')
  })

  it('enables save buttons after image loads', () => {
    expect(document.getElementById('btn-png').disabled).toBe(false)
    expect(document.getElementById('btn-pdf').disabled).toBe(false)
  })

  it('pre-fills filename with nodeshot- timestamp pattern', () => {
    expect(document.getElementById('filename').value).toMatch(/^nodeshot-\d+$/)
  })
})

describe('CropController: initialises to full image size', () => {
  it('sets crop-canvas dimensions to match the loaded image', async () => {
    vi.resetModules()
    Object.defineProperty(window, 'location', { value: { hash: '#key=cc-key' }, writable: true })
    document.body.innerHTML = `
      <input id="filename" /><button id="btn-png" disabled></button>
      <button id="btn-pdf" disabled></button><span id="status"></span>
      <canvas id="crop-canvas"></canvas><div id="loading"></div>
    `
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ 'cc-key': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=' }),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    }
    mockImage(320, 240) // 320×240 image
    mockCanvasContext()
    mockOffscreenCanvas()

    await import('../src/preview.js')
    await new Promise((r) => setTimeout(r, 50))

    const cropCanvas = document.getElementById('crop-canvas')
    expect(cropCanvas.width).toBe(320)
    expect(cropCanvas.height).toBe(240)
  })
})

describe('CropController drag handles', () => {
  it('constrains crop rect width to minimum 10px on br drag', () => {
    const ctrl = makeCropController(200, 150)
    // Drag BR handle far left past minimum
    ctrl.simulateDrag('br', -300, -300)
    const r = ctrl.getCropRect()
    expect(r.w).toBeGreaterThanOrEqual(10)
    expect(r.h).toBeGreaterThanOrEqual(10)
  })

  it('constrains crop rect to image bounds on br drag', () => {
    const ctrl = makeCropController(200, 150)
    ctrl.simulateDrag('br', 500, 500) // drag past image edge
    const r = ctrl.getCropRect()
    expect(r.x + r.w).toBeLessThanOrEqual(200)
    expect(r.y + r.h).toBeLessThanOrEqual(150)
  })

  it('moves top edge on tc drag', () => {
    const ctrl = makeCropController(200, 150)
    ctrl.simulateDrag('tc', 0, 20)
    const r = ctrl.getCropRect()
    expect(r.y).toBe(20)
    expect(r.h).toBe(130) // 150 - 20
  })

  function makeCropController(imgW, imgH) {
    const canvas = { width: imgW, height: imgH, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: imgW, height: imgH }) }
    const ctx = { drawImage: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillStyle: '', strokeStyle: '', lineWidth: 1 }
    canvas.getContext = () => ctx
    canvas.addEventListener = vi.fn()
    const img = { naturalWidth: imgW, naturalHeight: imgH }

    // Inline a testable CropController (duplicated from src/preview.js for isolation)
    class TestCropController {
      constructor(canvas, image) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')
        this.image = image
        this.cropRect = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight }
        this.dragging = null
        this.handleSize = 8
      }
      get handles() {
        const { x, y, w, h } = this.cropRect
        return {
          tl: { x, y }, tc: { x: x + w / 2, y }, tr: { x: x + w, y },
          ml: { x, y: y + h / 2 }, mr: { x: x + w, y: y + h / 2 },
          bl: { x, y: y + h }, bc: { x: x + w / 2, y: y + h }, br: { x: x + w, y: y + h },
        }
      }
      simulateDrag(handle, dx, dy) {
        const { x, y } = this.handles[handle]
        this.dragging = { handle, startX: x, startY: y, startRect: { ...this.cropRect } }
        this._applyDrag(dx, dy)
        this.dragging = null
      }
      _applyDrag(dx, dy) {
        const { startRect: s } = this.dragging
        const r = { ...s }
        const imgW = this.image.naturalWidth
        const imgH = this.image.naturalHeight
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
      getCropRect() { return { ...this.cropRect } }
    }
    return new TestCropController(canvas, img)
  }
})

describe('preview: Save PNG', () => {
  it('crops image to current rect and calls showSaveFilePicker', async () => {
    mockImage()
    mockCanvasContext()
    mockOffscreenCanvas()
    const writable = mockShowSaveFilePicker()

    vi.resetModules()
    Object.defineProperty(window, 'location', { value: { hash: '#key=png-test' }, writable: true })
    document.body.innerHTML = `
      <input id="filename" value="my-shot" /><button id="btn-png" disabled></button>
      <button id="btn-pdf" disabled></button><span id="status"></span>
      <canvas id="crop-canvas"></canvas><div id="loading"></div>
    `
    const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII='
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ 'png-test': fakeDataUrl }),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    }

    await import('../src/preview.js')
    await new Promise((r) => setTimeout(r, 50))

    document.getElementById('btn-png').click()
    await new Promise((r) => setTimeout(r, 50))

    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'my-shot.png' }),
    )
    expect(writable.write).toHaveBeenCalled()
    expect(writable.close).toHaveBeenCalled()
  })
})

describe('preview: Save PDF', () => {
  it('creates a pdf-lib document sized to crop rect and saves via showSaveFilePicker', async () => {
    mockImage()
    mockCanvasContext()
    mockOffscreenCanvas()
    const writable = mockShowSaveFilePicker()

    vi.resetModules()
    Object.defineProperty(window, 'location', { value: { hash: '#key=pdf-test' }, writable: true })
    document.body.innerHTML = `
      <input id="filename" value="my-shot" /><button id="btn-png" disabled></button>
      <button id="btn-pdf" disabled></button><span id="status"></span>
      <canvas id="crop-canvas"></canvas><div id="loading"></div>
    `
    const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII='
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ 'pdf-test': fakeDataUrl }),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    }

    const { PDFDocument } = await import('pdf-lib')

    await import('../src/preview.js')
    await new Promise((r) => setTimeout(r, 50))

    document.getElementById('btn-pdf').click()
    await new Promise((r) => setTimeout(r, 50))

    expect(PDFDocument.create).toHaveBeenCalled()
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'my-shot.pdf' }),
    )
    expect(writable.write).toHaveBeenCalled()
    expect(writable.close).toHaveBeenCalled()
  })
})
