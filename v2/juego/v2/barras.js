// VISTA · efectos premium de las barras. Cada barra tiene su cuerpo en CSS (v2.css) y aquí sus efectos en el canvas
// del juego (los mismos que animan las vistas previas de la tienda). Se registran en el catálogo de efectos de la V1
// (PAD_FX): draw(g, st, L, T, w, h, t, oscuro, dt) pinta cada cuadro sobre el rectángulo (L, T, w, h) de la barra,
// y onHit(st, x, y, L, T, w, h) es el rebote. `st` es el estado propio de cada barra dibujada (juego o vista previa).
const TAU = Math.PI * 2, R = Math.random;
const cache = new Map();
function sprite(clave, tam, pintar) { let s = cache.get(clave); if (!s) { s = document.createElement('canvas'); s.width = s.height = tam; pintar(s.getContext('2d'), tam); cache.set(clave, s); } return s; }
/** Bola de luz: centro de un color, borde transparente. */
const luz = (c0, c1 = c0, tam = 64) => sprite(`luz${c0}${c1}`, tam, (g, n) => { const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); r.addColorStop(0, c0); r.addColorStop(.4, c1); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, n, n); });
const pinta = (g, img, x, y, s, a) => { g.globalAlpha = a; g.drawImage(img, x - s / 2, y - s / 2, s, s); };
/** Aura de la barra: el halo achatado (una elipse pegada a la barra). Antes era un cuadrado del ancho de la barra: ~3× más píxeles. */
const aura = (g, img, cx, cy, ancho, alto, a) => { g.globalAlpha = a; g.drawImage(img, cx - ancho / 2, cy - alto / 2, ancho, alto); };
/** Tono redondeado a 12°: los halos de color se guardan en caché por color y así se reusan (no se crea uno nuevo por cuadro). */
const tono = (h) => Math.round(((h % 360) + 360) % 360 / 12) * 12;
/**
 * Calidad automática de cada barra (1 = completa). Cada barra mira su propio ritmo de cuadros: si el teléfono no da abasto
 * (promedio bajo ~54 cuadros por segundo, sostenido), baja la cantidad de partículas y luces; si sobra, de a poco la recupera.
 */
function calidad(st, dt) {
  const ms = dt * 1000; if (st.q == null) { st.q = 1; st.ema = 16.7; st.malos = 0; st.buenos = 0; }
  st.ema = st.ema * .9 + Math.min(ms, 80) * .1;
  if (st.ema > 18.5) { st.buenos = 0; if (++st.malos > 24) { st.q = Math.max(.3, st.q - .2); st.malos = 0; st.ema = 17; } }
  else if (st.ema < 17.8) { st.malos = 0; if (++st.buenos > 300 && st.q < 1) { st.q = Math.min(1, st.q + .1); st.buenos = 0; } }
  return st.q;
}
const modo = (g, oscuro) => { g.globalCompositeOperation = oscuro ? 'lighter' : 'source-over'; };
const lista = (st, k) => st[k] || (st[k] = []);
function avanzar(arr, dt, fn) { for (let i = arr.length - 1; i >= 0; i--) { const p = arr[i]; p.vida -= dt / p.dura; if (p.vida <= 0) { arr.splice(i, 1); continue; } fn(p, i); } }
function estrella(g, x, y, r) { g.beginPath(); g.moveTo(x, y - r * 2); g.quadraticCurveTo(x, y, x + r * 2, y); g.quadraticCurveTo(x, y, x, y + r * 2); g.quadraticCurveTo(x, y, x - r * 2, y); g.quadraticCurveTo(x, y, x, y - r * 2); g.fill(); }
function anillo(st, x, y, color, grande = 1) { lista(st, 'anillos').push({ x, y, color, vida: 1, dura: .55 * grande, g: grande }); }
function anillos(g, st, dt, h) {
  avanzar(lista(st, 'anillos'), dt, (a) => {
    const k = 1 - a.vida, rx = (h * 1.2 + k * h * 7) * a.g;
    g.globalAlpha = a.vida * .9; g.strokeStyle = a.color; g.lineWidth = 1 + a.vida * 3.5;
    g.beginPath(); g.ellipse(a.x, a.y, rx * 1.6, rx * .42, 0, 0, TAU); g.stroke();
  });
}
/** Rayo con desplazamiento de punto medio: devuelve la lista de puntos de (x1,y1) a (x2,y2). */
function rayo(x1, y1, x2, y2, desv, nivel = 6) {
  let pts = [[x1, y1], [x2, y2]];
  for (let n = 0; n < nivel; n++) {
    const nuevo = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; nuevo.push([(a[0] + b[0]) / 2 + (R() - .5) * desv, (a[1] + b[1]) / 2 + (R() - .5) * desv]); nuevo.push(b); }
    pts = nuevo; desv *= .55;
  }
  return pts;
}
function trazo(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }

