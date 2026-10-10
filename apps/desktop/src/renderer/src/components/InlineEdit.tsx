import { useEffect, useRef, useState } from 'react';
import styles from './InlineEdit.module.css';

interface Props {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}

export function InlineEdit({ value, onCommit, onCancel, placeholder }: Props) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className={styles.input}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit(text);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      data-testid="inline-edit"
    />
  );
}
