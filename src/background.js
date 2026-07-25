chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'activate' })
  } catch {
    // Content script not yet injected — inject it (first click, or after page reload)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      })
    } catch {
      // Cannot inject into this tab (chrome://, extension pages, etc.) — bail out silently
      return
    }
  }
  try {
    chrome.action.setBadgeText({ text: '●', tabId: tab.id })
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6', tabId: tab.id })
  } catch {
    // Tab may have closed between click and badge update
  }
})

chrome.runtime.onMessage.addListener((message, sender) => {
  // Reject any message whose sender isn't this extension. Legitimate runtime
  // messages from our own content scripts and extension pages always carry
  // sender.id === chrome.runtime.id, so a missing or mismatched id means the
  // message did not originate from us — drop it.
  if (sender.id !== chrome.runtime.id) return

  const tabId = sender.tab?.id

  if (message.action === 'pickerCancelled') {
    try { chrome.action.setBadgeText({ text: '', tabId }) } catch {}
  }
})
