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
      rollupOptions: { input: { index: resolve(dir, 'src/main/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          shell: resolve(dir, 'src/preload/shell.ts'),
          tab: resolve(dir, 'src/preload/tab.ts'),
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
