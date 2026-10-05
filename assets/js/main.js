/* =========================================================================
   Trendy Experiences — interacción del sitio
   ========================================================================= */
(function () {
  'use strict';

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const root = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;
  const TE = (window.TE = window.TE || {});
  TE.pointer = TE.pointer || { x: 0, y: 0 };
  const audio = window.ClubAudio;

  root.classList.add('js');

  /* ---------- escenas ---------- */
  const scenes = new Map();
  if (TE.mountScene) {
    $$('canvas[data-scene]').forEach((c) => scenes.set(c, TE.mountScene(c, c.dataset.scene, { maxDpr: 1.5 })));
  }

  /* ---------- sonido ---------- */
  const soundBtn = $('[data-sound]');
  const soundState = $('[data-sound-state]');
  let soundOn = false;
  async function setSound(on) {
    if (!audio) return;
    if (on) soundOn = !!(await audio.start());
    else {
      audio.stop();
      soundOn = false;
    }
    soundBtn.classList.toggle('is-on', soundOn);
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundState.textContent = soundOn ? 'On' : 'Off';
    onScroll();
  }
  soundBtn.addEventListener('click', () => setSound(!soundOn));

  // El ritmo pinta la página (variable --pulse)
  (function pulseLoop() {
    root.style.setProperty('--pulse', soundOn && TE.pulse ? TE.pulse().toFixed(3) : '0');
    requestAnimationFrame(pulseLoop);
  })();

  /* ---------- puerta de entrada ---------- */
  const gate = $('[data-gate]');
  const hero = $('.hero');
  function enter(withSound) {
    if (withSound) setSound(true);
    gate.classList.add('is-open');
    root.classList.remove('gated');
    setTimeout(() => hero.classList.add('is-in'), reduceMotion ? 0 : 450);
    setTimeout(() => gate.classList.add('is-gone'), 1400);
  }
  if (gate) {
    const count = $('[data-count]', gate);
    const bar = $('.gate__bar i', gate);
    const load = $('[data-gate-load]', gate);
    const choices = $('[data-gate-choices]', gate);
    const minTime = reduceMotion ? 150 : 1500;
    const t0 = performance.now();
    let fontsReady = false;
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => (fontsReady = true));
    setTimeout(() => (fontsReady = true), 3000);
    const tick = (now) => {
      const raw = clamp((now - t0) / minTime, 0, 1);
      const shown = fontsReady ? 1 - Math.pow(1 - raw, 2.4) : Math.min(1 - Math.pow(1 - raw, 2.4), 0.9);
      count.textContent = String(Math.round(shown * 100)).padStart(3, '0');
      bar.style.transform = `scaleX(${shown})`;
      if (shown >= 1) {
        load.hidden = true;
        choices.hidden = false;
        $('[data-enter="sound"]', choices).focus({ preventScroll: true });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    $$('[data-enter]', gate).forEach((b) => b.addEventListener('click', () => enter(b.dataset.enter === 'sound')));
  } else {
    root.classList.remove('gated');
    hero.classList.add('is-in');
  }

  /* ---------- puntero: paralaje y luz de luna sobre el logo ---------- */
  window.addEventListener('pointermove', (e) => {
    TE.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    TE.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    root.style.setProperty('--mx', `${e.clientX}px`);
    root.style.setProperty('--my', `${e.clientY}px`);
  }, { passive: true });

  /* ---------- header y menú ---------- */
  const header = $('.header');
  const burger = $('.burger');
  const menu = $('#menu');
  let menuOpen = false;
  function setMenu(open) {
    menuOpen = open;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('is-open'));
      body.style.overflow = 'hidden';
      header.classList.remove('is-hidden');
    } else {
      menu.classList.remove('is-open');
      body.style.overflow = '';
      setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 300);
    }
  }
  burger.addEventListener('click', () => setMenu(!menuOpen));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) setMenu(false); });

  /* ---------- manifiesto palabra por palabra ---------- */
  const manifesto = $('[data-words]');
  let words = [];
  if (manifesto) {
    const split = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) frag.appendChild(document.createTextNode(tok));
            else {
              const s = document.createElement('span');
              s.className = 'w';
              s.textContent = tok;
              frag.appendChild(s);
            }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) split(n);
      });
    };
    split(manifesto);
    words = $$('.w', manifesto);
  }

  /* ---------- juegos: portal de la luna + zonas ---------- */
  const games = $('#juegos');
  const stage = $('[data-feature]');
  const portalG = $('[data-portal]');
  const ringG = $('[data-portal-ring]');
  const intro = $('[data-portal-intro]');
  const neon = $('[data-neon]');
  const tabs = $$('.tab', stage);
  const scene = scenes.get($('.games__canvas', stage));
  let current = tabs.findIndex((t) => t.classList.contains('is-active'));
  let stageOpen = reduceMotion;
  let hovering = false;
  let swapTimer = null;

  const syncPause = () => stage.classList.toggle('is-paused', !stageOpen || hovering);

  function select(i, focus) {
    i = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      t.classList.toggle('is-active', k === i);
      t.setAttribute('aria-selected', String(k === i));
      t.tabIndex = k === i ? 0 : -1;
    });
    const bar = $('.tab__bar span', tabs[i]);
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = '';
    if (focus) tabs[i].focus({ preventScroll: true });
    if (i === current) return;
    current = i;
    const strip = tabs[i].parentElement;
    if (strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: tabs[i].offsetLeft - 16, behavior: 'smooth' });
    stage.classList.add('is-switching');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      if (scene) scene.set(tabs[i].dataset.zone);
      stage.classList.remove('is-switching');
    }, reduceMotion ? 0 : 280);
  }
  tabs.forEach((t, i) => {
    t.tabIndex = i === current ? 0 : -1;
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); select(current + 1, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); select(current - 1, true); }
    });
  });
  if (!reduceMotion) {
    stage.classList.add('is-auto');
    stage.addEventListener('animationend', (e) => { if (e.animationName === 'fill') select(current + 1); });
    stage.addEventListener('pointerenter', () => { hovering = true; syncPause(); });
    stage.addEventListener('pointerleave', () => { hovering = false; syncPause(); });
  } else {
    neon.classList.add('is-lit');
    stage.classList.add('is-open');
  }
  syncPause();

  function updatePortal(vh) {
    const r = games.getBoundingClientRect();
    const span = games.offsetHeight - vh;
    const p = clamp(span > 0 ? -r.top / span : 0, 0, 1);
    const q = clamp((p - 0.06) / 0.58, 0, 1);
    const eased = q * q * (3 - 2 * q);
    const s = Math.pow(110, eased);
    const tf = `translate(42 55) scale(${s.toFixed(4)}) translate(-42 -55)`;
    portalG.setAttribute('transform', tf);
    ringG.setAttribute('transform', tf);
    ringG.style.opacity = String(clamp(1 - eased * 4, 0, 1));
    intro.style.opacity = String(clamp(1 - q * 5, 0, 1));
    const ui = clamp((p - 0.62) / 0.14, 0, 1);
    stage.style.setProperty('--zoom', (1.35 - 0.35 * eased).toFixed(4));
    stage.style.setProperty('--ui', ui.toFixed(3));
    const open = ui > 0.5;
    if (open !== stageOpen) {
      stageOpen = open;
      stage.classList.toggle('is-open', open);
      syncPause();
    }
    if (ui > 0.2) neon.classList.add('is-lit');

    // la música se abre al cruzar la luna
    let openness;
    if (r.top > 0) openness = 0.08;
    else if (r.bottom > vh) openness = 0.08 + 0.92 * eased;
    else openness = 0.3 + 0.7 * clamp(r.bottom / vh, 0, 1);
    if (audio) audio.setOpenness(openness);
  }

  /* ---------- scroll maestro ---------- */
  const progress = $('.progress span');
  const heroContent = $('.hero__content');
  const lines = $$('.wordmark__line');
  let lastY = window.scrollY;
  let ticking = false;
  function onScroll() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight - vh;
    progress.style.transform = `scaleX(${docH > 0 ? y / docH : 0})`;

    header.classList.toggle('is-scrolled', y > 40);
    if (!menuOpen) {
      if (y > lastY + 4 && y > vh * 0.8) header.classList.add('is-hidden');
      else if (y < lastY - 4 || y < vh * 0.8) header.classList.remove('is-hidden');
    }
    lastY = y;

    if (!reduceMotion && y < vh * 1.2) {
      heroContent.style.transform = `translate3d(0, ${y * 0.25}px, 0)`;
      heroContent.style.opacity = String(clamp(1 - y / (vh * 0.75), 0, 1));
      lines[0].style.transform = `translate3d(${-y * 0.35}px, 0, 0)`;
      lines[1].style.transform = `translate3d(${y * 0.35}px, 0, 0)`;
    }

    if (!reduceMotion) updatePortal(vh);
    else if (audio) audio.setOpenness(0.6);

    if (words.length && !reduceMotion) {
      const r = manifesto.getBoundingClientRect();
      const p = clamp((vh * 0.9 - r.top) / (r.height + vh * 0.3), 0, 1);
      const lit = Math.round(p * words.length * 1.15);
      words.forEach((w, i) => w.classList.toggle('on', i < lit));
    }
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- nav activa ---------- */
  const navLinks = $$('.nav a');
  if (hasIO) {
    const map = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const a = map.get(e.target.id);
        navLinks.forEach((l) => l.classList.toggle('is-active', l === a));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section[id]').forEach((el) => io.observe(el));
  }

  /* ---------- revelado ---------- */
  const reveals = $$('[data-reveal]');
  reveals.forEach((el) => {
    const sibs = Array.from(el.parentElement.children).filter((n) => n.hasAttribute('data-reveal'));
    el.style.transitionDelay = `${Math.min(sibs.indexOf(el), 5) * 0.1}s`;
  });
  if (hasIO && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- copiar correo ---------- */
  const copyBtn = $('[data-copy]');
  const email = $('[data-email]');
  if (copyBtn && email) {
    copyBtn.addEventListener('click', () => {
      const text = email.textContent.trim();
      const done = (label) => {
        copyBtn.textContent = label;
        copyBtn.classList.add('is-done');
        setTimeout(() => {
          copyBtn.textContent = 'Copiar';
          copyBtn.classList.remove('is-done');
        }, 2000);
      };
      const fallback = () => {
        const range = document.createRange();
        range.selectNodeContents(email);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        done('Seleccionado');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done('Copiado'), fallback);
      else fallback();
    });
  }

  /* ---------- año ---------- */
  const year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
