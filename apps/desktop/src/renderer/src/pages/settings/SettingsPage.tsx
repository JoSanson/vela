import { Icon, type IconName } from '../../components/Icon';
import { useT } from '../../lib/i18n';
import { useHash } from '../lib';
import { PageShell } from '../PageShell';
import { AboutSection } from './AboutSection';
import { AtcSection } from './AtcSection';
import { BoostsSection } from './BoostsSection';
import { ExtensionsSection } from './ExtensionsSection';
import { GeneralSection } from './GeneralSection';
import { ImportSection } from './ImportSection';
import { PasswordsSection } from './PasswordsSection';
import { PermissionsSection } from './PermissionsSection';
import styles from './Settings.module.css';
import { SpacesSection } from './SpacesSection';

export type SectionId =
  'general' | 'spaces' | 'atc' | 'permissions' | 'passwords' | 'boosts' | 'extensions' | 'import' | 'about';

const SECTIONS: { id: SectionId; icon: IconName }[] = [
  { id: 'general', icon: 'sliders' },
  { id: 'spaces', icon: 'layers' },
  { id: 'atc', icon: 'send' },
  { id: 'permissions', icon: 'shield' },
  { id: 'passwords', icon: 'key' },
  { id: 'boosts', icon: 'zap' },
  { id: 'extensions', icon: 'puzzle' },
  { id: 'import', icon: 'download' },
  { id: 'about', icon: 'info' },
];

function sectionFromHash(hash: string): SectionId {
  const h = hash.split('/')[0] ?? '';
  return SECTIONS.find((s) => s.id === h)?.id ?? 'general';
}

export function SettingsPage() {
  const t = useT();
  const hash = useHash();
  const active = sectionFromHash(hash);
  const current = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <PageShell title={t('settings.title')} icon="settings" testId="page-settings" maxWidth={1040}>
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label={t('settings.nav.label')} data-testid="settings-nav">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={styles.navItem}
              aria-current={s.id === active ? 'page' : undefined}
              data-testid={`settings-nav-${s.id}`}
            >
              <Icon name={s.icon} size={15} />
              {t(`settings.nav.${s.id}`)}
            </a>
          ))}
        </nav>
        <div key={active} className={styles.section} data-testid="settings-section">
          {current && (
            <div className={styles.sectionHead}>
              <h2 className={styles.h2}>{t(`settings.nav.${current.id}`)}</h2>
            </div>
          )}
          {active === 'general' && <GeneralSection />}
          {active === 'spaces' && <SpacesSection />}
          {active === 'atc' && <AtcSection />}
          {active === 'permissions' && <PermissionsSection />}
          {active === 'passwords' && <PasswordsSection />}
          {active === 'boosts' && <BoostsSection />}
          {active === 'extensions' && <ExtensionsSection />}
          {active === 'import' && <ImportSection />}
          {active === 'about' && <AboutSection />}
        </div>
      </div>
    </PageShell>
  );
}
