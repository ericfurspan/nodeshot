import { PNG } from 'pngjs'
import { writeFileSync } from 'fs'

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return
  const i = (png.width * y + x) << 2
  png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a
}

function createIcon(size) {
  const png = new PNG({ width: size, height: size })

  // Background: dark navy
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPixel(png, x, y, 15, 23, 42)
    }
  }

  const m = Math.max(1, Math.round(size * 0.18))   // margin from edge
  const cl = Math.max(2, Math.round(size * 0.28))   // corner bracket length
  const bw = size <= 24 ? 1 : 2                      // stroke width

  // Draw 4 corner brackets (L-shapes at each corner)
  const corners = [
    { ox: m,         oy: m,         sx: 1,  sy: 1  }, // TL
    { ox: size-1-m,  oy: m,         sx: -1, sy: 1  }, // TR
    { ox: m,         oy: size-1-m,  sx: 1,  sy: -1 }, // BL
    { ox: size-1-m,  oy: size-1-m,  sx: -1, sy: -1 }, // BR
  ]

  for (const { ox, oy, sx, sy } of corners) {
    for (let t = 0; t < bw; t++) {
      // Horizontal arm
      for (let i = 0; i < cl; i++) {
        setPixel(png, ox + i * sx, oy + t * sy, 255, 255, 255)
      }
      // Vertical arm (skip first pixel — already drawn by horizontal)
      for (let i = 1; i < cl; i++) {
        setPixel(png, ox + t * sx, oy + i * sy, 255, 255, 255)
      }
    }
  }

  // Center crosshair dot (blue)
  const cx = Math.floor(size / 2)
  const cy = Math.floor(size / 2)
  const dotR = Math.max(1, Math.round(size * 0.09))
  for (let dy = -dotR; dy <= dotR; dy++) {
    for (let dx = -dotR; dx <= dotR; dx++) {
      if (dx * dx + dy * dy <= dotR * dotR) {
        setPixel(png, cx + dx, cy + dy, 59, 130, 246)
      }
    }
  }

  writeFileSync(`src/assets/icon${size}.png`, PNG.sync.write(png))
  console.log(`Created icon${size}.png`)
}

;[16, 48, 128].forEach(createIcon)
