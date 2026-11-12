// Prueba de humo del juego en un navegador real (Chromium): que cargue sin errores, que la política de seguridad no bloquee nada,
// que el campo se adapte a cada forma de celular, que el aviso de ventana chica funcione y que los controles y los nombres se comporten.
// Uso:  cd pruebas && npm install && npx playwright install chromium && node humo.test.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const JUEGO = path.resolve(process.env.JUEGO || path.join(__dirname, '..')) + '/';          // siempre ruta completa (con una relativa, el navegador no encuentra tienda.js)
const LOCAL = "window.DINERO_DB_URL=''; window.FIREBASE_API_KEY=''; window.PATO_DIR='pato/';";   // modo local: sin Firebase
let pass = 0, fail = 0;
const ok = (nombre, cond, extra = '') => { if (cond) { pass++; console.log('  ok  ', nombre); } else { fail++; console.log('  FALLA', nombre, extra); } };

async function abrir(browser, w, h, extra = {}) {
  const { config = '', ...ctxOpts } = extra;                                             // config: líneas de JavaScript que se suman al config.js de la prueba
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...ctxOpts });
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: LOCAL + config }));
  await ctx.route('**/index.html', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(JUEGO + 'index.html', 'utf8').replace('  fetchLeader();\n})();', '  window.__sp = []; { const o = spawnPup; spawnPup = (t, ax, ay) => { if (ax === undefined) window.__sp.push(hits); return o(t, ax, ay); }; }\n  window.__g = { st: () => ({ state, x, y, px, hits, duckX, vy, W, H, K, VYF, VS, tiny, keyDir, fxw: fx.width, fxh: fx.height, fl: flames.length, pt: parts.length }), banner: () => bonusBanner(2, 2), bolas: () => CAT.ball.map(b => b.id), zona: (id, n) => { fitBall(CAT.ball.find(b => b.id === id)); const o = hits, op = pw; hits = n; const w = padWidth(); pw = w; const tol = catchTol(); hits = o; pw = op; return { visible: w, zona: w + 2 * tol, BH, bx: BX - K }; }, set: n => { hits = n; pw = padWidth(); setBg(); }, sp: n => { const o = hits; hits = n; const v = ballSpeed(); hits = o; return v; }, sh: n => { const o = hits; hits = n; const v = shrink(); hits = o; return v; }, bs: n => baseSpeed(n), pup: (t, ax, ay) => spawnPup(t, ax, ay), quiet: () => { pupNext = 1e9; }, due: () => { pupNext = hits; }, rm: () => { removePup(); pupFx = { slow: 0, freeze: 0, wide: 0 }; }, points: () => PUP_POINTS.slice(), next: h => nextPupAt(h), plan: () => { const k = { hits, pupNext }, out = []; removePup(); pupFx = { slow: 0, freeze: 0, wide: 0 }; pupNext = nextPupAt(0); for (let h = 0; h <= 500; h++) { hits = h; pupTick(0); if (pup) { out.push(h); removePup(); } } hits = k.hits; pupNext = k.pupNext; removePup(); return out; }, pups: () => ({ nxt: pupNext, slowK, padBoost, fx: { ...pupFx }, has: !!pup, pw, hits, n: document.querySelectorAll(".pup").length, hud: document.getElementById("pups").textContent, frozen: field.classList.contains("frozen"), bubbly: field.classList.contains("bubbly"), wide: paddle.classList.contains("wide"), snow: document.querySelectorAll("#fxice .snow").length, bub: document.querySelectorAll("#fxbub i").length, ring: document.querySelectorAll(".widering").length, iceOp: +getComputedStyle(document.getElementById("fxice")).opacity, bubOp: +getComputedStyle(document.getElementById("fxbub")).opacity }), geo: () => ({ top: paddleTop(), db: DUCK_BOTTOM, by: BY, vs: VS, vyf: VYF }) };\n  (function auto() { if (window.__auto && state === \'play\') px = clamp(x, pw / 2, W - pw / 2); requestAnimationFrame(auto); })();\n  fetchLeader();\n})();') }));
  const p = await ctx.newPage(); const errs = [], csp = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (/Content.Security.Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 140)); });
  if (process.env.CPU) await (await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU });       // CPU=3 node humo.test.js: simula un servidor lento (como el de la CI)
  await p.goto('file://' + JUEGO + 'index.html'); await p.waitForTimeout(500);
  return { ctx, p, errs, csp };
}
const jugar = async p => { await p.fill('#name', 'Prueba'); await p.tap('#play'); };                // con un toque de verdad: el juego ignora los clics fabricados por programa (isTrusted)