// ───────────────────────────── LLAMARADA ─────────────────────────────
// Fuego de partículas: cientos de lenguas de luz que suben con turbulencia, pasan de blanco a amarillo, naranjo y rojo,
// y se apagan en humo; brasas con estela y un resplandor que respira bajo todo.
const FUEGO = ['rgba(255,255,235,1)', 'rgba(255,236,140,1)', 'rgba(255,170,40,1)', 'rgba(255,90,15,1)', 'rgba(190,30,5,1)'];
const fuegoSprite = (i) => luz(FUEGO[i], FUEGO[i].replace(',1)', ',.55)'));
// Lenguas de fuego: cada una es una forma de llama (base ancha, punta que se dobla) con degradado propio, que crece,
// se parte y se mueve con ruido. Tres capas: rojo oscuro atrás, naranja al medio y un núcleo amarillo-blanco abajo.
const CAPAS_FUEGO = [
  { ancho: 1, alto: 1, c: ['rgba(255,70,10,.95)', 'rgba(220,30,5,.75)', 'rgba(120,10,0,0)'] },
  { ancho: .68, alto: .72, c: ['rgba(255,190,40,1)', 'rgba(255,110,15,.85)', 'rgba(255,60,0,0)'] },
  { ancho: .38, alto: .42, c: ['rgba(255,255,225,1)', 'rgba(255,230,110,.9)', 'rgba(255,170,40,0)'] },
];
const ruido = (x) => Math.sin(x) * .5 + Math.sin(x * 2.31 + 1.3) * .3 + Math.sin(x * 4.7 + 2.1) * .2;
/** Lengua de fuego prearmada por capa y por curvatura (7 curvaturas): cada cuadro elige la más cercana y la dibuja
 *  derecha, solo escalada. (Inclinarla con una transformación obligaba a un muestreo mucho más lento.) */
const CURVAS = 7, LW = 96, LH = 64;
const lenguaSprite = (c, k) => sprite('lengua' + c.join() + k, LW, (g) => {
  const dobla = (k / (CURVAS - 1) - .5) * 2 * LW * .3, x = LW / 2, base = LH, ancho = LW * .56, alto = LH;
  g.clearRect(0, 0, LW, LW);
  g.beginPath(); g.moveTo(x - ancho / 2, base);
  g.bezierCurveTo(x - ancho * .62, base - alto * .35, x - ancho * .2 + dobla * .35, base - alto * .62, x + dobla, 0);
  g.bezierCurveTo(x + ancho * .22 + dobla * .45, base - alto * .58, x + ancho * .62, base - alto * .32, x + ancho / 2, base); g.closePath();
  const gr = g.createLinearGradient(0, base, 0, 0); gr.addColorStop(0, c[0]); gr.addColorStop(.5, c[1]); gr.addColorStop(1, c[2]); g.fillStyle = gr; g.fill();
});
function lengua(g, x, base, ancho, alto, dobla, c) {
  if (alto < .5 || ancho < .5) return;
  const sx = ancho / (LW * .56), k = Math.max(0, Math.min(CURVAS - 1, Math.round((dobla / sx / (LW * .3) / 2 + .5) * (CURVAS - 1))));
  g.drawImage(lenguaSprite(c, k), 0, 0, LW, LH, x - LW / 2 * sx, base - alto, LW * sx, alto);
}
const llamarada = {
  cols: ['#fff3a0', '#ffb020', '#ff5a12'], ring: '#ff7a1f', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    const humo = lista(st, 'humo'), brasas = lista(st, 'brasas'), chispas = lista(st, 'llamas'), escala = h / 16, q = calidad(st, dt);
    const intensidad = 1 + (st.aviva || 0); st.aviva = Math.max(0, (st.aviva || 0) - dt * 1.6);
    // resplandor cálido que respira
    g.globalCompositeOperation = 'source-over';
    aura(g, luz('rgba(255,120,30,.5)', 'rgba(255,70,10,.16)'), L + w / 2, T - h * .6, w * 1.3, h * 7, .55 + .12 * ruido(t * 6));
    // humo detrás
    if (q > .5 && R() < dt * 7 * q) humo.push({ x: L + w * (.25 + R() * .5), y: T - h * 3.2, vx: (R() - .5) * 8, vy: -(16 + R() * 12) * escala, vida: 1, dura: 1.8 + R(), s: h * (1.8 + R() * 1.2), f: R() * TAU });
    avanzar(humo, dt, (p) => { p.x += (p.vx + Math.sin(t * 1.3 + p.f) * 9) * dt; p.y += p.vy * dt; pinta(g, luz('rgba(60,40,36,.55)', 'rgba(50,38,36,.2)'), p.x, p.y, p.s * (2 - p.vida), Math.sin(p.vida * Math.PI) * .3); });
    // lenguas de fuego
    g.globalAlpha = 1;
    const n = Math.max(5, Math.round(w / 11 * (.55 + .45 * q))), paso = w / n, base = T + h * .5;
    for (const capa of q < .55 ? CAPAS_FUEGO.slice(1) : CAPAS_FUEGO) {                 // con poca calidad, sin la capa roja de atrás
      for (let i = 0; i < n; i++) {
        const u = (i + .5) / n, centro = 1 - Math.pow(Math.abs(u * 2 - 1), 2) * .55, f = i * 7.13 + capa.alto * 11;
        const vive = .55 + .45 * ruido(t * 8.3 + f);                                       // cada lengua crece y se encoge a su ritmo
        const alto = h * (1.6 + 2.9 * centro * vive) * capa.alto * intensidad * (oscuro ? 1 : .95);
        const ancho = paso * 1.9 * capa.ancho, x = L + u * w + ruido(t * 3.1 + f) * paso * .35;
        const dobla = ruido(t * 5.7 + f * 1.7) * paso * .9 + (u - .5) * paso * .8;
        lengua(g, x, base, ancho, alto, dobla, capa.c);
      }
    }
    // lenguas sueltas que se desprenden y suben
    if (R() < dt * 10 * intensidad * q) chispas.push({ x: L + w * (.15 + R() * .7), y: T - h * (1 + R() * 1.5), vx: (R() - .5) * 14, vy: -(60 + R() * 50) * escala, vida: 1, dura: .5 + R() * .3, s: h * (.35 + R() * .3), f: R() * TAU });
    modo(g, true);
    avanzar(chispas, dt, (p) => { g.globalAlpha = Math.min(1, p.vida * 2); p.x += (p.vx + Math.sin(t * 9 + p.f) * 20) * dt; p.y += p.vy * dt; const k = p.vida; lengua(g, p.x, p.y, p.s * k, p.s * 2.4 * k, Math.sin(t * 8 + p.f) * p.s * .4, ['rgba(255,220,90,.95)', 'rgba(255,120,20,.8)', 'rgba(255,60,0,0)']); });
    // brillo caliente en la base
    modo(g, true);
    aura(g, luz('rgba(255,230,140,1)', 'rgba(255,140,30,.4)'), L + w / 2 + ruido(t * 4) * 4, T + h * .25, w * 1.05, h * 2.4, .45);   // brillo caliente pegado a la barra
    // brasas con estela
    if (R() < dt * 14 * intensidad * q) brasas.push({ x: L + R() * w, y: T - h, vx: (R() - .5) * 40 * escala, vy: -(70 + R() * 120) * escala, vida: 1, dura: .8 + R() * .9, s: .9 + R() * 1.2, f: R() * TAU });
    g.lineCap = 'round';
    avanzar(brasas, dt, (p) => {
      p.vy += 25 * dt; p.x += (p.vx + Math.sin(t * 6 + p.f) * 30) * dt; p.y += p.vy * dt;
      const a = p.vida * (.6 + .4 * Math.sin(t * 30 + p.f));
      g.globalAlpha = a; g.strokeStyle = '#ffc060'; g.lineWidth = p.s; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * .035, p.y - p.vy * .035); g.stroke();
      pinta(g, luz('rgba(255,200,90,1)'), p.x, p.y, p.s * 6, a * .8);
    });
    g.globalCompositeOperation = 'source-over';
    anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) {
    st.aviva = .9;                                                                          // el fuego se aviva un instante
    for (let i = 0; i < 10; i++) lista(st, 'llamas').push({ x: x + (R() - .5) * h * 3, y: T - h * .5, vx: (R() - .5) * 90, vy: -(110 + R() * 120), vida: 1, dura: .55 + R() * .3, s: h * (.4 + R() * .4), f: R() * TAU });
    for (let i = 0; i < 18; i++) lista(st, 'brasas').push({ x, y: T, vx: (R() - .5) * 260, vy: -(120 + R() * 220), vida: 1, dura: .7 + R() * .6, s: 1 + R() * 1.5, f: R() * TAU });
    anillo(st, x, T + h / 2, '#ff8a2a', 1.2);
  },
};

