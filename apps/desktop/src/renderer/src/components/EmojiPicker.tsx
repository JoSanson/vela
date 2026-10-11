import type { MessageKey } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import styles from './EmojiPicker.module.css';

const SETS: { name: MessageKey; emojis: string }[] = [
  { name: 'shell.emojiPicker.set.smileys', emojis: '😀😄😁😆🥹😊🙂😉😍🥰😘😎🤓🧐🤔🤩🥳😴🤯🫡🤠😇🥲😤' },
  { name: 'shell.emojiPicker.set.objects', emojis: '💼🧰🛠️🔧🔨⚙️🧪🔬🔭📡💡🔦📷🎥🎬🎧🎵🎹🎸🧭🗺️📍📌📎' },
  { name: 'shell.emojiPicker.set.work', emojis: '📝📚📖📰🗂️📁📂🗃️📊📈📉📋📅🗓️⏰⏳💰💳🧾✉️📬📦🏷️🔑' },
  { name: 'shell.emojiPicker.set.nature', emojis: '🌱🌿🍀🌸🌼🌻🌞🌙⭐️🌈🔥💧🌊🍃🌵🌲🪐☄️🦋🐝🐢🐬🦊🐧' },
  { name: 'shell.emojiPicker.set.food', emojis: '☕️🍵🥐🍞🥑🍎🍓🍋🍉🥗🍜🍣🍕🌮🍪🍩🎂🍫🍷🍺🧃🥤🍿🍯' },
  { name: 'shell.emojiPicker.set.symbols', emojis: '✦✨⚡️❤️🧡💛💚💙💜🖤🤍🔷🔶🔺🔻⭕️✅❌❗️❓♻️🔱⚜️🏁' },
  { name: 'shell.emojiPicker.set.travel', emojis: '🏠🏡🏢🏫🏥🏦🏛️🗼🗽⛩️🚀✈️🚁🚂🚗🚲⛵️🏕️🏝️🌋🗻🎢🎡🎠' },
  { name: 'shell.emojiPicker.set.activities', emojis: '⚽️🏀🏈🎾🏐🎱🏓🥊🎯🎮🎲🧩🎨🎭🎤🏆🥇🎖️🏅🎪🧗🏄🚴🧘' },
];

interface Props {
  value: string | null;
  onPick: (emoji: string | null) => void;
  onClose: () => void;
  allowClear?: boolean;
}

export function EmojiPicker({ value, onPick, onClose, allowClear = true }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const custom = query.trim();
  const isCustomEmoji = custom.length > 0 && custom.length <= 4;
  const [useBefore, useAfter] = t('shell.emojiPicker.use', { emoji: '\u0000' }).split('\u0000');

  return (
    <div
      ref={ref}
      className={styles.picker}
      role="dialog"
      aria-label={t('shell.emojiPicker.title')}
      data-testid="emoji-picker"
    >
      <div className={styles.head}>
        <input
          className={styles.input}
          placeholder={t('shell.emojiPicker.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isCustomEmoji) onPick(custom);
          }}
          autoFocus
        />
        {allowClear && (
          <button className={styles.clear} onClick={() => onPick(null)} disabled={!value}>
            {t('shell.emojiPicker.reset')}
          </button>
        )}
      </div>
      {isCustomEmoji && (
        <button className={styles.customRow} onClick={() => onPick(custom)}>
          {useBefore}
          <span className={styles.big}>{custom}</span>
          {useAfter}
        </button>
      )}
      <div className={styles.scroll}>
        {SETS.map((set) => (
          <div key={set.name} className={styles.set}>
            <div className={styles.setName}>{t(set.name)}</div>
            <div className={styles.grid}>
              {[...set.emojis]
                .filter((c) => c.trim())
                .map((e, i) => (
                  <button
                    key={`${set.name}-${i}`}
                    className={`${styles.cell} ${e === value ? styles.selected : ''}`}
                    onClick={() => onPick(e)}
                    aria-label={e}
                  >
                    {e}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
