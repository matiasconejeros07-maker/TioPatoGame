// VISTA · capa animada encima de los fondos de la V1 (que se conservan tal cual). Cada fondo tiene sus propias
// partículas: suben, caen, titilan o giran según el tema. Solo corre mientras el fondo premium se ve (en la partida),
// a 30 cuadros por segundo, y se apaga en el «modo liviano» de la V1 o con «reducir movimiento».
const ESTILOS = {
  atardecer: { n: 26, tipo: 'mota', col: ['#fff3c4', '#ffd2a8', '#ffb3c8'], vy: [-12, -4], r: [1, 2.6], glow: 8 },
  cristal: { n: 40, tipo: 'copo', col: ['#ffffff', '#e2f2ff', '#cfe6ff'], vy: [14, 34], r: [1.2, 3], glow: 6, vaiven: 18 },
  aurora: { n: 34, tipo: 'luciernaga', col: ['#8fffd8', '#b8ffef', '#a8c8ff'], vy: [-8, 4], r: [1, 2.2], glow: 10, fugaz: 0.004 },
  galaxia: { n: 50, tipo: 'estrella', col: ['#ffffff', '#d9e4ff', '#ffd9fb'], vy: [0, 0], r: [.6, 1.8], glow: 6, fugaz: 0.01 },
  holo: { n: 22, tipo: 'burbuja', col: ['#ffb8e6', '#b8f3ff', '#fff2b8', '#c9b8ff'], vy: [-26, -12], r: [5, 14], glow: 0 },
  synth: { n: 30, tipo: 'chispa', col: ['#ff4fd8', '#46e6ff', '#ffd23f'], vy: [-40, -18], r: [1, 2.2], glow: 12 },
  boveda: { n: 46, tipo: 'oro', col: ['#ffe27a', '#ffc928', '#fff6c2'], vy: [10, 26], r: [1, 2.6], glow: 9 },
  prisma: { n: 34, tipo: 'destello', col: ['#ffffff', '#9ae6ff', '#ffb3f0', '#fff3a0'], vy: [-6, 6], r: [1.5, 3.4], glow: 12 },
  agujero: { n: 70, tipo: 'espiral', col: ['#ffb36b', '#ff6b3d', '#ffe2b8', '#ffffff'], r: [.8, 2.2], glow: 8 },
};
const azar = (a, b) => a + Math.random() * (b - a);

export class Ambiente {
  #cv; #ctx; #p = []; #fondo = ''; #raf = 0; #ultimo = 0; #w = 0; #h = 0; #fugaces = [];

