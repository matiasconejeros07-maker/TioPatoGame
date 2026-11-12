// Pantalla de carga (los Tíos Patitos saltando) y ruleta del día como lo primero que sale al abrir el juego: el juego real contra un Firebase de mentira con las reglas reales.
// Uso:  cd pruebas && npm install && node carga.test.js
const fs = require('fs');
const { chromium, st, newPage, registrar, mocks, PAGE } = require('./mockfirebase.js');
const DAY = 86400000;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
const cerrarDiario = p => p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); });
const txt = (p, sel) => p.evaluate(s => document.querySelector(s).textContent.trim(), sel);
const abierto = p => p.evaluate(() => document.getElementById('daily').classList.contains('show'));
const cargaViva = p => p.evaluate(() => { const s = document.getElementById('splash'); return !!s && !s.classList.contains('out'); });
// una cuenta con la racha de hoy por reclamar (n = 3, último cobro hace más de un día) y, según `ruleta`, el giro de hoy sin hacer / hecho
const cuenta = async (b, nombre, ruleta, opts) => {
  const { ctx, p, errs } = await newPage(b, opts); const uid = await registrar(p, nombre); await cerrarDiario(p);
  st.db.streaks = { ...(st.db.streaks || {}), [uid]: { n: 3, t: Date.now() - DAY - 1000 } };
  st.db.ruleta = { ...(st.db.ruleta || {}) }; if (ruleta) st.db.ruleta[uid] = ruleta; else delete st.db.ruleta[uid];
  return { ctx, p, errs, uid };
};
// abre el juego sin esperar a que termine de cargar (para ver la pantalla de carga desde el primer instante)
const abrirRapido = async (b, opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...opts });
  await mocks(ctx); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errs.push(m.text()));
  const t0 = Date.now(); await p.goto(PAGE, { waitUntil: 'commit' }); await p.waitForSelector('#splash img', { timeout: 5000 });
  return { ctx, p, errs, t0 };
};
const esperaSalida = async (p, t0, tope) => { while (Date.now() - t0 < tope) { if (!(await cargaViva(p))) return Date.now() - t0; await p.waitForTimeout(40); } return -1; };

