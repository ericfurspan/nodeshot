import { vi, describe, it, expect, beforeEach } from 'vitest'

describe('background: icon click', () => {
  let onClickedCb, onMessageCb

  beforeEach(async () => {
    vi.resetModules()
    onClickedCb = null
    onMessageCb = null

    global.chrome = {
      action: {
        onClicked: { addListener: vi.fn((fn) => { onClickedCb = fn }) },
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
      runtime: {
        onMessage: { addListener: vi.fn((fn) => { onMessageCb = fn }) },
        getURL: vi.fn((p) => `chrome-extension://fakeextid/${p}`),
      },
      storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
      tabs: { captureVisibleTab: vi.fn(), create: vi.fn() },
    }

    await import('../src/background.js')
  })

  it('registers onClicked listener', () => {
    expect(chrome.action.onClicked.addListener).toHaveBeenCalled()
  })

  it('injects content.js into the clicked tab', async () => {
    await onClickedCb({ id: 42, windowId: 1 })
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content.js'],
    })
  })

  it('sets active badge after injection', async () => {
    await onClickedCb({ id: 42, windowId: 1 })
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '●', tabId: 42 })
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#3b82f6',
      tabId: 42,
    })
  })
})

describe('background: messages', () => {
  let onClickedCb, onMessageCb

  beforeEach(async () => {
    vi.resetModules()
    onClickedCb = null
    onMessageCb = null

    global.chrome = {
      action: {
        onClicked: { addListener: vi.fn((fn) => { onClickedCb = fn }) },
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
      runtime: {
        onMessage: { addListener: vi.fn((fn) => { onMessageCb = fn }) },
        getURL: vi.fn((p) => `chrome-extension://fakeextid/${p}`),
      },
      storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
      tabs: { captureVisibleTab: vi.fn(), create: vi.fn() },
    }

    await import('../src/background.js')
  })

  it('clears badge on pickerCancelled', () => {
    onMessageCb({ action: 'pickerCancelled' }, { tab: { id: 42 } })
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 42 })
  })

  it('clears badge and opens preview tab on openPreview', () => {
    onMessageCb({ action: 'openPreview', key: 'abc123' }, { tab: { id: 42 } })
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 42 })
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://fakeextid/preview.html#key=abc123',
    })
  })
})

describe('background: captureViewport', () => {
  let onMessageCb

  beforeEach(async () => {
    vi.resetModules()
    onMessageCb = null

    // Fake screenshot: a 200x100 blue PNG data URL
    const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    // Helper to create a mock blob with arrayBuffer method
    const createMockBlob = () => {
      const blob = new Blob(['fakepng'], { type: 'image/png' })
      blob.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8))
      return blob
    }

    global.OffscreenCanvas = class {
      constructor(w, h) {
        this.width = w
        this.height = h
        this._ctx = {
          drawImage: vi.fn(),
        }
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
        captureVisibleTab: vi.fn().mockResolvedValue(fakeDataUrl),
        create: vi.fn(),
      },
    }

    await import('../src/background.js')
  })

  it('calls captureVisibleTab with sender windowId', async () => {
    await onMessageCb(
      { action: 'captureViewport', key: 'k1', rect: { top: 10, left: 20, width: 100, height: 50 }, devicePixelRatio: 1 },
      { tab: { id: 1, windowId: 5 } },
    )
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledWith(5, { format: 'png' })
  })

  it('scales rect by devicePixelRatio when cropping', async () => {
    let createdW, createdH, drawArgs

    const createMockBlob = () => {
      const blob = new Blob(['x'])
      blob.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8))
      return blob
    }

    global.OffscreenCanvas = class {
      constructor(w, h) {
        createdW = w; createdH = h
        this._ctx = { drawImage: vi.fn((...a) => { drawArgs = a }) }
      }
      getContext() { return this._ctx }
      async convertToBlob() { return createMockBlob() }
    }

    await onMessageCb(
      { action: 'captureViewport', key: 'k2', rect: { top: 10, left: 20, width: 100, height: 50 }, devicePixelRatio: 2 },
      { tab: { id: 1, windowId: 5 } },
    )

    expect(createdW).toBe(200) // 100 * 2
    expect(createdH).toBe(100) // 50 * 2
    expect(drawArgs[1]).toBe(40) // left * dpr
    expect(drawArgs[2]).toBe(20) // top * dpr
  })

  it('stores cropped data URL and opens preview tab', async () => {
    await onMessageCb(
      { action: 'captureViewport', key: 'k3', rect: { top: 0, left: 0, width: 50, height: 50 }, devicePixelRatio: 1 },
      { tab: { id: 1, windowId: 5 } },
    )
    expect(chrome.storage.local.set).toHaveBeenCalled()
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://fakeextid/preview.html#key=k3',
    })
  })
})
