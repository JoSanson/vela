import type { IpcEventChannel, IpcEventMap, IpcInvokeChannel, IpcInvokeMap, VelaBridge } from '@vela/shared';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action';

// Inlined on purpose: a sandboxed preload must be a single file with no shared chunks.
const channel = (name: string): string => `vela:${name}`;

const bridge: VelaBridge = {
  platform: process.platform as VelaBridge['platform'],
  invoke<K extends IpcInvokeChannel>(ch: K, req: IpcInvokeMap[K]['req']): Promise<IpcInvokeMap[K]['res']> {
    return ipcRenderer.invoke(channel(ch), req) as Promise<IpcInvokeMap[K]['res']>;
  },
  send<K extends IpcInvokeChannel>(ch: K, req: IpcInvokeMap[K]['req']): void {
    ipcRenderer.send(channel(ch), req);
  },
  on<K extends IpcEventChannel>(ch: K, cb: (payload: IpcEventMap[K]) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, payload: IpcEventMap[K]): void => cb(payload);
    ipcRenderer.on(channel(ch), listener);
    return () => ipcRenderer.removeListener(channel(ch), listener);
  },
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
};

contextBridge.exposeInMainWorld('vela', bridge);
// `<browser-action-list>`: extension buttons, badges and popups in the sidebar (D036).
injectBrowserAction();
