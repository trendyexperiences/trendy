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

  root.classList.add('js');

  /* ---------- escenas ---------- */
  const scenes = new Map();
  if (TE.mountScene) {
    $$('canvas[data-scene]').forEach((c) => scenes.set(c, TE.mountScene(c, c.dataset.scene, { maxDpr: 1.5 })));
  }

  /* ---------- entrada del hero ---------- */
  const hero = $('.hero');
  const reveal = () => requestAnimationFrame(() => hero && hero.classList.add('is-in'));
  Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((r) => setTimeout(r, 1200)),
  ]).then(reveal);

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

  /* ---------- scroll ---------- */
  const heroContent = $('.hero__content');
  let lastY = window.scrollY;
  let ticking = false;
  function onScroll() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    header.classList.toggle('is-scrolled', y > 40);
    if (!menuOpen) {
      if (y > lastY + 4 && y > vh * 0.8) header.classList.add('is-hidden');
      else if (y < lastY - 4 || y < vh * 0.8) header.classList.remove('is-hidden');
    }
    lastY = y;

    if (heroContent && !reduceMotion && y < vh * 1.2) {
      heroContent.style.transform = `translate3d(0, ${y * 0.3}px, 0)`;
      heroContent.style.opacity = String(clamp(1 - y / (vh * 0.7), 0, 1));
    }

    if (words.length && !reduceMotion) {
      const r = manifesto.getBoundingClientRect();
      const p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.3), 0, 1);
      const lit = Math.round(p * words.length * 1.1);
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
    el.style.transitionDelay = `${Math.min(sibs.indexOf(el), 5) * 0.08}s`;
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

  /* ---------- juego destacado: zonas ---------- */
  const feature = $('[data-feature]');
  if (feature) {
    const scene = scenes.get($('.feature__canvas', feature));
    const tabs = $$('.tab', feature);
    const zoneText = $('[data-zone-text]', feature);
    const neon = $('[data-neon]', feature);
    let current = 0;
    let visible = false;
    let hovering = false;
    let swapTimer = null;

    const syncPause = () => feature.classList.toggle('is-paused', !visible || hovering);

    function select(i, focus) {
      i = (i + tabs.length) % tabs.length;
      tabs.forEach((t, k) => {
        t.classList.toggle('is-active', k === i);
        t.setAttribute('aria-selected', String(k === i));
        t.tabIndex = k === i ? 0 : -1;
      });
      // reinicia la barra de progreso aunque se repita la misma pestaña
      const bar = $('.tab__bar span', tabs[i]);
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = '';
      if (focus) tabs[i].focus();
      if (i === current) return;
      current = i;
      tabs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      feature.classList.add('is-switching');
      clearTimeout(swapTimer);
      swapTimer = setTimeout(() => {
        if (scene) scene.set(tabs[i].dataset.zone);
        zoneText.textContent = tabs[i].dataset.text;
        feature.classList.remove('is-switching');
      }, reduceMotion ? 0 : 280);
    }

    tabs.forEach((t, i) => {
      t.tabIndex = i === 0 ? 0 : -1;
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); select(current + 1, true); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); select(current - 1, true); }
      });
    });

    if (!reduceMotion) {
      feature.classList.add('is-auto');
      feature.addEventListener('animationend', (e) => {
        if (e.animationName === 'fill') select(current + 1);
      });
      feature.addEventListener('pointerenter', () => { hovering = true; syncPause(); });
      feature.addEventListener('pointerleave', () => { hovering = false; syncPause(); });
    }

    if (hasIO) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        syncPause();
        if (visible && neon) neon.classList.add('is-lit');
      }, { threshold: 0.35 }).observe(feature);
    } else {
      visible = true;
      neon && neon.classList.add('is-lit');
    }
    syncPause();
  }

  /* ---------- copiar correo ---------- */
  const copyBtn = $('[data-copy]');
  const email = $('[data-email]');
  if (copyBtn && email) {
    copyBtn.addEventListener('click', () => {
      const text = email.textContent.trim();
      const done = () => {
        copyBtn.textContent = 'Copiado';
        copyBtn.classList.add('is-done');
        setTimeout(() => {
          copyBtn.textContent = 'Copiar correo';
          copyBtn.classList.remove('is-done');
        }, 2000);
      };
      const fallback = () => {
        const range = document.createRange();
        range.selectNodeContents(email);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        copyBtn.textContent = 'Seleccionado';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  }

  /* ---------- año ---------- */
  const year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
