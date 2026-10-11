import type { Id } from '@vela/core';
import type {
  AutofillKey,
  AutofillPrompt,
  CredentialFocus,
  CredentialSummary,
  SavePasswordPrompt,
} from '@vela/shared';
import { safeStorage, type WebContents } from 'electron';
import type { Db } from './db/database';
import { emit } from './ipc/typed';
import type { OverlayManager } from './overlay';
import type { TabManager } from './tabs/tabManager';

interface Row {
  id: string;
  origin: string;
  username: string;
  secret: Buffer;
  updated_at: number;
  last_used_at: number | null;
}

interface PendingSave {
  prompt: SavePasswordPrompt;
  password: string;
}

/**
 * Password manager. Secrets are encrypted with the OS keychain (`safeStorage`) and only ever leave
 * main to be typed into the page's own form. The page preload reports login fields and submissions;
 * main decides what to offer (an autofill popover under the field, a save chip after a login).
 */
export class CredentialsManager {
  private pending = new Map<string, PendingSave>();
  private autofillFor: { tabId: Id; wcId: number } | null = null;

  constructor(
    private readonly db: Db,
    private readonly overlay: OverlayManager,
    private readonly tabs: TabManager,
    private readonly isPrivateTab: (tabId: Id) => boolean,
  ) {}

