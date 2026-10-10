import type { ReaderResult } from '@vela/shared';
import readabilitySource from '@mozilla/readability/Readability.js?raw';
import type { WebContents } from 'electron';

// Readability is executed inside the page (isolated from our main world) and only JSON comes back.
const SCRIPT = `(() => {
  try {
    const exports = {}; const module = { exports };
    ${readabilitySource}
    const Parser = typeof module.exports === 'function' ? module.exports : null;
    if (!Parser) return null;
    const doc = document.cloneNode(true);
    const article = new Parser(doc, { keepClasses: false }).parse();
    if (!article) return null;
    return { title: article.title || document.title, byline: article.byline || null, content: article.content, length: article.length };
  } catch (e) { return { error: String(e && e.stack ? e.stack : e) }; }
})()`;

export async function extractReadable(wc: WebContents): Promise<ReaderResult | null> {
  if (wc.isDestroyed() || !/^https?:/.test(wc.getURL())) return null;
  try {
    const result = (await wc.executeJavaScript(SCRIPT, false)) as (ReaderResult & { error?: string }) | null;
    if (result && 'error' in result) {
      console.warn('[reader] extraction failed:', result.error);
      return null;
    }
    if (!result || typeof result.content !== 'string') return null;
    return { title: result.title, byline: result.byline, content: result.content, length: result.length };
  } catch {
    return null;
  }
}
