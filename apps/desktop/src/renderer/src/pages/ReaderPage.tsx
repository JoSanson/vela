import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { useT } from '../lib/i18n';
import { tryInvoke } from './lib';
import styles from './ReaderPage.module.css';

const ALLOWED_TAGS = new Set([
  'p',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'b',
  'i',
  'u',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'br',
  'hr',
  'div',
  'span',
  'section',
  'article',
  'aside',
  'sup',
  'sub',
  'time',
  'abbr',
  'cite',
  'q',
  'dl',
  'dt',
  'dd',
  'picture',
  'source',
  'video',
  'audio',
  'caption',
]);
const ALLOWED_ATTRS = new Set([
  'href',
  'src',
  'alt',
  'title',
  'colspan',
  'rowspan',
  'datetime',
  'width',
  'height',
  'srcset',
  'type',
  'controls',
]);

/** Readability output is HTML from the page: keep structure, drop scripts, handlers and unknown tags. */
export function sanitizeArticle(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (el: Element): void => {
    for (const child of [...el.children]) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // Lifted children must be sanitised too, otherwise <foo><img onerror=…></foo> slips through.
        walk(child);
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (!ALLOWED_ATTRS.has(name) || /^(javascript|data|vbscript):/i.test(value))
          child.removeAttribute(attr.name);
      }
      if (tag === 'a') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function ReaderPage() {
  const t = useT();
  const tabId = useMemo(() => new URLSearchParams(location.search).get('tab') ?? '', []);
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>(() => (tabId ? 'loading' : 'empty'));
  const [article, setArticle] = useState<{
    title: string;
    byline: string | null;
    html: string;
    minutes: number;
  } | null>(null);
  const [size, setSize] = useState<'s' | 'm' | 'l'>('m');

  useEffect(() => {
    if (!tabId) return;
    void tryInvoke('tab/reader', { tabId }).then((r) => {
      if (!r) {
        setState('empty');
        return;
      }
      setArticle({
        title: r.title,
        byline: r.byline,
        html: sanitizeArticle(r.content),
        minutes: Math.max(1, Math.round(r.length / 1100)),
      });
      setState('ready');
    });
  }, [tabId]);

  useEffect(() => {
    if (article) document.title = t('pages.reader.docTitle', { title: article.title });
  }, [article, t]);

  return (
    <div className={styles.page} data-size={size} data-testid="page-reader">
      <div className={styles.toolbar}>
        <span className={styles.brand}>
          <Icon name="book" size={14} /> {t('pages.reader.brand')}
        </span>
        <span style={{ flex: 1 }} />
        <div className={styles.sizes} role="radiogroup" aria-label={t('pages.reader.textSize')}>
          {(['s', 'm', 'l'] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={size === s}
              className={size === s ? styles.on : ''}
              onClick={() => setSize(s)}
            >
              {s === 's' ? 'A' : s === 'm' ? 'A' : 'A'}
              <span className="sr-only">{s}</span>
            </button>
          ))}
        </div>
      </div>
      {state === 'loading' && <p className={styles.muted}>{t('pages.reader.extracting')}</p>}
      {state === 'empty' && (
        <div className={styles.empty} data-testid="reader-empty">
          <Icon name="book" size={28} />
          <p>{t('pages.reader.notArticle')}</p>
        </div>
      )}
      {state === 'ready' && article && (
        <article className={styles.article}>
          <h1 className={styles.title}>{article.title}</h1>
          <p className={styles.meta}>
            {article.byline
              ? t('pages.reader.meta', { byline: article.byline, n: article.minutes })
              : t('pages.reader.minRead', { n: article.minutes })}
          </p>
          <div
            className={styles.body}
            dangerouslySetInnerHTML={{ __html: article.html }}
            data-testid="reader-body"
          />
        </article>
      )}
    </div>
  );
}