  constructor() {
    const tema = document.getElementById('theme');
    if (!tema) return;
    this.#cv = document.createElement('canvas'); this.#cv.id = 'v2ambiente'; this.#cv.setAttribute('aria-hidden', 'true');
    tema.after(this.#cv); this.#ctx = this.#cv.getContext('2d');
    const revisar = () => this.#revisar(tema);
    new MutationObserver(revisar).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(revisar).observe(tema, { attributes: true, attributeFilter: ['data-bg'] });
    addEventListener('resize', () => { this.#medir(); this.#sembrar(); });
    revisar();
  }

  #activo() { const b = document.body.classList; return b.contains('themed') && !b.contains('lite') && !matchMedia('(prefers-reduced-motion: reduce)').matches; }

  #revisar(tema) {
    const fondo = tema.dataset.bg || '', on = this.#activo() && ESTILOS[fondo];
    this.#cv.style.display = on ? 'block' : 'none';
    if (!on) { cancelAnimationFrame(this.#raf); this.#raf = 0; return; }
    if (fondo !== this.#fondo || !this.#p.length) { this.#fondo = fondo; this.#medir(); this.#sembrar(); }
    if (!this.#raf) { this.#ultimo = performance.now(); this.#raf = requestAnimationFrame((t) => this.#cuadro(t)); }
  }

  #medir() {
    const ratio = Math.min(2, devicePixelRatio || 1);
    this.#w = innerWidth; this.#h = innerHeight;
    this.#cv.width = this.#w * ratio; this.#cv.height = this.#h * ratio; this.#ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  #nueva(e, arriba) {
    const p = { x: azar(0, this.#w), y: arriba ? azar(0, this.#h) : (e.vy && e.vy[1] < 0 ? this.#h + 20 : -20), r: azar(...e.r), c: e.col[Math.floor(Math.random() * e.col.length)],
      vy: e.vy ? azar(...e.vy) : 0, fase: Math.random() * Math.PI * 2, vel: azar(.6, 1.6) };
    if (e.tipo === 'espiral') { p.ang = Math.random() * Math.PI * 2; p.dist = azar(.25, .75) * Math.max(this.#w, this.#h); }
    return p;
  }
  #sembrar() { const e = ESTILOS[this.#fondo]; this.#p = e ? Array.from({ length: e.n }, () => this.#nueva(e, true)) : []; this.#fugaces = []; }

  #cuadro(t) {
    this.#raf = requestAnimationFrame((tt) => this.#cuadro(tt));
    if (t - this.#ultimo < 32) return;                                    // ~30 cuadros por segundo: alcanza y no pesa
    const dt = Math.min(.1, (t - this.#ultimo) / 1000); this.#ultimo = t;
    const e = ESTILOS[this.#fondo], g = this.#ctx; if (!e) return;
    g.clearRect(0, 0, this.#w, this.#h);
    const cx = this.#w / 2, cy = this.#h * .45, s = t / 1000;
    for (const p of this.#p) {
      if (e.tipo === 'espiral') {                                            // agujero negro: todo gira y cae hacia el centro
        p.ang += dt * (.6 + 90 / (p.dist + 40)); p.dist -= dt * (14 + 1600 / (p.dist + 30));
        if (p.dist < 18) Object.assign(p, this.#nueva(e, true), { dist: Math.max(this.#w, this.#h) * azar(.55, .8) });
        p.x = cx + Math.cos(p.ang) * p.dist; p.y = cy + Math.sin(p.ang) * p.dist * .42;
      } else {
        p.y += p.vy * dt * p.vel;
        p.x += (e.vaiven ? Math.sin(s * p.vel + p.fase) * e.vaiven * dt : 0) + (e.tipo === 'luciernaga' ? Math.sin(s * .7 + p.fase) * 10 * dt : 0);
        if (p.y < -30 || p.y > this.#h + 30 || p.x < -30 || p.x > this.#w + 30) Object.assign(p, this.#nueva(e, false));
      }
      const parpadeo = e.tipo === 'estrella' || e.tipo === 'destello' || e.tipo === 'luciernaga' ? .35 + .65 * Math.abs(Math.sin(s * p.vel * 1.4 + p.fase)) : 1;
      g.globalAlpha = parpadeo * (e.tipo === 'burbuja' ? .55 : .9);
      g.shadowBlur = e.glow; g.shadowColor = p.c;
      if (e.tipo === 'burbuja') {
        g.strokeStyle = p.c; g.lineWidth = 1.4; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(p.x - p.r * .35, p.y - p.r * .35, p.r * .22, 0, 7); g.fill();
      } else if (e.tipo === 'destello' || e.tipo === 'oro') {                 // estrellita de 4 puntas
        g.fillStyle = p.c; g.beginPath(); const r = p.r * (e.tipo === 'oro' ? 1.4 : 2.4) * parpadeo;
        g.moveTo(p.x, p.y - r); g.lineTo(p.x + r * .25, p.y - r * .25); g.lineTo(p.x + r, p.y); g.lineTo(p.x + r * .25, p.y + r * .25);
        g.lineTo(p.x, p.y + r); g.lineTo(p.x - r * .25, p.y + r * .25); g.lineTo(p.x - r, p.y); g.lineTo(p.x - r * .25, p.y - r * .25); g.fill();
      } else { g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    }
    // estrellas fugaces (aurora y galaxia)
    if (e.fugaz && Math.random() < e.fugaz) this.#fugaces.push({ x: azar(this.#w * .2, this.#w * 1.1), y: azar(-20, this.#h * .4), v: azar(500, 800), vida: 1 });
    this.#fugaces = this.#fugaces.filter((f) => (f.vida -= dt * 1.4) > 0);
    for (const f of this.#fugaces) {
      f.x -= f.v * dt; f.y += f.v * .45 * dt;
      const grad = g.createLinearGradient(f.x, f.y, f.x + 90, f.y - 40); grad.addColorStop(0, `rgba(255,255,255,${f.vida})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = 1; g.shadowBlur = 10; g.shadowColor = '#fff'; g.strokeStyle = grad; g.lineWidth = 2; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x + 90, f.y - 40); g.stroke();
    }
    g.globalAlpha = 1; g.shadowBlur = 0;
  }
}
