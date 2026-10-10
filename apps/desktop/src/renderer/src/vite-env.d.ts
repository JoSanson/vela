/// <reference types="vite/client" />

import type { VelaBridge } from '@vela/shared';

declare global {
  interface Window {
    vela: VelaBridge;
  }
}

export {};
