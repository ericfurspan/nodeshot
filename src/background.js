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
    return handleCaptureViewport(message, sender)
  }
})

async function handleCaptureViewport({ key, rect, devicePixelRatio }, sender) {
  const dpr = devicePixelRatio || 1
  const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })

  const blob = await fetch(dataUrl).then((r) => r.blob())
  const img = await createImageBitmap(blob)

  const cropX = Math.round(rect.left * dpr)
  const cropY = Math.round(rect.top * dpr)
  const cropW = Math.round(rect.width * dpr)
  const cropH = Math.round(rect.height * dpr)

  const canvas = new OffscreenCanvas(cropW, cropH)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

  const cropped = await canvas.convertToBlob({ type: 'image/png' })
  const croppedDataUrl = await blobToDataUrl(cropped)

  await chrome.storage.local.set({ [key]: croppedDataUrl })
  chrome.action.setBadgeText({ text: '', tabId: sender.tab.id })
  chrome.tabs.create({ url: chrome.runtime.getURL(`preview.html#key=${key}`) })
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
