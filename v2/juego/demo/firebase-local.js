// FIREBASE LOCAL (solo para la demo). Intercepta fetch() y responde como Firebase Authentication y Realtime Database,
// guardando todo en este navegador (localStorage). Así el juego corre COMPLETO (cuentas, racha, ruleta, misiones,
// emblemas, marcadores…) sin servidor. No valida las reglas de seguridad: eso lo hace el servidor real.
(function () {
  'use strict';
  const DB_URL = 'https://demo-tiopato.firebaseio.local';
  const KEY = 'tiopato-demo-firebase-v2';
  const realFetch = window.fetch.bind(window);
  window.DINERO_DB_URL = DB_URL;
  window.FIREBASE_API_KEY = 'demo-local';

  let st;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; }
  if (!st || !st.db) st = { db: {}, users: {}, n: 0 };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  // ── rivales de ejemplo para que los marcadores no se vean vacíos (con emblemas, como en el juego real) ──
  if (!st.seeded) {
    const now = Date.now(), dayOf = (t) => Math.floor((t - 3 * 3600000) / 86400000), day = dayOf(now);
    const week = Math.floor((day + 3) / 7);
    const d = new Date(now - 3 * 3600000), month = d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
    const bots = [
      ['Ocelot_chile', 412, 'i01c01', 9e6], ['LaJefa', 356, 'i05c03', 7e6], ['Agus699', 301, 'i09c07', 6.1e6], ['minikbum', 268, 'i23c11', 5e6],
      ['Javiercabeza', 233, 'i11c00', 4.4e6], ['Lermanda', 207, 'i22c01', 3.9e6], ['Benja_07', 188, 'i14c06', 3.1e6], ['Cami', 171, 'i26c09', 2.6e6],
      ['ElRulo', 149, 'i07c02', 2e6], ['Pancho', 133, 'i31c04', 1.5e6], ['Anto', 118, 'i37c10', 1.2e6], ['Seba', 96, 'i03c08', 9e5], ['Flo', 81, 'i29c05', 6e5], ['Nico', 64, 'i40c12', 3e5],
    ];
    st.db.scores = st.db.scores || {}; st.db.weekly = st.db.weekly || {}; st.db.monthly = st.db.monthly || {}; st.db.hist = st.db.hist || {};
    st.db.weekly[week] = st.db.weekly[week] || {}; st.db.monthly[month] = st.db.monthly[month] || {};
    // emblemas de verdad (mismo formato que el editor del juego: forma, colores, diseño y un símbolo)
    const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
    const emb = (i) => 'e' + B64[i % 3] + B64[(i * 5 + 1) % 16] + B64[(i * 7 + 4) % 16] + B64[i % 3] + B64[1 + ((i * 11 + 3) % 48)] + B64[16] + B64[16] + B64[3 * 8];
    bots.forEach(([n, s, , ms], i) => {
      const a = i % 4 === 3 ? undefined : emb(i);                    // algunos sin emblema: se ve la letra, como en el juego real
      const uid = 'bot' + String(i).padStart(2, '0') + 'demoaaaaaaaaaaaaaaaaa';
      const k = n.toLowerCase().replace(/[^a-z0-9]+/g, '.');
      st.db.scores[uid] = { n, k, s, t: now - i * 3600000, ms, c: s, ...(a ? { a } : {}) };
      st.db.hist[s] = (st.db.hist[s] || 0) + 1;
      st.db.weekly[week][uid] = { n, s: Math.round(s * 0.31), ...(a ? { a } : {}) };
      st.db.monthly[month][uid] = { n, s: Math.round(s * 0.62), ...(a ? { a } : {}) };
      if (i % 3 === 0) { st.db.arcade = st.db.arcade || {}; st.db.arcade[uid] = { n, s: Math.round(s * 1.2), t: now, ...(a ? { a } : {}) }; }
    });
    st.seeded = true; save();
  }

  // ── utilidades ──
  const json = (body, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const b64u = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => { try { return JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; } };
  const token = (uid, email) => { const iat = Math.floor(Date.now() / 1000); return 'e30.' + b64u({ user_id: uid, sub: uid, email, email_verified: true, aud: 'demo', iat, exp: iat + 3600 }) + '.demo'; };
  const uidOfToken = (t) => (unb64u(String(t || '').split('.')[1]) || {}).user_id || null;
  const emailOfUid = (uid) => Object.keys(st.users).find((e) => st.users[e].uid === uid);
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const parts = (path) => path.split('/').filter(Boolean).map(decodeURIComponent);
  const get = (p) => p.reduce((o, k) => (o == null || typeof o !== 'object' ? null : o[k] === undefined ? null : o[k]), st.db);
  // valores del servidor: { ".sv": "timestamp" } y { ".sv": { "increment": n } }
  const resolve = (v, current) => {
    if (v && typeof v === 'object' && '.sv' in v) {
      if (v['.sv'] === 'timestamp') return Date.now();
      if (v['.sv'] && typeof v['.sv'].increment === 'number') return (typeof current === 'number' ? current : 0) + v['.sv'].increment;
    }
    if (v && typeof v === 'object') { const out = {}; for (const k in v) { const r = resolve(v[k], current && current[k]); if (r !== null && r !== undefined) out[k] = r; } return Object.keys(out).length ? out : null; }
    return v;
  };
  const set = (p, value) => {
    if (!p.length) { st.db = value || {}; return; }
    let o = st.db;
    for (let i = 0; i < p.length - 1; i++) { if (!o[p[i]] || typeof o[p[i]] !== 'object') o[p[i]] = {}; o = o[p[i]]; }
    const last = p[p.length - 1], v = resolve(value, o[last]);
    if (v === null || v === undefined) delete o[last]; else o[last] = v;
    // limpia ramas vacías (como Firebase)
    for (let i = p.length - 1; i > 0; i--) { const parent = get(p.slice(0, i)); if (parent && typeof parent === 'object' && !Object.keys(parent).length) set(p.slice(0, i), null); else break; }
  };

  function query(value, q) {
    if (!value || typeof value !== 'object') return value;
    const ob = (q.get('orderBy') || '').replace(/"/g, '');
    if (q.get('shallow') === 'true') return Object.fromEntries(Object.keys(value).map((k) => [k, true]));
    if (!ob) return value;
    const val = (row) => (ob === '$key' ? row[0] : row[1] && typeof row[1] === 'object' ? row[1][ob] : undefined);
    let rows = Object.entries(value).sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === y) return a[0] < b[0] ? -1 : 1;
      if (x === undefined || x === null) return -1; if (y === undefined || y === null) return 1;
      return x < y ? -1 : 1;
    });
    const p = (name) => (q.has(name) ? JSON.parse(q.get(name)) : undefined);
    const eq = p('equalTo'), from = p('startAt'), to = p('endAt');
    if (eq !== undefined) rows = rows.filter((r) => val(r) === eq);
    if (from !== undefined) rows = rows.filter((r) => val(r) >= from);
    if (to !== undefined) rows = rows.filter((r) => val(r) <= to);
    if (q.get('limitToFirst')) rows = rows.slice(0, +q.get('limitToFirst'));
    if (q.get('limitToLast')) rows = rows.slice(-q.get('limitToLast'));
    return rows.length ? Object.fromEntries(rows) : null;
  }

  async function database(url, method, body) {
    const p = parts(url.pathname.replace(/\.json$/, '')), q = url.searchParams;
    const silent = q.get('print') === 'silent';
    if (method === 'GET') return json(clone(query(get(p), q)));
    const data = body ? JSON.parse(body) : null;
    if (method === 'PUT') set(p, data);
    else if (method === 'DELETE') set(p, null);
    else if (method === 'PATCH') for (const k of Object.keys(data || {})) set(p.concat(parts(k)), data[k]);
    else return json({ error: 'método no soportado' }, 405);
    save();
    return silent ? new Response(null, { status: 204 }) : json(method === 'DELETE' ? null : clone(get(p)));
  }

  function auth(action, b) {
    const err = (m) => json({ error: { message: m } }, 400);
    const ok = (email) => { const u = st.users[email]; return json({ localId: u.uid, email, displayName: u.name || '', idToken: token(u.uid, email), refreshToken: 'rt|' + u.uid, expiresIn: '3600', registered: true }); };
    if (action === 'signUp') {
      if (st.users[b.email]) return err('EMAIL_EXISTS');
      if (!b.password || b.password.length < 6) return err('WEAK_PASSWORD : Password should be at least 6 characters');
      st.users[b.email] = { uid: 'demo' + (st.n++) + Math.random().toString(36).slice(2, 12) + 'xxxxxxxxxx', pass: b.password, name: '' }; save(); return ok(b.email);
    }
    if (action === 'signInWithPassword') { const u = st.users[b.email]; return !u || u.pass !== b.password ? err('INVALID_LOGIN_CREDENTIALS') : ok(b.email); }
    if (action === 'sendOobCode') return json({ email: b.email || '' });
    const email = emailOfUid(uidOfToken(b.idToken));
    if (!email) return err('INVALID_ID_TOKEN');
    if (action === 'update') {
      let e = email;
      if (b.email && b.email !== email) { if (st.users[b.email]) return err('EMAIL_EXISTS'); st.users[b.email] = st.users[email]; delete st.users[email]; e = b.email; }
      if (b.displayName) st.users[e].name = b.displayName;
      if (b.password) st.users[e].pass = b.password;
      save(); return ok(e);
    }
    if (action === 'lookup') { const u = st.users[email]; return json({ users: [{ localId: u.uid, email, emailVerified: true, displayName: u.name || '' }] }); }
    if (action === 'delete') { delete st.users[email]; save(); return json({}); }
    return err('OPERATION_NOT_ALLOWED');
  }

  window.fetch = async function (input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = (init.method || 'GET').toUpperCase();
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));          // un poco de «red» para que se vea como en el juego real
    if (url.origin === DB_URL) return database(url, method, init.body);
    if (url.host === 'identitytoolkit.googleapis.com') return auth((url.pathname.match(/accounts:(\w+)/) || [])[1], JSON.parse(init.body || '{}'));
    if (url.host === 'securetoken.googleapis.com') {
      const uid = String(new URLSearchParams(init.body || '').get('refresh_token') || '').split('|')[1], email = emailOfUid(uid);
      return email ? json({ id_token: token(uid, email), refresh_token: 'rt|' + uid, expires_in: '3600', user_id: uid }) : json({ error: { message: 'USER_NOT_FOUND' } }, 400);
    }
    return realFetch(input, init);
  };

  // atajos de la demo (Ajustes → «Pesos de prueba»)
  window.__demo = {
    reset() { localStorage.removeItem(KEY); location.reload(); },
    hasUser: (mail) => !!st.users[mail],
    addCoins(uid, amount) { const w = get(['wallets', uid]) || { c: 0, sp: 0 }; set(['wallets', uid, 'c'], (w.c || 0) + amount); save(); },
  };
})();

