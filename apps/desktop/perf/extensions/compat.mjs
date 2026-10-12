// Installs the 20 most used Chrome extensions from the real Chrome Web Store page (clicking
// "Add to Vela", prompt auto-accepted) and records whether their worker starts cleanly and their
// popup renders. `node perf/extensions/compat.mjs [name…]` (pnpm build first) → results.json,
// summarised in docs/EXTENSIONS.md. Needs network; run it after every Electron bump.
import console from 'node:console';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { _electron as electron } from '@playwright/test';
import { MAIN_ENTRY } from '../vela.mjs';
const EXT = {
  'Dark Reader': 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
  'uBlock Origin Lite': 'ddkjiahejlhfcafbddmgiahcphecmpfh',
  '1Password': 'aeblfdkhhhdcdjpifhhbdiojplfjncoa',
  Bitwarden: 'nngceckbapebfimnlniiiahkandclblb',
  Grammarly: 'kbfnbcaeplbcioakkpcpgfkobkghlhen',
  'React DevTools': 'fmkadmapgofadopljbjfkapdkoienihi',
  Vimium: 'dbepggeogbaibhgnhhndojpepiihcmeb',
  'Google Translate': 'aapbdbdomjkkjkaonfhkkikfgjllcleb',
  'Return YouTube Dislike': 'gebbhagfogifgggkldgodflihgfeippi',
  SponsorBlock: 'mnjggcdmjocbbbhaepdhchncahnbgone',
  Loom: 'liecbddmkiiihnedobmlmillhodjkdmb',
  'Notion Web Clipper': 'knheggckgoiihginacbkhaalnibhilkk',
  'JSON Formatter': 'bcjindcccaagfpapjjmafapmmgkkhgoa',
  Wappalyzer: 'gppongmhjkpfnbhagpmjfkannfbllamg',
  Raindrop: 'ldgfbffkinooeloadekpmfoklnobpien',
  Honey: 'bmnlcjabgnpnenekpadlanbbkooimhnj',
  LastPass: 'hdokiejnpimakedhajhdlcegeplioahd',
  Momentum: 'laookkfknpbbblfpciffpaejjkokdgca',
  Todoist: 'jldhpllghnbhlbpcmnajkpdmadaolakh',
  'Adblock Plus': 'cfhdojbkjhnklbpkdaibdccddilifddb',
};
const only = process.argv.slice(2);
const userData = mkdtempSync(join(tmpdir(), 'vela-compat-'));
writeFileSync(
  join(userData, 'prefs.json'),
  JSON.stringify({ onboardingDone: true, language: 'en', blockerEnabled: false }),
);
const app = await electron.launch({
  args: [MAIN_ENTRY, '--lang=en-US'],
  env: { ...process.env, VELA_USER_DATA: userData, VELA_E2E: '1' },
});
const shell = await app.firstWindow();
await shell.waitForSelector('[data-ready="true"]');
await app.evaluate(({ dialog }) => {
  dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  globalThis.__errs = {};
  globalThis.__hooked = new Set();
});
const ev = (fn, a) => app.evaluate(fn, a);
const hookErrors = () =>
  ev(() => {
    for (const p of globalThis.__vela.ctx.sessions.allPartitions()) {
      if (globalThis.__hooked.has(p)) continue;
      globalThis.__hooked.add(p);
      globalThis.__vela.ctx.sessions.get(p).serviceWorkers.on('console-message', (_e, d) => {
        if (d.level !== 'error' && d.level !== 3) return;
        const id = /chrome-extension:\/\/([a-p]{32})/.exec(d.sourceUrl ?? d.url ?? '')?.[1] ?? '?';
        (globalThis.__errs[id] ??= []).push(
          `${(d.sourceUrl ?? d.url ?? '').split('/').slice(3).join('/')}: ${String(d.message).slice(0, 120)}`,
        );
      });
    }
  });
const open = (url) => ev((_e, u) => globalThis.__vela.ctx.tabs.openUrl({ input: u, noAtc: true }), url);
const js = (tab, code) =>
  ev((_e, a) => globalThis.__vela.ctx.tabs.webContents(a.tab)?.executeJavaScript(a.code, true), {
    tab,
    code,
  });
const close = (tab) => ev((_e, t) => globalThis.__vela.ctx.tabs.close(t), tab);
const results = [];
for (const [name, id] of Object.entries(EXT)) {
  if (only.length && !only.includes(name)) continue;
  const r = { name };
  const tab = await open(`https://chromewebstore.google.com/detail/${id}`);
  await hookErrors();
  let clicked = false;
  for (let i = 0; i < 40 && !clicked; i++) {
    await sleep(500);
    clicked = await js(
      tab,
      `(() => { const b = [...document.querySelectorAll('button')].find((x) => /^add to /i.test(x.innerText.trim()) && !x.disabled); if (b) { b.click(); return true; } return false; })()`,
    ).catch(() => false);
  }
  r.storeButton = clicked;
  let ext = null;
  for (let i = 0; i < 60 && clicked && !ext; i++) {
    await sleep(500);
    ext = (await ev(() => globalThis.__vela.ctx.extensions.list())).find((e) => e.id === id) ?? null;
  }
  await close(tab);
  r.installed = !!ext;
  r.version = ext?.version;
  if (ext) {
    await sleep(4000);
    const popup = await ev((_e, x) => globalThis.__vela.ctx.extensions.popupUrl(x), id);
    r.popup = popup ? 'none-rendered' : 'no popup';
    if (popup) {
      const p = await open(popup);
      await ev((_e, t) => {
        const wc = globalThis.__vela.ctx.tabs.webContents(t);
        globalThis.__perr = [];
        wc?.on('console-message', (ev2) => {
          if (ev2.level === 'error') globalThis.__perr.push(String(ev2.message).slice(0, 140));
        });
      }, p);
      await sleep(4000);
      const txt = await js(p, `document.body ? document.body.innerText.trim().length : -1`).catch(() => -2);
      const perr = await ev(() => globalThis.__perr);
      r.popup = txt > 0 ? `renders (${txt} chars)` : `blank (${txt})`;
      r.popupErrors = perr.slice(0, 3);
      await close(p);
    }
    r.workerErrors = ((await ev(() => globalThis.__errs))[id] ?? []).slice(0, 3);
  }
  console.log(JSON.stringify(r));
  results.push(r);
}
writeFileSync(join(process.argv[1], '../results.json'), JSON.stringify(results, null, 2));
await app.close();
process.exit(0);
