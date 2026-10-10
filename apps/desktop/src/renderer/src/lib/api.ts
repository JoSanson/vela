import type { CoreAction } from '@vela/core';
import type { IpcInvokeChannel, IpcInvokeMap, VelaBridge } from '@vela/shared';

const noopBridge: VelaBridge = {
  platform: 'darwin',
  invoke: () => Promise.reject(new Error('vela bridge unavailable')),
  send: () => undefined,
  on: () => () => undefined,
};

export const vela: VelaBridge = typeof window !== 'undefined' && window.vela ? window.vela : noopBridge;

export function dispatch(action: CoreAction): void {
  void vela.invoke('state/dispatch', action);
}

export function invoke<K extends IpcInvokeChannel>(
  ch: K,
  req: IpcInvokeMap[K]['req'],
): Promise<IpcInvokeMap[K]['res']> {
  return vela.invoke(ch, req);
}

export const isMac = vela.platform === 'darwin';
export const modKey = isMac ? '⌘' : 'Ctrl';