// ───────────────────────────── TORMENTA ELÉCTRICA ─────────────────────────────
// Un arco que chisporrotea entre los electrodos de las puntas, rayos ramificados que saltan hacia arriba con su
// destello, chispas que rebotan y un resplandor eléctrico que parpadea.
const RAYO_CAPAS = [['rgba(120,80,255,.45)', 1.1], ['rgba(70,220,255,.9)', .38], ['rgba(255,255,255,1)', .14]];
function pintaRayo(g, pts, h, a, grosor = 1) { g.lineJoin = 'round'; g.lineCap = 'round'; for (const [c, k] of RAYO_CAPAS) { g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = Math.max(.6, h * k * grosor); trazo(g, pts); } }
function nuevoRayo(st, x, y, L, T, w, h, fuerza = 1) {
  const alto = h * (3 + R() * 4) * fuerza, x2 = x + (R() - .5) * h * 5 * fuerza, pts = rayo(x, y, x2, y - alto, h * 1.6 * fuerza, 6);
  const ramas = [];
  for (let k = 0; k < 2 + Math.floor(R() * 3); k++) { const i = 6 + Math.floor(R() * (pts.length - 12)), [bx, by] = pts[i]; ramas.push(rayo(bx, by, bx + (R() - .5) * h * 4, by - h * (1 + R() * 2.2), h * .9, 4)); }
  lista(st, 'rayos').push({ pts, ramas, vida: 1, dura: .2 + R() * .12, x, y, f: fuerza });
}
const tormenta = {
  cols: ['#35e8ff', '#7a5cff', '#ffffff'], ring: '#8f7aff', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    const q = calidad(st, dt);
    const parpadeo = .55 + .45 * (R() < .12 ? R() : Math.sin(t * 40) * .5 + .5);
    g.globalCompositeOperation = 'source-over';
    aura(g, luz('rgba(110,90,255,.6)', 'rgba(60,200,255,.18)'), L + w / 2, T + h / 2, w * 1.3, h * 5, .5 * parpadeo + .2);
    modo(g, oscuro);
    // arco continuo entre electrodos (se rehace cada pocos cuadros: chisporrotea)
    st.arcoT = (st.arcoT || 0) - dt;
    if (st.arcoT <= 0 || !st.arco) { st.arcoT = (.035 + R() * .05) / Math.max(.4, q); st.arco = [rayo(L + h * .5, T + h * .5, L + w - h * .5, T + h * .5, h * 1.3, 6), rayo(L + h * .5, T + h * .5, L + w - h * .5, T + h * .5, h * .9, 5)]; }
    pintaRayo(g, st.arco[0], h, .9, .75); if (q > .6) pintaRayo(g, st.arco[1], h, .45, .5);
    // electrodos que brillan
    for (const ex of [L + h * .55, L + w - h * .55]) pinta(g, luz('rgba(200,245,255,1)', 'rgba(80,180,255,.5)'), ex, T + h / 2, h * (1.5 + R() * .6), .55);
    // rayos que saltan hacia arriba
    st.prox = (st.prox ?? .2) - dt;
    if (st.prox <= 0) { st.prox = (.12 + R() * .4) / Math.max(.35, q); nuevoRayo(st, L + w * (.1 + R() * .8), T, L, T, w, h); }
    avanzar(lista(st, 'rayos'), dt, (r) => {
      const a = r.vida > .7 ? 1 : r.vida / .7;
      pinta(g, luz('rgba(200,240,255,1)', 'rgba(120,120,255,.4)'), r.x, r.y, h * 5 * r.f * a, a * .9);
      pintaRayo(g, r.pts, h, a * (R() < .15 ? .4 : 1)); for (const b of r.ramas) pintaRayo(g, b, h, a * .7, .6);
      if (r.vida > .9 && R() < .5) for (let i = 0; i < 3; i++) lista(st, 'chispas').push({ x: r.x, y: r.y, vx: (R() - .5) * 220, vy: -(60 + R() * 200), vida: 1, dura: .5 + R() * .5 });
    });
    // chispas con gravedad
    g.lineCap = 'round';
    avanzar(lista(st, 'chispas'), dt, (p) => { p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; g.globalAlpha = p.vida; g.strokeStyle = R() < .5 ? '#ffffff' : '#7fe9ff'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * .025, p.y - p.vy * .025); g.stroke(); });
    // orbes de plasma que flotan
    const orbes = lista(st, 'orbes');
    if (q > .6 && orbes.length < 5 && R() < dt * 3) orbes.push({ x: L + R() * w, y: T - h * R(), vx: (R() - .5) * 20, vy: -(8 + R() * 14), vida: 1, dura: 1.5 + R() });
    avanzar(orbes, dt, (o) => { o.x += o.vx * dt; o.y += o.vy * dt; pinta(g, luz('rgba(170,230,255,1)', 'rgba(120,90,255,.5)'), o.x, o.y, h * (.8 + .4 * Math.sin(t * 20 + o.x)), o.vida * .8); });
    g.globalCompositeOperation = 'source-over';
    anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) {
    for (let i = 0; i < 3; i++) nuevoRayo(st, x + (i - 1) * h, T, L, T, w, h, 1.4);
    for (let i = 0; i < 18; i++) lista(st, 'chispas').push({ x, y: T, vx: (R() - .5) * 360, vy: -(80 + R() * 300), vida: 1, dura: .5 + R() * .5 });
    st.arcoT = 0; anillo(st, x, T + h / 2, '#7fe9ff', 1.3);
  },
};

