// VISTA · fondos premium dibujados en tiempo real (canvas). Reemplazan el dibujo de la V1 de: atardecer, cristal,
// aurora, galaxia, holo, boveda y prisma. Synthwave, Agujero negro y Clásico quedan exactamente como estaban.
// Se dibujan en el fondo de la partida (#theme) y en cada vista previa de la tienda (.bgx[data-bg]).
// Las partes fijas (montañas, cristales, lingotes…) se pintan una sola vez en una capa aparte; cada cuadro solo mueve lo que se mueve.

const TAU = Math.PI * 2;
const azar = (semilla) => () => { semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0; let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function capa(w, h, ratio, pintar) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * ratio)); c.height = Math.max(1, Math.round(h * ratio));
  const g = c.getContext('2d'); g.setTransform(ratio, 0, 0, ratio, 0, 0); pintar(g, w, h); return c;
}
const luz = new Map();
/** Círculo de luz suave (centro → transparente) de un color, en caché. */
function brillo(color) {
  let s = luz.get(color);
  if (!s) { s = capa(64, 64, 1, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, color); r.addColorStop(.35, color.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * .45).toFixed(3) + ')')); r.addColorStop(1, color.replace(/[\d.]+\)$/, '0)')); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); luz.set(color, s); }
  return s;
}
function destello(g, x, y, r, color, a = 1) {                     // estrellita de 4 puntas con halo
  g.globalAlpha = a * .5; g.drawImage(brillo(color), x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
  g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath();
  g.moveTo(x, y - r * 2); g.quadraticCurveTo(x, y, x + r * 2, y); g.quadraticCurveTo(x, y, x, y + r * 2); g.quadraticCurveTo(x, y, x - r * 2, y); g.quadraticCurveTo(x, y, x, y - r * 2); g.fill();
}
function estrellaFugaz(g, e, dt, prob, color = 'rgba(255,255,255,1)') {
  const s = e.s; s.fugaces = s.fugaces || [];
  if (Math.random() < prob * dt * 30) s.fugaces.push({ x: e.w * (.3 + Math.random() * .9), y: e.h * Math.random() * .35, v: e.w * (1.2 + Math.random()), vida: 1 });
  s.fugaces = s.fugaces.filter((f) => (f.vida -= dt * 1.6) > 0);
  for (const f of s.fugaces) {
    f.x -= f.v * dt; f.y += f.v * .42 * dt;
    const L = e.w * .22, gr = g.createLinearGradient(f.x, f.y, f.x + L, f.y - L * .42);
    gr.addColorStop(0, color.replace(/[\d.]+\)$/, f.vida + ')')); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.globalAlpha = 1; g.strokeStyle = gr; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x + L, f.y - L * .42); g.stroke();
    g.globalAlpha = f.vida; g.drawImage(brillo('rgba(255,255,255,1)'), f.x - 5, f.y - 5, 10, 10);
  }
}
function cielo(g, w, h, paradas, x0 = 0, y0 = 0, x1 = 0, y1 = h) {
  const gr = g.createLinearGradient(x0, y0, x1, y1); for (const [p, c] of paradas) gr.addColorStop(p, c);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
function cordillera(g, w, base, alto, semilla, color, picos = 9, nieve = null) {
  const r = azar(semilla), pts = [];
  for (let i = 0; i <= picos; i++) pts.push([w * i / picos + (r() - .5) * w / picos * .6, base - alto * (.35 + r() * .65)]);
  g.beginPath(); g.moveTo(-10, base + 2); g.lineTo(-10, pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {                          // laderas con quiebres (no curvas lisas)
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], mx = (x1 + x2) / 2, my = Math.max(y1, y2) + alto * (.12 + r() * .25);
    g.lineTo(x1 + (mx - x1) * .45, y1 + (my - y1) * .5 + (r() - .5) * 6); g.lineTo(mx, my); g.lineTo(mx + (x2 - mx) * .5, my + (y2 - my) * .55 + (r() - .5) * 6); g.lineTo(x2, y2);
  }
  g.lineTo(w + 10, base + 2); g.closePath(); g.fillStyle = color; g.fill();
  if (nieve) {                                                           // nieve en las cumbres
    g.save(); g.clip(); g.fillStyle = nieve;
    for (const [x, y] of pts) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - alto * .22, y + alto * .2); g.lineTo(x - alto * .06, y + alto * .14); g.lineTo(x + alto * .05, y + alto * .22); g.lineTo(x + alto * .2, y + alto * .16); g.closePath(); g.fill(); }
    g.restore();
  }
}

