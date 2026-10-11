import { createId } from '@vela/core';
import type { Boost, Translator } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useT } from '../../lib/i18n';
import { downloadText, now, timeAgo, tryInvoke } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, Card, ConfirmButton, EmptyState, Select, TextArea, TextInput, Toggle } from '../ui';
import styles from './Settings.module.css';

function fontPresets(t: Translator): { value: string; label: string }[] {
  return [
    { value: '', label: t('settings.boosts.font.siteDefault') },
    { value: 'Inter-like system', label: t('settings.boosts.font.interLike') },
    { value: 'Serif', label: t('settings.boosts.font.serif') },
    { value: 'Mono', label: t('settings.boosts.font.mono') },
  ];
}

function newBoost(host: string): Boost {
  return {
    id: createId(),
    host,
    enabled: true,
    css: '',
    js: '',
    zapped: [],
    font: null,
    updatedAt: now(),
  };
}

export function BoostsSection() {
  const { toast } = useToast();
  const t = useT();
  const [items, setItems] = useState<Boost[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<Boost | null>(null);
  const [newHost, setNewHost] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async (): Promise<void> => {
    const res = await tryInvoke('boosts/list', undefined);
    if (res === null) setUnavailable(true);
    setItems(res ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    void tryInvoke('boosts/list', undefined).then((res) => {
      if (cancelled) return;
      if (res === null) setUnavailable(true);
      setItems(res ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (b: Boost, note?: string): Promise<boolean> => {
    setSaving(true);
    const next = { ...b, updatedAt: now() };
    const ok = await tryInvoke('boosts/save', next);
    setSaving(false);
    if (ok === null) {
      toast(t('settings.boosts.saveError'), 'error');
      return false;
    }
    setItems((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === next.id)
        ? list.map((x) => (x.id === next.id ? next : x))
        : [...list, next];
    });
    if (note) toast(note);
    return true;
  };

  const remove = async (b: Boost): Promise<void> => {
    const ok = await tryInvoke('boosts/delete', { id: b.id });
    if (ok === null) return toast(t('settings.boosts.deleteError'), 'error');
    setItems((prev) => prev?.filter((x) => x.id !== b.id) ?? prev);
    if (editing?.id === b.id) setEditing(null);
    toast(t('settings.boosts.deleted', { host: b.host }));
  };

  const create = (): void => {
    const host = newHost
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '');
    if (!host) return;
    const existing = items?.find((b) => b.host === host);
    setEditing(existing ?? newBoost(host));
    setNewHost('');
  };

  const exportAll = async (): Promise<void> => {
    const json = await tryInvoke('boosts/export', undefined);
    if (json === null) return toast(t('settings.boosts.exportError'), 'error');
    downloadText('vela-boosts.json', json);
    toast(t('settings.boosts.exported'));
  };

  const importFile = async (file: File): Promise<void> => {
    const json = await file.text();
    const n = await tryInvoke('boosts/import', { json });
    if (n === null) return toast(t('settings.boosts.importError'), 'error');
    toast(t('settings.boosts.imported', { n }));
    await load();
  };

  const list = [...(items ?? [])].sort((a, b) => a.host.localeCompare(b.host));

  return (
    <div className={styles.stack} data-testid="settings-boosts">
      <div className={styles.sectionHead}>
        <p className={styles.desc}>{t('settings.boosts.desc')}</p>
        <div className={styles.headActions}>
          <Button
            variant="secondary"
            size="sm"
            icon="upload"
            testId="boosts-export"
            disabled={list.length === 0}
            onClick={() => void exportAll()}
          >
            {t('settings.boosts.export')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="download"
            testId="boosts-import-button"
            onClick={() => fileInput.current?.click()}
          >
            {t('settings.boosts.import')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className={styles.hidden}
            data-testid="boosts-import"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
      </div>

      {unavailable && (
        <div className={styles.hintBox}>
          <Icon name="warning" size={14} />
          {t('settings.boosts.unavailable')}
        </div>
      )}

      <Card className={styles.section}>
        <div className={styles.previewRow}>
          <span className={styles.fieldLabel}>{t('settings.boosts.new')}</span>
          <div className={styles.inlineForm}>
            <TextInput
              value={newHost}
              onChange={setNewHost}
              placeholder={t('settings.boosts.host.placeholder')}
              aria-label={t('settings.boosts.host')}
              testId="boost-host"
              onKeyDown={(e) => {
                if (e.key === 'Enter') create();
              }}
            />
            <Button
              variant="primary"
              icon="plus"
              disabled={!newHost.trim()}
              testId="boost-create"
              onClick={create}
            >
              {t('settings.boosts.create')}
            </Button>
          </div>
        </div>
        {items === null ? (
          <EmptyState icon="zap" title={t('common.loading')} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="zap"
            title={t('settings.boosts.empty.title')}
            hint={t('settings.boosts.empty.hint')}
            testId="boosts-empty"
          />
        ) : (
          <div className={styles.boostList} data-testid="boosts-list">
            {list.map((b) => (
              <div
                key={b.id}
                className={styles.boostRow}
                aria-current={editing?.id === b.id}
                data-testid="boost-row"
                onClick={() => setEditing(b)}
              >
                <Icon
                  name="zap"
                  size={15}
                  style={{ color: b.enabled ? 'var(--p-accent)' : 'var(--p-faint)' }}
                />
                <span className={styles.boostHost}>
                  {b.host}
                  <span className={styles.boostMeta}>
                    {[
                      b.css.trim() ? 'CSS' : null,
                      b.js.trim() ? 'JS' : null,
                      b.zapped.length ? t('settings.boosts.meta.zapped', { n: b.zapped.length }) : null,
                      b.font ? b.font : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || t('settings.boosts.meta.empty')}{' '}
                    · {timeAgo(b.updatedAt)}
                  </span>
                </span>
                {!b.enabled && <Badge>{t('settings.boosts.off')}</Badge>}
                <span onClick={(e) => e.stopPropagation()}>
                  <Toggle
                    label={t('settings.boosts.enableFor', { host: b.host })}
                    checked={b.enabled}
                    onChange={(v) => void save({ ...b, enabled: v })}
                    testId="boost-toggle"
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <Card className={styles.section} testId="boost-editor">
          <div className={styles.editor}>
            <div className={styles.editorHead}>
              <div>
                <span className={styles.fieldLabel} style={{ marginBottom: 2 }}>
                  {t('settings.boosts.editing')}
                </span>
                <strong className={styles.mono}>{editing.host}</strong>
              </div>
              <div className={styles.headActions}>
                <Toggle
                  label={t('settings.boosts.enabled')}
                  checked={editing.enabled}
                  onChange={(v) => setEditing({ ...editing, enabled: v })}
                  testId="boost-editor-enabled"
                />
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  {t('common.close')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={saving}
                  testId="boost-save"
                  onClick={() =>
                    void save(editing, t('settings.boosts.saved', { host: editing.host })).then(
                      (ok) => ok && setEditing(null),
                    )
                  }
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
            <div>
              <label className={styles.fieldLabel}>{t('settings.boosts.font')}</label>
              <Select
                value={editing.font ?? ''}
                options={fontPresets(t)}
                onChange={(v) => setEditing({ ...editing, font: v || null })}
                aria-label={t('settings.boosts.font.preset')}
                testId="boost-font"
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>CSS</label>
              <TextArea
                value={editing.css}
                onChange={(v) => setEditing({ ...editing, css: v })}
                placeholder={'body { max-width: 72ch; margin: 0 auto; }'}
                rows={6}
                testId="boost-css"
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>JavaScript</label>
              <TextArea
                value={editing.js}
                onChange={(v) => setEditing({ ...editing, js: v })}
                placeholder={"document.querySelector('.banner')?.remove();"}
                rows={5}
                testId="boost-js"
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>{t('settings.boosts.zapped')}</label>
              {editing.zapped.length === 0 ? (
                <span className={styles.soon}>{t('settings.boosts.zapped.empty')}</span>
              ) : (
                <div className={styles.chips} data-testid="boost-zapped">
                  {editing.zapped.map((sel) => (
                    <span key={sel} className={styles.chip} title={sel}>
                      <span>{sel}</span>
                      <button
                        type="button"
                        aria-label={t('settings.boosts.zapped.remove', { selector: sel })}
                        onClick={() =>
                          setEditing({ ...editing, zapped: editing.zapped.filter((s) => s !== sel) })
                        }
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {items?.some((b) => b.id === editing.id) && (
              <div>
                <ConfirmButton
                  label={t('settings.boosts.delete')}
                  icon="trash"
                  question={t('settings.boosts.deleteQuestion', { host: editing.host })}
                  confirmLabel={t('common.delete')}
                  testId="boost-delete"
                  onConfirm={() => void remove(editing)}
                />
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
