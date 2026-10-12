#!/usr/bin/env node
// Renders src/index.html once per language into dist/ (/, /fr/, /es/) and copies the assets.
// Template syntax (no dependency):
//   {{key.path}}            raw value (copy may hold <br>, <kbd>, <em>)
//   {{attr:key.path}}       value escaped for an HTML attribute
//   {{json:key.path}}       JSON for an inline <script type="application/json">
//   {{#each key}}…{{/each}} repeat; inside, {{.}} is the item and {{field}} looks in the item first
//   {{$lang}} {{$home}} {{$url}} {{$alternates}} {{$langLinks}} {{$siteUrl}} {{$year}}
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const out = join(root, 'dist');
const SITE_URL = (process.env.SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '').replace(/\/$/, '');
const site = SITE_URL && !/^https?:/.test(SITE_URL) ? `https://${SITE_URL}` : SITE_URL;

const LANGS = [
  { code: 'en', home: '/', label: 'English', short: 'EN' },
  { code: 'fr', home: '/fr/', label: 'Français', short: 'FR' },
  { code: 'es', home: '/es/', label: 'Español', short: 'ES' },
];

const escAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lookup(scopes, path, where) {
  for (const scope of scopes) {
    let v = scope;
    let ok = true;
    for (const part of path.split('.')) {
      if (v !== null && typeof v === 'object' && part in v) v = v[part];
      else {
        ok = false;
        break;
      }
    }
    if (ok) return v;
  }
  throw new Error(`[${where}] missing key "${path}"`);
}

function render(tpl, scopes, where) {
  const withLoops = tpl.replace(/\{\{#each ([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_m, path, body) => {
    const list = lookup(scopes, path, where);
    if (!Array.isArray(list)) throw new Error(`[${where}] "${path}" is not a list`);
    return list
      .map((item, i) =>
        render(
          body,
          [{ '.': item, '@index': i, ...(typeof item === 'object' ? item : {}) }, ...scopes],
          where,
        ),
      )
      .join('');
  });
  return withLoops.replace(/\{\{(attr:|json:)?([$@.\w]+)\}\}/g, (_m, mode, path) => {
    const v = path === '.' ? scopes.find((s) => '.' in s)?.['.'] : lookup(scopes, path, where);
    if (v === undefined) throw new Error(`[${where}] "{{.}}" used outside {{#each}}`);
    if (mode === 'json:') return JSON.stringify(v).replace(/</g, '\\u003c');
    if (mode === 'attr:') return escAttr(v);
    if (typeof v === 'object') throw new Error(`[${where}] "${path}" is an object`);
    return String(v);
  });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(src, 'assets'), join(out, 'assets'), { recursive: true });

const tpl = readFileSync(join(src, 'index.html'), 'utf8');
const abs = (p) => (site ? `${site}${p}` : p);

for (const lang of LANGS) {
  const t = JSON.parse(readFileSync(join(src, 'i18n', `${lang.code}.json`), 'utf8'));
  const vars = {
    $lang: lang.code,
    $home: lang.home,
    $url: abs(lang.home),
    $siteUrl: site,
    $year: String(new Date().getFullYear()),
    $alternates: [
      ...LANGS.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${abs(l.home)}">`),
      `<link rel="alternate" hreflang="x-default" href="${abs('/')}">`,
    ].join('\n    '),
    $langLinks: LANGS.map(
      (l) =>
        `<a href="${l.home}" lang="${l.code}" hreflang="${l.code}"${l.code === lang.code ? ' aria-current="true"' : ''}><span aria-hidden="true">${l.short}</span><span class="sr">${l.label}</span></a>`,
    ).join(''),
  };
  const html = render(tpl, [vars, t], lang.code);
  const dir = join(out, lang.home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

// The CSP in vercel.json allows the one inline script by hash: fail loudly if they drift apart.
const inline = /<script>([^<]*)<\/script>/.exec(readFileSync(join(out, 'index.html'), 'utf8'))?.[1] ?? '';
const hash = `sha256-${createHash('sha256').update(inline).digest('base64')}`;
if (!readFileSync(join(root, 'vercel.json'), 'utf8').includes(hash))
  throw new Error(`vercel.json CSP must allow the inline script: '${hash}'`);

writeFileSync(
  join(out, 'robots.txt'),
  `User-agent: *\nAllow: /\n${site ? `Sitemap: ${site}/sitemap.xml\n` : ''}`,
);
if (site) {
  const urls = LANGS.map(
    (l) =>
      `  <url><loc>${site}${l.home}</loc>${LANGS.map((a) => `<xhtml:link rel="alternate" hreflang="${a.code}" href="${site}${a.home}"/>`).join('')}</url>`,
  ).join('\n');
  writeFileSync(
    join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
  );
}
console.info(
  `built ${LANGS.map((l) => l.home).join(' ')} → ${out}${site ? ` (${site})` : ' (no SITE_URL: relative links)'}`,
);
