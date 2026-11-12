// Pruebas de las reglas de Firebase (firebase-rules.json) con el simulador oficial (targaryen): economía, antitrampas y permisos.
// Uso:  cd pruebas && npm install && node reglas.test.js
const targaryen = require('targaryen');
const path = require('path');
const JUEGO = process.env.JUEGO || path.join(__dirname, '..') + '/';
const fs = require('fs'), vm = require('vm');
const rules = JSON.parse(fs.readFileSync(JUEGO + 'firebase-rules.json', 'utf8'));
const cx = { window: {} }; vm.createContext(cx); vm.runInContext(fs.readFileSync(JUEGO + 'tienda.js', 'utf8'), cx);
const ECO = cx.window.TIENDA.eco, E = ECO.tier;
const pesosFor = (h, r = 1) => { const t = Math.floor(h / E); return r * (h + E * t * (t - 1) / 2 + t * (h - E * t + 1)); };
const START = { s: { '.sv': 'timestamp' }, b: 'peso1', r: 1 };
let pass = 0, fail = 0;
const N = Date.now(), T0 = N, SV = { '.sv': 'timestamp' };
const A = (uid, email = 'matias@tio-pato.invalid', ev = false) => ({ uid, token: { email, email_verified: ev } });
// targaryen ignora with({now}) y usa la hora real: se desplazan hacia atrás las horas guardadas y escritas para simular 'now'
const isT = (k, v) => ['s', 'e', 'lr', 't', 'bx', 'ml', 'sl'].includes(k) && typeof v === 'number' && v >= 1e12;       // horas en ms (los puntajes y rebotes son números chicos)
function shiftObj(o, off) { if (!o || typeof o !== 'object') return o; const c = Array.isArray(o) ? [] : {}; for (const k in o) c[k] = (o[k] && typeof o[k] === 'object' && !o[k]['.sv']) ? shiftObj(o[k], off) : (isT(k, o[k]) ? o[k] - off : o[k]); return c; }
function db(data, now, uid = 'u1', email, ev) {
  const off = now - Date.now(), base = () => targaryen.database(rules, shiftObj(data || {}, off)).as(A(uid, email, ev));
  const sh = (path, v) => (v && typeof v === 'object' && !v['.sv']) ? shiftObj(v, off) : (isT(path.split('/').pop(), v) ? v - off : v);
  return {
    write: (p, v) => base().write(p, sh(p, v)),
    update: (p, o) => { const m = {}; for (const k in o) m[k] = sh(k, o[k]); return base().update(p, m); },
    read: p => base().read(p)
  };
}
function ok(name, res, want) {
  const got = !!res.allowed;
  if (got === want) { pass++; console.log('  ok  ', name); }
  else { fail++; console.log('  FALLA', name, '→ permitido=' + got, 'esperado=' + want, (res.info || '').toString().split('\n').slice(0, 3).join(' | ').slice(0, 300)); }
  return res;
}
const next = (res, data) => res.newDatabase ? res.newDatabase.root.$value ? res.newDatabase.root.$value() : data : data;
// estado de la base tras escribir (para encadenar pasos)
const snap = res => JSON.parse(JSON.stringify(res.newDatabase.rules ? res.newDatabase.root.$value() : {}));

console.log('pesosFor:', [1, 99, 100, 101, 199, 200, 300, 500].map(h => h + '→' + pesosFor(h)).join('  '));

// ---------- 1. inicio de partida ----------
console.log('Inicio de partida');
let r = ok('PUT runs/u1 {s: now, b: peso1, r: 1}', db({}, T0).write('/runs/u1', START), true);
ok('inicio sin pelota ni tasa', db({}, T0).write('/runs/u1', { s: SV }), false);
ok('inicio con tasa inventada (peso1 pagando 20)', db({}, T0).write('/runs/u1', { s: SV, b: 'peso1', r: 20 }), false);
ok('inicio con pelota que no es tuya', db({}, T0).write('/runs/u1', { s: SV, b: 'b20000', r: 20 }), false);
ok('inicio con pelota inexistente', db({}, T0).write('/runs/u1', { s: SV, b: 'regalo', r: 99 }), false);
const owner = { wallets: { u1: { c: 9000, sp: 7000, own: { ball_b1000: true, ball_peso50: true } } } };
ok('inicio con el billete de $1.000 que sí tienes (7 por punto)', db(owner, T0).write('/runs/u1', { s: SV, b: 'b1000', r: 7 }), true);
ok('… con la tasa de otra pelota (8)', db(owner, T0).write('/runs/u1', { s: SV, b: 'b1000', r: 8 }), false);
ok('inicio con la moneda de $50 (4 por punto)', db(owner, T0).write('/runs/u1', { s: SV, b: 'peso50', r: 4 }), true);
ok('PUT runs/u1 con hora inventada', db({}, T0).write('/runs/u1', { s: T0 - 999999 }), false);
ok('PUT runs/u1 con campos extra', db({}, T0).write('/runs/u1', { ...START, h: 5 }), false);
ok('escribir en la partida de otra cuenta', db({}, T0, 'u2').write('/runs/u1', START), false);

// ---------- 2. fin de partida + cobro atómico ----------
console.log('Cobro de una partida');
const started = { runs: { u1: { s: T0, b: 'peso1', r: 1 } } };
const claim = (h, over = {}, wal = { c: 0, sp: 0 }, p = pesosFor(h)) => Object.assign({
  'runs/u1/e': SV, 'runs/u1/h': h, 'runs/u1/p': p,
  'wallets/u1/c': (wal.c || 0) + p, 'wallets/u1/sp': wal.sp || 0, 'wallets/u1/lr': T0
}, over);
ok('60 rebotes tras 60 s, cobro completo', db(started, T0 + 60000).update('/', claim(60)), true);
ok('60 rebotes tras 23 s (muy rápido)', db(started, T0 + 23000).update('/', claim(60)), false);
ok('150 rebotes tras 60 s (más de los que caben)', db(started, T0 + 60000).update('/', claim(150)), false);
ok('30 rebotes en 10,6 s (justo dentro del límite)', db(started, T0 + 10600).update('/', claim(30)), true);
ok('30 rebotes en 10,4 s (justo fuera)', db(started, T0 + 10400).update('/', claim(30)), false);
ok('p inflado (+1)', db(started, T0 + 90000).update('/', claim(60, { 'runs/u1/p': 61, 'wallets/u1/c': 61 })), false);
ok('c inflado respecto a p', db(started, T0 + 90000).update('/', claim(60, { 'wallets/u1/c': 5000 })), false);
ok('120 rebotes (tramo ×2) paga 141', db(started, T0 + 130000).update('/', claim(120)), true);
ok('120 rebotes pagados como 120', db(started, T0 + 130000).update('/', claim(120, { 'runs/u1/p': 120, 'wallets/u1/c': 120 })), false);
ok('250 rebotes paga 250+100+2*? (tramo ×3)', db(started, T0 + 240000).update('/', claim(250)), true);
ok('h=501 (sobre el tope) aunque haya pasado una hora', db(started, T0 + 3600000).update('/', claim(501)), false);
ok('h=500 tras 4 min', db(started, T0 + 240000).update('/', claim(500)), true);
ok('h decimal', db(started, T0 + 90000).update('/', claim(60.5, { 'runs/u1/p': 60 , 'wallets/u1/c': 60})), false);
ok('h negativo', db(started, T0 + 90000).update('/', claim(-5, { 'runs/u1/p': -5, 'wallets/u1/c': -5 })), false);
ok('con hora de fin inventada (más tarde)', db(started, T0 + 90000).update('/', claim(60, { 'runs/u1/e': T0 + 90000 + 500000 })), false);
ok('cobro de partida sin terminar (solo c y lr)', db(started, T0 + 90000).update('/', { 'wallets/u1/c': 50, 'wallets/u1/sp': 0, 'wallets/u1/lr': T0 }), false);
ok('regalo directo de monedas', db({ wallets: { u1: { c: 10, sp: 0 } } }, T0).write('/wallets/u1/c', 1000000), false);
ok('regalo con c y lr inventados', db({ wallets: { u1: { c: 10, sp: 0 } } }, T0).update('/wallets/u1', { c: 1000, lr: 12345 }), false);
ok('crear cartera ya con monedas', db({}, T0).write('/wallets/u1', { c: 5000, sp: 0 }), false);
ok('crear cartera vacía', db({}, T0).write('/wallets/u1', { c: 0, sp: 0 }), true);
ok('fin de partida con h sin p', db(started, T0 + 90000).update('/', { 'runs/u1/e': SV, 'runs/u1/h': 60 }), false);
ok('s cambiado al terminar', db(started, T0 + 90000).update('/', claim(60, { 'runs/u1/s': T0 + 80000 })), false);

console.log('Pesos por pelota');
const startedB = { runs: { u1: { s: T0, b: 'b1000', r: 7 } }, wallets: { u1: { c: 9000, sp: 7000, own: { ball_b1000: true } } } };
const claimB = (h, p, wal = { c: 9000, sp: 7000 }) => ({ 'runs/u1/e': SV, 'runs/u1/h': h, 'runs/u1/p': p, 'wallets/u1/c': wal.c + p, 'wallets/u1/sp': wal.sp, 'wallets/u1/lr': T0 });
ok('50 rebotes con el billete de $1.000: 7 × 50 = 350', db(startedB, T0 + 60000).update('/', claimB(50, pesosFor(50, 7))), true);
ok('… cobrando de menos (50, como moneda de $1): tampoco, el total lo fijan las reglas', db(startedB, T0 + 60000).update('/', claimB(50, pesosFor(50, 1))), false);
ok('… cobrando 20 por punto', db(startedB, T0 + 60000).update('/', claimB(50, pesosFor(50, 20))), false);
ok('… cobrando 8 por punto', db(startedB, T0 + 60000).update('/', claimB(50, pesosFor(50, 8))), false);
ok('120 rebotes con el billete: 7 × 141 = 987', db(startedB, T0 + 130000).update('/', claimB(120, pesosFor(120, 7))), true);
ok('… 7 × 120 (sin las monedas dobles) también', db(startedB, T0 + 130000).update('/', claimB(120, 7 * 120)), false);
const started20 = { runs: { u1: { s: T0, b: 'b20000', r: 20 } }, wallets: { u1: { c: 90000, sp: 20000, own: { ball_b20000: true } } } };
ok('100 rebotes con el billete de $20.000: 20 × 101', db(started20, T0 + 60000).update('/', claimB(100, pesosFor(100, 20), { c: 90000, sp: 20000 })), true);
const startedFake = { runs: { u1: { s: T0, b: 'peso1', r: 1 } }, wallets: { u1: { c: 100, sp: 0 } } };
ok('partida con peso1 cobrada como billete de 20 (p inflado)', db(startedFake, T0 + 60000).update('/', claimB(50, pesosFor(50, 20), { c: 100, sp: 0 })), false);
ok('cambiar la pelota anotada después de empezar a una que no tienes', db(startedFake, T0 + 60000).update('/runs/u1', { b: 'b20000' }), false);
ok('cambiar la tasa anotada después de empezar (r = 20 con peso1)', db(startedFake, T0 + 60000).update('/runs/u1', { r: 20 }), false);
// ---------- 3. no se puede cobrar dos veces ----------
console.log('Repeticiones');
const doneDb = db(started, T0 + 60000).update('/', claim(60));
const afterClaim = { runs: { u1: { s: T0, b: 'peso1', r: 1, e: T0 + 60000, h: 60, p: 60 } }, wallets: { u1: { c: 60, sp: 0, lr: T0 } }, scores: {} };
ok('terminar otra vez la misma partida (PATCH)', db(afterClaim, T0 + 120000).update('/', { 'runs/u1/e': SV, 'runs/u1/h': 500, 'runs/u1/p': pesosFor(500) }), false);
ok('terminar otra vez (PUT completo con la misma s)', db(afterClaim, T0 + 120000).write('/runs/u1', { s: T0, b: 'peso1', r: 1, e: SV, h: 200, p: pesosFor(200) }), false);
ok('cobrar otra vez la misma partida', db(afterClaim, T0 + 120000).update('/wallets/u1', { c: 120, lr: T0 }), false);
ok('retroceder lr', db(afterClaim, T0 + 120000).update('/wallets/u1', { c: 120, lr: T0 - 1000 }), false);
ok('borrar la partida y reescribirla terminada', db(afterClaim, T0 + 120000).write('/runs/u1', { s: T0 + 120000, b: 'b20000', r: 20, e: T0 + 120000, h: 500, p: 30100 }), false);
// nueva partida
const run2 = db(afterClaim, T0 + 200000).write('/runs/u1', START); ok('empezar la partida 2', run2, true);
const started2 = { runs: { u1: { s: T0 + 200000, b: 'peso1', r: 1 } }, wallets: { u1: { c: 60, sp: 0, lr: T0 } } };
ok('cobrar la partida 2 (40 rebotes en 40 s)', db(started2, T0 + 240000).update('/', { 'runs/u1/e': SV, 'runs/u1/h': 40, 'runs/u1/p': 40, 'wallets/u1/c': 100, 'wallets/u1/sp': 0, 'wallets/u1/lr': T0 + 200000 }), true);
ok('cobrar la partida 2 sin avanzar lr', db(started2, T0 + 240000).update('/', { 'runs/u1/e': SV, 'runs/u1/h': 40, 'runs/u1/p': 40, 'wallets/u1/c': 100, 'wallets/u1/sp': 0 }), false);
ok('cobrar la partida 2 con lr de la partida 1', db(started2, T0 + 240000).update('/', { 'runs/u1/e': SV, 'runs/u1/h': 40, 'runs/u1/p': 40, 'wallets/u1/c': 100, 'wallets/u1/sp': 0, 'wallets/u1/lr': T0 }), false);
// reintento tras perder conexión: la partida 2 se termina más tarde que cuando se jugó
ok('reintento 10 min después (más tiempo → válido)', db(started2, T0 + 800000).update('/', { 'runs/u1/e': SV, 'runs/u1/h': 40, 'runs/u1/p': 40, 'wallets/u1/c': 100, 'wallets/u1/sp': 0, 'wallets/u1/lr': T0 + 200000 }), true);
// pasos separados (terminar y luego cobrar) también funcionan
const endOnly = db(started2, T0 + 240000).update('/', { 'runs/u1/e': SV, 'runs/u1/h': 40, 'runs/u1/p': 40 }); ok('terminar sin cobrar aún', endOnly, true);
const ended2 = { runs: { u1: { s: T0 + 200000, e: T0 + 240000, h: 40, p: 40 } }, wallets: { u1: { c: 60, sp: 0, lr: T0 } } };
ok('cobrarla después', db(ended2, T0 + 250000).update('/wallets/u1', { c: 100, lr: T0 + 200000 }), true);
ok('cobrarla de más después', db(ended2, T0 + 250000).update('/wallets/u1', { c: 160, lr: T0 + 200000 }), false);
ok('cobrarla dos veces con otro c', db({ ...ended2, wallets: { u1: { c: 100, sp: 0, lr: T0 + 200000 } } }, T0 + 250000).update('/wallets/u1', { c: 140, lr: T0 + 200000 }), false);

// ---------- 4. marcadores ----------
console.log('Marcadores');
const sc = (s, over = {}) => Object.assign({ n: 'Matías', k: 'matias', s, t: SV }, over);
ok('guardar récord = rebotes de la partida', db(afterClaim, T0 + 130000).write('/scores/u1', sc(60)), true);
ok('récord mayor que la partida', db(afterClaim, T0 + 130000).write('/scores/u1', sc(61)), false);
ok('récord sin partida terminada', db({}, T0).write('/scores/u1', sc(5)), false);
ok('récord con partida solo iniciada', db(started, T0 + 130000).write('/scores/u1', sc(1)), false);
ok('escribir solo s enorme', db(afterClaim, T0).write('/scores/u1/s', 99999), false);
ok('escribir solo s dentro del límite', db({ ...afterClaim, scores: { u1: { n: 'M', k: 'matias', s: 10, t: 5 } } }, T0).write('/scores/u1/s', 60), true);
ok('bajar el récord', db({ ...afterClaim, scores: { u1: { n: 'M', k: 'matias', s: 60, t: 5 } } }, T0).write('/scores/u1', sc(30)), false);
ok('nombre de otra cuenta (k)', db(afterClaim, T0 + 130000).write('/scores/u1', sc(60, { k: 'otro' })), false);
ok('campo extra', db(afterClaim, T0 + 130000).write('/scores/u1', sc(60, { x: 1 })), false);
ok('escribir el puntaje de otra cuenta', db(afterClaim, T0 + 130000, 'u2').write('/scores/u1', sc(60)), false);
ok('récord y cobro en una sola escritura atómica', db(started, T0 + 60000).update('/', Object.assign(claim(60), { 'scores/u1': sc(60) })), true);
ok('… con récord inflado', db(started, T0 + 60000).update('/', Object.assign(claim(60), { 'scores/u1': sc(61) })), false);

