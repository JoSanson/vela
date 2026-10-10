import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  SPACE_PRESET_THEMES,
  createDefaultState,
  createFolder,
  createId,
  createProfile,
  createSpace,
  createTab,
  toArchived,
} from './factories';

const NOW = 1_700_000_000_000;

describe('factories', () => {
  it('createId yields unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createId()));
    expect(ids.size).toBe(50);
  });

  it('createSpace applies defaults and overrides', () => {
    const s = createSpace({ name: 'Work' });
    expect(s).toMatchObject({
      name: 'Work',
      emoji: '✦',
      theme: DEFAULT_THEME,
      profileId: null,
      pinned: [],
      today: [],
      activeTabId: null,
      split: null,
    });
    expect(s.id).toBeTruthy();
    const theme = SPACE_PRESET_THEMES[1] ?? DEFAULT_THEME;
    const custom = createSpace({ id: 'x', name: 'X', emoji: '🚀', theme, profileId: 'p', now: NOW });
    expect(custom).toMatchObject({ id: 'x', emoji: '🚀', theme, profileId: 'p', createdAt: NOW });
  });

  it('createTab sets kind-dependent fields', () => {
    const today = createTab({ url: 'https://a.test/', spaceId: 's1', now: NOW });
    expect(today).toMatchObject({
      kind: 'today',
      spaceId: 's1',
      homeUrl: null,
      title: '',
      createdAt: NOW,
      lastActiveAt: NOW,
      zoom: 1,
    });
    const pinned = createTab({ id: 'p', url: 'https://a.test/', spaceId: 's1', kind: 'pinned', title: 'A' });
    expect(pinned).toMatchObject({
      id: 'p',
      kind: 'pinned',
      spaceId: 's1',
      homeUrl: 'https://a.test/',
      title: 'A',
    });
    const fav = createTab({ url: 'https://a.test/', spaceId: 's1', kind: 'favorite' });
    expect(fav).toMatchObject({ kind: 'favorite', spaceId: null, homeUrl: 'https://a.test/' });
  });

  it('createFolder and createProfile', () => {
    expect(createFolder({ spaceId: 's1', name: 'F' })).toMatchObject({
      spaceId: 's1',
      name: 'F',
      emoji: null,
      children: [],
      collapsed: false,
    });
    expect(createFolder({ id: 'f', spaceId: 's1', name: 'F', emoji: '📁' }).emoji).toBe('📁');
    const p = createProfile('Work', '#fff');
    expect(p.partition).toBe(`persist:profile-${p.id}`);
    expect(createProfile('W', '#000', 'fixed')).toEqual({
      id: 'fixed',
      name: 'W',
      partition: 'persist:profile-fixed',
      color: '#000',
    });
  });

  it('toArchived prefers customTitle', () => {
    const tab = {
      ...createTab({ id: 't', url: 'https://a.test/', spaceId: 's1', title: 'T' }),
      favicon: 'ico',
    };
    expect(toArchived(tab, 'Home', NOW, 'manual')).toEqual({
      id: 't',
      spaceId: 's1',
      spaceName: 'Home',
      url: 'https://a.test/',
      title: 'T',
      favicon: 'ico',
      archivedAt: NOW,
      reason: 'manual',
    });
    expect(toArchived({ ...tab, customTitle: 'C' }, 'Home', NOW, 'auto').title).toBe('C');
  });

  it('createDefaultState has one active Home space', () => {
    const s = createDefaultState(NOW);
    expect(s.spaceOrder).toHaveLength(1);
    expect(s.activeSpaceId).toBe(s.spaceOrder[0]);
    expect(s.spaces[s.activeSpaceId]).toMatchObject({ name: 'Home', emoji: '🏠', createdAt: NOW });
    expect(s).toMatchObject({
      tabs: {},
      folders: {},
      favorites: [],
      mru: [],
      archive: [],
      atcRules: [],
      profiles: {},
    });
    expect(createDefaultState().spaceOrder).toHaveLength(1);
  });
});
