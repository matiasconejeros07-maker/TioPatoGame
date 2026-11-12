#!/usr/bin/env node
// Genera firebase-rules.json a partir del catálogo de tienda.js.
// Así Firebase valida lo mismo que el juego: precios, recompensas y el tiempo real que dura una partida.
// Cada campo lleva sus propias comprobaciones (no se confía en reglas del nodo padre), para que no se puedan saltar escribiendo una sola ruta.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'tienda.js'), 'utf8'), ctx);
const T = ctx.window.TIENDA, ECO = T.eco, E = ECO.tier;
const CATS = ['ch', 'bg', 'pad', 'ball', 'th'];                  // th = colores del juego
const MAIL = '@tio-pato.invalid';
const SECRET = T.ch.find(c => c.secret).id;       // el personaje secreto (sus compras se guardan como own/ch_<id>)
// pesos por punto de cada pelota (ball[].rate): se escribe como una cadena de «?:» sobre el id de la pelota que quedó anotada al empezar la partida
const rateExp = b => '(' + T.ball.map(i => `${b} === '${i.id}' ? ${i.rate}`).join(' : ') + ' : 0)';

// pesos ganados con h rebotes: $1 por rebote del 1 al 99, $2 del 100 al 199, $3 del 200 al 299…
// h + E·t(t−1)/2 + t·(h − E·t + 1), con t = ⌊h/E⌋ (las reglas no tienen variables locales, por eso se repite la expresión).
const tExp = h => `((${h} - (${h} % ${E})) / ${E})`;
const pesosExp = h => `(${h} + ${E} * ${tExp(h)} * (${tExp(h)} - 1) / 2 + ${tExp(h)} * (${h} - ${E} * ${tExp(h)} + 1))`;

const RUN = "newData.parent().parent().parent().child('runs').child($uid)";
const AVATAR = "newData.isString() && newData.val().matches(/^e[0-9A-Za-z_-]{4}([0-9A-Za-z_-]{4}){1,5}$/)";       // foto de perfil (emblema): 'e' + 4 de forma/colores/diseño + de 1 a 5 símbolos de 4 caracteres


// ---- racha diaria ----
// Todo lo decide el servidor: el día (medianoche del huso de Chile), si la racha sigue o se corta, cuánto se paga y cuándo empieza el «pesos dobles».
// Las reglas no tienen variables locales, por eso las fórmulas se escriben completas con funciones que devuelven texto.
const R = ECO.racha, DAY = 86400000, OFF = R.huso * 3600000;
const dayOf = ts => `((${ts} + (${OFF}) - (${ts} + (${OFF})) % ${DAY}) / ${DAY})`;        // número de día (entero) de una hora en ms
const TODAY = dayOf('now');
const STR = "newData.parent().parent().parent().child('streaks').child($uid)";             // la racha de esta cuenta, vista desde la cartera (ya con lo que se está escribiendo)
const STR_ROOT = "root.child('streaks').child($uid)";                                    // la racha de esta cuenta, vista desde una partida
// n que le toca a la racha: la primera vez 1 · al día siguiente del último cobro n+1 · después de saltarse un día, 1 · el mismo día, -1 (no vale)
const NEXT_N = "(data.parent().child('n').exists() ? (" + `${TODAY} === ${dayOf("data.parent().child('t').val()")} + 1 ? data.parent().child('n').val() + 1 : (${TODAY} > ${dayOf("data.parent().child('t').val()")} ? 1 : -1)` + ") : 1)";
// pesos del día n de la racha: la tabla de los primeros días (los de multiplicador valen 0) y, desde `fijoDesde`, el pago fijo de cada día
const rewardExp = n => `(${n} >= ${R.fijoDesde} ? ${R.fijo} : (` + R.dias.map((v, i) => [v, i]).filter(([v]) => v > 0).map(([v, i]) => `${n} === ${i + 1} ? ${v}`).join(' : ') + ' : 0))';
const MULTS = R.mult.map(([d, m]) => m);                                                    // multiplicadores que se pueden guardar y activar (2, 3, 4)
// multiplicador de una partida: si empezó dentro de lo que dura una activación (bx + bd), paga ×bm (las activaciones antiguas, sin bm, eran ×2)
const BOOST_MS = `(${STR_ROOT}.child('bd').exists() ? ${STR_ROOT}.child('bd').val() : ${R.dobleMs})`;      // lo que dura la activación (bd): 10 min los de la racha, 5 los de la ruleta; las antiguas (sin bd), 10
const BOOST = `(${STR_ROOT}.child('bx').exists() && ${P_ROOT_S()} >= ${STR_ROOT}.child('bx').val() && ${P_ROOT_S()} < ${STR_ROOT}.child('bx').val() + ${BOOST_MS} ? (${STR_ROOT}.child('bm').exists() ? ${STR_ROOT}.child('bm').val() : 2) : 1)`;
function P_ROOT_S() { return "newData.parent().child('s').val()"; }
// contador de puestos (hist): SC = tu fila de scores antes de la escritura · NS = tu fila de scores después
const SC = "root.child('scores').child(auth.uid)", NS = "newData.parent().parent().child('scores').child(auth.uid)";
const HIST_INC = `newData.val() === (data.exists() ? data.val() : 0) + 1 && ${NS}.child('c').val() + '' === $b && (!${SC}.child('c').exists() || ${SC}.child('c').val() + '' !== $b)`;
const HIST_DEC = `data.exists() && newData.val() === data.val() - 1 && ${SC}.child('c').exists() && ${SC}.child('c').val() + '' === $b && ${NS}.child('c').exists() && ${NS}.child('c').val() + '' !== $b`;          // desde wallets/$uid/<campo> o scores/$uid/<campo>
const defaults = {}; for (const c of CATS) defaults[c] = T[c][0].id;