// ───────────────────────────── NÚCLEO RADIACTIVO (nueva) ─────────────────────────────
// Cilindro de vidrio con plutonio verde: un halo que late como un contador Geiger, partículas que flotan, gotas
// tóxicas que caen, el símbolo ☢ que asoma y se esfuma, y una onda verde en cada rebote.
function simboloRadiactivo(g, x, y, r, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, i * TAU / 3 - .5, i * TAU / 3 + .5); g.closePath(); g.fill(); }
  g.beginPath(); g.arc(0, 0, r * .22, 0, TAU); g.fill(); g.restore();
}
const nuclear = {
  cols: ['#b6ff3a', '#5dff4a', '#eaffc0'], ring: '#7dff3a', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    const latido = Math.pow(Math.max(0, Math.sin(t * 5.2)), 6), q = calidad(st, dt);    // pulso tipo Geiger
    g.globalCompositeOperation = 'source-over';
    aura(g, luz('rgba(140,255,60,.6)', 'rgba(60,220,40,.22)'), L + w / 2, T + h / 2, w * (1.3 + latido * .15), h * (5 + latido * 1.5), .45 + latido * .35);
    modo(g, oscuro);
    // ondas del contador
    st.onda = (st.onda ?? 0) - dt; if (st.onda <= 0) { st.onda = 1.1 + R() * .5; anillo(st, L + w / 2, T + h / 2, 'rgba(150,255,80,1)', .9); }
    // partículas verdes que flotan y titilan
    const motas = lista(st, 'motas');
    if (R() < dt * 26 * q) motas.push({ x: L + w * (.08 + R() * .84), y: T + h * .3, vx: (R() - .5) * 14, vy: -(14 + R() * 34), vida: 1, dura: 1.3 + R() * 1.2, f: R() * TAU, s: .8 + R() * 1.4 });
    avanzar(motas, dt, (p) => {
      p.x += (p.vx + Math.sin(t * 3 + p.f) * 10) * dt; p.y += p.vy * dt;
      const a = p.vida * (.55 + .45 * Math.sin(t * 14 + p.f));
      pinta(g, luz('rgba(200,255,120,1)', 'rgba(90,255,60,.5)'), p.x, p.y, p.s * 9, a);
      g.globalAlpha = a; g.fillStyle = '#efffd8'; g.fillRect(p.x - p.s * .5, p.y - p.s * .5, p.s, p.s);
    });
    // símbolo ☢ que sube girando y se esfuma
    const simbolos = lista(st, 'simbolos');
    if (simbolos.length < 1 && R() < dt * .6) simbolos.push({ x: L + w * (.25 + R() * .5), y: T - h, vida: 1, dura: 2.2, rot: R() * TAU });
    avanzar(simbolos, dt, (s) => {
      s.y -= 14 * dt * h / 16; s.rot += dt * .8;
      const a = Math.sin(s.vida * Math.PI) * .75; pinta(g, luz('rgba(170,255,90,1)', 'rgba(90,220,40,.4)'), s.x, s.y, h * 5, a * .6);
      g.globalAlpha = a; g.fillStyle = '#d8ff4a'; simboloRadiactivo(g, s.x, s.y, h * 1.2, s.rot);
    });
    // gotas que se forman bajo la barra y caen
    g.globalCompositeOperation = 'source-over';
    const gotas = lista(st, 'gotas');
    if (R() < dt * 2.2) gotas.push({ x: L + w * (.15 + R() * .7), y: T + h, vy: 0, vida: 1, dura: 1.4, crece: 0 });
    avanzar(gotas, dt, (d) => {
      if (d.crece < 1) d.crece += dt * 2.2; else { d.vy += 420 * dt; d.y += d.vy * dt; }
      const r = h * .22 * Math.min(1, d.crece), largo = r * (1.6 + Math.min(2, d.vy / 120));
      g.globalAlpha = d.vida; const gr = g.createLinearGradient(d.x, d.y, d.x, d.y + largo + r); gr.addColorStop(0, '#d9ff6a'); gr.addColorStop(1, '#3fd810');
      g.fillStyle = gr; g.beginPath(); g.moveTo(d.x, d.y); g.quadraticCurveTo(d.x + r, d.y + largo * .6, d.x + r, d.y + largo); g.arc(d.x, d.y + largo, r, 0, Math.PI); g.quadraticCurveTo(d.x - r, d.y + largo * .6, d.x, d.y); g.fill();
    });
    anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) {
    for (let i = 0; i < 26; i++) { const a = R() * TAU, v = 60 + R() * 140; lista(st, 'motas').push({ x, y: T + h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .5 - 40, vida: 1, dura: .7 + R() * .6, f: R() * TAU, s: 1 + R() * 1.6 }); }
    anillo(st, x, T + h / 2, 'rgba(180,255,90,1)', 1.25); anillo(st, x, T + h / 2, 'rgba(120,255,60,1)', 1);
  },
};

