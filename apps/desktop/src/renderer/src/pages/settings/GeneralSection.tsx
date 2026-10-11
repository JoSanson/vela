import { SEARCH_ENGINES } from '@vela/core';
import {
  isLocale,
  LANGUAGE_NAMES,
  LOCALES,
  resolveLocale,
  type AutoArchiveHours,
  type ClearDataRequest,
  type Prefs,
  type Translator,
} from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useT } from '../../lib/i18n';
import { tryInvoke, useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Button, Card, Row, Segmented, Select, TextInput, Toggle } from '../ui';
import { SiteSearchEditor } from './SiteSearchEditor';
import styles from './Settings.module.css';

const ARCHIVE_HOURS: AutoArchiveHours[] = [12, 24, 168, 720];

function archiveLabel(t: Translator, hours: AutoArchiveHours): string {
  return hours < 48
    ? t('settings.general.autoArchive.hours', { n: hours })
    : t('settings.general.autoArchive.days', { n: hours / 24 });
}

const CLEAR_ALL: ClearDataRequest = {
  history: true,
  cookies: true,
  cache: true,
  storage: true,
  downloads: true,
};
const CLEAR_KEYS = [
  'history',
  'cookies',
  'cache',
  'storage',
  'downloads',
] as const satisfies readonly (keyof ClearDataRequest)[];

