chrome.action.onClicked.addListener(async (tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  })
  chrome.action.setBadgeText({ text: '●', tabId: tab.id })
  chrome.action.setBadgeBackgroundColor({ color: '#3b82f6', tabId: tab.id })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id

  if (message.action === 'pickerCancelled') {
    chrome.action.setBadgeText({ text: '', tabId })
    return
  }

  if (message.action === 'openPreview') {
    chrome.action.setBadgeText({ text: '', tabId })
    chrome.tabs.create({
      url: chrome.runtime.getURL(`preview.html#key=${message.key}`),
    })
    return
  }

  if (message.action === 'captureViewport') {
    handleCaptureViewport(message, sender)
    return true
  }
})

async function handleCaptureViewport(message, sender) {
  // implemented in next task
}

async function blobToDataUrl(blob) {
  const ab = await blob.arrayBuffer()
  const bytes = new Uint8Array(ab)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:image/png;base64,${btoa(binary)}`
}
