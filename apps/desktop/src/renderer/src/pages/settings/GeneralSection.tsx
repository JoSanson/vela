import { SEARCH_ENGINES } from '@vela/core';
import type { AutoArchiveHours, Prefs } from '@vela/shared';
import { Icon } from '../../components/Icon';
import { useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Card, Row, Segmented, Select, TextInput, Toggle } from '../ui';
import styles from './Settings.module.css';

const ARCHIVE_OPTIONS: { value: AutoArchiveHours; label: string }[] = [
  { value: 12, label: 'After 12 hours' },
  { value: 24, label: 'After 24 hours' },
  { value: 168, label: 'After 7 days' },
  { value: 720, label: 'After 30 days' },
];

export function GeneralSection() {
  const { snap, setPrefs } = useSnapshot();
  const { toast } = useToast();
  const prefs = snap?.prefs;

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

      <p className={styles.h3}>Privacy & updates</p>
      <Card>
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
