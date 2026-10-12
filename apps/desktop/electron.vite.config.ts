import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

const bundled = ['@vela/core', '@vela/shared', '@ghostery/adblocker-electron', '@mozilla/readability'];
const dir = import.meta.dirname;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve(dir, 'src/main/index.ts'),
          adblockUpdate: resolve(dir, 'src/main/workers/adblockUpdate.ts'),
        },
      },
    },
  },
  preload: {
    // Sandboxed preloads cannot require node_modules: the browser-action element is inlined.
    plugins: [externalizeDepsPlugin({ exclude: [...bundled, 'electron-chrome-extensions'] })],
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          shell: resolve(dir, 'src/preload/shell.ts'),
          tab: resolve(dir, 'src/preload/tab.ts'),
          extensionCompat: resolve(dir, 'src/preload/extensionCompat.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    css: { modules: { localsConvention: 'camelCaseOnly' } },
    build: {
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(dir, 'src/renderer/index.html'),
          overlay: resolve(dir, 'src/renderer/overlay.html'),
          little: resolve(dir, 'src/renderer/little.html'),
          pages: resolve(dir, 'src/renderer/pages.html'),
        },
      },
    },
  },
});
