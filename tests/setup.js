import { vi } from 'vitest'

// jsdom does not implement elementsFromPoint — stub it so spyOn can override it
if (!document.elementsFromPoint) {
  document.elementsFromPoint = () => []
}

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
    getURL: vi.fn((path) => `chrome-extension://fakeextid/${path}`),
  },
  storage: {
    local: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    captureVisibleTab: vi.fn(),
    create: vi.fn(),
  },
}
