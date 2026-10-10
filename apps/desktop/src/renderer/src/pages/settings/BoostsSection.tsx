import { createId } from '@vela/core';
import type { Boost } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { downloadText, now, timeAgo, tryInvoke } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, Card, ConfirmButton, EmptyState, Select, TextArea, TextInput, Toggle } from '../ui';
import styles from './Settings.module.css';

const FONT_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'Site default' },
  { value: 'Inter-like system', label: 'Inter-like system' },
  { value: 'Serif', label: 'Serif' },
  { value: 'Mono', label: 'Mono' },
];

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
      toast("Couldn't save this boost", 'error');
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
    if (ok === null) return toast("Couldn't delete this boost", 'error');
    setItems((prev) => prev?.filter((x) => x.id !== b.id) ?? prev);
    if (editing?.id === b.id) setEditing(null);
    toast(`Boost for ${b.host} deleted`);
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
    if (json === null) return toast("Couldn't export boosts", 'error');
    downloadText('vela-boosts.json', json);
    toast('Boosts exported');
  };

  const importFile = async (file: File): Promise<void> => {
    const json = await file.text();
    const n = await tryInvoke('boosts/import', { json });
    if (n === null) return toast("Couldn't import this file", 'error');
    toast(`Imported ${n} ${n === 1 ? 'boost' : 'boosts'}`);
    await load();
  };

  const list = [...(items ?? [])].sort((a, b) => a.host.localeCompare(b.host));

  return (
    <div className={styles.stack} data-testid="settings-boosts">
      <div className={styles.sectionHead}>
        <p className={styles.desc}>
          Boosts customise a site: inject CSS or JavaScript, swap the font, or hide elements you zapped. They
          run on every page of the host.
        </p>
        <div className={styles.headActions}>
          <Button
            variant="secondary"
            size="sm"
            icon="upload"
            testId="boosts-export"
            disabled={list.length === 0}
            onClick={() => void exportAll()}
          >
            Export
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="download"
            testId="boosts-import-button"
            onClick={() => fileInput.current?.click()}
          >
            Import
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
          Boosts aren’t available in this build yet.
        </div>
      )}

      <Card className={styles.section}>
        <div className={styles.previewRow}>
          <span className={styles.fieldLabel}>New boost</span>
          <div className={styles.inlineForm}>
            <TextInput
              value={newHost}
              onChange={setNewHost}
              placeholder="Host, e.g. news.ycombinator.com"
              aria-label="Host"
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
              Create
            </Button>
          </div>
        </div>
        {items === null ? (
          <EmptyState icon="zap" title="Loading…" />
        ) : list.length === 0 ? (
          <EmptyState
            icon="zap"
            title="No boosts yet"
            hint="Enter a host above to start one, or use Zap from the site menu to hide elements on any page."
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
                      b.zapped.length ? `${b.zapped.length} zapped` : null,
                      b.font ? b.font : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Empty'}{' '}
                    · {timeAgo(b.updatedAt)}
                  </span>
                </span>
                {!b.enabled && <Badge>Off</Badge>}
                <span onClick={(e) => e.stopPropagation()}>
                  <Toggle
                    label={`Enable boost for ${b.host}`}
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
                  Editing
                </span>
                <strong className={styles.mono}>{editing.host}</strong>
              </div>
              <div className={styles.headActions}>
                <Toggle
                  label="Enabled"
                  checked={editing.enabled}
                  onChange={(v) => setEditing({ ...editing, enabled: v })}
                  testId="boost-editor-enabled"
                />
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={saving}
                  testId="boost-save"
                  onClick={() =>
                    void save(editing, `Boost for ${editing.host} saved`).then((ok) => ok && setEditing(null))
                  }
                >
                  Save
                </Button>
              </div>
            </div>
            <div>
              <label className={styles.fieldLabel}>Font</label>
              <Select
                value={editing.font ?? ''}
                options={FONT_PRESETS}
                onChange={(v) => setEditing({ ...editing, font: v || null })}
                aria-label="Font preset"
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
              <label className={styles.fieldLabel}>Zapped elements</label>
              {editing.zapped.length === 0 ? (
                <span className={styles.soon}>
                  Nothing zapped. Use Zap from the site menu to pick elements to hide.
                </span>
              ) : (
                <div className={styles.chips} data-testid="boost-zapped">
                  {editing.zapped.map((sel) => (
                    <span key={sel} className={styles.chip} title={sel}>
                      <span>{sel}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${sel}`}
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
                  label="Delete boost"
                  icon="trash"
                  question={`Delete the boost for ${editing.host}?`}
                  confirmLabel="Delete"
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