// ---------- 5. tienda ----------
console.log('Tienda');
const CH = cx.window.TIENDA.ch, BG = cx.window.TIENDA.bg, PR = (lista, id) => lista.find(x => x.id === id).price;       // precios del catálogo (tienda.js)
const pTia = PR(CH, 'tia'), pConejo = PR(CH, 'conejo'), pConejita = PR(CH, 'conejita'), pTios = PR(CH, 'tios'), pSimi = PR(CH, 'bigotes'), pGal = PR(CH, 'galactico');
ok('los personajes cuestan 10 veces lo de antes (Tía Patita $1.500, Conejo y Conejita $3.000, Simi y Tíos $6.000, Galáctico $50.000) y el secreto sigue en $100.000.000', { allowed: pTia === 1500 && pConejo === 3000 && pConejita === 3000 && pSimi === 6000 && pTios === 6000 && pGal === 50000 && PR(CH, 'millonario') === 100000000 }, true);
const rich = { wallets: { u1: { c: 100000, sp: 0, lr: T0 } } }, pobre = { wallets: { u1: { c: 1000, sp: 0, lr: T0 } } };
ok('comprar Tía Patita ($1.500) pagando 1.500', db(rich, T0).update('/wallets/u1', { sp: pTia, 'own/ch_tia': true }), true);
ok('comprar Tía Patita pagando 1.499', db(rich, T0).update('/wallets/u1', { sp: pTia - 1, 'own/ch_tia': true }), false);
ok('… con el precio de antes ($150)', db(rich, T0).update('/wallets/u1', { sp: 150, 'own/ch_tia': true }), false);
ok('comprar Tío Pato Conejo ($3.000) pagando 2.999', db(rich, T0).update('/wallets/u1', { sp: pConejo - 1, 'own/ch_conejo': true }), false);
ok('comprar Tío Pato Conejo ($3.000) pagando 3.000', db(rich, T0).update('/wallets/u1', { sp: pConejo, 'own/ch_conejo': true }), true);
ok('comprar Tía Patita Conejita ($3.000) pagando 3.000', db(rich, T0).update('/wallets/u1', { sp: pConejita, 'own/ch_conejita': true }), true);
ok('… pagando 300 (precio de antes)', db(rich, T0).update('/wallets/u1', { sp: 300, 'own/ch_conejita': true }), false);
ok('comprar Tíos Patitos ($6.000) pagando 6.000', db(rich, T0).update('/wallets/u1', { sp: pTios, 'own/ch_tios': true }), true);
ok('comprar Tío Pato Simi ($6.000) pagando 5.999', db(rich, T0).update('/wallets/u1', { sp: pSimi - 1, 'own/ch_bigotes': true }), false);
ok('comprar Tío Pato Simi pagando 6.000', db(rich, T0).update('/wallets/u1', { sp: pSimi, 'own/ch_bigotes': true }), true);
ok('comprar la moneda de $5 pagando 5', db(rich, T0).update('/wallets/u1', { sp: 5, 'own/ball_peso5': true }), true);
ok('comprar la moneda de $5 pagando 4', db(rich, T0).update('/wallets/u1', { sp: 4, 'own/ball_peso5': true }), false);
ok('comprar sin pagar', db(rich, T0).update('/wallets/u1', { 'own/ch_tia': true }), false);
ok('comprar pagando de más', db(rich, T0).update('/wallets/u1', { sp: 9000, 'own/ch_tia': true }), true);
ok('gastar más de lo ganado', db(rich, T0).update('/wallets/u1', { sp: 150000, 'own/ch_tia': true }), false);
ok('la Tía Patita sin saldo (c = 1.000)', db(pobre, T0).update('/wallets/u1', { sp: pTia, 'own/ch_tia': true }), false);
ok('billete de 20.000 sin saldo', db(pobre, T0).update('/wallets/u1', { sp: 20000, 'own/ball_b20000': true }), false);
ok('artículo inexistente', db(rich, T0).update('/wallets/u1', { sp: 10, 'own/ball_regalo': true }), false);
ok('own = false', db(rich, T0).update('/wallets/u1', { 'own/ch_tia': false }), false);
ok('gastar bajando sp', db({ wallets: { u1: { c: 1000, sp: 400, lr: T0 } } }, T0).update('/wallets/u1', { sp: 100 }), false);
const bought = { wallets: { u1: { c: 1000, sp: 500, lr: T0, own: { ch_tia: true }, eq: { ch: 'tio' } } } };
ok('equipar lo comprado', db(bought, T0).update('/wallets/u1', { eq: { ch: 'tia' } }), true);
ok('equipar lo no comprado', db(bought, T0).update('/wallets/u1', { eq: { bg: 'galaxia' } }), false);
ok('equipar la pelota inicial', db(bought, T0).update('/wallets/u1', { eq: { ball: 'peso1' } }), true);
ok('equipar la barra clásica', db(bought, T0).update('/wallets/u1', { eq: { pad: 'clasica' } }), true);
ok('comprar por otra cuenta', db(rich, T0, 'u2').update('/wallets/u1', { sp: 500, 'own/ch_tia': true }), false);
ok('leer la cartera de otra cuenta', db(rich, T0, 'u2').read('/wallets/u1'), false);
ok('leer la propia', db(rich, T0).read('/wallets/u1'), true);
ok('leer marcadores sin sesión', targaryen.database(rules, {}).as(null).with({ now: T0 }).read('/scores'), true);
ok('escribir sin sesión', targaryen.database(rules, {}).as(null).with({ now: T0 }).write('/runs/u1', { s: SV }), false);

console.log('Lingotes, diamante y personaje secreto');
const gem = { wallets: { u1: { c: 900000000, sp: 1550000, own: { ball_plata: true, ball_oro: true, ball_diamante: true } } } };
const startG = (b, r) => ({ runs: { u1: { s: T0, b, r } }, wallets: gem.wallets });
const claimG = (h, p, c0 = 900000000, sp = 1550000) => ({ 'runs/u1/e': SV, 'runs/u1/h': h, 'runs/u1/p': p, 'wallets/u1/c': c0 + p, 'wallets/u1/sp': sp, 'wallets/u1/lr': T0 });
ok('inicio con el diamante (5.000 por punto)', db(gem, T0).write('/runs/u1', { s: SV, b: 'diamante', r: 5000 }), true);
ok('inicio con el lingote de oro (500)', db(gem, T0).write('/runs/u1', { s: SV, b: 'oro', r: 500 }), true);
ok('inicio con el lingote de plata (100)', db(gem, T0).write('/runs/u1', { s: SV, b: 'plata', r: 100 }), true);
ok('diamante con tasa de oro (500)', db(gem, T0).write('/runs/u1', { s: SV, b: 'diamante', r: 500 }), false);
ok('plata con tasa de diamante', db(gem, T0).write('/runs/u1', { s: SV, b: 'plata', r: 5000 }), false);
ok('diamante con la tasa vieja (500)', db(gem, T0).write('/runs/u1', { s: SV, b: 'diamante', r: 500 }), false);
ok('oro con la tasa vieja (200)', db(gem, T0).write('/runs/u1', { s: SV, b: 'oro', r: 200 }), false);
ok('diamante sin tenerlo', db({ wallets: { u1: { c: 10, sp: 0 } } }, T0).write('/runs/u1', { s: SV, b: 'diamante', r: 5000 }), false);
ok('100 rebotes con el diamante: 5.000 × 101', db(startG('diamante', 5000), T0 + 60000).update('/', claimG(100, pesosFor(100, 5000))), true);
ok('… cobrando 10.000 por punto', db(startG('diamante', 5000), T0 + 60000).update('/', claimG(100, pesosFor(100, 10000))), false);
ok('500 rebotes con el diamante (7.525.000)', db(startG('diamante', 5000), T0 + 240000).update('/', claimG(500, pesosFor(500, 5000))), true);
ok('120 rebotes con el lingote de oro: 500 × 141', db(startG('oro', 500), T0 + 130000).update('/', claimG(120, pesosFor(120, 500))), true);
ok('120 rebotes con el lingote de plata: 100 × 141', db(startG('plata', 100), T0 + 130000).update('/', claimG(120, pesosFor(120, 100))), true);
ok('tope de pesos: c = 1.000.000.000.000 permitido', db({ runs: { u1: { s: T0, b: 'peso1', r: 1 } }, wallets: { u1: { c: 999999999999, sp: 0 } } }, T0 + 60000).update('/', claimG(1, 1, 999999999999, 0)), true);
ok('… un peso más: rechazado', db({ runs: { u1: { s: T0, b: 'peso1', r: 1 } }, wallets: { u1: { c: 1000000000000, sp: 0 } } }, T0 + 60000).update('/', claimG(1, 1, 1000000000000, 0)), false);
const rica = { wallets: { u1: { c: 300000000, sp: 0, lr: T0 } } };
ok('comprar el lingote de plata ($50.000) pagando 50.000', db(rica, T0).update('/wallets/u1', { sp: 50000, 'own/ball_plata': true }), true);
ok('… pagando 49.999', db(rica, T0).update('/wallets/u1', { sp: 49999, 'own/ball_plata': true }), false);
ok('comprar el lingote de oro ($500.000) pagando 500.000', db(rica, T0).update('/wallets/u1', { sp: 500000, 'own/ball_oro': true }), true);
ok('comprar el diamante ($1.000.000) pagando 999.999', db(rica, T0).update('/wallets/u1', { sp: 999999, 'own/ball_diamante': true }), false);
ok('comprar el diamante pagando 1.000.000', db(rica, T0).update('/wallets/u1', { sp: 1000000, 'own/ball_diamante': true }), true);
ok('comprar el Tío Pato Millonario ($100.000.000) pagando 99.999.999', db(rica, T0).update('/wallets/u1', { sp: 99999999, 'own/ch_millonario': true }), false);
ok('… pagando 100.000.000', db(rica, T0).update('/wallets/u1', { sp: 100000000, 'own/ch_millonario': true }), true);
ok('… sin saldo (c = 50.000.000)', db({ wallets: { u1: { c: 50000000, sp: 0 } } }, T0).update('/wallets/u1', { sp: 100000000, 'own/ch_millonario': true }), false);
ok('equipar el personaje secreto ya comprado', db({ wallets: { u1: { c: 300000000, sp: 100000000, own: { ch_millonario: true } } } }, T0).update('/wallets/u1', { eq: { ch: 'millonario' } }), true);
ok('equipar el personaje secreto sin comprarlo', db(rica, T0).update('/wallets/u1', { eq: { ch: 'millonario' } }), false);

// --- personajes nuevos: Ángel ($1.000), Galáctico ($5.000) y Dorado secreto ($50.000.000) ---
ok('comprar el Tío Pato Galáctico ($50.000) pagando 50.000', db(rica, T0).update('/wallets/u1', { sp: pGal, 'own/ch_galactico': true }), true);
ok('… pagando 49.999', db(rica, T0).update('/wallets/u1', { sp: pGal - 1, 'own/ch_galactico': true }), false);
ok('… con el precio de antes ($5.000)', db(rica, T0).update('/wallets/u1', { sp: 5000, 'own/ch_galactico': true }), false);
ok('equipar el Galáctico ya comprado', db({ wallets: { u1: { c: 300000000, sp: 5000, own: { ch_galactico: true } } } }, T0).update('/wallets/u1', { eq: { ch: 'galactico' } }), true);

console.log('Fondos y barras (precios +100) y artículos para millonarios');
const precios = Object.assign(Object.fromEntries(BG.filter(b => b.price > 0).map(b => ['bg_' + b.id, b.price])), {          // fondos: del catálogo (×10); barras: las de siempre
  pad_dorada: 220, pad_fuego: 280, pad_cristal: 300, pad_neon: 350, pad_galaxia: 400, pad_arcoiris: 450, pad_holo: 500,
  pad_midas: 3000000, pad_diamante: 6000000, pad_plasma: 12000000 });
ok('los fondos cuestan 10 veces lo de antes: Atardecer $2.000, Cristal $2.200, Aurora $3.000, Galaxia $4.000, Holográfico $4.500, Synthwave $5.500, Bóveda $20.000.000, Palacio $50.000.000, Agujero negro $100.000.000', { allowed: precios.bg_atardecer === 2000 && precios.bg_cristal === 2200 && precios.bg_aurora === 3000 && precios.bg_galaxia === 4000 && precios.bg_holo === 4500 && precios.bg_synth === 5500 && precios.bg_boveda === 20000000 && precios.bg_prisma === 50000000 && precios.bg_agujero === 100000000 }, true);
ok('las barras y las pelotas no cambian de precio (Llamarada $280, Rey Midas $3.000.000, moneda $5, diamante $1.000.000)', { allowed: precios.pad_fuego === 280 && precios.pad_midas === 3000000 && PR(cx.window.TIENDA.ball, 'peso5') === 5 && PR(cx.window.TIENDA.ball, 'diamante') === 1000000 }, true);
const rico = { wallets: { u1: { c: 5000000000, sp: 0, lr: T0 } } };
for (const [k, pr] of Object.entries(precios)) {
  ok(`comprar ${k} ($${pr}) pagando ${pr}`, db(rico, T0).update('/wallets/u1', { sp: pr, ['own/' + k]: true }), true);
  ok(`… pagando ${pr - 1}`, db(rico, T0).update('/wallets/u1', { sp: pr - 1, ['own/' + k]: true }), false);
}
ok('fondo de oro sin saldo suficiente (c = 10.000.000)', db({ wallets: { u1: { c: 10000000, sp: 0 } } }, T0).update('/wallets/u1', { sp: precios.bg_boveda, 'own/bg_boveda': true }), false);
ok('la bóveda de oro con el precio de antes ($2.000.000)', db(rico, T0).update('/wallets/u1', { sp: 2000000, 'own/bg_boveda': true }), false);
ok('barra eléctrica con el precio de una barra común', db(rico, T0).update('/wallets/u1', { sp: 500, 'own/pad_plasma': true }), false);
ok('el precio antiguo de la llamarada ($180)', db(rico, T0).update('/wallets/u1', { sp: 180, 'own/pad_fuego': true }), false);
const vip = { wallets: { u1: { c: 90000000, sp: 11000000, lr: T0, own: { bg_boveda: true, pad_midas: true } } } };
ok('equipar el fondo de oro ya comprado', db(vip, T0).update('/wallets/u1', { eq: { bg: 'boveda' } }), true);
ok('equipar la barra Rey Midas ya comprada', db(vip, T0).update('/wallets/u1', { eq: { pad: 'midas' } }), true);
ok('equipar el agujero negro sin comprarlo', db(vip, T0).update('/wallets/u1', { eq: { bg: 'agujero' } }), false);
ok('equipar la tormenta eléctrica sin comprarla', db(vip, T0).update('/wallets/u1', { eq: { pad: 'plasma' } }), false);

// ---------- edición limitada: Tío Pato Teletón ($1.000, solo hasta `until`; quien la compró la conserva) ----------
console.log('Edición limitada (Tío Pato Teletón)');
{
  const CHT = cx.window.TIENDA.ch, TEL = CHT.find(c => c.id === 'teleton'), U = TEL.until;
  // targaryen usa la hora real: para que la prueba no dependa de la fecha de hoy se cambia la fecha límite del archivo por una abierta (mañana) o una cerrada (hace 1 s)
  const conLimite = h => JSON.parse(JSON.stringify(rules).split(`now < ${U}`).join(`now < ${h}`));
  const abierta = conLimite(Date.now() + 86400000), cerrada = conLimite(Date.now() - 1000);
  const dbR = (r, data, uid = 'u1') => ({ update: (path, o) => targaryen.database(r, shiftObj(data || {}, 0)).as(A(uid)).update(path, o) });
  const cart = (extra = {}) => ({ wallets: { u1: { c: 50000, sp: 0, lr: T0, ...extra } } });
  ok('el catálogo la tiene en segundo lugar, a $1.000, con fecha límite y sin ser secreta ni de millonarios', { allowed: CHT[1].id === 'teleton' && TEL.price === 1000 && typeof U === 'number' && !TEL.secret && !TEL.vip && CHT[0].id === 'tio' }, true);
  ok('la fecha límite es el 14 de noviembre de 2026 a las 23:59:59 hora de Chile (UTC-3)', { allowed: U === Date.UTC(2026, 10, 15, 3, 0, 0) }, true);
  ok('las reglas llevan esa fecha y solo para la Teletón (el resto de los artículos no tiene límite)', { allowed: new RegExp(`\\$item === 'ch_teleton' \\? now < ${U} : true`).test(JSON.stringify(rules)) && (JSON.stringify(rules).match(/now < 1\d{12}/g) || []).length >= 1 }, true);
  console.log(' Abierta (antes de la fecha límite)');
  ok('comprarla pagando $1.000', dbR(abierta, cart()).update('/wallets/u1', { sp: 1000, 'own/ch_teleton': true }), true);
  ok('… pagando $999', dbR(abierta, cart()).update('/wallets/u1', { sp: 999, 'own/ch_teleton': true }), false);
  ok('… sin pagar', dbR(abierta, cart()).update('/wallets/u1', { 'own/ch_teleton': true }), false);
  ok('… sin saldo (c = $500)', dbR(abierta, { wallets: { u1: { c: 500, sp: 0, lr: T0 } } }).update('/wallets/u1', { sp: 1000, 'own/ch_teleton': true }), false);
  ok('comprarla junto con la Tía Patita pagando $2.500 (1.000 + 1.500)', dbR(abierta, cart()).update('/wallets/u1', { sp: 2500, 'own/ch_teleton': true, 'own/ch_tia': true }), true);
  ok('… pagando solo $1.500 (la más cara) y llevándose las dos', dbR(abierta, cart()).update('/wallets/u1', { sp: 1500, 'own/ch_teleton': true, 'own/ch_tia': true }), false);
  console.log(' Cerrada (pasada la fecha límite)');
  ok('comprarla pagando $1.000 ya no se puede', dbR(cerrada, cart()).update('/wallets/u1', { sp: 1000, 'own/ch_teleton': true }), false);
  ok('… ni pagando de más', dbR(cerrada, cart()).update('/wallets/u1', { sp: 5000, 'own/ch_teleton': true }), false);
  ok('… ni llevándosela junto con otro artículo (se rechaza todo el envío)', dbR(cerrada, cart()).update('/wallets/u1', { sp: 2500, 'own/ch_teleton': true, 'own/ch_tia': true }), false);
  ok('los demás personajes se siguen comprando igual (Tía Patita $1.500)', dbR(cerrada, cart()).update('/wallets/u1', { sp: 1500, 'own/ch_tia': true }), true);
  const duena = { wallets: { u1: { c: 50000, sp: 1000, lr: T0, own: { ch_teleton: true }, eq: { ch: 'tio' } } } };
  ok('quien la compró la conserva: la puede equipar aunque ya haya terminado', dbR(cerrada, duena).update('/wallets/u1', { 'eq/ch': 'teleton' }), true);
  ok('… y seguir comprando otras cosas con ella en la cartera', dbR(cerrada, duena).update('/wallets/u1', { sp: 2500, 'own/ch_tia': true }), true);
  ok('quien no la compró no puede equiparla', dbR(cerrada, cart()).update('/wallets/u1', { 'eq/ch': 'teleton' }), false);
  ok('nadie puede quitarle la skin a quien la compró (own = false)', dbR(cerrada, duena).update('/wallets/u1', { 'own/ch_teleton': false }), false);
  ok('el dueño puede equiparla también con la oferta abierta', dbR(abierta, duena).update('/wallets/u1', { 'eq/ch': 'teleton' }), true);
}

