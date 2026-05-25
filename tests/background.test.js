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
