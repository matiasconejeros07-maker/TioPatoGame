// El juego sobre PostgreSQL: estado de la cuenta, cobro de partidas, racha, ruleta, misiones, tienda, perfil y marcadores.
// Reemplaza a las reglas de Firebase de la V1 con la diferencia de que aquí el SERVIDOR calcula cuánto se gana: el juego
// solo dice qué pasó (cuántos rebotes, qué casilla cobrar) y el servidor lo comprueba y paga. Todo lo que mueve pesos va
// en una transacción con la fila de la cartera bloqueada, así dos toques a la vez nunca cobran dos veces.
//
// Los datos se devuelven con los mismos nombres cortos de la V1 (c, sp, own, eq, n, t, x2…), así el juego cambia lo mínimo.
// Las horas se reciben y se devuelven en ms (la hora del servidor de la API).
import { HttpError } from '../services/errors.js';
import { MatchMode } from '../../../shared/catalog.js';
import * as E from '../../../shared/economia.js';

const C_MAX = E.ECO.cMax;
/** ms → timestamptz exacto (sin pasar por números con decimales). */
const at = (sql, ms) => sql`(timestamptz 'epoch' + ${Math.round(ms)} * interval '1 millisecond')`;
/** timestamptz → ms (columna), como número. */
const msOf = (sql, col) => sql`(extract(epoch from ${sql(col)}) * 1000)::bigint`;
const num = (v) => (v === null || v === undefined ? null : Number(v));

export class GameRepository {
  /** @param {import('postgres').Sql} sql */
  constructor(sql) { this.sql = sql; }

  // ───────────────────────── lectura ─────────────────────────

  /** Todo lo que el juego necesita al abrir: cuenta, cartera, racha, misiones, ruleta, récords y lo de la V2. */
  async state(userId, now) {
    const sql = this.sql;
    const [u] = await sql`
      SELECT id, display_name, name_key, avatar, golden_frame, role, played_ms, ${msOf(sql, 'name_changed_at')} AS nc,
             EXISTS (SELECT 1 FROM identities i WHERE i.user_id = users.id) AS sso
      FROM users WHERE id = ${userId}`;
    if (!u) throw new HttpError(401, 'sesion_invalida');
    const [wallet, streak, stats, missions, wheel, scores, powerups, entitlements, vip] = await Promise.all([
      this.#wallet(sql, userId), this.#streak(sql, userId), this.#stats(sql, userId),
      sql`SELECT achievement_id FROM achievements WHERE user_id = ${userId}`,
      sql`SELECT ${msOf(sql, 'last_spin_at')} AS t, ${msOf(sql, 'claimed_spin')} AS c FROM wheel WHERE user_id = ${userId}`,
      sql`SELECT mode, best, ${msOf(sql, 'best_at')} AS t FROM scores WHERE user_id = ${userId}`,
      sql`SELECT powerup_id, quantity FROM powerup_inventory WHERE user_id = ${userId}`,
      sql`SELECT entitlement_id FROM entitlements WHERE user_id = ${userId}`,
      sql`SELECT whatsapp, consent, ${msOf(sql, 'left_at')} AS t FROM vip_contacts WHERE user_id = ${userId}`,
    ]);
    const best = (mode) => scores.find((s) => s.mode === mode);
    const secret = wallet.own[`ch_${E.SECRET_ID}`];
    return {
      now, uid: u.id, name: u.display_name, key: u.name_key, role: u.role, av: u.avatar, marco: u.golden_frame, sso: u.sso,
      wallet, streak, stats, missions: Object.fromEntries(missions.map((m) => [m.achievement_id, true])),
      ruleta: wheel[0]?.t ? { t: num(wheel[0].t), ...(wheel[0].c ? { c: num(wheel[0].c) } : {}) } : null,
      scores: { s: best('classic')?.best ?? 0, t: num(best('classic')?.t), ms: num(u.played_ms) },
      arcade: { s: best('arcade')?.best ?? 0 },
      v2: { pu: Object.fromEntries(powerups.map((p) => [p.powerup_id, Math.max(0, p.quantity)])), na: entitlements.some((e) => e.entitlement_id === 'no_ads'), nc: num(u.nc) },
      vip: vip[0] ? { w: vip[0].whatsapp, c: vip[0].consent, t: num(vip[0].t) } : null,
      compradores: secret ? { n: u.display_name } : null,
    };
  }

