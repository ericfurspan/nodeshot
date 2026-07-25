// tests/color-utils.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  SUPPORTED_COLOR_FN,
  hasUnsupportedColorFn,
  replaceUnsupportedColors,
  isOpaqueColor,
  firstOpaqueBackgroundColor,
  normalizeDocumentColors,
} from '../src/color-utils.js'

// A deterministic stand-in for the canvas read-back resolver. Maps a few known
// colour functions to fixed rgb so the scanner can be tested without a real canvas.
// Returns null for anything it doesn't know, exercising the fallback path.
const FAKE = {
  'oklch(0.7 0.15 200)': 'rgb(0, 170, 200)',
  'oklch(1 0 0)': 'rgb(255, 255, 255)',
  'oklch(0 0 0)': 'rgb(0, 0, 0)',
  'oklch(0.5 0.1 30 / 0.5)': 'rgba(180, 90, 90, 0.5)',
  'oklab(0.6 0.1 0.1)': 'rgb(150, 120, 90)',
  'lab(50% 40 59.5)': 'rgb(200, 80, 60)',
  'lch(52.2% 72.2 50)': 'rgb(210, 90, 40)',
  'hwb(194 0% 0%)': 'rgb(0, 195, 255)',
  'color(display-p3 1 0 0)': 'rgb(255, 0, 0)',
  'color-mix(in oklch, oklch(0.7 0.15 200), white)': 'rgb(128, 213, 228)',
}
const resolve = (v) => FAKE[v] ?? null

describe('hasUnsupportedColorFn (generic detection)', () => {
  it('flags every CSS Color 4 function — by exclusion, not an allowlist', () => {
    expect(hasUnsupportedColorFn('oklch(0.7 0.15 200)')).toBe(true)
    expect(hasUnsupportedColorFn('oklab(0.6 0.1 0.1)')).toBe(true)
    expect(hasUnsupportedColorFn('lab(50% 40 59.5)')).toBe(true)
    expect(hasUnsupportedColorFn('lch(52.2% 72.2 50)')).toBe(true)
    expect(hasUnsupportedColorFn('hwb(194 0% 0%)')).toBe(true)
    expect(hasUnsupportedColorFn('color(display-p3 1 0 0)')).toBe(true)
    expect(hasUnsupportedColorFn('color-mix(in oklch, red, blue)')).toBe(true)
    expect(hasUnsupportedColorFn('light-dark(white, black)')).toBe(true)
  })

  it('flags a brand-new / unknown colour function with no code change', () => {
    // The whole point of the generalization: a function nobody enumerated.
    expect(hasUnsupportedColorFn('superduper(1 2 3)')).toBe(true)
    expect(hasUnsupportedColorFn('oklchv2(0.7 0.15 200 / 0.5)')).toBe(true)
  })

  it('does not flag the colours html2canvas already supports', () => {
    expect(hasUnsupportedColorFn('rgb(1, 2, 3)')).toBe(false)
    expect(hasUnsupportedColorFn('rgba(1, 2, 3, 0.5)')).toBe(false)
    expect(hasUnsupportedColorFn('hsl(200, 50%, 50%)')).toBe(false)
    expect(hasUnsupportedColorFn('hsla(200, 50%, 50%, 0.5)')).toBe(false)
    expect(hasUnsupportedColorFn('#aabbcc')).toBe(false)
    expect(hasUnsupportedColorFn('transparent')).toBe(false)
    expect(hasUnsupportedColorFn('none')).toBe(false)
    expect(hasUnsupportedColorFn('')).toBe(false)
  })

  it('SUPPORTED_COLOR_FN is exactly html2canvas\'s parser set', () => {
    expect([...SUPPORTED_COLOR_FN].sort()).toEqual(['hsl', 'hsla', 'rgb', 'rgba'])
  })
})

describe('replaceUnsupportedColors — generality (no name allowlist)', () => {
  it('resolves an unknown/future colour function the code has never heard of', () => {
    const r = (v) => (v.startsWith('superduper(') ? 'rgb(1, 2, 3)' : null)
    expect(replaceUnsupportedColors('superduper(42 99 7)', r)).toBe('rgb(1, 2, 3)')
  })

  it('leaves rgb/rgba/hsl/hsla untouched (no change, returns null)', () => {
    expect(replaceUnsupportedColors('rgb(1, 2, 3)', resolve)).toBeNull()
    expect(replaceUnsupportedColors('rgba(1, 2, 3, 0.5)', resolve)).toBeNull()
    expect(replaceUnsupportedColors('hsl(200, 50%, 50%)', resolve)).toBeNull()
    expect(replaceUnsupportedColors('hsla(200, 50%, 50%, 0.5)', resolve)).toBeNull()
  })

  it('preserves url() and resolves only nested colours in containers', () => {
    // url() can't resolve to a colour → wrapper kept, contents unchanged → null.
    expect(replaceUnsupportedColors('url(http://example.com/a.png)', resolve)).toBeNull()
    // gradient container kept, oklch stop resolved, plain keyword preserved.
    expect(
      replaceUnsupportedColors('linear-gradient(oklch(0.7 0.15 200), red)', resolve),
    ).toBe('linear-gradient(rgb(0, 170, 200), red)')
  })
})

