// SERVIDOR DE DEMOSTRACIÓN, dentro del navegador. Responde las mismas rutas que la API real, con las mismas
// reglas compartidas (precios, pagos por rebote, power-ups, nombres), pero guarda todo en este dispositivo
// (localStorage) y no valida nada contra Apple ni Google. Sirve para probar el juego completo sin infraestructura.
// Las rutas /me, /shop, /rewards, /leaderboards y /matches/:id/finish son el contrato del paso 3 del servidor.
import { packOf, productOf, POWERUPS, POWERUP_RULES, POWERUP_COIN_PRICE, MatchMode } from '../../../../../shared/catalog.js';
import { ACHIEVEMENTS, DAILY_GOALS, DEFAULT_EQUIPPED, STAT_LABEL, itemOf, matchEarnings, streakReward } from '../../../../../shared/store.js';
import { checkName, NAME_CHANGE_DAYS } from '../../../../../shared/names.js';
import { ApiError } from '../../ApiClient.js';

const STORAGE_KEY = 'tiopato-demo-v2';
const DAY_MS = 86_400_000;
// Rivales de mentira para que los marcadores no se vean vacíos.
const BOTS = {
  classic: [['Tío Pato', 412], ['LaJefa', 356], ['Benja_07', 301], ['Cami', 268], ['ElRulo', 233], ['Pancho', 207], ['Anto', 188], ['Seba', 171], ['Flo', 149], ['Nico', 133], ['Javi', 118], ['Maca', 96], ['Tomi', 81], ['Vale', 64], ['Dani', 47], ['Cata', 33], ['Feli', 21], ['Mati2', 12]],
  arcade: [['Turbo', 498], ['ReyMidas', 455], ['Pili', 402], ['Gonza', 361], ['LaPato', 322], ['Chino', 287], ['Fer', 240], ['Coni', 204], ['Lucho', 166], ['Rena', 131], ['Ale', 99], ['Vicho', 72], ['Isi', 48], ['Pipe', 25]],
};

const fresh = () => ({
  userId: crypto.randomUUID(), displayName: 'Pato' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0'), nameChangedAt: null,
  earned: 0, spent: 0, owned: [], equipped: { ...DEFAULT_EQUIPPED }, powerups: {}, entitlements: [], purchases: [],
  best: { classic: 0, arcade: 0 }, stats: { g: 0, r: 0 }, today: { date: '', g: 0, r: 0, b: 0, claimed: [] },
  streak: { day: 0, lastClaim: '' }, claimedAchievements: [], vip: null, match: null,
});

