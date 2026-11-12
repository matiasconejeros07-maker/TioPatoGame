// Edición limitada (Tío Pato Teletón) de punta a punta: el juego real contra un Firebase de mentira con las reglas reales.
// Se vende hasta una fecha, aparece segunda en la tienda con su cuenta regresiva, y pasada la fecha sale de la tienda pero quien la compró la conserva.
// Las pruebas no dependen de la fecha de hoy: la fecha límite se cambia (en el catálogo y en las reglas) por una futura o una pasada.
// Uso:  cd pruebas && npm install && node limitada.test.js
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, st, newPage, registrar, JUEGO } = require('./mockfirebase.js');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
const cerrarDiario = p => p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); });
const TEL = (() => { const cx = {}; require('vm').runInNewContext(fs.readFileSync(JUEGO + 'tienda.js', 'utf8'), (cx.window = {}, cx)); return cx.window.TIENDA.ch.find(c => c.id === 'teleton'); })();
const tiendaCon = h => fs.readFileSync(JUEGO + 'tienda.js', 'utf8').replace(/until: Date\.UTC\([^)]*\),/, `until: ${h},`);
const reglasCon = h => { const f = path.join(os.tmpdir(), 'limitada-' + process.pid + '-' + h + '.json'); fs.writeFileSync(f, fs.readFileSync(JUEGO + 'firebase-rules.json', 'utf8').split(`now < ${TEL.until}`).join(`now < ${h}`)); return f; };
const tarjetas = p => p.evaluate(() => [...document.querySelectorAll('#shopGrid .item')].map(c => ({ n: c.querySelector('.nm').textContent, nt: c.querySelector('.nt').textContent, btn: c.querySelector('button').textContent, cls: c.querySelector('button').className })));
const abrirTienda = async p => { await p.evaluate(() => document.getElementById('openShop').click()); await p.waitForTimeout(900); };
const cerrarTienda = async p => { await p.evaluate(() => document.getElementById('shopBack').click()); await p.waitForTimeout(400); };
const tocar = (p, nombre) => p.evaluate(n => { const c = [...document.querySelectorAll('#shopGrid .item')].find(i => i.querySelector('.nm').textContent === n); if (c) c.querySelector('button').click(); return !!c; }, nombre);
const cuenta = async (p, nombre, wallet) => { const uid = await registrar(p, nombre); await cerrarDiario(p); st.db.wallets = st.db.wallets || {}; st.db.wallets[uid] = { c: 50000, sp: 0, lr: 0, ...wallet }; await p.reload(); await p.waitForTimeout(2600); await cerrarDiario(p); return uid; };

