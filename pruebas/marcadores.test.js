// Marcadores de punta a punta (juego + reglas reales de Firebase): Top 30 en todos, «Top global», «Semanal», «Mensual» y «Tiempo jugado»,
// y las insignias (🦆🎩 🦆🎀 👾) que pone el administrador en roles/<uid>. Uso:  cd pruebas && npm install && node marcadores.test.js
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, st, newPage, playHits, registrar, JUEGO } = require('./mockfirebase.js');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
const cerrarDiario = p => p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); });
const alMenu = p => p.evaluate(() => { for (const id of ['shopBack', 'backResult']) { const b = document.getElementById(id); if (b && b.offsetParent) b.click(); } });
const D = () => Math.floor((Date.now() - 3 * 3600000) / 86400000), WK = () => Math.floor((D() + 3) / 7);
const MO = () => { const d = new Date(Date.now() - 3 * 3600000); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; };       // mes calendario AAAAMM (hora de Chile, UTC-3)
// la cuenta regresiva del mes sale del index.html tal cual (se extrae la función y se prueba con fechas fijas)
const monthLeft = (() => {
  const src = fs.readFileSync(path.join(JUEGO, 'index.html'), 'utf8'), fn = /function monthLeft\(now = srvNow\(\)\) \{[\s\S]*?\n  \}/.exec(src)[0], meses = /const MESES = \[[^\]]+\];/.exec(src)[0] + '\n' + /const fmtDH = [^\n]+/.exec(src)[0] + '\n';          // (cada pieza en su línea: fmtDH termina con un comentario)
  const DAYMS = 86400000, HUSO_MS = -3 * 3600000;
  return new Function('DAYMS', 'dayOf', 'streakInfo', 'srvNow', meses + fn + '; return monthLeft;')(DAYMS, ms => Math.floor((ms + HUSO_MS) / DAYMS), now => ({ toNext: (Math.floor((now + HUSO_MS) / DAYMS) + 1) * DAYMS - HUSO_MS - now }), () => Date.now());
})();
const chile = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h + 3, mi);                       // una hora de Chile (UTC-3) en ms
const filas = p => p.evaluate(() => [...document.querySelectorAll('#list li:not(.empty)')].map(li => ({ rk: li.querySelector('.rk').textContent, n: li.querySelector('.t').textContent, sc: li.querySelector('.sc').textContent, rb: (li.querySelector('.rb') || {}).textContent || '', mine: li.classList.contains('mine') })));
const miFila = p => p.evaluate(() => { const b = document.getElementById('myRow'); return b.hidden ? null : { n: b.querySelector('.t').textContent, sc: b.querySelector('.sc').textContent, rk: b.querySelector('.rk').textContent }; });
const abrirMarcador = async p => { await alMenu(p); await p.waitForTimeout(300); await cerrarDiario(p); await p.evaluate(() => document.getElementById('openBoard').click()); await p.waitForTimeout(1200); };
const pestana = async (p, id) => { await p.evaluate(i => document.getElementById(i).click(), id); await p.waitForTimeout(1400); };
const nota = p => p.textContent('#boardNote');
const money = n => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const { ctx, p, errs } = await newPage(b);
  const uid = await registrar(p, 'Marc Uno'); await cerrarDiario(p);

  console.log('Las partidas llenan el marcador semanal');
  const w = WK();
  await playHits(p, 8, async () => {}); await p.waitForTimeout(6000);
  const r1 = st.db.runs[uid], s1 = st.db.weekly && st.db.weekly[w] && st.db.weekly[w][uid];
  ok(`la primera partida (${r1.h} rebotes) crea tu fila semanal: nombre, mejor de la semana y hora del servidor`, s1 && s1.n === 'Marc Uno' && s1.s === r1.h && typeof s1.t === 'number' && Object.keys(s1).length >= 3, JSON.stringify(s1));
  ok('la fila semanal coincide con tus estadísticas verificadas (wm)', st.db.stats[uid].wm === r1.h && st.db.stats[uid].w === w, JSON.stringify(st.db.stats[uid]));
  await playHits(p, 5, async () => {}); await p.waitForTimeout(6000);
  const r2 = st.db.runs[uid];
  ok('una partida peor no baja la marca de la semana', r2.h < r1.h ? st.db.weekly[w][uid].s === r1.h : st.db.weekly[w][uid].s === Math.max(r1.h, r2.h), JSON.stringify(st.db.weekly[w][uid]) + ' ' + r1.h + '/' + r2.h);
  await playHits(p, 12, async () => {}); await p.waitForTimeout(6000);
  const r3 = st.db.runs[uid];
  ok(`una partida mejor (${r3.h}) sube la marca de la semana`, st.db.weekly[w][uid].s === Math.max(r1.h, r2.h, r3.h) && st.db.weekly[w][uid].s >= r3.h, JSON.stringify(st.db.weekly[w][uid]));
  console.log('Las partidas llenan el marcador mensual');
  const mo = MO(), m1 = st.db.monthly && st.db.monthly[mo] && st.db.monthly[mo][uid];
  ok(`tu mejor partida del mes (${Math.max(r1.h, r2.h, r3.h)}) queda en monthly/${mo}/<tu cuenta> con nombre, puntaje y hora del servidor`, m1 && m1.n === 'Marc Uno' && m1.s === Math.max(r1.h, r2.h, r3.h) && typeof m1.t === 'number', JSON.stringify(m1));
  ok('las estadísticas del mes (mo, mm, ml) coinciden con la fila: mes en curso, mejor partida y última partida sumada', st.db.stats[uid].mo === mo && st.db.stats[uid].mm === m1.s && st.db.stats[uid].ml === st.db.runs[uid].s, JSON.stringify(st.db.stats[uid]));
  ok('el semanal y las misiones siguen igual (las estadísticas del mes se escriben aparte)', st.db.stats[uid].wm === st.db.weekly[w][uid].s && st.db.stats[uid].g >= 3, JSON.stringify(st.db.stats[uid]));
  ok('sin denegados ni errores de página en todo el recorrido', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));

  console.log('Los cuatro marcadores (con 40 jugadores sembrados)');
  const base = { s: 0, t: 1000 };
  for (let i = 1; i <= 40; i++) {
    st.db.scores['x' + i] = { n: 'Jug ' + i, k: 'jug.' + i, s: i, t: 1000 + i, ms: i * 600000, ml: 1, w: i * 1000000 };
    st.db.weekly[w]['x' + i] = { n: 'Jug ' + i, s: 100 + i, t: 1000 + i };
    st.db.monthly[mo]['x' + i] = { n: 'Jug ' + i, s: 200 + i, t: 1000 + i };
  }
  st.db.roles = { x40: 'tio', x39: 'tia', x38: 'dev', zz: 'dev' };
  await abrirMarcador(p);
  ok('aparecen las 4 pestañas: Top global, Semanal, Mensual y Tiempo jugado (ya no hay «Millonarios» ni «Todo el tiempo»)', await p.evaluate(() => ['kindR', 'kindW', 'kindM', 'kindT'].map(i => document.querySelector('#' + i + ' span').textContent).join('|')) === 'Top global|Semanal|Mensual|Tiempo jugado' && !/Todo el tiempo/.test(await p.textContent('#boardKind')));
  ok('las 4 pestañas caben en la barra, del mismo ancho y sin cortarse (390 px)', await p.evaluate(() => { const bar = document.querySelector('#boardKind').getBoundingClientRect(), t = [...document.querySelectorAll('#boardKind button')].map(x => ({ r: x.getBoundingClientRect(), sw: x.scrollWidth, cw: x.clientWidth })); return t.length === 4 && t.every(x => x.r.left >= bar.left - 1 && x.r.right <= bar.right + 1 && x.sw <= x.cw + 1) && Math.max(...t.map(x => x.r.width)) - Math.min(...t.map(x => x.r.width)) < 2; }));
  let f = await filas(p);
  ok('«Top global» muestra 30 jugadores (no 25), el mejor primero', f.length === 30 && f[0].n === 'Jug 40' && f[0].sc === '40', JSON.stringify(f.slice(0, 2)));
  ok('con 🥇🥈🥉 y después el número', f[0].rk === '🥇' && f[1].rk === '🥈' && f[2].rk === '🥉' && f[3].rk === '4' && f[29].rk === '30');
  ok('la nota dice «Top global 30»', /Top global 30/.test(await nota(p)), await nota(p));
  ok('las insignias salen junto al nombre: 🦆🎩 al Tío Patito, 🦆🎀 a la Tía Patita y 👾 a los desarrolladores', f[0].rb === '🦆🎩' && f[1].rb === '🦆🎀' && f[2].rb === '👾' && f.slice(3).every(r => r.rb === ''), JSON.stringify(f.slice(0, 4)));

  await pestana(p, 'kindW');
  f = await filas(p);
  ok('«Semanal»: Top 30 de la semana, ordenado por la mejor partida de la semana', f.length === 30 && f[0].n === 'Jug 40' && f[0].sc === '140' && f[29].n === 'Jug 11', JSON.stringify([f[0], f[29]]));
  ok('«Semanal» también lleva las insignias', f[0].rb === '🦆🎩' && f[2].rb === '👾');
  ok('la nota dice que es de la semana y que se reinicia el lunes', /Top 30 de la semana/.test(await nota(p)) && /se reinicia el lunes/.test(await nota(p)), await nota(p));
  let mi = await miFila(p);
  ok('tu fila sale debajo (tu mejor de la semana) si no estás entre los 30', mi && mi.n === 'Marc Uno' && +mi.sc === st.db.weekly[w][uid].s, JSON.stringify(mi));

  await pestana(p, 'kindM');
  f = await filas(p);
  ok('«Mensual»: Top 30 del mes, ordenado por la mejor partida del mes', f.length === 30 && f[0].n === 'Jug 40' && f[0].sc === '240' && f[29].n === 'Jug 11', JSON.stringify([f[0], f[29]]));
  ok('«Mensual» también lleva las insignias', f[0].rb === '🦆🎩' && f[2].rb === '👾');
  const nm = await nota(p), esp = monthLeft(Date.now()), hs = (+(/(\d+) días?/.exec(nm) || [0, 0])[1]) * 24 + (+(/(\d+) horas?/.exec(nm) || [0, 0])[1]);
  ok('la nota dice Top 30 del mes y que se reinicia el 1 del mes que viene (con su nombre)', /Top 30 del mes/.test(nm) && new RegExp(`se reinicia el 1 de ${esp.name} \\(en `).test(nm), nm);
  ok('la cuenta regresiva está en días y horas (o solo horas si falta menos de un día) y coincide con el reloj', /\(en (\d+ días?( y \d+ horas?)?|\d+ horas?|menos de 1 hora)\)/.test(nm) && Math.abs(hs - Math.floor((chile(new Date(Date.now() - 3 * 3600000).getUTCFullYear() + (new Date(Date.now() - 3 * 3600000).getUTCMonth() === 11 ? 1 : 0), ((new Date(Date.now() - 3 * 3600000).getUTCMonth() + 1) % 12) + 1, 1) - Date.now()) / 3600000)) <= 1, nm);
  mi = await miFila(p);
  ok('tu fila sale debajo (tu mejor del mes) si no estás entre los 30', mi && mi.n === 'Marc Uno' && +mi.sc === st.db.monthly[mo][uid].s, JSON.stringify(mi));

  await pestana(p, 'kindT');
  f = await filas(p);
  ok('«Tiempo jugado»: también 30 jugadores, el que más tiempo lleva primero', f.length === 30 && f[0].n === 'Jug 40' && /d|h/.test(f[0].sc) && f[0].rb === '🦆🎩', JSON.stringify(f[0]));

  await pestana(p, 'kindR');
  f = await filas(p);
  ok('al volver a «Top global» se ven los rebotes otra vez', f[0].sc === '40' && /Top global 30/.test(await nota(p)));
  ok('el reloj de 1 minuto sigue (no se alarga al cambiar de pestaña)', /Vuelves al inicio en (\d+) s/.test(await p.textContent('#boardLeft')) && +/(\d+) s/.exec(await p.textContent('#boardLeft'))[1] <= 58, await p.textContent('#boardLeft'));
  ok('sin denegados ni errores de página', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
  await ctx.close();

  console.log('Cuenta regresiva del Top mensual (fechas fijas)');
  {
    const caso = (t, nombre, texto) => { const r = monthLeft(t); return r.name === nombre && r.text === texto ? true : JSON.stringify(r); };
    ok('el 20 de noviembre a mediodía: «10 días y 12 horas» y se reinicia el 1 de diciembre', caso(chile(2026, 11, 20, 12), 'diciembre', '10 días y 12 horas') === true, JSON.stringify(monthLeft(chile(2026, 11, 20, 12))));
    ok('el 1 de noviembre a las 00:00: «30 días» (sin «y 0 horas»)', caso(chile(2026, 11, 1, 0), 'diciembre', '30 días') === true, JSON.stringify(monthLeft(chile(2026, 11, 1, 0))));
    ok('el 29 de noviembre a las 23:00: «1 día y 1 hora» (singular)', caso(chile(2026, 11, 29, 23), 'diciembre', '1 día y 1 hora') === true, JSON.stringify(monthLeft(chile(2026, 11, 29, 23))));
    ok('el 30 de noviembre a las 12:00 (falta menos de un día): solo horas, «12 horas»', caso(chile(2026, 11, 30, 12), 'diciembre', '12 horas') === true, JSON.stringify(monthLeft(chile(2026, 11, 30, 12))));
    ok('el 30 de noviembre a las 23:00: «1 hora» (singular)', caso(chile(2026, 11, 30, 23), 'diciembre', '1 hora') === true, JSON.stringify(monthLeft(chile(2026, 11, 30, 23))));
    ok('a las 23:30 del último día: «menos de 1 hora»', caso(chile(2026, 11, 30, 23, 30), 'diciembre', 'menos de 1 hora') === true, JSON.stringify(monthLeft(chile(2026, 11, 30, 23, 30))));
    ok('en diciembre el mes que viene es enero (cambia de año)', caso(chile(2026, 12, 31, 18), 'enero', '6 horas') === true, JSON.stringify(monthLeft(chile(2026, 12, 31, 18))));
    ok('en febrero de un año bisiesto (2028) faltan 29 días de más: el 1 de febrero a las 00:00 son «28 días»', caso(chile(2028, 2, 1, 0), 'marzo', '29 días') === true, JSON.stringify(monthLeft(chile(2028, 2, 1, 0))));
    ok('y en febrero de un año normal (2027) son 28', caso(chile(2027, 2, 1, 0), 'marzo', '28 días') === true, JSON.stringify(monthLeft(chile(2027, 2, 1, 0))));
  }

  console.log('Los marcadores no se pueden falsear desde el juego');
  {
    const { ctx: c2, p: p2 } = await newPage(b);
    const u2 = await registrar(p2, 'Marc Dos'); await cerrarDiario(p2);
    await playHits(p2, 6, async () => {}); await p2.waitForTimeout(6000);
    const url = 'https://juegotiopato-default-rtdb.firebaseio.com';
    const hit = (m, ruta, body) => p2.evaluate(async ([m, ruta, body, url]) => {
      const sess = JSON.parse(localStorage.getItem('gana-al-tio-pato-sesion') || 'null');
      const r = await fetch(`${url}/${ruta}.json?auth=${encodeURIComponent(sess.id)}`, { method: m, body: JSON.stringify(body) }); return r.status;
    }, [m, ruta, body, url]);
    const wk = WK();
    ok('guardar un total o una billetera en tu fila del marcador (el top de millonarios ya no existe)', await hit('PATCH', `scores/${u2}`, { w: 999999999 }) === 401);
    ok('ponerte 10.000 rebotes en el marcador semanal', await hit('PUT', `weekly/${wk}/${u2}`, { n: 'Marc Dos', s: 500, t: { '.sv': 'timestamp' } }) === 401);
    ok('escribir en la semana pasada', await hit('PUT', `weekly/${wk - 1}/${u2}`, { n: 'Marc Dos', s: st.db.stats[u2].wm, t: { '.sv': 'timestamp' } }) === 401);
    const mes = MO();
    ok('ponerte 10.000 rebotes en el marcador mensual', await hit('PUT', `monthly/${mes}/${u2}`, { n: 'Marc Dos', s: 500, t: { '.sv': 'timestamp' } }) === 401);
    ok('escribir en el mes pasado', await hit('PUT', `monthly/${mes - 1}/${u2}`, { n: 'Marc Dos', s: st.db.stats[u2].mm, t: { '.sv': 'timestamp' } }) === 401);
    ok('escribir en un mes futuro', await hit('PUT', `monthly/${mes + 1}/${u2}`, { n: 'Marc Dos', s: st.db.stats[u2].mm, t: { '.sv': 'timestamp' } }) === 401);
    ok('inflar tu mejor partida del mes en las estadísticas (mm = 9999)', await hit('PATCH', `stats/${u2}`, { mm: 9999 }) === 401);
    ok('ponerte en el mes pasado en las estadísticas (mo = mes − 1)', await hit('PATCH', `stats/${u2}`, { mo: mes - 1 }) === 401);
    ok('ponerte una insignia de desarrollador', await hit('PUT', `roles/${u2}`, 'dev') === 401);
    st.denied.length = 0;
    await c2.close();
  }

  console.log('Si todavía no están publicadas las reglas nuevas');
  {
    const r = JSON.parse(fs.readFileSync(path.join(JUEGO, 'firebase-rules.json'), 'utf8')); delete r.rules.weekly; delete r.rules.monthly; delete r.rules.roles; delete r.rules.scores['$uid'].w; for (const k of ['mo', 'mm', 'ml']) delete r.rules.stats['$uid'][k];
    r.rules.scores['.indexOn'] = ['s', 'k', 'ms'];
    const f2 = path.join(os.tmpdir(), 'sin-marcadores-' + process.pid + '.json'); fs.writeFileSync(f2, JSON.stringify(r)); st.rulesFile = f2;
    const { ctx: c3, p: p3, errs: e3 } = await newPage(b);
    const u3 = await registrar(p3, 'Marc Tres'); await cerrarDiario(p3);
    await playHits(p3, 6, async () => {}); await p3.waitForTimeout(6000);
    ok('la partida se cobra y se anota igual (el marcador semanal y la billetera no pueden romper los pesos)', st.db.wallets[u3].c === st.db.runs[u3].h && st.db.scores[u3] && st.db.scores[u3].s === st.db.runs[u3].h && !(st.db.weekly && st.db.weekly[WK()] && st.db.weekly[WK()][u3]), JSON.stringify(st.db.wallets[u3]));
    await abrirMarcador(p3);
    ok('«Top global» sigue funcionando', (await filas(p3)).length > 0 && /Top global/.test(await nota(p3)), await nota(p3));
    await pestana(p3, 'kindW');
    ok('«Semanal» avisa que faltan las reglas nuevas', /Falta publicar las reglas nuevas/.test(await nota(p3)), await nota(p3));
    ok('las misiones siguen contando aunque las reglas del mes no estén publicadas (las estadísticas del mes se escriben aparte)', st.db.stats && st.db.stats[u3] && st.db.stats[u3].g >= 1 && st.db.stats[u3].mo === undefined && st.db.stats[u3].mm === undefined, JSON.stringify(st.db.stats && st.db.stats[u3]));
    await pestana(p3, 'kindM');
    ok('«Mensual» también avisa que faltan las reglas nuevas', /Falta publicar las reglas nuevas/.test(await nota(p3)), await nota(p3));
    ok('sin errores de página', e3.length === 0, e3.join('|'));
    fs.unlinkSync(f2); st.rulesFile = null; st.denied.length = 0; await c3.close();
  }

  console.log(`\n${pass} correctas, ${fail} fallas`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