describe('replaceUnsupportedColors — plain colour values', () => {
  it('resolves a bare oklch() to rgb', () => {
    expect(replaceUnsupportedColors('oklch(0.7 0.15 200)', resolve)).toBe('rgb(0, 170, 200)')
  })

  it('resolves oklch with an alpha channel to rgba', () => {
    expect(replaceUnsupportedColors('oklch(0.5 0.1 30 / 0.5)', resolve)).toBe('rgba(180, 90, 90, 0.5)')
  })

  it('resolves oklab / lab / lch / hwb / color()', () => {
    expect(replaceUnsupportedColors('oklab(0.6 0.1 0.1)', resolve)).toBe('rgb(150, 120, 90)')
    expect(replaceUnsupportedColors('lab(50% 40 59.5)', resolve)).toBe('rgb(200, 80, 60)')
    expect(replaceUnsupportedColors('lch(52.2% 72.2 50)', resolve)).toBe('rgb(210, 90, 40)')
    expect(replaceUnsupportedColors('hwb(194 0% 0%)', resolve)).toBe('rgb(0, 195, 255)')
    expect(replaceUnsupportedColors('color(display-p3 1 0 0)', resolve)).toBe('rgb(255, 0, 0)')
  })

  it('returns null when the value has no unsupported function (no change)', () => {
    expect(replaceUnsupportedColors('rgb(1, 2, 3)', resolve)).toBeNull()
    expect(replaceUnsupportedColors('#aabbcc', resolve)).toBeNull()
    expect(replaceUnsupportedColors('none', resolve)).toBeNull()
  })
})

describe('replaceUnsupportedColors — compound / shorthand values', () => {
  it('resolves both stops of a linear-gradient in place', () => {
    const input = 'linear-gradient(90deg, oklch(0.7 0.15 200), oklch(1 0 0))'
    expect(replaceUnsupportedColors(input, resolve)).toBe(
      'linear-gradient(90deg, rgb(0, 170, 200), rgb(255, 255, 255))',
    )
  })

  it('resolves a box-shadow colour while keeping the offsets/blur', () => {
    const input = '0px 4px 6px oklch(0 0 0)'
    expect(replaceUnsupportedColors(input, resolve)).toBe('0px 4px 6px rgb(0, 0, 0)')
  })

  it('resolves multiple comma-separated shadows', () => {
    const input = '0 1px 2px oklch(0 0 0), 0 2px 4px oklch(0.7 0.15 200)'
    expect(replaceUnsupportedColors(input, resolve)).toBe(
      '0 1px 2px rgb(0, 0, 0), 0 2px 4px rgb(0, 170, 200)',
    )
  })

  it('resolves a nested color-mix() as a single unit (balanced parens)', () => {
    const input = 'color-mix(in oklch, oklch(0.7 0.15 200), white)'
    expect(replaceUnsupportedColors(input, resolve)).toBe('rgb(128, 213, 228)')
  })

  it('does not match `lab` inside `oklab` or `color` inside `color-mix`', () => {
    // oklab resolves as one token; there is no stray lab() left behind.
    expect(replaceUnsupportedColors('oklab(0.6 0.1 0.1)', resolve)).toBe('rgb(150, 120, 90)')
  })
})

describe('isOpaqueColor', () => {
  it('treats rgb() (no alpha channel) as opaque', () => {
    expect(isOpaqueColor('rgb(20, 20, 30)')).toBe(true)
    expect(isOpaqueColor('rgb(0, 0, 0)')).toBe(true)
  })

  it('treats rgba() with alpha >= 1 as opaque', () => {
    expect(isOpaqueColor('rgba(20, 20, 30, 1)')).toBe(true)
  })

  it('treats rgba() with alpha < 1 as not opaque', () => {
    expect(isOpaqueColor('rgba(20, 20, 30, 0.5)')).toBe(false)
    expect(isOpaqueColor('rgba(0, 0, 0, 0)')).toBe(false)
  })

  it('treats unparseable / empty values as not opaque', () => {
    expect(isOpaqueColor('')).toBe(false)
    expect(isOpaqueColor(null)).toBe(false)
    expect(isOpaqueColor('transparent')).toBe(false)
  })
})

