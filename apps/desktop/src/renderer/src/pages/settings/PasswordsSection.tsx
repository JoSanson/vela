import type { CredentialSummary } from '@vela/shared';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { tryInvoke } from '../lib';
import { useToast } from '../Toast';
import { Button, Card, ConfirmButton, EmptyState, SearchBox } from '../ui';
import styles from './Settings.module.css';

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

export function PasswordsSection() {
  const { toast } = useToast();
  const [items, setItems] = useState<CredentialSummary[]>([]);
  const [never, setNever] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([tryInvoke('credentials/list', { query }), tryInvoke('credentials/never', {})]).then(
      ([list, blocked]) => {
        if (cancelled) return;
        setItems(list ?? []);
        setNever(blocked ?? []);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [query, reloadKey]);

  const reveal = async (id: string): Promise<void> => {
    if (shown[id] !== undefined) {
      setShown((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      return;
    }
    const secret = await tryInvoke('credentials/reveal', { id });
    if (secret === null || secret === undefined) {
      toast("Couldn't read this password", 'error');
      return;
    }
    setShown((s) => ({ ...s, [id]: secret }));
    setTimeout(() => setShown((s) => (id in s ? { ...s, [id]: undefined as unknown as string } : s)), 30_000);
  };

  return (
    <div className={styles.stack} data-testid="settings-passwords">
      <p className={styles.desc}>
        Logins are encrypted with your operating system keychain and only ever typed into the page they were
        saved on. Nothing is sent anywhere.
      </p>
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Search sites and usernames"
        testId="passwords-search"
      />
      {items.length === 0 ? (
        <EmptyState
          icon="key"
          title={query ? 'No matching login' : 'No saved passwords yet'}
          hint="Vela offers to save a password after you sign in to a site."
          testId="passwords-empty"
        />
      ) : (
        <Card>
          <table className={styles.table} data-testid="passwords-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Username</th>
                <th>Password</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} data-testid="password-row">
                  <td>{hostOf(c.origin)}</td>
                  <td>{c.username || <span className={styles.soon}>No username</span>}</td>
                  <td className={styles.mono}>
                    {shown[c.id] !== undefined && shown[c.id] !== null ? shown[c.id] : '••••••••'}
                  </td>
                  <td className={styles.rowEnd}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="eye"
                      aria-label={shown[c.id] ? 'Hide password' : 'Show password'}
                      onClick={() => void reveal(c.id)}
                      testId="password-reveal"
                    />
                    <ConfirmButton
                      label=""
                      icon="trash"
                      size="sm"
                      question="Delete this login?"
                      confirmLabel="Delete"
                      testId="password-delete"
                      onConfirm={() => {
                        void tryInvoke('credentials/remove', { id: c.id }).then(load);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {never.length > 0 && (
        <>
          <p className={styles.h3}>Never saved for</p>
          <Card>
            <table className={styles.table}>
              <tbody>
                {never.map((o) => (
                  <tr key={o}>
                    <td>{hostOf(o)}</td>
                    <td className={styles.rowEnd}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void tryInvoke('credentials/never', { remove: o }).then(load)}
                      >
                        <Icon name="close" size={13} /> Forget
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
