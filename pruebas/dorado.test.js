// Marco dorado de punta a punta (juego + reglas reales de Firebase): quien desbloquea el personaje secreto (el de los 100 millones) queda anotado en compradores/<uid>
// (para que el administrador vea quiénes son) y puede ponerse un marco dorado animado en su emblema (marco/<uid> = true, lo único público) que los demás ven en los marcadores.
// Uso:  cd pruebas && npm install && node dorado.test.js
const fs = require('fs');
const { chromium, st, newPage, registrar, JUEGO } = require('./mockfirebase.js');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
const cerrarDiario = p => p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); });
const visible = (p, s) => p.isVisible(s);
const dar = (uid, extra = {}) => { st.db.wallets = { ...(st.db.wallets || {}), [uid]: { ...((st.db.wallets || {})[uid] || {}), c: 150000000, sp: 0, ...extra } }; };
const secretoId = () => { const cx = {}; require('vm').runInNewContext(fs.readFileSync(JUEGO + 'tienda.js', 'utf8'), (cx.window = {}, cx)); return cx.window.TIENDA.ch.find(c => c.secret).id; };
const alMenu = p => p.evaluate(() => { for (const id of ['shopBack', 'backResult']) { const b = document.getElementById(id); if (b && b.offsetParent) b.click(); } });
const abrirEditor = async p => { await p.evaluate(() => document.getElementById('openSettings').click()); await p.waitForTimeout(300); await p.evaluate(() => document.getElementById('openEmblem').click()); await p.waitForTimeout(400); };
const abrirMarcador = async p => { await alMenu(p); await p.waitForTimeout(300); await cerrarDiario(p); await p.evaluate(() => document.getElementById('openBoard').click()); await p.waitForTimeout(1500); };
const doradosEn = (p, sel) => p.evaluate(s => document.querySelectorAll(s + ' .embw.gold').length, sel);
const filaDe = (p, nombre) => p.evaluate(n => { const li = [...document.querySelectorAll('#list li:not(.empty)')].find(l => l.querySelector('.t').textContent === n); return li ? { oro: !!li.querySelector('.embw.gold'), emb: !!li.querySelector('.embw') } : null; }, nombre);