// ───────────────────────────── el resto: una identidad propia para cada una ─────────────────────────────
// Oro líquido: gotas de oro que cuelgan, se estiran y caen; reflejos que recorren el metal.
const oroLiquido = {
  cols: ['#fff6c2', '#ffd95a', '#ffb81c'], ring: '#ffd95a', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    g.globalCompositeOperation = 'source-over';
    aura(g, luz('rgba(255,210,80,.45)', 'rgba(255,170,30,.15)'), L + w / 2, T + h / 2, w * 1.25, h * 4.5, .6);
    const gotas = lista(st, 'gotas');
    if (R() < dt * 3.2) gotas.push({ x: L + w * (.08 + R() * .84), y: T + h * .85, vy: 0, vida: 1, dura: 1.6, crece: 0, s: .8 + R() * .6 });
    avanzar(gotas, dt, (d) => {
      if (d.crece < 1) d.crece += dt * 1.4; else { d.vy += 520 * dt; d.y += d.vy * dt; }
      const r = h * .26 * d.s * Math.min(1, d.crece), largo = r * (1.2 + d.crece * .8 + Math.min(2.5, d.vy / 100));
      const gr = g.createLinearGradient(d.x - r, d.y, d.x + r, d.y); gr.addColorStop(0, '#a86a00'); gr.addColorStop(.35, '#ffe27a'); gr.addColorStop(.6, '#ffd23a'); gr.addColorStop(1, '#8a5a08');
      g.globalAlpha = Math.min(1, d.vida * 2); g.fillStyle = gr; g.beginPath(); g.moveTo(d.x - r * .4, d.y); g.quadraticCurveTo(d.x + r, d.y + largo * .55, d.x + r, d.y + largo); g.arc(d.x, d.y + largo, r, 0, Math.PI); g.quadraticCurveTo(d.x - r, d.y + largo * .55, d.x + r * .4, d.y); g.fill();
      g.fillStyle = 'rgba(255,255,240,.85)'; g.beginPath(); g.arc(d.x - r * .35, d.y + largo - r * .25, r * .25, 0, TAU); g.fill();
    });
    modo(g, true);
    for (let i = 0; i < 3; i++) { const u = ((t * .35 + i / 3) % 1), x = L + w * u, a = Math.sin(u * Math.PI); g.fillStyle = '#fffbe0'; g.globalAlpha = a; estrella(g, x, T + h * .25, h * .16 * a + .5); }
    g.globalCompositeOperation = 'source-over'; anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) {
    const gotas = lista(st, 'salpica');
    for (let i = 0; i < 14; i++) gotas.push({ x, y: T, vx: (R() - .5) * 220, vy: -(90 + R() * 200), vida: 1, dura: .7 });
    anillo(st, x, T + h / 2, '#ffd95a');
    st.salpicaDraw = true;
  },
};
const conSalpica = (base) => ({ ...base, draw(g, st, L, T, w, h, t, oscuro, dt) {
  base.draw(g, st, L, T, w, h, t, oscuro, dt);
  avanzar(lista(st, 'salpica'), dt, (p) => { p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; const r = h * .16; g.globalAlpha = p.vida; const gr = g.createRadialGradient(p.x - r * .3, p.y - r * .3, 0, p.x, p.y, r); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(.5, '#ffd23a'); gr.addColorStop(1, '#a86a00'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill(); });
} });

// Cristal: esquirlas de hielo que crecen sobre la barra y titilan; vaho frío; al rebotar, la escarcha estalla.
const cristal = {
  cols: ['#8fc8ff', '#ffffff', '#c2a8ff'], ring: '#bfe6ff', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    if (!st.esq || st.esqW !== Math.round(w)) { st.esqW = Math.round(w); st.esq = Array.from({ length: Math.round(w / 14) }, (_, i) => ({ u: (i + .5) / Math.round(w / 14) + (R() - .5) * .03, alto: .6 + R() * 1.3, ang: (R() - .5) * .7, f: R() * TAU })); }
    g.globalCompositeOperation = 'source-over';
    aura(g, luz('rgba(190,235,255,.5)', 'rgba(150,200,255,.15)'), L + w / 2, T + h / 2, w * 1.2, h * 4.5, .55);
    for (const e of st.esq) {                                                       // esquirlas facetadas
      const x = L + w * e.u, H = h * e.alto * (1 + .06 * Math.sin(t * 2 + e.f)), W = h * .32;
      g.save(); g.translate(x, T + h * .2); g.rotate(e.ang);
      const gr = g.createLinearGradient(-W, 0, W, -H); gr.addColorStop(0, 'rgba(160,210,255,.85)'); gr.addColorStop(.5, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(190,170,255,.8)');
      g.globalAlpha = .95; g.fillStyle = gr; g.beginPath(); g.moveTo(-W, 0); g.lineTo(-W * .3, -H * .8); g.lineTo(0, -H); g.lineTo(W * .3, -H * .8); g.lineTo(W, 0); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = .7; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -H); g.stroke(); g.restore();
      const k = Math.sin(t * 2.4 + e.f * 3); if (k > .85) { modo(g, true); g.fillStyle = '#fff'; g.globalAlpha = (k - .85) * 6; estrella(g, x + Math.sin(e.ang) * H, T + h * .2 - Math.cos(e.ang) * H, h * .2); g.globalCompositeOperation = 'source-over'; }
    }
    const vaho = lista(st, 'vaho');
    if (R() < dt * 6) vaho.push({ x: L + R() * w, y: T + h, vx: (R() - .5) * 10, vy: 6 + R() * 8, vida: 1, dura: 1.6 });
    avanzar(vaho, dt, (p) => { p.x += p.vx * dt; p.y += p.vy * dt; pinta(g, luz('rgba(235,250,255,.7)', 'rgba(210,235,255,.25)'), p.x, p.y, h * (2 + (1 - p.vida) * 2.5), p.vida * .5); });
    avanzar(lista(st, 'trozos'), dt, (p) => { p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = p.vida; g.fillStyle = 'rgba(220,240,255,.95)'; g.beginPath(); g.moveTo(0, -p.s); g.lineTo(p.s * .6, p.s); g.lineTo(-p.s * .6, p.s * .7); g.fill(); g.restore(); });
    anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) { for (let i = 0; i < 16; i++) lista(st, 'trozos').push({ x, y: T, vx: (R() - .5) * 240, vy: -(100 + R() * 200), r: R() * TAU, vr: (R() - .5) * 14, s: h * (.2 + R() * .25), vida: 1, dura: .8 }); anillo(st, x, T + h / 2, '#dff4ff'); },
};

