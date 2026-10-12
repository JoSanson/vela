// Captures the real pages and favicons the film shows, headless. Run: node site/film/capture.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'captures');
mkdirSync(out, { recursive: true });
const require = createRequire(join(here, '../../apps/desktop/package.json'));
const { chromium } = require('@playwright/test');

export const PAGES = [
  { id: 'github', url: 'https://github.com/JoSanson/vela', domain: 'github.com' },
  { id: 'wiki-vela', url: 'https://en.wikipedia.org/wiki/Vela_(constellation)', domain: 'wikipedia.org' },
  { id: 'bench', url: 'https://github.com/JoSanson/vela/blob/main/docs/BENCHMARK.md', domain: 'github.com' },
  { id: 'tailwind', url: 'https://tailwindcss.com/docs/installation', domain: 'tailwindcss.com' },
  { id: 'site', url: 'http://127.0.0.1:4321/', domain: 'github.com' },
  { id: 'wiki-bauhaus', url: 'https://en.wikipedia.org/wiki/Bauhaus', domain: 'wikipedia.org' },
  { id: 'wiki-lisbon', url: 'https://en.wikipedia.org/wiki/Lisbon', domain: 'wikipedia.org' },
  { id: 'wiki-nata', url: 'https://en.wikipedia.org/wiki/Pastel_de_nata', domain: 'wikipedia.org' },
];
const EXTRA_ICONS = [
  'youtube.com',
  'figma.com',
  'notion.so',
  'spotify.com',
  'gmail.com',
  'calendar.google.com',
  'maps.google.com',
  'linear.app',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 2,
  locale: 'en-US',
  colorScheme: 'light',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});
for (const p of PAGES) {
  const page = await ctx.newPage();
  try {
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    await page.waitForTimeout(3000);
  }
  // Consent banners and sticky promos are noise in a product film.
  await page.addStyleTag({
    content:
      '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],.mdn-cta-container,.top-banner,#onetrust-banner-sdk,.place,.sidebar-inner .place,[class*="advert" i]{display:none!important}',
  });
  for (const label of ['Dismiss', 'Got it'])
    await page
      .getByText(label, { exact: true })
      .click({ timeout: 1500 })
      .catch(() => undefined);
  // The type specimen shows the film's own line instead of the default sample.
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode())
      if (n.nodeValue?.startsWith('Whereas disregard')) n.nodeValue = 'Your internet, calm again.';
    for (const el of document.querySelectorAll('textarea, input, [contenteditable]')) {
      if ('value' in el && String(el.value).startsWith('Whereas')) el.value = 'Your internet, calm again.';
      else if (el.textContent?.startsWith('Whereas')) el.textContent = 'Your internet, calm again.';
    }
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, `${p.id}.png`) });
  await page.close();
  console.info('captured', p.id);
}
for (const domain of [...new Set([...PAGES.map((p) => p.domain), ...EXTRA_ICONS])]) {
  const res = await ctx.request.get(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  if (res.ok()) writeFileSync(join(out, `icon-${domain}.png`), await res.body());
}
await browser.close();
console.info('done');
