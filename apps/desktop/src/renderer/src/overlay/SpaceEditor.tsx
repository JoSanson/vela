import {
  createProfile,
  createSpace,
  SPACE_PRESET_THEMES,
  type Id,
  type SpaceTheme,
  type ThemeMode,
} from '@vela/core';
import { type CSSProperties, useState } from 'react';
import { EmojiPicker } from '../components/EmojiPicker';
import { Icon } from '../components/Icon';
import { dispatch, invoke } from '../lib/api';
import { useShell } from '../lib/store';
import styles from './SpaceEditor.module.css';

const MODES: ThemeMode[] = ['system', 'light', 'dark'];
const MODE_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export interface SpaceEditorPayload {
  /** A space id, or the literal 'new'. */
  spaceId: Id;
}

export function SpaceEditor({ payload }: { payload: SpaceEditorPayload }) {
  const core = useShell((s) => s.core);
  const isNew = payload.spaceId === 'new';
  const existing = isNew ? undefined : core.spaces[payload.spaceId];
  const [name, setName] = useState(existing?.name ?? `Space ${core.spaceOrder.length + 1}`);
  const [emoji, setEmoji] = useState(existing?.emoji ?? '✦');
  const [theme, setTheme] = useState<SpaceTheme>(
    existing?.theme ??
      SPACE_PRESET_THEMES[core.spaceOrder.length % SPACE_PRESET_THEMES.length] ?? {
        from: '#5B6CFF',
        to: '#9A5BFF',
        grain: 0.08,
        mode: 'system',
      },
  );
  const [profileId, setProfileId] = useState<Id | null>(existing?.profileId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const close = (): void => void invoke('overlay/hide', undefined);

  const save = (): void => {
    const now = Date.now();
    const n = name.trim() || 'Space';
    if (isNew) {
      const space = createSpace({ name: n, emoji, theme, profileId, now });
      dispatch({ type: 'space/create', space });
      dispatch({ type: 'space/activate', id: space.id, now });
    } else if (existing) {
      dispatch({ type: 'space/update', id: existing.id, patch: { name: n, emoji, theme, profileId } });
    }
    close();
  };

  const remove = (): void => {
    if (!existing || core.spaceOrder.length <= 1) return;
    dispatch({ type: 'space/delete', id: existing.id, now: Date.now() });
    close();
  };

  const addProfile = (): void => {
    const pn = newProfileName.trim();
    if (!pn) return;
    const p = createProfile(pn, theme.from);
    dispatch({ type: 'profile/create', profile: p });
    setProfileId(p.id);
    setNewProfileName('');
  };

  const gradient = `linear-gradient(135deg, ${theme.from}, ${theme.to})`;

  return (
    <div
      className={styles.wrap}
      role="dialog"
      aria-label={isNew ? 'New space' : 'Edit space'}
      data-testid="space-editor"
    >
      <div className={styles.box}>
        <div className={styles.preview} style={{ background: gradient }}>
          <button
            className={styles.emojiBtn}
            onClick={() => setPickerOpen(true)}
            aria-label="Change emoji"
            data-testid="space-emoji"
          >
            {emoji}
          </button>
          {pickerOpen && (
            <div className={styles.pickerAnchor}>
              <EmojiPicker
                value={emoji}
                allowClear={false}
                onClose={() => setPickerOpen(false)}
                onPick={(e) => {
                  if (e) setEmoji(e);
                  setPickerOpen(false);
                }}
              />
            </div>
          )}
        </div>
        <div className={styles.body}>
          <label className={styles.label}>
            Name
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoFocus
              data-testid="space-name-input"
            />
          </label>

          <div className={styles.label}>
            Theme
            <div className={styles.presets}>
              {SPACE_PRESET_THEMES.map((p) => (
                <button
                  key={`${p.from}${p.to}`}
                  className={`${styles.swatch} ${p.from === theme.from && p.to === theme.to ? styles.swatchOn : ''}`}
                  style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                  onClick={() => setTheme({ ...theme, from: p.from, to: p.to })}
                  aria-label={`Theme ${p.from} ${p.to}`}
                />
              ))}
              <button
                className={styles.fromImage}
                onClick={() =>
                  void invoke('theme/fromImage', undefined).then(
                    (p) => p && setTheme({ ...theme, from: p.from, to: p.to }),
                  )
                }
                title="Extract a palette from an image"
                data-testid="theme-from-image"
              >
                <Icon name="palette" size={14} /> From image
              </button>
              <label className={styles.custom} title="Custom colors">
                <input
                  type="color"
                  value={theme.from}
                  onChange={(e) => setTheme({ ...theme, from: e.target.value })}
                  aria-label="Start color"
                />
                <input
                  type="color"
                  value={theme.to}
                  onChange={(e) => setTheme({ ...theme, to: e.target.value })}
                  aria-label="End color"
                />
              </label>
            </div>
          </div>

          <div className={styles.row}>
            <label className={styles.label} style={{ flex: 1 }}>
              Grain
              <input
                type="range"
                min={0}
                max={0.3}
                step={0.01}
                value={theme.grain}
                onChange={(e) => setTheme({ ...theme, grain: Number(e.target.value) })}
                aria-label="Grain intensity"
              />
            </label>
            <div className={styles.label}>
              Appearance
              <div
                className={styles.segment}
                role="radiogroup"
                aria-label="Appearance"
                style={{ '--i': MODES.indexOf(theme.mode) } as CSSProperties}
              >
                <span className={styles.segThumb} aria-hidden="true" />
                {MODES.map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={theme.mode === m}
                    className={theme.mode === m ? styles.segOn : ''}
                    onClick={() => setTheme({ ...theme, mode: m })}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.label}>
            Profile
            <div className={styles.row}>
              <select
                className={styles.select}
                value={profileId ?? ''}
                onChange={(e) => setProfileId(e.target.value || null)}
                aria-label="Profile"
                data-testid="space-profile"
              >
                <option value="">Default</option>
                {Object.values(core.profiles).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                className={styles.input}
                placeholder="New profile name"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addProfile()}
                data-testid="new-profile-name"
              />
              <button
                className={styles.secondary}
                onClick={addProfile}
                disabled={!newProfileName.trim()}
                data-testid="add-profile"
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
            <p className={styles.hint}>Profiles keep cookies and logins separate (e.g. work vs personal).</p>
          </div>

          <div className={styles.actions}>
            {!isNew && (
              <button
                className={styles.danger}
                onClick={remove}
                disabled={core.spaceOrder.length <= 1}
                data-testid="space-delete"
              >
                Delete space
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button className={styles.secondary} onClick={close}>
              Cancel
            </button>
            <button className={styles.primary} onClick={save} data-testid="space-save">
              {isNew ? 'Create' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
