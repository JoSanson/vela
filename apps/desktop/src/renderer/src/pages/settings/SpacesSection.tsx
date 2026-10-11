import { createProfile, type Profile } from '@vela/core';
import { useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { useT } from '../../lib/i18n';
import { useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, Card, ConfirmButton, EmptyState, Select, TextInput } from '../ui';
import styles from './Settings.module.css';

const COLORS = ['#5b6cff', '#ff7a59', '#1fb58b', '#f25c78', '#2f80ed', '#9a5bff', '#e0a526', '#3a3d4a'];

export function SpacesSection() {
  const { snap, dispatch } = useSnapshot();
  const { toast } = useToast();
  const t = useT();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0] ?? '#5b6cff');
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null);

  const state = snap?.state;
  const spaces = state ? state.spaceOrder.flatMap((id) => (state.spaces[id] ? [state.spaces[id]] : [])) : [];
  const profiles: Profile[] = state ? Object.values(state.profiles) : [];
  const numberFormat = new Intl.NumberFormat(t.locale);

  const createNew = async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;
    const ok = await dispatch({ type: 'profile/create', profile: createProfile(name, newColor) });
    if (!ok) return toast(t('settings.spaces.error.create'), 'error');
    setNewName('');
    toast(t('settings.spaces.created', { name }));
  };

  const saveEdit = async (): Promise<void> => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    const ok = await dispatch({
      type: 'profile/update',
      id: editing.id,
      patch: { name, color: editing.color },
    });
    if (!ok) return toast(t('settings.spaces.error.rename'), 'error');
    setEditing(null);
  };

  const remove = async (p: Profile): Promise<void> => {
    const ok = await dispatch({ type: 'profile/delete', id: p.id });
    if (!ok) return toast(t('settings.spaces.error.delete'), 'error');
    toast(t('settings.spaces.deleted', { name: p.name }));
  };

  const assign = async (spaceId: string, profileId: string): Promise<void> => {
    const ok = await dispatch({
      type: 'space/update',
      id: spaceId,
      patch: { profileId: profileId === '' ? null : profileId },
    });
    if (!ok) toast(t('settings.spaces.error.assign'), 'error');
  };

  const profileOptions = [
    { value: '', label: t('settings.spaces.defaultProfile') },
    ...profiles.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className={styles.stack} data-testid="settings-spaces">
      <p className={styles.desc}>{t('settings.spaces.desc')}</p>

      <p className={styles.h3}>{t('settings.spaces.title')}</p>
      <Card testId="settings-spaces-table">
        {spaces.length === 0 ? (
          <EmptyState
            icon="layers"
            title={t('settings.spaces.empty.title')}
            hint={t('settings.spaces.empty.hint')}
          />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('settings.spaces.col.space')}</th>
                <th>{t('settings.spaces.col.profile')}</th>
                <th style={{ textAlign: 'right' }}>{t('settings.spaces.col.tabs')}</th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((s) => {
                const style = { '--sf': s.theme.from, '--st': s.theme.to } as CSSProperties;
                const tabCount = s.today.length + s.pinned.length;
                return (
                  <tr key={s.id} data-testid="settings-space-row">
                    <td>
                      <span className={styles.spaceRow}>
                        <span className={styles.spaceEmoji} style={style} aria-hidden="true">
                          {s.emoji}
                        </span>
                        {s.name}
                        {s.id === state?.activeSpaceId && (
                          <Badge tone="accent">{t('settings.spaces.active')}</Badge>
                        )}
                      </span>
                    </td>
                    <td>
                      <Select
                        value={s.profileId ?? ''}
                        options={profileOptions}
                        onChange={(v) => void assign(s.id, v)}
                        aria-label={t('settings.spaces.profileFor', { name: s.name })}
                        data-testid="settings-space-profile"
                      />
                    </td>
                    <td style={{ textAlign: 'right' }} className={styles.mono}>
                      {numberFormat.format(tabCount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <p className={styles.h3}>{t('settings.spaces.profiles')}</p>
      <Card testId="settings-profiles">
        {profiles.length === 0 ? (
          <div className={styles.hintBox}>
            <Icon name="users" size={14} />
            {t('settings.spaces.profiles.empty')}
          </div>
        ) : (
          <table className={styles.table}>
            <tbody>
              {profiles.map((p) => {
                const used = spaces.filter((s) => s.profileId === p.id).length;
                const isEditing = editing?.id === p.id;
                return (
                  <tr key={p.id} data-testid="settings-profile-row">
                    <td style={{ width: 24 }}>
                      <span
                        className={styles.profileDot}
                        style={{ background: isEditing ? editing.color : p.color, display: 'inline-block' }}
                      />
                    </td>
                    <td>
                      {isEditing ? (
                        <div className={styles.inlineForm}>
                          <TextInput
                            value={editing.name}
                            onChange={(v) => setEditing({ ...editing, name: v })}
                            aria-label={t('settings.spaces.profileName')}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveEdit();
                              if (e.key === 'Escape') setEditing(null);
                            }}
                          />
                          <span className={styles.colorRow}>
                            {COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={styles.swatch}
                                style={{ background: c, color: c }}
                                aria-label={t('settings.spaces.color', { color: c })}
                                aria-pressed={editing.color === c}
                                onClick={() => setEditing({ ...editing, color: c })}
                              />
                            ))}
                          </span>
                        </div>
                      ) : (
                        <>
                          {p.name}{' '}
                          <span className={styles.boostMeta}>
                            · {t('settings.spaces.spacesCount', { n: used })}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      <div className={styles.cellActions}>
                        {isEditing ? (
                          <>
                            <Button variant="primary" size="sm" onClick={() => void saveEdit()}>
                              {t('common.save')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                              {t('common.cancel')}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon="edit"
                              aria-label={t('settings.spaces.rename')}
                              title={t('settings.spaces.rename')}
                              testId="profile-edit"
                              onClick={() => setEditing({ id: p.id, name: p.name, color: p.color })}
                            />
                            <ConfirmButton
                              label=""
                              icon="trash"
                              size="sm"
                              question={
                                used > 0
                                  ? t('settings.spaces.detachQuestion', { n: used })
                                  : t('settings.spaces.deleteQuestion')
                              }
                              confirmLabel={t('common.delete')}
                              testId="profile-delete"
                              onConfirm={() => void remove(p)}
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div
          className={styles.previewRow}
          style={{ borderTop: profiles.length ? '1px solid var(--p-border)' : undefined }}
        >
          <span className={styles.fieldLabel}>{t('settings.spaces.newProfile')}</span>
          <div className={styles.inlineForm}>
            <TextInput
              value={newName}
              onChange={setNewName}
              placeholder={t('settings.spaces.newProfile.placeholder')}
              aria-label={t('settings.spaces.newProfile.label')}
              testId="profile-name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createNew();
              }}
            />
            <span className={styles.colorRow}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={styles.swatch}
                  style={{ background: c, color: c }}
                  aria-label={t('settings.spaces.color', { color: c })}
                  aria-pressed={newColor === c}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </span>
            <Button
              variant="primary"
              icon="plus"
              disabled={!newName.trim()}
              testId="profile-create"
              onClick={() => void createNew()}
            >
              {t('settings.spaces.create')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
