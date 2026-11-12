// Grupo VIP de punta a punta (juego + reglas reales de Firebase): al desbloquear el personaje secreto sale el aviso del grupo VIP y se pide el WhatsApp,
// que se guarda en vip/<uid> (solo su dueño lo lee). Uso:  cd pruebas && npm install && node vip.test.js
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, st, newPage, registrar, JUEGO } = require('./mockfirebase.js');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
const cerrarDiario = p => p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); });
const visible = (p, s) => p.isVisible(s);
const texto = (p, s) => p.textContent(s);
const dar = (uid, extra = {}) => { st.db.wallets = { ...(st.db.wallets || {}), [uid]: { ...((st.db.wallets || {})[uid] || {}), c: 150000000, sp: 0, ...extra } }; };
const secretoId = () => { const cx = {}; require('vm').runInNewContext(fs.readFileSync(JUEGO + 'tienda.js', 'utf8'), (cx.window = {}, cx)); return cx.window.TIENDA.ch.find(c => c.secret).id; };
const enviar = async (p, num, marcar = true) => {
  await p.fill('#vipNum', num);
  if ((await p.isChecked('#vipOk')) !== marcar) await p.tap('#vipOk');
  await p.tap('#vipGo'); await p.waitForTimeout(1200);
};
const alMenu = p => p.evaluate(() => { for (const id of ['shopBack', 'backResult']) { const b = document.getElementById(id); if (b && b.offsetParent) b.click(); } });
const abrirAjustes = async p => { await p.evaluate(() => document.getElementById('openSettings').click()); await p.waitForTimeout(300); };
const cerrarAjustes = p => p.evaluate(() => document.getElementById('setClose').click());