(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const SEC = secretoId();
  // jugadores sembrados en el marcador: Oro Uno lleva el marco, Sin Marco no
  st.db.scores = {
    g1: { n: 'Oro Uno', k: 'oro.uno', s: 50, t: 1000 }, g2: { n: 'Sin Marco', k: 'sin.marco', s: 40, t: 1001 }, g3: { n: 'Oro Dos', k: 'oro.dos', s: 30, t: 1002 },
  };
  st.db.compradores = { g1: { n: 'Oro Uno', t: 5000 }, g3: { n: 'Oro Dos', t: 5001 } };       // g3 lo tiene pero se sacó el marco
  st.db.marco = { g1: true };

  console.log('Quien no tiene el personaje secreto: ni ve la opción');
  {
    const { ctx, p, errs } = await newPage(b);
    await registrar(p, 'Sin Oro'); await cerrarDiario(p);
    ok('su emblema no lleva marco', (await doradosEn(p, '#meEmb')) === 0 && (await doradosEn(p, '#userEmb')) === 0);
    await abrirEditor(p);
    ok('el editor del emblema no muestra la sección «Marco» (el personaje es secreto)', await visible(p, '#emblem') && !(await visible(p, '#edFrameBox')) && (await doradosEn(p, '#edStage')) === 0);
    await p.evaluate(() => document.getElementById('embClose').click()); await p.waitForTimeout(300);
    await p.evaluate(() => document.getElementById('openShop').click()); await p.waitForTimeout(900);
    await p.evaluate(() => document.querySelector('#shopGrid .item.secret button').click()); await p.waitForTimeout(900);
    const avisoSecreto = await p.textContent('#shopMsg');
    ok('al intentar comprar el personaje secreto sin saldo, el aviso no revela su nombre: dice «el personaje secreto»', /^Te faltan \$[\d.]+ para el personaje secreto\. ¡Sigue jugando!$/.test(avisoSecreto) && !/Dorado|Tío Pato/.test(avisoSecreto), avisoSecreto);
    ok('y la tarjeta tampoco lo nombra (sigue diciendo «Personaje secreto»)', await p.evaluate(() => { const c = document.querySelector('#shopGrid .item.secret'); return c.querySelector('.nm').textContent === 'Personaje secreto' && !/Dorado/.test(c.textContent); }));
    await p.evaluate(() => document.getElementById('shopBack').click()); await p.waitForTimeout(300);
    await abrirMarcador(p);
    const f1 = await filaDe(p, 'Oro Uno'), f2 = await filaDe(p, 'Sin Marco'), f3 = await filaDe(p, 'Oro Dos');
    ok('en el marcador ve el marco dorado de quien lo lleva puesto (Oro Uno)', f1 && f1.oro, JSON.stringify(f1));
    ok('y no ve marco en los demás (Sin Marco y quien lo tiene pero se lo sacó)', f2 && !f2.oro && f3 && !f3.oro, JSON.stringify([f2, f3]));
    ok('el marco dorado se ve animado (aro que gira, destello y estrellitas)', await p.evaluate(() => { const g = document.querySelector('#list .embw.gold'); if (!g) return false; const i = g.querySelector('.gfr i'), sh = getComputedStyle(g.querySelector('.gfr'), '::after'), sp = g.querySelectorAll('.gsp'); return getComputedStyle(i).animationName === 'gspin' && sh.animationName === 'gsheen' && sp.length === 2 && getComputedStyle(sp[0]).animationName === 'gtw'; }));
    ok('el marco no cambia el tamaño del emblema (la fila queda igual)', await p.evaluate(() => { const g = document.querySelector('#list .embw.gold'), n = [...document.querySelectorAll('#list .embw:not(.gold)')][0]; return g && n && Math.abs(g.getBoundingClientRect().width - n.getBoundingClientRect().width) < 1 && Math.abs(g.getBoundingClientRect().height - n.getBoundingClientRect().height) < 1; }));
    ok('sin denegados ni errores de página', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
    await p.screenshot({ path: process.env.SHOT_ORO || '/tmp/oro-marcador.png' });
    await ctx.close();
  }

  console.log('Desbloquear el personaje secreto: queda anotado y con el marco puesto');
  const { ctx, p, errs } = await newPage(b);
  const uid = await registrar(p, 'Dor Uno'); await cerrarDiario(p);
  dar(uid);
  await p.tap('#openShop'); await p.waitForTimeout(1200);
  await p.tap('.item.secret button.lock'); await p.waitForTimeout(3000);
  ok('se compró el personaje secreto', st.db.wallets[uid].own && st.db.wallets[uid].own['ch_' + SEC] === true);
  const rc = st.db.compradores && st.db.compradores[uid];
  ok('quedó anotado en compradores/<uid> con su nombre y la hora del servidor', rc && rc.n === 'Dor Uno' && typeof rc.t === 'number' && Math.abs(rc.t - Date.now()) < 120000 && Object.keys(rc).length === 2, JSON.stringify(rc));
  ok('y lleva el marco puesto (marco/<uid> = true)', st.db.marco[uid] === true, JSON.stringify(st.db.marco));
  ok('la tarjeta del grupo VIP también avisa del marco dorado', /marco dorado/.test(await p.textContent('.vipcard')) && /Mi emblema/.test(await p.textContent('.vipcard')), await p.textContent('.vipcard'));
  ok('sin denegados', st.denied.length === 0, st.denied.join(' || '));
  await p.tap('#vipClose'); await p.waitForTimeout(300);
  await alMenu(p); await p.waitForTimeout(400);
  ok('su emblema del inicio ya lleva el marco dorado', (await doradosEn(p, '#meEmb')) === 1, String(await doradosEn(p, '#meEmb')));

  console.log('Equipar y quitar el marco desde el editor del emblema');
  await abrirEditor(p);
  ok('el editor muestra la sección «Marco» con «Marco dorado» elegido y la vista previa con el aro', await visible(p, '#edFrameBox') && (await p.evaluate(() => document.getElementById('edFrGold').classList.contains('on'))) && (await doradosEn(p, '#edStage')) === 1);
  await p.screenshot({ path: process.env.SHOT_EDITOR || '/tmp/oro-editor.png' });
  const caja = await p.locator('#edStage .embw').boundingBox();
  await p.touchscreen.tap(caja.x + caja.width / 2, caja.y + caja.height / 2); await p.waitForTimeout(250);
  const sel = await p.locator('.edsel').boundingBox();
  ok('con el marco puesto, tocar el centro de la vista previa pone el símbolo en el centro (el aro no desplaza la cuadrícula)', Math.abs(sel.x + sel.width / 2 - (caja.x + caja.width / 2)) < 6 && Math.abs(sel.y + sel.height / 2 - (caja.y + caja.height / 2)) < 6, JSON.stringify([sel, caja]));
  await p.tap('#edFrNo'); await p.waitForTimeout(200);
  ok('«Sin marco» quita el aro de la vista previa (todavía sin guardar)', (await doradosEn(p, '#edStage')) === 0 && st.db.marco[uid] === true);
  await p.tap('#edSave'); await p.waitForTimeout(1500);
  ok('al guardar se saca el marco de su emblema', (await doradosEn(p, '#meEmb')) === 0 && (await doradosEn(p, '#userEmb')) === 0);
  ok('y sale de lo público (marco/<uid> se borra) pero sigue anotado en compradores', !(st.db.marco && st.db.marco[uid]) && st.db.compradores[uid] && st.db.compradores[uid].t === rc.t, JSON.stringify([st.db.marco, st.db.compradores[uid]]));
  await abrirEditor(p);
  ok('al volver a abrir el editor queda «Sin marco» elegido', !(await p.evaluate(() => document.getElementById('edFrGold').classList.contains('on'))) && (await doradosEn(p, '#edStage')) === 0);
  await p.tap('#edFrGold'); await p.waitForTimeout(200);
  ok('«Marco dorado» vuelve a poner el aro en la vista previa', (await doradosEn(p, '#edStage')) === 1);
  await p.tap('#edRandom'); await p.waitForTimeout(200);
  ok('«Sorpréndeme» cambia el emblema pero mantiene el marco elegido', (await doradosEn(p, '#edStage')) === 1);
  await p.tap('#edSave'); await p.waitForTimeout(1500);
  ok('al guardar vuelve el marco dorado y marco/<uid> = true', (await doradosEn(p, '#meEmb')) === 1 && st.db.marco[uid] === true, JSON.stringify(st.db.marco));
  ok('la hora de compradores nunca cambió', st.db.compradores[uid].t === rc.t);
  ok('sin denegados ni errores de página en todo el recorrido', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));

  console.log('Los demás ven su marco en los marcadores (y dejan de verlo cuando se lo saca)');
  st.db.scores[uid] = { n: 'Dor Uno', k: 'dor.uno', s: 60, t: 2000 };
  {
    const { ctx: c2, p: p2, errs: e2 } = await newPage(b);
    await registrar(p2, 'Dor Dos'); await cerrarDiario(p2);
    await abrirMarcador(p2);
    const f = await filaDe(p2, 'Dor Uno');
    ok('Dor Uno aparece con el marco dorado en el marcador de otro jugador', f && f.oro, JSON.stringify(f));
    ok('sin denegados ni errores', st.denied.length === 0 && e2.length === 0, st.denied.join(' || ') + e2.join('|'));
    await c2.close();
  }
  await abrirEditor(p); await p.tap('#edFrNo'); await p.tap('#edSave'); await p.waitForTimeout(1500);
  {
    const { ctx: c3, p: p3 } = await newPage(b);
    await registrar(p3, 'Dor Tres'); await cerrarDiario(p3);
    await abrirMarcador(p3);
    const f = await filaDe(p3, 'Dor Uno');
    ok('sin el marco puesto, ya no se distingue en el marcador (nada público lo delata)', f && !f.oro, JSON.stringify(f));
    ok('y la lista de compradores no se puede leer desde el juego (solo la consola de Firebase)', (await p3.evaluate(([db]) => fetch(`${db}/compradores.json`).then(r => r.status), ['https://juegotiopato-default-rtdb.firebaseio.com'])) === 401);
    st.denied.length = 0;
    await c3.close();
  }
  await p.evaluate(() => document.getElementById('embClose') && document.getElementById('embClose').click());
  await ctx.close();

  console.log('Quien ya tenía el personaje secreto antes de esta actualización');
  {
    const { ctx: c4, p: p4, errs: e4 } = await newPage(b);
    const u4 = await registrar(p4, 'Vieja Oro'); await cerrarDiario(p4);
    dar(u4, { own: { ['ch_' + SEC]: true } });
    ok('todavía no está anotado', !(st.db.compradores && st.db.compradores[u4]));
    await p4.reload(); await p4.waitForTimeout(3000); await cerrarDiario(p4);
    const r4 = st.db.compradores[u4];
    ok('al entrar queda anotado solo (nombre y hora del servidor)', r4 && r4.n === 'Vieja Oro' && typeof r4.t === 'number', JSON.stringify(r4));
    ok('y con el marco puesto, que ve en su emblema', st.db.marco[u4] === true && (await doradosEn(p4, '#meEmb')) === 1, JSON.stringify(st.db.marco));
    ok('sin denegados ni errores', st.denied.length === 0 && e4.length === 0, st.denied.join(' || ') + e4.join('|'));
    await p4.reload(); await p4.waitForTimeout(2500);
    ok('al volver a entrar no se anota otra vez (la hora queda la misma)', st.db.compradores[u4].t === r4.t);
    await c4.close();
  }

  console.log('Quien tiene otro personaje (no el secreto) no puede anotarse ni ponerse el marco');
  {
    const { ctx: c5, p: p5 } = await newPage(b);
    const u5 = await registrar(p5, 'Con Conejo'); await cerrarDiario(p5);
    dar(u5, { own: { ch_conejo: true } });
    await p5.reload(); await p5.waitForTimeout(2500); await cerrarDiario(p5);
    ok('no queda anotado ni lleva marco', !(st.db.compradores && st.db.compradores[u5]) && !(st.db.marco && st.db.marco[u5]) && (await doradosEn(p5, '#meEmb')) === 0);
    const r = await p5.evaluate(async ([db, uid]) => {
      const sess = JSON.parse(localStorage.getItem('gana-al-tio-pato-sesion') || 'null'), tok = encodeURIComponent(sess && sess.id);
      const a = await fetch(`${db}/compradores/${uid}.json?auth=${tok}`, { method: 'PUT', body: JSON.stringify({ n: 'x', t: { '.sv': 'timestamp' } }) });
      const m = await fetch(`${db}/marco/${uid}.json?auth=${tok}`, { method: 'PUT', body: 'true' });
      return [a.status, m.status];
    }, ['https://juegotiopato-default-rtdb.firebaseio.com', u5]);
    ok('y aunque lo intente a mano, Firebase se lo rechaza', r[0] === 401 && r[1] === 401, JSON.stringify(r));
    st.denied.length = 0;
    await c5.close();
  }

  console.log('Si todavía no están publicadas las reglas nuevas');
  {
    const r = JSON.parse(fs.readFileSync(JUEGO + 'firebase-rules.json', 'utf8')); delete r.rules.compradores; delete r.rules.marco;
    const tmp = require('os').tmpdir() + '/reglas-sin-marco.json'; fs.writeFileSync(tmp, JSON.stringify(r)); st.rulesFile = tmp;
    const { ctx: c6, p: p6, errs: e6 } = await newPage(b);
    const u6 = await registrar(p6, 'Sin Reglas'); await cerrarDiario(p6);
    dar(u6, { own: { ['ch_' + SEC]: true } });
    await p6.reload(); await p6.waitForTimeout(3500); await cerrarDiario(p6);
    ok('el juego sigue funcionando (su marco se ve en su propio emblema) sin errores de página', e6.length === 0 && (await doradosEn(p6, '#meEmb')) === 1, e6.join('|'));
    const cuenta = re => st.denied.filter(d => re.test(d)).length, ya = [cuenta(/GET \/compradores\//), cuenta(/GET \/marco(\s|$)/)];
    ok('y no insiste sin parar: como mucho 3 intentos de anotarse y 2 lecturas de la lista de marcos en esa carga', ya[0] >= 1 && ya[0] <= 3 && ya[1] <= 2, st.denied.join(' || '));
    await p6.reload(); await p6.waitForTimeout(3000);
    ok('al volver a abrir el juego tampoco (otros 3 intentos como mucho)', cuenta(/GET \/compradores\//) - ya[0] <= 3, st.denied.join(' || '));
    st.rulesFile = null; st.denied.length = 0;
    await c6.close();
  }

  await b.close();
  console.log(`\n${pass} correctas, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})();