// Neón: tubo de vidrio con gas que brilla, electrones que lo recorren, parpadeo de letrero y un zumbido de luz.
const neon = {
  cols: ['#ff2bd6', '#00f0ff', '#ffffff'], ring: '#ff2bd6', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    const falla = R() < .015 ? .25 : 1, hue = 300 + Math.sin(t * .6) * 40;
    g.globalCompositeOperation = 'source-over';
    aura(g, luz(`hsla(${tono(hue)},100%,60%,.7)`, `hsla(${tono(hue)},100%,50%,.2)`), L + w / 2, T + h / 2, w * 1.3, h * 5, .55 * falla);
    modo(g, true);
    for (let i = 0; i < 5; i++) { const u = ((t * (.6 + i * .17) + i * .23) % 1), x = L + h * .6 + (w - h * 1.2) * u; pinta(g, luz('rgba(255,255,255,1)', `hsla(${tono(hue)},100%,70%,.6)`), x, T + h / 2, h * 1.4, .9 * falla); }
    // reflejo en el «piso» (como un letrero sobre el agua)
    g.globalAlpha = .18 * falla; g.fillStyle = `hsl(${hue},100%,70%)`; g.fillRect(L + w * .1, T + h * 1.6, w * .8, h * .18);
    g.globalCompositeOperation = 'source-over'; anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) { anillo(st, x, T + h / 2, '#ff6be6', 1.2); anillo(st, x, T + h / 2, '#00f0ff', .8); },
};

// Galaxia: polvo de estrellas que orbita alrededor de la barra (por delante y por detrás) y un cometa que la cruza.
const galaxia = {
  cols: ['#8f6bff', '#ffffff', '#5d94ff', '#ff6fcf'], ring: '#a98bff', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    if (!st.orb) st.orb = Array.from({ length: 46 }, () => ({ a: R() * TAU, v: .6 + R() * 1.2, r: .55 + R() * .5, s: .6 + R() * 1.4, c: ['#ffffff', '#cdbbff', '#9fc4ff', '#ffb8e6'][Math.floor(R() * 4)] }));
    const cx = L + w / 2, cy = T + h / 2;
    g.globalCompositeOperation = 'source-over';
    aura(g, luz('rgba(140,100,255,.5)', 'rgba(255,100,200,.15)'), cx, cy, w * 1.25, h * 5, .55);
    modo(g, true);
    for (const o of st.orb) {
      o.a += o.v * dt; const x = cx + Math.cos(o.a) * w * .55 * o.r, y = cy + Math.sin(o.a) * h * 1.6 * o.r, delante = Math.sin(o.a) > 0;
      pinta(g, luz(o.c === '#ffffff' ? 'rgba(255,255,255,1)' : 'rgba(200,180,255,1)'), x, y, o.s * 6, delante ? .9 : .35);
    }
    st.cometa = st.cometa ?? -1; st.cometa -= dt;
    if (st.cometa < -2.5) st.cometa = 1;
    if (st.cometa > 0) { const u = 1 - st.cometa, x = L - w * .2 + w * 1.4 * u, y = T - h * 3 + u * h * 2; const gr = g.createLinearGradient(x, y, x - w * .3, y - h); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(160,140,255,0)'); g.globalAlpha = 1; g.strokeStyle = gr; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - w * .3, y - h); g.stroke(); pinta(g, luz('rgba(255,255,255,1)'), x, y, h * 1.2, 1); }
    avanzar(lista(st, 'nova'), dt, (p) => { p.x += p.vx * dt; p.y += p.vy * dt; g.fillStyle = p.c; g.globalAlpha = p.vida; estrella(g, p.x, p.y, 1.2 + p.vida * 1.5); });
    g.globalCompositeOperation = 'source-over'; anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) { for (let i = 0; i < 22; i++) { const a = R() * TAU, v = 60 + R() * 160; lista(st, 'nova').push({ x, y: T, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .6 - 30, vida: 1, dura: .8, c: ['#fff', '#cdbbff', '#ffb8e6'][i % 3] }); } anillo(st, x, T + h / 2, '#b9a2ff'); },
};

