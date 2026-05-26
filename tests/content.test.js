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
