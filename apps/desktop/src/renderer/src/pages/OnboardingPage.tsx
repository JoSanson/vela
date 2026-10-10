import { SHORTCUTS } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { modKey } from '../lib/api';
import { ImportPanel } from './ImportPanel';
import styles from './OnboardingPage.module.css';
import { useSnapshot } from './lib';
import { useToast } from './Toast';
import { Button, Keycaps } from './ui';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'layers',
    title: 'Spaces',
    text: 'Separate contexts — work, personal, a project — each with its own tabs, theme and profile.',
  },
  {
    icon: 'pin',
    title: 'Pinned',
    text: 'Tabs you keep. They stay at the top of a space and always return to their home URL.',
  },
  {
    icon: 'sleep',
    title: 'Today',
    text: 'Everything else. Tabs you don’t touch get archived automatically so the list stays short.',
  },
];

const ESSENTIAL: { id: string; hint: string }[] = [
  { id: 'newTab', hint: 'Search, open a URL or run a command' },
  { id: 'editUrl', hint: 'Change the current page’s address' },
  { id: 'toggleSidebar', hint: 'Give the page the whole window' },
  { id: 'nextTabMru', hint: 'Jump between your last two tabs' },
  { id: 'spaceNext', hint: 'Move to the next space' },
  { id: 'archiveView', hint: 'Find tabs that were archived' },
];

const STEPS = 3;

export function OnboardingPage() {
  const { setPrefs } = useSnapshot();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Welcome — Vela';
  }, []);

  const go = (n: number): void => {
    setDir(n > step ? 'next' : 'back');
    setStep(Math.max(0, Math.min(STEPS - 1, n)));
  };

  const finish = async (): Promise<void> => {
    setSaving(true);
    const ok = await setPrefs({ onboardingDone: true });
    setSaving(false);
    if (!ok) toast("Couldn't save your preferences — you can finish setup later from Settings", 'error');
    setDir('next');
    setDone(true);
  };

  const essentials = ESSENTIAL.flatMap((e) => {
    const def = SHORTCUTS.find((s) => s.id === e.id);
    return def ? [{ ...def, hint: e.hint }] : [];
  });

  return (
    <div className={styles.wrap} data-testid="page-onboarding" data-step={done ? 'done' : step}>
      <div className={styles.card}>
        {done ? (
          <div
            key="done"
            className={`${styles.step} ${styles.done}`}
            data-dir="next"
            data-testid="onboarding-done"
          >
            <div className={styles.check}>
              <Icon name="check" size={30} />
            </div>
            <h1 className={styles.h1}>You’re all set</h1>
            <p className={styles.lead}>Vela is ready. Open the command bar to start browsing.</p>
            <div className={styles.doneKbd}>
              Press
              <span className={styles.bigKbd}>{modKey}</span>
              <span className={styles.bigKbd}>T</span>
            </div>
          </div>
        ) : step === 0 ? (
          <div key="s0" className={styles.step} data-dir={dir} data-testid="onboarding-step-welcome">
            <div className={styles.logo}>
              <Icon name="command" size={26} />
            </div>
            <div>
              <p className={styles.eyebrow}>Welcome to Vela</p>
              <h1 className={styles.h1}>A calmer way to browse</h1>
            </div>
            <p className={styles.lead}>
              Vela keeps your tabs organised for you. Three ideas are enough to get going.
            </p>
            <div className={styles.features}>
              {FEATURES.map((f) => (
                <div key={f.title} className={styles.feature}>
                  <span className={styles.featureIcon}>
                    <Icon name={f.icon} size={15} />
                  </span>
                  <span className={styles.featureTitle}>{f.title}</span>
                  <span className={styles.featureText}>{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : step === 1 ? (
          <div key="s1" className={styles.step} data-dir={dir} data-testid="onboarding-step-import">
            <div>
              <p className={styles.eyebrow}>Step 2 of 3</p>
              <h1 className={styles.h1}>Bring your bookmarks along</h1>
            </div>
            <p className={styles.lead}>
              Import bookmarks and history from another browser. Bookmarks become pinned tabs in your first
              space. You can skip this and do it later from Settings.
            </p>
            <div className={styles.importBox}>
              <ImportPanel />
            </div>
          </div>
        ) : (
          <div key="s2" className={styles.step} data-dir={dir} data-testid="onboarding-step-shortcuts">
            <div>
              <p className={styles.eyebrow}>Step 3 of 3</p>
              <h1 className={styles.h1}>Six shortcuts worth learning</h1>
            </div>
            <p className={styles.lead}>
              Everything in Vela is reachable from the keyboard. The full list lives at vela://shortcuts.
            </p>
            <div className={styles.shortcuts}>
              {essentials.map((s) => (
                <div key={s.id} className={styles.shortcut}>
                  <span className={styles.shortcutText}>
                    <span>{s.label}</span>
                    <span className={styles.shortcutHint}>{s.hint}</span>
                  </span>
                  <Keycaps accelerator={s.accelerator} />
                </div>
              ))}
            </div>
          </div>
        )}

        {!done && (
          <div className={styles.footer}>
            <div className={styles.dots} role="tablist" aria-label="Setup steps">
              {Array.from({ length: STEPS }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-label={`Step ${i + 1}`}
                  aria-current={i === step ? 'step' : undefined}
                  aria-selected={i === step}
                  className={styles.dot}
                  onClick={() => go(i)}
                />
              ))}
            </div>
            <div className={styles.nav}>
              {step > 0 && (
                <Button variant="ghost" testId="onboarding-back" onClick={() => go(step - 1)}>
                  Back
                </Button>
              )}
              {step === 1 && (
                <Button variant="ghost" testId="onboarding-skip" onClick={() => go(2)}>
                  Skip
                </Button>
              )}
              {step < STEPS - 1 ? (
                <Button variant="primary" testId="onboarding-next" onClick={() => go(step + 1)}>
                  {step === 1 ? 'Continue' : 'Next'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  testId="onboarding-finish"
                  disabled={saving}
                  onClick={() => void finish()}
                >
                  Start browsing
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