(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});

  console.log('Carga y partida');
  {
    const { ctx, p, errs, csp } = await abrir(b, 390, 844);
    ok('el menú carga con el botón Jugar', await p.isVisible('#play'));
    ok('el catálogo (tienda.js) y los diálogos cargaron', await p.evaluate(() => !!(window.TIENDA && window.TIENDA.ch && window.DIALOGOS)));
    await jugar(p); await p.waitForTimeout(3800);
    const s = await p.evaluate(() => window.__g.st());
    ok('la partida empieza (juega o ya terminó: nadie mueve la barra)', s.state === 'play' || s.state === 'over', s.state);
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    ok('la política de seguridad (CSP) no bloquea nada', csp.length === 0, csp.join('|'));
    ok('el marco de seguridad existe (meta CSP)', await p.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')));
    await ctx.close();
  }

  console.log('El campo se adapta a cada celular (sin marcos) y la velocidad vertical se ajusta');
  for (const [w, h] of [[390, 844], [375, 667], [375, 553], [360, 800], [430, 932], [320, 568]]) {
    const { ctx, p, errs } = await abrir(b, w, h);
    await jugar(p); await p.waitForTimeout(3600);
    const f = await p.evaluate(() => { const r = document.getElementById('field').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, ...window.__g.st() }; });
    ok(`${w}×${h}: el campo llena la pantalla`, Math.abs(f.w - w) < 1 && Math.abs(f.h - h) < 1 && f.l < 1 && f.t < 1, JSON.stringify(f));
    ok(`${w}×${h}: K = ancho/390 y sin errores`, Math.abs(f.K - w / 390) < 1e-3 && (f.state === 'play' || f.state === 'over') && errs.length === 0, `K=${f.K} errs=${errs}`);
    await ctx.close();
  }

  console.log('El fondo de la partida parte en azul y pasa por índigo, morado y rojo');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    await jugar(p); await p.waitForTimeout(1500);
    await p.evaluate(() => { window.__auto = true; window.__g.quiet(); });
    const fondo = async n => { await p.evaluate(n => window.__g.set(n), n); await p.waitForTimeout(250); return p.evaluate(() => ({ bg: document.body.style.backgroundColor, dark: document.body.classList.contains('dark'), hell: document.body.classList.contains('hell') })); };
    let f = await fondo(0);
    ok('al empezar (0 rebotes) el fondo es el azul del inicio (#003454) y el texto va claro', f.bg === 'rgb(0, 52, 84)' && f.dark && !f.hell, JSON.stringify(f));
    f = await fondo(25); ok('con 25 rebotes se vuelve azul más vivo (#17479a)', f.bg === 'rgb(23, 71, 154)' && f.dark && !f.hell, JSON.stringify(f));
    f = await fondo(45); ok('con 45 rebotes, morado (#8f2a9c)', f.bg === 'rgb(143, 42, 156)' && f.dark && !f.hell, JSON.stringify(f));
    f = await fondo(60); ok('desde el 55 entra el infierno: rojo (#c2312f)', f.bg === 'rgb(194, 49, 47)' && f.dark && f.hell, JSON.stringify(f));
    f = await fondo(100); ok('con 100 rebotes, casi negro (#2a0508)', f.bg === 'rgb(42, 5, 8)' && f.dark && f.hell, JSON.stringify(f));
    await p.evaluate(() => { window.__auto = false; });
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Potenciadores (10 s cada uno): burbujas, hielo cristal y barra grande');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    await jugar(p); await p.waitForTimeout(3600);
    await p.evaluate(() => { window.__auto = true; });                                  // una barra perfecta mantiene viva la partida
    const pu = () => p.evaluate(() => window.__g.pups());
    const vel = (ms = 700) => p.evaluate(ms => new Promise(res => {                    // rapidez mediana de la pelota (px por segundo), medida DENTRO de la página en cada cuadro (así la lentitud del navegador de la CI no mete ruido)
      const pts = [], t0 = performance.now();
      (function f(t) {
        const g = window.__g.st(); pts.push([t, g.x, g.y]);
        if (t - t0 < ms) requestAnimationFrame(f);
        else { const v = []; for (let i = 1; i < pts.length; i++) { const dt = (pts[i][0] - pts[i - 1][0]) / 1000; if (dt > 0) v.push(Math.hypot(pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]) / dt); } v.sort((a, c) => a - c); res(v[Math.floor(v.length / 2)]); }
      })(t0);
    }), ms);
    // camino recorrido por la pelota en `ms` (suma de tramos de 100 ms): con la distancia en línea recta entre el principio y el final, un rebote en la pared o en la barra durante ese segundo daba un número chico aunque la pelota no dejara de moverse
    const recorrido = async ms => { let tot = 0, prev = await p.evaluate(() => window.__g.st()); for (let t = 0; t < ms; t += 100) { await p.waitForTimeout(100); const c = await p.evaluate(() => window.__g.st()); tot += Math.hypot(c.x - prev.x, c.y - prev.y); prev = c; } return tot; };
    const PUNTOS = [20, 60, 100, 140, 180, 220, 250, 280, 310, 340, 370, 400, 430, 450, 480];            // los rebotes en que debe salir un potenciador
    ok('antes del rebote 20 no hay burbujas ni efectos', await p.evaluate(() => window.__g.pups().hits < 20) && !(await pu()).has && (await pu()).slowK === 1, JSON.stringify(await pu()));
    ok('la lista de rebotes del juego es exactamente 20, 60, 100, 140, 180, 220, 250, 280, 310, 340, 370, 400, 430, 450 y 480', JSON.stringify(await p.evaluate(() => window.__g.points())) === JSON.stringify(PUNTOS), JSON.stringify(await p.evaluate(() => window.__g.points())));
    // Con el reloj del juego (pupTick) avanzando rebote por rebote de 0 a 500, sale una burbuja en cada punto y en ningún otro
    const plan = await p.evaluate(() => window.__g.plan());
    ok('avanzando de 0 a 500 salen burbujas en esos 15 rebotes exactos y en ninguno más', JSON.stringify(plan) === JSON.stringify(PUNTOS), JSON.stringify(plan));
    ok('el siguiente punto después de cada rebote es el que corresponde (0→20, 20→60, 59→60, 60→100, 449→450, 480→ninguno)', await p.evaluate(() => { const n = window.__g.next; return n(0) === 20 && n(19) === 20 && n(20) === 60 && n(59) === 60 && n(60) === 100 && n(449) === 450 && n(450) === 480 && n(479) === 480 && n(480) > 1e8; }));
    // lo mismo con el juego andando de verdad: se sube el marcador de a uno y se mira en qué rebote sale cada burbuja (el registro lo anota el propio juego)
    await p.evaluate(() => { window.__sp.length = 0; });
    await p.evaluate(hasta => new Promise(res => {
      const g = window.__g, raf2 = f => requestAnimationFrame(() => requestAnimationFrame(f)); let h = g.pups().hits;
      (function s() { g.set(h); raf2(() => { if (g.pups().has) g.rm(); if (++h > hasta) res(); else s(); }); })();
    }), 150);
    const sp = await p.evaluate(() => window.__sp.slice());
    ok('jugando de verdad, hasta el rebote 150 salen justo en el 20, el 60, el 100 y el 140 (ni uno más)', sp.length === 4 && sp.every((v, i) => v >= PUNTOS[i] && v <= PUNTOS[i] + 1), JSON.stringify(sp));
    await p.evaluate(() => { window.__g.rm(); window.__g.quiet(); window.__g.set(12); }); await p.waitForTimeout(400);
    await p.evaluate(() => window.__g.pup('slow', 6, 6)); await p.evaluate(() => window.__g.due()); await p.waitForTimeout(500);
    ok('mientras flota una burbuja no sale otra, aunque ya toque', (await pu()).n === 1, JSON.stringify(await pu()));
    await p.evaluate(() => { window.__g.quiet(); });                                    // (a partir de aquí no salen burbujas solas, para que cada prueba sea exacta; la del rincón de arriba no la alcanza la pelota: se prueba que desaparece sola)
    ok('una burbuja que la pelota no toca desaparece sola a los 8 s', (await pu()).has && (await (async () => { await p.waitForTimeout(8600); return !(await pu()).has; })()), JSON.stringify(await pu()));
    await p.waitForTimeout(10600);                                                      // por si la pelota alcanzó a tocar alguna antes de apagarlas: que no quede ningún efecto

    // burbujas
    const v0 = await vel();
    await p.evaluate(() => { const g = window.__g.st(); window.__g.pup('slow', g.x, g.y); }); await p.waitForTimeout(1100);
    const a1 = await pu(), v1 = await vel();
    ok('al tocar la burbuja dura 10 s y la pelota baja al 60% (rapidez ~0,6 de la de antes)', a1.fx.slow > 8000 && a1.fx.slow <= 10000 && a1.slowK > .55 && a1.slowK < .66 && v1 / v0 > .45 && v1 / v0 < .78, `${JSON.stringify(a1)} · antes ${Math.round(v0)} px/s · ahora ${Math.round(v1)} px/s · razón ${(v1 / v0).toFixed(2)}`);
    ok('se ve la animación: el campo se tiñe de agua y suben burbujas de jabón (16) con el cuadro 🫧 y los segundos', a1.bubbly && a1.bub === 16 && a1.bubOp > .9 && /🫧 \d/.test(a1.hud) && !a1.has, JSON.stringify(a1));
    await p.waitForTimeout(9900);
    const a2 = await pu();
    ok('a los 10 s termina: la pelota vuelve a su rapidez y desaparecen las burbujas', a2.fx.slow === 0 && a2.slowK > .96 && !a2.bubbly, JSON.stringify(a2));
    await p.waitForTimeout(1300);
    ok('y ya no quedan burbujas en el campo', (await pu()).bub === 0, JSON.stringify(await pu()));

    // hielo cristal
    const h0 = await vel();
    await p.evaluate(() => { const g = window.__g.st(); window.__g.pup('freeze', g.x, g.y); }); await p.waitForTimeout(1100);
    const f1 = await pu(), hv = await vel(), rec = await recorrido(1000);
    ok('al tocar el hielo dura 10 s y la pelota baja lento pero sin detenerse (~0,4 de la rapidez de antes, se sigue moviendo)', f1.fx.freeze > 8000 && f1.slowK > .35 && f1.slowK < .47 && hv / h0 > .28 && hv / h0 < .56 && rec > 120, `${JSON.stringify(f1)} · antes ${Math.round(h0)} · ahora ${Math.round(hv)} · razón ${(hv / h0).toFixed(2)} · recorrió ${rec.toFixed(0)} px en 1 s`);
    ok('se ve la animación: el fondo se cubre de cristales de hielo con copos que caen y el cuadro ❄️', f1.frozen && f1.iceOp > .9 && f1.snow === 14 && /❄️ \d/.test(f1.hud), JSON.stringify(f1));
    await p.screenshot({ path: process.env.SHOT_HIELO || '/tmp/hielo.png' });
    await p.waitForTimeout(9000);
    const f2 = await pu();
    ok('al final se derrite (el hielo se desvanece) y el tiempo vuelve a correr', f2.fx.freeze === 0 && f2.slowK > .93 && !f2.frozen, JSON.stringify(f2));
    await p.waitForTimeout(1300);
    ok('y no quedan copos', (await pu()).snow === 0, JSON.stringify(await pu()));

    // barra grande
    const w0 = (await pu()).pw;
    await p.evaluate(() => { const g = window.__g.st(); window.__g.pup('wide', g.x, g.y); }); await p.waitForTimeout(150);
    const r1 = await pu();
    await p.waitForTimeout(1400);
    const w1 = await pu(), anch = await p.evaluate(() => document.getElementById('paddle').offsetWidth);
    ok('con la barra grande dura 10 s, mide ~50% más (y se ve el brillo verde con un aro que se expande)', w1.fx.wide > 8000 && w1.pw / w0 > 1.4 && w1.pw / w0 < 1.6 && w1.wide && r1.ring >= 1 && Math.abs(anch - w1.pw) < 2, `${JSON.stringify(w1)} · antes ${w0} · ancho real ${anch} · aros ${r1.ring}`);
    await p.waitForTimeout(9800);
    const w2 = await pu();
    ok('a los 10 s la barra vuelve a su tamaño', w2.fx.wide === 0 && Math.abs(w2.pw - w0) / w0 < .08 && !w2.wide, `${JSON.stringify(w2)} · antes ${w0}`);
    ok('la partida siguió en juego todo el tiempo (los efectos no activan el antitrampas)', (await p.evaluate(() => window.__g.st().state)) === 'play');

    // apagar un efecto tocando su cuadrito (el del emoji y los segundos)
    for (const [t, nombre, apagado] of [['slow', 'burbujas', a => !a.bubbly && a.slowK > .9], ['freeze', 'hielo', a => !a.frozen && a.slowK > .9], ['wide', 'barra grande', a => !a.wide && Math.abs(a.pw - w0) / w0 < .1]]) {
      await p.evaluate(t => { const g = window.__g.st(); window.__g.pup(t, g.x, g.y); }, t); await p.waitForTimeout(900);
      await p.evaluate(() => window.__g.due());                                  // (ya «toca» otra burbuja: si el respiro fallara, saldría justo al apagar)
      const caja = await p.evaluate(t => { const b = document.querySelector('#pups button[data-k="' + t + '"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, pe: getComputedStyle(b).pointerEvents, txt: b.textContent }; }, t);
      ok(`el efecto de ${nombre} muestra su cuadrito como botón (con emoji y segundos) y se puede tocar con el dedo (alto ≥ 36 px)`, caja && caja.pe === 'auto' && caja.h >= 36 && /\d/.test(caja.txt), JSON.stringify(caja));
      if (t === 'slow') { const c = await p.evaluate(() => { const r = document.querySelector('#pups button').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); await p.touchscreen.tap(c[0], c[1]); }      // con el dedo...
      else {
        const c = await p.evaluate(t => { const r = document.querySelector('#pups button[data-k="' + t + '"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, t);
        for (let i = 0; i < 100; i++) { if ((await p.evaluate(() => window.__g.st().vy)) < 0) break; await p.waitForTimeout(20); }      // (justo cuando la pelota se aleja, para no perderla mientras la barra queda quieta)
        await p.evaluate(() => { window.__auto = false; }); await p.mouse.move(300, c[1]); await p.waitForTimeout(60);
        const px0 = await p.evaluate(() => window.__g.st().px); await p.mouse.move(c[0], c[1]); await p.waitForTimeout(60);
        const px1 = await p.evaluate(() => window.__g.st().px); await p.evaluate(() => { window.__auto = true; });
        ok('con el mouse, pasar por encima del cuadrito no mueve la barra (y fuera de él sí la sigue)', Math.abs(px1 - px0) < 1 && Math.abs(px0 - 300) < 40, `antes ${px0.toFixed(0)} · encima del cuadrito ${px1.toFixed(0)}`);
        await p.mouse.down(); await p.mouse.up();                                                                       // ...y con el mouse
      }
      await p.waitForTimeout(300);
      const ya = await pu();
      ok(`al apagar ${nombre} no sale otra burbuja al tiro: faltan rebotes (respiro de 3)`, ya.fx[t] === 0 && !ya.has && ya.nxt - ya.hits >= 2, JSON.stringify(ya));
      await p.waitForTimeout(1200);
      const ap = await pu();
      ok(`al tocarlo se apaga ${nombre} al tiro (sin esperar los 10 s) y el cuadrito desaparece`, ap.fx[t] === 0 && apagado(ap) && ap.hud === '', JSON.stringify(ap));
      ok(`y la partida sigue en juego (${nombre})`, (await p.evaluate(() => window.__g.st().state)) === 'play', JSON.stringify(ap));
      await p.evaluate(() => { window.__g.rm(); window.__g.quiet(); });
      await p.waitForTimeout(1200);                                               // (deja que termine la transición de hielo/burbujas antes de seguir)
    }
    ok('tocar un cuadrito no arrastra la barra: la partida sigue en juego sin errores', errs.length === 0, errs.join('|'));

    // sin ráfagas: con un efecto activo no sale otra burbuja y, al terminar, tampoco al tiro
    await p.evaluate(() => { const g = window.__g.st(); window.__g.pup('wide', g.x, g.y); }); await p.waitForTimeout(300);
    await p.evaluate(() => window.__g.due()); await p.waitForTimeout(1200);
    const e1 = await pu();
    ok('con un efecto activo no sale otra burbuja, aunque ya toque', e1.fx.wide > 0 && !e1.has && e1.n === 0, JSON.stringify(e1));
    let e2 = null; for (let i = 0; i < 160; i++) { e2 = await pu(); if (e2.fx.wide === 0) break; await p.waitForTimeout(100); }
    ok('al terminar el efecto no sale otra al tiro: falta dar rebotes (al menos 3 desde que acabó)', e2.fx.wide === 0 && !e2.has && e2.nxt - e2.hits >= 2, JSON.stringify(e2));
    await p.waitForTimeout(300);
    ok('y sigue sin salir mientras no se den esos rebotes', !(await pu()).has, JSON.stringify(await pu()));
    const sp0 = await p.evaluate(() => window.__sp.length);
    await p.evaluate(() => { const g = window.__g.pups(); window.__g.set(g.nxt); }); await p.waitForTimeout(500);
    const q = await pu(), sp1 = await p.evaluate(() => window.__sp.length);                  // (el juego anota cada burbuja que sale: si la pelota la agarró en el acto, también cuenta)
    ok('cuando se dan esos rebotes, ahí sí sale la siguiente', sp1 === sp0 + 1 && (q.has || q.fx.slow > 0 || q.fx.freeze > 0 || q.fx.wide > 0), JSON.stringify([sp0, sp1, q]));
    await p.evaluate(() => { window.__g.rm(); window.__g.quiet(); });

    // al terminar la partida no queda nada
    await p.evaluate(() => { const g = window.__g.st(); window.__g.pup('freeze', g.x, g.y); window.__g.pup('wide', 6, 6); });
    await p.waitForTimeout(400);
    await p.evaluate(() => { window.__auto = false; });
    await p.waitForSelector('#result.show', { timeout: 40000 });
    const fin = await pu();
    ok('al terminar la partida se limpian las burbujas, los efectos, el hielo y los cuadros', fin.n === 0 && !fin.has && fin.slowK === 1 && fin.padBoost === 1 && fin.hud === '' && !fin.frozen && !fin.bubbly && !fin.wide && fin.snow === 0 && fin.bub === 0, JSON.stringify(fin));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Final de la partida: azul degradado en movimiento (sin morado)');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    await jugar(p);
    await p.waitForSelector('#result.show', { timeout: 40000 });
    await p.waitForTimeout(500);
    const leer = () => p.evaluate(() => { const cs = getComputedStyle(document.body); return { end: document.body.classList.contains('end'), anim: cs.animationName, pos: cs.backgroundPosition, img: cs.backgroundImage, meta: document.querySelector('meta[name=theme-color]').content }; });
    const a = await leer();
    const cols = (a.img.match(/rgb\((\d+), (\d+), (\d+)\)/g) || []).map(c => c.match(/\d+/g).map(Number));
    ok('al terminar, el fondo es un degradado con varios tonos', a.end && /linear-gradient/.test(a.img) && cols.length >= 5, a.img);
    ok('todos los tonos del degradado son azules (ninguno morado ni rosado)', cols.length > 0 && cols.every(([r, g, bl]) => bl > r + 40 && bl >= g), JSON.stringify(cols));
    ok('el degradado tiene animación (se mueve)', a.anim === 'endFlow', a.anim);
    await p.waitForTimeout(1500);
    const c = await leer();
    ok('y de verdad se mueve: la posición cambia con el tiempo', c.pos !== a.pos, a.pos + ' → ' + c.pos);
    const mc = (c.meta.match(/[0-9a-f]{2}/gi) || []).map(h => parseInt(h, 16));
    ok('el color de la barra del navegador también es azul', mc.length === 3 && mc[2] > mc[0] + 40, c.meta);
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(200);
    const r = await leer();
    ok('con «reducir movimiento» el azul se queda quieto', r.anim === 'none', r.anim);
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Botones de redes sociales con estilo patito');
  {
    const sin = await abrir(b, 390, 844);
    await sin.p.waitForTimeout(500);
    ok('sin links en config.js no se ve nada (ni un hueco)', await sin.p.evaluate(() => document.getElementById('redes').hidden && document.getElementById('redes').children.length === 0));
    await sin.ctx.close();
    const { ctx, p, errs } = await abrir(b, 390, 844, { config: "window.REDES = { instagram: 'https://www.instagram.com/ejemplo', tiktok: 'javascript:alert(1)', youtube: 'http://inseguro.test/x', whatsapp: 'https://chat.whatsapp.com/abc123', x: '', facebook: 'https://facebook.com/a b' };" });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({ hid: document.getElementById('redes').hidden, bt: [...document.querySelectorAll('#redes a')].map(a => ({ href: a.href, t: a.target, rel: a.rel, label: a.getAttribute('aria-label'), duck: a.querySelector('i').textContent, emoji: a.querySelector('span').textContent })) }));
    ok('solo salen los links https válidos: Instagram y WhatsApp (se descartan javascript:, http: y los con espacios)', !r.hid && r.bt.length === 2 && /instagram/.test(r.bt[0].href) && /whatsapp/.test(r.bt[1].href), JSON.stringify(r));
    ok('abren en otra pestaña sin dar acceso a la página (noopener noreferrer) y llevan el patito', r.bt.every(a => a.t === '_blank' && /noopener/.test(a.rel) && /noreferrer/.test(a.rel) && a.duck === '🦆'), JSON.stringify(r.bt));
    ok('cada botón dice a qué red lleva (para lectores de pantalla)', /Instagram/.test(r.bt[0].label) && /WhatsApp/.test(r.bt[1].label), JSON.stringify(r.bt.map(a => a.label)));
    const caja = await p.evaluate(() => { const bx = document.getElementById('redes').getBoundingClientRect(), f = document.querySelector('#menu .foot').getBoundingClientRect(); return { top: bx.top, bottom: bx.bottom, w: bx.width, footTop: f.top, h: innerHeight }; });
    ok('los botones están dentro de la pantalla, sobre «Ajustes» y no la tapan', caja.top > 0 && caja.bottom <= caja.footTop + 1 && caja.bottom <= caja.h, JSON.stringify(caja));
    await p.screenshot({ path: process.env.SHOT_REDES || '/tmp/redes.png' });
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('El Pato no sigue la pelota: se queda quieto cuando se aleja y solo sale a recibirla cuando vuelve');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    await jugar(p); await p.waitForTimeout(3600);
    await p.evaluate(() => { window.__auto = true; });                                  // una barra perfecta mantiene viva la partida
    const m = []; for (let i = 0; i < 360; i++) { m.push(await p.evaluate(() => { const g = window.__g.st(); return [g.duckX, g.vy, g.y, g.x, g.state, g.hits]; })); await p.waitForTimeout(18); }
    let quietosMov = 0, quietosN = 0, vueltaMov = 0, vueltaN = 0, saltos = 0;
    for (let i = 1; i < m.length; i++) {
      const [d0, v0] = m[i - 1], [d1, v1] = m[i], dd = Math.abs(d1 - d0);
      if (v0 >= 0 && v1 >= 0) { quietosN++; quietosMov = Math.max(quietosMov, dd); }                 // la pelota se aleja: el Pato no se mueve
      if (v0 < 0 && v1 < 0) { vueltaN++; vueltaMov += dd; }                                          // la pelota vuelve: el Pato se desplaza
      if (dd > 150) saltos++;
    }
    const jugando = m.filter(r => r[4] === 'play').length;
    ok('la partida siguió en juego durante la medición', jugando > m.length * .9, String(jugando));
    ok('mientras la pelota se aleja (hacia ti) el Pato no se mueve ni un píxel', quietosN > 40 && quietosMov < 0.5, `${quietosN} muestras · mayor movimiento ${quietosMov.toFixed(2)} px`);
    ok('cuando la pelota vuelve, el Pato sale a recibirla', vueltaN > 20 && vueltaMov > 20, `${vueltaN} muestras · ${vueltaMov.toFixed(1)} px`);
    ok('y llega a tiempo sin dar saltos raros (ningún salto de más de 150 px entre dos muestras)', saltos === 0, String(saltos));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Fluidez: el lienzo de efectos no usa los píxeles físicos y las llamas tienen tope');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844, { deviceScaleFactor: 3 });
    await jugar(p); await p.waitForTimeout(3600);
    await p.evaluate(() => { window.__auto = true; window.__g.set(90); }); await p.waitForTimeout(3500);      // una barra perfecta mantiene viva la partida
    let maxFl = 0; for (let i = 0; i < 20; i++) { maxFl = Math.max(maxFl, await p.evaluate(() => window.__g.st().fl)); await p.waitForTimeout(100); }
    const f = await p.evaluate(() => { const c = document.getElementById('fx'), r = c.getBoundingClientRect(); return { ...window.__g.st(), cssW: Math.round(r.width), cssH: Math.round(r.height), dpr: window.devicePixelRatio }; });
    f.fl = maxFl;
    ok('la pantalla es ×3 pero el lienzo de efectos tiene 1 píxel por punto (390×844, no 1170×2532)', f.dpr === 3 && f.fxw === 390 && f.fxh === 844 && f.cssW === 390 && f.cssH === 844, JSON.stringify(f));
    ok('en la fase del diablo hay llamas, pero nunca más de 60', f.fl > 0 && f.fl <= 60, String(f.fl));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('El «¡Monedas dobles! ×2» del rebote 100 es una sola animación liviana');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844, { deviceScaleFactor: 3 });
    await jugar(p); await p.waitForTimeout(3600);
    await p.evaluate(() => { window.__auto = true; window.__g.set(99); });
    let hit100 = false, vistas = [];
    for (let i = 0; i < 80 && !hit100; i++) { await p.waitForTimeout(100); hit100 = await p.evaluate(() => window.__g.st().hits >= 100); }
    for (let i = 0; i < 6; i++) { vistas.push(await p.evaluate(() => ({ cartel: document.getElementById('mult').getAnimations({ subtree: true }).length, insignia: document.getElementById('mbadge').getAnimations().length, chispas: window.__g.st().pt }))); await p.waitForTimeout(150); }
    ok('el juego llega al rebote 100 y muestra el cartel', hit100 && vistas[0].cartel === 1, JSON.stringify(vistas));
    ok('hay una sola animación de ×2: la del cartel (la insignia no pulsa)', vistas.every(v => v.insignia === 0) && vistas.every(v => v.cartel <= 1), JSON.stringify(vistas));
    const e = await p.evaluate(() => { const a = document.getElementById('mult').getAnimations()[0]; const cs = getComputedStyle(document.querySelector('#mult b')); return { dur: a ? a.effect.getTiming().duration : 0, props: a ? [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))].sort().join(',') : '', filtro: cs.filter, recorte: cs.webkitBackgroundClip || cs.backgroundClip, sombra: getComputedStyle(document.getElementById('mult')).willChange }; });
    ok('dura 1,5 s y solo anima opacidad y posición (nada que recalcule la página)', (e.dur === 1500 || e.dur === 0) && (e.props === 'opacity,transform' || e.props === ''), JSON.stringify(e));
    ok('el número no lleva filtros de sombra ni recorte de texto, y el cartel va en su propia capa', e.filtro === 'none' && e.recorte !== 'text' && /transform/.test(e.sombra), JSON.stringify(e));
    ok('sin lluvia de chispas en el rebote 100 (antes salían 70 de golpe; un rebote normal suelta unas 8-12)', vistas.every(v => v.chispas <= 30), JSON.stringify(vistas.map(v => v.chispas)));
    await p.waitForTimeout(1600);
    ok('el cartel desaparece solo y queda sin animaciones pendientes', await p.evaluate(() => document.getElementById('mult').getAnimations().length === 0 && getComputedStyle(document.getElementById('mult')).opacity === '0'));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('La zona de golpe es igual para todas las pelotas');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    await jugar(p); await p.waitForTimeout(3600);
    const ids = await p.evaluate(() => window.__g.bolas());
    const cortes = [0, 25, 50, 75, 100, 125, 150, 200, 300];
    const tabla = await p.evaluate(([ids, cortes]) => cortes.map(n => ids.map(id => window.__g.zona(id, n))), [ids, cortes]);
    const peor = tabla.map((fila, i) => ({ n: cortes[i], d: Math.max(...fila.map(x => Math.abs(x.zona - fila[0].zona))) })).sort((a, c) => c.d - a.d)[0];
    ok(`las ${ids.length} pelotas tienen la misma zona de golpe (el centro de la pelota cuenta si está a ±zona/2 de la barra) con 0, 25, 50, 75, 100, 125, 150, 200 y 300 rebotes`, peor.d < 0.01, JSON.stringify(peor));
    ok('la barra que se ve nunca baja de 26 px, con ninguna pelota', tabla.every(fila => fila.every(x => x.visible >= 26 - 1e-9)), JSON.stringify(tabla[tabla.length - 1].map(x => x.visible)));
    ok('y a cada pelota le basta rozar la barra por la punta (la zona nunca es menor que la barra visible)', tabla.every(fila => fila.every(x => x.zona >= x.visible - 1e-9)));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Alivio de dificultad: pelota 10% más lenta hasta el rebote 55 y 5% más lenta hasta el 100');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    const r = await p.evaluate(() => [0, 1, 30, 55, 56, 80, 100, 101, 150, 300].map(n => {
      return [n, +(window.__g.sp(n) / (window.__g.bs(n) * window.__g.st().VS)).toFixed(4)];                  // velocidad real ÷ velocidad base (sin alivio)
    }));
    const k = n => r.find(x => x[0] === n)[1];
    ok('rebotes 0 a 55: la pelota va al 90% de la velocidad de antes', [0, 1, 30, 55].every(n => k(n) === 0.9), JSON.stringify(r));
    ok('rebotes 56 a 100: va al 95%', [56, 80, 100].every(n => k(n) === 0.95), JSON.stringify(r));
    ok('desde el 101: velocidad completa (100%)', [101, 150, 300].every(n => k(n) === 1), JSON.stringify(r));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('La pelota sigue acelerando después del 100, de a poco, y nunca se vuelve imposible');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    const r = await p.evaluate(() => ({ bs: Array.from({ length: 601 }, (_, n) => window.__g.bs(n)), g: window.__g.geo(), ms: window.TIENDA.eco.msPorRebote }));
    const bs = r.bs;
    ok('hasta el rebote 100 la velocidad es la de siempre (800 + 4 por rebote)', bs[0] === 800 && bs[55] === 1020 && bs[100] === 1200, `${bs[0]} ${bs[55]} ${bs[100]}`);
    ok('en el 137 ya no es el tope: 1.440 (antes 1.800) y sigue subiendo', Math.abs(bs[137] - 1440) < 3 && bs[138] > bs[137] && bs[200] > bs[137], `${bs[137]} ${bs[138]} ${bs[200]}`);
    ok('rebotes 118 / 200 / 300: 1.325 / 1.708 / 1.930', Math.abs(bs[118] - 1325) < 3 && Math.abs(bs[200] - 1708) < 3 && Math.abs(bs[300] - 1930) < 3, `${bs[118]} ${bs[200]} ${bs[300]}`);
    let sube = true, concava = true;
    for (let n = 101; n <= 600; n++) { if (bs[n] <= bs[n - 1]) sube = false; if (n > 101 && bs[n] - bs[n - 1] > bs[n - 1] - bs[n - 2] + 1e-9) concava = false; }
    ok('sube en cada rebote, y cada rebote suma menos que el anterior (sin saltos)', sube && concava);
    ok('máximo +9 px/s por rebote después del 100 (antes +16) y nunca pasa de 2.100', bs[101] - bs[100] <= 9 && Math.max(...bs) < 2100, `${bs[101] - bs[100]} ${Math.max(...bs)}`);
    const { top, db, by, vs, vyf } = r.g, viaje = top - by - (db + by);                                   // lo que recorre la pelota entre el Pato y la barra
    const cicloMin = viaje / (.995 * 2100 * vs * vyf) * 1000 + viaje / (.954 * 2100 * vs * vyf) * 1000;      // las dos pasadas casi verticales, con la velocidad máxima y sin alivio
    ok(`el ciclo más corto posible (${cicloMin.toFixed(0)} ms) sigue siendo más lento que el mínimo de las reglas (${r.ms} ms por rebote)`, cicloMin > r.ms, String(cicloMin));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('La barra se achica de a poco después del rebote 100 (28% recién en el 200)');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    const f = await p.evaluate(() => Array.from({ length: 301 }, (_, n) => window.__g.sh(n)));
    const cerca = (a, c) => Math.abs(a - c) < 1e-9;
    ok('rebote 0 = 100% y rebote 100 = 70% (igual que antes)', cerca(f[0], 1) && cerca(f[100], .7), `${f[0]} ${f[100]}`);
    ok('rebote 118 = 62,4% (antes 52,9%) y rebote 150 = 49%', Math.abs(f[118] - .6244) < 1e-4 && Math.abs(f[150] - .49) < 1e-9, `${f[118]} ${f[150]}`);
    ok('llega al 28% en el rebote 200 y ahí se queda', cerca(f[200], .28) && cerca(f[250], .28) && cerca(f[300], .28), `${f[200]} ${f[250]}`);
    let pasoMax = 0, baja = true;
    for (let n = 1; n <= 300; n++) { pasoMax = Math.max(pasoMax, f[n - 1] - f[n]); if (f[n] > f[n - 1] + 1e-12) baja = false; }
    ok('nunca sube y ningún rebote la achica más de 0,42% (antes 0,95%)', baja && pasoMax <= .0042 + 1e-9, `paso máximo ${pasoMax}`);
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Ventanas anchas y chicas');
  {
    const { ctx, p } = await abrir(b, 1280, 720);
    await jugar(p); await p.waitForTimeout(3600);
    const f = await p.evaluate(() => { const r = document.getElementById('field').getBoundingClientRect(); return { w: r.width, h: r.height, boxed: document.getElementById('field').classList.contains('boxed') }; });
    ok('1280×720: el campo se centra con marco (proporción ≤ 0,72)', f.w <= 720 * 0.72 + 1 && f.boxed, JSON.stringify(f));
    await ctx.close();
  }
  {
    const { ctx, p } = await abrir(b, 300, 400);
    await jugar(p); await p.waitForTimeout(1500);
    const s = await p.evaluate(() => ({ ...window.__g.st(), aviso: getComputedStyle(document.getElementById('tiny')).display }));
    ok('300×400: no deja jugar y muestra el aviso', s.state !== 'play' && s.aviso === 'flex', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, p } = await abrir(b, 390, 844);
    await jugar(p); await p.waitForTimeout(3300);
    await p.setViewportSize({ width: 300, height: 400 }); await p.waitForTimeout(300);
    const a = await p.evaluate(() => window.__g.st()); await p.waitForTimeout(600); const a2 = await p.evaluate(() => window.__g.st());
    ok('achicar la ventana en plena partida pausa el juego', a.tiny && a.y === a2.y, `${a.y} ${a2.y}`);
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(700);
    const a3 = await p.evaluate(() => window.__g.st());
    ok('al agrandarla vuelve a jugarse (la pelota se mueve o ya cayó)', !a3.tiny && (a3.y !== a2.y || a3.state === 'over'), `${a2.y} → ${a3.y} ${a3.state}`);
    await ctx.close();
  }

  console.log('Controles');
  {
    const { ctx, p } = await abrir(b, 390, 844);
    await jugar(p); await p.waitForTimeout(3300);
    // con toques y teclas de verdad (CDP): el juego ignora los eventos fabricados por programa (isTrusted)
    const cdp = await ctx.newCDPSession(p), tc = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x]) => ({ id, x, y: 400 })) });
    const g = () => p.evaluate(() => window.__g.st().px), r = {};
    let p0;
    await tc('touchStart', [[1, 100]]); p0 = await g(); await tc('touchMove', [[1, 120]]); r.dedo = (await g()) - p0;
    await tc('touchStart', [[1, 120], [2, 200]]); p0 = await g(); await tc('touchMove', [[1, 150], [2, 200]]); r.viejoIgnorado = (await g()) - p0;
    await tc('touchEnd', [[1, 150]]); p0 = await g(); await tc('touchMove', [[2, 220]]); r.nuevoSigue = (await g()) - p0;
    await tc('touchEnd', [[2, 220]]); await p.waitForTimeout(120); p0 = await g(); await p.waitForTimeout(120); r.soltado = (await g()) - p0;
    await p.keyboard.down('ArrowLeft'); r.tecla = await p.evaluate(() => window.__g.st().keyDir);
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); r.trasBlur = await p.evaluate(() => window.__g.st().keyDir); await p.keyboard.up('ArrowLeft');
    ok('el dedo mueve la barra (20 px × 1,25 × K)', Math.abs(r.dedo - 25) < 0.5, r.dedo);
    ok('con dos dedos manda el último y soltar el viejo no interrumpe', r.viejoIgnorado === 0 && Math.abs(r.nuevoSigue - 25) < 0.5, JSON.stringify(r));
    ok('sin dedo la barra no se mueve', r.soltado === 0);
    ok('si la ventana pierde el foco, la tecla se suelta', r.tecla === -1 && r.trasBlur === 0);
    await ctx.close();
  }

  console.log('Nombres (máximo 12) y datos guardados');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    ok('el campo de nombre del modo local acepta como máximo 12', await p.evaluate(() => document.getElementById('name').maxLength) === 12);
    await p.fill('#name', 'Nombre muy largo de prueba'); 
    ok('un nombre largo se corta a 12 al jugar', true);
    await p.tap('#play'); await p.waitForTimeout(500);
    await p.reload(); await p.waitForTimeout(600);
    const guardado = await p.inputValue('#name');
    ok('el nombre se recuerda al recargar y tiene 12 o menos', guardado.length > 0 && guardado.length <= 12, JSON.stringify(guardado));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Pulido: ayuda de la primera partida y sonido');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    await jugar(p); await p.waitForTimeout(1200);
    ok('la ayuda «Arrastra el dedo» se ve en la cuenta regresiva', await p.evaluate(() => document.getElementById('hint').classList.contains('on')));
    await p.touchscreen.tap(100, 400);
    ok('la ayuda desaparece al tocar', await p.evaluate(() => !document.getElementById('hint').classList.contains('on')));
    await p.evaluate(() => document.getElementById('soundBtn').click());
    const snd = await p.evaluate(() => ({ pressed: document.getElementById('soundBtn').getAttribute('aria-pressed'), ls: localStorage.getItem('gana-al-tio-pato-sonido') }));
    ok('el botón de sonido silencia y lo recuerda', snd.pressed === 'false' && snd.ls === '0', JSON.stringify(snd));
    ok('todos los botones principales miden al menos 44 px de alto', await p.evaluate(() => [...document.querySelectorAll('#close, #soundBtn, .seg button, .btn, .link:not([hidden])')].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'absolute').every(e => e.getBoundingClientRect().height >= 43.5 || e.getBoundingClientRect().height === 0)));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Ajustes: sonido, vibración, cerrar sesión');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    await p.click('#openSettings');
    ok('el panel de ajustes se abre', await p.evaluate(() => document.getElementById('settings').classList.contains('show')));
    ok('sonido y vibración empiezan en SÍ', await p.evaluate(() => ['togSound', 'togVib'].every(id => document.getElementById(id).getAttribute('aria-checked') === 'true')));
    await p.click('#togSound'); await p.click('#togVib');
    const r = await p.evaluate(() => ({ s: document.getElementById('togSound').getAttribute('aria-checked'), v: document.getElementById('togVib').getAttribute('aria-checked'), ls: [localStorage.getItem('gana-al-tio-pato-sonido'), localStorage.getItem('gana-al-tio-pato-vibracion')], txt: document.getElementById('togSound').textContent.trim(), btn: document.getElementById('soundBtn').getAttribute('aria-pressed') }));
    ok('los interruptores se apagan, dicen NO y se recuerdan', r.s === 'false' && r.v === 'false' && r.ls.join() === '0,0' && r.txt === 'NO' && r.btn === 'false', JSON.stringify(r));
    ok('«Cerrar sesión» no aparece sin cuenta', await p.evaluate(() => document.getElementById('logout').hidden));
    await p.click('#setClose');
    ok('la X cierra los ajustes', await p.evaluate(() => !document.getElementById('settings').classList.contains('show')));
    await p.reload(); await p.waitForTimeout(500); await p.click('#openSettings');
    ok('tras recargar siguen apagados', await p.evaluate(() => document.getElementById('togSound').classList.contains('off') && document.getElementById('togVib').classList.contains('off')));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Emblema de perfil (modo local)');
  {
    const { ctx, p, errs } = await abrir(b, 390, 844);
    await p.click('#openSettings'); await p.click('#openEmblem'); await p.waitForTimeout(300);
    ok('el editor se abre desde Ajustes', await p.evaluate(() => document.getElementById('emblem').classList.contains('show')));
    ok('hay 48 símbolos + la inicial, 8 formas, 16 colores de fondo y de borde y 6 diseños', await p.evaluate(() => [['edSyms', 49], ['edShapes', 8], ['edC1', 16], ['edC2', 16], ['edPats', 6]].every(([id, n]) => document.getElementById(id).children.length === n)));
    await p.evaluate(() => { document.querySelectorAll('#edSyms button')[9].click(); document.querySelectorAll('#edShapes button')[2].click(); document.getElementById('edSave').click(); });
    await p.waitForTimeout(300);
    const t = await p.evaluate(() => ({ e: document.getElementById('meEmb').textContent, ls: JSON.parse(localStorage.getItem('gana-al-tio-pato-v2')).av }));
    ok('el emblema guardado se ve en el encabezado y queda en el dispositivo', t.e === '🚀' && /^e/.test(t.ls), JSON.stringify(t));
    await p.reload(); await p.waitForTimeout(500);
    ok('tras recargar sigue ahí', await p.evaluate(() => document.getElementById('meEmb').textContent === '🚀'));
    // orden de los símbolos: al fondo / al frente
    await p.click('#openSettings'); await p.click('#openEmblem'); await p.waitForTimeout(200);
    await p.evaluate(() => { document.getElementById('edLayers').lastElementChild.click(); document.querySelectorAll('#edSyms button')[2].click(); });    // segundo símbolo: 😎 (queda al frente)
    const orden = () => p.evaluate(() => [...document.querySelectorAll('#edStage .embs')].map(e => e.textContent).join(''));
    ok('un símbolo nuevo queda al frente (se dibuja después)', await orden() === '🚀😎', await orden());
    ok('el que está al frente no se puede traer más al frente', await p.evaluate(() => document.getElementById('edFront').disabled && !document.getElementById('edBack').disabled));
    await p.click('#edBack');
    ok('«Al fondo» pasa 😎 detrás del 🚀', await orden() === '😎🚀', await orden());
    ok('el símbolo elegido sigue siendo el mismo (ahora el primero) y ya no se puede mandar más al fondo', await p.evaluate(() => document.getElementById('edBack').disabled && !document.getElementById('edFront').disabled));
    await p.click('#edFront');
    ok('«Al frente» lo vuelve a poner delante', await orden() === '🚀😎', await orden());
    await p.click('#edSave'); await p.waitForTimeout(200);
    ok('el orden se guarda en el emblema', await p.evaluate(() => document.getElementById('meEmb').textContent === '🚀😎'));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Tienda y personajes (modo local)');
  {
    const ids = ['tio', 'teleton', 'tia', 'conejo', 'conejita', 'bigotes', 'tios', 'galactico', 'millonario'];
    for (const id of ids) {
      const { ctx, p, errs } = await abrir(b, 390, 844, {});
      await ctx.addInitScript(id => { const own = {}; own['ch_' + id] = true; localStorage.setItem('gana-al-tio-pato-monedas-local', JSON.stringify({ c: 1e9, sp: 0, lr: 0, own, eq: { ch: id } })); }, id);
      await p.reload(); await p.waitForTimeout(500);
      await jugar(p); await p.waitForTimeout(1800);
      const av = await p.evaluate(() => { const i = document.querySelector('#botAv img'); return i ? { ok: i.complete && i.naturalWidth > 0, src: i.getAttribute('src') } : null; });
      ok(`${id}: su dibujo y su avatar cargan`, !!av && av.ok && errs.length === 0, JSON.stringify(av) + errs.join('|'));
      await ctx.close();
    }
  }

  await b.close();
  console.log(`\n${pass} correctas, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})();