export class DemoApi {
  #state;
  constructor({ storage = globalThis.localStorage, now = Date.now } = {}) { this.storage = storage; this.now = now; this.#state = this.#load(); }

  #load() { try { const raw = this.storage?.getItem(STORAGE_KEY); return raw ? { ...fresh(), ...JSON.parse(raw) } : null; } catch { return null; } }
  #save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.#state)); } catch { /* sin almacenamiento: dura lo que dure la pestaña */ } }
  get #balance() { return this.#state.earned - this.#state.spent; }
  #date(offsetDays = 0) { return new Date(this.now() + offsetDays * DAY_MS - 3 * 3600_000).toISOString().slice(0, 10); }   // el día cambia a medianoche de Chile
  #today() { const s = this.#state; if (s.today.date !== this.#date()) s.today = { date: this.#date(), g: 0, r: 0, b: 0, claimed: [] }; return s.today; }

  /** Rutas sin sesión (inicio de sesión). En la demo no hay SSO ni atestación: entra siempre, con una cuenta local. */
  async open(path) {
    if (path === '/auth/challenge') return { challenge: 'demo' };
    const isNew = !this.#state;
    if (isNew) { this.#state = fresh(); this.#save(); }
    const s = this.#state;
    return { sessionId: 'demo', sessionKey: 'AA', userId: s.userId, displayName: s.displayName, isNew, hasLegacyAccount: false, nextNameChangeAt: this.#nextNameChange() };
  }

  #nextNameChange() { const at = this.#state.nameChangedAt; return at ? new Date(at + NAME_CHANGE_DAYS * DAY_MS).toISOString() : null; }
  #owned() { const s = this.#state; return { powerups: { ...s.powerups }, entitlements: [...s.entitlements] }; }

  #rewards() {
    const s = this.#state, today = this.#today();
    const stat = (k) => (k === 'b' ? Math.max(s.best.classic, s.best.arcade) : s.stats[k]);
    const claimedToday = s.streak.lastClaim === this.#date();
    const nextDay = s.streak.lastClaim === this.#date(-1) || claimedToday ? s.streak.day + (claimedToday ? 0 : 1) : 1;
    return {
      streak: { day: nextDay, claimable: !claimedToday, reward: streakReward(nextDay) },
      achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, label: STAT_LABEL[a.stat](a.goal), progress: Math.min(stat(a.stat), a.goal), goal: a.goal, reward: a.reward, done: stat(a.stat) >= a.goal, claimed: s.claimedAchievements.includes(a.id) })),
      goals: DAILY_GOALS.map((g) => ({ id: g.id, label: STAT_LABEL[g.stat](g.goal), progress: Math.min(today[g.stat], g.goal), goal: g.goal, reward: g.reward, done: today[g.stat] >= g.goal, claimed: today.claimed.includes(g.id) })),
    };
  }

  #board(mode) {
    const s = this.#state;
    const rows = BOTS[mode].map(([name, score]) => ({ name, score }));
    if (s.best[mode] > 0) rows.push({ name: s.displayName, score: s.best[mode], me: true });
    rows.sort((a, b) => b.score - a.score);
    const index = rows.findIndex((r) => r.me);
    return { top: rows.slice(0, 20), myRank: index < 0 ? null : index + 1 };
  }

  /** @type {import('../../ports.js').Api['request']} */
  async request(method, path, data = {}) {
    const s = this.#state;
    if (!s) throw new ApiError(401, 'sesion_invalida');
    const route = `${method} ${path.replace(/\/matches\/[^/]+/, '/matches/:id')}`;
    const result = this.#handle(route, data);
    this.#save();
    return result;
  }

  #handle(route, data) {
    const s = this.#state;
    switch (route) {
      case 'GET /me':
        return { profile: { displayName: s.displayName, nextNameChangeAt: this.#nextNameChange() }, wallet: { balance: this.#balance },
          inventory: { owned: [...s.owned], equipped: { ...s.equipped } }, best: { ...s.best }, ...this.#owned() };
      case 'GET /purchases': return this.#owned();
      case 'GET /rewards': return this.#rewards();
      case 'GET /leaderboards': return { classic: this.#board('classic'), arcade: this.#board('arcade') };

      case 'PUT /account/name': {
        const name = checkName(data.name);
        if (name.problem) throw new ApiError(422, name.problem);
        if (BOTS.classic.concat(BOTS.arcade).some(([bot]) => checkName(bot).key === name.key)) throw new ApiError(409, 'nombre_ocupado');
        const next = this.#nextNameChange();
        if (next && new Date(next).getTime() > this.now()) throw new ApiError(429, 'cambio_de_nombre_en_espera', { nextChangeAt: next });
        s.displayName = name.displayName; s.nameChangedAt = this.now();
        return { displayName: s.displayName, nextChangeAt: this.#nextNameChange() };
      }
      case 'PUT /account/vip':
        if (!s.owned.includes('ch_millonario')) throw new ApiError(403, 'sin_personaje_secreto');
        if (!/^\+[1-9]\d{7,14}$/.test(data.whatsapp ?? '')) throw new ApiError(422, 'numero_invalido');
        s.vip = { whatsapp: data.whatsapp, at: this.now() };
        return null;
      case 'DELETE /account': this.#state = null; try { this.storage?.removeItem(STORAGE_KEY); } catch { /* nada */ } return null;

      case 'POST /shop/buy': {
        const item = itemOf(data.slot, data.itemId), id = `${data.slot}_${data.itemId}`;
        if (!item || s.owned.includes(id)) throw new ApiError(422, 'articulo_invalido');
        if (this.#balance < item.price) throw new ApiError(409, 'saldo_insuficiente');
        s.spent += item.price; s.owned.push(id); s.equipped[data.slot] = data.itemId;
        return { balance: this.#balance, owned: [...s.owned], equipped: { ...s.equipped } };
      }
      case 'POST /shop/equip': {
        const item = itemOf(data.slot, data.itemId);
        if (!item || (item.price > 0 && !s.owned.includes(`${data.slot}_${data.itemId}`))) throw new ApiError(403, 'no_es_tuyo');
        s.equipped[data.slot] = data.itemId;
        return { equipped: { ...s.equipped } };
      }

      case 'POST /purchases': {                                   // compra «con dinero real»: aquí simulada, no se cobra nada
        const product = productOf(data.productId);
        if (!product) throw new ApiError(422, 'compra_invalida');
        if (product.consumable) for (const [id, n] of Object.entries(packOf(data.productId).grants)) s.powerups[id] = (s.powerups[id] ?? 0) + n;
        else if (!s.entitlements.includes(product.entitlement)) s.entitlements.push(product.entitlement);
        s.purchases.push({ productId: data.productId, at: this.now() });
        return { granted: true, ...this.#owned() };
      }
      case 'POST /purchases/powerups':
        if (!Object.hasOwn(POWERUPS, data.powerupId ?? '')) throw new ApiError(422, 'powerup_invalido');
        if (this.#balance < POWERUP_COIN_PRICE) throw new ApiError(409, 'saldo_insuficiente');
        s.spent += POWERUP_COIN_PRICE; s.powerups[data.powerupId] = (s.powerups[data.powerupId] ?? 0) + 1;
        return { balance: this.#balance, ...this.#owned() };

      case 'POST /matches':
        s.match = { id: crypto.randomUUID(), mode: data.mode === MatchMode.ARCADE ? MatchMode.ARCADE : MatchMode.CLASSIC, used: [], startedAt: this.now() };
        return { matchId: s.match.id, mode: s.match.mode };
      case 'POST /matches/:id/powerups': {
        const match = s.match;
        if (!match) throw new ApiError(409, 'partida_cerrada');
        if (match.mode !== MatchMode.ARCADE) throw new ApiError(409, 'modo_clasico_sin_powerups');
        if (match.used.length >= POWERUP_RULES.maxPerMatch) throw new ApiError(409, 'limite_por_partida');
        if ((s.powerups[data.powerupId] ?? 0) < 1) throw new ApiError(409, 'sin_powerups');
        s.powerups[data.powerupId] -= 1; match.used.push(data.powerupId);
        return { powerupId: data.powerupId, remaining: s.powerups[data.powerupId], usedThisMatch: match.used.length, durationMs: POWERUP_RULES.durationMs };
      }
      case 'POST /matches/:id/finish': {
        const match = s.match;
        if (!match) throw new ApiError(409, 'partida_cerrada');
        const hits = Math.max(0, Math.floor(Number(data.hits) || 0));
        const earned = matchEarnings(itemOf('ball', s.equipped.ball).rate, hits);     // los pesos los calcula el servidor, no la app
        const isRecord = hits > s.best[match.mode];
        if (isRecord) s.best[match.mode] = hits;
        s.earned += earned; s.stats.g += 1; s.stats.r += hits;
        const today = this.#today(); today.g += 1; today.r += hits; today.b = Math.max(today.b, hits);
        s.match = null;
        return { earned, balance: this.#balance, best: { ...s.best }, isRecord, mode: match.mode };
      }

      case 'POST /rewards/claim': {
        const rewards = this.#rewards();
        let reward = 0;
        if (data.kind === 'streak') {
          if (!rewards.streak.claimable) throw new ApiError(409, 'ya_cobrado');
          reward = rewards.streak.reward; s.streak = { day: rewards.streak.day, lastClaim: this.#date() };
        } else {
          const list = data.kind === 'goal' ? rewards.goals : rewards.achievements, item = list.find((i) => i.id === data.id);
          if (!item || !item.done || item.claimed) throw new ApiError(409, 'ya_cobrado');
          reward = item.reward;
          (data.kind === 'goal' ? this.#today().claimed : s.claimedAchievements).push(item.id);
        }
        s.earned += reward;
        return { reward, balance: this.#balance, ...this.#rewards() };
      }
      case 'POST /demo/coins': s.earned += Number(data.amount) || 0; return { balance: this.#balance };   // solo existe en la demo
      default: throw new ApiError(404, 'ruta_desconocida');
    }
  }
}
