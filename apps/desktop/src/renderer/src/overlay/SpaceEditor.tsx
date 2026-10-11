import {
  createProfile,
  createSpace,
  SPACE_PRESET_THEMES,
  type Id,
  type SpaceTheme,
  type ThemeMode,
} from '@vela/core';
import type { MessageKey } from '@vela/shared';
import { type CSSProperties, useState } from 'react';
import { EmojiPicker } from '../components/EmojiPicker';
import { Icon } from '../components/Icon';
import { dispatch, invoke } from '../lib/api';
import { useT } from '../lib/i18n';
import { useShell } from '../lib/store';
import styles from './SpaceEditor.module.css';

const PRIVATE = '__private__';
const MODES: ThemeMode[] = ['system', 'light', 'dark'];
const MODE_LABEL = {
  system: 'overlay.spaceEditor.mode.system',
  light: 'overlay.spaceEditor.mode.light',
  dark: 'overlay.spaceEditor.mode.dark',
} as const satisfies Record<ThemeMode, MessageKey>;

export interface SpaceEditorPayload {
  /** A space id, or the literal 'new'. */
  spaceId: Id;
}

export function SpaceEditor({ payload }: { payload: SpaceEditorPayload }) {
  const t = useT();
  const core = useShell((s) => s.core);
  const isNew = payload.spaceId === 'new';
  const existing = isNew ? undefined : core.spaces[payload.spaceId];
  const [name, setName] = useState(
    existing?.name ?? t('overlay.spaceEditor.defaultName', { n: core.spaceOrder.length + 1 }),
  );
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
    const n = name.trim() || t('overlay.spaceEditor.fallbackName');
    let pid = profileId;
    if (pid === PRIVATE) {
      // One in-memory profile per private space: cookies and logins vanish with it.
      const p = createProfile(t('overlay.spaceEditor.privateProfile'), theme.from, undefined, true);
      dispatch({ type: 'profile/create', profile: p });
      pid = p.id;
    }
    if (isNew) {
      const space = createSpace({ name: n, emoji, theme, profileId: pid, now });
      dispatch({ type: 'space/create', space });
      dispatch({ type: 'space/activate', id: space.id, now });
    } else if (existing) {
      dispatch({ type: 'space/update', id: existing.id, patch: { name: n, emoji, theme, profileId: pid } });
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
      aria-label={isNew ? t('overlay.spaceEditor.newTitle') : t('overlay.spaceEditor.editTitle')}
      data-testid="space-editor"
    >
      <div className={styles.box}>
        <div className={styles.preview} style={{ background: gradient }}>
          <button
            className={styles.emojiBtn}
            onClick={() => setPickerOpen(true)}
            aria-label={t('overlay.spaceEditor.changeEmoji')}
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
            {t('overlay.spaceEditor.name')}
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
            {t('overlay.spaceEditor.theme')}
            <div className={styles.presets}>
              {SPACE_PRESET_THEMES.map((p) => (
                <button
                  key={`${p.from}${p.to}`}
                  className={`${styles.swatch} ${p.from === theme.from && p.to === theme.to ? styles.swatchOn : ''}`}
                  style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                  onClick={() => setTheme({ ...theme, from: p.from, to: p.to })}
                  aria-label={t('overlay.spaceEditor.themeSwatch', { from: p.from, to: p.to })}
                />
              ))}
              <button
                className={styles.fromImage}
                onClick={() =>
                  void invoke('theme/fromImage', undefined).then(
                    (p) => p && setTheme({ ...theme, from: p.from, to: p.to }),
                  )
                }
                title={t('overlay.spaceEditor.fromImageTitle')}
                data-testid="theme-from-image"
              >
                <Icon name="palette" size={14} /> {t('overlay.spaceEditor.fromImage')}
              </button>
              <label className={styles.custom} title={t('overlay.spaceEditor.customColors')}>
                <input
                  type="color"
                  value={theme.from}
                  onChange={(e) => setTheme({ ...theme, from: e.target.value })}
                  aria-label={t('overlay.spaceEditor.startColor')}
                />
                <input
                  type="color"
                  value={theme.to}
                  onChange={(e) => setTheme({ ...theme, to: e.target.value })}
                  aria-label={t('overlay.spaceEditor.endColor')}
                />
              </label>
            </div>
          </div>

          <div className={styles.row}>
            <label className={styles.label} style={{ flex: 1 }}>
              {t('overlay.spaceEditor.grain')}
              <input
                type="range"
                min={0}
                max={0.3}
                step={0.01}
                value={theme.grain}
                onChange={(e) => setTheme({ ...theme, grain: Number(e.target.value) })}
                aria-label={t('overlay.spaceEditor.grainIntensity')}
              />
            </label>
            <div className={styles.label}>
              {t('overlay.spaceEditor.appearance')}
              <div
                className={styles.segment}
                role="radiogroup"
                aria-label={t('overlay.spaceEditor.appearance')}
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
                    {t(MODE_LABEL[m])}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.label}>
            {t('overlay.spaceEditor.profile')}
            <div className={styles.row}>
              <select
                className={styles.select}
                value={profileId ?? ''}
                onChange={(e) => setProfileId(e.target.value || null)}
                aria-label={t('overlay.spaceEditor.profile')}
                data-testid="space-profile"
              >
                <option value="">{t('overlay.spaceEditor.profileDefault')}</option>
                {Object.values(core.profiles)
                  .filter((p) => !p.ephemeral || p.id === existing?.profileId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ephemeral ? t('overlay.spaceEditor.profilePrivateThisSpace') : p.name}
                    </option>
                  ))}
                {!core.profiles[existing?.profileId ?? '']?.ephemeral && (
                  <option value={PRIVATE}>{t('overlay.spaceEditor.profilePrivateOption')}</option>
                )}
              </select>
              <input
                className={styles.input}
                placeholder={t('overlay.spaceEditor.newProfilePlaceholder')}
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
            <p className={styles.hint}>
              {profileId === PRIVATE || core.profiles[profileId ?? '']?.ephemeral
                ? t('overlay.spaceEditor.hintPrivate')
                : t('overlay.spaceEditor.hintProfiles')}
            </p>
          </div>

          <div className={styles.actions}>
            {!isNew && (
              <button
                className={styles.danger}
                onClick={remove}
                disabled={core.spaceOrder.length <= 1}
                data-testid="space-delete"
              >
                {t('overlay.spaceEditor.deleteSpace')}
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button className={styles.secondary} onClick={close}>
              {t('common.cancel')}
            </button>
            <button className={styles.primary} onClick={save} data-testid="space-save">
              {isNew ? t('overlay.spaceEditor.create') : t('common.done')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
