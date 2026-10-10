import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { isMac } from '../lib/api';
import styles from './ui.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant | undefined;
  size?: 'md' | 'sm' | undefined;
  icon?: IconName | undefined;
  testId?: string | undefined;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  testId,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    styles.btn,
    styles[variant],
    size === 'sm' ? styles.sm : '',
    !children ? styles.iconOnly : '',
    className ?? '',
  ].join(' ');
  return (
    <button type={type} className={cls} data-testid={testId} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean | undefined;
  testId?: string | undefined;
}

export function Toggle({ checked, onChange, label, disabled, testId }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={styles.toggle}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
    />
  );
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  testId?: string | undefined;
}

export function Select({ options, onChange, testId, className, ...rest }: SelectProps) {
  return (
    <span className={styles.selectWrap}>
      <select
        className={`${styles.select} ${className ?? ''}`}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange: (value: string) => void;
  testId?: string | undefined;
}

export function TextInput({ onChange, testId, className, ...rest }: TextInputProps) {
  return (
    <input
      className={`${styles.input} ${className ?? ''}`}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      {...rest}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
  rows?: number | undefined;
  testId?: string | undefined;
}) {
  return (
    <textarea
      className={styles.textarea}
      value={value}
      rows={rows}
      placeholder={placeholder}
      spellCheck={false}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

interface SearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
  testId?: string | undefined;
  autoFocus?: boolean | undefined;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void | undefined;
}

export function SearchBox({ value, onChange, placeholder, testId, autoFocus, onKeyDown }: SearchBoxProps) {
  return (
    <div className={styles.search}>
      <Icon name="search" size={15} />
      <input
        className={styles.input}
        type="search"
        value={value}
        placeholder={placeholder ?? 'Search'}
        autoFocus={autoFocus}
        spellCheck={false}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button type="button" className={styles.searchClear} aria-label="Clear" onClick={() => onChange('')}>
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testId?: string | undefined;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, testId, label }: SegmentedProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div
      className={styles.segmented}
      role="group"
      aria-label={label}
      data-testid={testId}
      style={{ '--n': options.length, '--i': index } as CSSProperties}
    >
      <span className={styles.thumb} aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={styles.segment}
          aria-pressed={o.value === value}
          data-value={o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
const TONE_CLASS: Record<Tone, string> = {
  neutral: '',
  accent: styles.badgeAccent ?? '',
  success: styles.badgeSuccess ?? '',
  warning: styles.badgeWarning ?? '',
  danger: styles.badgeDanger ?? '',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`${styles.badge} ${TONE_CLASS[tone]}`}>{children}</span>;
}

interface EmptyProps {
  icon: IconName;
  title: string;
  hint?: string | undefined;
  action?: ReactNode | undefined;
  testId?: string | undefined;
}

export function EmptyState({ icon, title, hint, action, testId }: EmptyProps) {
  return (
    <div className={styles.empty} data-testid={testId}>
      <div className={styles.emptyIcon}>
        <Icon name={icon} size={24} />
      </div>
      <p className={styles.emptyTitle}>{title}</p>
      {hint && <p className={styles.emptyHint}>{hint}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string | undefined;
  question?: string | undefined;
  onConfirm: () => void;
  variant?: Variant | undefined;
  icon?: IconName | undefined;
  testId?: string | undefined;
  disabled?: boolean | undefined;
  size?: 'md' | 'sm' | undefined;
}

/** Two-step destructive action rendered inline, no modal. */
export function ConfirmButton({
  label,
  confirmLabel = 'Confirm',
  question = 'Are you sure?',
  onConfirm,
  variant = 'ghost',
  icon,
  testId,
  disabled,
  size = 'md',
}: ConfirmButtonProps) {
  const [arming, setArming] = useState(false);
  if (!arming) {
    return (
      <Button
        variant={variant}
        icon={icon}
        testId={testId}
        disabled={disabled}
        size={size}
        onClick={() => setArming(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    <span className={styles.confirm} data-testid={testId ? `${testId}-confirm` : undefined}>
      <span>{question}</span>
      <Button
        variant="danger"
        size={size}
        autoFocus
        testId={testId ? `${testId}-yes` : undefined}
        onClick={() => {
          setArming(false);
          onConfirm();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setArming(false);
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} onClick={() => setArming(false)}>
        Cancel
      </Button>
    </span>
  );
}

const KEY_LABELS: Record<string, string> = isMac
  ? {
      CmdOrCtrl: '⌘',
      Cmd: '⌘',
      Command: '⌘',
      Ctrl: '⌃',
      Control: '⌃',
      Alt: '⌥',
      Option: '⌥',
      Shift: '⇧',
      Up: '↑',
      Down: '↓',
      Left: '←',
      Right: '→',
      Tab: '⇥',
      Enter: '↩',
      Return: '↩',
      Escape: 'Esc',
      Backspace: '⌫',
      Space: 'Space',
    }
  : {
      CmdOrCtrl: 'Ctrl',
      Cmd: 'Win',
      Command: 'Win',
      Ctrl: 'Ctrl',
      Control: 'Ctrl',
      Alt: 'Alt',
      Option: 'Alt',
      Shift: 'Shift',
      Up: '↑',
      Down: '↓',
      Left: '←',
      Right: '→',
      Tab: 'Tab',
      Enter: 'Enter',
      Return: 'Enter',
      Escape: 'Esc',
      Backspace: 'Backspace',
      Space: 'Space',
    };

export function acceleratorKeys(accelerator: string): string[] {
  return accelerator.split('+').map((part) => KEY_LABELS[part] ?? part);
}

export function Keycaps({ accelerator }: { accelerator: string }) {
  return (
    <span className={styles.kbdGroup} aria-label={accelerator}>
      {acceleratorKeys(accelerator).map((k, i) => (
        <kbd key={`${k}-${i}`} className={styles.kbd}>
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function Card({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string | undefined;
  testId?: string | undefined;
}) {
  return (
    <div className={`${styles.card} ${className ?? ''}`} data-testid={testId}>
      {children}
    </div>
  );
}

interface RowProps {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
  testId?: string | undefined;
}

export function Row({ label, hint, children, testId }: RowProps) {
  return (
    <div className={styles.row} data-testid={testId}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {hint && <span className={styles.rowHint}>{hint}</span>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className={styles.spinner} aria-label="Loading" role="status" />;
}
