import {
  channel,
  type IpcEventChannel,
  type IpcEventMap,
  type IpcInvokeChannel,
  type IpcInvokeMap,
} from '@vela/shared';
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';

export type Access = 'shell' | 'internal';

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

function allowed(event: IpcMainInvokeEvent | IpcMainEvent, access: Access): boolean {
  if (trustedShell.has(event.sender.id)) return true;
  if (access === 'internal') {
    const url = event.senderFrame?.url ?? '';
    return url.startsWith('vela://') && event.senderFrame?.parent === null;
  }
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
    void fn(req, event);
  });
}

export function emit<K extends IpcEventChannel>(wc: WebContents, name: K, payload: IpcEventMap[K]): void {
  if (wc.isDestroyed()) return;
  wc.send(channel(name), payload);
}
