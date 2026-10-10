import type { BrowserImportSource, ImportResult } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import styles from './ImportPanel.module.css';
import { tryInvoke } from './lib';
import { useToast } from './Toast';
import { Button, Spinner } from './ui';

const LOGO: Record<BrowserImportSource['id'], { letter: string; color: string }> = {
  chrome: { letter: 'C', color: '#4285f4' },
  brave: { letter: 'B', color: '#fb542b' },
  edge: { letter: 'E', color: '#0c7fd1' },
};

interface Choice {
  bookmarks: boolean;
  history: boolean;
}

interface Props {
  onImported?: (source: BrowserImportSource, result: ImportResult) => void;
}

export function ImportPanel({ onImported }: Props) {
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

  const choiceFor = (id: string): Choice => choices[id] ?? { bookmarks: true, history: true };
  const setChoice = (id: string, patch: Partial<Choice>): void =>
    setChoices((prev) => ({ ...prev, [id]: { ...choiceFor(id), ...patch } }));

  const run = async (src: BrowserImportSource): Promise<void> => {
    const c = choiceFor(src.id);
    setRunning(src.id);
    const res = await tryInvoke('import/run', { source: src.id, bookmarks: c.bookmarks, history: c.history });
    setRunning(null);
    if (!res) {
      toast(`Couldn't import from ${src.name}`, 'error');
      return;
    }
    setResults((prev) => ({ ...prev, [src.id]: res }));
    toast(`Imported ${res.bookmarks} bookmarks and ${res.history} history entries from ${src.name}`);
    onImported?.(src, res);
  };

  if (sources === null) {
    return (
      <div className={styles.emptyNote} data-testid="import-loading">
        Looking for installed browsers…
      </div>
    );
  }
  if (sources.length === 0) {
    return (
      <div className={styles.emptyNote} data-testid="import-none">
        No Chrome, Brave or Edge profile was found on this Mac. You can still import a Vela export from a
        file.
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
              <span className={styles.sub}>{src.available ? 'Profile found' : 'Not installed'}</span>
            </span>
            {done ? (
              <span className={styles.result} data-testid="import-result">
                <Icon name="check" size={14} />
                {done.bookmarks} bookmarks · {done.history} history
              </span>
            ) : (
              <>
                <span className={styles.checks}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={c.bookmarks}
                      disabled={!src.available || busy}
                      onChange={(e) => setChoice(src.id, { bookmarks: e.target.checked })}
                    />
                    Bookmarks
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={c.history}
                      disabled={!src.available || busy}
                      onChange={(e) => setChoice(src.id, { history: e.target.checked })}
                    />
                    History
                  </label>
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!src.available || busy || (!c.bookmarks && !c.history) || running !== null}
                  testId={`import-run-${src.id}`}
                  onClick={() => void run(src)}
                >
                  {busy ? <Spinner /> : null}
                  {busy ? 'Importing…' : 'Import'}
                </Button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
