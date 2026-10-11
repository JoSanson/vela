import { hostOf, type Id } from '@vela/core';
import type { WebContents } from 'electron';
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
 * Only YouTube pops out: ads, hero videos and autoplaying clips on ordinary sites stay put.
 * `VELA_AUTOPIP_HOST` adds one host so the e2e suite can exercise the feature on its fixture server.
 */
export function autoPipAllowed(url: string, extraHost = process.env.VELA_AUTOPIP_HOST): boolean {
  const host = hostOf(url);
  if (extraHost && host === extraHost) return true;
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
}

/**
 * Auto Picture-in-Picture: when a YouTube tab with a playing video leaves the screen, the video
 * pops out; it returns to the page when the tab is shown again, and the floating window's
 * "back to tab" button brings the tab back (Chromium asks the delegate to activate the contents,
 * which Electron surfaces as an undocumented `activate` event on the WebContents).
 * `executeJavaScript(code, true)` provides the user gesture Chromium requires.
 */
export function installAutoPip(ctx: AppContext): void {
  const inPip = new Set<Id>();
  const wired = new WeakSet<WebContents>();

  const backToTab = (tabId: Id): void => {
    if (!inPip.has(tabId)) return;
    const tab = ctx.store.state.tabs[tabId];
    if (!tab) return;
    if (tab.spaceId && tab.spaceId !== ctx.store.state.activeSpaceId) ctx.activateSpace(tab.spaceId);
    ctx.store.dispatch({ type: 'tab/activate', id: tabId, now: Date.now() });
    const win = ctx.windows.main?.win;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  };

  ctx.tabs.onVisibilityChange((tabId, visible) => {
    if (!ctx.prefs.value.autoPip) return;
    const wc = ctx.tabs.webContents(tabId);
    const tab = ctx.store.state.tabs[tabId];
    if (!wc || wc.isDestroyed() || !tab) return;
    if (!visible) {
      if (!tab.loaded || tab.sleeping || !autoPipAllowed(wc.getURL())) return;
      if (!wired.has(wc)) {
        wired.add(wc);
        (wc as unknown as { on(event: string, fn: () => void): void }).on('activate', () => backToTab(tabId));
      }
      void wc
        .executeJavaScript(ENTER_PIP, true)
        .then((ok: unknown) => {
          if (ok === true) inPip.add(tabId);
        })
        .catch(() => undefined);
    } else {
      inPip.delete(tabId);
      void wc.executeJavaScript(EXIT_PIP, true).catch(() => undefined);
    }
  });
}
