document.documentElement.setAttribute('data-vela-marker', 'content-script');
chrome.runtime.sendMessage({ type: 'ping', n: 1 }, (res) => {
  if (res && res.pong) document.documentElement.setAttribute('data-vela-marker-sw', String(res.n));
});
