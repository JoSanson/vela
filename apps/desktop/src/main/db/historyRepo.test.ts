import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './database';
import { HistoryRepo } from './historyRepo';
import { migrate } from './migrations';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

const sqliteAvailable = ((): boolean => {
  try {
    const load = createRequire(import.meta.url);
    const Database = load('better-sqlite3') as new (file: string) => { close(): void };
    new Database(':memory:').close();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!sqliteAvailable)('HistoryRepo command bar', () => {
  let db: Db;
  let repo: HistoryRepo;

  beforeEach(() => {
    db = openDatabase(':memory:').db;
    migrate(db);
    repo = new HistoryRepo(db);
  });
  afterEach(() => db.close());

  const visit = (url: string, title: string, times: number, space = 's1', at = NOW - DAY): void => {
    for (let i = 0; i < times; i++) repo.recordVisit(url, title, space, at);
  };

  it('returns full-text matches and the most frecent pages of the Space only', () => {
    visit('https://github.com/', 'GitHub', 30);
    visit('https://news.ycombinator.com/', 'Hacker News', 5);
    visit('https://secret.example/', 'Other space', 9, 's2');
    const rows = repo.omniCandidates('hack', 's1', NOW);
    expect(rows.map((r) => r.url).sort()).toEqual(['https://github.com/', 'https://news.ycombinator.com/']);
    expect(rows.find((r) => r.url === 'https://github.com/')?.visitCount).toBe(30);
    expect(repo.omniCandidates('other', 's1', NOW + 10_000).map((r) => r.url)).not.toContain(
      'https://secret.example/',
    );
  });

  it('adds pages picked before even when the text does not match them', () => {
    for (let i = 0; i < 200; i++) visit(`https://site${i}.example/`, `Site ${i}`, 3);
    visit('https://rare.example/', 'Rare', 1, 's1', NOW - 300 * DAY);
    const plain = repo.omniCandidates('gh', 's1', NOW).map((r) => r.url);
    expect(plain).not.toContain('https://rare.example/');
    expect(repo.omniCandidates('gh', 's1', NOW, ['https://rare.example/']).map((r) => r.url)).toContain(
      'https://rare.example/',
    );
  });

  it('survives a malformed full-text query', () => {
    visit('https://a.example/', 'A', 1);
    expect(() => repo.omniCandidates('"* AND (', 's1', NOW)).not.toThrow();
  });

  it('learns picks per Space and returns those whose input starts with the prefix', () => {
    repo.learnInput('gh', 'https://github.com/', 's1', NOW);
    repo.learnInput('gh', 'https://github.com/', 's1', NOW);
    repo.learnInput('github', 'https://github.com/', 's1', NOW);
    repo.learnInput('gmail', 'https://mail.google.com/', 's2', NOW);
    repo.learnInput('', 'https://x/', 's1', NOW);
    expect(repo.inputs('g', 's1')).toEqual([
      { input: 'gh', url: 'https://github.com/', uses: 2, lastUsed: NOW },
      { input: 'github', url: 'https://github.com/', uses: 1, lastUsed: NOW },
    ]);
    expect(repo.inputs('gm', 's1')).toEqual([]);
    expect(repo.inputs('', 's1')).toEqual([]);
  });

  it('forgets learned picks with the history they came from', () => {
    visit('https://github.com/', 'GitHub', 1);
    visit('https://gitlab.com/', 'GitLab', 1);
    repo.learnInput('gh', 'https://github.com/', 's1', NOW);
    repo.learnInput('gl', 'https://gitlab.com/', 's1', NOW);
    repo.learnInput('dl', 'cmd:downloads', 's1', NOW);
    repo.delete({ url: 'https://github.com/' });
    expect(repo.inputs('gh', 's1')).toEqual([]);
    const id = repo.search('gitlab', 10, 0, 's1')[0]?.id;
    repo.delete({ ids: [id ?? -1] });
    expect(repo.inputs('gl', 's1')).toEqual([]);
    expect(repo.inputs('dl', 's1')).toHaveLength(1);
    repo.delete({ all: true });
    expect(repo.inputs('dl', 's1')).toEqual([]);
  });

  it('drops picks unused for a year', () => {
    repo.learnInput('old', 'https://old.example/', 's1', NOW - 400 * DAY);
    repo.learnInput('new', 'https://new.example/', 's1', NOW);
    expect(repo.inputs('old', 's1')).toEqual([]);
  });
});
