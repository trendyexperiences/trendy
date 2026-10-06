/* =========================================================================
   Trendy Experiences — escenas generativas en canvas
   Todo el arte del sitio se dibuja aquí: no hay imágenes externas.
   ========================================================================= */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const BPM = 122;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Estado compartido: puntero normalizado (-1..1) y fase del beat.
  const TE = (window.TE = window.TE || {});
  TE.pointer = TE.pointer || { x: 0, y: 0 };
  TE.beat = function () {
    if (window.ClubAudio && window.ClubAudio.running) return window.ClubAudio.phase();
    return ((performance.now() / 1000) * (BPM / 60)) % 1;
  };
  TE.pulse = function () {
    const p = TE.beat();
    return Math.pow(1 - p, 3);
  };

  /* ---------- utilidades ---------- */

  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function linear(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    return g;
  }

  // Brillo radial pre-dibujado: dibujar una imagen escalada es mucho más barato
  // que crear un degradado nuevo en cada cuadro.
  const glowSprites = new Map();
  function glowSprite(rgb) {
    let c = glowSprites.get(rgb);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.4, `rgba(${rgb},0.35)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    glowSprites.set(rgb, c);
    return c;
  }
  function glow(ctx, x, y, r, rgb, a) {
    if (r <= 0 || a <= 0) return;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * Math.min(1, a);
    if (r < 140) {
      // brillos chicos y numerosos: imagen pre-dibujada
      ctx.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
    } else {
      // brillos grandes: un degradado rinde mejor en cualquier equipo
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},1)`);
      g.addColorStop(0.4, `rgba(${rgb},0.35)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = prev;
  }

  // Letreros de neón: se dibujan una vez (con su sombra) y luego solo se copian
  const neonCache = new Map();
  function neonText(ctx, text, x, y, size, color, glowColor, alpha) {
    if (alpha <= 0) return;
    const scale = ctx.getTransform().a || 1;
    size = Math.max(6, Math.round(size));
    const key = `${text}|${size}|${color}|${glowColor}|${scale.toFixed(2)}`;
    let c = neonCache.get(key);
    if (!c) {
      const font = `${size}px "Tilt Neon", "Big Shoulders Display", sans-serif`;
      const ready = !document.fonts || document.fonts.check(font);
      const pad = Math.ceil(size * 1.1);
      const m = document.createElement('canvas').getContext('2d');
      m.font = font;
      const tw = Math.ceil(m.measureText(text).width);
      c = document.createElement('canvas');
      c.width = Math.ceil((tw + pad * 2) * scale);
      c.height = Math.ceil((size + pad * 2) * scale);
      const g = c.getContext('2d');
      g.scale(scale, scale);
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const cx = tw / 2 + pad, cy = size / 2 + pad;
      g.shadowColor = glowColor;
      g.shadowBlur = size * 0.9;
      g.fillStyle = glowColor;
      g.fillText(text, cx, cy);
      g.shadowBlur = size * 0.3;
      g.fillStyle = color;
      g.fillText(text, cx, cy);
      c.cw = tw + pad * 2;
      c.ch = size + pad * 2;
      if (ready) {
        if (neonCache.size > 60) neonCache.clear();
        neonCache.set(key, c);
      }
    }
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(c, x - c.cw / 2, y - c.ch / 2, c.cw, c.ch);
    ctx.globalAlpha = prev;
  }

  // Trazo con brillo de neón sin shadowBlur (tres pasadas baratas)
  function glowStroke(ctx, width) {
    const a = ctx.globalAlpha;
    ctx.lineWidth = width * 5;
    ctx.globalAlpha = a * 0.1;
    ctx.stroke();
    ctx.lineWidth = width * 2.4;
    ctx.globalAlpha = a * 0.25;
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.globalAlpha = a;
    ctx.stroke();
  }

  // Parpadeo de neón: casi siempre encendido, con cortes breves.
  function flicker(t, seed) {
    const a = Math.sin(t * 7.3 + seed) + Math.sin(t * 13.1 + seed * 2.1) + Math.sin(t * 2.3 + seed * 0.7);
    return a > 2.35 ? 0.25 : 1;
  }

  /* ---------- palmera procedural ---------- */

  function drawPalm(ctx, o) {
    const x = o.x, y = o.y, h = o.h;
    const lean = o.lean || 0;
    const t = o.t || 0;
    const seed = o.seed || 1;
    const color = o.color || '#010208';
    const fronds = o.fronds || 10;
    const swayAmp = o.sway == null ? 0.035 : o.sway;
    const R = rng(seed);

    const sway = Math.sin(t * 0.7 + seed) * swayAmp + Math.sin(t * 1.9 + seed * 2) * swayAmp * 0.3;
    const topX = x + (lean + sway * 0.6) * h;
    const topY = y - h;
    const cX = x + lean * h * 0.12;
    const cY = y - h * 0.55;

    // Tronco: polígono que se adelgaza, con anillos leves.
    const N = 26, w0 = h * 0.05, w1 = h * 0.022;
    const left = [], right = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, u = 1 - s;
      const px = u * u * x + 2 * u * s * cX + s * s * topX;
      const py = u * u * y + 2 * u * s * cY + s * s * topY;
      const dx = 2 * u * (cX - x) + 2 * s * (topX - cX);
      const dy = 2 * u * (cY - y) + 2 * s * (topY - cY);
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const w = ((w0 + (w1 - w0) * s) / 2) * (1 + 0.07 * Math.sin(s * 70));
      left.push([px + nx * w, py + ny * w]);
      right.push([px - nx * w, py - ny * w]);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fill();

    if (o.rim) {
      ctx.strokeStyle = o.rim;
      ctx.lineWidth = Math.max(1, h * 0.004);
      ctx.beginPath();
      const side = o.rimSide === 'left' ? left : right;
      side.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    }

    // Hojas
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (let i = 0; i < fronds; i++) {
      const base = -Math.PI / 2 + (i / (fronds - 1) - 0.5) * Math.PI * 1.75 + (R() - 0.5) * 0.25;
      const a = base + sway * 1.5 + Math.sin(t * 1.3 + i * 1.7 + seed) * 0.035;
      const L = h * (0.36 + R() * 0.16);
      const droop = 0.3 + R() * 0.35 + Math.abs(Math.cos(a)) * 0.3;
      const leafR = 0.85 + R() * 0.3;
      const dx = Math.cos(a), dy = Math.sin(a);
      const M = 14;
      const pts = [];
      for (let j = 0; j <= M; j++) {
        const s = j / M;
        pts.push([topX + dx * L * s, topY + dy * L * s + droop * L * s * s]);
      }
      // nervadura
      ctx.lineWidth = Math.max(1, h * 0.009);
      ctx.beginPath();
      pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();

      // hojuelas sólidas: cuñas que cuelgan hacia la punta
      ctx.beginPath();
      for (let j = 1; j < M; j++) {
        const s = j / M;
        const p = pts[j], q = pts[j + 1];
        const tx = q[0] - p[0], ty = q[1] - p[1];
        const tl = Math.hypot(tx, ty) || 1;
        const ux = tx / tl, uy = ty / tl;
        const ll = L * 0.32 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.02)), 0.7) * leafR;
        const bx = p[0] + tx * 0.6, by = p[1] + ty * 0.6;
        for (let k = -1; k <= 1; k += 2) {
          const cs = Math.cos(k * 0.85), sn = Math.sin(k * 0.85);
          let lx = (ux * cs - uy * sn) * 0.6, ly = (ux * sn + uy * cs) * 0.6 + 0.6;
          const ln = Math.hypot(lx, ly) || 1;
          lx /= ln; ly /= ln;
          ctx.moveTo(p[0], p[1]);
          ctx.quadraticCurveTo(p[0] + lx * ll * 0.55 + ux * ll * 0.12, p[1] + ly * ll * 0.55 + uy * ll * 0.12, p[0] + lx * ll + ux * ll * 0.2, p[1] + ly * ll + uy * ll * 0.2);
          ctx.lineTo(bx, by);
          ctx.closePath();
        }
      }
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(topX, topY, h * 0.022, 0, TAU);
    ctx.fill();
  }

  // Capa que se redibuja un cuadro sí y otro no (para cosas que se mueven lento, como palmeras)
  function slowLayer(S, key, ctx, w, h, draw) {
    const scale = ctx.getTransform().a || 1;
    let L = S[key];
    if (!L) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      L = S[key] = { c, g: c.getContext('2d'), n: 0 };
    }
    if (L.n++ % 2 === 0 || reduceMotion) {
      L.g.setTransform(1, 0, 0, 1, 0, 0);
      L.g.clearRect(0, 0, L.c.width, L.c.height);
      L.g.setTransform(scale, 0, 0, scale, 0, 0);
      draw(L.g);
    }
    ctx.drawImage(L.c, 0, 0, w, h);
  }

  // Una multitud entera en un relleno (cuerpos y cabezas) y un trazo (brazos)
  function drawCrowd(ctx, people, color) {
    const bodies = new Path2D();
    const arms = new Path2D();
    let armW = 0, armN = 0;
    for (const [x, y, s, bob, armsUp] of people) {
      const yy = y - Math.abs(bob) * s * 0.12;
      bodies.ellipse(x, yy - s * 0.82, s * 0.16, s * 0.19, 0, 0, TAU);
      bodies.moveTo(x - s * 0.34, y + s * 0.1);
      bodies.quadraticCurveTo(x - s * 0.36, yy - s * 0.52, x, yy - s * 0.58);
      bodies.quadraticCurveTo(x + s * 0.36, yy - s * 0.52, x + s * 0.34, y + s * 0.1);
      bodies.closePath();
      if (armsUp) {
        const lift = Math.sin(bob * Math.PI) * s * 0.08;
        arms.moveTo(x - s * 0.24, yy - s * 0.48);
        arms.lineTo(x - s * 0.42, yy - s * 1.15 - lift);
        arms.moveTo(x + s * 0.24, yy - s * 0.48);
        arms.lineTo(x + s * 0.4, yy - s * 1.12 + lift);
        armW += s * 0.09;
        armN++;
      }
    }
    ctx.fillStyle = color;
    ctx.fill(bodies);
    if (armN) {
      ctx.strokeStyle = color;
      ctx.lineWidth = armW / armN;
      ctx.lineCap = 'round';
      ctx.stroke(arms);
    }
  }

  function drawPerson(ctx, x, y, s, bob, color, armsUp) {
    ctx.fillStyle = color;
    const yy = y - Math.abs(bob) * s * 0.12;
    ctx.beginPath();
    ctx.ellipse(x, yy - s * 0.82, s * 0.16, s * 0.19, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.34, y + s * 0.1);
    ctx.quadraticCurveTo(x - s * 0.36, yy - s * 0.52, x, yy - s * 0.58);
    ctx.quadraticCurveTo(x + s * 0.36, yy - s * 0.52, x + s * 0.34, y + s * 0.1);
    ctx.closePath();
    ctx.fill();
    if (armsUp) {
      ctx.strokeStyle = color;
      ctx.lineWidth = s * 0.09;
      ctx.lineCap = 'round';
      const lift = Math.sin(bob * Math.PI) * s * 0.08;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.24, yy - s * 0.48);
      ctx.lineTo(x - s * 0.42, yy - s * 1.15 - lift);
      ctx.moveTo(x + s * 0.24, yy - s * 0.48);
      ctx.lineTo(x + s * 0.4, yy - s * 1.12 + lift);
      ctx.stroke();
    }
  }

  function drawStars(ctx, S, w, h, t, maxY, density, dx, dy) {
    if (!S.stars) {
      const R = rng(42);
      const n = Math.round((w * maxY) / density);
      S.stars = Array.from({ length: n }, () => ({
        x: R() * w, y: R() * maxY, r: R() * 1.3 + 0.3, p: R() * TAU, s: 0.4 + R() * 2.2,
      }));
    }
    ctx.fillStyle = '#e4eeff';
    const prev = ctx.globalAlpha;
    for (const s of S.stars) {
      const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
      ctx.globalAlpha = prev * a * (1 - (s.y / maxY) * 0.75);
      ctx.fillRect(s.x + (dx || 0), s.y + (dy || 0), s.r, s.r);
    }
    ctx.globalAlpha = prev;
  }

  function drawMoon(ctx, x, y, r) {
    glow(ctx, x, y, r * 7, '120,170,255', 0.22);
    glow(ctx, x, y, r * 2.4, '200,225,255', 0.28);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#fbfdff');
    g.addColorStop(0.7, '#dbe7fb');
    g.addColorStop(1, '#a9bfe6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(110,135,190,0.16)';
    [[0.3, -0.2, 0.22], [-0.25, 0.3, 0.16], [-0.1, -0.4, 0.1], [0.35, 0.35, 0.12], [-0.45, -0.05, 0.08]].forEach((c) => {
      ctx.beginPath();
      ctx.arc(x + c[0] * r, y + c[1] * r, c[2] * r, 0, TAU);
      ctx.fill();
    });
  }

  function beam(ctx, ox, oy, angle, len, spread, rgb, a) {
    const ex = ox + Math.cos(angle) * len, ey = oy + Math.sin(angle) * len;
    const px = Math.cos(angle + Math.PI / 2) * len * spread;
    const py = Math.sin(angle + Math.PI / 2) * len * spread;
    ctx.fillStyle = linear(ctx, ox, oy, ex, ey, [[0, `rgba(${rgb},${a})`], [1, `rgba(${rgb},0)`]]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex + px, ey + py);
    ctx.lineTo(ex - px, ey - py);
    ctx.closePath();
    ctx.fill();
  }

  // Fondo del inicio (cielo, estrellas, luna, islas, mar): se pinta una sola vez por tamaño
  function heroBackground(w, h, scale, L) {
    const M = 48;
    const c = document.createElement('canvas');
    c.width = Math.ceil((w + M * 2) * scale);
    c.height = Math.ceil(h * scale);
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, M * scale, 0);
    const { hz, unit, moonX, moonY, moonR } = L;

    g.fillStyle = linear(g, 0, 0, 0, hz, [[0, '#01030b'], [0.5, '#051230'], [0.85, '#0d2c63'], [1, '#1a4a90']]);
    g.fillRect(-M, 0, w + M * 2, hz + 2);

    // estrellas fijas (las que parpadean se dibujan aparte)
    const R = rng(42);
    const n = Math.round(((w + M * 2) * hz * 0.9) / 2400);
    g.fillStyle = '#e4eeff';
    for (let i = 0; i < n; i++) {
      const x = -M + R() * (w + M * 2), y = R() * hz * 0.9, r = R() * 1.2 + 0.3;
      g.globalAlpha = (0.25 + R() * 0.55) * (1 - (y / (hz * 0.9)) * 0.75);
      g.fillRect(x, y, r, r);
    }
    g.globalAlpha = 1;

    // halo de la luna (corona) y la luna
    g.strokeStyle = 'rgba(190,215,255,0.07)';
    g.lineWidth = moonR * 0.35;
    g.beginPath();
    g.arc(moonX, moonY, moonR * 2.1, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(190,215,255,0.04)';
    g.lineWidth = moonR * 0.18;
    g.beginPath();
    g.arc(moonX, moonY, moonR * 3.2, 0, TAU);
    g.stroke();
    drawMoon(g, moonX, moonY, moonR);

    // islas lejanas
    g.fillStyle = '#050d24';
    const ridge = (x0, x1, amp, freq) => {
      g.beginPath();
      g.moveTo(x0, hz + 1);
      for (let x = x0; x <= x1; x += 6) {
        const k = (x - x0) / (x1 - x0);
        g.lineTo(x, hz - Math.sin(k * Math.PI) * unit * amp - Math.sin(k * freq) * unit * 0.003);
      }
      g.lineTo(x1, hz + 1);
      g.closePath();
      g.fill();
    };
    ridge(-M, w * 0.34, 0.045, 17);
    ridge(w * 0.8, w + M, 0.028, 23);

    g.fillStyle = linear(g, 0, hz - h * 0.1, 0, hz, [[0, 'rgba(60,120,230,0)'], [1, 'rgba(60,120,230,0.18)']]);
    g.fillRect(-M, hz - h * 0.1, w + M * 2, h * 0.1);

    g.fillStyle = linear(g, 0, hz, 0, h, [[0, '#0d2e62'], [0.25, '#06163a'], [1, '#01040d']]);
    g.fillRect(-M, hz, w + M * 2, h - hz);
    g.fillStyle = 'rgba(160,200,255,0.25)';
    g.fillRect(-M, hz, w + M * 2, 1);
    return { c, M };
  }

  /* ---------- HERO: la costa de noche (mundo Trendy) ---------- */

  function hero(ctx, w, h, t, S) {
    const P = TE.pointer;
    S.mx = (S.mx || 0) + (P.x - (S.mx || 0)) * 0.04;
    S.my = (S.my || 0) + (P.y - (S.my || 0)) * 0.04;
    const mx = S.mx, my = S.my;
    const portrait = h > w;
    const hz = h * (portrait ? 0.52 : 0.62);
    const unit = Math.min(w, h);
    const moonBX = w * (portrait ? 0.68 : 0.7);
    const moonY = h * (portrait ? 0.2 : 0.25);
    const moonR = unit * (portrait ? 0.085 : 0.07);
    const ox = mx * -10;
    const moonX = moonBX + ox;

    if (!S.bg) S.bg = heroBackground(w, h, ctx.getTransform().a || 1, { hz, unit, moonX: moonBX, moonY, moonR });
    ctx.drawImage(S.bg.c, -S.bg.M + ox, 0, w + S.bg.M * 2, h);

    // estrellas que parpadean
    if (!S.tw) {
      const R = rng(7);
      S.tw = Array.from({ length: 36 }, () => ({ x: R(), y: R() * 0.85, s: 0.6 + R() * 2, p: R() * TAU, r: 1 + R() * 1.2 }));
    }
    ctx.fillStyle = '#f2f7ff';
    for (const st of S.tw) {
      ctx.globalAlpha = Math.max(0, Math.sin(t * st.s + st.p)) * 0.9;
      ctx.fillRect(st.x * w + ox * 0.5, st.y * hz, st.r, st.r);
    }
    ctx.globalAlpha = 1;

    // Estrella fugaz ocasional
    if (!reduceMotion) {
      if (!S.shoot || t > S.shoot.start + S.shoot.dur + S.shoot.wait) {
        const R = Math.random;
        const dir = R() < 0.5 ? 1 : -1;
        S.shoot = { start: t, dur: 0.9, wait: 4 + R() * 7, x: w * (0.2 + R() * 0.6), y: hz * (0.06 + R() * 0.3), a: Math.PI / 2 - dir * (1.0 + R() * 0.3), len: unit * (0.25 + R() * 0.15) };
      }
      const sh = S.shoot;
      const p = (t - sh.start) / sh.dur;
      if (p >= 0 && p <= 1) {
        const hx = sh.x + Math.cos(sh.a) * sh.len * p, hy = sh.y + Math.sin(sh.a) * sh.len * p;
        const tx = hx - Math.cos(sh.a) * sh.len * 0.3, ty = hy - Math.sin(sh.a) * sh.len * 0.3;
        ctx.strokeStyle = linear(ctx, tx, ty, hx, hy, [[0, 'rgba(220,235,255,0)'], [1, `rgba(235,245,255,${Math.sin(Math.PI * p) * 0.9})`]]);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    // con música, la luna late
    if (window.ClubAudio && window.ClubAudio.running) {
      const pl = TE.pulse();
      glow(ctx, moonX, moonY, moonR * (3 + pl * 2), '120,190,255', 0.12 * pl);
    }
    // nubes lentas
    if (!S.clouds) {
      const R = rng(11);
      S.clouds = Array.from({ length: 6 }, () => ({ x: R(), y: 0.12 + R() * 0.4, w: 0.25 + R() * 0.35, s: 0.004 + R() * 0.006 }));
    }
    for (const c of S.clouds) {
      const cx = (((c.x + t * c.s) % 1.4) - 0.2) * w + mx * -8;
      const rw = c.w * w * 0.5;
      ctx.globalAlpha = 0.2;
      ctx.drawImage(glowSprite('60,105,190'), cx - rw, c.y * hz - rw * 0.16, rw * 2, rw * 0.32);
    }
    ctx.globalAlpha = 1;

    // EL CLUB a lo lejos: luces del antro sobre la isla de la derecha
    const ix = w * (portrait ? 0.9 : 0.9) + ox, iy = hz - unit * 0.016;
    const pulse = TE.pulse();
    glow(ctx, ix, iy, unit * 0.05, '255,79,180', 0.18 + pulse * 0.15);
    glow(ctx, ix, iy, unit * 0.03, '69,243,255', 0.2);
    for (let k = 0; k < 6; k++) {
      const on = Math.sin(t * (1.3 + k * 0.4) + k * 2) > -0.3;
      if (!on) continue;
      ctx.fillStyle = k % 2 ? '#ff7fca' : '#7ff7ff';
      ctx.fillRect(ix - unit * 0.018 + k * unit * 0.007, iy - (k % 3) * 2, 2, 2);
    }
    // un haz de luz que barre el cielo, muy tenue
    const ba = -Math.PI / 2 + Math.sin(t * 0.35) * 0.5;
    const blen = h * 0.7;
    ctx.globalAlpha = 0.07 + pulse * 0.04;
    ctx.fillStyle = linear(ctx, ix, iy, ix + Math.cos(ba) * blen, iy + Math.sin(ba) * blen, [[0, 'rgba(120,230,255,1)'], [1, 'rgba(120,230,255,0)']]);
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(ix + Math.cos(ba - 0.025) * blen, iy + Math.sin(ba - 0.025) * blen);
    ctx.lineTo(ix + Math.cos(ba + 0.025) * blen, iy + Math.sin(ba + 0.025) * blen);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Reflejo de la luna (alpha por línea, sin crear colores nuevos)
    ctx.fillStyle = 'rgb(205,225,255)';
    for (let y = hz + 2; y < h; y += 3) {
      const d = (y - hz) / (h - hz);
      const spread = moonR * (0.5 + d * 4.5);
      for (let k = 0; k < 3; k++) {
        const ph = Math.sin(t * 1.4 + y * 0.09 + k * 2.1);
        const len = spread * (0.15 + 0.35 * Math.abs(Math.sin(t * 0.9 + y * 0.13 + k)));
        const x0 = moonX + Math.sin(y * 0.05 + k * 4.0 + t * 0.6) * spread * 0.8;
        ctx.globalAlpha = (1 - d) * 0.42 * (0.5 + 0.5 * ph);
        ctx.fillRect(x0 - len / 2, y, len, 1.4);
      }
    }
    // reflejo rosa del antro lejano
    ctx.fillStyle = 'rgb(255,110,200)';
    for (let y = hz + 2; y < hz + (h - hz) * 0.35; y += 4) {
      const d = (y - hz) / ((h - hz) * 0.35);
      ctx.globalAlpha = (1 - d) * 0.25 * (0.6 + 0.4 * Math.sin(t * 2 + y * 0.3));
      const len = unit * 0.02 * (1 + d * 2);
      ctx.fillRect(ix + Math.sin(y * 0.2 + t) * len * 0.5 - len / 2, y, len, 1.2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Playa y espuma que va y viene
    const sx = mx * -26;
    const shore = (off) => {
      ctx.beginPath();
      ctx.moveTo(-40, h * 0.92 + off);
      ctx.bezierCurveTo(w * 0.25 + sx, h * 0.88 + off, w * 0.55 + sx, h * 0.96 + off, w + 40, h * 0.91 + off);
    };
    const lap = Math.sin(t * 0.9);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(190,220,255,${0.18 + 0.12 * lap})`;
    shore(-4 - lap * 3);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(190,220,255,${0.1 + 0.08 * Math.sin(t * 0.9 + 1.5)})`;
    shore(-11 - Math.sin(t * 0.9 + 1.5) * 4);
    ctx.stroke();
    ctx.fillStyle = '#010309';
    shore(0);
    ctx.lineTo(w + 40, h);
    ctx.lineTo(-40, h);
    ctx.closePath();
    ctx.fill();

    // Dos palmeras que enmarcan. Su balanceo es lento, así que se redibujan en una
    // capa propia un cuadro sí y otro no; el resto del tiempo se reutiliza la capa.
    const ph = Math.min(h, w * (portrait ? 1.3 : 0.95));
    const px = mx * -30, py = my * -10;
    const scale = ctx.getTransform().a || 1;
    if (!S.palms) {
      S.palms = document.createElement('canvas');
      S.palms.width = Math.round(w * scale);
      S.palms.height = Math.round(h * scale);
      S.pctx = S.palms.getContext('2d');
      S.pframe = 0;
    }
    if (S.pframe++ % 2 === 0 || reduceMotion) {
      const g = S.pctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, S.palms.width, S.palms.height);
      g.setTransform(scale, 0, 0, scale, 0, 0);
      drawPalm(g, { x: w * (portrait ? -0.06 : 0.05) + px, y: h * 1.03 + py, h: ph * (portrait ? 0.62 : 0.82), lean: 0.24, t, seed: 3, fronds: 9, rim: 'rgba(120,170,255,0.2)', rimSide: 'left' });
      drawPalm(g, { x: w * (portrait ? 1.06 : 1.02) + px, y: h * 1.04 + py, h: ph * (portrait ? 0.5 : 0.62), lean: -0.28, t, seed: 5, fronds: 9 });
    }
    ctx.drawImage(S.palms, 0, 0, w, h);

    // Luciérnagas
    if (!S.flies) {
      const R = rng(5);
      S.flies = Array.from({ length: 22 }, () => ({ x: R(), y: R(), s: 0.01 + R() * 0.03, p: R() * TAU, r: 0.8 + R() * 1.6 }));
    }
    ctx.globalCompositeOperation = 'lighter';
    const fs = glowSprite('69,243,255');
    for (const f of S.flies) {
      const fy = ((f.y - t * f.s) % 1 + 1) % 1;
      const fx = f.x * w + Math.sin(t * 0.8 + f.p) * 24 + px * 0.6;
      const a = (0.4 + 0.6 * Math.sin(t * 2 + f.p)) * Math.sin(fy * Math.PI) * 0.45;
      if (a <= 0) continue;
      const r = f.r * 7;
      ctx.globalAlpha = a;
      ctx.drawImage(fs, fx - r, h * 0.55 + fy * h * 0.45 - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- ZONAS DEL ANTRO ---------- */

  // 01 · La Entrada
  function entrada(ctx, w, h, t, S) {
    const pulse = TE.pulse();
    const floorY = h * 0.78;
    const cx = w * 0.5;
    ctx.fillStyle = linear(ctx, 0, 0, 0, floorY, [[0, '#030820'], [1, '#0a1840']]);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = 0; x < w; x += 42) ctx.fillRect(x, 0, 1, floorY);

    const dw = Math.min(w * 0.22, h * 0.32), dh = h * 0.46, top = floorY - dh;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx, floorY - dh * 0.5, Math.max(w, h) * 0.55, '255,79,180', 0.2 + pulse * 0.14);
    glow(ctx, cx, top, w * 0.4, '69,243,255', 0.1);
    ctx.globalCompositeOperation = 'source-over';

    // Puerta en arco con luz interior
    const arch = () => {
      ctx.beginPath();
      ctx.moveTo(cx - dw / 2, floorY);
      ctx.lineTo(cx - dw / 2, top + dw / 2);
      ctx.arc(cx, top + dw / 2, dw / 2, Math.PI, 0);
      ctx.lineTo(cx + dw / 2, floorY);
      ctx.closePath();
    };
    arch();
    ctx.fillStyle = linear(ctx, 0, top, 0, floorY, [[0, '#ffd9ef'], [0.45, `rgba(255,110,196,${0.85 + pulse * 0.15})`], [1, '#6a1d9a']]);
    ctx.fill();
    ctx.save();
    ctx.translate(0, 0);
    ctx.strokeStyle = '#45f3ff';
    ctx.globalAlpha = flicker(t, 1.3);
    ctx.beginPath();
    ctx.moveTo(cx - dw / 2 - 14, floorY);
    ctx.lineTo(cx - dw / 2 - 14, top + dw / 2);
    ctx.arc(cx, top + dw / 2, dw / 2 + 14, Math.PI, 0);
    ctx.lineTo(cx + dw / 2 + 14, floorY);
    glowStroke(ctx, 3);
    ctx.restore();

    neonText(ctx, 'EL CLUB', cx, top - h * 0.08, Math.min(w, h) * 0.075, '#ffe6f5', '#ff4fb4', flicker(t, 4.4));

    // Piso con luz derramada
    ctx.fillStyle = linear(ctx, 0, floorY, 0, h, [[0, '#071231'], [1, '#02050f']]);
    ctx.fillRect(0, floorY, w, h - floorY);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = linear(ctx, 0, floorY, 0, h, [[0, 'rgba(255,79,180,0.4)'], [1, 'rgba(255,79,180,0)']]);
    ctx.beginPath();
    ctx.moveTo(cx - dw / 2, floorY);
    ctx.lineTo(cx + dw / 2, floorY);
    ctx.lineTo(cx + dw * 1.6, h);
    ctx.lineTo(cx - dw * 1.6, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Palmeras en maceta
    slowLayer(S, 'palms', ctx, w, h, (g) => {
      drawPalm(g, { x: cx - dw * 1.35, y: floorY, h: h * 0.42, lean: -0.12, t, seed: 51, color: '#02061a', fronds: 9 });
      drawPalm(g, { x: cx + dw * 1.35, y: floorY, h: h * 0.4, lean: 0.12, t, seed: 53, color: '#02061a', fronds: 9 });
    });

    // La fila y el cadenero
    const beat = TE.beat();
    const unit = h * 0.24;
    const line = [];
    for (let i = 0; i < 6; i++) {
      const x = cx - dw * 1.05 - i * unit * 0.5;
      if (x < -unit) break;
      line.push([x, floorY + h * 0.06, unit * (0.95 + (i % 2) * 0.08), Math.sin((beat + i * 0.23) * TAU) * 0.3, false]);
    }
    drawCrowd(ctx, line, '#01030b');
    drawCrowd(ctx, [[cx + dw * 0.95, floorY + h * 0.08, unit * 1.25, 0, false]], '#01020a');

    // Cordón de terciopelo
    const ry = floorY + h * 0.1;
    const lx = cx - dw * 0.85, rx = cx + dw * 0.55;
    ctx.strokeStyle = '#b3165e';
    ctx.lineWidth = Math.max(4, h * 0.012);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lx, ry - h * 0.08);
    ctx.quadraticCurveTo((lx + rx) / 2, ry + h * 0.02, rx, ry - h * 0.08);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,170,215,0.45)';
    ctx.lineWidth = Math.max(1, h * 0.003);
    ctx.stroke();
    [lx, rx].forEach((x) => {
      ctx.fillStyle = linear(ctx, x - 4, 0, x + 4, 0, [[0, '#6c5124'], [0.5, '#f1d48c'], [1, '#6c5124']]);
      ctx.fillRect(x - h * 0.008, ry - h * 0.09, h * 0.016, h * 0.13);
      ctx.beginPath();
      ctx.arc(x, ry - h * 0.095, h * 0.014, 0, TAU);
      ctx.fill();
    });
  }

  // 02 · La Pista
  function pista(ctx, w, h, t, S) {
    const pulse = TE.pulse();
    const beat = TE.beat();
    const y0 = h * 0.46;
    const cx = w * 0.5;
    ctx.fillStyle = linear(ctx, 0, 0, 0, y0, [[0, '#02030c'], [1, '#081236']]);
    ctx.fillRect(0, 0, w, h);

    // Cabina del DJ
    ctx.fillStyle = '#01020a';
    ctx.fillRect(cx - w * 0.14, y0 - h * 0.09, w * 0.28, h * 0.09);
    ctx.fillStyle = `rgba(69,243,255,${0.6 + pulse * 0.4})`;
    ctx.fillRect(cx - w * 0.14, y0 - h * 0.09, w * 0.28, 2);
    drawPerson(ctx, cx, y0 - h * 0.09, h * 0.12, Math.sin(beat * TAU) * 0.6, '#01020a', false);
    // Bocinas
    [-1, 1].forEach((d) => {
      const sx = cx + d * w * 0.36;
      ctx.fillStyle = '#01020a';
      ctx.fillRect(sx - w * 0.05, y0 - h * 0.28, w * 0.1, h * 0.28);
      ctx.strokeStyle = 'rgba(90,140,255,0.35)';
      ctx.lineWidth = 1.5;
      [0.2, 0.62].forEach((k, i) => {
        ctx.beginPath();
        ctx.arc(sx, y0 - h * 0.28 * (1 - k), w * (i ? 0.034 : 0.022) * (1 + pulse * 0.08), 0, TAU);
        ctx.stroke();
      });
    });

    // Haces
    ctx.globalCompositeOperation = 'lighter';
    [['69,243,255', 0, 0], ['255,79,180', 1, 2], ['90,140,255', 0.5, 4]].forEach((b) => {
      const ox = w * b[1];
      const base = b[1] === 0 ? 0.35 : b[1] === 1 ? Math.PI - 0.35 : Math.PI / 2;
      beam(ctx, ox, -10, base + Math.sin(t * 0.8 + b[2]) * 0.45, h * 1.3, 0.05, b[0], 0.22 + pulse * 0.15);
    });
    ctx.globalCompositeOperation = 'source-over';

    // Piso en perspectiva
    const rows = 9, cols = 12;
    const X = (z, c) => cx + (c / cols - 0.5) * w * (0.75 + 2.4 * z);
    const Y = (z) => y0 + (h - y0) * z * z;
    const palette = ['rgb(69,243,255)', 'rgb(90,140,255)', 'rgb(255,79,180)'];
    const LV = 24;
    const tiles = new Map();
    for (let r = 0; r < rows; r++) {
      const z0 = r / rows, z1 = (r + 1) / rows;
      for (let c = 0; c < cols; c++) {
        const v = Math.sin(c * 0.9 + r * 1.3 - t * 2.4) + Math.sin(c * 0.4 - r * 0.7 + t * 1.1) + pulse * 0.8;
        const lit = Math.max(0, v - 0.6) / 2.2;
        const key = ((r + c) % 3) * 100 + Math.round((0.06 + lit * 0.75) * LV);
        let path = tiles.get(key);
        if (!path) tiles.set(key, (path = new Path2D()));
        path.moveTo(X(z0, c), Y(z0));
        path.lineTo(X(z0, c + 1), Y(z0));
        path.lineTo(X(z1, c + 1), Y(z1));
        path.lineTo(X(z1, c), Y(z1));
        path.closePath();
      }
    }
    tiles.forEach((path, key) => {
      ctx.fillStyle = palette[Math.floor(key / 100)];
      ctx.globalAlpha = Math.min(1, (key % 100) / LV);
      ctx.fill(path);
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(2,4,14,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let r = 0; r <= rows; r++) {
      ctx.moveTo(X(r / rows, 0), Y(r / rows));
      ctx.lineTo(X(r / rows, cols), Y(r / rows));
    }
    for (let c = 0; c <= cols; c++) {
      ctx.moveTo(X(0, c), Y(0));
      ctx.lineTo(X(1, c), Y(1));
    }
    ctx.stroke();

    // Bola disco
    const bx = cx, by = h * 0.15, br = Math.min(w, h) * 0.075;
    ctx.strokeStyle = 'rgba(200,220,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.lineTo(bx, by - br);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#1c2a4f';
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    const tile = br / 5;
    const mirrors = new Map();
    const off = ((t * 0.6 * tile) % tile);
    for (let gy = -5; gy < 5; gy++) {
      for (let gx = -6; gx < 6; gx++) {
        const tx = bx + gx * tile + off, ty = by + gy * tile;
        const lum = 0.5 + 0.5 * Math.sin(gx * 1.7 + gy * 2.3 + t * 3);
        const key = (lum > 0.85 ? 100 : 0) + Math.round((0.35 + lum * 0.6) * 12);
        let path = mirrors.get(key);
        if (!path) mirrors.set(key, (path = new Path2D()));
        path.rect(tx + 0.6, ty + 0.6, tile - 1.2, tile - 1.2);
      }
    }
    mirrors.forEach((path, key) => {
      ctx.fillStyle = key >= 100 ? 'rgb(230,250,255)' : 'rgb(120,150,210)';
      ctx.globalAlpha = Math.min(1, (key % 100) / 12);
      ctx.fill(path);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, bx, by, br * 3, '180,220,255', 0.2 + pulse * 0.15);
    // Puntos de luz girando por el salón
    for (let i = 0; i < 46; i++) {
      const a = i * 2.39996 + t * 0.35;
      const d = 0.2 + ((i * 0.618) % 1) * 0.9;
      const px = bx + Math.cos(a) * w * 0.6 * d;
      const py = by + Math.sin(a) * h * 0.55 * d + h * 0.1;
      glow(ctx, px, py, 5 + (i % 3) * 2, i % 4 ? '200,235,255' : '255,120,200', 0.7);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Gente bailando
    const n = Math.max(9, Math.round(w / 70));
    const crowd = [];
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (w / n) + Math.sin(i * 7.1) * 14;
      const ph = (beat + i * 0.137) % 1;
      crowd.push([x, h + h * 0.05, h * (0.24 + ((i * 37) % 7) * 0.012), Math.sin(ph * TAU) * 0.7, i % 3 === 0]);
    }
    drawCrowd(ctx, crowd, '#01020a');
    ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 'rgba(40,80,170,0.1)'], [0.6, 'rgba(40,80,170,0)'], [1, 'rgba(1,2,10,0.4)']]);
    ctx.fillRect(0, 0, w, h);
  }

  // 03 · La Barra
  function barra(ctx, w, h, t, S) {
    const pulse = TE.pulse();
    ctx.fillStyle = '#040a1d';
    ctx.fillRect(0, 0, w, h);
    const top = h * 0.1, bot = h * 0.64;
    ctx.fillStyle = linear(ctx, 0, top, 0, bot, [[0, '#0b2b66'], [0.5, '#1660b8'], [1, '#0a2457']]);
    ctx.fillRect(0, top, w, bot - top);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, w * 0.5, (top + bot) / 2, w * 0.6, '69,243,255', 0.22 + pulse * 0.08);
    ctx.globalCompositeOperation = 'source-over';

    // Repisas con botellas a contraluz
    if (!S.bottles) {
      const R = rng(77);
      S.bottles = [0, 1, 2].map(() => {
        const arr = [];
        let x = 6;
        while (x < 1000) {
          const bw = 14 + R() * 18;
          arr.push({ x, w: bw, h: 0.55 + R() * 0.45, neck: 0.3 + R() * 0.25, rim: R() < 0.18 ? (R() < 0.5 ? '#45f3ff' : '#ff4fb4') : null });
          x += bw + 4 + R() * 10;
        }
        return arr;
      });
    }
    const shelfGap = (bot - top) / 3;
    const k = w / 1000;
    S.bottles.forEach((row, r) => {
      const sy = top + shelfGap * (r + 1) - 4;
      ctx.fillStyle = 'rgba(2,6,18,0.95)';
      ctx.fillRect(0, sy, w, 5);
      row.forEach((b) => {
        const bx = b.x * k, bw = b.w * k, bh = shelfGap * 0.78 * b.h;
        ctx.fillStyle = '#020511';
        const nw = bw * 0.32, nh = bh * b.neck;
        ctx.beginPath();
        ctx.moveTo(bx, sy);
        ctx.lineTo(bx, sy - bh + nh);
        ctx.quadraticCurveTo(bx, sy - bh + nh * 0.6, bx + (bw - nw) / 2, sy - bh + nh * 0.45);
        ctx.lineTo(bx + (bw - nw) / 2, sy - bh);
        ctx.lineTo(bx + (bw + nw) / 2, sy - bh);
        ctx.lineTo(bx + (bw + nw) / 2, sy - bh + nh * 0.45);
        ctx.quadraticCurveTo(bx + bw, sy - bh + nh * 0.6, bx + bw, sy - bh + nh);
        ctx.lineTo(bx + bw, sy);
        ctx.closePath();
        ctx.fill();
        if (b.rim) {
          ctx.strokeStyle = b.rim;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });
    });
    // Tira de neón
    ctx.save();
    ctx.strokeStyle = '#ff4fb4';
    ctx.globalAlpha = flicker(t, 6.2);
    ctx.beginPath();
    ctx.moveTo(0, top - 2);
    ctx.lineTo(w, top - 2);
    glowStroke(ctx, 3);
    ctx.restore();
    neonText(ctx, 'coctelería', w * 0.5, top * 0.52, Math.min(w, h) * 0.055, '#e7fdff', '#45f3ff', flicker(t, 9));

    // Barman agitando la coctelera
    const bxm = w * 0.3;
    drawPerson(ctx, bxm, h * 0.7, h * 0.3, 0, '#01030b', false);
    const shake = Math.sin(t * 14) * h * 0.02;
    ctx.fillStyle = '#01030b';
    ctx.save();
    ctx.translate(bxm + h * 0.1, h * 0.46 + shake);
    ctx.rotate(-0.5);
    ctx.fillRect(-h * 0.015, -h * 0.05, h * 0.03, h * 0.1);
    ctx.restore();
    ctx.strokeStyle = '#01030b';
    ctx.lineWidth = h * 0.025;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bxm + h * 0.06, h * 0.55);
    ctx.lineTo(bxm + h * 0.1, h * 0.47 + shake);
    ctx.stroke();

    // Barra (mostrador)
    const cy = h * 0.68;
    ctx.fillStyle = linear(ctx, 0, cy, 0, cy + h * 0.05, [[0, '#2a5fb0'], [0.15, '#0a1838'], [1, '#050c20']]);
    ctx.fillRect(0, cy, w, h * 0.05);
    ctx.fillStyle = '#030716';
    ctx.fillRect(0, cy + h * 0.05, w, h - cy);
    ctx.fillStyle = 'rgba(69,243,255,0.06)';
    for (let x = 12; x < w; x += 26) ctx.fillRect(x, cy + h * 0.06, 2, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const rx = ((i * 0.23 + t * 0.02) % 1) * w;
      ctx.fillStyle = 'rgba(160,220,255,0.12)';
      ctx.fillRect(rx, cy + 2, w * 0.08, 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Copa de cóctel
    const gx = w * 0.68, gy = cy, gs = h * 0.17;
    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#bff9ff';
    ctx.fillStyle = 'rgba(255,79,180,0.55)';
    ctx.beginPath();
    ctx.moveTo(gx - gs * 0.36, gy - gs);
    ctx.lineTo(gx + gs * 0.36, gy - gs);
    ctx.lineTo(gx, gy - gs * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx, gy - gs * 0.55);
    ctx.lineTo(gx, gy - 2);
    ctx.moveTo(gx - gs * 0.16, gy - 1);
    ctx.lineTo(gx + gs * 0.16, gy - 1);
    ctx.stroke();
    ctx.strokeStyle = '#7dffb0';
    ctx.beginPath();
    ctx.arc(gx + gs * 0.3, gy - gs * 1.02, gs * 0.1, 0, TAU);
    ctx.stroke();
    ctx.restore();
    // Burbujas
    for (let i = 0; i < 8; i++) {
      const p = (t * 0.4 + i / 8) % 1;
      ctx.fillStyle = `rgba(255,220,240,${0.6 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(gx + Math.sin(i * 3 + t * 2) * gs * 0.12 * (1 - p), gy - gs * 0.62 - p * gs * 0.32, 1.4, 0, TAU);
      ctx.fill();
    }

    // Bokeh
    if (!S.bokeh) {
      const R = rng(19);
      S.bokeh = Array.from({ length: 20 }, () => ({ x: R(), y: R(), r: 8 + R() * 34, c: R() < 0.5 ? '69,243,255' : R() < 0.5 ? '255,79,180' : '120,160,255', s: R() * TAU }));
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const b of S.bokeh) {
      const bx = ((b.x + t * 0.008) % 1) * w;
      const by = b.y * h + Math.sin(t * 0.5 + b.s) * 10;
      ctx.fillStyle = `rgba(${b.c},${0.05 + 0.05 * Math.sin(t + b.s)})`;
      ctx.beginPath();
      ctx.arc(bx, by, b.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 04 · El VIP
  function vip(ctx, w, h, t, S) {
    const pulse = TE.pulse();
    ctx.fillStyle = '#07041a';
    ctx.fillRect(0, 0, w, h);
    // Cortinas
    for (let x = 0; x < w; x += 22) {
      const k = 0.5 + 0.5 * Math.sin(x * 0.11 + Math.sin(t * 0.4 + x * 0.01) * 0.6);
      ctx.fillStyle = `rgba(${40 + k * 40},${12 + k * 10},${70 + k * 50},1)`;
      ctx.fillRect(x, 0, 23, h * 0.75);
    }
    ctx.fillStyle = linear(ctx, 0, 0, 0, h * 0.75, [[0, 'rgba(255,200,120,0.18)'], [0.25, 'rgba(255,200,120,0)'], [1, 'rgba(4,2,14,0.85)']]);
    ctx.fillRect(0, 0, w, h * 0.75);
    ctx.fillStyle = '#12061f';
    ctx.fillRect(0, 0, w, h * 0.05);

    neonText(ctx, 'VIP', w * 0.78, h * 0.18, Math.min(w, h) * 0.13, '#ffe4f5', '#ff4fb4', flicker(t, 2.2));

    // Sillón circular capitonado
    const cx = w * 0.45, cy = h * 0.78, rw = w * 0.36, rh = h * 0.42;
    ctx.fillStyle = '#0c0520';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, Math.PI, 0);
    ctx.lineTo(cx + rw, h);
    ctx.lineTo(cx - rw, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,79,180,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,140,210,0.12)';
    for (let a = 0.12; a < 0.9; a += 0.08) {
      for (let r = 0.55; r < 0.95; r += 0.12) {
        const ang = Math.PI + a * Math.PI;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * rw * r, cy + Math.sin(ang) * rh * r, 2, 0, TAU);
        ctx.fill();
      }
    }
    // Invitados
    const beat = TE.beat();
    [[-0.55, 0], [-0.25, 0.3], [0.5, 0.6]].forEach((g, i) => {
      drawPerson(ctx, cx + g[0] * rw, cy + h * 0.02, h * 0.26, Math.sin((beat + g[1]) * TAU) * 0.25, '#030110', false);
    });

    // Mesa con botella y bengala
    const tx = cx + rw * 0.1, ty = h * 0.86;
    ctx.fillStyle = '#020108';
    ctx.beginPath();
    ctx.ellipse(tx, ty, w * 0.15, h * 0.045, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,150,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const bh = h * 0.16, bw = h * 0.035;
    ctx.fillStyle = '#020108';
    ctx.fillRect(tx - bw / 2, ty - bh, bw, bh * 0.7);
    ctx.fillRect(tx - bw * 0.18, ty - bh * 1.25, bw * 0.36, bh * 0.6);
    const sx = tx, sy = ty - bh * 1.3;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, sx, sy, h * 0.25, '255,210,140', 0.3 + Math.random() * 0.08);
    if (!S.sparks) S.sparks = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 60 + Math.random() * 140;
      S.sparks.push({ x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, age: 0 });
    }
    const dt = Math.min(0.05, t - (S.last || t));
    S.last = t;
    S.sparks = S.sparks.filter((p) => p.age < p.life);
    for (const p of S.sparks) {
      p.age += dt;
      p.vy += 260 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.age / p.life;
      ctx.fillStyle = `rgba(255,${200 + k * 55},${150 + k * 90},${k})`;
      ctx.fillRect(p.x, p.y, 2, 2);
    }
    if (S.sparks.length > 400) S.sparks.splice(0, S.sparks.length - 400);
    glow(ctx, w * 0.78, h * 0.18, w * 0.3, '255,79,180', 0.12 + pulse * 0.12);
    ctx.globalCompositeOperation = 'source-over';

    // Cordón VIP al frente
    const ry = h * 0.95;
    ctx.strokeStyle = '#a3124f';
    ctx.lineWidth = Math.max(5, h * 0.014);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, ry - h * 0.07);
    ctx.quadraticCurveTo(w * 0.5, ry + h * 0.04, w + 10, ry - h * 0.07);
    ctx.stroke();
  }

  // 05 · La Terraza
  function terraza(ctx, w, h, t, S) {
    const hz = h * 0.62;
    ctx.fillStyle = linear(ctx, 0, 0, 0, hz, [[0, '#050f2a'], [0.5, '#173b7c'], [0.8, '#6684c4'], [0.94, '#e49bc4'], [1, '#ffd0ae']]);
    ctx.fillRect(0, 0, w, hz + 1);
    drawStars(ctx, S, w, h, t, hz * 0.4, 4000);
    const sunX = w * 0.62;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, sunX, hz, w * 0.5, '255,170,150', 0.35);
    glow(ctx, sunX, hz, w * 0.15, '255,230,200', 0.6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff1dd';
    ctx.beginPath();
    ctx.arc(sunX, hz + 2, Math.min(w, h) * 0.05, Math.PI, 0);
    ctx.fill();

    // Mar con reflejo del amanecer
    ctx.fillStyle = linear(ctx, 0, hz, 0, h, [[0, '#4a64a8'], [0.3, '#1a3270'], [1, '#081634']]);
    ctx.fillRect(0, hz, w, h - hz);
    ctx.globalCompositeOperation = 'lighter';
    for (let y = hz + 2; y < h * 0.8; y += 3) {
      const d = (y - hz) / (h * 0.8 - hz);
      const sp = w * 0.04 * (1 + d * 3);
      const len = sp * (0.3 + 0.5 * Math.abs(Math.sin(t + y * 0.15)));
      ctx.fillStyle = 'rgb(255,200,180)';
      ctx.globalAlpha = (1 - d) * 0.45;
      ctx.fillRect(sunX + Math.sin(y * 0.07 + t * 0.8) * sp - len / 2, y, len, 1.3);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Aves
    ctx.strokeStyle = '#0a1532';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const bx = ((t * 0.02 + i * 0.13) % 1.2) * w - w * 0.1;
      const by = h * (0.28 + i * 0.05) + Math.sin(t + i) * 6;
      const f = Math.sin(t * 6 + i * 2) * 4;
      ctx.beginPath();
      ctx.moveTo(bx - 8, by - f);
      ctx.quadraticCurveTo(bx - 3, by - 4, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 4, bx + 8, by - f);
      ctx.stroke();
    }

    // Terraza y barandal
    const deck = h * 0.84;
    ctx.fillStyle = '#030716';
    ctx.fillRect(0, deck, w, h - deck);
    ctx.fillRect(0, h * 0.74, w, 4);
    for (let x = 0; x < w; x += 46) ctx.fillRect(x, h * 0.74, 4, deck - h * 0.74);

    // Pareja mirando el amanecer
    drawCrowd(ctx, [[w * 0.42, deck + 2, h * 0.22, 0, false], [w * 0.47, deck + 2, h * 0.205, 0, false]], '#030716');

    slowLayer(S, 'palms', ctx, w, h, (g) => {
      drawPalm(g, { x: w * 0.05, y: h * 1.02, h: h * 0.85, lean: 0.28, t, seed: 61 });
      drawPalm(g, { x: w * 0.98, y: h * 1.02, h: h * 0.7, lean: -0.3, t, seed: 63 });
    });

    // Foquitos colgantes
    ctx.strokeStyle = 'rgba(10,18,40,0.9)';
    ctx.lineWidth = 1.2;
    [[0.06, 0.12, 0.1], [0.04, 0.2, 0.08]].forEach((row, ri) => {
      const y1 = h * row[0], y2 = h * row[1], sag = h * row[2];
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.quadraticCurveTo(w / 2, y2 + sag, w, y1);
      ctx.stroke();
      const n = 14;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgb(255,236,200)';
      for (let i = 1; i < n; i++) {
        const s = i / n;
        const x = w * s;
        const y = (1 - s) * (1 - s) * y1 + 2 * (1 - s) * s * (y2 + sag) + s * s * y1 + 6;
        const a = 0.55 + 0.45 * Math.sin(t * 2 + i * 1.3 + ri);
        glow(ctx, x, y, 16, '255,210,150', 0.55 * a);
        ctx.globalAlpha = 0.8 * a;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  /* ---------- DEVELOPING FANTASY: luz que fluye detrás de las letras ---------- */

  function fantasyLight(ctx, w, h, t) {
    const pulse = TE.pulse();
    ctx.fillStyle = linear(ctx, 0, 0, w, h, [[0, '#0b2260'], [0.5, '#123c8e'], [1, '#0a1f57']]);
    ctx.fillRect(0, 0, w, h);
    const big = Math.max(w, h);
    ctx.globalCompositeOperation = 'lighter';
    const blobs = [
      ['69,243,255', 0.25, 0.35, 0.22, 0.25, 0.21, 0.55],
      ['255,79,180', 0.75, 0.6, 0.2, 0.22, 0.17, 0.5],
      ['90,120,255', 0.5, 0.5, 0.3, 0.3, 0.12, 0.6],
      ['69,243,255', 0.8, 0.2, 0.18, 0.2, 0.25, 0.4],
      ['180,110,255', 0.2, 0.8, 0.2, 0.15, 0.19, 0.45],
    ];
    blobs.forEach((b, i) => {
      const x = w * (b[1] + b[3] * Math.sin(t * b[5] + i * 1.7));
      const y = h * (b[2] + b[4] * Math.cos(t * b[5] * 1.3 + i * 2.3));
      glow(ctx, x, y, big * b[6] * (1 + pulse * 0.1), b[0], 0.55 + pulse * 0.15);
    });
    // listones de luz
    for (let k = 0; k < 3; k++) {
      const base = h * (0.28 + k * 0.22);
      const path = () => {
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 12) {
          const y = base + Math.sin(x * 0.0035 + t * (0.5 + k * 0.15) + k * 2) * h * 0.09 + Math.sin(x * 0.009 - t * 0.8 + k) * h * 0.025;
          x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      };
      path();
      ctx.strokeStyle = 'rgba(160,230,255,0.10)';
      ctx.lineWidth = h * 0.06;
      ctx.stroke();
      path();
      ctx.strokeStyle = `rgba(230,250,255,${0.35 + pulse * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // Las letras de DEVELOPING FANTASY recortan la luz dentro del canvas
  // (antes era una mezcla de color en CSS sobre toda la pantalla, mucho más cara).
  function fantasyMask(S, w, h, scale, fs) {
    const font = `900 ${Math.round(Math.min(w * 0.2, h * 0.3))}px "Big Shoulders Display", "Anton", Impact, sans-serif`;
    const ready = !document.fonts || document.fonts.check(font);
    const key = `${fs.toFixed(3)}|${ready}|${w}|${h}|${scale}`;
    if (S.maskKey === key) return S.mask;
    if (!S.mask) S.mask = document.createElement('canvas');
    const c = S.mask;
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.scale(fs, fs);
    const size = Math.round(Math.min(w * 0.2, h * 0.3));
    g.font = font;
    try { g.letterSpacing = '-0.01em'; } catch (e) { /* opcional */ }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000';
    g.fillText('DEVELOPING', 0, -size * 0.44);
    g.fillText('FANTASY', 0, size * 0.44);
    S.maskKey = key;
    return c;
  }

  function fantasy(ctx, w, h, t, S) {
    const scale = ctx.getTransform().a || 1;
    const k = 0.32;
    if (!S.low) {
      S.low = document.createElement('canvas');
      S.low.width = Math.max(2, Math.round(w * k));
      S.low.height = Math.max(2, Math.round(h * k));
      S.lctx = S.low.getContext('2d');
    }
    // 1) la luz se pinta en una capa chica (es difusa) y se estira
    S.lctx.setTransform(k, 0, 0, k, 0, 0);
    fantasyLight(S.lctx, w, h, t);
    ctx.drawImage(S.low, 0, 0, w, h);
    drawStars(ctx, S, w, h, t, h, 1800);
    // 2) se recorta con las letras y 3) se rellena el resto con azul noche
    const fs = TE.fantasyScale || 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(fantasyMask(S, w, h, scale, fs), 0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#030817';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }


  const RENDERERS = { hero, fantasy, entrada, pista, barra, vip, terraza };

  /* ---------- motor: un canvas = una escena ---------- */

  class Scene {
    constructor(canvas, name, opts) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.render = RENDERERS[name];
      this.opts = opts || {};
      this.S = {};
      this.visible = false;
      this.t0 = performance.now() - Math.random() * 4000;
      this.loop = this.loop.bind(this);

      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
      this.io = new IntersectionObserver(
        (entries) => {
          // tocar el borde no cuenta: solo se anima si de verdad se ve algo
          const e = entries[entries.length - 1];
          const v = e.isIntersecting && e.intersectionRect.height > 1 && e.intersectionRect.width > 1;
          if (v && !this.visible) {
            this.visible = true;
            if (!reduceMotion) this.raf = requestAnimationFrame(this.loop);
            else this.draw(performance.now());
          } else if (!v) {
            this.visible = false;
            cancelAnimationFrame(this.raf);
          }
        },
        { rootMargin: '0px', threshold: [0, 0.002, 0.01, 0.05] }
      );
      this.io.observe(canvas);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(this.raf);
        else if (this.visible && !reduceMotion) this.raf = requestAnimationFrame(this.loop);
      });
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr || 1.75) * (this.quality || 1);
      this.c.width = Math.round(r.width * dpr);
      this.c.height = Math.round(r.height * dpr);
      this.w = r.width;
      this.h = r.height;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.S = {};
      this.draw(performance.now());
    }

    draw(now) {
      if (!this.w) return;
      const t = reduceMotion ? 12 : (now - this.t0) / 1000;
      this.ctx.save();
      this.render(this.ctx, this.w, this.h, t, this.S, this);
      this.ctx.restore();
      if (this.post) {
        this.ctx.save();
        this.post(this.ctx, this.w, this.h);
        this.ctx.restore();
      }
    }

    set(name) {
      if (!RENDERERS[name]) return;
      this.render = RENDERERS[name];
      this.S = {};
      this.draw(performance.now());
    }

    loop(now) {
      if (!this.visible || document.hidden) return;
      // Calidad adaptativa: si los cuadros tardan, baja la resolución del canvas
      if (this.last) {
        const dt = now - this.last;
        if (dt < 200) {
          this.avg = this.avg ? this.avg * 0.92 + dt * 0.08 : dt;
          this.frames = (this.frames || 0) + 1;
          if (this.frames > 45 && this.avg > 24) {
            if ((this.quality || 1) > 0.55) {
              this.quality = (this.quality || 1) * 0.8;
              this.resize();
            } else {
              // ya en la calidad mínima: dibuja un cuadro sí y otro no
              this.halfRate = true;
            }
            this.frames = 0;
            this.avg = 0;
          }
        }
      }
      this.last = now;
      this.tick = !this.tick;
      if (!this.halfRate || this.tick) this.draw(now);
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  // Portal de la luna: la noche con un hueco en forma de luna creciente, dibujado
  // como vector dentro del canvas (antes era una máscara SVG a pantalla completa).
  const CRESCENT = 'M61.781 52.281A12 12 0 1 1 47.719 38.219A10 10 0 0 0 61.781 52.281Z';
  let crescentPath = null;
  TE.drawPortal = function (ctx, w, h) {
    const P = TE.portal;
    if (!P || (P.s >= 109 && P.wave <= 0)) return;
    if (!crescentPath) crescentPath = new Path2D(CRESCENT);
    const zoom = P.zoom || 1;
    // el canvas está escalado por CSS (zoom); se compensa para dibujar en coordenadas de pantalla
    const ox = w * 0.42, oy = h * 0.55;
    ctx.translate(ox, oy);
    ctx.scale(1 / zoom, 1 / zoom);
    ctx.translate(-ox, -oy);
    const sc = Math.max(w, h) / 100;
    const vb = (s) => new DOMMatrix().translate((w - 100 * sc) / 2, (h - 100 * sc) / 2).scale(sc).translate(42, 55).scale(s).translate(-42, -55);
    const ring = new Path2D();
    ring.addPath(crescentPath, vb(P.s));
    if (P.s < 109) {
      const night = new Path2D();
      night.rect(-w, -h, w * 3, h * 3);
      night.addPath(crescentPath, vb(P.s));
      ctx.fillStyle = '#030817';
      ctx.fill(night, 'evenodd');
    }
    ctx.lineJoin = 'round';
    if (P.ring > 0) {
      ctx.strokeStyle = '#45f3ff';
      // brillo de neón en tres pasadas (sin shadowBlur)
      [[10, 0.1], [4.8, 0.25], [2, 1]].forEach(([lw, al]) => {
        ctx.lineWidth = lw * zoom;
        ctx.globalAlpha = P.ring * al;
        ctx.stroke(ring);
      });
    }
    if (P.wave > 0) {
      const wave = new Path2D();
      wave.addPath(crescentPath, vb(P.ws));
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = P.wave;
      ctx.lineWidth = 3 * zoom;
      ctx.stroke(wave);
    }
    ctx.globalAlpha = 1;
  };

  TE.mountScene = function (canvas, name, opts) {
    if (!RENDERERS[name] || !canvas.getContext) return null;
    return new Scene(canvas, name, opts);
  };
})();
