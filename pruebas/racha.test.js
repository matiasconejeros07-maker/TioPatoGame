// Racha diaria de punta a punta: el juego real en Chromium contra un Firebase de mentira que aplica las reglas REALES (firebase-rules.json).
// Uso:  cd pruebas && npm install && npx playwright install chromium && node racha.test.js
const fs = require('fs');
const { chromium, st, newPage, playHits, registrar } = require('./mockfirebase.js');
const DAY = 86400000;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
const pesosFor = h => h;   // hasta 99 rebotes: $1 por rebote
(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const { ctx, p, errs } = await newPage(b);
  await registrar(p, 'Racha Test');
  const uid = Object.values(st.users)[0].uid;
  const vis = sel => p.evaluate(s => document.querySelector(s).classList.contains('show'), sel);
  const txt = sel => p.evaluate(s => document.querySelector(s).textContent.trim(), sel);
  console.log('Día 1');
  ok('al entrar se abre sola la racha diaria', await vis('#daily'));
  ok('botón «Reclamar $100»', (await txt('#dailyGo')) === 'Reclamar $100', await txt('#dailyGo'));
  const iconos = await p.evaluate(() => [...document.querySelectorAll('#dailyGrid .dcard:not(.d7)')].map(c => [...c.querySelectorAll('.ic img')].map(i => i.getAttribute('src').replace('skins/', '').replace('.webp', ''))));
  ok('los dibujos coinciden con los pesos: $100 = 1 moneda de 100, $200 = 2, $300 = 3, $400 = 4, $500 = moneda de 500, $1.000 = billete de 1000',
    JSON.stringify(iconos) === JSON.stringify([['peso100'], ['peso100', 'peso100'], ['peso100', 'peso100', 'peso100'], ['peso100', 'peso100', 'peso100', 'peso100'], ['peso500'], ['b1000']]), JSON.stringify(iconos));
  await p.screenshot({ path: process.env.SHOT || '/tmp/racha_iconos.png' });
  await p.tap('#dailyGo'); await p.waitForTimeout(1200);
  await p.waitForTimeout(250);
  ok('al reclamar salen monedas volando hacia el bolsillo y el «+$100» grande', await p.evaluate(() => document.querySelectorAll('.fly').length > 0 && !!document.querySelector('.gain')));
  ok('el mensaje confirma el cobro', /\+\$100/.test(await txt('#dailyMsg')), await txt('#dailyMsg'));
  ok('el botón queda en «Vuelve en …»', /^Vuelve en/.test(await txt('#dailyGo')) && await p.evaluate(() => document.getElementById('dailyGo').disabled));
  await p.waitForTimeout(1600);
  ok('el bolsillo termina en $100 y no quedan monedas volando', (await txt('#pocketNum')) === '$100' && await p.evaluate(() => document.querySelectorAll('.fly, .gain').length === 0), await txt('#pocketNum'));
  ok('la cartera subió $100 en el servidor', st.db.wallets[uid].c === 100, JSON.stringify(st.db.wallets[uid]));
  ok('racha guardada n=1', st.db.streaks[uid].n === 1, JSON.stringify(st.db.streaks[uid]));
  await p.waitForTimeout(1400);
  ok('cobrada la racha, la ventana pasa sola a la ruleta del día', /Ruleta diaria/.test(await txt('#dailyTitle')) && await p.evaluate(() => !document.getElementById('wheelBox').hidden), await txt('#dailyTitle'));
  ok('chip 🔥 1', (await txt('#streakNum')) === '1');
  await p.tap('#dailyClose'); await p.waitForTimeout(300);
  ok('sin denegados', st.denied.length === 0, st.denied.join('|'));
  st.db.ruleta = { ...(st.db.ruleta || {}), [uid]: { t: Date.now(), c: Date.now() } };      // la ruleta de hoy ya está girada (si no, sale ella primero: ver carga.test.js), así a la racha le toca abrirse sola

  console.log('Día 2 (al día siguiente)');
  st.db.streaks[uid].t -= DAY; await p.reload(); await p.waitForTimeout(2500);
  ok('se abre sola otra vez', await vis('#daily')); ok('botón «Reclamar $200»', (await txt('#dailyGo')) === 'Reclamar $200', await txt('#dailyGo'));
  await p.tap('#dailyGo'); await p.waitForTimeout(1200);
  ok('cartera $300 y racha 2', st.db.wallets[uid].c === 300 && st.db.streaks[uid].n === 2, JSON.stringify([st.db.wallets[uid], st.db.streaks[uid]]));
  await p.tap('#dailyClose');

  console.log('Se saltó un día');
  st.db.streaks[uid].t -= 2 * DAY; await p.reload(); await p.waitForTimeout(2500);
  ok('avisa que perdió la racha', /Perdiste la racha/.test(await txt('#dailySub')), await txt('#dailySub'));
  await p.tap('#dailyGo'); await p.waitForTimeout(1200);
  ok('vuelve al día 1: cartera $400 y racha 1', st.db.wallets[uid].c === 400 && st.db.streaks[uid].n === 1, JSON.stringify([st.db.wallets[uid], st.db.streaks[uid]]));
  await p.tap('#dailyClose');

  console.log('Mismo día: no se puede cobrar dos veces');
  const r2 = await p.evaluate(async () => { document.getElementById('streakChip').click(); return document.getElementById('dailyGo').disabled; });
  ok('el botón está desactivado', r2);
  await p.tap('#dailyClose');

  console.log('Día 7: multiplicador ×2 que se guarda y se activa con un botón');
  st.db.streaks[uid] = { n: 6, t: st.db.streaks[uid].t - DAY }; await p.reload(); await p.waitForTimeout(2500);
  ok('botón «Reclamar ×2 🤑»', (await txt('#dailyGo')) === 'Reclamar ×2 🤑', await txt('#dailyGo'));
  const dia7 = await p.evaluate(() => { const c = document.querySelector('#dailyGrid .dcard.mx'); return c ? { txt: c.textContent, emojis: [...c.querySelectorAll('.mxe span')].map(e => e.textContent), anim: getComputedStyle(c.querySelector('.mxe span')).animationName, bolt: !!document.querySelector('#dailyGrid .bolt') } : null; });
  ok('el día 7 muestra 🤑💸 animados (ya no el rayo ⚡)', dia7 && dia7.emojis.join('') === '🤑💸' && dia7.anim === 'mxBob' && !dia7.bolt && !/⚡/.test(dia7.txt) && /Multiplicador ×2/.test(dia7.txt), JSON.stringify(dia7));
  const c0 = st.db.wallets[uid].c;
  await p.tap('#dailyGo'); await p.waitForTimeout(1200);
  ok('sin pesos de regalo: se guarda un ×2 (x2 = 1) y NO se activa solo', st.db.wallets[uid].c === c0 && st.db.streaks[uid].n === 7 && st.db.streaks[uid].x2 === 1 && !st.db.streaks[uid].bx, JSON.stringify([st.db.wallets[uid], st.db.streaks[uid]]));
  ok('el mensaje dice que lo activa cuando quiera', /Guardaste un multiplicador ×2/.test(await txt('#dailyMsg')), await txt('#dailyMsg'));
  ok('al reclamar vuelan 🤑 y 💸 hacia el bolsillo', await p.evaluate(() => [...document.querySelectorAll('.fly.bolt')].map(e => e.textContent).some(t => t === '🤑') ));
  await p.tap('#dailyClose'); await p.waitForTimeout(1800);
  ok('en el inicio aparece el botón «Activar ×2» y no hay cartel de multiplicador activo', await p.evaluate(() => !document.getElementById('boostGo').hidden && /Activar ×2/.test(document.getElementById('boostGo').textContent) && document.getElementById('boostBar').hidden));
  await playHits(p, 4, async () => {}); await p.waitForTimeout(3500);
  const runSin = st.db.runs[uid];
  ok('una partida jugada sin activarlo paga normal', runSin && runSin.p === pesosFor(runSin.h), JSON.stringify(runSin));
  await p.evaluate(() => { const b = document.getElementById('backResult'); if (b && b.offsetParent) b.click(); }); await p.waitForTimeout(800);
  await p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); });
  await p.tap('#boostGo button', { force: true }); await p.waitForTimeout(1500);
  ok('al tocar el botón se activa: bx, bm = 2 y bd = 10 minutos guardados y el guardado baja a 0', st.db.streaks[uid].bx > 0 && st.db.streaks[uid].bm === 2 && st.db.streaks[uid].bd === 600000 && st.db.streaks[uid].x2 === 0, JSON.stringify(st.db.streaks[uid]));
  ok('aparece el cartel «Pesos ×2» con la cuenta regresiva y desaparece el botón', await p.evaluate(() => !document.getElementById('boostBar').hidden && /Pesos ×2/.test(document.getElementById('boostBar').textContent) && document.getElementById('boostGo').hidden), await p.evaluate(() => document.getElementById('boostBar').textContent));
  await playHits(p, 6, async () => {}); await p.waitForTimeout(3500);
  const run = st.db.runs[uid];
  ok('la partida pagó el doble y el servidor lo aceptó', run && run.p === 2 * pesosFor(run.h) && run.h >= 6, JSON.stringify(run));
  ok('el resultado lo muestra', /Pesos ×2 de tu multiplicador/.test(await txt('#finalSub')), await txt('#finalSub'));
  ok('sin denegados hasta aquí', st.denied.length === 0, st.denied.join(' || '));
  await p.evaluate(() => { const b = document.getElementById('backResult'); if (b && b.offsetParent) b.click(); }); await p.waitForTimeout(500);

  console.log('Semana 2: días 8 a 14');
  st.db.streaks[uid] = { n: 7, t: Date.now() - DAY - 1000, x2: 0 }; await p.reload(); await p.waitForTimeout(2800);
  ok('el día 8 se cobra $500 (la moneda de $500)', (await txt('#dailyGo')) === 'Reclamar $500', await txt('#dailyGo'));
  const sem2 = await p.evaluate(() => [...document.querySelectorAll('#dailyGrid .dcard')].map(c => [c.querySelector('.dn').textContent, [...c.querySelectorAll('.ic img')].map(i => i.getAttribute('src').replace('skins/', '').replace('.webp', '')).join('+'), (c.querySelector('.ix') || {}).textContent || '', (c.querySelector('.dv') || {}).textContent, c.className.replace('dcard', '').trim()]));
  ok('la pantalla muestra los días 8 a 14: 1, 2, 3 y 4 monedas de $500, luego 4 con ×5 y ×6 y el día 14 de multiplicador ×3',
    JSON.stringify(sem2.map(c => c[0])) === JSON.stringify(['Día 8', 'Día 9', 'Día 10', 'Día 11', 'Día 12', 'Día 13', 'Día 14'])
    && JSON.stringify(sem2.slice(0, 6).map(c => c[1])) === JSON.stringify(['peso500', 'peso500+peso500', 'peso500+peso500+peso500', 'peso500+peso500+peso500+peso500', 'peso500+peso500+peso500+peso500', 'peso500+peso500+peso500+peso500'])
    && JSON.stringify(sem2.slice(0, 6).map(c => c[2])) === JSON.stringify(['', '', '', '', '×5', '×6'])
    && JSON.stringify(sem2.slice(0, 6).map(c => c[3])) === JSON.stringify(['$500', '$1.000', '$1.500', '$2.000', '$2.500', '$3.000']) && /Multiplicador ×3/.test(sem2[6][3] || ''), JSON.stringify(sem2));
  ok('el día 8 es el de hoy y el día 7 ya no se ve', /today/.test(sem2[0][4]) && !sem2.some(c => c[0] === 'Día 7'));
  await p.screenshot({ path: process.env.SHOT2 || '/tmp/racha_semana2.png' });
  const w8 = st.db.wallets[uid].c;
  await p.tap('#dailyGo'); await p.waitForTimeout(1200);
  ok('día 8: la cartera subió $500 y la racha es 8', st.db.streaks[uid].n === 8 && st.db.wallets[uid].c === w8 + 500, JSON.stringify([st.db.wallets[uid], st.db.streaks[uid]]));
  await p.tap('#dailyClose');

  console.log('Día 14 (×3) y día 21 (×4): se guardan y se activan');
  for (const [n, m] of [[14, 3], [21, 4]]) {
    st.db.streaks[uid] = { n: n - 1, t: Date.now() - DAY - 1000 }; await p.reload(); await p.waitForTimeout(2800);
    ok(`día ${n}: botón «Reclamar ×${m} 🤑»`, (await txt('#dailyGo')) === `Reclamar ×${m} 🤑`, await txt('#dailyGo'));
    await p.tap('#dailyGo'); await p.waitForTimeout(1200);
    ok(`día ${n}: se guarda x${m} = 1`, st.db.streaks[uid]['x' + m] === 1 && st.db.streaks[uid].n === n, JSON.stringify(st.db.streaks[uid]));
    await p.tap('#dailyClose'); await p.waitForTimeout(1500);
    await p.tap('#boostGo button', { force: true }); await p.waitForTimeout(1500);
    ok(`día ${n}: lo activa y queda ×${m} activo`, st.db.streaks[uid].bm === m && st.db.streaks[uid]['x' + m] === 0 && /Pesos ×/.test(await txt('#boostBar')) && (await txt('#boostBar')).includes('×' + m), JSON.stringify(st.db.streaks[uid]));
    if (m === 4) {
      await playHits(p, 5, async () => {}); await p.waitForTimeout(3500);
      const r4 = st.db.runs[uid];
      ok('una partida con el ×4 activo paga ×4 y las reglas lo aceptan', r4 && r4.p === 4 * pesosFor(r4.h), JSON.stringify(r4));
      await p.evaluate(() => { const b = document.getElementById('backResult'); if (b && b.offsetParent) b.click(); }); await p.waitForTimeout(500);
    }
  }

  console.log('Día 28 en adelante: $10.000 cada día');
  st.db.streaks[uid] = { n: 26, t: Date.now() - DAY - 1000 }; await p.reload(); await p.waitForTimeout(2800);
  const s4 = await p.evaluate(() => [...document.querySelectorAll('#dailyGrid .dcard')].map(c => [c.querySelector('.dn').textContent, [...c.querySelectorAll('.ic img')].map(i => i.getAttribute('src').replace('skins/', '').replace('.webp', '')).join('+'), (c.querySelector('.dv') || {}).textContent]));
  ok('semana 4: días 22 a 28; $2.000 a $8.000 con los billetes que suman y el día 28 con el billete de $10.000',
    JSON.stringify(s4.map(c => c[0])) === JSON.stringify(['Día 22', 'Día 23', 'Día 24', 'Día 25', 'Día 26', 'Día 27', 'Día 28'])
    && JSON.stringify(s4.slice(0, 6).map(c => c[2])) === JSON.stringify(['$2.000', '$3.000', '$4.000', '$5.000', '$6.000', '$8.000'])
    && JSON.stringify(s4.slice(0, 6).map(c => c[1])) === JSON.stringify(['b2000', 'b2000+b1000', 'b2000+b2000', 'b5000', 'b5000+b1000', 'b5000+b2000+b1000']) && s4[6][1] === 'b10000' && /\$10\.000 cada día/.test(s4[6][2]), JSON.stringify(s4));
  await p.screenshot({ path: process.env.SHOT4 || '/tmp/racha_semana4.png' });
  const cw = st.db.wallets[uid].c;
  await p.tap('#dailyGo'); await p.waitForTimeout(1200);
  ok('día 27: cobra $8.000', st.db.wallets[uid].c === cw + 8000 && st.db.streaks[uid].n === 27, JSON.stringify([st.db.wallets[uid], st.db.streaks[uid]]));
  await p.tap('#dailyClose');
  for (const n of [28, 29, 40]) {
    st.db.streaks[uid] = { n: n - 1, t: Date.now() - DAY - 1000 }; const w0 = st.db.wallets[uid].c; await p.reload(); await p.waitForTimeout(2800);
    ok(`día ${n}: botón «Reclamar $10.000»`, (await txt('#dailyGo')) === 'Reclamar $10.000', await txt('#dailyGo'));
    if (n === 29) await p.screenshot({ path: process.env.SHOT5 || '/tmp/racha_legendaria.png' });
    await p.tap('#dailyGo'); await p.waitForTimeout(1200);
    ok(`día ${n}: la cartera sube $10.000 y el servidor lo acepta`, st.db.wallets[uid].c === w0 + 10000 && st.db.streaks[uid].n === n, JSON.stringify([st.db.wallets[uid], st.db.streaks[uid]]));
    await p.tap('#dailyClose');
  }
  ok('sin denegados en todo el flujo', st.denied.length === 0, st.denied.join(' || '));
  ok('sin errores de página', errs.length === 0, errs.join('|'));
  console.log(`\n${pass} correctas, ${fail} fallas`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
