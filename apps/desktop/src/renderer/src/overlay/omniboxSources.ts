import {
  displayTitle,
  displayUrl,
  type ArchivedTab,
  type CoreState,
  type Id,
  type OmniCandidate,
} from '@vela/core';
import { SHORTCUTS, type HistoryEntry, type MessageKey, type Translator } from '@vela/shared';
import type { IconName } from '../components/Icon';

/** Shortcuts that make no sense as typed commands (they are the bar itself or need a held key). */
const HIDDEN = new Set([
  'newTab',
  'editUrl',
  'nextTabMru',
  'prevTabMru',
  'nextTab',
  'prevTab',
  'spaceNext',
  'spacePrev',
]);

/** Listed, but never what a bare Enter runs. */
const DESTRUCTIVE = new Set(['closeTab', 'clearToday', 'clearSiteCookies', 'closeSplit']);

/** Commands that are not keyboard shortcuts. */
const EXTRA: { id: string; label: MessageKey; english: string }[] = [
  {
    id: 'clearSiteCookies',
    label: 'overlay.command.clearSiteCookies',
    english: 'Clear cookies for this site',
  },
  { id: 'shortcuts', label: 'overlay.command.shortcuts', english: 'Keyboard shortcuts' },
  { id: 'savePage', label: 'menu.context.savePageAs', english: 'Save page as' },
  { id: 'zap', label: 'menu.context.zap', english: 'Zap element hide block' },
];

/** Typed words people reach for that the label does not contain. */
const ALIASES: Record<string, string> = {
  settings: 'preferences options parametres config',
  downloads: 'dl telechargements',
  history: 'historique',
  devtools: 'inspect console inspector developer',
  readerMode: 'read article lecture',
  newPrivateWindow: 'incognito private prive',
  print: 'pdf imprimer',
  copyUrl: 'link lien',
  copyUrlMarkdown: 'link lien md',
  findInPage: 'search page rechercher',
  splitView: 'side by side cote a cote',
  toggleSidebar: 'hide show',
  fullscreen: 'plein ecran',
  clearToday: 'close all tabs fermer',
  reopenTab: 'undo close restore restaurer',
  littleWindow: 'mini popup',
  allSpaces: 'espaces',
  newSpace: 'espace',
  archiveView: 'archive',
  clearSiteCookies: 'logout sign out deconnexion',
  openFile: 'ouvrir fichier',
  savePage: 'save enregistrer download',
};

export const COMMAND_ICONS: Record<string, IconName> = {
  newSpace: 'plus',
  allSpaces: 'layers',
  splitView: 'split',
  closeSplit: 'split',
  toggleSidebar: 'sidebar',
  pinTab: 'pin',
  archiveView: 'archive',
  clearSiteCookies: 'shield',
  history: 'history',
  downloads: 'download',
  settings: 'settings',
  shortcuts: 'keyboard',
  readerMode: 'book',
  devtools: 'zap',
  viewSource: 'zap',
  littleWindow: 'window',
  newWindow: 'window',
  newPrivateWindow: 'eye',
  reload: 'reload',
  hardReload: 'reload',
  stop: 'close',
  back: 'back',
  forward: 'forward',
  findInPage: 'search',
  zoomIn: 'plus',
  zoomOut: 'sliders',
  zoomReset: 'sliders',
  closeTab: 'close',
  reopenTab: 'reload',
  clearToday: 'trash',
  copyUrl: 'send',
  copyUrlMarkdown: 'send',
  print: 'upload',
  fullscreen: 'expand',
  openFile: 'folder',
  savePage: 'download',
  zap: 'zap',
};

export interface CommandEntry {
  id: string;
  accelerator: string | null;
}

export function commandCandidates(t: Translator): { candidates: OmniCandidate[]; entries: CommandEntry[] } {
  const candidates: OmniCandidate[] = [];
  const entries: CommandEntry[] = [];
  const add = (id: string, title: string, english: string, accelerator: string | null): void => {
    candidates.push({
      id: `cmd:${id}`,
      kind: 'command',
      title,
      keywords: `${english} ${ALIASES[id] ?? ''}`.trim(),
      ...(DESTRUCTIVE.has(id) ? { noDefault: true } : {}),
    });
    entries.push({ id, accelerator });
  };
  for (const s of SHORTCUTS) {
    if (HIDDEN.has(s.id) || /^(tab|space|split)\d$/.test(s.id)) continue;
    add(s.id, t(`shortcut.${s.id}` as MessageKey), s.label, s.accelerator);
  }
  for (const e of EXTRA) add(e.id, t(e.label), e.english, null);
  return { candidates, entries };
}

/** Open tabs, pinned and favorites the current Space can see (D030). */
export function tabCandidates(
  core: CoreState,
  spaceId: Id,
  profileId: Id | null,
  activeId: Id,
): OmniCandidate[] {
  const out: OmniCandidate[] = [];
  for (const t of Object.values(core.tabs)) {
    if (t.shadowOf) continue;
    const visible = t.kind === 'favorite' ? (t.profileId ?? null) === profileId : t.spaceId === spaceId;
    if (!visible) continue;
    out.push({
      id: `tab:${t.id}`,
      kind: t.kind === 'favorite' ? 'favorite' : t.kind === 'pinned' ? 'pinned' : 'tab',
      title: displayTitle(t),
      url: t.url,
      lastVisit: t.lastActiveAt,
      favicon: t.favicon,
      ...(t.id === activeId ? { current: true } : {}),
    });
  }
  return out;
}

export function historyCandidates(rows: readonly HistoryEntry[]): OmniCandidate[] {
  return rows.map((h) => ({
    id: `history:${h.url}`,
    kind: 'history',
    title: h.title || displayUrl(h.url),
    url: h.url,
    visitCount: h.visitCount,
    lastVisit: h.visitedAt,
    favicon: h.favicon,
  }));
}

export function archiveCandidates(
  rows: readonly ArchivedTab[],
  kind: 'archived' | 'closed',
): OmniCandidate[] {
  return rows.map((a) => ({
    id: `${kind}:${a.id}`,
    kind,
    title: a.title || displayUrl(a.url),
    url: a.url,
    favicon: a.favicon,
  }));
}

/** Other Spaces to jump to, and "move this tab to …" for each of them. */
export function spaceCandidates(
  core: CoreState,
  currentRoot: Id,
  t: Translator,
  canMoveTab: boolean,
): OmniCandidate[] {
  const out: OmniCandidate[] = [];
  for (const sid of core.spaceOrder) {
    const sp = core.spaces[sid];
    if (!sp || sid === currentRoot) continue;
    out.push({ id: `space:${sid}`, kind: 'space', title: sp.name, keywords: 'space espace switch aller' });
    if (canMoveTab) {
      out.push({
        id: `move:${sid}`,
        kind: 'command',
        title: t('overlay.commandBar.moveTo', { name: sp.name }),
        keywords: `move tab to ${sp.name} deplacer`,
      });
    }
  }
  return out;
}
