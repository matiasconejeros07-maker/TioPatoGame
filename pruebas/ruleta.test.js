// Ruleta diaria de punta a punta (juego + reglas reales de Firebase): un giro por día, el resultado sale de la hora del servidor y el premio se cobra en pesos o en un multiplicador guardado.
// Uso:  cd pruebas && npm install && node ruleta.test.js
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { chromium, st, newPage, playHits, registrar, JUEGO } = require('./mockfirebase.js');
const DAY = 86400000;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
const cx = { window: {} }; vm.createContext(cx); vm.runInContext(fs.readFileSync(path.join(JUEGO, 'tienda.js'), 'utf8'), cx);
const RU = cx.window.TIENDA.eco.ruleta, N = RU.premios.reduce((a, x) => a + x[2], 0);
const premioDe = t => { const x = ((t % N) + N) % N; let acc = 0; for (const pr of RU.premios) { acc += pr[2]; if (x < acc) return pr; } };
const tDe = idx => { let acc = 0; for (let i = 0; i < idx; i++) acc += RU.premios[i][2]; const base = Math.floor((Date.now() - 3600000) / N) * N; return base + acc; };     // una hora de hace un rato cuyo resultado es el premio idx
const cerrarDiario = p => p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); });
const txt = (p, sel) => p.evaluate(s => document.querySelector(s).textContent.trim(), sel);
const vis = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);
const money = n => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const { ctx, p, errs } = await newPage(b);
  const uid = await registrar(p, 'Ruleta Uno');

  console.log('La ruleta aparece cuando ya reclamaste tu racha');
  ok('antes de reclamar la racha no hay pestaña «Ruleta» (los multiplicadores se guardan en la racha)', !(await vis(p, '#tabR')));
  await p.tap('#dailyGo'); await p.waitForTimeout(3800);
  ok('con la racha reclamada aparece la pestaña «🎡 Ruleta»', await vis(p, '#tabR') && /Ruleta/.test(await txt(p, '#tabR')));
  ok('con un punto rojo porque hay un giro disponible', await p.evaluate(() => document.getElementById('tabR').classList.contains('dot')));
  ok('cobrada la racha, la ventana pasa sola a la ruleta (sin tocar nada)', /Ruleta diaria/.test(await txt(p, '#dailyTitle')) && await vis(p, '#wheelBox'), await txt(p, '#dailyTitle'));
  await p.tap('#tabR'); await p.waitForTimeout(900);
  const rueda = await p.evaluate(() => ({ labels: [...document.querySelectorAll('#wheel text')].map(s => s.textContent), paths: document.querySelectorAll('#wheel path').length, bulbs: document.querySelectorAll('#wrim .bulb').length, go: document.getElementById('dailyGo').textContent, ttl: document.getElementById('dailyTitle').textContent }));
  ok('se ve la rueda con todos los premios de la tabla (' + RU.premios.map(pr => pr[0] > 0 ? money(pr[0]) : '×' + pr[1]).join(', ') + ')', JSON.stringify(rueda.labels) === JSON.stringify(RU.premios.map(pr => pr[0] > 0 ? money(pr[0]) : '×' + pr[1] + ' 🤑')) && rueda.paths === RU.premios.length && rueda.bulbs === 24, JSON.stringify(rueda));
  ok('el título y el botón invitan a girar', /Ruleta diaria/.test(rueda.ttl) && rueda.go === '🎡 Girar la ruleta', JSON.stringify(rueda));
  await p.screenshot({ path: process.env.SHOT || '/tmp/ruleta_antes.png' });

  console.log('Girar y cobrar');
  const c0 = st.db.wallets[uid].c, x0 = Object.assign({ y2: 0, y3: 0, y4: 0 }, st.db.streaks[uid]);
  await p.tap('#dailyGo'); await p.waitForTimeout(800);
  ok('mientras gira el botón dice «Girando…» y no se puede tocar', (await txt(p, '#dailyGo')) === 'Girando…' && await p.evaluate(() => document.getElementById('dailyGo').disabled));
  await p.waitForTimeout(6500);
  const r = st.db.ruleta[uid], pr = premioDe(r.t);
  ok('el servidor anotó el giro (t = hora del servidor) y el cobro (c = t)', r && Math.abs(r.t - Date.now()) < 60000 && r.c === r.t, JSON.stringify(r));
  ok(`el premio es el que dice la hora del giro (${pr[0] > 0 ? money(pr[0]) : '×' + pr[1]})`, pr[0] > 0 ? st.db.wallets[uid].c === c0 + pr[0] : st.db.streaks[uid]['y' + pr[1]] === (x0['y' + pr[1]] || 0) + 1 && st.db.wallets[uid].c === c0, JSON.stringify([pr, st.db.wallets[uid], st.db.streaks[uid]]));
  ok('la pantalla dice lo que te tocó y el mensaje confirma', /Te tocó/.test(await txt(p, '#wheelRes')) && /Listo/.test(await txt(p, '#dailyMsg')), await txt(p, '#wheelRes') + ' | ' + await txt(p, '#dailyMsg'));
  ok('el botón queda apagado con «Vuelve en …» y se va el punto rojo', /^Vuelve en/.test(await txt(p, '#dailyGo')) && await p.evaluate(() => document.getElementById('dailyGo').disabled && !document.getElementById('tabR').classList.contains('dot')));
  ok('sin denegados ni errores de página', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
  await p.screenshot({ path: process.env.SHOT2 || '/tmp/ruleta_despues.png' });

  console.log('No se puede hacer trampa');
  const url = 'https://juegotiopato-default-rtdb.firebaseio.com';
  const hit = (m, ruta, body) => p.evaluate(async ([m, ruta, body, url]) => {
    const sess = JSON.parse(localStorage.getItem('gana-al-tio-pato-sesion') || 'null');
    const x = await fetch(`${url}/${ruta}.json?auth=${encodeURIComponent(sess.id)}`, { method: m, body: JSON.stringify(body) }); return x.status;
  }, [m, ruta, body, url]);
  ok('girar otra vez el mismo día', await hit('PATCH', `ruleta/${uid}`, { t: { '.sv': 'timestamp' } }) === 401);
  ok('cobrar otra vez el mismo giro', await hit('PATCH', '', { [`ruleta/${uid}/c`]: st.db.ruleta[uid].t, [`wallets/${uid}/c`]: st.db.wallets[uid].c + 5000, [`wallets/${uid}/sp`]: st.db.wallets[uid].sp }) === 401);
  ok('borrar el giro de hoy para girar de nuevo', await hit('DELETE', `ruleta/${uid}`, null) === 401);
  ok('girar y cobrar el premio grande en la misma escritura (reintentar hasta acertar)', await hit('PATCH', '', { [`ruleta/${uid}/t`]: { '.sv': 'timestamp' }, [`ruleta/${uid}/c`]: { '.sv': 'timestamp' }, [`wallets/${uid}/c`]: st.db.wallets[uid].c + 5000, [`wallets/${uid}/sp`]: st.db.wallets[uid].sp }) === 401);
  st.denied.length = 0;

  console.log('Al día siguiente se puede girar otra vez');
  st.db.ruleta[uid] = { t: st.db.ruleta[uid].t - DAY, c: st.db.ruleta[uid].c - DAY };
  await p.reload(); await p.waitForTimeout(2500); await cerrarDiario(p);
  ok('con el último giro de ayer, el punto rojo vuelve', await p.evaluate(() => document.getElementById('streakChip').classList.contains('go')));
  await p.evaluate(() => document.getElementById('streakChip').click()); await p.waitForTimeout(600); await p.tap('#tabR'); await p.waitForTimeout(700);
  ok('el botón vuelve a decir «Girar la ruleta»', (await txt(p, '#dailyGo')) === '🎡 Girar la ruleta' && !(await p.evaluate(() => document.getElementById('dailyGo').disabled)));
  await cerrarDiario(p);

  console.log('Cada casilla paga lo que dice la tabla (giros sin cobrar, con hora de cada casilla)');
  for (let i = 0; i < RU.premios.length; i++) {
    const prem = RU.premios[i], t = tDe(i), c1 = st.db.wallets[uid].c, k1 = (st.db.streaks[uid]['y' + prem[1]] || 0);
    st.db.ruleta[uid] = { t };
    await p.reload(); await p.waitForTimeout(2300); await cerrarDiario(p);
    await p.evaluate(() => document.getElementById('streakChip').click()); await p.waitForTimeout(600); await p.tap('#tabR'); await p.waitForTimeout(700);
    const boton = await txt(p, '#dailyGo');
    await p.tap('#dailyGo'); await p.waitForTimeout(6800);
    ok(`casilla ${i}: giraste sin cobrar → «Cobrar mi premio» → ${prem[0] > 0 ? money(prem[0]) : '×' + prem[1] + ' guardado'}`,
      boton === 'Cobrar mi premio' && st.db.ruleta[uid].c === t && (prem[0] > 0 ? st.db.wallets[uid].c === c1 + prem[0] : st.db.streaks[uid]['y' + prem[1]] === k1 + 1 && st.db.wallets[uid].c === c1), `${boton} ${JSON.stringify([st.db.ruleta[uid], st.db.wallets[uid], st.db.streaks[uid]])}`);
    await cerrarDiario(p);
  }
  ok('sin denegados ni errores de página en todo el recorrido', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
  await ctx.close();

  console.log('Cada día nuevo la ruleta aparece sola');
  {
    const { ctx: c5, p: p5, errs: e5 } = await newPage(b);
    const u5 = await registrar(p5, 'Ruleta Cinco');
    await p5.tap('#dailyGo'); await p5.waitForTimeout(4600);
    await cerrarDiario(p5);
    ok('con la racha de hoy ya cobrada y la ruleta sin girar, al volver a entrar sale la ruleta sola', await (async () => {
      st.db.ruleta = { ...(st.db.ruleta || {}) }; delete st.db.ruleta[u5];
      await p5.reload(); await p5.waitForTimeout(3000);
      return /Ruleta diaria/.test(await txt(p5, '#dailyTitle')) && await vis(p5, '#wheelBox') && await p5.evaluate(() => document.getElementById('daily').classList.contains('show'));
    })(), await txt(p5, '#dailyTitle'));
    await p5.tap('#dailyGo'); await p5.waitForTimeout(6800);
    ok('la giras y la cobras (sin denegados)', st.db.ruleta[u5] && st.db.ruleta[u5].c === st.db.ruleta[u5].t && st.denied.length === 0, JSON.stringify([st.db.ruleta[u5], st.denied]));
    await cerrarDiario(p5);
    await p5.reload(); await p5.waitForTimeout(2800);
    ok('ya giraste hoy: no vuelve a salir sola', !(await p5.evaluate(() => document.getElementById('daily').classList.contains('show'))));
    st.db.ruleta[u5] = { t: st.db.ruleta[u5].t - DAY, c: st.db.ruleta[u5].c - DAY }; st.db.streaks[u5].t -= 3600000 * 0;
    await p5.reload(); await p5.waitForTimeout(3000);
    ok('al día siguiente (racha ya cobrada hoy y último giro de ayer) sale otra vez sola', /Ruleta diaria/.test(await txt(p5, '#dailyTitle')) && await vis(p5, '#wheelBox'), await txt(p5, '#dailyTitle'));
    ok('sin errores de página', e5.length === 0, e5.join('|'));
    st.denied.length = 0;
    await c5.close();
  }

  console.log('Las cinco pestañas caben en la tarjeta (nada se desborda)');
  for (const [w, h] of [[390, 844], [360, 740], [320, 568]]) {
    const { ctx: c6, p: p6, errs: e6 } = await newPage(b, { viewport: { width: w, height: h } });
    await registrar(p6, 'Rul6x' + w);
    await p6.evaluate(() => document.getElementById('dailyGo').click()); await p6.waitForTimeout(4600);
    const r = await p6.evaluate(() => {
      const card = document.getElementById('dailyCard').getBoundingClientRect(), bar = document.getElementById('dTabs').getBoundingClientRect();
      const tabs = [...document.querySelectorAll('#dTabs button')].filter(x => !x.hidden).map(x => { const q = x.getBoundingClientRect(); return { n: x.querySelector('span').textContent, l: q.left, r: q.right, w: q.width, sw: x.scrollWidth, cw: x.clientWidth }; });
      const w0 = document.getElementById('wheelBox').getBoundingClientRect(), go = document.getElementById('dailyGo').getBoundingClientRect();
      return { card: [card.left, card.right, card.top, card.bottom], bar: [bar.left, bar.right], tabs, wheel: [w0.left, w0.right, w0.width], go: [go.top, go.bottom], vh: innerHeight, vw: innerWidth };
    });
    ok(`${w}×${h}: las 5 pestañas (Racha, Hoy, Semana, Ruleta y Logros) se ven, del mismo ancho y dentro de la barra y la tarjeta`,
      r.tabs.length === 5 && r.tabs.map(t => t.n).join() === 'Racha,Hoy,Semana,Ruleta,Logros' && r.tabs.every(t => t.l >= r.bar[0] - .5 && t.r <= r.bar[1] + .5 && Math.abs(t.w - r.tabs[0].w) < 1.5 && t.sw <= t.cw + 1) && r.bar[0] >= r.card[0] - .5 && r.bar[1] <= r.card[1] + .5, JSON.stringify(r));
    ok(`${w}×${h}: la rueda y el botón «Girar» caben en la pantalla`, r.wheel[0] >= 0 && r.wheel[1] <= r.vw && r.go[1] <= r.vh + 1, JSON.stringify(r));
    ok(`${w}×${h}: sin errores de página`, e6.length === 0, e6.join('|'));
    await c6.close();
  }

  console.log('Los multiplicadores de la ruleta duran 5 minutos (los de la racha, 10)');
  {
    const { ctx: c7, p: p7, errs: e7 } = await newPage(b);
    const u7 = await registrar(p7, 'Ruleta Siete'); await cerrarDiario(p7);
    const hoy = Date.now() - 60000;
    st.db.streaks = { ...(st.db.streaks || {}), [u7]: { n: 1, t: hoy, y2: 1, x3: 1 } };           // uno de la ruleta (×2) y uno de la racha (×3), sin activar
    await p7.reload(); await p7.waitForTimeout(2800); await cerrarDiario(p7);
    const botones = () => p7.evaluate(() => [...document.querySelectorAll('#boostGo button')].map(b => [b.dataset.k, b.dataset.m, b.textContent.replace(/\s+/g, ' ').trim()]));
    let bt = await botones();
    ok('el inicio ofrece los dos por separado: «🤑 Activar ×3 · 10 min» (racha) y «🎡 Activar ×2 · 5 min» (ruleta)', bt.length === 2 && bt.some(x => x[0] === 'x' && x[1] === '3' && /🤑 Activar ×3.*10 min/.test(x[2])) && bt.some(x => x[0] === 'y' && x[1] === '2' && /🎡 Activar ×2.*5 min/.test(x[2])), JSON.stringify(bt));
    await p7.tap('#boostGo button[data-k="y"]', { force: true }); await p7.waitForTimeout(1500);
    const k7 = st.db.streaks[u7];
    ok('activar el de la ruleta anota bd = 5 minutos, bm = 2 y gasta su contador (y2 = 0) sin tocar el de la racha', k7.bd === 300000 && k7.bm === 2 && k7.y2 === 0 && k7.x3 === 1 && Math.abs(k7.bx - Date.now()) < 120000, JSON.stringify(k7));
    const barra = await p7.evaluate(() => ({ vis: !document.getElementById('boostBar').hidden, txt: document.getElementById('boostBar').textContent.replace(/\s+/g, ' ').trim(), go: document.getElementById('boostGo').hidden }));
    const seg = t => { const m = /(\d+):(\d\d)/.exec(t); return m ? +m[1] * 60 + +m[2] : -1; };           // «4:58» → 298 segundos
    ok('el cartel muestra «Pesos ×2» con 5 minutos como máximo por delante (entre 4:00 y 5:00) y los botones desaparecen', barra.vis && /Pesos ×2/.test(barra.txt) && seg(barra.txt) >= 240 && seg(barra.txt) <= 300 && barra.go, JSON.stringify(barra));
    await playHits(p7, 6, async () => {}); await p7.waitForTimeout(3500);
    const run = st.db.runs[u7];
    ok('una partida dentro de los 5 minutos paga ×2 y el servidor lo acepta', run && run.p === 2 * run.h && run.h >= 6, JSON.stringify(run));
    ok('sin denegados', st.denied.length === 0, st.denied.join(' || '));
    await p7.evaluate(() => { const b = document.getElementById('backResult'); if (b && b.offsetParent) b.click(); }); await p7.waitForTimeout(500);
    // 6 minutos después: el de la ruleta ya venció (a los 5), uno de la racha seguiría activo
    st.db.streaks[u7].bx = Date.now() - 6 * 60000; await p7.reload(); await p7.waitForTimeout(2800); await cerrarDiario(p7);
    ok('a los 6 minutos el multiplicador de la ruleta ya venció: no hay cartel y vuelve el botón del de la racha', await p7.evaluate(() => document.getElementById('boostBar').hidden) && (await botones()).some(x => x[0] === 'x' && x[1] === '3'), JSON.stringify(await botones()));
    st.db.streaks[u7].bx = Date.now() - 4 * 60000; await p7.reload(); await p7.waitForTimeout(2800); await cerrarDiario(p7);
    ok('a los 4 minutos todavía está activo (cartel con menos de 1 minuto)', await p7.evaluate(() => !document.getElementById('boostBar').hidden && /\b0:\d\d\b/.test(document.getElementById('boostBar').textContent)), await p7.evaluate(() => document.getElementById('boostBar').textContent));
    st.db.streaks[u7].bx = Date.now() - 6 * 60000; await p7.reload(); await p7.waitForTimeout(2800); await cerrarDiario(p7);
    await p7.tap('#boostGo button[data-k="x"]', { force: true }); await p7.waitForTimeout(1500);
    const k8 = st.db.streaks[u7];
    ok('activar el de la racha: bd = 10 minutos, bm = 3 y x3 = 0', k8.bd === 600000 && k8.bm === 3 && k8.x3 === 0, JSON.stringify(k8));
    const t3 = await p7.evaluate(() => document.getElementById('boostBar').textContent);
    ok('el cartel muestra «Pesos ×3» con más de 5 minutos por delante (hasta 10:00)', /Pesos ×3/.test(t3) && seg(t3) > 300 && seg(t3) <= 600, t3);
    ok('sin denegados ni errores de página', st.denied.length === 0 && e7.length === 0, st.denied.join(' || ') + e7.join('|'));
    await c7.close();
  }

  console.log('Si todavía no están publicadas las reglas nuevas');
  {
    const rl = JSON.parse(fs.readFileSync(path.join(JUEGO, 'firebase-rules.json'), 'utf8')); delete rl.rules.ruleta;
    const f = path.join(os.tmpdir(), 'sin-ruleta-' + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(rl)); st.rulesFile = f;
    const { ctx: c2, p: p2, errs: e2 } = await newPage(b);
    await registrar(p2, 'Ruleta Dos');
    await p2.tap('#dailyGo'); await p2.waitForTimeout(3800);
    ok('sin las reglas nuevas no aparece la pestaña «Ruleta» (no se muestra nada roto) y la racha funciona igual', !(await vis(p2, '#tabR')) && st.db.streaks && Object.values(st.db.streaks).some(k => k.n === 1), JSON.stringify(st.db.streaks));
    ok('sin errores de página', e2.length === 0, e2.join('|'));
    fs.unlinkSync(f); st.rulesFile = null; st.denied.length = 0; await c2.close();
  }

  console.log(`\n${pass} correctas, ${fail} fallas`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