(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});

  console.log('Pantalla de carga: los Tíos Patitos saltando');
  {
    const { ctx, p, errs, t0 } = await abrirRapido(b); await p.waitForTimeout(250);
    ok('mientras carga no se puede tocar el juego de abajo (la carga recibe los toques)', await p.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return !!e && !!e.closest('#splash'); }));
    const a = await p.evaluate(() => {
      const s = document.getElementById('splash'), img = s.querySelector('.spLogo'), r = s.getBoundingClientRect(), cs = getComputedStyle(img);
      return { w: r.width, h: r.height, z: getComputedStyle(s).zIndex, pos: getComputedStyle(s).position, src: img.getAttribute('src'), cargada: img.complete && img.naturalWidth > 100, anim: cs.animationName, iter: cs.animationIterationCount, txt: s.textContent.replace(/\s+/g, ' ').trim(), vw: innerWidth, vh: innerHeight, role: s.getAttribute('role') };
    });
    ok('lo primero que hay en la pantalla es la carga, tapando todo el juego', a.pos === 'fixed' && a.w === a.vw && a.h === a.vh && +a.z >= 9000, JSON.stringify(a));
    ok('muestra el logo de los Tíos Patitos (ya cargado) y dice «Cargando…»', /icons\/logo-carga\.webp$/.test(a.src) && a.cargada && /^Cargando/.test(a.txt), JSON.stringify(a));
    ok('el logo salta sin parar (animación spJump infinita)', a.anim === 'spJump' && a.iter === 'infinite', JSON.stringify(a));
    ok('se anuncia a los lectores de pantalla (role=status)', a.role === 'status');
    // el logo realmente se mueve: se mide su posición y su tamaño 20 veces durante un salto (.75 s) y medio
    const medidas = []; for (let i = 0; i < 20; i++) { medidas.push(await p.evaluate(() => { const r = document.querySelector('#splash .spLogo').getBoundingClientRect(), e = document.querySelector('#splash .spStage').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, w: r.width, h: r.height, suelo: e.bottom }; })); await p.waitForTimeout(50); }
    const rango = k => Math.max(...medidas.map(m => m[k])) - Math.min(...medidas.map(m => m[k]));
    ok(`sube y baja de verdad (se mueve ${rango('top').toFixed(0)} px durante el salto)`, rango('top') > 20, medidas.map(m => m.top.toFixed(0)).join(','));
    ok('salta solo hacia arriba: no se agacha ni se hunde (nunca baja del suelo donde está parado)', medidas.every(m => m.bottom <= m.suelo + 0.6), JSON.stringify(medidas.map(m => [m.bottom, m.suelo])));
    ok('en línea recta y sin deformarse: no se mueve a los lados ni cambia de ancho ni de alto', rango('left') < 0.6 && rango('w') < 0.6 && rango('h') < 0.6, JSON.stringify({ left: rango('left'), w: rango('w'), h: rango('h') }));
    const mov = await p.evaluate(() => {                                                       // los fotogramas de la animación solo usan translateY (nada de scale ni rotate)
      const r = []; for (const h of document.styleSheets) for (const rule of h.cssRules) if (rule.type === CSSRule.KEYFRAMES_RULE && rule.name === 'spJump') for (const k of rule.cssRules) r.push(k.style.getPropertyValue('transform'));
      return r;
    });
    ok('la animación solo mueve en vertical (translateY), sin scale ni rotate', mov.length >= 3 && mov.every(t => /^translateY\([^)]*\)$/.test(t)), JSON.stringify(mov));
    const sombra = await p.evaluate(() => getComputedStyle(document.querySelector('#splash .spShadow')).animationName);
    ok('su sombra en el suelo se achica cuando el logo sube', sombra === 'spShadow');
    await p.screenshot({ path: process.env.SHOT || '/tmp/carga_1.png' });
    // se queda al menos 1,5 s (contados desde que se abrió la página) y se va sola
    const fuera = await esperaSalida(p, t0, 6000);
    ok(`se queda lo justo para ver los saltos (≥ 1,4 s) y se va sola (se fue a los ${fuera} ms)`, fuera >= 1400 && fuera <= 4500, String(fuera));
    await p.waitForTimeout(900);
    ok('al irse se borra del todo (no queda nada tapando ni en la página)', await p.evaluate(() => !document.getElementById('splash')));
    ok('y el juego de abajo se puede usar: se ve la pantalla de inicio', await p.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return !!e && !e.closest('#splash'); }) && (await p.isVisible('#tabUp') || await p.isVisible('#play')));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Con «reducir movimiento» no salta (queda quieto) y se va más rápido');
  {
    const { ctx, p, t0 } = await abrirRapido(b, { reducedMotion: 'reduce' }); await p.waitForTimeout(100);
    const a = await p.evaluate(() => ({ anim: getComputedStyle(document.querySelector('#splash .spLogo')).animationName, dots: getComputedStyle(document.querySelector('#splash .spTxt i')).animationName }));
    ok('el logo y los puntitos quedan quietos', a.anim === 'none' && a.dots === 'none', JSON.stringify(a));
    const fuera = await esperaSalida(p, t0, 5000);
    ok(`se va a los ${fuera} ms (antes de 1,4 s no se queda esperando en balde)`, fuera >= 600 && fuera < 1400, String(fuera));
    await ctx.close();
  }

  console.log('La ruleta del día es lo primero que sale (cuando ya se fue la pantalla de carga)');
  {
    const { ctx, p, errs, uid } = await cuenta(b, 'Carga Uno', null);                       // racha de hoy por reclamar Y ruleta sin girar
    const t0 = Date.now(); await p.reload(); await p.waitForTimeout(500);
    ok('a los 0,5 s todavía está la pantalla de carga y la ruleta no se ve aún', await cargaViva(p) && !(await abierto(p)));
    let abrio = -1, cargaAlAbrir = null; while (Date.now() - t0 < 9000) { if (await abierto(p)) { abrio = Date.now() - t0; cargaAlAbrir = await p.evaluate(() => { const s = document.getElementById('splash'); return !s || s.classList.contains('out'); }); break; } await p.waitForTimeout(40); }
    ok(`la ruleta se abre sola (a los ${abrio} ms) justo cuando la pantalla de carga ya se está yendo, no antes`, abrio > 1300 && cargaAlAbrir === true, `${abrio} ${cargaAlAbrir}`);
    await p.waitForTimeout(900);
    ok('lo primero es «Ruleta diaria 🎡» con la rueda y el botón «Girar la ruleta» (no la racha)', /Ruleta diaria/.test(await txt(p, '#dailyTitle')) && await p.evaluate(() => !document.getElementById('wheelBox').hidden) && (await txt(p, '#dailyGo')) === '🎡 Girar la ruleta', await txt(p, '#dailyTitle'));
    await p.screenshot({ path: process.env.SHOT3 || '/tmp/carga_ruleta.png' });
    await p.tap('#dailyGo'); await p.waitForTimeout(7200);
    const r = st.db.ruleta[uid];
    ok('giras y cobras: el servidor anotó el giro de hoy (t) y el cobro (c = t)', r && r.c === r.t && Math.abs(r.t - Date.now()) < 60000, JSON.stringify(r));
    await p.waitForTimeout(2600);
    ok('cobrada la ruleta, la ventana pasa sola a la racha de hoy (que seguía por reclamar)', /Racha diaria/.test(await txt(p, '#dailyTitle')) && /^Reclamar/.test(await txt(p, '#dailyGo')), await txt(p, '#dailyTitle') + ' | ' + await txt(p, '#dailyGo'));
    await p.tap('#dailyGo'); await p.waitForTimeout(2000);
    ok('y reclamas la racha: pasa al día 4', st.db.streaks[uid].n === 4, JSON.stringify(st.db.streaks[uid]));
    await p.tap('#dailyClose'); await p.waitForTimeout(300);
    await p.reload(); await p.waitForTimeout(3300);
    ok('al volver a abrir el mismo día ya no sale nada solo (la ruleta es una vez al día y la racha ya está cobrada)', !(await abierto(p)));
    ok('sin denegados ni errores de página', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
    st.denied.length = 0; await ctx.close();
  }
  {
    const { ctx, p } = await cuenta(b, 'Carga Dos', null);
    await p.reload(); await p.waitForTimeout(3300);
    ok('sale la ruleta primero (la racha de hoy también está por reclamar)', await abierto(p) && /Ruleta diaria/.test(await txt(p, '#dailyTitle')));
    await p.tap('#dailyClose'); await p.waitForTimeout(1500);
    ok('si la cierras sin girar no se abre otra ventana encima (tú decides; la racha sigue en su botón 🔥 con el punto)', !(await abierto(p)) && await p.evaluate(() => document.getElementById('streakChip').classList.contains('go')));
    await ctx.close();
  }
  {
    const ahora = Date.now() - 3000;                                                          // hace 3 s (no «hace 1 hora»: pasada la medianoche de Chile caería en el día anterior y la prueba dependería de la hora a la que corre)
    const { ctx, p } = await cuenta(b, 'Carga Tres', { t: ahora, c: ahora });                  // la ruleta de hoy ya está girada y cobrada
    await p.reload(); await p.waitForTimeout(3300);
    ok('con la ruleta de hoy ya girada, lo primero es la racha por reclamar (como siempre)', await abierto(p) && /Racha diaria/.test(await txt(p, '#dailyTitle')) && /^Reclamar/.test(await txt(p, '#dailyGo')), await txt(p, '#dailyTitle'));
    await ctx.close();
  }
  {
    const hace = Date.now() - 3 * 3600000;
    const { ctx, p } = await cuenta(b, 'Carga Cuatro', { t: hace });                           // giró pero no alcanzó a cobrar
    await p.reload(); await p.waitForTimeout(3300);
    ok('si giraste y no cobraste el premio, la ruleta sale primero con «Cobrar mi premio»', await abierto(p) && /Ruleta diaria/.test(await txt(p, '#dailyTitle')) && (await txt(p, '#dailyGo')) === 'Cobrar mi premio', await txt(p, '#dailyTitle') + ' | ' + await txt(p, '#dailyGo'));
    await ctx.close();
  }
  {
    const ayer = Date.now() - DAY - 3600000;
    const { ctx, p } = await cuenta(b, 'Carga Cinco', { t: ayer, c: ayer });                    // el último giro fue ayer: hoy toca otra vez
    await p.reload(); await p.waitForTimeout(3300);
    ok('al día siguiente la ruleta vuelve a salir sola y primero', await abierto(p) && /Ruleta diaria/.test(await txt(p, '#dailyTitle')) && (await txt(p, '#dailyGo')) === '🎡 Girar la ruleta', await txt(p, '#dailyTitle'));
    await ctx.close();
  }

  console.log('Cuenta nueva: primero la racha del día 1 (así se destraba la ruleta) y luego la ruleta');
  {
    const { ctx, p, errs } = await newPage(b); await registrar(p, 'Carga Nueva'); await p.waitForTimeout(500);
    ok('la primera vez sale la racha (la ruleta se destraba al reclamar el día 1)', await abierto(p) && /Racha diaria/.test(await txt(p, '#dailyTitle')), await txt(p, '#dailyTitle'));
    await p.tap('#dailyGo'); await p.waitForTimeout(4800);
    ok('reclamada, pasa sola a la ruleta', /Ruleta diaria/.test(await txt(p, '#dailyTitle')), await txt(p, '#dailyTitle'));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Si Firebase no responde, la pantalla de carga se va igual');
  {
    const { ctx, p, errs } = await cuenta(b, 'Carga Seis', null);
    await ctx.route('**/*firebaseio.com/**', () => {});                                          // las consultas se quedan colgadas
    const t0 = Date.now(); await p.reload({ waitUntil: 'commit' }); await p.waitForSelector('#splash', { timeout: 4000 }).catch(() => {});
    let fuera = -1; while (Date.now() - t0 < 12000) { if (!(await p.evaluate(() => { const s = document.getElementById('splash'); return !!s && !s.classList.contains('out'); }).catch(() => true))) { fuera = Date.now() - t0; break; } await p.waitForTimeout(100); }
    ok(`no se queda pegada: se va a los ${fuera} ms (máximo 8 s de espera + el tiempo de la carga)`, fuera >= 6000 && fuera <= 10500, String(fuera));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close().catch(() => {});
  }

  console.log(`\n${pass} correctas, ${fail} fallas`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
