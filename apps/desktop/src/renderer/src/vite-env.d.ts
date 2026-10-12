/// <reference types="vite/client" />

import type { VelaBridge } from '@vela/shared';

declare global {
  interface Window {
    vela: VelaBridge;
    browserAction?: BrowserActionApi;
  }

  /** electron-chrome-extensions' toolbar API, injected by the shell preload (D036). */
  interface BrowserActionInfo {
    id: string;
    title?: string;
    popup?: string;
    text?: string;
    color?: string;
    tabs: Record<string, { title?: string; text?: string; color?: string }>;
  }

  interface BrowserActionApi {
    getAction(extensionId: string): BrowserActionInfo | undefined;
    addObserver(partition: string): void;
    removeObserver(partition: string): void;
    getState(partition: string): Promise<{ activeTabId?: number; actions: BrowserActionInfo[] }>;
    activate(
      partition: string,
      details: {
        eventType: string;
        extensionId: string;
        tabId: number;
        alignment?: string;
        anchorRect: { x: number; y: number; width: number; height: number };
      },
    ): void;
    addEventListener(
      type: 'update',
      fn: (state: { activeTabId?: number; actions: BrowserActionInfo[] }) => void,
    ): void;
    removeEventListener(
      type: 'update',
      fn: (state: { activeTabId?: number; actions: BrowserActionInfo[] }) => void,
    ): void;
  }
}

export {};
