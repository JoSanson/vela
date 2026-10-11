import {
  acceleratorFromEvent,
  ALL_SHORTCUTS,
  findConflict,
  resolveShortcuts,
  type ShortcutDef,
} from '@vela/shared';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { vela } from '../lib/api';
import { useSnapshot } from './lib';
import { PageShell } from './PageShell';
import styles from './ShortcutsPage.module.css';
import { useToast } from './Toast';
import { acceleratorKeys, Button, EmptyState, Keycaps, SearchBox } from './ui';

type Group = ShortcutDef['group'];

const GROUPS: { id: Group; label: string; icon: IconName }[] = [
  { id: 'tabs', label: 'Tabs', icon: 'window' },
  { id: 'navigation', label: 'Navigation', icon: 'globe' },
  { id: 'spaces', label: 'Spaces', icon: 'layers' },
  { id: 'view', label: 'View', icon: 'sidebar' },
  { id: 'page', label: 'Page', icon: 'book' },
  { id: 'window', label: 'Window', icon: 'expand' },
];

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function ShortcutsPage() {
  const { snap, setPrefs } = useSnapshot();
  const { toast } = useToast();
  const overrides = useMemo(() => snap?.prefs.shortcutOverrides ?? {}, [snap?.prefs.shortcutOverrides]);
  const ALL = useMemo(() => resolveShortcuts(overrides), [overrides]);
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null);
  const q = query.trim().toLowerCase();
  const customized = Object.keys(overrides).length;

  const save = useCallback(
    (id: string, accelerator: string | null): void => {
      const next = { ...overrides };
      const def = ALL_SHORTCUTS.find((d) => d.id === id);
      if (accelerator === null || accelerator === def?.accelerator) delete next[id];
      else next[id] = accelerator;
      void setPrefs({ shortcutOverrides: next }).then((ok) => {
        if (!ok) toast("Couldn't save the shortcut", 'error');
      });
    },
    [overrides, setPrefs, toast],
  );

  // While a row records, the next chord becomes its accelerator; Escape cancels, Backspace resets.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        save(recording, null);
        setRecording(null);
        return;
      }
      const acc = acceleratorFromEvent(e, vela.platform);
      if (!acc) return;
      const clash = findConflict(acc, ALL, recording);
      if (clash) {
        setProblem({
          id: recording,
          text: `${acceleratorKeys(acc).join(' ')} is already used by “${clash.label}”`,
        });
        return;
      }
      setProblem(null);
      save(recording, acc);
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, ALL, save]);

  const groups = useMemo(() => {
    return GROUPS.map((g) => ({
      ...g,
      items: ALL.filter((s) => {
        if (s.group !== g.id) return false;
        if (!q) return true;
        const keys = acceleratorKeys(s.accelerator).join(' ').toLowerCase();
        return (
          s.label.toLowerCase().includes(q) ||
          s.accelerator.toLowerCase().includes(q) ||
          keys.includes(q) ||
          g.label.toLowerCase().includes(q)
        );
      }),
    })).filter((g) => g.items.length > 0);
  }, [q, ALL]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <PageShell
      title="Keyboard shortcuts"
      icon="keyboard"
      subtitle={`${total} ${total === 1 ? 'shortcut' : 'shortcuts'}${customized ? `, ${customized} customized` : ''}. Click a shortcut to change it.`}
      testId="page-shortcuts"
      maxWidth={960}
      toolbar={
        <>
          <div style={{ flex: 1 }}>
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Filter by action or key"
              testId="shortcuts-search"
              autoFocus
            />
          </div>
          {customized > 0 && (
            <Button
              variant="ghost"
              testId="shortcuts-reset-all"
              onClick={() => void setPrefs({ shortcutOverrides: {} })}
            >
              Reset all
            </Button>
          )}
        </>
      }
    >
      {groups.length === 0 ? (
        <EmptyState icon="keyboard" title="No shortcut matches" hint={`Nothing matches “${query.trim()}”.`} />
      ) : (
        <div className={styles.groups}>
          {groups.map((g) => (
            <section key={g.id} className={styles.group} data-testid={`shortcuts-group-${g.id}`}>
              <div className={styles.groupHead}>
                <Icon name={g.icon} size={14} />
                {g.label}
              </div>
              {g.items.map((s) => {
                const isRecording = recording === s.id;
                const changed = s.id in overrides;
                return (
                  <div
                    key={s.id}
                    className={`${styles.shortcut} ${isRecording ? styles.recording : ''}`}
                    data-testid="shortcut-row"
                    data-shortcut-id={s.id}
                  >
                    <span className={styles.label}>
                      {highlight(s.label, q)}
                      {changed && <span className={styles.custom}>custom</span>}
                    </span>
                    {problem?.id === s.id && <span className={styles.problem}>{problem.text}</span>}
                    <button
                      className={styles.keys}
                      onClick={() => {
                        setProblem(null);
                        setRecording(isRecording ? null : s.id);
                      }}
                      aria-label={`Change shortcut for ${s.label}`}
                      aria-pressed={isRecording}
                      data-testid="shortcut-keys"
                    >
                      {isRecording ? (
                        <span className={styles.listening}>Press keys… (Esc cancels, ⌫ resets)</span>
                      ) : (
                        <Keycaps accelerator={s.accelerator} />
                      )}
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
