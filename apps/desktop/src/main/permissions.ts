import type { PermissionKind, PermissionPrompt, SitePermission } from '@vela/shared';
import { webContents, type WebContents } from 'electron';
import type { PermissionsRepo } from './db/repos';
import { emit } from './ipc/typed';
import type { OverlayManager } from './overlay';
import { forgetPermission, rememberPermission } from './security';

const KINDS: PermissionKind[] = [
  'notifications',
  'geolocation',
  'camera',
  'microphone',
  'clipboard-read',
  'midi',
  'pointerLock',
  'fullscreen',
  'display-capture',
  'idle-detection',
];

export function normalizeKind(permission: string): PermissionKind {
  return (KINDS as string[]).includes(permission) ? (permission as PermissionKind) : 'other';
}

interface Pending {
  prompt: PermissionPrompt;
  resolve: (d: 'allow' | 'deny') => void;
}

/** Persists per-origin decisions and asks the user through the overlay when unknown. */
export class PermissionManager {
  private queue: Pending[] = [];
  private current: Pending | null = null;

  constructor(
    private readonly repo: PermissionsRepo,
    private readonly overlay: OverlayManager,
    private readonly tabIdOf: (wcId: number) => string | undefined,
  ) {
    for (const p of repo.list()) rememberPermission(p.origin, p.permission, p.decision === 'allow');
  }

  list(): SitePermission[] {
    return this.repo.list();
  }

  set(p: SitePermission): void {
    this.repo.set(p);
    rememberPermission(p.origin, p.permission, p.decision === 'allow');
  }

  remove(origin: string, permission: PermissionKind): void {
    this.repo.remove(origin, permission);
    forgetPermission(origin, permission);
  }

  decide(origin: string, permission: string, wcId: number): Promise<'allow' | 'deny'> {
    const kind = normalizeKind(permission);
    if (kind === 'other') return Promise.resolve('deny');
    const stored = this.repo.get(origin, kind);
    if (stored) return Promise.resolve(stored.decision);
    const tabId = this.tabIdOf(wcId);
    if (!tabId) return Promise.resolve('deny');
    return new Promise((resolve) => {
      const pending: Pending = {
        prompt: { id: crypto.randomUUID(), tabId, origin, permission: kind },
        resolve,
      };
      this.queue.push(pending);
      const wc = webContents.fromId(wcId);
      const abort = (): void => this.abandon(pending);
      wc?.once('did-navigate', abort);
      wc?.once('destroyed', abort);
      this.pump();
    });
  }

  respond(id: string, decision: 'allow' | 'deny', remember: boolean): void {
    const cur = this.current;
    if (cur?.prompt.id !== id) return;
    if (remember) {
      this.set({
        origin: cur.prompt.origin,
        permission: cur.prompt.permission,
        decision,
        updatedAt: Date.now(),
      });
    }
    cur.resolve(decision);
    this.current = null;
    if (this.queue.length === 0 && this.overlay.current.kind === 'permissionPrompt') this.overlay.hide();
    this.pump();
  }

  /** The requesting document navigated away or closed: deny without remembering. */
  private abandon(p: Pending): void {
    if (this.current === p) {
      p.resolve('deny');
      this.current = null;
      if (this.queue.length === 0 && this.overlay.current.kind === 'permissionPrompt') this.overlay.hide();
      this.pump();
      return;
    }
    const i = this.queue.indexOf(p);
    if (i >= 0) {
      this.queue.splice(i, 1);
      p.resolve('deny');
    }
  }

  /** Called when the overlay is dismissed (Escape / click outside): deny without remembering. */
  dismissAll(): void {
    if (this.current) {
      this.current.resolve('deny');
      this.current = null;
    }
    for (const p of this.queue.splice(0)) p.resolve('deny');
  }

  private pump(): void {
    if (this.current || this.queue.length === 0) return;
    const next = this.queue.shift();
    if (!next) return;
    this.current = next;
    this.overlay.show('permissionPrompt', next.prompt);
    const wc = this.overlay.view?.webContents;
    if (wc) emit(wc, 'permissions/prompt', next.prompt);
  }

  static isPromptable(wc: WebContents): boolean {
    return !wc.isDestroyed();
  }
}
