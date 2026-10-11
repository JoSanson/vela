import { createDefaultState, createTab, reduce, type CoreState } from '@vela/core';
import { describe, expect, it } from 'vitest';
import {
  applyArcSidebar,
  arcEmoji,
  arcThemeToSpaceTheme,
  arcTimeToMs,
  parseArcSidebar,
} from './importers/arc';
import { chromeBookmarksToTree, chromeTimeToMs } from './importers/chromium';
import {
  firefoxHistoryToEntries,
  firefoxRowsToTree,
  firefoxTimeToMs,
  type FirefoxBookmarkRow,
} from './importers/firefox';
import { parsePlistXml } from './importers/plist';
import {
  appleTimeToMs,
  safariBookmarksToTree,
  safariHistoryToEntries,
  toSafariNode,
} from './importers/safari';
import { applyBookmarkTree, folder, leaf, type BookmarkFolder } from './importers/tree';

const NOW = 1_700_000_000_000;

function names(state: CoreState, ids: string[]): string[] {
  return ids.map((id) => state.tabs[id]?.url ?? state.folders[id]?.name ?? '?');
}

// Hand-written stand-in for StorableSidebar.json: same alternating id/object lists, same nesting.
function arcFixture(): unknown {
  const item = (
    id: string,
    parentID: string | null,
    childrenIds: string[],
    data: Record<string, unknown>,
    title: string | null = null,
  ): unknown[] => [id, { id, parentID, childrenIds, title, createdAt: 700000000, data }];
  const tab = (id: string, parent: string, url: string, title: string): unknown[] =>
    item(id, parent, [], { tab: { savedURL: url, savedTitle: title, timeLastActiveAt: 700000000 } });
  return {
    version: 1,
    sidebar: {
      containers: [
        { global: {} },
        {
          spaces: [
            'space-work',
            {
              id: 'space-work',
              title: 'Work',
              containerIDs: ['unpinned', 'work-unpinned', 'pinned', 'work-pinned'],
              customInfo: {
                iconType: { emoji: 128187, emoji_v2: '💻' },
                windowTheme: {
                  primaryColorPalette: {
                    midTone: { red: 1.08, green: 0.36, blue: 0.085, alpha: 1, colorSpace: 'extendedSRGB' },
                    tintedLight: { red: 1.0, green: 0.91, blue: 0.88, alpha: 1, colorSpace: 'extendedSRGB' },
                  },
                },
              },
              profile: { default: true },
            },
            'space-play',
            {
              id: 'space-play',
              title: '',
              containerIDs: ['unpinned', 'play-unpinned', 'pinned', 'play-pinned'],
              customInfo: {},
              profile: { custom: { _0: { directoryBasename: 'Profile 1', machineID: 'm' } } },
            },
          ],
          items: [
            ...item('work-pinned', null, ['tab-docs', 'list-dev', 'tab-dup'], {
              itemContainer: { containerType: { spaceItems: { _0: 'space-work' } } },
            }),
            ...tab('tab-docs', 'work-pinned', 'https://docs.example.com/', 'Docs'),
            ...item('list-dev', 'work-pinned', ['tab-repo', 'list-inner', 'split-1'], { list: {} }, 'Dev'),
            ...tab('tab-repo', 'list-dev', 'https://git.example.com/repo', 'Repo'),
            ...item('list-inner', 'list-dev', ['tab-ci'], { list: {} }, 'CI'),
            ...tab('tab-ci', 'list-inner', 'https://ci.example.com/', 'CI runs'),
            ...item('split-1', 'list-dev', ['tab-split-a', 'tab-split-b'], {
              splitView: { layoutOrientation: 'horizontal' },
            }),
            ...tab('tab-split-a', 'split-1', 'https://a.example.com/', 'A'),
            ...tab('tab-split-b', 'split-1', 'https://b.example.com/', 'B'),
            ...tab('tab-dup', 'work-pinned', 'https://docs.example.com/', 'Docs again'),
            ...item('work-unpinned', null, ['tab-today-1', 'tab-today-2', 'tab-today-dup', 'tab-internal'], {
              itemContainer: { containerType: { spaceItems: { _0: 'space-work' } } },
            }),
            ...tab('tab-today-1', 'work-unpinned', 'https://news.example.com/', 'News'),
            ...tab('tab-today-2', 'work-unpinned', 'https://mail.example.com/', 'Mail'),
            ...tab('tab-today-dup', 'work-unpinned', 'https://docs.example.com/', 'Docs (today)'),
            ...tab('tab-internal', 'work-unpinned', 'arc://settings', 'Settings'),
            ...item('play-pinned', null, [], {
              itemContainer: { containerType: { spaceItems: { _0: 'space-play' } } },
            }),
            ...item('play-unpinned', null, ['tab-play'], {
              itemContainer: { containerType: { spaceItems: { _0: 'space-play' } } },
            }),
            ...tab('tab-play', 'play-unpinned', 'https://docs.example.com/', 'Docs in play'),
            ...item('top-default', null, ['fav-1', 'fav-2'], {
              itemContainer: { containerType: { topApps: { _0: { default: true } } } },
            }),
            ...tab('fav-1', 'top-default', 'https://cal.example.com/', 'Calendar'),
            ...tab('fav-2', 'top-default', 'https://mail.example.com/', 'Mail'),
            ...item('top-custom', null, ['fav-3'], {
              itemContainer: {
                containerType: { topApps: { _0: { custom: { _0: { directoryBasename: 'Profile 1' } } } } },
              },
            }),
            ...tab('fav-3', 'top-custom', 'https://cal.example.com/', 'Calendar again'),
          ],
          topAppsContainerIDs: [
            { default: true },
            'top-default',
            { custom: { _0: { directoryBasename: 'Profile 1', machineID: 'm' } } },
            'top-custom',
          ],
        },
      ],
    },
  };
}

