// tests/content.test.js
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
  }),
}))

function freshChrome() {
  return {
    runtime: { sendMessage: vi.fn() },
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
    // window.__nodeShotInjected is now set; re-import should re-activate (not add second overlay)
    vi.resetModules()
    await import('../src/content.js')
    expect(document.querySelectorAll('#nodeshot-overlay').length).toBe(1)
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
