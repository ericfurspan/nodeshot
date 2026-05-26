import { vi, describe, it, expect, beforeEach } from 'vitest'

describe('debug test', () => {
  let onMessageCb

  beforeEach(async () => {
    vi.resetModules()
    onMessageCb = null

    const createMockBlob = () => {
      const blob = new Blob(['fakepng'], { type: 'image/png' })
      blob.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8))
      return blob
    }

    global.OffscreenCanvas = class {
      constructor(w, h) {
        console.log('INITIAL OffscreenCanvas constructor called with', w, h)
        this.width = w
        this.height = h
        this._ctx = { drawImage: vi.fn() }
      }
      getContext() { return this._ctx }
      async convertToBlob() { return createMockBlob() }
    }

    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(createMockBlob()),
    })

    global.createImageBitmap = vi.fn().mockResolvedValue({ width: 200, height: 100 })

    global.chrome = {
      action: {
        onClicked: { addListener: vi.fn() },
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
      runtime: {
        onMessage: { addListener: vi.fn((fn) => { onMessageCb = fn }) },
        getURL: vi.fn((p) => `chrome-extension://fakeextid/${p}`),
      },
      storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
      tabs: {
        captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,ABC'),
        create: vi.fn(),
      },
    }

    await import('../src/background.js')
  })

  it('test override', async () => {
    let createdW, createdH, drawArgs

    const createMockBlob = () => {
      const blob = new Blob(['x'])
      blob.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8))
      return blob
    }

    console.log('Before override, global.OffscreenCanvas:', global.OffscreenCanvas.name)

    global.OffscreenCanvas = class {
      constructor(w, h) {
        console.log('OVERRIDE OffscreenCanvas constructor called with', w, h)
        createdW = w
        createdH = h
        this._ctx = { drawImage: vi.fn((...a) => { drawArgs = a }) }
      }
      getContext() { return this._ctx }
      async convertToBlob() { return createMockBlob() }
    }

    console.log('After override, global.OffscreenCanvas:', global.OffscreenCanvas.name)

    await onMessageCb(
      { action: 'captureViewport', key: 'k2', rect: { top: 10, left: 20, width: 100, height: 50 }, devicePixelRatio: 2 },
      { tab: { id: 1, windowId: 5 } },
    )

    console.log('createdW:', createdW, 'createdH:', createdH)
    expect(createdW).toBe(200)
  })
})
