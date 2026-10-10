import { createProfile, type Profile } from '@vela/core';
import { useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, Card, ConfirmButton, EmptyState, Select, TextInput } from '../ui';
import styles from './Settings.module.css';

const COLORS = ['#5b6cff', '#ff7a59', '#1fb58b', '#f25c78', '#2f80ed', '#9a5bff', '#e0a526', '#3a3d4a'];

export function SpacesSection() {
  const { snap, dispatch } = useSnapshot();
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0] ?? '#5b6cff');
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null);

  const state = snap?.state;
  const spaces = state ? state.spaceOrder.flatMap((id) => (state.spaces[id] ? [state.spaces[id]] : [])) : [];
  const profiles: Profile[] = state ? Object.values(state.profiles) : [];

  const fail = (what: string): void => toast(`Couldn't ${what}`, 'error');

  const createNew = async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;
    const ok = await dispatch({ type: 'profile/create', profile: createProfile(name, newColor) });
    if (!ok) return fail('create the profile');
    setNewName('');
    toast(`Profile “${name}” created`);
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
    if (!ok) return fail('rename the profile');
    setEditing(null);
  };

  const remove = async (p: Profile): Promise<void> => {
    const ok = await dispatch({ type: 'profile/delete', id: p.id });
    if (!ok) return fail('delete the profile');
    toast(`Profile “${p.name}” deleted; its spaces now use the default profile`);
  };

  const assign = async (spaceId: string, profileId: string): Promise<void> => {
    const ok = await dispatch({
      type: 'space/update',
      id: spaceId,
      patch: { profileId: profileId === '' ? null : profileId },
    });
    if (!ok) fail('change the space profile');
  };

  const profileOptions = [
    { value: '', label: 'Default profile' },
    ...profiles.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className={styles.stack} data-testid="settings-spaces">
      <p className={styles.desc}>
        Each space can run in its own profile: separate cookies, logins and storage. Spaces without a profile
        share the default one.
      </p>

      <p className={styles.h3}>Spaces</p>
      <Card testId="settings-spaces-table">
        {spaces.length === 0 ? (
          <EmptyState icon="layers" title="No spaces" hint="Create a space from the sidebar." />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Space</th>
                <th>Profile</th>
                <th style={{ textAlign: 'right' }}>Tabs</th>
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
                        {s.id === state?.activeSpaceId && <Badge tone="accent">Active</Badge>}
                      </span>
                    </td>
                    <td>
                      <Select
                        value={s.profileId ?? ''}
                        options={profileOptions}
                        onChange={(v) => void assign(s.id, v)}
                        aria-label={`Profile for ${s.name}`}
                        data-testid="settings-space-profile"
                      />
                    </td>
                    <td style={{ textAlign: 'right' }} className={styles.mono}>
                      {tabCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <p className={styles.h3}>Profiles</p>
      <Card testId="settings-profiles">
        {profiles.length === 0 ? (
          <div className={styles.hintBox}>
            <Icon name="users" size={14} />
            No custom profiles yet. Create one below to keep a work account separate from a personal one.
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
                            aria-label="Profile name"
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
                                aria-label={`Color ${c}`}
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
                            · {used} {used === 1 ? 'space' : 'spaces'}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      <div className={styles.cellActions}>
                        {isEditing ? (
                          <>
                            <Button variant="primary" size="sm" onClick={() => void saveEdit()}>
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon="edit"
                              aria-label="Rename"
                              title="Rename"
                              testId="profile-edit"
                              onClick={() => setEditing({ id: p.id, name: p.name, color: p.color })}
                            />
                            <ConfirmButton
                              label=""
                              icon="trash"
                              size="sm"
                              question={
                                used > 0
                                  ? `Detach ${used} ${used === 1 ? 'space' : 'spaces'} and delete?`
                                  : 'Delete?'
                              }
                              confirmLabel="Delete"
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
          <span className={styles.fieldLabel}>New profile</span>
          <div className={styles.inlineForm}>
            <TextInput
              value={newName}
              onChange={setNewName}
              placeholder="Profile name, e.g. Work"
              aria-label="New profile name"
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
                  aria-label={`Color ${c}`}
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
              Create
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