// ---------- colores del juego (th): se compran con su precio, el azul de siempre es gratis y solo se equipa lo que se tiene ----------
console.log('Colores del juego (th)');
{
  const TH = cx.window.TIENDA.th, precioTh = Object.fromEntries(TH.filter(t => t.price > 0).map(t => ['th_' + t.id, t.price]));
  const rico2 = { wallets: { u1: { c: 5000000000, sp: 0, lr: T0 } } };
  ok('los colores cuestan 10 veces lo de antes: Amarillo $1.000, Verde y Rosa $2.000, Violeta $3.000, Rojo $3.500, Noche $4.000, Negro y oro $10.000.000, Hielo diamante $25.000.000', { allowed: precioTh.th_clasico === 1000 && precioTh.th_bosque === 2000 && precioTh.th_rosa === 2000 && precioTh.th_violeta === 3000 && precioTh.th_fuego === 3500 && precioTh.th_noche === 4000 && precioTh.th_oro === 10000000 && precioTh.th_diamante === 25000000 }, true);
  ok('el catálogo tiene el azul gratis primero y 8 colores de pago (2 para millonarios)', { allowed: TH[0].price === 0 && TH.length === 9 && TH.filter(t => t.vip).length === 2 }, true);
  for (const [k, pr] of Object.entries(precioTh)) {
    ok(`comprar ${k} ($${pr}) pagando ${pr}`, db(rico2, T0).update('/wallets/u1', { sp: pr, ['own/' + k]: true }), true);
    ok(`… pagando ${pr - 1}`, db(rico2, T0).update('/wallets/u1', { sp: pr - 1, ['own/' + k]: true }), false);
  }
  ok('comprar el azul gratis (no se vende: ya es tuyo)', db(rico2, T0).update('/wallets/u1', { sp: 0, ['own/th_' + TH[0].id]: true }), false);
  ok('comprar un color que no existe', db(rico2, T0).update('/wallets/u1', { sp: 100, 'own/th_verde_limon': true }), false);
  ok('«Negro y oro» sin saldo suficiente (c = 5.000.000)', db({ wallets: { u1: { c: 5000000, sp: 0 } } }, T0).update('/wallets/u1', { sp: precioTh.th_oro, 'own/th_oro': true }), false);
  ok('«Negro y oro» con el precio de antes ($1.000.000)', db(rico2, T0).update('/wallets/u1', { sp: 1000000, 'own/th_oro': true }), false);
  ok('«Hielo diamante» con el precio de «Negro y oro»', db(rico2, T0).update('/wallets/u1', { sp: precioTh.th_oro, 'own/th_diamante': true }), false);
  ok('comprar un color como si fuera un fondo (bg_violeta)', db(rico2, T0).update('/wallets/u1', { sp: 300, 'own/bg_violeta': true }), false);
  const conViolet = { wallets: { u1: { c: 90000000, sp: 300, lr: T0, own: { th_violeta: true } } } };
  ok('equipar el violeta ya comprado', db(conViolet, T0).update('/wallets/u1', { eq: { th: 'violeta' } }), true);
  ok('equipar solo el color (eq/th) sin tocar lo demás', db(conViolet, T0).update('/wallets/u1', { 'eq/th': 'violeta' }), true);
  ok('equipar el rosa sin comprarlo', db(conViolet, T0).update('/wallets/u1', { eq: { th: 'rosa' } }), false);
  ok('volver al azul de siempre sin tener nada comprado', db(rico2, T0).update('/wallets/u1', { eq: { th: TH[0].id } }), true);
  ok('equipar un color que no existe', db(conViolet, T0).update('/wallets/u1', { eq: { th: 'verde_limon' } }), false);
  ok('equipar el violeta en la categoría de fondos', db(conViolet, T0).update('/wallets/u1', { eq: { bg: 'violeta' } }), false);
  ok('equipar el color de otra cuenta (u2)', db(conViolet, T0, 'u2').update('/wallets/u1', { eq: { th: 'violeta' } }), false);
  ok('equipar todo junto (personaje, fondo, barra, pelota y color) con lo que ya es tuyo', db(conViolet, T0).update('/wallets/u1', { eq: { ch: 'tio', bg: 'clasico', pad: 'clasica', ball: 'peso1', th: 'violeta' } }), true);
}

console.log('Contador de puestos (hist) y marcador con filas por campo');
const row = (s, c) => Object.assign({ n: 'Matías', k: 'matias', s, t: 5 }, c === undefined ? {} : { c });
const H = (scores, hist = {}) => ({ scores, hist });
ok('contar por primera vez: c=50 y hist/50: 0 → 1', db(H({ u1: row(50) }), T0).update('/', { 'scores/u1/c': 50, 'hist/50': 1 }), true);
ok('… sumando a una casilla que ya tiene 7 (→ 8)', db(H({ u1: row(50) }, { 50: 7 }), T0).update('/', { 'scores/u1/c': 50, 'hist/50': 8 }), true);
ok('… sumando 2 de golpe (7 → 9)', db(H({ u1: row(50) }, { 50: 7 }), T0).update('/', { 'scores/u1/c': 50, 'hist/50': 9 }), false);
ok('… sin marcar c', db(H({ u1: row(50) }, { 50: 7 }), T0).update('/', { 'hist/50': 8 }), false);
ok('… en una casilla que no es la de c (hist/51)', db(H({ u1: row(50) }), T0).update('/', { 'scores/u1/c': 50, 'hist/51': 1 }), false);
ok('… con c menor que tu puntaje (49)', db(H({ u1: row(50) }), T0).update('/', { 'scores/u1/c': 49, 'hist/49': 1 }), false);
ok('… con c mayor que tu puntaje (60)', db(H({ u1: row(50) }), T0).update('/', { 'scores/u1/c': 60, 'hist/60': 1 }), false);
ok('… contar dos veces (c ya es 50)', db(H({ u1: row(50, 50) }, { 50: 1 }), T0).update('/', { 'scores/u1/c': 50, 'hist/50': 2 }), false);
ok('mejorar de 50 a 80: c=80, hist/80 +1 y hist/50 −1', db(H({ u1: row(80, 50) }, { 50: 3 }), T0).update('/', { 'scores/u1/c': 80, 'hist/80': 1, 'hist/50': 2 }), true);
ok('… bajando la casilla equivocada (hist/60)', db(H({ u1: row(80, 50) }, { 60: 3 }), T0).update('/', { 'scores/u1/c': 80, 'hist/80': 1, 'hist/60': 2 }), false);
ok('… bajar sin mover c', db(H({ u1: row(80, 50) }, { 50: 3 }), T0).update('/', { 'hist/50': 2 }), false);
ok('… bajar de 3 a 1', db(H({ u1: row(80, 50) }, { 50: 3 }), T0).update('/', { 'scores/u1/c': 80, 'hist/80': 1, 'hist/50': 1 }), false);
ok('… bajar una casilla en cero', db(H({ u1: row(80, 50) }, { 50: 0 }), T0).update('/', { 'scores/u1/c': 80, 'hist/80': 1, 'hist/50': -1 }), false);
ok('bajar la casilla de una cuenta que no está contada', db(H({ u1: row(80) }, { 50: 3 }), T0).update('/', { 'scores/u1/c': 80, 'hist/80': 1, 'hist/50': 2 }), false);
ok('c no puede bajar (80 → 70)', db(H({ u1: row(80, 80) }, { 80: 1 }), T0).update('/', { 'scores/u1/c': 70 }), false);
ok('c fuera de rango (501)', db(H({ u1: row(501) }), T0).update('/', { 'scores/u1/c': 501, 'hist/501': 1 }), false);
ok('casilla con nombre inválido', db(H({ u1: row(50) }), T0).update('/', { 'scores/u1/c': 50, 'hist/abc': 1 }), false);
ok('escribir en hist sin ser tú (otra cuenta sube la casilla 50)', db(H({ u1: row(50) }), T0, 'u2').update('/', { 'hist/50': 1 }), false);
ok('escribir hist directo (sin tocar scores)', db(H({ u1: row(50, 50) }, { 50: 1 }), T0).write('/hist/99', 1), false);
ok('borrar el contador', db(H({ u1: row(50, 50) }, { 50: 5 }), T0).write('/hist/50', null), false);
ok('leer hist sin sesión', targaryen.database(rules, { hist: { 50: 3 } }).as(null).with({ now: T0 }).read('/hist'), true);
// el cobro de una partida escribe el marcador por campos, y así no borra `c`
const cl = db({ ...started, scores: { u1: row(50, 50) }, hist: { 50: 1 } }, T0 + 60000).update('/', { ...claim(60), 'scores/u1/n': 'Matías', 'scores/u1/k': 'matias', 'scores/u1/s': 60, 'scores/u1/t': SV });
ok('cobro que sube el récord por campos (50 → 60) conservando c', cl, true);
ok('… y c sigue en 50', { allowed: cl.allowed && cl.newDatabase.root.$value().scores.u1.c === 50 }, true);
// jugadores seguidos: tres cuentas se cuentan y mejoran; el contador siempre cuadra
{
  const as = (uid, data, o) => db(data, T0, uid).update('/', o);
  let d = { scores: { u1: row(50), u2: row(50), u3: row(80) }, hist: {} };
  for (const [uid, c] of [['u1', 50], ['u2', 50], ['u3', 80]]) {
    const cur = (d.hist || {})[c] || 0; const res = as(uid, d, { [`scores/${uid}/c`]: c, [`hist/${c}`]: cur + 1 });
    ok(`contar a ${uid} (puntaje ${c})`, res, true); d = res.newDatabase.root.$value();
  }
  ok('contador tras contar a los tres: {50: 2, 80: 1}', { allowed: d.hist[50] === 2 && d.hist[80] === 1 }, true);
  d.scores.u1.s = 90;                                                                                  // u1 mejora a 90
  const res = as('u1', d, { 'scores/u1/c': 90, 'hist/90': 1, 'hist/50': d.hist[50] - 1 });
  ok('u1 mejora de 50 a 90 y se mueve de casilla', res, true); d = res.newDatabase.root.$value();
  const above = (m) => Object.entries(d.hist).filter(([k]) => +k > m).reduce((a, [, v]) => a + v, 0);
  ok('puestos: u1 (90) es el 1º, u3 (80) el 2º, u2 (50) el 3º', { allowed: above(90) + 1 === 1 && above(80) + 1 === 2 && above(50) + 1 === 3 }, true);
}


