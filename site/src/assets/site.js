(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  /* ---------- Download buttons follow the visitor's OS ---------- */
  const ua = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  if (/win/i.test(ua) && !/darwin|mac/i.test(ua)) {
    root.classList.add('is-win');
    for (const a of $$('[data-label-win]')) {
      const label = $('[data-label]', a);
      if (label) label.textContent = a.dataset.labelWin;
    }
  }

  /* ---------- Nav ---------- */
  const nav = $('[data-nav]');
  const burger = $('[data-burger]');
  const sheet = $('[data-sheet]');
  const setSheet = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    sheet.hidden = !open;
    $('[data-label-open]', burger).hidden = open;
    $('[data-label-close]', burger).hidden = !open;
    nav.classList.toggle('is-scrolled', open || scrollY > 8);
  };
  burger?.addEventListener('click', () => setSheet(burger.getAttribute('aria-expanded') !== 'true'));
  sheet?.addEventListener('click', (e) => {
    if (e.target.closest('a')) setSheet(false);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && burger?.getAttribute('aria-expanded') === 'true') {
      setSheet(false);
      burger.focus();
    }
  });

  /* ---------- Scroll-linked values (one rAF per frame) ---------- */
  const heroFit = $('[data-hero-stage] .vm-fit');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY;
      const vh = innerHeight;
      nav.classList.toggle('is-scrolled', y > 8 || burger?.getAttribute('aria-expanded') === 'true');
      root.style.setProperty('--glow', String(1 - Math.min(y / (vh * 1.6), 0.55)));
      if (heroFit && !reduced) {
        const t = Math.min(Math.max(y / (vh * 0.55), 0), 1);
        const eased = 1 - t * t * (3 - 2 * t);
        heroFit.style.setProperty('--tilt', eased.toFixed(4));
      }
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Stars: drawn once per size, never animated on the CPU ---------- */
  const canvas = $('.sky-stars');
  const drawStars = () => {
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth;
    const h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const count = Math.round((w * h) / 5200);
    for (let i = 0; i < count; i++) {
      const x = rnd() * w;
      const y = Math.pow(rnd(), 1.35) * h;
      const r = rnd() < 0.06 ? 1.1 + rnd() * 0.7 : 0.35 + rnd() * 0.55;
      const a = (0.25 + rnd() * 0.65) * (1 - (y / h) * 0.55);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(236, 232, 255, ${a.toFixed(3)})`;
      ctx.fill();
      if (r > 1.2) {
        ctx.beginPath();
        ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(214, 205, 255, ${(a * 0.08).toFixed(3)})`;
        ctx.fill();
      }
    }
  };
  let starTimer;
  addEventListener('resize', () => {
    clearTimeout(starTimer);
    starTimer = setTimeout(drawStars, 150);
  });
  drawStars();

  /* ---------- Reveal on scroll ---------- */
  const revealIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        revealIO.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  for (const el of $$('.rv, [data-mover], .final')) revealIO.observe(el);
  // The hero is above the fold: reveal it on the next frame so the entrance plays once.
  requestAnimationFrame(() => {
    for (const el of $$('.hero .rv')) el.classList.add('in');
  });

  /* ---------- The live Vela mock ---------- */
  const SPACE_HUES = [285, 16, 192];
  const ORDER = ['spaces', 'command', 'split', 'peek', 'tear', 'tidy'];
  const DURATIONS = { spaces: 7000, command: 6200, split: 5600, peek: 5200, tear: 6800, tidy: 5400 };
  const FLAGS = [
    'is-cmd',
    'is-typed',
    'is-complete',
    'is-newtab',
    'is-split',
    'is-drag',
    'is-peek',
    'is-ghost',
    'is-torn',
    'is-toast',
    'is-tidy',
    'is-press',
  ];
  const i18n = JSON.parse($('#i18n-demo')?.textContent || '{}');

  // Keep each mock (drawn at 1280×800) scaled to its box.
  const fitIO = new ResizeObserver((entries) => {
    for (const e of entries) {
      const vm = $('.vm', e.target);
      if (vm) vm.style.setProperty('--k', String(e.contentRect.width / 1280));
    }
  });

  class Mock {
    constructor(vm, { onSpace } = {}) {
      this.vm = vm;
      this.gen = 0;
      this.onSpace = onSpace;
      this.q = $('[data-q]', vm);
      this.drag = $('.drag-row', vm);
      this.ghost = $('.ghost', vm);
      fitIO.observe(vm.parentElement);
    }
    // Position of an element's centre in the mock's own 1280×800 coordinates.
    at(sel, dx = 0, dy = 0) {
      const el = typeof sel === 'string' ? $(sel, this.vm) : sel;
      const k = this.vm.getBoundingClientRect().width / 1280 || 1;
      const a = this.vm.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return [(b.left - a.left + b.width / 2) / k + dx, (b.top - a.top + b.height / 2) / k + dy];
    }
    cursor([x, y]) {
      this.vm.style.setProperty('--cx', `${x}px`);
      this.vm.style.setProperty('--cy', `${y}px`);
    }
    set(flag, on) {
      this.vm.classList.toggle(flag, on);
    }
    space(i) {
      this.vm.dataset.space = String(i);
      this.vm.style.setProperty('--si', String(i));
      this.onSpace?.(i);
    }
    base(flags = []) {
      for (const f of FLAGS) this.set(f, flags.includes(f));
      if (this.q) this.q.textContent = '';
      this.space(0);
    }
    async press(wait) {
      this.set('is-press', true);
      await wait(140);
      this.set('is-press', false);
    }
    // Runs one scene; resolves false if cancelled by a newer run.
    async run(name) {
      const gen = ++this.gen;
      const wait = (ms) =>
        new Promise((res, rej) =>
          setTimeout(() => (gen === this.gen ? res() : rej(new Error('cancel'))), ms),
        );
      try {
        await SCENES[name](this, wait);
        return true;
      } catch {
        return false;
      }
    }
    stop() {
      this.gen++;
    }
    // Reduced motion: jump straight to a scene's meaningful frame.
    show(name) {
      this.stop();
      const end = {
        spaces: () => this.base(),
        command: () => this.base(['is-cmd', 'is-typed', 'is-complete']),
        split: () => this.base(['is-newtab', 'is-split']),
        peek: () => this.base(['is-newtab', 'is-split', 'is-peek']),
        tear: () => this.base(['is-newtab', 'is-ghost', 'is-torn']),
        tidy: () => this.base(['is-tidy']),
      }[name];
      end?.();
      if (name === 'command' && this.q) this.q.textContent = i18n.query || 'orbit';
      if (name === 'spaces') this.space(1);
      if (name === 'tear') {
        this.vm.style.setProperty('--gx', '860px');
        this.vm.style.setProperty('--gy', '300px');
      }
      this.cursor([1130, 720]);
    }
  }

  const SCENES = {
    async spaces(m, wait) {
      m.base();
      await wait(500);
      for (const i of [1, 2, 0]) {
        m.cursor(m.at(`.sp[data-dot="${i}"]`, 4, 6));
        await wait(1100);
        await m.press(wait);
        m.space(i);
        await wait(i === 0 ? 1100 : 900);
      }
      m.cursor([1110, 700]);
      await wait(900);
    },
    async command(m, wait) {
      m.base();
      m.cursor(m.at('.vm-page', 120, 120));
      await wait(500);
      m.set('is-cmd', true);
      await wait(800);
      const q = i18n.query || 'orbit';
      for (let i = 1; i <= q.length; i++) {
        m.q.textContent = q.slice(0, i);
        if (i === 1) m.set('is-typed', true);
        await wait(110);
      }
      await wait(250);
      m.set('is-complete', true);
      m.cursor(m.at('.cmd-row.sel', 140, 4));
      await wait(1300);
      await m.press(wait);
      m.set('is-cmd', false);
      m.set('is-typed', false);
      m.set('is-complete', false);
      m.set('is-newtab', true);
      await wait(400);
      m.q.textContent = '';
      m.cursor([1110, 700]);
      await wait(1500);
    },
    async split(m, wait) {
      m.base(['is-newtab']);
      const row = $('.row[data-tab="review"]', m.vm);
      const start = m.at(row, -40, 0);
      m.cursor(start);
      await wait(1100);
      m.drag.innerHTML = row.innerHTML;
      m.vm.style.setProperty('--dx', `${start[0] - 30}px`);
      m.vm.style.setProperty('--dy', `${start[1] - 18}px`);
      m.set('is-press', true);
      await wait(120);
      m.set('is-drag', true);
      const target = m.at('.vm-page', 230, -40);
      m.cursor(target);
      m.vm.style.setProperty('--dx', `${target[0] - 30}px`);
      m.vm.style.setProperty('--dy', `${target[1] - 18}px`);
      await wait(1150);
      m.set('is-press', false);
      m.set('is-drag', false);
      m.set('is-split', true);
      await wait(600);
      m.cursor([1110, 700]);
      await wait(2400);
    },
    async peek(m, wait) {
      m.base(['is-newtab', 'is-split']);
      await wait(300);
      m.cursor(m.at('.site-orbit .site-cols div:last-child', -30, -6));
      await wait(1150);
      await m.press(wait);
      m.set('is-peek', true);
      await wait(700);
      m.cursor([1060, 720]);
      await wait(2300);
      m.set('is-peek', false);
      await wait(700);
    },
    async tear(m, wait) {
      m.base(['is-newtab']);
      const row = $('.row[data-tab="orbit"]', m.vm);
      const start = m.at(row, -30, 0);
      m.cursor(start);
      await wait(1100);
      m.drag.innerHTML = row.innerHTML;
      m.vm.style.setProperty('--dx', `${start[0] - 30}px`);
      m.vm.style.setProperty('--dy', `${start[1] - 18}px`);
      m.set('is-press', true);
      await wait(120);
      m.set('is-drag', true);
      const out = [980, 330];
      m.cursor(out);
      m.vm.style.setProperty('--dx', `${out[0] - 30}px`);
      m.vm.style.setProperty('--dy', `${out[1] - 18}px`);
      m.vm.style.setProperty('--gx', `${out[0] - 120}px`);
      m.vm.style.setProperty('--gy', `${out[1] - 40}px`);
      await wait(700);
      m.set('is-drag', false);
      m.set('is-ghost', true);
      await wait(500);
      m.cursor([1020, 360]);
      m.vm.style.setProperty('--gx', '860px');
      m.vm.style.setProperty('--gy', '300px');
      await wait(700);
      m.set('is-press', false);
      m.set('is-torn', true);
      m.set('is-toast', true);
      await wait(600);
      m.cursor([1130, 730]);
      await wait(2300);
      m.set('is-toast', false);
      await wait(800);
    },
    async tidy(m, wait) {
      m.base();
      await wait(900);
      m.set('is-tidy', true);
      await wait(3600);
      m.set('is-tidy', false);
      await wait(900);
    },
  };

  /* ---------- Hero tour ---------- */
  const heroVM = $('[data-hero-stage] .vm');
  const tour = $('.tour');
  const steps = $$('[data-goto]', tour);
  const toggle = $('[data-toggle]', tour);
  let heroVisible = true;
  let paused = false;
  let current = 0;
  const hueOwner = { el: null };
  const setHue = (owner) => (i) => {
    if (hueOwner.el === owner) root.style.setProperty('--hue', String(SPACE_HUES[i]));
  };

  const hero = heroVM ? new Mock(heroVM, { onSpace: setHue(heroVM) }) : null;
  hueOwner.el = heroVM;

  const markStep = (i) => {
    steps.forEach((b, j) => {
      b.toggleAttribute('aria-current', false);
      b.classList.toggle('is-done', j < i);
      b.style.removeProperty('--dur');
    });
    const b = steps[i];
    if (!b) return;
    // Restart the progress fill.
    b.style.setProperty('--dur', `${DURATIONS[ORDER[i]]}ms`);
    void b.offsetWidth;
    b.setAttribute('aria-current', 'step');
  };

  const playFrom = async (i) => {
    if (!hero) return;
    current = i;
    while (!paused && heroVisible && !document.hidden) {
      markStep(current);
      const done = await hero.run(ORDER[current]);
      if (!done) return;
      current = (current + 1) % ORDER.length;
    }
  };

  if (hero) {
    if (reduced) {
      hero.show('split');
      markStep(2);
      paused = true;
      toggle.hidden = true;
    } else {
      hero.base();
      hero.cursor([1110, 700]);
    }
    steps.forEach((b, i) =>
      b.addEventListener('click', () => {
        if (reduced) {
          hero.show(ORDER[i]);
          markStep(i);
          return;
        }
        hero.stop();
        paused = false;
        tour.classList.remove('is-paused');
        toggle.classList.remove('is-paused');
        toggle.setAttribute('aria-label', toggle.dataset.labelPause);
        void playFrom(i);
      }),
    );
    toggle.addEventListener('click', () => {
      paused = !paused;
      tour.classList.toggle('is-paused', paused);
      toggle.classList.toggle('is-paused', paused);
      toggle.setAttribute('aria-label', paused ? toggle.dataset.labelPlay : toggle.dataset.labelPause);
      if (paused) hero.stop();
      else void playFrom(current);
    });
    const heroIO = new IntersectionObserver(
      ([e]) => {
        const was = heroVisible;
        heroVisible = e.isIntersecting;
        if (heroVisible) hueOwner.el = heroVM;
        if (heroVisible && !was && !paused && !reduced) void playFrom(current);
        if (!heroVisible) hero.stop();
      },
      { threshold: 0.15 },
    );
    heroIO.observe(heroVM.parentElement);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hero.stop();
      else if (heroVisible && !paused && !reduced) void playFrom(current);
    });
  }

  /* ---------- Features rail drives a second copy of the mock ---------- */
  const railFit = $('[data-clone-of="hero"]');
  if (railFit && heroVM) {
    const clone = heroVM.cloneNode(true);
    clone.removeAttribute('aria-label');
    clone.removeAttribute('role');
    clone.setAttribute('aria-hidden', 'true');
    railFit.appendChild(clone);
    const rail = new Mock(clone, { onSpace: setHue(clone) });
    rail.base();
    rail.cursor([1110, 700]);
    let active = null;
    let railLoop = 0;
    const items = $$('[data-rail] .rail-item');
    const activate = async (item) => {
      if (active === item) return;
      active = item;
      hueOwner.el = clone;
      for (const it of items) it.classList.toggle('is-active', it === item);
      const scene = item.dataset.scene;
      if (reduced) {
        rail.show(scene);
        return;
      }
      const loop = ++railLoop;
      while (loop === railLoop) {
        const ok = await rail.run(scene);
        if (!ok || loop !== railLoop) return;
        await new Promise((r) => setTimeout(r, 900));
      }
    };
    const railIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) void activate(e.target);
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const it of items) {
      railIO.observe(it);
      it.addEventListener('click', () => void activate(it));
    }
    const sectionIO = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) {
        railLoop++;
        rail.stop();
        active = null;
      }
    });
    sectionIO.observe($('#features'));
  }

  /* ---------- GitHub stars, shown once there are enough to mean something ---------- */
  const stars = $('[data-stars]');
  if (stars) {
    fetch('https://api.github.com/repos/JoSanson/vela', {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((repo) => {
        const n = repo?.stargazers_count;
        if (typeof n !== 'number' || n < 25) return;
        stars.textContent = n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
        stars.hidden = false;
      })
      .catch(() => undefined);
  }
})();
