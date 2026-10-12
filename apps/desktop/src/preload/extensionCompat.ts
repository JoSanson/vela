import { contextBridge } from 'electron';

// Runs after electron-chrome-extensions' preload in extension service workers and pages. Chromium
// now ships a native `browser` namespace beside `chrome`; extensions built with Mozilla's
// webextension-polyfill pick it up and miss every API the library adds to `chrome` (windows,
// commands, action…). Point `browser` at the completed `chrome` instead.
const inExtension =
  process.type === 'service-worker' ||
  (typeof location !== 'undefined' && location.protocol === 'chrome-extension:');

if (inExtension) {
  contextBridge.executeInMainWorld({
    func: () => {
      const g = globalThis as { chrome?: object; browser?: object };
      if (!g.chrome || !g.browser || g.browser === g.chrome) return;
      try {
        Object.defineProperty(g, 'browser', { value: g.chrome, configurable: true, writable: true });
      } catch {
        /* non-configurable in this context: the extension keeps the native namespace */
      }
    },
  });
}
