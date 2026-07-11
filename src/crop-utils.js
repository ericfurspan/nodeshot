export function applyCropDrag(startRect, handle, dx, dy, imageWidth, imageHeight, minSize = 10) {
  const s = startRect
  const left = s.x
  const top = s.y
  const right = s.x + s.w
  const bottom = s.y + s.h
  const r = { ...s }

  switch (handle) {
    case 'tl':
      r.x = Math.max(0, Math.min(left + dx, right - minSize))
      r.y = Math.max(0, Math.min(top + dy, bottom - minSize))
      r.w = right - r.x
      r.h = bottom - r.y
      break
    case 'tr':
      r.y = Math.max(0, Math.min(top + dy, bottom - minSize))
      r.w = Math.max(minSize, Math.min(s.w + dx, imageWidth - left))
      r.h = bottom - r.y
      break
    case 'bl':
      r.x = Math.max(0, Math.min(left + dx, right - minSize))
      r.w = right - r.x
      r.h = Math.max(minSize, Math.min(s.h + dy, imageHeight - top))
      break
    case 'br':
      r.w = Math.max(minSize, Math.min(s.w + dx, imageWidth - left))
      r.h = Math.max(minSize, Math.min(s.h + dy, imageHeight - top))
      break
    case 'tc':
      r.y = Math.max(0, Math.min(top + dy, bottom - minSize))
      r.h = bottom - r.y
      break
    case 'bc':
      r.h = Math.max(minSize, Math.min(s.h + dy, imageHeight - top))
      break
    case 'ml':
      r.x = Math.max(0, Math.min(left + dx, right - minSize))
      r.w = right - r.x
      break
    case 'mr':
      r.w = Math.max(minSize, Math.min(s.w + dx, imageWidth - left))
      break
  }

  return r
}
