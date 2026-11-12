// Emblema de perfil de punta a punta: editarlo, guardarlo en la cuenta y en el marcador, verlo en el marcador y como rival del primer lugar.
// Uso:  cd pruebas && npm install && npx playwright install chromium && node perfil.test.js
const fs = require('fs');
const { chromium, st, newPage, playHits, registrar } = require('./mockfirebase.js');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const { ctx, p, errs } = await newPage(b);
  await registrar(p, 'Perfil Test');
  const uid = Object.values(st.users)[0].uid;
  st.db.scores = { a1: { n: 'Matías', k: 'matias', s: 131, t: 1, a: 'e41A33GGG' }, a2: { n: 'Cami', k: 'cami', s: 80, t: 2 } };   // el primero tiene un escudo rojo con dorado y una corona
  await p.reload(); await p.waitForTimeout(2500); await p.tap('#dailyClose').catch(() => {});
  console.log('El rival del encabezado es el primer lugar');
  const rival = await p.evaluate(() => ({ emb: document.getElementById('botAv').classList.contains('emb'), txt: document.getElementById('botEmb').textContent, nombre: document.getElementById('botAv').title }));
  ok('el avatar rival muestra el emblema de quien va primero (👑) y su nombre', rival.emb && rival.txt === '👑' && rival.nombre === 'Matías', JSON.stringify(rival));
  console.log('Editor');
  await p.tap('#userBox'); await p.waitForTimeout(400);
  ok('el editor se abre desde el chip del inicio', await p.evaluate(() => document.getElementById('emblem').classList.contains('show')));
  const antes = await p.evaluate(() => document.querySelector('#edStage .embs').style.left);
  const box = await p.evaluate(() => { const r = document.getElementById('edStage').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  await p.mouse.move(box[0] + box[2] * .5, box[1] + box[3] * .5); await p.mouse.down(); await p.mouse.move(box[0] + box[2] * .75, box[1] + box[3] * .3, { steps: 4 }); await p.mouse.up();
  const despues = await p.evaluate(() => document.querySelector('#edStage .embs').style.left);
  ok('arrastrar sobre la vista previa mueve el símbolo', antes !== despues, antes + ' → ' + despues);
  await p.evaluate(() => { document.querySelectorAll('#edSyms button')[6].click(); document.querySelectorAll('#edShapes button')[4].click(); document.querySelectorAll('#edC1 button')[7].click(); document.querySelectorAll('#edC2 button')[10].click(); document.querySelectorAll('#edPats button')[3].click(); document.getElementById('edBigger').click(); });
  await p.evaluate(() => document.getElementById('edLayers').lastElementChild.click());
  for (let i = 0; i < 6; i++) await p.evaluate(() => { const l = document.getElementById('edLayers').lastElementChild; if (l && l.textContent === '＋') l.click(); });
  ok('se pueden agregar símbolos hasta un máximo de 5 (luego desaparece el «＋»)', await p.evaluate(() => document.querySelectorAll('#edLayers .edchip').length === 5 && ![...document.querySelectorAll('#edLayers .edchip')].some(b => b.textContent === '＋')));
  await p.evaluate(() => document.getElementById('edSave').click()); await p.waitForTimeout(1500);
  const av = st.db.wallets && st.db.wallets[uid] && st.db.wallets[uid].av;
  ok('el emblema queda en la cuenta (9 a 25 caracteres, con 5 símbolos son 25)', typeof av === 'string' && /^e[0-9A-Za-z_-]{4}([0-9A-Za-z_-]{4}){1,5}$/.test(av) && av.length === 25, String(av));
  ok('el encabezado y el chip muestran el 💎', await p.evaluate(() => document.getElementById('meEmb').textContent.includes('💎') && document.getElementById('userEmb').textContent.includes('💎')));
  console.log('Marcador');
  await playHits(p, 3, async () => {}); await p.waitForTimeout(3500);
  ok('al guardar la partida el marcador lleva el mismo emblema', st.db.scores && st.db.scores[uid] && st.db.scores[uid].a === av, JSON.stringify(st.db.scores && st.db.scores[uid]));
  await p.tap('#openBoard2'); await p.waitForTimeout(1200);
  const filas = await p.evaluate(() => [...document.querySelectorAll('#list li')].map(li => [li.querySelector('.t').textContent, li.querySelector('.pav .embs') ? li.querySelector('.pav .embs').textContent : '']));
  ok('el marcador muestra el emblema de cada jugador', filas.length === 3 && filas[0][0] === 'Matías' && filas[0][1] === '👑' && filas.some(f => f[0] === 'Perfil Test' && f[1].includes('💎')), JSON.stringify(filas));
  const tam = await p.evaluate(() => Math.round(document.querySelector('#list li .pav .emb').getBoundingClientRect().width));
  ok('en el marcador el emblema mide 52 px (antes 30) y deja espacio al nombre', tam === 52, String(tam));
  console.log('Otro dispositivo');
  await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('gana-al-tio-pato-v2')); delete o.av; localStorage.setItem('gana-al-tio-pato-v2', JSON.stringify(o)); });
  await p.reload(); await p.waitForTimeout(2500);
  ok('con los datos locales borrados, el emblema vuelve desde la cuenta', await p.evaluate(() => document.getElementById('meEmb').textContent.includes('💎')));
  console.log('Si las reglas todavía no están publicadas');
  {
    const os = require('os'), path = require('path');
    const nuevas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase-rules.json'), 'utf8'));
    const viejas = JSON.parse(JSON.stringify(nuevas)); delete viejas.rules.wallets.$uid.av; delete viejas.rules.scores.$uid.a;               // las reglas de antes del emblema
    const arch = path.join(os.tmpdir(), 'reglas-viejas-' + process.pid + '.json'); fs.writeFileSync(arch, JSON.stringify(viejas));
    st.denied.length = 0; st.rulesFile = arch;
    const { ctx: c2, p: p2, errs: e2 } = await newPage(b);
    await registrar(p2, 'Sin Reglas');
    const uid2 = Object.values(st.users).find(u => /sin\.reglas/.test(u.email || '') || true && u.uid !== uid).uid;
    st.db.scores = { ...(st.db.scores || {}), [uid2]: { n: 'Sin Reglas', k: 'sin.reglas', s: 40, t: Date.now() - 5000 } };               // ya tiene puntaje, así que debería salir en el marcador
    await p2.reload(); await p2.waitForTimeout(2500); await p2.tap('#dailyClose').catch(() => {});
    await p2.click('#openSettings'); await p2.click('#openEmblem'); await p2.waitForTimeout(200);
    await p2.evaluate(() => { document.querySelectorAll('#edSyms button')[9].click(); document.getElementById('edSave').click(); }); await p2.waitForTimeout(2000);
    await p2.click('#openSettings'); await p2.waitForTimeout(200);
    const t1 = await p2.textContent('#avSt');
    ok('con las reglas viejas, Ajustes avisa que faltan publicar las reglas nuevas', /reglas/i.test(t1), t1);
    ok('y en la base de datos todavía no hay emblema', !(st.db.wallets && st.db.wallets[uid2] && st.db.wallets[uid2].av) && !st.db.scores[uid2].a);
    st.rulesFile = null; st.denied.length = 0;                                                                                            // el dueño publica las reglas nuevas
    await p2.reload(); await p2.waitForTimeout(3500); await p2.evaluate(() => document.getElementById('dailyClose').click());      // con las reglas nuevas también aparece la racha del día
    ok('al abrir de nuevo, el emblema pendiente se sube solo a la cuenta y al marcador', st.db.wallets[uid2].av && st.db.scores[uid2].a === st.db.wallets[uid2].av, JSON.stringify([st.db.wallets[uid2], st.db.scores[uid2]]));
    await p2.click('#openSettings'); await p2.waitForTimeout(200);
    ok('Ajustes dice «Todos lo ven en el marcador»', /Todos lo ven/.test(await p2.textContent('#avSt')), await p2.textContent('#avSt'));
    ok('sin errores de página en esa prueba', e2.length === 0, e2.join('|'));
    await c2.close(); try { fs.unlinkSync(arch); } catch (e) {}
  }
  ok('sin denegados ni errores de página', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
  console.log(`\n${pass} correctas, ${fail} fallas`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
