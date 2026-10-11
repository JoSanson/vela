import {
  channel,
  type IpcEventChannel,
  type IpcEventMap,
  type IpcInvokeChannel,
  type IpcInvokeMap,
} from '@vela/shared';
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';

export type Access = 'shell' | 'internal' | 'page';

type Handler<K extends IpcInvokeChannel> = (
  req: IpcInvokeMap[K]['req'],
  event: IpcMainInvokeEvent | IpcMainEvent,
) => IpcInvokeMap[K]['res'] | Promise<IpcInvokeMap[K]['res']>;

const trustedShell = new Set<number>();

/** Marks a WebContents (shell, overlay, little shell) as fully trusted for IPC. */
export function trustShell(wc: WebContents): void {
  trustedShell.add(wc.id);
  wc.once('destroyed', () => trustedShell.delete(wc.id));
}

export function isTrustedShell(wc: WebContents): boolean {
  return trustedShell.has(wc.id);
}

const pageSenders = new Set<number>();

/** Tab WebContents may use the few `page` channels (login-form detection); never popups or views. */
export function trustPage(wc: WebContents): void {
  pageSenders.add(wc.id);
  wc.once('destroyed', () => pageSenders.delete(wc.id));
}

/** The origin a `page` request really comes from (top-level frame URL, never the payload). */
export function pageOrigin(event: IpcMainInvokeEvent | IpcMainEvent): string | null {
  const url = event.senderFrame?.url ?? '';
  if (!/^https?:/i.test(url)) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function allowed(event: IpcMainInvokeEvent | IpcMainEvent, access: Access): boolean {
  if (trustedShell.has(event.sender.id)) return true;
  if (access === 'internal') {
    const url = event.senderFrame?.url ?? '';
    return url.startsWith('vela://') && event.senderFrame?.parent === null;
  }
  if (access === 'page') return pageSenders.has(event.sender.id) && event.senderFrame?.parent === null;
  return false;
}

/** Registers a request/response handler (ipcMain.handle) plus a fire-and-forget variant (ipcMain.on). */
export function handle<K extends IpcInvokeChannel>(name: K, access: Access, fn: Handler<K>): void {
  const ch = channel(name);
  ipcMain.handle(ch, (event, req: IpcInvokeMap[K]['req']) => {
    if (!allowed(event, access)) throw new Error(`ipc: ${name} denied for sender ${event.sender.id}`);
    return fn(req, event);
  });
  ipcMain.on(ch, (event, req: IpcInvokeMap[K]['req']) => {
    if (!allowed(event, access)) return;
    try {
      void Promise.resolve(fn(req, event)).catch((err: unknown) => console.error(`ipc ${name}`, err));
    } catch (err) {
      console.error(`ipc ${name}`, err);
    }
  });
}

export function emit<K extends IpcEventChannel>(wc: WebContents, name: K, payload: IpcEventMap[K]): void {
  if (wc.isDestroyed()) return;
  wc.send(channel(name), payload);
}