// ── botón «Entrar como demo» (solo en la demo): crea o abre una cuenta de prueba sin escribir nada ──
(function () {
  const DEMO = { mail: 'demo@tiopato.demo', name: 'PatoDemo', pass: 'demo12345' };
  function poner() {
    const go = document.getElementById('authGo'); if (!go || document.getElementById('demoGo')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'demoGo'; b.className = 'btn demo-go'; b.textContent = '🎮 Entrar como demo';
    const nota = document.createElement('p'); nota.className = 'demo-nota';
    nota.textContent = 'Esta demo no usa tu cuenta real: todo se guarda solo en este teléfono.';
    go.before(b, nota);
    b.addEventListener('click', () => {
      const existe = window.__demo.hasUser(DEMO.mail);
      document.getElementById(existe ? 'tabIn' : 'tabUp').click();
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      if (existe) { set('acct', DEMO.mail); } else { set('acctMail', DEMO.mail); set('acct', DEMO.name); }
      set('pass', DEMO.pass);
      document.getElementById('authGo').click();
    });
    const css = document.createElement('style');
    css.textContent = '.btn.demo-go{width:100%;margin:0 0 4px;background:linear-gradient(180deg,#fff6c2,#ffd95a 40%,#f2b01e);color:#3a2600;box-shadow:inset 0 1px 0 #fffbe0,0 4px 0 #8a5a08;font-weight:900}.demo-nota{margin:0 0 10px;font-size:12px;font-weight:700;color:var(--muted,#666);text-align:center}body.th-dark .demo-nota{color:rgba(255,255,255,.75)}';
    document.head.appendChild(css);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner); else poner();
})();
