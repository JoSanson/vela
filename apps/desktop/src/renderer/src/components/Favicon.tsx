import { hostOf, type Tab } from '@vela/core';
import { useState } from 'react';
import { Icon } from './Icon';
import styles from './Favicon.module.css';

interface Props {
  tab: Pick<Tab, 'favicon' | 'emoji' | 'url' | 'sleeping' | 'loading'>;
  size?: number;
}

export function Favicon({ tab, size = 16 }: Props) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.75 };
  if (tab.emoji) {
    return (
      <span className={styles.emoji} style={style} aria-hidden="true">
        {tab.emoji}
      </span>
    );
  }
  if (tab.url.startsWith('vela://')) {
    return (
      <span className={styles.badge} style={style} aria-hidden="true">
        <Icon name="command" size={size - 4} />
      </span>
    );
  }
  if (tab.favicon && !broken) {
    return (
      <img
        className={`${styles.img} ${tab.sleeping ? styles.sleeping : ''}`}
        style={style}
        src={tab.favicon}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
      />
    );
  }
  const letter = (hostOf(tab.url) || '?').charAt(0).toUpperCase();
  return (
    <span
      className={`${styles.badge} ${tab.sleeping ? styles.sleeping : ''}`}
      style={style}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
