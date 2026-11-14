// Prueba de punta a punta: el juego real (v2/juego) en modo API, contra la API V2 local y PostgreSQL.
// Juega una partida, cobra la racha, compra en la tienda, mira los marcadores y comprueba todo EN LA BASE.
//   TEST_DATABASE_URL=postgres://… node testing/juego-nube.e2e.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import postgres from 'postgres';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const JUEGO = new URL('../../juego/', import.meta.url).pathname, API_PORT = 8790, WEB_PORT = 8805;
let ok = 0, fail = 0;
const check = (cond, msg, extra = '') => { if (cond) { ok++; console.log('  ok  ', msg); } else { fail++; console.log('  FALLA', msg, extra); } };

// 1. la API local
const api = spawn(process.execPath, [new URL('./servidor-local.mjs', import.meta.url).pathname, String(API_PORT), 'Ana'], { env: process.env });
const cfg = await new Promise((res, rej) => { let buf = ''; api.stdout.on('data', (d) => { buf += d; const l = buf.split('\n')[0]; if (buf.includes('\n')) res(JSON.parse(l)); }); api.stderr.on('data', (d) => process.stderr.write(d)); api.on('exit', (c) => rej(new Error('la API terminó ' + c))); });
const sql = postgres(cfg.db, { max: 1, onnotice: () => {} });
const uid = cfg.userId;

// 2. el juego, servido como en la app (con la CSP abierta a la API, como la arma la compilación de la app)
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const web = createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (p === '/') p = '/index.html';
  const f = join(JUEGO, p); if (!f.startsWith(JUEGO) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  let body = readFileSync(f);
  if (p === '/index.html') {
    body = String(body).replace("connect-src 'self'", `connect-src 'self' ${cfg.base}`)
      .replace(/  fetchLeader\(\);\n\}\)\(\);/, "  window.__g = { st: () => ({ state, hits }) };\n  (function auto() { if (window.__auto && state === 'play') px = clamp(x, pw / 2, W - pw / 2); requestAnimationFrame(auto); })();\n  fetchLeader();\n})();");
  }
  res.writeHead(200, { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' }); res.end(body);
}).listen(WEB_PORT);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errores = []; p.on('pageerror', (e) => errores.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); if (process.env.DEBUG && m.text().startsWith('nube')) console.log('     ', m.text().slice(0, 220)); });
const pedidos = []; p.on('request', (r) => { if (r.url().startsWith(cfg.base)) pedidos.push(r.method() + ' ' + new URL(r.url()).pathname); });
const firebase = []; p.on('request', (r) => { if (/firebaseio|googleapis/.test(r.url())) firebase.push(r.url()); });
await ctx.addInitScript((c) => { window.V2_NUBE = { base: c.base, sesion: c.sesion }; window.__nubeLog = true; try { localStorage.setItem('gana-al-tio-pato-v2-prefs', JSON.stringify({ consentimiento: 'si' })); } catch (e) {} }, cfg);
const tapIf = async (sel) => { if (await p.isVisible(sel)) await p.tap(sel); };
const espera = (ms) => p.waitForTimeout(ms);
const cartera = async () => (await sql`SELECT earned::int AS c, spent::int AS sp FROM wallets WHERE user_id = ${uid}`)[0];

