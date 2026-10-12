// The Vela film: every frame is a pure function of time, so it can be rendered frame by frame.
// render(t) draws second t of a 26 s loop. Open film.html for a live preview (it loops in real time).
(() => {
  'use strict';

  const DURATION = 26;
  const ICON = (d) => `captures/icon-${d}.png`;
  const SHOT = (id) => `captures/${id}.png`;
  const LOGO = '../src/assets/img/logo.svg';

  /* ---------- easing and keyframes ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const E = {
    lin: (x) => x,
    io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    out: (x) => 1 - Math.pow(1 - x, 4),
    expo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    quint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
  };
  const p = (t, a, b, e = E.io) => e(clamp((t - a) / (b - a)));
  const lerp = (a, b, k) => a + (b - a) * k;
  // keys: [[time, value, ease?], ...]; value is a number or an array of numbers.
  const kf = (t, keys) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (t <= t1) {
        const k = (e ?? E.io)(clamp((t - t0) / (t1 - t0)));
        return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], k)) : lerp(v0, v1, k);
      }
    }
    return keys[keys.length - 1][1];
  };

  /* ---------- content ---------- */
  const SPACES = [
    {
      name: 'Work',
      emoji: '💼',
      from: [76, 0.12, 278],
      to: [74, 0.14, 302],
      hue: 285,
      pinned: [
        { icon: ICON('linear.app'), title: 'Vela · Roadmap' },
        { folder: 'Research' },
        { icon: ICON('figma.com'), title: 'Shell · Figma', indent: true },
        { icon: ICON('notion.so'), title: 'Release notes', indent: true },
      ],
      today: [
        { id: 'bench', icon: ICON('github.com'), title: 'Arc vs Vela benchmark', grow: true },
        { id: 'github', icon: ICON('github.com'), title: 'JoSanson/vela' },
        { id: 'wiki', icon: ICON('wikipedia.org'), title: 'Vela (constellation)' },
        { id: 'tw', icon: ICON('tailwindcss.com'), title: 'Installation · Tailwind CSS' },
      ],
    },
    {
      name: 'Studio',
      emoji: '🎨',
      from: [80, 0.1, 28],
      to: [78, 0.11, 352],
      hue: 16,
      pinned: [{ icon: ICON('figma.com'), title: 'Website · Figma' }],
      today: [
        { id: 'site', icon: LOGO, title: 'Vela · Website' },
        { id: 'bauhaus', icon: ICON('wikipedia.org'), title: 'Bauhaus' },
      ],
    },
    {
      name: 'Home',
      emoji: '🏡',
      from: [84, 0.09, 170],
      to: [80, 0.08, 222],
      hue: 192,
      pinned: [{ icon: ICON('calendar.google.com'), title: 'Calendar' }],
      today: [
        { id: 'lisbon', icon: ICON('wikipedia.org'), title: 'Lisbon' },
        { id: 'nata', icon: ICON('wikipedia.org'), title: 'Pastel de nata' },
      ],
    },
  ];
  const FAVS = [
    'github.com',
    'figma.com',
    'notion.so',
    'linear.app',
    'youtube.com',
    'gmail.com',
    'calendar.google.com',
    'spotify.com',
  ];
  const URLS = {
    github: 'github.com/JoSanson/vela',
    bench: 'github.com/JoSanson/vela/blob/main/docs/BENCHMARK.md',
    site: 'vela · site preview',
    lisbon: 'en.wikipedia.org/wiki/Lisbon',
  };

  const svg = {
    back: '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="m10 3-5 5 5 5"/></svg>',
    fwd: '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="m6 3 5 5-5 5"/></svg>',
    reload:
      '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5"/></svg>',
    side: '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M2.5 3h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 0v10"/></svg>',
    shield:
      '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M8 1.8 3 3.6v4c0 3 2.2 5.2 5 6.6 2.8-1.4 5-3.6 5-6.6v-4Z"/></svg>',
    folder:
      '<svg class="fold" viewBox="0 0 16 16"><path fill="currentColor" d="M1.5 4a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z"/></svg>',
    search:
      '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Zm3.6-1.4L14 14"/></svg>',
    tab: '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M2.5 3.5h11v9h-11zM2.5 6h11"/></svg>',
    plus: '<svg viewBox="0 0 16 16" width="15" height="15" style="opacity:.55"><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M8 3v10M3 8h10"/></svg>',
    cursor:
      '<svg viewBox="0 0 26 26"><path d="M5 3.5v17.2l4.4-4.1 2.8 6.4 3.1-1.4-2.8-6.3 6.2-.3Z" fill="#141120" stroke="#fbfaff" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  };
  const ok = (c) => `oklch(${c[0]}% ${c[1]} ${c[2]})`;
  const soft = (c) => [c[0] + (100 - c[0]) * 0.5, c[1] * 0.55, c[2]];

  /* ---------- DOM ---------- */
  const h = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const rowHTML = (r) =>
    r.folder
      ? `<div class="row">${svg.folder}${r.folder}</div>`
      : `<div class="row${r.indent ? ' in' : ''}" data-id="${r.id ?? ''}"><img src="${r.icon}" alt="">${r.title}</div>`;

  function makeWindow({ withTrack }) {
    const spaces = withTrack ? SPACES : [SPACES[0]];
    const el = h(`
      <div class="rig">
        <div class="win">
          <aside class="side">
            <div class="side-bg"></div>
            <div class="top"><span class="lights"><i></i><i></i><i></i></span><span class="navi">${svg.side}${svg.back}${svg.fwd}${svg.reload}</span></div>
            <div class="url"><span class="url-t"></span>${svg.shield}</div>
            <div class="favs">${FAVS.map((d) => `<span class="fav"><img src="${ICON(d)}" alt=""></span>`).join('')}</div>
            <div class="spaces"><div class="track" style="width:${spaces.length * 100}%">
              ${spaces
                .map(
                  (s, i) => `<section class="space" style="width:${100 / spaces.length}%" data-space="${i}">
                <div class="sname"><span>${s.emoji}</span>${s.name}</div>
                <div class="label">Pinned</div>
                ${s.pinned.map(rowHTML).join('')}
                <div class="sep"></div>
                <div class="row dim">${svg.plus}New tab</div>
                ${s.today.map(rowHTML).join('')}
              </section>`,
                )
                .join('')}
            </div></div>
            <div class="bar">${spaces.map(() => '<span class="dot"></span>').join('')}${svg.plus}</div>
          </aside>
          <main class="page">
            <div class="shot" data-page="github" style="background-image:url(${SHOT('github')})"></div>
            <div class="shot" data-page="bench" style="background-image:url(${SHOT('bench')})"></div>
            <div class="shot" data-page="site" style="background-image:url(${SHOT('site')})"></div>
            <div class="shot" data-page="lisbon" style="background-image:url(${SHOT('wiki-lisbon')})"></div>
            <div class="pane-b"><div class="shot" style="background-image:url(${SHOT('wiki-vela')});background-size:auto 112%;background-position:22% 0"></div></div>
            <div class="scrim"></div>
            <div class="peek"><div class="peek-bar"><i></i><i></i><span>tailwindcss.com/docs/installation</span></div><div class="shot" style="background-image:url(${SHOT('tailwind')})"></div></div>
            <div class="cmd">
              <div class="field">${svg.search}<span class="q"></span><span class="comp"></span><span class="caret"></span></div>
              <div class="crow sel"><img src="${ICON('github.com')}" alt=""><span>Arc vs Vela benchmark</span><small>github.com/JoSanson/vela</small><kbd>↵</kbd></div>
              <div class="crow">${svg.tab}<span>Switch to tab</span><small>JoSanson/vela</small></div>
              <div class="crow">${svg.search}<span>Search the web for “vela bench”</span></div>
            </div>
          </main>
        </div>
      </div>`);
    el.style.cssText = 'position:absolute;left:0;top:0;transform-style:preserve-3d';
    return el;
  }

  const cam = document.getElementById('cam');
  const W1 = makeWindow({ withTrack: true });
  const W2 = makeWindow({ withTrack: false });
  cam.append(W2, W1);
  const over = h(`<div style="position:absolute;left:0;top:0;transform-style:preserve-3d">
      <div class="keys"><span class="key">⌘</span><span class="key">T</span></div>
      <div class="drag"><img alt=""><span></span></div>
      <div class="cursor">${svg.cursor}</div>
    </div>`);
  cam.append(over);

  const q = (root, s) => root.querySelector(s);
  const qa = (root, s) => [...root.querySelectorAll(s)];
  const lockup = document.getElementById('lockup');
  const glow = document.getElementById('glow');
  const sky = document.getElementById('sky');
  const stars = document.getElementById('stars');

  // Stars once; they drift with the camera for depth.
  {
    const ctx = stars.getContext('2d');
    let seed = 19;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 520; i++) {
      const x = rnd() * 2040;
      const y = Math.pow(rnd(), 1.3) * 1200;
      const r = rnd() < 0.05 ? 1.5 + rnd() : 0.45 + rnd() * 0.7;
      const a = (0.25 + rnd() * 0.65) * (1 - (y / 1200) * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(236,232,255,${a})`;
      ctx.fill();
      if (r > 1.5) {
        ctx.beginPath();
        ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,200,255,${a * 0.1})`;
        ctx.fill();
      }
    }
  }
  sky.style.display = 'none';

  // Window-local coordinates (1520×950, origin top-left), measured once with no transforms.
  const local = (el, root) => {
    let x = 0;
    let y = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  };
  const win1 = q(W1, '.win');
  const P = {
    dots: qa(W1, '.dot').map((d) => local(d, win1)),
    row: (id) => local(q(W1, `.row[data-id="${id}"]`), win1),
    page: local(q(W1, '.page'), win1),
  };

  /* ---------- the timeline ---------- */
  const T = {
    in: [0, 1.7],
    s1: [2.3, 2.95],
    s2: [3.75, 4.4],
    s0: [5.2, 5.95],
    cmdIn: 6.5,
    keys: [6.45, 7.35],
    typeStart: 7.5,
    complete: 8.45,
    enter: 9.35,
    split: 12.5,
    peekIn: 15.25,
    peekOut: 16.9,
    tear: 18.3,
    w2: [18.95, 20.3],
    w2Away: [21.0, 21.7],
    tidy: [22.35, 22.95],
    out: [23.8, 24.9],
  };
  const QUERY = 'vela bench';

  function camera(t) {
    // [scale, x, y, rotX, rotY]
    return kf(t, [
      [0, [0.7, 0, 170, 24, -14]],
      [1.7, [0.84, 0, 40, 9, -7], E.out],
      [5.9, [0.86, 0, 30, 7, -3], E.lin],
      [7.3, [1.14, -150, 290, 3, -1], E.quint],
      [9.6, [1.16, -150, 282, 3, 0], E.lin],
      [10.9, [0.9, 0, 30, 6, 5], E.quint],
      [14.6, [0.94, -10, 20, 5, 9], E.lin],
      [15.6, [1.12, -150, 30, 3, 4], E.quint],
      [16.9, [1.13, -150, 28, 3, 3], E.lin],
      [17.9, [0.68, -360, 60, 6, 6], E.quint],
      [21.1, [0.66, -370, 50, 6, 4], E.lin],
      [22.2, [1.22, 740, -60, 3, -6], E.quint],
      [23.7, [1.24, 740, -70, 3, -5], E.lin],
      [25.2, [0.62, -80, 80, 12, 2], E.io],
      [26, [0.7, 0, 170, 24, -14], E.io],
    ]);
  }

  function cursor(t) {
    const rest = [1180, 820];
    const d = P.dots;
    const rowWiki = P.row('wiki');
    const rowBench = P.row('bench');
    return kf(t, [
      [0, rest],
      [1.6, rest],
      [2.2, [d[1][0] + 6, d[1][1] + 8], E.quint],
      [3.4, [d[1][0] + 6, d[1][1] + 8]],
      [3.7, [d[2][0] + 6, d[2][1] + 8], E.quint],
      [4.8, [d[2][0] + 6, d[2][1] + 8]],
      [5.15, [d[0][0] + 6, d[0][1] + 8], E.quint],
      [5.8, [d[0][0] + 6, d[0][1] + 8]],
      [6.4, [1040, 520], E.quint],
      [10.6, [1040, 520]],
      [11.4, [rowWiki[0] - 40, rowWiki[1] + 4], E.quint],
      [11.65, [rowWiki[0] - 40, rowWiki[1] + 4]],
      [12.45, [1260, 420], E.io],
      [14.5, [1250, 430]],
      [15.15, [1180, 360], E.quint],
      [16.95, [1180, 360]],
      [17.4, [1120, 700], E.quint],
      [18.05, [rowBench[0] - 30, rowBench[1] + 4], E.quint],
      [18.35, [rowBench[0] - 30, rowBench[1] + 4]],
      [19.25, [1700, 330], E.io],
      [20.4, [1880, 520], E.out],
      [21.4, [1760, 980], E.io],
      [22.3, [700, 900], E.quint],
      [26, rest],
    ]);
  }
  const clicks = [2.3, 3.75, 5.2, 11.65, 15.2, 18.35];
  const pressed = (t) =>
    clicks.some((c) => t >= c && t < c + 0.14) || (t >= 11.65 && t < 12.5) || (t >= 18.35 && t < 19.3);

  function spacePos(t) {
    return kf(t, [
      [0, 0],
      [T.s1[0], 0],
      [T.s1[1], 1, E.quint],
      [T.s2[0], 1],
      [T.s2[1], 2, E.quint],
      [T.s0[0], 2],
      [T.s0[1], 0, E.quint],
    ]);
  }
  const mixColor = (pos, key) => {
    const i = Math.min(Math.floor(pos), SPACES.length - 2);
    const k = pos - i;
    const a = SPACES[i][key];
    const b = SPACES[i + 1][key];
    return Array.isArray(a) ? a.map((x, j) => lerp(x, b[j], k)) : lerp(a, b, k);
  };

  /* ---------- render ---------- */
  function render(t) {
    t = ((t % DURATION) + DURATION) % DURATION;
    const sp = spacePos(t);
    const hue = mixColor(sp, 'hue');
    const [s, cx, cy, rx, ry] = camera(t);
    const stage = document.getElementById('stage');
    stage.style.background = `radial-gradient(120% 90% at 50% 120%, oklch(30% 0.13 ${hue + 22}) 0%, transparent 62%), linear-gradient(180deg, oklch(17% 0.06 ${hue + 6}) 0%, oklch(12.5% 0.035 ${hue}) 60%)`;
    glow.style.background = `oklch(36% 0.15 ${hue + 24})`;
    glow.style.opacity = String(0.55 + 0.1 * Math.sin(t * 0.6));
    stars.style.transform = `translate(${-cx * 0.05 - ry * 4}px, ${-cy * 0.04 + rx * 3}px) scale(${1 + (s - 0.8) * 0.06})`;
    cam.style.transform = `translate3d(${cx}px, ${cy}px, 0) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`;

    // intro / outro presence
    const inK = p(t, T.in[0], T.in[1], E.out);
    const outK = p(t, T.out[0], T.out[1], E.io);
    const present = inK * (1 - outK);
    const blur = (1 - present) * 16;
    for (const el of [W1, W2, over]) {
      el.style.opacity = String(present);
      el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
    }
    const lk = p(t, 24.2, 24.95, E.out) * (1 - p(t, 25.25, 25.9, E.io));
    lockup.style.opacity = String(lk);
    lockup.style.transform = `translate(-50%, -50%) scale(${0.94 + 0.06 * p(t, 24.2, 25.2, E.out)})`;

    // main window: position, glow colour
    W1.style.transform = 'translate3d(-760px, -475px, 0)';
    const from = mixColor(sp, 'from');
    const to = mixColor(sp, 'to');
    q(W1, '.win').style.setProperty('--glowc', `oklch(${from[0]}% ${from[1]} ${from[2]} / 0.55)`);
    q(W1, '.win').style.background = ok(from);
    q(W1, '.side-bg').style.background = `linear-gradient(165deg, ${ok(soft(from))}, ${ok(soft(to))})`;
    q(W1, '.track').style.transform = `translateX(${(-sp * 100) / SPACES.length}%)`;
    qa(W1, '.dot').forEach((d, i) => {
      const near = clamp(1 - Math.abs(sp - i));
      d.style.transform = `scale(${1 + near * 0.8})`;
      d.style.background = `rgba(${lerp(30, 255, near)}, ${lerp(20, 255, near)}, ${lerp(50, 255, near)}, ${lerp(0.28, 0.92, near)})`;
    });

    // Today in Work: the benchmark tab arrives with ⌘T, leaves when it is torn off
    const benchIn = p(t, T.enter, T.enter + 0.45, E.quint) * (1 - p(t, T.tear + 0.85, T.tear + 1.3, E.quint));
    const benchRow = q(W1, '.row[data-id="bench"]');
    benchRow.style.height = `${38 * benchIn}px`;
    benchRow.style.opacity = String(benchIn);
    const benchActive = p(t, T.enter, T.enter + 0.3) * (1 - p(t, T.tear + 0.85, T.tear + 1.2));
    benchRow.style.background = `rgba(255,255,255,${0.82 * benchActive})`;
    benchRow.style.boxShadow = benchActive > 0.5 ? '0 1px 2px rgba(20,14,40,.1)' : 'none';
    const ghRow = q(W1, '.row[data-id="github"]');
    ghRow.style.background = `rgba(255,255,255,${0.82 * (1 - benchActive)})`;
    const wikiInSplit = p(t, T.split, T.split + 0.4) * (1 - p(t, T.tear + 0.85, T.tear + 1.2));
    q(W1, '.row[data-id="wiki"]').style.background = `rgba(255,255,255,${0.62 * wikiInSplit})`;
    // Today tidies itself: tabs left alone archive away
    const tidyK = p(t, T.tidy[0], T.tidy[1], E.quint) * (1 - p(t, 25.6, 25.9));
    for (const id of ['wiki', 'tw']) {
      const r = q(W1, `.row[data-id="${id}"]`);
      r.style.height = `${38 * (1 - tidyK)}px`;
      r.style.opacity = String(1 - tidyK);
      r.style.transform = `translateX(${-24 * tidyK}px)`;
    }
    for (const sId of [1, 2]) {
      const first = qa(W1, `.space[data-space="${sId}"] .row[data-id]`)[0];
      if (first) first.style.background = 'rgba(255,255,255,.82)';
    }

    // pages: each Space shows its own active tab
    const w0 = clamp(1 - Math.abs(sp - 0));
    const w1 = clamp(1 - Math.abs(sp - 1));
    const w2 = clamp(1 - Math.abs(sp - 2));
    const showBench = p(t, T.enter, T.enter + 0.45) * (1 - p(t, T.tear + 0.85, T.tear + 1.3));
    const pages = { github: w0 * (1 - showBench), bench: w0 * showBench, site: w1, lisbon: w2 };
    for (const [id, v] of Object.entries(pages)) q(W1, `.shot[data-page="${id}"]`).style.opacity = String(v);
    const urlKey = w1 > 0.5 ? 'site' : w2 > 0.5 ? 'lisbon' : showBench > 0.5 ? 'bench' : 'github';
    q(W1, '.url-t').textContent = URLS[urlKey];

    // split view
    const splitK = p(t, T.split, T.split + 0.6, E.quint) * (1 - p(t, T.tear + 0.85, T.tear + 1.4, E.quint));
    q(W1, '.pane-b').style.transform = `translateX(${(1 - splitK) * 102}%)`;
    for (const sh of qa(W1, '.page > .shot')) sh.style.right = `${splitK * 50}%`;

    // command bar
    const cmdK = p(t, T.cmdIn, T.cmdIn + 0.35, E.quint) * (1 - p(t, T.enter, T.enter + 0.2, E.out));
    const cmd = q(W1, '.cmd');
    cmd.style.opacity = String(cmdK);
    cmd.style.transform = `translateY(${(1 - cmdK) * 10}px) scale(${0.97 + 0.03 * cmdK})`;
    const typed = clamp(Math.floor((t - T.typeStart) / 0.085), 0, QUERY.length);
    q(W1, '.q').textContent = QUERY.slice(0, typed);
    q(W1, '.comp').textContent = t >= T.complete ? 'mark' : '';
    q(W1, '.caret').style.opacity = Math.floor(t * 2.2) % 2 === 0 || t < T.complete ? '1' : '0';
    qa(W1, '.crow').forEach((r, i) => {
      const k = p(t, T.typeStart + 0.15 + i * 0.06, T.typeStart + 0.45 + i * 0.06, E.out);
      r.style.opacity = String(k);
      r.style.transform = `translateY(${(1 - k) * -6}px)`;
    });
    const keysK = p(t, T.keys[0], T.keys[0] + 0.35, E.quint) * (1 - p(t, T.keys[1] - 0.2, T.keys[1], E.io));
    const keys = q(over, '.keys');
    keys.style.opacity = String(keysK);
    keys.style.transform = `translate3d(20px, ${-520 + (1 - keysK) * 40}px, ${120 + keysK * 80}px) scale(${0.8 + 0.2 * keysK})`;
    qa(over, '.key').forEach((k, i) => {
      const dn = t > T.keys[0] + 0.45 + i * 0.12 && t < T.keys[0] + 0.62 + i * 0.12;
      k.style.transform = dn ? 'translateY(5px)' : 'none';
    });

    // peek
    const peekK = p(t, T.peekIn, T.peekIn + 0.55, E.quint) * (1 - p(t, T.peekOut, T.peekOut + 0.4, E.io));
    const peek = q(W1, '.peek');
    peek.style.opacity = String(Math.min(1, peekK * 1.6));
    peek.style.transform = `translate(${(1 - peekK) * 160}px, ${(1 - peekK) * -60}px) scale(${0.55 + 0.45 * peekK})`;
    q(W1, '.scrim').style.opacity = String(peekK);
    const dof = peekK * 5;
    const sideBlur = dof > 0.05 ? `blur(${dof.toFixed(2)}px)` : 'none';
    q(W1, '.side').style.filter = sideBlur;
    for (const sh of qa(W1, '.page > .shot, .pane-b')) sh.style.filter = sideBlur;

    // cursor + dragged row (window-local coordinates, then into the window's frame)
    const [mx, my] = cursor(t);
    const cur = q(over, '.cursor');
    cur.style.transform = `translate3d(${mx - 760}px, ${my - 475}px, 2px) scale(${pressed(t) ? 0.84 : 1})`;
    cur.style.opacity = String(present * (t > 1.4 ? 1 : 0));
    const drag = q(over, '.drag');
    const dragging = (t >= 11.7 && t < T.split) || (t >= 18.4 && t < T.w2[0] + 0.1);
    const dragRow = t < 15 ? q(W1, '.row[data-id="wiki"]') : benchRow;
    q(drag, 'img').src = q(dragRow, 'img').src;
    q(drag, 'span').textContent = dragRow.textContent.trim();
    drag.style.opacity = dragging ? '1' : '0';
    drag.style.transform = `translate3d(${mx - 760 - 34}px, ${my - 475 - 21}px, 1px) rotate(${dragging ? -2 : 0}deg)`;

    // the torn-off window flies out of the drag point and settles beside the first
    const w2k = p(t, T.w2[0], T.w2[1], E.quint);
    const appear = p(t, T.w2[0], T.w2[0] + 0.25, E.out);
    const away = p(t, T.w2Away[0], T.w2Away[1], E.io);
    const startX = mx - 760 - 60;
    const startY = my - 475 - 40;
    W2.style.transform = `translate3d(${lerp(startX, 1500, w2k) - 760 + away * 260}px, ${lerp(startY, 120, w2k) - 475}px, ${lerp(60, 80, w2k) - away * 200}px) rotateY(${lerp(0, -14, w2k)}deg) scale(${lerp(0.16, 0.58, w2k)})`;
    W2.style.opacity = String(present * appear * (1 - away));
    q(W2, '.win').style.background = ok(SPACES[0].from);
    q(W2, '.side-bg').style.background =
      `linear-gradient(165deg, ${ok(soft(SPACES[0].from))}, ${ok(soft(SPACES[0].to))})`;
    q(W2, '.win').style.setProperty('--glowc', 'oklch(76% 0.12 278 / 0.55)');
    for (const id of ['github', 'site', 'lisbon']) q(W2, `.shot[data-page="${id}"]`).style.opacity = '0';
    q(W2, '.shot[data-page="bench"]').style.opacity = '1';
    q(W2, '.url-t').textContent = URLS.bench;
    for (const r of qa(W2, '.row[data-id]')) {
      const isBench = r.dataset.id === 'bench';
      r.style.display = isBench ? '' : 'none';
      r.style.background = isBench ? 'rgba(255,255,255,.82)' : '';
    }
    q(W2, '.pane-b').style.transform = 'translateX(102%)';
    for (const el of qa(W2, '.cmd, .peek, .scrim')) el.style.opacity = '0';
  }

  window.render = render;
  window.FILM = { DURATION };

  const ready = Promise.all([
    document.fonts.ready,
    ...[...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))),
  ]);
  window.filmReady = ready.then(() => {
    render(0);
    return true;
  });

  // Live preview unless a renderer drives it (?render).
  if (!location.search.includes('render')) {
    const t0 = performance.now();
    const loop = () => {
      render((performance.now() - t0) / 1000);
      requestAnimationFrame(loop);
    };
    window.filmReady.then(() => requestAnimationFrame(loop));
  }
})();
