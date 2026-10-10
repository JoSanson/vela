import { Icon, type IconName } from '../../components/Icon';
import { useHash } from '../lib';
import { PageShell } from '../PageShell';
import { AboutSection } from './AboutSection';
import { AtcSection } from './AtcSection';
import { BoostsSection } from './BoostsSection';
import { ExtensionsSection } from './ExtensionsSection';
import { GeneralSection } from './GeneralSection';
import { ImportSection } from './ImportSection';
import { PermissionsSection } from './PermissionsSection';
import styles from './Settings.module.css';
import { SpacesSection } from './SpacesSection';

export type SectionId =
  'general' | 'spaces' | 'atc' | 'permissions' | 'boosts' | 'extensions' | 'import' | 'about';

const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: 'general', label: 'General', icon: 'sliders' },
  { id: 'spaces', label: 'Spaces & profiles', icon: 'layers' },
  { id: 'atc', label: 'Air Traffic Control', icon: 'send' },
  { id: 'permissions', label: 'Permissions', icon: 'shield' },
  { id: 'boosts', label: 'Boosts', icon: 'zap' },
  { id: 'extensions', label: 'Extensions', icon: 'puzzle' },
  { id: 'import', label: 'Import & export', icon: 'download' },
  { id: 'about', label: 'About & updates', icon: 'info' },
];

function sectionFromHash(hash: string): SectionId {
  const h = hash.split('/')[0] ?? '';
  return SECTIONS.find((s) => s.id === h)?.id ?? 'general';
}

export function SettingsPage() {
  const hash = useHash();
  const active = sectionFromHash(hash);
  const current = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <PageShell title="Settings" icon="settings" testId="page-settings" maxWidth={1040}>
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Settings sections" data-testid="settings-nav">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={styles.navItem}
              aria-current={s.id === active ? 'page' : undefined}
              data-testid={`settings-nav-${s.id}`}
            >
              <Icon name={s.icon} size={15} />
              {s.label}
            </a>
          ))}
        </nav>
        <div key={active} className={styles.section} data-testid="settings-section">
          {current && (
            <div className={styles.sectionHead}>
              <h2 className={styles.h2}>{current.label}</h2>
            </div>
          )}
          {active === 'general' && <GeneralSection />}
          {active === 'spaces' && <SpacesSection />}
          {active === 'atc' && <AtcSection />}
          {active === 'permissions' && <PermissionsSection />}
          {active === 'boosts' && <BoostsSection />}
          {active === 'extensions' && <ExtensionsSection />}
          {active === 'import' && <ImportSection />}
          {active === 'about' && <AboutSection />}
        </div>
      </div>
    </PageShell>
  );
}
