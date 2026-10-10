import { hostOf } from '@vela/core';
import type { Boost } from '@vela/shared';
import type { WebContents } from 'electron';
import type { BoostsRepo } from './db/repos';

const FONT_PRESETS: Record<string, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  mono: '"SF Mono", Menlo, Consolas, monospace',
};

/** Builds the CSS injected for a host from all its enabled boosts. */
export function compileBoostCss(boosts: readonly Boost[]): string {
  const parts: string[] = [];
  for (const b of boosts) {
    if (!b.enabled) continue;
    if (b.zapped.length) parts.push(`${b.zapped.join(',\n')} { display: none !important; }`);
    if (b.font && FONT_PRESETS[b.font]) parts.push(`* { font-family: ${FONT_PRESETS[b.font]} !important; }`);
    if (b.css.trim()) parts.push(b.css);
  }
  return parts.join('\n\n');
}

export function compileBoostJs(boosts: readonly Boost[]): string {
  return boosts
    .filter((b) => b.enabled && b.js.trim())
    .map((b) => `try {\n${b.js}\n} catch (e) { console.error('[vela boost]', e); }`)
    .join('\n');
}

/** Element picker injected into the page; resolves with a stable CSS selector or null when cancelled. */
const ZAP_PICKER = `new Promise((resolve) => {
  const prev = document.getElementById('__vela-zap');
  if (prev) prev.remove();
  const box = document.createElement('div');
  box.id = '__vela-zap';
  Object.assign(box.style, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', background: 'rgba(91,108,255,0.22)', outline: '2px solid #5b6cff', borderRadius: '4px', transition: 'all 60ms linear', left: '0', top: '0', width: '0', height: '0' });
  document.documentElement.appendChild(box);
  const style = document.createElement('style');
  style.id = '__vela-zap-style';
  style.textContent = '* { cursor: crosshair !important; }';
  document.documentElement.appendChild(style);
  let current = null;
  const selectorFor = (el) => {
    if (el.id && /^[A-Za-z][\\w-]*$/.test(el.id)) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      const classes = [...node.classList].filter((c) => /^[A-Za-z_-][\\w-]*$/.test(c) && !/^(is-|has-|js-|active|hover|focus)/.test(c)).slice(0, 2);
      if (classes.length) part += '.' + classes.map((c) => CSS.escape(c)).join('.');
      else if (node.parentElement) {
        const idx = [...node.parentElement.children].filter((c) => c.tagName === node.tagName).indexOf(node) + 1;
        if (idx > 1) part += ':nth-of-type(' + idx + ')';
      }
      parts.unshift(part);
      if (node.id && /^[A-Za-z][\\w-]*$/.test(node.id)) { parts[0] = '#' + CSS.escape(node.id); break; }
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const cleanup = () => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    box.remove();
    style.remove();
  };
  const onMove = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box || el === document.documentElement || el === document.body) return;
    current = el;
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  };
  const onClick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const sel = current ? selectorFor(current) : null;
    cleanup();
    resolve(sel);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); cleanup(); resolve(null); } };
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
})`;

export class BoostsManager {
  private injected = new WeakMap<WebContents, { host: string; key: string | null }>();

  constructor(private readonly repo: BoostsRepo) {}

  list(): Boost[] {
    return this.repo.list();
  }

  save(b: Boost): void {
    this.repo.save({ ...b, host: b.host.toLowerCase().replace(/^www\./, ''), updatedAt: Date.now() });
  }

  delete(id: string): void {
    this.repo.remove(id);
  }

  /** Hook every tab WebContents: inject on each document load. */
  attach(wc: WebContents): void {
    wc.on('dom-ready', () => void this.apply(wc));
  }

  async apply(wc: WebContents): Promise<void> {
    if (wc.isDestroyed()) return;
    const url = wc.getURL();
    const host = hostOf(url);
    if (!host || !/^https?:/.test(url)) return;
    const boosts = this.repo.forHost(host);
    const css = compileBoostCss(boosts);
    const js = compileBoostJs(boosts);
    const prev = this.injected.get(wc);
    if (prev?.key) {
      try {
        await wc.removeInsertedCSS(prev.key);
      } catch {
        /* document changed */
      }
    }
    let key: string | null = null;
    if (css) key = await wc.insertCSS(css, { cssOrigin: 'user' }).catch(() => null);
    this.injected.set(wc, { host, key });
    if (js) await wc.executeJavaScript(js, false).catch(() => undefined);
  }

  /** Re-applies boosts for every live view showing `host` (after an edit). */
  async refresh(views: Iterable<WebContents>, host: string): Promise<void> {
    for (const wc of views) {
      if (!wc.isDestroyed() && hostOf(wc.getURL()) === host) await this.apply(wc);
    }
  }

  /** Runs the picker; returns the selector the user clicked, persisted into the host's boost. */
  async zap(wc: WebContents): Promise<string | null> {
    const host = hostOf(wc.getURL());
    if (!host) return null;
    const selector = (await wc.executeJavaScript(ZAP_PICKER, true).catch(() => null)) as string | null;
    // The picker runs in the page's world: never trust its output as CSS source.
    if (!selector || selector.length > 500 || /[{};\\]|\/\*|@/.test(selector)) return null;
    const existing = this.repo.forHost(host)[0];
    const boost: Boost = existing
      ? { ...existing, zapped: [...new Set([...existing.zapped, selector])], updatedAt: Date.now() }
      : {
          id: crypto.randomUUID(),
          host,
          enabled: true,
          css: '',
          js: '',
          zapped: [selector],
          font: null,
          updatedAt: Date.now(),
        };
    this.repo.save(boost);
    await this.apply(wc);
    return selector;
  }

  exportJson(): string {
    return JSON.stringify({ version: 1, boosts: this.repo.list() }, null, 2);
  }

  importJson(json: string): number {
    const parsed = JSON.parse(json) as { boosts?: unknown };
    const list = Array.isArray(parsed.boosts) ? parsed.boosts : [];
    let n = 0;
    for (const raw of list) {
      const b = raw as Partial<Boost>;
      if (typeof b.host !== 'string' || !b.host) continue;
      this.repo.save({
        id: typeof b.id === 'string' ? b.id : crypto.randomUUID(),
        host: b.host.toLowerCase(),
        enabled: b.enabled !== false,
        css: typeof b.css === 'string' ? b.css : '',
        js: typeof b.js === 'string' ? b.js : '',
        zapped: Array.isArray(b.zapped) ? b.zapped.filter((s): s is string => typeof s === 'string') : [],
        font: typeof b.font === 'string' ? b.font : null,
        updatedAt: Date.now(),
      });
      n++;
    }
    return n;
  }
}