(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const archivos = [];

  console.log('Mientras la edición limitada está abierta');
  {
    const hasta = Date.now() + 3 * 86400000 + 5 * 3600000 + 1800000;                  // quedan 3 días y 5 horas
    st.tienda = tiendaCon(hasta); st.rulesFile = reglasCon(hasta); archivos.push(st.rulesFile);
    const { ctx, p, errs } = await newPage(b);
    const uid = await cuenta(p, 'Limit Uno', {});
    await abrirTienda(p);
    let t = await tarjetas(p);
    ok('la Teletón aparece segunda en la tienda, entre el Tío Pato y la Tía Patita', t[0].n === 'Tío Pato' && t[1].n === 'Tío Pato Teletón' && t[2].n === 'Tía Patita', JSON.stringify(t.slice(0, 3).map(x => x.n)));
    ok('cuesta $1.000 y dice cuánto falta: «⏳ Edición limitada: solo quedan 3 días y 5 horas»', /\$1\.000$/.test(t[1].btn) && /Edición limitada: solo quedan 3 días y 5 horas/.test(t[1].nt), JSON.stringify(t[1]));
    ok('los demás personajes y sus precios siguen igual (Tía Patita $1.500)', /\$1\.500$/.test(t[2].btn));
    await tocar(p, 'Tío Pato Teletón'); await p.waitForTimeout(2800);
    const w = st.db.wallets[uid];
    ok('se compra: queda en la cartera, se descuentan $1.000 y queda puesta', w.own && w.own.ch_teleton === true && w.sp === 1000 && w.eq && w.eq.ch === 'teleton', JSON.stringify(w));
    t = await tarjetas(p);
    ok('la tarjeta pasa a «Equipado ✓» y ya no muestra la cuenta regresiva', /Equipado/.test(t[1].btn) && !/quedan/.test(t[1].nt), JSON.stringify(t[1]));
    ok('sin denegados ni errores de página', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
    await ctx.close();
  }

  console.log('Si la edición termina con la tienda abierta');
  {
    st.tienda = null; st.rulesFile = null;
    const { ctx, p, errs } = await newPage(b);
    const uid = await cuenta(p, 'Limit Dos', {});                                       // la cuenta se arma con la edición abierta…
    const hasta = Date.now() + 9000;                                                   // …y después se cierra en 9 s (se vuelve a cargar el juego con esa fecha)
    st.tienda = tiendaCon(hasta); st.rulesFile = reglasCon(hasta); archivos.push(st.rulesFile);
    await p.reload(); await p.waitForTimeout(2600); await cerrarDiario(p);
    await abrirTienda(p);
    ok('con la tienda abierta antes de la hora, todavía se ve a la venta', (await tarjetas(p)).some(x => x.n === 'Tío Pato Teletón' && /\$1\.000$/.test(x.btn)), `quedan ${hasta - Date.now()} ms`);
    await p.waitForTimeout(Math.max(0, hasta - Date.now()) + 600);
    await tocar(p, 'Tío Pato Teletón'); await p.waitForTimeout(1500);
    ok('al tocar «comprar» ya pasada la hora, el juego avisa que terminó y no cobra nada', /ya terminó/.test(await p.textContent('#shopMsg')) && !(st.db.wallets[uid].own || {}).ch_teleton && (st.db.wallets[uid].sp || 0) === 0, await p.textContent('#shopMsg'));
    await cerrarTienda(p); await abrirTienda(p);
    ok('y al volver a abrir la tienda ya no aparece', !(await tarjetas(p)).some(x => x.n === 'Tío Pato Teletón'));
    ok('sin errores de página', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  console.log('Pasada la fecha límite: sale de la tienda, pero quien la compró la conserva');
  {
    const hasta = Date.now() - 1000;
    st.tienda = tiendaCon(hasta); st.rulesFile = reglasCon(hasta); archivos.push(st.rulesFile);
    const { ctx, p, errs } = await newPage(b);
    const uidNuevo = await cuenta(p, 'Limit Nuevo', {});
    await abrirTienda(p);
    const t = await tarjetas(p);
    ok('quien no la compró ya no la ve en la tienda (los demás personajes siguen, el secreto también)', !t.some(x => x.n === 'Tío Pato Teletón') && t.length === 8 && t[1].n === 'Tía Patita', JSON.stringify(t.map(x => x.n)));
    const tok = await p.evaluate(() => JSON.parse(localStorage.getItem('gana-al-tio-pato-sesion') || 'null').id), url = 'https://juegotiopato-default-rtdb.firebaseio.com';
    const hit = (ruta, body) => p.evaluate(async ([url, ruta, body, tok]) => (await fetch(`${url}/${ruta}.json?auth=${encodeURIComponent(tok)}`, { method: 'PATCH', body: JSON.stringify(body) })).status, [url, ruta, body, tok]);
    ok('y comprarla a escondidas (tocando Firebase directo) lo rechaza el servidor', await hit(`wallets/${uidNuevo}`, { sp: 1000, 'own/ch_teleton': true }) === 401);
    ok('ni pagando de más', await hit(`wallets/${uidNuevo}`, { sp: 9000, 'own/ch_teleton': true }) === 401);
    ok('ni equipándola sin tenerla', await hit(`wallets/${uidNuevo}`, { 'eq/ch': 'teleton' }) === 401);
    st.denied.length = 0;
    await ctx.close();

    const { ctx: c2, p: p2, errs: e2 } = await newPage(b);
    const uidDueno = await cuenta(p2, 'Limit Dueno', { sp: 1000, own: { ch_teleton: true }, eq: { ch: 'tio' } });
    await abrirTienda(p2);
    let t2 = await tarjetas(p2);
    ok('quien la compró sigue viéndola en su tienda, segunda, lista para equipar (sin cuenta regresiva)', t2[1].n === 'Tío Pato Teletón' && t2[1].btn === 'Equipar' && !/quedan/.test(t2[1].nt), JSON.stringify(t2[1]));
    await tocar(p2, 'Tío Pato Teletón'); await p2.waitForTimeout(1800);
    ok('la equipa aunque la edición ya terminó (queda guardado en su cuenta)', st.db.wallets[uidDueno].eq.ch === 'teleton' && /Equipado/.test((await tarjetas(p2))[1].btn), JSON.stringify(st.db.wallets[uidDueno]));
    await p2.reload(); await p2.waitForTimeout(2600); await cerrarDiario(p2);
    await abrirTienda(p2);
    ok('al volver a abrir el juego sigue puesta', /Equipado/.test((await tarjetas(p2))[1].btn));
    await cerrarTienda(p2);
    await p2.tap('#play'); await p2.waitForSelector('#result.show', { timeout: 40000 });
    const dibujo = await p2.evaluate(() => { const i = document.querySelector('#duck .stat, #botAv img'); return !!document.querySelector('#botAv img') && /teleton/.test(document.querySelector('#botAv img').getAttribute('src')); });
    ok('y juega con ella puesta (su avatar de la partida es el de la Teletón)', dibujo);
    ok('sin denegados ni errores de página', st.denied.length === 0 && e2.length === 0, st.denied.join(' || ') + e2.join('|'));
    await c2.close();
  }

  st.tienda = null; st.rulesFile = null; archivos.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  console.log(`\n${pass} correctas, ${fail} fallas`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
