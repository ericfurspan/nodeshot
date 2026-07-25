import { vi, describe, it, expect, beforeEach } from 'vitest'

function makeChrome({ sendMessageRejects = true } = {}) {
  return {
    action: {
      onClicked: { addListener: vi.fn((fn) => { globalThis._onClickedCb = fn }) },
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    runtime: {
      id: 'fakeextid',
      onMessage: { addListener: vi.fn((fn) => { globalThis._onMessageCb = fn }) },
    },
    tabs: {
      sendMessage: sendMessageRejects
        ? vi.fn().mockRejectedValue(new Error('no listener'))
        : vi.fn().mockResolvedValue(undefined),
    },
  }
}

describe('background: icon click — first injection', () => {
  beforeEach(async () => {
    vi.resetModules()
    globalThis._onClickedCb = null
    globalThis._onMessageCb = null
    global.chrome = makeChrome({ sendMessageRejects: true })
    await import('../src/background.js')
  })

  it('registers onClicked listener', () => {
    expect(chrome.action.onClicked.addListener).toHaveBeenCalled()
  })

  it('tries sendMessage before executeScript', async () => {
    await globalThis._onClickedCb({ id: 42 })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { action: 'activate' })
  })

  it('injects content.js when sendMessage fails (no content script)', async () => {
    await globalThis._onClickedCb({ id: 42 })
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content.js'],
    })
  })

  it('sets active badge after injection', async () => {
    await globalThis._onClickedCb({ id: 42 })
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '●', tabId: 42 })
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#3b82f6',
      tabId: 42,
    })
  })
})

describe('background: icon click — reactivation via sendMessage', () => {
  beforeEach(async () => {
    vi.resetModules()
    globalThis._onClickedCb = null
    global.chrome = makeChrome({ sendMessageRejects: false })
    await import('../src/background.js')
  })

  it('does not call executeScript when sendMessage succeeds', async () => {
    await globalThis._onClickedCb({ id: 42 })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { action: 'activate' })
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })

  it('still sets the badge when reactivating', async () => {
    await globalThis._onClickedCb({ id: 42 })
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '●', tabId: 42 })
  })
})

describe('background: messages', () => {
  beforeEach(async () => {
    vi.resetModules()
    globalThis._onMessageCb = null
    global.chrome = makeChrome({ sendMessageRejects: true })
    await import('../src/background.js')
  })

  it('clears badge on pickerCancelled', () => {
    globalThis._onMessageCb({ action: 'pickerCancelled' }, { id: 'fakeextid', tab: { id: 42 } })
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 42 })
  })

  it('does not throw when setBadgeText fails on pickerCancelled', () => {
    chrome.action.setBadgeText = vi.fn().mockImplementation(() => { throw new Error('tab closed') })
    expect(() =>
      globalThis._onMessageCb({ action: 'pickerCancelled' }, { id: 'fakeextid', tab: { id: 42 } }),
    ).not.toThrow()
  })

  // Driven through pickerCancelled — the only handled message. The identical call
  // with sender.id === 'fakeextid' clears the badge (see the first test in this
  // group), so a no-op here is the sender check doing its job, not a dead path.
  it('ignores messages whose sender.id does not match the extension id', () => {
    globalThis._onMessageCb({ action: 'pickerCancelled' }, { id: 'other-extension', tab: { id: 42 } })
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled()
  })

  it('ignores messages with no sender.id', () => {
    globalThis._onMessageCb({ action: 'pickerCancelled' }, { tab: { id: 42 } })
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled()
  })
})

describe('background: icon click — badge failure resilience', () => {
  beforeEach(async () => {
    vi.resetModules()
    globalThis._onClickedCb = null
    global.chrome = makeChrome({ sendMessageRejects: false })
    await import('../src/background.js')
  })

  it('does not throw when setBadgeText fails after successful activation', async () => {
    chrome.action.setBadgeText = vi.fn().mockImplementation(() => { throw new Error('tab closed') })
    await expect(globalThis._onClickedCb({ id: 42 })).resolves.not.toThrow()
  })
})
