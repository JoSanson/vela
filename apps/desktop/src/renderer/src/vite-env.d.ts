/// <reference types="vite/client" />

import type { VelaBridge } from '@vela/shared';

declare global {
  interface Window {
    vela: VelaBridge;
  }
}

export {};

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      /** electron-chrome-extensions' extension buttons (injected by the shell preload). */
      'browser-action-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        partition?: string;
        alignment?: string;
      };
    }
  }
}