// ────────────────────────────── ESCENAS ──────────────────────────────
const ESCENAS = {
  // Atardecer: sol sobre el mar, nubes iluminadas desde abajo, islas, reflejo que titila y gaviotas.
  atardecer: {
    crear(e) {
      const { w, h, ratio } = e, hy = h * .6, r = azar(7);
      e.s.hy = hy;
      e.s.islas = capa(w, h, ratio, (g) => {
        cordillera(g, w, hy + 1, h * .06, 3, 'rgba(120,52,120,.75)', 7);
        cordillera(g, w, hy + 1, h * .035, 11, 'rgba(62,22,72,.95)', 11);
      });
      const nube = (ancho, semilla) => capa(ancho * 1.3, ancho * .55, ratio, (g, cw, ch) => {
        const rr = azar(semilla);
        for (let i = 0; i < 16; i++) {
          const x = cw * (.12 + rr() * .76), y = ch * (.35 + rr() * .4), rad = ancho * (.1 + rr() * .17);
          const gr = g.createRadialGradient(x, y - rad * .3, rad * .1, x, y, rad);
          gr.addColorStop(0, 'rgba(255,236,226,.95)'); gr.addColorStop(.55, 'rgba(255,170,170,.7)'); gr.addColorStop(1, 'rgba(255,140,160,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
        }
        const base = g.createLinearGradient(0, ch * .3, 0, ch);                   // la base de la nube, encendida por el sol
        base.addColorStop(0, 'rgba(255,190,120,0)'); base.addColorStop(1, 'rgba(255,150,80,.55)');
        g.globalCompositeOperation = 'source-atop'; g.fillStyle = base; g.fillRect(0, 0, cw, ch);
      });
      e.s.nubes = Array.from({ length: 7 }, (_, i) => ({ img: nube(w * (.32 + r() * .32), 20 + i), x: r() * w * 1.4 - w * .2, y: h * (.05 + r() * .42), v: w * (.006 + r() * .012) * (i % 2 ? 1 : .6), a: .55 + r() * .4 }));
      e.s.aves = [];
    },
    dibujar(g, e, t, dt) {
      const { w, h, s } = e, hy = s.hy;
      cielo(g, w, hy, [[0, '#170f3d'], [.28, '#4a2475'], [.55, '#b0407c'], [.78, '#ff7a5a'], [1, '#ffcf8a']]);
      // sol con halo, rayos que giran lento y un leve pulso
      const sx = w * .5, sy = hy - w * .05, R = w * .17 * (1 + Math.sin(t * .8) * .015);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = .55; g.drawImage(brillo('rgba(255,170,90,1)'), sx - R * 5, sy - R * 5, R * 10, R * 10);
      g.save(); g.translate(sx, sy); g.rotate(t * .03);
      for (let i = 0; i < 16; i++) { g.rotate(TAU / 16); g.globalAlpha = .05 + .04 * Math.sin(t * 1.3 + i * 2); g.fillStyle = '#ffe0a0'; g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 5.5, -R * .2); g.lineTo(R * 5.5, R * .2); g.fill(); }
      g.restore(); g.globalCompositeOperation = 'source-over';
      g.save(); g.beginPath(); g.rect(0, 0, w, hy); g.clip();
      const disco = g.createRadialGradient(sx, sy - R * .3, R * .1, sx, sy, R);
      disco.addColorStop(0, '#fffbe8'); disco.addColorStop(.5, '#ffe28a'); disco.addColorStop(1, '#ff9e4a');
      g.globalAlpha = 1; g.fillStyle = disco; g.beginPath(); g.arc(sx, sy, R, 0, TAU); g.fill(); g.restore();
      // nubes que pasan (las lejanas, más lento)
      for (const n of s.nubes) { n.x -= n.v * dt; if (n.x < -n.img.width) n.x = w * 1.1; g.globalAlpha = n.a; g.drawImage(n.img, n.x, n.y, n.img.width / e.ratio, n.img.height / e.ratio); }
      // mar
      cielo(g, w, h, [[0, 'rgba(0,0,0,0)']]);
      const mar = g.createLinearGradient(0, hy, 0, h); mar.addColorStop(0, '#ff9a6a'); mar.addColorStop(.12, '#c95a86'); mar.addColorStop(.5, '#5d2c80'); mar.addColorStop(1, '#1a0f3a');
      g.globalAlpha = 1; g.fillStyle = mar; g.fillRect(0, hy, w, h - hy);
      g.drawImage(s.islas, 0, 0, w, h);
      // reflejo del sol: pinceladas horizontales que titilan, más anchas hacia abajo
      g.globalCompositeOperation = 'lighter';
      for (let y = hy + 2, i = 0; y < h; y += 4 + (y - hy) * .035, i++) {
        const k = (y - hy) / (h - hy), ancho = R * (.5 + k * 1.6) * (.55 + .45 * Math.sin(t * 2.2 + i * 1.7)), off = Math.sin(t * 1.4 + i * .9) * R * .25;
        g.globalAlpha = (1 - k) * .55; g.fillStyle = i % 3 ? '#ffd28a' : '#fff4d0'; g.fillRect(sx - ancho / 2 + off, y, ancho, 1.6 + k * 2);
      }
      // brillos sueltos en las olas
      const rr = azar(Math.floor(t * 3));
      for (let i = 0; i < 22; i++) { const x = rr() * w, y = hy + 6 + rr() * (h - hy - 10); g.globalAlpha = .35 * rr(); g.fillStyle = '#ffd9b0'; g.fillRect(x, y, 6 + rr() * 14, 1.2); }
      g.globalCompositeOperation = 'source-over';
      // gaviotas
      if (Math.random() < dt * .18) s.aves.push({ x: -20, y: h * (.12 + Math.random() * .25), v: w * (.06 + Math.random() * .05), f: Math.random() * TAU, k: .7 + Math.random() * .6 });
      s.aves = s.aves.filter((a) => (a.x += a.v * dt) < w + 30);
      g.strokeStyle = 'rgba(40,16,60,.85)'; g.lineWidth = 1.6; g.lineCap = 'round'; g.globalAlpha = 1;
      for (const a of s.aves) { const al = Math.sin(t * 9 + a.f) * 4 * a.k, L = 7 * a.k; g.beginPath(); g.moveTo(a.x - L, a.y - al); g.quadraticCurveTo(a.x - L * .4, a.y - 3 * a.k, a.x, a.y); g.quadraticCurveTo(a.x + L * .4, a.y - 3 * a.k, a.x + L, a.y - al); g.stroke(); }
    },
  },

  // Cristal helado: caverna de hielo con cristales facetados, haces de luz, destellos en las puntas y nieve con profundidad.
  cristal: {
    crear(e) {
      const { w, h, ratio } = e, r = azar(5);
      const prisma = (g, x, y, largo, ancho, ang, tono, luzA) => {             // cristal hexagonal: tres caras con su propia luz
        g.save(); g.translate(x, y); g.rotate(ang);
        const p = largo * .18;
        const caras = [
          [[-ancho / 2, 0], [-ancho / 4, -largo + p], [0, -largo], [0, 0]],
          [[0, 0], [0, -largo], [ancho / 4, -largo + p], [ancho / 2, 0]],
        ];
        caras.forEach((c, i) => {
          const gr = g.createLinearGradient(-ancho / 2, 0, ancho / 2, -largo);
          gr.addColorStop(0, `hsla(${tono},85%,${i ? 92 : 62}%,${luzA})`); gr.addColorStop(1, `hsla(${tono + 15},90%,${i ? 80 : 45}%,${luzA * .85})`);
          g.fillStyle = gr; g.beginPath(); c.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill();
        });
        g.strokeStyle = `rgba(255,255,255,${.75 * luzA})`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -largo); g.moveTo(-ancho / 2, 0); g.lineTo(-ancho / 4, -largo + p); g.lineTo(0, -largo); g.lineTo(ancho / 4, -largo + p); g.lineTo(ancho / 2, 0); g.stroke();
        g.restore();
        return [x + Math.sin(ang) * largo, y - Math.cos(ang) * largo];
      };
      e.s.puntas = [];
      const racimo = (g, x, y, n, escala, base, luzA, guardar) => {
        for (let i = 0; i < n; i++) {
          const ang = base + (r() - .5) * 1.1, largo = escala * (.5 + r() * .9), ancho = largo * (.22 + r() * .12);
          const tip = prisma(g, x + (r() - .5) * escala * .5, y, largo, ancho, ang, 190 + r() * 25, luzA);
          if (guardar) e.s.puntas.push(tip);
        }
      };
      e.s.fondo = capa(w, h, ratio, (g) => {
        racimo(g, w * .08, h * .95, 6, h * .3, .25, .45, false); racimo(g, w * .92, h * .9, 6, h * .32, -.25, .45, false);
        racimo(g, w * .5, -h * .02, 7, h * .2, Math.PI, .35, false);
      });
      e.s.frente = capa(w, h, ratio, (g) => {
        racimo(g, -w * .02, h * 1.02, 5, h * .34, .45, .95, true); racimo(g, w * 1.02, h * 1.02, 5, h * .36, -.45, .95, true);
        racimo(g, w * .2, -h * .02, 3, h * .14, Math.PI - .3, .9, true); racimo(g, w * .85, -h * .02, 3, h * .16, Math.PI + .3, .9, true);
      });
      e.s.escarcha = capa(w, h, ratio, (g) => {
        const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .75);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(235,248,255,.75)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      });
      e.s.copos = Array.from({ length: 70 }, () => ({ x: r() * w, y: r() * h, z: .3 + r() * .7, f: r() * TAU }));
    },
    dibujar(g, e, t, dt) {
      const { w, h, s } = e;
      const fondo = g.createRadialGradient(w * .5, h * .42, 0, w * .5, h * .5, Math.max(w, h) * .8);
      fondo.addColorStop(0, '#f2fdff'); fondo.addColorStop(.3, '#9fdcf7'); fondo.addColorStop(.7, '#2f7fbf'); fondo.addColorStop(1, '#0d2f62');
      g.fillStyle = fondo; g.fillRect(0, 0, w, h);
      // haces de luz que entran desde arriba y se mecen
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = w * (.15 + i * .18) + Math.sin(t * .25 + i) * w * .05, ancho = w * (.06 + .04 * Math.sin(t * .4 + i * 2));
        const gr = g.createLinearGradient(0, 0, 0, h * .9); gr.addColorStop(0, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = .55 + .45 * Math.sin(t * .7 + i * 1.3); g.fillStyle = gr;
        g.beginPath(); g.moveTo(x - ancho * .3, 0); g.lineTo(x + ancho * .3, 0); g.lineTo(x + ancho * 2 + w * .1, h * .9); g.lineTo(x - ancho + w * .1, h * .9); g.fill();
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.drawImage(s.fondo, 0, 0, w, h);
      // copos lejanos (detrás de los cristales del frente)
      for (const c of s.copos) {
        c.y += (12 + 30 * c.z) * dt * (h / 844); c.x += Math.sin(t * .8 + c.f) * 10 * c.z * dt;
        if (c.y > h + 5) { c.y = -5; c.x = Math.random() * w; }
        if (c.z < .6) { g.globalAlpha = .5 * c.z + .2; g.fillStyle = '#fff'; g.beginPath(); g.arc(c.x, c.y, 1 + c.z * 1.5, 0, TAU); g.fill(); }
      }
      g.globalAlpha = 1; g.drawImage(s.frente, 0, 0, w, h);
      // destellos que se encienden en las puntas de los cristales
      g.globalCompositeOperation = 'lighter';
      s.puntas.forEach(([x, y], i) => { const k = Math.max(0, Math.sin(t * 1.6 + i * 2.7)); if (k > .6) destello(g, x, y, 2.4 + 3 * (k - .6), 'rgba(190,240,255,1)', (k - .6) * 2.5); });
      g.globalCompositeOperation = 'source-over';
      for (const c of s.copos) if (c.z >= .6) { g.globalAlpha = .9; g.drawImage(brillo('rgba(255,255,255,1)'), c.x - 3 * c.z, c.y - 3 * c.z, 6 * c.z, 6 * c.z); g.fillStyle = '#fff'; g.beginPath(); g.arc(c.x, c.y, c.z * 1.6, 0, TAU); g.fill(); }
      g.globalAlpha = 1; g.drawImage(s.escarcha, 0, 0, w, h);
    },
  },

  // Aurora boreal: cortinas de luz que ondulan, estrellas, cordillera nevada y un lago que las refleja.
  aurora: {
    crear(e) {
      const { w, h, ratio } = e, r = azar(9);
      e.s.estrellas = capa(w, h, ratio, (g) => { for (let i = 0; i < 260; i++) { g.globalAlpha = .2 + r() * .7; g.fillStyle = r() < .2 ? '#cfe2ff' : '#fff'; g.beginPath(); g.arc(r() * w, r() * h * .7, r() * 1.1 + .2, 0, TAU); g.fill(); } });
      e.s.brillan = Array.from({ length: 30 }, () => ({ x: r() * w, y: r() * h * .6, f: r() * TAU, v: .8 + r() * 2 }));
      const tira = (c1, c2) => capa(4, 256, 1, (g) => { const gr = g.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.06, c1); gr.addColorStop(.3, c2); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); });
      e.s.tiras = [tira('rgba(170,255,210,1)', 'rgba(40,255,150,.75)'), tira('rgba(120,255,230,1)', 'rgba(30,200,255,.6)'), tira('rgba(255,170,240,.95)', 'rgba(150,80,255,.6)')];
      e.s.lago = h * .8;
      e.s.montes = capa(w, h, ratio, (g) => {
        cordillera(g, w, e.s.lago + 1, h * .17, 21, '#0a1d33', 6, 'rgba(200,230,255,.55)');
        cordillera(g, w, e.s.lago + 1, h * .09, 34, '#04101f', 10, 'rgba(160,200,240,.3)');
        for (let x = 0; x < w; x += 7 + r() * 5) {                         // pinos en la orilla
          const a = h * (.012 + r() * .022); g.fillStyle = '#020a14'; g.beginPath(); g.moveTo(x, e.s.lago + 1); g.lineTo(x + a * .35, e.s.lago - a); g.lineTo(x + a * .7, e.s.lago + 1); g.fill();
        }
      });
    },
    cortinas(g, e, t, espejo) {
      const { w, h, s } = e;
      const ribbons = [[.2, .9, 0, 1], [.27, 1.15, 1.7, .8], [.33, .8, 3.1, .6]];
      g.globalCompositeOperation = 'lighter';
      ribbons.forEach(([base, vel, fase, fuerza], k) => {
        const img = s.tiras[k], paso = Math.max(2, w / 140);
        for (let x = -10; x < w + 10; x += paso) {
          const y = h * base + Math.sin(x / w * 5 + t * .35 * vel + fase) * h * .05 + Math.sin(x / w * 13 - t * .6 * vel + fase) * h * .018;
          const largo = h * (.16 + .1 * Math.sin(x / w * 7 + t * .5 + fase)) * fuerza;
          const rayos = .45 + .55 * Math.pow(Math.abs(Math.sin(x * .09 + t * 1.3 * vel + fase)), 3);   // los «rayos» verticales de la cortina
          g.globalAlpha = rayos * (espejo ? .28 : .75) * fuerza;
          if (espejo) { const ly = s.lago + (s.lago - y) * .55; g.drawImage(img, x + Math.sin(t * 2 + x * .05) * 1.5, s.lago, paso + .6, (ly - s.lago) + largo * .45); }
          else g.drawImage(img, x, y - largo, paso + .6, largo + h * .04);
        }
      });
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    },
    dibujar(g, e, t, dt) {
      const { w, h, s } = e;
      cielo(g, w, h, [[0, '#01040c'], [.5, '#05162b'], [.8, '#0b2940'], [1, '#030b16']]);
      g.drawImage(s.estrellas, 0, 0, w, h);
      for (const b of s.brillan) { const k = .5 + .5 * Math.sin(t * b.v + b.f); g.globalAlpha = k; g.drawImage(brillo('rgba(220,240,255,1)'), b.x - 3, b.y - 3, 6, 6); }
      estrellaFugaz(g, e, dt, .006);
      this.cortinas(g, e, t, false);
      // lago: oscuro con el reflejo de la aurora y ondas
      const lago = g.createLinearGradient(0, s.lago, 0, h); lago.addColorStop(0, '#06233a'); lago.addColorStop(1, '#010810');
      g.globalAlpha = 1; g.fillStyle = lago; g.fillRect(0, s.lago, w, h - s.lago);
      this.cortinas(g, e, t, true);
      g.globalCompositeOperation = 'lighter';
      for (let y = s.lago + 3, i = 0; y < h; y += 5 + (y - s.lago) * .06, i++) { g.globalAlpha = .08; g.fillStyle = '#9fffe0'; g.fillRect((Math.sin(t + i) * .5 + .5) * w * .6, y, w * .25, 1); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.drawImage(s.montes, 0, 0, w, h);
    },
  },

  // Galaxia: una galaxia espiral de verdad (más de mil estrellas que giran, las de adentro más rápido), nebulosas y fugaces.
  galaxia: {
    crear(e) {
      const { w, h, ratio } = e, r = azar(13), R = Math.min(w * .62, h * .4);
      e.s.R = R;
      e.s.fondo = capa(w, h, ratio, (g) => {
        for (let i = 0; i < 9; i++) {                                         // nebulosas
          const x = r() * w, y = r() * h, rad = Math.max(w, h) * (.2 + r() * .3), c = ['120,60,220', '40,110,230', '230,70,170', '60,200,220'][i % 4];
          const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${c},.28)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        }
        for (let i = 0; i < 380; i++) { g.globalAlpha = .15 + r() * .8; g.fillStyle = ['#fff', '#cfe0ff', '#ffe6f6'][i % 3]; g.beginPath(); g.arc(r() * w, r() * h, r() * 1.1 + .15, 0, TAU); g.fill(); }
      });
      e.s.estrellas = Array.from({ length: 1500 }, () => {
        const brazo = r() < .5 ? 0 : 1, d = Math.pow(r(), .55) * R, ang = brazo * Math.PI + Math.log(1 + d / R * 8) * 1.65 + (r() - .5) * (.35 + d / R * .5);
        const k = d / R, color = k < .18 ? '255,240,210' : r() < .55 ? '170,200,255' : r() < .5 ? '255,160,215' : '255,255,255';
        return { d, ang, w: .55 / (k + .25), s: .4 + r() * (k < .2 ? 1.6 : 1.1), a: .35 + r() * .65, c: `rgba(${color},1)` };
      });
    },
    dibujar(g, e, t, dt) {
      const { w, h, s } = e;
      g.fillStyle = '#03030d'; g.fillRect(0, 0, w, h);
      g.save(); g.translate(Math.sin(t * .02) * w * .03, Math.cos(t * .017) * h * .02); g.drawImage(s.fondo, -w * .03, -h * .02, w * 1.06, h * 1.04); g.restore();
      const cx = w * .5, cy = h * .4, inc = .42, giro = -.45;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = .9; g.drawImage(brillo('rgba(255,225,180,1)'), cx - s.R * .55, cy - s.R * .55 * inc - s.R * .1, s.R * 1.1, s.R * 1.1 * inc + s.R * .2);
      g.globalAlpha = .5; g.drawImage(brillo('rgba(150,120,255,1)'), cx - s.R * 1.2, cy - s.R * .6, s.R * 2.4, s.R * 1.2);
      const cg = Math.cos(giro), sg = Math.sin(giro);
      for (const p of s.estrellas) {
        const a = p.ang + t * p.w * .12, x0 = Math.cos(a) * p.d, y0 = Math.sin(a) * p.d * inc;
        const x = cx + x0 * cg - y0 * sg, y = cy + x0 * sg + y0 * cg;
        g.globalAlpha = p.a; g.fillStyle = p.c; g.fillRect(x, y, p.s, p.s);
      }
      g.globalAlpha = 1; g.drawImage(brillo('rgba(255,250,235,1)'), cx - s.R * .14, cy - s.R * .14, s.R * .28, s.R * .28);
      g.globalCompositeOperation = 'source-over';
      estrellaFugaz(g, e, dt, .012, 'rgba(210,230,255,1)');
    },
  },

  // Holográfico: lámina iridiscente que fluye, rejilla hexagonal con un brillo que la recorre, prismas flotantes y destellos.
  holo: {
    crear(e) {
      const { w, h, ratio } = e, r = azar(17), L = Math.max(14, w / 13);
      e.s.L = L; e.s.hex = [];
      for (let y = 0, fila = 0; y < h + L; y += L * 1.5, fila++) for (let x = (fila % 2) * L * .866; x < w + L; x += L * 1.732) e.s.hex.push([x, y]);
      e.s.rejilla = capa(w, h, ratio, (g) => { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; for (const [x, y] of e.s.hex) this.hexagono(g, x, y, L * .96); });
      e.s.lineas = capa(w, h, ratio, (g) => { g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); });
      e.s.prismas = Array.from({ length: 9 }, () => ({ x: r() * w, y: r() * h, z: .5 + r() * .8, a: r() * TAU, v: (r() - .5) * .6, lados: r() < .5 ? 3 : 6 }));
    },
    hexagono(g, x, y, L) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; i ? g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L) : g.moveTo(x + Math.cos(a) * L, y + Math.sin(a) * L); } g.closePath(); g.stroke(); },
    dibujar(g, e, t, dt) {
      const { w, h, s } = e;
      g.fillStyle = '#f3e8ff'; g.fillRect(0, 0, w, h);
      // manchas de color que cambian de tono y se mueven: la lámina holográfica
      for (let i = 0; i < 6; i++) {
        const x = w * (.5 + .45 * Math.sin(t * .13 * (i + 1) + i * 1.7)), y = h * (.5 + .45 * Math.cos(t * .11 * (i + 2) + i)), rad = Math.max(w, h) * .55;
        const hue = (t * 22 + i * 60) % 360, gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `hsla(${hue},100%,72%,.75)`); gr.addColorStop(1, `hsla(${hue},100%,72%,0)`); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
      // reflejo metálico en diagonal
      const banda = ((t * .12) % 1.6 - .3) * (w + h);
      const gr = g.createLinearGradient(banda - w * .3, 0, banda + w * .3, h * .5);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.globalAlpha = .55; g.drawImage(s.rejilla, 0, 0, w, h); g.globalAlpha = 1;
      // los hexágonos cerca de la onda se encienden
      const onda = ((t * .18) % 1.4 - .2) * (w + h);
      g.lineWidth = 1.6;
      for (const [x, y] of s.hex) { const d = Math.abs(x + y - onda); if (d < s.L * 3) { g.strokeStyle = `hsla(${(x + t * 60) % 360},100%,85%,${(1 - d / (s.L * 3)) * .95})`; this.hexagono(g, x, y, s.L * .92); } }
      // prismas que flotan y giran, con borde de arcoíris
      for (const p of s.prismas) {
        p.y -= 10 * p.z * dt * (h / 844); p.a += p.v * dt; if (p.y < -40) { p.y = h + 40; p.x = Math.random() * w; }
        const R = s.L * 1.1 * p.z; g.save(); g.translate(p.x, p.y); g.rotate(p.a);
        g.beginPath(); for (let i = 0; i < p.lados; i++) { const a = i * TAU / p.lados; i ? g.lineTo(Math.cos(a) * R, Math.sin(a) * R) : g.moveTo(Math.cos(a) * R, Math.sin(a) * R); } g.closePath();
        const borde = g.createLinearGradient(-R, -R, R, R); for (let k = 0; k <= 6; k++) borde.addColorStop(k / 6, `hsl(${(k * 60 + t * 80) % 360},100%,70%)`);
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fill(); g.strokeStyle = borde; g.lineWidth = 2; g.stroke(); g.restore();
      }
      g.globalAlpha = .5; g.drawImage(s.lineas, 0, (t * 20) % 3 - 3, w, h);
      const barrido = (t * .25 % 1.3) * h; const sc = g.createLinearGradient(0, barrido - 40, 0, barrido + 40); sc.addColorStop(0, 'rgba(255,255,255,0)'); sc.addColorStop(.75, 'rgba(255,255,255,.22)'); sc.addColorStop(.8, 'rgba(255,255,255,.3)'); sc.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = 1; g.fillStyle = sc; g.fillRect(0, barrido - 40, w, 80);
      const rr = azar(Math.floor(t * 4)); for (let i = 0; i < 7; i++) destello(g, rr() * w, rr() * h, 1.6 + rr() * 2.4, `hsla(${rr() * 360},100%,80%,1)`, .5 + rr() * .5);
    },
  },

  // Bóveda de oro: puerta de bóveda con su volante girando, haces de luz dorada, una montaña de lingotes y monedas que caen.
  boveda: {
    crear(e) {
      const { w, h, ratio } = e, r = azar(23);
      e.s.muro = capa(w, h, ratio, (g) => {
        cielo(g, w, h, [[0, '#120a02'], [.4, '#2e1d06'], [1, '#0d0701']]);
        g.strokeStyle = 'rgba(255,200,90,.07)'; g.lineWidth = 1;
        for (let y = 0; y < h; y += h / 14) for (let x = (Math.round(y / (h / 14)) % 2) * w / 8; x < w; x += w / 4) { g.strokeRect(x + 2, y + 2, w / 4 - 4, h / 14 - 4); g.fillStyle = 'rgba(255,210,120,.12)'; for (const [a, b] of [[6, 6], [w / 4 - 10, 6], [6, h / 14 - 10], [w / 4 - 10, h / 14 - 10]]) { g.beginPath(); g.arc(x + a, y + b, 1.4, 0, TAU); g.fill(); } }
        // puerta de la bóveda (lo fijo)
        const cx = w * .5, cy = h * .3, R = Math.min(w * .42, h * .2);
        const anillo = (rad, c1, c2, ancho) => { const gr = g.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad); gr.addColorStop(0, c1); gr.addColorStop(.5, c2); gr.addColorStop(1, c1); g.strokeStyle = gr; g.lineWidth = ancho; g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke(); };
        const disco = g.createRadialGradient(cx - R * .3, cy - R * .3, R * .1, cx, cy, R); disco.addColorStop(0, '#6b4a14'); disco.addColorStop(1, '#2a1a04');
        g.fillStyle = disco; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
        anillo(R, '#7a5410', '#ffe08a', R * .1); anillo(R * .78, '#5a3c0a', '#f5c64a', R * .05); anillo(R * .5, '#4a3008', '#e8b030', R * .035);
        for (let i = 0; i < 20; i++) { const a = i * TAU / 20; const x = cx + Math.cos(a) * R * .9, y = cy + Math.sin(a) * R * .9; const b = g.createRadialGradient(x - 1, y - 1, 0, x, y, R * .04); b.addColorStop(0, '#fff3c0'); b.addColorStop(1, '#8a5a08'); g.fillStyle = b; g.beginPath(); g.arc(x, y, R * .035, 0, TAU); g.fill(); }
        e.s.puerta = { cx, cy, R };
      });
      // lingotes apilados (vista isométrica)
      e.s.pila = capa(w, h, ratio, (g) => {
        const L = w / 6.2, A = L * .42, F = L * .26, filas = 6, base = h * 1.0;
        e.s.brillos = [];
        for (let f = 0; f < filas; f++) {
          const n = filas + 2 - f, y = base - f * (A * .55 + F) - F;
          for (let i = 0; i < n; i++) {
            const x = w / 2 + (i - (n - 1) / 2) * L * .98 + (r() - .5) * 3;
            const top = [[x - L * .4, y - A * .5], [x + L * .4, y - A * .5], [x + L * .48, y], [x - L * .48, y]];
            const frente = [[x - L * .48, y], [x + L * .48, y], [x + L * .48, y + F], [x - L * .48, y + F]];
            const gt = g.createLinearGradient(x - L * .4, y - A * .5, x + L * .4, y); gt.addColorStop(0, '#fff6c2'); gt.addColorStop(.45, '#ffd34a'); gt.addColorStop(1, '#e09a10');
            const gf = g.createLinearGradient(0, y, 0, y + F); gf.addColorStop(0, '#d48c08'); gf.addColorStop(1, '#7a4a02');
            for (const [poly, fill] of [[frente, gf], [top, gt]]) { g.fillStyle = fill; g.beginPath(); poly.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill(); g.strokeStyle = 'rgba(90,50,0,.6)'; g.lineWidth = 1; g.stroke(); }
            g.strokeStyle = 'rgba(160,100,10,.55)'; g.strokeRect(x - L * .26, y - A * .38, L * .52, A * .26);
            g.fillStyle = 'rgba(120,70,0,.55)'; g.font = `800 ${Math.max(6, F * .5)}px system-ui`; g.textAlign = 'center'; g.fillText('999.9', x, y + F * .72);
            e.s.brillos.push([x + (r() - .5) * L * .5, y - A * .3]);
          }
        }
      });
      e.s.monedas = []; e.s.polvo = Array.from({ length: 50 }, () => ({ x: r() * w, y: r() * h, v: 6 + r() * 14, f: r() * TAU }));
    },
    dibujar(g, e, t, dt) {
      const { w, h, s } = e, { cx, cy, R } = s.puerta;
      g.drawImage(s.muro, 0, 0, w, h);
      // volante de la puerta (gira) y su centro
      g.save(); g.translate(cx, cy); g.rotate(t * .25);
      g.strokeStyle = '#f5c64a'; g.lineCap = 'round'; g.lineWidth = R * .07;
      for (let i = 0; i < 6; i++) { g.rotate(TAU / 6); g.beginPath(); g.moveTo(R * .1, 0); g.lineTo(R * .42, 0); g.stroke(); g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(R * .45, 0, R * .055, 0, TAU); g.fill(); }
      g.restore();
      const hub = g.createRadialGradient(cx - R * .05, cy - R * .05, 0, cx, cy, R * .14); hub.addColorStop(0, '#fff8d0'); hub.addColorStop(1, '#b8780a');
      g.fillStyle = hub; g.beginPath(); g.arc(cx, cy, R * .13, 0, TAU); g.fill();
      // haces de luz dorada
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * .22 + Math.sin(t * .3 + i) * .05, L = h * 1.1;
        g.globalAlpha = .07 + .05 * Math.sin(t * .8 + i * 1.7); g.fillStyle = '#ffd36a';
        g.beginPath(); g.moveTo(w * .5, -h * .05); g.lineTo(w * .5 + Math.cos(a + .05) * -L, -h * .05 - Math.sin(a + .05) * -L); g.lineTo(w * .5 + Math.cos(a - .05) * -L, -h * .05 - Math.sin(a - .05) * -L); g.fill();
      }
      g.globalAlpha = .5; g.drawImage(brillo('rgba(255,200,90,1)'), cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      // monedas que caen girando
      if (Math.random() < dt * 2.2) s.monedas.push({ x: w * (.1 + Math.random() * .8), y: -20, v: h * (.25 + Math.random() * .2), g: Math.random() * TAU, z: .6 + Math.random() * .7 });
      s.monedas = s.monedas.filter((m) => (m.y += m.v * dt) < h * .8);
      for (const m of s.monedas) {
        const r = w * .022 * m.z, k = Math.cos(t * 7 + m.g); g.save(); g.translate(m.x, m.y); g.scale(Math.max(.12, Math.abs(k)), 1);
        g.fillStyle = k > 0 ? '#ffd23a' : '#d8960e'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.strokeStyle = '#8a5a08'; g.lineWidth = r * .18; g.stroke();
        g.strokeStyle = '#fff3b0'; g.lineWidth = r * .1; g.beginPath(); g.arc(0, 0, r * .6, 0, TAU); g.stroke(); g.restore();
      }
      g.drawImage(s.pila, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      s.brillos.forEach(([x, y], i) => { const k = Math.sin(t * 1.3 + i * 2.1); if (k > .82) destello(g, x, y, 2 + (k - .82) * 20, 'rgba(255,230,140,1)', (k - .82) * 5); });
      for (const p of s.polvo) { p.y -= p.v * dt; p.x += Math.sin(t + p.f) * 6 * dt; if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; } g.globalAlpha = .4 + .4 * Math.sin(t * 3 + p.f); g.drawImage(brillo('rgba(255,215,110,1)'), p.x - 3, p.y - 3, 6, 6); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    },
  },

  // Palacio de diamante: un brillante gigante en 3D que gira, haces de arcoíris, arcos de palacio y un piso que lo refleja.
  prisma: {
    crear(e) {
      const { w, h, ratio } = e, r = azar(31), n = 8, V = [];
      // brillante: mesa (arriba), corona, cintura y pabellón que termina en punta
      for (let i = 0; i < n; i++) { const a = i * TAU / n; V.push([Math.cos(a) * .52, -.42, Math.sin(a) * .52]); }                   // 0-7 mesa
      for (let i = 0; i < n * 2; i++) { const a = (i + .5) * TAU / (n * 2); V.push([Math.cos(a), -.08, Math.sin(a)]); }               // 8-23 cintura
      V.push([0, 1.05, 0]);                                                                                                          // 24 punta
      const F = [];
      F.push([0, 1, 2, 3, 4, 5, 6, 7]);                                                                                             // mesa
      for (let i = 0; i < n; i++) { const a = i, b = (i + 1) % n, c = 8 + i * 2, d = 8 + i * 2 + 1, e2 = 8 + ((i * 2 + 2) % 16); F.push([a, d, c]); F.push([a, b, d]); F.push([b, e2, d]); }
      for (let i = 0; i < 16; i++) F.push([8 + i, 8 + ((i + 1) % 16), 24]);
      e.s.V = V; e.s.F = F;
      e.s.palacio = capa(w, h, ratio, (g) => {
        const piso = h * .8;
        const gp = g.createLinearGradient(0, piso, 0, h); gp.addColorStop(0, 'rgba(120,170,255,.35)'); gp.addColorStop(1, 'rgba(10,20,70,.9)'); g.fillStyle = gp; g.fillRect(0, piso, w, h - piso);
        for (let i = 0; i <= 6; i++) {                                          // columnas y arcos
          const x = w * i / 6, ancho = w * .05;
          const gc = g.createLinearGradient(x - ancho, 0, x + ancho, 0); gc.addColorStop(0, 'rgba(40,60,160,.9)'); gc.addColorStop(.5, 'rgba(150,200,255,.55)'); gc.addColorStop(1, 'rgba(30,40,130,.9)');
          g.fillStyle = gc; g.fillRect(x - ancho / 2, h * .42, ancho, piso - h * .42);
          g.fillStyle = 'rgba(190,225,255,.6)'; g.fillRect(x - ancho * .7, h * .42 - 4, ancho * 1.4, 5); g.fillRect(x - ancho * .7, piso - 5, ancho * 1.4, 5);
          if (i < 6) { g.strokeStyle = 'rgba(160,210,255,.55)'; g.lineWidth = 3; g.beginPath(); g.arc(x + w / 12, h * .42, w / 12, Math.PI, 0); g.stroke(); }
        }
        g.strokeStyle = 'rgba(160,210,255,.25)'; g.lineWidth = 1;
        for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(w / 2, piso); g.lineTo(w / 2 + i * w * .2, h); g.stroke(); }
        for (let y = piso; y < h; y += (y - piso) * .25 + 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      });
      e.s.chispas = Array.from({ length: 40 }, () => ({ x: r() * w, y: r() * h * .8, f: r() * TAU, v: 1 + r() * 2 }));
    },
    diamante(g, e, t, cx, cy, S, alfa, espejo) {
      const { V, F } = e.s, ay = t * .5, ax = .38 + Math.sin(t * .3) * .08;
      const ca = Math.cos(ay), sa = Math.sin(ay), cb = Math.cos(ax), sb = Math.sin(ax);
      const P = V.map(([x, y, z]) => { const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; const y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb; return [cx + x1 * S, cy + (espejo ? -y1 : y1) * S * (espejo ? .45 : 1), z2]; });
      const caras = F.map((f) => {
        const [a, b, c] = f.map((i) => P[i]);
        const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        return { f, z: f.reduce((s, i) => s + P[i][2], 0) / f.length, nz };
      }).filter((c) => (espejo ? c.nz > 0 : c.nz < 0)).sort((p, q) => p.z - q.z);
      for (const { f, nz, z } of caras) {
        const luzK = Math.min(1, Math.abs(nz) / (S * S * .35)), hue = (f[0] * 47 + t * 50) % 360, fuego = (f[0] + f.length) % 3 === 0;
        g.globalAlpha = alfa;
        g.fillStyle = fuego ? `hsla(${hue},95%,${60 + luzK * 25}%,.85)` : `hsla(${200 + luzK * 25},90%,${45 + luzK * 45}%,.88)`;
        g.beginPath(); f.forEach((i, j) => (j ? g.lineTo(P[i][0], P[i][1]) : g.moveTo(P[i][0], P[i][1]))); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.stroke();
      }
      if (!espejo) { const k = Math.max(0, Math.sin(t * 2.3)); if (k > .7) destello(g, P[(Math.floor(t) * 5) % 16 + 8][0], P[(Math.floor(t) * 5) % 16 + 8][1], 3 + (k - .7) * 14, 'rgba(255,255,255,1)', (k - .7) * 3.3); }
    },
    dibujar(g, e, t, dt) {
      const { w, h, s } = e, cx = w * .5, cy = h * .3, S = Math.min(w * .28, h * .15);
      const fondo = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .9); fondo.addColorStop(0, '#3c52c8'); fondo.addColorStop(.45, '#121b5c'); fondo.addColorStop(1, '#040719');
      g.fillStyle = fondo; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {                                           // haces de arcoíris que salen del brillante
        const a = i * TAU / 14 + t * .08, L = Math.max(w, h) * 1.2;
        g.globalAlpha = .1 + .06 * Math.sin(t * 1.5 + i); g.fillStyle = `hsl(${(i * 26 + t * 30) % 360},100%,65%)`;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - .035) * L, cy + Math.sin(a - .035) * L); g.lineTo(cx + Math.cos(a + .035) * L, cy + Math.sin(a + .035) * L); g.fill();
      }
      g.globalAlpha = .8; g.drawImage(brillo('rgba(150,200,255,1)'), cx - S * 3, cy - S * 3, S * 6, S * 6);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1; g.drawImage(s.palacio, 0, 0, w, h);
      this.diamante(g, e, t, cx, h * .8 + S * .5, S, .25, true);                // reflejo en el piso
      this.diamante(g, e, t, cx, cy, S, 1, false);
      g.globalCompositeOperation = 'lighter';
      for (const c of s.chispas) { const k = Math.sin(t * c.v + c.f); if (k > .5) destello(g, c.x, c.y, 1.4 + (k - .5) * 5, `hsla(${(c.f * 57 + t * 40) % 360},100%,80%,1)`, (k - .5) * 2); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    },
  },
};
export const FONDOS_NUEVOS = Object.keys(ESCENAS);

