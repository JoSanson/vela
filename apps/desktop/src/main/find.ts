import type { FindRequest } from '@vela/shared';
import type { AppContext } from './context';
import { emit } from './ipc/typed';

export function installFind(ctx: AppContext): void {
  ctx.tabs.onViewCreated((tabId, wc) => {
    wc.on('found-in-page', (_e, result) => {
      const shell = ctx.windows.main?.win.webContents;
      if (!shell) return;
      emit(shell, 'find/result', {
        tabId,
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        finalUpdate: result.finalUpdate,
      });
    });
  });
}

export function findInTab(ctx: AppContext, req: FindRequest): void {
  const wc = ctx.tabs.webContents(req.tabId);
  if (!wc) return;
  if (!req.text) {
    wc.stopFindInPage('clearSelection');
    return;
  }
  // Electron's `findNext` means "start a new session" (true for the first request of a query),
  // the opposite of the IPC flag which means "step to the next match".
  wc.findInPage(req.text, {
    forward: req.forward,
    findNext: !req.findNext,
    matchCase: req.matchCase ?? false,
  });
}

export function stopFind(
  ctx: AppContext,
  tabId: string,
  action: 'clearSelection' | 'keepSelection' | 'activateSelection',
): void {
  ctx.tabs.webContents(tabId)?.stopFindInPage(action);
}
