import { DEFAULT_SITE_SEARCHES, siteSearchProblem, type SiteSearch } from '@vela/shared';
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { useT } from '../../lib/i18n';
import { Button, TextInput } from '../ui';
import styles from './Settings.module.css';

interface Props {
  value: SiteSearch[];
  onChange: (next: SiteSearch[]) => void;
}

const PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

export function SiteSearchEditor({ value, onChange }: Props) {
  const t = useT();
  // Edits stay local until the row is valid, so a half-typed keyword never breaks the command bar.
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  const commit = (next: SiteSearch[]): void => {
    setDraft(next);
    if (next.every((s) => siteSearchProblem(s, next) === null)) onChange(next);
  };
  const patch = (id: string, p: Partial<SiteSearch>): void =>
    commit(draft.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const add = (): void =>
    commit([
      ...draft,
      {
        id: crypto.randomUUID(),
        keyword: '',
        name: '',
        url: 'https://',
        color: PALETTE[draft.length % PALETTE.length] ?? '#6366f1',
        suggestUrl: null,
      },
    ]);

  return (
    <div className={styles.siteList} data-testid="site-search-list">
      {draft.map((s) => {
        const problem = siteSearchProblem(s, draft);
        return (
          <div key={s.id} className={styles.siteRow} data-testid={`site-search-${s.id}`}>
            <label className={styles.siteColor} style={{ background: s.color }}>
              <input
                type="color"
                value={s.color}
                onChange={(e) => patch(s.id, { color: e.target.value })}
                aria-label={s.name}
              />
            </label>
            <TextInput
              className={styles.siteKeyword}
              value={s.keyword}
              onChange={(v) => patch(s.id, { keyword: v })}
              placeholder={t('settings.general.siteSearch.keyword')}
              aria-label={t('settings.general.siteSearch.keyword')}
              testId="site-search-keyword"
            />
            <TextInput
              className={styles.siteName}
              value={s.name}
              onChange={(v) => patch(s.id, { name: v })}
              placeholder={t('settings.general.siteSearch.name')}
              aria-label={t('settings.general.siteSearch.name')}
              testId="site-search-name"
            />
            <TextInput
              className={styles.siteUrl}
              value={s.url}
              onChange={(v) => patch(s.id, { url: v })}
              placeholder={t('settings.general.siteSearch.url')}
              aria-label={t('settings.general.siteSearch.url')}
              testId="site-search-url"
            />
            <Button
              size="sm"
              icon="close"
              aria-label={t('settings.general.siteSearch.remove', { name: s.name || s.keyword })}
              onClick={() => commit(draft.filter((x) => x.id !== s.id))}
            />
            {problem && (
              <span className={styles.siteProblem} role="alert">
                <Icon name="warning" size={12} />
                {t(`settings.general.siteSearch.problem.${problem}`)}
              </span>
            )}
          </div>
        );
      })}
      <div className={styles.siteActions}>
        <Button size="sm" icon="plus" onClick={add} testId="site-search-add">
          {t('settings.general.siteSearch.add')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([...DEFAULT_SITE_SEARCHES])}>
          {t('settings.general.siteSearch.reset')}
        </Button>
      </div>
    </div>
  );
}