// ---------- 7. racha diaria ----------
console.log('Racha diaria');
{
  const RA = ECO.racha, DAYMS = 86400000, OFFMS = RA.huso * 3600000;
  const D0 = Date.UTC(2026, 9, 29, 15, 0, 0);                      // 12:00 en Chile (huso -3)
  const as = (uid, data, o, now) => db(data, now, uid).update('/', o);
  const wal = (c = 0) => ({ c, sp: 0 });
  const reward = n => n >= RA.fijoDesde ? RA.fijo : RA.dias[n - 1];
  const claimS = (n, c0, over = {}) => Object.assign({ 'streaks/u1/n': n, 'streaks/u1/t': SV, 'wallets/u1/c': c0 + reward(n) }, over);
  const strk = (n, tMs) => ({ n, t: tMs });
  const day = ms => Math.floor((ms + OFFMS) / DAYMS);
  ok('el día cambia a medianoche del huso de Chile (el 29 a las 12:00 y el 30 a las 12:00 son días seguidos)', { allowed: day(D0 + DAYMS) === day(D0) + 1 }, true);

  ok('día 1: primera vez, +$' + reward(1), as('u1', { wallets: { u1: wal() } }, claimS(1, 0), D0), true);
  ok('día 1 pero la racha empieza en 2', as('u1', { wallets: { u1: wal() } }, claimS(2, 0), D0), false);
  ok('día 1 con más pesos de los que da (+$150)', as('u1', { wallets: { u1: wal() } }, claimS(1, 0, { 'wallets/u1/c': 150 }), D0), false);
  ok('día 1 con la hora inventada', as('u1', { wallets: { u1: wal() } }, claimS(1, 0, { 'streaks/u1/t': D0 - 99999999 }), D0), false);
  ok('sin tocar los pesos (solo la racha) sí vale', as('u1', { wallets: { u1: wal(500) } }, { 'streaks/u1/n': 1, 'streaks/u1/t': SV }, D0), true);

  // «ya cobró hoy»: targaryen usa el reloj real, así que el día se corta según la hora real; se retrocede lo que haya pasado desde la medianoche de Chile (hasta 3 horas) para seguir en el mismo día a cualquier hora
  const HACE = Math.max(1000, Math.min(3 * 3600000, (Date.now() + OFFMS) % DAYMS - 1000));
  const hoy = { wallets: { u1: wal(100) }, streaks: { u1: strk(1, D0 - HACE) } };                      // ya cobró hoy, un rato antes
  ok('cobrar dos veces el mismo día (n=2)', as('u1', hoy, claimS(2, 100), D0), false);
  ok('cobrar dos veces el mismo día repitiendo el día 1', as('u1', hoy, claimS(1, 100), D0), false);
  ok('mismo día: solo cambiar la hora (t) y subir pesos', as('u1', hoy, { 'streaks/u1/t': SV, 'wallets/u1/c': 200 }, D0), false);
  ok('mismo día: subir pesos sin tocar la racha', as('u1', hoy, { 'wallets/u1/c': 200 }, D0), false);

  const ayer = (n, c) => ({ wallets: { u1: wal(c) }, streaks: { u1: strk(n, D0 - DAYMS) } });
  ok('día 2 (al día siguiente): +$' + reward(2), as('u1', ayer(1, 100), claimS(2, 100), D0), true);
  ok('día 2 pero cobrando como día 3', as('u1', ayer(1, 100), claimS(3, 100), D0), false);
  ok('día 2 sin sumar el premio (c igual) y racha 2 vale (solo no cobra)', as('u1', ayer(1, 100), { 'streaks/u1/n': 2, 'streaks/u1/t': SV }, D0), true);
  ok('día 3: +$' + reward(3), as('u1', ayer(2, 300), claimS(3, 300), D0), true);
  ok('día 6: +$' + reward(6), as('u1', ayer(5, 1500), claimS(6, 1500), D0), true);
  ok('día 6 cobrando el premio del día 5', as('u1', ayer(5, 1500), claimS(6, 1500, { 'wallets/u1/c': 1500 + reward(5) }), D0), false);

  const hace2 = (n, c) => ({ wallets: { u1: wal(c) }, streaks: { u1: strk(n, D0 - 2 * DAYMS) } });
  ok('se saltó un día: la racha vuelve a 1 (+$' + reward(1) + ')', as('u1', hace2(4, 1000), claimS(1, 1000), D0), true);
  ok('se saltó un día e intenta seguir en 5', as('u1', hace2(4, 1000), claimS(5, 1000), D0), false);
  ok('se saltó un día e intenta ir a 2', as('u1', hace2(4, 1000), claimS(2, 1000), D0), false);

  console.log(' Días con multiplicador (7, 14 y 21): se guardan, no se activan solos');
  const dia = (n, over = {}, extra = {}) => Object.assign({ 'streaks/u1/n': n, 'streaks/u1/t': SV }, over, extra);
  ok('día 7: guarda un multiplicador ×2 (x2 = 1) y sin pesos', as('u1', ayer(6, 3000), dia(7, { 'streaks/u1/x2': 1 }), D0), true);
  ok('día 7 sin guardar el multiplicador (solo la racha) también vale', as('u1', ayer(6, 3000), dia(7), D0), true);
  ok('día 7 con pesos de regalo', as('u1', ayer(6, 3000), dia(7, { 'streaks/u1/x2': 1, 'wallets/u1/c': 3500 }), D0), false);
  ok('día 7 activándolo en el acto (como antes): ahora hay que tenerlo guardado', as('u1', ayer(6, 3000), dia(7, { 'streaks/u1/bx': SV, 'streaks/u1/bm': 2 }), D0), false);
  ok('día 7 guardando un ×3 en vez de ×2', as('u1', ayer(6, 3000), dia(7, { 'streaks/u1/x3': 1 }), D0), false);
  ok('día 7 guardando dos multiplicadores', as('u1', ayer(6, 3000), dia(7, { 'streaks/u1/x2': 2 }), D0), false);
  ok('día 7 con uno ya guardado: pasa a 2 guardados', as('u1', { wallets: { u1: wal(3000) }, streaks: { u1: { n: 6, t: D0 - DAYMS, x2: 1 } } }, dia(7, { 'streaks/u1/x2': 2 }), D0), true);
  ok('día 14: guarda un multiplicador ×3', as('u1', ayer(13, 3000), dia(14, { 'streaks/u1/x3': 1 }), D0), true);
  ok('día 14 guardando un ×4', as('u1', ayer(13, 3000), dia(14, { 'streaks/u1/x4': 1 }), D0), false);
  ok('día 21: guarda un multiplicador ×4', as('u1', ayer(20, 9000), dia(21, { 'streaks/u1/x4': 1 }), D0), true);
  ok('día 21 guardando un ×2', as('u1', ayer(20, 9000), dia(21, { 'streaks/u1/x2': 1 }), D0), false);
  ok('día 5: multiplicador de contrabando', as('u1', ayer(4, 1000), claimS(5, 1000, { 'streaks/u1/x2': 1 }), D0), false);
  ok('día 8: premio de $' + reward(8) + ' (la moneda de $500)', as('u1', ayer(7, 3000), claimS(8, 3000), D0), true);
  ok('día 8 cobrando el premio del día 1 ($100)', as('u1', ayer(7, 3000), claimS(8, 3000, { 'wallets/u1/c': 3100 }), D0), false);
  ok('día 9: dos monedas de $500 = $' + reward(9), as('u1', ayer(8, 3500), claimS(9, 3500), D0), true);
  for (const n of [10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27]) ok(`día ${n}: +$${reward(n)}`, as('u1', ayer(n - 1, 5000), claimS(n, 5000), D0), true);
  ok('día 16: dos billetes de $1.000 = $' + reward(16), as('u1', ayer(15, 5000), claimS(16, 5000), D0), true);
  ok('día 16 cobrando de más (+$2.001)', as('u1', ayer(15, 5000), claimS(16, 5000, { 'wallets/u1/c': 7001 }), D0), false);
  ok('día 22: ' + reward(22) + ', no el de la semana anterior', as('u1', ayer(21, 5000), claimS(22, 5000, { 'wallets/u1/c': 5000 + reward(20) }), D0), false);
  ok('día 28: $10.000', as('u1', ayer(27, 5000), claimS(28, 5000), D0), true);
  ok('día 28 con $10.001', as('u1', ayer(27, 5000), claimS(28, 5000, { 'wallets/u1/c': 15001 }), D0), false);
  ok('día 29: $10.000 otra vez', as('u1', ayer(28, 5000), claimS(29, 5000), D0), true);
  ok('día 35 (no da multiplicador): $10.000', as('u1', ayer(34, 5000), claimS(35, 5000), D0), true);
  ok('día 35 guardando un multiplicador que no existe', as('u1', ayer(34, 5000), claimS(35, 5000, { 'streaks/u1/x2': 1 }), D0), false);
  ok('día 100: $10.000', as('u1', ayer(99, 5000), claimS(100, 5000), D0), true);
  ok('día 100 con $20.000', as('u1', ayer(99, 5000), claimS(100, 5000, { 'wallets/u1/c': 25000 }), D0), false);

  console.log(' Activar un multiplicador guardado (el botón del inicio)');
  const guardado = (m, extra = {}) => ({ wallets: { u1: wal(3000) }, streaks: { u1: Object.assign({ n: 9, t: D0 - 3600000, ['x' + m]: 1 }, extra) } });
  const act = (m, over = {}) => Object.assign({ 'streaks/u1/bx': SV, 'streaks/u1/bm': m, 'streaks/u1/bd': 600000, ['streaks/u1/x' + m]: 0 }, over);
  const actY = (m, over = {}) => Object.assign({ 'streaks/u1/bx': SV, 'streaks/u1/bm': m, 'streaks/u1/bd': 300000, ['streaks/u1/y' + m]: 0 }, over);          // activar uno de la ruleta (dura 5 min)
  const guardadoY = (m, extra = {}) => ({ wallets: { u1: wal(3000) }, streaks: { u1: Object.assign({ n: 9, t: D0 - 3600000, ['y' + m]: 1 }, extra) } });
  ok('activar el ×2 guardado', as('u1', guardado(2), act(2), D0), true);
  ok('activar el ×3 guardado', as('u1', guardado(3), act(3), D0), true);
  ok('activar el ×4 guardado', as('u1', guardado(4), act(4), D0), true);
  ok('activar uno de dos guardados (quedan 1)', as('u1', guardado(2, { x2: 2 }), act(2, { 'streaks/u1/x2': 1 }), D0), true);
  ok('activar el ×4 sin tenerlo guardado (solo hay ×2)', as('u1', guardado(2), act(4, { 'streaks/u1/x4': 0 }), D0), false);
  ok('activar sin gastar el guardado (x2 sigue en 1)', as('u1', guardado(2), act(2, { 'streaks/u1/x2': 1 }), D0), false);
  ok('activar gastando uno que no es (x3 en vez de x2)', as('u1', guardado(2), act(2, { 'streaks/u1/x2': 1, 'streaks/u1/x3': 0 }), D0), false);
  ok('activar sin tener ninguno guardado', as('u1', { wallets: { u1: wal(3000) }, streaks: { u1: { n: 9, t: D0 - 3600000 } } }, act(2), D0), false);
  ok('activar con la hora inventada', as('u1', guardado(2), act(2, { 'streaks/u1/bx': D0 + 3600000 }), D0), false);
  ok('activar con un multiplicador de ×10', as('u1', guardado(2), act(10, { 'streaks/u1/x2': 0 }), D0), false);
  ok('activar mientras otro sigue activo (hace 1 minuto)', as('u1', guardado(3, { bx: D0 - 60000, bm: 2 }), act(3), D0), false);
  ok('activar cuando el anterior ya venció (hace 11 minutos)', as('u1', guardado(3, { bx: D0 - 11 * 60000, bm: 2 }), act(3), D0), true);
  ok('activar uno de la racha sin decir cuánto dura (sin bd)', as('u1', guardado(2), { 'streaks/u1/bx': SV, 'streaks/u1/bm': 2, 'streaks/u1/x2': 0 }, D0), false);
  ok('activar uno de la racha diciendo que dura 1 hora (bd = 3.600.000)', as('u1', guardado(2), act(2, { 'streaks/u1/bd': 3600000 }), D0), false);
  ok('activar uno de la racha diciendo que dura 5 minutos', as('u1', guardado(2), act(2, { 'streaks/u1/bd': 300000 }), D0), false);

  console.log(' Multiplicadores de la ruleta: se guardan aparte (y2, y3, y4) y duran 5 minutos');
  ok('activar el ×2 de la ruleta (bd = 5 min)', as('u1', guardadoY(2), actY(2), D0), true);
  ok('activar el ×3 de la ruleta', as('u1', guardadoY(3), actY(3), D0), true);
  ok('activar el ×4 de la ruleta', as('u1', guardadoY(4), actY(4), D0), true);
  ok('activar uno de dos de la ruleta (queda 1)', as('u1', guardadoY(2, { y2: 2 }), actY(2, { 'streaks/u1/y2': 1 }), D0), true);
  ok('activar el de la ruleta diciendo que dura 10 minutos', as('u1', guardadoY(2), actY(2, { 'streaks/u1/bd': 600000 }), D0), false);
  ok('activar el de la ruleta diciendo que dura 1 hora', as('u1', guardadoY(2), actY(2, { 'streaks/u1/bd': 3600000 }), D0), false);
  ok('activar el de la ruleta sin decir cuánto dura (sin bd)', as('u1', guardadoY(2), { 'streaks/u1/bx': SV, 'streaks/u1/bm': 2, 'streaks/u1/y2': 0 }, D0), false);
  ok('activar el de la ruleta sin gastarlo (y2 sigue en 1)', as('u1', guardadoY(2), actY(2, { 'streaks/u1/y2': 1 }), D0), false);
  ok('activar el de la ruleta sin tener ninguno', as('u1', { wallets: { u1: wal(3000) }, streaks: { u1: { n: 9, t: D0 - 3600000 } } }, actY(2), D0), false);
  ok('activar un ×2 de la racha gastando el de la ruleta con 10 minutos (sacarle más tiempo)', as('u1', guardadoY(2), act(2, { 'streaks/u1/x2': 0, 'streaks/u1/y2': 0 }), D0), false);
  ok('activar uno de la ruleta gastando el de la racha (bd = 5 min pero se descuenta x2)', as('u1', guardado(2), { 'streaks/u1/bx': SV, 'streaks/u1/bm': 2, 'streaks/u1/bd': 300000, 'streaks/u1/x2': 0 }, D0), false);
  ok('activar mientras otro de la ruleta sigue activo (hace 4 minutos de 5)', as('u1', guardadoY(3, { bx: D0 - 4 * 60000, bm: 2, bd: 300000 }), actY(3), D0), false);
  ok('activar cuando el de la ruleta ya venció (hace 6 minutos)', as('u1', guardadoY(3, { bx: D0 - 6 * 60000, bm: 2, bd: 300000 }), actY(3), D0), true);
  ok('activar uno de la racha cuando el de la ruleta ya venció (hace 6 minutos)', as('u1', guardado(3, { bx: D0 - 6 * 60000, bm: 2, bd: 300000 }), act(3), D0), true);
  ok('activar mientras uno de la racha (10 min) sigue activo hace 6 minutos', as('u1', guardadoY(3, { bx: D0 - 6 * 60000, bm: 2, bd: 600000 }), actY(3), D0), false);
  ok('activar mientras uno antiguo (sin bd) sigue activo hace 6 minutos', as('u1', guardadoY(3, { bx: D0 - 6 * 60000, bm: 2 }), actY(3), D0), false);
  ok('alargar un multiplicador de la ruleta ya activo (cambiar solo bd a 10 minutos)', as('u1', { wallets: { u1: wal(3000) }, streaks: { u1: { n: 9, t: D0 - 3600000, bx: D0 - 60000, bm: 2, bd: 300000 } } }, { 'streaks/u1/bd': 600000 }, D0), false);
  ok('regalarse multiplicadores de la ruleta (y4 = 5) sin girar', as('u1', guardadoY(2), { 'streaks/u1/y4': 5 }, D0), false);
  ok('guardar un multiplicador de la racha en el contador de la ruleta (día 7 con y2)', as('u1', ayer(6, 3000), dia(7, { 'streaks/u1/y2': 1 }), D0), false);
  ok('más de 99 guardados de la ruleta', as('u1', guardadoY(2, { y2: 99 }), { 'streaks/u1/y2': 100 }, D0), false);
  ok('subir de ×2 a ×4 un multiplicador activo (solo bm)', as('u1', { wallets: { u1: wal(3000) }, streaks: { u1: { n: 9, t: D0 - 3600000, bx: D0 - 60000, bm: 2 } } }, { 'streaks/u1/bm': 4 }, D0), false);
  ok('regalarse multiplicadores guardados (x4 = 5) sin racha de por medio', as('u1', guardado(2), { 'streaks/u1/x4': 5 }, D0), false);
  ok('regalarse un multiplicador guardado el mismo día de la racha, sin reclamar', as('u1', { wallets: { u1: wal(3000) }, streaks: { u1: { n: 7, t: D0 - 3600000 } } }, { 'streaks/u1/x2': 1 }, D0), false);
  ok('repetir el reclamo del día 7 el mismo día para guardar otro', as('u1', { wallets: { u1: wal(3000) }, streaks: { u1: { n: 7, t: D0 - 3600000, x2: 1 } } }, dia(7, { 'streaks/u1/x2': 2 }), D0), false);
  ok('más de 99 guardados', as('u1', { wallets: { u1: wal(3000) }, streaks: { u1: { n: 6, t: D0 - DAYMS, x2: 99 } } }, dia(7, { 'streaks/u1/x2': 100 }), D0), false);

  console.log(' Ataques');
  ok('cambiar solo t (sin n) para cobrar el premio otra vez', as('u1', ayer(1, 100), { 'streaks/u1/t': SV, 'wallets/u1/c': 300 }, D0), false);
  ok('subir los pesos con la racha de otro día sin tocar nada', as('u1', ayer(1, 100), { 'wallets/u1/c': 300 }, D0), false);
  ok('borrar la racha para empezar de nuevo', db(ayer(3, 100), D0).write('/streaks/u1', null), false);
  ok('borrar la racha y volver a crearla el mismo día (premio del día 1 otra vez)', as('u1', hoy, { 'streaks/u1': { n: 1, t: SV }, 'wallets/u1/c': 200 }, D0), false);
  ok('ponerse una racha de 7 de un golpe', as('u1', { wallets: { u1: wal() } }, claimS(7, 0, { 'streaks/u1/x2': 1 }), D0), false);
  ok('ponerse una racha de 28 de un golpe (para cobrar $10.000)', as('u1', { wallets: { u1: wal() } }, claimS(28, 0), D0), false);
  ok('racha con campos extra', as('u1', { wallets: { u1: wal() } }, claimS(1, 0, { 'streaks/u1/oro': 5 }), D0), false);
  ok('cobrar la racha de otra cuenta', as('u2', { wallets: { u2: wal() } }, claimS(1, 0), D0), false);
  ok('leer la racha de otra cuenta', db({ streaks: { u1: strk(3, D0 - DAYMS) } }, D0, 'u2').read('/streaks/u1'), false);
  ok('leer tu propia racha', db({ streaks: { u1: strk(3, D0 - DAYMS) } }, D0).read('/streaks/u1'), true);
  ok('leer todas las rachas', db({ streaks: { u1: strk(3, D0 - DAYMS) } }, D0).read('/streaks'), false);

  console.log(' Multiplicador activo durante 10 minutos');
  const bxAt = D0 - 60000;                                                    // el multiplicador se activó hace 1 minuto
  const conBoost = (sMs, extra = {}, bm = 2) => Object.assign({ wallets: { u1: wal(0) }, streaks: { u1: Object.assign({ n: 9, t: D0 - 60000, bx: bxAt }, bm ? { bm } : {}) }, runs: { u1: { s: sMs, b: 'peso1', r: 1 } } }, extra);
  const claimDob = (h, mult, sMs, wc = 0) => ({ 'runs/u1/e': SV, 'runs/u1/h': h, 'runs/u1/p': pesosFor(h) * mult, 'wallets/u1/c': wc + pesosFor(h) * mult, 'wallets/u1/sp': 0, 'wallets/u1/lr': sMs });
  ok('partida empezada dentro de los 10 minutos con ×2: se paga el doble (40 rebotes)', as('u1', conBoost(D0 - 30000), claimDob(40, 2, D0 - 30000), D0 + 40 * 450), true);
  ok('partida con el ×2 pagada normal (×1) no vale (las reglas exigen ×2)', as('u1', conBoost(D0 - 30000), claimDob(40, 1, D0 - 30000), D0 + 40 * 450), false);
  ok('partida con el ×2 pagada ×3', as('u1', conBoost(D0 - 30000), claimDob(40, 3, D0 - 30000), D0 + 40 * 450), false);
  ok('partida con el ×3 activo: se paga el triple', as('u1', conBoost(D0 - 30000, {}, 3), claimDob(40, 3, D0 - 30000), D0 + 40 * 450), true);
  ok('partida con el ×3 activo pagada ×2', as('u1', conBoost(D0 - 30000, {}, 3), claimDob(40, 2, D0 - 30000), D0 + 40 * 450), false);
  ok('partida con el ×4 activo: se paga ×4', as('u1', conBoost(D0 - 30000, {}, 4), claimDob(40, 4, D0 - 30000), D0 + 40 * 450), true);
  ok('partida con el ×4 activo pagada ×5', as('u1', conBoost(D0 - 30000, {}, 4), claimDob(40, 5, D0 - 30000), D0 + 40 * 450), false);
  ok('activaciones antiguas (sin bm) siguen valiendo ×2', as('u1', conBoost(D0 - 30000, {}, 0), claimDob(40, 2, D0 - 30000), D0 + 40 * 450), true);
  ok('activaciones antiguas (sin bm) pagadas ×3', as('u1', conBoost(D0 - 30000, {}, 0), claimDob(40, 3, D0 - 30000), D0 + 40 * 450), false);
  ok('partida empezada ANTES de activarlo: paga normal', as('u1', conBoost(bxAt - 30000), claimDob(40, 1, bxAt - 30000), D0 + 40 * 450), true);
  ok('partida empezada antes de activarlo pagada ×2', as('u1', conBoost(bxAt - 30000), claimDob(40, 2, bxAt - 30000), D0 + 40 * 450), false);
  const sTarde = bxAt + 10 * 60000 + 1000;                                    // empezó 10 min y 1 s después de activarlo: ya venció
  ok('partida empezada con el multiplicador vencido: paga normal', as('u1', conBoost(sTarde), claimDob(40, 1, sTarde), sTarde + 40 * 450 + 1000), true);
  ok('partida empezada con el multiplicador vencido pagada ×2', as('u1', conBoost(sTarde), claimDob(40, 2, sTarde), sTarde + 40 * 450 + 1000), false);
  // los de la ruleta (bd = 5 min) y los de la racha (bd = 10 min)
  const conBd = (sMs, bd, bm = 2) => Object.assign({ wallets: { u1: wal(0) }, streaks: { u1: { n: 9, t: D0 - 60000, bx: bxAt, bm, bd } }, runs: { u1: { s: sMs, b: 'peso1', r: 1 } } });
  const sMedio = bxAt + 7 * 60000, sRuleta = bxAt + 4 * 60000;                // 7 min y 4 min después de activarlo
  ok('multiplicador de la ruleta: una partida a los 4 minutos paga ×2', as('u1', conBd(sRuleta, 300000), claimDob(40, 2, sRuleta), sRuleta + 40 * 450), true);
  ok('multiplicador de la ruleta: a los 4 minutos pagada normal (×1) no vale', as('u1', conBd(sRuleta, 300000), claimDob(40, 1, sRuleta), sRuleta + 40 * 450), false);
  ok('multiplicador de la ruleta: una partida a los 7 minutos ya paga normal (venció a los 5)', as('u1', conBd(sMedio, 300000), claimDob(40, 1, sMedio), sMedio + 40 * 450), true);
  ok('multiplicador de la ruleta: a los 7 minutos pagada ×2 se rechaza', as('u1', conBd(sMedio, 300000), claimDob(40, 2, sMedio), sMedio + 40 * 450), false);
  ok('multiplicador de la racha (bd = 10 min): a los 7 minutos sigue pagando ×2', as('u1', conBd(sMedio, 600000), claimDob(40, 2, sMedio), sMedio + 40 * 450), true);
  ok('multiplicador de la racha: a los 7 minutos pagado normal se rechaza', as('u1', conBd(sMedio, 600000), claimDob(40, 1, sMedio), sMedio + 40 * 450), false);
  ok('multiplicador de la ruleta ×3: a los 4 minutos paga ×3', as('u1', conBd(sRuleta, 300000, 3), claimDob(40, 3, sRuleta), sRuleta + 40 * 450), true);
  ok('activación antigua (sin bd) a los 7 minutos sigue pagando ×2 (10 minutos como siempre)', as('u1', conBoost(sMedio), claimDob(40, 2, sMedio), sMedio + 40 * 450), true);
  ok('sin racha nunca hay multiplicador (×2 rechazado)', as('u1', { wallets: { u1: wal(0) }, runs: { u1: { s: D0 - 30000, b: 'peso1', r: 1 } } }, claimDob(40, 2, D0 - 30000), D0 + 40 * 450), false);
}