export function GeneralSection() {
  const { snap, setPrefs } = useSnapshot();
  const { toast } = useToast();
  const t = useT();
  const prefs = snap?.prefs;
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  useEffect(() => {
    void tryInvoke('app/defaultBrowser', {}).then((v) => setIsDefault(v ?? null));
  }, []);
  const [clearing, setClearing] = useState(false);
  const [clearChoice, setClearChoice] = useState<ClearDataRequest>(CLEAR_ALL);
  const clearData = async (): Promise<void> => {
    const r = await tryInvoke('privacy/clear', clearChoice);
    setClearing(false);
    toast(
      r === null ? t('settings.general.clearData.error') : t('settings.general.clearData.done'),
      r === null ? 'error' : 'info',
    );
  };

  const update = (patch: Partial<Prefs>): void => {
    void setPrefs(patch).then((ok) => {
      if (!ok) toast(t('settings.general.saveError'), 'error');
    });
  };

  if (!prefs) {
    return (
      <div className={styles.hintBox} data-testid="settings-loading">
        <Icon name="info" size={14} />
        {t('settings.general.loading')}
      </div>
    );
  }

  return (
    <div className={styles.stack} data-testid="settings-general">
      <p className={styles.h3}>{t('settings.general.browsing')}</p>
      <Card>
        <Row
          label={t('settings.general.defaultBrowser.label')}
          hint={t('settings.general.defaultBrowser.hint')}
        >
          {isDefault ? (
            <span className={styles.soon}>{t('settings.general.defaultBrowser.isDefault')}</span>
          ) : (
            <Button
              variant="secondary"
              testId="settings-default-browser"
              onClick={() =>
                void tryInvoke('app/defaultBrowser', { set: true }).then((v) => setIsDefault(v ?? null))
              }
            >
              {t('settings.general.defaultBrowser.make')}
            </Button>
          )}
        </Row>
        <Row label={t('settings.general.searchEngine.label')} hint={t('settings.general.searchEngine.hint')}>
          <Select
            value={prefs.searchEngineId}
            options={SEARCH_ENGINES.map((e) => ({ value: e.id, label: e.name }))}
            onChange={(v) => update({ searchEngineId: v })}
            testId="settings-search-engine"
            aria-label={t('settings.general.searchEngine.label')}
          />
        </Row>
        <Row
          label={t('settings.general.siteSearch.label')}
          hint={t('settings.general.siteSearch.hint')}
          testId="settings-site-search"
          stacked
        >
          <SiteSearchEditor value={prefs.siteSearches} onChange={(v) => update({ siteSearches: v })} />
        </Row>
        <Row label={t('settings.general.appearance.label')} hint={t('settings.general.appearance.hint')}>
          <Segmented
            label={t('settings.general.theme.label')}
            value={prefs.theme}
            options={[
              { value: 'system', label: t('settings.general.theme.system') },
              { value: 'light', label: t('settings.general.theme.light') },
              { value: 'dark', label: t('settings.general.theme.dark') },
            ]}
            onChange={(v) => update({ theme: v })}
            testId="settings-theme"
          />
        </Row>
        <Row label={t('settings.language.label')} hint={t('settings.language.hint')}>
          <Select
            value={prefs.language}
            options={[
              {
                value: 'system',
                label: t('settings.language.system', {
                  name: LANGUAGE_NAMES[resolveLocale('system', snap?.systemLocale ?? 'en')],
                }),
              },
              ...LOCALES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
            ]}
            onChange={(v) => update({ language: isLocale(v) ? v : 'system' })}
            testId="settings-language"
            aria-label={t('settings.language.label')}
          />
        </Row>
        <Row label={t('settings.general.hideSidebar.label')} hint={t('settings.general.hideSidebar.hint')}>
          <Toggle
            label={t('settings.general.hideSidebar.label')}
            checked={prefs.sidebarHidden}
            onChange={(v) => update({ sidebarHidden: v })}
            testId="settings-sidebar-hidden"
          />
        </Row>
      </Card>

      <p className={styles.h3}>{t('settings.general.tabs')}</p>
      <Card>
        <Row label={t('settings.general.autoArchive.label')} hint={t('settings.general.autoArchive.hint')}>
          <Select
            value={String(prefs.autoArchiveHours)}
            options={ARCHIVE_HOURS.map((h) => ({ value: String(h), label: archiveLabel(t, h) }))}
            onChange={(v) => {
              const n = Number(v);
              const hours = ARCHIVE_HOURS.find((h) => h === n);
              if (hours) update({ autoArchiveHours: hours });
            }}
            testId="settings-auto-archive"
            aria-label={t('settings.general.autoArchive.aria')}
          />
        </Row>
        <Row label={t('settings.general.memorySaver.label')} hint={t('settings.general.memorySaver.hint')}>
          <TextInput
            type="number"
            min={1}
            max={720}
            style={{ width: 72, textAlign: 'right' }}
            value={String(prefs.memorySaverMinutes)}
            disabled={!prefs.memorySaverEnabled}
            aria-label={t('settings.general.memorySaver.minutesAria')}
            testId="settings-memory-saver-minutes"
            onChange={(v) => {
              const n = Math.max(1, Math.min(720, Math.round(Number(v))));
              if (Number.isFinite(n)) update({ memorySaverMinutes: n });
            }}
          />
          <span className={styles.soon}>{t('settings.general.memorySaver.minUnit')}</span>
          <Toggle
            label={t('settings.general.memorySaver.label')}
            checked={prefs.memorySaverEnabled}
            onChange={(v) => update({ memorySaverEnabled: v })}
            testId="settings-memory-saver"
          />
        </Row>
        <Row label={t('settings.general.autoPip.label')} hint={t('settings.general.autoPip.hint')}>
          <Toggle
            label={t('settings.general.autoPip.label')}
            checked={prefs.autoPip}
            onChange={(v) => update({ autoPip: v })}
            testId="settings-auto-pip"
          />
        </Row>
      </Card>

      <p className={styles.h3}>{t('settings.general.downloads')}</p>
      <Card>
        <Row
          label={t('settings.general.downloadDir.label')}
          hint={prefs.downloadDir ?? t('settings.general.downloadDir.default')}
        >
          <Button
            variant="secondary"
            testId="settings-download-dir"
            onClick={() => void tryInvoke('downloads/pickDir', undefined)}
          >
            {t('settings.general.downloadDir.change')}
          </Button>
          {prefs.downloadDir && (
            <Button variant="ghost" size="sm" onClick={() => update({ downloadDir: null })}>
              {t('settings.general.downloadDir.reset')}
            </Button>
          )}
        </Row>
        <Row
          label={t('settings.general.askWhereToSave.label')}
          hint={t('settings.general.askWhereToSave.hint')}
        >
          <Toggle
            label={t('settings.general.askWhereToSave.label')}
            checked={prefs.askWhereToSave}
            onChange={(v) => update({ askWhereToSave: v })}
            testId="settings-ask-where"
          />
        </Row>
      </Card>

      <p className={styles.h3}>{t('settings.general.privacy')}</p>
      <Card>
        <Row label={t('settings.general.safeBrowsing.label')} hint={t('settings.general.safeBrowsing.hint')}>
          <Toggle
            label={t('settings.general.safeBrowsing.label')}
            checked={prefs.safeBrowsing}
            onChange={(v) => update({ safeBrowsing: v })}
            testId="settings-safe-browsing"
          />
        </Row>
        <Row label={t('settings.general.httpsUpgrade.label')} hint={t('settings.general.httpsUpgrade.hint')}>
          <Toggle
            label={t('settings.general.httpsUpgrade.label')}
            checked={prefs.httpsUpgrade}
            onChange={(v) => update({ httpsUpgrade: v })}
            testId="settings-https"
          />
        </Row>
        <Row label={t('settings.general.clearData.label')} hint={t('settings.general.clearData.hint')}>
          {clearing ? (
            <span className={styles.clearChoices} data-testid="settings-clear-choices">
              {CLEAR_KEYS.map((key) => (
                <label key={key} className={styles.clearChoice}>
                  <input
                    type="checkbox"
                    checked={clearChoice[key]}
                    onChange={(e) => setClearChoice({ ...clearChoice, [key]: e.target.checked })}
                  />
                  {t(`settings.general.clearData.${key}`)}
                </label>
              ))}
              <Button
                variant="danger"
                size="sm"
                testId="settings-clear-confirm"
                onClick={() => void clearData()}
              >
                {t('settings.general.clearData.confirm')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setClearing(false)}>
                {t('common.cancel')}
              </Button>
            </span>
          ) : (
            <Button variant="secondary" testId="settings-clear-data" onClick={() => setClearing(true)}>
              {t('settings.general.clearData.start')}
            </Button>
          )}
        </Row>
        <Row label={t('settings.general.blocker.label')} hint={t('settings.general.blocker.hint')}>
          <Toggle
            label={t('settings.general.blocker.label')}
            checked={prefs.blockerEnabled}
            onChange={(v) => update({ blockerEnabled: v })}
            testId="settings-blocker"
          />
        </Row>
        <Row label={t('settings.general.glass.label')} hint={t('settings.general.glass.hint')}>
          <Toggle
            label={t('settings.general.glass.label')}
            checked={prefs.glass}
            onChange={(v) => update({ glass: v })}
            testId="settings-glass"
          />
        </Row>
        <Row label={t('settings.general.autoUpdate.label')} hint={t('settings.general.autoUpdate.hint')}>
          <Toggle
            label={t('settings.general.autoUpdate.label')}
            checked={prefs.autoUpdate}
            onChange={(v) => update({ autoUpdate: v })}
            testId="settings-auto-update"
          />
        </Row>
      </Card>
    </div>
  );
}
