import { vi } from 'vitest'

// jsdom does not implement elementsFromPoint — stub it so spyOn can override it
if (!document.elementsFromPoint) {
  document.elementsFromPoint = () => []
}

// jsdom's canvas has no 2d context — provide the minimum surface used by the
// canvas read-back in color-utils.
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  _fillStyle: '#000000',
  get fillStyle() { return this._fillStyle },
  set fillStyle(value) { this._fillStyle = value },
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })),
}))

global.chrome = {
  action: {
    onClicked: { addListener: vi.fn() },
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([]),
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
  },
}