// ---------- 8. foto de perfil (emblema) ----------
console.log('Foto de perfil (emblema)');
{
  const as = (uid, data, o) => db(data, T0, uid).update('/', o);
  const OKS = ['e41A33GGG', 'e41A33GGGhKWG', 'e41A33GGGhKWGiqQh', 'e41A33GGGhKWGiqQhAAAA', 'e41A3' + '3GGG'.repeat(5), 'e0000' + '0GGG'];            // de 1 a 5 símbolos
  const MALOS = ['', 'e', 'e41A3', 'e41A33GG', 'e41A33GGGx', 'x41A33GGG', 'i07c03', 'e41A3' + '3GGG'.repeat(6), 'e41A33GGG<script>', 'e41A33GG G'];
  const wal = { wallets: { u1: { c: 100, sp: 0 } } };
  for (const c of OKS) ok('emblema válido en la cartera: ' + c, as('u1', wal, { 'wallets/u1/av': c }), true);
  for (const c of MALOS) ok('emblema inválido en la cartera: ' + JSON.stringify(c), as('u1', wal, { 'wallets/u1/av': c }), false);
  ok('emblema como número', as('u1', wal, { 'wallets/u1/av': 5 }), false);
  ok('emblema de otra cuenta', as('u2', wal, { 'wallets/u1/av': 'e41A33GGG' }), false);
  ok('cuenta sin cartera: emblema junto con c y sp', as('u1', {}, { 'wallets/u1/av': 'e41A33GGG', 'wallets/u1/c': 0, 'wallets/u1/sp': 0 }), true);
  ok('cuenta sin cartera: solo el emblema (falta c y sp)', as('u1', {}, { 'wallets/u1/av': 'e41A33GGG' }), false);
  const fila = { scores: { u1: { n: 'Mati', k: 'mati', s: 40, t: T0 - 5000, c: 40 } }, hist: { 40: 1 }, runs: { u1: { s: T0 - 60000, b: 'peso1', r: 1, e: T0 - 1000, h: 40, p: 40 } } };
  ok('el emblema aparece en la fila del marcador', as('u1', fila, { 'scores/u1/a': 'e41A33GGG' }), true);
  ok('emblema inválido en el marcador', as('u1', fila, { 'scores/u1/a': 'rojo' }), false);
  ok('emblema en la fila de otra cuenta', as('u2', fila, { 'scores/u1/a': 'e41A33GGG' }), false);
  ok('un campo cualquiera sigue prohibido en el marcador', as('u1', fila, { 'scores/u1/foto': 'e41A33GGG' }), false);
  ok('los demás pueden leer el marcador con emblema', db({ scores: { u1: { n: 'Mati', k: 'mati', s: 40, t: 1, a: 'e41A33GGG' } } }, T0, 'u2').read('/scores'), true);
}

// ---------- correo asociado a la cuenta y registro de nombres ----------
console.log('Correo real y registro de nombres');
{
  const REAL = 'mati@gmail.com', con = (extra = {}) => ({ ...afterClaim, ...extra });
  ok('cuenta con correo real y su nombre registrado: guarda el récord', db(con({ names: { matias: 'u1' } }), T0 + 130000, 'u1', REAL).write('/scores/u1', sc(60)), true);
  ok('cuenta con correo real SIN nombre registrado: no puede guardar el récord', db(con(), T0 + 130000, 'u1', REAL).write('/scores/u1', sc(60)), false);
  ok('nombre registrado por otra cuenta: no puede usarlo', db(con({ names: { matias: 'u2' } }), T0 + 130000, 'u1', REAL).write('/scores/u1', sc(60)), false);
  ok('con el correo interno sigue funcionando como siempre', db(con(), T0 + 130000).write('/scores/u1', sc(60)), true);
  ok('registrar tu nombre (aún con el correo interno)', db({}, T0).write('/names/matias', 'u1'), true);
  ok('registrar un nombre que no es el de tu correo interno', db({}, T0).write('/names/otro', 'u1'), false);
  ok('registrar un nombre a nombre de otra cuenta', db({}, T0).write('/names/matias', 'u2'), false);
  ok('pisar un nombre ya registrado', db({ names: { matias: 'u2' } }, T0).write('/names/matias', 'u1'), false);
  ok('borrar el nombre de otra cuenta', db({ names: { matias: 'u2' } }, T0).write('/names/matias', null), false);
  ok('soltar tu propio nombre (deshacer un registro a medias)', db({ names: { matias: 'u1' } }, T0).write('/names/matias', null), true);
  ok('con un correo real ya no se registran nombres nuevos', db({}, T0, 'u1', REAL).write('/names/matias', 'u1'), false);
  ok('nombre con formato inválido', db({}, T0, 'u1', 'Ma@tio-pato.invalid').write('/names/Ma', 'u1'), false);
  const pto = { ...afterClaim, names: { 'ana,perez': 'u1' } };
  ok('nombre con puntos (ana.perez): se registra como ana,perez con su correo interno', db({}, T0, 'u1', 'ana.perez@tio-pato.invalid').write('/names/ana,perez', 'u1'), true);
  ok('… y no con otro nombre', db({}, T0, 'u1', 'ana.perez@tio-pato.invalid').write('/names/ana,lopez', 'u1'), false);
  ok('cuenta con correo real y nombre con puntos registrado: guarda el récord', db(pto, T0 + 130000, 'u1', REAL).write('/scores/u1', sc(60, { k: 'ana.perez' })), true);
  ok('nombre con puntos sin registrar: no puede', db(afterClaim, T0 + 130000, 'u1', REAL).write('/scores/u1', sc(60, { k: 'ana.perez' })), false);
  ok('nombre con puntos registrado por otra cuenta: no puede', db({ ...afterClaim, names: { 'ana,perez': 'u2' } }, T0 + 130000, 'u1', REAL).write('/scores/u1', sc(60, { k: 'ana.perez' })), false);
  ok('cualquiera puede leer un nombre (ver si está libre)', db({ names: { matias: 'u1' } }, T0, 'u9').read('/names/matias'), true);
  ok('leer un nombre sin sesión', targaryen.database(rules, { names: { matias: 'u1' } }).as(null).with({ now: T0 }).read('/names/matias'), true);
  ok('pero nadie puede listar todos los nombres', db({ names: { matias: 'u1' } }, T0, 'u9').read('/names'), false);
}

// ---------- cuentas con correo real: el nombre se anota junto con `mynames` ----------
console.log('Nombre de una cuenta con correo real (mynames)');
{
  const REAL = 'mati@gmail.com', as = (data, upd, uid = 'u1', email = REAL) => db(data, T0, uid, email).update('/', upd);
  ok('cuenta con correo real anota su nombre y mynames a la vez', as({}, { 'names/ana,perez': 'u1', 'mynames/u1': 'ana,perez' }), true);
  ok('… pero no el nombre solo (sin mynames)', as({}, { 'names/ana,perez': 'u1' }), false);
  ok('… ni con un mynames que dice otro nombre', as({}, { 'names/ana,perez': 'u1', 'mynames/u1': 'ana,lopez' }), false);
  ok('… ni mynames sin el nombre', as({}, { 'mynames/u1': 'ana,perez' }), false);
  ok('un segundo nombre para la misma cuenta', as({ names: { 'ana,perez': 'u1' }, mynames: { u1: 'ana,perez' } }, { 'names/otro,nombre': 'u1', 'mynames/u1': 'otro,nombre' }), false);
  ok('anotar un nombre ya ocupado', as({ names: { 'ana,perez': 'u2' }, mynames: { u2: 'ana,perez' } }, { 'names/ana,perez': 'u1', 'mynames/u1': 'ana,perez' }), false);
  ok('anotar el nombre a nombre de otra cuenta', as({}, { 'names/ana,perez': 'u2', 'mynames/u2': 'ana,perez' }), false);
  ok('formato inválido del nombre', as({}, { 'names/Ana': 'u1', 'mynames/u1': 'Ana' }), false);
  ok('deshacer: soltar el nombre y mynames', as({ names: { 'ana,perez': 'u1' }, mynames: { u1: 'ana,perez' } }, { 'names/ana,perez': null, 'mynames/u1': null }), true);
  ok('soltar el nombre de otra cuenta', as({ names: { 'ana,perez': 'u2' }, mynames: { u2: 'ana,perez' } }, { 'names/ana,perez': null }), false);
  ok('con ese registro la cuenta guarda su récord en el marcador', db({ ...afterClaim, names: { matias: 'u1' }, mynames: { u1: 'matias' } }, T0 + 130000, 'u1', REAL).write('/scores/u1', sc(60)), true);
  ok('leer tu mynames', db({ mynames: { u1: 'ana,perez' } }, T0, 'u1', REAL).read('/mynames/u1'), true);
  ok('leer el mynames de otra cuenta', db({ mynames: { u1: 'ana,perez' } }, T0, 'u2', REAL).read('/mynames/u1'), false);
  ok('un correo interno sigue registrando su nombre de siempre (cuentas antiguas)', db({}, T0).write('/names/matias', 'u1'), true);
}

// ---------- tiempo jugado (marcador «Tiempo») ----------
console.log('Tiempo jugado');
{
  const fila = (extra = {}) => ({ n: 'Matías', k: 'matias', s: 60, t: T0 - 100, c: 60, ...extra });
  const base = (scores = fila(), run = {}, lr = T0) => ({ runs: { u1: { s: T0, b: 'peso1', r: 1, e: T0 + 60000, h: 60, p: 60, ...run } }, wallets: { u1: { c: 60, sp: 0, lr } }, scores: { u1: scores } });
  const as = (data, upd, uid = 'u1') => db(data, T0 + 70000, uid).update('/', upd);
  const inc = (ms, ml = T0) => ({ 'scores/u1/ms': ms, 'scores/u1/ml': ml });
  ok('una partida cobrada de 60 s suma sus 60 s de tiempo jugado', as(base(), inc(60000)), true);
  ok('suma el tiempo realmente jugado, que es menos que lo que tardó la partida (57 s de 60 s: sin la cuenta regresiva)', as(base(), inc(57000)), true);
  ok('el tiempo se acumula sobre lo que ya había (100 s + 57 s)', as(base(fila({ ms: 100000, ml: T0 - 500000 })), inc(157000)), true);
  ok('una partida que no aguantó ni un segundo puede sumar 0', as(base(fila({ ms: 100000, ml: T0 - 500000 })), inc(100000)), true);
  ok('sumar más de lo que duró la partida', as(base(), inc(60001)), false);
  ok('bajar el tiempo que ya tenías', as(base(fila({ ms: 100000, ml: T0 - 500000 })), inc(99999)), false);
  ok('sumar la misma partida dos veces', as(base(fila({ ms: 60000, ml: T0 })), inc(120000)), false);
  ok('marcar una partida más vieja que la última sumada', as(base(fila({ ms: 60000, ml: T0 + 5 })), inc(120000)), false);
  ok('sumar tiempo sin marcar la partida (ml)', as(base(), { 'scores/u1/ms': 60000 }), false);
  ok('marcar una partida que no es la última cobrada', as(base(), inc(60000, T0 + 7)), false);
  ok('sumar tiempo de una partida que todavía no se cobró', as(base(fila(), {}, T0 - 90000), inc(60000)), false);
  ok('dejar el juego abierto no suma horas: una partida de 2 rebotes que «duró» 1 hora suma como mucho 15 s (2 × 4,5 s + 6 s)', as(base(fila(), { e: T0 + 3600000, h: 2, p: 2 }), inc(15000)), true);
  ok('… y no se puede sumar la hora entera', as(base(fila(), { e: T0 + 3600000, h: 2, p: 2 }), inc(3600000)), false);
  ok('sumar tiempo en la fila de otra cuenta', as(base(), inc(60000), 'u2'), false);
  ok('el tiempo no puede ser decimal', as(base(), inc(59999.5)), false);
  ok('el tiempo a mano, sin partida', db({ scores: { u1: fila() } }, T0).write('/scores/u1/ms', 99999999), false);
  ok('los demás pueden leer el tiempo de cada cuenta en el marcador', db({ scores: { u1: fila({ ms: 60000, ml: T0 }) } }, T0, 'u2').read('/scores'), true);
}