// ---- compras ----
// Cada artículo de pago se valida en su propio nodo (own/$item), no en la cartera: Firebase no corre el .validate de un nodo padre
// cuando alguien escribe solo un hijo (por ejemplo wallets/<uid>/own/ball_diamante = true).
// Un artículo recién comprado exige que lo gastado en ESTA misma escritura (sp nuevo − sp anterior) cubra la SUMA de todos los artículos
// recién comprados, así no se pueden llevar varios pagando solo el más caro. Un id desconocido da precio -1 y se rechaza.
const ITEMS = [];
for (const c of CATS) for (const it of T[c].filter(i => i.price > 0)) ITEMS.push([`${c}_${it.id}`, it.price]);
const WAL = "newData.parent().parent()", OLDW = "root.child('wallets').child($uid)";
const PRICE = '(' + ITEMS.map(([k, p]) => `$item === '${k}' ? ${p}`).join(' : ') + ' : -1)';
const BUY_SUM = '(' + ITEMS.map(([k, p]) => `(${WAL}.child('own').child('${k}').exists() && !${OLDW}.child('own').child('${k}').exists() ? ${p} : 0)`).join(' + ') + ')';
const SP_DELTA = `(${WAL}.child('sp').val() - (${OLDW}.child('sp').exists() ? ${OLDW}.child('sp').val() : 0))`;
// Ediciones limitadas (`until` en tienda.js, hora del servidor en ms): solo se pueden comprar antes de esa hora. Quien ya la tiene la conserva (data.exists()) y puede equiparla siempre.
const LIM = []; for (const c of CATS) for (const it of T[c].filter(i => i.price > 0 && i.until)) LIM.push([`${c}_${it.id}`, it.until]);
const ABIERTO = LIM.length ? '(' + LIM.map(([k, u]) => `$item === '${k}' ? now < ${u}`).join(' : ') + ' : true)' : 'true';
const own = { $item: { '.validate': `newData.val() === true && ${PRICE} > 0 && (data.exists() || (${SP_DELTA} >= ${BUY_SUM} && ${ABIERTO}))` } };

const eq = {};
for (const c of CATS) eq[c] = { '.validate': `newData.isString() && (newData.val() === '${defaults[c]}' || newData.parent().parent().child('own').child('${c}_' + newData.val()).val() === true)` };
eq['$other'] = { '.validate': false };