// Arcoíris: cintas de colores que ondean sobre la barra como seda y chispas de prisma.
const arcoiris = {
  cols: null, ring: '#ffe83b', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    g.globalCompositeOperation = 'source-over';
    aura(g, luz(`hsla(${tono(t * 60)},100%,65%,.45)`, `hsla(${tono(t * 60 + 120)},100%,60%,.15)`), L + w / 2, T + h / 2, w * 1.25, h * 5, .6);
    modo(g, true); g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let i = 0; i <= 24; i++) { const u = i / 24, x = L + w * u, y = T - h * (.6 + k * .55) - Math.sin(u * 6 + t * (2.4 + k * .4) + k) * h * .45 * Math.sin(u * Math.PI); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      const gr = g.createLinearGradient(L, 0, L + w, 0); for (let c = 0; c <= 6; c++) gr.addColorStop(c / 6, `hsl(${(c * 55 + t * 90 + k * 40) % 360},100%,62%)`);
      g.strokeStyle = gr; g.globalAlpha = .75 - k * .18; g.lineWidth = h * (.28 - k * .06); g.stroke();
    }
    const rr = Math.floor(t * 8); for (let i = 0; i < 3; i++) { const x = L + ((rr * 37 + i * 61) % 100) / 100 * w, y = T - h * (.3 + ((rr * 13 + i * 7) % 10) / 10 * 1.8); g.globalAlpha = .9; g.fillStyle = `hsl(${(rr * 40 + i * 120) % 360},100%,80%)`; estrella(g, x, y, h * .14); }
    avanzar(lista(st, 'nova'), dt, (p) => { p.x += p.vx * dt; p.y += p.vy * dt; g.fillStyle = p.c; g.globalAlpha = p.vida; estrella(g, p.x, p.y, 1 + p.vida * 2); });
    g.globalCompositeOperation = 'source-over'; anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) { for (let i = 0; i < 20; i++) { const a = -Math.PI * (i / 19), v = 150; lista(st, 'nova').push({ x, y: T, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 1, dura: .7, c: `hsl(${i * 18},100%,65%)` }); } anillo(st, x, T + h / 2, '#fff36b'); },
};

// Holográfica: proyector de holograma: un haz cian que sube con un cubo de alambre girando, cortes de interferencia y datos.
const holo = {
  cols: ['#7af0ff', '#c29aff', '#ffffff'], ring: '#7af0ff', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    const cx = L + w / 2, alto = h * 4.2, glitch = R() < .05;
    g.globalCompositeOperation = 'source-over';
    const haz = g.createLinearGradient(0, T, 0, T - alto); haz.addColorStop(0, 'rgba(120,240,255,.35)'); haz.addColorStop(1, 'rgba(120,240,255,0)');
    g.globalAlpha = glitch ? .4 : 1; g.fillStyle = haz; g.beginPath(); g.moveTo(cx - w * .12, T); g.lineTo(cx + w * .12, T); g.lineTo(cx + w * .3, T - alto); g.lineTo(cx - w * .3, T - alto); g.fill();
    // cubo de alambre girando
    const s = h * 1.1, a = t * 1.2, b = .5, oy = T - alto * .55 + Math.sin(t * 2) * h * .2;
    const V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(([x, y, z]) => { const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a); const y1 = y * Math.cos(b) - z1 * Math.sin(b); return [cx + x1 * s + (glitch ? (R() - .5) * 8 : 0), oy + y1 * s]; });
    modo(g, true); g.strokeStyle = '#8ff6ff'; g.lineWidth = 1.2; g.globalAlpha = .9;
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) { g.beginPath(); g.moveTo(...V[i]); g.lineTo(...V[j]); g.stroke(); }
    for (const p of V) pinta(g, luz('rgba(180,250,255,1)'), p[0], p[1], 6, .8);
    // líneas de interferencia y «datos» que suben
    for (let i = 0; i < 4; i++) { const y = T - ((t * 40 + i * alto / 4) % alto); g.globalAlpha = .35; g.fillStyle = '#bff9ff'; g.fillRect(cx - w * (.12 + .18 * (T - y) / alto), y, w * (.24 + .36 * (T - y) / alto), 1); }
    g.font = `700 ${Math.max(7, h * .5)}px monospace`; g.textAlign = 'center'; g.fillStyle = '#c8fbff';
    for (let i = 0; i < 5; i++) { const u = (t * .5 + i / 5) % 1, x = L + w * (.15 + ((i * 37) % 70) / 100); g.globalAlpha = Math.sin(u * Math.PI) * .7; g.fillText((Math.floor(t * 6 + i * 3) % 2 ? '1' : '0') + (i % 2 ? '1' : '0'), x, T - u * alto); }
    g.globalCompositeOperation = 'source-over'; anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) { anillo(st, x, T + h / 2, '#8ff6ff', 1.2); anillo(st, x, T + h / 2, '#d4a8ff', .7); },
};

