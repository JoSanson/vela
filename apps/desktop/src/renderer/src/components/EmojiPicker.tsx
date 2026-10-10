import { useEffect, useRef, useState } from 'react';
import styles from './EmojiPicker.module.css';

const SETS: { name: string; emojis: string }[] = [
  { name: 'Smileys', emojis: '😀😄😁😆🥹😊🙂😉😍🥰😘😎🤓🧐🤔🤩🥳😴🤯🫡🤠😇🥲😤' },
  { name: 'Objects', emojis: '💼🧰🛠️🔧🔨⚙️🧪🔬🔭📡💡🔦📷🎥🎬🎧🎵🎹🎸🧭🗺️📍📌📎' },
  { name: 'Work', emojis: '📝📚📖📰🗂️📁📂🗃️📊📈📉📋📅🗓️⏰⏳💰💳🧾✉️📬📦🏷️🔑' },
  { name: 'Nature', emojis: '🌱🌿🍀🌸🌼🌻🌞🌙⭐️🌈🔥💧🌊🍃🌵🌲🪐☄️🦋🐝🐢🐬🦊🐧' },
  { name: 'Food', emojis: '☕️🍵🥐🍞🥑🍎🍓🍋🍉🥗🍜🍣🍕🌮🍪🍩🎂🍫🍷🍺🧃🥤🍿🍯' },
  { name: 'Symbols', emojis: '✦✨⚡️❤️🧡💛💚💙💜🖤🤍🔷🔶🔺🔻⭕️✅❌❗️❓♻️🔱⚜️🏁' },
  { name: 'Travel', emojis: '🏠🏡🏢🏫🏥🏦🏛️🗼🗽⛩️🚀✈️🚁🚂🚗🚲⛵️🏕️🏝️🌋🗻🎢🎡🎠' },
  { name: 'Activities', emojis: '⚽️🏀🏈🎾🏐🎱🏓🥊🎯🎮🎲🧩🎨🎭🎤🏆🥇🎖️🏅🎪🧗🏄🚴🧘' },
];

interface Props {
  value: string | null;
  onPick: (emoji: string | null) => void;
  onClose: () => void;
  allowClear?: boolean;
}

export function EmojiPicker({ value, onPick, onClose, allowClear = true }: Props) {
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

  return (
    <div
      ref={ref}
      className={styles.picker}
      role="dialog"
      aria-label="Choose an icon"
      data-testid="emoji-picker"
    >
      <div className={styles.head}>
        <input
          className={styles.input}
          placeholder="Type or paste an emoji…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isCustomEmoji) onPick(custom);
          }}
          autoFocus
        />
        {allowClear && (
          <button className={styles.clear} onClick={() => onPick(null)} disabled={!value}>
            Reset
          </button>
        )}
      </div>
      {isCustomEmoji && (
        <button className={styles.customRow} onClick={() => onPick(custom)}>
          Use <span className={styles.big}>{custom}</span>
        </button>
      )}
      <div className={styles.scroll}>
        {SETS.map((set) => (
          <div key={set.name} className={styles.set}>
            <div className={styles.setName}>{set.name}</div>
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