  get available(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  list(query = ''): CredentialSummary[] {
    const q = query.trim().toLowerCase();
    const rows = this.db
      .prepare(
        'SELECT id, origin, username, updated_at, last_used_at FROM credentials ORDER BY origin, username',
      )
      .all() as Omit<Row, 'secret'>[];
    return rows
      .filter((r) => !q || r.origin.toLowerCase().includes(q) || r.username.toLowerCase().includes(q))
      .map((r) => ({
        id: r.id,
        origin: r.origin,
        username: r.username,
        updatedAt: r.updated_at,
        lastUsedAt: r.last_used_at,
      }));
  }

  forOrigin(origin: string): CredentialSummary[] {
    return this.list().filter((c) => c.origin === origin);
  }

  reveal(id: string): string | null {
    const row = this.db.prepare('SELECT secret FROM credentials WHERE id = ?').get(id) as
      Pick<Row, 'secret'> | undefined;
    if (!row) return null;
    try {
      return safeStorage.decryptString(row.secret);
    } catch {
      return null;
    }
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
  }

  neverList(): string[] {
    return (
      this.db.prepare('SELECT origin FROM credentials_never ORDER BY origin').all() as { origin: string }[]
    ).map((r) => r.origin);
  }

  setNever(origin: string, never: boolean): void {
    if (never) {
      this.db
        .prepare(
          'INSERT INTO credentials_never (origin, added_at) VALUES (?, ?) ON CONFLICT(origin) DO NOTHING',
        )
        .run(origin, Date.now());
    } else this.db.prepare('DELETE FROM credentials_never WHERE origin = ?').run(origin);
  }

  private isNever(origin: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM credentials_never WHERE origin = ?').get(origin);
  }

  /** Bulk insert from another browser; existing (origin, username) pairs are updated. */
  importMany(items: { origin: string; username: string; password: string; updatedAt: number }[]): number {
    if (!this.available) return 0;
    const stmt = this.db.prepare(
      `INSERT INTO credentials (id, origin, username, secret, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(origin, username) DO UPDATE SET secret = excluded.secret, updated_at = excluded.updated_at`,
    );
    let n = 0;
    const run = this.db.transaction((rows: typeof items) => {
      for (const r of rows) {
        stmt.run(
          crypto.randomUUID(),
          r.origin,
          r.username,
          safeStorage.encryptString(r.password),
          r.updatedAt,
          r.updatedAt,
        );
        n++;
      }
    });
    run(items);
    return n;
  }

  private save(origin: string, username: string, password: string): void {
    if (!this.available) return;
    const now = Date.now();
    const secret = safeStorage.encryptString(password);
    this.db
      .prepare(
        `INSERT INTO credentials (id, origin, username, secret, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(origin, username) DO UPDATE SET secret = excluded.secret, updated_at = excluded.updated_at`,
      )
      .run(crypto.randomUUID(), origin, username, secret, now, now);
  }

  // ---------------------------------------------------------------- page events

  /** A login field got (or lost) focus in a tab: offer stored accounts right under it. */
  onFocus(wc: WebContents, origin: string, focus: CredentialFocus | null): boolean {
    const tabId = this.tabs.tabIdOf(wc);
    if (!tabId) return false;
    if (!focus) {
      this.hideAutofill(tabId);
      return false;
    }
    const typed = (focus.typed ?? '').trim().toLowerCase();
    const accounts = this.forOrigin(origin).filter(
      (a) => !typed || a.username.toLowerCase().startsWith(typed),
    );
    if (accounts.length === 0) {
      this.hideAutofill(tabId);
      return false;
    }
    const view = this.tabs.view(tabId);
    if (!view) return false;
    const bounds = view.getBounds();
    const zoom = wc.getZoomFactor();
    const anchor = {
      x: bounds.x + focus.rect.x * zoom,
      y: bounds.y + focus.rect.y * zoom,
      width: focus.rect.width * zoom,
      height: focus.rect.height * zoom,
    };
    const prompt: AutofillPrompt = { tabId, origin, accounts, anchor };
    if (this.overlay.visible && this.overlay.current.kind !== 'autofill') return false;
    this.autofillFor = { tabId, wcId: wc.id };
    this.overlay.show('autofill', prompt);
    const ov = this.overlay.view?.webContents;
    if (ov) emit(ov, 'credentials/autofill', prompt);
    return true;
  }

  /** Arrow keys and Enter typed in the page while the popover is open drive the popover. */
  key(wc: WebContents, key: AutofillKey): boolean {
    const tabId = this.tabs.tabIdOf(wc);
    if (!tabId || this.autofillFor?.tabId !== tabId) return false;
    if (this.overlay.current.kind !== 'autofill') {
      this.hideAutofill(tabId);
      return false;
    }
    const ov = this.overlay.view?.webContents;
    if (ov) emit(ov, 'credentials/autofillKey', key);
    return true;
  }

  hideAutofill(tabId?: Id): void {
    if (!this.autofillFor || (tabId && this.autofillFor.tabId !== tabId)) return;
    const wc = this.tabs.webContents(this.autofillFor.tabId);
    this.autofillFor = null;
    if (this.overlay.current.kind === 'autofill') this.overlay.hide();
    if (wc) emit(wc, 'credentials/autofillHidden', undefined);
  }

  /**
   * The user picked an account in the popover: decrypt and type it into the page. The popover is
   * not closed here: closing it hands focus back to the page, and the field must already hold the
   * value by then or its focus event would open the popover again. The page reports once filled.
   */
  fill(tabId: Id, id: string): void {
    const wc = this.tabs.webContents(tabId);
    const row = this.db.prepare('SELECT origin, username, secret FROM credentials WHERE id = ?').get(id) as
      Pick<Row, 'origin' | 'username' | 'secret'> | undefined;
    if (!wc || !row) return;
    let origin: string;
    try {
      origin = new URL(wc.getURL()).origin;
    } catch {
      return;
    }
    // The page may have navigated since the popover opened: never type a secret into another origin.
    if (origin !== row.origin) return;
    const password = this.reveal(id);
    if (password === null) return;
    this.db.prepare('UPDATE credentials SET last_used_at = ? WHERE id = ?').run(Date.now(), id);
    emit(wc, 'credentials/fill', { username: row.username, password });
  }

  /** A form with a password was submitted: offer to save (or update) after the page settles. */
  onSubmitted(wc: WebContents, origin: string, username: string, password: string): void {
    const tabId = this.tabs.tabIdOf(wc);
    if (!tabId || !password || !this.available || this.isNever(origin) || this.isPrivateTab(tabId)) return;
    const existing = this.db
      .prepare('SELECT id, secret FROM credentials WHERE origin = ? AND username = ?')
      .get(origin, username) as Pick<Row, 'id' | 'secret'> | undefined;
    if (existing) {
      try {
        if (safeStorage.decryptString(existing.secret) === password) return;
      } catch {
        /* undecryptable: treat as update */
      }
    }
    const prompt: SavePasswordPrompt = {
      id: crypto.randomUUID(),
      tabId,
      origin,
      username,
      update: !!existing,
    };
    this.pending.set(prompt.id, { prompt, password });
    // Chrome asks after the navigation that follows the login, so the chip never covers the form itself.
    setTimeout(() => this.showSave(prompt), 600);
    setTimeout(() => this.pending.delete(prompt.id), 5 * 60_000);
  }

  private showSave(prompt: SavePasswordPrompt): void {
    if (!this.pending.has(prompt.id)) return;
    if (this.overlay.visible && !['autofill', 'savePassword', 'toast'].includes(this.overlay.current.kind)) {
      this.overlay.onceHide(() => this.showSave(prompt));
      return;
    }
    this.overlay.show('savePassword', prompt);
    const ov = this.overlay.view?.webContents;
    if (ov) emit(ov, 'credentials/savePrompt', prompt);
  }

  respond(id: string, action: 'save' | 'never' | 'dismiss'): void {
    const p = this.pending.get(id);
    this.pending.delete(id);
    if (!p) return;
    if (action === 'save') this.save(p.prompt.origin, p.prompt.username, p.password);
    if (action === 'never') this.setNever(p.prompt.origin, true);
    if (this.overlay.current.kind === 'savePassword') this.overlay.hide();
  }

  dismissAll(): void {
    const wc = this.autofillFor ? this.tabs.webContents(this.autofillFor.tabId) : undefined;
    this.autofillFor = null;
    if (wc) emit(wc, 'credentials/autofillHidden', undefined);
  }
}
