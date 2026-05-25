chrome.action.onClicked.addListener(async (tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  })
  chrome.action.setBadgeText({ text: '●', tabId: tab.id })
  chrome.action.setBadgeBackgroundColor({ color: '#3b82f6', tabId: tab.id })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // handlers added in subsequent tasks
})