// ────────────────────────────── MOTOR ──────────────────────────────
export class Fondos {
  #vivos = new Set(); #raf = 0; #ultimo = 0;

  constructor() {
    const revisar = () => this.#buscar();
    new MutationObserver(revisar).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-bg', 'class'] });
    addEventListener('resize', () => { for (const v of this.#vivos) v.medida = ''; });
    this.#buscar();
  }

  #buscar() {
    for (const el of document.querySelectorAll('.bgx[data-bg]')) {
      const id = el.dataset.bg, ya = el.__v2fondo;
      if (ya && ya.id === id) continue;
      if (ya) { ya.cv.remove(); this.#vivos.delete(ya); el.__v2fondo = null; }
      if (!ESCENAS[id]) continue;
      const cv = document.createElement('canvas'); cv.className = 'v2bg'; cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv);
      const v = { el, id, cv, g: cv.getContext('2d'), e: null, medida: '', t: Math.random() * 100 };
      el.__v2fondo = v; this.#vivos.add(v);
    }
    for (const v of this.#vivos) if (!v.el.isConnected) this.#vivos.delete(v);
    if (this.#vivos.size && !this.#raf) { this.#ultimo = performance.now(); this.#raf = requestAnimationFrame((t) => this.#cuadro(t)); }
  }

  #visible(v) {
    const r = v.el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
    if (v.el.id === 'theme' && !document.body.classList.contains('themed')) return null;
    return r;
  }

  #cuadro(ahora) {
    this.#raf = 0;
    if (!this.#vivos.size) return;
    this.#raf = requestAnimationFrame((t) => this.#cuadro(t));
    if (ahora - this.#ultimo < 32 || document.hidden) return;                          // ~30 cuadros por segundo
    const dt = Math.min(.1, (ahora - this.#ultimo) / 1000); this.#ultimo = ahora;
    const quieto = document.body.classList.contains('lite') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const v of this.#vivos) {
      const r = this.#visible(v); if (!r) continue;
      const grande = v.el.id === 'theme', ratio = Math.min(grande ? 1.5 : 2, devicePixelRatio || 1), medida = `${Math.round(r.width)}x${Math.round(r.height)}@${ratio}`;
      if (medida !== v.medida) {
        v.medida = medida; v.cv.width = Math.round(r.width * ratio); v.cv.height = Math.round(r.height * ratio);
        v.e = { w: r.width, h: r.height, ratio, s: {} }; ESCENAS[v.id].crear(v.e); v.pintado = false;
      }
      if (quieto && v.pintado) continue;                                              // modo liviano: un cuadro quieto y listo
      v.t += dt;
      const g = v.g; g.setTransform(ratio, 0, 0, ratio, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      try { ESCENAS[v.id].dibujar(g, v.e, v.t, dt); } catch (err) { console.error('fondo ' + v.id, err); this.#vivos.delete(v); }
      v.pintado = true;
    }
  }
}
