// tests/capture.test.js
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toBlob: vi.fn((callback) => callback(new Blob(['png'], { type: 'image/png' }))),
  }),
}))

// Real module except for the colour walk, which is spied on so the onclone wiring
// test can prove it is still called.
vi.mock('../src/color-utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  normalizeDocumentColors: vi.fn(),
}))

import html2canvas from 'html2canvas'
import { normalizeDocumentColors } from '../src/color-utils.js'
import {
  captureElement,
  classifyCaptureError,
  isExpectedCaptureLimit,
  clampNegativeSvgRects,
} from '../src/capture.js'

function svgRect(attrs = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  for (const [k, v] of Object.entries(attrs)) rect.setAttribute(k, v)
  svg.appendChild(rect)
  document.body.appendChild(svg)
  return rect
}

describe('isExpectedCaptureLimit', () => {
  it('trusts the expected flag we set on our own pre-flight errors', () => {
    const err = new Error('anything at all')
    err.expected = true
    expect(isExpectedCaptureLimit(err)).toBe(true)
  })

  // html2canvas exports no typed errors, so its failures can only be matched on
  // message text. Fragile by nature — these lock the substrings we depend on.
  it.each([
    'Unable to find element in cloned iframe',
    'Blocked a frame with origin … cross-origin',
    'Element is no longer in the document.',
  ])('recognises the html2canvas limitation message %#', (message) => {
    expect(isExpectedCaptureLimit(new Error(message))).toBe(true)
  })

  it('treats an unrecognised failure as a defect', () => {
    expect(isExpectedCaptureLimit(new Error('CSP violation: toIFrame blocked'))).toBe(false)
  })

  it('does not throw on a non-Error rejection', () => {
    expect(isExpectedCaptureLimit('some string')).toBe(false)
    expect(isExpectedCaptureLimit(undefined)).toBe(false)
  })
})

describe('classifyCaptureError', () => {
  it('prefers an explanation attached to the error', () => {
    const err = new Error('NotAllowedError')
    err.userMessage = 'Copy failed — Chrome could not write the image to your clipboard.'
    expect(classifyCaptureError(err, 'Copy')).toEqual({
      expected: false,
      message: 'Copy failed — Chrome could not write the image to your clipboard.',
    })
  })

  it('explains an expected limitation that carries no message of its own', () => {
    const err = new Error('Unable to find element in cloned iframe')
    const { expected, message } = classifyCaptureError(err, 'Copy')
    expect(expected).toBe(true)
    expect(message).toContain('cross-origin frame')
  })

  it('falls back to wording for the action in progress', () => {
    const err = new Error('CSP violation: toIFrame blocked')
    expect(classifyCaptureError(err, 'Copy').message).toBe('Copy failed — capture or clipboard error.')
    expect(classifyCaptureError(err, 'Download').message).toBe('Download failed — please try again.')
  })

  it('falls back to a generic message for an unknown action', () => {
    const err = new Error('CSP violation: toIFrame blocked')
    expect(classifyCaptureError(err, 'Fax').message).toBe('Capture failed.')
  })
})

describe('clampNegativeSvgRects', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clamps negative width and height attributes to zero', () => {
    const rect = svgRect({ width: '-12.5', height: '-3' })
    clampNegativeSvgRects(document)
    expect(rect.getAttribute('width')).toBe('0')
    expect(rect.getAttribute('height')).toBe('0')
  })

  it('leaves valid dimensions alone', () => {
    const rect = svgRect({ width: '40', height: '0' })
    clampNegativeSvgRects(document)
    expect(rect.getAttribute('width')).toBe('40')
    expect(rect.getAttribute('height')).toBe('0')
  })

  it('ignores rects with no dimension attributes', () => {
    const rect = svgRect()
    clampNegativeSvgRects(document)
    expect(rect.getAttribute('width')).toBeNull()
    expect(rect.hasAttribute('style')).toBe(false)
  })

  // The negative can come from CSS rather than the attribute — sub-pixel layout and
  // transforms produce these. jsdom computes 'auto' for SVG geometry, so the computed
  // value is stubbed; the element and the inline write it receives are real.
  it('clamps a negative CSS-applied size with an important inline override', () => {
    const rect = svgRect({ width: '40', height: '40' })
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ width: '-8px', height: '-2px' })

    clampNegativeSvgRects(document)

    expect(rect.style.getPropertyValue('width')).toBe('0px')
    expect(rect.style.getPropertyPriority('width')).toBe('important')
    expect(rect.style.getPropertyValue('height')).toBe('0px')
    // The attribute was valid, so it is untouched
    expect(rect.getAttribute('width')).toBe('40')
  })

  it('does nothing for a document with no defaultView', () => {
    expect(() => clampNegativeSvgRects({ defaultView: null })).not.toThrow()
    expect(() => clampNegativeSvgRects(undefined)).not.toThrow()
  })
})

describe('captureElement', () => {
  let target

  beforeEach(() => {
    document.body.innerHTML = ''
    html2canvas.mockClear()
    normalizeDocumentColors.mockClear()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  it('resolves to a PNG blob', async () => {
    const blob = await captureElement(target)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(html2canvas).toHaveBeenCalledWith(target, expect.objectContaining({ useCORS: true }))
  })

  it('rejects when the canvas cannot produce a blob', async () => {
    html2canvas.mockResolvedValueOnce({ toBlob: (cb) => cb(null) })
    await expect(captureElement(target)).rejects.toThrow('toBlob failed')
  })

  it('rejects a detached element before calling html2canvas', async () => {
    target.remove()
    await expect(captureElement(target)).rejects.toMatchObject({ expected: true })
    expect(html2canvas).not.toHaveBeenCalled()
  })

  it('rejects a cross-origin iframe before calling html2canvas', async () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    // Touching contentWindow across origins throws — that is the detection
    Object.defineProperty(iframe, 'contentWindow', {
      get() { throw new Error('Blocked a frame with origin') },
    })

    const err = await captureElement(iframe).catch((e) => e)
    expect(err.expected).toBe(true)
    expect(err.userMessage).toContain('cross-origin frame')
    expect(html2canvas).not.toHaveBeenCalled()
  })

  it('captures a same-origin iframe normally', async () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    await expect(captureElement(iframe)).resolves.toBeInstanceOf(Blob)
  })

  // html2canvas is mocked, so onclone never runs on its own. Without this, either
  // guard could be dropped from the hook and every other test would still pass.
  it('runs both clone guards from the onclone hook', async () => {
    await captureElement(target)
    const [, options] = html2canvas.mock.calls[0]
    expect(typeof options.onclone).toBe('function')

    const rect = svgRect({ width: '-5' })
    options.onclone(document)

    expect(rect.getAttribute('width')).toBe('0')
    expect(normalizeDocumentColors).toHaveBeenCalledWith(document)
  })
})
