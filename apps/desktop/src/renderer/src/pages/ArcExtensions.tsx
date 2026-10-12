import type { ArcExtension } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { useT } from '../lib/i18n';
import { tryInvoke } from './lib';
import { Button, Spinner } from './ui';
import styles from './ArcExtensions.module.css';

type Status = 'idle' | 'installing' | 'installed' | 'failed';

/** After an Arc import: Arc's Web Store extensions, checked, installed again in one go. */
export function ArcExtensions() {
  const t = useT();
  const [list, setList] = useState<ArcExtension[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void tryInvoke('extensions/fromArc', undefined).then((res) => {
      const items = res ?? [];
      setList(items);
      setPicked(new Set(items.filter((e) => !e.installed).map((e) => e.id)));
    });
  }, []);

  if (!list || list.length === 0) return null;
  const todo = list.filter((e) => picked.has(e.id) && !e.installed && status[e.id] !== 'installed');
  const installed = Object.values(status).filter((s) => s === 'installed').length;
  const finished = !running && installed > 0 && todo.length === 0;

  const install = async (): Promise<void> => {
    setRunning(true);
    for (const ext of todo) {
      setStatus((s) => ({ ...s, [ext.id]: 'installing' }));
      const res = await tryInvoke('extensions/installFromStore', { id: ext.id });
      setStatus((s) => ({ ...s, [ext.id]: res?.ok ? 'installed' : 'failed' }));
    }
    setRunning(false);
  };

  return (
    <section className={styles.step} data-testid="arc-extensions">
      <div className={styles.head}>
        <div className={styles.headText}>
          <h3 className={styles.title}>{t('pages.import.arcExtensions.title')}</h3>
          <p className={styles.desc}>{t('pages.import.arcExtensions.desc')}</p>
        </div>
        {finished ? (
          <span className={styles.done}>
            <Icon name="check" size={14} />
            {t('pages.import.arcExtensions.done', { n: installed })}
          </span>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={running || todo.length === 0}
            onClick={() => void install()}
            testId="arc-extensions-install"
          >
            {running ? <Spinner /> : null}
            {running
              ? t('pages.import.arcExtensions.installing')
              : t('pages.import.arcExtensions.install', { n: todo.length })}
          </Button>
        )}
      </div>
      <ul className={styles.list}>
        {list.map((ext) => {
          const st = status[ext.id] ?? 'idle';
          const locked = ext.installed || st !== 'idle' || running;
          return (
            <li key={ext.id} className={styles.item} data-installed={ext.installed ? 'true' : undefined}>
              <label className={styles.label}>
                <input
                  type="checkbox"
                  checked={ext.installed || st === 'installed' || picked.has(ext.id)}
                  disabled={locked}
                  onChange={(e) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(ext.id);
                      else next.delete(ext.id);
                      return next;
                    })
                  }
                />
                {ext.icon ? (
                  <img className={styles.icon} src={ext.icon} alt="" />
                ) : (
                  <span className={styles.iconFallback}>
                    <Icon name="puzzle" size={14} />
                  </span>
                )}
                <span className={styles.name}>{ext.name}</span>
              </label>
              <span className={styles.status} data-status={ext.installed ? 'already' : st}>
                {ext.installed && t('pages.import.arcExtensions.already')}
                {st === 'installing' && <Spinner />}
                {st === 'installed' && (
                  <>
                    <Icon name="check" size={13} />
                    {t('pages.import.arcExtensions.installed')}
                  </>
                )}
                {st === 'failed' && t('pages.import.arcExtensions.failed')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