// ---------- misiones: estadísticas, logros y misiones del día ----------
console.log('Misiones: estadísticas');
const MI = ECO.misiones, DAYMS = 86400000, HUSO = -3 * 3600000;
const hoy = () => Math.floor((Date.now() + HUSO) / DAYMS);
const pick = (d, k) => ((d * 5 + 2 * k) % 7) % 3;
{
  const D = hoy();
  const run = (h = 60, lr = T0) => ({ runs: { u1: { s: T0, b: 'peso1', r: 1, e: T0 + 60000, h, p: h } }, wallets: { u1: { c: 5000, sp: 0, lr } }, scores: { u1: { n: 'Matías', k: 'matias', s: h, t: T0 - 100, c: h } } });
  const as = (data, upd, uid = 'u1') => db(data, T0 + 70000, uid).update('/', upd);
  const S = (o = {}) => ({ g: 3, r: 100, sl: T0 - 900000, d: D, dg: 2, dr: 50, dm: 40, dc: 3, ...o });
  const sync = (h, old, over = {}) => ({ 'stats/u1/g': old.g + 1, 'stats/u1/r': old.r + h, 'stats/u1/sl': T0, 'stats/u1/d': D, 'stats/u1/dg': (old.d === D ? old.dg : 0) + 1, 'stats/u1/dr': (old.d === D ? old.dr : 0) + h, 'stats/u1/dm': old.d === D ? Math.max(old.dm, h) : h, ...(old.d === D ? {} : { 'stats/u1/dc': 0 }), ...over });
  const primera = { 'stats/u1/g': 1, 'stats/u1/r': 60, 'stats/u1/sl': T0, 'stats/u1/d': D, 'stats/u1/dg': 1, 'stats/u1/dr': 60, 'stats/u1/dm': 60, 'stats/u1/dc': 0 };
  ok('la primera partida crea las estadísticas', as(run(), primera), true);
  ok('otra partida del mismo día se suma (partidas, rebotes, de hoy y la mejor de hoy)', as({ ...run(70), stats: { u1: S() } }, sync(70, S())), true);
  ok('la mejor de hoy no baja si la nueva partida fue peor', as({ ...run(30), stats: { u1: S({ dm: 40 }) } }, sync(30, S({ dm: 40 }), { 'stats/u1/dm': 40 })), true);
  ok('la misma partida dos veces', as({ ...run(), stats: { u1: S({ sl: T0 }) } }, sync(60, S({ sl: T0 }))), false);
  ok('contar dos partidas con una sola', as({ ...run(), stats: { u1: S() } }, sync(60, S(), { 'stats/u1/g': 5 })), false);
  ok('rebotes inventados', as({ ...run(), stats: { u1: S() } }, sync(60, S(), { 'stats/u1/r': 9999 })), false);
  ok('mejor de hoy inflada', as({ ...run(), stats: { u1: S() } }, sync(60, S(), { 'stats/u1/dm': 500 })), false);
  ok('una partida que no se cobró todavía no cuenta', as({ ...run(60, T0 - 80000), stats: { u1: S() } }, sync(60, S())), false);
  ok('una partida de menos de ' + MI.minRebotes + ' rebotes no cuenta', as({ ...run(MI.minRebotes - 1), stats: { u1: S() } }, sync(MI.minRebotes - 1, S())), false);
  ok('una de ' + MI.minRebotes + ' rebotes sí', as({ ...run(MI.minRebotes), stats: { u1: S() } }, sync(MI.minRebotes, S())), true);
  const ayer = S({ d: D - 1, dc: 7, dg: 9, dr: 400, dm: 80 });
  ok('al cambiar el día los contadores de hoy vuelven a empezar (y las casillas cobradas a 0)', as({ ...run(), stats: { u1: ayer } }, sync(60, ayer)), true);
  ok('… si se olvida poner las casillas en 0', as({ ...run(), stats: { u1: ayer } }, sync(60, ayer, { 'stats/u1/dc': undefined })), false);
  ok('… ni arrastrar los contadores de ayer', as({ ...run(), stats: { u1: ayer } }, sync(60, ayer, { 'stats/u1/dg': 10 })), false);
  ok('un día que no es hoy', as({ ...run(), stats: { u1: S() } }, sync(60, S(), { 'stats/u1/d': D + 1 })), false);
  ok('las estadísticas de otra cuenta', as({ ...run(), stats: { u2: S() } }, sync(60, S()), 'u2'), false);
  ok('borrar las estadísticas', db({ ...run(), stats: { u1: S() } }, T0).write('/stats/u1', null), false);
  ok('borrar un contador', db({ ...run(), stats: { u1: S() } }, T0).write('/stats/u1/dg', null), false);
  ok('subir un contador a mano', db({ ...run(), stats: { u1: S() } }, T0).write('/stats/u1/g', 999), false);
  ok('leer tus estadísticas', db({ stats: { u1: S() } }, T0).read('/stats/u1'), true);
  ok('leer las de otra cuenta', db({ stats: { u1: S() } }, T0, 'u2').read('/stats/u1'), false);

  console.log('Misiones: logros de una sola vez');
  const cart = (c = 5000) => ({ wallets: { u1: { c, sp: 0, lr: T0 - 99999 } } });
  const g = { ...cart(), stats: { u1: S({ g: 12, r: 700, dc: 0 }) }, scores: { u1: { n: 'M', k: 'matias', s: 120, t: 5, c: 120 } } };
  const cobra = (ids, extra = {}) => ({ ...Object.fromEntries(ids.map(i => [`missions/u1/${i}`, true])), 'wallets/u1/c': 5000 + ids.reduce((a, i) => a + MI.logros.find(x => x[0] === i)[3], 0), 'wallets/u1/sp': 0, ...extra });
  ok('«Juega 1 partida» con 12 partidas jugadas', as(g, cobra(['g1'])), true);
  ok('«Juega 10 partidas»', as(g, cobra(['g10'])), true);
  ok('«Juega 50 partidas» con solo 12', as(g, cobra(['g50'])), false);
  ok('«Llega a 100 rebotes» con un récord de 120', as(g, cobra(['b100'])), true);
  ok('«Llega a 150 rebotes» con un récord de 120', as(g, cobra(['b150'])), false);
  ok('«Suma 500 rebotes» con 700', as(g, cobra(['r500'])), true);
  ok('varios logros a la vez (g1 + g10 + b10 + b25 + b50 + b100 + r100 + r500)', as(g, cobra(['g1', 'g10', 'b10', 'b25', 'b50', 'b100', 'r100', 'r500'])), true);
  ok('el premio no puede ser mayor que el del logro', as(g, cobra(['b100'], { 'wallets/u1/c': 5000 + MI.logros.find(x => x[0] === 'b100')[3] + 1 })), false);
  ok('ni menor que el del logro', as(g, cobra(['b100'], { 'wallets/u1/c': 5000 + MI.logros.find(x => x[0] === 'b100')[3] - 1 })), false);
  ok('cobrar el logro sin subir los pesos no rompe nada', as(g, cobra(['g1'], { 'wallets/u1/c': 5000 })), true);
  ok('subir los pesos sin ningún logro', as(g, { 'wallets/u1/c': 5050, 'wallets/u1/sp': 0 }), false);
  ok('el mismo logro dos veces', as({ ...g, missions: { u1: { g1: true } } }, cobra(['g1'])), false);
  ok('borrar un logro cobrado (para cobrarlo otra vez)', as({ ...g, missions: { u1: { g1: true } } }, { 'missions/u1/g1': null }), false);
  ok('un logro que no existe', as(g, { 'missions/u1/regalo': true, 'wallets/u1/c': 9999, 'wallets/u1/sp': 0 }), false);
  ok('un logro en la cuenta de otro', as(g, { 'missions/u1/g1': true, 'wallets/u1/c': 5050, 'wallets/u1/sp': 0 }, 'u2'), false);
  const gg = { ...g, scores: { u1: { n: 'M', k: 'matias', s: 130, t: 5, c: 130, ms: 40000000 } }, stats: { u1: S({ g: 300, r: 30000, dc: 0 }) } };
  ok('los premios crecen con la dificultad (150 rebotes paga más que 100, 10.000 rebotes = $20.000, 300 rebotes es el mayor)', { allowed: MI.logros.find(x => x[0] === 'b150')[3] > MI.logros.find(x => x[0] === 'b100')[3] * 4 && MI.logros.find(x => x[0] === 'r10000')[3] === 20000
    && ['b', 'r', 'g', 's', 't'].every(t => MI.logros.filter(x => x[1] === t).every((x, i, a) => i === 0 || x[3] > a[i - 1][3])) }, true);
  ok('«Llega a 125 rebotes» con un récord de 130', as(gg, cobra(['b125'])), true);
  ok('«Llega a 150 rebotes» con un récord de 130', as(gg, cobra(['b150'])), false);
  ok('«Juega 250 partidas» con 300', as(gg, cobra(['g250'])), true);
  ok('«Juega 500 partidas» con 300', as(gg, cobra(['g500'])), false);
  ok('«Suma 25.000 rebotes» con 30.000', as(gg, cobra(['r25000'])), true);
  ok('«Suma 50.000 rebotes» con 30.000', as(gg, cobra(['r50000'])), false);
  ok('«Juega 1 hora» con 11 horas jugadas', as(gg, cobra(['t1'])), true);
  ok('«Juega 10 horas» con 11 horas jugadas', as(gg, cobra(['t10'])), true);
  ok('«Juega 50 horas» con 11 horas jugadas', as(gg, cobra(['t50'])), false);
  ok('«Juega 1 hora» sin tiempo guardado', as(g, cobra(['t1'])), false);
  ok('«Racha de 14 días» con la racha en 14', as({ ...g, streaks: { u1: { n: 14, t: T0 } } }, cobra(['s14'])), true);
  ok('«Racha de 28 días» con la racha en 14', as({ ...g, streaks: { u1: { n: 14, t: T0 } } }, cobra(['s28'])), false);
  ok('«Racha de 3 días» con la racha en 3', as({ ...g, streaks: { u1: { n: 3, t: T0 } } }, cobra(['s3'])), true);
  ok('«Racha de 7 días» con la racha en 3', as({ ...g, streaks: { u1: { n: 3, t: T0 } } }, cobra(['s7'])), false);
  ok('«Crea tu emblema» con emblema', as({ ...g, wallets: { u1: { c: 5000, sp: 0, lr: T0 - 99999, av: 'e41A33GGG' } } }, cobra(['e1'])), true);
  ok('«Crea tu emblema» sin emblema', as(g, cobra(['e1'])), false);
  ok('«Compra tu primer artículo» habiendo gastado', as({ ...g, wallets: { u1: { c: 5000, sp: 150, lr: T0 - 99999 } } }, cobra(['c1'], { 'wallets/u1/sp': 150 })), true);
  ok('«Compra tu primer artículo» sin haber gastado', as(g, cobra(['c1'])), false);
  const ver = (data, upd, email, ev) => db(data, T0 + 70000, 'u1', email, ev).update('/', upd);
  ok('«Verifica tu correo» con el correo real verificado', ver(g, cobra(['v1']), 'mati@gmail.com', true), true);
  ok('«Verifica tu correo» con el correo sin verificar', ver(g, cobra(['v1']), 'mati@gmail.com', false), false);
  ok('«Verifica tu correo» con el correo interno', ver(g, cobra(['v1']), 'matias@tio-pato.invalid', true), false);

  console.log('Misiones: las 3 del día');
  const casilla = k => { const j = pick(D, k), de = MI.dia[k].de[j], campo = { g: 'dg', r: 'dr', m: 'dm' }[de[0]]; return { campo, meta: de[1] }; };
  const stats = (cumple = [], extra = {}) => { const s = S({ d: D, dg: 0, dr: 0, dm: 0, dc: 0 }); cumple.forEach(k => { const c = casilla(k); s[c.campo] = c.meta; }); return { ...s, ...extra }; };
  const cartera = { wallets: { u1: { c: 5000, sp: 0, lr: T0 - 99999 } } };
  const dia = (st, bits, premio, extra = {}) => ({ 'stats/u1/dc': bits, 'wallets/u1/c': 5000 + premio, 'wallets/u1/sp': 0, ...extra });
  const premio = k => MI.dia[k].premio;
  console.log('   misiones de hoy:', [0, 1, 2].map(k => `${premio(k)} = ${casilla(k).campo} ≥ ${casilla(k).meta}`).join(' · '));
  ok(`casilla fácil ($${premio(0)}) cumplida`, as({ ...cartera, stats: { u1: stats([0]) } }, dia(0, 1, premio(0))), true);
  ok(`casilla media ($${premio(1)}) cumplida`, as({ ...cartera, stats: { u1: stats([1]) } }, dia(0, 2, premio(1))), true);
  ok(`casilla difícil ($${premio(2)}) cumplida`, as({ ...cartera, stats: { u1: stats([2]) } }, dia(0, 4, premio(2))), true);
  ok(`las tres a la vez ($${premio(0) + premio(1) + premio(2)})`, as({ ...cartera, stats: { u1: stats([0, 1, 2]) } }, dia(0, 7, premio(0) + premio(1) + premio(2))), true);
  ok('casilla sin cumplir', as({ ...cartera, stats: { u1: stats([]) } }, dia(0, 1, premio(0))), false);
  ok('cobrar la difícil habiendo cumplido solo la fácil', as({ ...cartera, stats: { u1: stats([0]) } }, dia(0, 4, premio(2))), false);
  ok('premio de la casilla fácil con el monto de la difícil', as({ ...cartera, stats: { u1: stats([0]) } }, dia(0, 1, premio(2))), false);
  ok('premio de más', as({ ...cartera, stats: { u1: stats([0]) } }, dia(0, 1, premio(0) + 1)), false);
  ok('cobrar la misma casilla otra vez', as({ ...cartera, stats: { u1: stats([0], { dc: 1 }) } }, dia(0, 1, premio(0))), false);
  ok('descobrar una casilla (3 → 1) para cobrarla de nuevo', as({ ...cartera, stats: { u1: stats([0, 1], { dc: 3 }) } }, { 'stats/u1/dc': 1 }), false);
  ok('cobrar la segunda con la primera ya cobrada (1 → 3)', as({ ...cartera, stats: { u1: stats([0, 1], { dc: 1 }) } }, dia(0, 3, premio(1))), true);
  ok('contadores de ayer: no se pueden cobrar hoy', as({ ...cartera, stats: { u1: stats([0], { d: D - 1 }) } }, dia(0, 1, premio(0))), false);
  ok('un valor de casillas fuera de rango', as({ ...cartera, stats: { u1: stats([0, 1, 2]) } }, dia(0, 8, premio(0))), false);
  ok('misión del día y logro en el mismo cobro', as({ ...cartera, stats: { u1: stats([0], { g: 12 }) }, scores: { u1: { n: 'M', k: 'matias', s: 120, t: 5, c: 120 } } }, { ...dia(0, 1, premio(0) + MI.logros.find(x => x[0] === 'g10')[3] + MI.logros.find(x => x[0] === 'g1')[3], {}), 'missions/u1/g10': true, 'missions/u1/g1': true }), true);
  ok('las misiones de la casilla de otro día no las cobra otra cuenta', as({ ...cartera, stats: { u1: stats([0]) } }, dia(0, 1, premio(0)), 'u2'), false);
}

// ---------- misiones de la semana (3 casillas, 1 de 5 misiones al azar cada semana) ----------
console.log('Misiones de la semana');
{
  const MI2 = ECO.misiones, SEM = MI2.semana, DAYMS2 = 86400000, HUSO2 = -3 * 3600000;
  const D = Math.floor((Date.now() + HUSO2) / DAYMS2), WK = Math.floor((D + 3) / 7);
  const pickW = (w, k) => ((w * 13 + 7 * k) % 17) % SEM.de[k].length;
  const campo = { g: 'wg', r: 'wr', m: 'wm' };
  const as = (data, upd, uid = 'u1') => db(data, T0 + 70000, uid).update('/', upd);
  const cartera = { wallets: { u1: { c: 5000, sp: 0, lr: T0 - 99999 } } };
  const base = (o = {}) => ({ g: 3, r: 100, sl: T0 - 900000, d: D, dg: 2, dr: 50, dm: 40, dc: 0, w: WK, wg: 2, wr: 50, wm: 40, wc: 0, ...o });
  const run = (h = 60, lr = T0) => ({ runs: { u1: { s: T0, b: 'peso1', r: 1, e: T0 + 60000, h, p: h } }, wallets: { u1: { c: 5000, sp: 0, lr } }, scores: { u1: { n: 'Matías', k: 'matias', s: h, t: T0 - 100, c: h } } });
  const casilla = (k, w = WK) => { const j = pickW(w, k), de = SEM.de[k][j]; return { campo: campo[de[0]], meta: de[1], j }; };
  console.log('   misiones de esta semana (semana ' + WK + '):', [0, 1, 2].map(k => `$${SEM.premios[k]} = ${casilla(k).campo} ≥ ${casilla(k).meta}`).join(' · '));
  ok('en las 3 casillas hay 5 misiones posibles y a lo largo de las semanas salen todas (se reparten bien)', { allowed: [0, 1, 2].every(k => { const vistas = new Set(); for (let w = 0; w < 60; w++) vistas.add(pickW(w, k)); return SEM.de[k].length === 5 && vistas.size === 5; }) }, true);
  ok('el premio sube con la dificultad (fácil < media < difícil)', { allowed: SEM.premios[0] < SEM.premios[1] && SEM.premios[1] < SEM.premios[2] }, true);
  ok('dos semanas seguidas nunca repiten la misma misión en las tres casillas a la vez', { allowed: (() => { let rep = 0; for (let w = 0; w < 100; w++) if ([0, 1, 2].every(k => pickW(w, k) === pickW(w + 1, k))) rep++; return rep === 0; })() }, true);

  // estadísticas de la semana
  const sync = (h, old, over = {}) => ({ 'stats/u1/g': old.g + 1, 'stats/u1/r': old.r + h, 'stats/u1/sl': T0, 'stats/u1/d': D, 'stats/u1/dg': old.dg + 1, 'stats/u1/dr': old.dr + h, 'stats/u1/dm': Math.max(old.dm, h),
    'stats/u1/w': WK, 'stats/u1/wg': (old.w === WK ? old.wg : 0) + 1, 'stats/u1/wr': (old.w === WK ? old.wr : 0) + h, 'stats/u1/wm': old.w === WK ? Math.max(old.wm, h) : h, ...(old.w === WK ? {} : { 'stats/u1/wc': 0 }), ...over });
  ok('una partida suma también a la semana (partidas, rebotes y mejor partida)', as({ ...run(70), stats: { u1: base() } }, sync(70, base())), true);
  ok('la primera partida con contadores de semana (cuentas que aún no los tenían)', as({ ...run(60), stats: { u1: (({ w, wg, wr, wm, wc, ...r }) => r)(base()) } }, sync(60, { ...base(), w: undefined }, {})), true);
  ok('la mejor de la semana no baja si la partida fue peor', as({ ...run(30), stats: { u1: base({ wm: 90 }) } }, sync(30, base({ wm: 90 }))), true);
  const pasada = base({ w: WK - 1, wg: 20, wr: 900, wm: 95, wc: 7 });
  ok('al cambiar la semana los contadores vuelven a empezar y las casillas cobradas a 0', as({ ...run(60), stats: { u1: pasada } }, sync(60, pasada)), true);
  ok('… si se olvida poner las casillas de la semana en 0', as({ ...run(60), stats: { u1: pasada } }, sync(60, pasada, { 'stats/u1/wc': undefined })), false);
  ok('… ni arrastrar los contadores de la semana pasada', as({ ...run(60), stats: { u1: pasada } }, sync(60, pasada, { 'stats/u1/wg': 21 })), false);
  ok('partidas de la semana infladas', as({ ...run(60), stats: { u1: base() } }, sync(60, base(), { 'stats/u1/wg': 9 })), false);
  ok('rebotes de la semana inventados', as({ ...run(60), stats: { u1: base() } }, sync(60, base(), { 'stats/u1/wr': 5000 })), false);
  ok('mejor partida de la semana inflada', as({ ...run(60), stats: { u1: base() } }, sync(60, base(), { 'stats/u1/wm': 300 })), false);
  ok('una semana que no es esta', as({ ...run(60), stats: { u1: base() } }, sync(60, base(), { 'stats/u1/w': WK + 1 })), false);
  ok('subir un contador de la semana a mano', db({ ...run(60), stats: { u1: base() } }, T0).write('/stats/u1/wg', 99), false);
  ok('la misma partida dos veces no suma otra vez a la semana', as({ ...run(60), stats: { u1: base({ sl: T0 }) } }, sync(60, base({ sl: T0 }))), false);

  // cobrar las casillas de la semana
  const stats = (cumple = [], extra = {}) => { const st = base({ wg: 0, wr: 0, wm: 0, wc: 0 }); cumple.forEach(k => { const c = casilla(k); st[c.campo] = c.meta; }); return { ...st, ...extra }; };
  const cobra = (bits, premio, extra = {}) => ({ 'stats/u1/wc': bits, 'wallets/u1/c': 5000 + premio, 'wallets/u1/sp': 0, ...extra });
  const P = SEM.premios;
  ok(`casilla fácil ($${P[0]}) cumplida`, as({ ...cartera, stats: { u1: stats([0]) } }, cobra(1, P[0])), true);
  ok(`casilla media ($${P[1]}) cumplida`, as({ ...cartera, stats: { u1: stats([1]) } }, cobra(2, P[1])), true);
  ok(`casilla difícil ($${P[2]}) cumplida`, as({ ...cartera, stats: { u1: stats([2]) } }, cobra(4, P[2])), true);
  ok(`las tres a la vez ($${P[0] + P[1] + P[2]})`, as({ ...cartera, stats: { u1: stats([0, 1, 2]) } }, cobra(7, P[0] + P[1] + P[2])), true);
  ok('casilla sin cumplir', as({ ...cartera, stats: { u1: stats([]) } }, cobra(1, P[0])), false);
  ok('cobrar la difícil habiendo cumplido solo la fácil', as({ ...cartera, stats: { u1: stats([0]) } }, cobra(4, P[2])), false);
  ok('el monto de la difícil por la casilla fácil', as({ ...cartera, stats: { u1: stats([0]) } }, cobra(1, P[2])), false);
  ok('premio de más', as({ ...cartera, stats: { u1: stats([0]) } }, cobra(1, P[0] + 1)), false);
  ok('premio de menos', as({ ...cartera, stats: { u1: stats([0]) } }, cobra(1, P[0] - 1)), false);
  ok('cobrar la misma casilla otra vez', as({ ...cartera, stats: { u1: stats([0], { wc: 1 }) } }, cobra(1, P[0])), false);
  ok('descobrar una casilla (3 → 1) para cobrarla de nuevo', as({ ...cartera, stats: { u1: stats([0, 1], { wc: 3 }) } }, { 'stats/u1/wc': 1 }), false);
  ok('cobrar la segunda con la primera ya cobrada (1 → 3)', as({ ...cartera, stats: { u1: stats([0, 1], { wc: 1 }) } }, cobra(3, P[1])), true);
  ok('contadores de la semana pasada: no se cobran esta semana', as({ ...cartera, stats: { u1: stats([0], { w: WK - 1 }) } }, cobra(1, P[0])), false);
  ok('un valor de casillas fuera de rango', as({ ...cartera, stats: { u1: stats([0, 1, 2]) } }, cobra(8, P[0])), false);
  ok('subir los pesos sin cobrar ninguna casilla', as({ ...cartera, stats: { u1: stats([0]) } }, { 'wallets/u1/c': 5000 + P[0], 'wallets/u1/sp': 0 }), false);
  ok('cobrar las casillas de la semana de otra cuenta', as({ ...cartera, stats: { u1: stats([0]) } }, cobra(1, P[0]), 'u2'), false);
  ok('misión de la semana y misión del día en el mismo cobro', as({ ...cartera, stats: { u1: stats([0], { dg: 9, dr: 999, dm: 99 }) } }, cobra(1, P[0] + ECO.misiones.dia[0].premio, { 'stats/u1/dc': 1 })), true);
  ok('misión de la semana y un logro en el mismo cobro', as({ ...cartera, stats: { u1: stats([0], { g: 12 }) }, scores: { u1: { n: 'M', k: 'matias', s: 60, t: 5, c: 60 } } }, cobra(1, P[0] + MI2.logros.find(x => x[0] === 'g1')[3], { 'missions/u1/g1': true })), true);
}

