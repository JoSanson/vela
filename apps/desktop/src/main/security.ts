import { app, type Session } from 'electron';
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
    void decider(origin, permission, wc.id).then((d) => callback(d === 'allow'));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (ALWAYS_ALLOW.has(permission)) return true;
    if (ALWAYS_DENY.has(permission)) return false;
    return checkCache.get(`${safeOrigin(requestingOrigin)}|${permission}`) ?? false;
  });
  ses.setDevicePermissionHandler(() => false);
  ses.setBluetoothPairingHandler?.((_details, callback) => callback({ confirmed: false }));
  ses.setPreloads?.([]);
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

export function installAppSecurity(ctx: AppContext): void {
  app.on('web-contents-created', (_e, wc) => {
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
