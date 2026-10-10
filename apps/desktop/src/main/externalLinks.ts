import type { Id } from '@vela/core';
import type { ExternalPrompt } from '@vela/shared';
import { shell } from 'electron';
import { emit } from './ipc/typed';
import type { OverlayManager } from './overlay';
import type { PrefsStore } from './prefs';

interface Pending {
  prompt: ExternalPrompt;
}

/**
 * Links to other applications (`zoommtg:`, `slack:`, `vscode:`…). Chromium would silently drop
 * them; Vela asks once per scheme ("Open in app?") and remembers the answer in prefs.
 */
export class ExternalLinkManager {
  private queue: Pending[] = [];
  private current: Pending | null = null;
  private waitingForOverlay = false;

  constructor(
    private readonly overlay: OverlayManager,
    private readonly prefs: PrefsStore,
  ) {}

  request(tabId: Id, url: string): void {
    const scheme = url.slice(0, url.indexOf(':')).toLowerCase();
    if (!scheme) return;
    const remembered = this.prefs.value.externalSchemes[scheme];
    if (remembered === 'allow') {
      void shell.openExternal(url).catch(() => undefined);
      return;
    }
    if (remembered === 'deny') return;
    let host = '';
    try {
      host = new URL(url).host;
    } catch {
      /* opaque scheme */
    }
    this.queue.push({ prompt: { id: crypto.randomUUID(), tabId, url, scheme, host } });
    this.pump();
  }

  respond(id: string, allow: boolean, remember: boolean): void {
    const cur = this.current;
    if (cur?.prompt.id !== id) return;
    this.current = null;
    if (remember) {
      this.prefs.set({
        externalSchemes: {
          ...this.prefs.value.externalSchemes,
          [cur.prompt.scheme]: allow ? 'allow' : 'deny',
        },
      });
    }
    if (allow) void shell.openExternal(cur.prompt.url).catch(() => undefined);
    if (this.queue.length === 0 && this.overlay.current.kind === 'externalPrompt') this.overlay.hide();
    this.pump();
  }

  dismissAll(): void {
    this.current = null;
    this.queue.length = 0;
  }

  private pump(): void {
    if (this.current || this.queue.length === 0) return;
    if (this.overlay.visible && this.overlay.current.kind !== 'externalPrompt') {
      if (this.waitingForOverlay) return;
      this.waitingForOverlay = true;
      this.overlay.onceHide(() => {
        this.waitingForOverlay = false;
        this.pump();
      });
      return;
    }
    const next = this.queue.shift();
    if (!next) return;
    this.current = next;
    this.overlay.show('externalPrompt', next.prompt);
    const wc = this.overlay.view?.webContents;
    if (wc) emit(wc, 'external/prompt', next.prompt);
  }
}
