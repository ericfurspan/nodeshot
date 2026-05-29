// src/color-utils.js
//
// html2canvas's CSS parser only understands rgb/rgba/hsl/hsla. Modern Chrome's
// getComputedStyle returns CSS Color 4 functions (oklch(), color(), oklab(),
// lab(), lch(), hwb(), color-mix(), …) verbatim instead of converting them to
// rgb, so any of those reaching html2canvas throws
// "Attempting to parse an unsupported color function …" and aborts the capture.
//
// Rather than enumerate which functions are unsupported (a list that would have to
// grow every time CSS adds a colour function), detection is keyed on the closed set
// html2canvas *does* support. Any function token outside that set is handed to the
// canvas read-back resolver, which converts ANY colour syntax the browser renders —
// including ones that don't exist yet — to concrete rgb/rgba. A new CSS colour
// function therefore needs no code change here.

// The colour functions html2canvas's own parser handles. This set is defined by
// html2canvas (SUPPORTED_COLOR_FUNCTIONS = rgb/rgba/hsl/hsla) and is stable; it is
// the only function-name list in this module, and it shrinks the maintenance
// surface to zero for new colour syntax.
export const SUPPORTED_COLOR_FN = new Set(['rgb', 'rgba', 'hsl', 'hsla'])

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

// True when a resolved colour string (rgb(...) / rgba(...)) is fully opaque.
// rgb(...) has no alpha channel and is always opaque; rgba(...) is opaque only
// when its alpha component is >= 1.
export function isOpaqueColor(resolved) {
  const m = /^rgba?\(([^)]*)\)/i.exec(resolved || '')
  if (!m) return false
  const parts = m[1].split(',')
  if (parts.length < 4) return true // rgb() — no alpha channel
  return parseFloat(parts[3]) >= 1
}

// Given an ordered list of raw computed background-color strings (typically the
// capture target, then each ancestor, then body and html), returns the first one
// that resolves to a fully opaque colour, as an rgb/rgba string html2canvas can
// parse. Returns null when none are opaque (e.g. a fully translucent page), so the
// caller can apply its own default backdrop.
//
// `resolve` is injectable for testing; defaults to the canvas read-back resolver.
export function firstOpaqueBackgroundColor(rawColors, resolve = resolveColorToRgb) {
  for (const raw of rawColors) {
    if (!raw) continue
    const resolved = resolve(raw)
    if (resolved && isOpaqueColor(resolved)) return resolved
  }
  return null
}

// Returns the CSS function token that starts exactly at index `i` (at an identifier
// boundary), or null. A token is an identifier (letters/digits/_/-) starting with a
// letter, optionally followed by whitespace, then an opening paren; `end` is the
// index just past the balanced closing paren.
function functionTokenAt(str, i) {
  const prev = i > 0 ? str[i - 1] : ''
  if (/[a-zA-Z0-9_-]/.test(prev)) return null   // mid-identifier — not a token start
  if (!/[a-zA-Z]/.test(str[i])) return null      // names begin with a letter
  let j = i
  while (j < str.length && /[a-zA-Z0-9_-]/.test(str[j])) j++
  let k = j
  while (k < str.length && /\s/.test(str[k])) k++
  if (str[k] !== '(') return null
  let depth = 0
  let p = k
  for (; p < str.length; p++) {
    if (str[p] === '(') depth++
    else if (str[p] === ')' && --depth === 0) { p++; break }
  }
  return { name: str.slice(i, j).toLowerCase(), open: k, end: p }
}

// True when `value` contains any function token whose name html2canvas can't parse
// (i.e. anything outside SUPPORTED_COLOR_FN). Generic — no per-colour-name list, so
// it flags current and future CSS colour functions alike. Used to decide whether a
// solid colour still needs a fallback after resolution was attempted.
export function hasUnsupportedColorFn(value) {
  if (!value) return false
  for (let i = 0; i < value.length; i++) {
    const tok = functionTokenAt(value, i)
    if (!tok) continue
    if (!SUPPORTED_COLOR_FN.has(tok.name)) return true
    i = tok.end - 1
  }
  return false
}

// Walks `value`, rewriting every colour function html2canvas can't parse — anywhere,
// including nested inside compound/shorthand values like gradients and shadows — to
// the rgb/rgba the browser renders. Detection is generic: any function token outside
// SUPPORTED_COLOR_FN is sent to the resolver. When the resolver can't turn a token
// into a colour (a container like linear-gradient()/url()/calc(), or a value the
// canvas can't parse), its wrapper is kept and its arguments are scanned recursively,
// so gradient stops and other nested colours are still resolved.
//
// `resolve` is injectable for testing; defaults to the canvas read-back resolver.
// Returns the rewritten string, or null when nothing was changed.
export function replaceUnsupportedColors(value, resolve = resolveColorToRgb) {
  if (!value) return null
  let changed = false

  const scan = (str) => {
    let out = ''
    let i = 0
    while (i < str.length) {
      const tok = functionTokenAt(str, i)
      if (!tok) {
        out += str[i]
        i++
        continue
      }
      const fnStr = str.slice(i, tok.end)
      if (SUPPORTED_COLOR_FN.has(tok.name)) {
        out += fnStr // html2canvas handles it — leave untouched
      } else {
        const rgb = resolve(fnStr)
        if (rgb) {
          out += rgb
          changed = true
        } else {
          // Not a standalone colour (gradient/url/calc/…) or unresolvable: keep the
          // wrapper and recurse into the arguments to resolve any nested colours.
          out += str.slice(i, tok.open + 1) + scan(str.slice(tok.open + 1, tok.end - 1)) + ')'
        }
      }
      i = tok.end
    }
    return out
  }

  const result = scan(value)
  return changed ? result : null
}
