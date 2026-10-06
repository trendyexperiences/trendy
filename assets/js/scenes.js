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
    // cocos bajo la copa
    for (let k = 0; k < 3; k++) {
      const ca = Math.PI / 2 + (k - 1) * 0.7 + lean;
      const cxp = topX + Math.cos(ca) * h * 0.028, cyp = topY + h * 0.012 + Math.sin(ca) * h * 0.012;
      ctx.moveTo(cxp + h * 0.013, cyp);
      ctx.arc(cxp, cyp, h * 0.013, 0, TAU);
    }
    ctx.fill();
  }

  // Capa fija: se pinta una sola vez por tamaño y luego solo se copia.
  // (x, y, w, h) es el rectángulo donde se coloca; draw dibuja en coordenadas locales.
  function staticLayer(S, key, ctx, w, h, draw, x, y) {
    let c = S[key];
    if (!c) {
      const scale = ctx.getTransform().a || 1;
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const g = c.getContext('2d');
      g.setTransform(scale, 0, 0, scale, 0, 0);
      draw(g);
      S[key] = c;
    }
    ctx.drawImage(c, x || 0, y || 0, w, h);
  }

  // Silueta humana (de la cintura para arriba) con proporciones reales.
  // Todo va en sentido horario para rellenar muchas en una sola pasada.
  function addFigure(p, x, y, s, o) {
    o = o || {};
    const yy = y - Math.abs(o.bob || 0) * s * 0.1;
    const sw = o.wide || 1;
    p.moveTo(x - 0.3 * s * sw, y + 0.6 * s);
    p.quadraticCurveTo(x - 0.34 * s * sw, yy - 0.18 * s, x - 0.27 * s * sw, yy - 0.5 * s);
    p.quadraticCurveTo(x - 0.23 * s * sw, yy - 0.62 * s, x - 0.075 * s, yy - 0.645 * s);
    p.lineTo(x - 0.05 * s, yy - 0.74 * s);
    p.lineTo(x + 0.05 * s, yy - 0.74 * s);
    p.lineTo(x + 0.075 * s, yy - 0.645 * s);
    p.quadraticCurveTo(x + 0.23 * s * sw, yy - 0.62 * s, x + 0.27 * s * sw, yy - 0.5 * s);
    p.quadraticCurveTo(x + 0.34 * s * sw, yy - 0.18 * s, x + 0.3 * s * sw, y + 0.6 * s);
    p.closePath();
    const tilt = o.tilt || 0;
    const hx = x + tilt * s * 0.04, hy = yy - 0.86 * s;
    p.moveTo(hx + 0.1 * s, hy);
    p.ellipse(hx, hy, 0.1 * s, 0.128 * s, tilt * 0.15, 0, TAU);
    if (o.hair === 1) {
      // pelo largo
      p.moveTo(hx + 0.11 * s, hy);
      p.quadraticCurveTo(hx + 0.15 * s, yy - 0.62 * s, hx + 0.09 * s, yy - 0.55 * s);
      p.lineTo(hx - 0.09 * s, yy - 0.55 * s);
      p.quadraticCurveTo(hx - 0.15 * s, yy - 0.62 * s, hx - 0.11 * s, hy);
      p.closePath();
    } else if (o.hair === 2) {
      // chongo
      p.moveTo(hx + 0.075 * s, hy - 0.13 * s);
      p.arc(hx + 0.02 * s, hy - 0.13 * s, 0.055 * s, 0, TAU);
    }
    if (o.headphones) {
      p.moveTo(hx - 0.08 * s, hy + 0.02 * s);
      p.ellipse(hx - 0.115 * s, hy + 0.02 * s, 0.035 * s, 0.055 * s, 0, 0, TAU);
      p.moveTo(hx + 0.15 * s, hy + 0.02 * s);
      p.ellipse(hx + 0.115 * s, hy + 0.02 * s, 0.035 * s, 0.055 * s, 0, 0, TAU);
    }
    const hands = [];
    if (o.armsUp) {
      const lift = Math.sin((o.bob || 0) * Math.PI) * s * 0.06;
      for (const k of o.oneArm ? [o.oneArm] : [-1, 1]) {
        const sx = x + k * 0.22 * s, sy0 = yy - 0.58 * s;
        const ax = x + k * 0.36 * s, ay = yy - 1.24 * s - lift * k;
        p.moveTo(sx - 0.05 * s, sy0);
        p.quadraticCurveTo(x + k * 0.33 * s - 0.03 * s, yy - 0.9 * s, ax - 0.026 * s, ay);
        p.lineTo(ax + 0.026 * s, ay);
        p.quadraticCurveTo(x + k * 0.33 * s + 0.03 * s, yy - 0.9 * s, sx + 0.05 * s, sy0);
        p.closePath();
        p.moveTo(ax + 0.036 * s, ay - 0.02 * s);
        p.arc(ax, ay - 0.02 * s, 0.036 * s, 0, TAU);
        hands.push([ax, ay - 0.02 * s, s]);
      }
    }
    return hands;
  }

  // Siluetas con contraluz: una copia desplazada hacia la luz asoma como borde de color
  function fillFigures(ctx, path, base, rim, dx, dy, rimAlpha) {
    if (rim) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.globalAlpha = rimAlpha == null ? 0.8 : rimAlpha;
      ctx.fillStyle = rim;
      ctx.fill(path);
      ctx.restore();
    }
    ctx.fillStyle = base;
    ctx.fill(path);
  }

  // Haz volumétrico: halo ancho y tenue + núcleo más brillante
  function volBeam(ctx, ox, oy, angle, len, spread, rgb, a) {
    beam(ctx, ox, oy, angle, len, spread * 2.6, rgb, a * 0.35);
    beam(ctx, ox, oy, angle, len, spread, rgb, a);
  }

  // Humo: manchas de luz enormes y tenues que derivan despacio
  function haze(ctx, S, w, h, t, rgb, a, y0, y1) {
    if (!S.haze) {
      const R = rng(19);
      S.haze = Array.from({ length: 3 }, () => ({ x: R(), y: R(), r: 0.3 + R() * 0.25, s: 0.008 + R() * 0.012 }));
    }
    for (const z of S.haze) {
      const hx = (((z.x + t * z.s) % 1.4) - 0.2) * w;
      glow(ctx, hx, (y0 + (y1 - y0) * z.y) * h, z.r * w, rgb, a);
    }
  }

  // Llovizna: trazos finos que solo se notan frente a las luces
  function drizzle(ctx, S, w, h, t, a) {
    if (!S.rain) {
      const R = rng(23);
      S.rain = Array.from({ length: 80 }, () => ({ x: R() * 1.2, y: R(), l: 8 + R() * 16, s: 0.6 + R() * 0.5 }));
    }
    ctx.strokeStyle = `rgba(190,215,255,${a})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of S.rain) {
      const yy = (((d.y + t * d.s) % 1.1) - 0.05) * h;
      const xx = d.x * w - yy * 0.12;
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + d.l * 0.12, yy - d.l);
    }
    ctx.stroke();
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
    glow(ctx, x, y, r * 7, '120,170,255', 0.2);
    glow(ctx, x, y, r * 2.6, '200,225,255', 0.25);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    // disco con oscurecimiento hacia el borde, como la luna real
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, '#fbfdff');
    g.addColorStop(0.65, '#e3ecfb');
    g.addColorStop(1, '#9fb3d9');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    // mares lunares: manchas grises y suaves
    [[-0.3, -0.22, 0.42, 0.42], [0.12, -0.35, 0.3, 0.34], [0.25, 0.12, 0.4, 0.38], [-0.12, 0.28, 0.3, 0.3], [0.48, -0.05, 0.22, 0.26], [-0.48, 0.05, 0.24, 0.22]]
      .forEach((m) => glow(ctx, x + m[0] * r, y + m[1] * r, m[2] * r, '92,112,160', m[3]));
    // cráteres con borde iluminado
    const R = rng(77);
    for (let i = 0; i < 16; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * 0.85;
      const cx = x + Math.cos(a) * d * r, cy = y + Math.sin(a) * d * r, cr = r * (0.02 + R() * 0.055);
      ctx.fillStyle = 'rgba(80,96,140,0.2)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(0.5, cr * 0.28);
      ctx.beginPath();
      ctx.arc(cx + cr * 0.15, cy + cr * 0.15, cr, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
    ctx.restore();
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

    // Vía Láctea: banda diagonal de polvo de estrellas con su franja oscura
    const mw = (k) => [-M + (w + M * 2) * k, hz * 0.95 - hz * 1.05 * k];
    for (let i = 0; i < 26; i++) {
      const k = i / 25;
      const [bx, by] = mw(k);
      g.save();
      g.translate(bx, by);
      g.rotate(-Math.atan2(hz * 1.05, w + M * 2));
      g.scale(1, 0.32);
      glow(g, 0, 0, unit * (0.22 + 0.1 * Math.sin(k * 9)), i % 3 ? '110,120,200' : '160,120,210', 0.07);
      g.restore();
    }
    g.fillStyle = '#eef3ff';
    for (let i = 0; i < 900; i++) {
      const k = R();
      const [bx, by] = mw(k);
      const off = (R() + R() + R() - 1.5) * unit * 0.12;
      g.globalAlpha = 0.15 + R() * 0.5;
      g.fillRect(bx + off * 0.45, by + off, R() < 0.9 ? 0.8 : 1.4, R() < 0.9 ? 0.8 : 1.4);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 18; i++) {
      const [bx, by] = mw(i / 17);
      g.save();
      g.translate(bx, by);
      g.scale(1, 0.25);
      glow(g, 0, 0, unit * 0.06, '1,3,11', 0.45);
      g.restore();
    }

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

    // bancos de nubes: cuerpo oscuro y borde superior plateado por la luna
    const RC = rng(13);
    for (let i = 0; i < 7; i++) {
      const cx2 = -M + RC() * (w + M * 2), cy2 = hz * (0.45 + RC() * 0.45), cw = unit * (0.25 + RC() * 0.35);
      g.save();
      g.translate(cx2, cy2);
      g.scale(1, 0.12);
      glow(g, 0, 0, cw, '6,14,36', 0.75);
      g.restore();
      const toMoon = Math.max(0.2, 1 - Math.abs(cx2 - moonX) / w);
      g.save();
      g.translate(cx2, cy2 - cw * 0.05);
      g.scale(1, 0.05);
      glow(g, 0, 0, cw * 0.85, '170,200,255', 0.14 * toMoon);
      g.restore();
    }

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
    // olas en perspectiva: líneas finas que se espacian hacia el frente
    const RW = rng(29);
    for (let i = 0; i < 70; i++) {
      const k = i / 70;
      const y = hz + Math.pow(k, 1.9) * (h - hz);
      const len = (0.05 + RW() * 0.25) * w * (0.4 + k);
      const x = -M + RW() * (w + M * 2);
      g.fillStyle = RW() < 0.5 ? `rgba(150,190,255,${0.05 + k * 0.05})` : `rgba(0,4,16,${0.15 + k * 0.1})`;
      g.fillRect(x, y, len, 1 + k * 2.5);
    }
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
    ctx.fillStyle = linear(ctx, 0, h * 0.87, 0, h, [[0, '#0d1a3a'], [0.18, '#050b1d'], [1, '#010309']]);
    shore(0);
    ctx.lineTo(w + 40, h);
    ctx.lineTo(-40, h);
    ctx.closePath();
    ctx.fill();
    // brillo de la luna en la arena mojada
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(moonX + sx * 0.5, h * 0.935);
    ctx.scale(1, 0.12);
    glow(ctx, 0, 0, unit * 0.35, '120,160,240', 0.18);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

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
  // Cada zona separa lo fijo (se pinta una vez) de lo que se anima, y se apoya en
  // luz "real": fuentes con bloom, haces volumétricos con humo, superficies que
  // reflejan y siluetas con contraluz.

  const NIGHT_PALETTE = ['69,243,255', '90,120,255', '255,79,180'];

  // 01 · La Entrada — fachada de concreto, banqueta mojada, llovizna
  function entrada(ctx, w, h, t, S) {
    const pulse = TE.pulse();
    const beat = TE.beat();
    const floorY = h * 0.72;
    const cx = w * 0.5;
    const dw = Math.min(w * 0.2, h * 0.3), dh = h * 0.42, top = floorY - dh;
    const carpetW = dw * 0.5;

    staticLayer(S, 'facade', ctx, w, h, (g) => {
      // muro de concreto
      g.fillStyle = linear(g, 0, 0, 0, floorY, [[0, '#03071a'], [1, '#0a1431']]);
      g.fillRect(0, 0, w, floorY);
      const R = rng(3);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
        g.fillRect(R() * w, R() * floorY, 1 + R() * 2.5, 1 + R() * 2.5);
      }
      // juntas de los paneles
      g.fillStyle = 'rgba(0,0,0,0.4)';
      const pw = Math.max(70, w / 11);
      for (let x = ((cx - dw / 2) % pw) - pw; x < w; x += pw) g.fillRect(x, 0, 1.5, floorY);
      for (let y = floorY / 4; y < floorY; y += floorY / 4) g.fillRect(0, y, w, 1.5);
      // luces que bañan el muro desde el piso
      [[0.1, '69,243,255'], [0.3, '255,79,180'], [0.7, '255,79,180'], [0.9, '69,243,255']].forEach(([fx, col]) => {
        const x = w * fx;
        g.fillStyle = linear(g, 0, floorY, 0, floorY - h * 0.65, [[0, `rgba(${col},0.32)`], [0.5, `rgba(${col},0.08)`], [1, `rgba(${col},0)`]]);
        g.beginPath();
        g.moveTo(x - w * 0.012, floorY);
        g.lineTo(x + w * 0.012, floorY);
        g.lineTo(x + w * 0.08, floorY - h * 0.65);
        g.lineTo(x - w * 0.08, floorY - h * 0.65);
        g.closePath();
        g.fill();
        glow(g, x, floorY - 3, w * 0.025, col, 0.7);
      });
      // marquesina
      g.fillStyle = linear(g, 0, top - h * 0.05, 0, top - h * 0.025, [[0, '#1a2440'], [1, '#05080f']]);
      g.fillRect(cx - dw * 1.05, top - h * 0.05, dw * 2.1, h * 0.025);
      g.fillStyle = 'rgba(255,214,240,0.5)';
      g.fillRect(cx - dw * 1.0, top - h * 0.026, dw * 2.0, 1.5);
      // banqueta mojada
      g.fillStyle = linear(g, 0, floorY, 0, h, [[0, '#0c1735'], [0.4, '#050b1c'], [1, '#020409']]);
      g.fillRect(0, floorY, w, h - floorY);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 1; k < 7; k++) {
        const y = floorY + (h - floorY) * Math.pow(k / 7, 1.6);
        g.moveTo(0, y);
        g.lineTo(w, y);
      }
      g.stroke();
      // alfombra roja en perspectiva con orillas doradas
      g.fillStyle = linear(g, 0, floorY, 0, h, [[0, '#6a1236'], [1, '#2a0616']]);
      g.beginPath();
      g.moveTo(cx - carpetW, floorY);
      g.lineTo(cx + carpetW, floorY);
      g.lineTo(cx + carpetW * 2.6, h);
      g.lineTo(cx - carpetW * 2.6, h);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(241,212,140,0.45)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx - carpetW, floorY);
      g.lineTo(cx - carpetW * 2.6, h);
      g.moveTo(cx + carpetW, floorY);
      g.lineTo(cx + carpetW * 2.6, h);
      g.stroke();
      // macetas
      for (const d of [-1, 1]) {
        const px = cx + d * dw * 1.45, pw2 = h * 0.06;
        g.fillStyle = linear(g, px - pw2, 0, px + pw2, 0, [[0, '#0b1020'], [0.45, '#2a3350'], [1, '#05070f']]);
        g.beginPath();
        g.moveTo(px - pw2, floorY - h * 0.09);
        g.lineTo(px + pw2, floorY - h * 0.09);
        g.lineTo(px + pw2 * 0.75, floorY);
        g.lineTo(px - pw2 * 0.75, floorY);
        g.closePath();
        g.fill();
      }
    });

    // Interior del antro visto por la puerta: luz que late y gente bailando
    const arch = new Path2D();
    arch.moveTo(cx - dw / 2, floorY);
    arch.lineTo(cx - dw / 2, top + dw / 2);
    arch.arc(cx, top + dw / 2, dw / 2, Math.PI, 0);
    arch.lineTo(cx + dw / 2, floorY);
    arch.closePath();
    ctx.save();
    ctx.clip(arch);
    ctx.fillStyle = linear(ctx, 0, top, 0, floorY, [[0, '#3a1460'], [0.5, '#7a1d8a'], [1, '#2a0a3a']]);
    ctx.fillRect(cx - dw, top, dw * 2, dh);
    ctx.globalCompositeOperation = 'lighter';
    const inCol = NIGHT_PALETTE[Math.floor(t / 2) % 3];
    glow(ctx, cx, top + dh * 0.35, dw * 0.9, inCol, 0.5 + pulse * 0.4);
    glow(ctx, cx + Math.sin(t * 1.3) * dw * 0.3, top + dh * 0.2, dw * 0.5, '255,220,250', 0.25 + pulse * 0.3);
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + Math.sin(t * 0.9 + k * 2) * 0.6;
      beam(ctx, cx + (k - 1) * dw * 0.25, top + dh * 0.05, a + Math.PI, dh * 1.2, 0.08, NIGHT_PALETTE[k], 0.18);
    }
    ctx.globalCompositeOperation = 'source-over';
    const inside = new Path2D();
    for (let k = 0; k < 6; k++) {
      const ph = (beat + k * 0.21) % 1;
      addFigure(inside, cx - dw * 0.42 + k * dw * 0.17, floorY - dh * 0.02, dh * 0.3, { bob: Math.sin(ph * TAU) * 0.6, armsUp: k % 2 === 0, hair: k % 3 === 1 ? 1 : 0 });
    }
    ctx.fillStyle = 'rgba(20,6,30,0.85)';
    ctx.fill(inside);
    ctx.restore();

    // Marco de neón cian alrededor de la puerta + letrero
    ctx.strokeStyle = '#45f3ff';
    ctx.globalAlpha = flicker(t, 1.3);
    ctx.beginPath();
    ctx.moveTo(cx - dw / 2 - 12, floorY);
    ctx.lineTo(cx - dw / 2 - 12, top + dw / 2);
    ctx.arc(cx, top + dw / 2, dw / 2 + 12, Math.PI, 0);
    ctx.lineTo(cx + dw / 2 + 12, floorY);
    glowStroke(ctx, 3);
    ctx.globalAlpha = 1;
    const signA = flicker(t, 4.4);
    neonText(ctx, 'EL CLUB', cx, top - h * 0.1, Math.min(w, h) * 0.075, '#ffe6f5', '#ff4fb4', signA);

    // Luz y reflejos en la banqueta mojada
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx, top - h * 0.1, Math.min(w, h) * 0.2, '255,79,180', 0.12 * signA);
    ctx.fillStyle = linear(ctx, 0, floorY, 0, h, [[0, `rgba(255,90,190,${0.32 + pulse * 0.15})`], [1, 'rgba(255,90,190,0)']]);
    ctx.beginPath();
    ctx.moveTo(cx - dw / 2, floorY);
    ctx.lineTo(cx + dw / 2, floorY);
    ctx.lineTo(cx + dw * 1.7, h);
    ctx.lineTo(cx - dw * 1.7, h);
    ctx.closePath();
    ctx.fill();
    // reflejos verticales que tiemblan con el agua
    ctx.fillStyle = 'rgb(69,243,255)';
    for (const d of [-1, 1]) {
      const rx = cx + d * (dw / 2 + 12);
      for (let y = floorY + 2; y < h; y += 3) {
        const k = (y - floorY) / (h - floorY);
        ctx.globalAlpha = (1 - k) * 0.35 * (0.6 + 0.4 * Math.sin(t * 3 + y * 0.4));
        ctx.fillRect(rx - 1.5 + Math.sin(y * 0.3 + t * 2) * 2 * k, y, 3, 2);
      }
    }
    ctx.fillStyle = 'rgb(255,120,200)';
    for (let y = floorY + 2; y < h; y += 3) {
      const k = (y - floorY) / (h - floorY);
      ctx.globalAlpha = (1 - k) * 0.25 * (0.6 + 0.4 * Math.sin(t * 2.4 + y * 0.35));
      const lw = dw * 0.6 * (0.6 + k);
      ctx.fillRect(cx - lw / 2 + Math.sin(y * 0.2 + t) * 4 * k, y, lw, 1.5);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Palmeras en maceta iluminadas desde abajo
    slowLayer(S, 'palms', ctx, w, h, (g) => {
      for (const [d, seed] of [[-1, 51], [1, 53]]) {
        const px = cx + d * dw * 1.45, base = floorY - h * 0.09;
        const lit = linear(g, 0, base, 0, base - h * 0.42, [[0, '#24365e'], [0.5, '#0a1430'], [1, '#03081a']]);
        drawPalm(g, { x: px, y: base, h: h * 0.4, lean: d * 0.12, t, seed, color: lit, fronds: 9 });
      }
    });

    // La fila (contraluz rosa desde la puerta) y el cadenero
    const unit = h * 0.25;
    const line = new Path2D();
    for (let i = 0; i < 6; i++) {
      const x = cx - dw * 0.95 - i * unit * 0.48;
      if (x < -unit) break;
      addFigure(line, x, floorY + h * 0.05, unit * (0.95 + (i % 2) * 0.07), { bob: Math.sin((beat + i * 0.23) * TAU) * 0.2, hair: i % 3 === 0 ? 1 : i % 3 === 2 ? 2 : 0, tilt: i % 2 ? 0.4 : -0.3 });
    }
    fillFigures(ctx, line, '#02030b', '#ff6fc8', 2.5, -1, 0.55);
    const guard = new Path2D();
    addFigure(guard, cx + dw * 0.92, floorY + h * 0.07, unit * 1.25, { wide: 1.25 });
    fillFigures(ctx, guard, '#010209', '#ff6fc8', -2.5, -1, 0.6);

    // Postes de latón y cordón de terciopelo
    const ry = floorY + h * 0.1;
    const lx = cx - dw * 0.8, rx = cx + dw * 0.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7a0f3e';
    ctx.lineWidth = Math.max(5, h * 0.013);
    ctx.beginPath();
    ctx.moveTo(lx, ry - h * 0.085);
    ctx.quadraticCurveTo((lx + rx) / 2, ry + h * 0.02, rx, ry - h * 0.085);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,205,0.55)';
    ctx.lineWidth = Math.max(1, h * 0.003);
    ctx.stroke();
    [lx, rx].forEach((x) => {
      const pw2 = h * 0.008;
      ctx.fillStyle = linear(ctx, x - pw2, 0, x + pw2, 0, [[0, '#5a4220'], [0.45, '#ffe6a8'], [1, '#5a4220']]);
      ctx.fillRect(x - pw2, ry - h * 0.09, pw2 * 2, h * 0.13);
      ctx.beginPath();
      ctx.arc(x, ry - h * 0.096, h * 0.014, 0, TAU);
      ctx.fill();
    });

    drizzle(ctx, S, w, h, t, 0.12);
  }

  // 02 · La Pista — pantalla LED, cabezas móviles, láseres, humo y piso brillante
  function pista(ctx, w, h, t, S) {
    const pulse = TE.pulse();
    const beat = TE.beat();
    const cx = w * 0.5;
    const y0 = h * 0.56;
    const wl = w * 0.2, wr = w * 0.8, wt = h * 0.11, wb = h * 0.42;
    const trussY = h * 0.04;

    staticLayer(S, 'room', ctx, w, h, (g) => {
      g.fillStyle = linear(g, 0, 0, 0, y0, [[0, '#010208'], [1, '#060a1c']]);
      g.fillRect(0, 0, w, y0);
      g.fillStyle = 'rgba(255,255,255,0.02)';
      for (let x = 0; x < w; x += 34) g.fillRect(x, 0, 1, y0);
      // marco de la pantalla
      g.fillStyle = '#000105';
      g.fillRect(wl - 10, wt - 10, wr - wl + 20, wb - wt + 20);
      // truss con celosía
      g.strokeStyle = 'rgba(150,170,210,0.22)';
      g.lineWidth = 1.4;
      g.strokeRect(-2, trussY - 9, w + 4, 18);
      g.beginPath();
      for (let x = 0; x < w; x += 20) {
        g.moveTo(x, trussY - 9);
        g.lineTo(x + 10, trussY + 9);
        g.lineTo(x + 20, trussY - 9);
      }
      g.stroke();
      // cuerpos de las cabezas móviles
      for (let k = 0; k < 5; k++) {
        const lx = w * (0.13 + k * 0.185);
        g.fillStyle = '#0b0f1e';
        g.fillRect(lx - 9, trussY + 8, 18, 8);
        g.beginPath();
        g.arc(lx, trussY + 20, 8, 0, TAU);
        g.fill();
      }
      // bocinas line array
      for (const d of [-1, 1]) {
        const sx = cx + d * w * 0.405;
        const top2 = h * 0.12;
        for (let k = 0; k < 7; k++) {
          const y = top2 + k * (y0 - top2) / 7;
          const hh = (y0 - top2) / 7 - 3;
          g.fillStyle = linear(g, sx - w * 0.045, 0, sx + w * 0.045, 0, [[0, '#020309'], [0.5, '#0e1428'], [1, '#020309']]);
          g.fillRect(sx - w * 0.045, y, w * 0.09, hh);
          g.fillStyle = 'rgba(140,160,210,0.08)';
          g.fillRect(sx - w * 0.04, y + 2, w * 0.08, 1);
        }
      }
      // piso brillante
      g.fillStyle = linear(g, 0, y0, 0, h, [[0, '#0b1128'], [0.3, '#05070f'], [1, '#010205']]);
      g.fillRect(0, y0, w, h - y0);
      // cabina del DJ
      g.fillStyle = linear(g, 0, y0 - h * 0.11, 0, y0, [[0, '#0d1328'], [1, '#02040a']]);
      g.fillRect(cx - w * 0.17, y0 - h * 0.11, w * 0.34, h * 0.11);
      g.fillStyle = 'rgba(69,243,255,0.6)';
      g.fillRect(cx - w * 0.17, y0 - h * 0.11, w * 0.34, 1.5);
    });

    // Pantalla LED: 32×12 píxeles reales, escalados sin suavizado
    const LW = 56, LH = 21;
    if (!S.led) {
      S.led = document.createElement('canvas');
      S.led.width = LW;
      S.led.height = LH;
      S.lctx = S.led.getContext('2d');
      S.limg = S.lctx.createImageData(LW, LH);
    }
    const d = S.limg.data;
    const mode = Math.floor(t / 7) % 3;
    const step = Math.floor(t * 4);
    let ar = 0, ag = 0, ab = 0;
    for (let j = 0; j < LH; j++) {
      for (let i = 0; i < LW; i++) {
        let v;
        if (mode === 0) v = 0.5 + 0.5 * Math.sin(i * 0.2 - t * 3 + Math.sin(j * 0.3 + t));
        else if (mode === 1) v = 0.5 + 0.5 * Math.sin(Math.hypot(i - LW / 2, (j - LH / 2) * 1.7) * 0.35 - t * 4);
        else v = Math.sin(i * 0.75 + step) * Math.sin(j * 1.2 + step * 0.7) > 0.25 ? 1 : 0.06;
        v = Math.min(1, v * (0.5 + pulse * 0.6));
        const hue = (i / LW + t * 0.05) % 1;
        let r, gg, b;
        if (hue < 0.5) { const k = hue * 2; r = 69 - 9 * k; gg = 243 - 153 * k; b = 255; }
        else { const k = (hue - 0.5) * 2; r = 60 + 195 * k; gg = 90 - 11 * k; b = 255 - 75 * k; }
        const o = (j * LW + i) * 4;
        d[o] = r * v; d[o + 1] = gg * v; d[o + 2] = b * v; d[o + 3] = 255;
        ar += r * v; ag += gg * v; ab += b * v;
      }
    }
    S.lctx.putImageData(S.limg, 0, 0);
    const n = LW * LH;
    const avg = `${Math.min(255, (ar / n) * 1.6) | 0},${Math.min(255, (ag / n) * 1.6) | 0},${Math.min(255, (ab / n) * 1.6) | 0}`;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(S.led, wl, wt, wr - wl, wb - wt);
    ctx.imageSmoothingEnabled = true;
    staticLayer(S, 'ledgrid', ctx, wr - wl, wb - wt, (g) => {
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 1;
      g.beginPath();
      const cw = (wr - wl) / LW, ch = (wb - wt) / LH;
      for (let i = 1; i < LW; i++) { g.moveTo(i * cw, 0); g.lineTo(i * cw, wb - wt); }
      for (let j = 1; j < LH; j++) { g.moveTo(0, j * ch); g.lineTo(wr - wl, j * ch); }
      g.stroke();
    }, wl, wt);

    ctx.globalCompositeOperation = 'lighter';
    // la pantalla ilumina el cuarto (bloom suave)
    ctx.globalAlpha = 0.3;
    ctx.drawImage(S.led, wl - (wr - wl) * 0.3, wt - h * 0.14, (wr - wl) * 1.6, (wb - wt) * 2.1);
    // y se refleja en el piso brillante
    ctx.save();
    ctx.translate(0, y0 * 2);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(S.led, wl, wt + (y0 - wb) * 0.2, wr - wl, (wb - wt) * 1.1);
    ctx.restore();
    ctx.globalAlpha = 1;

    // Cabezas móviles con haces volumétricos y manchas de luz en el piso
    for (let k = 0; k < 5; k++) {
      const lx = w * (0.13 + k * 0.185), ly = trussY + 22;
      const col = NIGHT_PALETTE[(k + Math.floor(t / 4)) % 3];
      const ang = Math.PI / 2 + Math.sin(t * 0.7 + k * 1.1) * 0.5 * (k % 2 ? 1 : -1);
      volBeam(ctx, lx, ly, ang, h * 1.15, 0.022, col, 0.15 + pulse * 0.1);
      glow(ctx, lx, ly, 26, col, 0.9);
      glow(ctx, lx, ly, 8, '255,255,255', 0.9);
      const hitY = h * 0.84;
      const hx = lx + Math.cos(ang) * ((hitY - ly) / Math.max(0.2, Math.sin(ang)));
      ctx.save();
      ctx.translate(hx, hitY);
      ctx.scale(1, 0.26);
      glow(ctx, 0, 0, w * 0.09, col, 0.3 + pulse * 0.2);
      ctx.restore();
    }

    // Puntos de luz de una bola disco (fuera de cuadro) girando por el salón
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996 + t * 0.35;
      const dd = 0.2 + ((i * 0.618) % 1) * 0.9;
      glow(ctx, cx + Math.cos(a) * w * 0.6 * dd, h * 0.25 + Math.sin(a) * h * 0.25 * dd, 4 + (i % 3) * 2, i % 4 ? '200,235,255' : '255,120,200', 0.6);
    }

    // Láseres en abanico (se encienden por tramos)
    if (Math.floor(t / 5) % 2 === 1) {
      const ox = cx, oy = y0 - h * 0.12;
      const fan = Math.sin(t * 1.6) * 0.5;
      ctx.lineCap = 'round';
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + fan + (k - 4) * 0.13;
        const ex = ox + Math.cos(a) * h * 1.2, ey = oy + Math.sin(a) * h * 1.2;
        ctx.strokeStyle = 'rgba(110,255,190,0.12)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(180,255,220,0.7)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      glow(ctx, ox, oy, 30, '110,255,190', 0.8);
    }

    // Humo
    haze(ctx, S, w, h, t, '110,130,220', 0.07, 0.15, 0.7);
    ctx.globalCompositeOperation = 'source-over';

    // DJ con audífonos, pantallas de los equipos encendidas
    const dj = new Path2D();
    addFigure(dj, cx, y0 - h * 0.11, Math.min(h * 0.17, w * 0.2), { bob: Math.sin(beat * TAU) * 0.5, headphones: true, tilt: Math.sin(beat * TAU) * 0.6 });
    fillFigures(ctx, dj, '#02030a', `rgb(${avg})`, 0, -2, 0.7);
    ctx.globalCompositeOperation = 'lighter';
    for (const d2 of [-1, 1]) {
      const sx = cx + d2 * w * 0.08;
      ctx.fillStyle = 'rgba(120,240,255,0.8)';
      ctx.fillRect(sx - w * 0.025, y0 - h * 0.112, w * 0.05, 3);
      glow(ctx, sx, y0 - h * 0.11, w * 0.04, '69,243,255', 0.35);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Multitud: fila del fondo y fila del frente, con contraluz del color de la pantalla
    const back = new Path2D();
    const front = new Path2D();
    const phones = [];
    const nb = Math.max(12, Math.round(w / 52));
    for (let i = 0; i < nb; i++) {
      const ph = (beat + i * 0.173) % 1;
      addFigure(back, (i + 0.3) * (w / nb), h * 0.9, h * 0.2, { bob: Math.sin(ph * TAU) * 0.7, armsUp: i % 4 === 1, hair: i % 3 === 0 ? 1 : 0, tilt: Math.sin(i * 3) });
    }
    const nf = Math.max(8, Math.round(w / 95));
    for (let i = 0; i < nf; i++) {
      const ph = (beat + i * 0.137) % 1;
      const hands = addFigure(front, (i + 0.5) * (w / nf) + Math.sin(i * 7.1) * 16, h * 1.04, h * (0.3 + ((i * 37) % 5) * 0.012), {
        bob: Math.sin(ph * TAU) * 0.7, armsUp: i % 3 === 0, oneArm: i % 6 === 3 ? 1 : 0, hair: i % 4 === 1 ? 1 : i % 4 === 3 ? 2 : 0, tilt: Math.sin(i * 5.3),
      });
      if (i % 3 === 0 && hands.length) phones.push(hands[0]);
    }
    fillFigures(ctx, back, '#03050f');
    fillFigures(ctx, front, '#010207', `rgb(${avg})`, 0, -2.5, 0.75);
    // celulares en alto grabando
    ctx.globalCompositeOperation = 'lighter';
    for (const [px, py, s2] of phones) {
      const pw = s2 * 0.04, phh = s2 * 0.075;
      ctx.fillStyle = linear(ctx, 0, py - phh, 0, py, [[0, 'rgba(150,200,255,0.75)'], [1, 'rgba(90,120,220,0.55)']]);
      ctx.fillRect(px - pw / 2, py - phh, pw, phh);
      glow(ctx, px, py - phh / 2, s2 * 0.12, '150,190,255', 0.22);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 03 · La Barra — botellas de vidrio a contraluz, lámparas colgantes, barra brillante
  function barra(ctx, w, h, t, S) {
    const pulse = TE.pulse();
    const top = h * 0.12, bot = h * 0.6;
    const cy = h * 0.66;
    const lamps = [0.22, 0.5, 0.78];

    staticLayer(S, 'bar', ctx, w, h, (g) => {
      // pared de madera oscura
      g.fillStyle = linear(g, 0, 0, 0, h, [[0, '#0a0710'], [1, '#05040a']]);
      g.fillRect(0, 0, w, h);
      const R = rng(41);
      g.strokeStyle = 'rgba(120,80,60,0.06)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 90; i++) {
        const x = R() * w;
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 4, h * 0.3, x - 4, h * 0.6, x + 2, h);
      }
      g.stroke();
      // nicho de la contrabarra con luz de fondo
      g.fillStyle = linear(g, 0, top, 0, bot, [[0, '#0b2a5e'], [0.5, '#1b5bbf'], [1, '#0a2252']]);
      g.fillRect(0, top, w, bot - top);
      glow(g, w * 0.5, (top + bot) / 2, w * 0.55, '69,243,255', 0.2);
      // repisas de vidrio con tira LED
      const shelfGap = (bot - top) / 3;
      const palette = [['210,130,40', 0.85], ['70,170,95', 0.8], ['215,235,255', 0.45], ['70,120,230', 0.8], ['200,50,80', 0.8], ['230,190,90', 0.75]];
      for (let r2 = 0; r2 < 3; r2++) {
        const sy = top + shelfGap * (r2 + 1) - 4;
        // botellas
        let x = 6;
        while (x < w - 10) {
          const bw = (14 + R() * 18) * (w / 1000) + 8;
          const bh = shelfGap * (0.55 + R() * 0.38);
          const [col, al] = palette[(R() * palette.length) | 0];
          const neck = 0.3 + R() * 0.2;
          const path = new Path2D();
          const nw = bw * 0.3, nh = bh * neck;
          path.moveTo(x, sy);
          path.lineTo(x, sy - bh + nh);
          path.quadraticCurveTo(x, sy - bh + nh * 0.55, x + (bw - nw) / 2, sy - bh + nh * 0.45);
          path.lineTo(x + (bw - nw) / 2, sy - bh);
          path.lineTo(x + (bw + nw) / 2, sy - bh);
          path.lineTo(x + (bw + nw) / 2, sy - bh + nh * 0.45);
          path.quadraticCurveTo(x + bw, sy - bh + nh * 0.55, x + bw, sy - bh + nh);
          path.lineTo(x + bw, sy);
          path.closePath();
          // vidrio teñido por el líquido, más claro donde le pega la luz de abajo
          g.fillStyle = linear(g, 0, sy - bh, 0, sy, [[0, `rgba(${col},${al * 0.55})`], [0.6, `rgba(${col},${al})`], [1, `rgba(255,255,255,${al * 0.7})`]]);
          g.fill(path);
          g.strokeStyle = 'rgba(0,0,0,0.55)';
          g.lineWidth = 1;
          g.stroke(path);
          // brillo especular
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(x + bw * 0.18, sy - bh + nh + 2, Math.max(1, bw * 0.08), bh - nh - 6);
          // tapa
          g.fillStyle = '#120c08';
          g.fillRect(x + (bw - nw) / 2, sy - bh - 3, nw, 4);
          x += bw + 3 + R() * 8;
        }
        // repisa y tira de luz
        g.fillStyle = 'rgba(200,240,255,0.5)';
        g.fillRect(0, sy, w, 2);
        g.fillStyle = linear(g, 0, sy + 2, 0, sy + 14, [[0, 'rgba(69,243,255,0.5)'], [1, 'rgba(69,243,255,0)']]);
        g.fillRect(0, sy + 2, w, 12);
      }
      // conos de luz de las lámparas colgantes
      for (const fx of lamps) {
        const lx = w * fx;
        g.fillStyle = linear(g, 0, h * 0.2, 0, cy, [[0, 'rgba(255,190,120,0.22)'], [1, 'rgba(255,190,120,0.03)']]);
        g.beginPath();
        g.moveTo(lx - w * 0.03, h * 0.2);
        g.lineTo(lx + w * 0.03, h * 0.2);
        g.lineTo(lx + w * 0.12, cy);
        g.lineTo(lx - w * 0.12, cy);
        g.closePath();
        g.fill();
        // cable y pantalla
        g.strokeStyle = 'rgba(20,16,14,0.9)';
        g.beginPath();
        g.moveTo(lx, 0);
        g.lineTo(lx, h * 0.15);
        g.stroke();
        g.fillStyle = linear(g, lx - w * 0.035, 0, lx + w * 0.035, 0, [[0, '#120d0a'], [0.5, '#3a2a1c'], [1, '#120d0a']]);
        g.beginPath();
        g.moveTo(lx - w * 0.012, h * 0.15);
        g.lineTo(lx + w * 0.012, h * 0.15);
        g.lineTo(lx + w * 0.035, h * 0.2);
        g.lineTo(lx - w * 0.035, h * 0.2);
        g.closePath();
        g.fill();
        glow(g, lx, h * 0.2, w * 0.05, '255,200,140', 0.8);
      }
      // cubierta de la barra con brillo y reflejos de las lámparas
      g.fillStyle = linear(g, 0, cy, 0, cy + h * 0.05, [[0, '#2c3346'], [0.1, '#141826'], [1, '#07090f']]);
      g.fillRect(0, cy, w, h * 0.05);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, cy, w, 1.5);
      for (const fx of lamps) {
        g.save();
        g.translate(w * fx, cy + h * 0.02);
        g.scale(1, 0.18);
        glow(g, 0, 0, w * 0.1, '255,200,140', 0.5);
        g.restore();
      }
      // frente de la barra con listones y luz inferior
      g.fillStyle = '#05060c';
      g.fillRect(0, cy + h * 0.05, w, h);
      g.fillStyle = 'rgba(255,255,255,0.03)';
      for (let x = 10; x < w; x += 24) g.fillRect(x, cy + h * 0.06, 2, h);
      g.fillStyle = linear(g, 0, h - h * 0.08, 0, h, [[0, 'rgba(255,79,180,0)'], [1, 'rgba(255,79,180,0.35)']]);
      g.fillRect(0, h - h * 0.08, w, h * 0.08);
      // vaso alto con hielo y popote
      const hx = w * 0.82, hb = cy + 1, hw = h * 0.05, hh = h * 0.13;
      g.fillStyle = 'rgba(200,230,255,0.12)';
      g.fillRect(hx - hw / 2, hb - hh, hw, hh);
      g.fillStyle = 'rgba(255,170,60,0.55)';
      g.fillRect(hx - hw / 2, hb - hh * 0.7, hw, hh * 0.7);
      g.fillStyle = 'rgba(230,245,255,0.35)';
      for (let k = 0; k < 3; k++) g.fillRect(hx - hw * 0.35 + k * hw * 0.22, hb - hh * 0.65 + (k % 2) * hh * 0.15, hw * 0.25, hw * 0.25);
      g.strokeStyle = 'rgba(220,240,255,0.5)';
      g.lineWidth = 1;
      g.strokeRect(hx - hw / 2, hb - hh, hw, hh);
      g.strokeStyle = '#ff4fb4';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(hx + hw * 0.1, hb - hh * 0.4);
      g.lineTo(hx + hw * 0.35, hb - hh * 1.25);
      g.stroke();
    });

    // Destello que recorre el vidrio de las botellas
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, w, bot - top);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const sweep = ((t * 0.08) % 1.6 - 0.3) * w;
    ctx.fillStyle = linear(ctx, sweep - w * 0.08, 0, sweep + w * 0.08, 0, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(220,245,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(sweep - w * 0.08, top, w * 0.16, bot - top);
    glow(ctx, w * 0.5, (top + bot) / 2, w * 0.5, '69,243,255', 0.06 + pulse * 0.08);
    ctx.restore();

    neonText(ctx, 'coctelería', w * 0.5, top * 0.55, Math.min(w, h) * 0.055, '#e7fdff', '#45f3ff', flicker(t, 9));

    // Barman con contraluz cálido, agitando la coctelera
    const bxm = w * 0.32;
    const shake = Math.sin(t * 14) * h * 0.018;
    const man = new Path2D();
    addFigure(man, bxm, cy + h * 0.02, h * 0.3, { tilt: -0.3 });
    man.moveTo(bxm + h * 0.06, cy - h * 0.15);
    man.lineTo(bxm + h * 0.11, cy - h * 0.25 + shake);
    man.lineTo(bxm + h * 0.135, cy - h * 0.24 + shake);
    man.lineTo(bxm + h * 0.085, cy - h * 0.13);
    man.closePath();
    fillFigures(ctx, man, '#030207', '#ffb070', 0, -2.5, 0.6);
    ctx.save();
    ctx.translate(bxm + h * 0.125, cy - h * 0.27 + shake);
    ctx.rotate(-0.5);
    ctx.fillStyle = linear(ctx, -h * 0.015, 0, h * 0.015, 0, [[0, '#4a5060'], [0.5, '#e6ecf5'], [1, '#4a5060']]);
    ctx.fillRect(-h * 0.015, -h * 0.05, h * 0.03, h * 0.09);
    ctx.restore();

    // Copa de cóctel en la barra
    const gx = w * 0.66, gy = cy, gs = h * 0.17;
    ctx.fillStyle = linear(ctx, 0, gy - gs, 0, gy - gs * 0.55, [[0, 'rgba(255,120,200,0.85)'], [1, 'rgba(200,40,130,0.85)']]);
    ctx.beginPath();
    ctx.moveTo(gx - gs * 0.33, gy - gs * 0.97);
    ctx.lineTo(gx + gs * 0.33, gy - gs * 0.97);
    ctx.lineTo(gx, gy - gs * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,245,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(gx - gs * 0.38, gy - gs);
    ctx.lineTo(gx, gy - gs * 0.55);
    ctx.lineTo(gx + gs * 0.38, gy - gs);
    ctx.moveTo(gx, gy - gs * 0.55);
    ctx.lineTo(gx, gy - 2);
    ctx.moveTo(gx - gs * 0.16, gy - 1);
    ctx.lineTo(gx + gs * 0.16, gy - 1);
    ctx.stroke();
    ctx.fillStyle = '#9dff8a';
    ctx.beginPath();
    ctx.arc(gx + gs * 0.3, gy - gs * 1.01, gs * 0.07, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, gx, gy - gs * 0.8, gs * 0.6, '255,79,180', 0.18);
    for (let i = 0; i < 8; i++) {
      const p = (t * 0.4 + i / 8) % 1;
      ctx.fillStyle = `rgba(255,220,240,${0.6 * (1 - p)})`;
      ctx.fillRect(gx + Math.sin(i * 3 + t * 2) * gs * 0.12 * (1 - p), gy - gs * 0.62 - p * gs * 0.3, 1.6, 1.6);
    }
    // bokeh al frente
    if (!S.bokeh) {
      const R = rng(19);
      S.bokeh = Array.from({ length: 18 }, () => ({ x: R(), y: R(), r: 10 + R() * 34, c: NIGHT_PALETTE[(R() * 3) | 0], s: R() * TAU }));
    }
    for (const b of S.bokeh) {
      const bx = ((b.x + t * 0.008) % 1) * w;
      glow(ctx, bx, b.y * h + Math.sin(t * 0.5 + b.s) * 10, b.r, b.c, 0.08 + 0.05 * Math.sin(t + b.s));
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 04 · El VIP — terciopelo, sillón capitonado, champaña con bengala
  function vip(ctx, w, h, t, S) {
    const pulse = TE.pulse();
    const beat = TE.beat();
    const cx = w * 0.45, cy = h * 0.8, rw = w * 0.36, rh = h * 0.42;
    const tx = cx + rw * 0.08, ty = h * 0.87;

    staticLayer(S, 'room', ctx, w, h, (g) => {
      // cortinas de terciopelo con pliegues
      const fold = 26;
      for (let x = 0; x < w; x += fold) {
        g.fillStyle = linear(g, x, 0, x + fold, 0, [[0, '#14061f'], [0.45, '#4a1a5c'], [0.55, '#5a2470'], [1, '#14061f']]);
        g.fillRect(x, 0, fold + 1, h * 0.78);
      }
      g.fillStyle = linear(g, 0, 0, 0, h * 0.78, [[0, 'rgba(255,200,130,0.22)'], [0.3, 'rgba(255,200,130,0)'], [1, 'rgba(4,2,12,0.85)']]);
      g.fillRect(0, 0, w, h * 0.78);
      // barra dorada de la cortina
      g.fillStyle = linear(g, 0, h * 0.035, 0, h * 0.055, [[0, '#7a5a20'], [0.5, '#ffe2a0'], [1, '#6a4a18']]);
      g.fillRect(0, h * 0.035, w, h * 0.02);
      // apliques de pared
      for (const fx of [0.12, 0.88]) {
        const lx = w * fx, ly = h * 0.3;
        glow(g, lx, ly - h * 0.04, w * 0.14, '255,190,120', 0.3);
        g.fillStyle = linear(g, lx - 10, 0, lx + 10, 0, [[0, '#5a4220'], [0.5, '#e8c886'], [1, '#5a4220']]);
        g.fillRect(lx - 9, ly - 4, 18, 8);
        g.fillStyle = 'rgba(255,230,190,0.95)';
        g.beginPath();
        g.ellipse(lx, ly - 10, 7, 9, 0, 0, TAU);
        g.fill();
        glow(g, lx, ly - 10, 22, '255,210,150', 0.8);
      }
      // piso
      g.fillStyle = linear(g, 0, h * 0.78, 0, h, [[0, '#0d0618'], [1, '#030108']]);
      g.fillRect(0, h * 0.78, w, h * 0.22);
      // sillón circular de piel
      const sofa = new Path2D();
      sofa.ellipse(cx, cy, rw, rh, 0, Math.PI, 0);
      sofa.lineTo(cx + rw, h);
      sofa.lineTo(cx - rw, h);
      sofa.closePath();
      const sg = g.createRadialGradient(cx, cy - rh * 0.7, rh * 0.1, cx, cy, rw);
      sg.addColorStop(0, '#3a1640');
      sg.addColorStop(0.7, '#1c0a24');
      sg.addColorStop(1, '#0c0412');
      g.fillStyle = sg;
      g.fill(sofa);
      g.save();
      g.clip(sofa);
      // capitonado: botones con sombra y brillo
      for (let a = 0.08; a < 0.94; a += 0.055) {
        for (let r2 = 0.5; r2 < 0.97; r2 += 0.09) {
          const ang = Math.PI + a * Math.PI;
          const bx = cx + Math.cos(ang) * rw * r2, by = cy + Math.sin(ang) * rh * r2;
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.beginPath();
          g.arc(bx, by, 2.2, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(255,170,230,0.18)';
          g.beginPath();
          g.arc(bx - 0.8, by - 0.8, 1, 0, TAU);
          g.fill();
        }
      }
      g.restore();
      g.strokeStyle = 'rgba(255,120,210,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(cx, cy, rw, rh, 0, Math.PI, 0);
      g.stroke();
      // mesa de mármol
      g.fillStyle = linear(g, tx - w * 0.15, 0, tx + w * 0.15, 0, [[0, '#1a1622'], [0.5, '#3a3444'], [1, '#14111a']]);
      g.beginPath();
      g.ellipse(tx, ty, w * 0.15, h * 0.045, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,220,160,0.5)';
      g.lineWidth = 1.5;
      g.stroke();
      // cubeta de champaña metálica
      const bkx = tx - w * 0.08, bkh = h * 0.07, bkw = h * 0.045;
      g.fillStyle = linear(g, bkx - bkw, 0, bkx + bkw, 0, [[0, '#3a4050'], [0.4, '#e8eef8'], [0.6, '#9aa4b8'], [1, '#2a3040']]);
      g.beginPath();
      g.moveTo(bkx - bkw, ty - bkh);
      g.lineTo(bkx + bkw, ty - bkh);
      g.lineTo(bkx + bkw * 0.8, ty);
      g.lineTo(bkx - bkw * 0.8, ty);
      g.closePath();
      g.fill();
      g.fillStyle = '#071a10';
      g.fillRect(bkx - bkw * 0.15, ty - bkh * 1.6, bkw * 0.3, bkh * 0.7);
      // copas flauta
      g.strokeStyle = 'rgba(230,240,255,0.55)';
      g.lineWidth = 1.2;
      for (const fx of [0.06, 0.1]) {
        const gx = tx + w * fx;
        g.beginPath();
        g.moveTo(gx - 4, ty - h * 0.08);
        g.lineTo(gx - 2.5, ty - h * 0.035);
        g.lineTo(gx + 2.5, ty - h * 0.035);
        g.lineTo(gx + 4, ty - h * 0.08);
        g.moveTo(gx, ty - h * 0.035);
        g.lineTo(gx, ty - 2);
        g.stroke();
        g.fillStyle = 'rgba(255,220,140,0.6)';
        g.fillRect(gx - 2.8, ty - h * 0.065, 5.6, h * 0.028);
      }
    });

    neonText(ctx, 'VIP', w * 0.78, h * 0.2, Math.min(w, h) * 0.13, '#ffe4f5', '#ff4fb4', flicker(t, 2.2));

    // Invitados con contraluz magenta
    const guests = new Path2D();
    [[-0.58, 0, 1], [-0.3, 0.3, 0], [0.48, 0.6, 2], [0.7, 0.45, 1]].forEach(([gx, ph, hair], i) => {
      addFigure(guests, cx + gx * rw, cy + h * 0.03, h * 0.27, { bob: Math.sin((beat + ph) * TAU) * 0.25, hair, tilt: i % 2 ? 0.5 : -0.4 });
    });
    fillFigures(ctx, guests, '#06020c', '#ff6fd0', 0, -2.5, 0.6);

    // Botella con bengala: chispas reales y luz cálida que parpadea
    const bx = tx - w * 0.01, bh = h * 0.16, bw = h * 0.034;
    ctx.fillStyle = linear(ctx, bx - bw / 2, 0, bx + bw / 2, 0, [[0, '#020a06'], [0.4, '#1a3a26'], [1, '#020a06']]);
    ctx.fillRect(bx - bw / 2, ty - bh, bw, bh * 0.7);
    ctx.fillRect(bx - bw * 0.18, ty - bh * 1.25, bw * 0.36, bh * 0.6);
    ctx.fillStyle = '#e8c76a';
    ctx.fillRect(bx - bw * 0.2, ty - bh * 1.27, bw * 0.4, bh * 0.12);
    const sx = bx, sy = ty - bh * 1.32;
    const fl = 0.75 + Math.random() * 0.25;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, sx, sy, h * 0.4, '255,200,130', 0.22 * fl);
    glow(ctx, sx, sy, h * 0.08, '255,240,210', 0.7 * fl);
    if (!S.sparks) S.sparks = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const v = 60 + Math.random() * 160;
      S.sparks.push({ x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.5, age: 0 });
    }
    const dt = Math.min(0.05, t - (S.last || t));
    S.last = t;
    S.sparks = S.sparks.filter((p) => p.age < p.life);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.4;
    const SB = 5;
    const sparkPaths = Array.from({ length: SB }, () => new Path2D());
    for (const p of S.sparks) {
      p.age += dt;
      p.vy += 260 * dt;
      const ox = p.x, oy = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = Math.max(0, 1 - p.age / p.life);
      const b = Math.min(SB - 1, Math.floor(k * SB));
      sparkPaths[b].moveTo(ox, oy);
      sparkPaths[b].lineTo(p.x, p.y);
    }
    for (let b = 0; b < SB; b++) {
      const k = (b + 0.5) / SB;
      ctx.strokeStyle = `rgba(255,${(200 + k * 55) | 0},${(150 + k * 90) | 0},${k.toFixed(2)})`;
      ctx.stroke(sparkPaths[b]);
    }
    if (S.sparks.length > 400) S.sparks.splice(0, S.sparks.length - 400);
    glow(ctx, w * 0.78, h * 0.2, w * 0.3, '255,79,180', 0.1 + pulse * 0.12);
    ctx.globalCompositeOperation = 'source-over';

    // Cordón VIP al frente
    const ry = h * 0.96;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7a0f3e';
    ctx.lineWidth = Math.max(5, h * 0.015);
    ctx.beginPath();
    ctx.moveTo(-10, ry - h * 0.07);
    ctx.quadraticCurveTo(w * 0.5, ry + h * 0.04, w + 10, ry - h * 0.07);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,160,215,0.5)';
    ctx.lineWidth = Math.max(1, h * 0.003);
    ctx.stroke();
  }

  // 05 · La Terraza — amanecer con nubes iluminadas por abajo, piso de madera
  function terraza(ctx, w, h, t, S) {
    const hz = h * 0.6;
    const sunX = w * 0.62;
    const deck = h * 0.84;

    staticLayer(S, 'dawn', ctx, w, h, (g) => {
      g.fillStyle = linear(g, 0, 0, 0, hz, [[0, '#050f2a'], [0.45, '#173b7c'], [0.75, '#6a86c4'], [0.92, '#e8a0c4'], [1, '#ffd2ae']]);
      g.fillRect(0, 0, w, hz + 1);
      const R = rng(5);
      g.fillStyle = '#e4eeff';
      for (let i = 0; i < 70; i++) {
        g.globalAlpha = 0.2 + R() * 0.5;
        g.fillRect(R() * w, R() * hz * 0.35, 1.2, 1.2);
      }
      g.globalAlpha = 1;
      // nubes estratos: cuerpo azul y panza iluminada por el sol que sale
      for (let i = 0; i < 9; i++) {
        const y = hz * (0.25 + R() * 0.6), x = R() * w, rw2 = w * (0.12 + R() * 0.2);
        const k = y / hz;
        g.save();
        g.translate(x, y);
        g.scale(1, 0.13);
        glow(g, 0, 0, rw2, '40,55,110', 0.55);
        g.restore();
        g.save();
        g.translate(x + (sunX - x) * 0.04, y + rw2 * 0.04);
        g.scale(1, 0.06);
        glow(g, 0, 0, rw2 * 0.9, k > 0.6 ? '255,170,150' : '230,150,190', 0.35 + k * 0.3);
        g.restore();
      }
      glow(g, sunX, hz, w * 0.55, '255,170,150', 0.35);
      glow(g, sunX, hz, w * 0.16, '255,230,200', 0.65);
      g.fillStyle = '#fff3e0';
      g.beginPath();
      g.arc(sunX, hz + 2, Math.min(w, h) * 0.05, Math.PI, 0);
      g.fill();
      // islas lejanas
      g.fillStyle = '#2a3a6a';
      g.beginPath();
      g.moveTo(-10, hz + 1);
      for (let x = -10; x <= w * 0.28; x += 6) g.lineTo(x, hz - Math.sin((x / (w * 0.28)) * Math.PI) * h * 0.035);
      g.lineTo(w * 0.28, hz + 1);
      g.closePath();
      g.fill();
      // mar con bandas de olas en perspectiva
      g.fillStyle = linear(g, 0, hz, 0, h, [[0, '#5a70b0'], [0.3, '#1a3270'], [1, '#081634']]);
      g.fillRect(0, hz, w, h - hz);
      for (let i = 0; i < 46; i++) {
        const y = hz + Math.pow(i / 46, 1.7) * (deck - hz);
        g.fillStyle = i % 2 ? 'rgba(255,220,220,0.05)' : 'rgba(0,10,40,0.12)';
        const sx = R() * w * 0.3;
        g.fillRect(sx, y, w * (0.4 + R() * 0.6), 1 + (i / 46) * 2);
      }
      // piso de madera en perspectiva con reflejo cálido
      g.fillStyle = linear(g, 0, deck, 0, h, [[0, '#2a1a1a'], [1, '#0a0608']]);
      g.fillRect(0, deck, w, h - deck);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      for (let k = -14; k <= 14; k++) {
        g.moveTo(sunX + k * w * 0.012, deck);
        g.lineTo(sunX + k * w * 0.11, h);
      }
      g.stroke();
      g.save();
      g.translate(sunX, deck + (h - deck) * 0.3);
      g.scale(1, 0.25);
      glow(g, 0, 0, w * 0.3, '255,170,120', 0.25);
      g.restore();
      // barandal: postes, vidrio y pasamanos metálico
      const ry = h * 0.74;
      g.fillStyle = 'rgba(160,190,230,0.06)';
      g.fillRect(0, ry, w, deck - ry);
      g.fillStyle = '#05070f';
      for (let x = 0; x < w; x += 92) g.fillRect(x, ry, 5, deck - ry);
      g.fillStyle = linear(g, 0, ry - 3, 0, ry + 4, [[0, '#ffd8c0'], [0.4, '#6a5a6a'], [1, '#0a0a14']]);
      g.fillRect(0, ry - 3, w, 7);
    });

    // brillo del sol sobre el mar
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgb(255,200,170)';
    for (let y = hz + 2; y < h * 0.74; y += 3) {
      const dd = (y - hz) / (h * 0.74 - hz);
      const sp = w * 0.04 * (1 + dd * 3);
      const len = sp * (0.3 + 0.5 * Math.abs(Math.sin(t + y * 0.15)));
      ctx.globalAlpha = (1 - dd) * 0.5 * (0.6 + 0.4 * Math.sin(t * 2 + y));
      ctx.fillRect(sunX + Math.sin(y * 0.07 + t * 0.8) * sp - len / 2, y, len, 1.3);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // aves
    ctx.strokeStyle = '#18213e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const bx = ((t * 0.02 + i * 0.13) % 1.2) * w - w * 0.1;
      const by = h * (0.24 + i * 0.045) + Math.sin(t + i) * 6;
      const f = Math.sin(t * 6 + i * 2) * 4;
      ctx.moveTo(bx - 8, by - f);
      ctx.quadraticCurveTo(bx - 3, by - 4, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 4, bx + 8, by - f);
    }
    ctx.stroke();

    // pareja mirando el amanecer, con contraluz cálido
    const couple = new Path2D();
    addFigure(couple, w * 0.42, deck + 4, h * 0.23, { hair: 1, tilt: 0.5 });
    addFigure(couple, w * 0.475, deck + 4, h * 0.21, { tilt: -0.3 });
    fillFigures(ctx, couple, '#0a0610', '#ffb08a', 1.8, -1.5, 0.75);

    // palmeras a contraluz del amanecer
    slowLayer(S, 'palms', ctx, w, h, (g) => {
      const lit = linear(g, 0, 0, w, 0, [[0, '#08060f'], [0.6, '#1a1020'], [1, '#08060f']]);
      drawPalm(g, { x: w * 0.05, y: h * 1.02, h: h * 0.85, lean: 0.28, t, seed: 61, color: lit, rim: 'rgba(255,170,130,0.35)', rimSide: 'right' });
      drawPalm(g, { x: w * 0.98, y: h * 1.02, h: h * 0.7, lean: -0.3, t, seed: 63, color: lit, rim: 'rgba(255,170,130,0.35)', rimSide: 'left' });
    });

    // foquitos colgantes
    ctx.strokeStyle = 'rgba(10,18,40,0.9)';
    ctx.lineWidth = 1.2;
    [[0.06, 0.12, 0.1], [0.04, 0.2, 0.08]].forEach((row, ri) => {
      const y1 = h * row[0], y2 = h * row[1], sag = h * row[2];
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.quadraticCurveTo(w / 2, y2 + sag, w, y1);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgb(255,236,200)';
      for (let i = 1; i < 14; i++) {
        const s2 = i / 14;
        const x = w * s2;
        const y = (1 - s2) * (1 - s2) * y1 + 2 * (1 - s2) * s2 * (y2 + sag) + s2 * s2 * y1 + 6;
        const a = 0.55 + 0.45 * Math.sin(t * 2 + i * 1.3 + ri);
        glow(ctx, x, y, 18, '255,210,150', 0.55 * a);
        ctx.globalAlpha = 0.85 * a;
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
      this.name = name;
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
      this.states = {};
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
      // cada zona conserva sus capas ya pintadas: volver a ella es instantáneo
      this.states = this.states || {};
      this.states[this.name] = this.S;
      this.name = name;
      this.S = this.states[name] || {};
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
