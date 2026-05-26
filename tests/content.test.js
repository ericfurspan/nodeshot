// tests/content.test.js
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
  }),
}))

function freshChrome() {
  return {
    runtime: {
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
    },
    storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
  }
}

describe('content: picker activation', () => {
  beforeEach(async () => {
    document.body.innerHTML = ''
    delete window.__nodeShotInjected
    global.chrome = freshChrome()
    vi.resetModules()
    await import('../src/content.js')
  })

  it('creates overlay element', () => {
    expect(document.getElementById('nodeshot-overlay')).not.toBeNull()
  })

  it('creates highlight element with pointer-events none', () => {
    const el = document.getElementById('nodeshot-highlight')
    expect(el).not.toBeNull()
    expect(el.style.pointerEvents).toBe('none')
  })

  it('creates banner with instruction text', () => {
    const el = document.getElementById('nodeshot-banner')
    expect(el).not.toBeNull()
    expect(el.textContent).toContain('NodeShot')
    expect(el.textContent).toContain('Esc')
  })

  it('does not double-initialise on re-injection', async () => {
    // window.__nodeShotInjected is now set; re-import should be a no-op
    vi.resetModules()
    await import('../src/content.js')
    expect(document.querySelectorAll('#nodeshot-overlay').length).toBe(1)
  })

  it('reactivates picker when activate message is received', async () => {
    // Simulate capture cleanup — remove picker elements
    document.getElementById('nodeshot-overlay')?.remove()
    document.getElementById('nodeshot-highlight')?.remove()
    document.getElementById('nodeshot-banner')?.remove()

    // Grab the message listener registered in beforeEach
    const [messageListener] = chrome.runtime.onMessage.addListener.mock.calls[0]
    messageListener({ action: 'activate' })

    expect(document.getElementById('nodeshot-overlay')).not.toBeNull()
  })
})

describe('content: element detection', () => {
  beforeEach(async () => {
    document.body.innerHTML = ''
    delete window.__nodeShotInjected
    global.chrome = freshChrome()
    vi.resetModules()
    await import('../src/content.js')
  })

  it('updates highlight position on mousemove over a page element', () => {
    const target = document.createElement('div')
    target.id = 'page-target'
    document.body.appendChild(target)

    const overlay = document.getElementById('nodeshot-overlay')
    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([overlay, target])
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      { top: 10, left: 20, width: 150, height: 60 },
    )

    overlay.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 30 }))

    const highlight = document.getElementById('nodeshot-highlight')
    expect(highlight.style.display).toBe('block')
    expect(highlight.style.top).toBe('10px')
    expect(highlight.style.left).toBe('20px')
    expect(highlight.style.width).toBe('150px')
    expect(highlight.style.height).toBe('60px')
  })

  it('hides highlight when hovering overlay itself', () => {
    const overlay = document.getElementById('nodeshot-overlay')
    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([overlay])

    overlay.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 0 }))

    expect(document.getElementById('nodeshot-highlight').style.display).toBe('none')
  })
})

describe('content: Escape cancellation', () => {
  beforeEach(async () => {
    document.body.innerHTML = ''
    delete window.__nodeShotInjected
    global.chrome = freshChrome()
    vi.resetModules()
    await import('../src/content.js')
  })

  it('removes all picker elements on Escape', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.getElementById('nodeshot-overlay')).toBeNull()
    expect(document.getElementById('nodeshot-highlight')).toBeNull()
    expect(document.getElementById('nodeshot-banner')).toBeNull()
  })

  it('sends pickerCancelled message on Escape', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'pickerCancelled' })
  })
})

describe('content: full-render capture (click)', () => {
  let mockHtml2canvas

  beforeEach(async () => {
    document.body.innerHTML = ''
    delete window.__nodeShotInjected
    global.chrome = freshChrome()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-1234')

    vi.resetModules()
    const h2c = await import('html2canvas')
    mockHtml2canvas = h2c.default

    await import('../src/content.js')
  })

  it('stores data URL and sends openPreview on click', async () => {
    const target = document.createElement('div')
    document.body.appendChild(target)

    const overlay = document.getElementById('nodeshot-overlay')
    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([overlay, target])
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      { top: 0, left: 0, width: 100, height: 100 },
    )

    // Hover to set currentTarget
    overlay.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }))
    // Click without shift
    overlay.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 50, shiftKey: false }))

    // Wait for html2canvas promise
    await new Promise((r) => setTimeout(r, 0))

    expect(mockHtml2canvas).toHaveBeenCalledWith(target, expect.objectContaining({ useCORS: true }))
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      'test-uuid-1234': 'data:image/png;base64,fake',
    })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'openPreview',
      key: 'test-uuid-1234',
    })
  })
})
