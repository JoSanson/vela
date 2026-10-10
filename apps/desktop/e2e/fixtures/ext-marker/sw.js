chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'ping') {
    chrome.storage.local
      .set({ pinged: (msg.n || 0) + 1 })
      .then(() => sendResponse({ pong: true, n: (msg.n || 0) + 1 }));
    return true;
  }
  return false;
});
