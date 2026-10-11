import { compileAtcPattern, createId, matchAtc, type AtcRule } from '@vela/core';
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { useT } from '../../lib/i18n';
import { useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, Card, EmptyState, Select, TextInput, Toggle } from '../ui';
import styles from './Settings.module.css';

interface Draft {
  id: string | null;
  pattern: string;
  spaceId: string;
}

export function AtcSection() {
  const { snap, dispatch } = useSnapshot();
  const { toast } = useToast();
  const t = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testUrl, setTestUrl] = useState('');

  const state = snap?.state;
  const rules = state?.atcRules ?? [];
  const spaces = state ? state.spaceOrder.flatMap((id) => (state.spaces[id] ? [state.spaces[id]] : [])) : [];
  const spaceName = (id: string): string => state?.spaces[id]?.name ?? t('settings.atc.unknownSpace');
  const spaceOptions = spaces.map((s) => ({ value: s.id, label: `${s.emoji} ${s.name}` }));

  const persist = async (next: AtcRule[]): Promise<boolean> => {
    const ok = await dispatch({ type: 'atc/set', rules: next });
    if (!ok) toast(t('settings.atc.saveError'), 'error');
    return ok;
  };

  const startAdd = (): void => setDraft({ id: null, pattern: '', spaceId: spaces[0]?.id ?? '' });
  const startEdit = (r: AtcRule): void => setDraft({ id: r.id, pattern: r.pattern, spaceId: r.spaceId });

  const draftValid =
    !!draft &&
    draft.pattern.trim().length > 0 &&
    !!draft.spaceId &&
    compileAtcPattern(draft.pattern) !== null;

  const saveDraft = async (): Promise<void> => {
    if (!draft || !draftValid) return;
    const pattern = draft.pattern.trim();
    const next = draft.id
      ? rules.map((r) => (r.id === draft.id ? { ...r, pattern, spaceId: draft.spaceId } : r))
      : [...rules, { id: createId(), pattern, spaceId: draft.spaceId, enabled: true }];
    if (await persist(next)) setDraft(null);
  };

  const toggle = (r: AtcRule, enabled: boolean): void => {
    void persist(rules.map((x) => (x.id === r.id ? { ...x, enabled } : x)));
  };
  const remove = (r: AtcRule): void => {
    void persist(rules.filter((x) => x.id !== r.id));
  };
  const move = (index: number, delta: number): void => {
    const to = index + delta;
    if (to < 0 || to >= rules.length) return;
    const next = [...rules];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(to, 0, item);
    void persist(next);
  };

  const probe = testUrl.trim();
  const probeUrl = probe && !/^[a-z][a-z0-9+.-]*:\/\//i.test(probe) ? `https://${probe}` : probe;
  const matchedSpace = probeUrl ? matchAtc(rules, probeUrl) : null;
  const matchedRule = probeUrl
    ? rules.find((r) => r.enabled && (compileAtcPattern(r.pattern)?.test(probeUrl.toLowerCase()) ?? false))
    : undefined;

  return (
    <div className={styles.stack} data-testid="settings-atc">
      <p className={styles.desc}>
        {t('settings.atc.desc.intro')} {t('settings.atc.desc.patterns')}{' '}
        <code className={styles.mono}>github.com</code> {t('settings.atc.desc.hostHint')},{' '}
        <code className={styles.mono}>*.google.com/*</code>, {t('settings.atc.desc.orFullUrl')}{' '}
        <code className={styles.mono}>*</code>.
      </p>

      <div className={styles.sectionHead}>
        <p className={styles.h3}>{t('settings.atc.rules')}</p>
        <div className={styles.headActions}>
          <Button
            variant="primary"
            size="sm"
            icon="plus"
            testId="atc-add"
            disabled={spaces.length === 0}
            onClick={startAdd}
          >
            {t('settings.atc.add')}
          </Button>
        </div>
      </div>

      <Card className={styles.section} testId="atc-rules">
        {draft && (
          <div className={styles.editor} data-testid="atc-editor">
            <div className={styles.editorHead}>
              <span className={styles.fieldLabel} style={{ margin: 0 }}>
                {draft.id ? t('settings.atc.editRule') : t('settings.atc.newRule')}
              </span>
            </div>
            <div className={styles.inlineForm}>
              <TextInput
                value={draft.pattern}
                onChange={(v) => setDraft({ ...draft, pattern: v })}
                placeholder={t('settings.atc.pattern.placeholder')}
                aria-label={t('settings.atc.pattern')}
                autoFocus
                testId="atc-pattern"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveDraft();
                  if (e.key === 'Escape') setDraft(null);
                }}
              />
              <Icon name="forward" size={14} style={{ color: 'var(--p-faint)' }} />
              <Select
                value={draft.spaceId}
                options={spaceOptions}
                onChange={(v) => setDraft({ ...draft, spaceId: v })}
                aria-label={t('settings.atc.targetSpace')}
                testId="atc-space"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={!draftValid}
                testId="atc-save"
                onClick={() => void saveDraft()}
              >
                {draft.id ? t('common.save') : t('settings.atc.addShort')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
        {rules.length === 0 ? (
          <EmptyState
            icon="send"
            title={t('settings.atc.empty.title')}
            hint={t('settings.atc.empty.hint')}
            testId="atc-empty"
          />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>{t('settings.atc.col.on')}</th>
                <th>{t('settings.atc.pattern')}</th>
                <th>{t('settings.atc.opensIn')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr
                  key={r.id}
                  className={styles.ruleRow}
                  data-enabled={r.enabled}
                  data-match={matchedRule?.id === r.id}
                  data-testid="atc-rule"
                >
                  <td>
                    <Toggle
                      label={t('settings.atc.enable', { pattern: r.pattern })}
                      checked={r.enabled}
                      onChange={(v) => toggle(r, v)}
                      testId="atc-toggle"
                    />
                  </td>
                  <td className={styles.mono}>{r.pattern}</td>
                  <td>
                    <Badge tone="accent">
                      {state?.spaces[r.spaceId]?.emoji} {spaceName(r.spaceId)}
                    </Badge>
                  </td>
                  <td>
                    <div className={styles.cellActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="arrowUp"
                        aria-label={t('settings.atc.moveUp')}
                        title={t('settings.atc.moveUp')}
                        disabled={i === 0}
                        testId="atc-up"
                        onClick={() => move(i, -1)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="arrowDown"
                        aria-label={t('settings.atc.moveDown')}
                        title={t('settings.atc.moveDown')}
                        disabled={i === rules.length - 1}
                        testId="atc-down"
                        onClick={() => move(i, 1)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="edit"
                        aria-label={t('settings.atc.edit')}
                        title={t('settings.atc.edit')}
                        testId="atc-edit"
                        onClick={() => startEdit(r)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                        testId="atc-delete"
                        onClick={() => remove(r)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className={styles.h3}>{t('settings.atc.test.title')}</p>
      <Card>
        <div className={styles.previewRow}>
          <TextInput
            value={testUrl}
            onChange={setTestUrl}
            placeholder={t('settings.atc.test.placeholder')}
            aria-label={t('settings.atc.test.label')}
            testId="atc-test"
          />
          <div className={styles.match} data-testid="atc-test-result" aria-live="polite">
            {!probe ? (
              <span className={styles.soon}>{t('settings.atc.test.empty')}</span>
            ) : matchedSpace && matchedRule ? (
              <>
                <Icon name="check" size={14} style={{ color: 'var(--p-success)' }} />
                {t('settings.atc.opensIn')} <Badge tone="accent">{spaceName(matchedSpace)}</Badge>
                <span className={styles.soon}>
                  {t('settings.atc.test.via')} <code className={styles.mono}>{matchedRule.pattern}</code>
                </span>
              </>
            ) : (
              <>
                <Icon name="globe" size={14} style={{ color: 'var(--p-faint)' }} />
                {t('settings.atc.test.noMatch')}
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
