import type { BrowserImportSource, BrowserImportSourceId, ImportResult } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
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
}

interface Props {
  onImported?: (source: BrowserImportSource, result: ImportResult) => void;
}

function subtitle(src: BrowserImportSource): string {
  if (src.error) return src.error;
  if (!src.available) return 'Not installed';
  if (src.id === 'arc') {
    return src.history ? 'Sidebar and history found' : 'Sidebar found, no history database';
  }
  if (src.id === 'safari') return 'Bookmarks and history found';
  return 'Profile found';
}

function summary(src: BrowserImportSource, r: ImportResult): string {
  if (src.id === 'arc') {
    return `${r.spaces ?? 0} spaces · ${r.bookmarks} pinned · ${r.todayTabs ?? 0} tabs · ${r.favorites ?? 0} favorites · ${r.history} history`;
  }
  return `${r.bookmarks} bookmarks · ${r.history} history`;
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

  const choiceFor = (id: string): Choice =>
    choices[id] ?? { bookmarks: true, history: true, structure: true };
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
    });
    setRunning(null);
    if (!res) {
      toast(`Couldn't import from ${src.name}`, 'error');
      return;
    }
    if (res.error) {
      toast(res.error, 'error');
      return;
    }
    setResults((prev) => ({ ...prev, [src.id]: res }));
    toast(
      src.id === 'arc'
        ? `Recreated ${res.spaces ?? 0} spaces with ${res.bookmarks} pinned tabs and ${res.favorites ?? 0} favorites from Arc`
        : `Imported ${res.bookmarks} bookmarks and ${res.history} history entries from ${src.name}`,
    );
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
        No Arc, Chrome, Brave, Edge, Safari or Firefox data was found on this Mac. You can still import a Vela
        export from a file.
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
          (c.bookmarks && src.bookmarks) || (c.history && src.history) || (c.structure && src.structure);
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
                {subtitle(src)}
              </span>
              {src.structure ? (
                <span className={styles.hint}>
                  Imports the whole sidebar: every Space with its name, emoji and colour, pinned tabs and
                  folders in order, open tabs, and favorites.
                </span>
              ) : null}
            </span>
            {done ? (
              <span className={styles.result} data-testid="import-result">
                <Icon name="check" size={14} />
                {summary(src, done)}
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
                      Recreate Spaces, pinned tabs and favorites
                    </label>
                  ) : (
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={c.bookmarks}
                        disabled={!src.available || !src.bookmarks || busy}
                        onChange={(e) => setChoice(src.id, { bookmarks: e.target.checked })}
                      />
                      Bookmarks
                    </label>
                  )}
                  <label
                    className={styles.check}
                    title={src.available && !src.history ? 'No history database found' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={c.history && src.history}
                      disabled={!src.available || !src.history || busy}
                      onChange={(e) => setChoice(src.id, { history: e.target.checked })}
                    />
                    {src.available && !src.history ? 'History (none found)' : 'History'}
                  </label>
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!src.available || busy || !canRun || running !== null}
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
