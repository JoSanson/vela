import { SHORTCUTS, shortcutLabel } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { modKey } from '../lib/api';
import { useT } from '../lib/i18n';
import { ImportPanel } from './ImportPanel';
import styles from './OnboardingPage.module.css';
import { useSnapshot } from './lib';
import { useToast } from './Toast';
import { Button, Keycaps } from './ui';

type ZoneId = 'spaces' | 'pinned' | 'today';

const ZONES: { id: ZoneId; icon: IconName }[] = [
  { id: 'spaces', icon: 'layers' },
  { id: 'pinned', icon: 'pin' },
  { id: 'today', icon: 'sleep' },
];

const ZONE_TEXT = {
  spaces: { title: 'pages.onboarding.zones.spaces.title', text: 'pages.onboarding.zones.spaces.text' },
  pinned: { title: 'pages.onboarding.zones.pinned.title', text: 'pages.onboarding.zones.pinned.text' },
  today: { title: 'pages.onboarding.zones.today.title', text: 'pages.onboarding.zones.today.text' },
} as const satisfies Record<ZoneId, { title: string; text: string }>;

const ESSENTIAL = [
  { id: 'newTab', hint: 'pages.onboarding.essential.newTab' },
  { id: 'editUrl', hint: 'pages.onboarding.essential.editUrl' },
  { id: 'toggleSidebar', hint: 'pages.onboarding.essential.toggleSidebar' },
  { id: 'nextTabMru', hint: 'pages.onboarding.essential.nextTabMru' },
  { id: 'spaceNext', hint: 'pages.onboarding.essential.spaceNext' },
  { id: 'archiveView', hint: 'pages.onboarding.essential.archiveView' },
] as const;

const STEPS = 3;

export function OnboardingPage() {
  const t = useT();
  const { setPrefs } = useSnapshot();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zone, setZone] = useState<ZoneId>('spaces');

  useEffect(() => {
    document.title = t('pages.onboarding.docTitle');
  }, [t]);

  const go = (n: number): void => {
    setDir(n > step ? 'next' : 'back');
    setStep(Math.max(0, Math.min(STEPS - 1, n)));
  };

  const finish = async (): Promise<void> => {
    setSaving(true);
    const ok = await setPrefs({ onboardingDone: true });
    setSaving(false);
    if (!ok) toast(t('pages.onboarding.saveFailed'), 'error');
    setDir('next');
    setDone(true);
  };

  const essentials = ESSENTIAL.flatMap((e) => {
    const def = SHORTCUTS.find((s) => s.id === e.id);
    return def ? [{ ...def, label: shortcutLabel(t, def), hint: t(e.hint) }] : [];
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
            <h1 className={styles.h1}>{t('pages.onboarding.done.title')}</h1>
            <p className={styles.lead}>{t('pages.onboarding.done.lead')}</p>
            <div className={styles.doneKbd}>
              {t('pages.onboarding.done.press')}
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
              <p className={styles.eyebrow}>{t('pages.onboarding.welcome.eyebrow')}</p>
              <h1 className={styles.h1}>{t('pages.onboarding.welcome.title')}</h1>
            </div>
            <p className={styles.lead}>{t('pages.onboarding.welcome.lead')}</p>
            <div className={styles.tour} data-zone={zone}>
              <div className={styles.mini} aria-hidden="true">
                <div className={styles.miniNav}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.miniUrl} />
                <div className={`${styles.miniZone} ${styles.miniPinned}`} data-zone="pinned">
                  <div className={styles.miniRow} />
                  <div className={styles.miniRow} />
                  <div className={styles.miniRow} style={{ width: '60%' }} />
                </div>
                <div className={styles.miniDivider} />
                <div className={`${styles.miniZone} ${styles.miniToday}`} data-zone="today">
                  <div className={styles.miniRow} />
                  <div className={styles.miniRow} style={{ width: '72%' }} />
                  <div className={styles.miniRow} style={{ width: '48%' }} />
                </div>
                <div className={`${styles.miniZone} ${styles.miniSpaces}`} data-zone="spaces">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <ol className={styles.zones}>
                {ZONES.map((z) => (
                  <li key={z.id}>
                    <button
                      type="button"
                      className={styles.zone}
                      aria-pressed={zone === z.id}
                      onMouseEnter={() => setZone(z.id)}
                      onFocus={() => setZone(z.id)}
                      onClick={() => setZone(z.id)}
                    >
                      <span className={styles.zoneIcon}>
                        <Icon name={z.icon} size={14} />
                      </span>
                      <span className={styles.zoneText}>
                        <span className={styles.zoneTitle}>{t(ZONE_TEXT[z.id].title)}</span>
                        <span className={styles.zoneHint}>{t(ZONE_TEXT[z.id].text)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : step === 1 ? (
          <div key="s1" className={styles.step} data-dir={dir} data-testid="onboarding-step-import">
            <div>
              <p className={styles.eyebrow}>{t('pages.onboarding.stepOf', { n: 2, total: STEPS })}</p>
              <h1 className={styles.h1}>{t('pages.onboarding.import.title')}</h1>
            </div>
            <p className={styles.lead}>{t('pages.onboarding.import.lead')}</p>
            <div className={styles.importBox}>
              <ImportPanel />
            </div>
          </div>
        ) : (
          <div key="s2" className={styles.step} data-dir={dir} data-testid="onboarding-step-shortcuts">
            <div>
              <p className={styles.eyebrow}>{t('pages.onboarding.stepOf', { n: 3, total: STEPS })}</p>
              <h1 className={styles.h1}>{t('pages.onboarding.shortcuts.title')}</h1>
            </div>
            <p className={styles.lead}>{t('pages.onboarding.shortcuts.lead')}</p>
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
            <div className={styles.dots} role="tablist" aria-label={t('pages.onboarding.stepsLabel')}>
              {Array.from({ length: STEPS }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-label={t('pages.onboarding.stepLabel', { n: i + 1 })}
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
                  {t('common.back')}
                </Button>
              )}
              {step === 1 && (
                <Button variant="ghost" testId="onboarding-skip" onClick={() => go(2)}>
                  {t('pages.onboarding.skip')}
                </Button>
              )}
              {step < STEPS - 1 ? (
                <Button variant="primary" testId="onboarding-next" onClick={() => go(step + 1)}>
                  {step === 1 ? t('pages.onboarding.continue') : t('pages.onboarding.next')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  testId="onboarding-finish"
                  disabled={saving}
                  onClick={() => void finish()}
                >
                  {t('pages.onboarding.start')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