describe('Arc sidebar', () => {
  it('parses spaces, containers, items and favorites out of the alternating lists', () => {
    const sb = parseArcSidebar(arcFixture());
    expect(sb.spaces.map((s) => s.id)).toEqual(['space-work', 'space-play']);
    expect(sb.spaces[0]).toMatchObject({
      title: 'Work',
      emoji: '💻',
      pinnedId: 'work-pinned',
      unpinnedId: 'work-unpinned',
    });
    // midTone clamped from extended sRGB, "to" is midTone pulled 55% towards tintedLight.
    expect(sb.spaces[0]?.theme).toEqual({ from: '#FF5C16', to: '#FFA985', grain: 0.08, mode: 'system' });
    expect(sb.spaces[1]).toMatchObject({ title: '', emoji: null, theme: null });
    expect(sb.items.get('tab-docs')).toMatchObject({
      kind: 'tab',
      url: 'https://docs.example.com/',
      savedTitle: 'Docs',
    });
    expect(sb.items.get('list-dev')).toMatchObject({
      kind: 'list',
      title: 'Dev',
      children: ['tab-repo', 'list-inner', 'split-1'],
    });
    expect(sb.items.get('split-1')?.kind).toBe('split');
    expect(sb.items.get('work-pinned')?.kind).toBe('container');
    expect(sb.favoriteContainerIds).toEqual(['top-default', 'top-custom']);
  });

  it('reads the newer newContainerIDs form and tolerates garbage', () => {
    const sb = parseArcSidebar({
      sidebar: {
        containers: [
          {
            spaces: [
              's',
              { id: 's', title: 'S', newContainerIDs: [{ pinned: {} }, 'p', { unpinned: { _0: {} } }, 'u'] },
            ],
            items: [],
            topAppsContainerIDs: [],
          },
        ],
      },
    });
    expect(sb.spaces[0]).toMatchObject({ pinnedId: 'p', unpinnedId: 'u' });
    expect(parseArcSidebar(null).spaces).toEqual([]);
    expect(parseArcSidebar({ sidebar: { containers: [{ global: {} }] } }).spaces).toEqual([]);
  });

  it('recreates spaces, pinned folders in order, today tabs and favorites', () => {
    const { state, counts } = applyArcSidebar(createDefaultState(NOW), parseArcSidebar(arcFixture()), NOW);
    expect(counts).toEqual({ spaces: 2, pinned: 5, today: 3, folders: 2, favorites: 2 });

    const [, workId, playId] = state.spaceOrder;
    const work = state.spaces[workId ?? ''];
    const play = state.spaces[playId ?? ''];
    expect(work).toMatchObject({ name: 'Work', emoji: '💻', theme: { from: '#FF5C16' } });
    expect(play?.name).toBe('Space');
    expect(play?.emoji).toBe('✦');
    expect(play?.theme).toEqual({ from: '#FF7A59', to: '#FFB457', grain: 0.08, mode: 'system' });
    expect(state.activeSpaceId).toBe(state.spaceOrder[0]);

    // Pinned area: tab, folder, and the duplicate URL dropped.
    expect(names(state, work?.pinned ?? [])).toEqual(['https://docs.example.com/', 'Dev']);
    const dev = Object.values(state.folders).find((f) => f.name === 'Dev');
    // The split view is flattened into its parent folder, keeping its place.
    expect(names(state, dev?.children ?? [])).toEqual([
      'https://git.example.com/repo',
      'CI',
      'https://a.example.com/',
      'https://b.example.com/',
    ]);
    const ci = Object.values(state.folders).find((f) => f.name === 'CI');
    expect(ci?.children.map((id) => state.tabs[id]?.title)).toEqual(['CI runs']);
    for (const id of dev?.children ?? []) {
      const t = state.tabs[id];
      if (t) expect(t).toMatchObject({ kind: 'pinned', spaceId: workId, homeUrl: t.url });
    }

    // Today area keeps order, skips the URL already pinned in this space and non-web schemes.
    expect(names(state, work?.today ?? [])).toEqual([
      'https://news.example.com/',
      'https://mail.example.com/',
    ]);
    expect(state.tabs[work?.today[0] ?? '']).toMatchObject({
      kind: 'today',
      createdAt: arcTimeToMs(700000000),
      lastActiveAt: NOW,
    });

    // The same URL may live in another space.
    expect(names(state, play?.today ?? [])).toEqual(['https://docs.example.com/']);

    // Favorites: union of every top-apps container, deduplicated, global.
    expect(names(state, state.favorites)).toEqual(['https://cal.example.com/', 'https://mail.example.com/']);
    expect(state.tabs[state.favorites[0] ?? '']).toMatchObject({ kind: 'favorite', spaceId: null });
  });

  it('skips favorites already present and survives cycles', () => {
    let base = createDefaultState(NOW);
    const existing = createTab({
      url: 'https://cal.example.com/',
      spaceId: null,
      kind: 'favorite',
      now: NOW,
    });
    base = reduce(base, { type: 'tab/open', tab: existing, activate: false });
    const sb = parseArcSidebar(arcFixture());
    const pinned = sb.items.get('work-pinned');
    if (pinned) pinned.children = [...pinned.children, 'work-pinned'];
    const { state, counts } = applyArcSidebar(base, sb, NOW);
    expect(counts.favorites).toBe(1);
    expect(state.favorites).toHaveLength(2);
  });

  it('maps icons and timestamps', () => {
    expect(arcEmoji({ emoji_v2: '🎯' })).toBe('🎯');
    expect(arcEmoji({ emoji: 128187, emoji_v2: '' })).toBe('💻');
    expect(arcEmoji({ icon: 'briefcase' })).toBeNull();
    expect(arcEmoji(undefined)).toBeNull();
    expect(arcTimeToMs(0)).toBe(978307200000);
    expect(arcThemeToSpaceTheme(undefined)).toBeNull();
    expect(arcThemeToSpaceTheme({ primaryColorPalette: {} })).toBeNull();
    expect(
      arcThemeToSpaceTheme({
        background: {
          single: {
            _0: {
              style: {
                color: {
                  _0: {
                    blendedSingleColor: {
                      _0: { color: { red: 0, green: 0.5, blue: 1 }, modifiers: { noiseFactor: 0.1 } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ).toEqual({ from: '#0080FF', to: '#8CC6FF', grain: 0.12, mode: 'system' });
  });
});

describe('bookmark tree', () => {
  it('recreates folders and pinned tabs in the active space, skipping non-web URLs', () => {
    const roots: BookmarkFolder[] = [
      folder(
        'Bar',
        [
          leaf('A', 'https://a.example.com/'),
          folder('Sub', [leaf('B', 'https://b.example.com/'), leaf('File', 'file:///etc/hosts')]),
        ],
        '📑',
      ),
    ];
    const base = createDefaultState(NOW);
    const { state, count } = applyBookmarkTree(base, base.activeSpaceId, roots, NOW);
    expect(count).toBe(2);
    const space = state.spaces[base.activeSpaceId];
    expect(names(state, space?.pinned ?? [])).toEqual(['Bar']);
    const bar = Object.values(state.folders).find((f) => f.name === 'Bar');
    expect(bar?.emoji).toBe('📑');
    expect(names(state, bar?.children ?? [])).toEqual(['https://a.example.com/', 'Sub']);
    const sub = Object.values(state.folders).find((f) => f.name === 'Sub');
    expect(names(state, sub?.children ?? [])).toEqual(['https://b.example.com/']);
  });
});

describe('Chromium', () => {
  it('turns the Bookmarks file into bar and other roots', () => {
    const roots = chromeBookmarksToTree({
      roots: {
        bookmark_bar: {
          type: 'folder',
          name: 'Bookmarks bar',
          children: [
            { type: 'url', name: 'A', url: 'https://a.example.com/' },
            {
              type: 'folder',
              name: 'Work',
              children: [{ type: 'url', name: 'Mail', url: 'https://mail.example.com/' }],
            },
          ],
        },
        other: { type: 'folder', name: 'Other', children: [] },
        synced: {
          type: 'folder',
          name: 'Mobile',
          children: [{ type: 'url', name: 'M', url: 'https://m.example.com/' }],
        },
      },
    });
    expect(roots.map((r) => r.title)).toEqual(['Bookmarks bar']);
    expect(roots[0]?.children).toEqual([
      leaf('A', 'https://a.example.com/'),
      folder('Work', [leaf('Mail', 'https://mail.example.com/')]),
    ]);
    expect(chromeTimeToMs(13_300_000_000_000_000)).toBe(1_655_526_400_000);
  });
});

describe('Safari', () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Children</key>
  <array>
    <dict>
      <key>Title</key><string>History</string>
      <key>WebBookmarkType</key><string>WebBookmarkTypeProxy</string>
    </dict>
    <dict>
      <key>Children</key>
      <array>
        <dict>
          <key>URIDictionary</key><dict><key>title</key><string>Fish &amp; Chips</string></dict>
          <key>URLString</key><string>https://fish.example.com/?a=1&amp;b=2</string>
          <key>WebBookmarkType</key><string>WebBookmarkTypeLeaf</string>
        </dict>
        <dict>
          <key>Children</key>
          <array>
            <dict>
              <key>URIDictionary</key><dict><key>title</key><string>Deep</string></dict>
              <key>URLString</key><string>https://deep.example.com/</string>
              <key>WebBookmarkType</key><string>WebBookmarkTypeLeaf</string>
            </dict>
          </array>
          <key>Title</key><string>Folder A</string>
          <key>WebBookmarkType</key><string>WebBookmarkTypeList</string>
        </dict>
      </array>
      <key>Title</key><string>BookmarksBar</string>
      <key>WebBookmarkType</key><string>WebBookmarkTypeList</string>
    </dict>
    <dict>
      <key>Children</key><array/>
      <key>Title</key><string>BookmarksMenu</string>
      <key>WebBookmarkType</key><string>WebBookmarkTypeList</string>
    </dict>
    <dict>
      <key>Children</key>
      <array>
        <dict>
          <key>ReadingList</key>
          <dict>
            <key>DateAdded</key><date>2024-01-01T00:00:00Z</date>
            <key>PreviewText</key><string>Preview</string>
          </dict>
          <key>Sync</key><dict><key>Data</key><data>
          AAEC
          </data></dict>
          <key>URIDictionary</key><dict><key>title</key><string>Read later</string></dict>
          <key>URLString</key><string>https://read.example.com/</string>
          <key>WebBookmarkType</key><string>WebBookmarkTypeLeaf</string>
        </dict>
      </array>
      <key>Title</key><string>com.apple.ReadingList</string>
      <key>WebBookmarkType</key><string>WebBookmarkTypeList</string>
    </dict>
  </array>
  <key>Title</key><string></string>
  <key>WebBookmarkFileVersion</key><integer>1</integer>
  <key>WebBookmarkType</key><string>WebBookmarkTypeList</string>
</dict>
</plist>`;

  it('parses XML plists including dates, data, entities and empty containers', () => {
    const v = parsePlistXml(plist);
    expect(typeof v === 'object' && !Array.isArray(v) ? v.WebBookmarkFileVersion : null).toBe(1);
    expect(
      parsePlistXml(
        '<plist version="1.0"><dict><key>a</key><true/><key>b</key><real>1.5</real><key>c</key><array/></dict></plist>',
      ),
    ).toEqual({
      a: true,
      b: 1.5,
      c: [],
    });
    expect(parsePlistXml('<plist><string>&#233;&#x1F600;</string></plist>')).toBe('é😀');
  });

  it('builds the bookmark tree from the decoded plist', () => {
    const root = toSafariNode(parsePlistXml(plist));
    if (!root) throw new Error('expected a dict root');
    const roots = safariBookmarksToTree(root);
    expect(roots.map((r) => [r.title, r.emoji])).toEqual([
      ['Favorites bar', '📑'],
      ['Reading List', '📖'],
    ]);
    expect(roots[0]?.children).toEqual([
      leaf('Fish & Chips', 'https://fish.example.com/?a=1&b=2'),
      folder('Folder A', [leaf('Deep', 'https://deep.example.com/')]),
    ]);
    expect(roots[1]?.children).toEqual([leaf('Read later', 'https://read.example.com/')]);
  });

  it('converts history rows from Apple reference seconds', () => {
    expect(appleTimeToMs(0)).toBe(978307200000);
    expect(
      safariHistoryToEntries([
        { url: 'https://a.example.com/', title: 'A', visit_count: 3, last_visit: 700000000.5 },
        { url: 'https://never.example.com/', title: null, visit_count: null, last_visit: null },
        { url: 'https://b.example.com/', title: null, visit_count: 0, last_visit: 0 },
      ]),
    ).toEqual([
      { url: 'https://a.example.com/', title: 'A', lastVisit: 1678307200500, visitCount: 3 },
      { url: 'https://b.example.com/', title: '', lastVisit: 978307200000, visitCount: 1 },
    ]);
  });
});

describe('Firefox', () => {
  it('builds roots from moz_bookmarks rows, ordered by position, skipping tags and empty roots', () => {
    const row = (
      id: number,
      type: number,
      parent: number,
      position: number,
      title: string | null,
      guid: string,
      url: string | null = null,
    ): FirefoxBookmarkRow => ({ id, type, parent, position, title, guid, url });
    const rows: FirefoxBookmarkRow[] = [
      row(1, 2, 0, 0, '', 'root________'),
      row(2, 2, 1, 0, 'menu', 'menu________'),
      row(3, 2, 1, 1, 'toolbar', 'toolbar_____'),
      row(4, 2, 1, 2, 'tags', 'tags________'),
      row(5, 2, 1, 3, 'unfiled', 'unfiled_____'),
      row(6, 2, 1, 4, 'mobile', 'mobile______'),
      row(10, 1, 3, 1, 'Second', 'g10', 'https://second.example.com/'),
      row(11, 1, 3, 0, 'First', 'g11', 'https://first.example.com/'),
      row(12, 2, 3, 2, 'Nested', 'g12'),
      row(13, 1, 12, 0, 'Inner', 'g13', 'https://inner.example.com/'),
      row(14, 3, 3, 3, null, 'g14'),
      row(15, 1, 2, 0, 'Menu item', 'g15', 'https://menu.example.com/'),
      row(16, 2, 4, 0, 'sometag', 'g16'),
      row(17, 1, 16, 0, null, 'g17', 'https://first.example.com/'),
    ];
    const roots = firefoxRowsToTree(rows);
    expect(roots.map((r) => r.title)).toEqual(['Bookmarks menu', 'Bookmarks toolbar']);
    expect(roots[1]?.children).toEqual([
      leaf('First', 'https://first.example.com/'),
      leaf('Second', 'https://second.example.com/'),
      folder('Nested', [leaf('Inner', 'https://inner.example.com/')]),
    ]);
    expect(firefoxRowsToTree([])).toEqual([]);
  });

  it('converts history rows from microseconds', () => {
    expect(firefoxTimeToMs(1_700_000_000_000_000)).toBe(1_700_000_000_000);
    expect(
      firefoxHistoryToEntries([
        { url: 'https://a.example.com/', title: 'A', visit_count: 2, last_visit: 1_700_000_000_000_000 },
        { url: 'https://b.example.com/', title: null, visit_count: null, last_visit: null },
      ]),
    ).toEqual([{ url: 'https://a.example.com/', title: 'A', lastVisit: 1_700_000_000_000, visitCount: 2 }]);
  });
});
