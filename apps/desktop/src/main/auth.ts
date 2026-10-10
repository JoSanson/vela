import type { AuthPrompt } from '@vela/shared';
import { app, webContents } from 'electron';
import { emit } from './ipc/typed';
import type { OverlayManager } from './overlay';

interface Pending {
  prompt: AuthPrompt;
  resolve: (username: string | null, password: string | null) => void;
}

/**
 * HTTP / proxy authentication (`app.on('login')`): Electron would otherwise cancel the request and
 * the page would show a bare 401. Challenges are queued and answered through the overlay, one at a
 * time, and dropped when the requesting document navigates away or closes.
 */
export class AuthManager {
  private queue: Pending[] = [];
  private current: Pending | null = null;
  private waitingForOverlay = false;

  constructor(
    private readonly overlay: OverlayManager,
    private readonly tabIdOf: (wcId: number) => string | undefined,
  ) {}

  install(): void {
    app.on('login', (event, wc, _details, authInfo, callback) => {
      const tabId = wc ? this.tabIdOf(wc.id) : undefined;
      if (!wc || !tabId) return;
      event.preventDefault();
      const target = webContents.fromId(wc.id);
      const abort = (): void => this.abandon(pending);
      const pending: Pending = {
        prompt: {
          id: crypto.randomUUID(),
          tabId,
          host: authInfo.host,
          realm: authInfo.realm,
          isProxy: authInfo.isProxy,
        },
        resolve: (u, p) => {
          target?.off('did-navigate', abort);
          target?.off('destroyed', abort);
          if (u === null || p === null) callback();
          else callback(u, p);
        },
      };
      this.queue.push(pending);
      target?.once('did-navigate', abort);
      target?.once('destroyed', abort);
      this.pump();
    });
  }

  respond(id: string, username: string | null, password: string | null): void {
    const cur = this.current;
    if (cur?.prompt.id !== id) return;
    cur.resolve(username, password);
    this.current = null;
    if (this.queue.length === 0 && this.overlay.current.kind === 'authPrompt') this.overlay.hide();
    this.pump();
  }

  /** Overlay dismissed (Escape / click outside): cancel the challenge, the page gets its 401. */
  dismissAll(): void {
    if (this.current) {
      this.current.resolve(null, null);
      this.current = null;
    }
    for (const p of this.queue.splice(0)) p.resolve(null, null);
  }

  private abandon(p: Pending): void {
    if (this.current === p) {
      p.resolve(null, null);
      this.current = null;
      if (this.queue.length === 0 && this.overlay.current.kind === 'authPrompt') this.overlay.hide();
      this.pump();
      return;
    }
    const i = this.queue.indexOf(p);
    if (i >= 0) {
      this.queue.splice(i, 1);
      p.resolve(null, null);
    }
  }

  private pump(): void {
    if (this.current || this.queue.length === 0) return;
    if (this.overlay.visible && this.overlay.current.kind !== 'authPrompt') {
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
    this.overlay.show('authPrompt', next.prompt);
    const wc = this.overlay.view?.webContents;
    if (wc) emit(wc, 'auth/prompt', next.prompt);
  }
}
