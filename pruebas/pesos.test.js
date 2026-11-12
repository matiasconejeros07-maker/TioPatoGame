// Los pesos se suman a la billetera: partida normal, saldo de más de 100 millones, sesión vencida que se renueva sola y un diagnóstico que dice qué falla.
// Uso:  cd pruebas && npm install && npx playwright install chromium && node pesos.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, st, newPage, playHits, registrar: reg } = require('./mockfirebase.js');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
const registrar = async (p, nombre) => { const uid = await reg(p, nombre); await p.tap('#dailyClose').catch(() => {}); return uid; };
const sinBloque = (bloque, arch) => {
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase-rules.json'), 'utf8')); delete r.rules[bloque];
  const f = path.join(os.tmpdir(), arch + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(r)); return f;
};
(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});

  console.log('Partida normal');
  {
    const { ctx, p, errs } = await newPage(b);
    const uid = await registrar(p, 'Pesos Uno');
    await playHits(p, 10, async () => {}); await p.waitForTimeout(3500);
    const h = st.db.runs && st.db.runs[uid] && st.db.runs[uid].h;
    ok(`${h} rebotes con la pelota básica suman $${h} a la billetera`, h >= 10 && st.db.wallets[uid].c === h, JSON.stringify(st.db.wallets && st.db.wallets[uid]));
    ok('la pantalla final dice «Partida guardada»', /Guardado|guardada/.test(await p.textContent('#saveStatus')), await p.textContent('#saveStatus'));
    ok('sin denegados ni errores', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
    await ctx.close();
  }

  console.log('Más de 100 millones de pesos');
  {
    const { ctx, p } = await newPage(b);
    const uid = await registrar(p, 'Pesos Rico');
    st.db.wallets = { ...(st.db.wallets || {}), [uid]: { c: 250000000, sp: 0 } };
    await p.reload(); await p.waitForTimeout(2500); await p.tap('#dailyClose').catch(() => {});
    await playHits(p, 6, async () => {}); await p.waitForTimeout(3500);
    const h = st.db.runs[uid].h;
    ok(`con $250.000.000 en la cuenta, la partida sigue sumando (${h} rebotes = $${h})`, h >= 6 && st.db.wallets[uid].c === 250000000 + h, JSON.stringify(st.db.wallets[uid]));
    await ctx.close();
  }

  console.log('Sesión vencida: Firebase la trata como sin sesión');
  {
    const { ctx, p, errs } = await newPage(b);
    const uid = await registrar(p, 'Pesos Venc');
    st.minTokenTs = Date.now() + 30; await p.waitForTimeout(80); st.denied.length = 0;                // los tokens que ya tiene el teléfono dejan de valer
    await playHits(p, 5, async () => {}); await p.waitForTimeout(3500);
    const h = st.db.runs && st.db.runs[uid] && st.db.runs[uid].h;
    ok(`el juego pide un token nuevo solo y la partida se cobra igual (${h} rebotes = $${h})`, h >= 5 && st.db.wallets[uid].c === h, JSON.stringify(st.db.wallets && st.db.wallets[uid]) + ' ' + st.denied.join(' || '));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    st.minTokenTs = 0; st.denied.length = 0; await ctx.close();
  }

  console.log('Firebase ocupado justo al empezar la partida');
  {
    const { ctx, p, errs } = await newPage(b);
    const uid = await registrar(p, 'Pesos Ocup');
    st.busyRuns = 2;                                                                                   // las 2 primeras peticiones fallan con 503
    await playHits(p, 4, async () => {}); await p.waitForTimeout(3500);
    const h = st.db.runs && st.db.runs[uid] && st.db.runs[uid].h;
    ok(`dos 503 seguidos al empezar se reintentan y la partida se cobra igual (${h} rebotes = $${h})`, st.busyRuns === 0 && h >= 4 && st.db.wallets[uid].c === h, JSON.stringify(st.db.wallets && st.db.wallets[uid]) + ' busy=' + st.busyRuns);
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  {
    const { ctx, p } = await newPage(b);
    const uid = await registrar(p, 'Pesos Caido');
    st.busyRuns = 50;                                                                                  // Firebase no se recupera: se agotan los 3 intentos
    await playHits(p, 3, async () => {}); await p.waitForTimeout(2500);
    ok('si Firebase sigue caído, avisa «sin conexión» y no inventa pesos', /Sin conexión/.test(await p.textContent('#coinsLine')) && !(st.db.wallets && st.db.wallets[uid] && st.db.wallets[uid].c), await p.textContent('#coinsLine'));
    ok('hizo exactamente 3 intentos (1 + 2 reintentos)', 50 - st.busyRuns === 3, String(50 - st.busyRuns));
    st.busyRuns = 0; await ctx.close();
  }

  console.log('Diagnóstico cuando faltan reglas en Firebase');
  {
    st.rulesFile = sinBloque('wallets', 'sin-wallets-');                                               // la base solo tiene reglas viejas: no existe «wallets»
    const { ctx, p } = await newPage(b);
    await registrar(p, 'Pesos Diag');
    await playHits(p, 3, async () => {}); await p.waitForTimeout(3500);
    ok('la partida no se cobra y avisa con el botón de detalle técnico', await p.isVisible('#diagBtn') && /Esta partida no se pudo cobrar|no se pudo guardar/.test(await p.textContent('#coinsLine')), await p.textContent('#coinsLine'));
    await p.tap('#diagBtn'); await p.waitForTimeout(3500);
    const t = await p.textContent('#diagOut');
    ok('el diagnóstico prueba la cuenta, el token y la hora', /Cuenta del token: coincide/.test(t) && /Proyecto del token/.test(t) && /Hora del teléfono/.test(t), t);
    ok('y dice que Firebase reconoce la sesión pero falla la billetera', /✅ Firebase reconoce tu sesión/.test(t) && /❌ Leer tu billetera · 401/.test(t) && /falta el bloque "wallets"/.test(t), t);
    fs.unlinkSync(st.rulesFile); st.rulesFile = null; st.denied.length = 0; await ctx.close();
  }
  {
    st.rulesFile = sinBloque('runs', 'sin-runs-');                                                     // falta «runs»: no se puede empezar la partida
    const { ctx, p } = await newPage(b);
    await registrar(p, 'Pesos Runs');
    await playHits(p, 2, async () => {}); await p.waitForTimeout(1500);
    const cl = await p.textContent('#coinsLine'), s2 = await p.textContent('#saveStatus');
    ok('si la partida no puede empezar, dice «no se pudo guardar» y que faltan las reglas', /no se pudo guardar/.test(cl) && /reglas nuevas/.test(s2), cl + ' | ' + s2);
    await p.tap('#diagBtn'); await p.waitForTimeout(3500);
    const t = await p.textContent('#diagOut');
    ok('el diagnóstico señala el bloque «runs»', /✅ Leer tu billetera/.test(t) && /❌ Empezar una partida/.test(t) && /bloque "runs"/.test(t), t);
    fs.unlinkSync(st.rulesFile); st.rulesFile = null; st.denied.length = 0; await ctx.close();
  }

  console.log('Diagnóstico con todo bien');
  {
    const { ctx, p } = await newPage(b);
    await registrar(p, 'Pesos Bien');
    await playHits(p, 2, async () => {}); await p.waitForTimeout(3500);
    await p.evaluate(() => { document.getElementById('diagBtn').hidden = false; document.getElementById('diagBtn').click(); }); await p.waitForTimeout(3500);
    const t = await p.textContent('#diagOut');
    ok('con las reglas publicadas el diagnóstico termina con «reglas nuevas están activas»', /Las reglas nuevas están activas/.test(t) && !/❌/.test(t), t);
    await ctx.close();
  }

  console.log(`\n${pass} correctas, ${fail} fallas`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
