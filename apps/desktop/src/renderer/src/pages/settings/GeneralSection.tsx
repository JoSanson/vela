import { SEARCH_ENGINES } from '@vela/core';
import type { AutoArchiveHours, ClearDataRequest, Prefs } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { tryInvoke, useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Button, Card, Row, Segmented, Select, TextInput, Toggle } from '../ui';
import styles from './Settings.module.css';

const ARCHIVE_OPTIONS: { value: AutoArchiveHours; label: string }[] = [
  { value: 12, label: 'After 12 hours' },
  { value: 24, label: 'After 24 hours' },
  { value: 168, label: 'After 7 days' },
  { value: 720, label: 'After 30 days' },
];

const CLEAR_ALL: ClearDataRequest = {
  history: true,
  cookies: true,
  cache: true,
  storage: true,
  downloads: true,
};
const CLEAR_LABELS: { key: keyof ClearDataRequest; label: string }[] = [
  { key: 'history', label: 'History' },
  { key: 'cookies', label: 'Cookies and logins' },
  { key: 'cache', label: 'Cached files' },
  { key: 'storage', label: 'Site data' },
  { key: 'downloads', label: 'Download list' },
];

export function GeneralSection() {
  const { snap, setPrefs } = useSnapshot();
  const { toast } = useToast();
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
      r === null ? "Couldn't clear browsing data" : 'Browsing data cleared',
      r === null ? 'error' : 'info',
    );
  };

  const update = (patch: Partial<Prefs>): void => {
    void setPrefs(patch).then((ok) => {
      if (!ok) toast("Couldn't save this setting", 'error');
    });
  };

  if (!prefs) {
    return (
      <div className={styles.hintBox} data-testid="settings-loading">
        <Icon name="info" size={14} />
        Loading preferences…
      </div>
    );
  }

  return (
    <div className={styles.stack} data-testid="settings-general">
      <p className={styles.h3}>Browsing</p>
      <Card>
        <Row label="Default browser" hint="Links from other apps open in Vela.">
          {isDefault ? (
            <span className={styles.soon}>Vela is your default browser</span>
          ) : (
            <Button
              variant="secondary"
              testId="settings-default-browser"
              onClick={() =>
                void tryInvoke('app/defaultBrowser', { set: true }).then((v) => setIsDefault(v ?? null))
              }
            >
              Make default
            </Button>
          )}
        </Row>
        <Row label="Search engine" hint="Used when you type a query in the command bar.">
          <Select
            value={prefs.searchEngineId}
            options={SEARCH_ENGINES.map((e) => ({ value: e.id, label: e.name }))}
            onChange={(v) => update({ searchEngineId: v })}
            testId="settings-search-engine"
            aria-label="Search engine"
          />
        </Row>
        <Row label="Appearance" hint="Follow the system, or force light or dark for every space.">
          <Segmented
            label="Theme"
            value={prefs.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => update({ theme: v })}
            testId="settings-theme"
          />
        </Row>
        <Row label="Hide sidebar" hint="Start with the sidebar collapsed. Hover the left edge to peek at it.">
          <Toggle
            label="Hide sidebar"
            checked={prefs.sidebarHidden}
            onChange={(v) => update({ sidebarHidden: v })}
            testId="settings-sidebar-hidden"
          />
        </Row>
      </Card>

      <p className={styles.h3}>Tabs</p>
      <Card>
        <Row
          label="Auto-archive Today tabs"
          hint="Untouched tabs move to the archive so your list stays short."
        >
          <Select
            value={String(prefs.autoArchiveHours)}
            options={ARCHIVE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            onChange={(v) => {
              const n = Number(v);
              const hours = ARCHIVE_OPTIONS.find((o) => o.value === n)?.value;
              if (hours) update({ autoArchiveHours: hours });
            }}
            testId="settings-auto-archive"
            aria-label="Auto-archive delay"
          />
        </Row>
        <Row
          label="Memory saver"
          hint="Puts background tabs to sleep after a while. They reload instantly when you come back."
        >
          <TextInput
            type="number"
            min={1}
            max={720}
            style={{ width: 72, textAlign: 'right' }}
            value={String(prefs.memorySaverMinutes)}
            disabled={!prefs.memorySaverEnabled}
            aria-label="Minutes before sleeping"
            testId="settings-memory-saver-minutes"
            onChange={(v) => {
              const n = Math.max(1, Math.min(720, Math.round(Number(v))));
              if (Number.isFinite(n)) update({ memorySaverMinutes: n });
            }}
          />
          <span className={styles.soon}>min</span>
          <Toggle
            label="Memory saver"
            checked={prefs.memorySaverEnabled}
            onChange={(v) => update({ memorySaverEnabled: v })}
            testId="settings-memory-saver"
          />
        </Row>
        <Row
          label="Automatic picture-in-picture"
          hint="Playing video pops out into a floating window when you switch tabs."
        >
          <Toggle
            label="Automatic picture-in-picture"
            checked={prefs.autoPip}
            onChange={(v) => update({ autoPip: v })}
            testId="settings-auto-pip"
          />
        </Row>
      </Card>

      <p className={styles.h3}>Downloads</p>
      <Card>
        <Row label="Save files to" hint={prefs.downloadDir ?? 'Your Downloads folder'}>
          <Button
            variant="secondary"
            testId="settings-download-dir"
            onClick={() => void tryInvoke('downloads/pickDir', undefined)}
          >
            Change…
          </Button>
          {prefs.downloadDir && (
            <Button variant="ghost" size="sm" onClick={() => update({ downloadDir: null })}>
              Reset
            </Button>
          )}
        </Row>
        <Row label="Ask where to save each file" hint="Show a save dialog instead of saving automatically.">
          <Toggle
            label="Ask where to save each file"
            checked={prefs.askWhereToSave}
            onChange={(v) => update({ askWhereToSave: v })}
            testId="settings-ask-where"
          />
        </Row>
      </Card>

      <p className={styles.h3}>Privacy & updates</p>
      <Card>
        <Row
          label="Always use secure connections"
          hint="Upgrades http:// pages to https:// and falls back only when a site has no TLS."
        >
          <Toggle
            label="Always use secure connections"
            checked={prefs.httpsUpgrade}
            onChange={(v) => update({ httpsUpgrade: v })}
            testId="settings-https"
          />
        </Row>
        <Row label="Clear browsing data" hint="Cookies, cache, history and site data, for every profile.">
          {clearing ? (
            <span className={styles.clearChoices} data-testid="settings-clear-choices">
              {CLEAR_LABELS.map((c) => (
                <label key={c.key} className={styles.clearChoice}>
                  <input
                    type="checkbox"
                    checked={clearChoice[c.key]}
                    onChange={(e) => setClearChoice({ ...clearChoice, [c.key]: e.target.checked })}
                  />
                  {c.label}
                </label>
              ))}
              <Button
                variant="danger"
                size="sm"
                testId="settings-clear-confirm"
                onClick={() => void clearData()}
              >
                Clear now
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setClearing(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button variant="secondary" testId="settings-clear-data" onClick={() => setClearing(true)}>
              Clear…
            </Button>
          )}
        </Row>
        <Row
          label="Block ads and trackers"
          hint="Built-in content blocking. Disable per site from the site menu."
        >
          <Toggle
            label="Block ads and trackers"
            checked={prefs.blockerEnabled}
            onChange={(v) => update({ blockerEnabled: v })}
            testId="settings-blocker"
          />
        </Row>
        <Row
          label="Glass sidebar"
          hint="Translucent sidebar that lets your desktop show through (macOS vibrancy)."
        >
          <Toggle
            label="Glass sidebar"
            checked={prefs.glass}
            onChange={(v) => update({ glass: v })}
            testId="settings-glass"
          />
        </Row>
        <Row
          label="Install updates automatically"
          hint="Downloads updates in the background and installs on relaunch."
        >
          <Toggle
            label="Install updates automatically"
            checked={prefs.autoUpdate}
            onChange={(v) => update({ autoUpdate: v })}
            testId="settings-auto-update"
          />
        </Row>
      </Card>
    </div>
  );
}