// ---------- marcadores: semanal, millonarios e insignias ----------
console.log('Marcadores: semanal, millonarios e insignias');
{
  const D = Math.floor((Date.now() - 3 * 3600000) / 86400000), WK = Math.floor((D + 3) / 7);
  const as = (data, upd, uid = 'u1') => db(data, T0 + 70000, uid).update('/', upd);
  const fila = { n: 'Matías', k: 'matias', s: 90, t: T0 - 5000 };
  const base = { scores: { u1: fila }, stats: { u1: { g: 9, r: 400, sl: T0 - 9000, d: D, dg: 2, dr: 60, dm: 40, dc: 0, w: WK, wg: 3, wr: 150, wm: 70, wc: 0 } } };
  const sem = (o = {}) => ({ n: 'Matías', s: 70, t: SV, ...o });
  console.log(' Semanal');
  ok('tu mejor partida de la semana entra al marcador semanal (n, s, t)', as(base, { [`weekly/${WK}/u1`]: sem() }), true);
  ok('… con tu foto de perfil', as(base, { [`weekly/${WK}/u1`]: sem({ a: 'e4A1aGGGG' }) }), true);
  ok('… con una foto con formato inventado', as(base, { [`weekly/${WK}/u1`]: sem({ a: '<img src=x>' }) }), false);
  ok('con más rebotes de los que llevan las estadísticas (s = 80, wm = 70)', as(base, { [`weekly/${WK}/u1`]: sem({ s: 80 }) }), false);
  ok('con menos rebotes de los que llevan las estadísticas (s = 60, wm = 70)', as(base, { [`weekly/${WK}/u1`]: sem({ s: 60 }) }), false);
  ok('sin estadísticas de la semana (no hay partidas verificadas)', as({ scores: base.scores }, { [`weekly/${WK}/u1`]: sem() }), false);
  ok('con estadísticas de la semana pasada (w = semana − 1)', as({ ...base, stats: { u1: { ...base.stats.u1, w: WK - 1 } } }, { [`weekly/${WK}/u1`]: sem() }), false);
  ok('en la semana pasada', as(base, { [`weekly/${WK - 1}/u1`]: sem() }), false);
  ok('en una semana futura', as(base, { [`weekly/${WK + 1}/u1`]: sem() }), false);
  ok('con un nombre que no es el de tu fila del marcador', as(base, { [`weekly/${WK}/u1`]: sem({ n: 'Otra Persona' }) }), false);
  ok('sin tener fila en el marcador', as({ stats: base.stats }, { [`weekly/${WK}/u1`]: sem() }), false);
  ok('con la hora inventada', as(base, { [`weekly/${WK}/u1`]: sem({ t: T0 - 99999 }) }), false);
  ok('con un campo extra', as(base, { [`weekly/${WK}/u1`]: sem({ oro: 9 }) }), false);
  ok('sin el nombre', as(base, { [`weekly/${WK}/u1`]: { s: 70, t: SV } }), false);
  ok('la fila de otra cuenta', as(base, { [`weekly/${WK}/u1`]: sem() }, 'u2'), false);
  const ya = { ...base, weekly: { [WK]: { u1: { n: 'Matías', s: 70, t: T0 - 60000 } } } };
  ok('actualizar tu mejor partida de la semana (70 → 90) cuando las estadísticas ya dicen 90', as({ ...ya, stats: { u1: { ...base.stats.u1, wm: 90 } } }, { [`weekly/${WK}/u1/s`]: 90, [`weekly/${WK}/u1/t`]: SV }), true);
  ok('bajar tu marca de la semana (70 → 50)', as({ ...ya, stats: { u1: { ...base.stats.u1, wm: 50 } } }, { [`weekly/${WK}/u1/s`]: 50, [`weekly/${WK}/u1/t`]: SV }), false);
  ok('escribir la fila de otra cuenta en la semana actual', as({ ...base, scores: { u2: { ...fila, n: 'Otra' }, u1: fila }, stats: { u2: base.stats.u1, u1: base.stats.u1 } }, { [`weekly/${WK}/u2`]: sem({ n: 'Otra' }) }), false);
  ok('leer el marcador semanal sin sesión', targaryen.database(rules, shiftObj(ya, 0)).as(null).read(`/weekly/${WK}`), true);
  ok('leer cualquier semana vieja', targaryen.database(rules, shiftObj(ya, 0)).as(null).read(`/weekly/${WK - 3}`), true);

  // ---------- mensual: monthly/<AAAAMM>/<uid> (mes calendario, hora de Chile) ----------
  console.log(' Mensual: la fórmula del mes');
  {
    const wr = rules.rules.monthly.$mo.$uid['.write'], mm = /\$mo === (.*) \+ ''$/.exec(wr), fM = new Function('now', 'return ' + mm[1]);
    const DAY = 86400000, OFFM = -3 * 3600000;
    let malos = 0, n = 0, ej = '';
    for (let d = Math.floor(Date.UTC(1972, 2, 1) / DAY); d <= Math.floor(Date.UTC(2099, 11, 31) / DAY); d++) {
      for (const [hh, extra] of [[0, 0], [12, 0], [23, 3599999]]) {          // medianoche, mediodía y las 23:59:59 hora de Chile
        const now = d * DAY - OFFM + hh * 3600000 + extra, loc = new Date(now + OFFM), esperado = loc.getUTCFullYear() * 100 + loc.getUTCMonth() + 1;
        n++; if (fM(now) !== esperado) { malos++; if (!ej) ej = new Date(now).toISOString() + ' → ' + fM(now) + ' (esperado ' + esperado + ')'; }
      }
    }
    ok(`la fórmula del mes de las reglas coincide con el calendario real en ${n} instantes (todos los días de marzo de 1972 a diciembre de 2099, a las 00:00, las 12:00 y las 23:59:59 de Chile)`, { allowed: malos === 0 }, true);
    if (malos) console.log('     ', ej);
    ok('el cambio de mes es a medianoche de Chile (UTC-3): 30 nov 2026 23:59:59 es 202611 y 1 dic 00:00 es 202612', { allowed: fM(Date.UTC(2026, 11 - 1, 30, 23 + 3, 59, 59)) === 202611 && fM(Date.UTC(2026, 11, 1, 3, 0, 0)) === 202612 }, true);
    ok('febrero de un año bisiesto (2028) tiene 29 días y el de 2027 tiene 28', { allowed: fM(Date.UTC(2028, 1, 29, 12)) === 202802 && fM(Date.UTC(2028, 2, 1, 4)) === 202803 && fM(Date.UTC(2027, 1, 28, 12)) === 202702 && fM(Date.UTC(2027, 2, 1, 4)) === 202703 }, true);
  }

  console.log(' Mensual');
  const MOn = (() => { const d = new Date(Date.now() - 3 * 3600000); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; })(), MOprev = MOn % 100 === 1 ? MOn - 89 : MOn - 1;
  const bm = { ...base, stats: { u1: { ...base.stats.u1, mo: MOn, mm: 70, ml: T0 - 9000 } } };
  const men = (o = {}) => ({ n: 'Matías', s: 70, t: SV, ...o });
  ok('tu mejor partida del mes entra al marcador mensual (n, s, t)', as(bm, { [`monthly/${MOn}/u1`]: men() }), true);
  ok('… con tu foto de perfil', as(bm, { [`monthly/${MOn}/u1`]: men({ a: 'e4A1aGGGG' }) }), true);
  ok('… con una foto con formato inventado', as(bm, { [`monthly/${MOn}/u1`]: men({ a: '<img src=x>' }) }), false);
  ok('con más rebotes de los que llevan las estadísticas (s = 80, mm = 70)', as(bm, { [`monthly/${MOn}/u1`]: men({ s: 80 }) }), false);
  ok('con menos rebotes de los que llevan las estadísticas (s = 60, mm = 70)', as(bm, { [`monthly/${MOn}/u1`]: men({ s: 60 }) }), false);
  ok('sin estadísticas del mes (las de la semana no valen)', as(base, { [`monthly/${MOn}/u1`]: men() }), false);
  ok('con estadísticas del mes pasado (mo = mes − 1)', as({ ...bm, stats: { u1: { ...bm.stats.u1, mo: MOprev } } }, { [`monthly/${MOn}/u1`]: men() }), false);
  ok('en el mes pasado', as(bm, { [`monthly/${MOprev}/u1`]: men() }), false);
  ok('en un mes futuro', as(bm, { [`monthly/${MOn + 1}/u1`]: men() }), false);
  ok('con un nombre que no es el de tu fila del marcador', as(bm, { [`monthly/${MOn}/u1`]: men({ n: 'Otra Persona' }) }), false);
  ok('sin tener fila en el marcador', as({ stats: bm.stats }, { [`monthly/${MOn}/u1`]: men() }), false);
  ok('con la hora inventada', as(bm, { [`monthly/${MOn}/u1`]: men({ t: T0 - 99999 }) }), false);
  ok('con un campo extra', as(bm, { [`monthly/${MOn}/u1`]: men({ oro: 9 }) }), false);
  ok('sin el nombre', as(bm, { [`monthly/${MOn}/u1`]: { s: 70, t: SV } }), false);
  ok('la fila de otra cuenta', as(bm, { [`monthly/${MOn}/u1`]: men() }, 'u2'), false);
  const yaM = { ...bm, monthly: { [MOn]: { u1: { n: 'Matías', s: 70, t: T0 - 60000 } } } };
  ok('actualizar tu mejor partida del mes (70 → 90) cuando las estadísticas ya dicen 90', as({ ...yaM, stats: { u1: { ...bm.stats.u1, mm: 90 } } }, { [`monthly/${MOn}/u1/s`]: 90, [`monthly/${MOn}/u1/t`]: SV }), true);
  ok('bajar tu marca del mes (70 → 50)', as({ ...yaM, stats: { u1: { ...bm.stats.u1, mm: 50 } } }, { [`monthly/${MOn}/u1/s`]: 50, [`monthly/${MOn}/u1/t`]: SV }), false);
  ok('escribir la fila de otra cuenta en el mes actual', as({ ...bm, scores: { u2: { ...fila, n: 'Otra' }, u1: fila }, stats: { u2: bm.stats.u1, u1: bm.stats.u1 } }, { [`monthly/${MOn}/u2`]: men({ n: 'Otra' }) }), false);
  ok('leer el marcador mensual sin sesión', targaryen.database(rules, shiftObj(yaM, 0)).as(null).read(`/monthly/${MOn}`), true);
  ok('leer cualquier mes viejo', targaryen.database(rules, shiftObj(yaM, 0)).as(null).read(`/monthly/${MOprev - 3}`), true);

  console.log(' Mensual: las estadísticas del mes (mo, mm, ml)');
  const runM = (h = 60, lr = T0) => ({ runs: { u1: { s: T0, b: 'peso1', r: 1, e: T0 + 60000, h, p: h } }, wallets: { u1: { c: 5000, sp: 0, lr } }, scores: { u1: { n: 'Matías', k: 'matias', s: h, t: T0 - 100, c: h } } });
  const SM = (o = {}) => ({ g: 3, r: 100, sl: T0 - 900000, d: D, dg: 2, dr: 50, dm: 40, dc: 3, ...o });
  const mesW = (mm, over = {}) => ({ 'stats/u1/mo': MOn, 'stats/u1/mm': mm, 'stats/u1/ml': T0, ...over });
  ok('la primera partida del mes crea mo, mm (= sus rebotes) y ml', as({ ...runM(70), stats: { u1: SM() } }, mesW(70)), true);
  ok('otra partida del mes: mm pasa a la mayor (50 → 70)', as({ ...runM(70), stats: { u1: SM({ mo: MOn, mm: 50, ml: T0 - 900000 }) } }, mesW(70)), true);
  ok('la mejor del mes no baja si la nueva partida fue peor (90 se queda en 90)', as({ ...runM(60), stats: { u1: SM({ mo: MOn, mm: 90, ml: T0 - 900000 }) } }, mesW(90)), true);
  ok('… pero no se puede bajar a 60', as({ ...runM(60), stats: { u1: SM({ mo: MOn, mm: 90, ml: T0 - 900000 }) } }, mesW(60)), false);
  ok('mejor del mes inflada (mm = 500 con una partida de 60)', as({ ...runM(60), stats: { u1: SM() } }, mesW(500)), false);
  ok('mes nuevo: la marca del mes pasado (90) no se arrastra, mm = 60', as({ ...runM(60), stats: { u1: SM({ mo: MOprev, mm: 90, ml: T0 - 900000 }) } }, mesW(60)), true);
  ok('… y arrastrar los 90 del mes pasado no vale', as({ ...runM(60), stats: { u1: SM({ mo: MOprev, mm: 90, ml: T0 - 900000 }) } }, mesW(90)), false);
  ok('un mes que no es el actual (mo = mes − 1)', as({ ...runM(70), stats: { u1: SM() } }, mesW(70, { 'stats/u1/mo': MOprev })), false);
  ok('un mes futuro (mo = mes + 1)', as({ ...runM(70), stats: { u1: SM() } }, mesW(70, { 'stats/u1/mo': MOn + 1 })), false);
  ok('la misma partida dos veces en el mes', as({ ...runM(70), stats: { u1: SM({ mo: MOn, mm: 70, ml: T0 }) } }, mesW(70)), false);
  ok('sin marcar la partida (ml)', as({ ...runM(70), stats: { u1: SM() } }, { 'stats/u1/mo': MOn, 'stats/u1/mm': 70 }), false);
  ok('marcar una partida que no es la última cobrada (ml = T0 + 7)', as({ ...runM(70), stats: { u1: SM() } }, mesW(70, { 'stats/u1/ml': T0 + 7 })), false);
  ok('una partida que no se cobró todavía no cuenta', as({ ...runM(70, T0 - 80000), stats: { u1: SM() } }, mesW(70)), false);
  ok('una partida de menos de ' + MI.minRebotes + ' rebotes no cuenta', as({ ...runM(MI.minRebotes - 1), stats: { u1: SM() } }, mesW(MI.minRebotes - 1)), false);
  ok('las estadísticas del mes de otra cuenta', as({ ...runM(70), stats: { u2: SM() } }, mesW(70), 'u2'), false);
  ok('el mes se escribe aparte de las demás estadísticas (las de las misiones no hacen falta en el mismo envío)', as({ ...runM(70), stats: { u1: SM({ sl: T0 }) } }, mesW(70)), true);

  console.log(' El top Millonarios ya no existe (scores/<uid>/w se rechaza)');
  const cart = { wallets: { u1: { c: 5000, sp: 1200, lr: T0 - 99999 } }, scores: { u1: fila } };
  ok('guardar un total ganado ($5.000) en tu fila del marcador', as(cart, { 'scores/u1/w': 5000 }), false);
  ok('guardar la billetera ($3.800) en tu fila del marcador', as(cart, { 'scores/u1/w': 3800 }), false);
  ok('una fila vieja que todavía tiene el campo w sigue pudiendo cambiar su emblema (el dato viejo no estorba)', as({ ...cart, scores: { u1: { ...fila, w: 3800 } } }, { 'scores/u1/a': 'e41A33GGG' }), true);
  ok('leer todas las filas del marcador', targaryen.database(rules, shiftObj({ scores: { u1: { ...fila, w: 3800 } } }, 0)).as(null).read('/scores'), true);

  console.log(' Insignias (roles)');
  ok('ponerte una insignia de desarrollador desde el juego', as(base, { 'roles/u1': 'dev' }), false);
  ok('ponerte la insignia del Tío Patito', as(base, { 'roles/u1': 'tio' }), false);
  ok('borrar la insignia de otra cuenta', db({ roles: { u2: 'dev' } }, T0).write('/roles/u2', null), false);
  ok('leer las insignias sin sesión', targaryen.database(rules, shiftObj({ roles: { u1: 'dev', u2: 'tio', u3: 'tia' } }, 0)).as(null).read('/roles'), true);
}

