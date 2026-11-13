// Reglas de la V2 (v2/juego/firebase-rules.json): marcador Arcade y power-ups. Corre con: node reglas-v2.test.js
const targaryen = require('targaryen'), path = require('path'), fs = require('fs');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'v2', 'juego', 'firebase-rules.json'), 'utf8'));
let fallas = 0, total = 0;
const ok = (nombre, cond) => { total++; if (cond) console.log('  ok  ', nombre); else { fallas++; console.log('  FALLA', nombre); } };
const ana = { uid: 'ana', provider: 'password' }, beto = { uid: 'beto', provider: 'password' };
const base = () => ({ wallets: { ana: { c: 2000000, sp: 0 } }, runs: { ana: { s: 1000, e: 61000, h: 40, b: 'peso1', r: 1, p: 41 } }, v2: { ana: { pu: { slow: 2 } } } });
const db = (data, auth) => targaryen.database(rules, data).with({ debug: false }).as(auth);

console.log('Marcador Arcade');
ok('cualquiera lo lee', db(base(), null).read('/arcade').allowed);
ok('tu récord Arcade se guarda si cabe en tu partida terminada', db(base(), ana).write('/arcade/ana', { n: 'Ana', s: 40, t: { '.sv': 'timestamp' } }).allowed);
ok('no puedes poner más rebotes que los de tu partida', !db(base(), ana).write('/arcade/ana', { n: 'Ana', s: 41, t: { '.sv': 'timestamp' } }).allowed);
ok('no puedes escribir el de otro', !db(base(), beto).write('/arcade/ana', { n: 'Ana', s: 40, t: { '.sv': 'timestamp' } }).allowed);
const conRecord = { ...base(), arcade: { ana: { n: 'Ana', s: 40, t: 1 } } };
ok('el récord no baja', !db(conRecord, ana).write('/arcade/ana', { n: 'Ana', s: 10, t: { '.sv': 'timestamp' } }).allowed);

console.log('Power-ups de pago');
ok('usar uno (bajar en 1) está permitido', db(base(), ana).write('/v2/ana/pu/slow', 1).allowed);
ok('comprar uno con pesos: +1 pagando exactamente $500.000 en la misma escritura', db(base(), ana).update('/', { 'v2/ana/pu/slow': 3, 'wallets/ana/sp': 500000 }).allowed);
ok('comprar uno sin pagar: rechazado', !db(base(), ana).write('/v2/ana/pu/slow', 3).allowed);
ok('pagar menos: rechazado', !db(base(), ana).update('/', { 'v2/ana/pu/slow': 3, 'wallets/ana/sp': 499999 }).allowed);
ok('sumarse varios de una (los packs los entrega el servidor): rechazado', !db(base(), ana).update('/', { 'v2/ana/pu/slow': 7, 'wallets/ana/sp': 500000 }).allowed);
ok('un power-up que no existe: rechazado', !db(base(), ana).write('/v2/ana/pu/turbo', 1).allowed);
ok('«Sin anuncios» no lo puede activar el jugador (lo entrega el servidor)', !db(base(), ana).write('/v2/ana/na', true).allowed);
ok('nadie lee los power-ups de otro', !db(base(), beto).read('/v2/ana').allowed);

console.log('Cambio de nombre: una vez cada 30 días');
ok('la primera vez se anota la hora del servidor', db(base(), ana).write('/v2/ana/nc', { '.sv': 'timestamp' }).allowed);
const reciente = { ...base(), v2: { ana: { pu: { slow: 2 }, nc: Date.now() - 86400000 } } };
ok('a los 1 días, no', !db(reciente, ana).write('/v2/ana/nc', { '.sv': 'timestamp' }).allowed);
const viejo = { ...base(), v2: { ana: { pu: { slow: 2 }, nc: Date.now() - 31 * 86400000 } } };
ok('a los 31 días, sí', db(viejo, ana).write('/v2/ana/nc', { '.sv': 'timestamp' }).allowed);

console.log('Sonidos de rebote: se compran como cualquier artículo');
const w = { ...base() };
ok('comprar «Pato» pagando su precio', db(w, ana).update('/wallets/ana', { sp: 800, 'own/sfx_cuac': true }).allowed);
ok('equiparlo sin comprarlo: rechazado', !db(w, ana).write('/wallets/ana/eq/sfx', 'cuac').allowed);

console.log(`\n${total - fallas} correctas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
