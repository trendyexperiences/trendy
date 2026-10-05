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

  // Parte un texto en letras (.ch) con su índice para animarlas en cascada
  function splitLetters(el, start) {
    let i = start || 0;
    const text = el.textContent;
    el.textContent = '';
    for (const c of text) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.style.setProperty('--d', i++);
      s.textContent = c === ' ' ? '\u00a0' : c;
      el.appendChild(s);
    }
    return i;
  }
  let li = 0;
  $$('.wordmark__line > span').forEach((el) => { li = splitLetters(el, li); });
  $$('[data-split]').forEach((el) => splitLetters(el));
  let ci = 0;
  $$('[data-letters] > span').forEach((el) => { ci = splitLetters(el, ci); });

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
    if (withSound) setSound(true).then(() => audio && audio.sting());
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
      gate.style.setProperty('--ring', (100 - shown * 100).toFixed(2));
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

  /* ---------- juegos: portal de la luna + zonas ---------- */
  const games = $('#juegos');
  const stage = $('[data-feature]');
  const portalG = $('[data-portal]');
  const ringG = $('[data-portal-ring]');
  const intro = $('[data-portal-intro]');
  const waveG = $('[data-portal-wave]');
  const bloom = $('[data-portal-bloom]');
  const neon = $('[data-neon]');
  const tabs = $$('.tab', stage);
  const scene = scenes.get($('.games__canvas', stage));
  let current = tabs.findIndex((t) => t.classList.contains('is-active'));
  const zoneNo = $('[data-zone-no]');
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
    if (zoneNo) zoneNo.textContent = String(i + 1).padStart(2, '0');
    if (i === current) return;
    current = i;
    const strip = tabs[i].parentElement;
    if (strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: tabs[i].offsetLeft - 16, behavior: 'smooth' });
    stage.classList.add('is-switching');
    clearTimeout(swapTimer);
    stage.classList.remove('is-switching');
    void stage.offsetWidth;
    stage.classList.add('is-switching');
    swapTimer = setTimeout(() => {
      if (scene) scene.set(tabs[i].dataset.zone);
      setTimeout(() => stage.classList.remove('is-switching'), 330);
    }, reduceMotion ? 0 : 290);
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
    // onda expansiva que se adelanta al portal
    const ws = Math.pow(110, clamp(eased * 1.6, 0, 1)) * 1.08;
    waveG.setAttribute('transform', `translate(42 55) scale(${ws.toFixed(4)}) translate(-42 -55)`);
    waveG.style.opacity = String(q > 0.01 ? clamp(0.9 - eased * 2.2, 0, 1) : 0);
    // destello al cruzar
    bloom.style.opacity = (Math.exp(-Math.pow((eased - 0.72) / 0.09, 2)) * 0.55).toFixed(3);
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

  /* ---------- DEVELOPING FANTASY ---------- */
  const fantasy = $('#estudio');
  const fStage = $('[data-fantasy]');
  function updateFantasy(vh) {
    const r = fantasy.getBoundingClientRect();
    const span = fantasy.offsetHeight - vh;
    const p = clamp(span > 0 ? -r.top / span : 0, 0, 1);
    const q = clamp(p / 0.6, 0, 1);
    const e = 1 - Math.pow(1 - q, 3);
    fStage.style.setProperty('--fs', (4.2 - 3.2 * e).toFixed(4));
    fStage.style.setProperty('--fsub', clamp((p - 0.55) / 0.2, 0, 1).toFixed(3));
  }

  /* ---------- scroll maestro ---------- */
  const progress = $('.progress span');
  const heroContent = $('.hero__content');
  const lines = $$('.wordmark__line');
  let lastY = window.scrollY;
  let ticking = false;
  let velocity = 0;
  const skewEls = $$('[data-skew]');
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
    velocity = y - lastY;
    lastY = y;

    if (!reduceMotion && y < vh * 1.2) {
      heroContent.style.transform = `translate3d(0, ${y * 0.25}px, 0)`;
      heroContent.style.opacity = String(clamp(1 - y / (vh * 0.75), 0, 1));
      lines[0].style.transform = `translate3d(${-y * 0.35}px, 0, 0)`;
      lines[1].style.transform = `translate3d(${y * 0.35}px, 0, 0)`;
    }

    if (!reduceMotion) updatePortal(vh);
    else if (audio) audio.setOpenness(0.6);

    if (!reduceMotion) updateFantasy(vh);
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

  /* ---------- inclinación según la velocidad del scroll ---------- */
  if (!reduceMotion && skewEls.length) {
    let skew = 0;
    (function skewLoop() {
      skew += (clamp(velocity * 0.035, -3, 3) - skew) * 0.12;
      velocity *= 0.85;
      const v = Math.abs(skew) < 0.01 ? 0 : skew;
      skewEls.forEach((el) => { el.style.transform = v ? `skewY(${v.toFixed(3)}deg)` : ''; });
      requestAnimationFrame(skewLoop);
    })();
  }

  /* ---------- sonidos de interfaz ---------- */
  let lastBlip = 0;
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-sfx], [data-magnetic], .tab, .nav a');
    if (!t || !audio || t.contains(e.relatedTarget)) return;
    const now = performance.now();
    if (now - lastBlip < 70) return;
    lastBlip = now;
    audio.blip('hover');
  });
  document.addEventListener('click', (e) => {
    if (audio && e.target.closest('a, button')) audio.blip('click');
  });

  /* ---------- destellos que siguen al cursor + onda al hacer clic ---------- */
  const sparkCanvas = $('.sparkles');
  if (sparkCanvas && !reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const sctx = sparkCanvas.getContext('2d');
    const parts = [];
    let running = false;
    let sw = 0, sh = 0;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      sw = window.innerWidth; sh = window.innerHeight;
      sparkCanvas.width = sw * dpr; sparkCanvas.height = sh * dpr;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener('resize', size);
    const COLORS = ['69,243,255', '255,255,255', '255,79,180', '150,190,255'];
    let px = null, py = null;
    window.addEventListener('pointermove', (e) => {
      if (px !== null) {
        const d = Math.hypot(e.clientX - px, e.clientY - py);
        const n = Math.min(3, Math.floor(d / 14));
        for (let i = 0; i < n; i++) {
          parts.push({
            x: e.clientX + (Math.random() - 0.5) * 8, y: e.clientY + (Math.random() - 0.5) * 8,
            vx: (Math.random() - 0.5) * 0.6, vy: -0.2 - Math.random() * 0.6,
            life: 0, max: 40 + Math.random() * 30, r: 1.5 + Math.random() * 2.5,
            c: COLORS[(Math.random() * COLORS.length) | 0], rot: Math.random() * Math.PI,
          });
        }
        if (parts.length > 160) parts.splice(0, parts.length - 160);
        if (!running && parts.length) { running = true; requestAnimationFrame(draw); }
      }
      px = e.clientX; py = e.clientY;
    }, { passive: true });
    function star(x, y, r, rot) {
      sctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = rot + (i * Math.PI) / 4;
        const rr = i % 2 ? r * 0.3 : r;
        sctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      sctx.closePath();
      sctx.fill();
    }
    function draw() {
      sctx.clearRect(0, 0, sw, sh);
      sctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life++;
        p.x += p.vx; p.y += p.vy; p.vy += 0.01; p.rot += 0.05;
        const k = 1 - p.life / p.max;
        if (k <= 0) { parts.splice(i, 1); continue; }
        sctx.fillStyle = `rgba(${p.c},${k * 0.9})`;
        star(p.x, p.y, p.r * (0.5 + k) * 1.6, p.rot);
      }
      if (parts.length) requestAnimationFrame(draw);
      else { running = false; sctx.clearRect(0, 0, sw, sh); }
    }
    window.addEventListener('pointerdown', (e) => {
      const r = document.createElement('span');
      r.className = 'ripple';
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 750);
    });
  }

  /* ---------- texto que se revuelve al pasar el mouse ---------- */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  $$('[data-scramble]').forEach((el) => {
    const node = Array.from(el.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) return;
    const original = node.textContent;
    let raf = null;
    const run = () => {
      if (reduceMotion) return;
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const step = (now) => {
        const k = (now - t0) / 380;
        node.textContent = original.split('').map((c, i) => {
          if (c === ' ' || i < k * original.length) return c;
          return GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }).join('');
        if (k < 1) raf = requestAnimationFrame(step);
        else node.textContent = original;
      };
      raf = requestAnimationFrame(step);
    };
    (el.closest('a, button') || el).addEventListener('pointerenter', run);
  });

  /* ---------- botones magnéticos y luz del cursor ---------- */
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine && !reduceMotion) {
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--tx', `${(e.clientX - r.left - r.width / 2) * 0.25}px`);
        el.style.setProperty('--ty', `${(e.clientY - r.top - r.height / 2) * 0.35}px`);
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--tx', '0px');
        el.style.setProperty('--ty', '0px');
      });
    });
    let sx = -999, sy = -999, tx = -999, ty = -999;
    window.addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; if (sx < -900) { sx = tx; sy = ty; } }, { passive: true });
    (function follow() {
      sx += (tx - sx) * 0.12;
      sy += (ty - sy) * 0.12;
      root.style.setProperty('--sx', `${sx.toFixed(1)}px`);
      root.style.setProperty('--sy', `${sy.toFixed(1)}px`);
      requestAnimationFrame(follow);
    })();
  }

  /* ---------- "Hablemos" letra por letra ---------- */
  const letters = $('[data-letters]');
  if (letters) {
    if (hasIO && !reduceMotion) {
      const io = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          letters.classList.add('is-in');
          io.disconnect();
        }
      }, { threshold: 0.3 });
      io.observe(letters);
    } else letters.classList.add('is-in');
  }

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
