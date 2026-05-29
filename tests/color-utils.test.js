// tests/color-utils.test.js
import { describe, it, expect } from 'vitest'
import {
  UNSUPPORTED_COLOR_FN,
  COLOR_FN_NAMES,
  replaceUnsupportedColors,
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

describe('UNSUPPORTED_COLOR_FN regex', () => {
  it('matches every CSS Color 4 function we handle', () => {
    expect(UNSUPPORTED_COLOR_FN.test('oklch(0.7 0.15 200)')).toBe(true)
    expect(UNSUPPORTED_COLOR_FN.test('oklab(0.6 0.1 0.1)')).toBe(true)
    expect(UNSUPPORTED_COLOR_FN.test('lab(50% 40 59.5)')).toBe(true)
    expect(UNSUPPORTED_COLOR_FN.test('lch(52.2% 72.2 50)')).toBe(true)
    expect(UNSUPPORTED_COLOR_FN.test('hwb(194 0% 0%)')).toBe(true)
    expect(UNSUPPORTED_COLOR_FN.test('color(display-p3 1 0 0)')).toBe(true)
    expect(UNSUPPORTED_COLOR_FN.test('color-mix(in oklch, red, blue)')).toBe(true)
    expect(UNSUPPORTED_COLOR_FN.test('light-dark(white, black)')).toBe(true)
  })

  it('does not match the colours html2canvas already supports', () => {
    expect(UNSUPPORTED_COLOR_FN.test('rgb(1, 2, 3)')).toBe(false)
    expect(UNSUPPORTED_COLOR_FN.test('rgba(1, 2, 3, 0.5)')).toBe(false)
    expect(UNSUPPORTED_COLOR_FN.test('hsl(200, 50%, 50%)')).toBe(false)
    expect(UNSUPPORTED_COLOR_FN.test('hsla(200, 50%, 50%, 0.5)')).toBe(false)
    expect(UNSUPPORTED_COLOR_FN.test('#aabbcc')).toBe(false)
    expect(UNSUPPORTED_COLOR_FN.test('transparent')).toBe(false)
    expect(UNSUPPORTED_COLOR_FN.test('none')).toBe(false)
  })

  it('orders color-mix before color so the scanner prefers the longer name', () => {
    expect(COLOR_FN_NAMES.indexOf('color-mix')).toBeLessThan(COLOR_FN_NAMES.indexOf('color'))
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

describe('replaceUnsupportedColors — unresolvable tokens', () => {
  it('leaves an unresolvable function untouched and reports the change state', () => {
    // resolve() returns null for unknown values → token left in place, returns null
    // (no successful change) so the caller falls back.
    const input = 'oklch(0.9 0.2 123)' // not in FAKE
    expect(replaceUnsupportedColors(input, resolve)).toBeNull()
  })

  it('keeps resolved tokens and leaves unresolved ones, when mixed', () => {
    const input = 'linear-gradient(oklch(0.7 0.15 200), oklch(0.9 0.2 123))'
    // First stop resolves, second doesn't. Result still contains an oklch(), so the
    // caller's UNSUPPORTED_COLOR_FN re-test will trigger the fallback path.
    const out = replaceUnsupportedColors(input, resolve)
    expect(out).toBe('linear-gradient(rgb(0, 170, 200), oklch(0.9 0.2 123))')
    expect(UNSUPPORTED_COLOR_FN.test(out)).toBe(true)
  })
})