try {
  console.log('Entrar');
  await p.goto(`http://localhost:${WEB_PORT}/index.html`); await espera(3500);
  await tapIf('.v2-privacidad [data-v="si"]'); await tapIf('#dailyClose'); await espera(400);
  check(await p.isVisible('#userBox'), 'el juego abre con la cuenta del servidor (sin pedir contraseña)');
  check((await p.textContent('#userBox')).includes('Ana'), 'muestra el nombre de la cuenta');

  console.log('Partida');
  await p.tap('#play'); await espera(3600);
  await p.evaluate(() => { window.__auto = true; }); await espera(9000);
  await p.evaluate(() => { window.__auto = false; });
  await p.waitForFunction(() => window.__g.st().state === 'over', null, { timeout: 20000 });
  const h = await p.evaluate(() => window.__g.st().hits);
  await espera(2500);
  const [m] = await sql`SELECT hits, payout::int AS payout, mode FROM matches WHERE user_id = ${uid} ORDER BY started_at DESC LIMIT 1`;
  check(m && m.hits === h, `la partida quedó cobrada en el servidor con ${h} rebotes`, JSON.stringify(m));
  const w1 = await cartera();
  check(w1.c === m.payout && w1.c > 0, `los pesos llegaron a la cartera ($${w1.c})`);
  const [sc] = await sql`SELECT best FROM scores WHERE user_id = ${uid} AND mode = 'classic'`;
  check(sc && sc.best === h, 'el récord clásico quedó guardado');
  await espera(1500);
  const [mt] = await sql`SELECT played_fixed, played_ms FROM matches WHERE user_id = ${uid} ORDER BY started_at DESC LIMIT 1`;
  check(mt.played_fixed, `el tiempo medido por el juego se corrigió (${mt.played_ms} ms)`);

  console.log('Racha');
  await tapIf('#backResult'); await espera(800);
  await p.locator('#streakChip').tap({ force: true }); await espera(800);
  await tapIf('#dailyGo'); await espera(2500);
  const [k] = await sql`SELECT days FROM streaks WHERE user_id = ${uid}`;
  check(k && k.days === 1, 'la racha del día 1 quedó cobrada');
  check((await cartera()).c === w1.c + 100, 'y pagó sus $100');
  await tapIf('.cele [data-act="ok"]'); await espera(500);

  console.log('Ruleta');
  await p.evaluate(() => document.getElementById('tabR').click()); await espera(900);
  await p.evaluate(() => document.getElementById('dailyGo').click()); await espera(7500);
  const [ru] = await sql`SELECT (extract(epoch from last_spin_at) * 1000)::bigint AS t, claimed_spin = last_spin_at AS cobrado FROM wheel WHERE user_id = ${uid}`;
  check(ru && ru.cobrado, 'la ruleta giró y se cobró en el servidor', JSON.stringify(ru));
  const w2 = await cartera(), [kk] = await sql`SELECT wheel_x2 + wheel_x3 + wheel_x4 AS m FROM streaks WHERE user_id = ${uid}`;
  check(w2.c > w1.c + 100 || kk.m === 1, 'y entregó su premio (pesos o un multiplicador guardado)', `${w2.c} ${kk.m}`);
  await tapIf('.cele [data-act="ok"]'); await espera(500);

  console.log('Misiones');
  await p.evaluate(() => document.getElementById('tabA').click()); await espera(900);
  const c3 = (await cartera()).c;
  await p.evaluate(() => document.getElementById('dailyGo').click()); await espera(4500);
  const logros = (await sql`SELECT achievement_id FROM achievements WHERE user_id = ${uid}`).map((x) => x.achievement_id);
  check(logros.includes('g1'), 'el logro «primera partida» quedó cobrado', JSON.stringify(logros));
  check((await cartera()).c === c3 + 100, 'y pagó su premio');
  await tapIf('.cele [data-act="ok"]'); await p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); }); await espera(500);

  console.log('Tienda');
  await sql`UPDATE wallets SET earned = earned + 1000 WHERE user_id = ${uid}`;
  await p.reload(); await espera(3500); await tapIf('#dailyClose');
  await p.tap('#openShop'); await espera(900); await p.tap('#tabBall'); await espera(700);
  const i = await p.evaluate(() => [...document.querySelectorAll('#shopGrid .item')].findIndex((c) => c.querySelector('.nm').textContent.includes('$5')));
  await p.locator('#shopGrid .item').nth(i).locator('button.lock').tap(); await espera(3000);
  await tapIf('.v2-cele [data-v="ok"]'); await espera(500);
  const inv = await sql`SELECT item_id FROM inventory WHERE user_id = ${uid}`;
  check(inv.some((x) => x.item_id === 'ball_peso5'), 'la pelota comprada quedó en el inventario', JSON.stringify(inv));
  const [eq] = await sql`SELECT item_id FROM equipped WHERE user_id = ${uid} AND slot = 'ball'`;
  check(eq && eq.item_id === 'peso5', 'y quedó equipada');
  check((await cartera()).sp === 5, 'se descontó su precio');

  console.log('Marcadores');
  await tapIf('#shopBack'); await espera(500);
  await p.tap('#openBoard'); await espera(2500);
  const tabla = await p.textContent('#board');
  check(tabla.includes('Ana'), 'el marcador muestra la partida');

  console.log('Arcade con power-up');
  await tapIf('#boardBack'); await p.evaluate(() => { const b = document.getElementById('boardBack') || document.getElementById('closeBoard'); if (b && b.offsetParent) b.click(); }); await espera(400);
  await sql`UPDATE wallets SET earned = earned + 500000 WHERE user_id = ${uid}`;
  await p.reload(); await espera(3500); await p.evaluate(() => { const b = document.getElementById('dailyClose'); if (b && b.offsetParent) b.click(); });
  await p.tap('#openShop'); await espera(900); await p.tap('#tabPu'); await espera(1200);
  await p.evaluate(() => document.querySelector('[data-pesos="wide"]').click()); await espera(3500);
  await tapIf('.v2-cele [data-v="ok"]'); await espera(400);
  const [pu0] = await sql`SELECT quantity FROM powerup_inventory WHERE user_id = ${uid} AND powerup_id = 'wide'`;
  check(pu0 && pu0.quantity === 1, 'compró un power-up con $500.000 del juego');
  await tapIf('#shopBack'); await espera(500);
  await p.tap('#playArcade'); await espera(3600);
  await p.evaluate(() => { window.__auto = true; }); await espera(1500);
  await p.locator('#v2hud button[data-k="wide"]').tap({ force: true }); await espera(1500);       // (responde al toque, no al clic)
  const [pu1] = await sql`SELECT quantity FROM powerup_inventory WHERE user_id = ${uid} AND powerup_id = 'wide'`;
  check(pu1.quantity === 0, 'usarlo en la partida lo descontó en el servidor en ese momento');
  const [mp] = await sql`SELECT count(*)::int AS n FROM match_powerups mp JOIN matches m ON m.id = mp.match_id WHERE m.user_id = ${uid} AND m.mode = 'arcade'`;
  check(mp.n === 1, 'y quedó anotado en la partida Arcade');
  await espera(3000); await p.evaluate(() => { window.__auto = false; });
  await p.waitForFunction(() => window.__g.st().state === 'over', null, { timeout: 20000 }); await espera(2500);
  const [sa] = await sql`SELECT best FROM scores WHERE user_id = ${uid} AND mode = 'arcade'`;
  check(sa && sa.best > 0, 'el récord Arcade va a su propio marcador', JSON.stringify(sa));
  await tapIf('#backResult'); await espera(600);

  console.log('Ajustes: nombre y eliminar cuenta');
  await p.evaluate(() => document.getElementById('openSettings').click()); await espera(500);
  await p.evaluate(() => document.getElementById('nameBtn').click()); await espera(500);
  await p.fill('#v2nombre', 'AnaPato'); await p.evaluate(() => document.querySelector('#v2nombre').form.requestSubmit()); await espera(1500);
  const [u1] = await sql`SELECT display_name, name_changed_at IS NOT NULL AS cambio FROM users WHERE id = ${uid}`;
  check(u1.display_name === 'AnaPato' && u1.cambio, 'el nombre cambió en el servidor', JSON.stringify(u1));
  check((await p.textContent('#userBox')).includes('AnaPato'), 'y el juego muestra el nombre nuevo');

  check(firebase.length === 0, 'el juego no habló con Firebase ni una vez', firebase.slice(0, 3).join(' '));
  check(errores.length === 0, 'sin errores de página', errores.slice(0, 5).join(' | '));
  console.log('pedidos a la API:', [...new Set(pedidos)].join(', '));
  await p.screenshot({ path: process.env.SHOT || '/tmp/juego-nube.png' });
  await p.evaluate(() => { const b = document.getElementById('openSettings'); if (b && b.offsetParent) b.click(); }); await espera(400);
  await p.evaluate(() => document.getElementById('delAcct').click()); await espera(500);
  await p.evaluate(() => document.querySelector('.v2 [data-v="si"]').click()); await espera(2000);
  const [gone] = await sql`SELECT count(*)::int AS n FROM users WHERE id = ${uid}`;
  check(gone.n === 0, 'eliminar la cuenta la borró del servidor');
} catch (e) { fail++; console.log('  FALLA (excepción)', e.message); await p.screenshot({ path: process.env.SHOT || '/tmp/juego-nube.png' }).catch(() => {}); }
finally {
  console.log(`${ok} correctas, ${fail} fallas`);
  await b.close(); web.close(); await sql.end(); api.kill('SIGTERM');
  process.exit(fail ? 1 : 0);
}