describe('firstOpaqueBackgroundColor', () => {
  // Fake resolver: identity for rgb/rgba (those are what getComputedStyle yields
  // for background-color), null for anything it can't handle.
  const resolve = (v) => (/^rgba?\(/i.test(v) ? v : null)

  it('returns the first opaque colour, skipping translucent/transparent ancestors', () => {
    // target translucent → wrapper transparent → body opaque dark
    const colors = ['rgba(20, 20, 30, 0.5)', 'rgba(0, 0, 0, 0)', 'rgb(10, 10, 12)']
    expect(firstOpaqueBackgroundColor(colors, resolve)).toBe('rgb(10, 10, 12)')
  })

  it('returns the target\'s own colour when it is already opaque', () => {
    const colors = ['rgb(255, 255, 255)', 'rgb(10, 10, 12)']
    expect(firstOpaqueBackgroundColor(colors, resolve)).toBe('rgb(255, 255, 255)')
  })

  it('returns null when every ancestor is transparent or translucent', () => {
    const colors = ['rgba(0, 0, 0, 0)', 'rgba(20, 20, 30, 0.3)', 'rgba(0, 0, 0, 0)']
    expect(firstOpaqueBackgroundColor(colors, resolve)).toBeNull()
  })

  it('skips entries the resolver can\'t handle and empty values', () => {
    const colors = ['', 'not-a-color', 'rgb(7, 8, 9)']
    expect(firstOpaqueBackgroundColor(colors, resolve)).toBe('rgb(7, 8, 9)')
  })

  it('resolves Color 4 ancestor backgrounds via the injected resolver', () => {
    // A page whose body background is authored in oklch: the resolver converts it,
    // and the result is used as the opaque backdrop.
    const oklchResolve = (v) => (v === 'oklch(0.15 0 0)' ? 'rgb(10, 10, 12)' : resolve(v))
    const colors = ['rgba(0, 0, 0, 0)', 'oklch(0.15 0 0)']
    expect(firstOpaqueBackgroundColor(colors, oklchResolve)).toBe('rgb(10, 10, 12)')
  })
})

describe('replaceUnsupportedColors — unresolvable tokens', () => {
  it('leaves an unresolvable function untouched and reports the change state', () => {
    // resolve() returns null for unknown values → token left in place, returns null
    // (no successful change) so the caller falls back.
    const input = 'oklch(0.9 0.2 123)' // not in FAKE
    expect(replaceUnsupportedColors(input, resolve)).toBeNull()
  })

  it('keeps resolved tokens and leaves unresolved ones, when mixed', () => {
    const input = 'linear-gradient(oklch(0.7 0.15 200), oklch(0.9 0.2 123))'
    // First stop resolves, second doesn't. Result still contains an oklch(), which
    // hasUnsupportedColorFn detects (for solid props this triggers the fallback path).
    const out = replaceUnsupportedColors(input, resolve)
    expect(out).toBe('linear-gradient(rgb(0, 170, 200), oklch(0.9 0.2 123))')
    expect(hasUnsupportedColorFn(out)).toBe(true)
  })
})

// The policy half: which properties are colour-bearing, and what gets written when a
// colour can't be resolved. This is what html2canvas's onclone hook runs, and what
// breaks first when a Chrome release ships a new colour function.
describe('normalizeDocumentColors — document walk', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function div(styleText) {
    const el = document.createElement('div')
    el.setAttribute('style', styleText)
    document.body.appendChild(el)
    return el
  }

  it('rewrites an unsupported solid colour to the rgb the browser renders', () => {
    const el = div('background-color: oklch(0.7 0.15 200)')
    normalizeDocumentColors(document, resolve)
    expect(el.style.getPropertyValue('background-color')).toBe('rgb(0, 170, 200)')
    // Written with !important so page stylesheets can't win it back in the clone
    expect(el.style.getPropertyPriority('background-color')).toBe('important')
  })

  it('covers every solid colour-bearing property html2canvas parses', () => {
    const props = [
      'color', 'background-color',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
      'text-decoration-color', '-webkit-text-stroke-color',
    ]
    const el = div(props.map((p) => `${p}: oklch(0.7 0.15 200)`).join('; '))
    normalizeDocumentColors(document, resolve)
    for (const prop of props) {
      expect(el.style.getPropertyValue(prop), prop).toBe('rgb(0, 170, 200)')
    }
  })

  it('leaves values html2canvas already understands untouched', () => {
    const el = div('color: rgb(1, 2, 3); background-color: hsl(10, 20%, 30%)')
    const before = el.getAttribute('style')
    normalizeDocumentColors(document, resolve)
    expect(el.getAttribute('style')).toBe(before)
  })

  it('leaves an unresolvable solid colour untouched rather than guessing', () => {
    // Nothing in the value could be resolved, so there is no partial rewrite to
    // finish — the capture-level error path owns this case.
    const el = div('background-color: oklch(0.9 0.2 123)') // not in FAKE
    normalizeDocumentColors(document, resolve)
    expect(el.style.getPropertyValue('background-color')).toBe('oklch(0.9 0.2 123)')
  })

  it('rewrites colours nested in compound values, keeping the container', () => {
    const el = div('background-image: linear-gradient(oklch(0.7 0.15 200), red)')
    normalizeDocumentColors(document, resolve)
    expect(el.style.getPropertyValue('background-image'))
      .toBe('linear-gradient(rgb(0, 170, 200), red)')
  })

  it('rewrites shadow colours', () => {
    const el = div('box-shadow: 0 0 4px oklch(0.7 0.15 200)')
    normalizeDocumentColors(document, resolve)
    expect(el.style.getPropertyValue('box-shadow')).toBe('0 0 4px rgb(0, 170, 200)')
  })

  it('leaves SVG paint alone — html2canvas rasterises inline SVG via the browser', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('fill', 'oklch(0.7 0.15 200)')
    rect.style.setProperty('stroke', 'oklch(0.7 0.15 200)')
    svg.appendChild(rect)
    document.body.appendChild(svg)

    normalizeDocumentColors(document, resolve)

    expect(rect.getAttribute('fill')).toBe('oklch(0.7 0.15 200)')
    expect(rect.style.getPropertyValue('stroke')).toBe('oklch(0.7 0.15 200)')
  })

  it('does not throw on a document with no defaultView', () => {
    expect(() => normalizeDocumentColors({ defaultView: null }, resolve)).not.toThrow()
    expect(() => normalizeDocumentColors(undefined, resolve)).not.toThrow()
  })
})

