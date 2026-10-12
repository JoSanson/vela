import type { BrowserImportSource, BrowserImportSourceId, ImportResult, Translator } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { ArcExtensions } from './ArcExtensions';
import { useT } from '../lib/i18n';
import styles from './ImportPanel.module.css';
import { tryInvoke } from './lib';
import { useToast } from './Toast';
import { Button, Spinner } from './ui';

const LOGO: Record<BrowserImportSourceId, { letter: string; color: string }> = {
  arc: { letter: 'A', color: '#ff536a' },
  chrome: { letter: 'C', color: '#4285f4' },
  brave: { letter: 'B', color: '#fb542b' },
  edge: { letter: 'E', color: '#0c7fd1' },
  safari: { letter: 'S', color: '#1a8cff' },
  firefox: { letter: 'F', color: '#ff7139' },
};

interface Choice {
  bookmarks: boolean;
  history: boolean;
  structure: boolean;
  passwords: boolean;
  cookies: boolean;
}

interface Props {
  onImported?: (source: BrowserImportSource, result: ImportResult) => void;
}

function subtitle(src: BrowserImportSource, t: Translator): string {
  if (src.error === 'safari-access') return t('pages.import.safariAccess');
  if (!src.available) return t('pages.import.notInstalled');
  if (src.id === 'arc') {
    return src.history ? t('pages.import.arcFound') : t('pages.import.arcNoHistory');
  }
  if (src.id === 'safari') return t('pages.import.safariFound');
  return t('pages.import.profileFound');
}

function summary(src: BrowserImportSource, r: ImportResult, t: Translator): string {
  const base =
    src.id === 'arc'
      ? t('pages.import.arcSummary', {
          spaces: r.spaces ?? 0,
          pinned: r.bookmarks,
          tabs: r.todayTabs ?? 0,
          favorites: r.favorites ?? 0,
          history: r.history,
        })
      : t('pages.import.summary', { bookmarks: r.bookmarks, history: r.history });
  const extra = [
    r.profiles ? t('pages.import.profilesCount', { n: r.profiles }) : '',
    r.passwords ? t('pages.import.passwordsCount', { n: r.passwords }) : '',
    r.cookies ? t('pages.import.cookiesCount', { n: r.cookies }) : '',
  ].filter(Boolean);
  return extra.length ? `${base} · ${extra.join(' · ')}` : base;
}

export function ImportPanel({ onImported }: Props) {
  const t = useT();
  const { toast } = useToast();
  const [sources, setSources] = useState<BrowserImportSource[] | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportResult>>({});

  useEffect(() => {
    let cancelled = false;
    void tryInvoke('import/sources', undefined).then((res) => {
      if (!cancelled) setSources(res ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choiceFor = (id: string): Choice =>
    choices[id] ?? { bookmarks: true, history: true, structure: true, passwords: true, cookies: true };
  const setChoice = (id: string, patch: Partial<Choice>): void =>
    setChoices((prev) => ({ ...prev, [id]: { ...choiceFor(id), ...patch } }));

  const run = async (src: BrowserImportSource): Promise<void> => {
    const c = choiceFor(src.id);
    setRunning(src.id);
    const res = await tryInvoke('import/run', {
      source: src.id,
      bookmarks: c.bookmarks && src.bookmarks,
      history: c.history && src.history,
      structure: c.structure && src.structure,
      passwords: c.passwords && src.passwords,
      cookies: c.cookies && src.cookies,
    });
    setRunning(null);
    if (!res) {
      toast(t('pages.import.failed', { name: src.name }), 'error');
      return;
    }
    if (res.error) {
      toast(res.error, 'error');
      return;
    }
    setResults((prev) => ({ ...prev, [src.id]: res }));
    toast(
      src.id === 'arc'
        ? t('pages.import.arcDone', {
            spaces: res.spaces ?? 0,
            pinned: res.bookmarks,
            favorites: res.favorites ?? 0,
          })
        : t('pages.import.done', { bookmarks: res.bookmarks, history: res.history, name: src.name }),
    );
    onImported?.(src, res);
  };

  if (sources === null) {
    return (
      <div className={styles.emptyNote} data-testid="import-loading">
        {t('pages.import.looking')}
      </div>
    );
  }
  if (sources.length === 0) {
    return (
      <div className={styles.emptyNote} data-testid="import-none">
        {t('pages.import.none')}
      </div>
    );
  }

  return (
    <div className={styles.list} data-testid="import-sources">
      {sources.map((src) => {
        const c = choiceFor(src.id);
        const logo = LOGO[src.id];
        const done = results[src.id];
        const busy = running === src.id;
        const canRun =
          (c.bookmarks && src.bookmarks) ||
          (c.history && src.history) ||
          (c.structure && src.structure) ||
          (c.passwords && src.passwords) ||
          (c.cookies && src.cookies);
        return (
          <div
            key={src.id}
            className={styles.source}
            data-available={src.available}
            data-testid={`import-source-${src.id}`}
          >
            <span className={styles.logo} style={{ background: logo.color }} aria-hidden="true">
              {logo.letter}
            </span>
            <span className={styles.name}>
              {src.name}
              <span className={styles.sub} data-tone={src.error ? 'warning' : undefined}>
                {subtitle(src, t)}
              </span>
              {src.structure ? <span className={styles.hint}>{t('pages.import.structureHint')}</span> : null}
            </span>
            {done ? (
              <span className={styles.result} data-testid="import-result">
                <Icon name="check" size={14} />
                {summary(src, done, t)}
              </span>
            ) : (
              <>
                <span className={styles.checks}>
                  {src.id === 'arc' ? (
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={c.structure}
                        disabled={!src.available || !src.structure || busy}
                        onChange={(e) => setChoice(src.id, { structure: e.target.checked })}
                        data-testid={`import-structure-${src.id}`}
                      />
                      {t('pages.import.structure')}
                    </label>
                  ) : (
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={c.bookmarks}
                        disabled={!src.available || !src.bookmarks || busy}
                        onChange={(e) => setChoice(src.id, { bookmarks: e.target.checked })}
                      />
                      {t('pages.import.bookmarks')}
                    </label>
                  )}
                  <label
                    className={styles.check}
                    title={src.available && !src.history ? t('pages.import.noHistoryDb') : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={c.history && src.history}
                      disabled={!src.available || !src.history || busy}
                      onChange={(e) => setChoice(src.id, { history: e.target.checked })}
                    />
                    {src.available && !src.history
                      ? t('pages.import.historyNone')
                      : t('pages.import.history')}
                  </label>
                  {src.passwords && (
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={c.passwords}
                        disabled={busy}
                        onChange={(e) => setChoice(src.id, { passwords: e.target.checked })}
                        data-testid={`import-passwords-${src.id}`}
                      />
                      {t('pages.import.passwords')}
                    </label>
                  )}
                  {src.cookies && (
                    <label className={styles.check} title={t('pages.import.cookiesHint', { name: src.name })}>
                      <input
                        type="checkbox"
                        checked={c.cookies}
                        disabled={busy}
                        onChange={(e) => setChoice(src.id, { cookies: e.target.checked })}
                        data-testid={`import-cookies-${src.id}`}
                      />
                      {t('pages.import.cookies')}
                    </label>
                  )}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!src.available || busy || !canRun || running !== null}
                  testId={`import-run-${src.id}`}
                  onClick={() => void run(src)}
                >
                  {busy ? <Spinner /> : null}
                  {busy ? t('pages.import.importing') : t('pages.import.import')}
                </Button>
              </>
            )}
          </div>
        );
      })}
      {results.arc && <ArcExtensions />}
    </div>
  );
}