// Rey Midas: aura de oro, monedas acuñadas que saltan girando y brillos de corona.
const MONEDA_PX = 48;
const monedaSprite = (reverso) => sprite('moneda' + reverso, MONEDA_PX, (g, n) => {
  const r = n / 2 - 1, c = n / 2;
  const gr = g.createRadialGradient(c - r * .3, c - r * .3, r * .1, c, c, r); gr.addColorStop(0, '#fff6c2'); gr.addColorStop(.6, reverso ? '#e8a317' : '#ffd23a'); gr.addColorStop(1, '#a86a00');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, r, 0, TAU); g.fill(); g.lineWidth = r * .14; g.strokeStyle = '#8a5a08'; g.stroke();
  g.strokeStyle = 'rgba(255,248,210,.9)'; g.lineWidth = r * .08; g.beginPath(); g.arc(c, c, r * .66, 0, TAU); g.stroke();
  g.fillStyle = '#8a5a08'; g.font = `900 ${r * 1.05}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', c, c + r * .05);
});
/** Moneda de oro que gira: la imagen prearmada (cara o reverso) se aplasta en x según el giro. */
function moneda(g, x, y, r, giro) {
  const k = Math.cos(giro), sx = Math.max(.12, Math.abs(k));
  g.drawImage(monedaSprite(k <= 0), x - r * sx, y - r, r * 2 * sx, r * 2);
}
const midas = {
  cols: ['#fff3b0', '#ffd23a', '#f0b020'], ring: '#ffd23a', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    g.globalCompositeOperation = 'source-over';
    aura(g, luz('rgba(255,215,90,.6)', 'rgba(255,180,30,.2)'), L + w / 2, T + h / 2, w * 1.3, h * 5, .6 + .1 * Math.sin(t * 3));
    const mon = lista(st, 'monedas');
    if (R() < dt * 4) mon.push({ x: L + w * (.1 + R() * .8), y: T, vx: (R() - .5) * 80, vy: -(160 + R() * 120), vida: 1, dura: .95, giro: R() * TAU, vg: 8 + R() * 8, r: h * (.45 + R() * .25) });
    avanzar(mon, dt, (m) => { m.vy += 560 * dt; m.x += m.vx * dt; m.y += m.vy * dt; m.giro += m.vg * dt; g.globalAlpha = Math.min(1, m.vida * 2.5); moneda(g, m.x, m.y, m.r, m.giro); });
    modo(g, true);
    for (let i = 0; i < 4; i++) { const k = Math.sin(t * 3 + i * 1.7); if (k > .6) { g.fillStyle = '#fff8d0'; g.globalAlpha = (k - .6) * 2.5; estrella(g, L + w * (.12 + i * .25), T + h * .3, h * .22); } }
    g.globalCompositeOperation = 'source-over'; anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) { for (let i = 0; i < 9; i++) lista(st, 'monedas').push({ x: x + (R() - .5) * 20, y: T, vx: (R() - .5) * 200, vy: -(200 + R() * 160), vida: 1, dura: 1, giro: R() * TAU, vg: 10 + R() * 10, r: h * (.5 + R() * .3) }); anillo(st, x, T + h / 2, '#ffe27a', 1.2); },
};

// Diamante: destellos en cruz, haces de dispersión (el arcoíris que sale de un brillante) y facetas que relumbran.
const diamante = {
  cols: ['#ffffff', '#bfeaff', '#ffd1f2', '#fff3b8'], ring: '#bfeaff', rate: 0,
  draw(g, st, L, T, w, h, t, oscuro, dt) {
    g.globalCompositeOperation = 'source-over';
    aura(g, luz('rgba(200,235,255,.6)', 'rgba(170,190,255,.2)'), L + w / 2, T + h / 2, w * 1.25, h * 5, .6);
    modo(g, true);
    const cx = L + w * (.5 + Math.sin(t * .7) * .3);
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * .16 + Math.sin(t) * .05, Lr = h * 5; g.globalAlpha = .28; g.fillStyle = `hsl(${i * 50},100%,70%)`; g.beginPath(); g.moveTo(cx, T); g.lineTo(cx + Math.cos(a - .03) * Lr, T + Math.sin(a - .03) * Lr); g.lineTo(cx + Math.cos(a + .03) * Lr, T + Math.sin(a + .03) * Lr); g.fill(); }
    const fl = lista(st, 'destellos');
    if (R() < dt * 4) fl.push({ x: L + w * (.06 + R() * .88), y: T + h * (.15 + R() * .5), vida: 1, dura: .45, s: h * (.6 + R() * .5) });
    avanzar(fl, dt, (f) => { const k = Math.sin(f.vida * Math.PI); pinta(g, luz('rgba(255,255,255,1)', 'rgba(190,230,255,.4)'), f.x, f.y, f.s * 5 * k, k); g.globalAlpha = k; g.fillStyle = '#fff'; estrella(g, f.x, f.y, f.s * (.4 + k * .8)); });
    g.globalCompositeOperation = 'source-over'; anillos(g, st, dt, h);
  },
  onHit(st, x, y, L, T, w, h) { lista(st, 'destellos').push({ x, y: T + h / 2, vida: 1, dura: .6, s: h * 1.6 }); anillo(st, x, T + h / 2, '#e8f8ff', 1.2); },
};

/** Barras que trae la V2 y los nombres que muestra la tienda. */
export const NUEVAS_BARRAS = {
  dorada: conSalpica(oroLiquido), fuego: llamarada, cristal, neon, galaxia, arcoiris, holo, midas, diamante, plasma: tormenta, nuclear,
};
export function registrarBarras(padFx) { if (padFx) Object.assign(padFx, NUEVAS_BARRAS); }
