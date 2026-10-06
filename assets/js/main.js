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
    // Resolución por escena: la luz difusa de "fantasy" no necesita nitidez
    const DPR = { hero: 1.25, fantasy: 1.25 };
    $$('canvas[data-scene]').forEach((c) => scenes.set(c, TE.mountScene(c, c.dataset.scene, { maxDpr: DPR[c.dataset.scene] || 1.1 })));
  }

  /* ---------- sonido ---------- */
  const soundBtn = $('[data-sound]');
  const soundState = $('[data-sound-state]');
  let lastPlace = '';
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
    lastPlace = '';
    soundState.textContent = soundOn ? 'On' : 'Off';
    startPulse();
    onScroll();
  }
  soundBtn.addEventListener('click', () => setSound(!soundOn));

  // El ritmo pinta solo los elementos que lo usan (nunca :root, para no recalcular toda la página)
  const pulseEls = $$('.hero__glow');
  let pulseRunning = false;
  function pulseLoop() {
    if (!soundOn) {
      pulseEls.forEach((el) => el.style.setProperty('--pulse', '0'));
      pulseRunning = false;
      return;
    }
    const v = TE.pulse ? TE.pulse().toFixed(2) : '0';
    pulseEls.forEach((el) => el.style.setProperty('--pulse', v));
    requestAnimationFrame(pulseLoop);
  }
  function startPulse() {
    if (!pulseRunning) { pulseRunning = true; requestAnimationFrame(pulseLoop); }
  }

  /* ---------- puerta de entrada ---------- */
  const gate = $('[data-gate]');
  const hero = $('.hero');
  function enter(withSound) {
    if (withSound) setSound(true).then(() => audio && audio.sting());
    gate.classList.add('is-open');
    root.classList.remove('gated');
    setTimeout(() => hero.classList.add('is-in'), reduceMotion ? 0 : 450);
    // terminada la entrada de cámara, el cielo pasa a moverse con el scroll
    setTimeout(() => hero.classList.add('is-settled'), reduceMotion ? 0 : 450 + 3300);
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
  const intro = $('[data-portal-intro]');
  const bloom = $('[data-portal-bloom]');
  const neon = $('[data-neon]');
  const tabs = $$('.tab', stage);
  const scene = scenes.get($('.games__canvas', stage));
  if (scene && !reduceMotion) scene.post = TE.drawPortal;
  let current = tabs.findIndex((t) => t.classList.contains('is-active'));
  const zoneNo = $('[data-zone-no]');
  const meter = $('[data-portal-meter]');
  const meterWrap = $('[data-portal-meter-wrap]');
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
    if (zoneNo) {
      const next = String(i + 1).padStart(2, '0');
      if (zoneNo.textContent !== next) {
        zoneNo.textContent = next;
        zoneNo.classList.remove('roll');
        void zoneNo.offsetWidth;
        zoneNo.classList.add('roll');
      }
    }
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

  function updatePortal(y, vh) {
    const L = layout.games;
    const r = { top: L.top - y, bottom: L.top - y + L.h };
    const span = L.h - vh;
    const p = clamp(span > 0 ? -r.top / span : 0, 0, 1);
    const q = clamp((p - 0.06) / 0.58, 0, 1);
    const eased = q * q * (3 - 2 * q);
    const s = Math.pow(110, eased);
    const ringA = clamp(1 - eased * 4, 0, 1);
    // onda expansiva que se adelanta al portal
    const ws = Math.pow(110, clamp(eased * 1.6, 0, 1)) * 1.08;
    TE.portal = { s, ws, ring: ringA, wave: q > 0.01 ? clamp(0.9 - eased * 2.2, 0, 1) : 0, zoom: 1.35 - 0.35 * eased };
    // destello al cruzar
    bloom.style.opacity = (Math.exp(-Math.pow((eased - 0.72) / 0.09, 2)) * 0.55).toFixed(3);
    intro.style.opacity = String(clamp(1 - q * 5, 0, 1));
    if (meter) {
      meter.style.transform = `scaleX(${Math.min(1, q * 1.1).toFixed(3)})`;
      meterWrap.style.opacity = String(clamp((0.98 - q) * 8, 0, 1).toFixed(3));
    }
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
    // el botón cuenta dónde estás: afuera del antro o adentro
    const place = soundOn ? (openness > 0.5 ? 'Adentro' : 'Afuera') : 'Off';
    if (place !== lastPlace) { soundState.textContent = place; lastPlace = place; }
  }

  /* ---------- DEVELOPING FANTASY ---------- */
  const fantasy = $('#estudio');
  const fStage = $('[data-fantasy]');
  function updateFantasy(y, vh) {
    const L = layout.fantasy;
    const span = L.h - vh;
    const p = clamp(span > 0 ? (y - L.top) / span : 0, 0, 1);
    const q = clamp(p / 0.6, 0, 1);
    const e = 1 - Math.pow(1 - q, 3);
    TE.fantasyScale = 4.2 - 3.2 * e;
    fStage.style.setProperty('--fs', TE.fantasyScale.toFixed(4));
    fStage.style.setProperty('--fsub', clamp((p - 0.55) / 0.2, 0, 1).toFixed(3));
  }

  /* ---------- scroll maestro ---------- */
  const progress = $('.progress span');
  const heroContent = $('.hero__content');
  const heroCanvas = $('.hero__canvas');
  const lines = $$('.wordmark__line');
  let lastY = window.scrollY;
  let ticking = false;
  let velocity = 0;
  const skewEls = $$('[data-skew]');
  // Medidas de la página en caché: el scroll solo lee scrollY y nunca fuerza un recálculo del diseño
  const layout = { vh: window.innerHeight, docH: 1, games: { top: 0, h: 1 }, fantasy: { top: 0, h: 1 } };
  function measure() {
    const y = window.scrollY;
    layout.vh = window.innerHeight;
    layout.docH = document.documentElement.scrollHeight - layout.vh;
    layout.games = { top: games.getBoundingClientRect().top + y, h: games.offsetHeight };
    layout.fantasy = { top: fantasy.getBoundingClientRect().top + y, h: fantasy.offsetHeight };
  }

  // ---- Scroll con inercia (estilo apple.com) ----
  // El scroll del navegador sigue siendo nativo; lo que se suaviza son las
  // animaciones que dependen de él: siguen a la posición real con una pequeña
  // inercia, así cada "salto" de la rueda del mouse se convierte en un deslizamiento.
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const EASE_K = coarse ? 0.32 : 0.14;
  let sy = window.scrollY;
  let smoothing = false;

  // Lo que debe responder al instante (header, barra de progreso)
  function onScrollImmediate() {
    const y = window.scrollY;
    const vh = layout.vh;
    header.classList.toggle('is-scrolled', y > 40);
    if (!menuOpen) {
      if (y > lastY + 4 && y > vh * 0.8) header.classList.add('is-hidden');
      else if (y < lastY - 4 || y < vh * 0.8) header.classList.remove('is-hidden');
    }
    lastY = y;
    ticking = false;
  }

  // Lo que se mueve con inercia
  function render(y) {
    const vh = layout.vh;
    const docH = layout.docH;
    progress.style.transform = `scaleX(${docH > 0 ? clamp(y / docH, 0, 1) : 0})`;
    if (!reduceMotion && y < vh * 1.3) {
      heroContent.style.transform = `translate3d(0, ${(y * 0.25).toFixed(1)}px, 0)`;
      heroContent.style.opacity = String(clamp(1 - y / (vh * 0.75), 0, 1).toFixed(3));
      lines[0].style.transform = `translate3d(${(-y * 0.35).toFixed(1)}px, 0, 0)`;
      lines[1].style.transform = `translate3d(${(y * 0.35).toFixed(1)}px, 0, 0)`;
      // el cielo se queda atrás: profundidad al bajar
      if (hero.classList.contains('is-settled')) heroCanvas.style.transform = `translate3d(0, ${(y * 0.3).toFixed(1)}px, 0)`;
    }
    if (!reduceMotion) updatePortal(y, vh);
    else if (audio) audio.setOpenness(0.6);
    if (!reduceMotion) updateFantasy(y, vh);
  }

  let lastT = 0;
  function smoothLoop(now) {
    const target = window.scrollY;
    const prev = sy;
    // inercia basada en tiempo: se siente igual a 30, 60 o 120 cuadros por segundo
    const dt = lastT ? Math.min(64, now - lastT) : 16.7;
    lastT = now;
    sy += (target - sy) * (1 - Math.pow(1 - EASE_K, dt / 16.7));
    if (Math.abs(target - sy) < 0.4) sy = target;
    velocity = sy - prev;
    render(sy);
    if (sy !== target) requestAnimationFrame(smoothLoop);
    else { smoothing = false; lastT = 0; }
  }
  function kick() {
    if (!smoothing) { smoothing = true; requestAnimationFrame(smoothLoop); }
  }
  function onScroll() {
    // usado al medir o al cambiar el sonido: dibuja en la posición actual sin esperar
    render(sy);
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScrollImmediate);
    }
    if (reduceMotion) { sy = window.scrollY; render(sy); } else kick();
  }, { passive: true });
  const remeasure = () => { measure(); onScroll(); };
  window.addEventListener('resize', remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(remeasure);
  measure();
  onScroll();

  // ---- Navegación con desplazamiento animado (curva suave, como Apple) ----
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let navAnim = null;
  function cancelNav() { if (navAnim) { cancelAnimationFrame(navAnim); navAnim = null; } }
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, cancelNav, { passive: true }));
  function scrollToY(to) {
    cancelNav();
    const from = window.scrollY;
    const dist = to - from;
    if (Math.abs(dist) < 2) return;
    if (reduceMotion) { window.scrollTo(0, to); return; }
    const dur = clamp(Math.abs(dist) * 0.35, 650, 1700);
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / dur, 0, 1);
      window.scrollTo(0, from + dist * easeInOut(k));
      navAnim = k < 1 ? requestAnimationFrame(step) : null;
    };
    navAnim = requestAnimationFrame(step);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    let to = el.getBoundingClientRect().top + window.scrollY;
    // "Juegos" aterriza con el antro ya abierto: el viaje pasa por la luna
    if (id === 'juegos' && !reduceMotion) to += (el.offsetHeight - window.innerHeight) * 0.84;
    scrollToY(Math.max(0, to));
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });

  /* ---------- inclinación según la velocidad del scroll ---------- */
  if (!reduceMotion && skewEls.length) {
    // Solo corre mientras hay movimiento; en reposo no toca el DOM
    let skew = 0, skewing = false;
    function skewLoop() {
      skew += (clamp(velocity * 0.035, -3, 3) - skew) * 0.12;
      velocity *= 0.85;
      const idle = Math.abs(skew) < 0.01 && Math.abs(velocity) < 0.5;
      skewEls.forEach((el) => { el.style.transform = idle ? '' : `skewY(${skew.toFixed(3)}deg)`; });
      if (idle) { skew = 0; skewing = false; } else requestAnimationFrame(skewLoop);
    }
    window.addEventListener('scroll', () => {
      if (!skewing) { skewing = true; requestAnimationFrame(skewLoop); }
    }, { passive: true });
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
        if (!running && parts.length) { running = true; sparkCanvas.hidden = false; requestAnimationFrame(draw); }
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
      else { running = false; sctx.clearRect(0, 0, sw, sh); sparkCanvas.hidden = true; }
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
    // Luz del cursor: se mueve con transform directo y se duerme cuando llega a su destino
    const spot = $('.spot');
    spot.hidden = true;
    document.addEventListener('pointerleave', () => { spot.hidden = true; });
    let sx = -999, sy = -999, tx = -999, ty = -999, following = false;
    function follow() {
      sx += (tx - sx) * 0.14;
      sy += (ty - sy) * 0.14;
      spot.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
      if (Math.abs(tx - sx) + Math.abs(ty - sy) > 0.5) requestAnimationFrame(follow);
      else following = false;
    }
    window.addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      if (sx < -900) { sx = tx; sy = ty; }
      if (spot.hidden) spot.hidden = false;
      if (!following) { following = true; requestAnimationFrame(follow); }
    }, { passive: true });
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

  /* ---------- subrayado que se desliza entre opciones del menú ---------- */
  const nav = $('.nav');
  const pill = $('.nav__pill');
  if (nav && pill) {
    nav.classList.add('has-pill');
    const moveTo = (a) => {
      if (!a) { nav.style.setProperty('--po', '0'); return; }
      nav.style.setProperty('--px', `${a.offsetLeft}px`);
      nav.style.setProperty('--pw', String(a.offsetWidth / 10));
      nav.style.setProperty('--po', '1');
    };
    const active = () => navLinks.find((l) => l.classList.contains('is-active'));
    navLinks.forEach((a) => a.addEventListener('pointerenter', () => moveTo(a)));
    nav.addEventListener('pointerleave', () => moveTo(active()));
    new MutationObserver(() => { if (!nav.matches(':hover')) moveTo(active()); })
      .observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => moveTo(active()));
  }

  /* ---------- EL CLUB: profundidad con el mouse y deslizar entre zonas ---------- */
  if (!reduceMotion) {
    stage.addEventListener('pointermove', (e) => {
      if (!stage.classList.contains('is-open') || e.pointerType !== 'mouse') return;
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty('--gx', `${(-nx * 22).toFixed(1)}px`);
      stage.style.setProperty('--gy', `${(-ny * 14).toFixed(1)}px`);
    });
    stage.addEventListener('pointerleave', () => {
      stage.style.setProperty('--gx', '0px');
      stage.style.setProperty('--gy', '0px');
    });
  }
  let touchX = null, touchY = null;
  stage.addEventListener('touchstart', (e) => {
    if (e.target.closest('.tabs')) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchX === null || !stage.classList.contains('is-open')) return;
    const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) select(current + (dx < 0 ? 1 : -1));
  }, { passive: true });
  const hudLinks = $$('[data-hud]');
  if (hasIO) {
    const map = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const a = map.get(e.target.id);
        navLinks.forEach((l) => l.classList.toggle('is-active', l === a));
        hudLinks.forEach((l) => l.classList.toggle('is-active', l.dataset.hud === e.target.id));
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
