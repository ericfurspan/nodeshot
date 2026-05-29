// src/color-utils.js
//
// html2canvas's CSS parser only understands rgb/rgba/hsl/hsla. Modern Chrome's
// getComputedStyle returns CSS Color 4 functions (oklch(), color(), oklab(),
// lab(), lch(), hwb(), color-mix(), light-dark()) verbatim instead of converting
// them to rgb, so any of those reaching html2canvas throws
// "Attempting to parse an unsupported color function …" and aborts the capture.
//
// These helpers convert those functions to the concrete rgb/rgba the browser
// actually renders, in place, so compound values (gradients, shadows) keep working.

// Quick test: does a value string contain any unsupported colour function?
export const UNSUPPORTED_COLOR_FN =
  /\b(?:color-mix|light-dark|oklch|oklab|lch|lab|hwb|color)\s*\(/i

// Function names we resolve, ordered longest/most-specific first so the scanner
// matches `color-mix(` before `color(`.
export const COLOR_FN_NAMES = ['color-mix', 'light-dark', 'oklch', 'oklab', 'lch', 'lab', 'hwb', 'color']

// Resolves a single CSS colour value (which may be a Color 4 function) to the
// concrete rgb/rgba the browser paints, via a 1×1 canvas read-back. Returns null
// when the canvas can't parse it either, so callers can fall back.
let _colorCtx
export function resolveColorToRgb(value) {
  if (_colorCtx === undefined) {
    try {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      _colorCtx = c.getContext('2d', { willReadFrequently: true }) || null
    } catch {
      _colorCtx = null
    }
  }
  const ctx = _colorCtx
  if (!ctx) return null

  // Assigning an invalid value to fillStyle is a no-op (the previous value sticks),
  // so probe parse-ability with two different sentinels. A function-syntax colour
  // serialises back as a function string, never equal to the hex sentinel, so it
  // passes the first check immediately; only legacy values that serialise to hex
  // need the second probe. If neither sentinel changes, the value was rejected by
  // the canvas and is unresolvable.
  ctx.fillStyle = '#000000'
  ctx.fillStyle = value
  if (ctx.fillStyle === '#000000') {
    ctx.fillStyle = '#ffffff'
    ctx.fillStyle = value
    if (ctx.fillStyle === '#ffffff') return null
  }

  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  let r, g, b, a
  try {
    ;[r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  } catch {
    return null // getImageData unavailable (shouldn't happen for a same-origin canvas)
  }
  return a === 255
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`
}

// True when an unsupported colour function starts at index `i` in `value`
// (the name is immediately followed, ignoring spaces, by an opening paren).
function colorFnNameAt(value, i) {
  for (const name of COLOR_FN_NAMES) {
    if (value.slice(i, i + name.length).toLowerCase() !== name) continue
    let j = i + name.length
    while (j < value.length && /\s/.test(value[j])) j++
    if (value[j] === '(') return name
  }
  return null
}

// Walks `value`, replacing every unsupported colour function — including those
// nested inside compound/shorthand values like gradients and shadows — with the
// rgb/rgba the browser renders. Nested parens are balanced correctly, so
// color-mix(in oklch, oklch(…), …) is resolved as one unit.
//
// `resolve` is injectable for testing; defaults to the canvas read-back resolver.
// Returns the rewritten string, or null when nothing was changed.
export function replaceUnsupportedColors(value, resolve = resolveColorToRgb) {
  if (!value) return null
  let out = ''
  let i = 0
  let changed = false

  while (i < value.length) {
    const prev = i > 0 ? value[i - 1] : ''
    // Only attempt a match at an identifier boundary so we don't match `lab`
    // inside `oklab` or `color` inside `color-mix`.
    const name = /[a-z0-9-]/i.test(prev) ? null : colorFnNameAt(value, i)

    if (name) {
      const parenStart = value.indexOf('(', i)
      let depth = 0
      let k = parenStart
      for (; k < value.length; k++) {
        if (value[k] === '(') depth++
        else if (value[k] === ')' && --depth === 0) { k++; break }
      }
      const fnStr = value.slice(i, k)
      const rgb = resolve(fnStr)
      if (rgb) {
        out += rgb
        changed = true
      } else {
        out += fnStr // leave unresolved function untouched; caller handles fallback
      }
      i = k
    } else {
      out += value[i]
      i++
    }
  }

  return changed ? out : null
}
