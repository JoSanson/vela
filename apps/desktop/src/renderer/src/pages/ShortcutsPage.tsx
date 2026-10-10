import { SHORTCUTS, SPACE_SHORTCUTS, type ShortcutDef } from '@vela/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { PageShell } from './PageShell';
import styles from './ShortcutsPage.module.css';
import { acceleratorKeys, EmptyState, Keycaps, SearchBox } from './ui';

type Group = ShortcutDef['group'];

const GROUPS: { id: Group; label: string; icon: IconName }[] = [
  { id: 'tabs', label: 'Tabs', icon: 'window' },
  { id: 'navigation', label: 'Navigation', icon: 'globe' },
  { id: 'spaces', label: 'Spaces', icon: 'layers' },
  { id: 'view', label: 'View', icon: 'sidebar' },
  { id: 'page', label: 'Page', icon: 'book' },
  { id: 'window', label: 'Window', icon: 'expand' },
];

const ALL: ShortcutDef[] = [
  ...SHORTCUTS,
  ...SPACE_SHORTCUTS.map((s): ShortcutDef => ({ ...s, group: 'spaces' })),
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
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

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
  }, [q]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <PageShell
      title="Keyboard shortcuts"
      icon="keyboard"
      subtitle={`${total} ${total === 1 ? 'shortcut' : 'shortcuts'}`}
      testId="page-shortcuts"
      maxWidth={960}
      toolbar={
        <div style={{ flex: 1 }}>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Filter by action or key"
            testId="shortcuts-search"
            autoFocus
          />
        </div>
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
              {g.items.map((s) => (
                <div key={s.id} className={styles.shortcut} data-testid="shortcut-row">
                  <span className={styles.label}>{highlight(s.label, q)}</span>
                  <Keycaps accelerator={s.accelerator} />
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