// ---------- ruleta diaria: el resultado sale de la hora del servidor y no se puede elegir ----------
console.log('Ruleta diaria');
{
  const RU = ECO.ruleta, N = RU.premios.reduce((a, x) => a + x[2], 0), DAYMS = 86400000, OFF = -3 * 3600000;
  const realNow = Date.now, NOW = Math.floor(realNow() / 20) * 20 + 3;       // reloj congelado: así el resultado de un giro hecho «ahora» (NOW % 20) y la hora de los giros guardados son exactos
  Date.now = () => NOW;
  try {
    const as = (data, upd, uid = 'u1') => db(data, NOW, uid).update('/', upd);
    const sinceMid = (NOW + OFF) % DAYMS, ago = Math.max(1000, Math.min(5 * 60000, sinceMid - 2000));
    const tSeg = (seg, back = ago) => Math.floor((NOW - back - seg) / N) * N + seg;            // una hora de hace un rato (de hoy) cuyo resultado es la casilla `seg`
    const premioDe = t => { const x = ((t % N) + N) % N; let acc = 0; for (const [v, m, w] of RU.premios) { acc += w; if (x < acc) return { v, m }; } };
    const segDe = (v, m) => { let acc = 0; for (const [pv, pm, w] of RU.premios) { if (pv === v && pm === m) return acc; acc += w; } return -1; };
    ok('las casillas de la ruleta suman 20 y hay de pesos y de multiplicador', { allowed: N === 20 && RU.premios.some(x => x[1] > 0) && RU.premios.some(x => x[0] > 0) }, true);
    const cart = (c = 1000) => ({ wallets: { u1: { c, sp: 0, lr: NOW - 99999 } } });
    const strk = { streaks: { u1: { n: 3, t: NOW - 3600000, x2: 1, x3: 0, y2: 0, y3: 0, y4: 0 } } };

    console.log(' Girar');
    ok('el primer giro del día: ruleta/u1/t = hora del servidor', as({}, { 'ruleta/u1/t': SV }), true);
    ok('el giro con una hora inventada', as({}, { 'ruleta/u1/t': NOW - 5000 }), false);
    ok('el giro con una hora futura', as({}, { 'ruleta/u1/t': NOW + 5000 }), false);
    ok('un segundo giro el mismo día', as({ ruleta: { u1: { t: tSeg(0), c: tSeg(0) } } }, { 'ruleta/u1/t': SV }), false);
    ok('un giro al día siguiente', as({ ruleta: { u1: { t: tSeg(0, DAYMS), c: tSeg(0, DAYMS) } } }, { 'ruleta/u1/t': SV }), true);
    ok('girar la ruleta de otra cuenta', as({}, { 'ruleta/u1/t': SV }, 'u2'), false);
    ok('un giro con campos extra', as({}, { 'ruleta/u1/t': SV, 'ruleta/u1/oro': 1 }), false);
    ok('borrar el giro de hoy para girar otra vez', db({ ruleta: { u1: { t: tSeg(0), c: tSeg(0) } } }, NOW).write('/ruleta/u1', null), false);
    ok('cambiar la hora del giro de hoy hacia atrás (para volver a girar o a cobrar)', as({ ruleta: { u1: { t: tSeg(0) } } }, { 'ruleta/u1/t': tSeg(0, DAYMS) }), false);
    ok('girar y cobrar en la misma escritura (c = hora del servidor)', as({}, { 'ruleta/u1/t': SV, 'ruleta/u1/c': SV }), false);
    for (const [v] of RU.premios.filter(x => x[0] > 0)) ok(`girar y cobrar $${v} en la misma escritura (reintentar hasta acertar)`, as({ ...cart(), ruleta: {} }, { 'ruleta/u1/t': SV, 'ruleta/u1/c': SV, 'wallets/u1/c': 1000 + v, 'wallets/u1/sp': 0 }), false);
    ok('girar y guardar un multiplicador en la misma escritura', as({ ...strk }, { 'ruleta/u1/t': SV, 'ruleta/u1/c': SV, 'streaks/u1/y2': 1 }), false);
    ok('girar y subir los pesos sin cobrar el giro', as({ ...cart() }, { 'ruleta/u1/t': SV, 'wallets/u1/c': 1300, 'wallets/u1/sp': 0 }), false);

    console.log(' Cobrar el giro (el premio sale de la hora guardada)');
    for (const [v, m, w] of RU.premios) {
      const seg = segDe(v, m), t0 = tSeg(seg), g = { ...cart(1000), ...strk, ruleta: { u1: { t: t0 } } };
      if (v > 0) {
        ok(`casilla ${seg} paga $${v}`, as(g, { 'ruleta/u1/c': t0, 'wallets/u1/c': 1000 + v, 'wallets/u1/sp': 0 }), true);
        ok(`casilla ${seg} ($${v}) cobrando $1 de más`, as(g, { 'ruleta/u1/c': t0, 'wallets/u1/c': 1000 + v + 1, 'wallets/u1/sp': 0 }), false);
        ok(`casilla ${seg} ($${v}) cobrando $1 de menos`, as(g, { 'ruleta/u1/c': t0, 'wallets/u1/c': 1000 + v - 1, 'wallets/u1/sp': 0 }), false);
        ok(`casilla ${seg} ($${v}) pidiendo un multiplicador`, as(g, { 'ruleta/u1/c': t0, 'streaks/u1/y2': 1 }), false);
      } else {
        ok(`casilla ${seg} regala un multiplicador ×${m} (se guarda aparte, en y${m}: dura 5 minutos)`, as(g, { 'ruleta/u1/c': t0, [`streaks/u1/y${m}`]: (g.streaks.u1['y' + m] || 0) + 1 }), true);
        ok(`casilla ${seg} (×${m}) guardándolo entre los de la racha (x${m}: duraría 10 minutos)`, as(g, { 'ruleta/u1/c': t0, [`streaks/u1/x${m}`]: (g.streaks.u1['x' + m] || 0) + 1 }), false);
        ok(`casilla ${seg} (×${m}) pidiendo pesos`, as(g, { 'ruleta/u1/c': t0, 'wallets/u1/c': 1300, 'wallets/u1/sp': 0 }), false);
        ok(`casilla ${seg} (×${m}) guardando ${m === 2 ? '×3' : '×2'} en vez de ×${m}`, as(g, { 'ruleta/u1/c': t0, [`streaks/u1/y${m === 2 ? 3 : 2}`]: (g.streaks.u1['y' + (m === 2 ? 3 : 2)] || 0) + 1 }), false);
        ok(`casilla ${seg} (×${m}) guardando dos`, as(g, { 'ruleta/u1/c': t0, [`streaks/u1/y${m}`]: (g.streaks.u1['y' + m] || 0) + 2 }), false);
        ok(`casilla ${seg} (×${m}) sin racha (no hay dónde guardarlo)`, as({ ...cart(), ruleta: { u1: { t: t0 } } }, { 'ruleta/u1/c': t0, [`streaks/u1/y${m}`]: 1 }), false);
      }
    }
    // borde de cada casilla: la última hora de una casilla y la primera de la siguiente pagan distinto
    { const lim = RU.premios[0][2], tA = tSeg(lim - 1), tB = tSeg(lim), a = premioDe(tA), b = premioDe(tB);
      ok(`la casilla ${lim - 1} y la ${lim} (borde entre dos premios) pagan lo que dice la tabla`, as({ ...cart(), ruleta: { u1: { t: tA } } }, { 'ruleta/u1/c': tA, 'wallets/u1/c': 1000 + a.v, 'wallets/u1/sp': 0 }).allowed && as({ ...cart(), ruleta: { u1: { t: tB } } }, { 'ruleta/u1/c': tB, 'wallets/u1/c': 1000 + b.v, 'wallets/u1/sp': 0 }).allowed ? { allowed: true } : { allowed: false }, true); }
    const t300 = tSeg(0), g0 = { ...cart(1000), ruleta: { u1: { t: t300 } } };
    ok('cobrar el premio grande ($5.000) con la casilla 0 ($500)', as(g0, { 'ruleta/u1/c': t300, 'wallets/u1/c': 6000, 'wallets/u1/sp': 0 }), false);
    ok('cobrar el mismo giro dos veces', as({ ...cart(1300), ruleta: { u1: { t: t300, c: t300 } } }, { 'ruleta/u1/c': t300, 'wallets/u1/c': 1600, 'wallets/u1/sp': 0 }), false);
    ok('cobrar con una hora distinta a la del giro (c ≠ t)', as(g0, { 'ruleta/u1/c': t300 + 1, 'wallets/u1/c': 1300, 'wallets/u1/sp': 0 }), false);
    ok('cobrar cambiando también la hora del giro (para que toque otra casilla)', as(g0, { 'ruleta/u1/t': tSeg(RU.premios[0][2] + 5), 'ruleta/u1/c': tSeg(RU.premios[0][2] + 5), 'wallets/u1/c': 1000 + premioDe(tSeg(RU.premios[0][2] + 5)).v, 'wallets/u1/sp': 0 }), false);
    ok('cobrar sin haber girado (no hay ruleta/u1/t)', as({ ...cart() }, { 'ruleta/u1/c': NOW, 'wallets/u1/c': 1300, 'wallets/u1/sp': 0 }), false);
    ok('cobrar el giro de otra cuenta', as({ ...cart(), ruleta: { u1: { t: t300 } } }, { 'ruleta/u1/c': t300, 'wallets/u1/c': 1300, 'wallets/u1/sp': 0 }, 'u2'), false);
    ok('subir los pesos con la ruleta sin cobrar el giro', as(g0, { 'wallets/u1/c': 1300, 'wallets/u1/sp': 0 }), false);
    ok('cobrar solo marcando el giro (sin pesos) vale: no se gana nada', as(g0, { 'ruleta/u1/c': t300 }), true);
    ok('cobrar un giro de hace días (sigue siendo el último giro y no se había cobrado)', as({ ...cart(), ruleta: { u1: { t: tSeg(0, 3 * DAYMS) } } }, { 'ruleta/u1/c': tSeg(0, 3 * DAYMS), 'wallets/u1/c': 1000 + premioDe(tSeg(0, 3 * DAYMS)).v, 'wallets/u1/sp': 0 }), true);
    ok('leer tu ruleta', db({ ruleta: { u1: { t: t300 } } }, NOW).read('/ruleta/u1'), true);
    ok('leer la de otra cuenta', db({ ruleta: { u1: { t: t300 } } }, NOW, 'u2').read('/ruleta/u1'), false);
    ok('leer todas', db({ ruleta: { u1: { t: t300 } } }, NOW).read('/ruleta'), false);
  } finally { Date.now = realNow; }
}

// ---------- grupo VIP: el WhatsApp de quien desbloqueó el personaje secreto ----------
console.log('Grupo VIP (WhatsApp)');
{
  const SEC = cx.window.TIENDA.ch.find(c => c.secret).id, TIENE = { wallets: { u1: { c: 5e8, sp: 1e8, own: { ['ch_' + SEC]: true } } } }, SIN = { wallets: { u1: { c: 5e8, sp: 0 } } };
  const rec = (o = {}) => ({ w: '+56912345678', n: 'Matías', t: SV, c: true, ...o });
  const guardar = (data, v, uid = 'u1') => db(data, T0, uid).write('/vip/u1', v);
  ok('quien tiene el personaje secreto deja su WhatsApp', guardar(TIENE, rec()), true);
  ok('número de otro país (+54 9 11 2345 6789)', guardar(TIENE, rec({ w: '+5491123456789' })), true);
  ok('sin el personaje secreto no se puede', guardar(SIN, rec()), false);
  ok('sin cartera tampoco', guardar({}, rec()), false);
  ok('comprar otro personaje no sirve', guardar({ wallets: { u1: { c: 9e6, sp: 1e6, own: { ch_conejo: true } } } }, rec()), false);
  ok('el número de otra cuenta (u2 escribe en vip/u1)', guardar(TIENE, rec(), 'u2'), false);
  ok('sin sesión', targaryen.database(rules, shiftObj(TIENE, 0)).as(null).write('/vip/u1', rec()), false);
  for (const [m, w] of [['sin el «+»', '56912345678'], ['con espacios', '+56 9 1234 5678'], ['muy corto', '+5691234'], ['con letras', '+5691234abcd'], ['con 16 dígitos', '+1234567890123456'], ['que empieza en 0', '+0123456789'], ['con un texto largo', '+56912345678 llámame']])
    ok(`número ${m}`, guardar(TIENE, rec({ w })), false);
  ok('sin aceptar que le escriban (c)', guardar(TIENE, rec({ c: false })), false);
  ok('sin el campo c', guardar(TIENE, { w: '+56912345678', n: 'M', t: SV }), false);
  ok('con una hora inventada', guardar(TIENE, rec({ t: T0 - 5000 })), false);
  ok('con un campo extra', guardar(TIENE, rec({ extra: 1 })), false);
  ok('con un nombre vacío', guardar(TIENE, rec({ n: '' })), false);
  ok('con un nombre larguísimo', guardar(TIENE, rec({ n: 'x'.repeat(41) })), false);
  ok('cambiar su número por otro', guardar({ ...TIENE, vip: { u1: { w: '+56911111111', n: 'M', t: T0 - 9e5, c: true } } }, rec({ w: '+56922222222' })), true);
  ok('borrar su número', db({ ...TIENE, vip: { u1: { w: '+56911111111', n: 'M', t: T0 - 9e5, c: true } } }, T0).write('/vip/u1', null), true);
  ok('borrar el número de otra cuenta', db({ ...TIENE, vip: { u1: { w: '+56911111111', n: 'M', t: T0 - 9e5, c: true } } }, T0, 'u2').write('/vip/u1', null), false);
  ok('leer su propio número', db({ ...TIENE, vip: { u1: { w: '+56911111111', n: 'M', t: T0 - 9e5, c: true } } }, T0).read('/vip/u1'), true);
  ok('leer el número de otra cuenta', db({ ...TIENE, vip: { u1: { w: '+56911111111', n: 'M', t: T0 - 9e5, c: true } } }, T0, 'u2').read('/vip/u1'), false);
  ok('listar todos los números', db({ ...TIENE, vip: { u1: { w: '+56911111111', n: 'M', t: T0 - 9e5, c: true } } }, T0).read('/vip'), false);
  ok('leer los números sin sesión', targaryen.database(rules, shiftObj({ vip: { u1: { w: '+56911111111', n: 'M', t: 1, c: true } } }, 0)).as(null).read('/vip/u1'), false);
}

// ---------- marco dorado: registro de quiénes tienen el personaje secreto (compradores) y quién lleva el marco puesto (marco) ----------
console.log('Marco dorado (compradores y marco)');
{
  const SEC = cx.window.TIENDA.ch.find(c => c.secret).id, TIENE = { wallets: { u1: { c: 5e8, sp: 1e8, own: { ['ch_' + SEC]: true } } } }, SIN = { wallets: { u1: { c: 5e8, sp: 0 } } };
  const reg = (o = {}) => ({ n: 'Matías', t: SV, ...o });
  const REG = { ...TIENE, compradores: { u1: { n: 'Matías', t: T0 - 9e5 } } }, PUESTO = { ...REG, marco: { u1: true } };
  const sinSesion = (data, f) => f(targaryen.database(rules, shiftObj(data, 0)).as(null));
  // el registro de compradores
  ok('quien tiene el personaje secreto queda anotado (nombre y hora del servidor)', db(TIENE, T0).write('/compradores/u1', reg()), true);
  ok('sin el personaje secreto no', db(SIN, T0).write('/compradores/u1', reg()), false);
  ok('sin cartera tampoco', db({}, T0).write('/compradores/u1', reg()), false);
  ok('comprar otro personaje no sirve', db({ wallets: { u1: { c: 9e6, sp: 1e6, own: { ch_conejo: true } } } }, T0).write('/compradores/u1', reg()), false);
  ok('anotar a otra cuenta (u2 escribe en compradores/u1)', db(TIENE, T0, 'u2').write('/compradores/u1', reg()), false);
  ok('sin sesión', sinSesion(TIENE, d => d.write('/compradores/u1', reg())), false);
  ok('con una hora inventada', db(TIENE, T0).write('/compradores/u1', reg({ t: T0 - 5000 })), false);
  ok('sin nombre', db(TIENE, T0).write('/compradores/u1', reg({ n: '' })), false);
  ok('con un nombre de 17 letras', db(TIENE, T0).write('/compradores/u1', reg({ n: 'x'.repeat(17) })), false);
  ok('con un nombre de 16 letras (cuentas antiguas)', db(TIENE, T0).write('/compradores/u1', reg({ n: 'x'.repeat(16) })), true);
  ok('con un campo extra', db(TIENE, T0).write('/compradores/u1', reg({ extra: 1 })), false);
  ok('sin la hora', db(TIENE, T0).write('/compradores/u1', { n: 'M' }), false);
  ok('volver a anotarse con otra hora (la hora no se puede cambiar)', db(REG, T0).write('/compradores/u1', reg()), false);
  ok('cambiar solo el nombre (la hora queda igual)', db(REG, T0).update('/compradores/u1', { n: 'Otro' }), true);
  ok('cambiar la hora a mano', db(REG, T0).update('/compradores/u1', { t: T0 - 1 }), false);
  ok('borrar el registro', db(REG, T0).write('/compradores/u1', null), false);
  ok('leer su propio registro', db(REG, T0).read('/compradores/u1'), true);
  ok('leer el registro de otra cuenta', db(REG, T0, 'u2').read('/compradores/u1'), false);
  ok('listar todos los registros', db(REG, T0).read('/compradores'), false);
  ok('leer el registro sin sesión', sinSesion(REG, d => d.read('/compradores/u1')), false);
  // el marco puesto (lo único público)
  ok('ponerse el marco con el registro ya hecho', db(REG, T0).write('/marco/u1', true), true);
  ok('registrarse y ponerse el marco en la misma escritura', db(TIENE, T0).update('/', { 'compradores/u1': reg(), 'marco/u1': true }), true);
  ok('ponerse el marco sin haberse registrado', db(TIENE, T0).write('/marco/u1', true), false);
  ok('ponerse el marco sin el personaje secreto', db({ ...SIN, compradores: { u1: { n: 'M', t: T0 - 9e5 } } }, T0).write('/marco/u1', true), false);
  ok('ponerle el marco a otra cuenta (u2 escribe en marco/u1)', db(REG, T0, 'u2').write('/marco/u1', true), false);
  ok('ponerse el marco sin sesión', sinSesion(REG, d => d.write('/marco/u1', true)), false);
  for (const [m, v] of [['false', false], ['1', 1], ['«si»', 'si'], ['un objeto', { a: 1 }]]) ok(`marco con el valor ${m}`, db(REG, T0).write('/marco/u1', v), false);
  ok('marco con un campo adentro', db(REG, T0).write('/marco/u1/x', true), false);
  ok('sacarse el marco', db(PUESTO, T0).write('/marco/u1', null), true);
  ok('sacarle el marco a otra cuenta', db(PUESTO, T0, 'u2').write('/marco/u1', null), false);
  ok('los demás ven quién lleva marco (lectura pública, con sesión)', db(PUESTO, T0, 'u2').read('/marco'), true);
  ok('y también sin sesión', sinSesion(PUESTO, d => d.read('/marco')), true);
  ok('quien se sacó el marco no aparece en lo público (el registro sigue cerrado)', db(REG, T0, 'u2').read('/compradores'), false);
}

console.log(`\n${pass} correctas, ${fail} fallas`);
process.exit(fail ? 1 : 0);
