import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import styles from './Toast.module.css';

type Tone = 'info' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastApi {
  toast: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const toast = useCallback((message: string, tone: Tone = 'info') => {
    seq.current += 1;
    const id = seq.current;
    setItems((prev) => [...prev.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.host} aria-live="polite" data-testid="toast-host">
        {items.map((t) => (
          <div key={t.id} className={styles.toast} data-tone={t.tone} data-testid="toast">
            <Icon name={t.tone === 'error' ? 'warning' : 'check'} size={14} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
