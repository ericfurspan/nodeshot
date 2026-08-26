// Renders src/assets/icon{16,32,48,128}.png from a single parameterised vector
// master. Chrome rasterises the SVG, which is what buys real anti-aliasing and a
// true alpha channel; the previous hand-rolled pixel loop could produce neither.
//
// Chrome Web Store icon spec (developer.chrome.com/docs/webstore/images):
//   - the 128 icon's artwork is 96x96 inside 16px of transparent padding
//   - no edge drawn against the outer 128x128 bounds
//   - the mark has to hold up on light and dark backgrounds
// Toolbar sizes (16, 32) are deliberately full-bleed instead: Chrome renders them
// inside its own button padding, so padding them again just shrinks the mark.

import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PNG } from 'pngjs'

const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const NAVY = '#0f172a'
const WHITE = '#ffffff'
const BLUE = '#3b82f6'
// The badge is darker than a dark Chrome toolbar, so its silhouette would vanish
// there. A hairline lighter edge separates it, and stays invisible against the
// light store background. The spec's "no edge" rule is about the 128x128 bounds,
// which the transparent padding still honours. Skipped below 24px, where a 1px
// edge is a sixth of the badge and closes up the reticle instead of framing it.
const EDGE = 'rgba(255,255,255,0.22)'
const EDGE_MIN_BADGE = 24

// size -> { badge, pad }. Store sizes get the spec's transparent padding, toolbar
// sizes fill their box.
const TARGETS = [
  { size: 16, badge: 16, pad: 0 },
  { size: 32, badge: 32, pad: 0 },
  { size: 48, badge: 36, pad: 6 },
  { size: 128, badge: 96, pad: 16 },
]

// The reticle is optically scaled. Weights are fractions of the bracket square
// rather than the badge, so the mark keeps a consistent look as the badge shrinks;
// the two smaller tiers then thicken it further, or it dissolves at toolbar size.
const TIERS = {
  xs: { inset: 0.11, arm: 0.32, stroke: 0.115, dot: 0.115 },
  sm: { inset: 0.13, arm: 0.3, stroke: 0.085, dot: 0.115 },
  lg: { inset: 0.15, arm: 0.3, stroke: 0.055, dot: 0.1 },
}

function reticleMetrics(badge) {
  const tier = badge <= 20 ? TIERS.xs : badge <= 40 ? TIERS.sm : TIERS.lg
  const inset = badge * tier.inset
  const square = badge - inset * 2
  return {
    inset,
    arm: square * tier.arm,
    stroke: square * tier.stroke,
    dot: square * tier.dot,
  }
}

function buildSvg({ size, badge, pad }) {
  const { inset, arm, stroke, dot } = reticleMetrics(badge)
  const r = badge * 0.22
  const near = pad + inset
  const far = pad + badge - inset
  const c = pad + badge / 2
  const f = (n) => Number(n.toFixed(3))

  const brackets = [
    `M${f(near)} ${f(near + arm)}V${f(near)}H${f(near + arm)}`,
    `M${f(far - arm)} ${f(near)}H${f(far)}V${f(near + arm)}`,
    `M${f(near)} ${f(far - arm)}V${f(far)}H${f(near + arm)}`,
    `M${f(far - arm)} ${f(far)}H${f(far)}V${f(far - arm)}`,
  ]

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${badge >= EDGE_MIN_BADGE
    ? `<rect x="${f(pad + 0.5)}" y="${f(pad + 0.5)}" width="${f(badge - 1)}" height="${f(badge - 1)}" rx="${f(r)}" fill="${NAVY}" stroke="${EDGE}" stroke-width="1"/>`
    : `<rect x="${f(pad)}" y="${f(pad)}" width="${badge}" height="${badge}" rx="${f(r)}" fill="${NAVY}"/>`}
  <g fill="none" stroke="${WHITE}" stroke-width="${f(stroke)}" stroke-linecap="butt">
    ${brackets.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <circle cx="${f(c)}" cy="${f(c)}" r="${f(dot)}" fill="${BLUE}"/>
</svg>`
}

// Fails loudly rather than silently shipping a flat, un-antialiased icon again.
// The padding assertion is the store spec itself: a 128 icon must be 96x96 of
// artwork centred in 16px of transparency.
function verify(path, { size, badge, pad }) {
  const png = PNG.sync.read(readFileSync(path))
  if (png.width !== size || png.height !== size) {
    throw new Error(`${path}: expected ${size}x${size}, got ${png.width}x${png.height}`)
  }

  let minX = size, minY = size, maxX = -1, maxY = -1
  const alphas = new Set()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = png.data[((size * y + x) << 2) + 3]
      alphas.add(a)
      if (a > 8) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  const width = maxX - minX + 1
  const height = maxY - minY + 1
  if (minX !== pad || minY !== pad || width !== badge || height !== badge) {
    throw new Error(
      `${path}: expected ${badge}x${badge} of artwork at ${pad}px padding, `
      + `got ${width}x${height} at (${minX},${minY})`
    )
  }

  if (alphas.size < 3) {
    throw new Error(`${path}: only ${alphas.size} alpha levels, edges are not anti-aliased`)
  }
}

const work = mkdtempSync(join(tmpdir(), 'nodesnip-icons-'))
try {
  for (const target of TARGETS) {
    const svg = join(work, `icon${target.size}.svg`)
    const out = `src/assets/icon${target.size}.png`
    writeFileSync(svg, buildSvg(target))

    execFileSync(CHROME, [
      '--headless',
      '--disable-gpu',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      `--window-size=${target.size},${target.size}`,
      `--screenshot=${out}`,
      `file://${svg}`,
    ], { stdio: 'ignore' })

    verify(out, target)
    console.log(`Created ${out}`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
