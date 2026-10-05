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
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const TE = (window.TE = window.TE || {});
  TE.pointer = TE.pointer || { x: 0, y: 0 };

  root.classList.add('js');

  /* ---------- escenas ---------- */
  if (TE.mountScene) {
    $$('canvas[data-scene]').forEach((c) => TE.mountScene(c, c.dataset.scene, { maxDpr: 1.5 }));
  }

  /* ---------- preloader + encendido del neón ---------- */
  const pre = $('.preloader');
  const neon = $('.neon');
  const hero = $('.hero');
  function lightUp() {
    body.classList.remove('is-loading');
    setTimeout(() => {
      neon && neon.classList.add('is-lit');
      hero && hero.classList.add('is-in');
    }, reduceMotion ? 0 : 380);
  }
  if (pre) {
    const countEl = $('[data-count]', pre);
    const barEl = $('.preloader__bar span', pre);
    const minTime = reduceMotion ? 200 : 1700;
    const t0 = performance.now();
    let fontsReady = false;
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => (fontsReady = true));
    setTimeout(() => (fontsReady = true), 3500);
    let done = false;
    const tick = (now) => {
      const raw = clamp((now - t0) / minTime, 0, 1);
      const eased = 1 - Math.pow(1 - raw, 2.2);
      const shown = fontsReady ? eased : Math.min(eased, 0.92);
      countEl.textContent = String(Math.round(shown * 100)).padStart(3, '0');
      barEl.style.transform = `scaleX(${shown})`;
      if (shown >= 1 && !done) {
        done = true;
        pre.classList.add('is-done');
        lightUp();
        setTimeout(() => pre.classList.add('is-gone'), 1300);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } else {
    lightUp();
  }

  /* ---------- puntero (paralaje de escenas) ---------- */
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
  burger && burger.addEventListener('click', () => setMenu(!menuOpen));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) setMenu(false); });

  // Enlaces de redes: aún sin URL definitiva.
  $$('[data-social]').forEach((a) => a.addEventListener('click', (e) => { if (a.getAttribute('href') === '#') e.preventDefault(); }));

  /* ---------- reloj del club ---------- */
  const clock = $('[data-clock]');
  function updateClock() {
    if (!clock) return;
    const d = new Date();
    clock.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  updateClock();
  setInterval(updateClock, 15000);

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
    if (reduceMotion) words.forEach((w) => w.classList.add('on'));
  }

  /* ---------- cintas ---------- */
  const tapes = $$('[data-tape]').map((track, i) => {
    const tape = track.parentElement;
    const unit = Array.from(track.children).map((n) => n.cloneNode(true));
    const state = { track, tape, dir: i === 0 ? 1 : -1, unitW: 0 };
    state.measure = () => {
      while (track.children.length > unit.length) track.lastChild.remove();
      state.unitW = track.scrollWidth;
      let guard = 0;
      while (track.scrollWidth < tape.offsetWidth + state.unitW && guard++ < 12) {
        unit.forEach((n) => track.appendChild(n.cloneNode(true)));
      }
    };
    return state;
  });

  /* ---------- zonas: scroll horizontal ---------- */
  const zones = $('#zonas');
  const track = $('[data-track]');
  const nightTime = $('[data-night-time]');
  const nightBar = $('[data-night-bar]');
  const nightDot = $('[data-night-dot]');
  let zonesDist = 0;
  let horizontal = false;
  function measureZones() {
    if (!zones || !track) return;
    horizontal = window.innerWidth > 760;
    if (horizontal) {
      track.style.transform = '';
      zonesDist = Math.max(0, track.scrollWidth - window.innerWidth);
      zones.style.height = `${window.innerHeight + zonesDist}px`;
    } else {
      zonesDist = 0;
      zones.style.height = '';
    }
  }

  /* ---------- sonido ---------- */
  const soundBtns = $$('[data-sound], [data-sound-hint]');
  const soundState = $('[data-sound-state]');
  let soundOn = false;
  let lastLabel = '';
  function soundLabel(openness) {
    if (!soundOn) return 'Apagado';
    if (openness < 0.12) return 'Afuera';
    if (openness < 0.88) return 'Entrando';
    return 'Adentro';
  }
  async function toggleSound() {
    if (!window.ClubAudio) return;
    if (soundOn) {
      window.ClubAudio.stop();
      soundOn = false;
    } else {
      const ok = await window.ClubAudio.start();
      soundOn = !!ok;
    }
    soundBtns.forEach((b) => {
      if (b.hasAttribute('data-sound')) b.setAttribute('aria-pressed', String(soundOn));
      else b.classList.toggle('is-on', soundOn);
    });
    lastLabel = '';
    onScroll();
  }
  soundBtns.forEach((b) => b.addEventListener('click', toggleSound));

  /* ---------- scroll maestro ---------- */
  const progress = $('.progress span');
  const heroContent = $('.hero__content');
  let lastY = window.scrollY;
  let ticking = false;
  let tapeT = 0;

  function onScroll() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight - vh;

    if (progress) progress.style.transform = `scaleX(${docH > 0 ? y / docH : 0})`;

    if (header) {
      header.classList.toggle('is-scrolled', y > 40);
      if (!menuOpen) {
        if (y > lastY + 4 && y > vh * 0.6) header.classList.add('is-hidden');
        else if (y < lastY - 4 || y < vh * 0.6) header.classList.remove('is-hidden');
      }
    }
    lastY = y;

    if (heroContent && y < vh * 1.2 && !reduceMotion) {
      heroContent.style.transform = `translate3d(0, ${y * 0.28}px, 0)`;
      heroContent.style.opacity = String(clamp(1 - y / (vh * 0.65), 0, 1));
    }

    if (words.length && !reduceMotion) {
      const r = manifesto.getBoundingClientRect();
      const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.25), 0, 1);
      const lit = Math.round(p * words.length * 1.08);
      words.forEach((w, i) => w.classList.toggle('on', i < lit));
    }

    let zp = 0;
    let openness = 0;
    if (zones) {
      const r = zones.getBoundingClientRect();
      const span = zones.offsetHeight - vh;
      zp = clamp(span > 0 ? -r.top / span : (vh - r.top) / (vh + r.height), 0, 1);
      if (horizontal && track) track.style.transform = `translate3d(${-zonesDist * zp}px, 0, 0)`;
      const mins = 23 * 60 + Math.round(zp * 7 * 60);
      const hh = Math.floor(mins / 60) % 24;
      const mm = mins % 60;
      if (nightTime) nightTime.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      if (nightBar) nightBar.style.transform = `scaleX(${zp})`;
      if (nightDot) nightDot.style.left = `${zp * 100}%`;
      openness = Math.min(clamp((vh - r.top) / vh, 0, 1), clamp(r.bottom / vh, 0, 1));
    }
    if (window.ClubAudio) window.ClubAudio.setOpenness(openness);
    const label = soundLabel(openness);
    if (soundState && label !== lastLabel) {
      soundState.textContent = label;
      lastLabel = label;
    }
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });

  // Cintas en movimiento continuo (+ empuje del scroll)
  let lastFrame = performance.now();
  function tapeLoop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    tapeT += dt;
    const y = window.scrollY;
    tapes.forEach((t, i) => {
      if (!t.unitW) return;
      const speed = i === 0 ? 30 : 60;
      let off = (tapeT * speed + y * 0.35) % t.unitW;
      if (t.dir === 1) off = t.unitW - off;
      t.track.style.transform = `translate3d(${-off}px, 0, 0)`;
    });
    requestAnimationFrame(tapeLoop);
  }

  function onResize() {
    tapes.forEach((t) => t.measure());
    measureZones();
    onScroll();
  }
  window.addEventListener('resize', onResize);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(onResize);
  onResize();
  if (!reduceMotion) requestAnimationFrame(tapeLoop);
  else tapes.forEach((t) => { if (t.unitW) t.track.style.transform = `translate3d(${-t.unitW * 0.25}px,0,0)`; });

  /* ---------- nav activa ---------- */
  const navLinks = $$('.nav a');
  if ('IntersectionObserver' in window) {
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
    el.style.transitionDelay = `${Math.min(sibs.indexOf(el), 6) * 0.08}s`;
  });
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- póster con inclinación 3D ---------- */
  const poster = $('[data-tilt]');
  if (poster && finePointer && !reduceMotion) {
    poster.addEventListener('pointermove', (e) => {
      const r = poster.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      poster.classList.add('is-tilting');
      poster.style.setProperty('--ry', `${(x - 0.5) * 14}deg`);
      poster.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
      poster.style.setProperty('--sx', `${x * 100}%`);
      poster.style.setProperty('--sy', `${y * 100}%`);
    });
    poster.addEventListener('pointerleave', () => {
      poster.classList.remove('is-tilting');
      poster.style.setProperty('--ry', '0deg');
      poster.style.setProperty('--rx', '0deg');
    });
  }

  /* ---------- modal del tráiler ---------- */
  const modal = $('[data-modal]');
  function openModal() {
    if (!modal) return;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }
  function closeModal() {
    if (!modal) return;
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  }
  $$('[data-trailer]').forEach((b) => b.addEventListener('click', openModal));
  $$('[data-modal-close]').forEach((b) => b.addEventListener('click', closeModal));
  modal && modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  /* ---------- lista de acceso: la pulsera ---------- */
  const form = $('[data-join]');
  const band = $('[data-band]');
  const bandNo = $('[data-band-no]');
  const bandMail = $('[data-band-mail]');
  const bandNote = $('[data-band-note]');
  const msg = $('[data-join-msg]');
  const STORE_KEY = 'te-elclub-pulsera';

  // Conecta aquí tu servicio de correo (Mailchimp, Formspree, tu API…).
  // Debe devolver una promesa; si falla, el formulario muestra el error.
  TE.submitToList = TE.submitToList || function (email) { return Promise.resolve({ email }); };

  function guestNumber(email) {
    let h = 2166136261;
    for (let i = 0; i < email.length; i++) {
      h ^= email.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return String((h >>> 0) % 10000).padStart(4, '0');
  }
  function showBand(email, animate) {
    const no = guestNumber(email.toLowerCase());
    bandMail.textContent = email;
    band.classList.remove('is-on');
    void band.offsetWidth;
    band.classList.add('is-on');
    bandNote.textContent = 'Guarda tu número. Lo vas a necesitar en la puerta.';
    if (!animate || reduceMotion) {
      bandNo.textContent = no;
      return;
    }
    let n = 0;
    const roll = setInterval(() => {
      bandNo.textContent = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      if (++n > 14) {
        clearInterval(roll);
        bandNo.textContent = no;
      }
    }, 45);
  }
  if (form) {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) {
        showBand(saved, false);
        msg.textContent = 'Ya estás en la lista. Nos vemos en la puerta.';
        msg.className = 'join__msg is-ok';
      }
    } catch (err) { /* almacenamiento no disponible */ }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.elements.email;
      const email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        msg.textContent = 'Revisa tu correo. Debe verse como nombre@correo.com.';
        msg.className = 'join__msg is-error';
        input.focus();
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      TE.submitToList(email).then(() => {
        showBand(email, true);
        msg.textContent = 'Listo, ya estás en la lista. Te avisamos antes que a nadie.';
        msg.className = 'join__msg is-ok';
        try { localStorage.setItem(STORE_KEY, email); } catch (err) { /* sin almacenamiento */ }
        form.reset();
      }).catch(() => {
        msg.textContent = 'No pudimos anotarte. Inténtalo de nuevo en un momento.';
        msg.className = 'join__msg is-error';
      }).finally(() => { btn.disabled = false; });
    });
  }

  /* ---------- cursor ---------- */
  if (finePointer && !reduceMotion) {
    const cursor = $('.cursor');
    const label = $('.cursor__label');
    root.classList.add('has-cursor');
    let cx = -100, cy = -100, tx = -100, ty = -100;
    window.addEventListener('pointermove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
      cursor.classList.remove('is-hidden');
    }, { passive: true });
    document.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-cursor], a, button, input, textarea, label');
      cursor.classList.remove('is-link', 'is-label', 'is-text');
      if (!t) return;
      if (t.matches('input, textarea')) cursor.classList.add('is-text');
      else if (t.dataset.cursor) {
        label.textContent = t.dataset.cursor;
        cursor.classList.add('is-label');
      } else cursor.classList.add('is-link');
    });
    const follow = () => {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
  }

  /* ---------- año ---------- */
  const year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
