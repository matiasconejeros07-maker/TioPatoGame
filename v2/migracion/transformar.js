// Convierte la exportación de Firebase (Realtime Database + Authentication) en filas para PostgreSQL.
// Es una función pura: no toca la red ni la base, así se puede probar y repetir las veces que haga falta.

const INTERNAL_MAIL = '@tio-pato.invalid';     // correo interno de las cuentas «nombre + contraseña» de la V1
const NAME_KEY_RE = /^[a-z0-9.]{3,24}$/;
const PERIOD_FIELDS = ['sl', 'd', 'dg', 'dr', 'dm', 'dc', 'w', 'wg', 'wr', 'wm', 'wc', 'ml', 'mo', 'mm'];
const NODES_BY_UID = ['wallets', 'scores', 'streaks', 'stats', 'missions', 'ruleta', 'vip', 'roles', 'marco', 'mynames', 'compradores', 'runs'];

const date = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms) : null);
const int = (v) => (Number.isFinite(v) ? Math.trunc(v) : 0);

/**
 * @param {object} rtdb       raíz de la Realtime Database (Exportar JSON)
 * @param {object[]} authUsers lista `users` de `firebase auth:export --format=json`
 * @returns {{ users: object[], anomalies: string[], totals: object }}
 */
export function transform(rtdb, authUsers = []) {
  const db = rtdb ?? {};
  const auth = new Map(authUsers.map((u) => [u.localId, u]));
  const uids = new Set(auth.keys());
  for (const node of NODES_BY_UID) for (const uid of Object.keys(db[node] ?? {})) uids.add(uid);
  for (const kind of ['weekly', 'monthly'])
    for (const period of Object.values(db[kind] ?? {})) for (const uid of Object.keys(period ?? {})) uids.add(uid);

  // dueño oficial de cada nombre (names/<nombre con comas> = uid)
  const nameOwner = new Map(Object.entries(db.names ?? {}).map(([k, uid]) => [k.replaceAll(',', '.'), uid]));
  const anomalies = [];
  const takenKeys = new Map();
  const users = [];

  for (const uid of [...uids].sort()) {
    const account = auth.get(uid);
    const email = account?.email ?? null;
    const score = db.scores?.[uid];
    const wallet = db.wallets?.[uid];
    const streak = db.streaks?.[uid];
    const stat = db.stats?.[uid];
    const wheel = db.ruleta?.[uid];
    const vip = db.vip?.[uid];

    let nameKey = score?.k ?? db.mynames?.[uid] ?? (email?.endsWith(INTERNAL_MAIL) ? email.slice(0, -INTERNAL_MAIL.length) : null);
    if (nameKey && !NAME_KEY_RE.test(nameKey)) { anomalies.push(`${uid}: nombre con formato inválido «${nameKey}»`); nameKey = null; }
    if (nameKey && takenKeys.has(nameKey)) {
      // dos cuentas con el mismo nombre: se lo queda la que figura en `names`; la otra conserva todo menos el nombre único
      const other = takenKeys.get(nameKey);
      const keepsIt = nameOwner.get(nameKey) === uid;
      anomalies.push(`nombre «${nameKey}» repetido en ${other.firebaseUid} y ${uid}`);
      if (keepsIt) other.nameKey = null; else nameKey = null;
    }

    const earned = int(wallet?.c), spent = int(wallet?.sp);
    if (spent > earned) anomalies.push(`${uid}: gastado (${spent}) mayor que ganado (${earned})`);

    const periodScores = [];
    for (const [kind, node] of [['w', 'weekly'], ['m', 'monthly']])
      for (const [period, rows] of Object.entries(db[node] ?? {}))
        if (rows?.[uid]) periodScores.push({ kind, period: Number(period), best: int(rows[uid].s) });

    const snapshot = {};
    for (const node of NODES_BY_UID) if (db[node]?.[uid] !== undefined) snapshot[node] = db[node][uid];
    if (periodScores.length) snapshot.periodScores = periodScores;

    const user = {
      firebaseUid: uid,
      displayName: (score?.n ?? account?.displayName ?? nameKey ?? 'Jugador').slice(0, 16) || 'Jugador',
      nameKey,
      legacyEmail: email && !email.endsWith(INTERNAL_MAIL) ? email : null,
      avatar: wallet?.av ?? score?.a ?? null,
      goldenFrame: db.marco?.[uid] === true,
      role: ['tio', 'tia', 'dev'].includes(db.roles?.[uid]) ? db.roles[uid] : null,
      createdAt: date(Number(account?.createdAt)) ?? date(db.compradores?.[uid]?.t),
      wallet: { earned, spent, lastRun: Number.isFinite(wallet?.lr) ? wallet.lr : null },
      inventory: Object.entries(wallet?.own ?? {}).filter(([, v]) => v === true).map(([itemId]) => ({
        itemId, acquiredAt: itemId === 'ch_millonario' ? date(db.compradores?.[uid]?.t) : null,
      })),
      equipped: Object.entries(wallet?.eq ?? {}).map(([slot, itemId]) => ({ slot, itemId: String(itemId) })),
      streak: streak ? {
        days: int(streak.n), lastClaimAt: date(streak.t),
        x2: int(streak.x2), x3: int(streak.x3), x4: int(streak.x4),
        y2: int(streak.y2), y3: int(streak.y3), y4: int(streak.y4),
        boostStartedAt: date(streak.bx), boostMult: streak.bm ?? null, boostMs: streak.bd ?? null,
      } : null,
      score: score ? { best: int(score.s), bestAt: date(score.t), playedMs: int(score.ms) } : null,
      periodScores,
      stats: stat ? {
        games: int(stat.g), bounces: int(stat.r),
        periods: Object.fromEntries(PERIOD_FIELDS.filter((f) => stat[f] !== undefined).map((f) => [f, stat[f]])),
      } : null,
      achievements: Object.entries(db.missions?.[uid] ?? {}).filter(([, v]) => v === true).map(([id]) => id),
      wheel: wheel ? { lastSpinAt: date(wheel.t), claimedSpin: date(wheel.c) } : null,
      vip: vip?.w ? { whatsapp: String(vip.w), consent: vip.c === true, leftAt: date(vip.t) } : null,
      snapshot,
    };
    if (user.nameKey) takenKeys.set(user.nameKey, user);
    users.push(user);
  }
  return { users, anomalies, totals: totalsOf(users) };
}

/** Sumas de control: se comparan con las de PostgreSQL después de cargar. */
export function totalsOf(users) {
  const sum = (f) => users.reduce((a, u) => a + f(u), 0);
  return {
    users: users.length,
    earned: sum((u) => u.wallet.earned),
    spent: sum((u) => u.wallet.spent),
    items: sum((u) => u.inventory.length),
    streakDays: sum((u) => u.streak?.days ?? 0),
    savedMultipliers: sum((u) => (u.streak ? u.streak.x2 + u.streak.x3 + u.streak.x4 + u.streak.y2 + u.streak.y3 + u.streak.y4 : 0)),
    bestScores: sum((u) => u.score?.best ?? 0),
    playedMs: sum((u) => u.score?.playedMs ?? 0),
    games: sum((u) => u.stats?.games ?? 0),
    achievements: sum((u) => u.achievements.length),
  };
}