(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const SEC = secretoId();

  console.log('Antes de desbloquear: nada del grupo VIP');
  const { ctx, p, errs } = await newPage(b);
  const uid = await registrar(p, 'Vip Uno'); await cerrarDiario(p);
  ok('no hay aviso del grupo VIP en el menú', !(await visible(p, '#vipBanner')));
  await abrirAjustes(p);
  ok('ni fila «Grupo VIP» en Ajustes', !(await visible(p, '#vipRow')));
  await cerrarAjustes(p);
  dar(uid);
  await p.tap('#openShop'); await p.waitForTimeout(1200);
  ok('la carta misteriosa anuncia el acceso exclusivo al grupo VIP', (await texto(p, '.item.secret .nt')).trim() === 'Desbloquea un personaje misterioso y consigue acceso exclusivo al grupo VIP', await texto(p, '.item.secret .nt'));

  console.log('Desbloquear el personaje secreto');
  await p.tap('.item.secret button.lock'); await p.waitForTimeout(2500);
  ok('se compró y quedó anotado en la cartera', st.db.wallets[uid].own && st.db.wallets[uid].own['ch_' + SEC] === true, JSON.stringify(st.db.wallets[uid]));
  ok('aparece la ventana del grupo VIP', await visible(p, '#vipModal'));
  ok('con la tarjeta dorada que dice que desbloqueaste el personaje secreto y tienes acceso exclusivo al grupo VIP', await visible(p, '.vipcard') && /¡Desbloqueaste el personaje secreto!/.test(await texto(p, '.vipcard')) && /acceso exclusivo al grupo VIP/.test(await texto(p, '.vipcard')), await texto(p, '.vipcard'));
  ok('pide el WhatsApp con la casilla de aceptación', await visible(p, '#vipNum') && await visible(p, '#vipOk') && await visible(p, '#vipGo') && !(await visible(p, '#vipDel')));

  console.log('Validaciones del número');
  await enviar(p, '');
  ok('sin número: avisa y no guarda nada', /código de país/.test(await texto(p, '#vipMsg')) && !st.db.vip, await texto(p, '#vipMsg'));
  await enviar(p, '12345');
  ok('número corto: avisa y no guarda nada', /código de país/.test(await texto(p, '#vipMsg')) && !st.db.vip);
  await enviar(p, '+56 2 2345 6789');
  ok('teléfono fijo de Chile (no es WhatsApp): no se acepta', /código de país/.test(await texto(p, '#vipMsg')) && !st.db.vip);
  await enviar(p, '9 1234 5678', false);
  ok('sin marcar la casilla: pide aceptar y no guarda', /Marca la casilla/.test(await texto(p, '#vipMsg')) && !st.db.vip, await texto(p, '#vipMsg'));

  console.log('Guardar el WhatsApp');
  await enviar(p, '9 1234 5678');
  const rec = st.db.vip && st.db.vip[uid];
  ok('un celular chileno sin código queda como +56912345678', rec && rec.w === '+56912345678', JSON.stringify(st.db.vip));
  ok('guarda también el nombre, la hora del servidor y la aceptación', rec && rec.n === 'Vip Uno' && rec.c === true && typeof rec.t === 'number' && Math.abs(rec.t - Date.now()) < 120000 && Object.keys(rec).length === 4, JSON.stringify(rec));
  ok('confirma con un mensaje y ofrece borrar el número', /Guardamos tu número/.test(await texto(p, '#vipMsg')) && await visible(p, '#vipDel') && /\+56 9 1234 5678/.test(await texto(p, '#vipTxt')), await texto(p, '#vipMsg') + ' | ' + await texto(p, '#vipTxt'));
  ok('sin denegados en el flujo', st.denied.length === 0, st.denied.join(' || '));
  await p.tap('#vipClose'); await p.waitForTimeout(300);
  ok('la ventana se cierra', !(await visible(p, '#vipModal')));
  await alMenu(p); await p.waitForTimeout(500);
  ok('el menú no insiste: ya dejó su número', !(await visible(p, '#vipBanner')));
  await abrirAjustes(p);
  ok('Ajustes muestra «Grupo VIP» con el número guardado', await visible(p, '#vipRow') && /\+56 9 1234 5678 · ✅ guardado/.test(await texto(p, '#vipSt')), await texto(p, '#vipSt'));

  console.log('Cambiar y borrar el número');
  await p.tap('#vipBtn'); await p.waitForTimeout(400);
  ok('desde Ajustes se abre la ventana sin la tarjeta dorada, con el número actual', await visible(p, '#vipModal') && !(await visible(p, '.vipcard')) && /\+56 9 1234 5678/.test(await texto(p, '#vipTxt')) && /Cambiar mi número/.test(await texto(p, '#vipGo')), await texto(p, '#vipTxt'));
  await enviar(p, '+54 9 11 2345 6789');
  ok('un número de otro país con «+» se guarda', st.db.vip[uid].w === '+5491123456789', JSON.stringify(st.db.vip));
  await p.tap('#vipDel'); await p.waitForTimeout(1000);
  ok('borrar el número lo saca de la base de datos', !st.db.vip || !st.db.vip[uid], JSON.stringify(st.db.vip));
  ok('y vuelve a ofrecer enviarlo', /Enviar mi número/.test(await texto(p, '#vipGo')) && !(await visible(p, '#vipDel')) && /Borramos tu número/.test(await texto(p, '#vipMsg')), await texto(p, '#vipMsg'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('Escape cierra la ventana', !(await visible(p, '#vipModal')));
  await alMenu(p); await p.waitForTimeout(300);
  ok('sin número guardado, el menú recuerda enviar el WhatsApp', await visible(p, '#vipBanner') && /WhatsApp/.test(await texto(p, '#vipBanner')));
  await p.tap('#vipBannerX'); await p.waitForTimeout(300);
  ok('«✕» oculta el recordatorio por unos días', !(await visible(p, '#vipBanner')));
  ok('sin denegados ni errores de página', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));

  console.log('Al volver a abrir el juego se recuerda el estado');
  await p.evaluate(() => localStorage.removeItem('gana-al-tio-pato-vip-oculto'));
  st.db.vip = { ...(st.db.vip || {}), [uid]: { w: '+56987654321', n: 'Vip Uno', t: Date.now(), c: true } };
  await p.reload(); await p.waitForTimeout(2500); await cerrarDiario(p);
  ok('con el número ya guardado no sale el recordatorio', !(await visible(p, '#vipBanner')));
  await abrirAjustes(p);
  ok('y Ajustes lo muestra', /\+56 9 8765 4321 · ✅ guardado/.test(await texto(p, '#vipSt')), await texto(p, '#vipSt'));
  await cerrarAjustes(p);
  await ctx.close();

  console.log('Quien ya tenía el personaje secreto antes');
  {
    const { ctx: c2, p: p2, errs: e2 } = await newPage(b);
    const u2 = await registrar(p2, 'Vip Dos'); await cerrarDiario(p2);
    dar(u2, { own: { ['ch_' + SEC]: true } });
    await p2.reload(); await p2.waitForTimeout(2800); await cerrarDiario(p2);
    ok('el menú le avisa que falta su WhatsApp', await visible(p2, '#vipBanner'));
    await p2.tap('#vipBannerGo'); await p2.waitForTimeout(400);
    ok('se abre la ventana (sin la tarjeta de «desbloqueaste»)', await visible(p2, '#vipModal') && !(await visible(p2, '.vipcard')));
    await enviar(p2, '+56 9 1111 2222');
    ok('guarda su número', st.db.vip[u2] && st.db.vip[u2].w === '+56911112222' && st.db.vip[u2].n === 'Vip Dos', JSON.stringify(st.db.vip));
    ok('sin denegados ni errores', st.denied.length === 0 && e2.length === 0, st.denied.join(' || ') + e2.join('|'));
    await c2.close();
  }

  console.log('Quien no tiene el personaje secreto');
  {
    const { ctx: c3, p: p3, errs: e3 } = await newPage(b);
    const u3 = await registrar(p3, 'Vip Tres'); await cerrarDiario(p3);
    dar(u3, { own: { ch_conejo: true } });
    await p3.reload(); await p3.waitForTimeout(2800); await cerrarDiario(p3);
    ok('no ve ningún aviso del grupo VIP', !(await visible(p3, '#vipBanner')));
    await abrirAjustes(p3);
    ok('ni la fila en Ajustes', !(await visible(p3, '#vipRow')));
    const r = await p3.evaluate(async ([db, uid]) => {
      const sess = JSON.parse(localStorage.getItem('gana-al-tio-pato-sesion') || 'null');
      const tok = sess && sess.id;
      const res = await fetch(`${db}/vip/${uid}.json?auth=${encodeURIComponent(tok)}`, { method: 'PUT', body: JSON.stringify({ w: '+56933334444', n: 'Vip Tres', t: { '.sv': 'timestamp' }, c: true }) });
      return res.status;
    }, ['https://juegotiopato-default-rtdb.firebaseio.com', u3]);
    ok('y aunque lo intente a mano, Firebase no deja guardar el número', r === 401 && !(st.db.vip && st.db.vip[u3]), 'status ' + r);
    st.denied.length = 0;
    await c3.close();
  }

  console.log('Si todavía no están publicadas las reglas nuevas');
  {
    const r = JSON.parse(fs.readFileSync(JUEGO + 'firebase-rules.json', 'utf8')); delete r.rules.vip;
    const f = path.join(os.tmpdir(), 'sin-vip-' + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(r)); st.rulesFile = f;
    const { ctx: c4, p: p4, errs: e4 } = await newPage(b);
    const u4 = await registrar(p4, 'Vip Cuatro'); await cerrarDiario(p4);
    dar(u4);
    await p4.tap('#openShop'); await p4.waitForTimeout(1200);
    await p4.tap('.item.secret button.lock'); await p4.waitForTimeout(2500);
    await enviar(p4, '+56 9 5555 6666');
    ok('avisa con claridad que faltan publicar las reglas y no cuenta como guardado', /reglas/.test(await texto(p4, '#vipMsg')) && !(st.db.vip && st.db.vip[u4]) && !(await visible(p4, '#vipDel')), await texto(p4, '#vipMsg'));
    ok('el personaje igual quedó comprado', st.db.wallets[u4].own['ch_' + SEC] === true);
    fs.unlinkSync(f); st.rulesFile = null; st.denied.length = 0;
    await c4.close();
  }

  await b.close();
  console.log(`\n${pass} correctas, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
