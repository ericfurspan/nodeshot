import { PNG } from 'pngjs'
import { writeFileSync } from 'fs'

function createIcon(size) {
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2
      png.data[i]     = 30   // R
      png.data[i + 1] = 100  // G
      png.data[i + 2] = 220  // B
      png.data[i + 3] = 255  // A
    }
  }
  writeFileSync(`src/assets/icon${size}.png`, PNG.sync.write(png))
  console.log(`Created icon${size}.png`)
}

;[16, 48, 128].forEach(createIcon)
