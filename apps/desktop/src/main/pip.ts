import type { AppContext } from './context';

const ENTER_PIP = `(async () => {
  const videos = [...document.querySelectorAll('video')].filter(v => !v.paused && !v.ended && v.readyState > 2 && v.videoWidth > 0);
  const v = videos.sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight)[0];
  if (!v || !document.pictureInPictureEnabled || v.disablePictureInPicture) return false;
  if (document.pictureInPictureElement === v) return true;
  try { await v.requestPictureInPicture(); window.__velaAutoPip = true; return true; } catch { return false; }
})()`;

const EXIT_PIP = `(async () => {
  if (window.__velaAutoPip && document.pictureInPictureElement) {
    try { await document.exitPictureInPicture(); } catch {}
  }
  window.__velaAutoPip = false;
  return true;
})()`;

/**
 * Auto Picture-in-Picture: when a tab with a playing video leaves the screen, the video pops out;
 * it returns to the page when the tab is shown again. `executeJavaScript(code, true)` provides the
 * user gesture Chromium requires for `requestPictureInPicture`.
 */
export function installAutoPip(ctx: AppContext): void {
  ctx.tabs.onVisibilityChange((tabId, visible) => {
    if (!ctx.prefs.value.autoPip) return;
    const wc = ctx.tabs.webContents(tabId);
    const tab = ctx.store.state.tabs[tabId];
    if (!wc || wc.isDestroyed() || !tab) return;
    if (!visible) {
      if (!tab.loaded || tab.sleeping) return;
      void wc.executeJavaScript(ENTER_PIP, true).catch(() => undefined);
    } else {
      void wc.executeJavaScript(EXIT_PIP, true).catch(() => undefined);
    }
  });
}
