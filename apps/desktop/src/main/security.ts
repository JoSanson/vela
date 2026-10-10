import { app, desktopCapturer, webContents, type Session } from 'electron';
import type { AppContext } from './context';
import { errorPageUrl } from './tabs/tabManager';

const ALWAYS_ALLOW = new Set([
  'fullscreen',
  'pointerLock',
  'clipboard-sanitized-write',
  'window-management',
  'keyboardLock',
]);
const ALWAYS_DENY = new Set([
  'openExternal',
  'fileSystem',
  'usb',
  'serial',
  'hid',
  'bluetooth',
  'storage-access',
  'top-level-storage-access',
]);

export type PermissionDecider = (
  origin: string,
  permission: string,
  tabWebContentsId: number,
) => Promise<'allow' | 'deny'>;

let decider: PermissionDecider = () => Promise.resolve('deny');

export function setPermissionDecider(fn: PermissionDecider): void {
  decider = fn;
}

export function hardenSession(ses: Session): void {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (ALWAYS_ALLOW.has(permission)) return callback(true);
    if (ALWAYS_DENY.has(permission)) return callback(false);
    const origin = safeOrigin(details.requestingUrl || wc?.getURL() || '');
    if (!origin || !wc) return callback(false);
    if (permission === 'media') {
      // Decide camera and microphone separately so a mic-only grant never implies the camera;
      // stop at the first denial so the user is not asked a second, already-moot question.
      const types = (details as { mediaTypes?: string[] }).mediaTypes ?? ['audio', 'video'];
      const wanted = types.map((t) => (t === 'video' ? 'camera' : 'microphone'));
      void (async () => {
        for (const p of wanted) if ((await decider(origin, p, wc.id)) !== 'allow') return callback(false);
        callback(true);
      })();
      return;
    }
    void decider(origin, permission, wc.id).then((d) => callback(d === 'allow'));
  });
  // getDisplayMedia(): ask once per origin, then share the primary screen.
  ses.setDisplayMediaRequestHandler((request, callback) => {
    const origin = safeOrigin(request.frame?.url ?? '');
    const wcId = request.frame ? webContents.fromFrame(request.frame)?.id : undefined;
    if (!origin || wcId === undefined) return callback({});
    void decider(origin, 'display-capture', wcId).then(async (d) => {
      if (d !== 'allow') return callback({});
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const primary = sources[0];
      if (!primary) return callback({});
      // System audio loopback is only implemented on Windows.
      callback(process.platform === 'win32' ? { video: primary, audio: 'loopback' } : { video: primary });
    });
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    if (ALWAYS_ALLOW.has(permission)) return true;
    if (ALWAYS_DENY.has(permission)) return false;
    const origin = safeOrigin(requestingOrigin);
    if (permission === 'media') {
      const t = (details as { mediaType?: string }).mediaType;
      const key = t === 'video' ? 'camera' : t === 'audio' ? 'microphone' : null;
      return key ? (checkCache.get(`${origin}|${key}`) ?? false) : false;
    }
    return checkCache.get(`${origin}|${permission}`) ?? false;
  });
  ses.setDevicePermissionHandler(() => false);
  ses.setBluetoothPairingHandler?.((_details, callback) => callback({ confirmed: false }));
  // Global Privacy Control: a legally meaningful "do not sell/share" signal (unlike DNT).
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, 'Sec-GPC': '1' } });
  });
}

const checkCache = new Map<string, boolean>();

export function rememberPermission(origin: string, permission: string, allow: boolean): void {
  checkCache.set(`${origin}|${permission}`, allow);
}

export function forgetPermission(origin: string, permission: string): void {
  checkCache.delete(`${origin}|${permission}`);
}

export function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

const pendingMainFrame = new Map<number, string>();

function noFragment(url: string): string {
  const i = url.indexOf('#');
  return i === -1 ? url : url.slice(0, i);
}

export function installAppSecurity(ctx: AppContext): void {
  app.on('web-contents-created', (_e, wc) => {
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) pendingMainFrame.set(wc.id, details.url);
    });
    wc.on('did-redirect-navigation', (details) => {
      if (details.isMainFrame) pendingMainFrame.set(wc.id, details.url);
    });
    wc.once('destroyed', () => pendingMainFrame.delete(wc.id));
    wc.on('will-attach-webview', (e) => e.preventDefault());
    wc.on('will-redirect', (e, url) => {
      if (url.startsWith('file:') || url.startsWith('vela://')) e.preventDefault();
    });
  });

  app.on('certificate-error', (event, wc, url, error, certificate, callback) => {
    if (ctx.tabs.trustedCertificates.has(certificate.fingerprint)) {
      event.preventDefault();
      callback(true);
      return;
    }
    callback(false);
    const tabId = ctx.tabs.tabIdOf(wc);
    if (!tabId) return;
    const fallback = ctx.tabs.fallbackFor(url);
    if (fallback) {
      void wc.loadURL(fallback).catch(() => undefined);
      return;
    }
    // Subresources (iframes, images, XHR) with bad certificates are simply blocked; only a failing
    // main-frame navigation gets the interstitial.
    const pending = noFragment(pendingMainFrame.get(wc.id) ?? '');
    const current = noFragment(wc.getURL());
    if (pending !== noFragment(url) && current !== '' && current !== noFragment(url)) return;
    const detail = JSON.stringify({
      error,
      issuer: certificate.issuerName,
      subject: certificate.subjectName,
      validFrom: certificate.validStart * 1000,
      validTo: certificate.validExpiry * 1000,
      fingerprint: certificate.fingerprint,
    });
    void wc.loadURL(errorPageUrl('cert', url, detail)).catch(() => undefined);
  });
}
