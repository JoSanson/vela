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
  const heroFit = $('[data-hero-stage]');
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

  /* ---------- The film: hero and feature rail ---------- */
  // Scene ranges in the rendered film (site/film/film.js), in seconds.
  const SCENES = {
    spaces: [1.6, 6.2],
    command: [6.2, 10.7],
    split: [10.7, 14.5],
    peek: [14.5, 17.3],
    tear: [17.3, 21.1],
    tidy: [21.1, 23.9],
  };
  const ORDER = Object.keys(SCENES);
  const SPACE_HUES = [285, 16, 192];
  const quint = (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2);
  const span = (t, a, b) => quint(Math.min(1, Math.max(0, (t - a) / (b - a))));
  // Same Space moves as the film, so the page sky takes the colour of the Space on screen.
  const spaceAt = (t) => {
    if (t < 3.75) return span(t, 2.3, 2.95);
    if (t < 5.2) return 1 + span(t, 3.75, 4.4);
    return 2 - 2 * span(t, 5.2, 5.95);
  };
  const hueAt = (t) => {
    const sp = spaceAt(t);
    const i = Math.min(Math.floor(sp), 1);
    return SPACE_HUES[i] + (SPACE_HUES[i + 1] - SPACE_HUES[i]) * (sp - i);
  };
  let hueSource = null;
  // A seek before the metadata arrives is dropped by the browser: wait for it.
  const seek = (video, t) => {
    if (video.readyState >= 1) video.currentTime = t;
    else video.addEventListener('loadedmetadata', () => (video.currentTime = t), { once: true });
  };
  const followHue = (video) => {
    if (hueSource === video) root.style.setProperty('--hue', hueAt(video.currentTime).toFixed(1));
  };

  const film = $('[data-film]');
  const tour = $('.tour');
  if (film && tour) {
    const steps = $$('[data-goto]', tour);
    const toggle = $('[data-toggle]', tour);
    let userPaused = reduced;
    let visible = true;
    hueSource = film;

    const syncTour = () => {
      const t = film.currentTime;
      steps.forEach((b, i) => {
        const [a, z] = SCENES[ORDER[i]];
        const on = t >= a && t < z;
        b.toggleAttribute('aria-current', on);
        if (on) b.setAttribute('aria-current', 'step');
        b.classList.toggle('is-done', t >= z);
        const fill = $('.tour-bar i', b);
        fill.style.transform = `scaleX(${Math.min(1, Math.max(0, (t - a) / (z - a)))})`;
      });
      followHue(film);
    };
    const frame = () => {
      syncTour();
      if (!film.paused) requestAnimationFrame(frame);
    };
    film.addEventListener('play', () => requestAnimationFrame(frame));
    film.addEventListener('seeked', syncTour);

    const setPaused = (paused) => {
      userPaused = paused;
      tour.classList.toggle('is-paused', paused);
      toggle.classList.toggle('is-paused', paused);
      toggle.setAttribute('aria-label', paused ? toggle.dataset.labelPlay : toggle.dataset.labelPause);
      if (paused) film.pause();
      else if (visible) void film.play().catch(() => undefined);
    };
    toggle.addEventListener('click', () => setPaused(!userPaused));
    steps.forEach((b, i) =>
      b.addEventListener('click', () => {
        seek(film, SCENES[ORDER[i]][0] + 0.01);
        hueSource = film;
        if (!reduced) setPaused(false);
        else syncTour();
      }),
    );
    if (reduced) {
      setPaused(true);
      seek(film, SCENES.split[0] + 1.6);
    }
    new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) hueSource = film;
        if (visible && !userPaused) void film.play().catch(() => undefined);
        else film.pause();
      },
      { threshold: 0.2 },
    ).observe(film);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) film.pause();
      else if (visible && !userPaused) void film.play().catch(() => undefined);
    });
  }

  // The rail loops the film on the scene of the item in focus.
  const railFilm = $('[data-rail-film]');
  if (railFilm) {
    const items = $$('[data-rail] .rail-item');
    let range = SCENES.spaces;
    let inView = false;
    const loop = () => {
      if (
        railFilm.readyState >= 1 &&
        (railFilm.currentTime >= range[1] || railFilm.currentTime < range[0] - 0.2)
      )
        railFilm.currentTime = range[0];
      followHue(railFilm);
      if (!railFilm.paused) requestAnimationFrame(loop);
    };
    railFilm.addEventListener('play', () => requestAnimationFrame(loop));
    const activate = (item) => {
      for (const it of items) it.classList.toggle('is-active', it === item);
      range = SCENES[item.dataset.scene] ?? SCENES.spaces;
      hueSource = railFilm;
      seek(railFilm, reduced ? range[0] + (range[1] - range[0]) * 0.6 : range[0]);
      if (!reduced && inView) void railFilm.play().catch(() => undefined);
    };
    const railIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) activate(e.target);
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const it of items) {
      railIO.observe(it);
      it.addEventListener('click', () => activate(it));
    }
    new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView) {
        railFilm.preload = 'auto';
        if (!reduced) void railFilm.play().catch(() => undefined);
      } else railFilm.pause();
    }).observe(railFilm);
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