  async #wallet(sql, userId) {
    const [w] = await sql`SELECT earned, spent FROM wallets WHERE user_id = ${userId}`;
    const own = await sql`SELECT item_id FROM inventory WHERE user_id = ${userId}`;
    const eq = await sql`SELECT slot, item_id FROM equipped WHERE user_id = ${userId}`;
    const equipped = Object.fromEntries(E.CATEGORIAS.map((c) => [c, E.defaultItem(c)]));
    for (const e of eq) if (E.CATEGORIAS.includes(e.slot)) equipped[e.slot] = e.item_id;
    return { c: num(w?.earned) ?? 0, sp: num(w?.spent) ?? 0, own: Object.fromEntries(own.map((i) => [i.item_id, true])), eq: equipped };
  }
  async #streak(sql, userId) {
    const [k] = await sql`
      SELECT days, ${msOf(sql, 'last_claim_at')} AS t, streak_x2, streak_x3, streak_x4, wheel_x2, wheel_x3, wheel_x4,
             ${msOf(sql, 'boost_started_at')} AS bx, boost_mult, boost_ms
      FROM streaks WHERE user_id = ${userId}`;
    if (!k) return null;
    return { n: k.days, t: num(k.t) ?? 0, x2: k.streak_x2, x3: k.streak_x3, x4: k.streak_x4, y2: k.wheel_x2, y3: k.wheel_x3, y4: k.wheel_x4,
      ...(k.bx ? { bx: num(k.bx), bm: k.boost_mult ?? 2, bd: k.boost_ms ?? E.ECO.racha.dobleMs } : {}) };
  }
  async #stats(sql, userId) {
    const [s] = await sql`SELECT games, bounces, periods FROM stats WHERE user_id = ${userId}`;
    return s ? { ...s.periods, g: num(s.games), r: num(s.bounces) } : null;
  }

  /** Bloquea la cartera de la cuenta (la crea si no existe) para mover pesos sin carreras. */
  async #lockWallet(tx, userId) {
    await tx`INSERT INTO wallets (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
    const [w] = await tx`SELECT earned, spent FROM wallets WHERE user_id = ${userId} FOR UPDATE`;
    return { earned: num(w.earned), spent: num(w.spent) };
  }
  async #pay(tx, userId, pesos) {
    if (pesos <= 0) return;
    await tx`UPDATE wallets SET earned = LEAST(${C_MAX}::bigint, earned + ${pesos}) WHERE user_id = ${userId}`;
  }

  // ───────────────────────── partidas ─────────────────────────

  /**
   * Empieza una partida: anota la hora del servidor, la pelota que lleva puesta (tiene que ser suya) y si hay un
   * multiplicador activo. Así el pago ya no depende de nada que el jugador cambie después.
   */
  startMatch(userId, mode, now) {
    return this.sql.begin(async (tx) => {
      const wallet = await this.#wallet(tx, userId);
      const ball = wallet.eq.ball === E.defaultItem('ball') || wallet.own[`ball_${wallet.eq.ball}`] ? wallet.eq.ball : E.defaultItem('ball');
      const streak = await this.#streak(tx, userId);
      const mult = E.boostMult(now, streak);
      await tx`UPDATE matches SET ended_at = ${at(tx, now)} WHERE user_id = ${userId} AND ended_at IS NULL`;
      const [m] = await tx`
        INSERT INTO matches (user_id, mode, started_at, ball_id, rate, mult)
        VALUES (${userId}, ${mode}, ${at(tx, now)}, ${ball}, ${E.ballRate(ball)}, ${mult}) RETURNING id`;
      return { matchId: m.id, mode, s: now, ball, rate: E.ballRate(ball), mult };
    });
  }

  /**
   * Termina y cobra una partida, todo junto y una sola vez: pesos (pelota × rebotes × multiplicador), récord del modo,
   * marcadores de la semana y del mes, estadísticas de las misiones y tiempo jugado. Los rebotes no pueden ser más
   * de los que caben en lo que duró la partida en el servidor. Repetirlo (se perdió la respuesta) devuelve lo mismo.
   */
  finishMatch(userId, matchId, { hits, playedMs }, now) {
    if (!Number.isInteger(hits) || hits < 0 || hits > E.ECO.hMax) throw new HttpError(422, 'rebotes_invalidos');
    return this.sql.begin(async (tx) => {
      const [m] = await tx`
        SELECT mode, rate, mult, hits, payout, played_ms, ended_at IS NULL AS open, ${msOf(tx, 'started_at')} AS s
        FROM matches WHERE id = ${matchId} AND user_id = ${userId} FOR UPDATE`;
      if (!m) throw new HttpError(404, 'partida_no_encontrada');
      const start = num(m.s);
      if (m.hits !== null) return { already: true, ...(await this.#afterMatch(tx, userId, m.mode)), pesos: num(m.payout), mult: m.mult, hits: m.hits, record: false };
      if (!m.open) throw new HttpError(409, 'partida_cerrada');
      const elapsed = now - start;
      if (hits > E.maxHits(elapsed)) throw new HttpError(422, 'rebotes_imposibles', undefined, { max: E.maxHits(elapsed) });

      await this.#lockWallet(tx, userId);
      const pesos = m.rate * E.pesosFor(hits) * m.mult;
      await this.#pay(tx, userId, pesos);

      // récord del modo (classic = el marcador principal · arcade = con power-ups)
      const [prev] = await tx`SELECT best FROM scores WHERE user_id = ${userId} AND mode = ${m.mode}`;
      const record = hits > (prev?.best ?? 0);
      if (record || !prev) await tx`
        INSERT INTO scores (user_id, mode, best, best_at) VALUES (${userId}, ${m.mode}, ${hits}, ${at(tx, now)})
        ON CONFLICT (user_id, mode) DO UPDATE SET best = GREATEST(scores.best, EXCLUDED.best),
          best_at = CASE WHEN EXCLUDED.best > scores.best THEN EXCLUDED.best_at ELSE scores.best_at END`;

      // tiempo jugado (de la cuenta, cuenta en los dos modos)
      const inc = E.playedIncrement(playedMs, elapsed, hits);
      await tx`UPDATE users SET played_ms = played_ms + ${inc} WHERE id = ${userId}`;

      // misiones y marcadores de la semana y del mes: solo partidas de verdad (desde minRebotes)
      if (hits >= E.MIN_REBOTES) {
        const old = await this.#stats(tx, userId);
        const st = E.statsAfterMatch(old, hits, start, now), { g, r, ...periods } = st;
        await tx`
          INSERT INTO stats (user_id, games, bounces, periods) VALUES (${userId}, ${g}, ${r}, ${tx.json(periods)})
          ON CONFLICT (user_id) DO UPDATE SET games = EXCLUDED.games, bounces = EXCLUDED.bounces, periods = EXCLUDED.periods`;
        for (const [kind, period] of [['w', st.w], ['m', st.mo]]) await tx`
          INSERT INTO period_scores (mode, kind, period, user_id, best) VALUES (${m.mode}, ${kind}, ${period}, ${userId}, ${hits})
          ON CONFLICT (mode, kind, period, user_id) DO UPDATE SET best = GREATEST(period_scores.best, EXCLUDED.best)`;
      }
      await tx`UPDATE matches SET ended_at = ${at(tx, now)}, hits = ${hits}, payout = ${pesos}, played_ms = ${inc} WHERE id = ${matchId}`;
      return { already: false, ...(await this.#afterMatch(tx, userId, m.mode)), pesos, mult: m.mult, hits, record, playedInc: inc };
    });
  }
  async #afterMatch(tx, userId, mode) {
    const [s] = await tx`SELECT best FROM scores WHERE user_id = ${userId} AND mode = ${mode}`;
    const [u] = await tx`SELECT played_ms FROM users WHERE id = ${userId}`;
    return { wallet: await this.#wallet(tx, userId), stats: await this.#stats(tx, userId), best: s?.best ?? 0, playedMs: num(u.played_ms) };
  }

  // ───────────────────────── racha diaria ─────────────────────────

  /** Cobra el premio de hoy: el servidor decide el día, si la racha sigue y cuánto paga (y los multiplicadores de regalo). */
  claimStreak(userId, now) {
    return this.sql.begin(async (tx) => {
      await this.#lockWallet(tx, userId);
      await tx`INSERT INTO streaks (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
      await tx`SELECT 1 FROM streaks WHERE user_id = ${userId} FOR UPDATE`;
      const cur = await this.#streak(tx, userId);
      const n = E.nextStreakDay(cur.t ? cur : null, now);
      if (n === null) throw new HttpError(409, 'racha_ya_cobrada');
      const pesos = E.streakReward(n), gift = E.streakGift(n);
      await tx`
        UPDATE streaks SET days = ${n}, last_claim_at = ${at(tx, now)},
          streak_x2 = streak_x2 + ${gift === 2 ? 1 : 0}, streak_x3 = streak_x3 + ${gift === 3 ? 1 : 0}, streak_x4 = streak_x4 + ${gift === 4 ? 1 : 0}
        WHERE user_id = ${userId}`;
      await this.#pay(tx, userId, pesos);
      return { n, pesos, gift, streak: await this.#streak(tx, userId), wallet: await this.#wallet(tx, userId) };
    });
  }

  /** Activa un multiplicador guardado: de la racha (x, dura 10 min) o de la ruleta (y, dura 5 min). Uno a la vez. */
  activateBoost(userId, { mult, from }, now) {
    const list = from === 'x' ? E.STREAK_MULTS : from === 'y' ? E.WHEEL_MULTS : [];
    if (!list.includes(mult)) throw new HttpError(422, 'multiplicador_invalido');
    const col = `${from === 'x' ? 'streak' : 'wheel'}_x${mult}`, dura = from === 'x' ? E.ECO.racha.dobleMs : E.ECO.ruleta.multMs;
    return this.sql.begin(async (tx) => {
      const [k] = await tx`SELECT ${tx(col)} AS left, ${msOf(tx, 'boost_started_at')} AS bx, boost_ms FROM streaks WHERE user_id = ${userId} FOR UPDATE`;
      if (!k || k.left < 1) throw new HttpError(409, 'sin_multiplicador');
      if (k.bx && num(k.bx) + (k.boost_ms ?? E.ECO.racha.dobleMs) > now) throw new HttpError(409, 'multiplicador_activo');
      await tx`UPDATE streaks SET ${tx(col)} = ${tx(col)} - 1, boost_started_at = ${at(tx, now)}, boost_mult = ${mult}, boost_ms = ${dura} WHERE user_id = ${userId}`;
      return { streak: await this.#streak(tx, userId) };
    });
  }

  // ───────────────────────── ruleta diaria ─────────────────────────

  /** Gira (una vez por día de Chile): el premio sale de la hora del giro, que pone el servidor. */
  spinWheel(userId, now) {
    return this.sql.begin(async (tx) => {
      await tx`INSERT INTO wheel (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
      const [w] = await tx`SELECT ${msOf(tx, 'last_spin_at')} AS t, ${msOf(tx, 'claimed_spin')} AS c FROM wheel WHERE user_id = ${userId} FOR UPDATE`;
      const t = num(w.t);
      if (t && num(w.c) !== t) return { t, slot: E.wheelSlot(t), pending: true };              // giro anterior sin cobrar: se muestra el mismo
      if (!E.canSpin(t, now)) throw new HttpError(409, 'ruleta_ya_girada');
      await tx`UPDATE wheel SET last_spin_at = ${at(tx, now)} WHERE user_id = ${userId}`;
      return { t: now, slot: E.wheelSlot(now), pending: false };
    });
  }

  /** Cobra el giro: pesos a la cartera o un multiplicador guardado de la ruleta (y2/y3/y4). Una sola vez. */
  claimWheel(userId) {
    return this.sql.begin(async (tx) => {
      const [w] = await tx`SELECT ${msOf(tx, 'last_spin_at')} AS t, ${msOf(tx, 'claimed_spin')} AS c FROM wheel WHERE user_id = ${userId} FOR UPDATE`;
      const t = num(w?.t);
      if (!t) throw new HttpError(409, 'sin_giro');
      if (num(w.c) === t) throw new HttpError(409, 'giro_ya_cobrado');
      const prize = E.wheelPrize(t);
      await this.#lockWallet(tx, userId);
      await this.#pay(tx, userId, prize.pesos);
      if (prize.mult) {
        await tx`INSERT INTO streaks (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
        await tx`UPDATE streaks SET ${tx(`wheel_x${prize.mult}`)} = ${tx(`wheel_x${prize.mult}`)} + 1 WHERE user_id = ${userId}`;
      }
      await tx`UPDATE wheel SET claimed_spin = last_spin_at WHERE user_id = ${userId}`;
      return { t, ...prize, ruleta: { t, c: t }, wallet: await this.#wallet(tx, userId), streak: await this.#streak(tx, userId) };
    });
  }

  // ───────────────────────── misiones ─────────────────────────

  /**
   * Cobra una misión: un logro de una sola vez ({ logro: id }), una casilla de hoy ({ dia: k }) o de la semana ({ semana: k }).
   * El servidor comprueba la meta con lo que él mismo contó (estadísticas de partidas cobradas, récord, racha…).
   */
  claimMission(userId, pedido, now) {
    return this.sql.begin(async (tx) => {
      await this.#lockWallet(tx, userId);
      await tx`INSERT INTO stats (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
      await tx`SELECT 1 FROM stats WHERE user_id = ${userId} FOR UPDATE`;
      const st = await this.#stats(tx, userId), day = E.dayOf(now), week = E.weekOf(day);
      let pesos;
      if (pedido.logro !== undefined) {
        const l = E.logroOf(pedido.logro); if (!l) throw new HttpError(422, 'mision_invalida');
        const [ya] = await tx`SELECT 1 FROM achievements WHERE user_id = ${userId} AND achievement_id = ${l.id}`;
        if (ya) throw new HttpError(409, 'mision_ya_cobrada');
        if (!(await this.#logroCumplido(tx, userId, l, st))) throw new HttpError(409, 'mision_incompleta');
        await tx`INSERT INTO achievements (user_id, achievement_id) VALUES (${userId}, ${l.id})`;
        pesos = l.premio;
      } else {
        const semanal = pedido.semana !== undefined, k = semanal ? pedido.semana : pedido.dia;
        const lista = semanal ? E.weeklyMissions(week) : E.dailyMissions(day), mis = lista[k];
        if (!Number.isInteger(k) || !mis) throw new HttpError(422, 'mision_invalida');
        const vigente = semanal ? st.w === week : st.d === day, campoHechas = semanal ? 'wc' : 'dc';
        const hechas = vigente ? st[campoHechas] || 0 : 0;
        if ((hechas >> k) & 1) throw new HttpError(409, 'mision_ya_cobrada');
        if (!vigente || (st[mis.campo] || 0) < mis.meta) throw new HttpError(409, 'mision_incompleta');
        const { g, r, ...periods } = { ...st, [campoHechas]: hechas | (1 << k) };
        await tx`UPDATE stats SET periods = ${tx.json(periods)} WHERE user_id = ${userId}`;
        pesos = mis.premio;
      }
      await this.#pay(tx, userId, pesos);
      const missions = await tx`SELECT achievement_id FROM achievements WHERE user_id = ${userId}`;
      return { pesos, wallet: await this.#wallet(tx, userId), stats: await this.#stats(tx, userId), missions: Object.fromEntries(missions.map((m) => [m.achievement_id, true])) };
    });
  }
  async #logroCumplido(tx, userId, l, st) {
    switch (l.tipo) {
      case 'g': return (st?.g || 0) >= l.meta;
      case 'r': return (st?.r || 0) >= l.meta;
      case 'b': { const [s] = await tx`SELECT best FROM scores WHERE user_id = ${userId} AND mode = ${MatchMode.CLASSIC}`; return (s?.best || 0) >= l.meta; }
      case 's': { const [k] = await tx`SELECT days FROM streaks WHERE user_id = ${userId}`; return (k?.days || 0) >= l.meta; }
      case 't': { const [u] = await tx`SELECT played_ms FROM users WHERE id = ${userId}`; return num(u.played_ms) >= l.meta; }
      case 'e': { const [u] = await tx`SELECT avatar FROM users WHERE id = ${userId}`; return !!u.avatar; }
      case 'c': { const [w] = await tx`SELECT spent FROM wallets WHERE user_id = ${userId}`; return num(w.spent) >= l.meta; }
      // V1: «verifica tu correo». En la V2 la cuenta se protege con Apple / Play Games: cuenta con tener uno enlazado.
      case 'v': { const [i] = await tx`SELECT 1 FROM identities WHERE user_id = ${userId} LIMIT 1`; return !!i; }
      default: return false;
    }
  }

  // ───────────────────────── tienda y perfil ─────────────────────────

  /** Compra con pesos del juego un personaje, fondo, barra, pelota, color o sonido. */
  buyItem(userId, cat, id, now) {
    if (!E.buyable(cat, id, now)) throw new HttpError(422, 'articulo_invalido');
    const price = E.itemOf(cat, id).price, key = `${cat}_${id}`;
    return this.sql.begin(async (tx) => {
      const w = await this.#lockWallet(tx, userId);
      const [ya] = await tx`SELECT 1 FROM inventory WHERE user_id = ${userId} AND item_id = ${key}`;
      if (ya) throw new HttpError(409, 'ya_comprado');
      if (w.earned - w.spent < price) throw new HttpError(409, 'saldo_insuficiente');
      await tx`UPDATE wallets SET spent = spent + ${price} WHERE user_id = ${userId}`;
      await tx`INSERT INTO inventory (user_id, item_id, acquired_at) VALUES (${userId}, ${key}, ${at(tx, now)})`;
      return { wallet: await this.#wallet(tx, userId) };
    });
  }

  /** Equipa algo que ya tienes (o lo gratis de cada categoría). */
  async equip(userId, cat, id) {
    const it = E.itemOf(cat, id);
    if (!it) throw new HttpError(422, 'articulo_invalido');
    if (id !== E.defaultItem(cat)) {
      const [own] = await this.sql`SELECT 1 FROM inventory WHERE user_id = ${userId} AND item_id = ${`${cat}_${id}`}`;
      if (!own) throw new HttpError(409, 'no_comprado');
    }
    await this.sql`INSERT INTO equipped (user_id, slot, item_id) VALUES (${userId}, ${cat}, ${id}) ON CONFLICT (user_id, slot) DO UPDATE SET item_id = EXCLUDED.item_id`;
    return { wallet: await this.#wallet(this.sql, userId) };
  }

  /** Emblema (foto de perfil). null lo quita. */
  async setAvatar(userId, av) {
    if (av !== null && !(typeof av === 'string' && E.AVATAR_RE.test(av))) throw new HttpError(422, 'emblema_invalido');
    await this.sql`UPDATE users SET avatar = ${av} WHERE id = ${userId}`;
    return { av };
  }

  /** Marco dorado en el emblema: solo para quien tiene el personaje secreto. */
  async setFrame(userId, on) {
    if (on) {
      const [own] = await this.sql`SELECT 1 FROM inventory WHERE user_id = ${userId} AND item_id = ${`ch_${E.SECRET_ID}`}`;
      if (!own) throw new HttpError(409, 'sin_personaje_secreto');
    }
    await this.sql`UPDATE users SET golden_frame = ${!!on} WHERE id = ${userId}`;
    return { marco: !!on };
  }

  // ───────────────────────── marcadores ─────────────────────────

  /**
   * Los mejores de un marcador: kind 'g' (récord clásico), 'a' (arcade), 'w' (semana en curso), 'm' (mes en curso),
   * 't' (tiempo jugado). Filas como las de la V1: { uid, n, s, a?, r?, m? } (r = insignia, m = marco dorado).
   */
  async top(kind, now, limit = 100) {
    const sql = this.sql, day = E.dayOf(now), lim = Math.min(Math.max(1, limit | 0), 200);
    const cols = sql`u.id AS uid, u.display_name AS n, u.avatar AS a, u.role AS r, u.golden_frame AS m`;
    let rows;
    if (kind === 'g' || kind === 'a') rows = await sql`
      SELECT ${cols}, s.best AS s FROM scores s JOIN users u ON u.id = s.user_id
      WHERE s.mode = ${kind === 'a' ? 'arcade' : 'classic'} AND s.best > 0 ORDER BY s.best DESC, s.best_at ASC LIMIT ${lim}`;
    else if (kind === 'w' || kind === 'm') rows = await sql`
      SELECT ${cols}, p.best AS s FROM period_scores p JOIN users u ON u.id = p.user_id
      WHERE p.mode = 'classic' AND p.kind = ${kind} AND p.period = ${kind === 'w' ? E.weekOf(day) : E.monthOf(day)}
      ORDER BY p.best DESC LIMIT ${lim}`;
    else if (kind === 't') rows = await sql`
      SELECT ${cols}, u.played_ms AS s FROM users u WHERE u.played_ms > 0 ORDER BY u.played_ms DESC LIMIT ${lim}`;
    else throw new HttpError(422, 'marcador_invalido');
    return rows.map((x) => ({ uid: x.uid, n: x.n, s: num(x.s), ...(x.a ? { a: x.a } : {}), ...(x.r ? { r: x.r } : {}), ...(x.m ? { m: true } : {}) }));
  }

  /** Tu puesto en un marcador: cuántos te ganan + 1 (y tu puntaje). */
  async rank(userId, kind, now) {
    const sql = this.sql, day = E.dayOf(now);
    let mine;
    if (kind === 'g' || kind === 'a') [mine] = await sql`SELECT best AS s FROM scores WHERE user_id = ${userId} AND mode = ${kind === 'a' ? 'arcade' : 'classic'}`;
    else if (kind === 'w' || kind === 'm') [mine] = await sql`SELECT best AS s FROM period_scores WHERE user_id = ${userId} AND mode = 'classic' AND kind = ${kind} AND period = ${kind === 'w' ? E.weekOf(day) : E.monthOf(day)}`;
    else if (kind === 't') [mine] = await sql`SELECT played_ms AS s FROM users WHERE id = ${userId}`;
    else throw new HttpError(422, 'marcador_invalido');
    const s = num(mine?.s) ?? 0;
    if (s <= 0) return { s: 0, rank: null };
    let above;
    if (kind === 'g' || kind === 'a') [above] = await sql`SELECT count(*) AS n FROM scores WHERE mode = ${kind === 'a' ? 'arcade' : 'classic'} AND best > ${s}`;
    else if (kind === 'w' || kind === 'm') [above] = await sql`SELECT count(*) AS n FROM period_scores WHERE mode = 'classic' AND kind = ${kind} AND period = ${kind === 'w' ? E.weekOf(day) : E.monthOf(day)} AND best > ${s}`;
    else [above] = await sql`SELECT count(*) AS n FROM users WHERE played_ms > ${s}`;
    return { s, rank: num(above.n) + 1 };
  }
}