// The fallback branch needs a computed value that keeps an unresolvable colour
// function after a partial rewrite. jsdom's getComputedStyle collapses nested colour
// functions (color-mix(in srgb, oklch(…), white) comes back as color(srgb …)), so it
// can't produce one — Chrome can. Stub the computed style, keep the elements real, so
// what's asserted is still a real inline-style write.
describe('normalizeDocumentColors — unresolvable-colour fallback', () => {
  let el

  beforeEach(() => {
    document.body.innerHTML = ''
    el = document.createElement('div')
    document.body.appendChild(el)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Serves `value` for `prop` on our element only; every other property/element
  // reads as empty so the walk skips it.
  function stubComputed(prop, value) {
    vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => ({
      getPropertyValue: (p) => (target === el && p === prop ? value : ''),
    }))
  }

  // One stop resolves, the container doesn't — the rewrite is partial, so an
  // unsupported function survives into the value html2canvas would parse.
  const PARTIAL = 'color-mix(in srgb, oklch(0.7 0.15 200), oklch(0.9 0.2 123))'

  it('falls back to black for foreground colours', () => {
    stubComputed('color', PARTIAL)
    normalizeDocumentColors(document, resolve)
    // '#000000' is written; jsdom serialises hex to rgb() on the way back out
    expect(el.style.getPropertyValue('color')).toBe('rgb(0, 0, 0)')
  })

  it('falls back to transparent for background and border colours', () => {
    stubComputed('background-color', PARTIAL)
    normalizeDocumentColors(document, resolve)
    expect(el.style.getPropertyValue('background-color')).toBe('transparent')

    el.removeAttribute('style')
    stubComputed('border-top-color', PARTIAL)
    normalizeDocumentColors(document, resolve)
    expect(el.style.getPropertyValue('border-top-color')).toBe('transparent')
  })

  it('never applies a placeholder to compound properties', () => {
    // A gradient or url() must survive: the partial rewrite is kept as-is, and an
    // unresolved token is left for the capture-level error path.
    stubComputed('background-image', `linear-gradient(${PARTIAL}, red)`)
    normalizeDocumentColors(document, resolve)
    expect(el.style.getPropertyValue('background-image'))
      .toBe('linear-gradient(color-mix(in srgb, rgb(0, 170, 200), oklch(0.9 0.2 123)), red)')
  })
})
