// Correo en las cuentas, de punta a punta (juego + reglas reales de Firebase): crear cuenta con correo, agregar el correo a una cuenta antigua sin perder nada,
// verificar el correo y recuperar la contraseña. Uso:  cd pruebas && npm install && node correo.test.js
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, st, newPage, playHits, registrar, abrirCambio } = require('./mockfirebase.js');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };
const cerrarDiario = p => p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); });
const alMenu = p => p.evaluate(() => { const b = document.getElementById('backResult'); if (b && b.offsetParent) b.click(); });
const ajustes = async p => { await alMenu(p); await p.waitForTimeout(300); await cerrarDiario(p); await p.evaluate(() => document.getElementById('openSettings').click()); await p.waitForTimeout(300); };
const salir = async p => { await ajustes(p); await p.evaluate(() => document.getElementById('logout').click()); await p.waitForTimeout(700); };
const entrar = async (p, id, clave) => { await p.fill('#acct', id); await p.fill('#pass', clave); await p.tap('#authGo'); await p.waitForTimeout(2500); await cerrarDiario(p); };
const msg = p => p.textContent('#authMsg');
(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});

  console.log('Crear una cuenta nueva: correo + nombre de usuario + contraseña');
  {
    const { ctx, p, errs } = await newPage(b);
    await p.tap('#tabUp');
    ok('al crear cuenta se piden correo, nombre de usuario y contraseña', await p.isVisible('#acctMail') && await p.isVisible('#acct') && await p.isVisible('#pass') && /Crear cuenta/.test(await p.textContent('#authGo')));
    await p.fill('#acctMail', 'sin-arroba'); await p.fill('#acct', 'Ana Perez'); await p.fill('#pass', 'secreto123'); await p.tap('#authGo');
    ok('un correo mal escrito se rechaza sin crear nada', /correo válido/.test(await msg(p)) && Object.keys(st.users).length === 0, await msg(p));
    const uid = await registrar(p, 'Ana Perez', 'ana@gmail.com');
    ok('la cuenta queda con el correo real (no con el interno) y con su nombre', !!st.users['ana@gmail.com'] && st.users['ana@gmail.com'].uid === uid && st.users['ana@gmail.com'].name === 'Ana Perez' && Object.keys(st.users).length === 1, JSON.stringify(Object.keys(st.users)));
    ok('el nombre queda registrado a nombre de la cuenta (names/ana,perez y mynames)', st.db.names && st.db.names['ana,perez'] === uid && st.db.mynames && st.db.mynames[uid] === 'ana,perez', JSON.stringify([st.db.names, st.db.mynames]));
    ok('Firebase mandó el enlace para verificar el correo', st.mails.some(m => m.type === 'verify' && m.email === 'ana@gmail.com'), JSON.stringify(st.mails));
    ok('el menú avisa que se envió el enlace', /Te enviamos un enlace/.test(await p.textContent('#mailBannerTxt')) && await p.isVisible('#mailBanner'));
    await cerrarDiario(p);
    await playHits(p, 4, async () => {}); await p.waitForTimeout(3500);
    const h = st.db.runs[uid].h;
    ok(`la primera partida se cobra y crea la fila del marcador con el nombre registrado (${h} rebotes)`, st.db.wallets[uid].c === h && st.db.scores[uid] && st.db.scores[uid].k === 'ana.perez' && st.db.scores[uid].s === h, JSON.stringify(st.db.scores && st.db.scores[uid]));
    ok('sin denegados ni errores de página', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
    await ajustes(p);
    ok('Ajustes muestra el correo «sin verificar»', /ana@gmail\.com · ⏳ sin verificar/.test(await p.textContent('#mailSt')), await p.textContent('#mailSt'));
    st.users['ana@gmail.com'].ev = true;                                                       // la persona abre el enlace del correo
    await p.evaluate(() => document.getElementById('mailBtn').click()); await p.waitForTimeout(500);
    await p.evaluate(() => document.getElementById('mCheck').click()); await p.waitForTimeout(800);
    ok('«Ya lo verifiqué» confirma que el correo está verificado', /verificado/.test(await p.textContent('#mailMsg')) && /Verificado ✅/.test(await p.textContent('#mailTxt')), await p.textContent('#mailMsg'));
    await p.evaluate(() => document.getElementById('mailClose').click());
    await ajustes(p);
    ok('y Ajustes lo muestra verificado', /✅ verificado/.test(await p.textContent('#mailSt')), await p.textContent('#mailSt'));
    await salir(p);
    await entrar(p, 'ana@gmail.com', 'secreto123');
    ok('se puede entrar con el correo y el juego recuerda el nombre y los pesos', await p.evaluate(() => document.getElementById('hello').textContent) === 'Ana Perez' && /\$/.test(await p.textContent('#coinNum')), await p.evaluate(() => document.getElementById('hello').textContent));
    await ctx.close();
  }

  console.log('Nombre o correo repetidos');
  {
    const { ctx, p } = await newPage(b);
    const antes = Object.keys(st.users).length, nombres = JSON.stringify(st.db.names);
    await p.tap('#tabUp'); await p.fill('#acctMail', 'otra@gmail.com'); await p.fill('#acct', 'ANA PEREZ'); await p.fill('#pass', 'secreto123'); await p.tap('#authGo'); await p.waitForTimeout(1500);
    ok('un nombre ya registrado se rechaza sin crear una cuenta', /nombre ya está en uso/.test(await msg(p)) && Object.keys(st.users).length === antes, await msg(p));
    st.db.scores = { ...(st.db.scores || {}), UIDviejaabcdefghijklmnopq: { n: 'Vieja Cuenta', k: 'vieja.cuenta', s: 12, t: 1 } };          // una cuenta antigua con su nombre en el marcador
    await p.fill('#acct', 'Vieja Cuenta'); await p.tap('#authGo'); await p.waitForTimeout(1500);
    ok('el nombre de una cuenta antigua que ya está en el marcador también está ocupado', /nombre ya está en uso/.test(await msg(p)) && Object.keys(st.users).length === antes, await msg(p));
    await p.fill('#acctMail', 'ana@gmail.com'); await p.fill('#acct', 'Nombre Nuevo'); await p.tap('#authGo'); await p.waitForTimeout(2000);
    ok('un correo que ya tiene cuenta se rechaza', /correo ya está asociado/.test(await msg(p)), await msg(p));
    ok('y no queda ninguna cuenta ni nombre a medias', Object.keys(st.users).length === antes && !st.db.names['nombre,nuevo'] && Object.keys(st.db.names).length === Object.keys(JSON.parse(nombres)).length && Object.keys(st.db.mynames).length === 1, JSON.stringify(st.db.names) + ' ' + Object.keys(st.users));
    delete st.db.scores.UIDviejaabcdefghijklmnopq;
    await ctx.close();
  }

  const antigua = (nombre, uid, extra = {}) => {                  // una cuenta de nombre + contraseña, con su progreso
    const k = nombre.toLowerCase();
    st.users[k + '@tio-pato.invalid'] = { uid, pass: 'claveantigua', ev: false, name: '' };
    st.db.wallets = { ...(st.db.wallets || {}), [uid]: { c: 5000, sp: 1200, own: { ch_tia: true }, av: 'e41A33GGG', ...extra } };
    st.db.scores = { ...(st.db.scores || {}), [uid]: { n: nombre, k, s: 40, t: Date.now() - 9000 } };
  };
  const agregar = async (p, mail, clave) => { await p.fill('#mEmail', mail); await p.fill('#mPass', clave); await p.evaluate(() => document.getElementById('mGo').click()); await p.waitForTimeout(1800); };

  console.log('Cuenta antigua (nombre + contraseña): agregar el correo sin perder nada (Firebase con protección contra enumeración: el cambio se confirma por enlace)');
  {
    const uid = 'UIDantiguaabcdefghijklmnop'; antigua('Antigua', uid); st.eep = true;
    const { ctx, p, errs } = await newPage(b); st.denied.length = 0;
    await entrar(p, 'Antigua', 'claveantigua');
    ok('entra con su nombre como siempre', await p.evaluate(() => document.getElementById('hello').textContent) === 'Antigua');
    ok('el menú le ofrece proteger su cuenta con un correo', await p.isVisible('#mailBanner') && /Protege tu cuenta/.test(await p.textContent('#mailBannerTxt')));
    ok('su nombre se anota en el registro (sin que ella haga nada)', st.db.names && st.db.names['antigua'] === uid, JSON.stringify(st.db.names));
    await ajustes(p);
    ok('Ajustes dice «Sin correo» y ofrece agregarlo', /Sin correo/.test(await p.textContent('#mailSt')) && /Agregar/.test(await p.textContent('#mailBtn')));
    await p.evaluate(() => document.getElementById('mailBtn').click()); await p.waitForTimeout(400);
    st.users['ana@gmail.com'] && await agregar(p, 'ana@gmail.com', 'claveantigua');
    ok('un correo que ya es de otra cuenta se rechaza', /otra cuenta/.test(await p.textContent('#mailMsg')) && !!st.users['antigua@tio-pato.invalid'], await p.textContent('#mailMsg'));
    await agregar(p, 'antigua@gmail.com', 'contraseña-mala');
    ok('con una contraseña que no es la suya no pasa nada', /no es la de tu cuenta/.test(await p.textContent('#mailMsg')) && !st.mails.some(m => m.type === 'change'), await p.textContent('#mailMsg'));
    await agregar(p, 'antigua@gmail.com', 'claveantigua');
    ok('Firebase manda un enlace al correo nuevo (el cambio aún no se hace)', st.mails.some(m => m.type === 'change' && m.email === 'antigua@gmail.com') && !!st.users['antigua@tio-pato.invalid'] && !st.users['antigua@gmail.com'], JSON.stringify(st.mails));
    ok('el modal explica que falta abrir el enlace y Ajustes lo muestra pendiente', /Ábrelo para terminar/.test(await p.textContent('#mailTxt')) && /Revisa tu correo/.test(await p.textContent('#mailMsg')), await p.textContent('#mailTxt'));
    await p.evaluate(() => document.getElementById('mailClose').click());
    ok('mientras tanto no se le pide el correo otra vez', !(await p.isVisible('#mailBanner')));
    await ajustes(p);
    ok('Ajustes: «falta abrir el enlace»', /falta abrir el enlace/.test(await p.textContent('#mailSt')), await p.textContent('#mailSt'));
    await p.evaluate(() => document.getElementById('setClose').click());
    await playHits(p, 5, async () => {}); await p.waitForTimeout(3500);
    let h = st.db.runs[uid].h;
    ok(`mientras espera sigue jugando y cobrando como siempre (${h} rebotes)`, st.db.wallets[uid].c === 5000 + h, JSON.stringify(st.db.wallets[uid]));
    abrirCambio('antigua@gmail.com');                                                          // abre el enlace del correo nuevo
    await p.evaluate(() => { const b = document.getElementById('backResult'); if (b && b.offsetParent) b.click(); }); await p.waitForTimeout(300);
    await ajustes(p); await p.evaluate(() => document.getElementById('mailBtn').click()); await p.waitForTimeout(400);
    await p.evaluate(() => document.getElementById('mCheck').click()); await p.waitForTimeout(1200);
    ok('al confirmar, Firebase cerró la sesión vieja y el juego pide entrar con el correo nuevo', await p.isVisible('#authForm') && /ya quedó asociado/.test(await msg(p)), await msg(p));
    ok('es la MISMA cuenta (mismo uid) y no perdió nada: pesos, gastado, compras, emblema y récord', st.users['antigua@gmail.com'].uid === uid && st.db.wallets[uid].sp === 1200 && st.db.wallets[uid].own.ch_tia === true && st.db.wallets[uid].av === 'e41A33GGG' && st.db.scores[uid].s >= 40);
    await entrar(p, 'antigua@gmail.com', 'claveantigua');
    ok('entra con el correo y conserva su nombre, su correo verificado y su progreso', await p.evaluate(() => document.getElementById('hello').textContent) === 'Antigua' && st.db.wallets[uid].c === 5000 + h, await p.evaluate(() => document.getElementById('hello').textContent));
    await playHits(p, 6, async () => {}); await p.waitForTimeout(3500);
    h = st.db.runs[uid].h;
    ok('y sigue cobrando partidas y subiendo el récord con el correo nuevo', st.db.scores[uid].s >= 40 && st.db.wallets[uid].c > 5000, JSON.stringify([st.db.wallets[uid], st.db.scores[uid]]));
    ok('sin denegados ni errores de página en todo el proceso', st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
    await salir(p);
    await p.fill('#acct', 'Antigua'); await p.fill('#pass', 'claveantigua'); await p.tap('#authGo'); await p.waitForTimeout(1500);
    ok('con el nombre ya no entra y el aviso le dice que entre con su correo', /entra con tu correo/.test(await msg(p)), await msg(p));
    await ctx.close();
  }

  console.log('Cuenta antigua: Firebase sin la protección (el cambio de correo es directo)');
  {
    const uid = 'UIDdirectaabcdefghijklmnop'; antigua('Directa', uid); st.eep = false;
    const { ctx, p, errs } = await newPage(b); st.denied.length = 0;
    await entrar(p, 'Directa', 'claveantigua'); await ajustes(p);
    await p.evaluate(() => document.getElementById('mailBtn').click()); await p.waitForTimeout(400);
    await agregar(p, 'directa@gmail.com', 'claveantigua');
    ok('el correo queda asociado de inmediato a la misma cuenta', !!st.users['directa@gmail.com'] && st.users['directa@gmail.com'].uid === uid && !st.users['directa@tio-pato.invalid'] && /Asociado a tu cuenta/.test(await p.textContent('#mailTxt')), Object.keys(st.users).join(','));
    ok('no se pierde nada y manda el enlace de verificación', st.db.wallets[uid].c === 5000 && st.db.wallets[uid].sp === 1200 && st.mails.some(m => m.type === 'verify' && m.email === 'directa@gmail.com'));
    await p.evaluate(() => document.getElementById('mailClose').click());
    await playHits(p, 5, async () => {}); await p.waitForTimeout(3500);
    ok('sigue cobrando partidas con el correo nuevo', st.db.wallets[uid].c === 5000 + st.db.runs[uid].h && st.denied.length === 0 && errs.length === 0, st.denied.join(' || ') + errs.join('|'));
    st.eep = true; await ctx.close();
  }

  console.log('Cuenta antigua: Firebase bloquea el cambio de correo');
  {
    const uid = 'UIDbloqueaabcdefghijklmnop'; antigua('Bloquea', uid); st.eep = true; st.blockChange = 'UNVERIFIED_EMAIL';
    const { ctx, p } = await newPage(b);
    await entrar(p, 'Bloquea', 'claveantigua'); await ajustes(p);
    await p.evaluate(() => document.getElementById('mailBtn').click()); await p.waitForTimeout(400);
    await agregar(p, 'bloquea@gmail.com', 'claveantigua');
    ok('muestra el código que dio Firebase y no cambia nada', /UNVERIFIED_EMAIL/.test(await p.textContent('#mailMsg')) && !!st.users['bloquea@tio-pato.invalid'] && !st.users['bloquea@gmail.com'], await p.textContent('#mailMsg'));
    ok('la cuenta sigue entrando y jugando con su nombre', await p.evaluate(() => !document.getElementById('mailAdd').hidden));
    st.blockChange = ''; await ctx.close();
  }

  console.log('Recuperar la contraseña');
  {
    const { ctx, p } = await newPage(b);
    st.mails.length = 0;
    await p.tap('#forgot');
    ok('«¿Olvidaste tu contraseña?» pide solo el correo', await p.isVisible('#acctMail') && !(await p.isVisible('#acct')) && !(await p.isVisible('#pass')) && /Enviar enlace/.test(await p.textContent('#authGo')));
    await p.fill('#acctMail', 'ana@gmail.com'); await p.tap('#authGo'); await p.waitForTimeout(800);
    ok('manda el enlace al correo de la cuenta', st.mails.some(m => m.type === 'reset' && m.email === 'ana@gmail.com') && /te enviamos un enlace/.test(await msg(p)), await msg(p));
    st.mails.length = 0;
    await p.fill('#acctMail', 'nadie@gmail.com'); await p.tap('#authGo'); await p.waitForTimeout(800);
    ok('con un correo sin cuenta responde igual (no revela quién tiene cuenta) y no manda nada', st.mails.length === 0 && /te enviamos un enlace/.test(await msg(p)), await msg(p));
    await p.tap('#tabIn');
    ok('«Entrar» vuelve al formulario normal', await p.isVisible('#acct') && await p.isVisible('#pass') && !(await p.isVisible('#acctMail')));
    await ctx.close();
  }

  console.log('Si todavía no están publicadas las reglas nuevas');
  {
    const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase-rules.json'), 'utf8')); delete r.rules.names;
    st.rulesFile = path.join(os.tmpdir(), 'sin-names-' + process.pid + '.json'); fs.writeFileSync(st.rulesFile, JSON.stringify(r));
    const { ctx, p } = await newPage(b); const antes = Object.keys(st.users).length;
    await p.tap('#tabUp'); await p.fill('#acctMail', 'nueva@gmail.com'); await p.fill('#acct', 'Sin Reglas'); await p.fill('#pass', 'secreto123'); await p.tap('#authGo'); await p.waitForTimeout(1800);
    ok('avisa que faltan publicar las reglas y no deja cuentas a medias', /publicar las reglas/.test(await msg(p)) && Object.keys(st.users).length === antes, await msg(p));
    fs.unlinkSync(st.rulesFile); st.rulesFile = null; st.denied.length = 0; await ctx.close();
  }

  console.log(`\n${pass} correctas, ${fail} fallas`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