// tiempo jugado: lo que se suma por una partida ya cobrada es lo que el juego midió que se jugó, pero nunca más de lo que duró (hora de fin - hora de inicio, las dos del servidor) ni más del tope por rebotes
const TI = ECO.tiempo, RV = f => `${RUN}.child('${f}').val()`;
const DUR = `(${RV('e')} - ${RV('s')})`, CAP = `(${RV('h')} * ${TI.msPorRebote} + ${TI.holguraMs})`;
const TIMEINC = `(${DUR} < ${CAP} ? ${DUR} : ${CAP})`;
// misiones: estadísticas que solo suben al cobrar partidas de verdad (stats), logros de una sola vez (missions) y 3 misiones por día (dc = casillas ya cobradas hoy).
const M = ECO.misiones, W_ROOT = "root.child('wallets').child($uid)", OLDP = 'data.parent()';
const bit = (v, k) => `(${v} % ${2 ** (k + 1)} >= ${2 ** k})`;                               // ¿está encendido el bit k de v?
const DSAME = `(${OLDP}.child('d').exists() && ${OLDP}.child('d').val() === newData.parent().child('d').val())`;       // el contador del día ya era de hoy
// una partida se suma una sola vez a las estadísticas: su `sl` pasa a ser la partida cobrada y antes era una anterior
const FRESH = `newData.parent().child('sl').val() === ${RV('s')} && (!${OLDP}.child('sl').exists() || ${OLDP}.child('sl').val() < ${RV('s')})`;
const STAT = { g: 'dg', r: 'dr', m: 'dm' };
// misión de la casilla k del día: se elige entre 3 según la fecha ((día × 5 + 2k) % 7 % 3), igual para todos
const pickJ = k => `(((${TODAY}) * 5 + ${2 * k}) % 7 % 3)`;
const condDia = k => { const j = pickJ(k), d = M.dia[k].de; return `(${j} === 0 ? newData.parent().child('${STAT[d[0][0]]}').val() >= ${d[0][1]} : ${j} === 1 ? newData.parent().child('${STAT[d[1][0]]}').val() >= ${d[1][1]} : newData.parent().child('${STAT[d[2][0]]}').val() >= ${d[2][1]})`; };
// misiones de la semana: la semana empieza el lunes (el día 0 de la cuenta es jueves); en cada casilla se elige 1 de 5 misiones según la semana, igual para todos
const WEEK = `((${TODAY} + 3 - (${TODAY} + 3) % 7) / 7)`;
// mes calendario (hora de Chile) como número AAAAMM (p. ej. 202611). Las reglas no tienen variables ni funciones, así que la fórmula va completa y en 4 pasos:
// el año se cuenta desde el 1 de marzo (el 29 de febrero cae al final del año y los meses salen con una sola división) y se repite cada 4 años (vale de 1972 a 2099).
//   E = días desde el 1/3/1972 (día 790) · C = ciclos de 4 años · R = día dentro del ciclo · YC = año del ciclo (0 a 3; el último tiene 366 días) · DOY = día del año · MP = mes (0 = marzo … 11 = febrero)
const mE = `(${TODAY} - 790)`, mR = `(${mE} % 1461)`, mC = `((${mE} - ${mR}) / 1461)`;
const mYC = `(${mR} >= 1095 ? 3 : (${mR} - ${mR} % 365) / 365)`, mDOY = `(${mR} - 365 * ${mYC})`, mMP = `((5 * ${mDOY} + 2 - (5 * ${mDOY} + 2) % 153) / 153)`;
const MONTH = `(${mMP} < 10 ? (1972 + 4 * ${mC} + ${mYC}) * 100 + ${mMP} + 3 : (1973 + 4 * ${mC} + ${mYC}) * 100 + ${mMP} - 9)`;
const MSAME = `(${OLDP}.child('mo').exists() && ${OLDP}.child('mo').val() === newData.parent().child('mo').val())`;       // el contador del mes ya era de este mes
const MFRESH = `newData.parent().child('ml').val() === ${RV('s')} && (!${OLDP}.child('ml').exists() || ${OLDP}.child('ml').val() < ${RV('s')})`;      // la partida se cuenta una sola vez en el mes
const WSAME = `(${OLDP}.child('w').exists() && ${OLDP}.child('w').val() === newData.parent().child('w').val())`;       // el contador de la semana ya era de esta semana
const SEM = M.semana, WSTAT = { g: 'wg', r: 'wr', m: 'wm' };
const pickW = k => `((${WEEK} * 13 + ${7 * k}) % 17 % ${SEM.de[k].length})`;
const condSem = k => { const j = pickW(k), d = SEM.de[k]; return d.map(([t, meta], i) => `(${j} === ${i} && newData.parent().child('${WSTAT[t]}').val() >= ${meta})`).join(' || '); };
const condLogro = (tipo, meta) => ({
  g: `root.child('stats').child($uid).child('g').val() >= ${meta}`,
  r: `root.child('stats').child($uid).child('r').val() >= ${meta}`,
  b: `root.child('scores').child($uid).child('s').val() >= ${meta}`,
  s: `root.child('streaks').child($uid).child('n').val() >= ${meta}`,
  e: `${W_ROOT}.child('av').exists()`,
  c: `${W_ROOT}.child('sp').val() >= ${meta}`,
  t: `root.child('scores').child($uid).child('ms').val() >= ${meta}`,
  v: `auth.token.email_verified === true && !auth.token.email.endsWith('${MAIL}')`
})[tipo];
const NEWM = "newData.parent().parent().parent().child('missions').child($uid)", OLDM = "root.child('missions').child($uid)";
const NEWDC = "(newData.parent().parent().parent().child('stats').child($uid).child('dc').exists() ? newData.parent().parent().parent().child('stats').child($uid).child('dc').val() : 0)";
const OLDDC = "(root.child('stats').child($uid).child('dc').exists() ? root.child('stats').child($uid).child('dc').val() : 0)";
const MIS_SUM = '(' + M.logros.map(([id, , , premio]) => `(${NEWM}.child('${id}').exists() && !${OLDM}.child('${id}').exists() ? ${premio} : 0)`).join(' + ') + ')';
const DIA_SUM = '(' + M.dia.map((x, k) => `(${bit(NEWDC, k)} && !${bit(OLDDC, k)} ? ${x.premio} : 0)`).join(' + ') + ')';
const NEWWC = "(newData.parent().parent().parent().child('stats').child($uid).child('wc').exists() ? newData.parent().parent().parent().child('stats').child($uid).child('wc').val() : 0)";
const OLDWC = "(root.child('stats').child($uid).child('wc').exists() ? root.child('stats').child($uid).child('wc').val() : 0)";
const SEM_SUM = '(' + SEM.premios.map((pr, k) => `(${bit(NEWWC, k)} && !${bit(OLDWC, k)} ? ${pr} : 0)`).join(' + ') + ')';
const INV_OLD = m => `(data.exists() ? data.val() : 0)`;                                      // (se usa dentro de x<m>: su valor anterior)
const INV_DEC = (k, m) => `(${P}.child('${k}${m}').exists() && data.parent().child('${k}${m}').exists() && ${P}.child('${k}${m}').val() + 1 === data.parent().child('${k}${m}').val())`;       // desde bx: ¿el contador k<m> (x = de la racha, y = de la ruleta) bajó en 1 en esta escritura?
// ruleta diaria: el giro anota la hora del servidor (ruleta/<uid>/t) y de esa hora sale el resultado (hora en ms % 20); el cobro es otra escritura (ruleta/<uid>/c = t) que repite la cuenta.
// Un giro y su cobro NUNCA van en la misma escritura (si no, se podría reintentar hasta acertar el premio grande): el cobro exige que `t` ya estuviera guardado y no cambie.
const RU = ECO.ruleta, NEWR = "newData.parent().parent().parent().child('ruleta').child($uid)", OLDR = "root.child('ruleta').child($uid)";
const RU_N = RU.premios.reduce((a, x) => a + x[2], 0);
const RU_MULTS = [...new Set(RU.premios.filter(x => x[1] > 0).map(x => x[1]))];                  // multiplicadores que puede dar la ruleta (2, 3, 4)
const OLD_DUR = `(data.parent().child('bd').exists() ? data.parent().child('bd').val() : ${R.dobleMs})`;      // lo que duraba la activación anterior (desde bx: puede volver a activarse cuando venció)
const RU_ACUM = []; { let acc = 0; for (const [v, m, w] of RU.premios) { acc += w; RU_ACUM.push([acc, v, m]); } }
const ruChain = (t, k) => '(' + RU_ACUM.map(([lim, v, m]) => `((${t}) % ${RU_N}) < ${lim} ? ${k === 'v' ? v : m}`).join(' : ') + ' : 0)';
const RU_T = `${NEWR}.child('t').val()`;
const RU_CLAIM = `(${NEWR}.child('c').exists() && ${NEWR}.child('c').val() === ${RU_T} && ${OLDR}.child('t').val() === ${RU_T} && (!${OLDR}.child('c').exists() || ${OLDR}.child('c').val() !== ${RU_T}))`;      // en esta escritura se cobra el giro ya guardado
const P = "newData.parent()";
const rules = { rules: {
  '.read': false, '.write': false,

  // ---- partidas: el servidor pone la hora de inicio y la de fin. Los rebotes no pueden ser más de los que caben en ese tiempo,
  //      y los pesos de la partida los fijan las reglas (no el jugador): pelota usada (b, tiene que ser tuya) → pesos por punto (r) → total (p).
  //      Una partida terminada no se puede volver a terminar. ----
  runs: { $uid: {
    '.read': 'auth != null && auth.uid === $uid',
    '.write': 'auth != null && auth.uid === $uid',
    '.validate': "newData.hasChildren(['s', 'b', 'r'])",
    s: { '.validate': 'newData.isNumber() && (newData.val() === now || newData.val() === data.val())' },
    b: { '.validate': `newData.isString() && (newData.val() === '${defaults.ball}' || root.child('wallets').child($uid).child('own').child('ball_' + newData.val()).val() === true)` },
    r: { '.validate': `newData.isNumber() && newData.val() === ${rateExp(`${P}.child('b').val()`)}` },
    e: { '.validate': `newData.isNumber() && newData.val() === now && !data.exists() && data.parent().child('s').exists() && ${P}.child('s').val() === data.parent().child('s').val() && ${P}.hasChildren(['s', 'b', 'r', 'h', 'p'])` },
    h: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= ${ECO.hMax} && !data.exists() && ${P}.hasChildren(['s', 'b', 'r', 'e', 'p'])`
      + ` && newData.val() * ${ECO.msPorRebote} <= now - ${P}.child('s').val() + ${ECO.holguraMs}` },
    p: { '.validate': `newData.isNumber() && !data.exists() && ${P}.hasChildren(['s', 'b', 'r', 'e', 'h']) && newData.val() === ${P}.child('r').val() * ${pesosExp(`${P}.child('h').val()`)} * ${BOOST}` },
    $other: { '.validate': false }
  } },

  // ---- marcadores: cada cuenta escribe solo lo suyo, nunca baja y no puede superar los rebotes de su partida terminada ----
  scores: {
    '.read': true, '.indexOn': ['s', 'k', 'ms'],                                 // `k` sirve para ver si un nombre ya lo usa alguien en el marcador 
    $uid: {
      '.write': "auth != null && auth.uid === $uid && (!data.exists() || newData.child('s').val() >= data.child('s').val())",
      '.validate': "newData.hasChildren(['n', 'k', 's', 't'])",
      n: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 16' },
      // el nombre es de quien lo tiene: con el correo interno (cuentas de nombre + contraseña) o, si la cuenta ya tiene un correo real, con el nombre registrado a su nombre en `names`
      k: { '.validate': `newData.isString() && newData.val().matches(/^[a-z0-9.]{3,24}$/) && (auth.token.email === newData.val() + '${MAIL}' || root.child('names').child(newData.val().replace('.', ',')).val() === auth.uid)` },
      s: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= ${ECO.hMax} && ${RUN}.child('e').exists() && newData.val() <= ${RUN}.child('h').val()` },
      t: { '.validate': 'newData.val() === now' },
      a: { '.validate': AVATAR },                                                      // foto de perfil que ven los demás en el marcador (solo el formato i00c00)
      // ms = tiempo jugado acumulado (marcador «Tiempo jugado»: la suma de lo que duró cada partida) · ml = la última partida cobrada que ya se sumó. Se escriben juntos, después de cobrar
      // la partida (aparte del cobro: si fallan, los pesos no se ven afectados) y cada partida suma una sola vez, hasta lo que dura con tope.
      ms: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= (data.exists() ? data.val() : 0) && newData.val() <= 1000000000000 && newData.val() <= (data.exists() ? data.val() : 0) + ${TIMEINC} && ${P}.child('ml').val() === ${RV('s')} && root.child('wallets').child($uid).child('lr').val() === ${RV('s')}` },
      ml: { '.validate': `newData.isNumber() && newData.val() === ${RV('s')} && ${RUN}.child('e').exists() && (!data.exists() || newData.val() > data.val()) && root.child('wallets').child($uid).child('lr').val() === newData.val()` },
      // c = el puntaje que ya está contado en `hist` (así cada cuenta cuenta una sola vez y se puede mover de casilla al mejorar). Solo sube y siempre es igual al puntaje de ese momento.
      c: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= ${ECO.hMax} && newData.val() === ${P}.child('s').val() && (!data.exists() || newData.val() > data.val())` },
      $other: { '.validate': false }
    }
  },

  // ---- marcador semanal: weekly/<semana>/<uid> = tu mejor partida de esa semana (la semana empieza el lunes, hora de Chile). Solo se escribe en la semana en curso, `s` tiene que ser
  //      exactamente tu mejor partida de la semana que ya llevan las estadísticas (`stats/<uid>/wm`, que sale de partidas verificadas), nunca baja y el nombre es el de tu fila del marcador. ----
  weekly: {
    '.read': true,
    $week: {
      '.indexOn': ['s'],
      $uid: {
        '.write': `auth != null && auth.uid === $uid && $week === ${WEEK} + ''`,
        '.validate': "newData.hasChildren(['n', 's', 't'])",
        n: { '.validate': `newData.isString() && newData.val() === newData.parent().parent().parent().parent().child('scores').child($uid).child('n').val()` },
        s: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 1 && newData.val() <= ${ECO.hMax} && newData.val() === newData.parent().parent().parent().parent().child('stats').child($uid).child('wm').val() && newData.parent().parent().parent().parent().child('stats').child($uid).child('w').val() === ${WEEK} && (!data.exists() || newData.val() >= data.val())` },
        t: { '.validate': 'newData.val() === now' },
        a: { '.validate': AVATAR },
        $other: { '.validate': false }
      }
    }
  },

  // ---- marcador mensual: monthly/<AAAAMM>/<uid> = tu mejor partida de ese mes calendario (hora de Chile). Igual que el semanal: solo se escribe en el mes en curso, `s` tiene que ser
  //      exactamente tu mejor partida del mes que ya llevan las estadísticas (`stats/<uid>/mm`, que sale de partidas verificadas), nunca baja y el nombre es el de tu fila del marcador. ----
  monthly: {
    '.read': true,
    $mo: {
      '.indexOn': ['s'],
      $uid: {
        '.write': `auth != null && auth.uid === $uid && $mo === ${MONTH} + ''`,
        '.validate': "newData.hasChildren(['n', 's', 't'])",
        n: { '.validate': `newData.isString() && newData.val() === newData.parent().parent().parent().parent().child('scores').child($uid).child('n').val()` },
        s: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 1 && newData.val() <= ${ECO.hMax} && newData.val() === newData.parent().parent().parent().parent().child('stats').child($uid).child('mm').val() && newData.parent().parent().parent().parent().child('stats').child($uid).child('mo').val() === ${MONTH} && (!data.exists() || newData.val() >= data.val())` },
        t: { '.validate': 'newData.val() === now' },
        a: { '.validate': AVATAR },
        $other: { '.validate': false }
      }
    }
  },

  // ---- insignias del marcador: roles/<uid> = 'tio' (🦆🎩 Tío Patito) · 'tia' (🦆🎀 Tía Patita) · 'dev' (👾 desarrolladores). Lo pone el administrador desde la consola de Firebase;
  //      nadie puede escribirlo desde el juego. Cualquiera lo lee (para dibujar la insignia junto al nombre). ----
  roles: { '.read': true, $uid: { '.validate': "newData.isString() && newData.val().matches(/^(tio|tia|dev)$/)" } },

  // ---- marco dorado: quien desbloquea el personaje secreto (el de los 100 millones) puede llevar un marco dorado animado en su emblema.
  //      compradores/<uid> = { n: nombre, t: hora en que quedó anotado (la pone el servidor, una sola vez) } → el registro de quiénes tienen el personaje secreto. Solo su dueño lo lee;
  //      quien administra el proyecto ve la lista completa en la consola de Firebase. Solo lo escribe quien de verdad tiene el personaje (own/ch_<id> en su cartera) y no se puede borrar.
  //      marco/<uid> = true → «lleva puesto el marco dorado». Es lo único que ven los demás (en los marcadores). Se escribe/borra solo con el personaje secreto y con el registro de arriba ya hecho
  //      (en el mismo PATCH sirve). Quien se saca el marco no queda expuesto: sin marco no aparece en ninguna lista pública. ----
  compradores: { $uid: {
    '.read': 'auth != null && auth.uid === $uid',
    '.write': `auth != null && auth.uid === $uid && newData.exists() && root.child('wallets').child($uid).child('own').child('ch_${SECRET}').val() === true`,
    '.validate': "newData.hasChildren(['n', 't'])",
    n: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 16' },
    t: { '.validate': 'newData.isNumber() && (data.exists() ? newData.val() === data.val() : newData.val() === now)' },
    $other: { '.validate': false }
  } },
  marco: { '.read': true, $uid: {
    '.write': `auth != null && auth.uid === $uid && root.child('wallets').child($uid).child('own').child('ch_${SECRET}').val() === true`,
    '.validate': "newData.val() === true && newData.parent().parent().child('compradores').child($uid).exists()"
  } },

  // ---- registro de nombres: names/<nombre con las comas en lugar de puntos (Firebase no deja puntos en las claves)> = uid de la cuenta que lo tiene.
  //      Se escribe una sola vez y solo así: (1) una cuenta antigua con el correo interno de ese nombre, o (2) una cuenta con correo real que anota a la vez
  //      `mynames/<su uid>` = ese nombre (cada cuenta puede tener un solo nombre). Su dueña puede soltarlo (sirve para deshacer un registro que no terminó).
  //      Cualquiera puede leer un nombre (para ver si está libre), pero no listarlos. ----
  names: { $k: {
    '.read': true,
    '.write': `auth != null && ((!data.exists() && newData.val() === auth.uid && (auth.token.email === $k.replace(',', '.') + '${MAIL}' || (newData.parent().parent().child('mynames').child(auth.uid).val() === $k && !root.child('mynames').child(auth.uid).exists()))) || (data.val() === auth.uid && !newData.exists()))`,
    '.validate': "newData.isString() && newData.val().length <= 40 && $k.matches(/^[a-z0-9,]{3,24}$/)"
  } },
  mynames: { $uid: {
    '.read': 'auth != null && auth.uid === $uid',
    '.write': 'auth != null && auth.uid === $uid',
    '.validate': "newData.isString() && newData.val().matches(/^[a-z0-9,]{3,24}$/) && newData.parent().parent().child('names').child(newData.val()).val() === $uid"
  } },

  // ---- contador de puestos: hist/<puntaje> = cuántas cuentas tienen ese puntaje. Con esto el puesto de cualquiera se calcula leyendo ~500 números
  //      (unos 4 KB) sea cual sea la cantidad de jugadores, en vez de bajar toda la lista. Cada casilla solo se mueve de a 1 y solo si la misma cuenta
  //      que escribe acaba de pasar a (o salir de) esa casilla en `scores/<su uid>/c`. ----
  hist: {
    '.read': true,
    $b: {
      '.validate': 'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && $b.matches(/^([0-9]|[1-9][0-9]|[1-4][0-9][0-9]|500)$/)',
      '.write': `auth != null && (${HIST_INC} || ${HIST_DEC})`
    }
  },

  // ---- racha diaria: n = días seguidos · t = hora del último cobro (la pone el servidor) · x2/x3/x4 = multiplicadores guardados de la RACHA (duran 10 min al activarlos) ·
  //      y2/y3/y4 = multiplicadores guardados de la RULETA (duran 5 min) · bx = hora en que se activó el último multiplicador · bm = cuál era (×2, ×3 o ×4; sin bm = ×2, de las activaciones antiguas) ·
  //      bd = cuánto dura esa activación en ms (600000 si gastó uno x<m>, 300000 si gastó uno y<m>; sin bd = 10 min, de las activaciones antiguas).
  //      Cada cobro mueve n y t juntos al valor exacto que toca; los días de multiplicador (7, 14, 21) suman 1 a su contador en esa misma escritura. Activar uno resta 1 a su contador
  //      (solo si hay) y pone bx = ahora y bm: solo se puede activar otro cuando el anterior ya venció. La recompensa en pesos la valida la cartera (c); no se puede borrar la racha para cobrar otra vez. ----
  streaks: { $uid: {
    '.read': 'auth != null && auth.uid === $uid',
    '.write': 'auth != null && auth.uid === $uid && newData.exists()',
    '.validate': "newData.hasChildren(['n', 't'])",
    n: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 1 && newData.val() <= 100000 && newData.val() === ${NEXT_N} && ${P}.child('t').val() === now` },
    t: { '.validate': `newData.isNumber() && newData.val() === now && ${P}.child('n').val() === ${NEXT_N}` },
    bx: { '.validate': `newData.isNumber() && (newData.val() === data.val() || (newData.val() === now && (!data.exists() || data.val() + ${OLD_DUR} <= now) && (` + MULTS.map(m => `(${P}.child('bm').val() === ${m} && ((${INV_DEC('x', m)} && ${P}.child('bd').val() === ${R.dobleMs})` + (RU_MULTS.includes(m) ? ` || (${INV_DEC('y', m)} && ${P}.child('bd').val() === ${RU.multMs})` : '') + '))').join(' || ') + '))) ' },
    bd: { '.validate': `newData.isNumber() && (newData.val() === data.val() || (${P}.child('bx').val() === now && (newData.val() === ${R.dobleMs} || newData.val() === ${RU.multMs})))` },
    bm: { '.validate': `newData.isNumber() && (newData.val() === data.val() || (${P}.child('bx').val() === now && (` + MULTS.map(m => `newData.val() === ${m}`).join(' || ') + '))) ' },
    ...Object.fromEntries(R.mult.map(([dia, m]) => ['x' + m, { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= 99 && (newData.val() === ${INV_OLD(m)}`
      + ` || (newData.val() === ${INV_OLD(m)} + 1 && ${P}.child('n').val() === ${dia} && ${P}.child('t').val() === now)`
      + ` || (newData.val() === ${INV_OLD(m)} - 1 && ${P}.child('bm').val() === ${m} && ${P}.child('bx').val() === now && ${P}.child('bd').val() === ${R.dobleMs}))` }])),
    ...Object.fromEntries(RU_MULTS.map(m => ['y' + m, { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= 99 && (newData.val() === ${INV_OLD(m)}`
      + ` || (newData.val() === ${INV_OLD(m)} + 1 && ${RU_CLAIM} && ${ruChain(RU_T, 'm')} === ${m})`
      + ` || (newData.val() === ${INV_OLD(m)} - 1 && ${P}.child('bm').val() === ${m} && ${P}.child('bx').val() === now && ${P}.child('bd').val() === ${RU.multMs}))` }])),
    $other: { '.validate': false }
  } },

  // ---- estadísticas para las misiones: g = partidas · r = rebotes totales · sl = última partida sumada · d = día de los contadores de hoy ·
  //      dg/dr/dm = partidas, rebotes y mejor partida de hoy · dc = casillas del día ya cobradas (bits 1, 2 y 4). Se escriben después de cobrar la partida (aparte del cobro:
  //      si fallan, los pesos no se ven afectados), cada partida suma una sola vez y solo cuenta si llegó a `minRebotes`. Los contadores de hoy vuelven a 0 al cambiar el día. ----
  stats: { $uid: {
    '.read': 'auth != null && auth.uid === $uid',
    '.write': 'auth != null && auth.uid === $uid && newData.exists()',
    '.validate': "newData.hasChildren(['g', 'r', 'sl', 'd', 'dg', 'dr', 'dm', 'dc'])",
    sl: { '.validate': `newData.isNumber() && newData.val() === ${RV('s')} && ${W_ROOT}.child('lr').val() === newData.val() && ${RUN}.child('e').exists() && ${RV('h')} >= ${M.minRebotes} && (!data.exists() || newData.val() > data.val())` },
    g: { '.validate': `newData.isNumber() && newData.val() === (data.exists() ? data.val() : 0) + 1 && ${FRESH}` },
    r: { '.validate': `newData.isNumber() && newData.val() === (data.exists() ? data.val() : 0) + ${RV('h')} && ${FRESH}` },
    d: { '.validate': `newData.isNumber() && newData.val() === ${TODAY} && ${FRESH} && (${DSAME} || ${P}.child('dc').val() === 0)` },
    dg: { '.validate': `newData.isNumber() && newData.val() === (${DSAME} ? ${OLDP}.child('dg').val() : 0) + 1 && ${FRESH}` },
    dr: { '.validate': `newData.isNumber() && newData.val() === (${DSAME} ? ${OLDP}.child('dr').val() : 0) + ${RV('h')} && ${FRESH}` },
    dm: { '.validate': `newData.isNumber() && newData.val() === (${DSAME} && ${OLDP}.child('dm').val() > ${RV('h')} ? ${OLDP}.child('dm').val() : ${RV('h')}) && ${FRESH}` },
    dc: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= 7 && ((!${DSAME} && newData.val() === 0) || (${DSAME} && ${P}.child('d').val() === ${TODAY} && newData.val() >= ${'(data.exists() ? data.val() : 0)'}`
      + ' && ' + M.dia.map((x, k) => `!(${bit('(data.exists() ? data.val() : 0)', k)} && !${bit('newData.val()', k)})`).join(' && ')
      + ' && ' + M.dia.map((x, k) => `(!(${bit('newData.val()', k)} && !${bit('(data.exists() ? data.val() : 0)', k)}) || ${condDia(k)})`).join(' && ') + '))' },
    // semana: w = semana de los contadores · wg/wr/wm = partidas, rebotes y mejor partida de esta semana · wc = casillas de la semana ya cobradas (bits 1, 2 y 4). Igual que los de hoy; son opcionales
    //         (las cuentas que no los tienen todavía los crean con su próxima partida) y vuelven a 0 al cambiar la semana.
    w: { '.validate': `newData.isNumber() && newData.val() === ${WEEK} && ${FRESH} && (${WSAME} || ${P}.child('wc').val() === 0)` },
    wg: { '.validate': `newData.isNumber() && newData.val() === (${WSAME} ? ${OLDP}.child('wg').val() : 0) + 1 && ${FRESH}` },
    wr: { '.validate': `newData.isNumber() && newData.val() === (${WSAME} ? ${OLDP}.child('wr').val() : 0) + ${RV('h')} && ${FRESH}` },
    wm: { '.validate': `newData.isNumber() && newData.val() === (${WSAME} && ${OLDP}.child('wm').val() > ${RV('h')} ? ${OLDP}.child('wm').val() : ${RV('h')}) && ${FRESH}` },
    wc: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= 7 && ((!${WSAME} && newData.val() === 0) || (${WSAME} && ${P}.child('w').val() === ${WEEK} && newData.val() >= ${'(data.exists() ? data.val() : 0)'}`
      + ' && ' + SEM.premios.map((x, k) => `!(${bit('(data.exists() ? data.val() : 0)', k)} && !${bit('newData.val()', k)})`).join(' && ')
      + ' && ' + SEM.premios.map((x, k) => `(!(${bit('newData.val()', k)} && !${bit('(data.exists() ? data.val() : 0)', k)}) || (${condSem(k)}))`).join(' && ') + '))' },
    // mes: mo = mes de los contadores (AAAAMM) · mm = mejor partida de este mes · ml = última partida sumada al mes. Se escriben aparte de las demás estadísticas y son opcionales
    //      (así, mientras las reglas nuevas no estén publicadas, las misiones siguen funcionando igual). Cada partida cuenta una sola vez (ml) y solo si llegó a `minRebotes`.
    ml: { '.validate': `newData.isNumber() && newData.val() === ${RV('s')} && ${W_ROOT}.child('lr').val() === newData.val() && ${RUN}.child('e').exists() && ${RV('h')} >= ${M.minRebotes} && (!data.exists() || newData.val() > data.val())` },
    mo: { '.validate': `newData.isNumber() && newData.val() === ${MONTH} && ${MFRESH}` },
    mm: { '.validate': `newData.isNumber() && newData.val() === (${MSAME} && ${OLDP}.child('mm').val() > ${RV('h')} ? ${OLDP}.child('mm').val() : ${RV('h')}) && ${MFRESH}` },
    $other: { '.validate': false }
  } },

  // ---- logros de una sola vez: missions/<uid>/<id> = true. Cada uno solo se puede escribir una vez y solo si las estadísticas (o el dato de la cuenta) ya cumplen la meta;
  //      el premio en pesos lo valida la cartera (c). No se pueden borrar para cobrar otra vez. ----
  missions: { $uid: {
    '.read': 'auth != null && auth.uid === $uid',
    ...Object.fromEntries(M.logros.map(([id, tipo, meta]) => [id, { '.write': 'auth != null && auth.uid === $uid && !data.exists() && newData.val() === true', '.validate': `newData.val() === true && ${condLogro(tipo, meta)}` }])),
    $other: { '.validate': false }
  } },

  // ---- ruleta diaria: t = hora del giro (la pone el servidor; un giro por día, medianoche de Chile) · c = el giro que ya se cobró (igual a t). El premio sale de t (ver tienda.js → eco.ruleta) y se
  //      cobra en la cartera (c) o, si toca multiplicador, en los guardados de la ruleta (y2/y3/y4, que duran 5 minutos al activarlos). No se puede cobrar dos veces ni cobrar en la misma escritura que gira. ----
  ruleta: { $uid: {
    '.read': 'auth != null && auth.uid === $uid',
    '.write': 'auth != null && auth.uid === $uid && newData.exists()',
    '.validate': "newData.hasChildren(['t'])",
    t: { '.validate': `newData.isNumber() && (newData.val() === data.val() || (newData.val() === now && (!data.exists() || ${TODAY} > ${dayOf('data.val()')})))` },
    c: { '.validate': `newData.isNumber() && newData.val() === ${P}.child('t').val() && data.parent().child('t').exists() && data.parent().child('t').val() === ${P}.child('t').val() && (!data.exists() || data.val() !== newData.val())` },
    $other: { '.validate': false }
  } },

  // ---- grupo VIP: vip/<uid> = el WhatsApp que deja quien desbloqueó el personaje secreto, para invitarle al grupo.
  //      w = número con código de país (+56912345678) · n = su nombre · t = hora en que lo dejó (la pone el servidor) · c = aceptó que le escriban.
  //      Solo su dueña lo lee y lo escribe, y solo si ya tiene el personaje secreto; puede borrarlo cuando quiera. Nadie más lo ve (ni se puede listar):
  //      quien administra el proyecto lo lee desde la consola de Firebase. ----
  vip: { $uid: {
    '.read': 'auth != null && auth.uid === $uid',
    '.write': `auth != null && auth.uid === $uid && (!newData.exists() || root.child('wallets').child($uid).child('own').child('ch_${SECRET}').val() === true)`,
    '.validate': "newData.hasChildren(['w', 'n', 't', 'c'])",
    w: { '.validate': "newData.isString() && newData.val().matches(/^\\+[1-9][0-9]{7,14}$/)" },
    n: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 40' },
    t: { '.validate': 'newData.isNumber() && newData.val() === now' },
    c: { '.validate': 'newData.val() === true' },
    $other: { '.validate': false }
  } },

  // ---- cartera: c = pesos ganados · sp = gastados · lr = última partida cobrada · own = compras · eq = lo que llevas puesto ----
  // Los pesos solo suben cobrando UNA partida terminada (exactamente lo que valió) y cada partida se cobra una sola vez.
  // Las compras se validan en own/$item (ver arriba), no aquí.
  wallets: { $uid: {
    '.read': 'auth != null && auth.uid === $uid',
    '.write': 'auth != null && auth.uid === $uid',
    '.validate': "newData.hasChildren(['c', 'sp'])",
    c: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= ${ECO.cMax}`
      + " && (newData.val() === (data.exists() ? data.val() : 0)"
      + ` || (${P}.child('lr').exists() && (!data.parent().child('lr').exists() || ${P}.child('lr').val() > data.parent().child('lr').val())`
      + ` && newData.val() - (data.exists() ? data.val() : 0) === ${RUN}.child('p').val())`
      + ` || (${STR}.child('t').val() === now && newData.val() - (data.exists() ? data.val() : 0) === ${rewardExp(`${STR}.child('n').val()`)})`
      + ` || (${MIS_SUM} + ${DIA_SUM} + ${SEM_SUM} > 0 && newData.val() - (data.exists() ? data.val() : 0) === ${MIS_SUM} + ${DIA_SUM} + ${SEM_SUM})`
      + ` || (${RU_CLAIM} && newData.val() - (data.exists() ? data.val() : 0) === ${ruChain(RU_T, 'v')}))` },
    sp: { '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && (!data.exists() || newData.val() >= data.val()) && newData.val() <= ${P}.child('c').val()` },
    lr: { '.validate': `newData.isNumber() && newData.val() === ${RUN}.child('s').val() && ${RUN}.child('e').exists() && (!data.exists() || newData.val() > data.val())` },
    av: { '.validate': AVATAR },                                                     // tu foto de perfil (se sincroniza entre tus dispositivos)
    own, eq,
    $other: { '.validate': false }
  } }
} };
fs.writeFileSync(path.join(dir, 'firebase-rules.json'), JSON.stringify(rules, null, 2) + '\n');
console.log('firebase-rules.json generado:', ITEMS.length, 'artículos de pago');